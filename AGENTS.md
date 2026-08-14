<!-- OPENWIKI:START -->

## OpenWiki

This repository's generated evidence index is published on the orphan branch `openwiki`, with the wiki files at that branch's root. It is optional just-in-time context, not required startup reading; `main` remains source-only.

- Treat source code, documentation, and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

A local systemd timer refreshes the publication branch. Generated OpenWiki pages must not be hand-edited; update the authoritative source/docs/code and let OpenWiki regenerate.

<!-- OPENWIKI:END -->
