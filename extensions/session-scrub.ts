// @ts-nocheck
// Durable session-transcript scrubbing for sensitive qq runs.
//
// Mechanism: a run that must leave no transcript calls the
// `mark_session_for_scrub` tool. The marker records the current session file.
// When the operator starts a new session (`/new`), pi fires `session_start`
// with reason "new" and the previous session file — now final, no live
// writer. If the marker matches exactly, the transcript is durably shredded
// (overwrite with random data, overwrite with zeros, fsync, unlink), verified,
// recorded in a content-free ledger, and the marker is cleared.
//
// Safety: only the previous (final) session file is ever touched; the current
// session file is refused; the target must be a regular non-symlink file owned
// by the current user and located under the pi sessions root; markers are
// path-matched so a stale marker can never scrub an unrelated session.

import { lstat, mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";

const TOOL_NAME = "mark_session_for_scrub";
const TOOL_LABEL = "Mark Session for Scrub";
const TOOL_DESCRIPTION =
  "Mark the current session transcript for durable shredding when the session " +
  "ends via `/new`. Use for runs whose records must not survive (the operator " +
  "directs this, or the active workflow template instructs it). At the next " +
  "`/new`, the transcript is overwritten and deleted; a content-free ledger " +
  "entry records that the scrub happened.";

function stateRoot(deps = {}) {
  if (deps.stateRoot) return deps.stateRoot;
  const xdg = process.env.XDG_STATE_HOME;
  const base = xdg && xdg.trim() !== "" ? resolve(xdg) : join(homedir(), ".local", "state");
  return join(base, "qq", "scrub");
}

function sessionsRoot(deps = {}) {
  return deps.sessionsRoot ?? join(homedir(), ".pi", "agent", "sessions");
}

function markerFile(root) {
  return join(root, "marker.json");
}

function ledgerFile(root) {
  return join(root, "ledger.jsonl");
}

function isUnder(root, target) {
  const base = resolve(root);
  const resolved = resolve(target);
  return resolved === base || resolved.startsWith(`${base}${sep}`);
}

async function existsSafe(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function writeMarker(root, sessionFile, sessionId) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const payload = {
    sessionFile: resolve(sessionFile),
    sessionId: typeof sessionId === "string" ? sessionId : "",
    createdAt: new Date().toISOString(),
    mode: "full",
  };
  await writeFile(markerFile(root), `${JSON.stringify(payload)}\n`, { mode: 0o600, flag: "w" });
}

async function readMarker(root) {
  const path = markerFile(root);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  try {
    const value = JSON.parse(raw);
    if (
      value === null || typeof value !== "object" ||
      typeof value.sessionFile !== "string" || value.sessionFile === "" ||
      !isAbsolute(value.sessionFile) ||
      value.sessionFile.includes("\n") || value.sessionFile.includes("\0")
    ) {
      await unlink(path).catch(() => {});
      return null;
    }
    return value;
  } catch {
    await unlink(path).catch(() => {});
    return null;
  }
}

async function clearMarker(root) {
  await unlink(markerFile(root)).catch(() => {});
}

async function appendLedger(root, entry) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const handle = await open(ledgerFile(root), "a", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(entry)}\n`, "utf8");
  } finally {
    await handle.close();
  }
}

async function durableShred(filePath) {
  const { size } = await stat(filePath);
  if (size > 0) {
    const handle = await open(filePath, "r+");
    try {
      const chunk = Buffer.alloc(1024 * 1024);
      const randomChunk = Buffer.alloc(1024 * 1024);
      for (let pos = 0; pos < size; pos += chunk.length) {
        const len = Math.min(chunk.length, size - pos);
        for (let i = 0; i < len; i++) randomChunk[i] = Math.floor(Math.random() * 256);
        await handle.write(randomChunk, 0, len, pos);
      }
      await handle.sync();
      for (let pos = 0; pos < size; pos += chunk.length) {
        const len = Math.min(chunk.length, size - pos);
        chunk.fill(0, 0, len);
        await handle.write(chunk, 0, len, pos);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  await unlink(filePath);
}

async function scrubSessionFile(target, sessionsRootPath, currentSessionFile) {
  const resolved = resolve(target);
  if (!isUnder(sessionsRootPath, resolved)) {
    return { ok: false, reason: "outside-sessions-root" };
  }
  if (typeof currentSessionFile === "string" && currentSessionFile !== "" &&
      resolve(currentSessionFile) === resolved) {
    return { ok: false, reason: "current-session" };
  }
  let state;
  try {
    state = await lstat(resolved);
  } catch {
    return { ok: false, reason: "missing" };
  }
  if (!state.isFile() || state.isSymbolicLink()) {
    return { ok: false, reason: "not-regular-file" };
  }
  if (state.uid !== process.getuid()) {
    return { ok: false, reason: "not-owner" };
  }
  await durableShred(resolved);
  if (await existsSafe(resolved)) {
    return { ok: false, reason: "still-present" };
  }
  return { ok: true };
}

async function handleSessionStart(event, ctx, deps) {
  if (event?.reason !== "new") return;
  const previous = event?.previousSessionFile;
  if (typeof previous !== "string" || previous === "") return;

  const root = stateRoot(deps);
  const marker = await readMarker(root);
  if (!marker) return;

  const target = resolve(previous);
  const marked = resolve(marker.sessionFile);
  if (marked !== target) {
    if (!(await existsSafe(marked))) {
      await clearMarker(root);
    }
    return;
  }

  const currentSessionFile =
    typeof ctx?.sessionManager?.getSessionFile === "function"
      ? ctx.sessionManager.getSessionFile()
      : undefined;
  const outcome = await scrubSessionFile(target, sessionsRoot(deps), currentSessionFile);
  if (outcome.ok) {
    await appendLedger(root, {
      sessionId: typeof marker.sessionId === "string" ? marker.sessionId : "",
      sessionFile: target,
      scrubbedAt: new Date().toISOString(),
      mode: "full",
    });
    await clearMarker(root);
  }
}

export default function registerSessionScrub(pi, deps = {}) {
  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: TOOL_DESCRIPTION,
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionFile =
        typeof ctx?.sessionManager?.getSessionFile === "function"
          ? ctx.sessionManager.getSessionFile()
          : undefined;
      if (typeof sessionFile !== "string" || sessionFile === "") {
        return {
          content: [{
            type: "text",
            text: `${TOOL_NAME} could not determine the current session file.`,
          }],
        };
      }
      const sessionId =
        typeof ctx?.sessionManager?.getSessionId === "function"
          ? ctx.sessionManager.getSessionId()
          : "";
      const root = stateRoot(deps);
      await writeMarker(root, sessionFile, sessionId);
      return {
        content: [{
          type: "text",
          text: `Session marked for durable scrub at the next /new: ${resolve(sessionFile)}`,
        }],
      };
    },
  });

  pi.on("session_start", (event, ctx) => handleSessionStart(event, ctx, deps));
}
