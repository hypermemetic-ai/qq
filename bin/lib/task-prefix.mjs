import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import { atomicPrivateJson, readHandoff, workshopRoot } from "./workshop.mjs";

const DEFAULT_FROM = "task";
const DEFAULT_TO = "t";
const TASK_DIRS = ["tasks", "drafts", "completed", join("archive", "tasks")];

export function taskNumber(id, prefix) {
  const match = String(id ?? "").match(new RegExp(`^${escapeRegExp(prefix)}-([1-9][0-9]*(?:\\.[1-9][0-9]*)*)$`, "i"));
  return match?.[1];
}

export function rewriteFrontmatterId(source, fromPrefix, toPrefix) {
  const parts = String(source).split("---");
  if (parts.length < 3) return { source, from: undefined, to: undefined };
  const pattern = new RegExp(`^(id:\\s*)${escapeRegExp(fromPrefix)}-([1-9][0-9]*(?:\\.[1-9][0-9]*)*)\\s*$`, "im");
  const match = parts[1].match(pattern);
  if (!match) return { source, from: undefined, to: undefined };
  parts[1] = parts[1].replace(pattern, `$1${toPrefix.toUpperCase()}-$2`);
  return {
    source: parts.join("---"),
    from: `${fromPrefix.toUpperCase()}-${match[2]}`,
    to: `${toPrefix.toUpperCase()}-${match[2]}`,
  };
}

export function rewriteTaskFilename(name, fromPrefix, toPrefix) {
  const pattern = new RegExp(`^${escapeRegExp(fromPrefix)}-([1-9][0-9]*(?:\\.[1-9][0-9]*)*)( - .+\\.md)$`, "i");
  const match = String(name).match(pattern);
  if (!match) return name;
  return `${toPrefix}-${match[1]}${match[2]}`;
}

export function rewriteConfigPrefix(source, fromPrefix, toPrefix) {
  const pattern = new RegExp(`^(task_prefix:\\s*)(["']?)${escapeRegExp(fromPrefix)}\\2[ \\t]*$`, "m");
  if (!pattern.test(source)) return source;
  return source.replace(pattern, `$1"${toPrefix}"`);
}

export async function migrateTaskPrefix(options = {}) {
  const backlogDir = resolve(options.backlogDir ?? join(options.cwd ?? process.cwd(), "backlog"));
  const fromPrefix = options.fromPrefix ?? DEFAULT_FROM;
  const toPrefix = options.toPrefix ?? DEFAULT_TO;
  const workshopDirs = options.workshopDirs ?? defaultWorkshopDirs(options);
  const report = { backlogDir, fromPrefix, toPrefix, prefixChanged: false, tasks: [], handoffs: [] };

  const planned = [];
  for (const relative of TASK_DIRS) {
    const directory = join(backlogDir, relative);
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = join(directory, entry.name);
      const original = await readFile(path, "utf8");
      const rewritten = rewriteFrontmatterId(original, fromPrefix, toPrefix);
      const nextName = rewriteTaskFilename(entry.name, fromPrefix, toPrefix);
      if (!rewritten.from && nextName === entry.name) continue;
      const nextPath = join(directory, nextName);
      planned.push({
        path,
        nextPath,
        original,
        source: rewritten.from ? rewritten.source : original,
        from: rewritten.from,
        to: rewritten.to,
      });
    }
  }

  for (const item of planned) {
    if (item.nextPath !== item.path) {
      const collision = planned.some((other) => other !== item && other.nextPath === item.nextPath);
      if (collision) throw new Error(`cannot migrate ${item.path}: destination ${item.nextPath} collides`);
    }
    if (item.source !== item.original) await writeFile(item.path, item.source, "utf8");
    if (item.nextPath !== item.path) await rename(item.path, item.nextPath);
    report.tasks.push({ from: item.from, to: item.to, path: item.nextPath });
  }

  const configPath = join(backlogDir, "config.yml");
  const config = await readFile(configPath, "utf8");
  const nextConfig = rewriteConfigPrefix(config, fromPrefix, toPrefix);
  if (nextConfig !== config) {
    await writeFile(configPath, nextConfig, "utf8");
    report.prefixChanged = true;
  } else if (!new RegExp(`^task_prefix:\\s*["']?${escapeRegExp(toPrefix)}["']?\\s*$`, "m").test(config)) {
    throw new Error(`backlog config does not have task_prefix ${fromPrefix} or ${toPrefix}`);
  }

  for (const directory of workshopDirs) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name, "handoff.json");
      let state;
      try { state = await readHandoff(path); } catch { continue; }
      const current = state?.task?.id;
      const number = taskNumber(current, fromPrefix);
      if (!number) continue;
      const next = `${toPrefix.toUpperCase()}-${number}`;
      if (current === next) continue;
      state.task = { ...state.task, id: next };
      await atomicPrivateJson(path, state);
      report.handoffs.push({ path, from: current, to: next });
    }
  }

  return report;
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function defaultWorkshopDirs(options) {
  if (options.skipWorkshops) return [];
  const env = options.env ?? process.env;
  const cwd = resolve(options.cwd ?? process.cwd());
  const worktreeHome = resolve(env.QQ_WORKTREE_ROOT || join(env.HOME || homedir(), ".herdr", "worktrees"));
  const underWorktree = cwd === worktreeHome ? "" : cwd.startsWith(`${worktreeHome}/`) ? cwd.slice(worktreeHome.length + 1).split("/")[0] : "";
  const project = slug(options.project || env.QQ_AGENT_PROJECT || underWorktree || basename(cwd));
  return [workshopRoot(project, env)];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function usage() {
  return "usage: qq-migrate-task-prefix.mjs [repo]";
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const cwd = resolve(argv[0] || env.PWD || process.cwd());
  const report = await migrateTaskPrefix({ cwd, env });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
