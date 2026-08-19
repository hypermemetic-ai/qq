// @ts-nocheck

// Grok 4.6 only. In-stream detection follows oh-my-pi's production thinking-loop
// guard: exact suffix cycles, near-duplicate paragraph clusters, and low-novelty
// filler stalls. Recovery follows pi-loop-police: abort, rewrite the looped
// turn so signed reasoning cannot be replayed, strip tainted thinking from later
// model context, and start a new turn. A re-derived plan is trimmed again.
// Five similar completed turns are treated as stagnation, not a rewind or
// model switch. Delete this file and its index import to retire.

export const STREAK_LIMIT = 5;
export const MIN_CHARS = 40;
export const SIMILARITY = 0.6;
export const TEXT_CAP = 240;
export const TARGET_MODEL = "grok-4.6";
export const REDERIVE_THRESHOLD = 0.85;
export const CONSECUTIVE_LOOP_LIMIT = 2;
export const CUSTOM_TYPE = "qq-loop-guard";
export const LOOP_MARKER = "[LOOP — repeated content removed]";
export const STAGNATION_MARKER = "[STAGNATION — repeated plan removed]";
export const REDERIVED_MARKER = "[REDERIVED — blocked plan removed]";
export const CONTEXT_MARKER = "[LOOP REASONING — removed from model context]";
export const STREAM_RECOVERY =
  "Your previous output was repeating itself and has been removed from context. Continue the work with a different approach. Do not reconstruct the removed reasoning.";
export const STAGNATION_RECOVERY =
  "Your last several replies restated the same plan without progress. That reasoning has been removed from context. Take a different concrete action.";
export const REDERIVED_RECOVERY =
  "You re-derived the same blocked plan. It has been removed again. Do not reconstruct it. Take a different concrete action or report the blocker.";
export const STUCK_RECOVERY =
  "You re-derived the same blocked plan twice. Stop reconstructing it. Report the blocker and wait.";
export const SANITY_MESSAGE = STREAM_RECOVERY;
export const EXACT_TAIL_WINDOW = 4096;
export const EXACT_MAX_UNIT = 1024;
export const EXACT_CHECK_STRIDE = 128;
export const EXACT_SHORT_MAX_UNIT = 60;
export const EXACT_SHORT_MIN_REPEATED_CHARS = 180;
export const EXACT_MEDIUM_MIN_REPEATED_CHARS = 240;
export const SEGMENT_CHAR_CAP = 700;
export const SEGMENT_MIN_NORM_CHARS = 60;
export const SEGMENT_WINDOW = 16;
export const SEGMENT_SIMILARITY = 0.8;
export const SEGMENT_MIN_COUNT = 8;
export const SEGMENT_MIN_CLUSTER = 4;
export const LEX_NOVELTY_WINDOW = 8;
export const LEX_STALL_NOVELTY_FLOOR = 0.2;
export const LEX_STALL_MIN_RUN = 8;

const WHITESPACE = /\s+/g;
const CONCRETE_ANCHOR =
  /`[^`]+`|\b\w{2,}\.[a-zA-Z]\w{0,4}\b|[\w-]+(?:\/[\w-]+){2,}|\b\w+_\w+\b|\b[a-z]+[A-Z]\w*\b|\b[A-Z][a-z]+[A-Z]\w*\b/g;

export function normalizeText(value) {
  return String(value ?? "").replace(WHITESPACE, " ").trim().toLowerCase();
}

export function assistantText(event) {
  return visibleText(event?.message);
}

export function visibleText(message) {
  if (!message || message.role !== "assistant") return "";
  const parts = [];
  for (const part of Array.isArray(message.content) ? message.content : []) {
    if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
  }
  const text = normalizeText(parts.join(" "));
  return text.length >= MIN_CHARS ? text.slice(0, TEXT_CAP) : "";
}

export function findLastIndex(message, type) {
  if (!Array.isArray(message?.content)) return -1;
  for (let i = message.content.length - 1; i >= 0; i -= 1) {
    if (message.content[i]?.type === type) return i;
  }
  return -1;
}

export function extractThinking(message) {
  const index = findLastIndex(message, "thinking");
  const block = index >= 0 ? message.content[index] : undefined;
  return typeof block?.thinking === "string" ? block.thinking : "";
}

export function sanitizeThinking(message, marker = LOOP_MARKER) {
  const index = findLastIndex(message, "thinking");
  if (index < 0) return message;
  return {
    ...message,
    content: message.content.map((block, i) => (i === index ? { type: "text", text: marker } : block)),
  };
}

export function replaceLastText(message, text) {
  const index = findLastIndex(message, "text");
  if (index < 0) return message;
  return {
    ...message,
    content: message.content.map((block, i) => (i === index ? { ...block, text } : block)),
  };
}

export function sanitizeTaintedThinking(message, tainted) {
  if (!Array.isArray(message?.content) || !tainted?.size) return message;
  let changed = false;
  const content = message.content.map((block) => {
    if (block?.type !== "thinking" || !tainted.has(block.thinking)) return block;
    changed = true;
    return { type: "text", text: CONTEXT_MARKER };
  });
  return changed ? { ...message, content } : message;
}

export function trigrams(text) {
  const grams = new Set();
  for (let i = 0; i <= text.length - 3; i += 1) grams.add(text.slice(i, i + 3));
  return grams;
}

export function jaccard(left, right) {
  if (!left || !right) return 0;
  return setJaccard(trigrams(left), trigrams(right));
}

export function wordJaccard(left, right) {
  if (!left || !right) return 0;
  const a = new Set(normalizeText(left).split(" ").filter(Boolean));
  const b = new Set(normalizeText(right).split(" ").filter(Boolean));
  return setJaccard(a, b);
}

function setJaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let overlap = 0;
  for (const gram of small) if (large.has(gram)) overlap += 1;
  const union = a.size + b.size - overlap;
  return union === 0 ? 0 : overlap / union;
}

export function normalizeSegment(segment) {
  return String(segment ?? "")
    .toLowerCase()
    .replace(/`([^`]*)`/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => /[a-z]/.test(token))
    .join(" ")
    .trim();
}

export function wordTrigrams(normalized) {
  const words = normalized.split(" ").filter(Boolean);
  if (words.length < 3) return new Set(words.length > 0 ? [words.join(" ")] : []);
  const shingles = new Set();
  for (let i = 0; i + 3 <= words.length; i += 1) {
    shingles.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return shingles;
}

export function detectExactSuffixCycle(text) {
  if (text.length < EXACT_SHORT_MIN_REPEATED_CHARS) return undefined;
  const reversed = text.split("").reverse().join("");
  const z = new Uint16Array(reversed.length);
  let left = 0;
  let right = 0;
  for (let i = 1; i < reversed.length; i += 1) {
    if (i <= right) z[i] = Math.min(right - i + 1, z[i - left]);
    while (i + z[i] < reversed.length && reversed[z[i]] === reversed[i + z[i]]) z[i] += 1;
    if (i + z[i] - 1 > right) {
      left = i;
      right = i + z[i] - 1;
    }
  }

  const maxUnit = Math.min(EXACT_MAX_UNIT, Math.floor(reversed.length / 3));
  for (let len = 2; len <= maxUnit; len += 1) {
    const count = 1 + Math.floor(z[len] / len);
    const short = len <= EXACT_SHORT_MAX_UNIT;
    const minCount = short ? 4 : 3;
    const minChars = short ? EXACT_SHORT_MIN_REPEATED_CHARS : EXACT_MEDIUM_MIN_REPEATED_CHARS;
    if (count < minCount || len * count < minChars) continue;
    const unit = text.slice(-len);
    if (/\p{L}|\p{Extended_Pictographic}/u.test(unit)) return { repeats: count, unit };
  }
  return undefined;
}

export class StreamLoopDetector {
  constructor(options = {}) {
    this.semantic = options.semantic !== false;
    this.tail = "";
    this.scannedAt = 0;
    this.pending = "";
    this.window = [];
    this.count = 0;
    this.wordWindow = [];
    this.lexStallRun = 0;
    this.anchorWindow = [];
  }

  push(delta) {
    if (!delta) return undefined;

    this.tail += delta;
    if (this.tail.length > EXACT_TAIL_WINDOW) this.tail = this.tail.slice(-EXACT_TAIL_WINDOW);
    this.scannedAt += delta.length;
    if (this.scannedAt >= EXACT_CHECK_STRIDE || delta.length >= EXACT_CHECK_STRIDE) {
      this.scannedAt = 0;
      const exact = detectExactSuffixCycle(this.tail);
      if (exact) {
        return `repeated an exact ${exact.unit.length}-character cycle ${exact.repeats}× back-to-back`;
      }
    }

    if (!this.semantic) return undefined;
    this.pending += delta;
    return this.#drainPending(false);
  }

  flush() {
    const exact = detectExactSuffixCycle(this.tail);
    if (exact) {
      return `repeated an exact ${exact.unit.length}-character cycle ${exact.repeats}× back-to-back`;
    }
    if (!this.semantic || !this.pending) return undefined;
    return this.#drainPending(true);
  }

  #drainPending(force) {
    while (true) {
      const boundary = /\n\s*\n/.exec(this.pending);
      let raw;
      if (boundary) {
        raw = this.pending.slice(0, boundary.index);
        this.pending = this.pending.slice(boundary.index + boundary[0].length);
      } else if (force || this.pending.length > SEGMENT_CHAR_CAP) {
        if (!this.pending) return undefined;
        const take = force ? this.pending.length : SEGMENT_CHAR_CAP;
        raw = this.pending.slice(0, take);
        this.pending = this.pending.slice(take);
        if (force) this.pending = "";
      } else {
        return undefined;
      }
      for (let rest = raw; rest.length > 0; ) {
        const chunk = rest.length > SEGMENT_CHAR_CAP ? rest.slice(0, SEGMENT_CHAR_CAP) : rest;
        rest = rest.slice(chunk.length);
        const hit = this.#consumeSegment(chunk);
        if (hit) return hit;
      }
      if (force && !this.pending) return undefined;
    }
  }

  #consumeSegment(raw) {
    const segment = raw
      .replace(/^[ \t]*#{1,6}[ \t].*$/gm, "")
      .replace(/^[ \t]*\*{2,3}.+?\*{2,3}[ \t]*$/gm, "");
    const normalized = normalizeSegment(segment);
    if (normalized.length < SEGMENT_MIN_NORM_CHARS) return undefined;

    const fingerprint = wordTrigrams(normalized);
    let cluster = 1;
    for (const prev of this.window) {
      if (setJaccard(fingerprint, prev) >= SEGMENT_SIMILARITY) cluster += 1;
    }

    const words = new Set(normalized.split(" ").filter(Boolean));
    const priorVocab = new Set();
    for (const set of this.wordWindow) for (const word of set) priorVocab.add(word);
    let unseen = 0;
    for (const word of words) if (!priorVocab.has(word)) unseen += 1;
    const novelty = priorVocab.size === 0 ? 1 : unseen / words.size;

    const anchors = new Set();
    for (const match of segment.matchAll(CONCRETE_ANCHOR)) {
      anchors.add(match[0].replace(/`/g, "").toLowerCase());
    }
    let newAnchor = false;
    for (const anchor of anchors) {
      if (this.anchorWindow.every((seen) => !seen.has(anchor))) {
        newAnchor = true;
        break;
      }
    }

    if (novelty <= LEX_STALL_NOVELTY_FLOOR && !newAnchor) this.lexStallRun += 1;
    else this.lexStallRun = 0;

    this.window.push(fingerprint);
    if (this.window.length > SEGMENT_WINDOW) this.window.shift();
    this.wordWindow.push(words);
    if (this.wordWindow.length > LEX_NOVELTY_WINDOW) this.wordWindow.shift();
    this.anchorWindow.push(anchors);
    if (this.anchorWindow.length > LEX_NOVELTY_WINDOW) this.anchorWindow.shift();
    this.count += 1;

    if (this.count >= SEGMENT_MIN_COUNT) {
      if (cluster >= SEGMENT_MIN_CLUSTER) {
        return `${cluster} near-identical segments within the last ${SEGMENT_WINDOW}`;
      }
      if (this.lexStallRun >= LEX_STALL_MIN_RUN) {
        return `${this.lexStallRun} low-information segments recycling recent wording`;
      }
    }
    return undefined;
  }
}

export function repeatedStreamBlock(value, options = {}) {
  const detector = options.detector ?? new StreamLoopDetector({ semantic: options.semantic === true });
  return detector.push(String(value ?? "")) ?? detector.flush();
}

export function isGrok46(ctx) {
  return ctx?.model?.id === TARGET_MODEL;
}

export default function registerGrokParaphraseGuard(pi, deps = {}) {
  const limit = Number.isInteger(deps.limit) && deps.limit > 0 ? deps.limit : STREAK_LIMIT;
  const threshold = typeof deps.similarity === "number" ? deps.similarity : SIMILARITY;
  const rederive = typeof deps.rederive === "number" ? deps.rederive : REDERIVE_THRESHOLD;
  const consecutiveLimit = Number.isInteger(deps.consecutiveLimit) && deps.consecutiveLimit > 0
    ? deps.consecutiveLimit
    : CONSECUTIVE_LOOP_LIMIT;
  const createDetector = deps.createDetector ?? (() => new StreamLoopDetector({ semantic: deps.semantic !== false }));
  const send = deps.sendMessage ?? ((message, options) => pi.sendMessage(message, options));
  let lastText = "";
  let streak = 0;
  let pending;
  let detector = createDetector();
  let streamKind = "thinking";
  let consecutiveLoops = 0;
  let loopArmed = false;
  let lastThinking = "";
  let rederiveStreak = 0;
  const tainted = new Set();

  const resetStream = () => {
    detector = createDetector();
    streamKind = "thinking";
  };

  const resetStreak = () => {
    lastText = "";
    streak = 0;
  };

  const reset = () => {
    resetStreak();
    pending = undefined;
    resetStream();
    consecutiveLoops = 0;
    loopArmed = false;
    lastThinking = "";
    rederiveStreak = 0;
    tainted.clear();
  };

  const recover = (content) => {
    send({ customType: CUSTOM_TYPE, content, display: true }, { triggerTurn: true });
  };

  pi.on("session_start", reset);
  pi.on("session_tree", () => {
    if (pending) return;
    resetStreak();
  });

  pi.on("turn_start", () => {
    if (pending) return;
    resetStream();
  });

  pi.on("message_update", (event, ctx) => {
    if (pending || !isGrok46(ctx)) return;
    const update = event?.assistantMessageEvent;
    if ((update?.type !== "thinking_delta" && update?.type !== "text_delta") || typeof update.delta !== "string") return;
    streamKind = update.type === "text_delta" ? "text" : "thinking";
    const reason = detector.push(update.delta);
    if (!reason) return;
    pending = { source: "stream", reason, kind: streamKind };
    ctx.abort();
  });

  pi.on("message_end", (event, ctx) => {
    if (!isGrok46(ctx) || event?.message?.role !== "assistant") return;

    const reason = pending?.source === "stream" ? pending.reason : detector.flush();
    if (reason) {
      const kind = pending?.kind ?? streamKind;
      pending = undefined;
      consecutiveLoops += 1;
      const thinking = extractThinking(event.message);
      if (thinking) {
        tainted.add(thinking);
        lastThinking = thinking;
      }
      loopArmed = true;
      resetStream();
      const escalated = consecutiveLoops >= consecutiveLimit;
      recover(escalated ? STUCK_RECOVERY : STREAM_RECOVERY);
      ctx.ui?.notify?.(
        escalated
          ? `qq grok-paraphrase-guard: ${consecutiveLoops} consecutive loops; stopped reconstructing.`
          : "qq grok-paraphrase-guard: aborted in-turn repetition and removed it from context.",
        "warning",
      );
      return {
        message: kind === "text"
          ? replaceLastText(event.message, LOOP_MARKER)
          : sanitizeThinking(event.message, LOOP_MARKER),
      };
    }

    if (loopArmed) {
      loopArmed = false;
      const thinking = extractThinking(event.message);
      if (rederive > 0 && thinking && lastThinking && wordJaccard(lastThinking, thinking) >= rederive) {
        rederiveStreak += 1;
        loopArmed = true;
        tainted.add(thinking);
        resetStream();
        recover(rederiveStreak >= 2 ? STUCK_RECOVERY : REDERIVED_RECOVERY);
        ctx.ui?.notify?.("qq grok-paraphrase-guard: removed re-derived blocked plan.", "warning");
        return { message: sanitizeThinking(event.message, REDERIVED_MARKER) };
      }
      rederiveStreak = 0;
    }

    consecutiveLoops = 0;
    resetStream();
    const thinking = extractThinking(event.message);
    if (thinking) lastThinking = thinking;

    const text = visibleText(event.message);
    if (!text) return;
    if (lastText && jaccard(lastText, text) >= threshold) streak += 1;
    else streak = 1;
    lastText = text;
    if (streak < limit) return;

    if (thinking) tainted.add(thinking);
    loopArmed = true;
    recover(STAGNATION_RECOVERY);
    ctx.ui?.notify?.("qq grok-paraphrase-guard: similar turns; removed stagnant reasoning.", "warning");
    return { message: sanitizeThinking(event.message, STAGNATION_MARKER) };
  });

  pi.on("context", (event) => ({
    messages: Array.isArray(event?.messages)
      ? event.messages.map((message) => sanitizeTaintedThinking(message, tainted))
      : event?.messages,
  }));
}
