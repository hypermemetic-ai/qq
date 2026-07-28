// @ts-nocheck

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { encodeModelContext } from "./lib/model-context.ts";

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
function clearBatchAffirmative(value, batchId) {
  if (!text(value, true) || !text(batchId, true)) return false;
  const normalized = value.trim().toLowerCase().replace(/[.,!;:—'’]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized.includes(batchId.toLowerCase())) return false;
  const words = normalized.split(" ");
  if (["no", "not", "dont", "cancel", "stop", "hold", "wait"].some((word) => words.includes(word))) return false;
  return ["yes", "yep", "sure", "absolutely", "certainly", "confirm", "confirmed", "approve", "approved", "proceed", "start", "okay", "ok"].some((word) => words.includes(word)) ||
    normalized.includes("go ahead") || normalized.includes("do it") || normalized.includes("looks good") || normalized.includes("sounds good");
}
function contextInvariant(label, requirement) {
  throw new Error(`${label} invariant failed: ${requirement}; reload with qq-observe architect-context and retry.`);
}

function parseContext(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { contextInvariant("Architect context JSON", "output must be valid JSON"); }
  const topKeys = ["schema", "schema_version", "context_id", "findings", "pending_intakes", "observer_health", "omitted_findings"];
  if (!exactObject(value, topKeys) || value.schema !== "qq-observer.architect-context" || value.schema_version !== 3 ||
    !/^context-[0-9a-f]{32}$/.test(value.context_id) || !Array.isArray(value.findings) || value.findings.length > 50 ||
    !Array.isArray(value.pending_intakes) || !Number.isInteger(value.omitted_findings) || value.omitted_findings < 0)
    contextInvariant("Architect context top-level", `use exactly ${topKeys.join(", ")}, schema version 3, a canonical context_id, at most 50 findings, an intake array, and a non-negative omission count`);
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
  const occurrences = new Map(), occurrenceIds = new Set(), keys = new Set(), pendingIntakes = new Map();
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
    if (!exactObject(finding, ["recurrence_key", "title", "kind", "confidence", "suggested_scope", "occurrences"]) ||
      !text(finding.recurrence_key, true) || keys.has(finding.recurrence_key) || !text(finding.title, true) || !text(finding.kind, true) ||
      !["high", "medium", "low"].includes(finding.confidence) || !text(finding.suggested_scope) || !Array.isArray(finding.occurrences) || !finding.occurrences.length)
      contextInvariant(`Architect finding ${index}`, "use the exact finding fields, a unique non-empty recurrence_key, safe text, valid confidence, and at least one occurrence");
    keys.add(finding.recurrence_key);
    finding.occurrences.forEach((occurrence, occurrenceIndex) => parseOccurrence(occurrence, finding.recurrence_key, true, `Architect finding ${index} occurrence ${occurrenceIndex}`));
  }
  for (const [index, intake] of value.pending_intakes.entries()) {
    const intakeKeys = ["batch_id", "context_id", "handoff_id", "status", "attempt_statuses", "decisions", "occurrences", "batch_dir", "handoff_path", "result_path", "attempt_paths"];
    if (!exactObject(intake, intakeKeys) || !/^batch-[0-9a-f]{32}$/.test(intake.batch_id) || pendingIntakes.has(intake.batch_id) ||
      !/^context-[0-9a-f]{32}$/.test(intake.context_id) || !/^handoff-[0-9a-f]{32}$/.test(intake.handoff_id) ||
      !["prepared", "attempted_awaiting_result"].includes(intake.status) || !Array.isArray(intake.attempt_statuses) ||
      intake.attempt_statuses.some((status) => !["done", "error", "refused"].includes(status)) || !Array.isArray(intake.decisions) || !intake.decisions.length ||
      !Array.isArray(intake.occurrences) || !intake.occurrences.length || !text(intake.batch_dir, true) || !text(intake.handoff_path, true) ||
      !text(intake.result_path, true) || !Array.isArray(intake.attempt_paths) || intake.attempt_paths.some((path) => !text(path, true)))
      contextInvariant(`Pending intake ${index}`, "use the exact intake fields, canonical unique batch/context/handoff ids, valid pending/history status, non-empty decisions/occurrences, and safe paths");
    const pendingOccurrences = new Map();
    intake.occurrences.forEach((occurrence, occurrenceIndex) => {
      parseOccurrence(occurrence, occurrence.recurrence_key, false, `Pending intake ${index} occurrence ${occurrenceIndex}`);
      pendingOccurrences.set(occurrence.occurrence_id, occurrence);
    });
    const selected = new Set(), decisionKeys = new Set(); let routed = false;
    for (const [decisionIndex, decision] of intake.decisions.entries()) {
      if (!exactObject(decision, ["decision_id", "recurrence_key", "occurrence_ids", "action", "scope", "note"]) ||
        !/^decision-[0-9a-f]{32}$/.test(decision.decision_id) || !text(decision.recurrence_key, true) || decisionKeys.has(decision.recurrence_key) ||
        !Array.isArray(decision.occurrence_ids) || !decision.occurrence_ids.length || decision.occurrence_ids.join("\n") !== [...decision.occurrence_ids].sort().join("\n") ||
        decision.occurrence_ids.some((id) => !pendingOccurrences.has(id) || selected.has(id) || pendingOccurrences.get(id).recurrence_key !== decision.recurrence_key) ||
        !["route", "set_aside"].includes(decision.action) || !text(decision.scope) || !text(decision.note) ||
        (decision.action === "route" ? !decision.scope.trim() : decision.scope !== ""))
        contextInvariant(`Pending intake ${index} decision ${decisionIndex}`, "use the exact decision fields, canonical id, one unique key, sorted exact occurrence coverage, supported action, and route/non-route scope contract");
      decisionKeys.add(decision.recurrence_key); decision.occurrence_ids.forEach((id) => selected.add(id)); routed ||= decision.action === "route";
    }
    if (!routed || selected.size !== pendingOccurrences.size)
      contextInvariant(`Pending intake ${index} coverage`, "include a route and cover every pending occurrence exactly once");
    pendingIntakes.set(intake.batch_id, intake);
  }
  return { value, occurrences, pendingIntakes };
}

function bindDecisions(value, context) {
  if (!Array.isArray(value) || !value.length) throw new Error("Decision list invariant failed: decisions must be a non-empty array; provide one settled decision or omit the tool call.");
  const keys = new Set(), selected = new Set(), decisions = [];
  for (const [index, item] of value.entries()) {
    const label = `Decision ${index}`;
    if (!exactObject(item, ["recurrence_key", "occurrence_ids", "action", "scope", "note"]))
      throw new Error(`${label} field invariant failed: use exactly recurrence_key, occurrence_ids, action, scope, and note; correct the decision object.`);
    if (!text(item.recurrence_key, true) || keys.has(item.recurrence_key))
      throw new Error(`${label} recurrence invariant failed: recurrence_key must be non-empty and appear once; merge duplicate-key selections.`);
    if (!Array.isArray(item.occurrence_ids) || !item.occurrence_ids.length || item.occurrence_ids.some((id) => typeof id !== "string"))
      throw new Error(`${label} occurrence invariant failed: occurrence_ids must be a non-empty string array; copy ids from the current finding.`);
    if (item.occurrence_ids.join("\n") !== [...item.occurrence_ids].sort().join("\n"))
      throw new Error(`${label} occurrence order invariant failed: occurrence_ids must be sorted; sort them and retry.`);
    if (new Set(item.occurrence_ids).size !== item.occurrence_ids.length)
      throw new Error(`${label} occurrence uniqueness invariant failed: each occurrence_id may appear once; remove duplicates.`);
    if (!["route", "set_aside"].includes(item.action))
      throw new Error(`${label} action invariant failed: action must be route or set_aside; choose one supported action.`);
    if (!text(item.scope) || !text(item.note))
      throw new Error(`${label} text invariant failed: scope and note must be valid text; remove control characters or oversized values.`);
    if (item.action === "route" && !item.scope.trim())
      throw new Error(`${label} route scope invariant failed: route requires a non-empty operator-settled scope; provide that scope.`);
    if (item.action === "set_aside" && item.scope !== "")
      throw new Error(`${label} set_aside scope invariant failed: set_aside requires scope to be empty; set scope to an empty string.`);
    for (const id of item.occurrence_ids) {
      const occurrence = context.occurrences.get(id);
      if (!occurrence)
        throw new Error(`${label} membership invariant failed: ${id} is not selectable in this context; refresh /architect and copy a current occurrence_id.`);
      if (occurrence.recurrence_key !== item.recurrence_key)
        throw new Error(`${label} recurrence binding invariant failed: ${id} belongs to ${occurrence.recurrence_key}; use its matching recurrence_key.`);
      if (selected.has(id))
        throw new Error(`${label} cross-decision coverage invariant failed: ${id} is already selected; include each occurrence once.`);
      selected.add(id);
    }
    keys.add(item.recurrence_key);
    decisions.push({ recurrence_key: item.recurrence_key, occurrence_ids: [...item.occurrence_ids], action: item.action, scope: item.scope, note: item.note });
  }
  return decisions;
}

function proposalSummary(decisions, batchId) {
  const lines = [`Prepared durable Architect batch ${batchId}:`];
  for (const decision of decisions) {
    lines.push(`- ${decision.recurrence_key}: ${decision.action === "route" ? "Route follow-up" : "Set aside current evidence"}`);
    lines.push(`  Covered occurrences: ${decision.occurrence_ids.join(", ")}`);
    if (decision.action === "route") lines.push(`  Agreed scope: ${decision.scope}`);
    if (decision.note) lines.push(`  Note: ${decision.note}`);
  }
  lines.push(`To start its accountable recipient, give a clear affirmative that references ${batchId}.`);
  return lines.join("\n");
}

export default function register(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const makeTemp = deps.mkdtemp ?? mkdtemp;
  const save = deps.writeFile ?? writeFile;
  const setMode = deps.chmod ?? chmod;
  const remove = deps.rm ?? rm;
  let interactiveSequence = 0;
  let latestInteractiveText = "";

  pi.on("input", (event) => {
    if (event?.source === "interactive" && text(event.text, true)) {
      interactiveSequence += 1;
      latestInteractiveText = event.text.trim();
    }
  });

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
  async function startIntake(ctx, intake) {
    const execution = await execute(ctx, "qq-handoff", ["intake-start", "--handoff", intake.handoff_path, "--repo", ctx.cwd]);
    let receipt;
    try { receipt = JSON.parse(execution.stdout); } catch { receipt = undefined; }
    const validReceipt = receipt?.schema === "qq-handoff/v1" && receipt?.version === 1 &&
      receipt?.engine === "qq-handoff" && receipt?.action === "intake-start" && receipt?.handoff_id === intake.handoff_id &&
      ["done", "error", "refused"].includes(receipt?.status);
    if (!execution.killed && execution.code === 0 && validReceipt && receipt.status === "done") {
      const message = `Confirmed ${intake.batch_id}; one accountable recipient started. The batch remains pending until complete verified Task intake is recorded.`;
      ctx.ui.notify(message, "info");
      return response("routed", message, { batch_id: intake.batch_id, handoff_id: intake.handoff_id, tab_id: receipt.transaction?.created_tab_id });
    }
    const reason = validReceipt ? receipt.message ?? receipt.status : executionReason(execution, "missing canonical qq-handoff receipt");
    return response("pending", `Recipient start for ${intake.batch_id} did not complete: ${reason}. The durable batch remains pending; correct recipient availability and affirm the batch again.`,
      { batch_id: intake.batch_id, handoff_id: intake.handoff_id });
  }
  async function prepareBatch(ctx, contextId, decisions) {
    return temporaryJson(decisions, async (path) => {
      const prepared = await execute(ctx, OBSERVE, ["prepare-handoff", "--context", contextId, "--decisions", path]);
      if (prepared.killed || prepared.code !== 0)
        return response("error", `Architect proposal invariant failed: qq-observe could not durably prepare context ${contextId}: ${executionReason(prepared, "prepare-handoff failed")}. Refresh /architect, correct the reported decision invariant, and propose again.`);
      let document;
      try { document = JSON.parse(prepared.stdout); }
      catch { return response("error", "Architect proposal output invariant failed: prepare-handoff must return JSON; inspect qq-observe and propose again."); }
      const batch = document?.batch;
      if (!/^batch-[0-9a-f]{32}$/.test(batch?.batch_id ?? "") || batch?.context_id !== contextId)
        return response("error", "Architect proposal identity invariant failed: durable batch_id/context_id must match the proposed context; reload /architect before proposing again.");
      if (!text(document?.batch_dir, true) || (document.handoff_path !== null && !text(document.handoff_path, true)))
        return response("error", "Architect proposal path invariant failed: prepare-handoff must return a durable batch_dir and a handoff path or null; inspect qq-observe and propose again.");
      if (document.handoff_path === null) {
        const message = `Recorded durable batch ${batch.batch_id}; all selected evidence is set aside and no Task or recipient was created.`;
        ctx.ui.notify(message, "info");
        return response("settled", message, { batch_id: batch.batch_id, context_id: contextId });
      }
      if (!/^handoff-[0-9a-f]{32}$/.test(batch.handoff_id ?? ""))
        return response("error", "Architect proposal handoff invariant failed: a routed durable batch must carry a canonical handoff_id; inspect qq-observe and propose again.");
      return response("proposed", proposalSummary(decisions, batch.batch_id), {
        batch_id: batch.batch_id, context_id: contextId, handoff_id: batch.handoff_id,
      });
    });
  }

  pi.registerTool({
    name: "architect_disposition",
    label: "Architect Decisions",
    description: "Prepare a durable selective batch, then confirm a pending batch by durable batch/context identity.",
    promptSnippet: "Propose only settled decisions; confirm a durable pending batch after a clear operator affirmative that references its batch_id",
    promptGuidelines: [
      "Use action=propose only for explicitly settled findings. Omit untouched findings. Route requires non-empty operator-settled scope; set_aside has empty scope. Present the returned durable batch summary.",
      "After a clear interactive operator affirmative that references the returned batch_id, use action=confirm with only action, context_id, and batch_id. Confirmation re-reads pending_intakes from durable Architect context; never replay decisions or pass operator prose.",
    ],
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["propose", "confirm"] },
        context_id: { type: "string", pattern: "^context-[0-9a-f]{32}$" },
        decisions: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: false,
          properties: { recurrence_key: { type: "string", minLength: 1 }, occurrence_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
            action: { type: "string", enum: ["route", "set_aside"] }, scope: { type: "string" }, note: { type: "string" } },
          required: ["recurrence_key", "occurrence_ids", "action", "scope", "note"] } },
        batch_id: { type: "string", pattern: "^batch-[0-9a-f]{32}$" },
      }, required: ["action", "context_id"],
    },
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI || ctx.mode !== "tui")
        return response("refused", "Interactive TUI invariant failed: architect_disposition requires the Architect TUI; reopen the Architect in an interactive Pi session.");
      if (!params || !["propose", "confirm"].includes(params.action))
        return response("refused", "Action invariant failed: action must be propose or confirm; choose the operation matching the current durable batch state.");
      if (params.action === "propose") {
        if (!exactObject(params, ["action", "context_id", "decisions"]))
          return response("refused", "Proposal field invariant failed: pass exactly action, context_id, and decisions; remove batch or confirmation fields.");
        const fresh = await context(ctx);
        if (!fresh) return response("error", "Architect context read invariant failed: qq-observe architect-context was unavailable or invalid; run /architect and propose again.");
        if (params.context_id !== fresh.value.context_id)
          return response("refused", `Proposal context invariant failed: ${params.context_id} is not the current selectable context ${fresh.value.context_id}; run /architect and rebuild the proposal from current occurrence IDs.`);
        let decisions;
        try { decisions = bindDecisions(params.decisions, fresh); }
        catch (error) { return response("refused", error instanceof Error ? error.message : String(error)); }
        return prepareBatch(ctx, params.context_id, decisions);
      }
      if (!exactObject(params, ["action", "context_id", "batch_id"]))
        return response("refused", "Confirmation field invariant failed: pass only action, context_id, and batch_id; remove decisions and operator prose.");
      const durable = await context(ctx);
      if (!durable) return response("error", "Durable confirmation read invariant failed: qq-observe architect-context was unavailable or invalid; restore that reader and confirm the same batch again.");
      const intake = durable.pendingIntakes.get(params.batch_id);
      if (!intake)
        return response("refused", `Pending batch invariant failed: ${params.batch_id} is not in durable pending_intakes; run /architect and use a listed pending batch_id.`);
      if (intake.context_id !== params.context_id)
        return response("refused", `Batch context invariant failed: ${params.batch_id} belongs to ${intake.context_id}; confirm with that durable context_id.`);
      if (!interactiveSequence || !clearBatchAffirmative(latestInteractiveText, params.batch_id))
        return response("refused", `Operator authority invariant failed: the latest interactive reply must be a clear affirmative that references ${params.batch_id}; ask for or wait for that reply, then confirm by identity only.`);
      return startIntake(ctx, intake);
    },
  });

  pi.registerCommand("architect", {
    description: "Open the current global Observer Architect conversation.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return ctx.ui.notify("The architect flow needs an interactive Pi session.", "warning");
      const loaded = await context(ctx, true);
      if (!loaded) return;
      pi.sendUserMessage(`Current global Observer Architect context (deterministic TOON):\n\n${encodeModelContext(loaded.value)}\n\nSynthesize what is new or still unsettled across these source occurrences. Connect related findings, recommend what matters, and hold an open-ended conversation; do not force decisions or fixed verdict labels. Read detailed analysis only from each cited source.run_dir/analysis.json behind the scenes. Observer health is informational only: report failed or pending observation honestly, but do not fabricate findings from health rows, route them, auto-remediate them, create Tasks from them, or treat them as a merge veto. Pending intakes are durable operator-settled batches: do not re-decide or re-propose them. After a clear operator affirmative referencing a pending batch_id, confirm it with only that batch_id and its context_id; the tool re-reads durable state and starts the recipient without decision replay. Only when the operator has explicitly settled a selective new batch, call architect_disposition action=propose with this exact context_id and exact occurrence IDs. Omit untouched findings and present the returned durable batch summary.`);
    },
  });
}
