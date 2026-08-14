import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import registerInvestigator from "../extensions/newspaper-investigate.ts";
import {
  archiveName,
  editionWindow,
  parseRepositoryRegistry,
  publishEdition,
  runNewsroom,
  writerSystemPrompt,
} from "../bin/lib/newspaper.mjs";

process.env.TZ = "UTC";
const root = process.argv[2] ?? process.cwd();
const scratch = await mkdtemp(join(tmpdir(), "qq-newspaper-test-"));

const hourly = editionWindow("hourly", new Date("2026-08-14T10:23:00Z"));
assert.equal(hourly.start.toISOString(), "2026-08-14T09:00:00.000Z");
assert.equal(hourly.end.toISOString(), "2026-08-14T10:00:00.000Z");
assert.equal(archiveName("hourly", hourly), "2026-08-14T1000.md");
const daily = editionWindow("daily", new Date("2026-08-14T05:00:00Z"));
assert.equal(daily.start.toISOString(), "2026-08-13T00:00:00.000Z");
assert.equal(daily.end.toISOString(), "2026-08-14T00:00:00.000Z");
const weekly = editionWindow("weekly", new Date("2026-08-17T06:00:00Z"));
assert.equal(weekly.start.toISOString(), "2026-08-10T00:00:00.000Z");
assert.equal(archiveName("weekly", weekly), "2026-08-10--2026-08-16.md");
assert.deepEqual(parseRepositoryRegistry("# live\nqq\n/opt/discuss\nqq\n", "/projects"), [
  { key: "qq", path: "/projects/qq" },
  { key: "discuss", path: "/opt/discuss" },
]);

const writerTemplate = await readFile(join(root, "prompts/services/newspaper-writer.md"), "utf8");
const rendered = writerSystemPrompt(writerTemplate, "daily", "yesterday");
assert.match(rendered, /^Write the daily edition of the qq newspaper/);
assert.match(rendered, /reporting material for yesterday/);
assert.doesNotMatch(rendered, /coding assistant|Available tools|Guidelines:/);

const projects = join(scratch, "projects");
const repo = join(projects, "one");
await mkdir(repo, { recursive: true });
execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repo });
await writeFile(join(repo, "story.txt"), "one\n");
execFileSync("git", ["add", "."], { cwd: repo });
execFileSync("git", ["commit", "-q", "-m", "the story moves"], {
  cwd: repo,
  env: { ...process.env, GIT_AUTHOR_DATE: "2026-08-14T09:30:00Z", GIT_COMMITTER_DATE: "2026-08-14T09:30:00Z" },
});
const registry = join(scratch, "repositories");
await writeFile(registry, "one\n");
const stateRoot = join(scratch, "state");
let newsroomCalls = 0;
const published = await publishEdition({
  root, stateRoot, edition: "hourly", now: new Date("2026-08-14T10:23:00Z"),
  registryPath: registry, projectsRoot: projects,
  newsroom: async ({ source, previous }) => {
    newsroomCalls += 1;
    assert.match(source, /Subject: the story moves/);
    assert.match(previous, /no previous edition/i);
    return { edition: "# A real change\n\nThe project moved." };
  },
});
assert.equal(published.published, true);
assert.equal(newsroomCalls, 1);
assert.equal(await readFile(join(stateRoot, "current/hourly.md"), "utf8"), "# A real change\n\nThe project moved.\n");
const duplicate = await publishEdition({
  root, stateRoot, edition: "hourly", now: new Date("2026-08-14T10:23:00Z"),
  registryPath: registry, projectsRoot: projects,
  newsroom: async () => { throw new Error("duplicate should skip"); },
});
assert.equal(duplicate.reason, "already-published");
const quiet = await publishEdition({
  root, stateRoot, edition: "hourly", now: new Date("2026-08-14T11:23:00Z"),
  registryPath: registry, projectsRoot: projects,
  newsroom: async () => { throw new Error("quiet hour should skip"); },
});
assert.equal(quiet.reason, "quiet");

const fakePi = join(scratch, "fake-pi");
const capture = join(scratch, "capture");
await mkdir(capture);
await writeFile(fakePi, `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' "$*" >>"$QQ_TEST_CAPTURE/args"\nprompt=\nfor ((i=1;i<=$#;i++)); do if [[ \${!i} == --system-prompt ]]; then j=$((i+1)); prompt=\${!j}; fi; done\nif [[ $prompt == *writer-system.md ]]; then cp "$prompt" "$QQ_TEST_CAPTURE/writer-system"; printf '# Draft\\n\\nA draft.\\n'; else cp "$prompt" "$QQ_TEST_CAPTURE/editor-system"; printf '# Final\\n\\nAn edition.\\n'; fi\n`, { mode: 0o700 });
process.env.QQ_TEST_CAPTURE = capture;
const newsroom = await runNewsroom({
  root, stateRoot: join(scratch, "agent-state"), edition: "daily", period: "yesterday",
  source: "# Source\n", previous: "# Previous\n", repositorySummary: `one: ${repo}`,
  piBin: fakePi, timeoutMs: 10_000,
});
assert.equal(newsroom.edition, "# Final\n\nAn edition.\n");
assert.equal(await readFile(join(capture, "writer-system"), "utf8"), rendered);
assert.equal(await readFile(join(capture, "editor-system"), "utf8"), await readFile(join(root, "prompts/services/newspaper-editor.md"), "utf8"));
const capturedArgs = await readFile(join(capture, "args"), "utf8");
assert.match(capturedArgs, /--no-context-files/);
assert.match(capturedArgs, /--no-builtin-tools --tools investigate/);
assert.match(capturedArgs, /--no-extensions --no-tools/);

let tool;
const investigationLog = join(scratch, "investigations.md");
await writeFile(investigationLog, "# Investigations\n\n");
registerInvestigator({
  registerTool(value) { tool = value; },
  async exec() { throw new Error("unexpected default exec"); },
}, {
  env: {
    QQ_NEWSPAPER_ROOT: root,
    QQ_NEWSPAPER_SOURCE: join(scratch, "source.md"),
    QQ_NEWSPAPER_INVESTIGATIONS: investigationLog,
    QQ_NEWSPAPER_INVESTIGATOR_PROMPT: join(root, "prompts/services/newspaper-investigator.md"),
    QQ_NEWSPAPER_PI_BIN: fakePi,
    QQ_NEWSPAPER_MODEL: "qwen-token-plan/deepseek-v4-flash-0731",
    QQ_NEWSPAPER_WEB_EXTENSION: "/web-tools/index.ts",
    QQ_NEWSPAPER_REPOSITORIES: `one: ${repo}`,
  },
  exec: async (_command, args) => {
    assert.ok(args.includes("/web-tools/index.ts"));
    assert.ok(args.includes("read,bash,grep,find,ls,web_search,web_fetch"));
    return { code: 0, stdout: "The evidence supports the claim.\n", stderr: "" };
  },
});
assert.equal(tool.name, "investigate");
const finding = await tool.execute("call", { request: "Settle this fact." });
assert.equal(finding.details.status, "complete");
assert.match(await readFile(investigationLog, "utf8"), /Settle this fact[\s\S]*evidence supports/);

console.log("newspaper tests passed");
