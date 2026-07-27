#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2016,SC2034
set -euo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TEST_NAME="test-qq-openwiki-merge"
# shellcheck source=tests/helpers.sh
source "$TESTS_DIR/helpers.sh"
ROOT="$(cd "$TESTS_DIR/.." && pwd -P)"
MERGE="$ROOT/bin/qq-openwiki-merge"
scratch="$ROOT/.test-qq-openwiki-merge"
rm -rf "$scratch"
mkdir -p "$scratch"
tmp="$(TMPDIR="$scratch" mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
repo="$tmp/repo"
remote="$tmp/remote.git"
real_git="$(command -v git)"
"$real_git" init -q --bare "$remote"
"$real_git" clone -q "$remote" "$repo"
"$real_git" -C "$repo" switch -qc main
"$real_git" -C "$repo" config user.name Test
"$real_git" -C "$repo" config user.email test@example.com
mkdir -p "$repo/openwiki"
printf '# Instructions\n' >"$repo/openwiki/INSTRUCTIONS.md"
printf '# Old\n' >"$repo/openwiki/quickstart.md"
"$real_git" -C "$repo" add .
"$real_git" -C "$repo" commit -qm base
"$real_git" -C "$repo" push -qu origin main
base="$($real_git -C "$repo" rev-parse HEAD)"
"$real_git" -C "$repo" switch -qc openwiki/update
printf '# New\n' >"$repo/openwiki/quickstart.md"
"$real_git" -C "$repo" commit -qam generated
head="$($real_git -C "$repo" rev-parse HEAD)"
"$real_git" -C "$repo" push -qu origin openwiki/update

fake_git="$tmp/git"
cat >"$fake_git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [ "${FAKE_REMOTE_WRONG:-}" = 1 ]; then
  for ((i=1; i<=$#; i++)); do
    j=$((i + 1))
    if [ "${!i}" = remote ] && [ "${!j:-}" = get-url ]; then
      printf '%s\n' 'https://github.com/example/wrong.git'
      exit 0
    fi
  done
fi
for ((i=1; i<=$#; i++)); do
  j=$((i + 1))
  if [ "${!i}" = remote ] && [ "${!j:-}" = get-url ]; then
    printf '%s\n' 'https://github.com/hypermemetic-ai/qq.git'
    exit 0
  fi
done
exec "$REAL_GIT" "$@"
SH
# Bash indirect arithmetic above is intentionally exercised before the real Git fallback.
chmod +x "$fake_git"
export QQ_GIT_BIN="$fake_git" REAL_GIT="$real_git"

graph="$tmp/graph.json"
second_graph="$tmp/second-graph.json"
graph_count="$tmp/graph.count"
gh_log="$tmp/gh.log"
make_graph() {
  jq -cn --arg base "$base" --arg head "$head" '
    {data:{repository:{nameWithOwner:"hypermemetic-ai/qq",pullRequest:{
      number:17,state:"OPEN",isDraft:false,isCrossRepository:false,
      baseRefName:"main",baseRefOid:$base,
      headRefName:"openwiki/update",headRefOid:$head,
      headRepository:{nameWithOwner:"hypermemetic-ai/qq"},
      mergeable:"MERGEABLE",mergeStateStatus:"CLEAN",
      files:{totalCount:1,pageInfo:{hasNextPage:false},nodes:[{path:"openwiki/quickstart.md"}]},
      reviewThreads:{totalCount:1,pageInfo:{hasNextPage:false},nodes:[{isResolved:true}]},
      commits:{totalCount:1,pageInfo:{hasNextPage:false},nodes:[{commit:{oid:$head,
        statusCheckRollup:{state:"SUCCESS",contexts:{totalCount:2,pageInfo:{hasNextPage:false},nodes:[
          {__typename:"CheckRun",name:"shell-tests",status:"COMPLETED",conclusion:"SUCCESS"},
          {__typename:"StatusContext",context:"docs",state:"SUCCESS"}
        ]}}
      }}]}
    }}}}
  ' >"$graph"
}
make_graph

fake_gh="$tmp/gh"
cat >"$fake_gh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$FAKE_GH_LOG"
case "${1:-} ${2:-}" in
  'auth token')
    printf '%s\n' fake-bot-token
    ;;
  'api user')
    printf '%s\n' "${FAKE_BOT_LOGIN:-qqp-bot}"
    ;;
  'api graphql')
    count=0
    [ ! -f "$FAKE_GRAPH_COUNT" ] || count="$(cat "$FAKE_GRAPH_COUNT")"
    count=$((count + 1))
    printf '%s' "$count" >"$FAKE_GRAPH_COUNT"
    if [ "$count" -ge 2 ] && [ -s "$FAKE_SECOND_GRAPH" ]; then
      cat "$FAKE_SECOND_GRAPH"
    else
      cat "$FAKE_GRAPH"
    fi
    ;;
  'api --method')
    tree="$(git -C "$FAKE_REPO" rev-parse "$FAKE_HEAD^{tree}")"
    current="$(git --git-dir="$FAKE_REMOTE" rev-parse refs/heads/main)"
    merge="$(GIT_AUTHOR_NAME=Bot GIT_AUTHOR_EMAIL=bot@example.com GIT_COMMITTER_NAME=Bot GIT_COMMITTER_EMAIL=bot@example.com \
      git -C "$FAKE_REPO" commit-tree "$tree" -p "$current" -p "$FAKE_HEAD" -m 'Merge OpenWiki')"
    git -C "$FAKE_REPO" push -q origin "$merge:refs/heads/main"
    if [ "${FAKE_POST_MERGE_ADVANCE:-}" = 1 ]; then
      advanced="$(GIT_AUTHOR_NAME=Test GIT_AUTHOR_EMAIL=test@example.com GIT_COMMITTER_NAME=Test GIT_COMMITTER_EMAIL=test@example.com \
        git -C "$FAKE_REPO" commit-tree "$tree" -p "$merge" -m 'Concurrent main advance')"
      git -C "$FAKE_REPO" push -q origin "$advanced:refs/heads/main"
    fi
    jq -cn --arg sha "$merge" '{merged:true,sha:$sha,message:"merged"}'
    ;;
  *)
    printf 'unexpected gh invocation: %s\n' "$*" >&2
    exit 64
    ;;
esac
SH
chmod +x "$fake_gh"
export QQ_GH_BIN="$fake_gh" FAKE_GH_LOG="$gh_log" FAKE_GRAPH="$graph"
export FAKE_SECOND_GRAPH="$second_graph" FAKE_GRAPH_COUNT="$graph_count"
export FAKE_REPO="$repo" FAKE_REMOTE="$remote" FAKE_HEAD="$head"
export QQ_OPENWIKI_SCHEDULED=1
export XDG_RUNTIME_DIR="$tmp/runtime"
receipt_run="$XDG_RUNTIME_DIR/qq-openwiki-daily/run.merge"
mkdir -p "$receipt_run"
export QQ_OPENWIKI_COMPLETION_RECEIPT="$receipt_run/completion"

reset_fake() {
  : >"$gh_log"
  : >"$second_graph"
  rm -f "$graph_count" "$QQ_OPENWIKI_COMPLETION_RECEIPT"
  unset FAKE_BOT_LOGIN FAKE_REMOTE_WRONG FAKE_POST_MERGE_ADVANCE
  make_graph
}
refuse() {
  local needle="$1"; shift
  if (cd "$repo" && "$MERGE" "$@" >"$tmp/refuse.out" 2>"$tmp/refuse.err"); then
    fail "merge unexpectedly accepted: $needle"
  fi
  assert_file_contains "$tmp/refuse.err" "$needle"
}
refuse_before_credential() {
  local needle="$1"; shift
  refuse "$needle" "$@"
  if grep -Fq 'auth token' "$gh_log"; then
    fail "credential loaded before refusal: $needle"
  fi
}

reset_fake
env -u QQ_OPENWIKI_SCHEDULED bash -c 'cd "$1" && "$2" 17 --reviewed-head "$3"' _ "$repo" "$MERGE" "$head" \
  >"$tmp/marker.out" 2>"$tmp/marker.err" && fail 'ordinary invocation unexpectedly succeeded'
assert_file_contains "$tmp/marker.err" 'refusing outside the scheduled OpenWiki service environment'
reset_fake
refuse_before_credential 'reviewed head must be an exact lowercase 40-hex object id' 17 --reviewed-head abc
reset_fake
FAKE_REMOTE_WRONG=1 refuse_before_credential 'origin does not resolve to hypermemetic-ai/qq' 17 --reviewed-head "$head"

for mutation in \
  '.data.repository.pullRequest.state="CLOSED"' \
  '.data.repository.pullRequest.isDraft=true' \
  '.data.repository.pullRequest.isCrossRepository=true' \
  '.data.repository.pullRequest.baseRefName="develop"' \
  '.data.repository.pullRequest.headRefName="other"' \
  '.data.repository.pullRequest.headRefOid="0000000000000000000000000000000000000000"' \
  '.data.repository.pullRequest.commits.totalCount=2' \
  '.data.repository.pullRequest.files.nodes[0].path="README.md"' \
  '.data.repository.pullRequest.files.nodes[0].path="openwiki/generated.sh"' \
  '.data.repository.pullRequest.files.nodes[0].path="openwiki/INSTRUCTIONS.md"' \
  '.data.repository.pullRequest.reviewThreads.nodes[0].isResolved=false' \
  '.data.repository.pullRequest.mergeable="CONFLICTING"' \
  '.data.repository.pullRequest.mergeStateStatus="DIRTY"' \
  '.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].status="IN_PROGRESS"' \
  '.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].conclusion="FAILURE"' \
  '.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[0].name="other"' \
  '.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[1].state="PENDING"' \
  '.data.repository.pullRequest.files.pageInfo.hasNextPage=true'; do
  reset_fake
  jq "$mutation" "$graph" >"$graph.next" && mv "$graph.next" "$graph"
  refuse_before_credential 'metadata, review threads, or exact-head Checks did not pass' 17 --reviewed-head "$head"
done

reset_fake
jq '.data.repository.pullRequest.baseRefOid="0000000000000000000000000000000000000000"' "$graph" >"$graph.next" && mv "$graph.next" "$graph"
refuse_before_credential 'pull request base is not fresh origin/main' 17 --reviewed-head "$head"

# A symlink under openwiki is not a generated regular-file candidate.
"$real_git" -C "$repo" reset -q --hard "$base"
ln -s target "$repo/openwiki/link.md"
"$real_git" -C "$repo" add openwiki/link.md
"$real_git" -C "$repo" commit -qm symlink
symlink_head="$($real_git -C "$repo" rev-parse HEAD)"
"$real_git" -C "$repo" push -qf origin HEAD:openwiki/update
head="$symlink_head"; FAKE_HEAD="$head"; export FAKE_HEAD
reset_fake
jq '.data.repository.pullRequest.files.nodes[0].path="openwiki/link.md"' "$graph" >"$graph.next" && mv "$graph.next" "$graph"
refuse_before_credential 'changed entry is not a non-executable regular file' 17 --reviewed-head "$head"

# Restore the reviewed regular candidate.
"$real_git" -C "$repo" reset -q --hard "$base"
printf '# New\n' >"$repo/openwiki/quickstart.md"
"$real_git" -C "$repo" add openwiki/quickstart.md
"$real_git" -C "$repo" commit -qm generated
head="$($real_git -C "$repo" rev-parse HEAD)"
"$real_git" -C "$repo" push -qf origin HEAD:openwiki/update
FAKE_HEAD="$head"; export FAKE_HEAD

reset_fake
FAKE_BOT_LOGIN=qqp-dev refuse 'merge credential identity is not exactly qqp-bot' 17 --reviewed-head "$head"
assert_file_not_matches "$gh_log" 'pulls/17/merge'

reset_fake
jq '.data.repository.pullRequest.headRefOid="0000000000000000000000000000000000000000"' "$graph" >"$second_graph"
refuse 'pull-request evidence changed after credential selection' 17 --reviewed-head "$head"
assert_file_not_matches "$gh_log" 'pulls/17/merge'

reset_fake
FAKE_POST_MERGE_ADVANCE=1 refuse \
  'post-merge main advanced; the next daily assessment must repair freshness' \
  17 --reviewed-head "$head"
assert_file_contains "$gh_log" 'pulls/17/merge'
test ! -e "$QQ_OPENWIKI_COMPLETION_RECEIPT" \
  || fail 'final-race refusal wrote a successful completion receipt'
"$real_git" -C "$repo" push -qf origin \
  "$base:refs/heads/main" "$head:refs/heads/openwiki/update"

reset_fake
if (cd "$repo" && "$MERGE" 17 --reviewed-head "$head" >/dev/full 2>"$tmp/full.err"); then
  fail 'guarded merge accepted a failed status-stream write'
fi
test ! -e "$QQ_OPENWIKI_COMPLETION_RECEIPT" \
  || fail 'failed merge status write left a successful receipt'
"$real_git" -C "$repo" push -qf origin \
  "$base:refs/heads/main" "$head:refs/heads/openwiki/update"

reset_fake
(cd "$repo" && "$MERGE" 17 --reviewed-head "$head" >"$tmp/success.out" 2>"$tmp/success.err")
assert_file_contains "$tmp/success.out" 'qq-openwiki-merge: recording merged pull request 17 at'
assert_file_contains "$gh_log" 'auth token --hostname github.com --user qqp-bot'
assert_file_contains "$gh_log" 'api user --jq .login'
assert_file_contains "$gh_log" 'pulls/17/merge'
assert_file_contains "$gh_log" "sha=$head"
assert_file_not_matches "$gh_log" 'auto-merge|auth switch'
merge_sha="$(git --git-dir="$remote" rev-parse refs/heads/main)"
assert_equal "merged:$head:$merge_sha" "$(cat "$QQ_OPENWIKI_COMPLETION_RECEIPT")"
assert_equal 600 "$(stat -c '%a' "$QQ_OPENWIKI_COMPLETION_RECEIPT")"

printf 'test-qq-openwiki-merge: pass\n'
