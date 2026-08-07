// @ts-nocheck

import { execFile as execFileCallback } from "node:child_process";
import { watch as watchFs } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const LINK_KEY = "qq.methodology";
const UPDATE_STATUS_KEY = "qq-methodology-update";
const UPDATE_STATUS_TEXT = "qq update available";
const DEFAULT_BUNDLE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const QQ_EXTENSION_MODULES = Object.freeze([
  "./qq-pr-watch.ts",
  "./qq-continue.ts",
  "./qq-split-fork.ts",
  "./qq-operator-stage.ts",
  "./qq-backlog-guard.ts",
  "./qq-delegate-watch.ts",
  "./qq-footer.ts",
  "./qq-architect.ts",
  "./qq-handoff.ts",
  "./qq-session-lineage.ts",
  "./qq-communication-moments.ts",
  "./qq-context-lifecycle.ts",
  "./qq-actor-messaging.ts",
]);

function defaultRun(file, args, options = {}) {
  return execFile(file, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function singleGitLine(stdout) {
  if (typeof stdout !== "string") return undefined;
  const value = stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout;
  if (value === "" || value.includes("\n") || value.includes("\0")) {
    return undefined;
  }
  return value;
}

function exitCode(error) {
  const value = Number(error?.code);
  return Number.isInteger(value) ? value : undefined;
}

/**
 * Inspect the one Repository-local methodology bit. Any ambiguity, malformed
 * value, command failure, or non-Git cwd is deliberately unlinked.
 */
export async function inspectMethodologyLink(cwd, deps = {}) {
  const run = deps.run ?? defaultRun;
  const git = deps.gitBin ?? process.env.QQ_GIT_BIN ?? "git";
  const workingDirectory = resolve(cwd);
  let commonGitDir;

  try {
    const result = await run(
      git,
      [
        "-C",
        workingDirectory,
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ],
      { cwd: workingDirectory },
    );
    const output = singleGitLine(result.stdout);
    if (!output) return { linked: false, state: "invalid", reason: "git-common-dir" };
    commonGitDir = isAbsolute(output) ? output : resolve(workingDirectory, output);
  } catch {
    return { linked: false, state: "non-git", reason: "git-common-dir" };
  }

  let values;
  try {
    const result = await run(
      git,
      [
        `--git-dir=${commonGitDir}`,
        "config",
        "--local",
        "--no-includes",
        "--type=bool",
        "--null",
        "--get-all",
        LINK_KEY,
      ],
      { cwd: workingDirectory },
    );
    values = result.stdout.split("\0");
    if (values.at(-1) === "") values.pop();
  } catch (error) {
    if (exitCode(error) === 1) {
      return { linked: false, state: "unlinked", commonGitDir };
    }
    return {
      linked: false,
      state: "invalid",
      reason: "configuration",
      commonGitDir,
    };
  }

  if (values.length !== 1 || (values[0] !== "true" && values[0] !== "false")) {
    return {
      linked: false,
      state: "invalid",
      reason: "configuration",
      commonGitDir,
    };
  }
  if (values[0] !== "true") {
    return { linked: false, state: "unlinked", commonGitDir };
  }

  let repositoryRoot;
  try {
    const result = await run(
      git,
      ["-C", workingDirectory, "rev-parse", "--path-format=absolute", "--show-toplevel"],
      { cwd: workingDirectory },
    );
    repositoryRoot = singleGitLine(result.stdout);
  } catch {
    // Bare Repositories can carry the common local bit but have no optional
    // worktree-local vocabulary surface.
  }

  return {
    linked: true,
    state: "linked",
    commonGitDir,
    ...(repositoryRoot ? { repositoryRoot } : {}),
  };
}

async function canonicalSnapshot(bundleRoot, loadFile) {
  const kernelPath = join(bundleRoot, "methodology", "KERNEL.md");
  const conceptsPath = join(bundleRoot, "CONCEPTS.md");
  const [kernel, concepts] = await Promise.all([
    loadFile(kernelPath, "utf8"),
    loadFile(conceptsPath, "utf8"),
  ]);
  if (typeof kernel !== "string" || !kernel.trim()
    || typeof concepts !== "string" || !concepts.trim()) {
    throw new Error("qq canonical kernel and concepts must be non-empty text");
  }
  return Object.freeze({ kernel, concepts });
}

function containsCanonicalKernel(systemPrompt, kernel) {
  return typeof systemPrompt === "string" && systemPrompt.includes(kernel.trimEnd());
}

function methodologyBlock(snapshot, localVocabulary, includeKernel) {
  const sections = ["# qq methodology (session snapshot)"];
  if (includeKernel) {
    sections.push(
      `## Canonical methodology/KERNEL.md\n\n${snapshot.kernel.trimEnd()}`,
    );
  }
  sections.push(`## Canonical CONCEPTS.md\n\n${snapshot.concepts.trimEnd()}`);
  if (localVocabulary) {
    sections.push(
      `## Additive Repository CONCEPTS.local.md\n\n${localVocabulary.trimEnd()}`,
    );
  }
  return sections.join("\n\n");
}

function watcherSpecs(bundleRoot) {
  return [
    { path: join(bundleRoot, "methodology", "KERNEL.md"), recursive: false },
    { path: join(bundleRoot, "CONCEPTS.md"), recursive: false },
    { path: join(bundleRoot, "delegation", "manifests", "agents"), recursive: true },
    { path: join(bundleRoot, "delegation", "policies"), recursive: true },
    { path: join(bundleRoot, "skills"), recursive: true },
    { path: join(bundleRoot, "prompts"), recursive: true },
    { path: join(bundleRoot, "extensions"), recursive: true },
  ];
}

function registerLinkedBootstrap(pi, options) {
  const { bundleRoot, link, loadFile, watch } = options;
  const watchers = new Set();
  let active = false;
  let context;
  let snapshot;
  let localVocabulary;
  let updateAvailable = false;

  function localWarning(message, warningContext = context) {
    try {
      if (warningContext?.hasUI) warningContext.ui.notify(message, "warning");
    } catch {
      // A UI warning must not disrupt the session runtime.
    }
  }

  function closeWatchers() {
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // Closing an already-closed watcher is harmless.
      }
    }
    watchers.clear();
  }

  function markUpdateAvailable() {
    if (!active || updateAvailable) return;
    updateAvailable = true;
    try {
      if (context?.hasUI) {
        context.ui.setStatus(UPDATE_STATUS_KEY, UPDATE_STATUS_TEXT);
      }
    } catch {
      // The process-local state still coalesces later events.
    }
  }

  function armWatchers() {
    for (const spec of watcherSpecs(bundleRoot)) {
      try {
        const watcher = watch(
          spec.path,
          { persistent: false, recursive: spec.recursive },
          markUpdateAvailable,
        );
        watcher.on?.("error", (error) => {
          watchers.delete(watcher);
          try {
            watcher.close();
          } catch {
            // The failed watcher may already be closed.
          }
          const detail = error instanceof Error ? `: ${error.message}` : "";
          localWarning(`qq update watch failed${detail}`);
        });
        watchers.add(watcher);
      } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        localWarning(`qq update watch could not start for ${spec.path}${detail}`);
      }
    }
  }

  async function readLocalVocabulary(nextContext, nextSnapshot) {
    if (!link.repositoryRoot || nextContext.isProjectTrusted?.() !== true) {
      return undefined;
    }
    try {
      const value = await loadFile(join(link.repositoryRoot, "CONCEPTS.local.md"), "utf8");
      if (typeof value !== "string" || value === "" || value === nextSnapshot.concepts) {
        return undefined;
      }
      return value;
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        localWarning(
          `qq could not snapshot additive Repository vocabulary${detail}`,
          nextContext,
        );
      }
      return undefined;
    }
  }

  pi.on("session_start", async (_event, nextContext) => {
    closeWatchers();
    active = false;
    context = undefined;
    snapshot = undefined;
    localVocabulary = undefined;

    // Pi can reuse this registered runtime for new/resume/fork. Complete the
    // whole replacement snapshot before exposing any linked session surface.
    const nextSnapshot = await canonicalSnapshot(bundleRoot, loadFile);
    const nextLocalVocabulary = await readLocalVocabulary(nextContext, nextSnapshot);

    snapshot = nextSnapshot;
    localVocabulary = nextLocalVocabulary;
    context = nextContext;
    updateAvailable = false;
    active = true;
    try {
      if (context?.hasUI) context.ui.setStatus(UPDATE_STATUS_KEY, undefined);
    } catch {
      // A fresh runtime is current even if its UI cannot render the clear.
    }
    armWatchers();
  });

  pi.on("resources_discover", () => {
    if (!active) return undefined;
    return { promptPaths: [join(bundleRoot, "prompts")] };
  });

  pi.on("before_agent_start", (event) => {
    if (!active) return undefined;
    const includeKernel = !containsCanonicalKernel(event.systemPrompt, snapshot.kernel);
    const block = methodologyBlock(snapshot, localVocabulary, includeKernel);
    return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
  });

  pi.on("session_shutdown", () => {
    active = false;
    closeWatchers();
    try {
      if (context?.hasUI) context.ui.setStatus(UPDATE_STATUS_KEY, undefined);
    } catch {
      // Shutdown cleanup is best-effort after watcher closure.
    }
    context = undefined;
    snapshot = undefined;
    localVocabulary = undefined;
    updateAvailable = false;
  });
}

async function loadSiblingRegisters(deps) {
  if (Array.isArray(deps.siblingRegisters)) return deps.siblingRegisters;
  const registers = [];
  for (const specifier of QQ_EXTENSION_MODULES) {
    const module = await import(specifier);
    if (typeof module.default !== "function") {
      throw new Error(`qq extension has no default register function: ${specifier}`);
    }
    registers.push(module.default);
  }
  return registers;
}

async function invokeSiblingRegister(registerSibling, pi) {
  const result = registerSibling(pi);
  if (result && typeof result.then === "function") await result;
}

/** The sole globally mounted qq extension. It is inert unless the cwd's
 * Repository has exactly one valid local qq.methodology=true value. */
export default async function register(pi, deps = {}) {
  const cwd = deps.cwd ?? process.cwd();
  const inspect = deps.inspectLink ?? inspectMethodologyLink;
  const link = await inspect(cwd, deps);
  if (link?.linked !== true) return;

  const bundleRoot = resolve(deps.bundleRoot ?? DEFAULT_BUNDLE_ROOT);
  const loadFile = deps.readFile ?? readFile;
  // Validate before registering any linked handlers or sibling extensions.
  // session_start reads again because one process can cross session boundaries.
  await canonicalSnapshot(bundleRoot, loadFile);
  const siblingRegisters = await loadSiblingRegisters(deps);

  registerLinkedBootstrap(pi, {
    bundleRoot,
    link,
    loadFile,
    watch: deps.watch ?? watchFs,
  });
  for (const registerSibling of siblingRegisters) {
    await invokeSiblingRegister(registerSibling, pi);
  }
}
