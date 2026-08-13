import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const { default: register } = await import(pathToFileURL(join(root, "extensions/backlog-guard.ts")));
const scratch = await mkdtemp(join(homedir(), "qq-backlog-guard-test."));
const repo = join(scratch, "repo");
const worktree = join(scratch, "linked");
const store = join(scratch, "store");

try {
  await mkdir(repo, { recursive: true });
  execFileSync("git", ["-C", repo, "init", "-q"]);
  execFileSync("git", ["-C", repo, "-c", "user.name=qq-test", "-c", "user.email=qq-test.invalid", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", "commit", "-q", "--allow-empty", "-m", "initial"]);
  execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "guard-check", worktree]);
  await mkdir(join(worktree, "src", "deep"), { recursive: true });
  await mkdir(join(store, "tasks"), { recursive: true });
  await mkdir(join(store, "docs"), { recursive: true });
  await symlink(store, join(worktree, "backlog"));

  let handler;
  register({
    on(eventName, candidate) {
      assert.equal(eventName, "tool_call");
      handler = candidate;
    },
  });

  const feedback = "managed Backlog markdown must be edited through the backlog CLI";
  const call = (toolName, input, cwd = worktree) => handler({ toolName, input }, { cwd });
  const blocked = (result, message) => assert.deepEqual(result, { block: true, reason: feedback }, message);
  const allowed = (result, message) => assert.equal(result, undefined, message);

  blocked(call("write", { path: "backlog/tasks/t-91.md", content: "no" }), "relative write under backlog was allowed");
  blocked(call("edit", { path: join(worktree, "backlog/docs/note.md") }), "absolute edit under backlog was allowed");
  blocked(call("write", { path: "src/../backlog/./tasks/t-91.md" }), "normalized path under backlog was allowed");
  blocked(call("edit", { path: "../../backlog/tasks/t-91.md" }, join(worktree, "src/deep")), "nested-cwd path under linked-worktree backlog was allowed");
  blocked(call("write", { path: "@backlog/tasks/t-91.md", content: "no" }), "Pi @-prefixed path under backlog was allowed");
  blocked(call("edit", { path: pathToFileURL(join(worktree, "backlog/docs/note.md")).href }), "Pi file URL under backlog was allowed");
  process.env.HOME = scratch;
  blocked(call("write", { path: "~/linked/backlog/tasks/t-91.md", content: "no" }), "Pi tilde path under backlog was allowed");
  blocked(call("write", { path: join(store, "tasks/t-91.md"), content: "no" }), "write through the resolved store path was allowed");
  blocked(call("edit", { path: pathToFileURL(join(store, "docs/note.md")).href }), "edit through the resolved store path was allowed");
  allowed(call("write", { path: "backlog-copy/note.md", content: "ok" }), "backlog-prefix sibling was blocked");
  allowed(call("edit", { path: "README.md" }), "ordinary path was blocked");
  allowed(call("read", { path: "backlog/tasks/t-91.md" }), "non-write/edit tool was blocked");
} finally {
  await rm(scratch, { recursive: true, force: true });
}

console.log("test-backlog-guard: pass");
