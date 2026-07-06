---
name: writing-skills
description: Authoring discipline for hypercore's own skills — fuses structural best-practices (progressive disclosure, matched degrees of freedom, the no-op test, positive prompting) with an eval discipline that proves each skill against a baseline before it ships. Use when writing a new skill in this repo, revising or reviewing an existing one, or when a skill misfires and its wording needs a principled rewrite.
disable-model-invocation: true
---

# Writing skills

A skill is a prompt that changes an agent's behavior. Write it like one: earn
every line, and prove it works before you trust it.

**The bar:** ship nothing that hasn't first failed a baseline without it. A skill
you never watched an agent fail without is a guess. Guesses are how skills rot.

Three layers, applied in order:

1. **Eval** — watch it fail, write the fix, watch it hold. This is the spine.
2. **Structure** — shape the text so the model reads and obeys it cheaply.
3. **Judge** — an automated grader. Optional; earn it at scale.

---

## The process

### 0 — Match degrees of freedom to the task

Before writing, decide how much latitude the agent should have. Fragile tasks
(one correct sequence, silent-failure APIs, destructive commands) want a
**narrow bridge**: exact scripts, exact order, low freedom. Robust tasks (many
valid approaches, agent judgment adds value) want an **open field**: state the
goal and constraints, leave the path free.

Over-constraining an open-field task wastes context and makes the skill brittle.
Under-constraining a narrow-bridge task invites the agent to improvise off the
cliff. Name which one you're writing before you write it.

### 1 — RED: watch it fail without the skill

**First ask: does an unguided agent actually fail here?** Run the target task on a
**fresh agent or subagent with no skill loaded**.
Capture the failures and rationalizations **verbatim** — the exact sentences the
agent uses to talk itself out of doing the right thing. Those sentences are your
raw material.

If the unguided agent already does the task right, stop — there's no skill to
write, and writing one documents an *imagined* problem: it spends context
teaching the agent to dodge a mistake it was never going to make. Write only
where you've watched a **real, repeatable failure** — that's the mistake worth
closing, and skipping this step is how you miss it. No skill without a failing
baseline first.

### 2 — GREEN: write the minimal skill that closes those failures

Write the smallest text that turns each observed failure into compliance —
nothing more. Target the *specific* rationalizations you captured, in their own
words where it helps them land. Re-run on a fresh agent. It should now comply.

Match the form to the failure (see **Forms** below). Write the description and
respect the token budgets (see **Structure**) as you go.

### 3 — REFACTOR: counter each new rationalization until stable

Closing one failure often surfaces the next: the agent finds a *new* way to
rationalize the wrong move. Add one explicit counter aimed at that new sentence,
then re-run. Repeat until a fresh agent complies cleanly with no new dodge.

Stop when new runs stop producing new rationalizations — not before.

### 4 — Micro-test the wording

Wording that works once may be luck. For any load-bearing instruction, run **5+
reps on fresh agents against a no-guidance control**, and **read every result
by hand** — don't trust a summary. Variance across reps *is* the signal: if some
reps comply and some don't, the wording isn't binding yet. Tighten it, or change
its form, and re-test.

### 5 — Structural pass

Read the finished skill once against **Structure** and the **six failure modes**
below. Cut anything that doesn't earn its place. Confirm the budgets hold.

### 6 — Judge (only at scale)

If you're grading many skills' *outputs* and want a repeatable numeric gate, add
a small LLM-as-judge. See **The judge layer**. For a handful of hand-tended
skills, the baseline + micro-test loop above is enough — skip this.

---

## Structure

**The context window is a public good.** Every line you add is a line every
future run pays for. Assume the model is already smart and already capable —
only add what it doesn't already know or doesn't *reliably* do. When in doubt,
cut.

**Progressive disclosure.** Three tiers, each loaded only when needed:

- **Metadata** (`name` + `description`, ~100 tokens) is always in context. It
  exists to help the agent decide whether to open the skill.
- **SKILL.md body** loads when the skill triggers. Keep it **under 500 lines and
  under ~5k tokens**.
- **References** (linked files) load only when the body sends the agent to them.
  Keep links **one level deep** — a reference shouldn't chain to another.

**Information hierarchy.** Put each instruction at the cheapest tier that still
works: an in-skill step beats an in-skill reference, which beats an external
reference. Push detail down a tier only when the body would otherwise blow its
budget.

### Writing the description

Third person. State **what the skill does AND when to use it** — the "when" is
what lets the agent match a situation to this skill.

**State what it does; never inline the step-by-step workflow.** A description
that summarizes the procedure invites the agent to act from the summary and
skip the body — the exact opposite of triggering the skill. Name the job and
the trigger; leave the how inside.

### Pocock's editing tools

- **No-op test** — for every line ask: *does this change behavior versus the
  default?* If a capable agent would do it anyway, the line is a no-op. Delete
  it. Run this on every line; it's the single highest-yield edit.
- **Positive prompting** — "don't think of an elephant" names the elephant.
  Prompt the behavior you *want*, not the one you fear. Replace "don't skip
  tests" with "run the full suite and paste the output."
- **Leading words** — a term the model already knows anchors a whole region of
  learned behavior in a few tokens. "Idempotent," "load-bearing," "smoke test,"
  "merge-base" each pull in more than they cost. Prefer the precise known term
  over a paragraph re-deriving it.

### Six failure modes to review against

- **Premature completion** — the agent stops before the skill's real end. Add an
  explicit terminal check it must clear before claiming done.
- **Duplication** — the same instruction stated in two places drifts out of sync.
  State it once; link to it.
- **Sediment** — old guidance left in after the situation changed. Delete on
  revise; don't append.
- **Sprawl** — the body grows past its budget and dilutes its own signal. Split
  to references or cut.
- **No-op** — lines that don't change behavior (see the no-op test). Cut.
- **Negation** — prohibitions the agent reads and then does anyway (see positive
  prompting). Rewrite as the positive action.

### Forms — match the form to the failure

The shape of the fix should match the shape of the failure:

- **Recipe** (numbered steps) — the agent doesn't know the correct sequence.
- **Prohibition** (a hard "always/never") — one specific move is catastrophic and
  has no valid exception.
- **Structural slot** (a template / required field / checklist item) — the agent
  omits a step under load; give it a slot it has to fill.
- **Conditional** ("if X, then Y") — the right action depends on a situation the
  agent can detect but doesn't currently branch on.

Pick the lightest form that closes the observed failure.

---

## The judge layer (optional, at scale)

When you're gating many skills' outputs and want a repeatable number, an
LLM-as-judge earns its keep. Build it with four guards:

- **Multi-dimensional rubric** — score named dimensions separately, not one blur.
- **Evidence before score** — the judge must quote the evidence, then score. A
  score with no cited evidence is noise.
- **Position swap** — for A/B comparisons, run both orderings and average;
  judges favor whichever came first.
- **Different model family** — judge with a different family than the one that
  produced the output, so shared blind spots don't rubber-stamp each other.

For a lean personal system, the manual baseline plus the micro-test loop is
usually enough. Reach for the judge only when the volume makes hand-reading
every rep impractical.

---

## Bottom line

Ship nothing that hasn't first failed a baseline without it. Structure the text
the way Anthropic and Pocock teach — public-good context, matched freedom,
progressive disclosure, no-op-tested positive prompting. Prove it the way the
eval loop teaches — RED → GREEN → REFACTOR, then micro-test the wording. Add an
automated judge only once scale makes hand-reading impractical.
