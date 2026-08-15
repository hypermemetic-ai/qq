#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RAIL="$ROOT/bin/qq-methodology"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() {
  printf 'test-methodology: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  [[ "$1" == *"$2"* ]] || fail "expected output to contain: $2"
}

assert_not_contains() {
  [[ "$1" != *"$2"* ]] || fail "expected output not to contain: $2"
}

assert_lowercase_project_name() {
  local matches status
  set +e
  matches=$(git -C "$ROOT" grep -n -I -E \
    '(^|[^[:alnum:]_])QQ([^[:alnum:]_]|$)' -- \
    ':(glob)prompts/**' \
    ':(glob)extensions/**' \
    ':(glob)README*' \
    ':(glob)**/README*')
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$matches" >&2
    fail 'agent-facing prose contains the uppercase project name'
  fi
  (( status == 1 )) || fail 'could not check agent-facing project-name prose'
}

activation() {
  ROOT="$ROOT" REPOSITORY="$1" node --input-type=module <<'NODE'
import { pathToFileURL } from "node:url";
const { isActivatedRepository } = await import(pathToFileURL(`${process.env.ROOT}/bin/lib/roles.mjs`));
console.log(isActivatedRepository(process.env.REPOSITORY, process.env.ROOT));
NODE
}

[[ -x "$RAIL" ]] || fail "missing executable: $RAIL"
assert_lowercase_project_name

export HOME="$TMP/home"
export XDG_CONFIG_HOME="$HOME/.config"
mkdir -p "$HOME/.pi/agent" "$XDG_CONFIG_HOME/qq"
printf '{"schema":"test"}\n' >"$XDG_CONFIG_HOME/qq/execution-profiles.json"
printf '{"provider":"keep-models"}\n' >"$HOME/.pi/agent/models.json"
printf '{"credential":"keep-auth"}\n' >"$HOME/.pi/agent/auth.json"
cat >"$HOME/.pi/agent/settings.json" <<'JSON'
{
  "defaultModel": "keep-model",
  "auth": { "token": "keep-token" },
  "packages": ["keep-package"],
  "theme": "keep-theme",
  "steeringMode": "one",
  "followUpMode": "one",
  "tuiMode": "regular"
}
JSON
cat >"$HOME/.pi/agent/trust.json" <<'JSON'
{
  "/already/trusted": true
}
JSON
models_before=$(<"$HOME/.pi/agent/models.json")
auth_before=$(<"$HOME/.pi/agent/auth.json")

repository="$TMP/repository"
mkdir -p "$repository"
git init -q -b main "$repository"
git -C "$repository" config user.name 'qq Methodology Test'
git -C "$repository" config user.email 'qq-methodology@example.invalid'
printf 'fixture\n' >"$repository/file.txt"
git -C "$repository" add file.txt
git -C "$repository" commit -qm initial

inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked:'
assert_contains "$inspect_output" 'qq.methodology is absent'
[[ "$(activation "$repository")" == false ]] || fail 'unlinked repository activated qq'

link_output=$(cd "$repository" && "$RAIL" link)
assert_contains "$link_output" 'qq.methodology=true'
assert_contains "$link_output" 'fresh Pi session or run /reload'
[[ "$(git -C "$repository" config --local --type=bool --get qq.methodology)" == true ]] \
  || fail 'link did not write the local activation marker'
[[ "$(activation "$repository")" == true ]] || fail 'linked repository did not activate current qq'

store="$HOME/.local/state/qq/store/repository"
[[ -L "$repository/backlog" ]] || fail 'link did not create the checkout backlog symlink'
[[ "$(readlink "$repository/backlog")" == "$store" ]] || fail 'backlog symlink did not target the external qq store'
[[ -f "$store/config.yml" ]] || fail 'link did not initialize the Backlog.md store'
grep -Eq '^auto_commit:[[:space:]]*false$' "$store/config.yml" \
  || fail 'link did not disable Backlog.md auto-commit'

node - "$HOME/.pi/agent/settings.json" "$HOME/.pi/agent/trust.json" "$repository" "$HOME/.herdr/worktrees" <<'NODE'
const fs = require("node:fs");
const [settingsPath, trustPath, repository, worktrees] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const trust = JSON.parse(fs.readFileSync(trustPath, "utf8"));
if (settings.steeringMode !== "all" || settings.followUpMode !== "all" || settings.tuiMode !== "fullscreen") process.exit(1);
if (settings.defaultModel !== "keep-model" || settings.auth?.token !== "keep-token") process.exit(1);
if (settings.packages?.[0] !== "keep-package" || settings.theme !== "keep-theme") process.exit(1);
if (trust[repository] !== true || trust[worktrees] !== true || trust["/already/trusted"] !== true) process.exit(1);
NODE
[[ "$(<"$HOME/.pi/agent/models.json")" == "$models_before" ]] || fail 'link changed models.json'
[[ "$(<"$HOME/.pi/agent/auth.json")" == "$auth_before" ]] || fail 'link changed auth.json'
assert_contains "$(cd "$repository" && "$RAIL" inspect)" 'linked: qq.methodology=true'

printf 'keep\n' >"$store/tasks/keep.txt"
(cd "$repository" && "$RAIL" link >/dev/null)
[[ -f "$store/tasks/keep.txt" ]] || fail 'idempotent link replaced the existing Backlog store'
[[ "$(git -C "$repository" config --local --get-all qq.methodology | wc -l)" == 1 ]] \
  || fail 'idempotent link created multiple values'

node - "$HOME/.pi/agent/settings.json" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const settings = JSON.parse(fs.readFileSync(file, "utf8"));
delete settings.followUpMode;
fs.writeFileSync(file, `${JSON.stringify(settings)}\n`);
NODE
inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): Pi setting followUpMode=all is missing'
assert_not_contains "$inspect_output" 'linked: qq.methodology=true'
(cd "$repository" && "$RAIL" link >/dev/null)

node - "$HOME/.pi/agent/trust.json" "$repository" <<'NODE'
const fs = require("node:fs");
const [file, repository] = process.argv.slice(2);
const trust = JSON.parse(fs.readFileSync(file, "utf8"));
delete trust[repository];
fs.writeFileSync(file, `${JSON.stringify(trust)}\n`);
NODE
inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): Pi trust is missing for the linked checkout'
assert_not_contains "$inspect_output" 'linked: qq.methodology=true'
(cd "$repository" && "$RAIL" link >/dev/null)

rm "$repository/backlog"
inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): backlog symlink is missing'
mkdir "$repository/backlog"
inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): backlog is a real directory inside the worktree'
rmdir "$repository/backlog"
ln -s "$TMP/missing-store" "$repository/backlog"
inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): backlog symlink is dangling'
(cd "$repository" && "$RAIL" link >/dev/null)

perl -0pi -e 's/auto_commit: false/auto_commit: true/' "$store/config.yml"
inspect_output=$(cd "$repository" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): Backlog store config must contain auto_commit: false'
(cd "$repository" && "$RAIL" link >/dev/null)

worktree="$TMP/worktree"
git -C "$repository" worktree add -q -b linked-worktree "$worktree"
inspect_output=$(cd "$worktree" && "$RAIL" inspect)
assert_contains "$inspect_output" 'unlinked (invalid): backlog symlink is missing'
(cd "$worktree" && "$RAIL" link >/dev/null)
assert_contains "$(cd "$worktree" && "$RAIL" inspect)" 'linked: qq.methodology=true'
node - "$HOME/.pi/agent/trust.json" "$worktree" <<'NODE'
const fs = require("node:fs");
const [file, worktree] = process.argv.slice(2);
if (JSON.parse(fs.readFileSync(file, "utf8"))[worktree] !== true) process.exit(1);
NODE

clone="$TMP/clone"
git clone -q "$repository" "$clone"
assert_contains "$(cd "$clone" && "$RAIL" inspect)" 'unlinked:'
[[ "$(activation "$clone")" == false ]] || fail 'repository-local link leaked into a clone'

(cd "$worktree" && "$RAIL" unlink >/dev/null)
if git -C "$repository" config --local --get qq.methodology >/dev/null 2>&1; then
  fail 'unlink from a worktree did not clear the common repository marker'
fi
[[ "$(activation "$repository")" == false ]] || fail 'unlinked repository still activated current qq'

fresh_home="$TMP/fresh-home"
fresh_repository="$TMP/fresh-repository"
git init -q -b main "$fresh_repository"
printf 'fresh\n' >"$fresh_repository/file.txt"
git -C "$fresh_repository" add file.txt
git -C "$fresh_repository" \
  -c user.name='qq Methodology Test' -c user.email='qq-methodology@example.invalid' \
  commit -qm initial
(
  cd "$fresh_repository"
  HOME="$fresh_home" XDG_CONFIG_HOME="$fresh_home/.config" "$RAIL" link >/dev/null
)
node - "$fresh_home/.pi/agent/settings.json" "$fresh_home/.pi/agent/trust.json" "$fresh_repository" "$fresh_home/.herdr/worktrees" <<'NODE'
const fs = require("node:fs");
const [settingsPath, trustPath, repository, worktrees] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const trust = JSON.parse(fs.readFileSync(trustPath, "utf8"));
if (settings.steeringMode !== "all" || settings.followUpMode !== "all" || settings.tuiMode !== "fullscreen") process.exit(1);
if (trust[repository] !== true || trust[worktrees] !== true) process.exit(1);
NODE
[[ -f "$fresh_home/.local/state/qq/store/fresh-repository/config.yml" ]] \
  || fail 'fresh-home link did not initialize the external Backlog store'
fresh_inspect=$(
  cd "$fresh_repository"
  HOME="$fresh_home" XDG_CONFIG_HOME="$fresh_home/.config" "$RAIL" inspect
)
assert_contains "$fresh_inspect" 'linked: qq.methodology=true'
assert_contains "$fresh_inspect" 'warning: Git user.name is unset'
assert_contains "$fresh_inspect" 'warning: Git user.email is unset'
assert_contains "$fresh_inspect" 'warning: qq execution profiles are missing'

tracked="$TMP/tracked-repository"
git init -q -b main "$tracked"
git -C "$tracked" config user.name 'qq Methodology Test'
git -C "$tracked" config user.email 'qq-methodology@example.invalid'
mkdir "$tracked/backlog"
printf '# task\n' >"$tracked/backlog/task.md"
git -C "$tracked" add backlog/task.md
git -C "$tracked" commit -qm 'tracked backlog tree'
if (cd "$tracked" && "$RAIL" link >/dev/null 2>"$TMP/tracked.err"); then
  fail 'link rewrote a tracked Backlog file tree'
fi
assert_contains "$(<"$TMP/tracked.err")" 'backlog is a tracked file tree'
[[ -f "$tracked/backlog/task.md" ]] || fail 'link removed the tracked Backlog file tree'
if git -C "$tracked" config --local --get qq.methodology >/dev/null 2>&1; then
  fail 'link marked a repository with a tracked Backlog tree as linked'
fi

tracked_link="$TMP/tracked-link-repository"
git init -q -b main "$tracked_link"
git -C "$tracked_link" config user.name 'qq Methodology Test'
git -C "$tracked_link" config user.email 'qq-methodology@example.invalid'
ln -s /another-machine/qq-store "$tracked_link/backlog"
git -C "$tracked_link" add backlog
git -C "$tracked_link" commit -qm 'tracked backlog symlink'
tracked_link_before=$(git -C "$tracked_link" rev-parse HEAD)
(cd "$tracked_link" && "$RAIL" link >/dev/null)
[[ "$(readlink "$tracked_link/backlog")" == "$HOME/.local/state/qq/store/tracked-link-repository" ]] \
  || fail 'link did not retarget the tracked Backlog symlink to this machine store'
[[ "$(git -C "$tracked_link" rev-parse HEAD)" != "$tracked_link_before" ]] \
  || fail 'link did not commit the updated tracked Backlog symlink'
[[ -z "$(git -C "$tracked_link" status --porcelain)" ]] \
  || fail 'link left the tracked Backlog symlink dirty after committing it'

non_git="$TMP/non-git"
mkdir -p "$non_git"
if (cd "$non_git" && "$RAIL" link >/dev/null 2>"$TMP/non-git.err"); then
  fail 'link accepted a non-Git directory'
fi
assert_contains "$(<"$TMP/non-git.err")" 'not inside a Git repository'

printf 'test-methodology: pass\n'
