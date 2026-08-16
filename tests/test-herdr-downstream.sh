#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
downstream="$root/herdr/downstream"
relation="$downstream/upstream.env"
mapfile -t relation_lines <"$relation"
relation_fields=()
for line in "${relation_lines[@]}"; do
  if [[ ! $line =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.+)$ ]]; then
    printf 'invalid Herdr relation line: %s\n' "$line" >&2
    exit 1
  fi
  field=${BASH_REMATCH[1]}
  if [[ ${field,,} =~ (commit|floor|tag|version) ]]; then
    printf 'forbidden Herdr relation field: %s\n' "$field" >&2
    exit 1
  fi
  relation_fields+=("$field")
done
expected_relation_fields=(
  HERDR_UPSTREAM_URL
  HERDR_UPSTREAM_REF
  HERDR_LANDED_REPOSITORY
)
[[ ${#relation_fields[@]} -eq ${#expected_relation_fields[@]} ]]
[[ "${relation_fields[*]}" == "${expected_relation_fields[*]}" ]]

# shellcheck source=/dev/null
source "$relation"
HERDR_UPSTREAM_URL=${HERDR_UPSTREAM_URL:?Herdr repository URL is required}
HERDR_UPSTREAM_REF=${HERDR_UPSTREAM_REF:?Herdr branch ref is required}
HERDR_LANDED_REPOSITORY=${HERDR_LANDED_REPOSITORY:?Herdr landed repository is required}

[[ "$HERDR_UPSTREAM_URL" == https://github.com/hypermemetic-ai/herdr.git ]]
[[ "$HERDR_UPSTREAM_REF" == refs/heads/master ]]
[[ "$HERDR_LANDED_REPOSITORY" == /home/qqp/projects/herdr ]]
[[ -z ${HERDR_PATCHES+x} ]]
[[ ! -e "$downstream/patches/0001-centered-pane-row.patch" ]]
grep -q 'pane_preferred_width = 80' "$root/herdr/config.toml"
grep -q 'previous_workspace = "alt+up"' "$root/herdr/config.toml"
grep -q 'next_workspace = "alt+down"' "$root/herdr/config.toml"
grep -q 'previous_tab = "alt+left"' "$root/herdr/config.toml"
grep -q 'next_tab = "alt+right"' "$root/herdr/config.toml"
grep -q '^label = "q mode"$' "$root/herdr/config.toml"
grep -q '^trigger = "right-alt"$' "$root/herdr/config.toml"
grep -Fqx 'exit = ["esc", "enter"]' "$root/herdr/config.toml"
grep -q '^on_exit = "qq.q-mode.cancel"$' "$root/herdr/config.toml"
grep -q '^action = "qq.q-mode.start-or-stop"$' "$root/herdr/config.toml"
grep -q '^action = "qq.q-mode.cancel"$' "$root/herdr/config.toml"
grep -Fqx 'pane_borders = false' "$root/herdr/config.toml"
grep -q '%h/.local/lib/qq/herdr/bin/herdr server' "$root/systemd/user/herdr.service"
grep -q '^ExitType=cgroup$' "$root/systemd/user/herdr.service"
grep -q '%h/.local/state/herdr/herdr.log' "$root/systemd/user/herdr.service"
[[ ! -e "$root/bin/qq-herdr-build" ]]
[[ -x "$root/bin/qq-herdr-activate" ]]
[[ ! -e "$root/bin/qq-herdr-upgrade" ]]
[[ -x "$root/bin/qq-herdr-pane-add" ]]
[[ -x "$root/bin/qq-herdr-smoke" ]]
[[ -x "$root/bin/qq-herdr-launch" ]]
[[ -x "$root/bin/qq-q-mode-uat" ]]
[[ -x "$root/plugins/q-mode/q-mode.sh" ]]
[[ -x "$root/tests/test-herdr-live.sh" ]]
[[ -x "$root/tests/test-q-mode.sh" ]]
grep -q 'q-mode.sh" check' "$root/bin/qq-herdr-activate"
grep -q 'plugin link' "$root/bin/qq-herdr-activate"
grep -q -- 'ghostty --gtk-single-instance=true --title=herdr -e' "$root/bin/qq-herdr-launch"

ghostty_config="$root/ghostty/config"
[[ -s "$ghostty_config" ]]
grep -q '^fullscreen = true$' "$ghostty_config"
grep -q '^window-padding-x = 12$' "$ghostty_config"
grep -q '^title = herdr$' "$ghostty_config"
if grep -q '^window-padding-x = 480$' "$ghostty_config"; then
  echo 'retired Ghostty 4K box padding returned' >&2
  exit 1
fi
if grep -q '^custom-shader' "$ghostty_config"; then
  echo 'retired Ghostty edge-mask shader returned' >&2
  exit 1
fi
[[ ! -e "$root/ghostty/shaders/column-rails.glsl" ]]

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
contract_source=${QQ_HERDR_CONTRACT_SOURCE:-$HERDR_LANDED_REPOSITORY}
git init -q "$work/source"
if [[ -d $contract_source/.git ]] \
  && git -C "$contract_source" rev-parse --verify -q \
    "$HERDR_UPSTREAM_REF^{commit}" >/dev/null; then
  source_repository=$contract_source
else
  source_repository=$HERDR_UPSTREAM_URL
fi
contract_tip_ref=refs/qq/contract-tip
git -C "$work/source" fetch -q "$source_repository" \
  "$HERDR_UPSTREAM_REF:$contract_tip_ref"
herdr_tip=$(git -C "$work/source" rev-parse "$contract_tip_ref^{commit}")
git -C "$work/source" checkout -q --detach "$herdr_tip"

python3 - "$work/source" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
evidence = {
    "src/config/model.rs": [
        "pub pane_preferred_width: u16,",
        "fn pane_appearance_defaults_and_parse()",
        "pane_preferred_width = 60",
        "assert_eq!(config.ui.pane_preferred_width, 60);",
    ],
    "src/ui.rs": [
        "centered_pane_area(full_terminal_area, app.pane_preferred_width, pane_count)",
        "fn desktop_centers_pane_canvas_without_moving_sidebar_or_tab_bar()",
        "fn desktop_pane_canvas_grows_per_pane_then_uses_full_width()",
        "assert_eq!(app.view.terminal_area, Rect::new(33, 1, 60, 19));",
    ],
    "src/layout.rs": [
        "if !is_horizontal_row(&self.root)",
        "balance_horizontal_node(&mut self.root);",
        "fn balance_horizontal_row_equalizes_nested_splits()",
        "assert_eq!(widths, vec![30, 30, 30]);",
        "fn balance_horizontal_row_preserves_mixed_layout()",
    ],
    "src/app/api/panes.rs": [
        "self.state.pane_preferred_width > 0",
        "params.ratio.is_none()",
        "direction == ratatui::layout::Direction::Horizontal",
        ".balance_horizontal_row();",
    ],
    "src/app/mod.rs": [
        "pane_split_request_balances_horizontal_row_when_preferred_width_is_configured",
        "pane_split_request_preserves_explicit_ratio_when_preferred_width_is_configured",
        "assert_eq!(widths, vec![30, 30, 30]);",
        "assert!((splits[0].ratio - 0.333).abs() < f32::EPSILON);",
    ],
    "src/config.rs": [
        "fn structured_operator_input_resolves_map_and_conflicts_deterministically()",
        'label = "q mode"',
        'on_exit = "example.input.cancel"',
        'action = "example.input.start-or-stop"',
        'action = "example.input.cancel"',
    ],
    "src/app/input/operator.rs": [
        "let action_id = config.on_exit.as_deref()?;",
        "Some(OperatorInputAction::PluginAction(action_id))",
        'self.plugin_context_for_operator_input("operator-input-key")',
        "fn duplicate_source_cleanup_invokes_on_exit_once_with_activation_context()",
        "fn operator_plugin_action_runs_once_on_press_with_current_pane_context()",
        'Some("operator_input")',
    ],
    "src/app/api/plugins/mod.rs": [
        "pub(crate) fn plugin_context_for_operator_input(",
        'context.invocation_source = Some("operator_input".to_string());',
    ],
    "src/app/api/plugins/runtime.rs": [
        '("HERDR_PLUGIN_ACTION_ID".to_string(), action_id.clone())',
        '("HERDR_PANE_ID".to_string(), pane_id.clone())',
    ],
}

for relative, required in evidence.items():
    path = root / relative
    text = path.read_text()
    for item in required:
        if item not in text:
            raise SystemExit(f"missing Herdr contract evidence in {relative}: {item}")
PY

[[ -z $(git -C "$work/source" status --porcelain) ]]

mock="$work/mock"
mkdir -p "$mock"
cat > "$mock/herdr" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$QQ_HERDR_TEST_ARGS"
EOF
chmod +x "$mock/herdr"
QQ_HERDR_TEST_ARGS="$work/args" QQ_HERDR_BIN="$mock/herdr" \
  "$root/bin/qq-herdr-pane-add" --current --cwd /tmp --no-focus
[[ "$(cat "$work/args")" == 'pane split --direction right --current --cwd /tmp --no-focus' ]]
QQ_HERDR_TEST_ARGS="$work/args" QQ_HERDR_BIN="$mock/herdr" \
  "$root/bin/qq-herdr-pane-add" --pane w2T:p1M --cwd /tmp --no-focus
[[ "$(cat "$work/args")" == 'pane split w2T:p1M --direction right --cwd /tmp --no-focus' ]]
if QQ_HERDR_BIN="$mock/herdr" "$root/bin/qq-herdr-pane-add" --ratio 0.5 >/dev/null 2>&1; then
  echo 'qq-herdr-pane-add accepted a forbidden ratio' >&2
  exit 1
fi

printf 'herdr downstream contract tests passed\n'
