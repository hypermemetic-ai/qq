# `@hypermemetic-ai/qq`

Presentation-neutral Cordis service over DSH Agents and sessions. This package
owns list, read, create, prompt, interrupt, status/change observation, and the
live session number book. It contains no HTML, routes, CSS, htmx, or browser
assumptions.

Live sessions wear a short number (`1 2 3 4 9 10 12 20 40 80`, then strange,
then integers above 100). The book is schema `qq.alias/v1`, persisted at
`.qq-aliases.json` beside `DSH_HOME` (`aliasFile` overrides), mode `0600`,
written atomically. A leftover `.qq-relay-aliases.json` is read once and
migrated onto the new path. `list` / `read` include `alias` only while the
session is live. The UUID stays the identity; the number is the face.

## Host recipe

The product qq is this service plus whichever sibling qq plugins are present
on disk (`qq-ui`, `qq-relay`, `qq-workflows`, later tasks/wiki/dictation the
same way). qq expects them and loads even when any is absent: missing `qq-ui`
means no HTTP console, missing `qq-relay` means no mailbox, missing
`qq-workflows` means no `/workflows`. The session service itself still loads.

`qq/host.patch.yml` is the attach recipe — webserver, model, `compact-basic`
`auto: false`, plugin ids, injects — not a second product. `bin/qq` applies it
as a `--patch` overlay over the pinned `dsh-base` bundle and binds each sibling
whose tree is on disk. `@hypermemetic-ai/qq` does **not** npm-depend on
`qq-ui`/`qq-relay`/`qq-workflows`; the start script binds them.

Run from anywhere in the repository:

```bash
export QWEN_TOKEN_PLAN_API_KEY='...'
bin/qq
```

The launcher uses DSH profile `qq`, defaults `DSH_HOME` to
`${XDG_STATE_HOME:-$HOME/.local/state}/qq` (honoring `QQ_DSH_HOME` then
`DSH_HOME`), and stores the default resume id in `$DSH_HOME/qq.session`.
The console serves `http://127.0.0.1:3082/qq`.