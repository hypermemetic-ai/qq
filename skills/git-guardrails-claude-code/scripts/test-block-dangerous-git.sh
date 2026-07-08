#!/bin/bash
# test-block-dangerous-git.sh — case table for the qq git rail.
# Feeds each command through the hook exactly as Claude Code would (PreToolUse
# JSON on stdin) and asserts block (exit 2) or allow (exit 0).
set -u
HOOK="$(dirname "$0")/block-dangerous-git.sh"
pass=0; fail=0

check() { # check <block|allow> <command>
  local want="$1" cmd="$2" rc
  jq -n --arg c "$cmd" '{tool_input:{command:$c}}' | "$HOOK" >/dev/null 2>&1
  rc=$?
  if { [ "$want" = block ] && [ "$rc" -eq 2 ]; } || { [ "$want" = allow ] && [ "$rc" -eq 0 ]; }; then
    pass=$((pass+1))
  else
    fail=$((fail+1)); echo "FAIL [$want, got rc=$rc]: $cmd"
  fi
}

# --- destructive: must block ------------------------------------------------
check block 'git push --force origin main'
check block 'git push -f'
check block 'git push --force-with-lease origin main'
check block 'git push origin +main'
check block 'git push --mirror backup'
check block 'git push origin --delete feature-x'
check block 'git push origin :feature-x'
check block 'git push -d origin feature-x'
check block 'git push --prune origin'
check block 'git push --prune=origin'
check block 'git reset --hard HEAD~1'
check block 'git reset --hard'
check block 'git clean -fd'
check block 'git clean --force'
check block 'git branch -D feature'
check block 'git branch -d -f feature'
check block 'git branch -df feature'
check block 'git branch --delete -f feature'
check block 'git checkout .'
check block 'git checkout -- .'
check block 'git restore .'
check block "git filter-branch --tree-filter 'rm -f secrets' HEAD"
check block 'git filter-repo --path x'
check block 'git reflog expire --expire=now --all'
check block 'git update-ref -d refs/wip/main'
# reached through compound commands, wrappers, shells, global opts
check block 'cd /repo && git reset --hard'
check block 'echo hi; git clean -fd'
check block 'git status
git reset --hard'
check block '>/tmp/log git reset --hard'
check block 'git reset 2>/tmp/log --hard'
check block 'cat < <(git reset --hard)'
check block 'printf x > >(git clean -fd)'
check block 'bash -c "git push --force"'
check block "sh -lc 'git reset --hard'"
check block "sh -c'git reset --hard'"
check block "bash -lc'git push --delete origin x'"
check block "bash <<< 'git reset --hard'"
check block "sh -s <<< 'git clean -fd'"
check block "sudo sh -c 'git reset --hard'"
check block "env bash -c 'git push --force'"
check block "env -S 'git reset --hard'"
check block "env --split-string='git reset --hard'"
check block "env -iS 'git reset --hard'"
check block 'env -uSOME git reset --hard'
check block "env -S 'FOO=bar git reset' --hard"
check block 'timeout 5 git reset --hard'
check block "timeout 5 bash -c 'git push --delete origin feature-x'"
check block 'sudo git clean -fd'
check block 'xargs git branch -D < branches.txt'
check block "xargs sh -c 'git update-ref -d refs/wip/main'"
check block 'find . -exec git reset --hard \;'
check block 'git -C /some/repo reset --hard'
check block "git -c alias.nuke='!git reset --hard' nuke"
check block "git -c alias.nuke='reset --hard' nuke"
check block "git -c alias.wipe=reset wipe --hard"
check block "git -c alias.wipe='!git reset' wipe --hard"
check block "git -c alias.a=b -c alias.b='reset --hard' a"
check block 'GIT_DIR=/x/.git git reset --hard'
check block "echo \$(git reset --hard)"
check block "echo \"\$(git reset --hard)\""
check block "git commit -m \"\$(git clean -fd)\""
check block "echo \"\`git reset --hard\`\""
check block "bash -o pipefail -c 'git reset --hard'"
check block "bash -O extglob -c 'git reset --hard'"
check block "git submodule foreach 'git reset --hard'"
check block "git submodule foreach --recursive 'git clean -fd'"
check block "git submodule foreach git reset --hard"
check block "sh -c 'if true; then git reset --hard; fi'"
check block '{ git clean -fd; }'
check block '! git reset --hard'
check block 'exec git reset --hard'
check block "eval 'git reset --hard'"
check block "builtin eval 'git reset --hard'"
check block "trap 'git clean -fd' EXIT"
check block "sh -c 'function f { git reset --hard; }; f'"
check block "sh -c 'f() { git clean -fd; }; f'"
check block "bash <<'EOF'
git reset --hard
EOF"
check block "bash <<'EOF'
git reset --hard"
check block 'sh -s <<EOF
git clean -fd
EOF'
check block 'cat <<EOF | bash
git reset --hard
EOF'
check block "env -S 'bash' <<'EOF'
git reset --hard
EOF"
check block 'echo "<<EOF"; bash <<EOF
git reset --hard
EOF'
check block "cat <<EOF
\$(git reset --hard)
EOF"
check block 'cat <<EOF
git status
EOF
git reset --hard'

# --- benign: must allow (incl. observed false positives) ---------------------
check allow 'git push'
check allow 'git push origin main'
check allow 'git push origin main > push.log 2>&1'
check allow 'git push no-mistakes feature'
check allow 'git push -u origin my-branch'
check allow 'git -c user.name=x commit --allow-empty -m ok'
check allow 'git -c core.editor=vim commit'
check allow 'git commit -m "rail: block reset --hard and branch -D"'
check allow "rg 'reset --hard' docs/"
check allow 'rg -l "block-dangerous-git|reset --hard" skills/ bin/'
check allow 'no-mistakes axi respond --action fix --instructions "the rail should also block git push --delete and reset --hard"'
check allow 'git reset --soft HEAD~1'
check allow 'git reset HEAD~1'
check allow 'git branch -d merged-branch'
check allow 'git branch --delete merged-branch'
check allow 'git checkout main'
check allow 'git checkout -b new-branch'
check allow 'git checkout ./specific-file.txt'
check allow 'git clean -n'
check allow 'git restore --staged file.txt'
check allow 'git reflog'
check allow 'git update-ref refs/wip/b abc123 def456'
check allow 'echo "git push --force"'
check allow 'echo "<(git reset --hard)"'
check allow "cat <<< 'git reset --hard'"
check allow "bash 3<<< 'git reset --hard'"
check allow 'sudo echo "git reset --hard"'
check allow "env -S 'echo git reset --hard'"
check allow "xargs echo git reset --hard"
check allow 'command -v git reset --hard'
check allow "git -c alias.note='!echo git reset --hard' note"
check allow "printf 'git reset --hard\\n' > notes.md"
check allow 'diff <(git show main:f) <(git show dev:f)'
check allow "find . -name '*.md' -exec grep -l 'reset --hard' {} \;"
check allow "rg '\$(git reset --hard)' docs/"
check allow "rg '\`git reset --hard\`' docs/"
check allow "git log --grep 'filter-branch'"
check allow 'git push origin HEAD:refs/heads/feature'
check allow "bash -c 'git commit -m \"mentions reset --hard\"'"
check allow "bash script.sh -c 'git reset --hard'"
check allow "bash -c -e 'git reset --hard'"
check allow "cat <<'EOF'
git reset --hard
EOF"
check allow 'cat <<EOF
git reset --hard
EOF'
check allow "cat <<EOF; bash -c 'true'
git reset --hard
EOF"
check allow 'echo "<<EOF"; cat <<EOF
git reset --hard
EOF'
check allow "cat <<'EOF'
\$(git reset --hard)
EOF"
# unparseable line, no dangerous substring → fallback allows
check allow 'echo "unclosed quote'
# unparseable line WITH dangerous substring → fallback blocks (fails safe)
check block 'echo "git reset --hard'

echo "----"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
