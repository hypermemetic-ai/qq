export const meta = {
  name: 'deep-research',
  description: 'Deep research harness — fan-out web searches, fetch sources, adversarially verify the load-bearing claims, synthesize a cited report.',
  whenToUse: 'When the user wants a deep, multi-source, fact-checked research report on any topic. BEFORE invoking, check if the question is specific enough to research directly — if underspecified (e.g., "what car to buy" without budget/use-case/region), ask 2-3 clarifying questions to narrow scope. Then pass the refined question as args, weaving the answers in.',
  phases: [{"title":"Scope","detail":"Decompose question (from args) into 5 search angles"},{"title":"Search","detail":"5 parallel WebSearch agents, one per angle"},{"title":"Fetch","detail":"URL-dedup, fetch top 15 sources, extract falsifiable claims"},{"title":"Verify","detail":"one adversarial check per load-bearing (central) claim; supporting claims pass at face value"},{"title":"Synthesize","detail":"Merge semantic dupes, rank by confidence, cite sources"}],
}

// deep-research: Scope → pipeline(Search → URL-dedup → Fetch+Extract) → selective Verify → Synthesize
// Ported from bughunter architecture. WebSearch/WebFetch instead of git/grep.
// Question is passed via Workflow({name: 'deep-research', args: '<question>'}).
//
// Verification is SELECTIVE by operator decision ("skip verification for the
// unimportant or obvious stuff — 102 agents is ridiculous"): only claims the
// extractor rated "central" get a verifier, ONE skeptic each. "supporting"
// claims ride into synthesis unverified, flagged at face value; "tangential"
// claims are dropped. The old 3-votes-×-every-claim fan-out was ~75% of a
// ~100-agent run; this caps the whole run at ~35 agents.

const MAX_FETCH = 15
const MAX_VERIFY_CLAIMS = 12

// ─── Schemas ───
const SCOPE_SCHEMA = {
  type: "object", required: ["question", "angles", "summary"],
  properties: {
    question: { type: "string" },
    summary: { type: "string" },
    angles: { type: "array", minItems: 3, maxItems: 6, items: {
      type: "object", required: ["label", "query"],
      properties: {
        label: { type: "string" },
        query: { type: "string" },
        rationale: { type: "string" },
      },
    }},
  },
}
const SEARCH_SCHEMA = {
  type: "object", required: ["results"],
  properties: {
    results: { type: "array", maxItems: 6, items: {
      type: "object", required: ["url", "title", "relevance"],
      properties: {
        url: { type: "string" },
        title: { type: "string" },
        snippet: { type: "string" },
        relevance: { enum: ["high", "medium", "low"] },
      },
    }},
  },
}
const EXTRACT_SCHEMA = {
  type: "object", required: ["claims", "sourceQuality"],
  properties: {
    sourceQuality: { enum: ["primary", "secondary", "blog", "forum", "unreliable"] },
    publishDate: { type: "string" },
    claims: { type: "array", maxItems: 5, items: {
      type: "object", required: ["claim", "quote", "importance"],
      properties: {
        claim: { type: "string" },
        quote: { type: "string" },
        importance: { enum: ["central", "supporting", "tangential"] },
      },
    }},
  },
}
const VERDICT_SCHEMA = {
  type: "object", required: ["refuted", "evidence", "confidence"],
  properties: {
    refuted: { type: "boolean" },
    evidence: { type: "string" },
    confidence: { enum: ["high", "medium", "low"] },
    counterSource: { type: "string" },
  },
}
const REPORT_SCHEMA = {
  type: "object", required: ["summary", "findings", "caveats"],
  properties: {
    summary: { type: "string" },
    findings: { type: "array", items: {
      type: "object", required: ["claim", "confidence", "sources", "evidence"],
      properties: {
        claim: { type: "string" },
        confidence: { enum: ["high", "medium", "low"] },
        sources: { type: "array", items: { type: "string" } },
        evidence: { type: "string" },
        vote: { type: "string" },
      },
    }},
    caveats: { type: "string" },
    openQuestions: { type: "array", items: { type: "string" } },
  },
}

// ─── Phase 0: Scope — decompose question into search angles ───
phase("Scope")
const QUESTION = (typeof args === "string" && args.trim()) || ""
if (!QUESTION) {
  return { error: "No research question provided. Pass it as args: Workflow({name: 'deep-research', args: '<question>'})." }
}
const scope = await agent(
  "Decompose this research question into complementary search angles.\n\n" +
  "## Question\n" + QUESTION + "\n\n" +
  "## Task\n" +
  "Generate 5 distinct web search queries that together cover the question from different angles. Pick angles that suit the question's domain. Examples:\n" +
  "- broad/primary  · academic/technical  · recent news  · contrarian/skeptical  · practitioner/implementation\n" +
  "- For medical: anatomy · common causes · serious differentials · authoritative refs · red flags\n" +
  "- For tech: state-of-art · benchmarks · limitations · industry adoption · cost/tradeoffs\n\n" +
  "Make queries specific enough to surface high-signal results. Avoid redundancy.\n" +
  "Return: the question (verbatim or lightly normalized), a 1-2 sentence decomposition strategy, and the angles.\n\nStructured output only.",
  { label: "scope", schema: SCOPE_SCHEMA }
)
if (!scope) {
  return { error: "Scope agent returned no result — cannot decompose the research question." }
}
log("Q: " + QUESTION.slice(0, 80) + (QUESTION.length > 80 ? "…" : ""))
log("Decomposed into " + scope.angles.length + " angles: " + scope.angles.map(a => a.label).join(", "))

// ─── Dedup state — accumulates across searchers as they complete ───
const normURL = u => {
  try {
    const p = new URL(u)
    return (p.hostname.replace(/^www\./, "") + p.pathname.replace(/\/$/, "")).toLowerCase()
  } catch { return u.toLowerCase() }
}
const seen = new Map()
const dupes = []
const budgetDropped = []
const relRank = { high: 0, medium: 1, low: 2 }
let fetchSlots = MAX_FETCH

// ─── Prompts ───
const SEARCH_PROMPT = (angle) =>
  "## Web Searcher: " + angle.label + "\n\n" +
  "Research question: \"" + QUESTION + "\"\n\n" +
  "Your angle: **" + angle.label + "** — " + (angle.rationale || "") + "\n" +
  "Search query: `" + angle.query + "`\n\n" +
  "## Task\nUse WebSearch with the query above (or a refined version). Return the top 4-6 most relevant results.\n" +
  "Rank by relevance to the ORIGINAL question, not just the search query. Skip obvious SEO spam/content farms.\n" +
  "Include a short snippet capturing why each result is relevant.\n\nStructured output only."

const FETCH_PROMPT = (source, angle) =>
  "## Source Extractor\n\n" +
  "Research question: \"" + QUESTION + "\"\n\n" +
  "Fetch and extract key claims from this source:\n" +
  "**URL:** " + source.url + "\n**Title:** " + source.title + "\n**Found via:** " + angle + " search\n\n" +
  "## Task\n1. Use WebFetch to retrieve the page content.\n" +
  "2. Assess source quality: primary research/institution? secondary reporting? blog/opinion? forum? unreliable?\n" +
  "3. Extract 2-5 FALSIFIABLE claims that bear on the research question. Each claim must:\n" +
  "   - be a concrete, checkable statement (not vague generalities)\n" +
  "   - include a direct quote from the source as support\n" +
  "   - be rated central/supporting/tangential to the research question\n" +
  "4. Note publish date if available.\n\n" +
  "If the fetch fails or the page is irrelevant/paywalled, return claims: [] and sourceQuality: \"unreliable\".\n\nStructured output only."

const VERIFY_PROMPT = (claim) =>
  "## Adversarial Claim Verifier\n\n" +
  "Be SKEPTICAL. Try to REFUTE this claim — yours is the only check it gets.\n\n" +
  "## Research question\n" + QUESTION + "\n\n" +
  "## Claim under review\n\"" + claim.claim + "\"\n\n" +
  "**Source:** " + claim.sourceUrl + " (" + claim.sourceQuality + ")\n" +
  "**Supporting quote:** \"" + claim.quote + "\"\n\n" +
  "## Checklist\n" +
  "1. Is the claim actually supported by the quote, or is it an overreach/misread?\n" +
  "2. WebSearch for contradicting evidence — does any credible source dispute or heavily qualify this?\n" +
  "3. Is the source quality sufficient for the claim's strength? (extraordinary claims need primary sources)\n" +
  "4. Is the claim outdated? (check dates — old claims about fast-moving fields are suspect)\n" +
  "5. Is this a marketing claim / press release / cherry-picked benchmark / forum speculation?\n\n" +
  "**refuted=true** needs a concrete, specific reason from the checklist — contradicted, unsupported by the quote, outdated, or a source far too weak for the claim's strength. Mere failure to find extra corroboration is NOT refutation: return refuted=false with confidence \"low\" instead.\n\nStructured output only. Evidence MUST be specific."

// ─── Pipeline: search → dedup → fetch+extract (no barrier) ───
const searchResults = await pipeline(
  scope.angles,

  angle => agent(SEARCH_PROMPT(angle), {
    label: "search:" + angle.label, phase: "Search", schema: SEARCH_SCHEMA
  }).then(r => {
    if (!r) return null
    log(angle.label + ": " + r.results.length + " results")
    return { angle: angle.label, results: r.results }
  }),

  searchResult => {
    const sorted = [...searchResult.results].sort((a, b) => relRank[a.relevance] - relRank[b.relevance])
    const novel = sorted.filter(r => {
      const key = normURL(r.url)
      if (seen.has(key)) {
        dupes.push({ ...r, angle: searchResult.angle, dupOf: seen.get(key) })
        return false
      }
      if (fetchSlots <= 0 && relRank[r.relevance] >= 1) {
        budgetDropped.push({ ...r, angle: searchResult.angle })
        return false
      }
      seen.set(key, { angle: searchResult.angle, title: r.title })
      fetchSlots--
      return true
    })
    if (novel.length < searchResult.results.length) {
      log(searchResult.angle + ": " + novel.length + " novel (" + (searchResult.results.length - novel.length) + " filtered)")
    }
    return parallel(
      novel.map(source => () => {
        let host = "unknown"
        try { host = new URL(source.url).hostname.replace(/^www\./, "") } catch {}
        return agent(FETCH_PROMPT(source, searchResult.angle), {
          label: "fetch:" + host,
          phase: "Fetch",
          schema: EXTRACT_SCHEMA,
        }).then(ext => {
          // User-skip → null; drop it (filtered by searchResults.flat().filter(Boolean))
          // rather than throwing into .catch() and mislabeling it "unreliable".
          if (!ext) return null
          return {
            url: source.url, title: source.title, angle: searchResult.angle,
            sourceQuality: ext.sourceQuality, publishDate: ext.publishDate,
            claims: ext.claims.map(c => ({ ...c, sourceUrl: source.url, sourceQuality: ext.sourceQuality })),
          }
        }).catch(e => {
          log("fetch failed: " + source.url + " — " + (e.message || e))
          return { url: source.url, title: source.title, angle: searchResult.angle, sourceQuality: "unreliable", claims: [] }
        })
      })
    )
  }
)

const allSources = searchResults.flat().filter(Boolean)
const allClaims = allSources.flatMap(s => s.claims)
const qualRank = { primary: 0, secondary: 1, blog: 2, forum: 3, unreliable: 4 }

// Selective verification: central claims only, best sources first. Supporting
// claims are accepted at face value; tangential claims are dropped outright.
const centralClaims = allClaims.filter(c => c.importance === "central")
const rankedClaims = [...centralClaims]
  .sort((a, b) => qualRank[a.sourceQuality] - qualRank[b.sourceQuality])
  .slice(0, MAX_VERIFY_CLAIMS)
const atFaceValue = allClaims.filter(c => c.importance === "supporting")
if (centralClaims.length > rankedClaims.length) {
  log("verify cap: dropping " + (centralClaims.length - rankedClaims.length) + " central claims beyond top " + MAX_VERIFY_CLAIMS + " (by source quality)")
}

log("Fetched " + allSources.length + " sources → " + allClaims.length + " claims → verifying " + rankedClaims.length + " central; " + atFaceValue.length + " supporting pass unverified")

if (allClaims.length === 0) {
  return {
    question: QUESTION,
    summary: "No claims extracted. " + allSources.length + " sources fetched, all empty/failed. " + dupes.length + " URL dupes, " + budgetDropped.length + " budget-dropped.",
    findings: [], refuted: [], unverified: [], sources: allSources.map(s => ({ url: s.url, quality: s.sourceQuality })),
    stats: { angles: scope.angles.length, sources: allSources.length, claims: 0, dupes: dupes.length },
  }
}

// ─── Verify: one adversarial check per load-bearing claim ───
// Barrier here is intentional — claim pool must be fully assembled before ranking/verification.
phase("Verify")
const voted = (await parallel(
  rankedClaims.map(claim => () =>
    agent(VERIFY_PROMPT(claim), {
      label: "verify:" + claim.claim.slice(0, 40),
      phase: "Verify",
      schema: VERDICT_SCHEMA,
    }).then(v => {
      // A verdict can be null (user-skip or agent error) — that's UNVERIFIED,
      // not refuted (infra failure must not read as an adjudication).
      const survives = !!v && !v.refuted
      const isRefuted = !!v && v.refuted
      const mark = survives ? "✓" : isRefuted ? "✗" : "?"
      log("\"" + claim.claim.slice(0, 50) + "…\": " + mark)
      return { ...claim, verdicts: v ? [v] : [], refutedVotes: isRefuted ? 1 : 0, erroredVotes: v ? 0 : 1, survives, isRefuted }
    })
  )
)).filter(Boolean)

const confirmed = voted.filter(c => c.survives)
const killed = voted.filter(c => c.isRefuted)
const unverified = voted.filter(c => !c.survives && !c.isRefuted)
log("Verify done: " + voted.length + " claims → " + confirmed.length + " confirmed, " + killed.length + " refuted, " + unverified.length + " unverified")

const toRefuted = c => ({ claim: c.claim, vote: (c.verdicts.length - c.refutedVotes) + "-" + c.refutedVotes, source: c.sourceUrl })
const toUnverified = c => ({ claim: c.claim, erroredVotes: c.erroredVotes, validVotes: c.verdicts.length, source: c.sourceUrl })

if (confirmed.length === 0 && atFaceValue.length === 0) {
  // Distinguish "refuted on merit" from "could not verify (infra error)". A run
  // where every verifier agent failed (rate-limit / API error) is an infra
  // failure, not a research finding — report it as such so the user knows to
  // retry rather than concluding the research found nothing.
  let summary
  if (killed.length === 0 && unverified.length > 0) {
    summary = "Could not verify any claims — all " + unverified.length + " verifiers failed (likely rate-limiting or API errors). This is an infrastructure failure, not a research finding. Raw extracted claims returned below; retry or verify manually."
  } else if (unverified.length > 0) {
    summary = killed.length + " claims refuted by adversarial verification; " + unverified.length + " could not be verified (verifier agents failed). No claims survived. Research inconclusive."
  } else {
    summary = "All " + killed.length + " claims refuted by adversarial verification. Research inconclusive — sources may be low-quality or claims overstated."
  }
  return {
    question: QUESTION,
    summary,
    findings: [],
    refuted: killed.map(toRefuted),
    unverified: unverified.map(toUnverified),
    sources: allSources.map(s => ({ url: s.url, quality: s.sourceQuality, claimCount: s.claims.length })),
    stats: { angles: scope.angles.length, sources: allSources.length, claims: allClaims.length, verified: voted.length, confirmed: 0, killed: killed.length, unverified: unverified.length },
  }
}

// ─── Synthesize ───
phase("Synthesize")
const confRank = { high: 0, medium: 1, low: 2 }
const block = confirmed.map((c, i) => {
  const best = c.verdicts.filter(v => !v.refuted).sort((a, b) => confRank[a.confidence] - confRank[b.confidence])[0]
  return "### [" + i + "] " + c.claim + "\n" +
    "Source: " + c.sourceUrl + " (" + c.sourceQuality + ")\n" +
    "Quote: \"" + c.quote + "\"\nVerifier evidence (" + best.confidence + "): " + best.evidence + "\n"
}).join("\n")

const faceBlock = atFaceValue.length > 0
  ? "\n## Supporting claims (UNVERIFIED — accepted at face value by design)\n" +
    atFaceValue.map(c => "- \"" + c.claim + "\" (" + c.sourceUrl + ", " + c.sourceQuality + ")").join("\n")
  : ""

const killedBlock = killed.length > 0
  ? "\n## Refuted claims (for transparency)\n" +
    killed.map(c => "- \"" + c.claim + "\" (" + c.sourceUrl + ")").join("\n")
  : ""

const unverifiedBlock = unverified.length > 0
  ? "\n## Unverified claims (" + unverified.length + " — verifier agents failed; neither confirmed nor refuted)\n" +
    unverified.map(c => "- \"" + c.claim + "\" (" + c.sourceUrl + ")").join("\n") +
    "\n\nMention in caveats that " + unverified.length + " claim(s) could not be verified due to infrastructure errors."
  : ""

const report = await agent(
  "## Synthesis: research report\n\n" +
  "**Question:** " + QUESTION + "\n\n" +
  confirmed.length + " load-bearing claims survived a single-skeptic adversarial check; " + atFaceValue.length + " supporting claims were deliberately NOT verified (accepted at face value). Merge semantic duplicates and synthesize.\n\n" +
  "## Confirmed claims (adversarially checked)\n" + block + "\n" + faceBlock + killedBlock + unverifiedBlock + "\n\n" +
  "## Instructions\n" +
  "1. Identify claims that say the same thing — merge them, combine their sources.\n" +
  "2. Group related claims into coherent findings. Each finding should directly address the research question.\n" +
  "3. Assign confidence per finding: high (verified claims from primary sources), medium (verified but secondary sources), low (single source or blog-quality). A finding that rests SOLELY on unverified supporting claims is capped at low and its evidence must say \"unverified\".\n" +
  "4. Write a 3-5 sentence executive summary answering the research question.\n" +
  "5. Note caveats: what's uncertain, what sources were weak, what time-sensitivity applies — and that supporting claims were not independently verified.\n" +
  "6. List 2-4 open questions that emerged but weren't answered.\n\nStructured output only.",
  { label: "synthesize", schema: REPORT_SCHEMA }
)

if (!report) {
  // Synthesis skipped/errored — salvage the verified claims raw rather
  // than throwing on report.findings and discarding the whole run.
  return {
    question: QUESTION,
    summary: "Synthesis step was skipped or failed — returning " + confirmed.length + " verified claims unmerged.",
    findings: [],
    confirmed: confirmed.map(c => ({ claim: c.claim, source: c.sourceUrl, quote: c.quote })),
    atFaceValue: atFaceValue.map(c => ({ claim: c.claim, source: c.sourceUrl })),
    refuted: killed.map(toRefuted),
    unverified: unverified.map(toUnverified),
    sources: allSources.map(s => ({ url: s.url, quality: s.sourceQuality, claimCount: s.claims.length })),
    stats: { angles: scope.angles.length, sources: allSources.length, claims: allClaims.length, verified: voted.length, confirmed: confirmed.length, killed: killed.length, unverified: unverified.length, afterSynthesis: 0 },
  }
}

return {
  question: QUESTION,
  ...report,
  refuted: killed.map(toRefuted),
  unverified: unverified.map(toUnverified),
  sources: allSources.map(s => ({ url: s.url, quality: s.sourceQuality, angle: s.angle, claimCount: s.claims.length })),
  stats: {
    angles: scope.angles.length,
    sourcesFetched: allSources.length,
    claimsExtracted: allClaims.length,
    claimsVerified: voted.length,
    confirmed: confirmed.length,
    killed: killed.length,
    unverifiedByDesign: atFaceValue.length,
    unverified: unverified.length,
    afterSynthesis: report.findings.length,
    urlDupes: dupes.length,
    budgetDropped: budgetDropped.length,
    agentCalls: 1 + scope.angles.length + allSources.length + voted.length + 1,
  },
}
