// @ts-nocheck
// Session-scoped pane privacy marks for qq-dictation.

import {
  chmod,
  lstat,
  mkdir,
  open,
  rename,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const TOOL_NAME = "mark_session_dictation_private";
const TOOL_LABEL = "Mark Session Dictation Private";
const TOOL_DESCRIPTION =
  "Mark, unmark, or report the current qq session's dictation privacy. Call " +
  "mark_session_dictation_private with action `mark` when the operator uses " +
  "their privacy keyword or asks to make dictation into this session private " +
  "and local-only, following the existing mark_session_for_scrub mental model. " +
  "The mark applies only to this session's own Herdr pane and lasts until `/new`.";
const ACTIONS = ["mark", "unmark", "status"];
const MARK_KEYS = ["createdAt", "paneId", "sessionId", "version"];

function markDirectory(deps = {}) {
  if (deps.stateRoot !== undefined) {
    if (typeof deps.stateRoot !== "string" || deps.stateRoot === "") {
      throw new Error("the injected dictation-private state root is invalid");
    }
    return resolve(deps.stateRoot);
  }
  const xdg = process.env.XDG_STATE_HOME;
  const base = xdg && xdg.trim() !== "" ? resolve(xdg) : join(homedir(), ".local", "state");
  return join(base, "qq", "dictation-private");
}

function asciiAlphanumeric(value) {
  return value.length > 0 && [...value].every((character) => {
    const code = character.charCodeAt(0);
    return (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
  });
}

function validatePaneId(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 ||
      ![...value].every((character) => character.charCodeAt(0) <= 0x7f)) {
    return false;
  }
  const colon = value.indexOf(":");
  if (colon < 0 || colon !== value.lastIndexOf(":")) return false;
  const workspace = value.slice(0, colon);
  const pane = value.slice(colon + 1);
  return workspace.startsWith("w") && asciiAlphanumeric(workspace.slice(1)) &&
    pane.startsWith("p") && asciiAlphanumeric(pane.slice(1));
}

function callerPane() {
  const value = process.env.HERDR_PANE_ID;
  if (typeof value !== "string" || value === "") {
    return {
      ok: false,
      reason: "HERDR_PANE_ID is absent or empty; this session has no identified Herdr pane",
    };
  }
  if (!validatePaneId(value)) {
    return {
      ok: false,
      reason: "HERDR_PANE_ID is invalid; expected w<ASCII-alphanumeric>:p<ASCII-alphanumeric> with at most 64 bytes",
    };
  }
  return { ok: true, paneId: value };
}

function confinedChild(root, filename) {
  const base = resolve(root);
  const target = resolve(base, filename);
  if (dirname(target) !== base || !target.startsWith(`${base}${sep}`)) {
    throw new Error("dictation-private path escaped its mark directory");
  }
  return target;
}

function markPath(root, paneId) {
  if (!validatePaneId(paneId)) {
    throw new Error("refused to construct a mark path from an invalid pane id");
  }
  return confinedChild(root, `${paneId}.json`);
}

function textResult(text) {
  return { content: [{ type: "text", text }] };
}

function errorDetail(error) {
  return error instanceof Error && error.message ? error.message : "filesystem operation failed";
}

async function inspectDirectory(root) {
  const directory = resolve(root);
  const components = [];
  for (let component = directory; ; component = dirname(component)) {
    components.push(component);
    if (dirname(component) === component) break;
  }

  for (const component of components.reverse()) {
    let state;
    try {
      state = await lstat(component);
    } catch (error) {
      if (error?.code === "ENOENT") return { kind: "absent" };
      return {
        kind: "unsafe",
        reason: `mark directory path could not be inspected: ${errorDetail(error)}`,
      };
    }
    if (state.isSymbolicLink()) {
      return {
        kind: "unsafe",
        reason: component === directory
          ? "mark directory is a symbolic link"
          : "mark directory has a symbolic-link ancestor",
      };
    }
    if (!state.isDirectory()) {
      return {
        kind: "unsafe",
        reason: component === directory
          ? "mark directory is not a directory"
          : "mark directory has a non-directory ancestor",
      };
    }
  }
  return { kind: "directory" };
}

async function ensurePrivateDirectory(root) {
  const before = await inspectDirectory(root);
  if (before.kind === "unsafe") throw new Error(before.reason);
  if (before.kind === "absent") {
    await mkdir(root, { recursive: true, mode: 0o700 });
  }
  const after = await inspectDirectory(root);
  if (after.kind !== "directory") {
    throw new Error(after.reason ?? "mark directory was not created safely");
  }
  await chmod(root, 0o700);
}

async function inspectEntry(path) {
  try {
    const state = await lstat(path);
    if (state.isSymbolicLink()) return { kind: "symlink" };
    if (state.isFile()) return { kind: "file", state };
    return { kind: "other" };
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "absent" };
    return { kind: "error", reason: errorDetail(error) };
  }
}

function validMark(value, paneId) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== MARK_KEYS.length || keys.some((key, index) => key !== MARK_KEYS[index])) {
    return false;
  }
  return value.version === 1 &&
    value.paneId === paneId &&
    typeof value.sessionId === "string" && value.sessionId !== "" &&
    typeof value.createdAt === "string" && value.createdAt !== "" &&
    !Number.isNaN(Date.parse(value.createdAt));
}

async function readOwnMark(root, paneId, path) {
  const directory = await inspectDirectory(root);
  if (directory.kind === "absent") return { kind: "absent" };
  if (directory.kind === "unsafe") return { kind: "unsafe", reason: directory.reason };

  const entry = await inspectEntry(path);
  if (entry.kind === "absent") return { kind: "absent" };
  if (entry.kind === "symlink") {
    return { kind: "invalid", reason: "mark file is a symbolic link" };
  }
  if (entry.kind === "other") {
    return { kind: "invalid", reason: "mark path is not a regular file" };
  }
  if (entry.kind === "error") {
    return { kind: "invalid", reason: `mark file could not be inspected: ${entry.reason}` };
  }

  if (typeof constants.O_NOFOLLOW !== "number") {
    return { kind: "unsafe", reason: "this platform cannot open mark files without following links" };
  }

  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedState = await handle.stat();
    if (!openedState.isFile()) {
      return { kind: "invalid", reason: "mark path is not a regular file" };
    }
    const raw = await handle.readFile("utf8");
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return { kind: "invalid", reason: "mark file is not parseable JSON" };
    }
    if (!validMark(value, paneId)) {
      return { kind: "invalid", reason: "mark file does not match the exact own-pane schema" };
    }
    return { kind: "valid", mark: value };
  } catch (error) {
    return { kind: "invalid", reason: `mark file could not be read safely: ${errorDetail(error)}` };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeOwnMark(root, path, paneId, sessionId, deps) {
  await ensurePrivateDirectory(root);

  const existing = await inspectEntry(path);
  if (existing.kind === "symlink") {
    throw new Error("mark file is a symbolic link");
  }
  if (existing.kind === "other") {
    throw new Error("mark path is not a regular file");
  }
  if (existing.kind === "error") {
    throw new Error(`mark path could not be inspected: ${existing.reason}`);
  }

  const createdAt = new Date().toISOString();
  const payload = { version: 1, paneId, sessionId, createdAt };
  const temporaryPath = confinedChild(
    root,
    `.${paneId}.${process.pid}.${randomUUID()}.tmp`,
  );
  const renameFile = deps.rename ?? rename;
  if (typeof renameFile !== "function") throw new Error("atomic rename operation is unavailable");

  let handle;
  let temporaryExists = false;
  try {
    if (typeof constants.O_NOFOLLOW !== "number") {
      throw new Error("this platform cannot create mark files without following links");
    }
    handle = await open(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    temporaryExists = true;
    await handle.chmod(0o600);
    await handle.writeFile(`${JSON.stringify(payload)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await renameFile(temporaryPath, path);
    temporaryExists = false;
    return payload;
  } catch (error) {
    await handle?.close().catch(() => {});
    if (temporaryExists) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        if (cleanupError?.code !== "ENOENT") {
          throw new Error(
            `${errorDetail(error)}; temporary mark cleanup failed: ${errorDetail(cleanupError)}`,
          );
        }
      }
    }
    throw error;
  }
}

async function removeOwnEntry(root, path) {
  const directory = await inspectDirectory(root);
  if (directory.kind === "absent") return { kind: "absent" };
  if (directory.kind === "unsafe") return { kind: "unsafe", reason: directory.reason };

  const entry = await inspectEntry(path);
  if (entry.kind === "absent") return { kind: "absent" };
  if (entry.kind === "error") return { kind: "unsafe", reason: entry.reason };
  if (entry.kind === "other") {
    return { kind: "unsafe", reason: "mark path is not a removable file or symbolic link" };
  }
  try {
    await unlink(path);
    return { kind: "removed" };
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "absent" };
    return { kind: "unsafe", reason: errorDetail(error) };
  }
}

function currentSessionId(ctx) {
  try {
    const value = typeof ctx?.sessionManager?.getSessionId === "function"
      ? ctx.sessionManager.getSessionId()
      : undefined;
    return typeof value === "string" && value !== "" ? value : undefined;
  } catch {
    return undefined;
  }
}

function makeQueue() {
  const tails = new Map();
  return async function withMarkQueue(path, operation) {
    const previous = tails.get(path) ?? Promise.resolve();
    const running = previous.catch(() => {}).then(operation);
    tails.set(path, running);
    try {
      return await running;
    } finally {
      if (tails.get(path) === running) tails.delete(path);
    }
  };
}

async function handleSessionStart(event, ctx, deps, withMarkQueue) {
  if (event?.reason !== "new") return;
  const pane = callerPane();
  if (!pane.ok) return;
  const sessionId = currentSessionId(ctx);
  if (!sessionId) return;

  try {
    const root = markDirectory(deps);
    const path = markPath(root, pane.paneId);
    await withMarkQueue(path, async () => {
      const state = await readOwnMark(root, pane.paneId, path);
      if (state.kind === "absent" || state.kind === "unsafe") return;
      if (state.kind === "valid" && state.mark.sessionId === sessionId) return;
      await removeOwnEntry(root, path);
    });
  } catch {
    // A failed cleanup must not disrupt creation of the new Pi session.
  }
}

export default function registerDictationPrivate(pi, deps = {}) {
  const withMarkQueue = makeQueue();

  pi.registerTool({
    name: TOOL_NAME,
    label: TOOL_LABEL,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ACTIONS },
      },
      required: ["action"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!params || typeof params !== "object" ||
          Object.keys(params).length !== 1 || !ACTIONS.includes(params.action)) {
        return textResult(`${TOOL_NAME} refused: action must be mark, unmark, or status.`);
      }

      const pane = callerPane();
      if (!pane.ok) return textResult(`${TOOL_NAME} refused: ${pane.reason}.`);

      let root;
      let path;
      try {
        root = markDirectory(deps);
        path = markPath(root, pane.paneId);
      } catch (error) {
        return textResult(`${TOOL_NAME} refused: ${errorDetail(error)}.`);
      }

      try {
        return await withMarkQueue(path, async () => {
          if (params.action === "mark") {
            const sessionId = currentSessionId(ctx);
            if (!sessionId) {
              return textResult(
                `${TOOL_NAME} refused: the current session id could not be obtained; no mark was written.`,
              );
            }
            const mark = await writeOwnMark(root, path, pane.paneId, sessionId, deps);
            return textResult(
              `Dictation into this session (${pane.paneId}) is private and local-only until /new. ` +
              `Marked session ${mark.sessionId} at ${mark.createdAt}.`,
            );
          }

          if (params.action === "status") {
            const state = await readOwnMark(root, pane.paneId, path);
            if (state.kind === "absent") {
              return textResult(`Dictation privacy status: pane ${pane.paneId} is unmarked.`);
            }
            if (state.kind === "valid") {
              return textResult(
                `Dictation privacy status: pane ${pane.paneId} is marked for session ` +
                `${state.mark.sessionId}, created at ${state.mark.createdAt}.`,
              );
            }
            return textResult(
              `Dictation privacy status refused for pane ${pane.paneId}: ` +
              `${state.reason ?? "mark state is unsafe or invalid"}.`,
            );
          }

          const removed = await removeOwnEntry(root, path);
          if (removed.kind === "removed") {
            return textResult(`Dictation privacy mark removed for pane ${pane.paneId}.`);
          }
          if (removed.kind === "absent") {
            return textResult(`Dictation privacy mark was already absent for pane ${pane.paneId}.`);
          }
          return textResult(
            `${TOOL_NAME} refused to unmark pane ${pane.paneId}: ${removed.reason}.`,
          );
        });
      } catch (error) {
        return textResult(`${TOOL_NAME} refused: ${errorDetail(error)}. No privacy state change was reported.`);
      }
    },
  });

  pi.on("session_start", (event, ctx) => handleSessionStart(event, ctx, deps, withMarkQueue));
}
