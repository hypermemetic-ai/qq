// @ts-nocheck

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  appendFile, chmod, lstat, mkdir, open, readdir, realpath, rename, rm, writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  AlignmentContractError,
  validateAlignerRequest,
  validateDispositionReceipt,
  validateEvidenceCapability,
  validateOrchestratorProjection,
  validateSealedPackage,
  validateTraceReference,
} from "./qq-alignment-contracts.ts";

const RPC_REQUEST = "subagents:rpc:v1:request";
const RPC_READY = "subagents:rpc:v1:ready";
const MAX_OPEN_BYTES = 65536;
// Evidence is a bounded orientation channel, not a storage API. Four MiB is
// the existing sealed-journal bound and caps every exact evidence object.
const MAX_EVIDENCE_OBJECT_BYTES = 4 * 1024 * 1024;
const MAX_ALIGNMENT_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const STREAM_CHUNK_BYTES = 64 * 1024;
const RPC_TIMEOUT_MS = 30000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPLACEMENT_REASONS = new Set(["reload", "new", "resume", "fork"]);
const ORCHESTRATOR_TASK = `You are qq's sole internal orchestrator for this visible alignment session. Read AGENTS.md and CONCEPTS.md completely, then use qq_alignment_receive to wait for typed requests. For each request, perform or delegate only the execution work it calls for, preserving operator-facing authority with the aligner. Reply exactly once with qq_alignment_reply. Continue receiving until shutdown; there is no exchange-count or anti-chatter cap. Never address the operator or invent a disposition.`;

function now() {
  return new Date().toISOString();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function within(candidate, parent) {
  const rel = relative(parent, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel));
}

async function insideGitWorktree(path) {
  let cursor = path;
  while (true) {
    try {
      const marker = await lstat(join(cursor, ".git"));
      if (marker.isDirectory() || marker.isFile()) return true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const parent = dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

async function privateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new AlignmentContractError(`private runtime path is not a direct directory: ${path}`);
  const uid = process.geteuid?.();
  if (uid !== undefined && info.uid !== uid) throw new AlignmentContractError(`private runtime path is foreign-owned: ${path}`);
  if ((info.mode & 0o777) !== 0o700) await chmod(path, 0o700);
}

async function atomicJson(path, value) {
  await privateDirectory(dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

async function inspectDirectRegular(path, label, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_EVIDENCE_OBJECT_BYTES;
  let handle;
  try {
    const initial = await lstat(path);
    if (initial.isSymbolicLink() || !initial.isFile()) throw new AlignmentContractError(`${label} is not a direct regular file`);
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.dev !== initial.dev || info.ino !== initial.ino) throw new AlignmentContractError(`${label} changed identity while opening`);
    if (info.size > maxBytes) throw new AlignmentContractError(`${label} exceeds the ${maxBytes}-byte object bound`);
    const range = options.range ?? null;
    if (range !== null && (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.length)
      || range.start < 0 || range.length < 0 || range.start + range.length > info.size)) {
      throw new AlignmentContractError(`${label} requested range is outside the exact file`);
    }
    const captured = options.captureAll ? Buffer.alloc(info.size) : range === null ? null : Buffer.alloc(range.length);
    const digest = createHash("sha256");
    const decoder = options.validateUtf8 === false ? null : new TextDecoder("utf-8", { fatal: true });
    const chunk = Buffer.allocUnsafe(STREAM_CHUNK_BYTES);
    let position = 0;
    while (position < info.size) {
      const requested = Math.min(chunk.length, info.size - position);
      const { bytesRead } = await handle.read(chunk, 0, requested, position);
      if (bytesRead < 1) throw new AlignmentContractError(`${label} changed size while reading`);
      const bytes = chunk.subarray(0, bytesRead);
      digest.update(bytes);
      if (bytes.includes(0)) throw new AlignmentContractError(`${label} contains binary NUL data`);
      if (decoder !== null) decoder.decode(bytes, { stream: true });
      if (options.captureAll) bytes.copy(captured, position);
      else if (range !== null) {
        const overlapStart = Math.max(position, range.start);
        const overlapEnd = Math.min(position + bytesRead, range.start + range.length);
        if (overlapStart < overlapEnd) bytes.copy(captured, overlapStart - range.start, overlapStart - position, overlapEnd - position);
      }
      position += bytesRead;
    }
    if (decoder !== null) decoder.decode();
    const afterHandle = await handle.stat();
    const after = await lstat(path);
    if (after.isSymbolicLink() || !after.isFile() || after.dev !== info.dev || after.ino !== info.ino
      || afterHandle.dev !== info.dev || afterHandle.ino !== info.ino || afterHandle.size !== info.size
      || afterHandle.mtimeMs !== info.mtimeMs || afterHandle.ctimeMs !== info.ctimeMs) {
      throw new AlignmentContractError(`${label} changed identity while reading`);
    }
    return { info, digest: digest.digest("hex"), bytes: captured };
  } catch (error) {
    if (error instanceof AlignmentContractError) throw error;
    if (error instanceof TypeError && String(error.message).includes("encoded data was not valid")) {
      throw new AlignmentContractError(`${label} is not valid UTF-8 text`);
    }
    throw new AlignmentContractError(`${label} cannot be opened without following links: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await handle?.close().catch(() => {});
  }
}

function stateBase(override) {
  if (override !== undefined) return override;
  if (process.env.XDG_STATE_HOME !== undefined) {
    if (!isAbsolute(process.env.XDG_STATE_HOME)) throw new AlignmentContractError("XDG_STATE_HOME must be absolute");
    return join(process.env.XDG_STATE_HOME, "qq", "alignment");
  }
  return join(homedir(), ".local", "state", "qq", "alignment");
}

function runtimeBase(override) {
  if (override !== undefined) return override;
  if (process.env.QQ_DISPATCH_RUNTIME_ROOT !== undefined) {
    if (!isAbsolute(process.env.QQ_DISPATCH_RUNTIME_ROOT)) throw new AlignmentContractError("QQ_DISPATCH_RUNTIME_ROOT must be absolute");
    return join(process.env.QQ_DISPATCH_RUNTIME_ROOT, "alignment");
  }
  const uid = process.getuid?.() ?? process.geteuid?.();
  if (process.env.XDG_RUNTIME_DIR !== undefined) {
    if (!isAbsolute(process.env.XDG_RUNTIME_DIR)) throw new AlignmentContractError("XDG_RUNTIME_DIR must be absolute");
    return join(process.env.XDG_RUNTIME_DIR, "qq", "alignment");
  }
  if (uid === undefined) throw new AlignmentContractError("cannot derive a private alignment runtime without a uid");
  return join(tmpdir(), `qq-alignment-${uid}`);
}

async function readJsonDirect(path, label) {
  try {
    const { bytes } = await inspectDirectRegular(path, label, { maxBytes: MAX_JSON_BYTES, captureAll: true });
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof AlignmentContractError && !error.message.includes("is malformed")) throw error;
    throw new AlignmentContractError(`${label} is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function decodeText(bytes, label) {
  if (bytes.includes(0)) throw new AlignmentContractError(`${label} contains binary NUL data`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AlignmentContractError(`${label} is not valid UTF-8 text`);
  }
}

function terminalStateFromStatus(status, expectedRunId) {
  if (status === null || typeof status !== "object" || typeof status.text !== "string") return null;
  const lines = status.text.split(/\r?\n/u);
  const runs = lines.map((line) => line.match(/^Run: (.+)$/u)?.[1]).filter(Boolean);
  const states = lines.map((line) => line.match(/^State: ([a-z]+)$/u)?.[1]).filter(Boolean);
  if (runs.length !== 1 || runs[0] !== expectedRunId || states.length !== 1) return null;
  return ["stopped", "complete", "failed"].includes(states[0]) ? states[0] : null;
}

function sessionFile(value, label, optional = false) {
  if (optional && (value === null || value === undefined)) return null;
  if (typeof value !== "string" || !isAbsolute(value)) throw new AlignmentContractError(`${label} must be an absolute path`);
  return value;
}

function continuationKey(value) {
  return sha256(Buffer.from(value));
}

function exactObject(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new AlignmentContractError(`${label} has the wrong shape`);
  }
  return value;
}

function confirmationOutcome(value) {
  return new Map([
    ["accept", "accepted"],
    ["reject", "rejected"],
    ["reshape", "reshaped"],
    ["opt-out", "opted-out"],
  ]).get(value);
}

async function validateEvidenceProposal(channelRoot, capabilityId, expected) {
  const proposalPath = join(channelRoot, "evidence", `${capabilityId}.json`);
  const capability = validateEvidenceCapability(await readJsonDirect(proposalPath, "projected evidence proposal"));
  if (capability.capability_id !== capabilityId
    || capability.issuer_session_id !== expected.sessionId
    || capability.change_id !== expected.changeId
    || capability.issuing_exchange_id !== expected.exchangeId) {
    throw new AlignmentContractError("projected evidence proposal is stale or foreign");
  }
  const canonical = await realpath(capability.canonical_target);
  if (canonical !== capability.canonical_target) throw new AlignmentContractError("evidence target is no longer canonical");
  const { info, digest } = await inspectDirectRegular(capability.canonical_target, "evidence target");
  const allowedEnd = capability.allowed_range.start + capability.allowed_range.length;
  if (allowedEnd > info.size) throw new AlignmentContractError("evidence allowed range is outside the exact file");
  if (Date.parse(capability.retention_until) <= Date.now()) throw new AlignmentContractError("evidence capability has expired");
  if (info.dev !== capability.device || info.ino !== capability.inode) throw new AlignmentContractError("evidence target identity drifted before broker promotion");
  if (digest !== capability.sha256) throw new AlignmentContractError("evidence target digest drifted before broker promotion");
  return capability;
}

export async function registerEvidenceCapability(channelRoot, input) {
  const allowed = new Set(["change_id", "exchange_id", "target", "media_type", "start", "length", "retention_until"]);
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new AlignmentContractError("evidence registration must be an object");
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new AlignmentContractError(`evidence registration has unknown field '${key}'`);
  for (const key of allowed) if (!(key in input)) throw new AlignmentContractError(`evidence registration is missing '${key}'`);
  if (!isAbsolute(input.target)) throw new AlignmentContractError("evidence target must be absolute");
  const canonical = await realpath(input.target);
  if (canonical !== input.target) throw new AlignmentContractError("evidence target must already be canonical and may not traverse a symlink");
  const { info: before, digest } = await inspectDirectRegular(input.target, "evidence target");
  if (!Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.length) || input.start < 0 || input.length < 1 || input.start + input.length > before.size) {
    throw new AlignmentContractError("evidence allowed range is outside the exact file");
  }
  const retention = Date.parse(input.retention_until);
  if (Number.isNaN(retention) || retention <= Date.now()) throw new AlignmentContractError("evidence retention must be a future date-time");
  const session = await readJsonDirect(join(channelRoot, "session.json"), "alignment channel session");
  const capability = {
    version: 1,
    capability_id: `cap-${randomUUID()}`,
    change_id: input.change_id,
    canonical_target: canonical,
    allowed_range: { start: input.start, length: input.length },
    media_type: input.media_type,
    sha256: digest,
    device: before.dev,
    inode: before.ino,
    issuing_exchange_id: input.exchange_id,
    retention_until: input.retention_until,
    issuer_session_id: session.session_id,
  };
  validateEvidenceCapability(capability);
  await atomicJson(join(channelRoot, "evidence", `${capability.capability_id}.json`), capability);
  return capability;
}

export class AlignmentBroker {
  constructor(pi, options = {}) {
    this.pi = pi;
    this.cwd = options.cwd;
    this.stateRoot = stateBase(options.stateRoot);
    this.runtimeRoot = runtimeBase(options.runtimeRoot);
    this.exchangeTimeoutMs = options.exchangeTimeoutMs ?? null;
    this.stopTimeoutMs = options.stopTimeoutMs ?? RPC_TIMEOUT_MS;
    this.pollMs = options.pollMs ?? 25;
    this.sessionId = options.sessionId ?? `session-${randomUUID()}`;
    this.traceId = options.traceId ?? (process.env.QQ_TRACE_ID?.match(/^[0-9a-f]{32}$/)?.[0] ?? randomBytes(16).toString("hex"));
    this.brokerSpanId = randomBytes(8).toString("hex");
    this.piSessionFile = sessionFile(options.piSessionFile, "Pi session file", true);
    this.resumeFromSessionFile = sessionFile(options.resumeFromSessionFile, "previous Pi session file", true);
    this.sessionReason = options.sessionReason ?? "startup";
    this.channelRoot = join(this.runtimeRoot, this.sessionId);
    this.sessionStateRoot = join(this.stateRoot, "sessions", this.sessionId);
    this.journalPath = join(this.sessionStateRoot, "journal.jsonl");
    this.rootSessionFiles = new Set(this.piSessionFile === null ? [] : [this.piSessionFile]);
    this.changeId = null;
    this.lastOperatorText = null;
    this.lastProjectionId = this.traceId;
    this.exchanges = new Set();
    this.requests = new Set();
    this.requestPackets = new Map();
    this.directProjectionKinds = new Map();
    this.projectionAcceptanceTail = Promise.resolve();
    this.pendingExchanges = 0;
    this.projections = new Set();
    this.decisionIds = new Set();
    this.dispositions = new Map();
    this.openDecisions = new Map();
    this.pendingDispositions = new Map();
    this.evidenceIds = new Set();
    this.workerRunIds = new Set();
    this.traceReferences = new Map();
    this.orchestratorRunId = null;
    this.orchestratorLifecycle = "not-started";
    this.workflowLifecycle = "not-started";
    this.sealedPackage = null;
    this.started = false;
    this.closed = false;
    this.sealing = false;
    this.journalClosed = false;
    this.unsubscribeReady = null;
    this.unsubscribeAsync = null;
    this.earlyAsyncCompletions = new Map();
    this.notificationTimer = null;
    this.activeNotificationDrains = 0;
    this.notificationDrainWaiters = [];
    this.continuationClaimPath = null;
    this.continuationPrepared = false;
    this.resumed = false;
  }

  continuationPath(piSessionFile) {
    return join(this.stateRoot, "continuations", `${continuationKey(piSessionFile)}.json`);
  }

  async restoreContinuation(continuation, source) {
    exactObject(continuation, [
      "version", "state", "from_pi_session_file", "target_pi_session_file", "prepared_at",
      "alignment_session_id", "trace_id", "journal_sha256",
    ], "alignment continuation");
    if (continuation.version !== 1 || continuation.state !== "ready"
      || continuation.from_pi_session_file !== source
      || !ID_PATTERN.test(continuation.alignment_session_id)
      || typeof continuation.trace_id !== "string" || !/^[0-9a-f]{32}$/.test(continuation.trace_id)
      || typeof continuation.journal_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(continuation.journal_sha256)
      || (continuation.target_pi_session_file !== null && !isAbsolute(continuation.target_pi_session_file))
      || typeof continuation.prepared_at !== "string" || Number.isNaN(Date.parse(continuation.prepared_at))) {
      throw new AlignmentContractError("alignment continuation identity is malformed");
    }
    if (continuation.target_pi_session_file !== null && continuation.target_pi_session_file !== this.piSessionFile) {
      throw new AlignmentContractError("alignment continuation targets another Pi session");
    }
    const journalPath = join(this.stateRoot, "sessions", continuation.alignment_session_id, "journal.jsonl");
    const journal = await inspectDirectRegular(journalPath, "authoritative alignment journal", {
      maxBytes: MAX_ALIGNMENT_JOURNAL_BYTES,
      captureAll: true,
    });
    if (journal.digest !== continuation.journal_sha256) throw new AlignmentContractError("alignment continuation journal digest drifted");
    let lines;
    try { lines = new TextDecoder("utf-8", { fatal: true }).decode(journal.bytes).trimEnd().split("\n"); }
    catch { throw new AlignmentContractError("authoritative alignment journal is not UTF-8"); }
    if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) throw new AlignmentContractError("authoritative alignment journal is empty");

    const rootSessionFiles = new Set();
    let changeId = null;
    let lastOperatorText = null;
    let lastProjectionId = continuation.trace_id;
    let workflowLifecycle = "not-started";
    const exchanges = new Set();
    const requests = new Set();
    const requestPackets = new Map();
    const directProjectionKinds = new Map();
    const projections = new Set();
    const decisionIds = new Set();
    const dispositions = new Map();
    const disposedDecisions = new Set();
    const openDecisions = new Map();
    const pendingDispositions = new Map();
    const evidenceIds = new Set();
    const workerRunIds = new Set();
    const traceReferences = new Map();
    const journalIds = new Set();
    let sawIdentity = false;
    let finalStart = null;
    let finalTerminal = null;
    let replacement = null;

    for (let index = 0; index < lines.length; index += 1) {
      let entry;
      try { entry = JSON.parse(lines[index]); }
      catch { throw new AlignmentContractError(`authoritative alignment journal line ${index + 1} is malformed`); }
      exactObject(entry, ["version", "journal_entry_id", "at", "type", "payload"], `alignment journal line ${index + 1}`);
      if (entry.version !== 1 || typeof entry.journal_entry_id !== "string" || !ID_PATTERN.test(entry.journal_entry_id)
        || journalIds.has(entry.journal_entry_id) || typeof entry.at !== "string" || Number.isNaN(Date.parse(entry.at))
        || typeof entry.type !== "string" || entry.type.length === 0
        || entry.payload === null || typeof entry.payload !== "object" || Array.isArray(entry.payload)) {
        throw new AlignmentContractError(`authoritative alignment journal line ${index + 1} has invalid identity`);
      }
      journalIds.add(entry.journal_entry_id);
      const payload = entry.payload;
      if (entry.type === "lifecycle") {
        exactObject(payload, ["state", "pi_session_file", "session_id", "trace_id"], "alignment lifecycle journal payload");
        if (!new Set(["starting", "resuming"]).has(payload.state)
          || payload.session_id !== continuation.alignment_session_id || payload.trace_id !== continuation.trace_id
          || (payload.pi_session_file !== null && !isAbsolute(payload.pi_session_file))) {
          throw new AlignmentContractError("alignment journal lifecycle identity is malformed");
        }
        sawIdentity = true;
        if (payload.pi_session_file !== null) rootSessionFiles.add(payload.pi_session_file);
      } else if (entry.type === "operator-input") {
        exactObject(payload, ["source", "verbatim"], "operator input journal payload");
        if (typeof payload.source !== "string" || typeof payload.verbatim !== "string" || payload.verbatim.length === 0) throw new AlignmentContractError("operator input journal payload is malformed");
        lastOperatorText = payload.verbatim;
      } else if (entry.type === "aligner-request") {
        exactObject(payload, ["packet"], "aligner request journal payload");
        const packet = validateAlignerRequest(payload.packet);
        if (packet.trace_id !== continuation.trace_id || packet.operator_text !== lastOperatorText || packet.reply_to !== lastProjectionId
          || (changeId !== null && packet.change_id !== changeId) || exchanges.has(packet.exchange_id) || requests.has(packet.request_id)) {
          throw new AlignmentContractError("continuation request correlation is malformed");
        }
        if (packet.kind === "disposition") {
          const receipt = dispositions.get(packet.payload.receipt.receipt_id);
          if (receipt === undefined || !isDeepStrictEqual(receipt, packet.payload.receipt) || receipt.confirmation !== packet.operator_text) {
            throw new AlignmentContractError("continuation disposition request is not journal-backed");
          }
        }
        changeId ??= packet.change_id;
        exchanges.add(packet.exchange_id); requests.add(packet.request_id); requestPackets.set(packet.exchange_id, packet);
      } else if (entry.type === "orchestrator-projection" || entry.type === "orchestrator-unsolicited") {
        exactObject(payload, ["packet", "evidence_capabilities", "broker_span_id"], "orchestrator projection journal payload");
        const packet = validateOrchestratorProjection(payload.packet);
        const request = requestPackets.get(packet.exchange_id);
        if (!/^[0-9a-f]{16}$/.test(payload.broker_span_id) || request === undefined || packet.change_id !== changeId
          || packet.trace_id !== continuation.trace_id || packet.reply_to !== request.request_id || projections.has(packet.packet_id)
          || !Array.isArray(payload.evidence_capabilities)
          || payload.evidence_capabilities.length !== packet.material.evidence_capability_ids.length) {
          throw new AlignmentContractError("continuation projection correlation is malformed");
        }
        for (let capabilityIndex = 0; capabilityIndex < payload.evidence_capabilities.length; capabilityIndex += 1) {
          const capability = validateEvidenceCapability(payload.evidence_capabilities[capabilityIndex]);
          if (capability.capability_id !== packet.material.evidence_capability_ids[capabilityIndex]
            || capability.issuer_session_id !== continuation.alignment_session_id || capability.change_id !== changeId
            || capability.issuing_exchange_id !== packet.exchange_id || evidenceIds.has(capability.capability_id)) {
            throw new AlignmentContractError("continuation evidence lineage is malformed");
          }
          evidenceIds.add(capability.capability_id);
        }
        if (entry.type === "orchestrator-projection") {
          if (directProjectionKinds.has(packet.reply_to)) throw new AlignmentContractError("continuation request has more than one direct response");
          directProjectionKinds.set(packet.reply_to, packet.kind);
        } else if (!new Set(["ack", "status"]).has(directProjectionKinds.get(packet.reply_to))
          || !new Set(["decision", "completion", "failure"]).has(packet.kind)) {
          throw new AlignmentContractError("continuation unsolicited projection is stale, foreign, or unsupported");
        }
        if (packet.material.decision !== null) {
          const decision = packet.material.decision;
          if (decision.issued_for_operator_text !== request.operator_text || decisionIds.has(decision.decision_id)) throw new AlignmentContractError("continuation decision lineage is malformed");
          decisionIds.add(decision.decision_id);
          openDecisions.set(decision.decision_id, { ...decision, packet_id: packet.packet_id, exchange_id: packet.exchange_id });
        }
        for (const runId of packet.material.worker_run_ids) workerRunIds.add(runId);
        projections.add(packet.packet_id);
        lastProjectionId = packet.packet_id;
        workflowLifecycle = packet.lifecycle;
        traceReferences.set(entry.journal_entry_id, { trace_id: continuation.trace_id, span_id: payload.broker_span_id, journal_entry_id: entry.journal_entry_id });
      } else if (entry.type === "operator-disposition-pending") {
        exactObject(payload, ["pending"], "pending disposition journal payload");
        const pending = payload.pending;
        exactObject(pending, ["decision_id", "decision_packet_id", "exchange_id", "outcome", "operator_response"], "pending disposition");
        const decision = openDecisions.get(pending.decision_id);
        if (decision === undefined || decision.packet_id !== pending.decision_packet_id || decision.exchange_id !== pending.exchange_id
          || !new Set(["accepted", "rejected", "reshaped", "opted-out"]).has(pending.outcome)
          || typeof pending.operator_response !== "string" || pending.operator_response.length === 0
          || pending.operator_response !== lastOperatorText || pendingDispositions.has(pending.decision_id)) {
          throw new AlignmentContractError("continuation pending disposition lineage is malformed");
        }
        pendingDispositions.set(pending.decision_id, pending);
      } else if (entry.type === "operator-disposition") {
        exactObject(payload, ["receipt"], "operator disposition journal payload");
        const receipt = validateDispositionReceipt(payload.receipt);
        const decision = openDecisions.get(receipt.decision_id);
        const pending = pendingDispositions.get(receipt.decision_id);
        if (receipt.change_id !== changeId || receipt.trace_id !== continuation.trace_id || decision === undefined
          || receipt.decision_packet_id !== decision.packet_id || receipt.exchange_id !== decision.exchange_id
          || confirmationOutcome(receipt.confirmation) !== receipt.outcome || receipt.confirmation !== lastOperatorText
          || dispositions.has(receipt.receipt_id) || disposedDecisions.has(receipt.decision_id)
          || (pending === undefined && receipt.operator_response !== receipt.confirmation)
          || (pending !== undefined && (pending.outcome !== receipt.outcome || pending.operator_response !== receipt.operator_response
            || pending.decision_packet_id !== receipt.decision_packet_id || pending.exchange_id !== receipt.exchange_id))) {
          throw new AlignmentContractError("continuation disposition lineage is malformed");
        }
        dispositions.set(receipt.receipt_id, receipt); disposedDecisions.add(receipt.decision_id);
        openDecisions.delete(receipt.decision_id); pendingDispositions.delete(receipt.decision_id);
      } else if (entry.type === "evidence-open") {
        exactObject(payload, ["capability_id", "offset", "length", "digest", "broker_span_id"], "evidence open journal payload");
        if (!evidenceIds.has(payload.capability_id) || !/^[0-9a-f]{64}$/.test(payload.digest)
          || !/^[0-9a-f]{16}$/.test(payload.broker_span_id) || !Number.isSafeInteger(payload.offset)
          || !Number.isSafeInteger(payload.length) || payload.offset < 0 || payload.length < 1) {
          throw new AlignmentContractError("continuation evidence open lineage is malformed");
        }
        traceReferences.set(entry.journal_entry_id, { trace_id: continuation.trace_id, span_id: payload.broker_span_id, journal_entry_id: entry.journal_entry_id });
      } else if (entry.type === "orchestrator-start") {
        exactObject(payload, ["run_id", "trace_id", "resumed"], "orchestrator start journal payload");
        if (!ID_PATTERN.test(payload.run_id) || payload.trace_id !== continuation.trace_id || typeof payload.resumed !== "boolean") throw new AlignmentContractError("continuation orchestrator start is malformed");
        finalStart = { runId: payload.run_id, index };
        finalTerminal = null;
      } else if (entry.type === "orchestrator-stop") {
        exactObject(payload, ["run_id", "reason", "proven", "terminal"], "orchestrator stop journal payload");
        if (finalStart === null || payload.run_id !== finalStart.runId || payload.proven !== true
          || !new Set(["stopped", "complete", "failed"]).has(payload.terminal) || typeof payload.reason !== "string") {
          throw new AlignmentContractError("continuation orchestrator stop is not exact-run terminal proof");
        }
        if (finalTerminal !== null && finalTerminal.state !== payload.terminal) throw new AlignmentContractError("continuation terminal proof conflicts for the exact run");
        finalTerminal = { state: payload.terminal, index };
      } else if (entry.type === "orchestrator-async-complete") {
        exactObject(payload, ["run_id", "state"], "orchestrator async completion journal payload");
        if (finalStart === null || payload.run_id !== finalStart.runId || !new Set(["stopped", "complete", "failed"]).has(payload.state)) {
          throw new AlignmentContractError("continuation async completion is not exact-run terminal proof");
        }
        if (finalTerminal !== null && finalTerminal.state !== payload.state) throw new AlignmentContractError("continuation terminal proof conflicts for the exact run");
        finalTerminal = { state: payload.state, index };
      } else if (entry.type === "session-replacement") {
        exactObject(payload, ["reason", "from_pi_session_file", "target_pi_session_file", "orchestrator_lifecycle", "alignment_session_id", "trace_id"], "session replacement journal payload");
        replacement = { payload, index };
      } else if (entry.type === "sealed") {
        throw new AlignmentContractError("sealed journal cannot be resumed");
      }
    }
    if (!sawIdentity || !rootSessionFiles.has(source) || replacement === null || replacement.index !== lines.length - 1
      || replacement.payload.from_pi_session_file !== source
      || replacement.payload.target_pi_session_file !== continuation.target_pi_session_file
      || replacement.payload.alignment_session_id !== continuation.alignment_session_id
      || replacement.payload.trace_id !== continuation.trace_id || !REPLACEMENT_REASONS.has(replacement.payload.reason)
      || finalStart === null || finalTerminal === null || finalTerminal.index <= finalStart.index
      || replacement.payload.orchestrator_lifecycle !== finalTerminal.state
      || directProjectionKinds.size !== requests.size) {
      throw new AlignmentContractError("alignment continuation lacks a continuous journal-backed lineage");
    }
    for (const decisionId of decisionIds) {
      if (!openDecisions.has(decisionId) && !disposedDecisions.has(decisionId)) throw new AlignmentContractError("continuation decision membership is incomplete");
    }

    this.sessionId = continuation.alignment_session_id;
    this.traceId = continuation.trace_id;
    this.rootSessionFiles = rootSessionFiles;
    if (this.piSessionFile !== null) this.rootSessionFiles.add(this.piSessionFile);
    this.changeId = changeId;
    this.lastOperatorText = lastOperatorText;
    this.lastProjectionId = lastProjectionId;
    this.exchanges = exchanges;
    this.requests = requests;
    this.requestPackets = requestPackets;
    this.directProjectionKinds = directProjectionKinds;
    this.projections = projections;
    this.decisionIds = decisionIds;
    this.dispositions = dispositions;
    this.openDecisions = openDecisions;
    this.pendingDispositions = pendingDispositions;
    this.evidenceIds = evidenceIds;
    this.workerRunIds = workerRunIds;
    this.traceReferences = traceReferences;
    this.workflowLifecycle = workflowLifecycle;
    this.orchestratorRunId = null;
    this.orchestratorLifecycle = "not-started";
  }

  async claimContinuation() {
    const source = this.resumeFromSessionFile ?? (this.sessionReason === "reload" ? this.piSessionFile : null);
    if (source === null) return false;
    const continuationPath = this.continuationPath(source);
    let continuation;
    try { continuation = await readJsonDirect(continuationPath, "alignment continuation"); }
    catch (error) {
      if (!String(error?.message).includes("ENOENT")) throw error;
      const prefix = `${continuationKey(source)}.claimed-`;
      const entries = await readdir(dirname(continuationPath));
      if (entries.some((name) => name.startsWith(prefix))) throw new AlignmentContractError("alignment continuation is already claimed and unresolved");
      return false;
    }
    if (continuation?.version !== 1 || continuation.from_pi_session_file !== source) throw new AlignmentContractError("alignment continuation identity is malformed");
    if (continuation.state === "blocked") {
      exactObject(continuation, [
        "version", "state", "from_pi_session_file", "target_pi_session_file", "prepared_at",
        "alignment_session_id", "trace_id", "orchestrator_run_id", "error",
      ], "blocked alignment continuation");
      if (!ID_PATTERN.test(continuation.alignment_session_id) || !/^[0-9a-f]{32}$/.test(continuation.trace_id)
        || !ID_PATTERN.test(continuation.orchestrator_run_id) || typeof continuation.error !== "string" || continuation.error.length === 0
        || (continuation.target_pi_session_file !== null && !isAbsolute(continuation.target_pi_session_file))
        || typeof continuation.prepared_at !== "string" || Number.isNaN(Date.parse(continuation.prepared_at))) {
        throw new AlignmentContractError("blocked alignment continuation is malformed");
      }
      throw new AlignmentContractError(`previous alignment shutdown is unresolved: ${continuation.error}`);
    }
    if (continuation.state !== "ready") throw new AlignmentContractError("alignment continuation state is unsupported");
    const claimPath = join(dirname(continuationPath), `${continuationKey(source)}.claimed-${continuationKey(this.piSessionFile ?? source).slice(0, 16)}.json`);
    try { await rename(continuationPath, claimPath); }
    catch (error) { throw new AlignmentContractError(`alignment continuation could not be claimed: ${error instanceof Error ? error.message : String(error)}`); }
    try { await this.restoreContinuation(continuation, source); }
    catch (error) {
      await rename(claimPath, continuationPath).catch(() => {});
      throw error;
    }
    this.continuationClaimPath = claimPath;
    this.resumed = true;
    return true;
  }
  clearChannelEnvironment() {
    if (process.env.QQ_ALIGNMENT_CHANNEL_ROOT === this.channelRoot) delete process.env.QQ_ALIGNMENT_CHANNEL_ROOT;
    if (process.env.QQ_ALIGNMENT_SESSION_ID === this.sessionId) delete process.env.QQ_ALIGNMENT_SESSION_ID;
    if (process.env.QQ_ALIGNMENT_TRACE_ID === this.traceId) delete process.env.QQ_ALIGNMENT_TRACE_ID;
  }

  async initialize() {
    if (this.started) return;
    if (!isAbsolute(this.cwd)) throw new AlignmentContractError("alignment cwd must be absolute");
    const canonicalCwd = await realpath(this.cwd);
    await privateDirectory(this.stateRoot);
    await privateDirectory(this.runtimeRoot);
    const canonicalState = await realpath(this.stateRoot);
    const canonicalRuntime = await realpath(this.runtimeRoot);
    this.stateRoot = canonicalState; this.runtimeRoot = canonicalRuntime;
    await privateDirectory(join(this.stateRoot, "continuations"));
    const resumed = await this.claimContinuation();
    this.channelRoot = join(this.runtimeRoot, this.sessionId);
    this.sessionStateRoot = join(this.stateRoot, "sessions", this.sessionId);
    this.journalPath = join(this.sessionStateRoot, "journal.jsonl");
    if (within(canonicalState, canonicalCwd) || within(canonicalRuntime, canonicalCwd) || await insideGitWorktree(canonicalState) || await insideGitWorktree(canonicalRuntime)) {
      throw new AlignmentContractError("alignment state may not live inside a Git worktree");
    }
    if (within(canonicalState, canonicalRuntime) || within(canonicalRuntime, canonicalState)) {
      throw new AlignmentContractError("authoritative alignment state and writable transport must not overlap");
    }
    for (const path of [
      this.channelRoot,
      join(this.channelRoot, "requests"),
      join(this.channelRoot, "responses"),
      join(this.channelRoot, "notifications"),
      join(this.channelRoot, "evidence"),
      join(this.channelRoot, "presentations"),
      this.sessionStateRoot,
    ]) await privateDirectory(path);
    await atomicJson(join(this.channelRoot, "session.json"), {
      version: 1,
      session_id: this.sessionId,
      trace_id: this.traceId,
      cwd: canonicalCwd,
      created_at: now(),
    });
    process.env.QQ_ALIGNMENT_CHANNEL_ROOT = this.channelRoot;
    process.env.QQ_ALIGNMENT_SESSION_ID = this.sessionId;
    process.env.QQ_ALIGNMENT_TRACE_ID = this.traceId;
    this.started = true;
    await this.journal("lifecycle", {
      state: resumed ? "resuming" : "starting",
      pi_session_file: this.piSessionFile,
      session_id: this.sessionId,
      trace_id: this.traceId,
    });
  }

  async journal(type, payload) {
    if (this.journalClosed) throw new AlignmentContractError("sealed alignment journal is append-closed");
    await privateDirectory(this.sessionStateRoot);
    const entry = { version: 1, journal_entry_id: `journal-${randomUUID()}`, at: now(), type, payload };
    await appendFile(this.journalPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.journalPath, 0o600);
    return entry.journal_entry_id;
  }

  sessionReceipt() {
    return Object.freeze({ version: 1, session_id: this.sessionId, trace_id: this.traceId, reply_to: this.lastProjectionId, orchestrator_run_id: this.orchestratorRunId, lifecycle: this.orchestratorLifecycle });
  }

  recordOperatorInput(text, source = "interactive") {
    if (this.closed || this.sealing || this.journalClosed) throw new AlignmentContractError("alignment session is sealed");
    if (typeof text !== "string" || text.length === 0) throw new AlignmentContractError("operator input is empty");
    this.lastOperatorText = text;
    return this.journal("operator-input", { source, verbatim: text });
  }

  rpc(method, params, timeoutMs = RPC_TIMEOUT_MS) {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      let finished = false;
      const topic = `subagents:rpc:v1:reply:${requestId}`;
      const unsubscribe = this.pi.events.on(topic, (reply) => {
        if (finished || reply?.version !== 1 || reply?.requestId !== requestId) return;
        finished = true;
        clearTimeout(timer);
        unsubscribe?.();
        if (reply.success === true) resolve(reply.data);
        else reject(new AlignmentContractError(`pi-subagents ${method} refused: ${reply?.error?.code ?? "unknown"}: ${reply?.error?.message ?? "no message"}`));
      });
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        unsubscribe?.();
        reject(new AlignmentContractError(`pi-subagents ${method} RPC timed out`));
      }, timeoutMs);
      this.pi.events.emit(RPC_REQUEST, { version: 1, requestId, method, params });
    });
  }

  async startOrchestrator() {
    await this.initialize();
    if (this.orchestratorRunId !== null || this.orchestratorLifecycle !== "not-started") throw new AlignmentContractError("exactly one orchestrator is permitted in an alignment session");
    this.unsubscribeAsync = this.pi.events.on("subagent:async-complete", (event) => { this.handleAsyncComplete(event).catch(() => {}); });
    this.orchestratorLifecycle = "starting";
    const task = this.resumed
      ? `${ORCHESTRATOR_TASK}\nThis alignment session resumed after a proven terminal predecessor. Read the exact prior journal at ${JSON.stringify(this.journalPath)} before receiving the next request; preserve its Change identity, open decisions, worker receipts, and trace continuity.`
      : ORCHESTRATOR_TASK;
    const data = await this.rpc("spawn", { agent: "orchestrator", task, context: "fresh", cwd: this.cwd, async: true });
    const runId = data?.runId ?? data?.id ?? data?.details?.runId;
    if (typeof runId !== "string" || runId.length === 0) throw new AlignmentContractError("pi-subagents spawn returned no orchestrator run id");
    this.orchestratorRunId = runId;
    this.orchestratorLifecycle = "running";
    await this.journal("orchestrator-start", { run_id: runId, trace_id: this.traceId, resumed: this.resumed });
    const earlyCompletion = this.earlyAsyncCompletions.get(runId);
    this.earlyAsyncCompletions.clear();
    if (earlyCompletion !== undefined) await this.handleAsyncComplete(earlyCompletion);
    if (this.orchestratorLifecycle !== "running") throw new AlignmentContractError(`orchestrator ended during startup (${this.orchestratorLifecycle})`);
    if (this.continuationClaimPath !== null) {
      await rm(this.continuationClaimPath, { force: true });
      this.continuationClaimPath = null;
    }
    this.notificationTimer = setInterval(() => this.drainNotifications().catch(() => {}), 250);
    this.notificationTimer.unref?.();
    return runId;
  }

  async handleAsyncComplete(event) {
    const runId = typeof event?.runId === "string" ? event.runId : event?.id;
    if (this.journalClosed || typeof runId !== "string") return;
    if (this.orchestratorRunId === null) {
      if (this.orchestratorLifecycle === "starting") this.earlyAsyncCompletions.set(runId, event);
      return;
    }
    if (runId !== this.orchestratorRunId) return;
    const raw = event?.state ?? event?.status ?? event?.result?.state ?? event?.execution?.status;
    let terminal = null;
    if (raw === "stopped") terminal = "stopped";
    else if (["failed", "error"].includes(raw)) terminal = "failed";
    else if (raw === "complete" || raw === "completed") terminal = "complete";
    if (terminal === null) return;
    this.orchestratorLifecycle = terminal;
    if (!this.sealing) await this.journal("orchestrator-async-complete", { run_id: this.orchestratorRunId, state: terminal });
  }

  async acceptProjection(projection, request, source) {
    const acceptance = this.projectionAcceptanceTail.then(() => this.acceptProjectionAtomically(projection, request, source));
    this.projectionAcceptanceTail = acceptance.catch(() => {});
    return acceptance;
  }

  async acceptProjectionAtomically(projection, request, source) {
    validateOrchestratorProjection(projection);
    if (projection.change_id !== request.change_id || projection.exchange_id !== request.exchange_id || projection.trace_id !== request.trace_id || projection.reply_to !== request.request_id) throw new AlignmentContractError("orchestrator projection correlation is stale or foreign");
    if (this.projections.has(projection.packet_id)) throw new AlignmentContractError("orchestrator projection packet id is stale/reused");
    if (source === "orchestrator-projection" && this.directProjectionKinds.has(request.request_id)) throw new AlignmentContractError("request has more than one direct response");
    if (source === "orchestrator-unsolicited" && (!new Set(["ack", "status"]).has(this.directProjectionKinds.get(request.request_id))
      || !new Set(["decision", "completion", "failure"]).has(projection.kind))) throw new AlignmentContractError("unsolicited projection is stale, foreign, unsupported, or ineligible");
    if (projection.material.trace_references.length !== 0) throw new AlignmentContractError("orchestrator projections may not author trace references");
    let decision = null;
    if (projection.kind === "decision") {
      decision = projection.material.decision;
      if (decision.issued_for_operator_text !== request.operator_text) throw new AlignmentContractError("open decision is not tied to the current verbatim operator text");
      if (this.decisionIds.has(decision.decision_id)) throw new AlignmentContractError("open decision id is stale/reused");
    }
    const evidence = [];
    for (const capabilityId of projection.material.evidence_capability_ids) {
      if (this.evidenceIds.has(capabilityId)) throw new AlignmentContractError("projected evidence capability is stale/reused");
      evidence.push(await validateEvidenceProposal(this.channelRoot, capabilityId, {
        sessionId: this.sessionId, changeId: this.changeId, exchangeId: request.exchange_id,
      }));
    }
    // Capability files are prepared in private authoritative storage, but are
    // unusable until the single projection record publishes their membership.
    for (const metadata of evidence) {
      await atomicJson(join(this.sessionStateRoot, "capabilities", `${metadata.capability_id}.json`), metadata);
    }
    const projectionEntryId = await this.journal(source, {
      packet: projection, evidence_capabilities: evidence, broker_span_id: this.brokerSpanId,
    });

    // This synchronous block is the sole live publication point and mirrors
    // exactly the state reconstructed from the committed record above.
    this.projections.add(projection.packet_id);
    if (source === "orchestrator-projection") this.directProjectionKinds.set(request.request_id, projection.kind);
    this.lastProjectionId = projection.packet_id;
    this.workflowLifecycle = projection.lifecycle;
    if (decision !== null) {
      this.decisionIds.add(decision.decision_id);
      this.openDecisions.set(decision.decision_id, { ...decision, packet_id: projection.packet_id, exchange_id: projection.exchange_id });
    }
    for (const metadata of evidence) this.evidenceIds.add(metadata.capability_id);
    for (const run of projection.material.worker_run_ids) this.workerRunIds.add(run);
    this.traceReferences.set(projectionEntryId, { trace_id: this.traceId, span_id: this.brokerSpanId, journal_entry_id: projectionEntryId });

    // Writable proposals are transport only. Cleanup cannot revoke or reject a
    // projection after its authoritative commit and synchronous publication.
    for (const metadata of evidence) {
      await rm(join(this.channelRoot, "evidence", `${metadata.capability_id}.json`), { force: true }).catch(() => {});
    }
    return projection;
  }

  async exchange(value, signal) {
    if (this.closed || this.sealing) throw new AlignmentContractError("alignment session is closed");
    if (this.orchestratorLifecycle !== "running") throw new AlignmentContractError(`orchestrator is not running (${this.orchestratorLifecycle})`);
    this.pendingExchanges += 1;
    try {
      const request = validateAlignerRequest(structuredClone(value));
      if (this.changeId === null) this.changeId = request.change_id;
      if (request.change_id !== this.changeId) throw new AlignmentContractError("request Change identity is foreign to this session");
      if (request.trace_id !== this.traceId) throw new AlignmentContractError("request trace id is foreign to this session");
      if (request.reply_to !== this.lastProjectionId) throw new AlignmentContractError("request reply_to is stale");
      if (request.operator_text !== this.lastOperatorText) throw new AlignmentContractError("operator_text is not the current immutable verbatim operator input");
      if (this.exchanges.has(request.exchange_id) || this.requests.has(request.request_id)) throw new AlignmentContractError("exchange or request id is stale/reused");
      if (request.kind === "disposition") {
        const receipt = this.dispositions.get(request.payload.receipt.receipt_id);
        if (receipt === undefined || !isDeepStrictEqual(receipt, request.payload.receipt)) throw new AlignmentContractError("disposition receipt is foreign, fabricated, or changed");
        if (receipt.confirmation !== request.operator_text) throw new AlignmentContractError("disposition request does not preserve the current verbatim confirmation");
      }
      this.exchanges.add(request.exchange_id); this.requests.add(request.request_id); this.requestPackets.set(request.exchange_id, request);
      await this.journal("aligner-request", { packet: request });
      await atomicJson(join(this.channelRoot, "requests", `${request.exchange_id}.json`), request);
      const responsePath = join(this.channelRoot, "responses", `${request.exchange_id}.json`);
      const deadline = this.exchangeTimeoutMs === null ? null : Date.now() + this.exchangeTimeoutMs;
      let projection;
      while (deadline === null || Date.now() < deadline) {
        if (signal?.aborted) throw new AlignmentContractError("orchestrator exchange was cancelled");
        if (this.orchestratorLifecycle !== "running") throw new AlignmentContractError(`orchestrator ended during exchange (${this.orchestratorLifecycle})`);
        try { projection = await readJsonDirect(responsePath, "orchestrator response"); break; }
        catch (error) { if (!(error?.code === "ENOENT" || String(error?.message).includes("ENOENT"))) throw error; }
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
      }
      if (projection === undefined) throw new AlignmentContractError("orchestrator exchange timed out without a correlated projection");
      return await this.acceptProjection(projection, request, "orchestrator-projection");
    } finally { this.pendingExchanges -= 1; }
  }

  async captureDisposition({ decision_id, outcome, operator_response }) {
    if (this.closed || this.sealing) throw new AlignmentContractError("alignment session is closed");
    if (operator_response !== this.lastOperatorText) throw new AlignmentContractError("operator disposition does not equal the current verbatim operator input");
    const decision = this.openDecisions.get(decision_id);
    if (decision === undefined) throw new AlignmentContractError("operator disposition is not tied to an open decision");
    if (!new Set(["accepted", "rejected", "reshaped", "opted-out"]).has(outcome)) throw new AlignmentContractError("operator disposition outcome is unsupported");
    const explicit = confirmationOutcome(operator_response);
    let substantive = operator_response;
    const pending = this.pendingDispositions.get(decision_id);
    if (pending === undefined && explicit === undefined) {
      const retained = {
        decision_id,
        decision_packet_id: decision.packet_id,
        exchange_id: decision.exchange_id,
        outcome,
        operator_response,
      };
      this.pendingDispositions.set(decision_id, retained);
      await this.journal("operator-disposition-pending", { pending: retained });
      throw new AlignmentContractError("substantive operator disposition retained; require another operator turn with the exact confirmation token: accept, reject, reshape, or opt-out");
    }
    if (pending !== undefined) {
      if (pending.decision_packet_id !== decision.packet_id || pending.exchange_id !== decision.exchange_id
        || pending.outcome !== outcome) throw new AlignmentContractError("operator disposition confirmation does not match the retained decision and outcome");
      if (explicit === undefined || explicit !== pending.outcome) throw new AlignmentContractError("operator disposition still requires its exact confirmation token: accept, reject, reshape, or opt-out");
      substantive = pending.operator_response;
    } else if (explicit !== outcome) {
      throw new AlignmentContractError("operator disposition needs the exact confirmation token for the proposed outcome: accept, reject, reshape, or opt-out");
    }
    const receipt = {
      version: 1,
      receipt_id: `disposition-${randomUUID()}`,
      change_id: this.changeId,
      exchange_id: decision.exchange_id,
      trace_id: this.traceId,
      decision_id,
      decision_packet_id: decision.packet_id,
      outcome,
      operator_response: substantive,
      confirmation: operator_response,
      captured_at: now(),
    };
    validateDispositionReceipt(receipt);
    this.dispositions.set(receipt.receipt_id, receipt);
    this.openDecisions.delete(decision_id);
    this.pendingDispositions.delete(decision_id);
    await atomicJson(join(this.sessionStateRoot, "dispositions", `${receipt.receipt_id}.json`), receipt);
    await this.journal("operator-disposition", { receipt });
    return receipt;
  }

  async openEvidence(capabilityId, offset = 0, length = MAX_OPEN_BYTES) {
    if (this.closed || this.sealing || this.journalClosed) throw new AlignmentContractError("alignment session is sealed");
    if (typeof capabilityId !== "string" || !/^cap-[0-9a-f-]{36}$/.test(capabilityId)) throw new AlignmentContractError("evidence capability id is malformed");
    if (!this.evidenceIds.has(capabilityId)) throw new AlignmentContractError("authoritative evidence capability was not promoted by the broker");
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > MAX_OPEN_BYTES) throw new AlignmentContractError("evidence subrange is malformed or exceeds the read bound");
    const metadataPath = join(this.sessionStateRoot, "capabilities", `${capabilityId}.json`);
    const capability = validateEvidenceCapability(await readJsonDirect(metadataPath, "authoritative evidence capability"));
    if (capability.capability_id !== capabilityId || capability.issuer_session_id !== this.sessionId) throw new AlignmentContractError("evidence capability is foreign");
    if (this.changeId !== null && capability.change_id !== this.changeId) throw new AlignmentContractError("evidence capability belongs to another Change");
    if (Date.parse(capability.retention_until) <= Date.now()) throw new AlignmentContractError("evidence capability has expired");
    const start = capability.allowed_range.start + offset;
    const end = start + length;
    const allowedEnd = capability.allowed_range.start + capability.allowed_range.length;
    if (start < capability.allowed_range.start || end > allowedEnd) throw new AlignmentContractError("evidence read exceeds the granted range");
    const { info, digest, bytes } = await inspectDirectRegular(capability.canonical_target, "evidence target", {
      range: { start, length },
    });
    if (info.dev !== capability.device || info.ino !== capability.inode) throw new AlignmentContractError("evidence target identity drifted");
    if (digest !== capability.sha256) throw new AlignmentContractError("evidence target digest drifted");
    const text = await decodeText(bytes, "evidence subrange");
    this.evidenceIds.add(capabilityId);
    const journalEntryId = await this.journal("evidence-open", {
      capability_id: capabilityId, offset, length, digest: capability.sha256, broker_span_id: this.brokerSpanId,
    });
    const traceReceipt = { trace_id: this.traceId, span_id: this.brokerSpanId, journal_entry_id: journalEntryId };
    validateTraceReference(traceReceipt);
    this.traceReferences.set(journalEntryId, traceReceipt);
    return { capability_id: capabilityId, offset, length, media_type: capability.media_type, sha256: capability.sha256, text, trace_receipt: traceReceipt };
  }

  async createArtifact({ kind, title, body, provenance }) {
    if (this.closed || this.sealing || this.journalClosed) throw new AlignmentContractError("alignment session is sealed");
    if (!new Set(["markdown", "diagram", "static-page"]).has(kind)) throw new AlignmentContractError("artifact kind is unsupported");
    if (typeof title !== "string" || title.length === 0 || title.length > 200) throw new AlignmentContractError("artifact title is malformed");
    if (typeof body !== "string" || body.length === 0 || body.length > 100000) throw new AlignmentContractError("artifact body is malformed");
    if (!Array.isArray(provenance) || provenance.length === 0 || provenance.some((value) => typeof value !== "string" || !this.evidenceIds.has(value))) throw new AlignmentContractError("artifact provenance must contain only capabilities granted in this session");
    if (kind === "static-page" && /<\s*script\b|\bon[a-z]+\s*=|javascript\s*:|<\s*(?:iframe|object|embed|link|meta)\b/i.test(body)) throw new AlignmentContractError("static page body contains active content");
    const artifactId = `artifact-${randomUUID()}`;
    const extension = kind === "static-page" ? "html" : kind === "diagram" ? "mmd" : "md";
    const path = join(this.channelRoot, "presentations", `${artifactId}.${extension}`);
    const rendered = kind === "static-page"
      ? `<!doctype html><html><head><meta charset="utf-8"><title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title></head><body><pre>${body.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</pre></body></html>\n`
      : `${body}\n`;
    await writeFile(path, rendered, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const digest = sha256(Buffer.from(rendered));
    await this.journal("derived-artifact", { artifact_id: artifactId, kind, title, provenance: [...provenance], digest });
    return { artifact_id: artifactId, kind, title, provenance: [...provenance], sha256: digest, temporary: true, automatically_opened: false };
  }

  waitForNotificationDrains() {
    if (this.activeNotificationDrains === 0) return Promise.resolve();
    return new Promise((resolve) => this.notificationDrainWaiters.push(resolve));
  }

  async drainNotifications() {
    if (this.closed || this.sealing || this.journalClosed) return;
    this.activeNotificationDrains += 1;
    try {
      const names = (await readdir(join(this.channelRoot, "notifications"))).filter((name) => /^notification-[0-9a-f-]{36}\.json$/.test(name)).sort();
      for (const name of names) {
        const source = join(this.channelRoot, "notifications", name);
        const claimed = `${source}.claimed`;
        try { await rename(source, claimed); } catch (error) { if (error?.code === "ENOENT") continue; else throw error; }
        const packet = validateOrchestratorProjection(await readJsonDirect(claimed, "unsolicited orchestrator projection"));
        const request = this.requestPackets.get(packet.exchange_id);
        if (request === undefined || packet.trace_id !== this.traceId || packet.change_id !== this.changeId || !new Set(["decision", "completion", "failure"]).has(packet.kind)) throw new AlignmentContractError("unsolicited projection is stale, foreign, or unsupported");
        await this.acceptProjection(packet, request, "orchestrator-unsolicited");
        this.pi.sendUserMessage(`Typed orchestrator ${packet.kind} packet:\n${JSON.stringify(packet)}`, { deliverAs: "followUp" });
      }
    } finally {
      this.activeNotificationDrains -= 1;
      if (this.activeNotificationDrains === 0) {
        for (const resolve of this.notificationDrainWaiters.splice(0)) resolve();
      }
    }
  }

  async prepareReplacement(reason, targetPiSessionFile = null) {
    if (!REPLACEMENT_REASONS.has(reason)) throw new AlignmentContractError("alignment replacement reason is unsupported");
    if (this.continuationPrepared) return;
    if (this.piSessionFile === null) throw new AlignmentContractError("cannot preserve alignment state without a persistent Pi session file");
    const target = sessionFile(targetPiSessionFile, "replacement Pi session file", true);
    const continuationPath = this.continuationPath(this.piSessionFile);
    this.sealing = true;
    clearInterval(this.notificationTimer); this.notificationTimer = null;
    try {
      if (this.pendingExchanges !== 0) throw new AlignmentContractError("cannot replace while an alignment exchange is pending");
      await this.waitForNotificationDrains();
      await this.stopOrchestrator(reason);
      this.unsubscribeAsync?.(); this.unsubscribeAsync = null;
      await this.journal("session-replacement", {
        reason, from_pi_session_file: this.piSessionFile, target_pi_session_file: target,
        orchestrator_lifecycle: this.orchestratorLifecycle,
        alignment_session_id: this.sessionId,
        trace_id: this.traceId,
      });
      const journal = await inspectDirectRegular(this.journalPath, "authoritative alignment journal", {
        maxBytes: MAX_ALIGNMENT_JOURNAL_BYTES,
      });
      await atomicJson(continuationPath, {
        version: 1,
        state: "ready",
        from_pi_session_file: this.piSessionFile,
        target_pi_session_file: target,
        prepared_at: now(),
        alignment_session_id: this.sessionId,
        trace_id: this.traceId,
        journal_sha256: journal.digest,
      });
      this.continuationPrepared = true;
      this.closed = true;
      this.clearChannelEnvironment();
      await rm(this.channelRoot, { recursive: true, force: true });
    } catch (error) {
      await atomicJson(continuationPath, {
        version: 1,
        state: "blocked",
        from_pi_session_file: this.piSessionFile,
        target_pi_session_file: target,
        prepared_at: now(),
        alignment_session_id: this.sessionId,
        trace_id: this.traceId,
        orchestrator_run_id: this.orchestratorRunId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async stopOrchestrator(reason = "quit") {
    if (this.orchestratorRunId === null || new Set(["stopped", "complete", "failed"]).has(this.orchestratorLifecycle)) return;
    let stopError = null;
    try {
      await this.rpc("stop", { id: this.orchestratorRunId }, Math.min(RPC_TIMEOUT_MS, this.stopTimeoutMs));
    } catch (error) {
      // A stop refusal (including not_found) is not terminal proof. Status or
      // the exact process-local completion event must still prove this run.
      stopError = error;
    }
    try {
      let terminal = null;
      const deadline = Date.now() + this.stopTimeoutMs;
      while (Date.now() < deadline) {
        if (["stopped", "complete", "failed"].includes(this.orchestratorLifecycle)) {
          terminal = this.orchestratorLifecycle;
          break;
        }
        try {
          const status = await this.rpc("status", { id: this.orchestratorRunId }, Math.min(2000, this.stopTimeoutMs));
          terminal = terminalStateFromStatus(status, this.orchestratorRunId);
          if (terminal !== null) break;
        } catch {
          // A missing/foreign status record is not terminal proof. Keep polling
          // for the exact run until the bounded stop deadline expires.
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(100, this.stopTimeoutMs)));
      }
      if (terminal === null) {
        const detail = stopError instanceof Error ? `; stop RPC: ${stopError.message}` : "";
        throw new AlignmentContractError(`orchestrator stop was requested but no terminal lifecycle was proven${detail}`);
      }
      this.orchestratorLifecycle = terminal;
      await this.journal("orchestrator-stop", { run_id: this.orchestratorRunId, reason, proven: true, terminal });
    } catch (error) {
      this.orchestratorLifecycle = "recovery-recorded";
      await atomicJson(join(this.sessionStateRoot, "recovery.json"), { version: 1, session_id: this.sessionId, run_id: this.orchestratorRunId, trace_id: this.traceId, reason, recorded_at: now(), error: error instanceof Error ? error.message : String(error) });
      await this.journal("orchestrator-recovery", { run_id: this.orchestratorRunId, reason, proven: false });
      throw new AlignmentContractError(`orchestrator terminal state was not proven; recovery state was retained: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async seal(reason = "finalized") {
    if (this.sealedPackage !== null) return this.sealedPackage;
    if (this.pendingExchanges !== 0) throw new AlignmentContractError("cannot seal while an alignment exchange is pending");
    if (this.changeId === null) throw new AlignmentContractError("cannot seal before a Change identity is established");
    this.sealing = true;
    clearInterval(this.notificationTimer); this.notificationTimer = null;
    await this.waitForNotificationDrains();
    await this.stopOrchestrator(reason);
    this.unsubscribeAsync?.(); this.unsubscribeAsync = null;
    const packageId = `package-${randomUUID()}`;
    await this.journal("sealed", { package_id: packageId, change_id: this.changeId, final: true });
    const journal = await inspectDirectRegular(this.journalPath, "alignment journal", {
      maxBytes: MAX_ALIGNMENT_JOURNAL_BYTES,
    });
    const sealed = {
      version: 1, package_id: packageId, change_id: this.changeId, trace_id: this.traceId, session_id: this.sessionId, sealed_at: now(), reason,
      journal_sha256: journal.digest, journal_path: this.journalPath, root_session_files: [...this.rootSessionFiles],
      exchange_ids: [...this.exchanges], disposition_receipt_ids: [...this.dispositions.keys()], evidence_capability_ids: [...this.evidenceIds],
      worker_run_ids: [...this.workerRunIds], trace_references: [...this.traceReferences.values()], orchestrator_lifecycle: this.orchestratorLifecycle,
    };
    validateSealedPackage(sealed);
    const identityHash = sha256(Buffer.from(this.changeId));
    const sealedPath = join(this.stateRoot, "sealed", "packages", identityHash, `${this.sessionId}.json`);
    await atomicJson(sealedPath, sealed);
    await chmod(this.journalPath, 0o400);
    this.journalClosed = true; this.closed = true; this.sealedPackage = sealed;
    return sealed;
  }

  async shutdown(reason = "quit", options = {}) {
    if (this.continuationPrepared) return null;
    if (REPLACEMENT_REASONS.has(reason)) {
      await this.prepareReplacement(reason, options.targetPiSessionFile ?? null);
      return null;
    }
    if (!this.journalClosed && this.pendingExchanges > 0) {
      this.sealing = true;
      clearInterval(this.notificationTimer); this.notificationTimer = null;
      await this.waitForNotificationDrains();
      await this.stopOrchestrator(reason);
      this.unsubscribeAsync?.(); this.unsubscribeAsync = null;
      await this.journal("shutdown-recovery", { reason, pending_exchanges: this.pendingExchanges, orchestrator_lifecycle: this.orchestratorLifecycle });
    } else if (!this.journalClosed && this.changeId !== null) await this.seal(reason === "quit" ? "quit" : "recovery");
    else if (!this.journalClosed) { this.sealing = true; clearInterval(this.notificationTimer); this.notificationTimer = null; await this.waitForNotificationDrains(); await this.stopOrchestrator(reason); this.unsubscribeAsync?.(); this.unsubscribeAsync = null; }
    this.closed = true;
    this.clearChannelEnvironment();
    await rm(this.channelRoot, { recursive: true, force: true });
    return this.sealedPackage;
  }
}

export const alignmentBrokerConstants = Object.freeze({
  RPC_READY,
  RPC_REQUEST,
  MAX_OPEN_BYTES,
  MAX_EVIDENCE_OBJECT_BYTES,
  STREAM_CHUNK_BYTES,
  ORCHESTRATOR_TASK,
});
