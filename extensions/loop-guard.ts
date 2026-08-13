// @ts-nocheck
// Stop Grok-style turn degeneration: five identical consecutive turns abort
// the run. The first trip rewinds /tree to the last non-copy leaf; a second
// trip in the same session just stops.

export const STREAK_LIMIT = 5;

const WHITESPACE = /\s+/g;

export function normalizeText(value) {
  return String(value ?? "").replace(WHITESPACE, " ").trim();
}

function stable(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function fingerprintPart(part) {
  if (!part || typeof part !== "object") return null;
  if (part.type === "text") return ["text", normalizeText(part.text)];
  if (part.type === "toolCall") {
    return ["tool", part.name ?? "", JSON.stringify(stable(part.arguments ?? {}))];
  }
  return null;
}

export function fingerprintTurn(event) {
  const message = event?.message;
  if (!message || message.role !== "assistant") return "";
  const parts = [];
  for (const part of Array.isArray(message.content) ? message.content : []) {
    const fingerprinted = fingerprintPart(part);
    if (fingerprinted) parts.push(fingerprinted);
  }
  if (!parts.length) return "";
  return JSON.stringify(parts);
}

export function usableRewindTarget(branch, id) {
  if (typeof id !== "string" || id === "") return undefined;
  const entry = Array.isArray(branch) ? branch.find((item) => item?.id === id) : undefined;
  if (entry?.type === "message" && entry.message?.role === "user") return undefined;
  return id;
}

export default function registerLoopGuard(pi, deps = {}) {
  const limit = Number.isInteger(deps.limit) && deps.limit > 0 ? deps.limit : STREAK_LIMIT;
  let lastFingerprint = "";
  let streak = 0;
  let lastGoodId;
  let preTurnLeaf;
  let recovered = false;
  let pending;

  const resetStreak = () => {
    lastFingerprint = "";
    streak = 0;
    lastGoodId = undefined;
    preTurnLeaf = undefined;
  };

  const reset = () => {
    resetStreak();
    recovered = false;
    pending = undefined;
  };

  pi.on("session_start", reset);
  pi.on("session_tree", () => {
    if (pending) return;
    resetStreak();
  });

  pi.on("turn_start", (_event, ctx) => {
    if (pending) return;
    preTurnLeaf = ctx.sessionManager?.getLeafId?.();
  });

  pi.on("turn_end", (event, ctx) => {
    if (pending) return;
    const fingerprint = fingerprintTurn(event);
    if (!fingerprint) {
      resetStreak();
      return;
    }

    if (fingerprint === lastFingerprint) {
      streak += 1;
    } else {
      lastFingerprint = fingerprint;
      streak = 1;
      lastGoodId = usableRewindTarget(ctx.sessionManager?.getBranch?.() ?? [], preTurnLeaf);
    }
    if (streak < limit) return;

    pending = { streak, target: lastGoodId };
    ctx.abort();
  });

  pi.on("agent_settled", async (_event, ctx) => {
    const action = pending;
    if (!action) return;
    pending = undefined;

    const canRewind = !recovered && action.target && typeof ctx.navigateTree === "function";
    if (!canRewind) {
      const again = recovered;
      recovered = true;
      resetStreak();
      ctx.ui?.notify?.(
        again
          ? `qq loop-guard: ${action.streak} identical turns after rewind; stopped.`
          : `qq loop-guard: ${action.streak} identical turns; stopped.`,
        "warning",
      );
      return;
    }

    await ctx.navigateTree(action.target, { summarize: false });
    recovered = true;
    resetStreak();
    ctx.ui?.notify?.(
      "qq loop-guard: rewound to the last good leaf after identical turns.",
      "warning",
    );
  });
}
