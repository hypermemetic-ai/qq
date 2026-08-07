---
name: agent-messaging
description: Coordinates live agents through pi-intercom's plain one-way send flow and raises operator-visible herdr notifications. Use only after durable facts and relevant Pi transcripts fail to supply a necessary fact, or when a fact must reach another live agent, or when the operator must notice an event outside any transcript.
---

# Message agents through pi-intercom

pi-intercom is qq's incumbent transport; its bundled skill documents raw
mechanics. This overlay narrows agent behavior while the deterministic
replacement remains production-inactive. It does not start, own, or retire
agents, and it does not make a messaging role real.

## Self-service first

Before messaging anyone, inspect durable Task/source/Check records directly.
When useful, read the relevant Pi session transcript as evidence. Do not use
Intercom for questions, curiosity, status checks, investigations, or
request/reply cycles when durable facts can answer the question.

## Escalate only through the named Coordinator

If self-service still leaves you blocked, or you hold a fact another agent
must receive, send one plain nonblocking message to the live Product
Coordinator explicitly named by the operator:

```text
intercom({ action: "send", to: "<named-coordinator>", message: "AGENT from=<id>: <fact or needed fact>" })
```

Name sessions uniquely and use your current session name from
`intercom({ action: "list" })` as `<id>`. Do not contact another agent
directly.

## Coordinator's one bounded broker exchange

The Coordinator self-services first. If another live agent must be consulted,
it may broker exactly one exchange using only plain one-way sends:

1. one request to the relevant agent;
2. one factual return from that agent to the Coordinator; and
3. one forwarded result from the Coordinator to the original agent.

If no named Coordinator is live, the Coordinator is absent or ambiguous, or
that bounded exchange does not resolve the issue, report the blocker through
your owning workflow.

## Never do these

- Do not use intercom `ask` or `reply`.
- Do not send direct lateral requests between non-Coordinator agents.
- Do not send status checks, curiosity probes, acknowledgement demands, or
  repeated follow-ups.
- Do not broadcast, nominate a substitute Coordinator, or start another
  request after the one bounded exchange.
- Do not claim the Event Plane adapter is active in production, remove
  pi-intercom, or change its package/patch.

## Notify the operator

Herdr remains the operator-notification surface. For an event the operator
must notice outside a transcript:

```sh
herdr notification show "<title>" --body "<body>" --sound <sound>
```

Keep the title short, put actionable detail in the body, and use sound only
when asking the operator to act.
