#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { extractVideoId, fetchYouTubeTranscript } from "./lib/youtube-transcript.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.join(__dirname, "static");

const host = process.env.SOHOTEXTO_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PORT || process.env.SOHOTEXTO_PORT || 3217);
const authUser = process.env.SOHOTEXTO_USER?.trim() || "admin";
const passwordHash =
  process.env.SOHOTEXTO_PASSWORD_HASH?.trim() ||
  "$2b$10$cmw8WEY8kTXoro9Vs5k78utlT5HMx36KtHXzn0YVbAaLaFIP5IQfS";
const sessionSecret =
  process.env.SOHOTEXTO_SESSION_SECRET?.trim() ||
  "sohotexto-local-session-secret-change-me";
const secureCookie =
  (process.env.SOHOTEXTO_SECURE_COOKIE?.trim() || "false").toLowerCase() === "true";
const sessionCookieName = "sohotexto_session";
const sessionTtlMs = 1000 * 60 * 60 * 12;

const loginLimiter = createRateLimiter({
  windowMs: 1000 * 60 * 10,
  maxRequests: 10,
  message: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
});
const transcribeLimiter = createRateLimiter({
  windowMs: 1000 * 60,
  maxRequests: 20,
  message: "Limite temporario de transcricoes atingido. Aguarde um minuto e tente novamente.",
});

const sessions = new Map();
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

setInterval(() => {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}, 1000 * 60 * 10).unref();

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

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        const key = index >= 0 ? item.slice(0, index) : item;
        const value = index >= 0 ? item.slice(index + 1) : "";
        return [key, decodeURIComponent(value)];
      }),
  );
}

function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown";
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + sessionTtlMs;

  sessions.set(token, { username, expiresAt });
  return { token, expiresAt };
}

function getSession(request) {
  const cookies = parseCookies(request);
  const token = cookies[sessionCookieName];

  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return { token, ...session };
}

function buildSessionCookie(token, expiresAt) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor((expiresAt - Date.now()) / 1000)}`,
  ];

  if (secureCookie) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearSessionCookie() {
  const parts = [
    `${sessionCookieName}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (secureCookie) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });

    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    request.on("error", reject);
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
    throw new Error("O corpo da requisicao nao veio em JSON valido.");
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
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300",
  });
  response.end(content);
}

function applyRateLimit(response, outcome) {
  if (outcome.allowed) return false;

  writeJson(
    response,
    429,
    {
      ok: false,
      message: outcome.message,
    },
    {
      "Retry-After": String(outcome.retryAfterSec),
    },
  );
  return true;
}

async function handleLogin(request, response) {
  const ip = clientIp(request);
  if (applyRateLimit(response, loginLimiter.check(`login:${ip}`))) {
    return;
  }

  const body = await readJsonBody(request);
  const username = body?.username?.toString().trim() || "";
  const password = body?.password?.toString() || "";

  if (!username || !password) {
    writeJson(response, 400, {
      ok: false,
      message: "Informe usuario e senha.",
    });
    return;
  }

  if (username !== authUser) {
    writeJson(response, 401, {
      ok: false,
      message: "Usuario ou senha invalidos.",
    });
    return;
  }

  const passwordOk = await bcrypt.compare(password, passwordHash);

  if (!passwordOk) {
    writeJson(response, 401, {
      ok: false,
      message: "Usuario ou senha invalidos.",
    });
    return;
  }

  const session = createSession(username);

  writeJson(
    response,
    200,
    { ok: true, authenticated: true, username },
    {
      "Set-Cookie": buildSessionCookie(session.token, session.expiresAt),
    },
  );
}

function handleLogout(request, response) {
  const session = getSession(request);

  if (session?.token) {
    sessions.delete(session.token);
  }

  writeJson(
    response,
    200,
    { ok: true, authenticated: false },
    {
      "Set-Cookie": clearSessionCookie(),
    },
  );
}

function validateYouTubeUrl(value) {
  if (!value || value.length > 500) {
    throw new Error("Cole uma URL valida do YouTube.");
  }

  extractVideoId(value);
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Cole uma URL valida do YouTube.");
  }

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const allowedHosts = new Set(["youtube.com", "m.youtube.com", "youtu.be"]);

  if (!allowedHosts.has(hostname)) {
    throw new Error("Por enquanto, o SohoTexto aceita apenas URLs do YouTube.");
  }

  return { normalizedUrl: url.toString(), videoId };
}

async function handleTranscribe(request, response) {
  const session = getSession(request);

  if (!session) {
    writeJson(response, 401, {
      ok: false,
      message: "Acesso restrito. Entre com usuario e senha para continuar.",
    });
    return;
  }

  const ip = clientIp(request);
  if (applyRateLimit(response, transcribeLimiter.check(`transcribe:${session.username}:${ip}`))) {
    return;
  }

  try {
    const body = await readJsonBody(request);
    const url = body?.url?.toString().trim();

    const { normalizedUrl } = validateYouTubeUrl(url);
    const transcript = await fetchYouTubeTranscript(normalizedUrl);
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
    const message =
      error instanceof Error
        ? error.message
        : "Nao foi possivel obter a transcricao.";
    const statusCode =
      message.includes("URL valida") || message.includes("aceita apenas URLs do YouTube")
        ? 400
        : 500;

    writeJson(response, statusCode, {
      ok: false,
      message,
    });
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
  return {
    txtFileName: `${fileStem}.txt`,
  };
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${host}:${port}`);

  try {
    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      const session = getSession(request);
      writeJson(response, 200, {
        ok: true,
        authenticated: Boolean(session),
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/session") {
      const session = getSession(request);
      writeJson(response, 200, {
        ok: true,
        authenticated: Boolean(session),
        username: session?.username || null,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/login") {
      await handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/logout") {
      handleLogout(request, response);
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
    const statusCode = error?.code === "ENOENT" ? 404 : 500;

    if (!response.headersSent) {
      writeJson(response, statusCode, {
        ok: false,
        message:
          statusCode === 404
            ? "Recurso nao encontrado."
            : error instanceof Error
              ? error.message
              : "Falha interna no servidor.",
      });
      return;
    }

    response.end();
  }
});

server.listen(port, host, () => {
  console.log(`SohoTexto pronto em http://${host}:${port}`);
});


