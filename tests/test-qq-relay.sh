#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
relation="$root/qq-relay/upstream.env"
# shellcheck source=/dev/null
source "$relation"

[[ "$QQ_RELAY_UPSTREAM_URL" == https://github.com/hypermemetic-ai/qq-relay.git ]]
[[ "$QQ_RELAY_UPSTREAM_REF" == refs/heads/main ]]
[[ "$QQ_RELAY_LANDED_REPOSITORY" == /home/qqp/projects/qq-relay ]]
if grep -Eiq '(^|_)(commit|floor|tag|version)=' "$relation"; then
  echo "qq-relay source relation must not pin product history" >&2
  exit 1
fi

work=$(mktemp -d "$HOME/qq-relay-contract.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
chmod 700 "$work"
git init -q -b qq-relay-contract "$work/source"
git -C "$work/source" remote add origin "$QQ_RELAY_UPSTREAM_URL"
git -C "$work/source" fetch -q --depth=1 origin "$QQ_RELAY_UPSTREAM_REF"
git -C "$work/source" checkout -q --detach FETCH_HEAD
[[ -x "$work/source/bin/qq-relay" ]]
[[ -x "$work/source/install.sh" ]]
[[ -f "$work/source/client.mjs" ]]
[[ -f "$work/source/systemd/user/qq-relay.service.in" ]]
[[ -z $(git -C "$work/source" status --porcelain) ]]
node --input-type=module - "$work/source/client.mjs" <<'NODE'
import { pathToFileURL } from "node:url";
const relay = await import(pathToFileURL(process.argv[2]));
for (const name of ["RelayClient", "RelayError", "canonicalRelayJson"]) {
  if (typeof relay[name] !== "function") throw new Error(`upstream qq-relay does not export ${name}`);
}
if (relay.QQ_RELAY_PROTOCOL !== "qq-relay/v1") {
  throw new Error(`unsupported qq-relay protocol: ${relay.QQ_RELAY_PROTOCOL}`);
}
NODE

install_root="$work/install/relay"
QQ_RELAY_INSTALL_ROOT="$install_root" "$work/source/install.sh" >"$work/install.out"
[[ -x "$install_root/bin/qq-relay" ]]
[[ -f "$install_root/client.mjs" ]]
[[ -f "$install_root/lib/relay_client.py" && -f "$install_root/lib/relay_service.py" ]]
[[ -f "$install_root/share/systemd/user/qq-relay.service" ]]
export QQ_RELAY_INSTALL_ROOT="$install_root"
rm -rf -- "$work/source"
node "$root/tests/test-qq-relay-client.mjs" "$root" "$install_root"

if QQ_RELAY_INSTALL_ROOT="$work/missing" "$root/bin/qq-relay" inspect '{}' \
  >"$work/missing-cli.out" 2>"$work/missing-cli.err"; then
  echo "bin/qq-relay accepted a missing installed artifact" >&2
  exit 1
fi
grep -Fq 'qq-relay: installed executable is unavailable:' "$work/missing-cli.err"
if QQ_RELAY_INSTALL_ROOT="$work/missing" node --input-type=module \
  -e 'await import(process.argv[1])' "$root/bin/lib/qq-relay-client.mjs" \
  >"$work/missing-client.out" 2>"$work/missing-client.err"; then
  echo "qq-relay client loader accepted a missing installed artifact" >&2
  exit 1
fi
grep -Fq 'qq-relay installed client is unavailable at' "$work/missing-client.err"

if QQ_RELAY_INSTALL_ROOT=relative "$root/bin/qq-relay" inspect '{}' \
  >"$work/relative-cli.out" 2>"$work/relative-cli.err"; then
  echo "bin/qq-relay accepted a relative install root" >&2
  exit 1
fi
grep -Fq 'QQ_RELAY_INSTALL_ROOT must be an absolute path' "$work/relative-cli.err"
if QQ_RELAY_INSTALL_ROOT=relative node --input-type=module \
  -e 'await import(process.argv[1])' "$root/bin/lib/qq-relay-client.mjs" \
  >"$work/relative-client.out" 2>"$work/relative-client.err"; then
  echo "qq-relay client loader accepted a relative install root" >&2
  exit 1
fi
grep -Fq 'qq-relay installed client root is invalid: QQ_RELAY_INSTALL_ROOT must be an absolute path' \
  "$work/relative-client.err"

if HOME="$work/default-home" env -u QQ_RELAY_INSTALL_ROOT \
  "$root/bin/qq-relay" inspect '{}' \
  >"$work/default-cli.out" 2>"$work/default-cli.err"; then
  echo "bin/qq-relay found an unexpected default-root artifact" >&2
  exit 1
fi
grep -Fq "$work/default-home/.local/lib/qq/relay/bin/qq-relay" "$work/default-cli.err"

node --experimental-strip-types "$root/tests/test-agent-messages.mjs" "$root"
"$root/tests/test-agent-messages-live.sh"
node --experimental-strip-types "$root/tests/test-delegation.mjs" "$root"
node --experimental-strip-types "$root/tests/test-review-flow.mjs" "$root"

printf 'test-qq-relay: pass\n'
