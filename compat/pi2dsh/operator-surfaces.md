# Community DSH operator surfaces

Status: source audit, community requirements evidence, and one qq-owned sequential vertical slice; observed 2026-08-16. No package was installed into the active qq profile and no operator-runtime cutover is approved.

## T-63.11 implemented sequential slice

The selected first slice is now qq-owned [`../../dsh-console`](../../dsh-console), not a community Web plugin and not stock DSH Web. One loopback DSH/Cordis host serves one operator page in use at a time. Home, laptop, and phone connect sequentially and select the same canonical DSH `session-<UUID>`; the ordered event log and DSH persistence reconstruct the transcript after each disconnect and host restart.

The topology simplification is a usage convention. The implementation adds no controller lease, observer mode, presence, client cookie, fanout coordination, simultaneous-writer enforcement, shared draft, synchronized scroll/dialog state, or second database. Each active page's SSE request independently re-reads its selected DSH Agent/Session. Session selection, Send, live status/transcript, and Interrupt remain DSH-backed server controls.

Exact local htmx 2.0.10 and official SSE extension 2.2.4 are active. `#console-stream` owns the EventSource and `#session-panel` is its stable target; SSE and mutation responses replace only target children. Real Chromium proof retained both node identities through two Send swaps and the subsequent Interrupt flow, submitted an Interrupt form newly inserted by SSE without `htmx.process`, and reconnected after forced stream closure. The same proof selected a second canonical session, escaped executable markup, and measured no horizontal overflow at 390×844.

The restored minimal PWA is installable but never authoritative: its cache contains exact versioned presentation assets plus the disconnected shell only. Session pages, fragments, transcript data, SSE, Send, and Interrupt remain network-only. With the host stopped, navigation showed **DSH is unavailable** and offline POST rejected rather than queuing. See [`WEB_QA.md`](WEB_QA.md), [`web-evidence.json`](web-evidence.json), and [`../../dsh-console/evidence.json`](../../dsh-console/evidence.json).

This passes the sequential vertical-slice proof only. Loopback forwarding still needs independent authentication, no physical phone is claimed, and existing qq/pi2dsh cutover blockers remain.

## Scope and pinned boundary

This survey compares non-official terminal and browser surfaces against keyboard use, customization, desktop/phone access, multi-device continuity, and safe self-hosting. It complements the separate stock-Web runtime proof; it does not repeat that proof or prescribe a shared tunnel.

The compatibility target remains [`@deepseek-ai/dsh@0.1.0-rc.6` at `47f9438`](pins.json) and [`pi2dsh@0.12.3` at `7420aac`](pins.json). Candidate source claims were checked at the immutable revisions named below. npm `latest` metadata was also checked so a repository README was not mistaken for a published package.

Three pinned constraints determine the ranking:

1. The SDK wire is a small, pre-release, newline-delimited JSON-RPC protocol: `initialize`, `session/prompt`, `shutdown`, and event/status/subagent notifications. It has no version negotiation, prompt cancel, session close, approval request, session list, or per-prompt result ([pinned protocol](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/sdk/protocol/README.md)). A client advertising more is using host services or a private extension, not only the stock SDK contract.
2. The pinned Web command explicitly refuses `--host 0.0.0.0` because that would expose remote code execution ([startup source](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/bundle/web-app/src/startup.ts#L55-L75)). Its Host/Origin fence is a reachability policy, **not authentication**, and privileged methods remain loopback-only ([connection contract](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/connection/README.md), [privileged check](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/client/connection/src/index.ts#L130-L169)). A plugin that merely overrides the bind row does not make Web safe to publish.
3. The existing pi2dsh proof is a headless compatibility proof, not a TUI/browser proof. It already records qq's tool collision, missing model route, non-firing shortcut/tree events, absorbed shutdown, and Pi-specific cutover blockers ([local findings](README.md#observed-facts)). Every candidate still needs an isolated profile composition with pi2dsh; none removes those blockers.

The completed T-63.9 baseline at commit `67cb86b` is now the before comparison in [`WEB_QA.md`](WEB_QA.md) and [`web-evidence.json`](web-evidence.json): pinned stock Web passed desktop layout, Cordis/settings customization, loopback-only SSH-forward two-client continuity, and the all-interfaces refusal, but its replacement verdict was **REJECT**. Keyboard operation remained basic Tab/Enter/Shift+Enter/Escape with no efficient global command surface, while 390×844 failed because two-column Settings clipped and an open sidebar squeezed the transcript.

## Focused Web augmentation follow-up

T-63.10 ran only the selected rank-1 experiment in a disposable DSH Web profile: exact `@0xsline/dsh-spotlight@0.0.2` plus exact `dsh-web-mobile-fix@1.0.2`. Installing just those artifacts did not boot because DSH profile generation disables automatic peer installation and Spotlight imports undeclared-at-runtime `schemastery`; exact `cordis@4.0.0-rc.7` and `schemastery@3.18.0` from Spotlight's own source lock were therefore required as plain support dependencies.

With that explicit peer composition, the candidate **passed the focused before/after experiment, not adoption**:

- Ctrl+K plus filtering/Enter opened a new stock session, a persisted recent session, native Search with textbox focus, native Settings on Plugins, and both sidebar states. There is no direct General-settings result, and DOM-discovered actions retain selector-drift risk.
- At exactly 390×844, Settings became a 390×844 column dialog with a 390px non-horizontally-clipped content region and vertically reachable General controls. Its four-tab row measured 366/429px and therefore scrolls horizontally. The 280px sidebar floated over a fixed `56px 334px 0px` grid, preserving a 334px conversation instead of squeezing it; this is an overlay, not the README's literal full-screen description.
- A second clean browser origin traversed an actual loopback `ssh -L`, listed the first client's workspace/session, and loaded its persisted two-line prompt. The candidate-composed `0.0.0.0` launch still exited 1 without a listener. DSH remained the only session implementation.

The CSS overlay still proves no touch, soft keyboard, IME, approval/question, long-transcript, or physical-phone behavior. Neither plugin adds authentication. The active [`execution-profiles.json`](execution-profiles.json) and operator surface were unchanged.

## Ranking

Ranked for the pinned qq/DSH composition and the concrete T-63.9 gaps, not for general popularity:

| Rank | Candidate | Pin fit | Operator fit | Disposition |
|---:|---|---|---|---|
| 1 | [`dsh-spotlight`](https://github.com/0xsline/dsh-spotlight/tree/dd7ef5ed160aa1a624559de16eafd4ea9406d7ed) + [`dsh-web-mobile-fix`](https://github.com/AcidGr/dsh-web-mobile-fix/tree/015d905b5f9196b5d442878e5682d8aaa598aa3f) | Reversible Web client plugins; exact pin proof passed with explicit Spotlight peers | Closed the focused keyboard and narrow-layout baselines while inheriting stock session and loopback security boundaries | **Proof-only pass; no adoption** |
| 2 | [`ccch1mneyyy/dsh-TUI`](https://github.com/ccch1mneyyy/dsh-TUI/tree/7dc694150123ae42903e9618427dea631711cb21) / npm `@deepseek-harness-tui/dsh-tui@0.7.3` | Direct Cordis/DSH services; published peers name rc.6 | Strongest documented keyboard, session, approval, theme, and extension surface, but phone access is transport-only | Best terminal-first alternative if rank 1 fails or Web is rejected categorically |
| 3 | [`XMoon/dsh-pi-tui`](https://github.com/XMoon/dsh-pi-tui/tree/0ba964cc95046be949211777f11edad6d14675fe) / npm `@xmoon76/dsh-pi-tui@0.1.4` | Direct services; published peers name rc.6 | Strong keyboard/session coverage and the clearest cross-process corruption guard; phone access is transport-only | Keep as guarded TUI fallback |
| 4 | [`openma-ai/deepseek-harness-tui`](https://github.com/openma-ai/deepseek-harness-tui/tree/90ce0e86d798399eb79c817b10465ff91aaacce8) / npm `@openma/deepseek-harness-tui@0.2.1` | Claims rc.6; wraps host services in an SDK-compatible bridge plus private `tui/*` methods | Good native TUI and useful protocol reference, but stock-SDK mode is materially narrower | Do not prove before ranks 1–3 |
| Blocked | [`dsh-remote-web-ui`](https://github.com/zhu1090093659/dsh-web-ui/tree/f57b766a50f262cd459ac228fb8e4a26d990066d/packages/dsh-remote-web-ui) / npm `@linxin666/dsh-remote-web-ui@0.1.19` | Its own contract names seams absent from `47f9438` | Best phone-specific design and pairing model in the survey | Port first; no runtime proof against the pin yet |

All audited community packages are extremely young. Their repositories were created or substantially developed during 2026-08-12 through 2026-08-14 and all had a commit within three days of this observation. “Active” below means current work, not a demonstrated maintenance history.

## Candidate audits

The detailed audits keep the three TUI implementations together; runtime priority remains the ranking above.

### 2. dsh-TUI — best terminal proof target

Primary evidence: [README and key map](https://github.com/ccch1mneyyy/dsh-TUI/blob/7dc694150123ae42903e9618427dea631711cb21/README_EN.md), [architecture/security limits](https://github.com/ccch1mneyyy/dsh-TUI/blob/7dc694150123ae42903e9618427dea631711cb21/docs/architecture.en.md), [configuration](https://github.com/ccch1mneyyy/dsh-TUI/blob/7dc694150123ae42903e9618427dea631711cb21/docs/configuration.en.md), and [published manifest](https://registry.npmjs.org/@deepseek-harness-tui%2fdsh-tui/latest).

- **Protocol and sessions:** This is an in-process Cordis profile plugin, not an SDK subprocess client. DSH owns agents, tools, `session/event`, fork/resume/compaction, and JSONL persistence. Profile mode shares `$DSH_HOME/sessions` with other DSH profiles. `/resume`, `/new`, search, export, rewind-by-fork, workspaces, queued input, approval, and questions are documented. Model changes fork because DSH has no in-place model switch.
- **Keyboard and mobile:** The documented map includes send/newline, steer/follow-up/interrupt, readline editing, history and transcript search, file completion, external editor, message selection, approval/question panels, mouse, and macOS extended-key handling. This is strong desktop terminal evidence. There is **no phone terminal, soft-keyboard, touch, or mobile modifier evidence**; SSH from a phone would add a separate terminal transport and input layer.
- **Customization:** A user Cordis patch can override the TUI row; custom JSON themes hot-swap; command-registry entries join the slash menu; structural workspace providers can add URI schemes and commands; the package exports workspace, command-tree, scene, and settings-section seams. This is the broadest documented customization surface.
- **Continuity:** Sequential continuity is native DSH history: stop the TUI and resume the same persisted session from another DSH profile. It does not document safe simultaneous writers. The pinned session layer has no cross-process coordinator, so two processes must not write the same session concurrently unless a later proof establishes a guard.
- **Authentication/exposure:** The plugin opens no remote service; access is the local TTY and OS account (or the SSH layer chosen by the operator). The TUI is not a sandbox. Its own security notes say effective policy comes from the mounted DSH services and that the current Windows composition uses `danger-full-access`/`never`; profile patches, MCP, shell, filesystem, and presets must be treated as code-execution surfaces.
- **Maintenance:** Public beta, MIT, npm 0.7.3 with provenance metadata, active at the audited revision. CI uses fake services/headless rendering; the project explicitly says it has no credentialed full-flow automated suite. That missing target-runtime evidence is why a proof is warranted rather than adoption.
- **qq integration work:** Create an isolated rc.6 profile, pin this exact npm tarball/integrity, layer pi2dsh and qq, retain the existing `tool-fs` collision workaround, supply an allowed model route, and exercise approval/questions/session persistence. Map candidate keys only through an explicit DSH/pi2dsh seam; the current pi2dsh `registerShortcut` bridge does not become live merely because a TUI reads keys. Do not run two profile processes on one session.

### 3. dsh-pi-tui — best guarded fallback

Primary evidence: [README, commands, and keys](https://github.com/XMoon/dsh-pi-tui/blob/0ba964cc95046be949211777f11edad6d14675fe/README.md), [concurrency contract](https://github.com/XMoon/dsh-pi-tui/blob/0ba964cc95046be949211777f11edad6d14675fe/docs/concurrency.md), [rc.6 peer manifest](https://github.com/XMoon/dsh-pi-tui/blob/0ba964cc95046be949211777f11edad6d14675fe/packages/dsh-pi-tui/package.json), and [published manifest](https://registry.npmjs.org/@xmoon76%2fdsh-pi-tui/latest).

- **Protocol and sessions:** Another direct Cordis surface over DSH agent/session/approval/question services, with shared persistence, session switching, full-text history search, fork/export, presets/models/settings, subagents, jobs, and lazy session creation. It does not use the SDK JSON-RPC boundary.
- **Keyboard and mobile:** It documents transcript search, permission cycling, steering, queue retrieval, todo/task browser, `@` completion, and the vendored pi-tui editor. Headless xterm tests cover rendering/input and the repository includes tmux tests. There is no phone/touch/soft-modifier claim.
- **Customization:** DSH profile composition, settings, models, permission/agent presets, and the vendored pi-tui fork are available. Compared with dsh-TUI, the public extension/theme seams are less developed and customization is more likely to mean maintaining a source fork.
- **Continuity:** It states the key limitation plainly: one surface per session because two DSH processes can allocate duplicate sequence numbers. Before a write it compares committed storage with memory and blocks divergence; repeating the unchanged action forces through once. This is useful damage prevention, not safe active/active collaboration. Sequential resume uses the shared store.
- **Authentication/exposure:** Local TTY/OS account only; remote use inherits SSH or another terminal transport. Permission presets are visible and switchable, including a conspicuous full-access mode, but the UI adds no sandbox or authentication service.
- **Maintenance:** MIT, npm 0.1.4 with provenance metadata, active release at the audited revision, and stated dogfooding. It is still a days-old 0.1 project.
- **qq integration work:** The same isolated profile work as dsh-TUI, plus prove that the divergence guard recognizes the exact pinned compressed/JSONL layout and that pi2dsh's session projection is not mistaken for an external writer. Prefer this candidate if dsh-TUI shows session-corruption risk or if a writer guard is made a hard requirement.

### 4. openma dsh-tui — useful SDK boundary, narrower operator contract

Primary evidence: [README and mode comparison](https://github.com/openma-ai/deepseek-harness-tui/blob/90ce0e86d798399eb79c817b10465ff91aaacce8/README.en.md), [runtime discovery](https://github.com/openma-ai/deepseek-harness-tui/blob/90ce0e86d798399eb79c817b10465ff91aaacce8/src/runtime.rs), [profile bridge](https://github.com/openma-ai/deepseek-harness-tui/blob/90ce0e86d798399eb79c817b10465ff91aaacce8/npm/lib/index.js), and [published manifest](https://registry.npmjs.org/@openma%2fdeepseek-harness-tui/latest).

- **Protocol and sessions:** Standalone mode drives `dsh-jsonrpc-agent` using the stock NDJSON method family and stores sessions under a separate `~/.dsh-tui/sessions` root. Plugin mode instead launches the Rust UI and implements a server-compatible bridge over inherited Unix fds or authenticated loopback TCP on Windows; it adds private `tui/catalog`, model, permission, preset, skills, and attachment methods. Plugin mode uses host DSH persistence; standalone mode is not automatic continuity with the normal DSH store.
- **Keyboard and mobile:** Readline editing, queue/interrupt controls, search, mouse, native macOS modifier recovery, Linux/Windows ctrl conventions, narrow layouts, clipboard and tmux/OSC 52 routing are documented. Narrow terminal support is not phone input evidence; no soft-keyboard/touch behavior is claimed.
- **Customization:** Plugin mode imports host skills, model/preset/permission catalogs and supports light/dark themes. The private `tui/*` extension makes the richer mode coupled to this bridge. A generic SDK client cannot assume those methods.
- **Continuity:** `/new`, `/resume`, explicit session id, and durable logs exist. Shared continuity requires plugin mode or deliberate alignment of session roots. As with the other TUIs, no safe simultaneous DSH writers are established.
- **Authentication/exposure:** Unix uses child-only extra pipes; Windows uses a random token on a `127.0.0.1` socket. Neither is a remote operator endpoint. Remote terminal access still belongs to SSH/PTY transport. The stock SDK cannot request approval from the client and has no mid-turn cancel; standalone “interrupt” terminates the runtime rather than invoking a protocol method.
- **Maintenance:** MIT, Rust/ratatui, npm 0.2.1 with provenance, active at the audited revision and a current-integration claim of rc.6. The npm manifest deliberately has no DSH peers because it resolves packages from the host installation; that reduces duplicate installs but makes a runtime pin proof important.
- **qq integration work:** Use plugin mode, not the separate standalone store; verify every replicated stock method and private method against `47f9438`, then compose pi2dsh. This adds more protocol-bridge surface than the direct-service TUIs without solving phone access, so it is not the first TUI proof.

### 1. Web augmentation stack — focused answer to the stock gaps

#### DSH Spotlight

Primary evidence: [README](https://github.com/0xsline/dsh-spotlight/blob/dd7ef5ed160aa1a624559de16eafd4ea9406d7ed/README.md), [source manifest](https://github.com/0xsline/dsh-spotlight/blob/dd7ef5ed160aa1a624559de16eafd4ea9406d7ed/package.json), and [published 0.0.2 manifest](https://registry.npmjs.org/@0xsline%2fdsh-spotlight/latest).

- **Protocol/session:** No new server channel. It reads the Web client's sessions, command plane, plugin inventory, and visible actions, then delegates execution to native controls.
- **Keyboard/mobile:** Configurable `Cmd+K`/`Ctrl+K`, fuzzy search, arrows/Enter/Escape. Its shortcut is browser-local. There is no touch/phone design.
- **Customization/continuity:** The shortcut persists per browser origin; native and plugin actions are discovered rather than copied. Session and multi-client behavior are entirely the underlying Web runtime's behavior.
- **Authentication/exposure:** None. It must not be used to justify non-loopback exposure.
- **Maintenance/integration:** MIT, npm 0.0.2, active but new. DOM discovery can drift by its own admission. The pinned proof found working actions for the focused T-63.9 navigation categories, but no direct General-settings action, and DSH's `autoInstallPeers: false` profile required explicit `cordis` and `schemastery` support dependencies. It is an enhancement, not an independent session surface.

#### dsh-web-mobile-fix

Primary evidence: [README](https://github.com/AcidGr/dsh-web-mobile-fix/blob/015d905b5f9196b5d442878e5682d8aaa598aa3f/README.md), [source manifest](https://github.com/AcidGr/dsh-web-mobile-fix/blob/015d905b5f9196b5d442878e5682d8aaa598aa3f/package.json), and [published 1.0.2 manifest](https://registry.npmjs.org/dsh-web-mobile-fix/latest).

- **Protocol/session:** Pure CSS client overlay; no protocol or session integration of its own.
- **Keyboard/mobile:** Fixes selected layouts at widths up to 700px: settings, sidebar, navigation, header, composer model label, and popups. It provides no evidence for mobile Enter/newline policy, IME, soft modifiers, approvals, long transcripts, or touch gestures.
- **Customization/continuity:** Reversible style injection through the Web client plugin seam. Everything else, including continuity, is inherited from stock Web.
- **Authentication/exposure:** None. A narrow layout does not make the server remotely reachable or safe.
- **Maintenance/integration:** MIT, npm 1.0.2, active but new; selectors are version-sensitive. The pinned 390×844 proof closed the exact Settings-column and sidebar-squeeze failures, while measuring a 280px floating sidebar rather than a literal full-screen drawer. Approvals, questions, long transcripts, touch, IME, and soft-keyboard input remain unproved.

Together these plugins are a thin augmentation stack, not a second session implementation. The focused proof confirmed that they leave the stock DSH host, session store, and two-client path in place. They add no authentication, so the safe posture exists only while Web remains loopback-bound behind the same authenticated SSH forwarding boundary; they must never be paired with a LAN bind bypass.

### Blocked: dsh-remote-web-ui — best mobile concept, not pin-compatible

Primary evidence: [mobile/pairing contract](https://github.com/zhu1090093659/dsh-web-ui/blob/f57b766a50f262cd459ac228fb8e4a26d990066d/packages/dsh-remote-web-ui/README.md), [rc.6 development manifest](https://github.com/zhu1090093659/dsh-web-ui/blob/f57b766a50f262cd459ac228fb8e4a26d990066d/packages/dsh-remote-web-ui/package.json), [mobile method allowlist](https://github.com/zhu1090093659/dsh-web-ui/blob/f57b766a50f262cd459ac228fb8e4a26d990066d/packages/dsh-remote-web-ui/src/mobile-api.ts), and [published manifest](https://registry.npmjs.org/@linxin666%2fdsh-remote-web-ui/latest).

- **Protocol and sessions:** A dual-face Web plugin, not SDK JSON-RPC. Its `/m/api` proxy allowlists workspace/session list, create, history, search, prompt, model selection, and rename; SSE carries live events with polling fallback. The phone operates the same host sessions and workspaces as desktop, which is the only design here with true one-process multi-client continuity.
- **Keyboard and mobile:** A standalone small-screen `/m` UI pages workspaces/sessions/history, folds tools/reasoning, switches models/effort/permissions, and lets the operator choose whether Enter sends or inserts a newline. This is materially better mobile evidence than a CSS overlay. It still has no mobile modifier story because the phone UI avoids terminal shortcuts.
- **Customization:** Cordis bundle plus live settings for token TTL, device limits, pairing fence, Enter behavior, public base, and optional tunnel. It is tightly coupled to Web client and Host ApiProxy seams.
- **Authentication/exposure:** One-use expiring pair tokens become HttpOnly device cookies; refresh invalidates the old token, Stop revokes devices on their next request, loopback minting is privileged, and `/m/api` has a method allowlist. State is in memory, there is no per-device revocation UI, an in-flight action survives revocation, and an optional anonymous Cloudflare quick tunnel makes the URL public. This is a plausible application fence, not yet an audited production boundary.
- **Pin incompatibility:** The project's own harness-contract section requires an `api/gate` waterfall, `sidebar.remote` slot, LAN UUID fallback, and a newer connection loop. Searches of pinned `47f9438` find neither `api/gate` nor `sidebar.remote`; the pinned fetch client directly calls `crypto.randomUUID()` ([source](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/host/apiproxy/src/fetch/client.ts#L288-L302)); and the pinned CLI refuses its documented `--host 0.0.0.0` launch. Merely declaring rc.6 dev dependencies does not supply those runtime seams.
- **Maintenance:** Apache-2.0, npm 0.1.19, active monorepo with tests, but still days old and moving faster than the pinned host.
- **Integration work:** First port the entry slot and gate to public seams present at the pin, keep the server loopback-only, prove every phone method is denied before pairing and after revocation, and perform a threat review of cookies, Origin/Host handling, tunnel lifecycle, CSRF, and approval/permission changes. Only then decide whether a mobile runtime proof is justified. It is not a runnable candidate for this pin today.

## Unsafe exposure shortcuts: reject

These are relevant because they appear in community searches, but they fail safe self-hosting and are not operator-surface replacements.

| Project | Protocol/session and UI | Authentication/exposure | Pin/maintenance | Verdict |
|---|---|---|---|---|
| [`AcidGr/dsh-web-lan-access`](https://github.com/AcidGr/dsh-web-lan-access/tree/e27e909f2f079d2213c13823f56fe9ade4726f80) | Injects a UUID polyfill and overrides the Web server row to `0.0.0.0`; otherwise stock Web and stock sessions. No keyboard/mobile UI beyond saying Android is reachable. | Explicitly **no authentication**; its README says anyone on the network can control the agent and that the trust fence is not login. It intentionally bypasses the pinned CLI refusal. | MIT, npm 1.1.0, active/new; privileged APIs still fail remotely. | Reject, even on a nominally trusted LAN. |
| [`MrMu666/dsh-LAN`](https://github.com/MrMu666/dsh-LAN/tree/4bc98f5b219d2dc6ae55a1cab64f1e5dfbe52605) | Wraps stock Web with portrait CSS/touch behavior and a password proxy for privileged methods; claims one host process/live shared sessions. | Its own security section says the login is UI-level and **non-privileged session read/write APIs remain open to the LAN**. It binds all interfaces and edits host firewall rules. Password “remember” stores the password in browser storage. | MIT 1.1.0, active/new, wildcard DSH peers and pin fit unproved. | Reject; partial password coverage is not an agent control boundary. |
| [`oitsukiii/deepseek-harness-lan`](https://github.com/oitsukiii/deepseek-harness-lan/tree/1878911603ebfa2c825fa7cb7c2dee35870d21c3) | Four source patches for commit `47f9438`: specific-LAN bind, trusted privileged calls, and a UUID polyfill. Phone gets stock Web. | No authentication; README warns every LAN device can execute commands and suggests an external authenticating proxy. Modifies and rebuilds DSH source. | One initial commit; labels the same DSH source commit rc.5, illustrating package/source release ambiguity. | Reject; exact-source applicability does not make the exposure safe. |

## Transport-only options

These products can carry a TUI. They do **not** speak DSH protocols, understand DSH sessions, enforce DSH approvals, or make two DSH processes safe. Keep this category separate in any architecture decision.

| Transport | Keyboard/mobile evidence | Customization and continuity | Authentication/exposure | Maintenance and integration work |
|---|---|---|---|---|
| [OpenSSH + tmux](https://man7.org/linux/man-pages/man1/tmux.1.html) | Native desktop SSH preserves terminal keys. Phone behavior depends on the chosen SSH client/keyboard; no generic guarantee. tmux key tables are configurable. | One long-lived PTY survives disconnect and accepts multiple attached clients, so the **same TUI process** can move between devices without a second DSH writer. The smallest terminal can affect layout; concurrent typing is shared-PTY behavior, not DSH collaboration. | SSH supplies host authentication/encryption; tmux sockets default to the owning OS user and support read-only clients/access lists. Do not expose the DSH Web port. | Mature and active ([tmux source](https://github.com/tmux/tmux/tree/851c5a933d4838c32ad06c248b2ba975d106149c)). Integration is a restricted SSH account plus a named tmux session launching the selected TUI. **Best low-change remote transport**, not a DSH surface. |
| [`ttyd`](https://github.com/tsl0922/ttyd/tree/2922cb89f518bae4d0fcf4d757a7419638fc71fc) + tmux | Browser xterm with CJK/IME and custom client options; no primary-source promise that phone soft modifiers cover the chosen TUI. | Runs any command and can attach the same tmux PTY. CSS/xterm options are customizable. Without tmux, ttyd process lifetime is only terminal lifetime and is not DSH session continuity. | Supports TLS, Basic auth, an auth-proxy header, interface/Unix-socket binding, same-origin checking, client certificates, client caps, and write access that is off by default ([README/options](https://github.com/tsl0922/ttyd/blob/2922cb89f518bae4d0fcf4d757a7419638fc71fc/README.md)). Safe deployment still requires least privilege and a real authenticated HTTPS boundary. | Mature, active. Integration is nontrivial reverse-proxy/auth hardening plus tmux launch; it carries terminal bytes only. |
| [Apache Guacamole 1.6](https://guacamole.apache.org/doc/gug/using-guacamole.html) + SSH + tmux | Strongest generic phone evidence: HTML5 mobile/touch support, text-input/IME mode, and an on-screen keyboard that can send Ctrl, arrows, and browser-reserved combinations. | User preferences, multiple connections, sharing, and SSH file transfer are built in. tmux supplies the persistent single TUI process; Guacamole itself still has no DSH session model. | Database-backed authentication/storage is recommended and extensions cover LDAP, OIDC/SAML, TOTP/Duo, headers, and more ([auth manual](https://guacamole.apache.org/doc/gug/jdbc-auth.html)). It is a much larger security and operations surface than SSH alone. | Mature Apache projects, active at observation ([client](https://github.com/apache/guacamole-client/tree/5be18be1eeadc4cc544c737c54bd761261d2ad65), [server](https://github.com/apache/guacamole-server/tree/be83001bda2e60f1356604c91144628e8150afeb)). Integration is an authenticated Guacamole SSH connection whose shell attaches the named tmux session. |

A phone proof through Guacamole or ttyd would prove transport/input only. It must not be reported as DSH multi-device integration.

## Recommendation and proof boundary

1. **Use the qq-owned console only for the proven sequential slice.** Keep one active page as an operator convention; retain canonical DSH session identity, server-rendered controls, stable htmx/SSE inner swaps, loopback binding, and the fail-closed PWA cache boundary. Do not add a lease, observer/fanout subsystem, or offline command path.
2. **Keep the no-cutover decision.** The new slice proves session selection, Send, live SSE/reconnect, Interrupt, sequential reconstruction, responsive layout, and installability; it does not remove pi2dsh's orchestration blockers or replace Herdr/Pi.
3. **Keep Spotlight 0.0.2 plus mobile-fix 1.0.2 as T-63.10 requirements evidence only.** The qq-owned page does not install those packages and avoids their peer, maturity, and selector-drift risks.
4. **Use dsh-TUI 0.7.3 only as a terminal-first fallback.** A future proof would still need profile boot, one model-backed turn, approval/question handling, queue/interrupt, terminal restore/resize, shared-history stop-and-resume, and absence of concurrent writes. Phone access remains a separately labeled transport proof.
5. **Fallback again only on a concrete TUI failure.** Use dsh-pi-tui if dsh-TUI fails profile compatibility or if its writer guard becomes mandatory. Use openma only if direct SDK/process isolation becomes a requirement. Do not prove all three TUIs.
6. **Do not runtime-test dsh-remote-web-ui at this pin.** Its missing host seams make a port/threat-review ticket a prerequisite. If broader phone access becomes urgent, SSH + tmux (or Guacamole + SSH + tmux for an HTML5 phone keyboard) remains a separately labeled transport option.
7. **Never enable the LAN bypass plugins in an operator profile.** They defeat the pinned safety posture without complete authentication.

This recommendation approves the isolated sequential proof boundary, not runtime replacement, cutover, simultaneous collaboration, tunnel design, offline DSH, or physical-device deployment.
