#!/usr/bin/env bash
set -euo pipefail
TESTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME=test-qq-methodology-kernel
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd -- "$TESTS_DIR/.." && pwd -P)"
KERNEL="$ROOT/methodology/KERNEL.md"
AGENTS="$ROOT/AGENTS.md"

[ -f "$KERNEL" ] || fail 'canonical methodology kernel is missing'
[ -f "$AGENTS" ] || fail 'Repository orientation is missing'
python3 - "$ROOT" "$KERNEL" "$AGENTS" <<'PY'
from pathlib import Path
import sys
root, kernel_path, agents_path = map(Path, sys.argv[1:])
kernel = kernel_path.read_text(encoding="utf-8")
agents = agents_path.read_text(encoding="utf-8")

assert "[`methodology/KERNEL.md`](methodology/KERNEL.md)" in agents
assert "# qq Repository orientation" in agents
assert "## Repository boundaries" in agents
for invariant in (
    "Stay within the agreement.",
    "Make uncertainty visible.",
    "Ground complexity in reality.",
    "Be intelligible.",
):
    assert kernel.count(invariant) == 1, invariant
    assert invariant not in agents, invariant
for phrase in (
    "qq methodology applies only when the Repository's common local Git configuration contains exactly one valid `qq.methodology=true` value",
    "Missing, false, malformed, ambiguous, non-Git, or untrusted additive context never activates qq",
    "`CONCEPTS.md` is the canonical shared vocabulary",
    "Changes land through GitHub Flow after their Checks pass and the operator merges",
    "Repository with a root `REVIEW.md`, read it fully before inspecting the diff",
    "OpenWiki is a derived orientation surface",
    "verify important conclusions in source and fresh Checks",
):
    assert phrase in kernel, phrase

# The universal body is mounted, not mirrored into any complete role body.
for manifest in sorted((root / "delegation/manifests/agents").glob("*.md")):
    text = manifest.read_text(encoding="utf-8")
    for invariant in (
        "Stay within the agreement.", "Make uncertainty visible.",
        "Ground complexity in reality.", "Be intelligible.",
    ):
        assert invariant not in text, (manifest, invariant)

# Outside tests and derived OpenWiki, the canonical invariant lead exists once.
occurrences = []
for path in root.rglob("*"):
    if not path.is_file() or ".git" in path.parts or "openwiki" in path.parts or "tests" in path.parts:
        continue
    try: text = path.read_text(encoding="utf-8")
    except (UnicodeError, OSError): continue
    if "Stay within the agreement." in text:
        occurrences.append(path.relative_to(root).as_posix())
assert occurrences == ["methodology/KERNEL.md"], occurrences
PY
node --input-type=module - "$ROOT/bin/lib/qq_role_identity.mjs" "$ROOT" <<'JS'
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const [helper, root] = process.argv.slice(2);
const { loadRolePrompt } = await import(pathToFileURL(helper));
const prompt = await loadRolePrompt("runner", { root });
assert.equal((prompt.match(/# qq methodology kernel/gu) ?? []).length, 1);
assert.match(prompt, /# Runner identity/u);
JS
printf 'test-qq-methodology-kernel: pass\n'
