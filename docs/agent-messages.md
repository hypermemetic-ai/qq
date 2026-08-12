# Agent messages

`extensions/agent-messages.ts` gives messaging-enabled Pi sessions three agent
tool actions over the machine-local Event Plane:

- `list` returns live agents across projects;
- `send` durably sends to an `agent_id` using `default` or `immediate` delivery;
- `status` reports queued, delivering, delivered, blocked, expired, or failed.

An immediate message interrupts the recipient's current run and is injected as
steering input. A default message waits as a follow-up when the recipient is
busy.

## Session registration

Trusted projects configure their default registration in
`.pi/agent-messages.json`:

```json
{
  "project": "qq",
  "role": "architect"
}
```

The globally mounted QQ extension auto-loads this configuration. Environment
variables may override it for a particular launch:

- `QQ_AGENT_PROJECT` overrides the project.
- `QQ_AGENT_ROLE` overrides the role.
- `QQ_AGENT_TICKET` supplies the initial work-item label.
- `HERDR_PANE_ID` is published as optional location metadata.

The session derives an `agent_id` from project, role, and Pi session ID. The ID
lasts for that live session and disambiguates sessions with the same project and
role. Presence is renewed every 15 seconds and expires after 45 seconds.

Use `/agent-ticket <label>` to update the live work-item label, or
`/agent-ticket` to clear it.

## Event Plane

Start the service separately:

```sh
bin/event-plane serve
```

It stores state under `$XDG_STATE_HOME/qq/event-plane`, or
`~/.local/state/qq/event-plane`. Publication, subscriptions, and replay remain
available through the core clients and administrative CLI, but are not exposed
as model-facing agent actions.
