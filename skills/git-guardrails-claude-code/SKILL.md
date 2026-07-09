---
name: git-guardrails-claude-code
description: Set up Claude Code hooks to block dangerous git commands (force-push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prevent destructive git operations, add git safety hooks, or block force-push/reset in Claude Code.
---

# Setup Git Guardrails

Sets up a PreToolUse hook that intercepts and blocks dangerous git commands before Claude executes them.

## What Gets Blocked

- force-push: `git push --force` / `-f` / `--force-with-lease` / `--mirror` / `+refspec`
  (plain `git push` is allowed — qq's modification; upstream blocked all pushes)
- remote branch deletion: `git push --delete` / `-d` / `--prune` / `:branch`
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`
- `git reflog expire`, `git update-ref -d`
- history rewrites: `filter-branch`, `filter-repo`

Matching is argv-aware: the command line is tokenized and only actual git
invocations are inspected (including through wrappers like `sudo`/`timeout`/
`xargs`, `sh -c` strings, compound commands, and `git -C <path>`), so a command
that merely *mentions* a dangerous phrase in quoted prose — a commit message, a
search pattern, an `--instructions` argument — is not blocked. Unparseable lines
fall back to conservative whole-line matching, failing safe.

Scope limit: this is a Claude Code `PreToolUse` hook, so it inspects the Bash
command Claude is about to run. It follows inline shell strings in that command,
but it does not inspect git commands that an invoked script performs internally;
review script rollback paths separately (TASK-23).

When blocked, Claude sees a message telling it that it does not have authority to access these commands.

## Steps

### 1. Ask scope

Ask the user: install for **this project only** (`.claude/settings.json`) or **all projects** (`~/.claude/settings.json`)?

### 2. Copy the hook script

The bundled script is at: [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh)

Copy it to the target location based on scope:

- **Project**: `.claude/hooks/block-dangerous-git.sh`
- **Global**: `~/.claude/hooks/block-dangerous-git.sh`

Make it executable with `chmod +x`.

### 3. Add hook to settings

Add to the appropriate settings file:

**Project** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

**Global** (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/block-dangerous-git.sh"
          }
        ]
      }
    ]
  }
}
```

If the settings file already exists, merge the hook into existing `hooks.PreToolUse` array — don't overwrite other settings.

### 4. Ask about customization

Ask if user wants to add or remove any patterns from the blocked list. Edit the copied script accordingly.

### 5. Verify

Run the bundled case table (150 block/allow cases):

```bash
bash scripts/test-block-dangerous-git.sh
```

Or a quick manual check:

```bash
echo '{"tool_input":{"command":"git reset --hard"}}' | <path-to-script>
```

Should exit with code 2 and print a BLOCKED message to stderr, while
`git push origin main` should exit 0 (allowed).
