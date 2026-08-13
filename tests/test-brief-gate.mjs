import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.argv[2];
const pluginRoot = join(root, "plugins", "brief-gate");
const manifest = await readFile(join(pluginRoot, "herdr-plugin.toml"), "utf8");
assert.match(manifest, /id = "qq\.brief-gate"/);
assert.match(manifest, /placement = "overlay"/);
assert.match(manifest, /command = \["bash", "brief-gate\.sh"\]/);

async function waitFor(path) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { return await readFile(path, "utf8"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${path}`);
}

async function exercise(key, expected) {
  const scratch = await mkdtemp(join(tmpdir(), "qq-brief-gate-test."));
  const briefPath = join(scratch, "brief.md");
  const decisionPath = join(scratch, "decision");
  const glowPath = join(scratch, "glow");
  const glowLog = join(scratch, "glow.args");
  await writeFile(briefPath, "# Exact private brief\n", { mode: 0o600 });
  await writeFile(glowPath, "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$QQ_TEST_GLOW_LOG\"\n", { mode: 0o700 });
  await chmod(glowPath, 0o700);

  const child = spawn("bash", [join(pluginRoot, "brief-gate.sh")], {
    detached: true,
    env: {
      ...process.env,
      QQ_BRIEF_GATE_BRIEF: briefPath,
      QQ_BRIEF_GATE_DECISION: decisionPath,
      QQ_BRIEF_GATE_GLOW: glowPath,
      QQ_TEST_GLOW_LOG: glowLog,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.stdin.end(key);

  try {
    assert.equal((await waitFor(decisionPath)).trim(), expected);
    assert.equal(await readFile(glowLog, "utf8"), `-t\n${briefPath}\n`);
    assert.match(output, /\[a\] approve   \[c\] cancel/);
    assert.match(output, /QQ_BRIEF_GATE_DECIDED/);
  } finally {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    await rm(scratch, { recursive: true, force: true });
  }
}

await exercise("a", "approved");
await exercise("c", "cancelled");

console.log("test-brief-gate: pass");
