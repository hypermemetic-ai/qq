import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { constants as fsConstants } from "node:fs";
import { createConsoleHandler } from "../qq-ui/src/http-app.mjs";

const SESSION_ID = "session-63a11000-0000-4000-8000-000000000031";
const CANONICAL_PATH = `/qq/project/proof/session/${SESSION_ID}`;
const LEGACY_WORKER = `"use strict";
const CACHE_NAME = "qq-static-v10-browser-proof";
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).then((response) => response.ok ? response : Promise.reject(new Error("redirect"))));
});\n`;

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket failed")), { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify(message));
    });
  }

  close() {
    this.socket.close();
  }
}

async function executableChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const base of [
    join(homedir(), ".agent-browser/browsers"),
    join(homedir(), ".cache/ms-playwright"),
  ]) {
    try {
      const versions = (await readdir(base, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
        .reverse();
      for (const version of versions) {
        candidates.push(join(base, version, "chrome"));
        candidates.push(join(base, version, "chrome-linux64/chrome"));
        candidates.push(join(base, version, "chrome-linux/chrome"));
      }
    } catch {
      /* Try the next conventional installation root. */
    }
  }
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      /* Try the next candidate. */
    }
  }
  throw new Error("test-qq-host: Chrome is required for the PWA browser regression");
}

async function testCertificate(directory) {
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "cert.pem");
  await new Promise((resolve, reject) => {
    const child = spawn("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
      "-subj", "/CN=localhost", "-keyout", keyPath, "-out", certPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let diagnostics = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { diagnostics = `${diagnostics}${chunk}`.slice(-2_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`openssl could not create the PWA test certificate (${code}): ${diagnostics}`));
    });
  });
  return Promise.all([readFile(keyPath), readFile(certPath)]).then(([key, cert]) => ({ key, cert }));
}

async function launchChrome(profile) {
  const chrome = await executableChrome();
  const child = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-component-update",
    "--ignore-certificate-errors",
    "--allow-insecure-localhost",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.setEncoding("utf8");
  let diagnostics = "";
  const websocketUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools endpoint timed out: ${diagnostics}`)), 15_000);
    child.stderr.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-4_000);
      const match = diagnostics.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (${code}): ${diagnostics}`));
    });
  });
  return { child, client: await CdpClient.connect(websocketUrl) };
}

async function createPage(client, options = {}) {
  const { browserContextId } = await client.send("Target.createBrowserContext");
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  if (options.mobile || options.width) {
    const width = options.width ?? 412;
    const height = options.height ?? 915;
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: options.deviceScaleFactor ?? 2.625,
      mobile: options.mobile !== false,
      screenOrientation: { type: "portraitPrimary", angle: 0 },
    }, sessionId);
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, sessionId);
    await client.send("Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
      platform: "Android",
    }, sessionId);
  }
  return { browserContextId, sessionId };
}

async function evaluate(client, page, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, page.sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(check, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ""}`);
}

async function navigate(client, page, url) {
  await client.send("Page.navigate", { url }, page.sessionId);
}

const touchPoints = (clientX, clientY) => [{ x: clientX, y: clientY, radiusX: 6, radiusY: 6, force: 1, id: 0 }];

async function dispatchTouchSwipe(client, page, { x = 8, y = 420, endX, endY, steps = 5, delayMs = 20, releaseDelayMs = 20 }) {
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoints(x, y) }, page.sessionId);
  for (let step = 1; step <= steps; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: touchPoints(x + ((endX - x) * step) / steps, y + ((endY - y) * step) / steps),
    }, page.sessionId);
  }
  await new Promise((resolve) => setTimeout(resolve, releaseDelayMs));
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, page.sessionId);
}

async function dispatchKey(client, page, key, code, windowsVirtualKeyCode) {
  const text = key === "Enter" ? "\r" : undefined;
  const keyEvent = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, ...(text ? { text, unmodifiedText: text } : {}) };
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...keyEvent }, page.sessionId);
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...keyEvent }, page.sessionId);
}

async function waitForDrawerSurface(client, page, pathname) {
  return waitFor(
    () => evaluate(client, page, `(() => ({
      ready: document.readyState === "complete" && Boolean(document.querySelector("#project-drawer")),
      pathname: location.pathname,
    }))()`).then((state) => state?.ready && state.pathname === pathname && state),
    `drawer surface ${pathname} did not load`,
  );
}

async function waitForDocumentViewer(client, page, pathname) {
  return waitFor(
    () => evaluate(client, page, `(() => ({
      ready: document.readyState === "complete" && Boolean(document.querySelector("[data-document-viewer]")),
      pathname: location.pathname,
    }))()`).then((state) => state?.ready && state.pathname === pathname && state),
    `document viewer ${pathname} did not load`,
  );
}

async function captureViewport(client, page, path) {
  const shot = await client.send("Page.captureScreenshot", { format: "png" }, page.sessionId);
  await writeFile(path, Buffer.from(shot.data, "base64"));
  return path;
}

async function assertDrawerHeadingFocus(client, page) {
  const heading = await waitFor(
    () => evaluate(client, page, `(() => {
      const heading = document.querySelector("#project-drawer-title");
      if (!(heading instanceof HTMLElement) || document.activeElement !== heading) return null;
      const style = getComputedStyle(heading);
      return {
        tabIndex: heading.tabIndex,
        outlineStyle: style.outlineStyle,
      };
    })()`),
    "drawer heading did not receive programmatic focus",
  );
  assert.equal(heading.tabIndex, -1, "drawer heading became keyboard-tabbable");
  assert.equal(heading.outlineStyle, "none", "focused drawer heading retained a visible outline");
}

async function openDrawerWithTouch(client, page, { x = 206, y = 420, travel = 40, steps = 4 } = {}) {
  const endX = x + travel;
  const before = await evaluate(client, page, `(() => {
    window.__qqDrawerOpenedAt = null;
    window.__qqDrawerOpenObserver?.disconnect();
    window.__qqDrawerOpenObserver = new MutationObserver(() => {
      if (!document.body.classList.contains("drawer-open")) return;
      window.__qqDrawerOpenedAt = performance.now();
      window.__qqDrawerOpenObserver.disconnect();
    });
    window.__qqDrawerOpenObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.__qqSurfaceTouchProbe?.abort();
    window.__qqSurfaceTouchProbe = new AbortController();
    window.__qqSurfaceMoves = [];
    document.addEventListener("touchmove", (event) => {
      window.__qqSurfaceMoves.push({ prevented: event.defaultPrevented, cancelable: event.cancelable });
    }, { signal: window.__qqSurfaceTouchProbe.signal });
    const target = document.elementFromPoint(${x}, ${y});
    let horizontalScroller = null;
    for (let node = target; node; node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      const overflowX = getComputedStyle(node).overflowX;
      if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
        horizontalScroller = { tag: node.tagName, id: node.id, className: node.className };
        break;
      }
    }
    return {
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      target: target?.tagName,
      targetId: target?.id,
      interactive: Boolean(target?.closest("form, a, button, input, textarea, select, [contenteditable], #project-drawer, #project-drawer-backdrop")),
      horizontalScroller,
      hasRail: Boolean(document.querySelector(".drawer-edge")),
    };
  })()`);
  assert.ok(x >= 180, `touch proof must start on the ordinary content surface (x=${x})`);
  assert.ok(endX <= 407, `touch proof must remain inside the 412px surface (endX=${endX})`);
  assert.ok(travel <= 45, `touch proof used too much horizontal travel (${travel}px)`);
  assert.equal(before.interactive, false, `touch started on interactive ${before.target}#${before.targetId}`);
  assert.equal(before.horizontalScroller, null, `touch started in horizontal scroller ${JSON.stringify(before.horizontalScroller)}`);
  assert.equal(before.hasRail, false, "obsolete edge rail remained in the document");
  await dispatchTouchSwipe(client, page, { x, y, endX, endY: y + 3, steps });
  const opened = await waitFor(
    () => evaluate(client, page, `(() => ({
      open: document.body.classList.contains("drawer-open"),
      hidden: document.querySelector("#project-drawer")?.getAttribute("aria-hidden"),
      openedAt: window.__qqDrawerOpenedAt,
      moves: window.__qqSurfaceMoves,
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      drawer: new URL(location.href).searchParams.get("drawer"),
    }))()`).then((state) => state?.open && Number.isFinite(state.openedAt) && state),
    `surface swipe did not open the drawer on ${before.pathname}`,
  );
  assert.equal(opened.hidden, "false");
  assert.equal(opened.moves.some((move) => move.cancelable && move.prevented), true, "horizontal surface swipe was not claimed");
  assert.equal(opened.timeOrigin, before.timeOrigin, "surface swipe reloaded the document");
  assert.equal(opened.pathname, before.pathname);
  await assertDrawerHeadingFocus(client, page);
  return opened;
}

async function readDrawerDragState(client, page) {
  return evaluate(client, page, `(() => {
    const drawer = document.querySelector("#project-drawer");
    const backdrop = document.querySelector("#project-drawer-backdrop");
    const background = [...document.body.children].filter((node) => node !== drawer && node !== backdrop);
    const rect = drawer.getBoundingClientRect();
    return {
      active: document.body.classList.contains("drawer-drag-active"),
      settling: document.body.classList.contains("drawer-drag-settling"),
      open: document.body.classList.contains("drawer-open"),
      left: rect.left,
      right: rect.right,
      width: rect.width,
      transform: getComputedStyle(drawer).transform,
      inlineTransform: drawer.style.transform,
      drawerHidden: drawer.getAttribute("aria-hidden"),
      drawerInert: drawer.inert,
      backdropHidden: backdrop.hidden,
      backdropAriaHidden: backdrop.getAttribute("aria-hidden"),
      backdropInert: backdrop.inert,
      backdropOpacity: parseFloat(getComputedStyle(backdrop).opacity),
      backgroundInert: background.some((node) => node.inert),
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
      activeElement: document.activeElement?.id || document.activeElement?.tagName,
    };
  })()`);
}

async function waitForCleanDrawerCancel(client, page, message) {
  const state = await waitFor(
    () => readDrawerDragState(client, page).then((candidate) =>
      !candidate.open && !candidate.active && !candidate.settling && candidate.backdropHidden && candidate),
    message,
  );
  assert.equal(state.drawerHidden, "true");
  assert.equal(state.drawerInert, true);
  assert.equal(state.backdropAriaHidden, "true");
  assert.equal(state.backgroundInert, false);
  assert.equal(state.hasDrawerQuery, false);
  assert.equal(state.inlineTransform, "", "cancel left a transient drawer transform");
  return state;
}

async function closeDrawerWithImmediateBackdropTouch(client, page, { x = 330, y = 420 } = {}) {
  const before = await evaluate(client, page, `(() => {
    const drawer = document.querySelector("#project-drawer");
    const probe = document.createElement("button");
    probe.id = "qq-click-through-probe";
    probe.type = "button";
    probe.tabIndex = -1;
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;z-index:1;left:${x - 35}px;top:${y - 35}px;width:70px;height:70px";
    window.__qqClickThroughs = 0;
    probe.addEventListener("click", () => { window.__qqClickThroughs += 1; });
    document.body.append(probe);
    return {
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      openedAt: window.__qqDrawerOpenedAt,
      transitionMs: parseFloat(getComputedStyle(drawer).transitionDuration) * 1000,
      target: document.elementFromPoint(${x}, ${y})?.id,
    };
  })()`);
  assert.equal(before.target, "project-drawer-backdrop", "touch proof did not start on the exposed backdrop");
  const point = [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 0 }];
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point }, page.sessionId);
  const onPointerDown = await evaluate(client, page, `(() => ({
    open: document.body.classList.contains("drawer-open"),
    hidden: document.querySelector("#project-drawer")?.getAttribute("aria-hidden"),
    elapsed: performance.now() - window.__qqDrawerOpenedAt,
    clicks: window.__qqClickThroughs,
  }))()`);
  assert.equal(onPointerDown.open, false, "backdrop touch waited for click/pointerup before closing");
  assert.equal(onPointerDown.hidden, "true");
  assert.ok(onPointerDown.elapsed < before.transitionMs, `backdrop closed after the ${before.transitionMs}ms opening transition (${onPointerDown.elapsed}ms)`);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, page.sessionId);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const closed = await evaluate(client, page, `(() => {
    const probe = document.querySelector("#qq-click-through-probe");
    const state = {
      clicks: window.__qqClickThroughs,
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
    };
    probe?.remove();
    return state;
  })()`);
  assert.equal(closed.clicks, 0, "backdrop touch clicked through to an underlying control");
  assert.equal(closed.timeOrigin, before.timeOrigin, "backdrop dismissal reloaded the document");
  assert.equal(closed.pathname, before.pathname);
  assert.equal(closed.hasDrawerQuery, false);
}

async function closeDrawerWithKeyboard(client, page) {
  const before = await evaluate(client, page, `({ timeOrigin: performance.timeOrigin, pathname: location.pathname })`);
  await dispatchKey(client, page, "Tab", "Tab", 9);
  const focused = await waitFor(
    () => evaluate(client, page, `(() => {
      const close = document.querySelector(".drawer-close");
      const rect = close.getBoundingClientRect();
      return {
        focused: document.activeElement === close,
        focusVisible: close.matches(":focus-visible"),
        width: rect.width,
        height: rect.height,
        outlineStyle: getComputedStyle(close).outlineStyle,
        outlineWidth: getComputedStyle(close).outlineWidth,
      };
    })()`).then((state) => state?.focused && state),
    "mobile nonvisual close did not receive keyboard focus",
  );
  assert.equal(focused.focusVisible, true);
  assert.ok(focused.width >= 40 && focused.height >= 40, "mobile close did not become visible on keyboard focus");
  assert.equal(focused.outlineStyle, "solid", "keyboard-focused drawer close lost its visible outline");
  assert.ok(parseFloat(focused.outlineWidth) >= 2, "keyboard-focused drawer close outline was too thin");
  await dispatchKey(client, page, "Enter", "Enter", 13);
  const closed = await waitFor(
    () => evaluate(client, page, `({
      open: document.body.classList.contains("drawer-open"),
      timeOrigin: performance.timeOrigin,
      pathname: location.pathname,
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
    })`).then((state) => !state?.open && state),
    "keyboard close did not dismiss the mobile drawer",
  );
  assert.equal(closed.timeOrigin, before.timeOrigin);
  assert.equal(closed.pathname, before.pathname);
  assert.equal(closed.hasDrawerQuery, false);
}

async function closeDrawerInPlace(client, page) {
  const before = await evaluate(client, page, "performance.timeOrigin");
  await evaluate(client, page, `document.querySelector(".drawer-close").click()`);
  const closed = await waitFor(
    () => evaluate(client, page, `({
      open: document.body.classList.contains("drawer-open"),
      hidden: document.querySelector("#project-drawer")?.getAttribute("aria-hidden"),
      timeOrigin: performance.timeOrigin,
      hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
    })`).then((state) => !state?.open && state),
    "drawer did not close in place",
  );
  assert.equal(closed.hidden, "true");
  assert.equal(closed.timeOrigin, before, "closing the drawer reloaded the document");
  assert.equal(closed.hasDrawerQuery, false);
}

async function waitForLive(client, page, origin) {
  const readState = () => evaluate(client, page, `(() => ({
    ready: document.readyState === "complete" && Boolean(document.querySelector("#prompt")),
    path: location.pathname,
    title: document.title,
    text: document.body?.textContent ?? ""
  }))()`);
  try {
    return await waitFor(
      () => readState().then((state) => state?.ready && state.path === CANONICAL_PATH && !state.text.includes("No transcript is cached") && state),
      `live canonical console did not load from ${origin}`,
    );
  } catch (error) {
    const state = await readState().catch(() => undefined);
    throw new Error(`${error.message}; final state ${JSON.stringify(state)}`);
  }
}

async function waitForWorker(client, page, scriptPattern = /\/qq\/sw\.js$/) {
  return waitFor(async () => {
    const state = await evaluate(client, page, `(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/qq/");
      const names = await caches.keys();
      return {
        active: registration?.active?.scriptURL ?? "",
        controller: navigator.serviceWorker.controller?.scriptURL ?? "",
        names,
      };
    })()`);
    return scriptPattern.test(state.active) && scriptPattern.test(state.controller) && state.names.includes("qq-static-v18") && state;
  }, `service worker ${scriptPattern} did not activate and control the page`, 15_000);
}

export async function runQqPwaBrowserProof() {
  const observers = new Set();
  const longReadme = `# Project proof\n\n${Array.from({ length: 120 }, (_, index) => `Scrollable proof line ${index + 1}.`).join("\n\n")}\n`;
  const wideCode = `export const fixture = "${"wide-code-proof-".repeat(80)}";\n`;
  const backend = {
    defaultSessionId: SESSION_ID,
    defaultProject: "proof",
    listProjects: () => [{ name: "proof", cwd: "/proof" }, { name: "empty", cwd: "/empty" }],
    listProjectFiles(project, path = "") {
      if (!project) {
        return {
          scope: "projects", project: null, path: "", parent: null,
          breadcrumbs: [{ type: "projects", name: "projects", path: null }],
          entries: this.listProjects().map(({ name }) => ({ type: "project", project: name, name })),
        };
      }
      if (path === "src") {
        return {
          scope: "project", project, path, parent: "",
          breadcrumbs: [
            { type: "projects", name: "projects", path: null },
            { type: "project", name: project, path: "" },
            { type: "directory", name: "src", path: "src" },
          ],
          entries: [{ type: "file", name: "fixture.js", path: "src/fixture.js", kind: "code" }],
        };
      }
      return {
        scope: "project", project, path: "", parent: null,
        breadcrumbs: [
          { type: "projects", name: "projects", path: null },
          { type: "project", name: project, path: "" },
        ],
        entries: project === "proof" ? [
          { type: "directory", name: "src", path: "src" },
          { type: "file", name: "README.md", path: "README.md", kind: "markdown" },
        ] : [],
      };
    },
    readProjectFile(project, path) {
      if (project === "proof" && path === "README.md") {
        return { project, path, name: "README.md", kind: "markdown", size: longReadme.length, text: longReadme };
      }
      if (project === "proof" && path === "src/fixture.js") {
        return { project, path, name: "fixture.js", kind: "code", language: "javascript", size: wideCode.length, text: wideCode };
      }
      const error = new Error("qq: file not found");
      error.status = 404;
      throw error;
    },
    openProjectFile() {
      const error = new Error("qq: file not found");
      error.status = 404;
      throw error;
    },
    async list(project) { return project === "empty" ? [] : [{ id: SESSION_ID, createdAt: 1, project: "proof" }]; },
    async read(id) {
      assert.equal(id, SESSION_ID);
      return { id, project: "proof", events: [], agentStatus: "idle" };
    },
    observe(id, listener) {
      observers.add(listener);
      void this.read(id).then((snapshot) => listener(null, snapshot), listener);
      return () => observers.delete(listener);
    },
    async create() { return { id: SESSION_ID, project: "proof" }; },
    async prompt() {},
    async interrupt() { return false; },
    async close() { return { id: SESSION_ID, project: "proof" }; },
  };
  const consoleHandler = createConsoleHandler(backend, { ssePollMs: 50 });
  let networkAvailable = true;
  let serveOldLegacyWorker = true;
  const requests = [];
  const temporary = await mkdtemp(join(tmpdir(), "qq-pwa-browser-"));
  const certificate = await testCertificate(temporary);
  const server = createHttpsServer(certificate, (req, res) => {
    requests.push(req.url ?? "");
    if (req.url === "/__legacy") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end("<!doctype html><title>legacy worker migration</title>");
      return;
    }
    if (req.url === "/qq/sw-v10.js" && serveOldLegacyWorker) {
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
        "service-worker-allowed": "/qq/",
      });
      res.end(LEGACY_WORKER);
      return;
    }
    if (!networkAvailable && req.url?.startsWith("/qq/")) {
      req.socket.destroy();
      return;
    }
    void consoleHandler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `https://127.0.0.1:${address.port}`;
  let chrome;
  try {
    chrome = await launchChrome(join(temporary, "chrome"));
    const { client } = chrome;

    // Desktop installed-app path: fresh root, active worker, controlled root
    // reopen, direct canonical navigation, true network failure, and repeats.
    const desktop = await createPage(client);
    await navigate(client, desktop, `${origin}/qq/`);
    await waitForLive(client, desktop, origin);
    await waitForWorker(client, desktop);
    const cachedPaths = await evaluate(client, desktop, `(async () => {
      const cache = await caches.open("qq-static-v18");
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    })()`);
    assert.ok(cachedPaths.length > 0);
    assert.equal(cachedPaths.every((path) => path.startsWith("/qq/assets/")), true);
    assert.doesNotMatch(cachedPaths.join("\n"), /session\/|\/prompt|\/events|\/interrupt|\/file\/|credential/i);
    await navigate(client, desktop, `${origin}/qq/`);
    await waitForLive(client, desktop, origin);
    await navigate(client, desktop, `${origin}${CANONICAL_PATH}`);
    await waitForLive(client, desktop, origin);
    assert.equal(await evaluate(client, desktop, `document.querySelector(".drawer-edge")`), null);
    const desktopDrawerStart = await evaluate(client, desktop, `({ timeOrigin: performance.timeOrigin, pathname: location.pathname })`);
    await evaluate(client, desktop, `document.querySelector("#project-drawer-toggle").click()`);
    await waitFor(() => evaluate(client, desktop, `document.body.classList.contains("drawer-open")`), "desktop Files button did not open the drawer");
    const desktopClose = await evaluate(client, desktop, `(() => {
      const close = document.querySelector(".drawer-close");
      const rect = close.getBoundingClientRect();
      return { width: rect.width, height: rect.height, label: close.getAttribute("aria-label") };
    })()`);
    assert.ok(desktopClose.width >= 40 && desktopClose.height >= 40, "desktop X was not visible");
    assert.equal(desktopClose.label, "Close files");
    await evaluate(client, desktop, `document.querySelector(".drawer-close").click()`);
    await waitFor(() => evaluate(client, desktop, `!document.body.classList.contains("drawer-open")`), "desktop X did not close the drawer");
    await evaluate(client, desktop, `document.querySelector("#project-drawer-toggle").click()`);
    await waitFor(() => evaluate(client, desktop, `document.body.classList.contains("drawer-open")`), "desktop drawer did not reopen");
    await dispatchKey(client, desktop, "Escape", "Escape", 27);
    const desktopDrawerEnd = await waitFor(
      () => evaluate(client, desktop, `({
        open: document.body.classList.contains("drawer-open"),
        timeOrigin: performance.timeOrigin,
        pathname: location.pathname,
        hasDrawerQuery: new URL(location.href).searchParams.has("drawer"),
      })`).then((state) => !state?.open && state),
      "desktop Escape did not close the drawer",
    );
    assert.equal(desktopDrawerEnd.timeOrigin, desktopDrawerStart.timeOrigin);
    assert.equal(desktopDrawerEnd.pathname, desktopDrawerStart.pathname);
    assert.equal(desktopDrawerEnd.hasDrawerQuery, false);

    networkAvailable = false;
    await navigate(client, desktop, `${origin}/qq/`);
    await waitFor(
      () => evaluate(client, desktop, `document.body?.textContent?.includes("No transcript is cached and no message can be sent offline")`),
      "genuine network failure did not render the offline fallback",
      10_000,
    );
    networkAvailable = true;
    for (let reopen = 0; reopen < 2; reopen += 1) {
      await navigate(client, desktop, `${origin}/qq/`);
      await waitForLive(client, desktop, origin);
    }

    // A stranded registration updates in place from its legacy script URL.
    const legacy = await createPage(client);
    await navigate(client, legacy, `${origin}/__legacy`);
    await waitFor(() => evaluate(client, legacy, "document.readyState === 'complete'"), "legacy bootstrap did not load");
    const oldScript = await evaluate(client, legacy, `(async () => {
      const registration = await navigator.serviceWorker.register("/qq/sw-v10.js", { scope: "/qq/", updateViaCache: "none" });
      while (!registration.active) await new Promise((resolve) => setTimeout(resolve, 20));
      return registration.active.scriptURL;
    })()`);
    assert.match(oldScript, /\/qq\/sw-v10\.js$/);
    assert.equal((await evaluate(client, legacy, "caches.keys()" )).includes("qq-static-v10-browser-proof"), true);
    serveOldLegacyWorker = false;
    await evaluate(client, legacy, `(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/qq/");
      await registration.update();
      return true;
    })()`);
    await waitFor(
      () => evaluate(client, legacy, "caches.keys()").then((names) => names.includes("qq-static-v18") && !names.includes("qq-static-v10-browser-proof")),
      "legacy registration did not activate the compatibility worker",
      15_000,
    );
    const migratedScript = await evaluate(client, legacy, `(async () => (await navigator.serviceWorker.getRegistration("/qq/")).active.scriptURL)()`);
    assert.match(migratedScript, /\/qq\/sw-v10\.js$/);
    await navigate(client, legacy, `${origin}/qq/`);
    await waitForLive(client, legacy, origin);

    // Pixel 10 public-style HTTPS/PWA path gets the same controlled recovery.
    const pixel = await createPage(client, { mobile: true });
    await navigate(client, pixel, `${origin}/qq/`);
    await waitForLive(client, pixel, origin);
    await waitForWorker(client, pixel);
    await navigate(client, pixel, `${origin}/qq/`);
    await waitForLive(client, pixel, origin);
    const device = await evaluate(client, pixel, `({ width: innerWidth, height: innerHeight, userAgent: navigator.userAgent, protocol: location.protocol })`);
    assert.equal(device.width, 412);
    assert.equal(device.height, 915);
    assert.match(device.userAgent, /Pixel 10/);
    assert.equal(device.protocol, "https:");

    const mobileChrome = await evaluate(client, pixel, `(() => {
      const toggle = document.querySelector("#project-drawer-toggle");
      const backdrop = document.querySelector("#project-drawer-backdrop");
      const close = document.querySelector(".drawer-close");
      const closeRect = close.getBoundingClientRect();
      const farSurface = document.elementFromPoint(360, 420);
      return {
        toggleDisplay: getComputedStyle(toggle).display,
        toggleWidth: toggle.getBoundingClientRect().width,
        hasRail: Boolean(document.querySelector(".drawer-edge")),
        bodyTouchAction: getComputedStyle(document.body).touchAction,
        surfaceTouchAction: getComputedStyle(farSurface).touchAction,
        surfaceInteractive: Boolean(farSurface?.closest("form, a, button, input, textarea, select, [contenteditable], #project-drawer, #project-drawer-backdrop")),
        backdropTouchAction: getComputedStyle(backdrop).touchAction,
        closeLabel: close.getAttribute("aria-label"),
        closeWidth: closeRect.width,
        closeHeight: closeRect.height,
        closeClipPath: getComputedStyle(close).clipPath,
        closeTabIndex: close.tabIndex,
      };
    })()`);
    assert.equal(mobileChrome.toggleDisplay, "none", "the Files trigger remained painted on mobile");
    assert.equal(mobileChrome.toggleWidth, 0);
    assert.equal(mobileChrome.hasRail, false, "obsolete drawer rail remained painted or targetable");
    assert.equal(mobileChrome.bodyTouchAction, "auto", "the app globally constrained native touch behavior");
    assert.equal(mobileChrome.surfaceTouchAction, "auto");
    assert.equal(mobileChrome.surfaceInteractive, false, "far-side proof point was not ordinary app content");
    assert.equal(mobileChrome.backdropTouchAction, "manipulation");
    assert.equal(mobileChrome.closeLabel, "Close files");
    assert.ok(mobileChrome.closeWidth <= 1 && mobileChrome.closeHeight <= 1, "mobile X remained visibly painted");
    assert.equal(mobileChrome.closeClipPath, "inset(50%)");
    assert.equal(mobileChrome.closeTabIndex, 0, "mobile nonvisual close left the keyboard order");

    // Delegated recognition survives a real SSE innerHTML replacement without a fragment-owned gesture target.
    await evaluate(client, pixel, `(() => {
      window.__qqHeadingBeforeSse = document.querySelector(".session-heading");
      return true;
    })()`);
    const published = await backend.read(SESSION_ID);
    for (const listener of observers) listener(null, published);
    await waitFor(
      () => evaluate(client, pixel, `document.querySelector(".session-heading") !== window.__qqHeadingBeforeSse`),
      "session SSE did not replace the panel content",
    );
    assert.equal(await evaluate(client, pixel, `document.querySelector(".drawer-edge")`), null);

    // Direct manipulation is observable before release: two finger distances
    // produce two proportional drawer transforms and progressive backdrop
    // opacity without committing modal, focus, background inertness, or URL.
    const dragX = 206;
    const dragY = 420;
    const dragFocus = await evaluate(client, pixel, `document.activeElement?.id || document.activeElement?.tagName`);
    const closedPull = await readDrawerDragState(client, pixel);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoints(dragX, dragY) }, pixel.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 24));
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchPoints(dragX + 24, dragY + 1) }, pixel.sessionId);
    const firstPull = await readDrawerDragState(client, pixel);
    await new Promise((resolve) => setTimeout(resolve, 32));
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchPoints(dragX + 120, dragY + 2) }, pixel.sessionId);
    const secondPull = await readDrawerDragState(client, pixel);
    const midDragImage = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true }, pixel.sessionId);
    const midDragBytes = Buffer.from(midDragImage.data, "base64");
    await writeFile(join(temporary, "pixel-drawer-mid-drag.png"), midDragBytes);
    assert.ok(midDragBytes.length > 10_000, "mid-drag Pixel screenshot was empty");
    for (const [distance, state] of [[24, firstPull], [120, secondPull]]) {
      assert.equal(state.active, true, `drawer was not tracking at ${distance}px`);
      assert.equal(state.open, false, `drawer committed while touch remained down at ${distance}px`);
      const transformDelta = state.right - closedPull.right;
      assert.ok(Math.abs(transformDelta - distance) <= 1.5, `drawer transform moved ${transformDelta}px for ${distance}px pull`);
      assert.equal(state.drawerHidden, "true");
      assert.equal(state.drawerInert, true);
      assert.equal(state.backdropHidden, false);
      assert.equal(state.backdropAriaHidden, "true");
      assert.equal(state.backdropInert, true);
      assert.equal(state.backgroundInert, false);
      assert.equal(state.hasDrawerQuery, false);
      assert.equal(state.activeElement, dragFocus);
    }
    assert.ok(secondPull.backdropOpacity > firstPull.backdropOpacity, "backdrop did not progress with drawer travel");
    assert.ok(Math.abs((secondPull.right - firstPull.right) - 96) <= 1.5, "drawer transform did not match the same held touch between distances");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, pixel.sessionId);
    const directOpen = await waitFor(
      () => readDrawerDragState(client, pixel).then((state) => state.open && state),
      "progressive center pull did not settle open on release",
    );
    assert.equal(directOpen.drawerHidden, "false");
    assert.equal(directOpen.drawerInert, false);
    assert.equal(directOpen.backdropAriaHidden, "false");
    assert.equal(directOpen.backgroundInert, true);
    assert.equal(directOpen.hasDrawerQuery, true);
    await assertDrawerHeadingFocus(client, pixel);
    await closeDrawerInPlace(client, pixel);

    // Slow, short pulls settle closed at the center and with little far-edge
    // travel; fast pulls at both starts velocity-settle open.
    await dispatchTouchSwipe(client, pixel, {
      x: 206, y: 420, endX: 224, endY: 421, steps: 3, delayMs: 80, releaseDelayMs: 80,
    });
    await waitForCleanDrawerCancel(client, pixel, "slow center pull did not settle closed");
    await openDrawerWithTouch(client, pixel, { x: 206, travel: 40, steps: 1 });
    await closeDrawerWithImmediateBackdropTouch(client, pixel);
    await dispatchTouchSwipe(client, pixel, {
      x: 390, y: 420, endX: 406, endY: 421, steps: 2, delayMs: 90, releaseDelayMs: 80,
    });
    const heldFlickClosed = await waitForCleanDrawerCancel(client, pixel, "slow far-edge pull did not settle closed");
    await evaluate(client, pixel, `(() => {
      window.__qqHeldFlickProbe?.abort();
      window.__qqHeldFlickProbe = new AbortController();
      window.__qqHeldFlickMoves = [];
      document.addEventListener("touchmove", (event) => {
        window.__qqHeldFlickMoves.push({
          x: event.touches[0]?.clientX,
          at: performance.now(),
          right: document.querySelector("#project-drawer")?.getBoundingClientRect().right,
          active: document.body.classList.contains("drawer-drag-active"),
        });
      }, { signal: window.__qqHeldFlickProbe.signal });
      return true;
    })()`);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoints(378, 420) }, pixel.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 300));
    for (const [index, x] of [395, 411].entries()) {
      const deliveredMove = index === 0 && evaluate(client, pixel, `new Promise((resolve) => {
        document.addEventListener("touchmove", (event) => resolve(event.touches[0]?.clientX), { capture: true, once: true });
      })`);
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchPoints(x, 421) }, pixel.sessionId);
      if (deliveredMove) assert.equal(await deliveredMove, x, `held far-edge flick move to ${x}px was not delivered`);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, pixel.sessionId);
    const heldFlickMoves = await evaluate(client, pixel, `(() => {
      window.__qqHeldFlickProbe?.abort();
      return window.__qqHeldFlickMoves;
    })()`);
    const heldFlickPull = heldFlickMoves.at(-1);
    assert.equal(heldFlickPull.active, true, "held far-edge flick was not tracked before release");
    assert.ok(Math.abs((heldFlickPull.right - heldFlickClosed.right) - 33) <= 1.5, "held far-edge flick did not track all 33px");
    assert.deepEqual(heldFlickMoves.map((move) => move.x), [395, 411]);
    const heldFlickSpan = heldFlickMoves.at(-1).at - heldFlickMoves[0].at;
    assert.ok(heldFlickSpan <= 64, `held far-edge flick moves spanned ${heldFlickSpan}ms`);
    await waitFor(
      () => readDrawerDragState(client, pixel).then((state) => state.open && state),
      "held far-edge flick did not velocity-settle open",
    );
    await closeDrawerWithKeyboard(client, pixel);
    await openDrawerWithTouch(client, pixel, { x: 390, travel: 16, steps: 1 });
    await closeDrawerWithKeyboard(client, pixel);

    // The same rightward motion beginning on the composer remains the control's gesture.
    const controlStart = await evaluate(client, pixel, `(() => {
      const control = document.querySelector("#prompt");
      const rect = control.getBoundingClientRect();
      const x = Math.min(rect.right - 45, Math.max(rect.left + 20, rect.left + rect.width / 2));
      const y = rect.top + rect.height / 2;
      window.__qqControlTouchMoves = [];
      document.addEventListener("touchmove", (event) => {
        window.__qqControlTouchMoves.push({ prevented: event.defaultPrevented, cancelable: event.cancelable });
      });
      return { x, y, target: document.elementFromPoint(x, y)?.id };
    })()`);
    assert.equal(controlStart.target, "prompt");
    await dispatchTouchSwipe(client, pixel, {
      x: controlStart.x,
      y: controlStart.y,
      endX: controlStart.x + 40,
      endY: controlStart.y + 2,
      steps: 4,
    });
    const controlEnd = await evaluate(client, pixel, `({
      drawerOpen: document.body.classList.contains("drawer-open"),
      touchMoves: window.__qqControlTouchMoves,
    })`);
    assert.equal(controlEnd.touchMoves.some((move) => move.prevented), false, "form-control touch was manually intercepted");
    assert.equal(controlEnd.drawerOpen, false, "form-control swipe opened the drawer");

    // Closing and reopening a nested folder is an in-place state change.
    await navigate(client, pixel, `${origin}${CANONICAL_PATH}?drawer=src`);
    await waitForDrawerSurface(client, pixel, CANONICAL_PATH);
    assert.equal(await evaluate(client, pixel, `document.querySelector("#project-drawer")?.dataset.drawerPath`), "src");
    await assertDrawerHeadingFocus(client, pixel);
    await closeDrawerInPlace(client, pixel);
    const nested = await openDrawerWithTouch(client, pixel, { steps: 1 });
    assert.equal(nested.drawer, "src");
    assert.equal(await evaluate(client, pixel, `document.querySelector("#project-drawer")?.dataset.drawerPath`), "src");
    await closeDrawerInPlace(client, pixel);

    // Swipe remains the only mobile opener on an empty project surface and with reduced motion.
    await client.send("Emulation.setEmulatedMedia", {
      media: "",
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    }, pixel.sessionId);
    const emptyProjectPath = "/qq/project/empty";
    await navigate(client, pixel, `${origin}${emptyProjectPath}`);
    await waitForDrawerSurface(client, pixel, emptyProjectPath);
    assert.equal(await evaluate(client, pixel, `getComputedStyle(document.querySelector("#project-drawer")).transitionDuration`), "0s");
    const reducedClosed = await readDrawerDragState(client, pixel);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchPoints(360, 300) }, pixel.sessionId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchPoints(400, 301) }, pixel.sessionId);
    const reducedPull = await readDrawerDragState(client, pixel);
    assert.equal(reducedPull.active, true, "reduced motion disabled direct finger tracking");
    assert.ok(Math.abs((reducedPull.right - reducedClosed.right) - 40) <= 1.5, "reduced-motion drawer did not follow the finger");
    assert.equal(reducedPull.drawerHidden, "true");
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, pixel.sessionId);
    await waitFor(
      () => readDrawerDragState(client, pixel).then((state) => state.open && state),
      "reduced-motion release did not velocity-settle open",
    );
    await closeDrawerInPlace(client, pixel);

    const shots = join(tmpdir(), "qq-t-129-document-viewer");
    await mkdir(shots, { recursive: true });

    // Dedicated file route is the full-viewport reader: native vertical scroll,
    // visual-line wrapping, and no drawer swipe arbitration.
    const filePath = "/qq/project/proof/file/README.md";
    await navigate(client, pixel, `${origin}${filePath}`);
    await waitForDocumentViewer(client, pixel, filePath);
    const fileLayout = await evaluate(client, pixel, `(() => {
      const viewer = document.querySelector("#project-file-viewer");
      const rect = viewer.getBoundingClientRect();
      const target = document.elementFromPoint(206, 760);
      window.__qqVerticalPointerEvents = [];
      window.__qqVerticalTouchMoves = [];
      for (const name of ["pointerdown", "pointermove", "pointercancel", "pointerup"]) {
        viewer.addEventListener(name, () => window.__qqVerticalPointerEvents.push(name));
      }
      document.addEventListener("touchmove", (event) => {
        window.__qqVerticalTouchMoves.push({ prevented: event.defaultPrevented, cancelable: event.cancelable });
      });
      return {
        width: rect.width,
        height: rect.height,
        background: getComputedStyle(viewer).backgroundColor,
        hasDrawer: Boolean(document.querySelector("#project-drawer")),
        targetInViewer: viewer.contains(target),
        overflowX: getComputedStyle(viewer).overflowX,
        overflowY: getComputedStyle(viewer).overflowY,
        scrollable: viewer.scrollHeight > viewer.clientHeight,
        wraps: viewer.scrollWidth <= viewer.clientWidth + 1,
      };
    })()`);
    assert.equal(fileLayout.hasDrawer, false, "file route kept the project drawer");
    assert.ok(fileLayout.width >= 412, `file viewer width ${fileLayout.width} did not use the visual viewport`);
    assert.ok(fileLayout.height >= 915, `file viewer height ${fileLayout.height} did not use the visual viewport`);
    assert.equal(fileLayout.background, "rgb(0, 0, 0)");
    assert.equal(fileLayout.overflowX, "hidden");
    assert.equal(fileLayout.overflowY, "auto");
    assert.equal(fileLayout.scrollable, true);
    assert.equal(fileLayout.wraps, true);
    assert.equal(fileLayout.targetInViewer, true);
    await captureViewport(client, pixel, join(shots, "file-markdown-412.png"));
    await dispatchTouchSwipe(client, pixel, { x: 206, y: 760, endX: 208, endY: 220, steps: 8 });
    const vertical = await waitFor(
      () => evaluate(client, pixel, `({
        pointerEvents: window.__qqVerticalPointerEvents,
        touchMoves: window.__qqVerticalTouchMoves,
        drawerOpen: document.body.classList.contains("drawer-open"),
      })`).then((state) => state?.pointerEvents.includes("pointercancel") && state),
      "vertical file touch was not yielded to the browser",
    );
    assert.equal(vertical.touchMoves.some((move) => move.prevented), false, "vertical scrolling was manually intercepted");
    assert.equal(vertical.drawerOpen, false, "file-page swipe opened a drawer");
    await dispatchTouchSwipe(client, pixel, { x: 206, y: 420, endX: 360, endY: 421, steps: 4 });
    assert.equal(await evaluate(client, pixel, `document.body.classList.contains("drawer-open")`), false);

    const codePath = "/qq/project/proof/file/src%2Ffixture.js";
    await navigate(client, pixel, `${origin}${codePath}`);
    await waitForDocumentViewer(client, pixel, codePath);
    const codeWrap = await evaluate(client, pixel, `(() => {
      const code = document.querySelector(".document-code");
      const viewer = document.querySelector("#project-file-viewer");
      const style = getComputedStyle(code);
      return {
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
        wraps: code.scrollWidth <= code.clientWidth + 1,
        viewerWraps: viewer.scrollWidth <= viewer.clientWidth + 1,
        highlighted: Boolean(code.querySelector(".hljs-keyword, .hljs-string")),
      };
    })()`);
    assert.match(codeWrap.whiteSpace, /pre-wrap/);
    assert.equal(codeWrap.wraps, true, "highlighted code required horizontal panning");
    assert.equal(codeWrap.viewerWraps, true);
    assert.equal(codeWrap.highlighted, true);
    const selected = await evaluate(client, pixel, `(() => {
      const code = document.querySelector(".document-code");
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return { text: selection.toString(), userSelect: getComputedStyle(code).userSelect };
    })()`);
    assert.ok(selected.text.includes("wide-code-proof-"), "code could not be selected for copy");
    assert.match(selected.userSelect, /text|auto/);
    await captureViewport(client, pixel, join(shots, "file-code-412.png"));

    const proofPath = "/qq/__document-viewer-proof";
    await navigate(client, pixel, `${origin}${proofPath}`);
    await waitForDocumentViewer(client, pixel, proofPath);
    const accidental = await evaluate(client, pixel, `(() => {
      const preview = document.querySelector('[data-proof-kind="yaml"] .document-viewer-proof-preview');
      preview.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      return {
        open: Boolean(document.querySelector(".document-viewer-dialog[open]")),
        trigger: document.querySelector('[data-proof-kind="yaml"] [data-document-viewer-open]')?.textContent ?? "",
      };
    })()`);
    assert.equal(accidental.open, false, "tapping the preview opened the viewer");
    assert.equal(accidental.trigger, "Open full screen");
    await dispatchTouchSwipe(client, pixel, { x: 206, y: 280, endX: 210, endY: 120, steps: 6 });
    assert.equal(await evaluate(client, pixel, `Boolean(document.querySelector(".document-viewer-dialog[open]"))`), false, "dragging the preview opened the viewer");

    const opened = await evaluate(client, pixel, `(() => {
      const page = document.querySelector(".document-viewer-proof");
      page.scrollTop = 80;
      const trigger = document.querySelector('[data-proof-kind="terminal"] [data-document-viewer-open]');
      trigger.focus({ preventScroll: true });
      trigger.click();
      const dialog = document.querySelector("#proof-terminal");
      const output = dialog.querySelector(".document-pre");
      dialog.scrollTop = Math.min(120, dialog.scrollHeight - dialog.clientHeight);
      return {
        open: dialog.open,
        modal: dialog.getAttribute("aria-modal"),
        inertBackground: document.querySelector(".document-viewer-proof")?.inert === true,
        wraps: output.scrollWidth <= output.clientWidth + 1,
        viewerWraps: dialog.scrollWidth <= dialog.clientWidth + 1,
        pageScroll: page.scrollTop,
        dialogScroll: dialog.scrollTop,
        scrollable: dialog.scrollHeight > dialog.clientHeight,
      };
    })()`);
    assert.equal(opened.open, true);
    assert.equal(opened.modal, "true");
    assert.equal(opened.inertBackground, true);
    assert.equal(opened.wraps, true, "terminal output required horizontal panning");
    assert.equal(opened.viewerWraps, true);
    assert.equal(opened.scrollable, true);
    assert.equal(opened.pageScroll, 80);
    assert.ok(opened.dialogScroll > 0, "complete terminal output was not inspectable");
    await captureViewport(client, pixel, join(shots, "proof-terminal-open-412.png"));
    await dispatchKey(client, pixel, "Escape", "Escape", 27);
    const closed = await waitFor(
      () => evaluate(client, pixel, `(() => {
        const dialog = document.querySelector("#proof-terminal");
        const trigger = document.querySelector('[data-proof-kind="terminal"] [data-document-viewer-open]');
        const page = document.querySelector(".document-viewer-proof");
        if (dialog.open || document.activeElement !== trigger || page.scrollTop !== 80) return null;
        return {
          pageScroll: page.scrollTop,
          focused: true,
          inertBackground: page.inert === true,
        };
      })()`),
      "closing the viewer did not restore the opener",
    );
    assert.equal(closed.pageScroll, 80, "closing the viewer moved the underlying page");
    assert.equal(closed.focused, true, "closing the viewer did not restore focus");
    assert.equal(closed.inertBackground, false);

    await evaluate(client, pixel, `document.querySelector('[data-proof-kind="yaml"] [data-document-viewer-open]').click()`);
    const yaml = await waitFor(
      () => evaluate(client, pixel, `(() => {
        const dialog = document.querySelector("#proof-yaml");
        const code = dialog?.querySelector(".document-code");
        if (!dialog?.open || !code) return null;
        return {
          wraps: code.scrollWidth <= code.clientWidth + 1,
          highlighted: Boolean(code.querySelector("[class^=hljs-]")),
        };
      })()`),
      "YAML viewer did not open",
    );
    assert.equal(yaml.wraps, true, "YAML required horizontal panning");
    assert.equal(yaml.highlighted, true);
    await captureViewport(client, pixel, join(shots, "proof-yaml-412.png"));
    await evaluate(client, pixel, `document.querySelector("#proof-yaml [data-document-viewer-close]").click()`);
    await waitFor(
      () => evaluate(client, pixel, `!document.querySelector("#proof-yaml")?.open`),
      "YAML viewer did not close",
    );

    for (const kind of ["line", "diff", "terminal", "error"]) {
      await evaluate(client, pixel, `document.querySelector('[data-proof-kind="${kind}"] [data-document-viewer-open]').click()`);
      const proof = await waitFor(
        () => evaluate(client, pixel, `(() => {
          const dialog = document.querySelector("#proof-${kind}");
          if (!dialog?.open) return null;
          const surface = dialog.querySelector(".document-code, .document-pre, .document-state");
          return {
            wraps: dialog.scrollWidth <= dialog.clientWidth + 1,
            surfaceWraps: !surface || surface.scrollWidth <= surface.clientWidth + 1,
            kind: dialog.querySelector(".document-viewer-content")?.dataset.contentKind ?? "",
          };
        })()`),
        `proof ${kind} did not open`,
      );
      assert.equal(proof.wraps, true, `${kind} viewer panned horizontally`);
      assert.equal(proof.surfaceWraps, true, `${kind} content panned horizontally`);
      await captureViewport(client, pixel, join(shots, `proof-${kind}-412.png`));
      await evaluate(client, pixel, `document.querySelector("#proof-${kind} [data-document-viewer-close]").click()`);
      await waitFor(
        () => evaluate(client, pixel, `!document.querySelector("#proof-${kind}")?.open`),
        `proof ${kind} did not close`,
      );
    }

    const narrow = await createPage(client, { mobile: true, width: 320, height: 568, deviceScaleFactor: 2 });
    await navigate(client, narrow, `${origin}${proofPath}`);
    await waitForDocumentViewer(client, narrow, proofPath);
    await evaluate(client, narrow, `document.querySelector('[data-proof-kind="line"] [data-document-viewer-open]').click()`);
    const narrowLine = await waitFor(
      () => evaluate(client, narrow, `(() => {
        const dialog = document.querySelector("#proof-line");
        const pre = dialog?.querySelector(".document-pre");
        if (!dialog?.open || !pre) return null;
        const rect = dialog.getBoundingClientRect();
        return {
          width: rect.width,
          wraps: pre.scrollWidth <= pre.clientWidth + 1,
          viewerWraps: dialog.scrollWidth <= dialog.clientWidth + 1,
        };
      })()`),
      "320px long-line viewer did not open",
    );
    assert.ok(narrowLine.width >= 320, `320px viewer width ${narrowLine.width}`);
    assert.equal(narrowLine.wraps, true, "320px long line required horizontal panning");
    assert.equal(narrowLine.viewerWraps, true);
    await captureViewport(client, narrow, join(shots, "proof-line-320.png"));

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 800,
      screenWidth: 1280,
      screenHeight: 800,
      deviceScaleFactor: 1,
      mobile: false,
    }, desktop.sessionId);
    await navigate(client, desktop, `${origin}${filePath}`);
    await waitForDocumentViewer(client, desktop, filePath);
    const desktopFile = await evaluate(client, desktop, `(() => {
      const viewer = document.querySelector("#project-file-viewer");
      const rect = viewer.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        hasCard: Boolean(document.querySelector(".file-surface, .session-panel")),
        background: getComputedStyle(viewer).backgroundColor,
      };
    })()`);
    assert.ok(desktopFile.width >= 1280, `desktop viewer width ${desktopFile.width} was not the visual viewport`);
    assert.ok(desktopFile.height >= 800, `desktop viewer height ${desktopFile.height} was not the visual viewport`);
    assert.equal(desktopFile.hasCard, false);
    assert.equal(desktopFile.background, "rgb(0, 0, 0)");
    await captureViewport(client, desktop, join(shots, "file-markdown-1280.png"));
    await navigate(client, desktop, `${origin}${proofPath}`);
    await waitForDocumentViewer(client, desktop, proofPath);
    await evaluate(client, desktop, `document.querySelector('[data-proof-kind="diff"] [data-document-viewer-open]').click()`);
    await waitFor(
      () => evaluate(client, desktop, `document.querySelector("#proof-diff")?.open`),
      "desktop diff viewer did not open",
    );
    await captureViewport(client, desktop, join(shots, "proof-diff-1280.png"));

    assert.ok(requests.filter((path) => path === "/qq/").length >= 7, "controlled installed start URL was not repeatedly fetched");
    assert.ok(requests.filter((path) => path === "/qq/sw-v10.js").length >= 2, "legacy worker URL was not checked for migration");
  } finally {
    consoleHandler.dispose?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    chrome?.client.close();
    if (chrome?.child.exitCode === null) {
      chrome.child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5_000);
        chrome.child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
