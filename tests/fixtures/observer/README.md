# Observer transcript fixtures

`pi-session.jsonl` is a hand-crafted, minimal transcript in the sole supported
session format. Its expected facts were hand-counted from the JSONL,
independently of `qq-observe`; they are the precision evidence for the
deterministic pre-pass. The expected signal citations were also checked against
the source lines by hand.

Entry citations are **1-based physical JSONL line numbers**. The fixtures cover
all five signal kinds. A retry is the next tool call of the same name within 10
lines after an error. A tool-error burst is at least three error results in a
10-line window. Operator-correction matching is deliberately mechanical and
conservative: correction-leading words
(`no`, `actually`, `correction`, `instead`, `stop`) and explicit phrases such as
`that's wrong`, `you missed`, or `I asked`.

Each fixture also has one intentionally unknown entry. Expected facts count and
cite it instead of silently dropping it. Token expectations sum only fields
actually present in usage records; `null` is used when no value is available,
and `tokens_unavailable` counts absent values per usage record.
