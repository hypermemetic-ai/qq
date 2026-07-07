# Concepts

Durable domain vocabulary for this system. Each entry is a term and its precise,
project-specific meaning. Appended by `ce-compound` as concepts stabilize; read by
agents to speak the same language across sessions.

<!-- entries: `**term** — one-line definition grounded in this codebase.` -->

**background-status surface** — The shared `.qq/state.json` progress file plus
Claude Code status-line reader that lets long-running qq work show ambient phase
and gate progress without transcript chatter.

**qq-phase** — The `bin/qq-phase` command that writes background-work phase state,
renders the one-line status widget, and optionally attaches the active
`no-mistakes` gate run.
