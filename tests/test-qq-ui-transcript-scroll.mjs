#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const browserJs = readFileSync(join(root, "qq-ui/assets/browser-v8.js"), "utf8");

class ClassList {
  constructor() {
    this.names = new Set();
  }
  add(...names) {
    for (const name of names) this.names.add(name);
  }
  remove(...names) {
    for (const name of names) this.names.delete(name);
  }
  contains(name) {
    return this.names.has(name);
  }
}

class HTMLElement {
  constructor(id = "") {
    this.id = id;
    this.tagName = "DIV";
    this.dataset = {};
    this.classList = new ClassList();
    this.hidden = false;
    this.inert = false;
  }
}

class HTMLTextAreaElement extends HTMLElement {}
class HTMLFormElement extends HTMLElement {}
class HTMLSelectElement extends HTMLElement {}
class HTMLDetailsElement extends HTMLElement {}

class Transcript extends HTMLElement {
  constructor(scrollHeight, clientHeight = 300) {
    super("transcript");
    this.scrollHeight = scrollHeight;
    this.clientHeight = clientHeight;
    this.top = 0;
  }
  get scrollTop() {
    return this.top;
  }
  set scrollTop(value) {
    this.top = Math.max(0, Math.min(Number(value), this.scrollHeight - this.clientHeight));
  }
}

function createHarness(initialHeight = 1_000) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const frames = [];
  const panel = new HTMLElement("session-panel");
  let transcript = new Transcript(initialHeight);

  const addListener = (listeners, type, callback) => {
    const callbacks = listeners.get(type) ?? [];
    callbacks.push(callback);
    listeners.set(type, callbacks);
  };
  const dispatch = (listeners, type, event = {}) => {
    event.type = type;
    for (const callback of listeners.get(type) ?? []) callback(event);
  };

  const document = {
    currentScript: { dataset: {} },
    readyState: "loading",
    activeElement: null,
    body: {
      children: [],
      classList: new ClassList(),
    },
    querySelector(selector) {
      if (selector === "#transcript") return transcript;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type, callback) {
      addListener(documentListeners, type, callback);
    },
    dispatchEvent(event) {
      dispatch(documentListeners, event.type, event);
    },
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener(type, callback) {
      addListener(windowListeners, type, callback);
    },
  };
  const sandbox = {
    console,
    document,
    window,
    navigator: {},
    location: {
      href: "https://qq.test/qq/session/session-63a11000-0000-4000-8000-000000000001",
      pathname: "/qq/session/session-63a11000-0000-4000-8000-000000000001",
      assign() {},
    },
    history: { state: null, replaceState() {} },
    URL,
    CustomEvent: class {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    HTMLElement,
    HTMLTextAreaElement,
    HTMLFormElement,
    HTMLSelectElement,
    HTMLDetailsElement,
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(browserJs, sandbox, { filename: "browser-v8.js" });

  const flushFrames = () => {
    while (frames.length > 0) frames.shift()();
  };
  const dispatchDocument = (type, event = {}) => dispatch(documentListeners, type, event);
  const settleInitialPage = () => {
    dispatchDocument("DOMContentLoaded", { target: document });
    flushFrames();
    dispatch(windowListeners, "load", { target: window });
    flushFrames();
  };
  const streamSwap = (height) => {
    dispatchDocument("htmx:sseBeforeMessage", { target: panel, detail: { target: panel } });
    dispatchDocument("htmx:beforeSwap", { target: panel, detail: { target: panel } });
    transcript = new Transcript(height);
    dispatchDocument("htmx:afterSwap", { target: panel, detail: { target: panel } });
    dispatchDocument("htmx:sseMessage", { target: panel, detail: { target: panel } });
    dispatchDocument("htmx:afterSettle", { target: panel, detail: { target: panel } });
    flushFrames();
  };
  const userScroll = (top) => {
    transcript.scrollTop = top;
    dispatchDocument("scroll", { target: transcript });
  };

  return {
    settleInitialPage,
    streamSwap,
    userScroll,
    get transcript() { return transcript; },
  };
}

const harness = createHarness();
harness.settleInitialPage();
assert.equal(harness.transcript.scrollTop, 700, "a newly opened session starts at the latest content");

harness.streamSwap(1_040);
assert.equal(harness.transcript.scrollTop, 740, "a followed stream stays at the bottom");
harness.streamSwap(1_080);
assert.equal(harness.transcript.scrollTop, 780, "consecutive updates remain followed");

harness.userScroll(260);
harness.streamSwap(1_120);
assert.equal(harness.transcript.scrollTop, 260, "scrolling away preserves the reading position");
harness.streamSwap(1_160);
assert.equal(harness.transcript.scrollTop, 260, "a second update preserves the same reading position");

harness.userScroll(harness.transcript.scrollHeight);
harness.streamSwap(1_200);
assert.equal(harness.transcript.scrollTop, 900, "returning to the bottom re-engages follow mode");

console.log("qq-ui transcript scroll tests passed");
