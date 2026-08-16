#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
plugin="$root/plugins/q-mode"
relation="$plugin/qq-dictation.env"
mapfile -t relation_lines <"$relation"
relation_fields=()
for line in "${relation_lines[@]}"; do
  if [[ ! $line =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.+)$ ]]; then
    printf 'invalid qq-dictation relation line: %s\n' "$line" >&2
    exit 1
  fi
  field=${BASH_REMATCH[1]}
  if [[ ${field,,} =~ (commit|floor|tag|version) ]]; then
    printf 'forbidden qq-dictation relation field: %s\n' "$field" >&2
    exit 1
  fi
  relation_fields+=("$field")
done
expected_relation_fields=(
  qq_dictation_upstream_url
  qq_dictation_upstream_ref
  qq_dictation_landed_repository
)
[[ ${#relation_fields[@]} -eq ${#expected_relation_fields[@]} ]]
[[ "${relation_fields[*]}" == "${expected_relation_fields[*]}" ]]

# shellcheck source=/dev/null
source "$relation"
qq_dictation_upstream_url=${qq_dictation_upstream_url:?qq-dictation repository URL is required}
qq_dictation_upstream_ref=${qq_dictation_upstream_ref:?qq-dictation branch ref is required}
qq_dictation_landed_repository=${qq_dictation_landed_repository:?qq-dictation landed repository is required}

[[ $qq_dictation_upstream_url == git@github.com:qqp-dev/qq-dictation.git ]]
[[ $qq_dictation_upstream_ref == refs/heads/main ]]
[[ $qq_dictation_landed_repository == /home/qqp/projects/qq-dictation ]]

python3 - "$root/herdr/config.toml" "$plugin/herdr-plugin.toml" <<'PY'
import re
import sys
import tomllib

with open(sys.argv[1], "rb") as handle:
    config = tomllib.load(handle)
mode = config["keys"]["quick_navigation"]
assert mode["label"] == "q mode"
assert mode["trigger"] == "right-alt"
assert mode["exit"] == ["esc", "enter"]
assert (mode["previous_pane"], mode["next_pane"]) == ("left", "right")
assert (mode["previous_workspace"], mode["next_workspace"]) == ("up", "down")
assert (mode["previous_tab"], mode["next_tab"]) == ("ctrl+left", "ctrl+right")
assert mode["focus_agent"] == "1..9"
assert mode["help"] == "?"
assert mode["on_exit"] == "qq.q-mode.cancel"
actions = {item["key"]: item for item in mode["plugin_action"]}
assert actions["space"]["action"] == "qq.q-mode.start-or-stop"
assert actions["delete"]["action"] == "qq.q-mode.cancel"
assert all("q mode" in item["description"] for item in actions.values())
assert config["ui"]["pane_borders"] is False

with open(sys.argv[2], "rb") as handle:
    manifest = tomllib.load(handle)
assert manifest["id"] == "qq.q-mode"
assert manifest["name"] == "qq q mode"
assert re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", manifest["min_herdr_version"])
assert {item["id"] for item in manifest["actions"]} == {"start-or-stop", "cancel"}
PY

if grep -Fq 'qq-dictation-commit' "$plugin/q-mode.sh"; then
  echo 'q mode reads installed qq-dictation provenance' >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dictation_source="$work/dictation-source"
contract_source=${QQ_DICTATION_CONTRACT_SOURCE:-$qq_dictation_landed_repository}
git init -q "$dictation_source"
if [[ -d $contract_source/.git ]] \
  && git -C "$contract_source" rev-parse --verify -q \
    "$qq_dictation_upstream_ref^{commit}" >/dev/null; then
  source_repository=$contract_source
else
  source_repository=$qq_dictation_upstream_url
fi
contract_tip_ref=refs/qq/contract-tip
git -C "$dictation_source" fetch -q "$source_repository" \
  "$qq_dictation_upstream_ref:$contract_tip_ref"
dictation_tip=$(git -C "$dictation_source" rev-parse \
  "$contract_tip_ref^{commit}")
git -C "$dictation_source" checkout -q --detach "$dictation_tip"

python3 - "$dictation_source/src-tauri/src/cli.rs" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]).read_text()
parser, tests = source.split("#[cfg(test)]", 1)

def require(text, pattern, description):
    if not re.search(pattern, text, re.DOTALL):
        raise SystemExit(f"missing qq-dictation CLI evidence: {description}")

require(
    parser,
    r'#\[arg\(long,\s*conflicts_with = "cancel"\)\]\s*pub toggle_transcription: bool,',
    "toggle conflicts with cancel",
)
require(
    parser,
    r'#\[arg\(\s*long,\s*value_name = "PANE_ID",\s*requires = "toggle_transcription",\s*conflicts_with = "cancel"\s*\)\]\s*pub herdr_pane: Option<String>,',
    "Herdr pane requires toggle and conflicts with cancel",
)
require(
    parser,
    r'#\[arg\(long,\s*conflicts_with = "toggle_transcription"\)\]\s*pub cancel: bool,',
    "cancel conflicts with toggle",
)
require(
    parser,
    r'if parsed\.toggle_transcription \{.*?\.herdr_pane.*?\.map\(StartTarget::ExplicitPane\).*?\} else if parsed\.cancel \{\s*Ok\(RunningInstanceCommand::Cancel\)',
    "parser classifies pane-bound toggles and targetless cancel",
)
require(
    tests,
    r'command\(&\["handy", "--toggle-transcription", "--herdr-pane", "w2H:p13",\]\).*?StartTarget::ExplicitPane\("w2H:p13"\.to_string\(\)\)',
    "canonical pane-bound toggle parser test",
)
require(
    tests,
    r'fn rejects_missing_duplicate_or_orphaned_pane_arguments\(\).*?vec!\["handy", "--herdr-pane", "w2H:p13"\].*?vec!\["handy", "--toggle-transcription", "--herdr-pane"\].*?command\(&args\)\.is_err\(\)',
    "strict pane argument parser tests",
)
require(
    tests,
    r'fn cancel_is_targetless_and_separate_from_start_or_stop\(\).*?command\(&\["handy", "--cancel"\]\).*?RunningInstanceCommand::Cancel.*?vec!\["handy", "--cancel", "--herdr-pane", "w2H:p13"\].*?command\(&args\)\.is_err\(\)',
    "targetless cancel parser tests",
)
PY

[[ -z $(git -C "$dictation_source" status --porcelain) ]]

home="$work/home"
install="$home/.local/opt/qq-dictation/Handy.AppDir"
launcher="$home/.local/bin/handy"
runtime="$work/runtime"
proc="$work/proc"
log="$work/controls"
pid=$$
mkdir -p "$install/usr/bin" "$(dirname "$launcher")" "$runtime" "$proc/$pid"
printf 'build-provenance-only\n' >"$install/qq-dictation-commit"
printf '#!/usr/bin/env bash\nexit 0\n' >"$install/usr/bin/handy"
chmod 0755 "$install/usr/bin/handy"
ln -s "$install/usr/bin/handy" "$proc/$pid/exe"
printf '%s ready\n' "$pid" >"$runtime/qq-dictation-handy-ready"
cat >"$launcher" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$qq_q_mode_test_log"
if [[ ${qq_q_mode_test_sleep:-0} == 1 ]]; then
  sleep 10
fi
EOF
chmod 0755 "$launcher"

run=(env HOME="$home" XDG_RUNTIME_DIR="$runtime" \
  qq_q_mode_install_dir="$install" qq_q_mode_handy_bin="$launcher" \
  qq_q_mode_runtime_dir="$runtime" qq_q_mode_proc_root="$proc" \
  qq_q_mode_test_log="$log")

"${run[@]}" "$plugin/q-mode.sh" check | grep -q '^q mode ready:'
"${run[@]}" HERDR_PLUGIN_ACTION_ID=start-or-stop HERDR_PANE_ID=w2H:p13 \
  "$plugin/q-mode.sh" start-or-stop
[[ $(<"$log") == '--toggle-transcription --herdr-pane w2H:p13' ]]
"${run[@]}" HERDR_PLUGIN_ACTION_ID=cancel HERDR_PANE_ID=wOther:pNow \
  "$plugin/q-mode.sh" cancel
[[ $(tail -n1 "$log") == '--cancel' ]]
[[ $(wc -l <"$log") -eq 2 ]]

for pane in '' malformed 'w:p1' 'w1:p' 'w1:p1:extra' 'w1:p-1'; do
  if "${run[@]}" HERDR_PANE_ID="$pane" \
    "$plugin/q-mode.sh" start-or-stop >/dev/null 2>&1; then
    printf 'q mode accepted invalid pane id %q\n' "$pane" >&2
    exit 1
  fi
done
[[ $(wc -l <"$log") -eq 2 ]]

rm "$install/qq-dictation-commit"
"${run[@]}" HERDR_PANE_ID=w1:p1 "$plugin/q-mode.sh" start-or-stop
[[ $(tail -n1 "$log") == '--toggle-transcription --herdr-pane w1:p1' ]]
[[ $(wc -l <"$log") -eq 3 ]]

printf '999999 ready\n' >"$runtime/qq-dictation-handy-ready"
if "${run[@]}" HERDR_PANE_ID=w1:p1 \
  "$plugin/q-mode.sh" start-or-stop >/dev/null 2>&1; then
  echo 'q mode accepted a stale ready process' >&2
  exit 1
fi
"${run[@]}" "$plugin/q-mode.sh" cancel >/dev/null 2>&1
[[ $(wc -l <"$log") -eq 3 ]]
printf '%s ready\n' "$pid" >"$runtime/qq-dictation-handy-ready"

if "${run[@]}" qq_q_mode_control_timeout=.05s qq_q_mode_test_sleep=1 \
  HERDR_PANE_ID=w1:p1 "$plugin/q-mode.sh" start-or-stop >/dev/null 2>&1; then
  echo 'q mode allowed a non-forwarding control process to persist' >&2
  exit 1
fi
[[ $(tail -n1 "$log") == '--toggle-transcription --herdr-pane w1:p1' ]]

if "${run[@]}" HERDR_PLUGIN_ACTION_ID=cancel \
  "$plugin/q-mode.sh" start-or-stop >/dev/null 2>&1; then
  echo 'q mode accepted a mismatched plugin action context' >&2
  exit 1
fi

printf 'q mode adapter and configuration tests passed\n'
