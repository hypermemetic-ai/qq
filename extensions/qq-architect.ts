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

}
