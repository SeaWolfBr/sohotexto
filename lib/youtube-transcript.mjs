import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fetchTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";

const execFileAsync = promisify(execFile);

const YOUTUBE_COOKIE = process.env.YOUTUBE_COOKIE?.trim() || null;
const YTDLP_ENABLED = (process.env.YTDLP_ENABLED?.trim() || "true").toLowerCase() !== "false";
const YTDLP_PATH = process.env.YTDLP_PATH?.trim() || null;
const YTDLP_COOKIE_FILE = process.env.YTDLP_COOKIE_FILE?.trim() || null;
const YTDLP_EXTRACTOR_ARGS = process.env.YTDLP_EXTRACTOR_ARGS?.trim() || null;
const YTDLP_TIMEOUT_MS = parsePositiveInt(
  process.env.YTDLP_TIMEOUT_MS,
  45000,
  1000,
  5 * 60 * 1000,
);

function parsePositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function buildFetchWithCookie(baseFetch = fetch) {
  if (!YOUTUBE_COOKIE) return baseFetch;

  return (url, options = {}) => {
    const headers = { ...(options.headers ?? {}), Cookie: YOUTUBE_COOKIE };
    return baseFetch(url, { ...options, headers });
  };
}

function normalizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function normalizeCaptionText(value = "") {
  const withBreaks = value.replace(/<br\s*\/?>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(withoutTags);
  return normalizeText(decoded);
}

function parseClockTimestampToMs(value) {
  if (!value) return 0;

  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Timestamp invalido: ${value}`);
  }

  const segments = parts.map((segment) => Number.parseFloat(segment));
  if (segments.some((segment) => Number.isNaN(segment))) {
    throw new Error(`Timestamp invalido: ${value}`);
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (segments.length === 3) {
    [hours, minutes, seconds] = segments;
  } else {
    [minutes, seconds] = segments;
  }

  return Math.round((((hours * 60) + minutes) * 60 + seconds) * 1000);
}

function getAttributeValue(attributes, name) {
  const match = attributes.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1] ?? null;
}

function parseXmlSecondsToMs(value) {
  const numeric = Number.parseFloat(value ?? "");
  return Number.isFinite(numeric) ? Math.round(numeric * 1000) : 0;
}

function parseVttTranscript(rawText) {
  const blocks = rawText.replace(/\r/g, "").split(/\n{2,}/);
  const transcript = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)/i.test(lines[0])) continue;

    let timingIndex = 0;
    if (!lines[0].includes("-->") && lines[1]?.includes("-->")) {
      timingIndex = 1;
    }

    const timingLine = lines[timingIndex];
    if (!timingLine?.includes("-->")) continue;

    const [startRaw, endRaw] = timingLine.split("-->").map((part) => part.trim());
    const startMs = parseClockTimestampToMs(startRaw.split(/\s+/)[0]);
    const endMs = parseClockTimestampToMs(endRaw.split(/\s+/)[0]);
    const text = normalizeCaptionText(lines.slice(timingIndex + 1).join(" "));

    if (!text) continue;

    transcript.push({
      startMs,
      durationMs: Math.max(0, endMs - startMs),
      text,
    });
  }

  return transcript;
}

function parseXmlTranscript(rawText) {
  const transcript = [];
  const textMatches = [...rawText.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)];

  if (textMatches.length > 0) {
    for (const [, attributes, innerText] of textMatches) {
      const text = normalizeCaptionText(innerText);
      if (!text) continue;

      transcript.push({
        startMs: parseXmlSecondsToMs(getAttributeValue(attributes, "start")),
        durationMs: parseXmlSecondsToMs(getAttributeValue(attributes, "dur")),
        text,
      });
    }

    return transcript;
  }

  const paragraphMatches = [...rawText.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)];

  for (const [, attributes, innerText] of paragraphMatches) {
    const text = normalizeCaptionText(innerText);
    if (!text) continue;

    const startMs = Number.parseInt(getAttributeValue(attributes, "t") ?? "", 10);
    const durationMs = Number.parseInt(getAttributeValue(attributes, "d") ?? "", 10);
    const begin = getAttributeValue(attributes, "begin");
    const end = getAttributeValue(attributes, "end");

    const computedStartMs = Number.isFinite(startMs)
      ? startMs
      : begin
        ? parseClockTimestampToMs(begin)
        : 0;

    let computedDurationMs = Number.isFinite(durationMs) ? durationMs : 0;

    if (!computedDurationMs && end) {
      computedDurationMs = Math.max(0, parseClockTimestampToMs(end) - computedStartMs);
    }

    transcript.push({
      startMs: computedStartMs,
      durationMs: computedDurationMs,
      text,
    });
  }

  return transcript;
}

function parseTranscriptEvents(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return events
    .map((event) => {
      const segments = Array.isArray(event?.segs) ? event.segs : [];
      const text = normalizeCaptionText(
        segments.map((segment) => segment?.utf8 ?? "").join(""),
      );

      if (!text) return null;

      return {
        startMs: Number(event.tStartMs ?? 0),
        durationMs: Number(event.dDurationMs ?? 0),
        text,
      };
    })
    .filter(Boolean);
}

function inferTrackFormat(trackUrl, requestedFormat, rawText) {
  const normalizedFormat = (requestedFormat || "").toLowerCase();

  if (normalizedFormat === "json3" || trackUrl.searchParams.get("fmt") === "json3") {
    return "json3";
  }

  if (normalizedFormat === "vtt" || normalizedFormat === "webvtt") {
    return "vtt";
  }

  if (
    normalizedFormat.startsWith("srv") ||
    normalizedFormat === "ttml" ||
    normalizedFormat === "xml"
  ) {
    return "xml";
  }

  const trimmed = rawText.trimStart();

  if (trimmed.startsWith("{")) {
    return "json3";
  }

  if (/^WEBVTT/i.test(trimmed)) {
    return "vtt";
  }

  if (trimmed.startsWith("<")) {
    return "xml";
  }

  throw new Error("Nao consegui identificar o formato da legenda retornada.");
}

async function fetchTranscriptEntries(track, fetchImpl) {
  const trackUrl = new URL(track.url ?? track.baseUrl);
  let requestedFormat = (track.ext || track.format || "").toLowerCase();

  if (!requestedFormat && track.baseUrl) {
    trackUrl.searchParams.set("fmt", "json3");
    requestedFormat = "json3";
  }

  const response = await fetchImpl(trackUrl, {
    headers: {
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar as legendas (${response.status}).`);
  }

  const rawText = await response.text();

  if (!rawText.trim()) {
    throw new Error("A resposta de legendas veio vazia.");
  }

  const format = inferTrackFormat(trackUrl, requestedFormat, rawText);

  if (format === "json3") {
    try {
      return parseTranscriptEvents(JSON.parse(rawText));
    } catch {
      throw new Error("A resposta de legendas nao veio em JSON valido.");
    }
  }

  if (format === "vtt") {
    return parseVttTranscript(rawText);
  }

  return parseXmlTranscript(rawText);
}

function dedupeTranscript(items) {
  const cleaned = [];

  for (const item of items) {
    const text = normalizeText(item?.text ?? "");
    if (!text) continue;

    if (cleaned.at(-1)?.text === text) {
      continue;
    }

    cleaned.push({
      startMs: Number(item?.startMs ?? 0),
      durationMs: Number(item?.durationMs ?? 0),
      text,
    });
  }

  return cleaned;
}

function countSentenceStops(text) {
  return (text.match(/[.!?]+["')\]]*$/g) || []).length;
}

function buildTranscriptText(transcript) {
  const paragraphs = [];
  let current = "";
  let sentenceStops = 0;

  for (const item of transcript) {
    const fragment = normalizeText(item?.text ?? "");
    if (!fragment) continue;

    current = current ? `${current} ${fragment}` : fragment;
    sentenceStops += countSentenceStops(fragment);

    const canBreak = /[.!?]["')\]]*$/.test(fragment);

    if ((sentenceStops >= 3 || current.length >= 320) && canBreak) {
      paragraphs.push(current);
      current = "";
      sentenceStops = 0;
      continue;
    }

    if (current.length >= 460) {
      paragraphs.push(current);
      current = "";
      sentenceStops = 0;
    }
  }

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs.join("\n\n");
}

function finalizeResult(result) {
  const transcript = dedupeTranscript(result.transcript ?? []);

  if (transcript.length === 0) {
    throw new Error("A trilha de legenda foi encontrada, mas veio vazia.");
  }

  return {
    ...result,
    transcript,
    transcriptCount: transcript.length,
    text: buildTranscriptText(transcript),
  };
}

export function extractVideoId(value) {
  if (!value) {
    throw new Error("Informe uma URL ou um video ID do YouTube.");
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Nao foi possivel interpretar a URL informada.");
  }

  if (url.hostname === "youtu.be") {
    return url.pathname.replace(/^\/+/, "").slice(0, 11);
  }

  const directId = url.searchParams.get("v");
  if (directId) {
    return directId.slice(0, 11);
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const shortsIndex = parts.indexOf("shorts");
  if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
    return parts[shortsIndex + 1].slice(0, 11);
  }

  const liveIndex = parts.indexOf("live");
  if (liveIndex >= 0 && parts[liveIndex + 1]) {
    return parts[liveIndex + 1].slice(0, 11);
  }

  throw new Error("Nao encontrei um video ID valido nessa URL.");
}

function findJsonObjectEnd(source, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error("Nao consegui encontrar o fim do JSON do player response.");
}

function extractPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse = ";
  const start = html.indexOf(marker);

  if (start < 0) {
    throw new Error("Nao encontrei ytInitialPlayerResponse na pagina.");
  }

  const jsonStart = html.indexOf("{", start + marker.length);

  if (jsonStart < 0) {
    throw new Error("Nao encontrei o inicio do JSON do player response.");
  }

  const jsonEnd = findJsonObjectEnd(html, jsonStart);
  const rawJson = html.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(rawJson);
}

async function getWatchHtml(videoId, fetchImpl) {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("hl", "pt-BR");
  url.searchParams.set("persist_hl", "1");

  const response = await fetchImpl(url, {
    headers: {
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "accept-encoding": "gzip, deflate, br",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao carregar a pagina do video (${response.status}).`);
  }

  return response.text();
}

function pickCaptionTrack(captionTracks, preferredLanguage) {
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    throw new Error("O video nao disponibiliza legendas/transcricao.");
  }

  if (preferredLanguage) {
    const normalized = preferredLanguage.toLowerCase();
    const exactMatch = captionTracks.find(
      (track) => track.languageCode?.toLowerCase() === normalized,
    );

    if (exactMatch) return exactMatch;

    const partialMatch = captionTracks.find((track) =>
      track.languageCode?.toLowerCase().startsWith(normalized),
    );

    if (partialMatch) return partialMatch;
  }

  const manualTrack = captionTracks.find((track) => track.kind !== "asr");
  return manualTrack ?? captionTracks[0];
}

function buildResultFromPlayerResponse(playerResponse, { videoId = null, lang = null } = {}) {
  const captionTracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const track = pickCaptionTrack(captionTracks, lang);

  return {
    track,
    baseResult: {
      videoId:
        videoId ??
        playerResponse?.videoDetails?.videoId ??
        track.baseUrl.match(/[?&]v=([^&]+)/)?.[1] ??
        null,
      title: playerResponse?.videoDetails?.title ?? null,
      description: playerResponse?.videoDetails?.shortDescription ?? null,
      languageCode: track.languageCode ?? null,
      languageName:
        track.name?.simpleText ??
        track.name?.runs?.map((item) => item.text).join("") ??
        null,
      isAutoGenerated: track.kind === "asr",
    },
  };
}

export async function fetchTranscriptFromHtml({
  html,
  videoId = null,
  lang = null,
  fetchImpl = fetch,
}) {
  const playerResponse = extractPlayerResponse(html);
  const { track, baseResult } = buildResultFromPlayerResponse(playerResponse, {
    videoId,
    lang,
  });
  const transcript = await fetchTranscriptEntries(track, fetchImpl);

  return finalizeResult({
    source: "watch_html",
    ...baseResult,
    transcript,
  });
}

async function fetchTranscriptFromLibrary(input, lang, fetchImpl) {
  const transcript = await fetchTranscript(input, {
    lang: lang ?? undefined,
    fetch: fetchImpl,
  });

  if (transcript.length === 0) {
    throw new Error("A biblioteca encontrou o video, mas a transcricao veio vazia.");
  }

  return finalizeResult({
    source: "library",
    videoId: extractVideoId(input),
    title: null,
    description: null,
    languageCode: lang ?? transcript[0]?.lang ?? null,
    languageName: null,
    isAutoGenerated: null,
    transcript: transcript.map((item) => ({
      startMs:
        Number(item.offset ?? 0) > 1000
          ? Math.round(Number(item.offset ?? 0))
          : Math.round(Number(item.offset ?? 0) * 1000),
      durationMs:
        Number(item.duration ?? 0) > 1000
          ? Math.round(Number(item.duration ?? 0))
          : Math.round(Number(item.duration ?? 0) * 1000),
      text: normalizeText(item.text ?? ""),
    })),
  });
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.command} ${candidate.prefixArgs.join(" ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getYtDlpCandidates() {
  return uniqueCandidates(
    [
      YTDLP_PATH ? { command: YTDLP_PATH, prefixArgs: [] } : null,
      { command: "yt-dlp", prefixArgs: [] },
      { command: "python3", prefixArgs: ["-m", "yt_dlp"] },
      { command: "python", prefixArgs: ["-m", "yt_dlp"] },
    ].filter(Boolean),
  );
}

function isMissingCommandError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    error?.code === "ENOENT" ||
    /not found/i.test(message) ||
    /is not recognized/i.test(message)
  );
}

function buildYtDlpArgs(input) {
  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-check-formats",
    "--no-warnings",
    "--no-progress",
    "--no-update",
  ];

  if (YTDLP_COOKIE_FILE) {
    args.push("--cookies", YTDLP_COOKIE_FILE);
  }

  if (YTDLP_EXTRACTOR_ARGS) {
    args.push("--extractor-args", YTDLP_EXTRACTOR_ARGS);
  }

  args.push("--", input);
  return args;
}

function parseCookieHeader(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex < 0) {
        return null;
      }

      return {
        name: item.slice(0, separatorIndex).trim(),
        value: item.slice(separatorIndex + 1).trim(),
      };
    })
    .filter(Boolean);
}

function buildNetscapeCookieFile(cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader);
  const lines = ["# Netscape HTTP Cookie File"];

  for (const cookie of cookies) {
    const isSecure =
      cookie.name.startsWith("__Secure-") ||
      cookie.name.startsWith("__Host-") ||
      cookie.name === "SAPISID" ||
      cookie.name === "APISID" ||
      cookie.name === "SID" ||
      cookie.name === "SIDCC";

    lines.push(
      [".youtube.com", "TRUE", "/", isSecure ? "TRUE" : "FALSE", "2147483647", cookie.name, cookie.value].join("\t"),
    );
  }

  return `${lines.join("\n")}\n`;
}

async function createTemporaryYtDlpCookieFile() {
  if (!YOUTUBE_COOKIE) {
    return null;
  }

  const filePath = path.join(
    os.tmpdir(),
    `justext-ytdlp-${crypto.randomUUID()}.cookies.txt`,
  );

  await fs.writeFile(filePath, buildNetscapeCookieFile(YOUTUBE_COOKIE), "utf8");
  return filePath;
}

function sanitizeExternalErrorMessage(value = "") {
  return value
    .replace(/Cookie:[^\n\r]*/gi, "Cookie:[REDACTED]")
    .replace(
      /\b(?:SID|HSID|SSID|APISID|SAPISID|SIDCC|__Secure-[^=;\s]+)=([^;\s]+)/gi,
      (match) => `${match.split("=")[0]}=[REDACTED]`,
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function runYtDlpMetadata(input) {
  if (!YTDLP_ENABLED) {
    throw new Error("Fallback yt-dlp desabilitado pelo ambiente.");
  }

  const temporaryCookieFile = !YTDLP_COOKIE_FILE && YOUTUBE_COOKIE
    ? await createTemporaryYtDlpCookieFile()
    : null;
  const args = buildYtDlpArgs(input);
  const finalArgs = temporaryCookieFile
    ? [...args.slice(0, 4), "--cookies", temporaryCookieFile, ...args.slice(4)]
    : args;
  const failures = [];

  try {
    for (const candidate of getYtDlpCandidates()) {
      try {
        const { stdout, stderr } = await execFileAsync(
          candidate.command,
          [...candidate.prefixArgs, ...finalArgs],
          {
            timeout: YTDLP_TIMEOUT_MS,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
          },
        );

        const output = stdout.trim();

        if (!output) {
          throw new Error(stderr?.trim() || "yt-dlp nao retornou metadados.");
        }

        return JSON.parse(output);
      } catch (error) {
        if (isMissingCommandError(error)) {
          failures.push(`${candidate.command}: comando indisponivel`);
          continue;
        }

        const message = sanitizeExternalErrorMessage(
          error?.stderr || error?.stdout || error?.message || String(error),
        );
        failures.push(`${candidate.command}: ${message}`);
      }
    }
  } finally {
    if (temporaryCookieFile) {
      await fs.rm(temporaryCookieFile, { force: true }).catch(() => {});
    }
  }

  throw new Error(`Fallback yt-dlp falhou. ${failures.join(" | ")}`);
}

function buildYtDlpCaptionCandidates(trackMap, isAutoGenerated) {
  const candidates = [];

  for (const [languageCode, tracks] of Object.entries(trackMap ?? {})) {
    for (const track of Array.isArray(tracks) ? tracks : []) {
      if (!track?.url) continue;

      const label = `${track.name ?? ""} ${track.format_note ?? ""}`.trim();
      if (/live_chat/i.test(label)) continue;

      candidates.push({
        url: track.url,
        ext: (track.ext || "").toLowerCase(),
        format: track.ext || null,
        languageCode,
        languageName: track.name ?? languageCode,
        isAutoGenerated,
      });
    }
  }

  return candidates;
}

function scoreYtDlpTrack(candidate, preferredLanguage) {
  const formatPriority = {
    json3: 90,
    srv3: 80,
    ttml: 70,
    xml: 70,
    srv2: 60,
    srv1: 50,
    vtt: 40,
  };

  let score = formatPriority[candidate.ext] ?? 10;

  if (!candidate.isAutoGenerated) {
    score += 100;
  }

  if (preferredLanguage) {
    const normalizedPreferred = preferredLanguage.toLowerCase();
    const normalizedCandidate = candidate.languageCode?.toLowerCase() ?? "";

    if (normalizedCandidate === normalizedPreferred) {
      score += 1000;
    } else if (
      normalizedCandidate.startsWith(normalizedPreferred) ||
      normalizedPreferred.startsWith(normalizedCandidate)
    ) {
      score += 800;
    }
  }

  return score;
}

function pickYtDlpTrack(metadata, preferredLanguage) {
  const manualTracks = buildYtDlpCaptionCandidates(metadata?.subtitles, false);
  const autoTracks = buildYtDlpCaptionCandidates(metadata?.automatic_captions, true);
  const allTracks = [...manualTracks, ...autoTracks];

  if (allTracks.length === 0) {
    throw new Error("yt-dlp nao encontrou trilhas de legenda para este video.");
  }

  allTracks.sort(
    (left, right) => scoreYtDlpTrack(right, preferredLanguage) - scoreYtDlpTrack(left, preferredLanguage),
  );

  return allTracks[0];
}

async function fetchTranscriptFromYtDlp(input, lang, fetchImpl) {
  const metadata = await runYtDlpMetadata(input);
  const track = pickYtDlpTrack(metadata, lang);
  const transcript = await fetchTranscriptEntries(track, fetchImpl);

  return finalizeResult({
    source: "yt_dlp",
    videoId: metadata.id ?? extractVideoId(input),
    title: metadata.title ?? null,
    description: metadata.description ?? null,
    languageCode: track.languageCode ?? null,
    languageName: track.languageName ?? null,
    isAutoGenerated: Boolean(track.isAutoGenerated),
    transcript,
  });
}

export async function fetchYouTubeTranscript(
  input,
  { lang = null, fetchImpl = fetch } = {},
) {
  const fetchWithCookie = buildFetchWithCookie(fetchImpl);
  const videoId = extractVideoId(input);
  const errors = [];

  try {
    return await fetchTranscriptFromLibrary(input, lang, fetchWithCookie);
  } catch (libraryError) {
    errors.push(libraryError);
  }

  try {
    const html = await getWatchHtml(videoId, fetchWithCookie);
    return await fetchTranscriptFromHtml({
      html,
      videoId,
      lang,
      fetchImpl: fetchWithCookie,
    });
  } catch (watchError) {
    errors.push(watchError);
  }

  try {
    return await fetchTranscriptFromYtDlp(input, lang, fetchWithCookie);
  } catch (ytDlpError) {
    errors.push(ytDlpError);
  }

  const details = errors
    .filter((error) => error instanceof Error && error.message)
    .map((error) => error.message)
    .join(" | ");

  if (details) {
    throw new Error(
      `Nao foi possivel obter a transcricao deste video. Detalhes tecnicos: ${details}`,
    );
  }

  throw new Error(
    "Nao foi possivel obter a transcricao deste video. O YouTube nao expos uma trilha de legenda acessivel para esta requisicao.",
  );
}

export function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
