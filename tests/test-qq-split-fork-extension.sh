#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC2034
TEST_NAME="test-qq-split-fork-extension"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
EXTENSION="$ROOT/extensions/qq-split-fork.ts"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v node >/dev/null 2>&1 || fail 'node is required to test the Pi extension'

module="$TMP/qq-split-fork.mjs"
cp -- "$EXTENSION" "$module"

if ! node --input-type=module - "$module" "$TMP" <<'JS'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, tempRoot] = process.argv.slice(2);
const { default: register } = await import(pathToFileURL(modulePath));
const sourceHeader = {
  type: "session",
  version: 7,
  id: "source-session",
  timestamp: "2026-07-21T00:00:00.000Z",
  cwd: "/source/cwd",
};
const branchEntries = [
  { type: "message", id: "message-1", role: "user", content: "first" },
  { type: "message", id: "message-2", role: "assistant", content: "second" },
];

function setLaunchEnvironment(herdr, tmux) {
  if (herdr === undefined) delete process.env.HERDR_PANE_ID;
  else process.env.HERDR_PANE_ID = herdr;
  if (tmux === undefined) delete process.env.TMUX;
  else process.env.TMUX = tmux;
}

function createHarness(name, options = {}) {
  const cwd = path.join(tempRoot, name);
  fs.mkdirSync(cwd, { recursive: true });
  const sessionFile = options.noSession
    ? undefined
    : path.join(cwd, "source.jsonl");
  if (sessionFile !== undefined) {
    fs.writeFileSync(
      sessionFile,
      [sourceHeader, ...branchEntries].map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    );
  }

  const notifications = [];
  const execCalls = [];
  let command;
  const ctx = {
    cwd,
    isIdle: () => options.idle ?? true,
    sessionManager: {
      getSessionFile: () => sessionFile,
      getBranch: () => branchEntries,
      getHeader: () => sourceHeader,
    },
    ui: {
      notify(message, level) {
        notifications.push({ message, level });
      },
    },
  };
  const pi = {
    registerCommand(name, candidate) {
      assert.equal(command, undefined, "extension registered more than one command");
      command = { name, ...candidate };
    },
  };
  const exec = async (executable, args) => {
    execCalls.push({ executable, args });
    return options.execReply?.(execCalls.length, executable, args) ?? {
      code: 0,
      stdout: "",
      stderr: "",
    };
  };

  register(pi, { exec });
  assert.equal(command?.name, "split-fork");
  assert.equal(
    command?.description,
    "Fork this session into a new pi process in a right-hand herdr split (tmux fallback). Usage: /split-fork [optional prompt — may not start with '-' or '@']",
  );
  assert.equal(typeof command?.handler, "function");
  return { command, ctx, cwd, sessionFile, notifications, execCalls };
}

function forkedFiles(harness) {
  return fs.readdirSync(harness.cwd)
    .filter((name) => name.endsWith(".jsonl") && name !== "source.jsonl")
    .map((name) => path.join(harness.cwd, name));
}

async function testHerdrLaunch() {
  setLaunchEnvironment("source-pane", undefined);
  const h = createHarness("herdr", {
    execReply(callNumber) {
      if (callNumber === 1) {
        return {
          code: 0,
          stdout: JSON.stringify({ result: { pane_id: "wM:p4A" } }),
          stderr: "",
        };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
  });
  await h.command.handler("continue the fork", h.ctx);

  const files = forkedFiles(h);
  assert.equal(files.length, 1, "herdr case did not write exactly one forked session");
  const lines = fs.readFileSync(files[0], "utf8").trimEnd().split("\n").map(JSON.parse);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].type, "session");
  assert.equal(lines[0].version, sourceHeader.version);
  assert.equal(lines[0].cwd, sourceHeader.cwd);
  assert.equal(lines[0].parentSession, h.sessionFile);
  assert.deepEqual(lines.slice(1), branchEntries);

  assert.equal(h.execCalls.length, 3);
  assert.deepEqual(h.execCalls[0], {
    executable: "herdr",
    args: [
      "pane",
      "split",
      "--current",
      "--direction",
      "right",
      "--cwd",
      h.cwd,
      "--focus",
    ],
  });
  assert.equal(h.execCalls[1].executable, "herdr");
  assert.deepEqual(h.execCalls[1].args.slice(0, 3), ["pane", "send-text", "wM:p4A"]);
  assert.match(h.execCalls[1].args[3], /--session/);
  assert.match(h.execCalls[1].args[3], /continue the fork/);
  assert.equal(
    /\s'--'\s/.test(h.execCalls[1].args[3]),
    false,
    "startup input carried the unsupported quoted '--' sentinel",
  );
  assert.equal(h.execCalls[1].args[3].endsWith("\n"), true, "herdr startup input lacked newline");
  assert.deepEqual(h.execCalls[2], {
    executable: "herdr",
    args: ["pane", "send-keys", "wM:p4A", "Enter"],
  });
  assert.ok(
    h.notifications.some(({ message, level }) =>
      level === "info" && message.includes(path.basename(files[0])) && message.includes("wM:p4A")
    ),
    "herdr success notice did not name the forked file and pane",
  );
}

async function testTmuxLaunch() {
  setLaunchEnvironment(undefined, "/tmp/tmux-socket");
  const h = createHarness("tmux");
  await h.command.handler("", h.ctx);

  const files = forkedFiles(h);
  assert.equal(files.length, 1, "tmux case did not write exactly one forked session");
  assert.equal(h.execCalls.length, 1);
  assert.equal(h.execCalls[0].executable, "tmux");
  assert.deepEqual(h.execCalls[0].args.slice(0, 4), ["split-window", "-h", "-c", h.cwd]);
  assert.match(h.execCalls[0].args[4], /--session/);
  assert.equal(h.execCalls[0].args[4].endsWith("\n"), false, "tmux command retained startup newline");
  assert.ok(h.notifications.some(({ level }) => level === "info"));
}

async function testTmuxLaunchFailure() {
  setLaunchEnvironment(undefined, "/tmp/tmux-socket");
  const h = createHarness("tmux-failure", {
    execReply: () => ({ code: 1, stdout: "", stderr: "can't create pane" }),
  });
  await h.command.handler("", h.ctx);

  assert.equal(h.execCalls.length, 1);
  assert.equal(h.execCalls[0].executable, "tmux");
  assert.ok(
    h.notifications.some(({ message, level }) =>
      level === "error" && message.includes("can't create pane") && message.includes("--session")
    ),
    "tmux failure did not surface the error and the manual command",
  );
  assert.ok(
    !h.notifications.some(({ level }) => level === "info"),
    "tmux failure falsely notified success",
  );
}

async function testManualFallback() {
  setLaunchEnvironment(undefined, undefined);
  const h = createHarness("manual");
  await h.command.handler("", h.ctx);

  const files = forkedFiles(h);
  assert.equal(files.length, 1, "manual case did not write exactly one forked session");
  assert.equal(h.execCalls.length, 0);
  assert.ok(
    h.notifications.some(({ message, level }) =>
      level === "warning" && message.includes(files[0]) && message.includes("--session")
    ),
    "manual fallback warning did not name the forked session and command",
  );
}

async function testMissingSession() {
  setLaunchEnvironment("source-pane", "/tmp/tmux-socket");
  const h = createHarness("missing", { noSession: true });
  await h.command.handler("", h.ctx);

  assert.equal(h.execCalls.length, 0);
  assert.deepEqual(fs.readdirSync(h.cwd), [], "missing-session case wrote a file");
  assert.ok(
    h.notifications.some(({ level, message }) =>
      level === "warning" && message.includes("no persisted session file")
    ),
    "missing-session case did not warn",
  );
}

async function testPrefixedPromptRefused() {
  setLaunchEnvironment("source-pane", undefined);
  const h = createHarness("prefixed");
  await h.command.handler("- continue from here", h.ctx);

  assert.equal(h.execCalls.length, 0, "prefixed prompt still launched");
  assert.equal(forkedFiles(h).length, 0, "prefixed prompt wrote a fork file");
  assert.ok(
    h.notifications.some(({ message, level }) =>
      level === "error" && message.includes("starting with '-' or '@'")
    ),
    "prefixed prompt did not refuse with a clear error",
  );
}

await testHerdrLaunch();
await testTmuxLaunch();
await testTmuxLaunchFailure();
await testManualFallback();
await testMissingSession();
await testPrefixedPromptRefused();
setLaunchEnvironment(undefined, undefined);

console.log("test-qq-split-fork-extension: pass");
JS
then
  fail 'Pi split-fork extension node suite failed'
fi
