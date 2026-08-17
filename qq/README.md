# `@hypermemetic-ai/qq`

Presentation-neutral Cordis service over DSH Agents and sessions. This package
owns list, read, create, prompt, interrupt, and status/change observation. It
contains no HTML, routes, CSS, htmx, or browser assumptions.

The same-host workbench composes this service through [`../dsh-console`](../dsh-console).
Extracting it later is a package move; the public `qq` service name and methods stay.
