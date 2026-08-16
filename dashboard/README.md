# qq Dashboard integration

qq-dashboard owns its public source, checks, installation, and upgrades at <https://github.com/hypermemetic-ai/qq-dashboard>. qq records only the stable `refs/heads/main` source relation in `upstream.env`; it does not vendor or pin dashboard source and stores no product commit, tag, version, or capability floor.

Use qq-dashboard's product-owned workflow from a clean landed `main` checkout:

```sh
cd /home/qqp/projects/qq-dashboard
git switch main
git pull --ff-only
npm test
./install.sh
```

The default artifact is `${HOME}/.local/lib/qq/dashboard`. An operator or isolated test may install to an explicit absolute root with `QQ_DASHBOARD_INSTALL_ROOT=/absolute/path ./install.sh`. Follow the product README for complete check, installation, and upgrade instructions. qq never fetches or installs the dashboard at runtime, and there is no dashboard daemon or service lifecycle.

qq exposes only the stable installed command surfaces:

```text
bin/qq-dashboard [--once]
bin/qq-dashboard-cookies refresh
bin/qq-dashboard-cookies status
bin/qq-dashboard-cookies validate
```

Both launchers execute only `${QQ_DASHBOARD_INSTALL_ROOT:-$HOME/.local/lib/qq/dashboard}/bin/...`; they never execute the landed repository, search `PATH`, or fall back to an npm package. `bin/qq-dashboard` supplies qq's exact `bin/qq-profile` path, and the product reads execution profiles only through `qq-profile list --json`. Profile policy and validation remain owned by qq.

Installation and upgrades preserve existing state in `~/.local/state/qq/telemetry/`, including non-secret usage caches and the mode-0600 Qwen cookie snapshot. Do not migrate or delete that directory during a dashboard cutover.

The landed repository is for product work and semantic contract evidence. `tests/test-dashboard.sh` fetches the configured public branch tip, exercises the qq-profile JSON and cookie command contracts, installs into a private temporary root, removes the fetched source checkout, and runs both qq launchers against only that installed artifact. The test does not compare commit ancestry or read installed provenance, and it never accesses the operator's dashboard installation or telemetry state.
