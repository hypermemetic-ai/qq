#!/usr/bin/env bash
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-pi-inventory"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
INVENTORY="$ROOT/bin/qq-pi-inventory"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export HOME="$tmp/home"
project="$tmp/project"
mkdir -p "$HOME/.pi/agent" "$project/.pi"
cat >"$HOME/.pi/agent/settings.json" <<'JSON'
{
  "packages": [
    "npm:plain-package@1.2.3",
    {
      "source": "npm:@scope/filtered-package@3.0.0",
      "extensions": ["index.ts"]
    },
    "git:github.com/acme/git-package@0123456789abcdef"
  ]
}
JSON
cat >"$project/.pi/settings.json" <<'JSON'
{
  "packages": [
    "npm:project-package@4.0.0"
  ]
}
JSON

make_manifest() {
  local path="$1" name="$2" version="$3"
  mkdir -p "$path"
  printf '{"name":"%s","version":"%s"}\n' "$name" "$version" >"$path/package.json"
}
make_manifest "$HOME/.pi/agent/npm/node_modules/plain-package" plain-package 1.2.3
make_manifest "$HOME/.pi/agent/npm/node_modules/@scope/filtered-package" @scope/filtered-package 3.0.0
make_manifest "$HOME/.pi/agent/git/github.com/acme/git-package" git-package 2.4.6
make_manifest "$project/.pi/npm/node_modules/project-package" project-package 4.0.0

# A tempting display command must never participate in inventory construction.
fake_bin="$tmp/bin"
mkdir "$fake_bin"
cat >"$fake_bin/pi" <<EOF_PI
#!/usr/bin/env bash
touch "$tmp/pi-was-called"
printf 'hostile display text\\n'
EOF_PI
chmod +x "$fake_bin/pi"
export PATH="$fake_bin:$PATH"

(
  cd "$project"
  "$INVENTORY" --json >"$tmp/inventory.json"
  "$INVENTORY" --json >"$tmp/inventory-again.json"
)
cmp "$tmp/inventory.json" "$tmp/inventory-again.json" \
  || fail 'canonical JSON output changed across identical reads'
[ ! -e "$tmp/pi-was-called" ] || fail 'inventory parsed or invoked pi display output'

cat >"$tmp/expected.json" <<EOF_EXPECTED
[
  {
    "name": "git-package",
    "source": "git:github.com/acme/git-package@0123456789abcdef",
    "scope": "global",
    "filtered": false,
    "installed_path": "$HOME/.pi/agent/git/github.com/acme/git-package",
    "manifest_identity": {
      "name": "git-package",
      "version": "2.4.6"
    }
  },
  {
    "name": "@scope/filtered-package",
    "source": "npm:@scope/filtered-package@3.0.0",
    "scope": "global",
    "filtered": true,
    "installed_path": "$HOME/.pi/agent/npm/node_modules/@scope/filtered-package",
    "manifest_identity": {
      "name": "@scope/filtered-package",
      "version": "3.0.0"
    }
  },
  {
    "name": "plain-package",
    "source": "npm:plain-package@1.2.3",
    "scope": "global",
    "filtered": false,
    "installed_path": "$HOME/.pi/agent/npm/node_modules/plain-package",
    "manifest_identity": {
      "name": "plain-package",
      "version": "1.2.3"
    }
  },
  {
    "name": "project-package",
    "source": "npm:project-package@4.0.0",
    "scope": "project",
    "filtered": false,
    "installed_path": "$project/.pi/npm/node_modules/project-package",
    "manifest_identity": {
      "name": "project-package",
      "version": "4.0.0"
    }
  }
]
EOF_EXPECTED
cmp "$tmp/expected.json" "$tmp/inventory.json" \
  || fail 'canonical package records differ from the structured fixture'

(
  cd "$project"
  "$INVENTORY" >"$tmp/table"
)
assert_file_contains "$tmp/table" 'NAME'
assert_file_contains "$tmp/table" 'FILTERED'
assert_file_contains "$tmp/table" '@scope/filtered-package'
assert_file_contains "$tmp/table" 'yes'

(
  cd "$project"
  "$INVENTORY" --check 'git:github.com/acme/git-package@0123456789abcdef'
)
set +e
(
  cd "$project"
  "$INVENTORY" --check 'git:github.com/acme/git-package'
)
status=$?
set -e
assert_equal 1 "$status" '--check accepted a source that was not exact'
set +e
(
  cd "$project"
  "$INVENTORY" --check 'npm:@scope/filtered-package@3.0.0 (filtered)'
)
status=$?
set -e
assert_equal 1 "$status" '--check accepted a display-only filtered marker'

# A manifest is an identity authority, not optional decoration.
printf '%s\n' '{"name":"different-package","version":"1.2.3"}' \
  >"$HOME/.pi/agent/npm/node_modules/plain-package/package.json"
set +e
(
  cd "$project"
  "$INVENTORY" --json
) >"$tmp/mismatch.out" 2>"$tmp/mismatch.err"
status=$?
set -e
assert_equal 2 "$status" 'source/manifest identity mismatch did not fail closed'
assert_file_contains "$tmp/mismatch.err" 'source and installed manifest name disagree'

printf 'test-qq-pi-inventory: pass\n'
