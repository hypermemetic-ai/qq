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
function affirmative(value) {
  if (!text(value, true)) return false;
  const normalized = value.trim().toLowerCase().replace(/[.,!;:—-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(no|not|don't|do not|cancel|stop|hold|wait)\b/.test(normalized)) return false;
  return /^(yes(?: please)?|confirm(?:ed)?|proceed(?: please)?|approved|approve(?: it)?|go ahead|do it|looks good|sounds good|ok|okay)$/.test(normalized);
}
function explicitRetryRequest(value, intake) {
  if (!text(value, true)) return false;
  const normalized = value.trim().toLowerCase().replace(/[.!;:—]+/g, " ").replace(/\s+/g, " ").trim();
  return new Set([
    `retry ${intake.batch_id}`, `retry ${intake.handoff_id}`,
    `retry intake ${intake.batch_id}`, `retry intake ${intake.handoff_id}`,
    `please retry ${intake.batch_id}`, `please retry ${intake.handoff_id}`,
    `please retry intake ${intake.batch_id}`, `please retry intake ${intake.handoff_id}`,
  ]).has(normalized);
}

function parseContext(raw) {
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("output is not valid JSON"); }
  if (!exactObject(value, ["schema", "schema_version", "context_id", "findings", "pending_intakes", "observer_health", "omitted_findings"]) ||
    value.schema !== "qq-observer.architect-context" || value.schema_version !== 3 ||
    !/^context-[0-9a-f]{32}$/.test(value.context_id) || !Array.isArray(value.findings) || value.findings.length > 50 ||
    !Array.isArray(value.pending_intakes) || !Number.isInteger(value.omitted_findings) || value.omitted_findings < 0 ||
    !exactObject(value.observer_health, ["rounds", "omitted_rounds"]) ||
    !Array.isArray(value.observer_health.rounds) || value.observer_health.rounds.length > 20 ||
    !Number.isInteger(value.observer_health.omitted_rounds) || value.observer_health.omitted_rounds < 0) {
    throw new Error("context has the wrong top-level shape");
  }
  for (const round of value.observer_health.rounds) {
    if (!exactObject(round, ["status", "repository", "pr", "run_dir", "assembled_at", "reason", "reason_truncated"]) ||
      !["analysis_failed", "pending"].includes(round.status) || !text(round.repository, true) ||
      !Number.isInteger(round.pr) || round.pr <= 0 || !text(round.run_dir, true) ||
      !text(round.assembled_at, true) || !text(round.reason, true) || [...round.reason].length > 500 ||
      typeof round.reason_truncated !== "boolean") throw new Error("Observer health round has the wrong shape");
  }
  const occurrences = new Map(), occurrenceIds = new Set(), keys = new Set(), pendingIntakes = new Map();
  function parseOccurrence(occurrence, key, selectable) {
    if (!exactObject(occurrence, ["occurrence_id", "recurrence_key", "source"]) ||
      !/^occurrence-[0-9a-f]{32}$/.test(occurrence.occurrence_id) || occurrenceIds.has(occurrence.occurrence_id) ||
      occurrence.recurrence_key !== key || !exactObject(occurrence.source, ["run_dir", "repository", "legacy", "pr", "variant", "assembled_at"]) ||
      !text(occurrence.source.run_dir, true) || occurrence.source.variant !== "guided" || typeof occurrence.source.legacy !== "boolean" ||
      !Number.isInteger(occurrence.source.pr) || occurrence.source.pr <= 0 || !text(occurrence.source.assembled_at, true) ||
      (occurrence.source.legacy ? occurrence.source.repository !== null : !text(occurrence.source.repository, true))) {
      throw new Error("occurrence has the wrong shape");
    }
    occurrenceIds.add(occurrence.occurrence_id);
    if (selectable) occurrences.set(occurrence.occurrence_id, occurrence);
  }
  for (const finding of value.findings) {
    if (!exactObject(finding, ["recurrence_key", "title", "kind", "confidence", "suggested_scope", "occurrences"]) ||
      !text(finding.recurrence_key, true) || keys.has(finding.recurrence_key) || !text(finding.title, true) ||
      !text(finding.kind, true) || !["high", "medium", "low"].includes(finding.confidence) || !text(finding.suggested_scope) ||
      !Array.isArray(finding.occurrences) || !finding.occurrences.length) throw new Error("finding has the wrong shape");
    keys.add(finding.recurrence_key);
    for (const occurrence of finding.occurrences) parseOccurrence(occurrence, finding.recurrence_key, true);
  }
  for (const intake of value.pending_intakes) {
    if (!exactObject(intake, ["batch_id", "handoff_id", "status", "attempt_statuses", "decisions", "occurrences", "batch_dir", "handoff_path", "result_path", "attempt_paths"]) ||
      !/^batch-[0-9a-f]{32}$/.test(intake.batch_id) || pendingIntakes.has(intake.batch_id) ||
      !/^handoff-[0-9a-f]{32}$/.test(intake.handoff_id) || !["prepared", "attempted_awaiting_result"].includes(intake.status) ||
      !Array.isArray(intake.attempt_statuses) || intake.attempt_statuses.some((status) => !["done", "error", "refused"].includes(status)) ||
      !Array.isArray(intake.decisions) || !intake.decisions.length || !Array.isArray(intake.occurrences) || !intake.occurrences.length ||
      !text(intake.batch_dir, true) || !text(intake.handoff_path, true) || !text(intake.result_path, true) ||
      !Array.isArray(intake.attempt_paths) || intake.attempt_paths.some((path) => !text(path, true))) throw new Error("pending intake has the wrong shape");
    const pendingOccurrences = new Map();
    for (const occurrence of intake.occurrences) {
      parseOccurrence(occurrence, occurrence.recurrence_key, false);
      pendingOccurrences.set(occurrence.occurrence_id, occurrence);
    }
    const selected = new Set(), decisionKeys = new Set(); let routed = false;
    for (const decision of intake.decisions) {
      if (!exactObject(decision, ["decision_id", "recurrence_key", "occurrence_ids", "action", "scope", "note"]) ||
        !/^decision-[0-9a-f]{32}$/.test(decision.decision_id) || !text(decision.recurrence_key, true) || decisionKeys.has(decision.recurrence_key) ||
        !Array.isArray(decision.occurrence_ids) || !decision.occurrence_ids.length || decision.occurrence_ids.join("\n") !== [...decision.occurrence_ids].sort().join("\n") ||
        decision.occurrence_ids.some((id) => !pendingOccurrences.has(id) || selected.has(id) || pendingOccurrences.get(id).recurrence_key !== decision.recurrence_key) ||
        !["route", "set_aside"].includes(decision.action) || !text(decision.scope) || !text(decision.note) ||
        (decision.action === "route" ? !decision.scope.trim() : decision.scope !== "")) throw new Error("pending decision has the wrong shape");
      decisionKeys.add(decision.recurrence_key); decision.occurrence_ids.forEach((id) => selected.add(id)); routed ||= decision.action === "route";
    }
    if (!routed || selected.size !== pendingOccurrences.size) throw new Error("pending intake coverage is incomplete");
    pendingIntakes.set(intake.batch_id, intake);
  }
  return { value, occurrences, pendingIntakes };
}
function bindDecisions(value, context) {
  if (!Array.isArray(value) || !value.length) return undefined;
  const keys = new Set();
  const selected = new Set();
  const decisions = [];
  for (const item of value) {
    if (!exactObject(item, ["recurrence_key", "occurrence_ids", "action", "scope", "note"]) ||
      !text(item.recurrence_key, true) || keys.has(item.recurrence_key) || !Array.isArray(item.occurrence_ids) || !item.occurrence_ids.length ||
      item.occurrence_ids.some((id) => typeof id !== "string") || item.occurrence_ids.join("\n") !== [...item.occurrence_ids].sort().join("\n") ||
      new Set(item.occurrence_ids).size !== item.occurrence_ids.length || !["route", "set_aside"].includes(item.action) ||
      !text(item.scope) || !text(item.note) || (item.action === "route" ? !item.scope.trim() : item.scope !== "")) return undefined;
    for (const id of item.occurrence_ids) {
      const occurrence = context.occurrences.get(id);
      if (!occurrence || occurrence.recurrence_key !== item.recurrence_key || selected.has(id)) return undefined;
      selected.add(id);
    }
    keys.add(item.recurrence_key);
    decisions.push({ recurrence_key: item.recurrence_key, occurrence_ids: [...item.occurrence_ids], action: item.action, scope: item.scope, note: item.note });
  }
  return decisions;
}
function proposalSummary(decisions) {
  const lines = ["Proposed Architect decisions:"];
  for (const decision of decisions) {
    lines.push(`- ${decision.recurrence_key}: ${decision.action === "route" ? "Route follow-up" : "Set aside current evidence"}`);
    lines.push(`  Covered occurrences: ${decision.occurrence_ids.join(", ")}`);
    if (decision.action === "route") lines.push(`  Agreed scope: ${decision.scope}`);
    if (decision.note) lines.push(`  Note: ${decision.note}`);
  }
  lines.push("Confirm this exact batch?");
  return lines.join("\n");
}

export default function register(pi, deps = {}) {
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const makeTemp = deps.mkdtemp ?? mkdtemp;
  const save = deps.writeFile ?? writeFile;
  const setMode = deps.chmod ?? chmod;
  const remove = deps.rm ?? rm;
  let currentContext;
  let contextInteractiveSequence = 0;
  let pending;
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
  async function startIntake(ctx, intake, prefix) {
    const execution = await execute(ctx, "qq-handoff", ["intake-start", "--handoff", intake.handoff_path, "--repo", ctx.cwd]);
    let receipt;
    try { receipt = JSON.parse(execution.stdout); } catch { receipt = undefined; }
    const validReceipt = receipt?.schema === "qq-handoff/v1" && receipt?.version === 1 &&
      receipt?.engine === "qq-handoff" && receipt?.action === "intake-start" && receipt?.handoff_id === intake.handoff_id &&
      ["done", "error", "refused"].includes(receipt?.status);
    if (!validReceipt) receipt = {
      schema: "qq-handoff/v1", version: 1, engine: "qq-handoff", action: "intake-start", status: "error",
      message: `Intake execution was uncertain: ${executionReason(execution, "missing canonical receipt")}`,
      handoff_id: intake.handoff_id, rails: [],
    };
    const recorded = await temporaryJson(receipt, (path) => execute(ctx, OBSERVE,
      ["record-handoff-attempt", "--batch", intake.batch_dir, "--receipt", path]));
    currentContext = undefined;
    pending = undefined;
    if (recorded.killed || recorded.code !== 0) return response("error",
      `${prefix}, but its intake attempt could not be recorded: ${executionReason(recorded, "recording failed")}. The immutable pending batch remains retryable.`,
      { batch_id: intake.batch_id, handoff_id: intake.handoff_id });
    if (!execution.killed && execution.code === 0 && validReceipt && receipt.status === "done") {
      const message = `${prefix}; one accountable recipient started. It remains pending until complete verified Task intake is recorded.`;
      ctx.ui.notify(message, "info");
      return response("routed", message, { batch_id: intake.batch_id, handoff_id: intake.handoff_id, tab_id: receipt.transaction?.created_tab_id });
    }
    return response("pending", `${prefix}, but intake did not complete: ${receipt.message ?? "unknown result"}. The exact immutable batch remains pending and retryable.`,
      { batch_id: intake.batch_id, handoff_id: intake.handoff_id });
  }
  async function confirmBatch(ctx, contextId, decisions) {
    return temporaryJson(decisions, async (path) => {
      const prepared = await execute(ctx, OBSERVE, ["prepare-handoff", "--context", contextId, "--decisions", path]);
      if (prepared.killed || prepared.code !== 0) return response("error", `Architect batch confirmation failed: ${executionReason(prepared, "prepare-handoff failed")}`);
      let document;
      try { document = JSON.parse(prepared.stdout); } catch { return response("error", "Architect batch confirmation returned malformed JSON."); }
      if (!/^batch-[0-9a-f]{32}$/.test(document?.batch?.batch_id ?? "") || document.batch.context_id !== contextId ||
        typeof document.batch_dir !== "string" || (document.handoff_path !== null && typeof document.handoff_path !== "string")) {
        return response("error", "Architect batch confirmation returned mismatched identity evidence.");
      }
      pending = undefined;
      if (document.handoff_path === null) {
        currentContext = undefined;
        const message = `Confirmed ${document.batch.batch_id}; the selected current evidence is set aside and no Task or recipient was created.`;
        ctx.ui.notify(message, "info");
        return response("settled", message, { batch_id: document.batch.batch_id });
      }
      const durable = await context(ctx);
      const intake = durable?.pendingIntakes.get(document.batch.batch_id);
      if (!intake || intake.handoff_id !== document.batch.handoff_id || intake.handoff_path !== document.handoff_path) {
        currentContext = durable;
        return response("error", `Immutable batch ${document.batch.batch_id} was prepared, but its pending authority could not be reloaded; intake was not started.`,
          { batch_id: document.batch.batch_id });
      }
      currentContext = durable;
      return startIntake(ctx, intake, `Confirmed ${document.batch.batch_id}`);
    });
  }

  pi.registerTool({
    name: "architect_disposition",
    label: "Architect Decisions",
    description: "Propose/confirm selective decisions, or retry one exact already-settled pending intake.",
    promptSnippet: "Propose only settled decisions; treat pending intake as operator-settled and retry only on an exact explicit request",
    promptGuidelines: [
      "Use action=propose only for explicitly settled findings. Omit untouched findings. Route requires non-empty operator-settled scope; set_aside has empty scope. Present the exact returned question, then use action=confirm only after a later clear affirmative interactive reply.",
      "pending_intakes are already operator-settled, not findings to reconsider. Use action=retry only after an explicit interactive request exactly naming its batch_id or handoff_id; pass that request and the pending intake's unchanged decisions exactly. Never alter or re-propose them.",
    ],
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["propose", "confirm", "retry"] },
        context_id: { type: "string", pattern: "^context-[0-9a-f]{32}$" },
        decisions: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: false,
          properties: { recurrence_key: { type: "string", minLength: 1 }, occurrence_ids: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string" } },
            action: { type: "string", enum: ["route", "set_aside"] }, scope: { type: "string" }, note: { type: "string" } },
          required: ["recurrence_key", "occurrence_ids", "action", "scope", "note"] } },
        operator_confirmation: { type: "string" },
        batch_id: { type: "string", pattern: "^batch-[0-9a-f]{32}$" },
        handoff_id: { type: "string", pattern: "^handoff-[0-9a-f]{32}$" },
        operator_request: { type: "string" },
      }, required: ["action", "context_id", "decisions"],
    },
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI || ctx.mode !== "tui") return response("refused", "architect_disposition requires the interactive Architect TUI.");
      if (!currentContext) return response("refused", "No current global Architect context is open. Run /architect first.");
      if (!params || !["propose", "confirm", "retry"].includes(params.action) || params.context_id !== currentContext.value.context_id) {
        return response("refused", "The tool input does not match the exact global context opened by /architect.");
      }
      const fresh = await context(ctx);
      if (!fresh) return response("error", "Current Architect context could not be reloaded; no state was changed.");
      if (fresh.value.context_id !== params.context_id) return response("refused", "Architect context or source evidence changed; no state was changed.");
      if (params.action === "retry") {
        if (Object.hasOwn(params, "operator_confirmation") ||
          !text(params.batch_id, true) || !text(params.handoff_id, true) || !text(params.operator_request, true)) {
          return response("refused", "Retry input must bind one exact pending batch/handoff, its unchanged decisions, and the operator's exact request.");
        }
        const intake = fresh.pendingIntakes.get(params.batch_id);
        const expectedDecisions = intake?.decisions.map(({ decision_id: _decisionId, ...decision }) => decision);
        if (!intake || intake.handoff_id !== params.handoff_id || JSON.stringify(params.decisions) !== JSON.stringify(expectedDecisions) ||
          interactiveSequence <= contextInteractiveSequence || params.operator_request.trim() !== latestInteractiveText ||
          !explicitRetryRequest(params.operator_request, intake)) {
          return response("refused", "Retry requires a current pending intake with unchanged decisions and a later explicit interactive request naming its exact batch or handoff; no state was changed.");
        }
        currentContext = fresh;
        return startIntake(ctx, intake, `Retried ${intake.batch_id}`);
      }
      if (Object.hasOwn(params, "batch_id") || Object.hasOwn(params, "handoff_id") || Object.hasOwn(params, "operator_request")) {
        return response("refused", "Proposal and confirmation cannot carry retry authority.");
      }
      const decisions = bindDecisions(params.decisions, fresh);
      if (!decisions) return response("refused", "Decisions contain duplicate, malformed, uncovered, wrong-key, or invalid-scope occurrence selections.");
      const key = JSON.stringify({ context_id: params.context_id, decisions });
      if (params.action === "propose") {
        if (Object.hasOwn(params, "operator_confirmation")) return response("refused", "A proposal cannot carry operator confirmation.");
        const summary = proposalSummary(decisions);
        pending = { key, interactiveSequence, summary };
        return response("proposed", summary, { context_id: params.context_id, decisions });
      }
      if (!pending || pending.key !== key) return response("refused", "No unchanged current proposal is awaiting confirmation.");
      if (!Object.hasOwn(params, "operator_confirmation") || !text(params.operator_confirmation, true) || interactiveSequence <= pending.interactiveSequence ||
        params.operator_confirmation.trim() !== latestInteractiveText || !affirmative(params.operator_confirmation)) {
        return response("refused", "Confirmation requires a later clear affirmative interactive operator reply passed exactly as operator_confirmation; the proposal remains pending.");
      }
      return confirmBatch(ctx, params.context_id, decisions);
    },
  });

  pi.registerCommand("architect", {
    description: "Open the current global Observer Architect conversation.",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return ctx.ui.notify("The architect flow needs an interactive Pi session.", "warning");
      const loaded = await context(ctx, true);
      if (!loaded) return;
      currentContext = loaded;
      contextInteractiveSequence = interactiveSequence;
      pending = undefined;
      pi.sendUserMessage(`Current global Observer Architect context (deterministic TOON):\n\n${encodeModelContext(loaded.value)}\n\nSynthesize what is new or still unsettled across these source occurrences. Connect related findings, recommend what matters, and hold an open-ended conversation; do not force decisions or fixed verdict labels. Read detailed analysis only from each cited source.run_dir/analysis.json behind the scenes. Observer health is informational only: report failed or pending observation honestly, but do not fabricate findings from health rows, route them, retry them, auto-remediate them, create Tasks from them, or treat them as a merge veto. Pending intakes are already operator-settled: do not re-decide or re-propose them. Retry one only after an explicit operator request naming its exact batch_id or handoff_id, and pass its listed decisions unchanged. Only when the operator has explicitly settled a selective new batch, call architect_disposition action=propose with this exact context_id and exact occurrence IDs. Omit untouched findings. Present the tool's exact natural summary/question, and do not call action=confirm until a later clear affirmative operator reply.`);
    },
  });
}
