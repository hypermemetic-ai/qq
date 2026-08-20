// Public qq-tasks service. Callers already have the text; this plugin
// does not invent tickets. Rundown is a one-shot model job on this
// plugin's rundown role.

import { oneShot } from "../../qq/src/ask.mjs";

export const RUNDOWN_SYSTEM = [
  "You report on the live task pile. You do not judge. You do not file tickets.",
  "Say what is on the pile, when each item landed, what looks stale, and what contradicts.",
  "Not a raw file listing. Operator and architect judge the report.",
  "No reasoning dump. No essay.",
].join("\n");

function formatPile(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "(empty pile)";
  return rows.map((row) => {
    const when = Number.isFinite(row.issuedAt)
      ? new Date(row.issuedAt).toISOString()
      : "unknown";
    const labels = Array.isArray(row.labels) && row.labels.length > 0
      ? ` labels ${row.labels.join(",")}`
      : "";
    const line = row.oneLine ? ` — ${row.oneLine}` : "";
    return `${row.id} [${row.project}] ${row.title}${line} landed ${when}${labels}`;
  }).join("\n");
}

export function createTasksService(store, options = {}) {
  const settings = options.settings;
  const llmOf = typeof options.llm === "function" ? options.llm : () => options.llm;
  const run = options.runRundown ?? oneShot;

  const service = Object.freeze({
    create(input) {
      return store.create(input);
    },
    read(id) {
      return store.read(id);
    },
    list(filter) {
      return store.list(filter);
    },
    edit(id, patch) {
      return store.edit(id, patch);
    },
    append(id, text) {
      return store.append(id, text);
    },
    archive(id) {
      return store.archive(id);
    },

    /** One-shot report. Refuses when the rundown role is unbound. */
    async rundown() {
      const binding = settings && typeof settings.get === "function" ? settings.get("rundown") : null;
      if (!binding) {
        throw new Error("qq-tasks: rundown refuses (settings unbound)");
      }
      const rows = store.list();
      const user = [
        "Live pile:",
        formatPile(rows),
      ].join("\n");
      const report = await run(llmOf(), binding, { system: RUNDOWN_SYSTEM, user });
      return report || formatPile(rows);
    },
  });

  return service;
}

export const internals = Object.freeze({
  formatPile,
});
