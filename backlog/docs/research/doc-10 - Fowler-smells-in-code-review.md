---
id: doc-10
title: Fowler smells in code review
type: other
created_date: '2026-07-10 20:56'
updated_date: '2026-07-10 20:56'
tags:
  - research
---
# Fowler smells in code review

- **Owning task:** TASK-32 — Collapse qq to the minimum entity set
- **Overall confidence:** MEDIUM
- **Settles:** Fowler-style prompting has evidence as a reviewer recall aid, but
  the evidence does not justify qq's fixed twelve-smell inventory with one-step
  prescribed refactorings. Retain Fowler as a conditional maintenance lens;
  require a concrete failure mechanism and counterevidence before reporting.

## Findings

### Naming smells can improve model recall, but not uniformly

**[MEDIUM]** A 2024 ESEM experiment compared a generic smell-detection prompt
with one that named four target smells across 2,767 Java instances. The named
prompt produced 1,395 correct classifications versus 941 for the generic prompt
(odds ratio 2.54; about 16 percentage points absolute improvement). The effect
was category-dependent: Data Class improved sharply, Long Method slightly, and
Feature Envy—the only category shared with qq's inventory—declined slightly.
The study removed smell-free examples and measured snapshot classification, not
review judgment, refactoring quality, or later maintenance cost.
([Silva et al., 2024](https://homepages.dcc.ufmg.br/~mtov/pub/2024-esem-code-smells-llm.pdf))

**Inference [MEDIUM]:** Explicit maintenance concepts can rescue omissions, so
removing every Fowler cue would discard a plausible prompt benefit. The study
does not show that twelve definitions outperform the short leading phrase
"Fowler code smells," nor that detecting more labelled smells produces better
review findings.

### Long-term effects are mixed and highly contextual

**[HIGH]** A large study of 17,350 manually validated smell instances across
395 releases found smelly classes more change- and fault-prone in aggregate,
but smell-specific effects were uneven and the study was observational. Size,
churn, and component importance remain plausible common causes rather than
smells being a direct cause.
([Palomba et al., 2018](https://link.springer.com/article/10.1007/s10664-017-9535-z))

**[HIGH]** A three-system fault study found no consistent effect across systems
for Data Clumps, Switch Statements, Speculative Generality, Message Chains, or
Middle Man. It also reports that an earlier controlled maintenance study found
none of twelve smells increased maintenance effort across four systems.
([Hall et al., 2014](https://eprints.lancs.ac.uk/127419/1/Tosem_code_smells.pdf))

**Inference [HIGH]:** A smell is evidence to investigate, not a violation. The
long-horizon value lies in the mechanism—duplicated knowledge that must co-change,
an invariant with no owner, unstable topology exposed to callers, or unrelated
reasons to change accumulating—not in the label alone.

### Stock refactoring arrows are the weak part

**[HIGH]** In 16,566 refactorings across 23 projects, 57% were smell-neutral,
33.3% introduced smells, and only 9.7% removed them; over 95% of introduced
smells persisted. Move Method, the stock response to Feature Envy in qq's
current inventory, coincided with creation of a God Class in 35% of observed
cases. Extract Superclass frequently introduced Speculative Generality.
([Cedrim et al., 2017](https://diegocedrim.github.io/fse-2017-data/download/fse_paper.pdf))

**Inference [HIGH]:** The current `smell → fix` arrows overstate what the label
establishes. A reviewer should compare the proposed refactoring's new coupling,
indirection, compatibility cost, and test surface against the demonstrated
maintenance risk.

### qq's blinded evaluation found no benefit from the full inventory

**[MEDIUM]** Thirty-six fresh, read-only review outputs compared three arms:

1. ordinary evidence-based maintainability review;
2. the same brief plus the short cue "use Fowler's code smells as heuristics";
3. the same brief plus qq's full twelve-name inventory, without the stock fixes.

Eight TypeScript diffs covered shared quote-policy duplication, repeated state
switches, intentional bounded-context duplication, a one-method vendor adapter,
scattered subscription-plan policy, four same-shaped authorization IDs, a
calendar-window data clump, and a legitimate cross-aggregate domain service.
Hidden follow-up changes tested the advice against currency-policy evolution,
new plan variants, argument swaps, DST-policy changes, deliberate tax/loyalty
divergence, vendor replacement, and continued cross-aggregate coordination.

- All three arms found the shared-policy, plan-policy, identifier-binding, and
  calendar-window risks.
- All three respected intentional duplication and the adapter and domain-service
  boundaries.
- In five fresh repetitions of the identifier case, every arm found the risk.
  The full inventory proposed a source-grouped parameter object in 5/5 runs;
  the short cue and control did so in 4/5. One run is too small a difference to
  distinguish prompting effect from model variance.
- The only apparent extra finding came from the short-cue arm, which asserted a
  state switch would silently return `undefined` without seeing the TypeScript
  compiler configuration. The full inventory and control correctly withheld it.

**Inference [MEDIUM]:** Under a brief that already requires a concrete future
failure mechanism and honors repository context, the full catalog added labels
but no demonstrated recall. Its guardrails did prevent the expected Fowler-shaped
false positives. This supports retaining the guardrails and the Fowler lens, but
not paying for twelve inline definitions on every review.

## Recommended prompt shape

**[MEDIUM]** Keep a short conditional cue rather than either extreme:

> Use Fowler's code smells as maintenance heuristics, never as violations. Report
> one only when the diff or history shows a concrete future cost—knowledge likely
> to diverge, a conceptual change scattered across sites, an invariant with no
> owner, obscured domain intent, or dependence on unstable internals. Consider
> counterevidence such as deliberate bounded-context duplication, generated or
> boundary code, adapters/facades, compatibility constraints, and repository
> conventions. Recommend no stock refactoring: state the tradeoff introduced by
> the proposed change.

This preserves Fowler's value as a vocabulary and attention-directing framework
while making evidence and context—not taxonomy—the acceptance criterion.

## Sources

- [Silva et al., *Detecting Code Smells using ChatGPT: Initial Insights*, ESEM 2024](https://homepages.dcc.ufmg.br/~mtov/pub/2024-esem-code-smells-llm.pdf)
- [Palomba et al., *On the diffuseness and the impact on maintainability of code smells*, EMSE 2018](https://link.springer.com/article/10.1007/s10664-017-9535-z)
- [Hall et al., *Some Code Smells Have a Significant but Small Effect on Faults*, TOSEM 2014](https://eprints.lancs.ac.uk/127419/1/Tosem_code_smells.pdf)
- [Cedrim et al., *Understanding the Impact of Refactoring on Smells*, FSE 2017](https://diegocedrim.github.io/fse-2017-data/download/fse_paper.pdf)

## Gaps

- No located study tests whether a Fowler inventory in an LLM code-review prompt
  improves later maintenance outcomes.
- qq's fixtures are synthetic temporal proxies, not years of repository history;
  recommendations were evaluated, not implemented through the follow-up changes.
- All qq trials used one model family. Fresh context reduces author anchoring but
  does not provide model-level independence.
- The evaluation tested the catalog as a whole, not enough repetitions per smell
  to rank all twelve categories individually.
