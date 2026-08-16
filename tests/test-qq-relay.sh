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
contract_source=${QQ_RELAY_SOURCE:-$QQ_RELAY_LANDED_REPOSITORY}
if [[ -d "$contract_source/.git" ]] \
  && git -C "$contract_source" cat-file -e "$QQ_RELAY_UPSTREAM_REF^{commit}" 2>/dev/null; then
  git clone -q --no-hardlinks --no-checkout "$contract_source" "$work/source"
else
  git init -q -b qq-relay-contract "$work/source"
  git -C "$work/source" remote add origin "$QQ_RELAY_UPSTREAM_URL"
  git -C "$work/source" fetch -q origin \
    "$QQ_RELAY_UPSTREAM_REF:$QQ_RELAY_UPSTREAM_REF"
fi
relay_tip=$(git -C "$work/source" rev-parse "$QQ_RELAY_UPSTREAM_REF^{commit}")
git -C "$work/source" checkout -q --detach "$relay_tip"
[[ -x "$work/source/bin/qq-relay" ]]
[[ -f "$work/source/client.mjs" ]]
[[ -z $(git -C "$work/source" status --porcelain) ]]

export QQ_RELAY_SOURCE="$work/source"
node "$root/tests/test-qq-relay-client.mjs" "$root" "$QQ_RELAY_SOURCE"

if QQ_RELAY_SOURCE="$work/missing" "$root/bin/qq-relay" inspect '{}' \
  >"$work/missing-cli.out" 2>"$work/missing-cli.err"; then
  echo "bin/qq-relay accepted a missing linked source" >&2
  exit 1
fi
grep -Fq 'qq-relay: linked source executable is unavailable:' "$work/missing-cli.err"
if QQ_RELAY_SOURCE="$work/missing" node --input-type=module \
  -e 'await import(process.argv[1])' "$root/bin/lib/qq-relay-client.mjs" \
  >"$work/missing-client.out" 2>"$work/missing-client.err"; then
  echo "qq-relay client loader accepted a missing linked source" >&2
  exit 1
fi
grep -Fq 'qq-relay linked client is unavailable at' "$work/missing-client.err"

node --experimental-strip-types "$root/tests/test-agent-messages.mjs" "$root"
"$root/tests/test-agent-messages-live.sh"
node --experimental-strip-types "$root/tests/test-delegation.mjs" "$root"
node --experimental-strip-types "$root/tests/test-review-flow.mjs" "$root"

printf 'test-qq-relay: pass\n'
