#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConsoleHandler, internals as httpInternals } from "../qq-ui/src/http-app.mjs";
import {
  renderDocumentViewer,
  renderDocumentViewerTrigger,
  renderSessionContent,
} from "../qq-ui/src/render.mjs";
import { createProjectFileService, MAX_READABLE_FILE_BYTES } from "../qq/src/files.mjs";
import {
  compareSessionRecency,
  createQqService,
  isRootOperatorAgent,
  listProjectCatalog,
  resolveProjectsRoot,
  sessionRecency,
} from "../qq/src/session.mjs";
import { addProject, attachHandle, makeProjectsHome } from "./qq-projects-fixture.mjs";

const alphaId = "session-63a11000-0000-4000-8000-0000000000a1";
const betaId = "session-63a11000-0000-4000-8000-0000000000b2";
const gammaId = "session-63a11000-0000-4000-8000-0000000000c3";
const childId = "session-63a11000-0000-4000-8000-0000000000d4";
const nestedId = "session-63a11000-0000-4000-8000-0000000000e5";
const persistedOnly = "session-63a11000-0000-4000-8000-0000000000f6";
const groupedCoreId = "session-73a11000-0000-4000-8000-0000000000a7";
const groupedLogicId = "session-73a11000-0000-4000-8000-0000000000b8";

const projects = makeProjectsHome("alpha");
const alphaCwd = projects.cwd;
const betaCwd = addProject(projects.root, "beta");
mkdirSync(join(projects.root, ".agents"));
mkdirSync(join(alphaCwd, "nested"));
mkdirSync(join(alphaCwd, "nested", "deeper"));
writeFileSync(join(alphaCwd, "README.md"), "# Alpha\n\n<script>nope</script>\n");
writeFileSync(join(alphaCwd, "notes.txt"), "one calm line\n");
writeFileSync(join(alphaCwd, "config.yaml"), "name: proof\nindent:\n  nested: true\n");
writeFileSync(join(alphaCwd, "unbroken.txt"), `${"abcdefghijklmnopqrstuvwxyz0123456789".repeat(12)}\n`);
writeFileSync(join(alphaCwd, "nested", "sample.js"), "const answer = 42;\n");
writeFileSync(join(alphaCwd, "manual.pdf"), Buffer.from("%PDF-1.4 proof"));
writeFileSync(join(alphaCwd, "mystery.bin"), Buffer.from([0, 1, 2, 3]));
writeFileSync(join(alphaCwd, "huge.txt"), "x".repeat(MAX_READABLE_FILE_BYTES + 1));
writeFileSync(join(betaCwd, "logic.js"), "export const logical = true;\n");
writeFileSync(join(betaCwd, "logic.pdf"), Buffer.from("%PDF-1.4 logic"));
const outside = makeProjectsHome("escape");
writeFileSync(join(outside.cwd, "secret.txt"), "outside\n");
symlinkSync(outside.cwd, join(projects.root, "escaped"));
symlinkSync(outside.cwd, join(alphaCwd, "escape-link"));
symlinkSync(betaCwd, join(alphaCwd, "beta-link"));
writeFileSync(join(projects.root, "file.txt"), "nope");

let emptyRoot;

try {
  assert.equal(resolveProjectsRoot(projects.root), projects.root);
  const catalog = listProjectCatalog(projects.root);
  assert.deepEqual(catalog.map((row) => row.name), ["alpha", "beta"]);
  assert.equal(catalog.find((row) => row.name === ".agents"), undefined);
  assert.equal(catalog.find((row) => row.name === "escaped"), undefined);
  assert.deepEqual(catalog[0].folders, [{ name: "alpha", label: "alpha", cwd: alphaCwd }]);

  const hostPatch = readFileSync(join(fileURLToPath(new URL("../qq", import.meta.url)), "host.patch.yml"), "utf8");
  const catalogStart = hostPatch.indexOf("projectCatalog:");
  const catalogEnd = hostPatch.indexOf("\n        provider:", catalogStart);
  assert.notEqual(catalogStart, -1);
  assert.notEqual(catalogEnd, -1);
  const productionCatalog = hostPatch.slice(catalogStart, catalogEnd);
  assert.match(productionCatalog, /root: !!js process\.env\.HOME \+ '\/projects'/);
  assert.deepEqual(
    [...productionCatalog.matchAll(/^\s+- name: ([a-z0-9-]+)\s*$/gmu)].map((match) => match[1]),
    ["deciq", "discuss", "everything-box", "inference-box", "media-box", "qq", "ytgrab"],
    "the production catalog registers exactly the operator project set",
  );
  const productionLabels = [...productionCatalog.matchAll(/\blabel:\s*([^,}\n]+)/gu)]
    .map((match) => match[1].trim());
  assert.equal(
    productionLabels.every((label) => label === label.toLowerCase()),
    true,
    "every configured production project and folder label is lowercase",
  );
  function productionProject(name, label, ...folderFlows) {
    const start = productionCatalog.indexOf(`- name: ${name}`);
    assert.notEqual(start, -1, `production catalog must register ${name}`);
    const nextStart = productionCatalog.indexOf("\n            - name: ", start + 1);
    const block = productionCatalog.slice(start, nextStart === -1 ? undefined : nextStart);
    assert.match(block, new RegExp(`label: ${label}`));
    let previous = -1;
    for (const flow of folderFlows) {
      const position = block.indexOf(flow);
      assert.ok(
        position !== -1 && position > previous,
        `production catalog must list ${flow} in order under ${name}`,
      );
      previous = position;
    }
  }
  productionProject("deciq", "deciq",
    "- { name: core, label: core, path: deciq }",
    "- { name: logic, label: logic, path: deciq-logic }");
  productionProject("qq", "qq",
    "- { name: core, label: qq core, path: qq }",
    "- { name: relay, label: relay, path: qq-relay }",
    "- { name: dictation, label: dictation, path: qq-dictation }",
    "- { name: newspaper, label: newspaper, path: qq-newspaper }",
    "- { name: dashboard, label: dashboard, path: qq-dashboard }",
    "- { name: image-finder, label: image finder, path: image-finder }");
  for (const [name, label] of [
    ["discuss", "discuss"],
    ["everything-box", "everything box"],
    ["inference-box", "inference box"],
    ["media-box", "media box"],
    ["ytgrab", "ytgrab"],
  ]) {
    productionProject(name, label, `- { name: ${name}, label: ${label}, path: ${name} }`);
  }

  const groupedRegistration = {
    root: projects.root,
    projects: [
      {
        name: "suite",
        label: "Suite",
        folders: [
          { name: "core", label: "Core", path: "alpha" },
          { name: "logic", label: "Logic", path: "beta" },
          { name: "missing", label: "Missing plugin", path: "missing-plugin" },
        ],
      },
      {
        name: "hidden",
        label: "Hidden",
        folders: [{ name: "agents", label: "Agents", path: ".agents" }],
      },
      {
        name: "optional",
        label: "Optional",
        folders: [{ name: "optional", label: "Optional", path: "not-installed" }],
      },
    ],
  };
  const groupedCatalog = listProjectCatalog(projects.root, groupedRegistration);
  assert.deepEqual(groupedCatalog.map((row) => row.name), ["suite"]);
  assert.equal(groupedCatalog[0].label, "Suite");
  assert.equal(groupedCatalog[0].grouped, true);
  assert.deepEqual(groupedCatalog[0].folders.map((folder) => folder.label), ["Core", "Logic"]);
  assert.deepEqual(
    listProjectCatalog(projects.root, { ...groupedRegistration, root: outside.root }).map((row) => row.name),
    ["alpha", "beta"],
    "a catalog scoped to another root preserves automatic immediate-child discovery",
  );
  assert.deepEqual(
    listProjectCatalog(projects.root, { ...groupedRegistration, root: join(tmpdir(), "qq-missing-operator-root") })
      .map((row) => row.name),
    ["alpha", "beta"],
    "an absent production catalog root does not break an alternate projectsRoot",
  );
  assert.throws(() => listProjectCatalog(projects.root, {
    projects: [{
      name: "escape",
      folders: [{ name: "escape", path: "escaped" }],
    }],
  }), /registered folder escape escapes projectsRoot/);
  assert.throws(() => listProjectCatalog(projects.root, {
    projects: [
      { name: "one", folders: [{ name: "core", path: "alpha" }] },
      { name: "two", folders: [{ name: "core", path: "alpha" }] },
    ],
  }), /registered by both one and two/);

  const dialog = renderDocumentViewer({
    title: "bash",
    identity: "complete tool output",
    kind: "terminal",
    text: "ok\n",
  }, { mode: "dialog", id: "tool-output" });
  assert.match(dialog, /id="tool-output" class="document-viewer document-viewer-dialog"/);
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(dialog, /data-document-viewer-close>Close</);
  assert.match(dialog, /document-pre document-terminal/);
  assert.match(renderDocumentViewerTrigger("tool-output"), /Open full screen/);
  assert.match(renderDocumentViewerTrigger("tool-output"), /data-document-viewer-open="tool-output"/);
  const loading = renderDocumentViewer({ title: "out", identity: "complete tool output", state: "loading" }, { mode: "dialog", id: "load" });
  assert.match(loading, /document-state-loading/);
  assert.match(loading, /role="status"/);

  const groupedFiles = createProjectFileService(projects.root, () => groupedCatalog);
  assert.deepEqual(groupedFiles.listProjectFiles().entries, [{
    name: "Suite", type: "project", project: "suite",
  }]);
  const groupedRoot = groupedFiles.listProjectFiles("suite");
  assert.deepEqual(groupedRoot.entries.map((entry) => entry.name), ["Core", "Logic"]);
  assert.deepEqual(groupedRoot.entries.map((entry) => entry.path), ["core", "logic"]);
  assert.deepEqual(groupedRoot.entries.map((entry) => entry.primary), [true, false]);
  const groupedLogic = groupedFiles.listProjectFiles("suite", "logic");
  assert.deepEqual(groupedLogic.breadcrumbs.map((crumb) => crumb.name), ["projects", "Suite", "Logic"]);
  assert.equal(groupedLogic.entries.some((entry) => entry.path === "logic/logic.js"), true);
  assert.equal(groupedFiles.readProjectFile("suite", "core/README.md").text.startsWith("# Alpha"), true);
  assert.equal(groupedFiles.readProjectFile("suite", "logic/logic.js").text, "export const logical = true;\n");
  assert.equal(groupedFiles.openProjectFile("suite", "logic/logic.pdf").body.toString(), "%PDF-1.4 logic");
  assert.throws(
    () => groupedFiles.listProjectFiles("suite", "core/beta-link"),
    /escapes the selected project/,
    "directory listing cannot cross from one registered folder to another",
  );
  assert.throws(
    () => groupedFiles.readProjectFile("suite", "core/beta-link/logic.js"),
    /escapes the selected project/,
    "text reads cannot cross from one registered folder to another",
  );
  assert.throws(
    () => groupedFiles.openProjectFile("suite", "core/beta-link/logic.pdf"),
    /escapes the selected project/,
    "binary opens cannot cross from one registered folder to another",
  );
  assert.throws(() => groupedFiles.listProjectFiles("suite", "core/../logic"), /canonical and project-relative/);
  assert.throws(() => groupedFiles.listProjectFiles("suite", "unknown"), /project folder not found/);

  emptyRoot = mkdtempSync(join(tmpdir(), "qq-projects-empty."));
  const bare = { get() { return undefined; } };
  assert.throws(() => createQqService(bare, {
    sessionId: alphaId,
    cwd: alphaCwd,
    projectsRoot: emptyRoot,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  }), /projectsRoot has no operator projects/);
  assert.throws(() => createQqService(bare, {
    sessionId: alphaId,
    cwd: join(alphaCwd, "nested"),
    projectsRoot: projects.root,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  }), /cwd must equal one project root/);

  const groupedLive = new Map();
  const groupedPersisted = new Map();
  const groupedCreates = [];
  const groupedResumes = [];
  const groupedDisposed = [];

  function groupedAgent(id, cwd, createdAt) {
    const agent = {
      session: { id, events: [], header: { cwd, createdAt } },
      status: "idle",
      followup() {},
      cancel() {},
      whenIdle: async () => {},
    };
    groupedLive.set(id, agent);
    groupedPersisted.set(id, { id, cwd, createdAt });
    attachHandle(agent, async () => {
      groupedDisposed.push(id);
      groupedLive.delete(id);
    });
    return agent;
  }

  groupedAgent(groupedCoreId, alphaCwd, 10);
  groupedAgent(groupedLogicId, betaCwd, 20);
  const groupedCtx = {
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => groupedLive.get(id),
          list: () => [...groupedLive.values()],
          async create(options) {
            groupedCreates.push(options);
            const agent = groupedAgent(options.sessionId, options.meta.cwd, Date.now());
            return agent[Symbol.for("@hypermemetic-ai/qq/agent-handle")];
          },
          async resume(options) {
            groupedResumes.push(options.resumeSessionId);
            throw new Error("grouped sessions must not resume during navigation");
          },
        };
      }
      if (name === "sessions") return { async flush() {} };
      if (name === "sessionPersistence") {
        return { async list() { return [...groupedPersisted.values()]; } };
      }
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };
  const groupedQq = createQqService(groupedCtx, {
    sessionId: groupedLogicId,
    cwd: betaCwd,
    projectsRoot: projects.root,
    scratchRoot: join(projects.root, ".qq-scratch"),
    scopeFile: join(projects.root, "session-scope.json"),
    projectCatalog: groupedRegistration,
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  });
  assert.equal(groupedQq.defaultProject, "suite", "a secondary registered folder can be the boot cwd");
  assert.deepEqual(groupedQq.listProjects().map((project) => project.name), ["suite"]);
  const groupedRows = await groupedQq.list("suite");
  assert.deepEqual(new Set(groupedRows.map((row) => row.id)), new Set([groupedCoreId, groupedLogicId]));
  assert.equal(groupedRows.every((row) => row.project === "suite" && row.projectLabel === "Suite"), true);
  const groupedSnapshot = await groupedQq.read(groupedLogicId);
  assert.equal(groupedSnapshot.cwd, betaCwd);
  assert.equal(groupedSnapshot.project, "suite");
  assert.equal(groupedSnapshot.projectLabel, "Suite");

  const primaryCreated = await groupedQq.create("suite");
  assert.equal(primaryCreated.cwd, alphaCwd, "creating from a logical project route uses its primary folder");
  const createdFromLogic = await groupedQq.prompt(groupedLogicId, "/new");
  assert.equal(createdFromLogic.action, "create");
  assert.equal(createdFromLogic.cwd, betaCwd, "/new stays in the selected session's registered folder");
  assert.equal(groupedLive.has(groupedLogicId), true, "/new leaves the selected session live");
  const clearedLogic = await groupedQq.prompt(groupedLogicId, "/clear");
  assert.equal(clearedLogic.action, "replace");
  assert.equal(clearedLogic.cwd, betaCwd, "/clear stays in the selected session's registered folder");
  assert.equal(groupedLive.has(groupedLogicId), false);
  assert.equal(groupedPersisted.has(groupedLogicId), true, "/clear preserves durable history");
  assert.equal(groupedLive.has(groupedCoreId), true, "folder-local lifecycle leaves sibling folder sessions alone");
  assert.deepEqual(groupedCreates.map((entry) => entry.meta.cwd), [alphaCwd, betaCwd, betaCwd]);
  assert.deepEqual(groupedResumes, [], "catalog and lifecycle navigation never resume a session");
  assert.equal(groupedDisposed.includes(groupedLogicId), true);

  const live = new Map();
  const persisted = new Map([
    [persistedOnly, { id: persistedOnly, createdAt: 1, cwd: alphaCwd }],
  ]);
  const creates = [];
  const resumes = [];
  const flushes = [];
  const disposed = [];
  let failNextCreate = false;

  function fake(id, options = {}) {
    const cwd = options.cwd ?? alphaCwd;
    const createdAt = options.createdAt ?? Date.now();
    const events = options.events ?? [];
    const header = {
      createdAt,
      cwd,
      ...(options.parentSession ? { parentSession: options.parentSession } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    };
    let status = options.status ?? "idle";
    const agent = {
      session: { id, events, header },
      get status() { return status; },
      setStatus(next) { status = next; },
      followup() {},
      cancel() {},
      whenIdle: async () => {},
    };
    live.set(id, agent);
    if (!persisted.has(id)) persisted.set(id, { id, createdAt, cwd });
    attachHandle(agent, async () => {
      disposed.push(id);
      live.delete(id);
    });
    return agent;
  }

  const ctx = {
    get(name) {
      if (name === "agents") {
        return {
          get: (id) => live.get(id),
          list: () => [...live.values()],
          async create(options) {
            if (failNextCreate) {
              failNextCreate = false;
              throw new Error("qq-projects probe: create failed");
            }
            creates.push(options);
            const id = options.sessionId;
            const cwd = options.meta?.cwd;
            assert.ok(cwd === alphaCwd || cwd === betaCwd, "operator agents stay on a project root");
            return {
              agent: fake(id, { cwd, createdAt: Date.now() }),
              async dispose() {
                disposed.push(id);
                live.delete(id);
              },
            };
          },
          async resume(options) {
            resumes.push(options.resumeSessionId);
            throw new Error("silent resume must not happen");
          },
        };
      }
      if (name === "sessions") return { async flush(session) { flushes.push(session.id); } };
      if (name === "sessionPersistence") {
        return { async list() { return [...persisted.values()]; } };
      }
      if (name === "loader") return { async await() {} };
      return undefined;
    },
  };

  fake(alphaId, {
    cwd: alphaCwd,
    createdAt: 10,
    events: [{ type: "user/message", time: 40, seq: 0 }],
  });
  fake(betaId, {
    cwd: alphaCwd,
    createdAt: 30,
    events: [{ type: "user/message", time: 20, seq: 0 }],
  });
  fake(gammaId, { cwd: betaCwd, createdAt: 50 });
  fake(childId, { cwd: alphaCwd, parentSession: alphaId, origin: "subagent", createdAt: 90 });
  fake(nestedId, { cwd: join(alphaCwd, "nested"), createdAt: 80 });

  assert.equal(isRootOperatorAgent(live.get(childId)), false);
  assert.equal(isRootOperatorAgent(live.get(alphaId)), true);
  assert.equal(
    compareSessionRecency(
      sessionRecency(live.get(alphaId).session, 10),
      sessionRecency(live.get(betaId).session, 30),
    ) < 0,
    true,
    "later durable event wins over later createdAt",
  );

  const qq = createQqService(ctx, {
    sessionId: alphaId,
    cwd: alphaCwd,
    projectsRoot: projects.root,
    scratchRoot: join(projects.root, ".qq-scratch"),
    scopeFile: join(projects.root, "session-scope.json"),
    provider: "qwen-token-plan",
    model: "deepseek-v4-pro-0813",
  });

  const projectLevel = qq.listProjectFiles();
  assert.equal(projectLevel.scope, "projects");
  assert.deepEqual(projectLevel.entries.map((entry) => entry.name), ["alpha", "beta"]);
  assert.equal(projectLevel.entries.every((entry) => entry.type === "project"), true);

  const alphaLevel = qq.listProjectFiles("alpha");
  assert.equal(alphaLevel.scope, "project");
  assert.equal(alphaLevel.path, "");
  assert.equal(alphaLevel.parent, null);
  assert.equal(alphaLevel.entries.some((entry) => entry.name === "escape-link"), false);
  assert.deepEqual(alphaLevel.entries.find((entry) => entry.name === "README.md"), {
    name: "README.md", type: "file", path: "README.md", kind: "markdown",
  });
  assert.deepEqual(alphaLevel.entries.find((entry) => entry.name === "manual.pdf"), {
    name: "manual.pdf", type: "file", path: "manual.pdf", kind: "binary",
    mediaType: "application/pdf", disposition: "inline",
  });
  const nestedLevel = qq.listProjectFiles("alpha", "nested");
  assert.equal(nestedLevel.parent, "");
  assert.deepEqual(nestedLevel.entries.map((entry) => entry.name), ["deeper", "sample.js"]);
  assert.deepEqual(nestedLevel.breadcrumbs.map((crumb) => crumb.name), ["projects", "alpha", "nested"]);
  assert.throws(() => qq.listProjectFiles("alpha", "escape-link"), /escapes the selected project/);
  assert.throws(() => qq.listProjectFiles("alpha", "../beta"), /canonical and project-relative/);

  const markdownFile = qq.readProjectFile("alpha", "README.md");
  assert.equal(markdownFile.kind, "markdown");
  assert.match(markdownFile.text, /# Alpha/);
  const codeFile = qq.readProjectFile("alpha", "nested/sample.js");
  assert.equal(codeFile.language, "javascript");
  assert.equal(codeFile.text, "const answer = 42;\n");
  assert.throws(() => qq.readProjectFile("alpha", "huge.txt"), /exceeds the 512 KiB limit/);
  assert.throws(() => qq.readProjectFile("alpha", "mystery.bin"), /unsupported file type/);
  assert.throws(() => qq.readProjectFile("alpha", "escape-link/secret.txt"), /escapes the selected project/);
  const pdf = qq.openProjectFile("alpha", "manual.pdf");
  assert.equal(pdf.mediaType, "application/pdf");
  assert.equal(pdf.disposition, "inline");
  assert.equal(pdf.body.toString(), "%PDF-1.4 proof");
  const pdfHead = qq.openProjectFile("alpha", "manual.pdf", { includeBody: false });
  assert.equal(pdfHead.body, undefined);
  assert.throws(() => qq.openProjectFile("alpha", "README.md"), /text file must use/);

  const listedAlpha = await qq.list("alpha");
  assert.deepEqual(listedAlpha.map((row) => row.id), [alphaId, betaId]);
  assert.equal(listedAlpha.some((row) => row.id === persistedOnly), false);
  assert.equal(listedAlpha.some((row) => row.id === childId), false);
  assert.equal(listedAlpha.some((row) => row.id === nestedId), false);
  assert.equal(listedAlpha.some((row) => row.id === gammaId), false);

  const listedBeta = await qq.list("beta");
  assert.deepEqual(listedBeta.map((row) => row.id), [gammaId]);

  await assert.rejects(() => qq.read(persistedOnly), /not active/);
  const inspected = await qq.inspect(persistedOnly);
  assert.equal(inspected.live, false);
  assert.equal(resumes.length, 0);

  const created = await qq.create("alpha");
  assert.equal(created.project, "alpha");
  assert.equal(created.cwd, alphaCwd);
  const afterCreate = await qq.list("alpha");
  assert.equal(afterCreate.length, 3);
  assert.equal(flushes.includes(created.id), true);
  const otherRunning = live.get(gammaId);
  otherRunning.setStatus("running");
  assert.equal(live.get(gammaId).status, "running");

  live.get(betaId).setStatus("running");
  await assert.rejects(() => qq.replace(betaId), /clear is unavailable while this session is running/);
  await assert.rejects(() => qq.close(betaId), /close is unavailable while this session is running/);
  assert.equal(live.has(betaId), true);
  live.get(betaId).setStatus("idle");

  const beforeFailedReplace = (await qq.list("alpha")).length;
  failNextCreate = true;
  await assert.rejects(() => qq.replace(alphaId), /create failed/);
  assert.equal(failNextCreate, false);
  assert.equal(live.has(alphaId), true, "a failed /clear create leaves the old Agent active");
  assert.equal(disposed.length, 0, "a failed /clear create disposes nothing");
  assert.equal((await qq.list("alpha")).length, beforeFailedReplace, "a failed /clear create leaves no replacement");

  const beforeReplace = (await qq.list("alpha")).length;
  const replaced = await qq.replace(betaId);
  assert.equal(replaced.closed, betaId);
  assert.equal(replaced.project, "alpha");
  assert.equal(live.has(betaId), false);
  assert.equal(persisted.has(betaId), true, "replace leaves durable history");
  assert.equal((await qq.list("alpha")).length, beforeReplace);
  assert.equal(live.get(gammaId).status, "running", "other project running agent is untouched");

  const closed = await qq.close(created.id);
  assert.equal(closed.closed, created.id);
  assert.equal(closed.project, "alpha");
  assert.equal(live.has(created.id), false);
  assert.equal(persisted.has(created.id), true);
  assert.ok([alphaId, replaced.id].includes(closed.id));

  await qq.close(alphaId);
  await qq.close(replaced.id);
  const empty = await qq.list("alpha");
  assert.equal(empty.length, 0);
  live.get(gammaId).setStatus("idle");
  const last = await qq.close((await qq.list("beta"))[0].id);
  assert.equal(last.id, null);
  assert.equal(last.project, "beta");
  assert.equal((await qq.list("beta")).length, 0);
  assert.equal(resumes.length, 0);

  const server = createServer(createConsoleHandler(qq, { ssePollMs: 20 }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const request = (path, options = {}) => new Promise((resolveRequest, reject) => {
    const body = options.body ?? "";
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      path,
      method: options.method ?? "GET",
      headers: options.headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolveRequest({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end(body);
  });
  const form = (fields = {}) => {
    const body = new URLSearchParams(fields).toString();
    return {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": Buffer.byteLength(body),
        origin,
        "sec-fetch-site": "same-origin",
      },
      body,
    };
  };

  try {
    const home = await request("/qq/");
    assert.equal(home.status, 303);
    assert.equal(home.headers.location, "/qq/project/alpha");

    const emptyProject = await request("/qq/project/alpha");
    assert.equal(emptyProject.status, 200);
    assert.match(emptyProject.body, /aria-label="New session">\+<\/button>/);
    assert.doesNotMatch(emptyProject.body, /id="transcript"|id="composer"|add session/);
    assert.match(emptyProject.body, /no live sessions/);

    const added = await request("/qq/project/alpha/sessions", form());
    assert.equal(added.status, 303);
    assert.match(added.headers.location, /^\/qq\/project\/alpha\/session\/session-/);
    const newId = added.headers.location.split("/").at(-1);
    const page = await request(added.headers.location);
    assert.equal(page.status, 200);
    assert.match(page.body, new RegExp(`option value="${newId}" selected`));
    assert.match(page.body, /class="close-arm"/);
    assert.match(page.body, /close session /);
    assert.match(page.body, /history is kept/);
    assert.match(page.body, /class="close-keep"/);
    assert.match(page.body, /id="close-session"/);
    assert.match(page.body, /id="project-drawer-toggle"[^>]*aria-expanded="false"[^>]*>files<\/button>/);
    assert.match(page.body, /id="project-drawer"[^>]*aria-hidden="true"[^>]*inert/);
    assert.match(page.body, /data-entry-type="directory"[^>]*href="[^\"]*\?drawer=nested"/);
    assert.doesNotMatch(page.body, /# Alpha|one calm line|cwd|preview/i);

    const openDrawer = await request(`${added.headers.location}?drawer=`);
    assert.equal(openDrawer.status, 200);
    assert.match(openDrawer.body, /<body class="drawer-open">/);
    assert.match(openDrawer.body, /id="project-drawer-toggle"[^>]*aria-expanded="true"/);
    assert.match(openDrawer.body, /id="project-drawer"[^>]*aria-hidden="false"/);
    assert.match(openDrawer.body, />~\/projects<\/a>[\s\S]*>alpha<\/span>/);
    assert.match(openDrawer.body, /aria-label="Read file README.md"/);
    assert.match(openDrawer.body, /data-file-path="README.md"/);
    assert.match(openDrawer.body, /aria-label="Open file manual.pdf"/);
    assert.match(openDrawer.body, new RegExp(`href="/qq/project/alpha/session/${newId}/file/README\\.md"`));
    assert.match(openDrawer.body, new RegExp(`href="/qq/project/alpha/session/${newId}/open/manual\\.pdf"`));

    const nestedDrawer = await request(`${added.headers.location}?drawer=nested`);
    assert.equal(nestedDrawer.status, 200);
    assert.match(nestedDrawer.body, />nested<\/span>/);
    assert.match(nestedDrawer.body, /sample\.js/);
    assert.doesNotMatch(nestedDrawer.body, /README\.md/);
    const projectsDrawer = await request(`${added.headers.location}?drawer=~`);
    assert.equal(projectsDrawer.status, 200);
    assert.match(projectsDrawer.body, />~\/projects<\/span>/);
    assert.match(projectsDrawer.body, /aria-label="Open project alpha"/);
    assert.match(projectsDrawer.body, /aria-label="Open project beta"/);

    const lifecycleBeforeProjectChoice = {
      creates: creates.length,
      disposed: disposed.length,
      resumes: resumes.length,
      live: live.size,
    };
    const betaChoice = await request("/qq/project/beta?drawer=");
    assert.equal(betaChoice.status, 200);
    assert.deepEqual({
      creates: creates.length,
      disposed: disposed.length,
      resumes: resumes.length,
      live: live.size,
    }, lifecycleBeforeProjectChoice, "choosing a project is URL-only and changes no session lifecycle");
    assert.match(betaChoice.body, /no live sessions/);

    const markdownView = await request("/qq/project/alpha/file/README.md");
    assert.equal(markdownView.status, 200);
    assert.match(markdownView.body, /class="document-viewer document-viewer-page"/);
    assert.match(markdownView.body, /class="message-text message-markdown document-prose"/);
    assert.match(markdownView.body, /Back to console/);
    assert.match(markdownView.body, /href="\/qq\/project\/alpha"/);
    assert.match(markdownView.body, /<h1>Alpha<\/h1>/);
    const sessionFileView = await request(`/qq/project/alpha/session/${newId}/file/README.md`);
    assert.equal(sessionFileView.status, 200);
    assert.match(sessionFileView.body, new RegExp(`class="document-viewer-close" href="/qq/project/alpha/session/${newId}"`));
    assert.match(markdownView.body, /&lt;script&gt;nope&lt;\/script&gt;/);
    assert.doesNotMatch(markdownView.body, /<script>nope<\/script>/);
    assert.doesNotMatch(markdownView.body, /id="console-stream"|id="composer"|id="project-drawer"/);
    assert.doesNotMatch(markdownView.body, /90ch|72ch|file-surface/);

    const codeView = await request("/qq/project/alpha/file/nested%2Fsample.js");
    assert.equal(codeView.status, 200);
    assert.match(codeView.body, /class="hljs language-javascript"/);
    assert.match(codeView.body, /hljs-keyword/);
    const yamlView = await request("/qq/project/alpha/file/config.yaml");
    assert.equal(yamlView.status, 200);
    assert.match(yamlView.body, /class="hljs language-yaml"/);
    const longLineView = await request("/qq/project/alpha/file/unbroken.txt");
    assert.equal(longLineView.status, 200);
    assert.match(longLineView.body, /class="document-pre document-text"/);
    const textView = await request("/qq/project/alpha/file/notes.txt");
    assert.equal(textView.status, 200);
    assert.match(textView.body, /document-pre document-text/);
    assert.match(textView.body, /one calm line/);
    const proofView = await request("/qq/__document-viewer-proof");
    assert.equal(proofView.status, 200);
    assert.match(proofView.body, /Open full screen/);
    assert.match(proofView.body, /data-document-viewer-open="proof-yaml"/);
    assert.match(proofView.body, /id="proof-diff" class="document-viewer document-viewer-dialog"/);
    assert.match(proofView.body, /document-state-loading/);
    assert.match(proofView.body, /document-state-error/);
    assert.match(proofView.body, /document-state-empty/);
    assert.match(proofView.body, /hljs language-diff/);
    assert.match(proofView.body, /document-pre document-terminal/);
    assert.match(proofView.body, /data-proof-kind="yaml"[\s\S]*data-document-viewer-open="proof-yaml">Open full screen<\/button>[\s\S]*<pre class="document-viewer-proof-preview">/);

    const oversizedView = await request("/qq/project/alpha/file/huge.txt");
    assert.equal(oversizedView.status, 413);
    assert.match(oversizedView.body, /File is too large/);
    assert.match(oversizedView.body, /512 KiB limit/);
    const unsupportedView = await request("/qq/project/alpha/file/mystery.bin");
    assert.equal(unsupportedView.status, 415);
    assert.match(unsupportedView.body, /Preview unavailable/);
    assert.match(unsupportedView.body, /unsupported file type/);
    const pdfOpen = await request("/qq/project/alpha/open/manual.pdf");
    assert.equal(pdfOpen.status, 200);
    assert.equal(pdfOpen.headers["content-type"], "application/pdf");
    assert.match(pdfOpen.headers["content-disposition"], /^inline;/);
    assert.equal(pdfOpen.body, "%PDF-1.4 proof");
    const escapedRead = await request("/qq/project/alpha/file/escape-link%2Fsecret.txt");
    assert.equal(escapedRead.status, 403);
    assert.match(escapedRead.body, /escapes the selected project/);

    live.get(newId).setStatus("running");
    const runningClear = await request(`/qq/project/alpha/session/${newId}/prompt`, {
      ...form({ prompt: "/clear" }),
      headers: { ...form({ prompt: "/clear" }).headers, "hx-request": "true" },
    });
    assert.equal(runningClear.status, 409);
    assert.match(runningClear.body, /clear is unavailable while this session is running/);
    assert.equal(live.has(newId), true);
    const runningClose = await request(`/qq/project/alpha/session/${newId}/close`, {
      ...form(),
      headers: { ...form().headers, "hx-request": "true" },
    });
    assert.equal(runningClose.status, 409);
    assert.match(runningClose.body, /close is unavailable while this session is running/);
    live.get(newId).setStatus("idle");

    const cleared = await request(`/qq/project/alpha/session/${newId}/prompt`, form({ prompt: "/clear" }));
    assert.equal(cleared.status, 303);
    assert.match(cleared.headers.location, /^\/qq\/project\/alpha\/session\/session-/);
    assert.notEqual(cleared.headers.location, `/qq/project/alpha/session/${newId}`);
    assert.equal(live.has(newId), false);
    assert.equal(persisted.has(newId), true);

    const parallel = await request(`/qq/project/alpha/session/${cleared.headers.location.split("/").at(-1)}/prompt`, form({ prompt: "/new" }));
    assert.equal(parallel.status, 303);
    assert.match(parallel.headers.location, /^\/qq\/project\/alpha\/session\/session-/);
    assert.equal((await qq.list("alpha")).length, 2);

    const mismatch = await request(`/qq/project/beta/session/${cleared.headers.location.split("/").at(-1)}`);
    assert.equal(mismatch.status, 404);
    const inactiveLegacy = await request(`/qq/session/${persistedOnly}`);
    assert.equal(inactiveLegacy.status, 404);
    assert.match(inactiveLegacy.body, /not active/);
    assert.equal(resumes.length, 0);

    const parsed = httpInternals.parseProjectRoute("/qq", `/qq/project/alpha/session/${alphaId}/prompt`);
    assert.deepEqual(parsed, { project: "alpha", sessionId: alphaId, action: "prompt" });
    const parsedFile = httpInternals.parseProjectRoute("/qq", `/qq/project/alpha/session/${alphaId}/file/README.md`);
    assert.deepEqual(parsedFile, {
      project: "alpha",
      sessionId: alphaId,
      filePath: "README.md",
      action: "file",
    });

    const emptyHtml = renderSessionContent({
      id: "",
      project: "alpha",
      events: [],
      sessions: [],
    }, httpInternals.routes("/qq", "", "alpha"));
    assert.match(emptyHtml, /aria-label="New session">\+<\/button>/);
    assert.doesNotMatch(emptyHtml, /drawer-edge/);
    assert.doesNotMatch(emptyHtml, /id="transcript"|id="composer"|add session|close-arm/);

    const legacyHtml = renderSessionContent({ id: "", events: [], sessions: [] }, httpInternals.routes("/qq", ""));
    assert.doesNotMatch(legacyHtml, /drawer-edge/);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }

  console.log("test-qq-projects: pass");
} finally {
  projects.remove();
  outside.remove();
  rmSync(emptyRoot, { recursive: true, force: true });
}
