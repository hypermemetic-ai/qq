#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
relation="$root/dashboard/upstream.env"
# shellcheck source=/dev/null
source "$relation"

[[ "$QQ_DASHBOARD_UPSTREAM_URL" == https://github.com/hypermemetic-ai/qq-dashboard.git ]]
[[ "$QQ_DASHBOARD_UPSTREAM_REF" == refs/heads/main ]]
[[ "$QQ_DASHBOARD_LANDED_REPOSITORY" == /home/qqp/projects/qq-dashboard ]]
[[ $(grep -c . "$relation") -eq 3 ]]
[[ $(cut -d= -f1 "$relation") == $'QQ_DASHBOARD_UPSTREAM_URL\nQQ_DASHBOARD_UPSTREAM_REF\nQQ_DASHBOARD_LANDED_REPOSITORY' ]]
if grep -Eiq '(^|_)(commit|floor|tag|version)=' "$relation"; then
  echo 'qq-dashboard source relation must not pin product history' >&2
  exit 1
fi
if grep -Fq '@hypermemetic-ai/qq-dashboard' "$root/package.json" "$root/package-lock.json"; then
  echo 'qq-dashboard returned as an npm dependency' >&2
  exit 1
fi

work=$(mktemp -d "$HOME/qq-dashboard-contract.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
chmod 700 "$work"
git init -q -b qq-dashboard-contract "$work/source"
git -C "$work/source" remote add origin "$QQ_DASHBOARD_UPSTREAM_URL"
git -C "$work/source" fetch -q --depth=1 origin "$QQ_DASHBOARD_UPSTREAM_REF"
git -C "$work/source" checkout -q --detach FETCH_HEAD
[[ -x "$work/source/install.sh" ]]
[[ -x "$work/source/bin/qq-dashboard" ]]
[[ -x "$work/source/bin/qq-dashboard-cookies" ]]
[[ -f "$work/source/bin/lib/telemetry-lib.sh" ]]
[[ ! -d "$work/source/systemd" ]]
[[ -z $(git -C "$work/source" status --porcelain --untracked-files=all) ]]

cat >"$work/profile-list.json" <<'JSON'
{
  "schema": "qq.profile-list/v1",
  "roles": [
    {
      "name": "runner",
      "default": "contract",
      "profiles": [
        {"name":"contract","provider":"openai-codex","model":"branch-tip-contract-model","effort":"high"}
      ]
    }
  ],
  "services": [
    {"name":"qa","provider":"openai-codex","model":"branch-tip-contract-qa","effort":"xhigh"}
  ]
}
JSON
cat >"$work/fake-profile" <<'SH'
#!/usr/bin/env bash
[[ "$*" == 'list --json' ]] || exit 64
printf '%s\n' "$*" >"$QQ_DASHBOARD_PROFILE_CALL"
cat -- "$QQ_DASHBOARD_PROFILE_FIXTURE"
SH
chmod 700 "$work/fake-profile"
mkdir -m 700 "$work/source-home"
HOME="$work/source-home" \
QQ_PROFILE_BIN="$work/fake-profile" \
QQ_DASHBOARD_PROFILE_CALL="$work/profile-call" \
QQ_DASHBOARD_PROFILE_FIXTURE="$work/profile-list.json" \
  "$work/source/bin/qq-dashboard" --once >"$work/source-dashboard.out"
[[ $(<"$work/profile-call") == 'list --json' ]]
grep -Fq 'branch-tip-contract-model' "$work/source-dashboard.out"
HOME="$work/source-home" "$work/source/bin/qq-dashboard-cookies" status \
  >"$work/source-cookies.out"
grep -Fq 'cookie file: absent' "$work/source-cookies.out"

install_root="$work/install/dashboard"
QQ_DASHBOARD_INSTALL_ROOT="$install_root" "$work/source/install.sh" \
  >"$work/install.out"
[[ -x "$install_root/bin/qq-dashboard" ]]
[[ -x "$install_root/bin/qq-dashboard-cookies" ]]
[[ -f "$install_root/bin/lib/telemetry-lib.sh" ]]
rm -rf -- "$work/source"

consumer_home="$work/consumer-home"
mkdir -p "$consumer_home/.config/qq"
chmod 700 "$consumer_home" "$consumer_home/.config" "$consumer_home/.config/qq"
cat >"$consumer_home/.config/qq/execution-profiles.json" <<'JSON'
{
  "schema": "qq.execution-profiles/v1",
  "contextWindowCeiling": 200000,
  "scribe": {"provider":"openai-codex","model":"contract-scribe","effort":"high"},
  "qa": {"provider":"openai-codex","model":"contract-qa","effort":"xhigh"},
  "openwiki": {"provider":"openai-codex","model":"contract-openwiki","effort":"medium"},
  "roles": {
    "runner": {
      "default": "contract",
      "profiles": {
        "contract": {"provider":"openai-codex","model":"installed-contract-model","effort":"high"}
      }
    },
    "architect": {
      "default": "contract",
      "profiles": {
        "contract": {"provider":"openai-codex","model":"installed-architect-model","effort":"high"}
      }
    }
  }
}
JSON
chmod 600 "$consumer_home/.config/qq/execution-profiles.json"
cat >"$work/forbidden-profile" <<'SH'
#!/usr/bin/env bash
: >"$QQ_DASHBOARD_FORBIDDEN_CALLED"
exit 99
SH
chmod 700 "$work/forbidden-profile"
QQ_DASHBOARD_INSTALL_ROOT="$install_root" \
HOME="$consumer_home" XDG_CONFIG_HOME="$consumer_home/.config" \
QQ_PROFILE_BIN="$work/forbidden-profile" \
QQ_DASHBOARD_FORBIDDEN_CALLED="$work/forbidden-called" \
  "$root/bin/qq-dashboard" --once >"$work/installed-dashboard.out"
grep -Fq 'installed-contract-model' "$work/installed-dashboard.out"
[[ ! -e "$work/forbidden-called" ]]
QQ_DASHBOARD_INSTALL_ROOT="$install_root" HOME="$consumer_home" \
  "$root/bin/qq-dashboard-cookies" status >"$work/installed-cookies.out"
grep -Fq 'cookie file: absent' "$work/installed-cookies.out"

for wrapper in qq-dashboard qq-dashboard-cookies; do
  if QQ_DASHBOARD_INSTALL_ROOT=relative "$root/bin/$wrapper" --help \
    >"$work/$wrapper-relative.out" 2>"$work/$wrapper-relative.err"; then
    echo "$wrapper accepted a relative install root" >&2
    exit 1
  fi
  grep -Fq 'QQ_DASHBOARD_INSTALL_ROOT must be an absolute path' \
    "$work/$wrapper-relative.err"
  if QQ_DASHBOARD_INSTALL_ROOT="$work/missing" "$root/bin/$wrapper" --help \
    >"$work/$wrapper-missing.out" 2>"$work/$wrapper-missing.err"; then
    echo "$wrapper accepted a missing installed artifact" >&2
    exit 1
  fi
  grep -Fq 'installed executable is unavailable:' "$work/$wrapper-missing.err"
done

if HOME="$work/default-home" env -u QQ_DASHBOARD_INSTALL_ROOT \
  "$root/bin/qq-dashboard" --help \
  >"$work/default.out" 2>"$work/default.err"; then
  echo 'qq-dashboard found an unexpected default-root artifact' >&2
  exit 1
fi
grep -Fq "$work/default-home/.local/lib/qq/dashboard/bin/qq-dashboard" \
  "$work/default.err"

printf 'test-dashboard: pass\n'
