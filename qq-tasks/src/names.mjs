// Spoken ticket id deck. Frozen 99-name set, then magnitude overflow.
//
// Issuance is farthest-first among free names (not live, not still warm);
// ties break at random so the live pile spreads out. The 99-name deck is
// about speech under a thousand. Overflow has no phonetic cut.

export const FROZEN = Object.freeze([
  "1", "2", "3", "4", "6", "7", "8", "10", "12", "20", "30", "40", "60", "70", "80",
  "200", "201", "202", "203", "204", "206", "207", "208", "210", "212", "220", "230", "240", "260", "280",
  "300", "301", "302", "303", "304", "306", "307", "308", "310", "312", "320", "330", "340", "360", "380",
  "400", "401", "402", "403", "404", "406", "407", "408", "410", "412", "420", "430", "440", "460", "480",
  "600", "601", "602", "603", "604", "606", "607", "608", "610", "612", "620", "630", "640", "660", "680",
  "700", "701", "702", "703", "704", "706", "708", "710", "712",
  "800", "801", "802", "803", "804", "806", "807", "808", "810", "812", "820", "830", "840", "860", "880",
]);

export const FIRST_OVERFLOW_START = 1000;
export const FIRST_OVERFLOW_END = 9999;

function number(n) {
  const value = Number(n);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Pick the free name farthest from the live pile; ties break at random.
 * With no live ids every candidate is equidistant, so the pick is random.
 */
export function farthestFirst(candidates, liveIds, rng = Math.random) {
  const live = liveIds.map(number).filter((value) => value !== null);
  const score = (candidate) => {
    const value = number(candidate);
    return live.length === 0
      ? 0
      : Math.min(...live.map((other) => Math.abs(value - other)));
  };
  let best = -Infinity;
  for (const candidate of candidates) best = Math.max(best, score(candidate));
  const tied = candidates.filter((candidate) => score(candidate) === best);
  return tied[Math.min(tied.length - 1, Math.floor(rng() * tied.length))];
}

/** Inclusive overflow band for a magnitude start (1000, 10000, …). */
export function overflowBand(start) {
  return { start, end: start * 10 - 1 };
}

/**
 * Deal one free name. Frozen set first; when every frozen name is live or
 * warm, unlock 1000–9999, then 10000–99999, and so on.
 */
export function dealId(liveIds, warmIds, rng = Math.random) {
  const taken = new Set([...liveIds, ...warmIds].map(String));
  const live = [...new Set(liveIds.map(String))];
  const frozenFree = FROZEN.filter((id) => !taken.has(id));
  if (frozenFree.length > 0) return farthestFirst(frozenFree, live, rng);

  let start = FIRST_OVERFLOW_START;
  for (;;) {
    const { end } = overflowBand(start);
    const free = [];
    for (let value = start; value <= end; value += 1) {
      const id = String(value);
      if (!taken.has(id)) free.push(id);
    }
    if (free.length > 0) return farthestFirst(free, live, rng);
    start *= 10;
  }
}

export function normalizeId(id) {
  if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) return String(id);
  if (typeof id === "string" && /^\d+$/.test(id) && Number(id) > 0) return String(Number(id));
  throw new Error(`qq-tasks: invalid id ${id}`);
}
