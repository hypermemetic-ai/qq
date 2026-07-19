# PROPOSED verdict — keep codebase-memory

**PROPOSED; the operator disposes this consequential verdict.**

Keep `codebase-memory-mcp` as qq's structural index and do not add
`opencode-codebase-index` as a second permanent index.

Measured basis:

- The challenger answered 0/12 corpus questions under the required
  structural-first, no-embeddings condition. `index_codebase` itself refused
  before producing files, symbols, edges, or freshness metadata, and all four
  query/impact tools failed on the same provider gate.
- The incumbent answered 7/12 correctly on the identical source snapshot. It
  is imperfect—two answers were wrong and three were unavailable, chiefly
  because extensionless `bin/qq-*` scripts are not modeled—but it provides
  material structural answers today.
- The challenger demonstrated no named additive benefit in corpus terms.
  Keeping it would require a provider plus a second permanent index despite
  zero measured gain, contrary to the ticket's settled constraint.

This proposal does not claim the incumbent is complete. A future challenger
trial would need, before reconsideration, a provider-free structural index path
and verified inclusion of extensionless Bash entrypoints.

`AGENTS.md` is intentionally untouched. Only an operator disposition may turn
this proposal into a routing decision.
