# pi-intercom 0.6.0 single-flight patch

Pi loads pi-intercom 0.6.0 directly from `index.ts`; this package has no compiled
artifact to rebuild. The patch makes outbound asks single-flight and directs a
plain `send` to `reply` while an inbound ask is unresolved.

A package install or upgrade replaces the patched file. After every pi-intercom
install or upgrade, re-apply and verify the Repository-carried patch before
reloading Pi:

```bash
bin/qq-patch-apply check
bin/qq-patch-apply apply
bin/qq-patch-apply check
```

`apply` first verifies the package version, patch digest, and complete pristine
file hashes. It refuses a drifted installation rather than forcing hunks. Relaunch
Pi or run `/reload` only after `check` reports `pi-intercom@0.6.0: applied`.
