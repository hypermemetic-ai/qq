// @ts-nocheck
import { profileFor, readExecutionPolicy } from "../bin/lib/execution-profiles.mjs";

// Grok 4.6 only. Three exact repetitions of a substantial block (up to 96
// words) inside one streamed response abort and receive one terse grounding message. A recurrence
// within the next few completed turns enters the existing escalation: rewind
// once, then switch to runner sol-high. Five adjacent similar completed turns
// still enter that escalation directly. Delete this file and its index import
// to retire.

export const STREAK_LIMIT = 5;
export const MIN_CHARS = 40;
export const SIMILARITY = 0.6;
export const TEXT_CAP = 240;
export const TARGET_MODEL = "grok-4.6";
export const FALLBACK_ROLE = "runner";
export const FALLBACK_PROFILE = "sol-high";
export const SANITY_MESSAGE = "Stop, you are repeating yourself. Continue with the work.";
export const RECOVERY_TURNS = 3;
export const REPEAT_MIN_WORDS = 12;
export const REPEAT_MAX_WORDS = 96;
export const REPEAT_COUNT = 3;
export const STREAM_TEXT_CAP = 12_000;
export const STREAM_WORD_CAP = REPEAT_COUNT * REPEAT_MAX_WORDS + REPEAT_MAX_WORDS;

const WHITESPACE = /\s+/g;
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function normalizeText(value) {
  return String(value ?? "").replace(WHITESPACE, " ").trim().toLowerCase();
}

export function assistantText(event) {
  const message = event?.message;
  if (!message || message.role !== "assistant") return "";
  const parts = [];
  for (const part of Array.isArray(message.content) ? message.content : []) {
    if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
  }
  const text = normalizeText(parts.join(" "));
  return text.length >= MIN_CHARS ? text.slice(0, TEXT_CAP) : "";
}

export function trigrams(text) {
  const grams = new Set();
  for (let i = 0; i <= text.length - 3; i += 1) grams.add(text.slice(i, i + 3));
  return grams;
}

export function jaccard(left, right) {
  if (!left || !right) return 0;
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const gram of a) if (b.has(gram)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

export function repeatedStreamBlock(value, options = {}) {
  const repeats = Number.isInteger(options.repeats) ? options.repeats : REPEAT_COUNT;
  const minimum = Number.isInteger(options.minimum) ? options.minimum : REPEAT_MIN_WORDS;
  const maximum = Number.isInteger(options.maximum) ? options.maximum : REPEAT_MAX_WORDS;
  const words = (normalizeText(value).match(WORD) ?? []).slice(-STREAM_WORD_CAP);
  if (repeats < 2 || minimum < 1 || maximum < minimum || words.length < repeats * minimum) return undefined;

  for (let end = repeats * minimum; end <= words.length; end += 1) {
    const largest = Math.min(maximum, Math.floor(end / repeats));
    for (let size = minimum; size <= largest; size += 1) {
      const start = end - repeats * size;
      let same = true;
      for (let offset = size; offset < repeats * size; offset += 1) {
        if (words[start + offset] !== words[start + (offset % size)]) {
          same = false;
          break;
        }
      }
      if (same) return { repeats, words: size, text: words.slice(start, start + size).join(" ") };
    }
  }
  return undefined;
}

export function isGrok46(ctx) {
  return ctx?.model?.id === TARGET_MODEL;
}

export async function applyFallbackProfile(pi, ctx, deps = {}) {
  const policy = await (deps.readPolicy ?? readExecutionPolicy)(deps.policyPath);
  const selected = profileFor(policy, FALLBACK_ROLE, FALLBACK_PROFILE);
  const model = ctx.modelRegistry?.find?.(selected.profile.provider, selected.profile.model);
  if (!model) throw new Error(`fallback model is unavailable: ${selected.profile.provider}/${selected.profile.model}`);
  if (!await pi.setModel(model)) throw new Error(`fallback model has no configured authentication: ${selected.profile.provider}/${selected.profile.model}`);
  pi.setThinkingLevel(selected.profile.effort);
  const actual = pi.getThinkingLevel?.();
  if (actual !== undefined && actual !== selected.profile.effort) {
    throw new Error(`fallback effort ${selected.profile.effort} is unsupported; Pi selected ${actual}`);
  }
  pi.events?.emit?.("qq:role-selected", { role: FALLBACK_ROLE, profile: selected.name });
  ctx.ui?.setStatus?.("qq-profile", `${FALLBACK_ROLE}:${selected.name}`);
  return selected;
}

function usableRewindTarget(branch, id) {
  if (typeof id !== "string" || id === "") return undefined;
  const entry = Array.isArray(branch) ? branch.find((item) => item?.id === id) : undefined;
  if (entry?.type === "message" && entry.message?.role === "user") return undefined;
  return id;
}

export default function registerGrokParaphraseGuard(pi, deps = {}) {
  const limit = Number.isInteger(deps.limit) && deps.limit > 0 ? deps.limit : STREAK_LIMIT;
  const threshold = typeof deps.similarity === "number" ? deps.similarity : SIMILARITY;
  let lastText = "";
  let streak = 0;
  let lastGoodId;
  let preTurnLeaf;
  let recovered = false;
  let pending;
  let streamText = "";
  let sanityTurns = 0;

  const resetStreak = () => {
    lastText = "";
    streak = 0;
    lastGoodId = undefined;
    preTurnLeaf = undefined;
  };

  const reset = () => {
    resetStreak();
    recovered = false;
    pending = undefined;
    streamText = "";
    sanityTurns = 0;
  };

  pi.on("session_start", reset);
  pi.on("session_tree", () => {
    if (pending) return;
    resetStreak();
  });

  pi.on("turn_start", (_event, ctx) => {
    if (pending) return;
    streamText = "";
    preTurnLeaf = ctx.sessionManager?.getLeafId?.();
  });

  pi.on("message_update", (event, ctx) => {
    if (pending || !isGrok46(ctx)) return;
    const update = event?.assistantMessageEvent;
    if ((update?.type !== "thinking_delta" && update?.type !== "text_delta") || typeof update.delta !== "string") return;
    streamText = (streamText + update.delta).slice(-STREAM_TEXT_CAP);
    const repeat = repeatedStreamBlock(streamText, deps.streamRepeat);
    if (!repeat) return;

    const sanity = sanityTurns === 0 && !recovered;
    if (!sanity) sanityTurns = 0;
    pending = {
      sanity,
      source: "stream",
      streak: repeat.repeats,
      target: lastGoodId ?? usableRewindTarget(ctx.sessionManager?.getBranch?.() ?? [], preTurnLeaf),
    };
    ctx.abort();
  });

  pi.on("turn_end", (event, ctx) => {
    if (pending) return;
    if (!isGrok46(ctx)) {
      resetStreak();
      sanityTurns = 0;
      return;
    }
    if (sanityTurns > 0) sanityTurns -= 1;
    const text = assistantText(event);
    if (!text) return;

    if (lastText && jaccard(lastText, text) >= threshold) {
      streak += 1;
    } else {
      streak = 1;
      lastGoodId = usableRewindTarget(ctx.sessionManager?.getBranch?.() ?? [], preTurnLeaf);
    }
    lastText = text;
    if (streak < limit) return;

    pending = { source: "turn", streak, target: lastGoodId };
    ctx.abort();
  });

  pi.on("agent_settled", async (_event, ctx) => {
    const action = pending;
    if (!action) return;
    pending = undefined;
    streamText = "";

    if (action.sanity) {
      resetStreak();
      sanityTurns = RECOVERY_TURNS;
      pi.sendUserMessage(SANITY_MESSAGE);
      ctx.ui?.notify?.("qq grok-paraphrase-guard: aborted in-turn repetition and steered once.", "warning");
      return;
    }

    sanityTurns = 0;
    if (!recovered) {
      if (action.target && typeof ctx.navigateTree === "function") {
        await ctx.navigateTree(action.target, { summarize: false });
        recovered = true;
        resetStreak();
        ctx.ui?.notify?.(
          "qq grok-paraphrase-guard: rewound to the last good leaf after similar turns.",
          "warning",
        );
        return;
      }
      recovered = true;
      resetStreak();
      ctx.ui?.notify?.(
        `qq grok-paraphrase-guard: ${action.streak} similar turns; stopped.`,
        "warning",
      );
      return;
    }

    resetStreak();
    try {
      await applyFallbackProfile(pi, ctx, deps);
      ctx.ui?.notify?.(
        `qq grok-paraphrase-guard: ${action.streak} similar turns after rewind; switched to ${FALLBACK_ROLE} ${FALLBACK_PROFILE}.`,
        "warning",
      );
    } catch (error) {
      ctx.ui?.notify?.(
        `qq grok-paraphrase-guard: ${action.streak} similar turns after rewind; stopped (${error instanceof Error ? error.message : String(error)}).`,
        "warning",
      );
    }
  });
}
