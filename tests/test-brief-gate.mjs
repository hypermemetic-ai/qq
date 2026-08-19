import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.argv[2];
const pluginRoot = join(root, "plugins", "brief-gate");
const manifest = await readFile(join(pluginRoot, "herdr-plugin.toml"), "utf8");
assert.match(manifest, /id = "qq\.brief-gate"/);
assert.match(manifest, /placement = "split"/);
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
  const documentPath = join(scratch, "gate.md");
  const decisionPath = join(scratch, "decision");
  const glowPath = join(scratch, "glow");
  const glowLog = join(scratch, "glow.args");
  await writeFile(documentPath, "# Exact private ticket\n", { mode: 0o600 });
  await writeFile(glowPath, "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$QQ_TEST_GLOW_LOG\"\ncat -- \"$1\"\n", { mode: 0o700 });
  await chmod(glowPath, 0o700);

  const child = spawn("bash", [join(pluginRoot, "brief-gate.sh")], {
    detached: true,
    env: {
      ...process.env,
      QQ_BRIEF_GATE_DOCUMENT: documentPath,
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
    assert.equal(await readFile(glowLog, "utf8"), `${documentPath}\n`);
    assert.match(output, /Exact private ticket/);
    assert.doesNotMatch(output, /Private note|Delegate note/);
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

const ptyDriver = String.raw`
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import time

def resize(fd, rows, columns):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))

pid, master = pty.fork()
if pid == 0:
    resize(0, 18, 72)
    os.execvpe("bash", ["bash", sys.argv[1]], os.environ)

query_output = bytearray()
answered = {}
queries = (
    (b"\x1b]11;?\x1b\\", b"\x1b]11;rgb:0000/0000/0000\x1b\\"),
    (b"\x1b]10;?\x1b\\", b"\x1b]10;rgb:ffff/ffff/ffff\x1b\\"),
    (b"\x1b[6n", b"\x1b[1;1R"),
)

def read_until(token, timeout=5):
    found = bytearray()
    deadline = time.monotonic() + timeout
    while token not in found and time.monotonic() < deadline:
        readable, _, _ = select.select([master], [], [], 0.05)
        if not readable:
            continue
        try:
            chunk = os.read(master, 4096)
        except OSError as error:
            if error.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        query_output.extend(chunk)
        for query, response in queries:
            observed = query_output.count(query)
            for _ in range(answered.get(query, 0), observed):
                os.write(master, response)
            answered[query] = observed
        found.extend(chunk)
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
    if token not in found:
        raise RuntimeError(f"timed out waiting for {token!r}")

try:
    read_until(b"[a] approve   [c] cancel")
    resize(master, 9, 44)
    os.killpg(pid, signal.SIGWINCH)
    time.sleep(0.1)
    os.write(master, sys.argv[2].encode())
    read_until(b"QQ_BRIEF_GATE_DECIDED")
finally:
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    deadline = time.monotonic() + 1
    while time.monotonic() < deadline:
        waited, _ = os.waitpid(pid, os.WNOHANG)
        if waited:
            break
        time.sleep(0.02)
    else:
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        os.waitpid(pid, 0)
    os.close(master)
`;

async function exercisePtyResize(key, expected) {
  const scratch = await mkdtemp(join(tmpdir(), "qq-brief-gate-pty-test."));
  const documentPath = join(scratch, "gate.md");
  const decisionPath = join(scratch, "decision");
  const configPath = join(scratch, "config");
  await mkdir(join(configPath, "glow"), { recursive: true, mode: 0o700 });
  await writeFile(documentPath, "# Resizable ticket sentinel\n", { mode: 0o600 });

  const child = spawn(process.env.PYTHON ?? "python3", ["-c", ptyDriver, join(pluginRoot, "brief-gate.sh"), key], {
    env: {
      ...process.env,
      HOME: scratch,
      XDG_CONFIG_HOME: configPath,
      TERM: "xterm-256color",
      QQ_BRIEF_GATE_DOCUMENT: documentPath,
      QQ_BRIEF_GATE_DECISION: decisionPath,
      QQ_BRIEF_GATE_GLOW: process.env.QQ_TEST_GLOW ?? "/home/linuxbrew/.linuxbrew/bin/glow",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errorOutput = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { errorOutput += chunk; });

  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(code, 0, `${errorOutput}\nPTY output:\n${output}`);
    assert.equal((await waitFor(decisionPath)).trim(), expected);
    const visibleOutput = output
      .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    assert.match(visibleOutput, /Resizable ticket sentinel/);
    assert.doesNotMatch(visibleOutput, /Readable note sentinel|Delegate note/);
    assert.match(visibleOutput, /\[a\] approve   \[c\] cancel/);
    assert.match(visibleOutput, /QQ_BRIEF_GATE_DECIDED/);
    assert.doesNotMatch(output, /\x1b\[\?(?:47|1047|1049)[hl]|\x1b\[2J/);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(scratch, { recursive: true, force: true });
  }
}

await exercise("a", "approved");
await exercise("c", "cancelled");
await exercisePtyResize("a", "approved");

console.log("test-brief-gate: pass");
