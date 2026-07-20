import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [modulePath, repo] = process.argv.slice(2);
const {
  default: register,
  gateToolCall,
  snapshotPlan,
} = await import(pathToFileURL(modulePath));

let command;
let handler;
let tool;
register({
  registerCommand(name, definition) {
    assert.equal(name, "plan-loop", "extension registered the wrong command");
    assert.equal(command, undefined, "extension registered more than one command");
    command = definition;
  },
  on(eventName, candidate) {
    assert.equal(eventName, "tool_call", "extension registered the wrong event");
    assert.equal(handler, undefined, "extension registered more than one handler");
    handler = candidate;
  },
  registerTool(definition) {
    assert.equal(
      definition.name,
      "plan_loop_submit",
      "extension registered the wrong tool",
    );
    assert.equal(tool, undefined, "extension registered more than one tool");
    tool = definition;
  },
});

assert.equal(typeof command?.handler, "function", "plan-loop command was not registered");
assert.equal(typeof handler, "function", "tool_call handler was not registered");
assert.equal(typeof tool?.execute, "function", "plan_loop_submit was not registered");
assert.match(tool.description, /complete and ready for human review/);
assert.deepEqual(tool.parameters.required, ["path"]);

const statuses = [];
const ctx = {
  cwd: repo,
  mode: "tui",
  hasUI: true,
  ui: {
    setStatus(key, value) {
      statuses.push([key, value]);
    },
  },
};
const call = (toolName, input, context = ctx) =>
  handler({ toolName, input }, context);
const assertAllowed = (result, message) =>
  assert.equal(result, undefined, message);
const writeReason =
  "plan-loop: planning phase — writes limited to .pi/plans/";
const assertWriteBlocked = (result, message) =>
  assert.deepEqual(result, { block: true, reason: writeReason }, message);
const assertBlocked = (result, message) => {
  assert.equal(result?.block, true, message);
  assert.match(result.reason, /planning phase/, message);
};

assertAllowed(
  call("write", { path: "README.md" }),
  "idle phase blocked an ordinary write",
);
await command.handler("", ctx);
assert.deepEqual(statuses.at(-1), ["plan-loop", "⏸ plan-loop"]);

assertAllowed(
  call("write", { path: ".pi/plans/plan.md" }),
  "planning blocked a relative plan write",
);
assertAllowed(
  call("edit", { path: join(repo, ".pi/plans/plan.md") }),
  "planning blocked an absolute plan edit",
);
assertAllowed(
  call(
    "write",
    { path: "../../.pi/plans/nested.md" },
    { ...ctx, cwd: join(repo, "src/deep") },
  ),
  "planning blocked a nested-cwd plan write",
);
assertAllowed(
  call("write", { path: "@.pi/plans/agent-path.md" }),
  "planning blocked a Pi @-prefixed plan write",
);
assertAllowed(
  call("edit", { path: ".pi/plans/plan\u00a0one.md" }),
  "planning did not normalize a unicode-space plan path",
);
assertWriteBlocked(
  call("write", { path: "README.md" }),
  "planning allowed an ordinary write",
);
assertWriteBlocked(
  call("edit", { path: "backlog/tasks/t-118.md" }),
  "planning allowed an edit outside .pi/plans",
);
assertWriteBlocked(
  call("write", {}),
  "planning allowed a write without a path",
);

for (const commandText of [
  "git status",
  "ls | grep x",
]) {
  assertAllowed(
    call("bash", { command: commandText }),
    `planning blocked allowlisted bash: ${commandText}`,
  );
}
for (const commandText of [
  "git commit -m x",
  "rm -f x",
  "echo hi > /tmp/x",
  "npm test",
  "ls && git status",
  "echo hi & pwd",
]) {
  assertBlocked(
    call("bash", { command: commandText }),
    `planning allowed non-allowlisted bash: ${commandText}`,
  );
}

assertAllowed(call("read", { path: "README.md" }), "planning blocked read");
assertAllowed(call("rg", { pattern: "x" }), "planning blocked allowlisted tool");
assertAllowed(
  call("ask_user_question", {}),
  "planning blocked ask_user_question",
);
assertAllowed(call("plan_loop_submit", {}), "planning blocked its submit tool");
assertAllowed(call("hunk_review", {}), "planning blocked a hunk-prefixed tool");
assertBlocked(
  call("browser_open", {}),
  "planning allowed a non-allowlisted extension tool",
);

for (const [toolName, input] of [
  ["write", { path: "README.md" }],
  ["edit", { path: "README.md" }],
  ["bash", { command: "npm test" }],
  ["browser_open", {}],
]) {
  assertAllowed(
    gateToolCall({ toolName, input }, ctx, "executing"),
    `executing phase blocked ${toolName}`,
  );
}

await command.handler("", ctx);
assert.deepEqual(statuses.at(-1), ["plan-loop", undefined]);
assertAllowed(
  call("bash", { command: "npm test" }),
  "idle phase blocked non-allowlisted bash",
);

const planPath = join(repo, ".pi/plans/implementation.md");
await writeFile(planPath, "first plan\n", "utf8");
const first = await snapshotPlan(repo, planPath, repo);
assert.equal(first.round, 1, "first submit did not create round 1");
assert.equal(
  first.previousPath,
  join(repo, ".pi/plans/rounds/implementation/round-0.md"),
);
assert.equal(
  first.snapshotPath,
  join(repo, ".pi/plans/rounds/implementation/round-1.md"),
);
assert.equal(await readFile(first.previousPath, "utf8"), "", "round 0 was not empty");
assert.equal(
  await readFile(first.snapshotPath, "utf8"),
  "first plan\n",
  "round 1 did not copy the plan",
);

await writeFile(planPath, "second plan\n", "utf8");
const second = await snapshotPlan(repo, ".pi/plans/implementation.md", repo);
assert.equal(second.round, 2, "second submit did not create round 2");
assert.equal(second.previousPath, first.snapshotPath);
assert.equal(
  await readFile(second.snapshotPath, "utf8"),
  "second plan\n",
  "round 2 did not copy the revised plan",
);
assert.equal(
  await readFile(planPath, "utf8"),
  "second plan\n",
  "snapshot moved or changed the source plan",
);

const outsidePath = join(repo, "outside.md");
await writeFile(outsidePath, "outside\n", "utf8");
await assert.rejects(
  snapshotPlan(repo, outsidePath, repo),
  /must resolve under \.pi\/plans\//,
  "snapshot accepted a plan outside .pi/plans",
);
