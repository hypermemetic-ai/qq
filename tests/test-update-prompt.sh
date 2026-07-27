#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"

python3 - "$ROOT/.pi/prompts/update.md" <<'PY'
from pathlib import Path
import re
import sys

text = Path(sys.argv[1]).read_text()


def need(needle: str, message: str) -> None:
    assert needle in text, message


def match(section: str, pattern: str, message: str) -> None:
    assert re.search(pattern, section, re.MULTILINE | re.DOTALL), message


presentation_start = text.find("## Present the assessment to the operator")
start = text.find("### Review candidates one at a time")
end = text.find("## Finalize durable evidence only after approval")
assert 0 <= presentation_start < start < end, "presentation, candidate loop, and finalization are out of order"
presentation = text[presentation_start:start]
card = text[start:end]
finalization = text[end:]
fields = [
    ("1. **Installed state**", ("identity", "source", "constraint", "owner")),
    ("2. **Candidate state**", ("identity", "channel")),
    ("3. **Concrete qq gain**", ("capability", "security", "reliability", "simplification")),
    ("4. **Deletable state**", ("code", "configuration", "dependencies", "adapters", "process")),
    ("5. **Costs and risks**", ("compatibility", "migration", "security", "privacy", "credential", "supply-chain", "operating")),
    ("6. **Evidence quality**", ("confidence", "disagreements", "unknowns")),
    ("7. **Safe test and rollback**", ("smallest safe test", "rollback")),
    ("8. **Recommendation**", ("evidence-backed",)),
    ("9. **Operator disposition**", ("explicit", "answer")),
]
positions = [(card.find(label), label, terms) for label, terms in fields]
assert all(position >= 0 for position, _, _ in positions), "a decision-card field is missing"
assert [position for position, _, _ in positions] == sorted(position for position, _, _ in positions), "decision-card fields are out of order"
for index, (position, label, terms) in enumerate(positions):
    stop = positions[index + 1][0] if index + 1 < len(positions) else len(card)
    segment = card[position:stop]
    for term in terms:
        assert term in segment, f"{label} must include {term!r}"

for needle, message in (
    ("For every inventoried component, present an operator-readable benefit/cost summary", "every component needs a benefit/cost presentation"),
    ("When the honest answer is no relevant gain for qq, say so explicitly", "no-gain reporting is missing"),
    ("This overview may name all candidates and give concise benefit/cost summaries", "the complete overview must remain orientation"),
    ("orientation only: it records no disposition, includes no complete decision card, and asks no candidate question", "overview and decision loop must stay distinct"),
):
    assert needle in presentation, message
for needle, message in (
    ("Handle every meaningful-delta candidate in a sequential operator loop", "every candidate must enter the sequential loop"),
    ("Before asking for the current candidate's disposition, present one complete decision card with all nine fields", "the complete card must precede its question"),
    ("Ask about exactly one candidate per question invocation", "candidate questions must be singular"),
    ("Never batch complete decision cards or disposition questions", "batched cards/questions must be forbidden"),
    ("The earlier matrix and queue may name all candidates for orientation; they do not satisfy or bypass this sequential loop", "the overview must not bypass sequential cards"),
    ("Do not present the next candidate's complete decision card or ask its disposition until the current disposition or deferral has been recorded", "the next detailed card must wait"),
):
    assert needle in card, message
for needle, message in (
    ("After all candidates have an explicit disposition or explicit deferral", "finalization must wait for every candidate"),
    ("complete disposition ledger", "finalization needs the complete ledger"),
    ("explicit operator approval of that ledger", "ledger approval must be explicit"),
    ("Until that approval is given, do not call any plan approved, mark the Task Done, or present a ready-for-merge PR", "pre-approval finalization must be prohibited"),
    ("plan approved", "the final gate must cover plan approval"),
    ("Task Done", "the final gate must cover Task completion"),
    ("ready-for-merge PR", "the final gate must cover PR readiness"),
    ("through approved handoff", "the lifecycle must name approved handoff"),
    ("never merge", "the never-merge invariant is missing"),
):
    assert needle in finalization, message
for token in ("silence", "punctuation", "`-`", "clarification request", "challenge", "request for more evidence", "ambiguous", "custom response"):
    assert token.casefold() in card.casefold(), f"the loop must reject {token} as a disposition"
match(card, r"Advance only after .*explicit allowed disposition.*explicit deferral", "advancement needs an explicit disposition or deferral")
match(card, r"Answer .*provide .*evidence.*remain on the same candidate", "non-dispositions must stay on the current candidate")
match(text, r"long-running inventory, decision-grade research, verification, and independent review.*appropriate fresh delegated actors", "long-running work must use fresh delegates")
need("The accountable operator-facing owner retains synthesis, alignment, candidate questions, dispositions, plan approval, acceptance, and merge.", "delegation transferred an owner gate")
match(finalization, r"Decision-13.*evidence lifecycle only.*never supplies candidate dispositions, plan approval, acceptance, or merge approval", "decision-13 is being treated as decision authority")
match(finalization, r"draft Task, Change, plan, or research report.*fail closed", "draft evidence finalization must fail closed")
need("pull-request handoff only after the operator gate below", "PR handoff must not bypass the gate")

phase_names = ("## Establish the current baseline", "## Verify and assess", "## Present the assessment to the operator", "For every inventoried component, present an operator-readable benefit/cost summary")
phases = [text.find(name) for name in phase_names]
assert all(position >= 0 for position in phases), "an assessment phase is missing"
assert phases == sorted(phases) and phases[-1] < start < end, "required assessment/decision/finalization order changed"
for needle in (
    "Pi core", "every installed package reported by `pi list`", "Herdr and its Pi integration",
    "every source-derived first-class externally versioned integration/runtime owner", "otherwise commodity dependency implicated",
    "excluded generic prerequisites", "Reconcile aliases, duplicate sightings", "current upstream release on the selected channel",
    "latest relevant upstream version and its channel", "primary release notes, changelogs, release tags, commits, official package metadata, and official documentation",
    "`update`, `hold`, `test`, `replace`, `remove`, or `no action`", "smallest safe tests", "rollback path",
    "without mutating the assessed ecosystem", "do not install, update, remove, enable, disable, or replace",
):
    need(needle, f"retained assessment invariant missing: {needle}")
match(text, r"(?i)do not implement a recommendation", "candidate implementation must remain forbidden")
for retired in ("Never batch candidates, candidate cards", "Do not expose or ask about the next candidate"):
    assert retired not in text, f"contradictory pre-loop/loop rule remains: {retired}"
assert "through handoff are permitted" not in text, "the retired autonomous handoff path remains"

print("test-update-prompt: pass")
PY
