#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVideoId, fetchYouTubeTranscript } from "./lib/youtube-transcript.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.join(__dirname, "static");

const host = process.env.SOHOTEXTO_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || process.env.SOHOTEXTO_PORT || 3217);
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

  try {
    const body = await readJsonBody(request);
    const url = body?.url?.toString().trim();

    const { normalizedUrl, videoId } = validateYouTubeUrl(url);
    const transcript = await fetchYouTubeTranscript(videoId);
    const payload = {
      ...transcript,
      sourceUrl: normalizedUrl,
      platform: "youtube",
    };

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

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/transcribe") {
      await handleTranscribe(request, response);
      return;
    }

    const requestedPath =
      requestUrl.pathname === "/"
        ? path.join(staticDir, "index.html")
        : path.join(staticDir, requestUrl.pathname.replace(/^\/+/, ""));

    if (!requestedPath.startsWith(staticDir)) {
      writeJson(response, 403, { ok: false, message: "Acesso negado." });
      return;
    }

    await serveStaticFile(response, requestedPath);
  } catch (error) {
    const statusCode =
      error?.code === "ENOENT"
        ? 404
        : error instanceof AppError
          ? error.statusCode
          : 500;

    if (!response.headersSent) {
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
