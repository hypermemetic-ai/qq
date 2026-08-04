// @ts-nocheck

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";


const OBSERVE = "bin/qq-observe";
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;

function text(value, nonempty = false) {
  return typeof value === "string" && value.isWellFormed() && value.length <= 20000 && !CONTROL.test(value) && (!nonempty || !!value.trim());
}
function exactObject(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function executionReason(result, fallback) {
  return result?.stderr?.trim() || result?.stdout?.trim() || fallback;
}
function response(status, message, details = {}) {
  return { content: [{ type: "text", text: message }], details: { status, message, ...details } };
}
function contextInvariant(label, requirement) {
  throw new Error(`${label} invariant failed: ${requirement}; reload with qq-observe architect-context and retry.`);
}

function parseContext(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { contextInvariant("Architect context JSON", "output must be valid JSON"); }
  const topKeys = ["schema", "schema_version", "findings", "observer_health", "omitted_findings"];
  if (!exactObject(value, topKeys) || value.schema !== "qq-observer.architect-context" || value.schema_version !== 5 ||
    !Array.isArray(value.findings) || value.findings.length > 50 ||
    !Number.isInteger(value.omitted_findings) || value.omitted_findings < 0)
    contextInvariant("Architect context top-level", `use exactly ${topKeys.join(", ")}, schema version 5, at most 50 findings, and a non-negative omission count`);
  if (!exactObject(value.observer_health, ["rounds", "omitted_rounds"]) || !Array.isArray(value.observer_health.rounds) ||
    value.observer_health.rounds.length > 20 || !Number.isInteger(value.observer_health.omitted_rounds) || value.observer_health.omitted_rounds < 0)
    contextInvariant("Observer health summary", "use exactly rounds (at most 20) and a non-negative integer omitted_rounds");
  for (const [index, round] of value.observer_health.rounds.entries()) {
    if (!exactObject(round, ["status", "repository", "pr", "run_dir", "assembled_at", "reason", "reason_truncated"]) ||
      !["analysis_failed", "pending"].includes(round.status) || !text(round.repository, true) ||
      !Number.isInteger(round.pr) || round.pr <= 0 || !text(round.run_dir, true) || !text(round.assembled_at, true) ||
      !text(round.reason, true) || [...round.reason].length > 500 || typeof round.reason_truncated !== "boolean")
      contextInvariant(`Observer health round ${index}`, "use the exact health fields, status analysis_failed/pending, positive pr, safe source text, a 1-500 character reason, and boolean truncation flag");
  }
  const occurrences = new Map(), occurrenceIds = new Set(), keys = new Set();
  function parseOccurrence(occurrence, key, selectable, label) {
    if (!exactObject(occurrence, ["occurrence_id", "recurrence_key", "source"]) ||
      !/^occurrence-[0-9a-f]{32}$/.test(occurrence.occurrence_id) || occurrenceIds.has(occurrence.occurrence_id) || occurrence.recurrence_key !== key ||
      !exactObject(occurrence.source, ["run_dir", "repository", "legacy", "pr", "variant", "assembled_at"]) ||
      !text(occurrence.source.run_dir, true) || occurrence.source.variant !== "guided" || typeof occurrence.source.legacy !== "boolean" ||
      !Number.isInteger(occurrence.source.pr) || occurrence.source.pr <= 0 || !text(occurrence.source.assembled_at, true) ||
      (occurrence.source.legacy ? occurrence.source.repository !== null : !text(occurrence.source.repository, true)))
      contextInvariant(label, "use one unique canonical occurrence_id bound to its key and an exact guided source identity; correct the occurrence or regenerate Architect context");
    occurrenceIds.add(occurrence.occurrence_id);
    if (selectable) occurrences.set(occurrence.occurrence_id, occurrence);
  }
  for (const [index, finding] of value.findings.entries()) {
    if (!exactObject(finding, ["recurrence_key", "title", "kind", "confidence", "covered", "suggested_scope", "occurrences"]) ||
      !text(finding.recurrence_key, true) || keys.has(finding.recurrence_key) || !text(finding.title, true) || !text(finding.kind, true) || finding.covered !== false ||
      !["high", "medium", "low"].includes(finding.confidence) || !text(finding.suggested_scope) || !Array.isArray(finding.occurrences) || !finding.occurrences.length)
      contextInvariant(`Architect finding ${index}`, "use the exact finding fields, a unique uncovered recurrence_key, safe text, valid confidence, and at least one occurrence");
    keys.add(finding.recurrence_key);
    finding.occurrences.forEach((occurrence, occurrenceIndex) => parseOccurrence(occurrence, finding.recurrence_key, true, `Architect finding ${index} occurrence ${occurrenceIndex}`));
  }
  return { value, occurrences };
}

function bindDecisions(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Decision list invariant failed: decisions must be a non-empty array; provide one settled decision or omit the tool call.");
  const keys = new Set(), decisions = [];
  for (const [index, item] of value.entries()) {
    const label = `Decision ${index}`;
    if (!exactObject(item, ["recurrence_key", "action", "scope", "note"]))
      throw new Error(`${label} field invariant failed: use exactly recurrence_key, action, scope, and note; correct the decision object.`);
    if (!text(item.recurrence_key, true) || keys.has(item.recurrence_key))
      throw new Error(`${label} recurrence invariant failed: recurrence_key must be non-empty and appear once; merge duplicate-key selections.`);
    if (!["route", "set_aside"].includes(item.action))
      throw new Error(`${label} action invariant failed: action must be route or set_aside; choose one supported action.`);
    if (!text(item.scope) || !text(item.note) || item.recurrence_key.includes("\n") || item.scope.includes("\n") || item.note.includes("\n"))
      throw new Error(`${label} text invariant failed: recurrence_key, scope, and note must be valid one-line text; remove line breaks, control characters, or oversized values.`);
    if (item.action === "route" && !item.scope.trim())
      throw new Error(`${label} route scope invariant failed: route requires a non-empty operator-settled scope; provide that scope.`);
    if (item.action === "set_aside" && item.scope !== "")
      throw new Error(`${label} set_aside scope invariant failed: set_aside requires scope to be empty; set scope to an empty string.`);
    keys.add(item.recurrence_key);
    decisions.push({ recurrence_key: item.recurrence_key, action: item.action, scope: item.scope, note: item.note });
  }
  return decisions;
}

function settlementSummary(decisions) {
  const lines = ["Settled durable Architect dispositions:"];
  for (const decision of decisions) {
    lines.push(`- ${decision.recurrence_key}: ${decision.action === "route" ? "Route follow-up" : "Set aside current evidence"}`);
    if (decision.action === "route") lines.push(`  Agreed scope: ${decision.scope}`);
    if (decision.note) lines.push(`  Note: ${decision.note}`);
  }
  return lines.join("\n");
}

export default function register(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const makeTemp = deps.mkdtemp ?? mkdtemp;
  const save = deps.writeFile ?? writeFile;
  const setMode = deps.chmod ?? chmod;
  const remove = deps.rm ?? rm;

  async function context(ctx, notify = false) {
    let result;
    try { result = await run(OBSERVE, ["architect-context"], { cwd: ctx.cwd }); }
    catch (error) {
      if (notify) ctx.ui.notify(`Cannot load Architect context: ${error instanceof Error ? error.message : String(error)}`, "error");
      return undefined;
    }
    if (result?.killed || result?.code !== 0) {
      if (notify) ctx.ui.notify(`Cannot load Architect context: ${executionReason(result, "qq-observe architect-context failed")}`, "error");
      return undefined;
    }
    try { return parseContext(result.stdout); }
    catch (error) {
      if (notify) ctx.ui.notify(`Cannot load Architect context: ${error instanceof Error ? error.message : String(error)}`, "error");
      return undefined;
    }
  }
  async function temporaryJson(value, callback) {
    const directory = await makeTemp(join(tmpdir(), "qq-architect-"));
    try {
      const path = join(directory, "data.json");
      await save(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await setMode(path, 0o600);
      return await callback(path, directory);
    } finally { await remove(directory, { recursive: true, force: true }).catch(() => {}); }
  }
  async function execute(ctx, command, args) {
    try { return await run(command, args, { cwd: ctx.cwd }); }
    catch (error) { return { code: 70, stderr: error instanceof Error ? error.message : String(error), killed: false }; }
  }
  async function settleDispositions(ctx, decisions) {
    return temporaryJson(decisions, async (path) => {
      const settled = await execute(ctx, OBSERVE, ["disposition-settle", "--decisions", path]);
      if (settled.killed || settled.code !== 0)
        return response("error", `Architect settlement invariant failed: qq-observe could not settle dispositions: ${executionReason(settled, "disposition-settle failed")}. Refresh /architect, correct the reported decision invariant, and settle again.`);
      let document;
      try { document = JSON.parse(settled.stdout); }
      catch { return response("error", "Architect settlement output invariant failed: disposition-settle must return JSON; inspect qq-observe and settle again."); }
      if (!exactObject(document, ["status", "settled"]) || document.status !== "settled" ||
        !Array.isArray(document.settled) || document.settled.join("\n") !== decisions.map((decision) => decision.recurrence_key).join("\n"))
        return response("error", "Architect settlement identity invariant failed: disposition-settle must settle exactly the submitted keys; reload /architect before settling again.");
      const message = settlementSummary(decisions);
      ctx.ui.notify(message, "info");
      return response("settled", message, { settled: document.settled });
    });
  }

  pi.registerTool({
    name: "architect_disposition",
    label: "Architect Decisions",
    description: "Settle explicitly operator-settled Architect dispositions into the append-only external Backlog document in one call.",
    promptSnippet: "Settle only explicitly operator-settled decisions after a clear operator affirmative",
    promptGuidelines: [
      "Use architect_disposition only after the operator has explicitly settled findings. Omit untouched findings. Route requires a non-empty operator-settled scope; set_aside has empty scope. Present the returned settlement summary.",
    ],
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["settle"] },
        decisions: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: false,
          properties: { recurrence_key: { type: "string", minLength: 1 },
            action: { type: "string", enum: ["route", "set_aside"] }, scope: { type: "string" }, note: { type: "string" } },
          required: ["recurrence_key", "action", "scope", "note"] } },
      }, required: ["action", "decisions"],
    },
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!params || params.action !== "settle")
        return response("refused", "Action invariant failed: action must be settle; propose and confirm are one settlement call now.");
      if (!exactObject(params, ["action", "decisions"]))
        return response("refused", "Settlement field invariant failed: pass exactly action and decisions; occurrence coverage and batch/context identities are derived internally.");
      let decisions;
      try { decisions = bindDecisions(params.decisions); }
      catch (error) { return response("refused", error instanceof Error ? error.message : String(error)); }
      return settleDispositions(ctx, decisions);
    },
  });

  pi.registerCommand("architect", {
    description: "Open the current global Observer Architect conversation.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return ctx.ui.notify("The architect flow needs an interactive Pi session.", "warning");
      const loaded = await context(ctx, true);
      if (!loaded) return;
      pi.sendUserMessage(`Current global Observer Architect context (compact JSON):\n\n${JSON.stringify(loaded.value)}\n\nSynthesize what is new or still unsettled across these source occurrences, including recurring preemptive complexity across findings. Ask what consequential reality demonstrated the need before recommending action; do not recommend or route a remedy that reproduces the pattern. Connect related findings, recommend what matters, and hold an open-ended conversation; do not force decisions or fixed verdict labels. Read detailed analysis only from each cited source.run_dir/analysis.json behind the scenes. Observer health is informational only: report failed or pending observation honestly, but do not fabricate findings from health rows, route them, auto-remediate them, create Tasks from them, or treat them as a merge veto. A finding is covered only by a settled entry in the external Observer-dispositions document or an exact key hit in a Backlog decision record; Tasks, plans, and other documents never cover. Only after the operator has explicitly settled selective findings, call architect_disposition action=settle with one decision per key: route with the agreed non-empty scope, set_aside with empty scope. The settlement validates against current occurrences and derives identities internally. Omit untouched findings and present the returned settlement summary.`);
    },
  });
}
