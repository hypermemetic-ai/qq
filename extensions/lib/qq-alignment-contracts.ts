// @ts-nocheck

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACE_ID = /^[0-9a-f]{32}$/;
const REQUEST_KINDS = new Set(["intent", "clarification", "status_request", "evidence_request", "analysis_request", "disposition"]);
const PROJECTION_KINDS = new Set(["ack", "status", "evidence", "analysis", "decision", "completion", "failure"]);
const LIFECYCLES = new Set(["starting", "running", "waiting", "complete", "failed", "stopped"]);
const SOURCE_KINDS = new Set(["operator", "repository", "session", "worker", "check", "external"]);
const DISPOSITION_CONFIRMATIONS = new Map([["accept", "accepted"], ["reject", "rejected"], ["reshape", "reshaped"], ["opt-out", "opted-out"]]);
const FORBIDDEN_ALIGNER_FIELDS = new Set([
  "agent", "role", "task", "cwd", "branch", "command", "priority", "schedule",
  "dispatch", "retry", "stop", "merge", "task_state", "delivery_state",
]);

export const MAX_SUPPLIED_MATERIAL_ITEMS = 16;
export const MAX_SUPPLIED_ITEM_TEXT_BYTES = 16 * 1024;
export const MAX_SUPPLIED_TEXT_BYTES = 64 * 1024;
export const MAX_SOURCE_REFERENCE_BYTES = 4096;
export const MAX_ALIGNMENT_PACKET_BYTES = 1024 * 1024;
// Six-byte JSON escaping still leaves 32 KiB for receipt/snapshot envelopes.
export const MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES = 16 * 1024;

export class AlignmentContractError extends Error {
  constructor(message) { super(message); this.name = "AlignmentContractError"; }
}

function reject(condition, message) { if (condition) throw new AlignmentContractError(message); }
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
function byteString(value, label, max) {
  string(value, label, max);
  reject(Buffer.byteLength(value, "utf8") > max, `${label} exceeds its UTF-8 byte bound`);
}
function nullableString(value, label, max = 20000) { if (value !== null) string(value, label, max); }
function id(value, label) { reject(typeof value !== "string" || !ID.test(value), `${label} is malformed`); }
function trace(value, label = "trace_id") { reject(typeof value !== "string" || !TRACE_ID.test(value), `${label} is malformed`); }
function version(value) { reject(value !== 1, "version must be 1"); }
function dateTime(value, label) {
  string(value, label, 100);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  reject(match === null, `${label} is malformed`);
  const [, year, month, day, hour, minute, second, zone, zoneHour, zoneMinute] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  reject(Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (zone !== "Z" && (Number(zoneHour) > 23 || Number(zoneMinute) > 59)), `${label} is malformed`);
}
function textList(value, label) {
  reject(!Array.isArray(value) || value.length > 64, `${label} must be a bounded array`);
  value.forEach((entry, index) => string(entry, `${label}[${index}]`, 20000));
}
function idList(value, label) {
  reject(!Array.isArray(value) || value.length > 256, `${label} must be a bounded array`);
  const seen = new Set();
  value.forEach((entry, index) => { id(entry, `${label}[${index}]`); reject(seen.has(entry), `${label} contains a duplicate`); seen.add(entry); });
}
function checkCommonPacket(packet, packetField) {
  version(packet.version); id(packet.change_id, "change_id"); id(packet.exchange_id, "exchange_id");
  trace(packet.trace_id); id(packet[packetField], packetField); id(packet.reply_to, "reply_to");
}
function packetBytes(value, label) {
  let serialized; try { serialized = JSON.stringify(value); } catch { throw new AlignmentContractError(`${label} is not serializable`); }
  reject(Buffer.byteLength(serialized, "utf8") > MAX_ALIGNMENT_PACKET_BYTES, `${label} exceeds the ${MAX_ALIGNMENT_PACKET_BYTES}-byte serialized packet bound`);
}

export function validateSuppliedMaterial(value) {
  reject(!Array.isArray(value) || value.length > MAX_SUPPLIED_MATERIAL_ITEMS, `supplied_material must contain at most ${MAX_SUPPLIED_MATERIAL_ITEMS} items`);
  const materialIds = new Set(); const sourceIds = new Set(); let aggregateBytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    exact(item, ["material_id", "text", "source"], `supplied_material[${index}]`);
    id(item.material_id, `supplied_material[${index}].material_id`);
    reject(materialIds.has(item.material_id), "supplied_material contains a duplicate material_id");
    materialIds.add(item.material_id);
    byteString(item.text, `supplied_material[${index}].text`, MAX_SUPPLIED_ITEM_TEXT_BYTES);
    aggregateBytes += Buffer.byteLength(item.text, "utf8");
    reject(aggregateBytes > MAX_SUPPLIED_TEXT_BYTES, `supplied_material exceeds the ${MAX_SUPPLIED_TEXT_BYTES}-byte aggregate text bound`);
    exact(item.source, ["source_id", "kind", "reference"], `supplied_material[${index}].source`);
    id(item.source.source_id, `supplied_material[${index}].source.source_id`);
    reject(sourceIds.has(item.source.source_id), "supplied_material contains a duplicate source_id");
    sourceIds.add(item.source.source_id);
    reject(!SOURCE_KINDS.has(item.source.kind), `supplied_material[${index}].source.kind is unsupported`);
    byteString(item.source.reference, `supplied_material[${index}].source.reference`, MAX_SOURCE_REFERENCE_BYTES);
    reject(/[\0\r\n]/u.test(item.source.reference), `supplied_material[${index}].source.reference must be one exact line`);
  }
  return value;
}

export function validateAlignerRequest(value) {
  const request = object(value, "aligner request");
  exact(request, ["version", "change_id", "exchange_id", "trace_id", "request_id", "reply_to", "kind", "operator_text", "interpretation", "payload"], "aligner request");
  checkCommonPacket(request, "request_id");
  reject(!REQUEST_KINDS.has(request.kind), "aligner request kind is unsupported");
  string(request.operator_text, "operator_text"); string(request.interpretation, "interpretation", 20000);
  const payload = object(request.payload, "aligner request payload");
  for (const key of Object.keys(payload)) reject(FORBIDDEN_ALIGNER_FIELDS.has(key.toLowerCase().replaceAll("-", "_")), `aligner request contains forbidden field '${key}'`);
  if (request.kind === "status_request") {
    exact(payload, ["scope"], "status request payload");
    reject(payload.scope !== "current-exchange" && payload.scope !== "change", "status request scope is unsupported");
  } else if (request.kind === "disposition") {
    exact(payload, ["receipt"], "disposition request payload"); validateDispositionReceipt(payload.receipt);
  } else {
    exact(payload, ["text"], `${request.kind} request payload`); string(payload.text, "payload.text", 20000);
  }
  packetBytes(request, "aligner request"); return request;
}

export function validateOrchestratorProjection(value) {
  const packet = object(value, "orchestrator projection");
  exact(packet, ["version", "change_id", "exchange_id", "trace_id", "packet_id", "reply_to", "lifecycle", "kind", "material"], "orchestrator projection");
  checkCommonPacket(packet, "packet_id");
  reject(!LIFECYCLES.has(packet.lifecycle), "orchestrator lifecycle is unsupported");
  reject(!PROJECTION_KINDS.has(packet.kind), "orchestrator projection kind is unsupported");
  const material = packet.material;
  exact(material, ["facts", "inferences", "recommendation", "uncertainties", "supplied_material", "worker_run_ids", "decision", "next_operator_input"], "orchestrator material");
  textList(material.facts, "facts"); textList(material.inferences, "inferences");
  nullableString(material.recommendation, "recommendation"); textList(material.uncertainties, "uncertainties");
  validateSuppliedMaterial(material.supplied_material); idList(material.worker_run_ids, "worker_run_ids");
  nullableString(material.next_operator_input, "next_operator_input");
  if (material.decision !== null) {
    exact(material.decision, ["decision_id", "question", "issued_for_operator_text"], "decision");
    id(material.decision.decision_id, "decision_id"); string(material.decision.question, "decision.question", 20000);
    string(material.decision.issued_for_operator_text, "decision.issued_for_operator_text");
  }
  reject(packet.kind === "decision" && material.decision === null, "decision projection has no open decision");
  reject(packet.kind !== "decision" && material.decision !== null, "non-decision projection contains a decision");
  reject(packet.kind === "failure" && packet.lifecycle !== "failed", "failure projection lifecycle must be failed");
  reject(packet.kind === "completion" && packet.lifecycle !== "complete", "completion projection lifecycle must be complete");
  packetBytes(packet, "orchestrator projection"); return packet;
}

export function validateAlignmentEpisode(value) {
  const episode = object(value, "alignment episode");
  exact(episode, ["version", "change_id", "exchange_id", "trace_id", "episode", "outcome", "criteria_trigger", "presentation"], "alignment episode");
  version(episode.version); id(episode.change_id, "change_id"); id(episode.exchange_id, "exchange_id"); trace(episode.trace_id);
  reject(!new Set(["initial", "realignment", "acceptance"]).has(episode.episode), "alignment episode kind is unsupported");
  reject(!new Set(["ready", "needs-data", "clarification"]).has(episode.outcome), "alignment outcome is unsupported");
  if (episode.episode === "realignment") string(episode.criteria_trigger, "criteria_trigger", 4096);
  else reject(episode.criteria_trigger !== null, "criteria_trigger is only allowed for realignment");
  exact(episode.presentation, ["spoken", "visual"], "presentation");
  string(episode.presentation.spoken, "presentation.spoken", 20000);
  const visual = episode.presentation.visual;
  exact(visual, ["format", "content", "provenance"], "visual presentation");
  reject(!new Set(["markdown", "diagram", "static-page"]).has(visual.format), "visual format is unsupported");
  string(visual.content, "visual.content"); idList(visual.provenance, "visual.provenance");
  reject(visual.provenance.length === 0, "visual provenance is required");
  return episode;
}

export function validateDispositionOperatorResponse(value) { byteString(value, "operator_response", MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES); return value; }

export function validateDispositionReceipt(value) {
  const receipt = object(value, "operator disposition receipt");
  exact(receipt, ["version", "receipt_id", "change_id", "exchange_id", "trace_id", "decision_id", "decision_packet_id", "outcome", "operator_response", "confirmation", "captured_at"], "operator disposition receipt");
  version(receipt.version);
  for (const field of ["receipt_id", "change_id", "exchange_id", "decision_id", "decision_packet_id"]) id(receipt[field], field);
  trace(receipt.trace_id);
  reject(!new Set(["accepted", "rejected", "reshaped", "opted-out"]).has(receipt.outcome), "disposition outcome is unsupported");
  validateDispositionOperatorResponse(receipt.operator_response); string(receipt.confirmation, "confirmation", 20);
  reject(DISPOSITION_CONFIRMATIONS.get(receipt.confirmation) !== receipt.outcome, "disposition confirmation does not match outcome");
  dateTime(receipt.captured_at, "captured_at");
  return receipt;
}

export const alignmentContractConstants = Object.freeze({
  idPattern: ID, traceIdPattern: TRACE_ID, sourceKinds: SOURCE_KINDS,
  maxSuppliedMaterialItems: MAX_SUPPLIED_MATERIAL_ITEMS,
  maxSuppliedItemTextBytes: MAX_SUPPLIED_ITEM_TEXT_BYTES,
  maxSuppliedTextBytes: MAX_SUPPLIED_TEXT_BYTES,
  maxSourceReferenceBytes: MAX_SOURCE_REFERENCE_BYTES,
  maxDispositionOperatorResponseBytes: MAX_DISPOSITION_OPERATOR_RESPONSE_BYTES,
});
