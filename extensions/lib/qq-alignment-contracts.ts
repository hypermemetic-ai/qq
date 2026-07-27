// @ts-nocheck

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACE_ID = /^[0-9a-f]{32}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const REQUEST_KINDS = new Set(["intent", "clarification", "status_request", "evidence_request", "analysis_request", "disposition"]);
const PROJECTION_KINDS = new Set(["ack", "status", "evidence", "analysis", "decision", "completion", "failure"]);
const LIFECYCLES = new Set(["starting", "running", "waiting", "complete", "failed", "stopped"]);
const MEDIA_TYPES = new Set(["text/plain", "text/markdown", "application/json", "text/x-diff", "text/mermaid"]);
const DISPOSITION_CONFIRMATIONS = new Map([
  ["accept", "accepted"],
  ["reject", "rejected"],
  ["reshape", "reshaped"],
  ["opt-out", "opted-out"],
]);
const FORBIDDEN_ALIGNER_FIELDS = new Set([
  "agent", "role", "task", "cwd", "branch", "command", "priority", "schedule",
  "dispatch", "retry", "stop", "merge", "task_state", "delivery_state",
]);

export class AlignmentContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "AlignmentContractError";
  }
}

function reject(condition, message) {
  if (condition) throw new AlignmentContractError(message);
}

function object(value, label) {
  reject(value === null || typeof value !== "object" || Array.isArray(value), `${label} must be an object`);
  return value;
}

function exact(value, names, label) {
  object(value, label);
  const allowed = new Set(names);
  for (const key of Object.keys(value)) reject(!allowed.has(key), `${label} has unknown field '${key}'`);
  for (const key of names) reject(!(key in value), `${label} is missing '${key}'`);
}

function string(value, label, max = 100000) {
  reject(typeof value !== "string" || value.length === 0 || value.length > max, `${label} must be a non-empty bounded string`);
}

function nullableString(value, label, max = 20000) {
  if (value !== null) string(value, label, max);
}

function id(value, label) {
  reject(typeof value !== "string" || !ID.test(value), `${label} is malformed`);
}

function trace(value, label = "trace_id") {
  reject(typeof value !== "string" || !TRACE_ID.test(value), `${label} is malformed`);
}

function span(value, label = "span_id") {
  reject(typeof value !== "string" || !SPAN_ID.test(value), `${label} is malformed`);
}

function version(value) {
  reject(value !== 1, "version must be 1");
}

function dateTime(value, label) {
  string(value, label, 100);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  reject(match === null, `${label} is malformed`);
  const [, year, month, day, hour, minute, second, zone, zoneHour, zoneMinute] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  reject(Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (zone !== "Z" && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)), `${label} is malformed`);
}

function textList(value, label) {
  reject(!Array.isArray(value), `${label} must be an array`);
  value.forEach((entry, index) => string(entry, `${label}[${index}]`, 20000));
}

function idList(value, label) {
  reject(!Array.isArray(value), `${label} must be an array`);
  const seen = new Set();
  value.forEach((entry, index) => {
    id(entry, `${label}[${index}]`);
    reject(seen.has(entry), `${label} contains a duplicate`);
    seen.add(entry);
  });
}

function checkCommonPacket(packet, packetField) {
  version(packet.version);
  id(packet.change_id, "change_id");
  id(packet.exchange_id, "exchange_id");
  trace(packet.trace_id);
  id(packet[packetField], packetField);
  id(packet.reply_to, "reply_to");
}

export function validateTraceReference(value) {
  exact(value, ["trace_id", "span_id", "journal_entry_id"], "trace reference");
  trace(value.trace_id);
  span(value.span_id);
  id(value.journal_entry_id, "journal_entry_id");
  return value;
}

export function validateAlignerRequest(value) {
  const request = object(value, "aligner request");
  exact(request, ["version", "change_id", "exchange_id", "trace_id", "request_id", "reply_to", "kind", "operator_text", "interpretation", "payload"], "aligner request");
  checkCommonPacket(request, "request_id");
  reject(!REQUEST_KINDS.has(request.kind), "aligner request kind is unsupported");
  string(request.operator_text, "operator_text");
  string(request.interpretation, "interpretation", 20000);
  const payload = object(request.payload, "aligner request payload");
  for (const key of Object.keys(payload)) reject(FORBIDDEN_ALIGNER_FIELDS.has(key.toLowerCase().replaceAll("-", "_")), `aligner request contains forbidden field '${key}'`);
  if (request.kind === "status_request") {
    exact(payload, ["scope"], "status request payload");
    reject(payload.scope !== "current-exchange" && payload.scope !== "change", "status request scope is unsupported");
  } else if (request.kind === "disposition") {
    exact(payload, ["receipt"], "disposition request payload");
    validateDispositionReceipt(payload.receipt);
  } else {
    exact(payload, ["text"], `${request.kind} request payload`);
    string(payload.text, "payload.text", 20000);
  }
  return request;
}

export function validateOrchestratorProjection(value) {
  const packet = object(value, "orchestrator projection");
  exact(packet, ["version", "change_id", "exchange_id", "trace_id", "packet_id", "reply_to", "lifecycle", "kind", "material"], "orchestrator projection");
  checkCommonPacket(packet, "packet_id");
  reject(!LIFECYCLES.has(packet.lifecycle), "orchestrator lifecycle is unsupported");
  reject(!PROJECTION_KINDS.has(packet.kind), "orchestrator projection kind is unsupported");
  const material = packet.material;
  exact(material, ["facts", "inferences", "recommendation", "uncertainties", "evidence_capability_ids", "trace_references", "worker_run_ids", "decision", "next_operator_input"], "orchestrator material");
  textList(material.facts, "facts");
  textList(material.inferences, "inferences");
  nullableString(material.recommendation, "recommendation");
  textList(material.uncertainties, "uncertainties");
  idList(material.evidence_capability_ids, "evidence_capability_ids");
  reject(!Array.isArray(material.trace_references), "trace_references must be an array");
  reject(material.trace_references.length !== 0, "orchestrator projections may not author trace references");
  idList(material.worker_run_ids, "worker_run_ids");
  nullableString(material.next_operator_input, "next_operator_input");
  if (material.decision !== null) {
    exact(material.decision, ["decision_id", "question", "issued_for_operator_text"], "decision");
    id(material.decision.decision_id, "decision_id");
    string(material.decision.question, "decision.question", 20000);
    string(material.decision.issued_for_operator_text, "decision.issued_for_operator_text");
  }
  reject(packet.kind === "decision" && material.decision === null, "decision projection has no open decision");
  reject(packet.kind !== "decision" && material.decision !== null, "non-decision projection contains a decision");
  reject(packet.kind === "failure" && packet.lifecycle !== "failed", "failure projection lifecycle must be failed");
  reject(packet.kind === "completion" && packet.lifecycle !== "complete", "completion projection lifecycle must be complete");
  return packet;
}

export function validateAlignmentEpisode(value) {
  const episode = object(value, "alignment episode");
  exact(episode, ["version", "change_id", "exchange_id", "trace_id", "episode", "outcome", "criteria_trigger", "presentation"], "alignment episode");
  version(episode.version);
  id(episode.change_id, "change_id");
  id(episode.exchange_id, "exchange_id");
  trace(episode.trace_id);
  reject(!new Set(["initial", "realignment", "acceptance"]).has(episode.episode), "alignment episode kind is unsupported");
  reject(!new Set(["ready", "needs-data", "clarification"]).has(episode.outcome), "alignment outcome is unsupported");
  if (episode.episode === "realignment") string(episode.criteria_trigger, "criteria_trigger", 4096);
  else reject(episode.criteria_trigger !== null, "criteria_trigger is only allowed for realignment");
  exact(episode.presentation, ["spoken", "visual"], "presentation");
  string(episode.presentation.spoken, "presentation.spoken", 20000);
  const visual = episode.presentation.visual;
  exact(visual, ["format", "content", "provenance"], "visual presentation");
  reject(!new Set(["markdown", "diagram", "static-page"]).has(visual.format), "visual format is unsupported");
  string(visual.content, "visual.content");
  idList(visual.provenance, "visual.provenance");
  reject(visual.provenance.length === 0, "visual provenance is required");
  return episode;
}

export function validateDispositionReceipt(value) {
  const receipt = object(value, "operator disposition receipt");
  exact(receipt, ["version", "receipt_id", "change_id", "exchange_id", "trace_id", "decision_id", "decision_packet_id", "outcome", "operator_response", "confirmation", "captured_at"], "operator disposition receipt");
  version(receipt.version);
  for (const field of ["receipt_id", "change_id", "exchange_id", "decision_id", "decision_packet_id"]) id(receipt[field], field);
  trace(receipt.trace_id);
  reject(!new Set(["accepted", "rejected", "reshaped", "opted-out"]).has(receipt.outcome), "disposition outcome is unsupported");
  string(receipt.operator_response, "operator_response");
  string(receipt.confirmation, "confirmation", 20);
  reject(DISPOSITION_CONFIRMATIONS.get(receipt.confirmation) !== receipt.outcome, "disposition confirmation does not match outcome");
  dateTime(receipt.captured_at, "captured_at");
  return receipt;
}

export function validateEvidenceCapability(value) {
  const capability = object(value, "evidence capability");
  exact(capability, ["version", "capability_id", "change_id", "canonical_target", "allowed_range", "media_type", "sha256", "device", "inode", "issuing_exchange_id", "retention_until", "issuer_session_id"], "evidence capability");
  version(capability.version);
  for (const field of ["capability_id", "change_id", "issuing_exchange_id", "issuer_session_id"]) id(capability[field], field);
  reject(typeof capability.canonical_target !== "string" || !capability.canonical_target.startsWith("/"), "canonical_target must be absolute");
  exact(capability.allowed_range, ["start", "length"], "allowed_range");
  reject(!Number.isSafeInteger(capability.allowed_range.start) || capability.allowed_range.start < 0, "allowed range start is invalid");
  reject(!Number.isSafeInteger(capability.allowed_range.length) || capability.allowed_range.length < 1, "allowed range length is invalid");
  reject(!MEDIA_TYPES.has(capability.media_type), "evidence media type is unsupported");
  reject(typeof capability.sha256 !== "string" || !SHA256.test(capability.sha256), "evidence digest is malformed");
  reject(!Number.isSafeInteger(capability.device) || capability.device < 0, "evidence device is invalid");
  reject(!Number.isSafeInteger(capability.inode) || capability.inode < 1, "evidence inode is invalid");
  dateTime(capability.retention_until, "retention_until");
  return capability;
}

export function validateSealedPackage(value) {
  const sealed = object(value, "sealed alignment package");
  exact(sealed, ["version", "package_id", "change_id", "trace_id", "session_id", "sealed_at", "reason", "journal_sha256", "journal_path", "root_session_files", "exchange_ids", "disposition_receipt_ids", "evidence_capability_ids", "worker_run_ids", "trace_references", "orchestrator_lifecycle"], "sealed alignment package");
  version(sealed.version);
  for (const field of ["package_id", "change_id", "session_id"]) id(sealed[field], field);
  trace(sealed.trace_id);
  dateTime(sealed.sealed_at, "sealed_at");
  reject(!new Set(["finalized", "quit", "reload", "new", "resume", "fork", "orchestrator-failure", "recovery"]).has(sealed.reason), "seal reason is unsupported");
  reject(typeof sealed.journal_sha256 !== "string" || !SHA256.test(sealed.journal_sha256), "journal digest is malformed");
  reject(typeof sealed.journal_path !== "string" || !sealed.journal_path.startsWith("/"), "journal_path must be absolute");
  reject(!Array.isArray(sealed.root_session_files) || sealed.root_session_files.length === 0
    || new Set(sealed.root_session_files).size !== sealed.root_session_files.length
    || sealed.root_session_files.some((path) => typeof path !== "string" || !path.startsWith("/")), "root_session_files must contain unique absolute paths");
  idList(sealed.exchange_ids, "exchange_ids");
  idList(sealed.disposition_receipt_ids, "disposition_receipt_ids");
  idList(sealed.evidence_capability_ids, "evidence_capability_ids");
  idList(sealed.worker_run_ids, "worker_run_ids");
  reject(!Array.isArray(sealed.trace_references), "trace_references must be an array");
  sealed.trace_references.forEach(validateTraceReference);
  reject(!new Set(["complete", "failed", "stopped"]).has(sealed.orchestrator_lifecycle), "sealed orchestrator lifecycle lacks terminal proof");
  return sealed;
}

export const alignmentContractConstants = Object.freeze({
  idPattern: ID,
  traceIdPattern: TRACE_ID,
  spanIdPattern: SPAN_ID,
  mediaTypes: MEDIA_TYPES,
});
