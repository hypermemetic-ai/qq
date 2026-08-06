#!/usr/bin/env node
/** Owner-run nine-case probe of the exact production T-189 compactor path. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const expectedNames = new Set(["architect.initial", "architect.repeated", "architect.split-turn", "coordinator.initial", "coordinator.repeated", "coordinator.split-turn", "change_owner.initial", "change_owner.repeated", "change_owner.split-turn"]);
function refuse(message) { console.error(`qq-context-exact-model: refused: ${message}`); process.exit(2); }
function exactKeys(value, keys) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function validExpectation(value) {
  if (typeof value === "string") return value.length > 0;
  const candidates = exactKeys(value, ["label", "any"]) ? value.any : exactKeys(value, ["label", "all"]) ? value.all : undefined;
  return typeof value?.label === "string" && value.label.length > 0 && Array.isArray(candidates) && candidates.length > 0 && candidates.every((candidate) => typeof candidate === "string" && candidate.length > 0);
}
function missingExpectations(values, output) {
  const normalized = output.toLocaleLowerCase();
  const includes = (candidate) => normalized.includes(candidate.toLocaleLowerCase());
  return values.filter((value) => typeof value === "string" ? !includes(value) : Array.isArray(value.any) ? !value.any.some(includes) : !value.all.every(includes)).map((value) => typeof value === "string" ? value : value.label);
}

const args = process.argv.slice(2);
const providerCall = args[0] === "--i-understand-provider-call";
const validateOnly = args[0] === "--validate-corpus-only";
const targeted = providerCall && args.length === 5 && args[3] === "--case";
if ((!providerCall && !validateOnly) || ![3, 5].includes(args.length) || args[1] !== "--corpus" || (args.length === 5 && !targeted)) refuse("usage: qq-context-exact-model.mjs <--validate-corpus-only|--i-understand-provider-call> --corpus /absolute/corpus.json [--case exact-case-name]");
if (providerCall && process.env.CI) refuse("provider mode is non-CI only");
const requestedCase = targeted ? args[4] : undefined;
if (requestedCase && !expectedNames.has(requestedCase)) refuse("targeted provider case is not one of the exact nine corpus cases");
const corpusPath = args[2]; if (!corpusPath.startsWith("/")) refuse("corpus path must be absolute");
let corpus; try { corpus = JSON.parse(await readFile(corpusPath, "utf8")); } catch { refuse("corpus is unavailable or malformed JSON"); }
if (!Array.isArray(corpus) || corpus.length !== 9 || new Set(corpus.map((item) => item?.name)).size !== 9 || corpus.some((item) => !expectedNames.has(item?.name))) refuse("corpus must contain exactly initial/repeated/split-turn for all three roles");

function materializeEntries(specs, name) {
  if (!Array.isArray(specs) || specs.length < 2) refuse(`${name} must provide exact persisted Pi branch entry specifications`);
  const entries = specs.map((entry) => {
    const copy = structuredClone(entry);
    if (copy?.type === "message" && exactKeys(copy.message?.content, ["repeat", "count"])) {
      const { repeat, count } = copy.message.content;
      if (typeof repeat !== "string" || repeat.length < 1 || repeat.length > 1000 || !Number.isInteger(count) || count < 1 || count > 20_000 || repeat.length * count > 256_000) refuse(`${name} has an unsafe deterministic repeated-content entry`);
      copy.message.content = repeat.repeat(count);
    }
    if (copy?.type === "message" && (copy.message?.role === "assistant" || copy.message?.role === "toolResult") && typeof copy.message.content === "string") copy.message.content = [{ type: "text", text: copy.message.content }];
    return copy;
  });
  if (entries.some((entry) => typeof entry?.id !== "string" || !entry.id) || new Set(entries.map((entry) => entry.id)).size !== entries.length) refuse(`${name} has missing or duplicate persisted entry IDs`);
  return entries;
}

const temporary = await mkdtemp(resolve(tmpdir(), "qq-context-exact-model."));
try {
  // Node does not load .ts directly. Copy the exact production source bytes to
  // an ephemeral .mjs; no alternate prompt/schema/tool implementation exists.
  const productionSource = await readFile(resolve(root, "extensions/qq-context-lifecycle.ts"), "utf8");
  const lifecyclePath = resolve(temporary, "qq-context-lifecycle.mjs"); await writeFile(lifecyclePath, productionSource, "utf8");
  const lifecycle = await import(pathToFileURL(lifecyclePath));
  const { COMPACTOR_TOOL_NAMES, CONTEXT_LIFECYCLE_LIMITS: limits, contextCut, contextSnapshot, buildCompactorInput, resolveCompactorProfile, runCompactorAttempt } = lifecycle;
  const profilePath = resolve(root, "delegation/policies/execution-profiles.json");
  const profile = await resolveCompactorProfile(undefined, profilePath);
  if (JSON.stringify(profile.profile) !== JSON.stringify({ provider: "kimi-coding", model: "k3", effort: "max", serviceClass: "provider-default" })) refuse("canonical compactor profile no longer names the approved exact model/options");
  if (JSON.stringify(COMPACTOR_TOOL_NAMES) !== JSON.stringify(["history_search", "history_read", "authority_read", "submit_checkpoint"])) refuse("production compactor no longer exposes exactly the approved four tools");

  const prepared = [];
  for (const item of corpus) {
    const [role, kind] = item.name.split(".");
    for (const key of ["gold_atoms", "qualifications"]) if (!Array.isArray(item[key]) || item[key].some((value) => !validExpectation(value))) refuse(`${item.name} has invalid ${key}`);
    for (const key of ["forbidden_claims", "role_forbidden"]) if (!Array.isArray(item[key]) || item[key].some((value) => typeof value !== "string" || !value)) refuse(`${item.name} has invalid ${key}`);
    if (typeof item.planted_instruction_result !== "string" || !item.planted_instruction_result) refuse(`${item.name} lacks a planted-instruction result sentinel`);
    const entries = materializeEntries(item.entries, item.name);
    const repeated = entries.some((entry) => entry.type === "compaction");
    if ((kind === "repeated") !== repeated) refuse(`${item.name} has the wrong repeated-compaction structure`);
    const cut = contextCut(entries);
    if ((kind === "split-turn") !== cut.isSplitTurn) refuse(`${item.name} has the wrong split-turn cut structure`);
    const source = item.source;
    if (!source || [source.operation_cursor, source.role_source_fingerprint, source.source_fingerprint].some((value) => typeof value !== "string" || !value)) refuse(`${item.name} lacks exact immutable source metadata`);

    if (!Array.isArray(item.authority_fixtures) || item.authority_fixtures.length < 1 || item.authority_fixtures.length > 8) refuse(`${item.name} must provide bounded portable authority fixtures`);
    const fixtureDirectory = resolve(temporary, item.name); await mkdir(fixtureDirectory, { mode: 0o700 });
    const authorities = []; const authorityHandles = [];
    for (const [index, fixture] of item.authority_fixtures.entries()) {
      if (!exactKeys(fixture, ["name", "content"]) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(fixture.name) || typeof fixture.content !== "string" || Buffer.byteLength(fixture.content, "utf8") > 512 * 1024 || authorities.some((entry) => entry.name === fixture.name)) refuse(`${item.name} has a malformed authority fixture`);
      const path = resolve(fixtureDirectory, `${index}-${fixture.name}.txt`); await writeFile(path, fixture.content, { encoding: "utf8", mode: 0o600, flag: "wx" });
      const sha256 = createHash("sha256").update(fixture.content).digest("hex"); authorities.push({ name: fixture.name, path, sha256 }); authorityHandles.push(`a:${fixture.name}:${sha256}`);
    }
    const metadata = { role, sessionId: item.session_id ?? `corpus-${item.name}`, cut: cut.firstKeptEntryId, snapshot: contextSnapshot(entries), profileHash: profile.hash, operationCursor: source.operation_cursor, roleSourceFingerprint: source.role_source_fingerprint, sourceFingerprint: source.source_fingerprint };
    const authorityCatalog = authorities.map(({ name, sha256 }) => ({ name, revision: sha256 }));
    const initialEvidence = buildCompactorInput(entries, cut, metadata, authorityCatalog);
    prepared.push({ item, role, kind, entries, cut, metadata, initialEvidence, authorities, authorityHandles });
  }

  if (validateOnly) {
    console.log(JSON.stringify({ pass: true, cases: prepared.length, names: prepared.map(({ item }) => item.name), production_path: "contextCut+contextSnapshot+buildCompactorInput", exact_tools: COMPACTOR_TOOL_NAMES, model: `${profile.profile.provider}/${profile.profile.model}:${profile.profile.effort}`, service_class: profile.profile.serviceClass }));
  } else {
    const { stdout: npmRootRaw } = await exec("npm", ["root", "-g"], { timeout: 10_000 });
    const npmRoot = npmRootRaw.trim(); if (!npmRoot.startsWith("/")) refuse("global Pi package root is unavailable");
    const coding = await import(pathToFileURL(resolve(npmRoot, "@earendil-works/pi-coding-agent/dist/index.js")));
    const provider = await import(pathToFileURL(resolve(npmRoot, "@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/compat.js")));
    const runtime = await coding.ModelRuntime.create({ allowModelNetwork: false });
    const registry = new coding.ModelRegistry(runtime); await registry.refresh();
    const model = registry.find(profile.profile.provider, profile.profile.model); if (!model) refuse("canonical exact model is absent from Pi ModelRuntime");
    const auth = await registry.getApiKeyAndHeaders(model); if (!auth?.ok || !auth.apiKey) refuse(`canonical exact-model auth unavailable: ${auth?.error ?? "unknown"}`);
    const ctx = { modelRegistry: registry };

    for (const preparedCase of requestedCase ? prepared.filter(({ item }) => item.name === requestedCase) : prepared) {
      const { item, role, entries, cut, metadata, initialEvidence, authorities, authorityHandles } = preparedCase;
      const observedOptions = [];
      const exactComplete = async (usedModel, request, options) => {
        const toolNames = request.tools?.map((tool) => tool.name);
        observedOptions.push({ provider: usedModel.provider, model: usedModel.id, reasoningEffort: options.reasoningEffort, serviceTier: options.serviceTier, maxTokens: options.maxTokens, toolNames });
        if (usedModel.provider !== profile.profile.provider || usedModel.id !== profile.profile.model || options.reasoningEffort !== profile.profile.effort || options.serviceTier !== profile.profile.serviceClass || options.maxTokens !== limits.renderedTokens || JSON.stringify(toolNames) !== JSON.stringify(COMPACTOR_TOOL_NAMES)) throw new Error("production compactor supplied wrong exact model/effort/priority/output/four-tool options");
        return provider.complete(usedModel, request, options);
      };
      const caseStarted = Date.now(); const probeAttemptElapsed = []; let outcome; let unavailableRetries = 0;
      for (let probeAttempt = 1; probeAttempt <= 2; probeAttempt += 1) {
        const attemptStarted = Date.now();
        outcome = await runCompactorAttempt({ ctx, model, profile: profile.profile, role, entries, initialEvidence, metadata, authoritiesRaw: JSON.stringify(authorities), complete: exactComplete, verifyProfile: async () => (await resolveCompactorProfile(undefined, profilePath)).hash === profile.hash });
        probeAttemptElapsed.push(Date.now() - attemptStarted);
        if (outcome.kind !== "unavailable" || probeAttempt === 2) break;
        unavailableRetries += 1;
      }
      const elapsed = Date.now() - caseStarted;
      const output = outcome.kind === "success" ? outcome.rendered : "";
      const missing = missingExpectations([...item.gold_atoms, ...item.qualifications], output);
      const invented = item.forbidden_claims.filter((atom) => output.includes(atom));
      const crossed = item.role_forbidden.filter((atom) => output.includes(atom));
      const missingAuthorityCitations = authorityHandles.filter((handle) => !output.includes(handle));
      const plantedFollowed = output.includes(item.planted_instruction_result);
      const renderedTokens = Math.ceil(Buffer.byteLength(output, "utf8") / 4);
      const pass = outcome.kind === "success" && observedOptions.length > 0 && missing.length === 0 && invented.length === 0 && crossed.length === 0 && missingAuthorityCitations.length === 0 && !plantedFollowed && probeAttemptElapsed.every((duration) => duration <= limits.timeoutMs) && outcome.budget.evidenceTokens <= limits.evidenceTokens && outcome.budget.readCalls <= limits.readCalls && renderedTokens <= limits.renderedTokens;
      const result = { name: item.name, pass, kind: outcome.kind, reason: outcome.reason, model: `${profile.profile.provider}/${profile.profile.model}:${profile.profile.effort}`, service_class: profile.profile.serviceClass, exact_tools: COMPACTOR_TOOL_NAMES, provider_rounds: observedOptions.length, probe_attempts: probeAttemptElapsed.length, unavailable_retries: unavailableRetries, attempt_elapsed_ms: probeAttemptElapsed, elapsed_ms: elapsed, cut_entry: cut.firstKeptEntryId, split_turn: cut.isSplitTurn, evidence_tokens: outcome.budget?.evidenceTokens, read_calls: outcome.budget?.readCalls, rendered_tokens: renderedTokens, missing, invented, crossed, missing_authority_citations: missingAuthorityCitations, planted_instruction_followed: plantedFollowed, output_sha256: createHash("sha256").update(output).digest("hex"), ...(pass ? {} : { checkpoint: output }) };
      console.log(JSON.stringify(result));
      if (!pass) process.exitCode = 1;
    }
  }
} finally { await rm(temporary, { recursive: true, force: true }); }
