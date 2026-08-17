import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderPage, renderSessionContent } from "./render.mjs";

const MAX_FORM_BYTES = 524_288;
const DEFAULT_SSE_POLL_MS = 100;
const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

const root = new URL("../", import.meta.url);
const bundledAssets = Object.freeze({
  "htmx-2.0.10.min.js": {
    type: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("vendor/htmx-2.0.10.min.js", root)),
  },
  "htmx-ext-sse-2.2.4.js": {
    type: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("vendor/htmx-ext-sse-2.2.4.js", root)),
  },
  "console-v4.css": {
    type: "text/css; charset=utf-8",
    body: readFileSync(new URL("assets/console.css", root)),
  },
  "browser-v3.js": {
    type: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("assets/browser-v3.js", root)),
  },
  "icon-v1.svg": {
    type: "image/svg+xml",
    body: readFileSync(new URL("assets/icon-v1.svg", root)),
  },
  "icon-v1-192.png": {
    type: "image/png",
    body: readFileSync(new URL("assets/icon-v1-192.png", root)),
  },
  "icon-v1-512.png": {
    type: "image/png",
    body: readFileSync(new URL("assets/icon-v1-512.png", root)),
  },
  "offline-v4.html": {
    type: "text/html; charset=utf-8",
    body: readFileSync(new URL("assets/offline-v4.html", root)),
  },
  "sw-v5.js": {
    type: "text/javascript; charset=utf-8",
    body: readFileSync(new URL("assets/sw-v5.js", root)),
  },
});

function normalizeBasePath(value) {
  const path = String(value ?? "/qq");
  if (!path.startsWith("/") || path.endsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error("qq-dsh-console: basePath must be an absolute path without a trailing slash");
  }
  return path;
}

function positiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`qq-dsh-console: ${name} must be a positive integer`);
  }
  return value;
}

function write(res, status, headers, body, head = false) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(head ? undefined : body);
}

function text(res, status, message, head = false) {
  write(res, status, { "Content-Type": "text/plain; charset=utf-8" }, `${message}\n`, head);
}

async function readForm(req) {
  const contentType = String(req.headers["content-type"] ?? "").split(";", 1)[0];
  if (contentType !== "application/x-www-form-urlencoded") {
    const error = new Error("Expected a URL-encoded form submission");
    error.status = 415;
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_FORM_BYTES) {
      const error = new Error("Form submission is too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function sameOrigin(req) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.origin;
  // A no-referrer document navigation can serialize a legitimate POST Origin
  // as `null`; Sec-Fetch-Site remains the browser-controlled same-site proof.
  if (!origin || origin === "null") return !site || site === "same-origin" || site === "none";
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function routes(basePath, sessionId) {
  const canonical = `${basePath}/session/${encodeURIComponent(sessionId)}`;
  return Object.freeze({
    canonical,
    events: `${canonical}/events`,
    interrupt: `${canonical}/interrupt`,
    prompt: `${canonical}/prompt`,
    createSession: `${basePath}/sessions`,
    switchSession: `${basePath}/sessions/open`,
  });
}

function parseSessionRoute(basePath, pathname) {
  const prefix = `${basePath}/session/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const parts = pathname.slice(prefix.length).split("/");
  if (parts.length < 1 || parts.length > 2 || !parts[0]) return undefined;
  let sessionId;
  try {
    sessionId = decodeURIComponent(parts[0]);
  } catch {
    return undefined;
  }
  return { sessionId, action: parts[1] ?? "page" };
}

function sseEvent(name, data) {
  const lines = String(data).replaceAll("\r", "").split("\n");
  return `event: ${name}\n${lines.map((line) => `data: ${line}`).join("\n")}\n\n`;
}

function snapshotFingerprint(snapshot) {
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const last = events.at(-1);
  const sessions = Array.isArray(snapshot.sessions) ? snapshot.sessions : [];
  return JSON.stringify([
    snapshot.id,
    snapshot.agentStatus,
    events.length,
    last?.seq,
    last?.type,
    last?.data?.reason?.kind,
    sessions.map((session) => [session.id, session.createdAt]),
  ]);
}

function errorStatus(error) {
  return Number.isInteger(error?.status) ? error.status : 503;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/** Build one HTTP handler over the DSH-owned session catalog and event logs. */
export function createConsoleHandler(backend, options = {}) {
  if (
    !backend ||
    typeof backend.read !== "function" ||
    typeof backend.list !== "function" ||
    typeof backend.create !== "function" ||
    typeof backend.prompt !== "function" ||
    typeof backend.interrupt !== "function"
  ) {
    throw new Error("qq-dsh-console: a DSH session backend is required");
  }
  const basePath = normalizeBasePath(options.basePath);
  const ssePollMs = positiveInteger(options.ssePollMs, DEFAULT_SSE_POLL_MS, "ssePollMs");
  const assetsPrefix = `${basePath}/assets/`;
  const sessionsPath = `${basePath}/sessions`;
  const switchSessionPath = `${sessionsPath}/open`;
  const assetPaths = Object.freeze({
    htmx: `${assetsPrefix}htmx-2.0.10.min.js`,
    sse: `${assetsPrefix}htmx-ext-sse-2.2.4.js`,
    css: `${assetsPrefix}console-v4.css`,
    browser: `${assetsPrefix}browser-v3.js`,
    icon192: `${assetsPrefix}icon-v1-192.png`,
    icon512: `${assetsPrefix}icon-v1-512.png`,
    manifest: `${assetsPrefix}manifest-v1.webmanifest`,
    serviceWorker: `${basePath}/sw-v5.js`,
  });

  async function view(sessionId) {
    const snapshot = await backend.read(sessionId);
    const available = await backend.list();
    if (!available.some((session) => session.id === snapshot.id)) {
      available.unshift({ id: snapshot.id, createdAt: 0 });
    }
    return { ...snapshot, sessions: available };
  }

  function navigationResponse(req, res, location, head = false) {
    if (String(req.headers["hx-request"] ?? "").toLowerCase() === "true") {
      write(
        res,
        200,
        { "HX-Redirect": location, "Content-Type": "text/plain; charset=utf-8" },
        "Open session\n",
        head,
      );
      return;
    }
    write(
      res,
      303,
      { Location: location, "Content-Type": "text/plain; charset=utf-8" },
      "See other\n",
      head,
    );
  }

  async function mutationResponse(req, res, sessionId, notice = "") {
    const paths = routes(basePath, sessionId);
    if (String(req.headers["hx-request"] ?? "").toLowerCase() === "true") {
      const body = renderSessionContent(await view(sessionId), paths, notice);
      write(res, 200, { "Content-Type": "text/html; charset=utf-8" }, body);
      return;
    }
    write(
      res,
      303,
      { Location: paths.canonical, "Content-Type": "text/plain; charset=utf-8" },
      "See other\n",
    );
  }

  return async function consoleHandler(req, res) {
    const head = req.method === "HEAD";
    let url;
    try {
      url = new URL(req.url ?? basePath, "http://qq-dsh-console.invalid");
    } catch {
      text(res, 400, "Malformed request URL", head);
      return;
    }

    if (url.pathname === assetPaths.serviceWorker) {
      if (req.method !== "GET" && !head) {
        write(res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed\n", head);
        return;
      }
      const asset = bundledAssets["sw-v5.js"];
      write(
        res,
        200,
        {
          "Content-Type": asset.type,
          "Content-Length": String(asset.body.length),
          "Service-Worker-Allowed": `${basePath}/`,
        },
        asset.body,
        head,
      );
      return;
    }

    if (url.pathname.startsWith(assetsPrefix)) {
      if (req.method !== "GET" && !head) {
        write(res, 405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed\n", head);
        return;
      }
      const name = url.pathname.slice(assetsPrefix.length);
      if (name === "manifest-v1.webmanifest") {
        const manifest = JSON.stringify({
          id: `${basePath}/`,
          name: "qq DSH console",
          short_name: "qq DSH",
          description: "A network-only operator surface for durable DSH sessions.",
          start_url: `${basePath}/`,
          scope: `${basePath}/`,
          display: "standalone",
          background_color: "#090c10",
          theme_color: "#0d1216",
          icons: [
            { src: assetPaths.icon192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: assetPaths.icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        });
        write(res, 200, { "Content-Type": "application/manifest+json; charset=utf-8" }, manifest, head);
        return;
      }
      const asset = bundledAssets[name];
      if (!asset || name.includes("/") || name === "sw-v5.js") {
        text(res, 404, "Not found", head);
        return;
      }
      write(
        res,
        200,
        {
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Type": asset.type,
          "Content-Length": String(asset.body.length),
        },
        asset.body,
        head,
      );
      return;
    }

    if (url.pathname === switchSessionPath && (req.method === "GET" || head)) {
      try {
        const sessionId = String(url.searchParams.get("session") ?? "");
        const snapshot = await backend.read(sessionId);
        navigationResponse(req, res, routes(basePath, snapshot.id).canonical, head);
      } catch (error) {
        text(res, errorStatus(error), `DSH session unavailable: ${errorMessage(error)}`, head);
      }
      return;
    }

    if (url.pathname === sessionsPath) {
      if (req.method !== "POST") {
        write(res, 405, { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed\n", head);
        return;
      }
      try {
        if (!sameOrigin(req)) {
          const error = new Error("Cross-origin form submission refused");
          error.status = 403;
          throw error;
        }
        await readForm(req);
        const created = await backend.create();
        navigationResponse(req, res, routes(basePath, created.id).canonical);
      } catch (error) {
        text(res, errorStatus(error), errorMessage(error));
      }
      return;
    }

    const selected = parseSessionRoute(basePath, url.pathname);
    const rootPage = url.pathname === basePath || url.pathname === `${basePath}/`;
    if ((rootPage || selected?.action === "page") && (req.method === "GET" || head)) {
      const sessionId = rootPage ? backend.defaultSessionId : selected.sessionId;
      try {
        const snapshot = await view(sessionId);
        const paths = routes(basePath, snapshot.id);
        const body = renderPage(snapshot, paths, assetPaths);
        write(res, 200, { "Content-Type": "text/html; charset=utf-8" }, body, head);
      } catch (error) {
        text(res, errorStatus(error), `DSH session unavailable: ${errorMessage(error)}`, head);
      }
      return;
    }

    if (selected?.action === "events") {
      if (req.method !== "GET") {
        write(res, 405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed\n", head);
        return;
      }
      let snapshot;
      try {
        snapshot = await view(selected.sessionId);
      } catch (error) {
        text(res, errorStatus(error), `DSH session unavailable: ${errorMessage(error)}`);
        return;
      }
      const paths = routes(basePath, snapshot.id);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders?.();
      let closed = false;
      let timer;
      let fingerprint = snapshotFingerprint(snapshot);
      res.write(sseEvent("session", renderSessionContent(snapshot, paths)));

      const close = () => {
        closed = true;
        clearTimeout(timer);
      };
      req.once("close", close);
      res.once("close", close);

      const poll = async () => {
        if (closed || res.destroyed || res.writableEnded) return;
        try {
          const next = await view(selected.sessionId);
          const nextFingerprint = snapshotFingerprint(next);
          if (nextFingerprint !== fingerprint) {
            fingerprint = nextFingerprint;
            res.write(sseEvent("session", renderSessionContent(next, paths)));
          } else {
            res.write(": keepalive\n\n");
          }
        } catch (error) {
          res.write(sseEvent("console-error", errorMessage(error)));
          res.end();
          return;
        }
        timer = setTimeout(poll, ssePollMs);
        timer.unref?.();
      };
      timer = setTimeout(poll, ssePollMs);
      timer.unref?.();
      return;
    }

    if (selected?.action === "prompt") {
      if (req.method !== "POST") {
        write(res, 405, { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed\n", head);
        return;
      }
      try {
        if (!sameOrigin(req)) {
          const error = new Error("Cross-origin form submission refused");
          error.status = 403;
          throw error;
        }
        const form = await readForm(req);
        const prompt = String(form.get("prompt") ?? "");
        if (!prompt.trim()) {
          const error = new Error("Message must not be empty");
          error.status = 422;
          throw error;
        }
        if (prompt.length > 32_768) {
          const error = new Error("Message exceeds 32,768 characters");
          error.status = 413;
          throw error;
        }
        await backend.prompt(selected.sessionId, prompt);
        await mutationResponse(req, res, selected.sessionId);
      } catch (error) {
        if (String(req.headers["hx-request"] ?? "").toLowerCase() === "true") {
          try {
            await mutationResponse(req, res, selected.sessionId, errorMessage(error));
            return;
          } catch {
            // Fall through when the DSH session itself cannot be read.
          }
        }
        text(res, errorStatus(error), errorMessage(error));
      }
      return;
    }

    if (selected?.action === "interrupt") {
      if (req.method !== "POST") {
        write(res, 405, { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" }, "Method not allowed\n", head);
        return;
      }
      try {
        if (!sameOrigin(req)) {
          const error = new Error("Cross-origin form submission refused");
          error.status = 403;
          throw error;
        }
        await readForm(req);
        const interrupted = await backend.interrupt(selected.sessionId);
        await mutationResponse(
          req,
          res,
          selected.sessionId,
          interrupted ? "Interrupt requested for the running DSH turn." : "No DSH turn was running.",
        );
      } catch (error) {
        text(res, errorStatus(error), errorMessage(error));
      }
      return;
    }

    text(res, 404, "Not found", head);
  };
}

export const internals = Object.freeze({
  DEFAULT_SSE_POLL_MS,
  MAX_FORM_BYTES,
  SECURITY_HEADERS,
  assetNames: Object.keys(bundledAssets),
  file: fileURLToPath(import.meta.url),
  normalizeBasePath,
  parseSessionRoute,
  routes,
  sameOrigin,
  snapshotFingerprint,
  sseEvent,
});
