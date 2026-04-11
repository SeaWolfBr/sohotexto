#!/usr/bin/env node

import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env (zero dependencies)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
try {
  const envPath = path.join(__dirname, ".env");
  const envContent = readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* no .env file — use environment variables directly */ }

import { extractVideoId, fetchYouTubeTranscript } from "./lib/youtube-transcript.mjs";
import { processAll } from "./lib/ai-processor.mjs";
const staticDir = path.join(__dirname, "static");

const host = process.env.JUSTEXT_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || process.env.JUSTEXT_PORT || 3217);
const MAX_BODY_BYTES = 64 * 1024;

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

const transcribeLimiter = createRateLimiter({
  windowMs: 1000 * 60,
  maxRequests: 20,
  message: "Limite temporario de transcricoes atingido. Aguarde um minuto e tente novamente.",
});

const processLimiter = createRateLimiter({
  windowMs: 1000 * 60,
  maxRequests: 10,
  message: "Limite temporario de processamentos IA atingido. Aguarde um minuto e tente novamente.",
});

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

function createRateLimiter({ windowMs, maxRequests, message }) {
  const hits = new Map();

  return {
    check(key) {
      const now = Date.now();
      const bucket = hits.get(key) ?? [];
      const freshHits = bucket.filter((timestamp) => now - timestamp < windowMs);

      if (freshHits.length >= maxRequests) {
        const retryAfterMs = windowMs - (now - freshHits[0]);
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
          message,
        };
      }

      freshHits.push(now);
      hits.set(key, freshHits);
      return { allowed: true };
    },
  };
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    let done = false;

    request.on("data", (chunk) => {
      if (done) return;
      totalSize += chunk.length;

      if (totalSize > MAX_BODY_BYTES) {
        done = true;
        request.destroy();
        reject(new AppError("Payload excede o limite permitido.", 413));
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", (err) => {
      if (done) return;
      done = true;
      reject(err);
    });
  });
}

async function readJsonBody(request) {
  const rawBody = await readRequestBody(request);

  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new AppError("O corpo da requisicao nao veio em JSON valido.", 400);
  }
}

function writeJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function writeHtml(response, statusCode, html, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(html);
}

function wantsHtml(request) {
  const accept = request.headers.accept || "";
  return accept.includes("text/html");
}

function hasFileExtension(pathname) {
  return path.extname(pathname || "").length > 0;
}

function writeBrowserNotFound(response) {
  writeHtml(
    response,
    404,
    `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Justext</title>
    <style>
      :root {
        color-scheme: light;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #ffffff;
        color: #111827;
        font-family: Manrope, "Segoe UI", sans-serif;
      }
      main {
        width: min(560px, 100%);
        padding: 32px;
        border: 1px solid rgba(17, 24, 39, 0.08);
        border-radius: 24px;
        background: #ffffff;
        box-shadow: 0 24px 60px rgba(17, 24, 39, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 2.8rem);
        line-height: 1;
        letter-spacing: -0.04em;
        font-weight: 600;
      }
      p {
        margin: 0;
        color: #5f6675;
        line-height: 1.7;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        margin-top: 24px;
        padding: 0 18px;
        border-radius: 999px;
        background: #16181f;
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Justext</h1>
      <p>Essa rota nao foi encontrada. Volte para a pagina inicial para continuar usando a aplicacao.</p>
      <a href="/">Ir para a pagina inicial</a>
    </main>
  </body>
</html>`,
  );
}

async function serveStaticFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes.get(extension) || "application/octet-stream";
  const content = await fs.readFile(filePath);

  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  response.end(content);
}

function applyRateLimit(response, outcome) {
  if (outcome.allowed) return false;

  writeJson(
    response,
    429,
    { ok: false, message: outcome.message },
    { "Retry-After": String(outcome.retryAfterSec) },
  );
  return true;
}

function validateYouTubeUrl(value) {
  if (!value || value.length > 500) {
    throw new AppError("Cole uma URL valida do YouTube.", 400);
  }

  let videoId;
  try {
    videoId = extractVideoId(value);
  } catch {
    throw new AppError("Cole uma URL valida do YouTube.", 400);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("Cole uma URL valida do YouTube.", 400);
  }

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const allowedHosts = new Set(["youtube.com", "m.youtube.com", "youtu.be"]);

  if (!allowedHosts.has(hostname)) {
    throw new AppError("Por enquanto, o Justext aceita apenas URLs do YouTube.", 400);
  }

  return { normalizedUrl: url.toString(), videoId };
}

async function handleTranscribe(request, response) {
  const ip = clientIp(request);
  if (applyRateLimit(response, transcribeLimiter.check(`transcribe:${ip}`))) {
    return;
  }

  let url = null;

  try {
    const body = await readJsonBody(request);
    url = body?.url?.toString().trim() || null;

    const { normalizedUrl } = validateYouTubeUrl(url);
    const transcript = await fetchYouTubeTranscript(normalizedUrl);
    const payload = {
      ...transcript,
      sourceUrl: normalizedUrl,
      platform: "youtube",
    };

    logTranscriptSuccess("transcribe", payload);

    writeJson(response, 200, {
      ok: true,
      result: {
        ...payload,
        exports: buildExportNames(payload),
      },
    });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message =
      statusCode < 500 && error instanceof Error
        ? error.message
        : "Nao foi possivel obter a transcricao.";

    logTranscriptFailure("transcribe", url, error);

    writeJson(response, statusCode, { ok: false, message });
  }
}

async function handleProcess(request, response) {
  const ip = clientIp(request);
  if (applyRateLimit(response, processLimiter.check(`process:${ip}`))) {
    return;
  }
  if (applyRateLimit(response, transcribeLimiter.check(`transcribe:${ip}`))) {
    return;
  }

  let url = null;

  try {
    const body = await readJsonBody(request);
    url = body?.url?.toString().trim() || null;
    const lang = body?.lang === "pt" ? "pt" : "en";

    const { normalizedUrl } = validateYouTubeUrl(url);
    const transcript = await fetchYouTubeTranscript(normalizedUrl);

    let aiResult = { summary: null, socialPosts: null, contentIdeas: null };
    try {
      aiResult = await processAll(transcript.text, transcript.title, lang);
    } catch (aiError) {
      console.error("AI processing failed (returning transcript only):", aiError.message);
    }

    const payload = {
      ...transcript,
      sourceUrl: normalizedUrl,
      platform: "youtube",
    };

    logTranscriptSuccess("process", payload);

    writeJson(response, 200, {
      ok: true,
      result: {
        ...payload,
        exports: buildExportNames(payload),
        summary: aiResult.summary,
        socialPosts: aiResult.socialPosts,
        contentIdeas: aiResult.contentIdeas,
      },
    });
  } catch (error) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message =
      statusCode < 500 && error instanceof Error
        ? error.message
        : "Nao foi possivel processar o video.";

    logTranscriptFailure("process", url, error);

    writeJson(response, statusCode, { ok: false, message });
  }
}

function formatDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function slugify(value) {
  const normalized = (value || "Transcricao-YouTube")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "Transcricao-YouTube";
}

function buildFileStem(payload) {
  const title = payload?.title?.trim() || `Transcricao-${payload?.videoId || "youtube"}`;
  return `${formatDateStamp()}-${slugify(title)}.transcript`;
}

function buildExportNames(payload) {
  const fileStem = buildFileStem(payload);
  return { txtFileName: `${fileStem}.txt` };
}

function logTranscriptSuccess(kind, payload) {
  console.info(
    `[justext:${kind}] source=${payload?.source || "unknown"} videoId=${payload?.videoId || "unknown"} title=${JSON.stringify(payload?.title || null)}`,
  );
}

function logTranscriptFailure(kind, inputUrl, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[justext:${kind}:error] input=${JSON.stringify(inputUrl || null)} message=${JSON.stringify(message)}`,
  );
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);
  const pathname = requestUrl.pathname || "/";

  try {
    if (request.method === "GET" && pathname === "/api/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && pathname === "/api/transcribe") {
      await handleTranscribe(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/process") {
      await handleProcess(request, response);
      return;
    }

    if (request.method === "GET" && pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestedPath =
      pathname === "/"
        ? path.join(staticDir, "index.html")
        : path.join(staticDir, pathname.replace(/^\/+/, ""));

    if (!requestedPath.startsWith(staticDir)) {
      writeJson(response, 403, { ok: false, message: "Acesso negado." });
      return;
    }

    try {
      await serveStaticFile(response, requestedPath);
      return;
    } catch (error) {
      if (
        error?.code === "ENOENT" &&
        request.method === "GET" &&
        wantsHtml(request) &&
        !hasFileExtension(pathname)
      ) {
        await serveStaticFile(response, path.join(staticDir, "index.html"));
        return;
      }

      throw error;
    }
  } catch (error) {
    const statusCode =
      error?.code === "ENOENT"
        ? 404
        : error instanceof AppError
          ? error.statusCode
          : 500;

    if (!response.headersSent) {
      if (statusCode === 404 && request.method === "GET" && wantsHtml(request)) {
        writeBrowserNotFound(response);
        return;
      }

      writeJson(response, statusCode, {
        ok: false,
        message:
          statusCode === 404
            ? "Recurso nao encontrado."
            : statusCode < 500
              ? error.message
              : "Falha interna no servidor.",
      });
      return;
    }

    response.end();
  }
});

server.listen(port, host, () => {
  console.log(`Justext pronto em http://${host}:${port}`);
});
