#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
plugin="$root/plugins/q-mode"
# shellcheck source=/dev/null
source "$plugin/qq-dictation.env"
# shellcheck source=/dev/null
source "$root/herdr/downstream/upstream.env"
qq_dictation_commit=${qq_dictation_commit:?qq-dictation commit pin is required}
qq_dictation_feature_commit=${qq_dictation_feature_commit:?qq-dictation feature pin is required}

[[ $qq_dictation_commit == 1dd1b22fe782abb1c012b9c294fc19a343931b3b ]]
[[ $qq_dictation_feature_commit == 38603a88b272e0031cac38ca7c3497aa8260f42c ]]
[[ $HERDR_UPSTREAM_COMMIT == c9bce319a03752e86313aff4b0aa3fd541211e18 ]]
[[ $HERDR_OPERATOR_INPUT_COMMIT == 60d7167c2658deb766681e8642cee9f4d5bc7c0d ]]

python3 - "$root/herdr/config.toml" "$plugin/herdr-plugin.toml" <<'PY'
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
assert manifest["min_herdr_version"] == "0.8.0"
assert {item["id"] for item in manifest["actions"]} == {"start-or-stop", "cancel"}
PY

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
home="$work/home"
install="$home/.local/opt/qq-dictation/Handy.AppDir"
launcher="$home/.local/bin/handy"
runtime="$work/runtime"
proc="$work/proc"
log="$work/controls"
pid=$$
mkdir -p "$install/usr/bin" "$(dirname "$launcher")" "$runtime" "$proc/$pid"
printf '%s\n' "$qq_dictation_commit" >"$install/qq-dictation-commit"
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

printf 'not-the-pin\n' >"$install/qq-dictation-commit"
if "${run[@]}" HERDR_PANE_ID=w1:p1 \
  "$plugin/q-mode.sh" start-or-stop >/dev/null 2>&1; then
  echo 'q mode accepted an unpinned qq-dictation build' >&2
  exit 1
fi
"${run[@]}" "$plugin/q-mode.sh" cancel >/dev/null 2>&1
[[ $(wc -l <"$log") -eq 2 ]]
printf '%s\n' "$qq_dictation_commit" >"$install/qq-dictation-commit"

printf '999999 ready\n' >"$runtime/qq-dictation-handy-ready"
if "${run[@]}" HERDR_PANE_ID=w1:p1 \
  "$plugin/q-mode.sh" start-or-stop >/dev/null 2>&1; then
  echo 'q mode accepted a stale ready process' >&2
  exit 1
fi
"${run[@]}" "$plugin/q-mode.sh" cancel >/dev/null 2>&1
[[ $(wc -l <"$log") -eq 2 ]]
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
