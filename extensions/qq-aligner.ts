// @ts-nocheck

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AlignmentBroker } from "./lib/qq-alignment-broker.ts";
import { validateAlignmentEpisode } from "./lib/qq-alignment-contracts.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_PATH = resolve(ROOT, "delegation/manifests/roots/aligner.md");
const PROFILE = "qq-root-aligner-v1";
const TOOLS = [
  "alignment_exchange",
  "open_alignment_evidence",
  "create_alignment_artifact",
  "present_alignment",
  "capture_operator_disposition",
  "seal_alignment_package",
];

function toolResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
}

function toolFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `qq aligner refused: ${message}` }], isError: true };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameSet(left, right) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

export default async function register(pi, deps = {}) {
  if (process.env.QQ_PI_ROOT_PROFILE !== PROFILE) throw new Error("qq aligner extension loaded without the immutable aligner profile marker");
  const loadPrompt = deps.readFile ?? readFile;
  const prompt = await loadPrompt(PROMPT_PATH, "utf8");
  if (typeof prompt !== "string" || prompt.length === 0) throw new Error("qq aligner prompt is missing");
  const promptDigest = digest(prompt);
  const BrokerClass = deps.Broker ?? AlignmentBroker;
  let broker = null;
  let fatal = null;
  let pendingPresentation = null;

  pi.registerTool({
    name: "alignment_exchange",
    label: "Exchange with internal orchestrator",
    description: "Send one strict typed alignment request and receive one correlated typed projection.",
    parameters: { type: "object", additionalProperties: false, required: ["request"], properties: { request: { type: "object" } } },
    async execute(_id, params, signal) {
      try { return toolResult(await broker.exchange(params.request, signal)); } catch (error) { return toolFailure(error); }
    },
  });

  pi.registerTool({
    name: "open_alignment_evidence",
    label: "Open granted evidence",
    description: "Open only an opaque evidence capability and exact bounded byte subrange; paths are not accepted.",
    parameters: {
      type: "object", additionalProperties: false, required: ["capability_id", "offset", "length"],
      properties: { capability_id: { type: "string" }, offset: { type: "integer", minimum: 0 }, length: { type: "integer", minimum: 1, maximum: 65536 } },
    },
    async execute(_id, params) {
      try { return toolResult(await broker.openEvidence(params.capability_id, params.offset, params.length)); } catch (error) { return toolFailure(error); }
    },
  });

  pi.registerTool({
    name: "create_alignment_artifact",
    label: "Create explanatory artifact",
    description: "Create temporary Markdown, diagram, or script-free static-page orientation with capability provenance.",
    parameters: {
      type: "object", additionalProperties: false, required: ["kind", "title", "body", "provenance"],
      properties: { kind: { enum: ["markdown", "diagram", "static-page"] }, title: { type: "string" }, body: { type: "string" }, provenance: { type: "array", items: { type: "string" }, minItems: 1 } },
    },
    async execute(_id, params) {
      try { return toolResult(await broker.createArtifact(params)); } catch (error) { return toolFailure(error); }
    },
  });

  pi.registerTool({
    name: "present_alignment",
    label: "Validate alignment presentation",
    description: "Validate complementary spoken/visual initial, realignment, or acceptance material before presenting it.",
    parameters: { type: "object", additionalProperties: false, required: ["episode"], properties: { episode: { type: "object" } } },
    async execute(_id, params) {
      try {
        const episode = validateAlignmentEpisode(structuredClone(params.episode));
        if (episode.trace_id !== broker.traceId || (broker.changeId !== null && episode.change_id !== broker.changeId) || !broker.exchanges.has(episode.exchange_id)) throw new Error("presentation correlation is stale or foreign");
        if (episode.presentation.visual.provenance.some((id) => !broker.evidenceIds.has(id))) throw new Error("presentation provenance was not granted in this session");
        await broker.journal("alignment-presentation", { episode });
        pendingPresentation = episode;
        return toolResult({ accepted: true, episode });
      } catch (error) { return toolFailure(error); }
    },
  });

  pi.registerTool({
    name: "capture_operator_disposition",
    label: "Capture exact operator disposition",
    description: "Bind the current verbatim substantive response to one open decision and outcome, then on a later operator turn capture its exact accept, reject, reshape, or opt-out confirmation. A direct token may serve as both. Never infer or fabricate operator text.",
    parameters: {
      type: "object", additionalProperties: false, required: ["decision_id", "outcome", "operator_response"],
      properties: { decision_id: { type: "string" }, outcome: { enum: ["accepted", "rejected", "reshaped", "opted-out"] }, operator_response: { type: "string" } },
    },
    async execute(_id, params) {
      try { return toolResult(await broker.captureDisposition(params)); } catch (error) { return toolFailure(error); }
    },
  });

  pi.registerTool({
    name: "seal_alignment_package",
    label: "Seal alignment package",
    description: "Stop the internal orchestrator and seal the inspectable trace after acceptance finalization.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute() {
      try {
        const sealed = await broker.seal("finalized");
        return toolResult({ version: 1, package_id: sealed.package_id, change_id: sealed.change_id, trace_id: sealed.trace_id, journal_sha256: sealed.journal_sha256, sealed_at: sealed.sealed_at });
      } catch (error) { return toolFailure(error); }
    },
  });

  pi.registerCommand("architect", {
    description: "Explicitly request a separate architect root; never switch this session's role.",
    handler: async (_args, ctx) => {
      const execution = await pi.exec(resolve(ROOT, "bin/qq-architect"), ["--background"], { cwd: ctx.cwd });
      if (execution?.code === 0) ctx.ui.notify("Independent architect root started without focus change.", "info");
      else ctx.ui.notify(execution?.stderr?.trim() || "Independent architect launch refused; run qq-architect in a separate operator-created terminal.", "warning");
    },
  });

  pi.registerCommand("handoff", {
    description: "Refuse the retired focus-restoring handoff path; session replacement uses Pi lifecycle cleanup.",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Aligner handoff does not create or focus a Herdr tab. Use Pi /new or /resume; qq proves the old orchestrator stopped or records recovery before replacement.", "warning");
    },
  });

  async function prepareReplacement(event, ctx) {
    if (broker === null) return;
    try {
      await broker.prepareReplacement(event.reason, event.targetSessionFile ?? null);
    } catch (error) {
      fatal = error instanceof Error ? error.message : String(error);
      pendingPresentation = null;
      ctx.ui.notify(`qq aligner replacement refused: ${fatal}`, "error");
      return { cancel: true };
    }
  }

  pi.on("session_before_switch", prepareReplacement);
  pi.on("session_before_fork", (event, ctx) => prepareReplacement({ ...event, reason: "fork" }, ctx));

  pi.on("session_start", async (event, ctx) => {
    try {
      fatal = null; pendingPresentation = null;
      if (broker !== null) throw new Error("aligner session attempted to start a second broker");
      const piSessionFile = deps.piSessionFile ?? ctx.sessionManager?.getSessionFile?.() ?? null;
      if (piSessionFile === null) throw new Error("qq aligner requires a persistent root Pi session file");
      const resumeFromSessionFile = event.previousSessionFile ?? (event.reason === "reload" ? piSessionFile : null);
      broker = new BrokerClass(pi, {
        cwd: ctx.cwd,
        piSessionFile,
        resumeFromSessionFile,
        sessionReason: event.reason,
        ...(deps.brokerOptions ?? {}),
      });
      await broker.initialize();
      pi.setActiveTools(TOOLS);
    } catch (error) {
      fatal = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`qq aligner fail-closed: ${fatal}`, "error");
      ctx.shutdown();
    }
  });

  // The aligner extension is loaded before pi-subagents so its shutdown hook
  // runs while the old RPC bridge is still alive. Pi emits resources_discover
  // only after all session_start handlers, so the replacement bridge is ready
  // before this exact one-child spawn.
  pi.on("resources_discover", async (_event, ctx) => {
    if (fatal !== null || broker === null || broker.orchestratorLifecycle !== "not-started") return;
    try { await broker.startOrchestrator(); }
    catch (error) {
      fatal = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`qq aligner fail-closed: ${fatal}`, "error");
      ctx.shutdown();
    }
  });

  pi.on("input", async (event) => {
    if (broker !== null && !broker.journalClosed && (event.source === "interactive" || event.source === "rpc")) await broker.recordOperatorInput(event.text, event.source);
  });

  pi.on("before_agent_start", async (event) => {
    if (fatal !== null || broker === null || broker.orchestratorLifecycle !== "running") {
      throw new Error(`qq aligner profile is unavailable: ${fatal ?? "orchestrator not running"}`);
    }
    const livePrompt = await loadPrompt(PROMPT_PATH, "utf8");
    if (digest(livePrompt) !== promptDigest) throw new Error("qq aligner prompt source drifted during the session");
    if (process.env.QQ_PI_ROOT_PROFILE !== PROFILE) throw new Error("qq aligner role marker drifted");
    const active = pi.getActiveTools();
    if (!sameSet(active, TOOLS)) throw new Error(`qq aligner active-tool drift: ${JSON.stringify(active)}`);
    const options = event.systemPromptOptions ?? {};
    if ((options.contextFiles?.length ?? 0) !== 0 || (options.skills?.length ?? 0) !== 0 || options.customPrompt || (options.appendSystemPrompt?.length ?? 0) !== 0) {
      throw new Error("qq aligner inherited forbidden prompt/context resources");
    }
    return {
      systemPrompt: prompt,
      message: { customType: "qq-alignment-session-receipt", content: JSON.stringify(broker.sessionReceipt()), display: false },
    };
  });

  pi.on("message_end", async (event) => {
    const message = event?.message;
    if (pendingPresentation === null || message?.role !== "assistant") return;
    const renderedText = message.stopReason === "stop"
      && Array.isArray(message.content)
      && message.content.some((part) => part?.type === "text" && part.text.trim().length > 0);
    if (!renderedText) {
      if (["aborted", "error", "length"].includes(message.stopReason)) pendingPresentation = null;
      return;
    }
    if (broker === null || broker.journalClosed) { pendingPresentation = null; return; }
    const episode = pendingPresentation; pendingPresentation = null;
    const opening_reason = episode.outcome === "clarification" ? "clarification" : episode.episode === "realignment" ? "realignment" : episode.episode === "acceptance" ? "acceptance" : "decision";
    const receipt = { version: 1, change_id: episode.change_id, exchange_id: episode.exchange_id, trace_id: episode.trace_id, episode: episode.episode, opening_reason, opened_at: new Date().toISOString() };
    await broker.journal("alignment:operator-turn-opened", receipt);
    pi.events.emit("alignment:operator-turn-opened", receipt);
  });

  pi.on("agent_end", () => { pendingPresentation = null; });

  pi.on("session_shutdown", async (event) => {
    const old = broker;
    pendingPresentation = null;
    if (old === null) return;
    try {
      await old.shutdown(event.reason ?? "quit", { targetPiSessionFile: event.targetSessionFile ?? null });
      if (broker === old) broker = null;
      fatal = null;
    } catch (error) {
      fatal = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });
}

export const qqAlignerProfile = Object.freeze({ profile: PROFILE, promptPath: PROMPT_PATH, tools: TOOLS });
