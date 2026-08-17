#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const read = (path) => readFile(join(root, path), "utf8");
const json = async (path) => JSON.parse(await read(path));

const [pkg, pins, toolchain, toolchainLock, evidence, webEvidence, webQa, consoleEvidence, consoleReadme, consoleRender, consoleWorker, run, patch, relayProbe, childRun, childPlugin, childPatch, childPackage, nativeRun, nativeAdapter, nativeAdapterPatch, nativeAdapterPackage, nativeProof, nativeProofPatch, nativeProofPackage, nativeQaProof, nativeQaProofPatch, nativeQaProofPackage, nativeQaPiTools, nativeQaPiToolsPatch, nativeQaPiToolsPackage, qaVerdict, qaResult, relayContract, liveMessages, messages, review, scrub, runLib, runEvents, sessionContext, dshRunLib] = await Promise.all([
  json("package.json"),
  json("compat/pi2dsh/pins.json"),
  json("compat/pi2dsh/toolchain/package.json"),
  json("compat/pi2dsh/toolchain/package-lock.json"),
  json("compat/pi2dsh/evidence.json"),
  json("compat/pi2dsh/web-evidence.json"),
  read("compat/pi2dsh/WEB_QA.md"),
  json("dsh-console/evidence.json"),
  read("dsh-console/README.md"),
  read("dsh-console/src/render.mjs"),
  read("dsh-console/assets/sw-v8.js"),
  read("compat/pi2dsh/run.sh"),
  read("compat/pi2dsh/qq.patch.yml"),
  read("compat/pi2dsh/relay-probe.mjs"),
  read("compat/pi2dsh/run-subagent-proof.sh"),
  read("compat/pi2dsh/subagent-proof/plugin.mjs"),
  read("compat/pi2dsh/subagent-proof/cordis.patch.yml"),
  json("compat/pi2dsh/subagent-proof/package.json"),
  read("compat/pi2dsh/run-native-delegation-proof.sh"),
  read("dsh-native-launch/plugin.mjs"),
  read("dsh-native-launch/cordis.patch.yml"),
  json("dsh-native-launch/package.json"),
  read("compat/pi2dsh/native-delegation-proof/plugin.mjs"),
  read("compat/pi2dsh/native-delegation-proof/cordis.patch.yml"),
  json("compat/pi2dsh/native-delegation-proof/package.json"),
  read("compat/pi2dsh/native-qa-proof/plugin.mjs"),
  read("compat/pi2dsh/native-qa-proof/cordis.patch.yml"),
  json("compat/pi2dsh/native-qa-proof/package.json"),
  read("compat/pi2dsh/native-qa-pi-tools/index.ts"),
  read("compat/pi2dsh/native-qa-pi-tools/qa.patch.yml"),
  json("compat/pi2dsh/native-qa-pi-tools/package.json"),
  read("bin/lib/qa-verdict.mjs"),
  read("extensions/qa-result.ts"),
  read("tests/test-qq-relay.sh"),
  read("tests/test-agent-messages-live.sh"),
  read("extensions/agent-messages.ts"),
  read("extensions/review-flow.ts"),
  read("extensions/session-scrub.ts"),
  read("bin/lib/run.mjs"),
  read("bin/lib/run-events.mjs"),
  read("bin/lib/session-context.mjs"),
  read("bin/lib/dsh-run.mjs"),
]);

assert.deepEqual(pkg.pi, { extensions: ["extensions/index.ts"] });
assert.equal(pins.schema, "qq.pi2dsh-pins/v1");
assert.match(pins.qq.revision, /^[a-f0-9]{40}$/);
for (const key of ["pi2dsh", "dsh"]) {
  assert.match(pins[key].revision, /^[a-f0-9]{40}$/);
  assert.match(pins[key].version, /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/);
  assert.match(pins[key].integrity, /^sha512-/);
  assert.equal(toolchain.dependencies[pins[key].package], pins[key].version);
  assert.equal(toolchainLock.packages[`node_modules/${pins[key].package}`].integrity, pins[key].integrity);
}
for (const pin of [pins.dsh.continuableService, pins.dsh.spawnProvider]) {
  assert.equal(pin.version, pins.dsh.version);
  assert.match(pin.integrity, /^sha512-/);
  assert.equal(toolchainLock.packages[`node_modules/${pin.package}`].version, pin.version);
  assert.equal(toolchainLock.packages[`node_modules/${pin.package}`].integrity, pin.integrity);
}
assert.equal(toolchain.dependencies.typescript, pins.typescript.version);
assert.equal(pins.webCandidate.status, "proof-only");
for (const key of ["spotlight", "mobileFix"]) {
  const candidate = pins.webCandidate[key];
  assert.match(candidate.revision, /^[a-f0-9]{40}$/);
  assert.match(candidate.version, /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/);
  assert.match(candidate.integrity, /^sha512-/);
  assert.equal(toolchain.dependencies[candidate.package], candidate.version);
  assert.equal(toolchainLock.packages[`node_modules/${candidate.package}`].integrity, candidate.integrity);
}
for (const [name, version] of Object.entries(pins.webCandidate.spotlightPeers)) {
  assert.equal(toolchain.dependencies[name], version);
  assert.equal(toolchainLock.packages[`node_modules/${name}`].version, version);
}
assert.match(run, /npm ci --prefix/);
assert.match(run, /diff --quiet "\$qq_revision" -- extensions bin\/lib\/session-context\.mjs/);
assert.match(run, /plugin --profile headless add/);
assert.match(run, /--patch "\$here\/qq\.patch\.yml"/);
assert.match(run, /QQ_PI2DSH_RELAY_STATE_HOME/);
assert.match(run, /QQ_RELAY_INSTALL_ROOT="\$relay_install_root"/);
assert.match(run, /relay-probe\.mjs/);
assert.match(run, /relay-proof\.json/);
assert.match(run, /QQ_AGENT_ROLE=architect/);
assert.doesNotMatch(run, /relay-stub|RECEIPT_PROBE|RELAY_PROBE/);
assert.match(run, /llm-stub\.mjs/);
assert.match(run, /run-subagent-proof\.sh/);
assert.equal(childPackage.name, "@hypermemetic-ai/qq-dsh-subagent-proof");
assert.equal(childPackage.dsh.bundle.patch, "./cordis.patch.yml");
assert.match(childPatch, /name: '@hypermemetic-ai\/qq-dsh-subagent-proof'/);
assert.match(childPatch, /inject: \[agentDefaultModel, agents, sessions, sessionPersistence, subagents\]/);
assert.match(childPlugin, /subagents\.startContinuable\(/);
assert.match(childPlugin, /provider: "spawn"/);
assert.match(childPlugin, /subagents\.followup\(/);
assert.match(childPlugin, /services\.agents\.get\(expected\.childId\)[\s\S]*services\.sessions\.get\(expected\.childId\)[\s\S]*persistence\.inspect\(expected\.childId\)/);
assert.match(childPlugin, /event\.type === "user\/message" && event\.data\?\.id === messageId/);
assert.match(childPlugin, /descriptor\.data\?\.mode === "continuable"/);
assert.match(childPlugin, /descriptor\.data\?\.provider === "spawn"/);
assert.match(childPlugin, /agents\.resume\([\s\S]*resumeSessionId: config\.parentSessionId/);
assert.doesNotMatch(childPlugin, /qq-relay|herdr|PI_SESSION|getSessionFile/);
assert.match(childRun, /env -i/);
assert.match(childRun, /git -C "\$root" worktree add --detach/);
assert.match(childRun, /git -C "\$root" worktree remove --force/);
assert.match(childRun, /assert\.notEqual\(followup\.host_pid, start\.host_pid/);
assert.match(childRun, /assert\.equal\(followup\.child_was_cold_before_followup, true\)/);
assert.doesNotMatch(childRun, /qq-relay|herdr|PI_SESSION|getSessionFile/);
assert.match(patch, /id: tool-fs\s+disabled: true/);
assert.match(patch, /id: session-persistence-jsonl[\s\S]*compression: none/);
assert.match(relayProbe, /bin\/lib\/qq-relay-client\.mjs/);
assert.match(relayProbe, /client\.send\(/);
assert.match(relayProbe, /client\.status\(/);
assert.match(relayProbe, /bin\/lib\/run-events\.mjs/);
assert.match(relayProbe, /sendRunEvent\(/);
assert.match(relayProbe, /qq\/review-flow\/\$\{recipientSessionId\}/);
assert.match(relayContract, /rm -rf -- "\$work\/source"[\s\S]*test-agent-messages-live\.sh/);
assert.match(liveMessages, /qq-relay" serve --state-dir "\$relay_state_dir"/);
assert.match(liveMessages, /QQ_PI2DSH_RELAY_STATE_HOME="\$relay_state_home" "\$ROOT\/compat\/pi2dsh\/run\.sh"/);

assert.equal(evidence.schema, "qq.pi2dsh-evidence/v1");
assert.equal(evidence.observed_at, "2026-08-16");
assert.equal(evidence.pins_file, "compat/pi2dsh/pins.json");
assert.deepEqual(evidence.inspection, {
  verdict: "review",
  extensions: ["extensions/index.ts"],
  full: 66,
  partial: 57,
  unsupported: 0,
  fatal: 0,
});
assert.equal(evidence.conclusion.operator_cutover, "blocked");
assert.equal(evidence.conclusion.native_translation_started, true);
const probes = new Map(evidence.probes.map((probe) => [probe.id, probe]));
for (const id of [
  "package-local-events", "before-agent-start", "tools", "commands", "model-selection",
  "thinking-effort", "shortcut", "session-tree", "shutdown", "project-trust",
  "read-tool-collision", "session-id", "qq-relay-client", "native-child-prompt-acceptance", "qq-session-context",
  "approved-native-delegation-launch", "native-runner-submission", "independent-native-qa", "herdr-launch", "herdr-delivery-proof", "agent-message-receipts", "run-outcome-addressing", "review-receipts", "session-scrub",
]) assert.ok(probes.has(id), `missing compatibility probe ${id}`);
assert.equal(probes.get("session-id").verdict, "identity-translated");
assert.match(probes.get("session-id").fact, /complete value unchanged as the live relay address/);
assert.equal(probes.get("qq-relay-client").verdict, "installed-product-proven");
assert.equal(probes.get("native-child-prompt-acceptance").verdict, "durable-bootstrap-and-cold-followup-proven");
assert.equal(probes.get("approved-native-delegation-launch").verdict, "post-approval-native-launch-proven");
assert.match(probes.get("approved-native-delegation-launch").fact, /flushing any live child Session.*sessionPersistence\.inspect.*without waiting for child settlement/);
assert.match(probes.get("approved-native-delegation-launch").fact, /fresh DSH host/);
assert.equal(probes.get("native-runner-submission").verdict, "durable-awaiting-native-review-proven");
assert.match(probes.get("native-runner-submission").fact, /status submitted.*runtime dsh.*look 0/);
assert.match(probes.get("native-runner-submission").fact, /does not launch a review worker/);
assert.match(probes.get("native-runner-submission").fact, /same installed DSH profile/);
assert.equal(probes.get("independent-native-qa").verdict, "mounted-profile-five-tool-submission-guard-and-cold-result-proven");
assert.match(probes.get("independent-native-qa").fact, /explicitly mounts pi2dsh and one qq Pi package whose entry calls the real qq extension under qq\.patch\.yml/);
assert.match(probes.get("independent-native-qa").fact, /read, bash, edit, write, and scope-owned qa_verdict/);
assert.match(probes.get("independent-native-qa").fact, /At verdict submission qa_verdict revalidates/);
assert.match(probes.get("independent-native-qa").fact, /exact persisted prompt, review instruction, tool call and result/);
assert.match(probes.get("independent-native-qa").fact, /submitted handoff remains byte-for-byte unchanged/);
assert.match(probes.get("native-child-prompt-acceptance").fact, /cold sessionPersistence\.inspect/);
assert.match(probes.get("native-child-prompt-acceptance").fact, /fresh host resumes the exact persisted direct parent/);
assert.equal(probes.get("agent-message-receipts").verdict, "installed-transport-and-durable-entry-proven");
assert.equal(probes.get("run-outcome-addressing").verdict, "installed-address-and-parse-proven");
assert.match(probes.get("run-outcome-addressing").fact, /qq\/review-flow\/session-<UUID>/);
assert.equal(probes.get("review-receipts").verdict, "installed-durable-entry-proven");
assert.ok(evidence.conclusion.blockers.every((blocker) => !/qq-relay client boundary|review events|prompt-acceptance proof/i.test(blocker)));
assert.ok(evidence.conclusion.blockers.some((blocker) => /production native review-state integration, look continuity, proposal, and landing/.test(blocker)));
assert.ok(evidence.conclusion.blockers.every((blocker) => !/production delegation integration/.test(blocker)));

assert.equal(evidence.operator_surface.verdict, "pass-sequential-vertical-slice");
assert.equal(evidence.operator_surface.model, "sequential-single-page-handoff");
assert.equal(evidence.operator_surface.hypermedia.sse_activated, true);
assert.equal(evidence.operator_surface.hypermedia.stable_owner_and_target, true);
assert.equal(evidence.operator_surface.pwa.offline_commands, "rejected, never queued");
assert.equal(evidence.operator_surface.cutover, false);

assert.equal(webEvidence.schema, "qq.dsh-web-evidence/v3");
assert.equal(webEvidence.observed_at, evidence.observed_at);
assert.equal(webEvidence.pins_file, "compat/pi2dsh/pins.json");
assert.deepEqual(webEvidence.pin, {
  package: pins.dsh.package,
  version: pins.dsh.version,
  revision: pins.dsh.revision,
});
assert.equal(webEvidence.scope, "qq-owned sequential single-page DSH console vertical slice");
assert.equal(webEvidence.runtime.verdict, "pass");
assert.equal(webEvidence.topology.one_active_page, "operator usage convention");
assert.equal(webEvidence.topology.simultaneous_client_coordination, false);
assert.equal(webEvidence.topology.controller_lease, false);
assert.equal(webEvidence.hypermedia.sse_activated, true);
assert.equal(webEvidence.hypermedia.owner_replaced, false);
assert.equal(webEvidence.hypermedia.target_replaced, false);
assert.equal(webEvidence.hypermedia.swap, "innerHTML");
assert.equal(webEvidence.hypermedia.manual_htmx_process, false);
assert.equal(webEvidence.browser_qa.two_swap_lifecycle.verdict, "pass");
assert.equal(webEvidence.browser_qa.two_swap_lifecycle.owner_identity_stable, true);
assert.equal(webEvidence.browser_qa.two_swap_lifecycle.target_identity_stable, true);
assert.equal(webEvidence.browser_qa.two_swap_lifecycle.newly_inserted_interrupt_form_submitted, true);
assert.equal(webEvidence.browser_qa.safe_rendering.script_executed, false);
assert.equal(webEvidence.browser_qa.reconnect.connections_after, 2);
assert.equal(webEvidence.browser_qa.reconnect.complete_snapshot_after_reconnect, true);
assert.equal(webEvidence.browser_qa.session_selection.verdict, "pass");
assert.equal(webEvidence.browser_qa.phone_390x844.horizontal_overflow, false);
assert.equal(webEvidence.pwa.verdict, "pass-for-minimal-install-boundary");
assert.equal(webEvidence.pwa.disconnected_shell.offline_post_rejected_by_network, true);
assert.equal(webEvidence.pwa.disconnected_shell.offline_command_queued, false);
assert.ok(webEvidence.pwa.cached_paths.every((path) => path.startsWith("/qq/assets/")));
assert.equal(webEvidence.conclusion.verdict, "pass-sequential-vertical-slice");
assert.equal(webEvidence.conclusion.replacement_for_herdr, false);
assert.equal(webEvidence.conclusion.operator_cutover_approved, false);
assert.equal(webEvidence.conclusion.cutover_or_removal_performed, false);

assert.equal(consoleEvidence.schema, "qq.dsh-console-evidence/v2");
assert.deepEqual(consoleEvidence.dsh_pin, webEvidence.pin);
assert.equal(consoleEvidence.scope.model, webEvidence.topology.model);
assert.equal(consoleEvidence.runtime_probe.verdict, "pass");
assert.equal(consoleEvidence.hypermedia.sse_activated, true);
assert.equal(consoleEvidence.pwa.offline_post_rejected, true);
assert.match(webQa, /stable nodes/);
assert.match(webQa, /newly inserted button/);
assert.match(webQa, /official[- ]extension/);
assert.match(webQa, /412×915/);
assert.match(webQa, /No transcript is cached and no message can be sent offline/);
assert.match(consoleReadme, /One active page at a time is an operator convention/);
assert.match(consoleReadme, /Agent\.cancel\(\{ kind: "user" \}\)/);
assert.match(consoleRender, /id="console-stream"[\s\S]*sse-connect/);
assert.match(consoleRender, /id="session-panel"[\s\S]*sse-swap="session" hx-swap="innerHTML"/);
assert.doesNotMatch(consoleRender, /hx-swap="outerHTML"|htmx\.process/);
assert.doesNotMatch(consoleWorker, /session\/|\/prompt|\/events|\/interrupt|indexedDB|localStorage/i);

// Herdr orchestration remains explicitly Pi-owned and proves prompt acceptance
// by opening the path in Herdr's Pi session descriptor.
assert.match(runLib, /"agent", "start", `runner-\$\{slug\}-\$\{nonce\}`, "--kind", "pi"/);
assert.match(runLib, /agent\.agent !== "pi"/);
assert.match(runLib, /session\.source !== "herdr:pi"/);
assert.match(runLib, /path\.endsWith\("\.jsonl"\)/);
assert.match(runLib, /sessionHasPromptMarker\(path, marker\)/);

// Qq context is session-owned for DSH while Pi retains its environment fallback.
assert.match(sessionContext, /qq\.session-context\/v1/);
assert.match(sessionContext, /activeDshSession\?\.\(\)/);
assert.match(sessionContext, /QQ_RUN_STATE \|\| null/);
assert.match(childPlugin, /agents\.currentInitiator\(\)\?\.session\.id/);
assert.match(childRun, /context_survived_continuation/);
assert.equal(nativeAdapterPackage.name, "@hypermemetic-ai/qq-dsh-native-launch");
assert.equal(nativeAdapterPackage.dsh.bundle.patch, "./cordis.patch.yml");
assert.match(nativeAdapterPatch, /inject: \[agents, sessions, sessionPersistence, subagents\]/);
assert.match(nativeAdapter, /registerNativeLaunchAdapter\(adapter\)/);
assert.match(nativeAdapter, /bootstrapRun\(run, requestPath/);
assert.match(nativeAdapter, /startDshRun\(/);
assert.doesNotMatch(nativeAdapter, /herdr|agent\.prompt|qq-relay/);
assert.match(dshRunLib, /subagents\.startContinuable\(/);
assert.match(dshRunLib, /provider: "spawn"/);
assert.match(dshRunLib, /sessions\.flush\(liveSession\)[\s\S]*persistence\.inspect\(expected\.childId/);
assert.match(dshRunLib, /event\.data\?\.id === messageId/);
assert.match(dshRunLib, /sessionContext\.claimExclusive\(childId/);
assert.match(dshRunLib, /runtime: "dsh"/);
assert.doesNotMatch(dshRunLib, /herdr|agent\.prompt|qq-relay/);
assert.equal(nativeProofPackage.name, "@hypermemetic-ai/qq-dsh-native-delegation-proof");
assert.match(nativeProofPatch, /inject: \[agentDefaultModel, agents, sessions, sessionPersistence, subagents\]/);
assert.match(nativeProof, /registerBoard\(/);
assert.match(nativeProof, /registerReviewFlow\(/);
assert.match(nativeProof, /awaitBriefGate\(\) \{ return "approved"; \}/);
assert.match(nativeProof, /done\.execute\(/);
assert.match(nativeProof, /reviewLaunches === 0/);
assert.match(nativeProof, /hostStops === 0/);
assert.match(nativeProof, /bootstrap_injections: exactMessages\.length/);
assert.match(nativeProof, /agents\.resume\(/);
assert.match(nativeRun, /plugin --profile qq-native-delegation-proof add "\$dsh_native"/);
assert.match(nativeRun, /run_phase start[\s\S]*run_phase fresh[\s\S]*run_phase qa[\s\S]*run_phase qa-fresh/);
assert.match(nativeRun, /plugin --profile qq-native-qa-proof add "\$toolchain\/node_modules\/pi2dsh"/);
assert.match(nativeRun, /plugin --profile qq-native-qa-proof add "\$qa_pi_tools"/);
assert.match(nativeRun, /plugin --profile qq-native-qa-proof add "\$qa_proof_plugin"/);
assert.match(nativeRun, /patch=\(--patch "\$here\/qq\.patch\.yml" --patch "\$qa_pi_tools\/qa\.patch\.yml"\)/);
assert.match(nativeRun, /done_requested, true/);
assert.match(nativeRun, /clean_shared_ref_reconstructed, true/);
assert.match(nativeRun, /visible_tools[\s\S]*qa_verdict/);
assert.match(nativeRun, /state\.qaVerdict, undefined/);
assert.match(nativeRun, /main checkout/);
assert.equal(nativeQaProofPackage.name, "@hypermemetic-ai/qq-dsh-native-qa-proof");
assert.equal(nativeQaProofPackage.dsh.bundle.patch, "./cordis.patch.yml");
assert.match(nativeQaProofPatch, /inject: \[agentDefaultModel, agents, llm, sessions, sessionPersistence, systemPrompt, tools\]/);
assert.match(nativeQaProof, /ctx\.agents\.create\(/);
assert.match(nativeQaProof, /ctx\.agents\.resume\(/);
assert.match(nativeQaProof, /agentCtx\.tools\.presentAs\("native"\)/);
assert.match(nativeQaProof, /agentCtx\.tools\.restrict\(\{ allow: options\.inheritedTools \}\)/);
assert.match(nativeQaProof, /agentCtx\.tools\.register\(qaTool\(options\)\)/);
assert.match(nativeQaProof, /complete: true/);
assert.match(nativeQaProof, /QA_VERDICT_ARGUMENT_SCHEMA/);
assert.match(nativeQaProof, /writeQaVerdict\(verdictPath, verdict\)/);
assert.match(nativeQaProof, /validateSubmittedHandoff/);
assert.match(nativeQaProof, /verifySubmittedRepository/);
assert.match(nativeQaProof, /status === "submitted" && state\.look === 0/);
assert.match(nativeQaProof, /status", "--porcelain", "--untracked-files=all"/);
assert.match(nativeQaProof, /--git-common-dir/);
assert.match(nativeQaProof, /submission\.continuation\?\.architectSession/);
assert.doesNotMatch(nativeQaProof, /(?:^|\W)state\.(?:status|look|qaVerdict)\s*=(?!=)|landHandoff|setBoardStatus|sendRunEvent/);
assert.equal(nativeQaPiToolsPackage.name, "qq");
assert.deepEqual(nativeQaPiToolsPackage.pi.extensions, ["index.ts"]);
assert.match(nativeQaPiTools, /import registerQQ from "\.\.\/\.\.\/\.\.\/extensions\/index\.ts"/);
assert.match(nativeQaPiTools, /registerQQ\(pi\)[\s\S]*registerCwdTool\(pi, createBashToolDefinition\)/);
for (const factory of ["createBashToolDefinition", "createEditToolDefinition", "createWriteToolDefinition"]) {
  assert.match(nativeQaPiTools, new RegExp(factory));
}
assert.match(nativeQaPiTools, /context\?\.cwd/);
assert.match(nativeQaPiToolsPatch, /id: tool-bash[\s\S]*disabled: true/);
assert.match(patch, /id: tool-fs[\s\S]*disabled: true/);
assert.match(qaVerdict, /qq\.qa-verdict\/v1/);
assert.match(qaVerdict, /constants\.O_EXCL/);
assert.match(qaVerdict, /await link\(temporary, path\)/);
assert.match(qaResult, /createQaVerdict, QA_VERDICT_ARGUMENT_SCHEMA, writeQaVerdict/);
assert.doesNotMatch(qaResult, /async function writePrivate/);
assert.match(relayContract, /run-native-delegation-proof\.sh/);
assert.ok(evidence.probes.some((item) => item.id === "qq-session-context"));

// Run outcomes accept only canonical Pi UUIDs or pinned DSH session-UUIDs.
assert.match(runEvents, /DSH_SESSION_ID = \/\^session-/);
assert.match(runEvents, /review-flow\/\$\{sessionId\}/);

// Agent-message and review-flow acknowledgement use only host-managed entries.
assert.doesNotMatch(messages, /getSessionFile/);
assert.match(messages, /sessionManager\?\.getEntries\?\.\(\)/);
assert.doesNotMatch(messages, /JSON\.parse\(line\)/);
assert.doesNotMatch(review, /getSessionFile/);
assert.match(review, /sessionManager\?\.getEntries\?\.\(\)/);
assert.doesNotMatch(review, /JSON\.parse\(line\)/);
assert.match(review, /entry\?\.type === "custom_message"/);
assert.match(review, /entry\?\.type === "message"/);

// Scrubbing is tied to Pi's transcript root and Pi's /new event shape.
assert.match(scrub, /"\.pi", "agent", "sessions"/);
assert.match(scrub, /event\?\.reason !== "new"/);
assert.match(scrub, /previousSessionFile/);

execFileSync("git", ["cat-file", "-e", `${pins.qq.revision}^{commit}`], { cwd: root, stdio: "ignore" });
execFileSync("git", ["diff", "--quiet", pins.qq.revision, "--", "extensions", "bin/lib/session-context.mjs"], { cwd: root, stdio: "ignore" });

console.log("pi2dsh compatibility baseline test passed");
