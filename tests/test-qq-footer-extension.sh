#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-footer-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-footer.ts"
AUTH_FIXTURE="$TESTS_DIR/fixtures/qq-footer-auth.json"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

module="$TMP/qq-footer.mjs"
cp -- "$EXTENSION" "$module"
printf '{}\n' >"$TMP/no-auth.json"

if ! node --input-type=module - "$module" "$AUTH_FIXTURE" "$TMP/no-auth.json" <<'JS'
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

const [modulePath, authPath, noAuthPath] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));

const kimiBody = {
  usage: { limit: "100", used: "87", remaining: "13", resetTime: "later" },
  limits: [
    {
      window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
      detail: { limit: "100", used: "14", remaining: "86", resetTime: "soon" },
    },
  ],
};

const codexBody = {
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 34,
      limit_window_seconds: 604800,
      reset_after_seconds: 433108,
    },
    secondary_window: null,
  },
};

const anthropicBody = {
  five_hour: { utilization: 50, resets_at: "soon" },
  seven_day: { utilization: 12.5, resets_at: "later" },
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

// Column-correct fake of pi-tui's visibleWidth/truncateToWidth: wide chars
// count two columns. The extension must bound every line to the supplied
// terminal columns under these semantics, not code points.
const WIDE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\uFFE0-\uFFE6]/u;
const testWidthKit = {
  visibleWidth(value) {
    let width = 0;
    for (const ch of String(value)) width += WIDE.test(ch) ? 2 : 1;
    return width;
  },
  truncateToWidth(value, width, ellipsis = "...") {
    const text = String(value);
    if (this.visibleWidth(text) <= width) return text;
    const ellipsisWidth = this.visibleWidth(ellipsis);
    if (width <= ellipsisWidth) return [...ellipsis].slice(0, width).join("");
    let out = "";
    let used = 0;
    for (const ch of text) {
      const cell = WIDE.test(ch) ? 2 : 1;
      if (used + cell > width - ellipsisWidth) break;
      used += cell;
      out += ch;
    }
    return out + ellipsis;
  },
};

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

function createHarness({
  provider,
  modelId,
  reasoning = true,
  thinkingLevel = "high",
  availableProviders = 3,
  fixture = authPath,
  fetchImpl,
  statuses = new Map(),
  oauth = provider !== "kimi-coding",
}) {
  const events = new Map();
  const commands = new Map();
  const fetches = [];
  const intervals = new Map();
  const intervalDelays = [];
  let nextInterval = 1;
  let footer;
  let footerWasCleared = false;
  let renderCount = 0;

  const tui = {
    requestRender() {
      renderCount += 1;
    },
  };
  const theme = {
    fg(color, text) {
      assert.equal(color, "dim");
      return text;
    },
  };
  const footerData = {
    getGitBranch: () => "main",
    getExtensionStatuses: () => statuses,
    getAvailableProviderCount: () => availableProviders,
    onBranchChange(callback) {
      this.branchCallback = callback;
      return () => {
        this.branchCallback = undefined;
      };
    },
  };
  const ctx = {
    cwd: `${homedir()}/projects/qq`,
    model: {
      id: modelId,
      provider,
      reasoning,
      contextWindow: 200000,
    },
    modelRegistry: {
      isUsingOAuth(model) {
        assert.equal(model.provider, provider);
        return oauth;
      },
    },
    getContextUsage: () => ({ tokens: 28400, contextWindow: 200000, percent: 14.2 }),
    sessionManager: {
      getSessionId: () => "fake-session-id",
      getBranch: () => [
        { message: { role: "assistant", usage: { cost: { total: 0.005 } } } },
        { message: { role: "assistant", usage: { cost: { total: 0.007 } } } },
        { message: { role: "assistant", usage: { cost: { total: "not-a-number" } } } },
        { message: { role: "assistant", usage: {} } },
        { message: { role: "user", usage: { cost: { total: 99 } } } },
        { message: null },
      ],
    },
    ui: {
      setFooter(factory) {
        if (factory === undefined) {
          footerWasCleared = true;
          footer = undefined;
          return;
        }
        footer = factory(tui, theme, footerData);
      },
    },
  };
  const pi = {
    on(name, handler) {
      events.set(name, handler);
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
    getSessionName: () => "named",
    getThinkingLevel: () => thinkingLevel,
  };

  register(pi, {
    authPath: fixture,
    widthKit: testWidthKit,
    fetch: async (url, options) => {
      fetches.push({ url, options });
      return fetchImpl(url, options, fetches.length);
    },
    setInterval(callback, delay) {
      const id = nextInterval++;
      intervals.set(id, callback);
      intervalDelays.push(delay);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback, delay) {
      return { callback, delay };
    },
    clearTimeout() {},
  });

  return {
    events,
    commands,
    fetches,
    intervalDelays,
    intervals,
    ctx,
    footerData,
    render: (width = 120) => footer.render(width),
    get footer() {
      return footer;
    },
    get renderCount() {
      return renderCount;
    },
    get footerWasCleared() {
      return footerWasCleared;
    },
  };
}

const statuses = new Map([
  ["zeta", "z-status\nokay"],
  ["pi-lens-lsp", "LSP"],
  ["hunk", "hunk idle"],
  ["merge-ready", "merge ready"],
  ["alpha", "a-status"],
]);
const kimi = createHarness({
  provider: "kimi-coding",
  modelId: "kimi-k2",
  statuses,
  oauth: false,
  fetchImpl: async (_url, _options, callCount) => {
    if (callCount === 1) return jsonResponse(kimiBody);
    if (callCount === 2) throw new Error("synthetic transport failure");
    if (callCount === 3) return jsonResponse({}, 500);
    if (callCount === 4) return jsonResponse(kimiBody);
    return jsonResponse({}, 401);
  },
});
assert.equal(typeof kimi.events.get("session_start"), "function");
assert.equal(typeof kimi.events.get("session_shutdown"), "function");
assert.equal(typeof kimi.commands.get("qq-footer-refresh")?.handler, "function");
await kimi.events.get("session_start")({ type: "session_start" }, kimi.ctx);
await waitFor(() => kimi.renderCount > 0, "Kimi quota fetch did not repaint");
assert.deepEqual(kimi.intervalDelays, [300000]);
assert.equal(kimi.fetches.length, 1);
assert.equal(kimi.fetches[0].url, "https://api.kimi.com/coding/v1/usages");
assert.equal(kimi.fetches[0].options.method, "GET");
assert.match(kimi.fetches[0].options.headers.Authorization, /^Bearer test-kimi-/);
assert.equal(kimi.fetches[0].options.headers.Accept, "application/json");

const kimiLines = kimi.render();
assert.equal(kimiLines.length, 2);
assert.equal(
  kimiLines[0],
  "~/projects/qq (main) • named • a-status z-status okay",
  "line 1 did not collapse home, include session/statuses, and filter the blocklist",
);
assert.ok(!kimiLines[0].includes("LSP"));
assert.ok(!kimiLines[0].includes("hunk"));
assert.ok(!kimiLines[0].includes("merge ready"));
assert.ok(kimiLines[1].includes("14.2%/200k • $0.012 (sub)"));
assert.ok(kimiLines[1].includes("K ▓░░░░░░░ 5h · ▓▓▓▓▓▓▓░ wk"));
assert.ok(kimiLines[1].endsWith("(kimi-coding) kimi-k2 • high"));
assert.equal([...kimiLines[1]].length, 120, "model was not right-aligned");
assert.doesNotMatch(kimiLines[1], /↑|↓|(?:^| )R\d|(?:^| )W\d|CH\d/);
assert.doesNotMatch(kimiLines.join("\n"), /\x1b\[/);
assert.doesNotThrow(() => kimi.render(600000000), "render threw at huge width");
assert.doesNotThrow(() => kimi.render(Number.NaN), "render threw at NaN width");
assert.doesNotThrow(() => kimi.render(-5), "render threw at negative width");

await kimi.commands.get("qq-footer-refresh").handler("", kimi.ctx);
assert.equal(kimi.fetches.length, 2, "refresh command did not force a fetch");
assert.ok(
  kimi.render()[1].includes("K ▓░░░░░░░ 5h · ▓▓▓▓▓▓▓░ wk"),
  "transport failure discarded the last-good quota cache",
);
await kimi.commands.get("qq-footer-refresh").handler("", kimi.ctx);
assert.equal(kimi.fetches.length, 3);
assert.ok(!kimi.render()[1].includes(" • K "), "HTTP 500 kept stale quota visible");
await kimi.commands.get("qq-footer-refresh").handler("", kimi.ctx);
assert.equal(kimi.fetches.length, 4);
assert.ok(
  kimi.render()[1].includes("K ▓░░░░░░░ 5h · ▓▓▓▓▓▓▓░ wk"),
  "recovery after HTTP 500 did not restore quota",
);
await kimi.commands.get("qq-footer-refresh").handler("", kimi.ctx);
assert.equal(kimi.fetches.length, 5);
assert.ok(!kimi.render()[1].includes(" • K "), "HTTP 401 kept stale quota visible");
kimi.events.get("session_shutdown")({ type: "session_shutdown" }, kimi.ctx);
assert.equal(kimi.intervals.size, 0, "session shutdown did not clear polling");
assert.equal(kimi.footerWasCleared, true, "session shutdown did not restore the built-in footer");

const codex = createHarness({
  provider: "openai-codex",
  modelId: "gpt-5.6-codex",
  thinkingLevel: "off",
  availableProviders: 1,
  fetchImpl: async () => jsonResponse(codexBody),
});
await codex.events.get("session_start")({ type: "session_start" }, codex.ctx);
await waitFor(() => codex.renderCount > 0, "Codex quota fetch did not repaint");
const codexLine = codex.render()[1];
assert.equal(codex.fetches[0].url, "https://chatgpt.com/backend-api/wham/usage");
assert.match(codex.fetches[0].options.headers.Authorization, /^Bearer test-codex-/);
assert.equal(codex.fetches[0].options.headers["ChatGPT-Account-Id"], "test-account");
assert.ok(codexLine.includes("CX ▓▓▓░░░░░ wk"), "34% did not round to three filled cells");
assert.ok(!codexLine.includes(" · "), "null Codex secondary window was not skipped");
assert.ok(codexLine.endsWith("gpt-5.6-codex • thinking off"));
assert.ok(!codexLine.includes("(openai-codex)"), "single-provider prefix was not omitted");

const noAuth = createHarness({
  provider: "anthropic",
  modelId: "claude-test",
  fixture: noAuthPath,
  fetchImpl: async () => assert.fail("provider without auth attempted a fetch"),
});
await noAuth.events.get("session_start")({ type: "session_start" }, noAuth.ctx);
await waitFor(() => noAuth.renderCount > 0, "missing-auth poll did not settle");
assert.equal(noAuth.fetches.length, 0);
assert.ok(!noAuth.render()[1].includes(" • A "), "provider without auth rendered quota");

const failed = createHarness({
  provider: "kimi-coding",
  modelId: "kimi-k2",
  fetchImpl: async () => {
    throw new Error("synthetic network failure");
  },
});
await failed.events.get("session_start")({ type: "session_start" }, failed.ctx);
await waitFor(() => failed.fetches.length === 1, "failing fetch was not attempted");
await new Promise((resolve) => setImmediate(resolve));
assert.ok(!failed.render()[1].includes(" • K "), "fetch failure rendered fake quota");

const anthropic = createHarness({
  provider: "anthropic",
  modelId: "claude-test",
  fetchImpl: async () => jsonResponse(anthropicBody),
});
await anthropic.events.get("session_start")({ type: "session_start" }, anthropic.ctx);
await waitFor(() => anthropic.renderCount > 0, "Anthropic quota fetch did not repaint");
const anthropicLine = anthropic.render()[1];
assert.equal(anthropic.fetches[0].url, "https://api.anthropic.com/api/oauth/usage");
assert.equal(anthropic.fetches[0].options.headers["anthropic-beta"], "oauth-2025-04-20");
assert.ok(anthropicLine.includes("A ▓▓▓▓░░░░ 5h · ▓░░░░░░░ wk"));

const compacted = createHarness({
  provider: "unsupported-provider",
  modelId: "plain-model",
  reasoning: false,
  availableProviders: undefined,
  fixture: noAuthPath,
  fetchImpl: async () => assert.fail("unsupported provider attempted a fetch"),
});
compacted.ctx.getContextUsage = () => ({ tokens: 0, contextWindow: 200000, percent: null });
await compacted.events.get("session_start")({ type: "session_start" }, compacted.ctx);
assert.ok(compacted.render()[1].includes("?/200k • $0.012 (sub)"));
assert.ok(compacted.render()[1].endsWith("(unsupported-provider) plain-model"));

const cjk = createHarness({
  provider: "kimi-coding",
  modelId: "模型",
  fetchImpl: async () => jsonResponse(kimiBody),
});
await cjk.events.get("session_start")({ type: "session_start" }, cjk.ctx);
await waitFor(() => cjk.renderCount > 0, "CJK model fetch did not repaint");
for (const width of [0, 5, 18, 20, 24, 30, 120]) {
  for (const line of cjk.render(width)) {
    assert.ok(
      testWidthKit.visibleWidth(line) <= width,
      `line exceeded ${width} terminal columns: ${JSON.stringify(line)}`,
    );
  }
}

console.log("test-qq-footer-extension: pass");
JS
then
  fail 'Pi footer extension node suite failed'
fi
