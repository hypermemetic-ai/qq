#!/bin/bash
# block-dangerous-git.sh — Claude Code PreToolUse(Bash) hook.
#
# qq rail: allows normal `git push` so agents can ship, but blocks the
# genuinely destructive operations — force-push, reset --hard, clean -f,
# branch -D, `checkout .` / `restore .`, remote branch deletion
# (push --delete / push :branch), reflog expire, update-ref -d, and
# history rewrites.
#
# Argv-aware (task-3): the command line is tokenized shell-style and only
# actual git invocations are inspected, so a command that merely *mentions*
# a dangerous phrase in quoted prose — a commit message, a search pattern,
# an --instructions argument — is not blocked. Wrapper commands (sudo, env,
# timeout, xargs, …) and `sh -c '…'` strings are followed. A line that
# cannot be tokenized falls back to conservative whole-line matching:
# false positives possible there, false negatives not.
#
# Modified from mattpocock/skills `git-guardrails-claude-code` (MIT): the
# upstream version blocked ALL pushes and pattern-matched the whole line;
# qq narrows that to force-pushes and matches the actual git argv.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

RAIL_COMMAND="$COMMAND" python3 - <<'PY'
import os, re, shlex, sys

COMMAND = os.environ.get("RAIL_COMMAND", "") or ""

SUFFIX = ("The qq rail allows normal 'git push' but blocks force-push, "
          "reset --hard, clean -f, branch -D, checkout/restore ., remote "
          "branch deletion, reflog expire, update-ref -d, and history rewrites.")

def block(reason):
    sys.stderr.write("BLOCKED: %s in: '%s'. %s\n" % (reason, COMMAND, SUFFIX))
    sys.exit(2)

# ---------------------------------------------------------------- tokenizing
PUNCT = "();<>|&`\n"

def tokenize(text):
    lex = shlex.shlex(text, posix=True, punctuation_chars=PUNCT)
    lex.whitespace = " \t\r"        # newline separates commands, not words
    lex.whitespace_split = True
    return list(lex)

def simple_commands(tokens):
    """Split a token stream into simple commands at shell operators."""
    seg = []
    for t in tokens:
        if t and all(c in PUNCT for c in t):
            if seg:
                yield seg
            seg = []
        else:
            seg.append(t)
    if seg:
        yield seg

def read_word(text, i):
    buf, quoted = [], False
    while i < len(text):
        c = text[i]
        if c in " \t\r\n;|&<>":
            break
        if c == "'":
            quoted = True
            i += 1
            while i < len(text) and text[i] != "'":
                buf.append(text[i])
                i += 1
            if i < len(text):
                i += 1
        elif c == '"':
            quoted = True
            i += 1
            while i < len(text) and text[i] != '"':
                if text[i] == "\\" and i + 1 < len(text):
                    i += 1
                buf.append(text[i])
                i += 1
            if i < len(text):
                i += 1
        elif c == "\\":
            quoted = True
            i += 1
            if i < len(text):
                buf.append(text[i])
                i += 1
        else:
            buf.append(c)
            i += 1
    return "".join(buf), quoted, i

def heredocs_in_line(line):
    docs = []
    i, in_single, in_double = 0, False, False
    while i < len(line):
        c = line[i]
        if c == "\\" and not in_single:
            i += 2
            continue
        if c == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if c == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue
        if not in_single and not in_double and line.startswith("<<<", i):
            i += 3
            continue
        if not in_single and not in_double and line.startswith("<<", i):
            j = i + 2
            strip_tabs = False
            if j < len(line) and line[j] == "-":
                strip_tabs = True
                j += 1
            while j < len(line) and line[j] in " \t":
                j += 1
            delim, quoted, j = read_word(line, j)
            if delim:
                docs.append((delim, not quoted, strip_tabs))
            i = j
            continue
        i += 1
    return docs

def without_heredoc_bodies(text):
    kept, expandable, pending = [], [], []
    for line in text.splitlines(True):
        if pending:
            delim, expands, strip_tabs = pending[0]
            body = line[:-1] if line.endswith("\n") else line
            marker = body.lstrip("\t") if strip_tabs else body
            if marker == delim:
                pending.pop(0)
            elif expands:
                expandable.append(line)
            continue
        kept.append(line)
        pending.extend(heredocs_in_line(line))
    return "".join(kept), "".join(expandable)

def extract_dollar_paren(text, start):
    i, level = start + 2, 1
    in_single, in_double = False, False
    while i < len(text):
        c = text[i]
        if c == "\\" and not in_single:
            i += 2
            continue
        if c == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if c == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue
        if not in_single and text.startswith("$(", i):
            level += 1
            i += 2
            continue
        if not in_single and c == "(":
            level += 1
            i += 1
            continue
        if not in_single and c == ")":
            level -= 1
            if level == 0:
                return text[start + 2:i], i + 1
        i += 1
    return None, len(text)

def extract_backticks(text, start):
    i, buf = start + 1, []
    while i < len(text):
        c = text[i]
        if c == "\\" and i + 1 < len(text):
            buf.append(text[i + 1])
            i += 2
            continue
        if c == "`":
            return "".join(buf), i + 1
        buf.append(c)
        i += 1
    return None, len(text)

def scan_command_substitutions(text, depth, single_quotes_protect=True):
    if depth > 8:
        return
    i, in_single, in_double = 0, False, False
    while i < len(text):
        c = text[i]
        if c == "\\" and not in_single:
            i += 2
            continue
        if single_quotes_protect and c == "'" and not in_double:
            in_single = not in_single
            i += 1
            continue
        if c == '"' and not in_single:
            in_double = not in_double
            i += 1
            continue
        if not in_single and text.startswith("$((", i):
            i += 3
            continue
        if not in_single and text.startswith("$(", i):
            inner, end = extract_dollar_paren(text, i)
            if inner is not None:
                analyze_string(inner, depth + 1)
            i = end
            continue
        if not in_single and c == "`":
            inner, end = extract_backticks(text, i)
            if inner is not None:
                analyze_string(inner, depth + 1)
            i = end
            continue
        i += 1

# ------------------------------------------------------------------ analysis
WRAPPERS = {"sudo", "doas", "env", "command", "nohup", "nice", "time",
            "timeout", "stdbuf", "xargs"}
SHELLS = {"sh", "bash", "zsh", "dash", "ksh"}
GIT_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace",
                  "--exec-path", "--super-prefix"}
ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")

SUDO_VALUE_OPTS = {"-u", "--user", "-g", "--group", "-h", "--host", "-p",
                   "--prompt", "-C", "--close-from", "-T", "--command-timeout",
                   "--chdir", "--role", "--type", "--login-class"}
ENV_VALUE_OPTS = {"-u", "--unset", "-C", "--chdir", "-S", "--split-string",
                  "--argv0"}
TIMEOUT_VALUE_OPTS = {"-s", "--signal", "-k", "--kill-after"}
XARGS_VALUE_OPTS = {"-a", "--arg-file", "-d", "--delimiter", "-E", "--eof",
                    "-I", "--replace", "-L", "--max-lines", "-n", "--max-args",
                    "-P", "--max-procs", "-s", "--max-chars"}
STDBUF_VALUE_OPTS = {"-i", "--input", "-o", "--output", "-e", "--error"}
TIME_VALUE_OPTS = {"-f", "--format", "-o", "--output"}
SHELL_VALUE_OPTS = {"-o", "+o", "-O", "+O", "--rcfile", "--init-file"}

def base(tok):
    return tok.rsplit("/", 1)[-1]

def is_assignment(tok):
    return ASSIGNMENT_RE.match(tok) is not None

def option_matches(tok, names):
    return any(tok == name or tok.startswith(name + "=") for name in names)

def skip_options(seg, j, value_opts, allow_assignments=False):
    while j < len(seg):
        t = seg[j]
        if t == "--":
            return j + 1
        if allow_assignments and is_assignment(t):
            j += 1
            continue
        if option_matches(t, value_opts):
            j += 1 if "=" in t else 2
            continue
        if t.startswith("-") and t != "-":
            j += 1
            continue
        break
    return j

def wrapped_command_start(cmd, seg, j):
    if cmd in ("sudo", "doas"):
        return skip_options(seg, j, SUDO_VALUE_OPTS)
    if cmd == "env":
        return skip_options(seg, j, ENV_VALUE_OPTS, allow_assignments=True)
    if cmd == "timeout":
        j = skip_options(seg, j, TIMEOUT_VALUE_OPTS)
        return j + 1 if j < len(seg) else j
    if cmd == "xargs":
        return skip_options(seg, j, XARGS_VALUE_OPTS)
    if cmd == "stdbuf":
        return skip_options(seg, j, STDBUF_VALUE_OPTS)
    if cmd == "nice":
        if j < len(seg) and seg[j] == "-n":
            j += 2
        elif j < len(seg) and re.match(r"^-\d+$", seg[j]):
            j += 1
        return j
    if cmd == "time":
        return skip_options(seg, j, TIME_VALUE_OPTS)
    if cmd == "command":
        lookup_only = False
        while j < len(seg):
            t = seg[j]
            if t == "--":
                j += 1
                break
            if not t.startswith("-") or t == "-":
                break
            if re.match(r"^-[A-Za-z]+$", t) and ("v" in t[1:] or "V" in t[1:]):
                lookup_only = True
            j += 1
        return None if lookup_only else j
    return j

def long_flag(args, name):
    for t in args:
        if t == "--":
            break
        if t == name or t.startswith(name + "-") or t.startswith(name + "="):
            return True
    return False

def short_flag(args, ch):
    for t in args:
        if t == "--":
            break
        if re.match(r"^-[A-Za-z]+$", t) and ch in t[1:]:
            return True
    return False

def shell_c_string(seg, j):
    while j < len(seg):
        t = seg[j]
        if t == "--":
            return None
        if t == "-c" or re.match(r"^-[A-Za-z]*c[A-Za-z]*$", t):
            return seg[j + 1] if j + 1 < len(seg) else None
        if option_matches(t, SHELL_VALUE_OPTS):
            j += 1 if "=" in t else 2
            continue
        if t.startswith("-") and t != "-":
            j += 1
            continue
        return None
    return None

def analyze_submodule(args, depth):
    i = 0
    while i < len(args):
        if args[i] == "--":
            i += 1
            break
        if args[i].startswith("-") and args[i] != "-":
            i += 1
            continue
        break
    if i >= len(args) or args[i] != "foreach":
        return
    i += 1
    while i < len(args):
        if args[i] == "--":
            i += 1
            break
        if args[i].startswith("-") and args[i] != "-":
            i += 1
            continue
        break
    if i < len(args):
        analyze_string(" ".join(args[i:]), depth + 1)

def analyze_git(args, depth):
    i, sub = 0, None
    while i < len(args):                 # skip git global options
        t = args[i]
        if t in GIT_VALUE_OPTS:
            i += 2
            continue
        if t.startswith("-"):
            i += 1
            continue
        sub = t
        i += 1
        break
    if sub is None:
        return
    rest = args[i:]
    if sub == "push":
        if long_flag(rest, "--force") or short_flag(rest, "f"):
            block("'git push --force' (force-push)")
        if long_flag(rest, "--mirror"):
            block("'git push --mirror' (force-push)")
        if long_flag(rest, "--delete") or short_flag(rest, "d"):
            block("'git push --delete' (remote branch deletion)")
        for t in rest:
            if t.startswith(":") and len(t) > 1:
                block("'git push :<branch>' (remote branch deletion)")
            if t.startswith("+") and len(t) > 1:
                block("'git push +<refspec>' (force-push)")
    elif sub == "reset" and long_flag(rest, "--hard"):
        block("'git reset --hard' (destroys uncommitted work)")
    elif sub == "clean" and (long_flag(rest, "--force") or short_flag(rest, "f")):
        block("'git clean -f' (deletes untracked files)")
    elif sub == "branch" and (short_flag(rest, "D") or
                              (long_flag(rest, "--delete") and long_flag(rest, "--force"))):
        block("'git branch -D' (force branch deletion)")
    elif sub in ("checkout", "restore") and any(t in (".", "./") for t in rest):
        block("'git %s .' (discards all working-tree changes)" % sub)
    elif sub in ("filter-branch", "filter-repo"):
        block("'git %s' (history rewrite)" % sub)
    elif sub == "reflog" and rest[:1] == ["expire"]:
        block("'git reflog expire' (destroys recovery state)")
    elif sub == "update-ref" and (short_flag(rest, "d") or long_flag(rest, "--delete")):
        block("'git update-ref -d' (ref deletion)")
    elif sub == "submodule":
        analyze_submodule(rest, depth)

def analyze(seg, depth):
    if depth > 8 or not seg:
        return
    i = 0
    while i < len(seg) and is_assignment(seg[i]):
        i += 1                           # skip VAR=val prefixes
    if i >= len(seg):
        return
    cmd = base(seg[i])
    if cmd == "git":
        analyze_git(seg[i + 1:], depth)
    elif cmd in ("git-filter-branch", "git-filter-repo"):
        block("'%s' (history rewrite)" % cmd)
    elif cmd in SHELLS:
        command_string = shell_c_string(seg, i + 1)
        if command_string is not None:
            analyze_string(command_string, depth + 1)
    elif cmd in WRAPPERS:
        j = wrapped_command_start(cmd, seg, i + 1)
        if j is not None and j < len(seg):
            analyze(seg[j:], depth + 1)

def analyze_string(text, depth=0):
    bodyless, expandable_heredocs = without_heredoc_bodies(text)
    scan_command_substitutions(bodyless, depth)
    scan_command_substitutions(expandable_heredocs, depth, single_quotes_protect=False)
    for seg in simple_commands(tokenize(bodyless)):
        analyze(seg, depth)

# ------------------------------------------------- conservative fallback
# Used only when the line cannot be tokenized (unbalanced quotes, …):
# the pre-task-3 whole-line patterns plus the task-3 additions.
FALLBACK = [
    r"push\s.*--force", r"push\s([^&|;]*\s)?-f(\s|$)", r"push\s.*--mirror",
    r"push\s.*--delete", r"reset --hard", r"git clean\s.*-f",
    r"git branch -D", r"git checkout\s+\.", r"git restore\s+\.",
    r"filter-branch", r"filter-repo", r"reflog expire", r"update-ref -d",
]

try:
    analyze_string(COMMAND)
except SystemExit:
    raise
except Exception:
    for pat in FALLBACK:
        if re.search(pat, COMMAND):
            block("unparseable command line; conservative match on /%s/" % pat)
sys.exit(0)
PY
