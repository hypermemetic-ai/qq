---
name: agent-messaging
description: Coordinates live agents across runtimes through herdr messaging and raises operator-visible notifications. Use when work needs another live agent's state, output, or attention, or when the operator must notice an event outside any transcript.
---

# Message agents through herdr

herdr carries what the harness does not: coordination between live agents
across runtimes, and notifications the operator sees outside any transcript.
Delegated work itself runs on harness- or vendor-native runners with their own
access control; this skill does not start, own, or retire agents.

## Coordinate live agents

herdr names every agent session and exposes it to the others. `herdr agent
list` shows who is live, `herdr agent get <name>` inspects one, `herdr agent
read <name>` reads its pane, and `herdr agent wait <name> --status idle` blocks
until its current turn finishes.

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

## Notify the operator

For an event the operator must notice without watching a transcript — a pull
request ready for disposition, a blocked gate — raise a desktop notification:

```sh
herdr notification show "<title>" --body "<body>" --sound <sound>
```

Keep the title short, put the actionable value such as a URL in the body, and
reserve a sound for events that ask the operator to act.
