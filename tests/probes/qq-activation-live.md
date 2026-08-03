# Private-runtime qq activation live probe

Run this only after the Change is on primary `main`. It creates two temporary,
no-focus Herdr tabs (qq plus a second Product), starts stock interactive Pi in
each, publishes one synthetic compatible activation request, and verifies that
the post-reload watcher—not a stale shared watcher—reported the exact loaded
resource fingerprint.

1. From primary qq `main`, choose a path that does not exist. `prepare` refuses
   the default runtime, symlinks, wrong modes, and every reused/spent path. Eval
   its output **before creating a tab, watcher, controller, run, or Pi child**:

   ```bash
   umask 077
   runtime="${XDG_RUNTIME_DIR:-/tmp}/qq-activation-live-$(date -u +%Y%m%dT%H%M%SZ)-$$"
   test ! -e "$runtime"
   eval "$(bin/qq-activation-probe prepare "$runtime")"
   bin/qq-activation-probe validate "$runtime"
   ```

2. Resolve the existing qq and second-Product workspace IDs. Create one
   temporary tab in each with `--no-focus`, passing all three already-exported
   probe variables into the new shell. Record the returned tab and root-pane
   IDs; do not use `herdr ... focus`.

   ```bash
   qq_workspace=<qq-workspace-id>
   other_workspace=<second-product-workspace-id>
   qq_root=/absolute/path/to/qq-primary-main
   other_root=/absolute/path/to/second-product-root

   qq_created="$(herdr tab create --workspace "$qq_workspace" --cwd "$qq_root" \
     --label qq-activation-live-qq --no-focus \
     --env "QQ_DISPATCH_RUNTIME_ROOT=$QQ_DISPATCH_RUNTIME_ROOT" \
     --env "QQ_ACTIVATION_PROBE_ID=$QQ_ACTIVATION_PROBE_ID" \
     --env "QQ_ACTIVATION_EXPECTED_WATCHER_VERSION=$QQ_ACTIVATION_EXPECTED_WATCHER_VERSION")"
   other_created="$(herdr tab create --workspace "$other_workspace" --cwd "$other_root" \
     --label qq-activation-live-other --no-focus \
     --env "QQ_DISPATCH_RUNTIME_ROOT=$QQ_DISPATCH_RUNTIME_ROOT" \
     --env "QQ_ACTIVATION_PROBE_ID=$QQ_ACTIVATION_PROBE_ID" \
     --env "QQ_ACTIVATION_EXPECTED_WATCHER_VERSION=$QQ_ACTIVATION_EXPECTED_WATCHER_VERSION")"

   qq_tab="$(jq -er '.result.tab.tab_id' <<<"$qq_created")"
   qq_pane="$(jq -er '.result.root_pane.pane_id' <<<"$qq_created")"
   other_tab="$(jq -er '.result.tab.tab_id' <<<"$other_created")"
   other_pane="$(jq -er '.result.root_pane.pane_id' <<<"$other_created")"
   herdr agent start qq-activation-live-qq --kind pi --pane "$qq_pane"
   herdr agent start qq-activation-live-other --kind pi --pane "$other_pane"
   ```

3. Publish only to those exact validated pane/session identities. The command
   refuses absent, duplicate, noninteractive, malformed, or contradictory Herdr
   targets. It sends no prompt, types no editor text, and changes no focus.

   ```bash
   bin/qq-activation-probe request "$QQ_DISPATCH_RUNTIME_ROOT" \
     --repo "$qq_root" --pane "$qq_pane" --pane "$other_pane"
   ```

4. Wait for both sessions to settle. Verification requires at least two exact
   activation receipts and two watcher records whose expected source/package
   version, running post-reload version, session identity, and loaded resource
   fingerprint agree. A stale watcher cannot satisfy this check.

   ```bash
   bin/qq-activation-probe verify "$QQ_DISPATCH_RUNTIME_ROOT" --minimum 2 \
     | tee "$QQ_DISPATCH_RUNTIME_ROOT/verified.json"
   ```

5. After preserving the JSON evidence, close only the two exact temporary tabs:

   ```bash
   herdr tab close "$qq_tab"
   herdr tab close "$other_tab"
   ```

For the one-time bootstrap after this Change lands, existing sessions predate
the watcher and therefore cannot discover the land request. The accountable
owner reloads each pre-existing targeted Pi once. The newly loaded watcher then
derives the current fingerprint from primary `main`, consumes the still-visible
land request, and performs/proves its one automatic follow-up activation. Later
compatible Changes need no bootstrap.
