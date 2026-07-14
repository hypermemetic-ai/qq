---
name: agent-messaging
description: Coordinates directly with other live agents through herdr, including finding, starting, messaging, waiting for, and cleaning up temporary delegates. Use when work needs another agent's state, output, or attention.
---

# Message agents through herdr

herdr names every agent session and exposes it to the others. `herdr agent
list` shows who is live, `herdr agent get <name>` inspects one, `herdr agent
read <name>` reads its pane, and `herdr agent wait <name> --status idle` blocks
until its current turn finishes.

## Temporary delegates

When another Skill calls for a temporary delegate, resolve the owning pane's
live workspace and tab ids and start the delegate with:

```sh
herdr agent start <name> --workspace <id> --tab <owning-tab-id> --cwd <path> --split right --no-focus -- <argv...>
```

Use a unique name. Keep the complete brief in an OS temporary file and make the
runtime prompt in `<argv...>` a short pointer to it. Confirm the returned pane
shares the owning workspace and tab, is a right split, did not take focus, and
reports a new agent session before sending work. Read its progress or final result with
`herdr agent read <name>` after `herdr agent wait <name> --status idle`; retain
the pane through any required follow-up. The owner then closes it with `herdr
pane close <pane-id>` and verifies that it no longer resolves. Report cleanup
failure, and never close the accountable or an operator-created pane.

Message text is literal: escape sequences such as `\n` render as characters,
not formatting, so send prompts as clean single-line text. Use `herdr agent
send <target> "<message>"` only when the text should remain unsubmitted. To send
a prompt as a turn, use `herdr pane run <pane-id> "<message>"`; it sends the
text and Enter in one request. Do not compose a turn from separate send and key
calls.

Identify every inter-agent turn as `AGENT from=<terminal-id>: <message>`. Read
the sender's current `terminal_id` from `herdr pane current --current`; do not
use inherited `HERDR_PANE_ID` or `HERDR_WORKSPACE_ID` values because they can be
stale after pane movement.

On receipt, verify the source with `herdr agent get <terminal-id>`. When a reply
is needed, resolve its current `.result.agent.pane_id`, then send the reply with
`herdr pane run` and the same envelope containing your own current terminal ID.
Never leave an inter-agent reply only in the receiving agent's transcript. If
the source no longer resolves, report that the reply is unrouteable instead of
guessing a destination.

No correlation IDs or acknowledgement protocol exists. Coordinate when it
helps; skip the ceremony when it does not.
