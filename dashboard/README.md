# qq Dashboard integration

qq pins the private `@hypermemetic-ai/qq-dashboard` package to an immutable release commit in `package.json` and `package-lock.json`. Install qq's dependencies with `npm install`, then use the qq-owned launchers:

```text
bin/qq-dashboard [--once]
bin/qq-dashboard-cookies refresh
bin/qq-dashboard-cookies status
bin/qq-dashboard-cookies validate
```

The launchers execute only the installed package binaries under qq's `node_modules`; they do not search `PATH` or use a sibling checkout. `bin/qq-dashboard` supplies qq's exact `bin/qq-profile` path, and the dependency reads execution profiles only through `qq-profile list --json`. Profile policy and validation remain owned by qq.

Dashboard extraction deliberately preserves existing state in `~/.local/state/qq/telemetry/`, including non-secret usage caches and the Qwen cookie snapshot. Do not migrate or delete that directory when installing or upgrading the dependency.

To upgrade, validate a tagged dashboard release in its own repository, replace the dependency commit with that release's exact commit, regenerate the lockfile, and verify both launcher `--help` commands from a checkout with no sibling dashboard repository.
