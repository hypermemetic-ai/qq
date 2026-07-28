// @ts-nocheck

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  AlignmentContractError, MAX_ALIGNMENT_PACKET_BYTES, validateAlignerRequest, validateDispositionOperatorResponse, validateDispositionReceipt, validateOrchestratorProjection,
} from "./qq-alignment-contracts.ts";

const RPC_REQUEST = "subagents:rpc:v1:request";
const CUSTOM_TYPE = "qq-alignment-state-v1";
const MAX_NATIVE_SESSION_BYTES = 64 * 1024 * 1024;
const MAX_NATIVE_SESSION_LINE_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = MAX_ALIGNMENT_PACKET_BYTES;
const MAX_CHILD_CONTINUITY_BYTES = 128 * 1024;
const RPC_TIMEOUT_MS = 30000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACE_PATTERN = /^[0-9a-f]{32}$/;
const TERMINAL = new Set(["stopped", "complete", "failed"]);
const REPLACEMENT_REASONS = new Set(["reload", "new", "resume", "fork"]);
const STARTABLE = new Set(["not-started", ...TERMINAL]);
const ORCHESTRATOR_TASK = `You are qq's sole internal orchestrator for this visible alignment session. Read AGENTS.md and CONCEPTS.md completely, then use qq_alignment_receive to wait for typed requests. For each request, perform or delegate only the execution work it calls for, preserving operator-facing authority with the aligner. Reply exactly once with qq_alignment_reply. Carry only bounded inline supplied material and exact source references; never expose a raw path-opening or capability interface. Continue receiving until shutdown; there is no exchange-count or anti-chatter cap. Never address the operator or invent a disposition.`;
const STATE_KEYS = [
  "sessionId", "traceId", "changeId", "lastProjectionId", "exchanges", "requests", "requestPackets", "directProjectionKinds", "projections", "decisionIds",
  "dispositions", "openDecisions", "pendingDispositions", "suppliedMaterial", "sourceReferences", "provenanceIds", "workerRunIds", "orchestratorRunId",
  "orchestratorLifecycle", "workflowLifecycle", "completionState", "lastNativeEvent", "lastNativePayload",
];

function now() { return new Date().toISOString(); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function reject(condition, message) { if (condition) throw new AlignmentContractError(message); }
function within(candidate, parent) {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel));
}
function exact(value, keys, label) {
  reject(value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)), `${label} has the wrong shape`);
  return value;
}
function validId(value) { return typeof value === "string" && ID_PATTERN.test(value); }
function validDate(value) {
  const time = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? Date.parse(value) : NaN;
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}
function sessionFile(value, label, optional = false) {
  if (optional && (value === null || value === undefined)) return null;
  reject(typeof value !== "string" || !isAbsolute(value), `${label} must be an absolute path`); return value;
}
function confirmationOutcome(value) { return new Map([["accept", "accepted"], ["reject", "rejected"], ["reshape", "reshaped"], ["opt-out", "opted-out"]]).get(value); }
function initialProtocolState(sessionId, traceId) {
  return {
    sessionId, traceId, changeId: null, lastProjectionId: traceId,
    exchanges: new Set(), requests: new Set(), requestPackets: new Map(), directProjectionKinds: new Map(), projections: new Set(), decisionIds: new Set(),
    dispositions: new Map(), openDecisions: new Map(), pendingDispositions: new Map(), suppliedMaterial: new Map(), sourceReferences: new Map(), provenanceIds: new Set(), workerRunIds: new Set(),
    orchestratorRunId: null, orchestratorLifecycle: "not-started", workflowLifecycle: "not-started", completionState: null, lastNativeEvent: null, lastNativePayload: null,
  };
}
export function protocolState(source) { return structuredClone(Object.fromEntries(STATE_KEYS.map((key) => [key, source[key]]))); }
function installProtocolState(target, state) { for (const key of STATE_KEYS) target[key] = state[key]; }
export function childContinuityProjection(state) {
  const decision = ({ decision_id, question, issued_for_operator_text }) => ({ decision_id, question, issued_for_operator_text });
  const disposition = ({ decision_id, outcome, operator_response }) => ({ decision_id, outcome, operator_response });
  return {
    version: 1, change_id: state.changeId,
    open_decisions: [...state.openDecisions.values()].map(decision),
    pending_dispositions: [...state.pendingDispositions.values()].map(disposition),
    accepted_dispositions: [...state.dispositions.values()].map(disposition),
  };
}
function assertChildContinuityBound(state) {
  let serialized;
  try { serialized = JSON.stringify(childContinuityProjection(state)); } catch { throw new AlignmentContractError("native child continuity is not serializable"); }
  reject(Buffer.byteLength(serialized, "utf8") > MAX_CHILD_CONTINUITY_BYTES, "native child continuity exceeds its aggregate bound");
  return serialized;
}

export function reduceProtocolState(current, event, payload) {
  const next = structuredClone(current); next.lastNativeEvent = event; next.lastNativePayload = structuredClone(payload);
  if (event === "lifecycle") {
    exact(payload, ["reason", "pi_session_file"], "native lifecycle state");
    reject(!["startup", ...REPLACEMENT_REASONS].includes(payload.reason), "native lifecycle reason is malformed");
    sessionFile(payload.pi_session_file, "native lifecycle Pi session file", true);
  } else if (event === "request") {
    exact(payload, ["packet"], "native request state"); const packet = validateAlignerRequest(payload.packet);
    reject(packet.trace_id !== next.traceId || (next.changeId !== null && packet.change_id !== next.changeId)
      || packet.reply_to !== next.lastProjectionId || next.exchanges.has(packet.exchange_id) || next.requests.has(packet.request_id), "native request correlation is malformed");
    if (packet.kind === "disposition") reject(!isDeepStrictEqual([next.dispositions.get(packet.payload.receipt.receipt_id), packet.operator_text], [packet.payload.receipt, packet.payload.receipt.confirmation]), "native disposition request is not receipt-backed by the current operator turn");
    next.changeId ??= packet.change_id; next.exchanges.add(packet.exchange_id); next.requests.add(packet.request_id); next.requestPackets.set(packet.exchange_id, packet);
  } else if (event === "projection") {
    exact(payload, ["source", "packet"], "native projection state");
    reject(!["direct", "notification", "recovered-direct"].includes(payload.source), "native projection source is malformed");
    const packet = validateOrchestratorProjection(payload.packet); const request = next.requestPackets.get(packet.exchange_id); const direct = payload.source !== "notification";
    reject(request === undefined || packet.change_id !== next.changeId || packet.trace_id !== next.traceId || packet.reply_to !== request?.request_id || next.projections.has(packet.packet_id), "native projection correlation is malformed");
    reject(direct ? next.directProjectionKinds.has(packet.reply_to)
      : !["ack", "status"].includes(next.directProjectionKinds.get(packet.reply_to)) || !["decision", "completion", "failure"].includes(packet.kind), "native projection lineage is ineligible");
    reject(packet.material.supplied_material.some((item) => next.suppliedMaterial.has(item.material_id) || next.sourceReferences.has(item.source.source_id)), "native supplied material identity is stale or reused");
    const decision = packet.material.decision;
    reject(decision !== null && (decision.issued_for_operator_text !== request.operator_text || next.decisionIds.has(decision.decision_id)), "native decision lineage is malformed");
    if (decision !== null) { next.decisionIds.add(decision.decision_id); next.openDecisions.set(decision.decision_id, { ...decision, packet_id: packet.packet_id, exchange_id: packet.exchange_id }); }
    next.projections.add(packet.packet_id); if (direct) next.directProjectionKinds.set(packet.reply_to, packet.kind);
    next.lastProjectionId = packet.packet_id; next.workflowLifecycle = packet.lifecycle;
    for (const item of packet.material.supplied_material) {
      next.suppliedMaterial.set(item.material_id, structuredClone(item)); next.sourceReferences.set(item.source.source_id, structuredClone(item.source));
      next.provenanceIds.add(item.material_id); next.provenanceIds.add(item.source.source_id);
    }
    for (const run of packet.material.worker_run_ids) next.workerRunIds.add(run);
  } else if (event === "disposition-pending") {
    exact(payload, ["pending"], "native pending disposition state");
    const pending = exact(payload.pending, ["decision_id", "decision_packet_id", "exchange_id", "outcome", "operator_response"], "native pending disposition");
    const decision = next.openDecisions.get(pending.decision_id); validateDispositionOperatorResponse(pending.operator_response);
    reject(decision === undefined || decision.packet_id !== pending.decision_packet_id || decision.exchange_id !== pending.exchange_id
      || !["accepted", "rejected", "reshaped", "opted-out"].includes(pending.outcome) || next.pendingDispositions.has(pending.decision_id), "native pending disposition lineage is malformed");
    next.pendingDispositions.set(pending.decision_id, structuredClone(pending));
  } else if (event === "disposition") {
    exact(payload, ["receipt"], "native disposition state");
    const receipt = validateDispositionReceipt(payload.receipt); const decision = next.openDecisions.get(receipt.decision_id); const pending = next.pendingDispositions.get(receipt.decision_id);
    reject(receipt.change_id !== next.changeId || receipt.trace_id !== next.traceId || decision === undefined || receipt.decision_packet_id !== decision?.packet_id
      || receipt.exchange_id !== decision?.exchange_id || confirmationOutcome(receipt.confirmation) !== receipt.outcome || next.dispositions.has(receipt.receipt_id)
      || (pending === undefined ? receipt.operator_response !== receipt.confirmation : pending.outcome !== receipt.outcome || pending.operator_response !== receipt.operator_response), "native disposition lineage is malformed");
    next.dispositions.set(receipt.receipt_id, structuredClone(receipt)); next.openDecisions.delete(receipt.decision_id); next.pendingDispositions.delete(receipt.decision_id);
  } else if (event === "orchestrator-start") {
    exact(payload, ["run_id", "resumed"], "native orchestrator start state");
    reject(!validId(payload.run_id) || typeof payload.resumed !== "boolean" || !STARTABLE.has(next.orchestratorLifecycle), "native orchestrator start is malformed or overlapping");
    next.orchestratorRunId = payload.run_id; next.orchestratorLifecycle = "running";
  } else if (event === "orchestrator-terminal") {
    exact(payload, ["run_id", "state", "proof"], "native orchestrator terminal state");
    reject(payload.run_id !== next.orchestratorRunId || !TERMINAL.has(payload.state) || !["async-complete", "status"].includes(payload.proof)
      || !["running", "recovery-recorded"].includes(next.orchestratorLifecycle), "native orchestrator terminal proof is malformed or foreign");
    next.orchestratorLifecycle = payload.state;
  } else if (event === "recovery") {
    exact(payload, ["run_id", "reason", "error"], "native recovery state");
    reject(payload.run_id !== next.orchestratorRunId || typeof payload.reason !== "string" || payload.reason.length === 0 || typeof payload.error !== "string" || payload.error.length === 0
      || TERMINAL.has(next.orchestratorLifecycle), "native recovery state is malformed or foreign");
    next.orchestratorLifecycle = "recovery-recorded";
  } else if (event === "session-replacement") {
    exact(payload, ["reason", "from_pi_session_file", "target_pi_session_file", "orchestrator_lifecycle"], "native replacement state");
    reject(!REPLACEMENT_REASONS.has(payload.reason) || !isAbsolute(payload.from_pi_session_file) || (payload.target_pi_session_file !== null && !isAbsolute(payload.target_pi_session_file))
      || !TERMINAL.has(payload.orchestrator_lifecycle) || payload.orchestrator_lifecycle !== next.orchestratorLifecycle, "native replacement state is malformed");
  } else if (event === "presentation") {
    const receipt = exact(payload, ["version", "change_id", "exchange_id", "trace_id", "episode", "outcome", "criteria_trigger", "provenance"], "native presentation state");
    reject(receipt.version !== 1 || receipt.change_id !== next.changeId || receipt.trace_id !== next.traceId || !next.exchanges.has(receipt.exchange_id)
      || !["initial", "realignment", "acceptance"].includes(receipt.episode) || !["ready", "needs-data", "clarification"].includes(receipt.outcome)
      || (receipt.episode === "realignment" ? typeof receipt.criteria_trigger !== "string" || receipt.criteria_trigger.length === 0 || receipt.criteria_trigger.length > 4096 : receipt.criteria_trigger !== null)
      || !Array.isArray(receipt.provenance) || receipt.provenance.length === 0 || new Set(receipt.provenance).size !== receipt.provenance.length || receipt.provenance.some((id) => !next.provenanceIds.has(id)), "native presentation receipt is malformed or foreign");
  } else if (event === "artifact") {
    const artifact = exact(payload, ["artifact_id", "kind", "title", "provenance", "sha256"], "native artifact state");
    reject(!validId(artifact.artifact_id) || !["markdown", "diagram", "static-page"].includes(artifact.kind) || typeof artifact.title !== "string" || artifact.title.length === 0 || artifact.title.length > 200
      || !Array.isArray(artifact.provenance) || artifact.provenance.length === 0 || new Set(artifact.provenance).size !== artifact.provenance.length
      || artifact.provenance.some((id) => !next.provenanceIds.has(id)) || !/^[0-9a-f]{64}$/.test(artifact.sha256), "native artifact state is malformed or foreign");
  } else if (event === "operator-turn-opened") {
    exact(payload, ["receipt"], "native operator-turn state");
    const receipt = exact(payload.receipt, ["version", "change_id", "exchange_id", "trace_id", "episode", "opening_reason", "opened_at"], "native operator-turn receipt");
    reject(receipt.version !== 1 || receipt.change_id !== next.changeId || receipt.trace_id !== next.traceId || !next.exchanges.has(receipt.exchange_id)
      || !["initial", "realignment", "acceptance"].includes(receipt.episode) || !["decision", "clarification", "realignment", "acceptance"].includes(receipt.opening_reason) || !validDate(receipt.opened_at), "native operator-turn state is malformed or foreign");
  } else if (event === "completion") {
    exact(payload, ["state"], "native completion state");
    const state = exact(payload.state, ["version", "change_id", "trace_id", "session_id", "completed_at", "orchestrator_lifecycle", "root_session_file"], "native completion receipt");
    reject(state.version !== 1 || state.change_id !== next.changeId || state.trace_id !== next.traceId || state.session_id !== next.sessionId || !validDate(state.completed_at)
      || !TERMINAL.has(state.orchestrator_lifecycle) || state.orchestrator_lifecycle !== next.orchestratorLifecycle || (state.root_session_file !== null && !isAbsolute(state.root_session_file)), "native completion receipt is malformed");
    next.completionState = structuredClone(state);
  } else if (event === "shutdown") {
    exact(payload, ["reason", "orchestrator_lifecycle"], "native shutdown state");
    reject(typeof payload.reason !== "string" || payload.reason.length === 0 || !TERMINAL.has(payload.orchestrator_lifecycle) || payload.orchestrator_lifecycle !== next.orchestratorLifecycle, "native shutdown state is malformed");
  } else throw new AlignmentContractError(`native alignment event '${event}' is unsupported`);
  assertChildContinuityBound(next); return next;
}

async function insideGitWorktree(path) {
  let cursor = path;
  while (true) {
    try { const marker = await lstat(join(cursor, ".git")); if (marker.isDirectory() || marker.isFile()) return true; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    const parent = dirname(cursor); if (parent === cursor) return false; cursor = parent;
  }
}
async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 }); const info = await lstat(path);
  reject(!info.isDirectory() || info.isSymbolicLink(), `private runtime path is not a direct directory: ${path}`);
  const uid = process.geteuid?.(); reject(uid !== undefined && info.uid !== uid, `private runtime path is foreign-owned: ${path}`);
  if ((info.mode & 0o777) !== 0o700) await chmod(path, 0o700);
}
async function directOwnedDirectory(path, label) {
  let info;
  try { info = await lstat(path); } catch (error) { throw new AlignmentContractError(`${label} is unavailable: ${error instanceof Error ? error.message : String(error)}`); }
  reject(!info.isDirectory() || info.isSymbolicLink(), `${label} is not a direct directory`);
  const uid = process.geteuid?.(); reject(uid !== undefined && info.uid !== uid, `${label} is foreign-owned`);
}
async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", flag: "wx", mode: 0o600 }); await rename(temporary, path);
}
async function directBytes(path, label, maxBytes) {
  let handle;
  try {
    const first = await lstat(path); reject(!first.isFile() || first.isSymbolicLink() || first.size > maxBytes, `${label} is not a bounded direct regular file`);
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); const stat = await handle.stat();
    reject(!stat.isFile() || stat.dev !== first.dev || stat.ino !== first.ino || stat.size > maxBytes, `${label} changed identity while opening`);
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const row = await handle.read(bytes, offset, bytes.length - offset, offset); reject(row.bytesRead < 1, `${label} changed size while reading`); offset += row.bytesRead; }
    const after = await handle.stat(); reject(after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs, `${label} changed while reading`); return bytes;
  } catch (error) {
    if (error instanceof AlignmentContractError) throw error;
    throw new AlignmentContractError(`${label} cannot be read without following links: ${error instanceof Error ? error.message : String(error)}`);
  } finally { await handle?.close().catch(() => {}); }
}
async function readJsonDirect(path, label) {
  try { return JSON.parse((await directBytes(path, label, MAX_JSON_BYTES)).toString("utf8")); }
  catch (error) { if (error instanceof AlignmentContractError) throw error; throw new AlignmentContractError(`${label} is malformed`); }
}
function runtimeBase(override) {
  if (override !== undefined) return override;
  if (process.env.QQ_DISPATCH_RUNTIME_ROOT !== undefined) { reject(!isAbsolute(process.env.QQ_DISPATCH_RUNTIME_ROOT), "QQ_DISPATCH_RUNTIME_ROOT must be absolute"); return join(process.env.QQ_DISPATCH_RUNTIME_ROOT, "alignment"); }
  const uid = process.getuid?.() ?? process.geteuid?.();
  if (process.env.XDG_RUNTIME_DIR !== undefined) { reject(!isAbsolute(process.env.XDG_RUNTIME_DIR), "XDG_RUNTIME_DIR must be absolute"); return join(process.env.XDG_RUNTIME_DIR, "qq", "alignment"); }
  reject(uid === undefined, "cannot derive a private alignment runtime without a uid"); return join(tmpdir(), `qq-alignment-${uid}`);
}
function asyncRunBase(override) {
  if (override !== undefined) { reject(!isAbsolute(override), "pi-subagents async-run root must be absolute"); return override; }
  if (process.env.QQ_DISPATCH_RUNTIME_ROOT !== undefined) {
    reject(!isAbsolute(process.env.QQ_DISPATCH_RUNTIME_ROOT), "QQ_DISPATCH_RUNTIME_ROOT must be absolute");
    return join(process.env.QQ_DISPATCH_RUNTIME_ROOT, "async-subagent-runs");
  }
  const uid = process.getuid?.() ?? process.geteuid?.(); reject(uid === undefined, "cannot derive the pi-subagents async-run root without a uid");
  return join(tmpdir(), `pi-subagents-uid-${uid}`, "async-subagent-runs");
}
function runStateFromStatus(status, expectedRunId) {
  if (status === null || typeof status !== "object" || typeof status.text !== "string") return null;
  const lines = status.text.split(/\r?\n/u); const runs = lines.map((line) => line.match(/^Run: (.+)$/u)?.[1]).filter(Boolean); const states = lines.map((line) => line.match(/^State: ([a-z]+)$/u)?.[1]).filter(Boolean);
  return runs.length === 1 && runs[0] === expectedRunId && states.length === 1 ? states[0] : null;
}
function terminalStateFromStatus(status, expectedRunId) {
  const state = runStateFromStatus(status, expectedRunId); return state !== null && TERMINAL.has(state) ? state : null;
}
export async function requestExactRunStop({ asyncRunRoot, runId, ownerSessionFile, reason }) {
  reject(!isAbsolute(asyncRunRoot) || !validId(runId) || !isAbsolute(ownerSessionFile), "portable orchestrator stop identity is malformed");
  reject(typeof reason !== "string" || reason.length === 0 || reason.length > 256, "portable orchestrator stop reason is malformed");
  const runDirectory = join(asyncRunRoot, runId); const controlDirectory = join(runDirectory, "control");
  await directOwnedDirectory(asyncRunRoot, "pi-subagents async-run root");
  await directOwnedDirectory(runDirectory, "orchestrator async-run directory");
  await directOwnedDirectory(controlDirectory, "orchestrator control directory");
  let status;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { status = await readJsonDirect(join(runDirectory, "status.json"), "orchestrator async-run status"); break; }
    catch (error) { if (attempt === 2) throw error; }
  }
  reject(status === null || typeof status !== "object" || Array.isArray(status)
    || status.runId !== runId || status.sessionId !== ownerSessionFile || status.state !== "running",
  "portable orchestrator stop refused a foreign or non-running async run");
  await atomicJson(join(controlDirectory, "stop.json"), { type: "stop", ts: Date.now(), source: "qq-alignment-broker", reason });
}

export async function readNativeSessionBranch(path) {
  const bytes = await directBytes(path, "previous Pi session", MAX_NATIVE_SESSION_BYTES); let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new AlignmentContractError("previous Pi session is not UTF-8"); }
  const lines = text.trimEnd().split("\n"); reject(lines.length < 1, "previous Pi session is empty"); let header;
  try { header = JSON.parse(lines[0]); } catch { throw new AlignmentContractError("previous Pi session header is malformed"); }
  reject(header?.type !== "session" || ![2, 3].includes(header.version), "previous Pi session header is foreign");
  const entries = new Map(); let leaf = null;
  for (let index = 1; index < lines.length; index += 1) {
    reject(Buffer.byteLength(lines[index], "utf8") > MAX_NATIVE_SESSION_LINE_BYTES, `previous Pi session line ${index + 1} exceeds its bound`); let entry;
    try { entry = JSON.parse(lines[index]); } catch { throw new AlignmentContractError(`previous Pi session line ${index + 1} is malformed`); }
    reject(entry === null || typeof entry !== "object" || Array.isArray(entry) || !validId(entry.id) || (entry.parentId !== null && !validId(entry.parentId)) || entries.has(entry.id), `previous Pi session line ${index + 1} has malformed tree identity`);
    entries.set(entry.id, entry); leaf = entry.id;
  }
  const branch = []; const seen = new Set();
  while (leaf !== null) { reject(seen.has(leaf), "previous Pi session branch contains a cycle"); const entry = entries.get(leaf); reject(entry === undefined, "previous Pi session branch has a missing parent"); seen.add(leaf); branch.push(entry); leaf = entry.parentId; }
  return branch.reverse();
}

export class AlignmentBroker {
  constructor(pi, options = {}) {
    this.pi = pi; this.cwd = options.cwd; this.runtimeRoot = runtimeBase(options.runtimeRoot); this.asyncRunRoot = asyncRunBase(options.asyncRunRoot);
    this.exchangeTimeoutMs = options.exchangeTimeoutMs ?? null; this.stopTimeoutMs = options.stopTimeoutMs ?? RPC_TIMEOUT_MS; this.pollMs = options.pollMs ?? 25;
    installProtocolState(this, initialProtocolState(options.sessionId ?? `session-${randomUUID()}`, options.traceId ?? (process.env.QQ_TRACE_ID?.match(TRACE_PATTERN)?.[0] ?? randomBytes(16).toString("hex"))));
    this.piSessionFile = sessionFile(options.piSessionFile, "Pi session file", true); this.resumeFromSessionFile = sessionFile(options.resumeFromSessionFile, "previous Pi session file", true);
    this.sessionReason = options.sessionReason ?? "startup"; this.sessionManager = options.sessionManager ?? null; this.appendEntry = options.appendEntry ?? ((type, data) => this.pi.appendEntry(type, data));
    this.previousBranchReader = options.previousBranchReader ?? readNativeSessionBranch; this.requestRunStop = options.requestRunStop ?? requestExactRunStop; this.channelRoot = join(this.runtimeRoot, this.sessionId);
    this.lastOperatorText = null; this.projectionAcceptanceTail = Promise.resolve(); this.pendingExchanges = 0;
    this.started = false; this.closed = false; this.finalizing = false; this.continuationPrepared = false; this.resumed = false; this.recoveredRunId = null; this.canonicalCwd = null;
    this.unsubscribeAsync = null; this.spawnPending = false; this.ambiguousSpawn = false; this.earlyAsyncCompletions = new Map(); this.notificationTimer = null; this.activeNotificationDrains = 0; this.notificationDrainWaiters = [];
  }

  nativeEntries(branch) { reject(!Array.isArray(branch), "Pi current branch is unavailable"); return branch.filter((entry) => entry?.type === "custom" && entry.customType === CUSTOM_TYPE); }
  restoreNative(entries, label) {
    let count = 0; let state = protocolState(this);
    for (const entry of entries) {
      const data = exact(entry.data, ["version", "alignment_session_id", "trace_id", "event", "payload"], `${label} qq custom entry`);
      reject(data.version !== 1 || !validId(data.alignment_session_id) || !TRACE_PATTERN.test(data.trace_id) || typeof data.event !== "string", `${label} qq custom entry identity is malformed`);
      if (count === 0) { state.sessionId = data.alignment_session_id; state.traceId = data.trace_id; state.lastProjectionId = data.trace_id; }
      reject(data.alignment_session_id !== state.sessionId || data.trace_id !== state.traceId, `${label} contains foreign qq alignment state`);
      state = reduceProtocolState(state, data.event, data.payload); installProtocolState(this, state); count += 1;
    }
    return count;
  }
  async record(event, payload) {
    const copied = structuredClone(payload); const candidate = reduceProtocolState(protocolState(this), event, copied);
    const data = { version: 1, alignment_session_id: this.sessionId, trace_id: this.traceId, event, payload: copied };
    try { await this.appendEntry(CUSTOM_TYPE, data); } catch (error) { throw new AlignmentContractError(`Pi native alignment state append failed: ${error instanceof Error ? error.message : String(error)}`); }
    installProtocolState(this, candidate);
  }
  clearChannelEnvironment() {
    if (process.env.QQ_ALIGNMENT_CHANNEL_ROOT === this.channelRoot) delete process.env.QQ_ALIGNMENT_CHANNEL_ROOT;
    if (process.env.QQ_ALIGNMENT_SESSION_ID === this.sessionId) delete process.env.QQ_ALIGNMENT_SESSION_ID;
    if (process.env.QQ_ALIGNMENT_TRACE_ID === this.traceId) delete process.env.QQ_ALIGNMENT_TRACE_ID;
  }
  async establishChannel() {
    this.channelRoot = join(this.runtimeRoot, this.sessionId);
    for (const path of [this.channelRoot, join(this.channelRoot, "requests"), join(this.channelRoot, "responses"), join(this.channelRoot, "notifications"), join(this.channelRoot, "presentations")]) await privateDirectory(path);
    await atomicJson(join(this.channelRoot, "session.json"), { version: 1, session_id: this.sessionId, trace_id: this.traceId, cwd: this.canonicalCwd, created_at: now() });
    process.env.QQ_ALIGNMENT_CHANNEL_ROOT = this.channelRoot; process.env.QQ_ALIGNMENT_SESSION_ID = this.sessionId; process.env.QQ_ALIGNMENT_TRACE_ID = this.traceId;
    await this.record("lifecycle", { reason: this.sessionReason, pi_session_file: this.piSessionFile });
  }
  async initialize() {
    if (this.started) return;
    reject(!isAbsolute(this.cwd), "alignment cwd must be absolute"); reject(typeof this.appendEntry !== "function" || this.sessionManager === null || typeof this.sessionManager.getBranch !== "function", "qq alignment requires Pi native session state APIs");
    this.canonicalCwd = await realpath(this.cwd); await privateDirectory(this.runtimeRoot); this.runtimeRoot = await realpath(this.runtimeRoot);
    reject(within(this.runtimeRoot, this.canonicalCwd) || await insideGitWorktree(this.runtimeRoot), "alignment transport may not live inside a Git worktree");
    const current = this.nativeEntries(this.sessionManager.getBranch()); const recoverForkFromParent = this.sessionReason === "fork" && this.resumeFromSessionFile !== null;
    if (recoverForkFromParent && typeof this.sessionManager.getHeader === "function") reject(this.sessionManager.getHeader()?.parentSession !== this.resumeFromSessionFile, "fork target parent-session identity is foreign");
    let restored = !recoverForkFromParent && this.restoreNative(current, "current Pi branch") > 0;
    if (!restored && this.resumeFromSessionFile !== null) {
      restored = this.restoreNative(this.nativeEntries(await this.previousBranchReader(this.resumeFromSessionFile)), "previous Pi branch") > 0;
      if (restored) {
        reject(this.lastNativeEvent !== "session-replacement", "previous Pi branch lacks a final native replacement receipt"); const replacement = this.lastNativePayload;
        reject(replacement.reason !== this.sessionReason || replacement.from_pi_session_file !== this.resumeFromSessionFile
          || (replacement.target_pi_session_file !== null && replacement.target_pi_session_file !== this.piSessionFile), "previous Pi branch replacement receipt targets another session lifecycle");
      }
    }
    reject(this.completionState !== null, "alignment session is already completed");
    if (["running", "recovery-recorded"].includes(this.orchestratorLifecycle)) {
      reject(this.orchestratorRunId === null, "native recovery state has no exact orchestrator run"); this.recoveredRunId = this.orchestratorRunId; this.resumed = true; this.started = true; return;
    }
    if (restored) this.resumed = true;
    await this.establishChannel(); this.started = true;
  }
  async reconcileRecoveredOrchestrator() {
    await this.initialize(); if (this.recoveredRunId === null) return;
    await this.stopOrchestrator("startup-recovery"); this.recoveredRunId = null; await this.establishChannel();
  }
  sessionReceipt() { return Object.freeze({ version: 1, session_id: this.sessionId, trace_id: this.traceId, reply_to: this.lastProjectionId, orchestrator_run_id: this.orchestratorRunId, lifecycle: this.orchestratorLifecycle }); }
  canStartOrchestrator() { return this.recoveredRunId === null && STARTABLE.has(this.orchestratorLifecycle) && !this.ambiguousSpawn; }
  recordOperatorInput(text) { reject(this.closed || this.finalizing, "alignment session is closed"); reject(typeof text !== "string" || text.length === 0, "operator input is empty"); this.lastOperatorText = text; }
  rpc(method, params, timeoutMs = RPC_TIMEOUT_MS) {
    const requestId = randomUUID();
    return new Promise((resolve, rejectRpc) => {
      let finished = false; const topic = `subagents:rpc:v1:reply:${requestId}`;
      const unsubscribe = this.pi.events.on(topic, (reply) => {
        if (finished || reply?.version !== 1 || reply?.requestId !== requestId) return;
        finished = true; clearTimeout(timer); unsubscribe?.();
        if (reply.success === true) resolve(reply.data); else rejectRpc(new AlignmentContractError(`pi-subagents ${method} refused: ${reply?.error?.code ?? "unknown"}: ${reply?.error?.message ?? "no message"}`));
      });
      const timer = setTimeout(() => { if (!finished) { finished = true; unsubscribe?.(); rejectRpc(new AlignmentContractError(`pi-subagents ${method} RPC timed out`)); } }, timeoutMs);
      this.pi.events.emit(RPC_REQUEST, { version: 1, requestId, method, params });
    });
  }
  async startOrchestrator() {
    await this.initialize(); reject(this.recoveredRunId !== null, "orchestrator recovery is required before replacement spawn");
    reject(!this.canStartOrchestrator(), "exactly one orchestrator is permitted in an alignment session");
    const status = exact(await this.rpc("status", {}), ["text", "details"], "subagent status"); reject(typeof status.text !== "string", "subagent status text is malformed"); reject(!/^Spawn budget: (unlimited|[0-9]+\/[0-9]+ used, [0-9]+ remaining \(configured [0-9]+; granted [0-9]+; grant allowance [0-9]+\))\nNo active async runs\.$/u.test(status.text), "orchestrator spawn is ambiguous because the active root session is not empty");
    this.unsubscribeAsync = this.pi.events.on("subagent:async-complete", (event) => { this.handleAsyncComplete(event).catch(() => {}); });
    let task = ORCHESTRATOR_TASK;
    if (this.resumed) task += `\nThis root resumed only after exact terminal proof for its predecessor. Preserve this bounded native-session continuity before receiving the next request:\n${assertChildContinuityBound(this)}`;
    let data; this.spawnPending = true;
    try { data = await this.rpc("spawn", { agent: "orchestrator", task, context: "fresh", cwd: this.cwd, async: true }); }
    catch (error) { this.unsubscribeAsync?.(); this.unsubscribeAsync = null; throw error; }
    finally { this.spawnPending = false; }
    const runId = data?.runId ?? data?.id ?? data?.details?.runId;
    reject(!validId(runId), "pi-subagents spawn returned no valid orchestrator run id");
    try { await this.record("orchestrator-start", { run_id: runId, resumed: this.resumed }); }
    catch (error) { this.ambiguousSpawn = true; throw new AlignmentContractError(`orchestrator spawn succeeded but its native start entry did not; refusing ambiguous run ${runId}: ${error instanceof Error ? error.message : String(error)}`); }
    const early = this.earlyAsyncCompletions.get(runId); this.earlyAsyncCompletions.clear(); if (early !== undefined) await this.handleAsyncComplete(early);
    reject(this.orchestratorLifecycle !== "running", `orchestrator ended during startup (${this.orchestratorLifecycle})`);
    for (const [exchangeId, request] of this.requestPackets) if (!this.directProjectionKinds.has(request.request_id)) await atomicJson(join(this.channelRoot, "requests", `${exchangeId}.json`), request);
    this.startNotificationPolling(); return runId;
  }
  startNotificationPolling() {
    if (this.notificationTimer !== null || this.closed || this.finalizing) return;
    this.notificationTimer = setInterval(() => { this.drainNotifications().then(() => this.drainRecoveredResponses()).catch(() => {}); }, 250); this.notificationTimer.unref?.();
  }
  async handleAsyncComplete(event) {
    const runId = typeof event?.runId === "string" ? event.runId : event?.id; if (!validId(runId) || this.closed) return;
    if (this.orchestratorRunId === null) { if (this.spawnPending) this.earlyAsyncCompletions.set(runId, event); return; }
    if (runId !== this.orchestratorRunId || TERMINAL.has(this.orchestratorLifecycle)) return;
    const raw = event?.state ?? event?.status ?? event?.result?.state ?? event?.execution?.status;
    const terminal = raw === "stopped" ? "stopped" : ["failed", "error"].includes(raw) ? "failed" : ["complete", "completed"].includes(raw) ? "complete" : null;
    if (terminal !== null) await this.record("orchestrator-terminal", { run_id: runId, state: terminal, proof: "async-complete" });
  }
  async acceptProjection(projection, source) {
    const acceptance = this.projectionAcceptanceTail.then(async () => { await this.record("projection", { source, packet: projection }); return projection; });
    this.projectionAcceptanceTail = acceptance.catch(() => {}); return acceptance;
  }
  async exchange(value, signal) {
    reject(this.closed || this.finalizing, "alignment session is closed"); reject(this.orchestratorLifecycle !== "running", `orchestrator is not running (${this.orchestratorLifecycle})`);
    reject([...this.requestPackets.values()].some((request) => !this.directProjectionKinds.has(request.request_id)), "a native-session alignment exchange is unresolved");
    this.pendingExchanges += 1;
    try {
      const request = structuredClone(value); reject(request?.operator_text !== this.lastOperatorText, "operator_text is not the current immutable verbatim operator input");
      await this.record("request", { packet: request }); await atomicJson(join(this.channelRoot, "requests", `${request.exchange_id}.json`), request);
      const responsePath = join(this.channelRoot, "responses", `${request.exchange_id}.json`); const deadline = this.exchangeTimeoutMs === null ? null : Date.now() + this.exchangeTimeoutMs; let nextStatusAt = 0; let projection;
      while (deadline === null || Date.now() < deadline) {
        reject(signal?.aborted, "orchestrator exchange was cancelled");
        try { projection = await readJsonDirect(responsePath, "orchestrator response"); break; } catch (error) { if (!String(error?.message).includes("ENOENT")) throw error; }
        if (Date.now() >= nextStatusAt) {
          const terminal = terminalStateFromStatus(await this.rpc("status", { id: this.orchestratorRunId }, Math.min(2000, this.stopTimeoutMs)), this.orchestratorRunId);
          if (terminal !== null && !TERMINAL.has(this.orchestratorLifecycle)) await this.record("orchestrator-terminal", { run_id: this.orchestratorRunId, state: terminal, proof: "status" });
          nextStatusAt = Date.now() + 250;
        }
        reject(this.orchestratorLifecycle !== "running", `orchestrator ended during exchange (${this.orchestratorLifecycle})`);
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
      reject(projection === undefined, "orchestrator exchange timed out without a correlated projection"); return await this.acceptProjection(projection, "direct");
    } finally { this.pendingExchanges -= 1; }
  }
  async captureDisposition({ decision_id, outcome, operator_response }) {
    reject(this.closed || this.finalizing, "alignment session is closed"); reject(operator_response !== this.lastOperatorText, "operator disposition does not equal the current verbatim operator input");
    const decision = this.openDecisions.get(decision_id); reject(decision === undefined, "operator disposition is not tied to an open decision");
    const explicit = confirmationOutcome(operator_response); let substantive = operator_response; const pending = this.pendingDispositions.get(decision_id);
    const makeReceipt = (response, confirmation) => ({ version: 1, receipt_id: `disposition-${randomUUID()}`, change_id: this.changeId, exchange_id: decision.exchange_id, trace_id: this.traceId,
      decision_id, decision_packet_id: decision.packet_id, outcome, operator_response: response, confirmation, captured_at: now() });
    if (pending === undefined && explicit === undefined) {
      const retained = { decision_id, decision_packet_id: decision.packet_id, exchange_id: decision.exchange_id, outcome, operator_response };
      await this.record("disposition-pending", { pending: retained }); throw new AlignmentContractError("substantive operator disposition retained; require another operator turn with the exact confirmation token: accept, reject, reshape, or opt-out");
    }
    if (pending !== undefined) {
      reject(pending.decision_packet_id !== decision.packet_id || pending.exchange_id !== decision.exchange_id || pending.outcome !== outcome, "operator disposition confirmation does not match the retained decision and outcome");
      reject(explicit === undefined || explicit !== pending.outcome, "operator disposition still requires its exact confirmation token: accept, reject, reshape, or opt-out"); substantive = pending.operator_response;
    } else reject(explicit !== outcome, "operator disposition needs the exact confirmation token for the proposed outcome: accept, reject, reshape, or opt-out");
    const receipt = makeReceipt(substantive, operator_response); await this.record("disposition", { receipt }); return receipt;
  }
  async createArtifact({ kind, title, body, provenance }) {
    reject(this.closed || this.finalizing, "alignment session is closed"); reject(!["markdown", "diagram", "static-page"].includes(kind), "artifact kind is unsupported");
    reject(typeof title !== "string" || title.length === 0 || title.length > 200, "artifact title is malformed"); reject(typeof body !== "string" || body.length === 0 || body.length > 100000, "artifact body is malformed");
    reject(!Array.isArray(provenance) || provenance.length === 0 || new Set(provenance).size !== provenance.length || provenance.some((value) => typeof value !== "string" || !this.provenanceIds.has(value)), "artifact provenance must contain only supplied material or source references accepted in this session");
    reject(kind === "static-page" && /<\s*script\b|\bon[a-z]+\s*=|javascript\s*:|<\s*(?:iframe|object|embed|link|meta)\b/i.test(body), "static page body contains active content");
    const artifactId = `artifact-${randomUUID()}`; const extension = kind === "static-page" ? "html" : kind === "diagram" ? "mmd" : "md"; const path = join(this.channelRoot, "presentations", `${artifactId}.${extension}`);
    const rendered = kind === "static-page" ? `<!doctype html><html><head><meta charset="utf-8"><title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title></head><body><pre>${body.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n` : `${body}\n`;
    await writeFile(path, rendered, { encoding: "utf8", flag: "wx", mode: 0o600 }); const digest = sha256(Buffer.from(rendered));
    await this.record("artifact", { artifact_id: artifactId, kind, title, provenance: [...provenance], sha256: digest });
    return { artifact_id: artifactId, kind, title, provenance: [...provenance], source_references: provenance.map((id) => this.sourceReferences.get(id)).filter(Boolean), sha256: digest, temporary: true, automatically_opened: false };
  }
  waitForNotificationDrains() { return this.activeNotificationDrains === 0 ? Promise.resolve() : new Promise((resolve) => this.notificationDrainWaiters.push(resolve)); }
  async drainNotifications(force = false) {
    if (this.closed || (this.finalizing && !force)) return; this.activeNotificationDrains += 1;
    try {
      const names = (await readdir(join(this.channelRoot, "notifications"))).filter((name) => /^notification-[0-9a-f-]{36}\.json$/.test(name)).sort();
      for (const name of names) {
        const source = join(this.channelRoot, "notifications", name); const claimed = `${source}.claimed`;
        try { await rename(source, claimed); } catch (error) { if (error?.code === "ENOENT") continue; throw error; }
        let packet;
        try { packet = await readJsonDirect(claimed, "unsolicited orchestrator projection"); await this.acceptProjection(packet, "notification"); await rm(claimed); }
        catch (error) { try { await rename(claimed, source); } catch { throw new AlignmentContractError("notification append failed and its only packet could not be restored"); } throw error; }
        this.pi.sendUserMessage(`Typed orchestrator ${packet.kind} packet:\n${JSON.stringify(packet)}`, { deliverAs: "followUp" });
      }
    } finally {
      this.activeNotificationDrains -= 1; if (this.activeNotificationDrains === 0) for (const resolve of this.notificationDrainWaiters.splice(0)) resolve();
    }
  }
  async quiesceNotifications() { clearInterval(this.notificationTimer); this.notificationTimer = null; await this.waitForNotificationDrains(); await this.drainNotifications(true); await this.waitForNotificationDrains(); await this.projectionAcceptanceTail; }
  async drainRecoveredResponses() {
    if (this.closed || this.finalizing) return;
    for (const [exchangeId, request] of this.requestPackets) {
      if (this.directProjectionKinds.has(request.request_id)) continue; const responsePath = join(this.channelRoot, "responses", `${exchangeId}.json`); let packet;
      try { packet = await readJsonDirect(responsePath, "recovered orchestrator response"); } catch (error) { if (String(error?.message).includes("ENOENT")) continue; throw error; }
      await this.acceptProjection(packet, "recovered-direct"); this.pi.sendUserMessage(`Recovered typed orchestrator ${packet.kind} packet:\n${JSON.stringify(packet)}`, { deliverAs: "followUp" });
    }
  }
  async stopOrchestrator(reason = "quit") {
    if (this.orchestratorRunId === null || TERMINAL.has(this.orchestratorLifecycle)) return; let stopError = null;
    try { await this.rpc("stop", { id: this.orchestratorRunId }, Math.min(RPC_TIMEOUT_MS, this.stopTimeoutMs)); }
    catch (error) {
      stopError = error;
      try {
        const status = await this.rpc("status", { id: this.orchestratorRunId }, Math.min(2000, this.stopTimeoutMs));
        reject(runStateFromStatus(status, this.orchestratorRunId) !== "running", "portable orchestrator stop requires exact running status proof");
        const ownerSessionFile = this.recoveredRunId !== null && this.resumeFromSessionFile !== null ? this.resumeFromSessionFile : this.piSessionFile;
        reject(ownerSessionFile === null, "portable orchestrator stop requires its owning Pi session file");
        await this.requestRunStop({ asyncRunRoot: this.asyncRunRoot, runId: this.orchestratorRunId, ownerSessionFile, reason }); stopError = null;
      } catch (fallbackError) {
        stopError = new AlignmentContractError(`${error instanceof Error ? error.message : String(error)}; portable stop: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }
    try {
      let terminal = null; const deadline = Date.now() + this.stopTimeoutMs;
      while (Date.now() < deadline) {
        if (TERMINAL.has(this.orchestratorLifecycle)) { terminal = this.orchestratorLifecycle; break; }
        try { terminal = terminalStateFromStatus(await this.rpc("status", { id: this.orchestratorRunId }, Math.min(2000, this.stopTimeoutMs)), this.orchestratorRunId); } catch { /* missing or foreign status is not proof */ }
        if (terminal !== null) break; await new Promise((resolve) => setTimeout(resolve, Math.min(100, this.stopTimeoutMs)));
      }
      reject(terminal === null, `orchestrator stop was requested but no terminal lifecycle was proven${stopError instanceof Error ? `; stop RPC: ${stopError.message}` : ""}`);
      if (!TERMINAL.has(this.orchestratorLifecycle)) await this.record("orchestrator-terminal", { run_id: this.orchestratorRunId, state: terminal, proof: "status" });
    } catch (error) {
      await this.record("recovery", { run_id: this.orchestratorRunId, reason, error: error instanceof Error ? error.message : String(error) });
      throw new AlignmentContractError(`orchestrator terminal state was not proven; recovery state was retained in the native Pi session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async prepareReplacement(reason, targetPiSessionFile = null) {
    reject(!REPLACEMENT_REASONS.has(reason), "alignment replacement reason is unsupported"); if (this.continuationPrepared) return;
    reject(this.piSessionFile === null, "cannot preserve alignment state without a persistent Pi session file"); const target = sessionFile(targetPiSessionFile, "replacement Pi session file", true); this.finalizing = true;
    try {
      reject(this.pendingExchanges !== 0 || [...this.requestPackets.values()].some((request) => !this.directProjectionKinds.has(request.request_id)), "cannot replace while an alignment exchange is pending");
      await this.quiesceNotifications(); await this.stopOrchestrator(reason); this.unsubscribeAsync?.(); this.unsubscribeAsync = null;
      await this.record("session-replacement", { reason, from_pi_session_file: this.piSessionFile, target_pi_session_file: target, orchestrator_lifecycle: this.orchestratorLifecycle });
      this.continuationPrepared = true; this.closed = true; this.clearChannelEnvironment(); await rm(this.channelRoot, { recursive: true, force: true });
    } catch (error) { this.finalizing = false; this.startNotificationPolling(); throw error; }
  }
  async finalize() {
    if (this.completionState !== null) return this.completionState;
    reject(this.pendingExchanges !== 0 || [...this.requestPackets.values()].some((request) => !this.directProjectionKinds.has(request.request_id)), "cannot complete while an alignment exchange is pending");
    reject(this.changeId === null, "cannot complete before a Change identity is established"); reject(this.openDecisions.size !== 0 || this.pendingDispositions.size !== 0, "cannot complete while an operator decision is open");
    this.finalizing = true; await this.quiesceNotifications();
    if (this.openDecisions.size !== 0 || this.pendingDispositions.size !== 0) { this.finalizing = false; this.startNotificationPolling(); throw new AlignmentContractError("cannot complete while an operator decision is open"); }
    await this.stopOrchestrator("finalized"); this.unsubscribeAsync?.(); this.unsubscribeAsync = null;
    const state = { version: 1, change_id: this.changeId, trace_id: this.traceId, session_id: this.sessionId, completed_at: now(), orchestrator_lifecycle: this.orchestratorLifecycle, root_session_file: this.piSessionFile };
    await this.record("completion", { state }); this.closed = true; this.clearChannelEnvironment(); await rm(this.channelRoot, { recursive: true, force: true }); return this.completionState;
  }
  async shutdown(reason = "quit", options = {}) {
    if (this.continuationPrepared || this.completionState !== null) return this.completionState; if (this.recoveredRunId !== null) return null;
    if (REPLACEMENT_REASONS.has(reason)) { await this.prepareReplacement(reason, options.targetPiSessionFile ?? null); return null; }
    this.finalizing = true; await this.quiesceNotifications(); await this.stopOrchestrator(reason); this.unsubscribeAsync?.(); this.unsubscribeAsync = null;
    await this.record("shutdown", { reason, orchestrator_lifecycle: this.orchestratorLifecycle }); this.closed = true; this.clearChannelEnvironment(); await rm(this.channelRoot, { recursive: true, force: true }); return null;
  }
}

export const alignmentBrokerConstants = Object.freeze({
  RPC_REQUEST, CUSTOM_TYPE, MAX_NATIVE_SESSION_BYTES, MAX_NATIVE_SESSION_LINE_BYTES, MAX_CHILD_CONTINUITY_BYTES, ORCHESTRATOR_TASK,
});
