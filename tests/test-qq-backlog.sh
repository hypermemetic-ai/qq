#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-backlog"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
QQ_BACKLOG="$ROOT/bin/qq-backlog"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fake_backlog="$tmp/backlog"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$fake_backlog"
chmod +x "$fake_backlog"
export QQ_BACKLOG_BIN="$fake_backlog"

repo="$tmp/repo"
git init -q -b main "$repo"
mkdir -p "$repo/backlog/decisions" "$repo/backlog/docs/plans" "$repo/backlog/tasks"
cat >"$repo/backlog/decisions/decision-7 - Fixture.md" <<'EOF_DECISION'
---
id: decision-7
title: Fixture
status: proposed
---
Old body.
EOF_DECISION
chmod 640 "$repo/backlog/decisions/decision-7 - Fixture.md"
cat >"$repo/backlog/docs/plans/doc-1 - Merged.md" <<'EOF_MERGED'
---
id: doc-1
title: Merged
---
# Merged
EOF_MERGED
git -C "$repo" add backlog
git -C "$repo" -c user.name=test -c user.email=test@example.com commit -qm base
git -C "$repo" switch -qc feature

frontmatter_hash() {
  python3 - "$1" <<'PY'
import hashlib
import sys
from pathlib import Path
raw = Path(sys.argv[1]).read_bytes()
end = raw.index(b"\n---\n", 4) + len(b"\n---\n")
print(hashlib.sha256(raw[:end]).hexdigest())
PY
}

decision="$repo/backlog/decisions/decision-7 - Fixture.md"
before_header="$(frontmatter_hash "$decision")"
(
  cd "$repo"
  "$QQ_BACKLOG" decision update 7 --content $'## Decision\n\nComplete replacement.' \
    >"$tmp/decision-path"
)
assert_equal 'backlog/decisions/decision-7 - Fixture.md' "$(cat "$tmp/decision-path")" \
  'decision update printed the wrong path'
assert_equal "$before_header" "$(frontmatter_hash "$decision")" \
  'decision update changed frontmatter bytes'
assert_equal $'## Decision\n\nComplete replacement.' "$(tail -n +6 "$decision")" \
  'decision update did not replace the complete body'
assert_equal 640 "$(stat -c '%a' "$decision")" 'decision update changed the file mode'

# Ambiguous and missing decision ids fail closed without editing either file.
cp "$decision" "$repo/backlog/decisions/decision-7 - Duplicate.md"
set +e
(
  cd "$repo"
  "$QQ_BACKLOG" decision update 7 --content nope
) >"$tmp/ambiguous.out" 2>"$tmp/ambiguous.err"
status=$?
set -e
assert_equal 1 "$status" 'ambiguous decision update did not refuse'
assert_file_contains "$tmp/ambiguous.err" 'must match exactly one file'
rm "$repo/backlog/decisions/decision-7 - Duplicate.md"

cat >"$repo/backlog/docs/plans/doc-5 - Unmerged-fixture.md" <<'EOF_DOC'
---
id: doc-5
title: >-
  Unmerged fixture title
---
# Unmerged fixture
EOF_DOC
cat >"$repo/backlog/tasks/t-1 - Fixture.md" <<'EOF_TASK'
---
id: T-1
title: Fixture
documentation:
  - doc-5
  - >-
    backlog/docs/plans/doc-5 -
    Unmerged-fixture.md
priority: medium
---

Body doc-5 must remain untouched.
EOF_TASK
cp "$repo/backlog/docs/plans/doc-5 - Unmerged-fixture.md" "$tmp/doc-5.original"
cp "$repo/backlog/tasks/t-1 - Fixture.md" "$tmp/task.original"

(
  cd "$repo"
  "$QQ_BACKLOG" doc supersede doc-5 >"$tmp/superseded-path"
)
new_doc="$repo/backlog/docs/plans/doc-6 - Unmerged-fixture.md"
assert_equal 'backlog/docs/plans/doc-6 - Unmerged-fixture.md' "$(cat "$tmp/superseded-path")" \
  'doc supersede printed the wrong path'
[ ! -e "$repo/backlog/docs/plans/doc-5 - Unmerged-fixture.md" ] \
  || fail 'doc supersede retained the old path'
[ -f "$new_doc" ] || fail 'doc supersede did not create the new path'
sed 's/^id: doc-5$/id: doc-6/' "$tmp/doc-5.original" >"$tmp/doc-6.expected"
cmp "$tmp/doc-6.expected" "$new_doc" || fail 'doc supersede rewrote more than the id line'
sed -e 's/doc-5/doc-6/g' "$tmp/task.original" >"$tmp/task.expected"
# The body reference is intentionally not managed frontmatter and must remain old.
sed -i 's/Body doc-6/Body doc-5/' "$tmp/task.expected"
cmp "$tmp/task.expected" "$repo/backlog/tasks/t-1 - Fixture.md" \
  || fail 'Task documentation references or managed wrap style changed incorrectly'

receipt="$repo/backlog/docs/.supersede-receipts.jsonl"
[ -f "$receipt" ] || fail 'doc supersede did not write its receipt'
jq -e '
  .schema == "qq-backlog.supersede"
  and .version == 1
  and .old_id == "doc-5" and .new_id == "doc-6"
  and .old_path == "backlog/docs/plans/doc-5 - Unmerged-fixture.md"
  and .new_path == "backlog/docs/plans/doc-6 - Unmerged-fixture.md"
  and (.old_sha256 | test("^[0-9a-f]{64}$"))
  and (.at | test("Z$"))
' "$receipt" >/dev/null || fail 'doc supersede receipt has the wrong identity'
first_receipt="$(cat "$receipt")"

# An identical retry refuses and cannot duplicate the append-only receipt.
set +e
(
  cd "$repo"
  "$QQ_BACKLOG" doc supersede doc-5
) >"$tmp/retry.out" 2>"$tmp/retry.err"
status=$?
set -e
assert_equal 1 "$status" 'identical doc supersede retry did not refuse'
assert_equal 1 "$(wc -l <"$receipt")" 'identical retry duplicated the receipt'
assert_equal "$first_receipt" "$(cat "$receipt")" 'identical retry changed the receipt'

# A second distinct supersede appends one line without changing the first.
cat >"$repo/backlog/docs/plans/doc-9 - Second.md" <<'EOF_SECOND'
---
id: doc-9
title: Second
---
Second.
EOF_SECOND
(
  cd "$repo"
  "$QQ_BACKLOG" doc supersede doc-9 >"$tmp/second-path"
)
assert_equal 2 "$(wc -l <"$receipt")" 'second supersede did not append one receipt'
assert_equal "$first_receipt" "$(head -n 1 "$receipt")" 'second supersede rewrote the first receipt'
tail -n 1 "$receipt" >"$tmp/second-receipt"
jq -e '.old_id == "doc-9" and .new_id == "doc-10"' "$tmp/second-receipt" >/dev/null \
  || fail 'second supersede receipt has the wrong allocation'

# A document already present on main's merge-base tree is never superseded.
merged_before="$(sha256sum "$repo/backlog/docs/plans/doc-1 - Merged.md")"
set +e
(
  cd "$repo"
  "$QQ_BACKLOG" doc supersede doc-1
) >"$tmp/merged.out" 2>"$tmp/merged.err"
status=$?
set -e
assert_equal 1 "$status" 'merged document supersede did not refuse'
assert_file_contains "$tmp/merged.err" "present on main's merge-base tree"
assert_equal "$merged_before" "$(sha256sum "$repo/backlog/docs/plans/doc-1 - Merged.md")" \
  'merged-doc refusal edited the document'

# Equal ids in multiple paths are ambiguous even when both are unmerged.
for directory in a b; do
  mkdir -p "$repo/backlog/docs/$directory"
  cat >"$repo/backlog/docs/$directory/doc-8 - Ambiguous.md" <<'EOF_AMBIGUOUS'
---
id: doc-8
title: Ambiguous
---
Ambiguous.
EOF_AMBIGUOUS
done
set +e
(
  cd "$repo"
  "$QQ_BACKLOG" doc supersede doc-8
) >"$tmp/doc-ambiguous.out" 2>"$tmp/doc-ambiguous.err"
status=$?
set -e
assert_equal 1 "$status" 'ambiguous document id did not refuse'
assert_file_contains "$tmp/doc-ambiguous.err" 'must match exactly one document'

# Tool resolution is a fail-closed prerequisite even for the hand-rolled verbs.
export QQ_BACKLOG_BIN="$tmp/not-an-executable"
set +e
(
  cd "$repo"
  "$QQ_BACKLOG" decision update 7 --content nope
) >"$tmp/missing-cli.out" 2>"$tmp/missing-cli.err"
status=$?
set -e
assert_equal 1 "$status" 'missing Backlog CLI did not fail closed'
assert_file_contains "$tmp/missing-cli.err" 'QQ_BACKLOG_BIN must be an absolute executable file'

printf 'test-qq-backlog: pass\n'
