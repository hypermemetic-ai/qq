#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
toolchain="$root/dsh"
npm ci --prefix "$toolchain" --no-audit --no-fund >/dev/null

# The launcher collects its own directory's siblings, so this suite builds a
# scratch launcher tree whose present plugin directories are the scenario under
# test. Symlinking the real packages and toolchain keeps the boot honest (real
# bin/qq, real package trees, real pinned DSH) without mutating the repository.
sim=$(mktemp -d "${TMPDIR:-/tmp}/qq-host-boot.XXXXXX")
dsh_pid=
cleanup() {
  if [[ -n ${dsh_pid:-} ]]; then
    kill "$dsh_pid" 2>/dev/null || true
    wait "$dsh_pid" 2>/dev/null || true
  fi
  rm -rf -- "$sim"
}
trap cleanup EXIT

mkdir -p "$sim/bin" "$sim/home" "$sim/config"
cp "$root/bin/qq" "$sim/bin/qq"
ln -s "$toolchain" "$sim/dsh"
ln -s "$root/qq" "$sim/qq"

port=$(node -e '
  const server = require("node:net").createServer()
  server.listen(0, "127.0.0.1", () => {
    console.log(server.address().port)
    server.close()
  })
')

stop_host() {
  kill "$dsh_pid" 2>/dev/null || true
  wait "$dsh_pid" 2>/dev/null || true
  dsh_pid=
}

boot() {
  local name=$1
  local state="$sim/$name-state"
  local exec_line="qq: qwen-token-plan/deepseek-v4-pro-0813 · session-63a11000-0000-4000-8000-0000000000aa"
  env \
    HOME="$sim/home" \
    XDG_CONFIG_HOME="$sim/config" \
    DSH_HOME="$state" \
    DSH_TELEMETRY_DISABLED=1 \
    QWEN_TOKEN_PLAN_API_KEY=qq-host-boot-probe \
    QQ_PORT="$port" \
    QQ_DSH_SESSION_ID=session-63a11000-0000-4000-8000-0000000000aa \
    "$sim/bin/qq" >"$sim/$name.stdout.log" 2>"$sim/$name.stderr.log" &
  dsh_pid=$!
  for _ in {1..400}; do
    if ! kill -0 "$dsh_pid" 2>/dev/null; then
      cat "$sim/$name.stdout.log" >&2
      cat "$sim/$name.stderr.log" >&2
      echo "test-qq-host-boot: $name host exited during startup" >&2
      exit 1
    fi
    grep -Fq "$exec_line" "$sim/$name.stderr.log" 2>/dev/null && break
    sleep 0.05
  done
  grep -Fq "$exec_line" "$sim/$name.stderr.log" || {
    cat "$sim/$name.stdout.log" >&2
    cat "$sim/$name.stderr.log" >&2
    echo "test-qq-host-boot: $name host never reached the pinned DSH exec" >&2
    exit 1
  }
  [[ -f $state/profiles/qq/package.json ]] || {
    cat "$sim/$name.stdout.log" >&2
    cat "$sim/$name.stderr.log" >&2
    echo "test-qq-host-boot: $name profile was not prepared" >&2
    exit 1
  }
  sleep 1
  if ! kill -0 "$dsh_pid" 2>/dev/null; then
    cat "$sim/$name.stdout.log" >&2
    cat "$sim/$name.stderr.log" >&2
    echo "test-qq-host-boot: $name host exited after the boot line" >&2
    exit 1
  fi
}

# A host with only the qq session plugin boots: prepare skips every absent
# sibling and the qq entry in host.patch.yml stays enabled.
boot only-qq
node - "$sim/only-qq-state/profiles/qq/package.json" "$sim/qq" <<'NODE'
const [manifestPath, qqPath] = process.argv.slice(2);
const manifest = require(manifestPath);
const deps = manifest.dependencies ?? {};
const linked = (name, path) => deps[name] === `link:${path}` || deps[name] === `file:${path}`;
if (!linked("@hypermemetic-ai/qq", qqPath)) {
  throw new Error(`qq profile is missing qq: ${deps["@hypermemetic-ai/qq"]}`);
}
for (const name of ["@hypermemetic-ai/qq-ui", "@hypermemetic-ai/qq-relay", "@hypermemetic-ai/qq-workflows"]) {
  if (deps[name] !== undefined) throw new Error(`qq profile unexpectedly binds ${name}: ${deps[name]}`);
}
NODE
stop_host

# With qq-ui and qq-relay present but qq-workflows absent the host still boots
# and serves the HTTP console; the workflows attach entry is skipped.
ln -s "$root/qq-ui" "$sim/qq-ui"
ln -s "$root/qq-relay" "$sim/qq-relay"
boot no-workflows
for _ in {1..200}; do
  if curl -fsS --max-time 2 "http://127.0.0.1:$port/qq/" >"$sim/no-workflows.page.html" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$dsh_pid" 2>/dev/null; then
    cat "$sim/no-workflows.stdout.log" >&2
    cat "$sim/no-workflows.stderr.log" >&2
    echo "test-qq-host-boot: no-workflows host exited before the console was ready" >&2
    exit 1
  fi
  sleep 0.05
done
grep -Fq 'id="console-stream"' "$sim/no-workflows.page.html"
node - "$sim/no-workflows-state/profiles/qq/package.json" "$sim/qq" "$sim/qq-ui" "$sim/qq-relay" <<'NODE'
const [manifestPath, qqPath, uiPath, relayPath] = process.argv.slice(2);
const manifest = require(manifestPath);
const deps = manifest.dependencies ?? {};
const linked = (name, path) => deps[name] === `link:${path}` || deps[name] === `file:${path}`;
for (const [name, path] of [
  ["@hypermemetic-ai/qq", qqPath],
  ["@hypermemetic-ai/qq-ui", uiPath],
  ["@hypermemetic-ai/qq-relay", relayPath],
]) {
  if (!linked(name, path)) throw new Error(`qq profile is missing ${name}: ${deps[name]}`);
}
if (deps["@hypermemetic-ai/qq-workflows"] !== undefined) {
  throw new Error(`qq profile unexpectedly binds qq-workflows: ${deps["@hypermemetic-ai/qq-workflows"]}`);
}
NODE
stop_host

printf 'test-qq-host-boot: pass\n'