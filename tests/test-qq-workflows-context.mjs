#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const pluginModule = await import(pathToFileURL(join(root, "qq-workflows/src/plugin.mjs")));
const contextModule = await import(pathToFileURL(join(root, "qq-workflows/src/context.mjs")));
const transitionModule = await import(pathToFileURL(join(root, "qq-workflows/src/transition.mjs")));
const { CHILD_ORIGIN } = await import(pathToFileURL(join(root, "qq-workflows/src/architect.mjs")));

const {
  DEFAULT_ACCEPTED_CONTEXTS,
  LEAVE_REASONS,
  SESSION_CONTEXTS,
  normalizeAcceptedContexts,
  assertLeaveReason,
  assertSessionContext,
  lifecycleRefused,
} = contextModule;
const { createWorkflowSessionApi } = transitionModule;

const scratch = mkdtempSync(join(tmpdir(), "qq-workflows-context."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("000000000001");
const childId = sessionId("000000000099");

function chair(id = alphaId) {
  return { id, session: { id, events: [], header: {} } };
}

function child() {
  return { id: childId, session: { id: childId, events: [], header: { origin: CHILD_ORIGIN } } };
}

function applyPlugin({ agents = [], selectionDir, onDisposed } = {}) {
  const live = new Map(agents.map((agent) => [agent.session.id, agent]));
  const provided = {};
  const events = new Map();
  pluginModule.apply({
    get(name) {
      if (name === "agents") {
        return { list: () => [...live.values()], get: (id) => live.get(id) ?? null };
      }
      if (name === "sessions") return {};
      return provided[name];
    },
    provide(name, value) { provided[name] = value; },
    effect(fn) { fn(); return () => {}; },
    on(type, handler) {
      events.set(type, handler);
      return () => {};
    },
  }, {
    notebookDir: join(scratch, "notes", selectionDir ?? "default"),
    selectionDir: join(scratch, "selected", selectionDir ?? "default"),
  });
  if (onDisposed) onDisposed(events.get("agent/disposed"));
  return provided["qq-workflows"];
}

function spec(name, extra = {}) {
  const attached = extra.attached ?? [];
  const detached = extra.detached ?? [];
  return {
    name,
    candidate: extra.candidate ?? ((agent) => agent?.session?.header?.origin !== CHILD_ORIGIN),
    ensureAttached: extra.ensureAttached ?? ((agent) => {
      attached.push(agent.session.id);
    }),
    ensureDetached: extra.ensureDetached ?? ((agentOrId) => {
      detached.push(typeof agentOrId === "string" ? agentOrId : agentOrId.session.id);
    }),
    listSettings: extra.listSettings ?? (() => `${name} has no roles`),
    writeSettings: extra.writeSettings ?? (() => { throw new Error(`${name} has no roles`); }),
    ...(extra.acceptedContexts !== undefined ? { acceptedContexts: extra.acceptedContexts } : {}),
    attached,
    detached,
  };
}

function host(workflows, { selected = new Map(), persist, agents = new Map() } = {}) {
  const map = new Map(Object.entries(workflows));
  return createWorkflowSessionApi({
    getWorkflow: (name) => map.get(name) ?? null,
    selectedName: (id) => selected.get(id) ?? null,
    persistSelection: persist ?? ((id, name) => {
      if (name == null) selected.delete(id);
      else selected.set(id, name);
    }),
    liveAgent: (id) => agents.get(id) ?? null,
    names: () => [...map.keys()],
  });
}

try {
  assert.deepEqual(SESSION_CONTEXTS, ["project", "scratch"]);
  assert.deepEqual(LEAVE_REASONS, [
    "back", "home", "workflow-switch", "context-navigation", "session-close",
  ]);
  assert.deepEqual(pluginModule.SESSION_CONTEXTS, SESSION_CONTEXTS);
  assert.deepEqual(pluginModule.LEAVE_REASONS, LEAVE_REASONS);
  assert.equal(pluginModule.DEFAULT_ACCEPTED_CONTEXTS, DEFAULT_ACCEPTED_CONTEXTS);
  assert.equal(Object.isFrozen(DEFAULT_ACCEPTED_CONTEXTS), true);
  assert.equal(normalizeAcceptedContexts(undefined), DEFAULT_ACCEPTED_CONTEXTS);
  assert.equal(normalizeAcceptedContexts(["project"]), DEFAULT_ACCEPTED_CONTEXTS);
  assert.deepEqual(normalizeAcceptedContexts(["scratch"]), ["scratch"]);
  assert.deepEqual(normalizeAcceptedContexts(["scratch", "project", "scratch"]), ["scratch", "project"]);
  assert.throws(() => normalizeAcceptedContexts([]), /non-empty/);
  assert.throws(() => normalizeAcceptedContexts("project"), /non-empty/);
  assert.throws(() => normalizeAcceptedContexts(["home"]), /invalid session context/);
  assert.equal(assertSessionContext("scratch"), "scratch");
  assert.throws(() => assertSessionContext("none"), /invalid session context/);
  assert.equal(assertLeaveReason("home"), "home");
  assert.throws(() => assertLeaveReason("architect"), /invalid leave reason/);
  assert.equal(lifecycleRefused(false), true);
  assert.equal(lifecycleRefused({ status: "refused" }), true);
  assert.equal(lifecycleRefused({ ok: false }), true);
  assert.equal(lifecycleRefused(undefined), false);
  assert.equal(lifecycleRefused({ status: "ok" }), false);

  const transitionSource = readFileSync(join(root, "qq-workflows/src/transition.mjs"), "utf8");
  assert.equal(/architect|iterate|\bfind\b/.test(transitionSource), false);

  {
    const service = applyPlugin({ agents: [chair()], selectionDir: "builtins" });
    for (const name of ["architect", "iterate", "find"]) {
      assert.deepEqual(service.workflows.acceptedContexts(name), ["project"]);
      assert.equal(service.workflows.accepts(name, "project"), true);
      assert.equal(service.workflows.accepts(name, "scratch"), false);
      assert.deepEqual(service.workflows.describe(name), {
        name,
        acceptedContexts: ["project"],
      });
    }
    assert.deepEqual(service.workflows.accepting("project").sort(), ["architect", "find", "iterate"]);
    assert.deepEqual(service.workflows.accepting("scratch"), []);
    assert.equal(service.workflows.acceptedContexts("mystery"), null);
    assert.equal(service.workflows.describe("mystery"), null);
    assert.equal(service.workflows.accepts("mystery", "project"), false);
  }

  {
    const attached = [];
    const detached = [];
    const agent = chair();
    const service = applyPlugin({ agents: [agent], selectionDir: "legacy-default" });
    const media = spec("media", { attached, detached });
    service.workflows.register(media);
    assert.deepEqual(service.workflows.acceptedContexts("media"), ["project"]);
    assert.equal(service.workflows.accepts("media", "project"), true);
    assert.equal(service.workflows.accepts("media", "scratch"), false);
    media.acceptedContexts = ["scratch"];
    assert.deepEqual(service.workflows.acceptedContexts("media"), ["project"]);
    assert.throws(
      () => service.workflows.register(spec("bad", { acceptedContexts: ["home"] })),
      /invalid session context/,
    );
  }

  {
    const projectAttached = [];
    const projectDetached = [];
    const scratchAttached = [];
    const scratchDetached = [];
    const dualAttached = [];
    const dualDetached = [];
    const agent = chair();
    const kid = child();
    const service = applyPlugin({
      agents: [agent, kid],
      selectionDir: "fakes",
    });
    service.workflows.register(spec("boards", {
      acceptedContexts: ["project"],
      attached: projectAttached,
      detached: projectDetached,
    }));
    service.workflows.register(spec("drafts", {
      acceptedContexts: ["scratch"],
      attached: scratchAttached,
      detached: scratchDetached,
    }));
    service.workflows.register(spec("notes", {
      acceptedContexts: ["project", "scratch"],
      attached: dualAttached,
      detached: dualDetached,
    }));

    assert.equal(service.workflows.compatible({ name: "boards", context: "project", sessionId: alphaId }), true);
    assert.equal(service.workflows.compatible({ name: "boards", context: "scratch" }), false);
    assert.equal(service.workflows.compatible({ name: "drafts", context: "scratch", agent }), true);
    assert.equal(service.workflows.compatible({ name: "drafts", context: "scratch", agent: kid }), false);
    assert.deepEqual(service.workflows.accepting("scratch").sort(), ["drafts", "notes"]);

    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "missing", context: "project", reason: "workflow-switch" }),
      /unknown workflow/,
    );
    assert.equal(service.workflows.selected(alphaId), null);

    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "boards", context: "scratch", reason: "workflow-switch" }),
      /does not accept scratch/,
    );
    assert.equal(service.workflows.selected(alphaId), null);
    assert.deepEqual(projectAttached, []);

    await assert.rejects(
      () => service.workflows.transition(childId, { name: "notes", context: "project", reason: "workflow-switch" }),
      /child session/,
    );
    assert.equal(service.workflows.selected(childId), null);

    assert.equal(
      await service.workflows.transition(alphaId, { name: "boards", context: "project", reason: "home" }),
      "boards",
    );
    assert.equal(service.workflows.selected(alphaId), "boards");
    assert.deepEqual(projectAttached, [alphaId]);

    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "drafts", context: "project", reason: "workflow-switch" }),
      /does not accept project/,
    );
    assert.equal(service.workflows.selected(alphaId), "boards");
    assert.deepEqual(projectDetached, []);

    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "ghost", context: "project", reason: "workflow-switch" }),
      /unknown workflow/,
    );
    assert.equal(service.workflows.selected(alphaId), "boards");

    assert.equal(
      await service.workflows.transition(alphaId, { name: "boards", context: "project", reason: "workflow-switch" }),
      "boards",
    );
    assert.deepEqual(projectAttached, [alphaId, alphaId]);
    assert.deepEqual(projectDetached, []);

    assert.equal(
      await service.workflows.transition(alphaId, { name: "notes", context: "scratch", reason: "workflow-switch" }),
      "notes",
    );
    assert.equal(service.workflows.selected(alphaId), "notes");
    assert.deepEqual(projectDetached, [alphaId]);
    assert.deepEqual(dualAttached, [alphaId]);

    assert.equal(await service.workflows.leave(alphaId, "back"), null);
    assert.equal(service.workflows.selected(alphaId), null);
    assert.deepEqual(dualDetached, [alphaId]);
    assert.equal(await service.workflows.leave(alphaId, "back"), null);

    await assert.rejects(() => service.workflows.leave(alphaId, "architect"), /invalid leave reason/);
  }

  {
    const agent = chair();
    const service = applyPlugin({ agents: [agent], selectionDir: "async-leave" });
    let finished = false;
    service.workflows.register({
      ...spec("slow", { acceptedContexts: ["project"] }),
      async ensureDetached() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        finished = true;
      },
    });
    await service.workflows.transition(alphaId, { name: "slow", context: "project", reason: "home" });
    const leaving = service.workflows.leave(alphaId, "back");
    assert.equal(finished, false);
    assert.equal(await leaving, null);
    assert.equal(finished, true);
    assert.equal(service.workflows.selected(alphaId), null);
  }

  {
    const detached = [];
    const attached = [];
    const agent = chair();
    let refuseLeave = false;
    let throwLeave = false;
    const service = applyPlugin({ agents: [agent], selectionDir: "leave-refuse" });
    service.workflows.register({
      ...spec("sticky", { acceptedContexts: ["project"], attached, detached }),
      async ensureDetached(agentOrId) {
        detached.push(typeof agentOrId === "string" ? agentOrId : agentOrId.session.id);
        if (throwLeave) throw new Error("leave exploded");
        if (refuseLeave) return { status: "refused", reason: "still working" };
      },
    });
    await service.workflows.transition(alphaId, { name: "sticky", context: "project", reason: "home" });
    refuseLeave = true;
    await assert.rejects(() => service.workflows.leave(alphaId, "home"), /still working/);
    assert.equal(service.workflows.selected(alphaId), "sticky");
    refuseLeave = false;
    throwLeave = true;
    await assert.rejects(() => service.workflows.leave(alphaId, "session-close"), /leave exploded/);
    assert.equal(service.workflows.selected(alphaId), "sticky");
    throwLeave = false;
    await service.workflows.leave(alphaId, "session-close");
    assert.equal(service.workflows.selected(alphaId), null);
  }

  {
    const boardsDetached = [];
    const draftsAttached = [];
    const draftsDetached = [];
    const agent = chair();
    const service = applyPlugin({ agents: [agent], selectionDir: "attach-fail" });
    service.workflows.register(spec("boards", {
      acceptedContexts: ["project"],
      detached: boardsDetached,
    }));
    service.workflows.register({
      ...spec("drafts", { acceptedContexts: ["scratch"], attached: draftsAttached, detached: draftsDetached }),
      async ensureAttached() {
        draftsAttached.push("attempt");
        throw new Error("attach exploded");
      },
    });
    await service.workflows.transition(alphaId, { name: "boards", context: "project", reason: "home" });
    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "drafts", context: "scratch", reason: "workflow-switch" }),
      /attach exploded/,
    );
    assert.equal(service.workflows.selected(alphaId), null);
    assert.deepEqual(boardsDetached, [alphaId]);
    assert.deepEqual(draftsAttached, ["attempt"]);
    assert.ok(draftsDetached.includes(alphaId));
  }

  {
    const boardsDetached = [];
    const agent = chair();
    const service = applyPlugin({ agents: [agent], selectionDir: "attach-refuse" });
    service.workflows.register(spec("boards", {
      acceptedContexts: ["project"],
      detached: boardsDetached,
    }));
    service.workflows.register({
      ...spec("drafts", { acceptedContexts: ["scratch"] }),
      async ensureAttached() {
        return { status: "refused", reason: "not ready" };
      },
    });
    await service.workflows.transition(alphaId, { name: "boards", context: "project", reason: "home" });
    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "drafts", context: "scratch", reason: "workflow-switch" }),
      /not ready/,
    );
    assert.equal(service.workflows.selected(alphaId), null);
    assert.deepEqual(boardsDetached, [alphaId]);
  }

  {
    const selected = new Map([[alphaId, "alpha"]]);
    const attached = [];
    const detached = [];
    const persistLog = [];
    const agent = chair();
    let failPersist = false;
    const api = host({
      alpha: {
        name: "alpha",
        acceptedContexts: DEFAULT_ACCEPTED_CONTEXTS,
        candidate: () => true,
        async ensureAttached() { attached.push("alpha"); },
        async ensureDetached() { detached.push("alpha"); },
      },
      beta: {
        name: "beta",
        acceptedContexts: ["scratch"],
        candidate: () => true,
        async ensureAttached() { attached.push("beta"); },
        async ensureDetached() { detached.push("beta"); },
      },
    }, {
      selected,
      agents: new Map([[alphaId, agent]]),
      persist(id, name) {
        persistLog.push([id, name]);
        if (failPersist === true || (failPersist === "target" && name != null)) {
          throw new Error("disk full");
        }
        if (name == null) selected.delete(id);
        else selected.set(id, name);
      },
    });

    failPersist = true;
    await assert.rejects(() => api.leave(alphaId, "back"), /disk full/);
    assert.equal(selected.get(alphaId), "alpha");
    assert.deepEqual(detached, ["alpha"]);
    assert.deepEqual(attached, ["alpha"]);

    failPersist = false;
    await api.leave(alphaId, "back");
    assert.equal(selected.has(alphaId), false);

    selected.set(alphaId, "alpha");
    failPersist = "target";
    await assert.rejects(
      () => api.transition(alphaId, { name: "beta", context: "scratch", reason: "workflow-switch" }),
      /disk full/,
    );
    assert.equal(selected.has(alphaId), false);
    assert.ok(detached.includes("beta"));
    assert.ok(persistLog.some((entry) => entry[1] === "beta"));
    assert.ok(persistLog.some((entry) => entry[1] === null));
  }

  {
    const selected = new Map([[alphaId, "alpha"]]);
    const attached = [];
    const api = host({
      alpha: {
        name: "alpha",
        acceptedContexts: DEFAULT_ACCEPTED_CONTEXTS,
        candidate: () => true,
        async ensureAttached() { attached.push("alpha"); throw new Error("cannot resume"); },
        async ensureDetached() {},
      },
    }, {
      selected,
      agents: new Map([[alphaId, chair()]]),
      persist(id, name) {
        if (name == null && attached.length === 0) throw new Error("disk full");
        if (name == null) selected.delete(id);
        else selected.set(id, name);
      },
    });
    await assert.rejects(() => api.leave(alphaId, "back"), /disk full/);
    assert.equal(selected.has(alphaId), false);
  }

  {
    const agent = chair();
    let disposeAgent;
    const service = applyPlugin({
      agents: [agent],
      selectionDir: "dispose",
      onDisposed(handler) { disposeAgent = handler; },
    });
    const detached = [];
    service.workflows.register(spec("media", { detached }));
    await service.workflows.transition(alphaId, { name: "media", context: "project", reason: "home" });
    disposeAgent({ agent });
    assert.deepEqual(detached, [alphaId]);
    assert.equal(service.workflows.selected(alphaId), "media");
  }

  {
    const agent = chair();
    const service = applyPlugin({ agents: [agent], selectionDir: "unbound-leave" });
    const dispose = service.workflows.register(spec("media"));
    await service.workflows.transition(alphaId, { name: "media", context: "project", reason: "home" });
    dispose();
    assert.equal(service.workflows.selected(alphaId), "media");
    assert.equal(service.workflows.describe("media"), null);
    assert.equal(await service.workflows.leave(alphaId, "session-close"), null);
    assert.equal(service.workflows.selected(alphaId), null);
  }

  {
    const dir = "restart";
    const service = applyPlugin({ agents: [chair()], selectionDir: dir });
    service.workflows.register(spec("drafts", { acceptedContexts: ["scratch"] }));
    await service.workflows.transition(alphaId, { name: "drafts", context: "scratch", reason: "home" });
    const again = applyPlugin({ agents: [chair()], selectionDir: dir });
    assert.equal(again.workflows.selected(alphaId), "drafts");
    again.workflows.register(spec("drafts", { acceptedContexts: ["scratch"] }));
    assert.equal(again.workflows.accepts("drafts", "scratch"), true);
  }

  {
    const service = applyPlugin({ agents: [chair()], selectionDir: "select-compat" });
    service.workflows.register(spec("media"));
    assert.equal(service.workflows.select(alphaId, "media"), "media");
    assert.equal(service.workflows.selected(alphaId), "media");
    assert.equal(service.workflows.clear(alphaId), null);
  }

  {
    const agent = chair();
    const service = applyPlugin({ agents: [agent], selectionDir: "architect-leave" });
    assert.equal(service.workflows.select(alphaId, "architect"), "architect");
    assert.ok(service.architect.attached(alphaId));
    assert.equal(await service.workflows.leave(alphaId, "home"), null);
    assert.equal(service.workflows.selected(alphaId), null);
    assert.equal(service.architect.attached(alphaId), undefined);
    assert.equal(
      await service.workflows.transition(alphaId, { name: "architect", context: "project", reason: "workflow-switch" }),
      "architect",
    );
    assert.ok(service.architect.attached(alphaId));
    await assert.rejects(
      () => service.workflows.transition(alphaId, { name: "architect", context: "scratch", reason: "workflow-switch" }),
      /does not accept scratch/,
    );
    assert.equal(service.workflows.selected(alphaId), "architect");
  }

  console.log("test-qq-workflows-context: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
