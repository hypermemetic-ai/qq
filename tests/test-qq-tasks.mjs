#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const namesModule = await import(pathToFileURL(join(root, "qq-tasks/src/names.mjs")));
const storeModule = await import(pathToFileURL(join(root, "qq-tasks/src/store.mjs")));
const settingsModule = await import(pathToFileURL(join(root, "qq-tasks/src/settings.mjs")));
const serviceModule = await import(pathToFileURL(join(root, "qq-tasks/src/service.mjs")));
const pluginModule = await import(pathToFileURL(join(root, "qq-tasks/src/plugin.mjs")));
const workflowsPlugin = await import(pathToFileURL(join(root, "qq-workflows/src/plugin.mjs")));
const workflowsTools = await import(pathToFileURL(join(root, "qq-workflows/src/tools.mjs")));

const {
  FROZEN, FIRST_OVERFLOW_START, FIRST_OVERFLOW_END, farthestFirst, dealId, overflowBand, normalizeId,
} = namesModule;
const {
  BOOK_SCHEMA, DEFAULT_PROJECT, createTaskStore, defaultStoreDir, defaultProject, parseTicket, formatTicket,
} = storeModule;
const { TASKS_SETTINGS_SCHEMA, createTasksSettings } = settingsModule;
const { createTasksService, RUNDOWN_SYSTEM } = serviceModule;
const { buildArchitectTools } = workflowsTools;

const scratch = mkdtempSync(join(tmpdir(), "qq-tasks."));
const sessionId = (marker) =>
  `session-63a11000-0000-4000-8000-${String(marker).padStart(12, "0")}`;
const alphaId = sessionId("000000000001");

try {
  assert.equal(pluginModule.name, "qq-tasks");
  assert.equal(pluginModule.provide, "qq-tasks");
  assert.deepEqual(pluginModule.inject, []);
  assert.equal(BOOK_SCHEMA, "qq.tasks-book/v1");
  assert.equal(DEFAULT_PROJECT, "qq");
  assert.equal(TASKS_SETTINGS_SCHEMA, "qq.tasks-settings/v1");
  assert.equal(FROZEN.length, 99);
  assert.deepEqual([...FROZEN], [
    "1", "2", "3", "4", "6", "7", "8", "10", "12", "20", "30", "40", "60", "70", "80",
    "200", "201", "202", "203", "204", "206", "207", "208", "210", "212", "220", "230", "240", "260", "280",
    "300", "301", "302", "303", "304", "306", "307", "308", "310", "312", "320", "330", "340", "360", "380",
    "400", "401", "402", "403", "404", "406", "407", "408", "410", "412", "420", "430", "440", "460", "480",
    "600", "601", "602", "603", "604", "606", "607", "608", "610", "612", "620", "630", "640", "660", "680",
    "700", "701", "702", "703", "704", "706", "708", "710", "712",
    "800", "801", "802", "803", "804", "806", "807", "808", "810", "812", "820", "830", "840", "860", "880",
  ]);
  assert.equal(new Set(FROZEN).size, 99);
  assert.equal(FIRST_OVERFLOW_START, 1000);
  assert.equal(FIRST_OVERFLOW_END, 9999);
  assert.deepEqual(overflowBand(1000), { start: 1000, end: 9999 });
  assert.deepEqual(overflowBand(10_000), { start: 10_000, end: 99_999 });
  assert.equal(normalizeId("340"), "340");
  assert.equal(normalizeId(12), "12");
  assert.throws(() => normalizeId("T-1"), /invalid id/);
  assert.throws(() => normalizeId("0"), /invalid id/);

  assert.equal(
    defaultStoreDir({ DSH_HOME: "/state/qq/dsh-workbench" }, {}),
    "/state/qq/.qq-tasks",
  );
  assert.equal(defaultStoreDir({}, { storeDir: "/x/tasks" }), "/x/tasks");
  assert.throws(() => defaultStoreDir({}, { storeDir: "relative" }), /absolute path/);
  assert.throws(() => defaultStoreDir({ DSH_HOME: "relative" }, {}), /absolute path/);
  assert.equal(defaultProject({}), "qq");
  assert.equal(defaultProject({ project: "desk" }), "desk");
  assert.throws(() => defaultProject({ project: "../x" }), /invalid project/);

  const launcher = readFileSync(join(root, "bin/qq"), "utf8");
  const patch = readFileSync(join(root, "qq/host.patch.yml"), "utf8");
  const tasksPkg = JSON.parse(readFileSync(join(root, "qq-tasks/package.json"), "utf8"));
  assert.doesNotMatch(launcher, /qq-tasks|QQ_DSH_HAVE_TASKS/);
  assert.doesNotMatch(patch, /qq-tasks|QQ_DSH_HAVE_TASKS/);
  assert.match(launcher, /qq-\*\/package\.json/);
  assert.equal(tasksPkg.name, "@hypermemetic-ai/qq-tasks");
  assert.equal(tasksPkg.dsh?.bundle?.patch, "./cordis.patch.yml");

  assert.equal(farthestFirst(FROZEN, [], () => 0), "1");
  assert.equal(farthestFirst(FROZEN, [], () => 0.5), FROZEN[Math.floor(0.5 * FROZEN.length)]);
  assert.equal(farthestFirst(["2", "3", "880"], ["1"], () => 0), "880");
  assert.equal(dealId([], [], () => 0), "1");
  assert.equal(dealId(["1"], [], () => 0), "880");
  assert.equal(dealId(FROZEN, [], () => 0), "9999");
  assert.equal(dealId(FROZEN, [], () => 0.999), "9999");

  {
    const parsed = parseTicket("# Title\n\nBody line\n");
    assert.equal(parsed.title, "Title");
    assert.equal(parsed.body, "Body line");
    assert.deepEqual(parsed.labels, []);
    const labeled = parseTicket("---\nlabels:\n  - later\n  - private\n---\n# Hang\n\nprose\n");
    assert.equal(labeled.title, "Hang");
    assert.equal(labeled.body, "prose");
    assert.deepEqual(labeled.labels, ["later", "private"]);
    const formatted = formatTicket({ title: "Hang", body: "prose", labels: ["later"] });
    assert.match(formatted, /^---\nlabels:\n  - later\n---\n# Hang\n\nprose$/);
  }

  // create / read / list / edit / append / archive
  {
    const dir = join(scratch, "crud");
    const store = createTaskStore(dir, { project: "qq", rng: () => 0 });
    const id = store.create({ title: "First land", body: "empty pile" });
    assert.equal(id, "1");
    assert.equal(statSync(dir).mode & 0o777, 0o700);
    const file = join(dir, "qq", "1.md");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(join(dir, "book.json")).mode & 0o777, 0o600);
    const read = store.read(id);
    assert.deepEqual(read, {
      id: "1",
      project: "qq",
      title: "First land",
      body: "empty pile",
      labels: [],
    });
    const listed = store.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, "1");
    assert.equal(listed[0].title, "First land");
    assert.equal(listed[0].oneLine, "empty pile");
    assert.deepEqual(listed[0].labels, []);
    assert.equal(listed[0].project, "qq");

    store.edit(id, { title: "Renamed", labels: ["keep"] });
    const edited = store.read(id);
    assert.equal(edited.id, "1");
    assert.equal(edited.project, "qq");
    assert.equal(edited.title, "Renamed");
    assert.equal(edited.body, "empty pile");
    assert.deepEqual(edited.labels, ["keep"]);
    assert.equal(edited.id, id, "edit cannot change the id");

    store.append(id, "leftover job");
    const appended = store.read(id);
    assert.match(appended.body, /empty pile/);
    assert.match(appended.body, /leftover job/);
    assert.equal(appended.id, "1");

    const archived = store.archive(id);
    assert.equal(archived, "1");
    assert.deepEqual(store.list(), []);
    assert.throws(() => store.read(id), /not live/);
    const book = store.book();
    assert.deepEqual(book.live, []);
    assert.deepEqual(book.warm, ["1"]);
    assert.ok(book.issued.includes("1"));
    const archiveDir = join(dir, "qq", "archive");
    const archivedFiles = readdirSync(archiveDir).filter((name) => name.endsWith("-1.md"));
    assert.equal(archivedFiles.length, 1);
    assert.equal(statSync(join(archiveDir, archivedFiles[0])).mode & 0o777, 0o600);
    const next = store.create({ title: "After archive" });
    assert.notEqual(next, "1", "warm number is not re-dealt");
    assert.equal(next, "2", "empty live pile: rng 0 picks the first remaining frozen name");
  }

  // two projects cannot receive the same live number
  {
    const dir = join(scratch, "two-projects");
    const store = createTaskStore(dir, { project: "alpha", rng: () => 0 });
    const first = store.create({ title: "A", project: "alpha" });
    const second = store.create({ title: "B", project: "beta" });
    assert.notEqual(first, second);
    assert.equal(store.read(first).project, "alpha");
    assert.equal(store.read(second).project, "beta");
    const all = store.list();
    assert.equal(all.length, 2);
    assert.equal(store.list({ project: "alpha" }).length, 1);
    assert.equal(store.list({ project: "beta" })[0].id, second);
    const book = store.book();
    assert.deepEqual(new Set(book.live).size, 2);
  }

  // persist / restart keeps numbers and files
  {
    const dir = join(scratch, "restart");
    const first = createTaskStore(dir, { rng: () => 0 });
    const id = first.create({ title: "Stay", body: "across restart", labels: ["x"] });
    const second = createTaskStore(dir, { rng: () => 0.9 });
    const again = second.read(id);
    assert.equal(again.title, "Stay");
    assert.equal(again.body, "across restart");
    assert.deepEqual(again.labels, ["x"]);
    assert.deepEqual(second.book().live, [id]);
    const next = second.create({ title: "Next" });
    assert.notEqual(next, id);
  }

  // overflow unlocks 1000–9999 only after the frozen set is live-or-warm
  {
    const dir = join(scratch, "overflow");
    const store = createTaskStore(dir, { rng: () => 0 });
    const ids = [];
    for (let index = 0; index < FROZEN.length - 1; index += 1) {
      ids.push(store.create({ title: `n${index}` }));
    }
    assert.ok(ids.every((id) => FROZEN.includes(id)));
    assert.equal(store.book().live.length, 98);
    const lastFrozen = store.create({ title: "last frozen" });
    assert.ok(FROZEN.includes(lastFrozen), `expected frozen, got ${lastFrozen}`);
    assert.equal(store.book().live.length, 99);
    const overflow = store.create({ title: "overflow" });
    const value = Number(overflow);
    assert.ok(value >= FIRST_OVERFLOW_START && value <= FIRST_OVERFLOW_END, overflow);
    assert.ok(!FROZEN.includes(overflow));

    const warmDir = join(scratch, "overflow-warm");
    const warmer = createTaskStore(warmDir, { rng: () => 0 });
    for (let index = 0; index < FROZEN.length; index += 1) {
      const id = warmer.create({ title: `w${index}` });
      warmer.archive(id);
    }
    assert.equal(warmer.book().live.length, 0);
    assert.equal(warmer.book().warm.length, 99);
    const afterWarm = warmer.create({ title: "must overflow" });
    const afterValue = Number(afterWarm);
    assert.ok(afterValue >= FIRST_OVERFLOW_START && afterValue <= FIRST_OVERFLOW_END, afterWarm);
  }

  // service + rundown refuses when settings unbound
  {
    const dir = join(scratch, "service");
    const store = createTaskStore(dir, { rng: () => 0 });
    const unbound = createTasksSettings({});
    const service = createTasksService(store, { settings: unbound });
    const id = service.create({ title: "Bank", body: "caller has text" });
    assert.equal(service.read(id).title, "Bank");
    assert.equal(service.list()[0].id, id);
    service.edit(id, { title: "Banked" });
    service.append(id, "more");
    await assert.rejects(() => service.rundown(), /settings unbound/);

    const settingsFile = join(scratch, "rundown-settings.json");
    const settings = createTasksSettings({ settingsFile });
    assert.equal(settings.unbound(), true);
    settings.write("rundown", { provider: "test", model: "reporter", effort: "low" });
    assert.equal(existsSync(settingsFile), true);
    assert.equal(statSync(settingsFile).mode & 0o777, 0o600);
    const raw = JSON.parse(readFileSync(settingsFile, "utf8"));
    assert.equal(raw.schema, TASKS_SETTINGS_SCHEMA);
    assert.equal(raw.roles.rundown.model, "reporter");
    let ran = 0;
    const bound = createTasksService(store, {
      settings,
      llm: {},
      runRundown: async (_llm, binding, request) => {
        ran += 1;
        assert.equal(binding.model, "reporter");
        assert.equal(request.system, RUNDOWN_SYSTEM);
        assert.match(request.user, /Banked/);
        return "pile report";
      },
    });
    assert.equal(await bound.rundown(), "pile report");
    assert.equal(ran, 1);
    bound.archive(id);
    assert.deepEqual(bound.list(), []);
    const serviceSource = readFileSync(join(root, "qq-tasks/src/service.mjs"), "utf8");
    assert.match(serviceSource, /from "\.\.\/\.\.\/qq\/src\/ask\.mjs"/);
    assert.doesNotMatch(serviceSource, /runRundownModel|llm\.stream|randomUUID/);

    const streamed = [];
    const live = createTasksService(store, {
      settings,
      llm: {
        async *stream(options) {
          streamed.push(options);
          yield { type: "text-delta", text: "live pile report" };
        },
      },
    });
    live.create({ title: "Streamed" });
    assert.equal(await live.rundown(), "live pile report");
    assert.equal(streamed.length, 1);
    assert.equal(streamed[0].provider, "test");
    assert.equal(streamed[0].model, "reporter");
    assert.equal("cacheRetention" in streamed[0], false);
    assert.match(streamed[0].sessionId, /^session-/);
  }

  // rundown is absent when the plugin is not loaded
  {
    const without = buildArchitectTools({ store: {}, invoke: async () => ({ status: "ok" }) });
    assert.deepEqual(without.map((tool) => tool.name), [
      "notes_list", "notes_expand", "session_search", "invoke",
    ]);
    assert.ok(!without.some((tool) => tool.name === "rundown"));
  }

  // rundown registers on an architect chair when qq-tasks is loaded
  {
    const withTasks = buildArchitectTools({
      store: { load: () => ({ cards: [] }) },
      invoke: async () => ({ status: "ok" }),
      tasks: { rundown: async () => "report" },
    });
    assert.deepEqual(withTasks.map((tool) => tool.name), [
      "notes_list", "notes_expand", "session_search", "invoke", "rundown",
    ]);
    const rundown = withTasks.find((tool) => tool.name === "rundown");
    const ok = await rundown.execute();
    assert.equal(ok.status, "ok");
    assert.equal(ok.report, "report");
    assert.match(rundown.output.render({}, ok)[0].text, /report/);

    const refused = await buildArchitectTools({
      tasks: {
        rundown: async () => {
          throw new Error("qq-tasks: rundown refuses (settings unbound)");
        },
      },
    }).at(-1).execute();
    assert.equal(refused.status, "refused");
    assert.match(refused.reason, /settings unbound/);
  }

  {
    const dir = join(scratch, "plugin-apply");
    const selectedDir = join(scratch, "plugin-apply-selected");
    const registered = [];
    const fakeAgent = {
      id: alphaId,
      session: { id: alphaId, events: [], header: { cwd: "/work" } },
      ctx: {
        on() { return () => {}; },
        get(name) {
          if (name === "tools") {
            return {
              register(definition) {
                registered.push(definition);
                return () => {
                  const index = registered.indexOf(definition);
                  if (index >= 0) registered.splice(index, 1);
                };
              },
            };
          }
          return undefined;
        },
      },
    };
    const provided = {};
    const tasksDir = join(scratch, "plugin-apply-tasks");
    pluginModule.apply({
      get() { return undefined; },
      provide(name, value) { provided[name] = value; },
    }, { storeDir: tasksDir, rng: () => 0 });
    assert.ok(provided["qq-tasks"]);
    assert.equal(provided["qq-tasks"].create({ title: "From plugin" }), "1");

    workflowsPlugin.apply({
      get(name) {
        if (name === "agents") return { list: () => [fakeAgent], get: () => fakeAgent };
        if (name === "sessions") return {};
        if (name === "qq-tasks") return provided["qq-tasks"];
        return undefined;
      },
      provide(name, value) { provided[name] = value; },
      effect(fn) { fn(); return () => {}; },
      on() { return () => {}; },
    }, { notebookDir: dir, selectionDir: selectedDir });
    provided["qq-workflows"].workflows.select(alphaId, "architect");
    assert.ok(registered.some((tool) => tool.name === "rundown"));
    provided["qq-workflows"].workflows.select(alphaId, "iterate");
    assert.ok(!registered.some((tool) => tool.name === "rundown"));
    assert.ok(!registered.some((tool) => tool.name.startsWith("design_loop")));
  }

  console.log("test-qq-tasks: pass");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
