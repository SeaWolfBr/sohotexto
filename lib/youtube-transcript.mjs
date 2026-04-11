import { fetchTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";

const YOUTUBE_COOKIE = process.env.YOUTUBE_COOKIE?.trim() || null;

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
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
      "accept-encoding": "gzip, deflate, br",
      "cache-control": "no-cache",
      "pragma": "no-cache",
      "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
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

async function fetchTranscriptTrack(track, fetchImpl) {
  const trackUrl = new URL(track.baseUrl);
  trackUrl.searchParams.set("fmt", "json3");

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

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("A resposta de legendas nao veio em JSON valido.");
  }
}

function parseTranscriptEvents(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];

  return events
    .map((event) => {
      const segments = Array.isArray(event?.segs) ? event.segs : [];
      const text = normalizeText(
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
  const transcriptPayload = await fetchTranscriptTrack(track, fetchImpl);
  const transcript = parseTranscriptEvents(transcriptPayload);

  return finalizeResult({
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
    videoId: extractVideoId(input),
    title: null,
    languageCode: lang ?? transcript[0]?.lang ?? null,
    languageName: null,
    isAutoGenerated: null,
    transcript: transcript.map((item) => ({
      // The library may return XML timings already in ms or fallback timings in seconds.
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

export async function fetchYouTubeTranscript(
  input,
  { lang = null, fetchImpl = fetch } = {},
) {
  fetchImpl = buildFetchWithCookie(fetchImpl);
  const videoId = extractVideoId(input);
  const errors = [];

  try {
    return await fetchTranscriptFromLibrary(input, lang, fetchImpl);
  } catch (libraryError) {
    errors.push(libraryError);
  }

  try {
    const html = await getWatchHtml(videoId, fetchImpl);
    return await fetchTranscriptFromHtml({ html, videoId, lang, fetchImpl });
  } catch (watchError) {
    errors.push(watchError);
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


