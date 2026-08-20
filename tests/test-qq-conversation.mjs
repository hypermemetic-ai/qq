#!/usr/bin/env node
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { projectConversation } from "../qq/src/conversation.mjs";
import { createQqService } from "../qq/src/session.mjs";
import { renderSessionContent, truncateToolOutput } from "../qq-ui/src/render.mjs";
import { makeProjectsHome, qqConfig } from "./qq-projects-fixture.mjs";

const projects = makeProjectsHome("qq");
const sessionId = "session-63a11000-0000-4000-8000-000000000098";

function eventLog() {
  const events = [];
  const append = (type, data, surfaceOp) => {
    const event = {
      type,
      seq: events.length,
      time: Date.UTC(2026, 7, 20, 12, 0, events.length),
      data,
      ...(surfaceOp === undefined ? {} : { surfaceOp }),
    };
    events.push(event);
    return event;
  };
  return { events, append };
}

function message(id, text, source = { kind: "user" }) {
  return { id, role: "user", source, content: [{ type: "text", text }] };
}

function resultMessage(callId, content, isError = false) {
  return {
    id: `result-${callId}`,
    role: "user",
    source: { kind: "tool", callId },
    content: [{ type: "tool-result", toolCallId: callId, content, ...(isError ? { isError: true } : {}) }],
  };
}

try {
  // Durable inbox splices remain the queue authority. Pending rows stay
  // separate, then a complete next-step deletion hands them to steering nodes
  // without a duplicate or an empty projection in between.
  {
    const { events, append } = eventLog();
    const first = message("m-first", "start the turn");
    const steerOne = message("m-steer-1", "steer one");
    const steerTwo = message("m-steer-2", "steer two");
    append("agent/inbox/spliced", { target: "next-turn", start: 0, inserted: [first] });
    append("turn/start", { turn: 1 });
    append("agent/inbox/spliced", { target: "next-turn", start: 0, removedCount: 1, inserted: [] });
    append("user/message", first, "append");
    append("step/start", { turn: 1, step: 1 });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "reasoning-delta", index: 0, text: "  " } });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "reasoning-delta", index: 0, text: "checking both calls" } });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "text-delta", index: 1, text: "Working" } });
    append("agent/inbox/spliced", { target: "next-step", start: 0, inserted: [steerOne] });
    append("agent/inbox/spliced", { target: "next-step", start: 1, inserted: [steerTwo] });
    append("assistant/message", {
      turn: 1,
      step: 1,
      message: {
        id: "assistant-1",
        role: "assistant",
        source: { kind: "model", provider: "fixture", model: "proof" },
        content: [
          { type: "reasoning", text: "checking both calls" },
          { type: "text", text: "Working" },
        ],
      },
    }, "append");
    append("tool/call", { turn: 1, step: 1, callId: "call-a", name: "read", arguments: '{"path":"a.txt"}' });
    append("tool/call", { turn: 1, step: 1, callId: "call-b", name: "bash", arguments: '{"command":"false"}' });
    append("tool/result", { turn: 1, step: 1, message: resultMessage("call-a", [{ type: "text", text: "a" }]) }, "append");
    append("tool/result", { turn: 1, step: 1, message: resultMessage("call-b", [{ type: "text", text: "failed" }]) }, "append");

    const beforeClaim = projectConversation(events);
    assert.deepEqual(beforeClaim.pending.map((item) => item.id), ["m-steer-1", "m-steer-2"]);
    assert.equal(beforeClaim.nodes.filter((node) => node.kind === "steering").length, 0);
    assert.equal(beforeClaim.nodes.filter((node) => node.kind === "assistant").length, 1);
    assert.deepEqual(beforeClaim.nodes.find((node) => node.kind === "assistant").blocks, [
      { type: "reasoning", text: "checking both calls" },
      { type: "text", text: "Working" },
    ]);
    assert.deepEqual(beforeClaim.nodes.filter((node) => node.kind === "tool").map((node) => node.callId), ["call-a", "call-b"]);

    const firstResultSeq = events.find((event) => event.type === "tool/result").seq;
    const lastResultSeq = events.findLast((event) => event.type === "tool/result").seq;
    const claim = append("agent/inbox/spliced", { target: "next-step", start: 0, removedCount: 2, inserted: [] });
    assert.ok(claim.seq > firstResultSeq && claim.seq > lastResultSeq, "the fixture claims only after every parallel result");
    const duringHandoff = projectConversation(events);
    assert.equal(duringHandoff.pending.length, 0);
    assert.deepEqual(duringHandoff.nodes.filter((node) => node.kind === "steering").map((node) => node.messageId), ["m-steer-1", "m-steer-2"]);
    assert.ok(duringHandoff.nodes.filter((node) => node.kind === "steering").every((node) => node.claimed));

    append("user/message", steerOne, "append");
    append("user/message", steerTwo, "append");
    append("step/start", { turn: 1, step: 2 });
    append("assistant/chunk", { turn: 1, step: 2, chunk: { type: "text-delta", index: 0, text: "Both steers received" } });
    const delivered = projectConversation(events);
    const steering = delivered.nodes.filter((node) => node.kind === "steering");
    assert.deepEqual(steering.map((node) => node.messageId), ["m-steer-1", "m-steer-2"]);
    assert.ok(steering.every((node) => node.durable && !node.claimed));
    assert.equal(delivered.nodes.filter((node) => node.kind === "assistant").length, 2);
    assert.equal(events.filter((event) => event.type === "turn/start").length, 1);
  }

  // Projection roles, chunk settlement, tool rules, commands, retries,
  // compaction specialization, interruption, and unknown visible fallbacks.
  {
    const { events, append } = eventLog();
    append("user/message", message("human", "human words"), "append");
    append("user/message", message("context", "injected words", { kind: "plugin", plugin: "agent-instructions" }), "append");
    append("turn/start", { turn: 1 });
    append("step/start", { turn: 1, step: 1 });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "reasoning-delta", index: 0, text: "  " } });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "reasoning-delta", index: 0, text: "visible thought" } });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "text-delta", index: 1, text: "one answer" } });
    append("assistant/message", {
      turn: 1,
      step: 1,
      message: {
        id: "assistant-final",
        role: "assistant",
        source: { kind: "model", provider: "fixture", model: "proof" },
        content: [
          { type: "reasoning", text: "visible thought", encrypted_content: "never render me" },
          { type: "text", text: "one answer" },
        ],
      },
    }, "append");
    const routineCall = append("tool/call", { turn: 1, step: 1, callId: "ok", name: "read", arguments: '{"path":"README.md"}' });
    append("tool/result", { turn: 1, step: 1, message: resultMessage("ok", []) }, "append");
    const failedCall = append("tool/call", { turn: 1, step: 1, callId: "exit", name: "bash", arguments: '{"command":"exit 7"}' });
    const failedResult = append("tool/result", { turn: 1, step: 1, message: resultMessage("exit", [{ type: "text", text: "nope" }]) }, "append");
    append("tool/call", { turn: 1, step: 1, callId: "explicit", name: "read", arguments: '{"path":"missing"}' });
    append("tool/result", {
      turn: 1,
      step: 1,
      message: resultMessage("explicit", [{ type: "text", text: "not found" }], true),
      error: { name: "HarnessError", code: "NOT_FOUND" },
    }, "append");
    append("tool/call", { turn: 1, step: 1, callId: "media", name: "screenshot", arguments: "{}" });
    append("tool/result", { turn: 1, step: 1, message: resultMessage("media", [{ type: "image", attachment: { width: 10, height: 20 } }]) }, "append");
    append("tool/call", { turn: 1, step: 1, callId: "stopped", name: "bash", arguments: '{"command":"sleep 9"}' });
    append("llm/retry", {
      retryId: "retry-1", turn: 1, step: 1, provider: "fixture", mode: "normal",
      policyKey: "default", retry: 1, maxRetries: 3, delayMs: 500,
      failure: { code: "RATE_LIMIT", message: "provider detail" },
    });
    append("llm/retry-started", { retryId: "retry-1", turn: 1, step: 1, retry: 1 });
    append("turn/end", { turn: 1, reason: { kind: "aborted", reason: { kind: "user" } } });

    append("command/run", { commandId: "workflow", name: "workflows", args: " iterate", source: { kind: "user" } });
    append("command/done", { commandId: "workflow", kind: "success", text: "iterate selected" });
    append("command/run", { commandId: "empty", name: "noop", source: { kind: "user" } });
    append("command/done", { commandId: "empty", kind: "success" });
    append("command/run", { commandId: "bad", name: "broken", source: { kind: "user" } });
    append("command/done", { commandId: "bad", kind: "error", text: "safe failure" });
    append("command/run", { commandId: "compact-command", name: "compact", source: { kind: "user" } });
    append("compaction/start", { compactionId: "compact-1", sourceCommandId: "compact-command", turn: null });
    const summary = append("compaction/summary", {
      compactionId: "compact-1", sourceCommandId: "compact-command",
      summary: [{ type: "text", text: "summary body" }], shadowedRange: { start: 0, end: 1 },
      shadowedSeqs: [0, 1], shadowedTokenCount: 120, provider: "fixture", model: "proof",
    });
    append("user/message", {
      id: "compact-message", role: "user",
      source: { kind: "plugin", plugin: "compact", compactionId: "compact-1", sourceCommandId: "compact-command" },
      content: [{ type: "text", text: "model-facing framed summary" }],
    }, { op: "replace", start: 0, end: 1 });
    append("compaction/end", { compactionId: "compact-1", sourceCommandId: "compact-command", turn: null });
    append("command/done", { commandId: "compact-command", kind: "success", sourceEventSeq: summary.seq });
    append("future/operator-card", { summary: "future safe row", payload: "not rendered" }, "append");

    const toolViews = {
      [routineCall.seq]: { for: "call", view: { card: "generic", title: "Read README.md", kind: "read" } },
      [failedCall.seq]: { for: "call", view: { card: "terminal", title: "exit 7" } },
      [failedResult.seq]: { for: "result", view: { card: "terminal", output: "nope", exitCode: 7 } },
    };
    const conversation = projectConversation(events, { toolViews });
    assert.equal(conversation.nodes.filter((node) => node.kind === "user").length, 1);
    assert.equal(conversation.nodes.filter((node) => node.kind === "context").length, 1);
    assert.equal(conversation.nodes.find((node) => node.kind === "context").source.plugin, "agent-instructions");
    const assistants = conversation.nodes.filter((node) => node.kind === "assistant");
    assert.equal(assistants.length, 1, "the final append seals the streamed assistant exactly once");
    assert.equal(assistants[0].status, "settled");
    assert.equal(JSON.stringify(conversation).includes("never render me"), false);

    const routine = conversation.nodes.find((node) => node.kind === "tool" && node.callId === "ok");
    assert.equal(routine.status, "success");
    assert.equal(routine.expanded, false);
    const failed = conversation.nodes.find((node) => node.kind === "tool" && node.callId === "exit");
    assert.equal(failed.status, "error");
    assert.equal(failed.expanded, true);
    assert.equal(failed.resultView.card, "terminal");
    const explicit = conversation.nodes.find((node) => node.kind === "tool" && node.callId === "explicit");
    assert.equal(explicit.status, "error");
    assert.equal(explicit.expanded, true);
    assert.equal(conversation.nodes.find((node) => node.kind === "tool" && node.callId === "media").expanded, true);
    assert.equal(conversation.nodes.find((node) => node.kind === "tool" && node.callId === "stopped").status, "stopped");

    const commandNodes = conversation.nodes.filter((node) => node.kind === "command");
    assert.deepEqual(commandNodes.map((node) => node.name), ["workflows", "noop", "broken"]);
    assert.equal(commandNodes.find((node) => node.name === "noop").outcome.text, undefined);
    assert.equal(commandNodes.find((node) => node.name === "broken").status, "error");
    assert.equal(conversation.nodes.filter((node) => node.kind === "compaction").length, 1);
    assert.equal(conversation.nodes.find((node) => node.kind === "compaction").summary, "summary body");
    assert.equal(conversation.nodes.filter((node) => node.kind === "retry").length, 1);
    assert.equal(conversation.nodes.find((node) => node.kind === "fallback").eventType, "future/operator-card");

    const paths = {
      canonical: `/qq/session/${sessionId}`,
      prompt: `/qq/session/${sessionId}/prompt`,
      interrupt: `/qq/session/${sessionId}/interrupt`,
      queue: `/qq/session/${sessionId}/queue`,
      close: `/qq/session/${sessionId}/close`,
      createSession: "/qq/sessions",
      switchSession: "/qq/sessions/open",
    };
    const html = renderSessionContent({
      id: sessionId,
      events,
      conversation,
      agentStatus: "idle",
      canMutatePending: true,
      sessions: [{ id: sessionId, alias: "9" }],
      alias: "9",
    }, paths, "iterate selected");
    assert.match(html, /class="message message-context"/);
    assert.doesNotMatch(html, /injected words[\s\S]*class="message message-user"/);
    assert.doesNotMatch(html, /class="notice-ok"[^>]*>iterate selected/);
    assert.match(html, /<p class="message message-command"[^>]*><strong>\/workflows<\/strong><span>· iterate selected<\/span>/);
    assert.match(html, /<strong>\/noop<\/strong><span>· Completed<\/span>/);
    assert.match(html, /message-command command-error/);
    assert.match(html, /data-call-id="ok" data-card="generic">/);
    assert.match(html, /Completed with no output/);
    assert.match(html, /data-call-id="exit" data-card="terminal" open/);
    assert.match(html, /data-call-id="media"[^>]* open/);
    assert.match(html, /tool-stopped/);
    assert.match(html, /message-compaction/);
    assert.match(html, /future\/operator-card/);
  }

  // Empty/encrypted-only reasoning is absent; readable reasoning streams in one
  // subordinate body and the final append seals the same node once.
  {
    const { events, append } = eventLog();
    append("turn/start", { turn: 1 });
    append("step/start", { turn: 1, step: 1 });
    append("assistant/chunk", { turn: 1, step: 1, chunk: { type: "reasoning-delta", index: 0, text: "live reasoning" } });
    let conversation = projectConversation(events);
    assert.equal(conversation.nodes.filter((node) => node.kind === "assistant").length, 1);
    assert.equal(conversation.nodes.find((node) => node.kind === "assistant").status, "streaming");
    append("assistant/message", {
      turn: 1, step: 1,
      message: {
        id: "reasoned", role: "assistant", source: { kind: "model", provider: "fixture", model: "proof" },
        content: [{ type: "reasoning", text: "live reasoning", encrypted_content: "cipher" }],
      },
    }, "append");
    append("step/start", { turn: 1, step: 2 });
    append("assistant/message", {
      turn: 1, step: 2,
      message: {
        id: "encrypted", role: "assistant", source: { kind: "model", provider: "fixture", model: "proof" },
        content: [{ type: "reasoning", text: "   ", encrypted_content: "cipher-only" }],
      },
    }, "append");
    conversation = projectConversation(events);
    assert.equal(conversation.nodes.filter((node) => node.kind === "assistant").length, 1);
    assert.equal(conversation.nodes.find((node) => node.kind === "assistant").status, "settled");
    const html = renderSessionContent({ id: sessionId, events, conversation, agentStatus: "running" }, {
      canonical: `/qq/session/${sessionId}`,
      prompt: `/qq/session/${sessionId}/prompt`,
      interrupt: `/qq/session/${sessionId}/interrupt`,
      queue: `/qq/session/${sessionId}/queue`,
      createSession: "/qq/sessions",
      switchSession: "/qq/sessions/open",
    });
    assert.match(html, /class="assistant-reasoning" aria-label="Reasoning"/);
    assert.match(html, /live reasoning/);
    assert.doesNotMatch(html, /cipher|<details class="reasoning"/);
    assert.match(html, /id="composer" class="composer composer-running"/);
    assert.match(html, /id="interrupt-form"/);
    assert.match(html, /id="composer-submit"[^>]*>Send/);
    assert.match(html, /id="interrupt-submit"[^>]*>Interrupt/);
  }

  // Admission uses followup only while idle, steer while busy, flushes before
  // returning, preserves exact pending identities through edit/remove, executes
  // slash commands outside the inbox, and cancels with keepInbox.
  {
    const { events, append } = eventLog();
    const nextTurn = [];
    const nextStep = [];
    const admissions = [];
    const cancellations = [];
    const commandLines = [];
    let status = "idle";
    const splice = (target, start, removedCount, inserted, outcome) => {
      append("agent/inbox/spliced", {
        target,
        start,
        ...(removedCount ? { removedCount } : {}),
        inserted,
        ...(outcome ? { outcome } : {}),
      });
      const list = target === "next-turn" ? nextTurn : nextStep;
      return list.splice(start, removedCount, ...inserted);
    };
    const inbox = {
      get nextTurn() { return nextTurn; },
      get nextStep() { return nextStep; },
      replace(id, replacement) {
        for (const [target, list] of [["next-turn", nextTurn], ["next-step", nextStep]]) {
          const at = list.findIndex((candidate) => candidate.id === id);
          if (at >= 0) { splice(target, at, 1, [replacement], "canceled"); return true; }
        }
        return false;
      },
      remove(id) {
        for (const [target, list] of [["next-turn", nextTurn], ["next-step", nextStep]]) {
          const at = list.findIndex((candidate) => candidate.id === id);
          if (at >= 0) { splice(target, at, 1, [], "canceled"); return true; }
        }
        return false;
      },
    };
    const agent = {
      session: { id: sessionId, events, header: { createdAt: 1, cwd: projects.cwd } },
      inbox,
      get status() { return status; },
      followup(next) {
        admissions.push({ mode: "followup", id: next.id });
        splice("next-turn", nextTurn.length, 0, [next]);
        status = "running";
        append("turn/start", { turn: 1 });
        const [claimed] = splice("next-turn", 0, 1, []);
        append("user/message", claimed, "append");
      },
      steer(next) {
        admissions.push({ mode: "steer", id: next.id });
        splice("next-step", nextStep.length, 0, [next]);
      },
      cancel(cause, options) {
        cancellations.push({ cause, options });
        status = "idle";
        append("turn/end", { turn: 1, reason: { kind: "aborted", reason: cause } });
      },
      whenIdle: async () => {},
    };
    let flushes = 0;
    const commands = {
      parseCommand(line) {
        const match = /^\/([a-z][a-z0-9_-]*)/.exec(line);
        return match ? { name: match[1] } : undefined;
      },
      async execute(_agent, line) {
        commandLines.push(line);
        if (line !== "/now") return undefined;
        append("command/run", { commandId: "now", name: "now", source: { kind: "user" } });
        append("command/done", { commandId: "now", kind: "success" });
        return { commandId: "now", result: { kind: "success" } };
      },
    };
    const qq = createQqService({
      get(name) {
        if (name === "agents") return { get: () => agent, list: () => [agent] };
        if (name === "sessions") return { async flush() { flushes += 1; } };
        if (name === "sessionPersistence") return { async list() { return [{ id: sessionId, createdAt: 1, cwd: projects.cwd }]; } };
        if (name === "commands") return commands;
        return undefined;
      },
    }, qqConfig(projects, sessionId));

    const started = performance.now();
    const idleAdmission = await qq.prompt(sessionId, "first");
    assert.equal(idleAdmission.mode, "followup");
    assert.ok(performance.now() - started < 200, "idle admission does not await turn completion");
    const steerOne = await qq.prompt(sessionId, "steer one");
    const steerTwo = await qq.prompt(sessionId, "steer two");
    assert.equal(steerOne.mode, "steer");
    assert.equal(steerTwo.mode, "steer");
    assert.deepEqual(admissions.map((entry) => entry.mode), ["followup", "steer", "steer"]);
    let snapshot = await qq.read(sessionId);
    assert.deepEqual(snapshot.conversation.pending.map((item) => item.text), ["steer one", "steer two"]);

    const firstSteerId = snapshot.conversation.pending[0].id;
    const secondSteerId = snapshot.conversation.pending[1].id;
    await qq.editPending(sessionId, firstSteerId, "steer one edited");
    await qq.removePending(sessionId, secondSteerId);
    snapshot = await qq.read(sessionId);
    assert.deepEqual(snapshot.conversation.pending.map((item) => [item.id, item.text]), [[firstSteerId, "steer one edited"]]);
    assert.equal(projectConversation(events).pending[0].id, firstSteerId, "durable splice replay reconstructs the pending row");

    const beforeSlash = admissions.length;
    await qq.prompt(sessionId, "/now");
    assert.equal(admissions.length, beforeSlash);
    assert.deepEqual(commandLines, ["/now"]);
    assert.equal(nextStep.length, 1);

    assert.equal(await qq.interrupt(sessionId), true);
    assert.deepEqual(cancellations, [{ cause: { kind: "user" }, options: { keepInbox: true } }]);
    snapshot = await qq.read(sessionId);
    assert.deepEqual(snapshot.conversation.pending.map((item) => item.id), [firstSteerId]);
    assert.ok(flushes >= 6, "each admission and inbox mutation crosses a flush boundary");

    const pendingHtml = renderSessionContent(snapshot, {
      canonical: `/qq/session/${sessionId}`,
      prompt: `/qq/session/${sessionId}/prompt`,
      interrupt: `/qq/session/${sessionId}/interrupt`,
      queue: `/qq/session/${sessionId}/queue`,
      createSession: "/qq/sessions",
      switchSession: "/qq/sessions/open",
    });
    assert.match(pendingHtml, /id="pending-queue"/);
    assert.match(pendingHtml, /data-message-id="[^"]+"/);
    assert.match(pendingHtml, /Edit pending message 1/);
    assert.match(pendingHtml, /Remove pending message 1/);
    assert.match(pendingHtml, /name="itemId" value="[^"]+"/);
  }

  const long = `${Array.from({ length: 100 }, (_, index) => `line ${index}`).join("\n")}\n${"é".repeat(7_000)}`;
  const truncated = truncateToolOutput(long);
  assert.equal(truncated.truncated, true);
  assert.ok(truncated.preview.split("\n").length <= 80);
  assert.ok(new TextEncoder().encode(truncated.preview).length <= 12 * 1024);
  assert.equal(truncateToolOutput("short").truncated, false);
  const longHtml = renderSessionContent({
    id: sessionId,
    events: [],
    conversation: {
      pending: [],
      nodes: [{
        kind: "tool", key: "tool:long", seq: 1, callId: "long", name: "bash",
        status: "success", expanded: false, argumentSummary: "large output", resultView: null,
        callView: null, content: [{ type: "text", text: long }],
      }],
    },
    agentStatus: "idle",
  }, {
    canonical: `/qq/session/${sessionId}`,
    prompt: `/qq/session/${sessionId}/prompt`,
    interrupt: `/qq/session/${sessionId}/interrupt`,
    queue: `/qq/session/${sessionId}/queue`,
    createSession: "/qq/sessions",
    switchSession: "/qq/sessions/open",
  });
  assert.match(longHtml, /class="tool-output-full"/);
  assert.match(longHtml, /Show full output · 101 lines/);
} finally {
  projects.remove();
}

console.log("test-qq-conversation: pass");
