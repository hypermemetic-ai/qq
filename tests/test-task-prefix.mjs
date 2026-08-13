import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const lib = await import(pathToFileURL(join(root, "bin/lib/task-prefix.mjs")));
const workshop = await import(pathToFileURL(join(root, "bin/lib/workshop.mjs")));

assert.equal(lib.taskNumber("TASK-5", "task"), "5");
assert.equal(lib.taskNumber("T-5", "t"), "5");
assert.equal(lib.taskNumber("TASK-5", "t"), undefined);
assert.equal(lib.rewriteTaskFilename("task-5 - Glow.md", "task", "t"), "t-5 - Glow.md");
assert.equal(lib.rewriteFrontmatterId("---\nid: TASK-5\n---\n", "task", "t").to, "T-5");
assert.equal(lib.rewriteConfigPrefix('task_prefix: "task"\n', "task", "t"), 'task_prefix: "t"\n');

const scratch = await mkdtemp(join(homedir(), "qq-task-prefix-test."));
try {
  const repo = join(scratch, "repo");
  const tasks = join(repo, "backlog", "tasks");
  const workshops = join(scratch, "workshops");
  await mkdir(tasks, { recursive: true });
  await writeFile(join(repo, "backlog", "config.yml"), [
    "project_name: \"Probe\"",
    "default_status: \"To Do\"",
    "statuses: [\"To Do\", \"In Progress\", \"Done\"]",
    "task_prefix: \"task\"",
    "",
  ].join("\n"));
  await writeFile(join(tasks, "task-1 - Done-one.md"), [
    "---",
    "id: TASK-1",
    "title: Done one",
    "status: Done",
    "assignee: []",
    "created_date: '2026-08-13 09:00'",
    "labels: []",
    "dependencies: []",
    "ordinal: 1000",
    "---",
    "",
    "keep this note",
    "",
  ].join("\n"));
  await writeFile(join(tasks, "task-5 - Live.md"), [
    "---",
    "id: TASK-5",
    "title: Live",
    "status: In Progress",
    "assignee: []",
    "created_date: '2026-08-13 09:00'",
    "labels: []",
    "dependencies: []",
    "ordinal: 5000",
    "---",
    "",
  ].join("\n"));
  const handoffPath = join(workshops, "task-5-deadbeef", "handoff.json");
  await workshop.atomicPrivateJson(handoffPath, {
    schema: "qq.workshop-handoff/v1", version: 1, id: "task-5-deadbeef", project: "qq",
    task: { id: "TASK-5", title: "Live" }, status: "commented", look: 1,
    mainRoot: repo, baseBranch: "main", baseRef: "base", branch: "qq/task-5-deadbeef",
    worktree: join(scratch, "worktree"), pane: "w2T:p9", architectSession: "session",
    briefPath: join(workshops, "task-5-deadbeef", "brief.md"), statePath: handoffPath,
    qa: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  });

  const report = await lib.migrateTaskPrefix({ backlogDir: join(repo, "backlog"), workshopDirs: [workshops] });
  assert.equal(report.prefixChanged, true);
  assert.deepEqual(report.tasks.map((item) => item.to).sort(), ["T-1", "T-5"]);
  assert.deepEqual(report.handoffs.map((item) => item.to), ["T-5"]);

  const done = await readFile(join(tasks, "t-1 - Done-one.md"), "utf8");
  const live = await readFile(join(tasks, "t-5 - Live.md"), "utf8");
  const config = await readFile(join(repo, "backlog", "config.yml"), "utf8");
  const handoff = JSON.parse(await readFile(handoffPath, "utf8"));
  assert.match(done, /^id: T-1$/m);
  assert.match(done, /keep this note/);
  assert.match(live, /^id: T-5$/m);
  assert.match(live, /^status: In Progress$/m);
  assert.match(config, /^task_prefix: "t"$/m);
  assert.equal(handoff.task.id, "T-5");
  assert.equal(handoff.status, "commented");

  const again = await lib.migrateTaskPrefix({ backlogDir: join(repo, "backlog"), workshopDirs: [workshops] });
  assert.equal(again.prefixChanged, false);
  assert.deepEqual(again.tasks, []);
  assert.deepEqual(again.handoffs, []);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const live = await mkdtemp(join(homedir(), "qq-task-prefix-cli."));
try {
  execFileSync("git", ["-C", live, "init", "-q"]);
  execFileSync("backlog", ["init", "Prefix", "--defaults", "--no-git"], { cwd: live, stdio: "ignore" });
  execFileSync("backlog", ["task", "create", "Alpha", "--plain"], { cwd: live, stdio: "ignore" });
  execFileSync("backlog", ["task", "create", "Beta", "--plain"], { cwd: live, stdio: "ignore" });
  execFileSync("backlog", ["task", "edit", "TASK-2", "--status", "In Progress", "--plain"], { cwd: live, stdio: "ignore" });
  const report = await lib.migrateTaskPrefix({ cwd: live, skipWorkshops: true });
  assert.equal(report.prefixChanged, true);
  const listed = execFileSync("backlog", ["task", "list", "--plain"], { cwd: live, encoding: "utf8" });
  assert.match(listed, /T-1 - Alpha/);
  assert.match(listed, /T-2 - Beta/);
  assert.doesNotMatch(listed, /TASK-/);
  execFileSync("backlog", ["task", "view", "T-1", "--plain"], { cwd: live, stdio: "ignore" });
  assert.throws(() => execFileSync("backlog", ["task", "view", "TASK-1", "--plain"], { cwd: live, stdio: ["ignore", "ignore", "pipe"] }));
  const created = execFileSync("backlog", ["task", "create", "Gamma", "--plain"], { cwd: live, encoding: "utf8" });
  assert.match(created, /Task T-3 - Gamma/);
  const id = created.match(/Task (T-[0-9.]+)/)?.[1];
  execFileSync("backlog", ["task", "archive", id], { cwd: live, stdio: "ignore" });
  const leftover = execFileSync("backlog", ["task", "list", "--plain"], { cwd: live, encoding: "utf8" });
  assert.doesNotMatch(leftover, /Gamma/);
} finally {
  await rm(live, { recursive: true, force: true });
}

const nested = await mkdtemp(join(homedir(), "qq-task-prefix-worktree."));
try {
  const repo = join(nested, ".herdr", "worktrees", "demo", "task-9-deadbeef");
  const tasks = join(repo, "backlog", "tasks");
  const handoffPath = join(nested, ".local", "state", "qq", "workshops", "demo", "task-9-deadbeef", "handoff.json");
  await mkdir(tasks, { recursive: true });
  await writeFile(join(repo, "backlog", "config.yml"), "task_prefix: \"task\"\n");
  await writeFile(join(tasks, "task-9 - Nested.md"), "---\nid: TASK-9\ntitle: Nested\nstatus: To Do\n---\n");
  await workshop.atomicPrivateJson(handoffPath, {
    schema: "qq.workshop-handoff/v1", version: 1, id: "task-9-deadbeef", project: "demo",
    task: { id: "TASK-9", title: "Nested" }, status: "running", look: 0,
    mainRoot: repo, baseBranch: "main", baseRef: "base", branch: "qq/task-9-deadbeef",
    worktree: repo, pane: "w2T:p9", architectSession: "session",
    briefPath: join(nested, "brief.md"), statePath: handoffPath,
    qa: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "xhigh" },
  });
  const env = { HOME: nested, XDG_STATE_HOME: join(nested, ".local", "state") };
  const report = await lib.migrateTaskPrefix({ cwd: repo, env });
  assert.equal(report.prefixChanged, true);
  assert.deepEqual(report.handoffs.map((item) => item.to), ["T-9"]);
  assert.equal(JSON.parse(await readFile(handoffPath, "utf8")).task.id, "T-9");
} finally {
  await rm(nested, { recursive: true, force: true });
}

console.log("test-task-prefix: pass");
