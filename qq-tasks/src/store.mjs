// Plugin-owned markdown pile. One book at the store root; live files at
// {store}/{project}/{id}.md; archive under that project, named by completion
// time. Mode 0700 on the dir, 0600 on files, atomic write. Restart-safe.
//
// The store lives outside any project's git. Config names the default
// project and the store path. Default project is a name, not a walk of
// the repo root.

import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

import { dealId, normalizeId } from "./names.mjs";

export const BOOK_SCHEMA = "qq.tasks-book/v1";
export const DEFAULT_PROJECT = "qq";

function requireAbsolute(path, label) {
  if (typeof path !== "string" || path.length === 0 || !isAbsolute(path)) {
    throw new Error(`qq-tasks: ${label} must be an absolute path`);
  }
  return path;
}

function homeDir(env = process.env) {
  const home = env.HOME || homedir();
  if (!home || !isAbsolute(home)) {
    throw new Error("qq-tasks: HOME must be an absolute path when DSH_HOME is unset");
  }
  return home;
}

/** Default store: a folder beside DSH_HOME. Config override must be absolute. */
export function defaultStoreDir(env = process.env, config = {}) {
  if (config.storeDir !== undefined) return requireAbsolute(config.storeDir, "storeDir");
  const dshHome = env.DSH_HOME?.trim();
  if (dshHome) return join(dirname(requireAbsolute(dshHome, "DSH_HOME")), ".qq-tasks");
  return join(homeDir(env), ".qq-tasks");
}

export function defaultProject(config = {}) {
  if (config.project !== undefined) {
    if (typeof config.project !== "string" || config.project.trim().length === 0) {
      throw new Error("qq-tasks: project must be a non-empty name");
    }
    return sanitizeProject(config.project);
  }
  return DEFAULT_PROJECT;
}

export function sanitizeProject(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\") || trimmed === "." || trimmed === ".."
    || trimmed === "archive" || trimmed.startsWith(".")) {
    throw new Error(`qq-tasks: invalid project ${name}`);
  }
  return trimmed;
}

function emptyBook() {
  return { schema: BOOK_SCHEMA, issued: [], live: [], warm: [] };
}

function validateBook(raw) {
  if (!raw || raw.schema !== BOOK_SCHEMA) return null;
  if (!Array.isArray(raw.issued) || !Array.isArray(raw.live) || !Array.isArray(raw.warm)) return null;
  const asString = (value) => String(value);
  return {
    schema: BOOK_SCHEMA,
    issued: raw.issued.map(asString),
    live: raw.live.map(asString),
    warm: raw.warm.map(asString),
  };
}

function atomicWrite(file, text, mode = 0o600) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try { chmodSync(dirname(file), 0o700); } catch { /* already 0700 */ }
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, text, { mode });
  renameSync(temporary, file);
  try { chmodSync(file, mode); } catch { /* already 0600 */ }
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { labels: [], rest: text };
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { labels: [], rest: text };
  const labels = [];
  const body = match[1];
  const lines = body.split(/\r?\n/);
  let inLabels = false;
  for (const line of lines) {
    if (/^labels:\s*$/.test(line)) {
      inLabels = true;
      continue;
    }
    if (inLabels) {
      const item = line.match(/^\s*-\s+(.+)$/);
      if (item) {
        labels.push(item[1].trim());
        continue;
      }
      if (/^\s*$/.test(line)) continue;
      inLabels = false;
    }
  }
  return { labels, rest: text.slice(match[0].length) };
}

function serializeLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return "";
  const items = labels
    .filter((label) => typeof label === "string" && label.trim().length > 0)
    .map((label) => `  - ${label.trim()}`);
  if (items.length === 0) return "";
  return `---\nlabels:\n${items.join("\n")}\n---\n`;
}

export function parseTicket(text) {
  const { labels, rest } = parseFrontmatter(String(text ?? ""));
  const trimmed = rest.replace(/^\uFEFF/, "");
  const heading = trimmed.match(/^#\s+(.+?)(?:\r?\n|$)/);
  const title = heading ? heading[1].trim() : "";
  const body = heading ? trimmed.slice(heading[0].length).replace(/^\r?\n/, "") : trimmed;
  return { title, body: body.replace(/\r?\n$/, ""), labels };
}

export function formatTicket({ title, body, labels } = {}) {
  const heading = `# ${String(title ?? "").trim() || "untitled"}\n`;
  const prose = body == null ? "" : String(body);
  const gap = prose.length > 0 && !prose.startsWith("\n") ? "\n" : "";
  return `${serializeLabels(labels)}${heading}${gap}${prose}`;
}

function oneLine(body) {
  const line = String(body ?? "").split(/\r?\n/).find((row) => row.trim().length > 0) ?? "";
  return line.trim().slice(0, 160);
}

function completionStamp(now) {
  const date = new Date(now());
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return iso;
}

/**
 * One persistent pile plus the global book. `filePath` may be omitted only
 * via storeDir; the store always lives on disk so restart keeps numbers.
 */
export function createTaskStore(dirPath, options = {}) {
  const storeDir = requireAbsolute(dirPath, "storeDir");
  const projectName = defaultProject(options);
  const rng = options.rng ?? Math.random;
  const now = options.now ?? Date.now;
  mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  try { chmodSync(storeDir, 0o700); } catch { /* already 0700 */ }

  const bookFile = join(storeDir, "book.json");

  function loadBook() {
    if (!existsSync(bookFile)) return emptyBook();
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(bookFile, "utf8"));
    } catch (error) {
      throw new Error(`qq-tasks: book ${bookFile} is malformed`, { cause: error });
    }
    const book = validateBook(parsed);
    if (!book) throw new Error(`qq-tasks: book ${bookFile} is malformed`);
    return book;
  }

  function persistBook(book) {
    atomicWrite(bookFile, `${JSON.stringify(book, null, 2)}\n`, 0o600);
  }

  function projectDir(project) {
    return join(storeDir, sanitizeProject(project));
  }

  function livePath(project, id) {
    return join(projectDir(project), `${id}.md`);
  }

  function archiveDir(project) {
    return join(projectDir(project), "archive");
  }

  function scanLive() {
    const found = [];
    if (!existsSync(storeDir)) return found;
    for (const entry of readdirSync(storeDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "archive") continue;
      const dir = join(storeDir, entry.name);
      for (const file of readdirSync(dir, { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith(".md")) continue;
        const id = file.name.slice(0, -3);
        if (!/^\d+$/.test(id)) continue;
        found.push({ id, project: entry.name, path: join(dir, file.name) });
      }
    }
    return found;
  }

  function findLive(id) {
    const want = normalizeId(id);
    return scanLive().find((row) => row.id === want) ?? null;
  }

  function readLive(row) {
    const parsed = parseTicket(readFileSync(row.path, "utf8"));
    let issuedAt = null;
    try {
      issuedAt = statSync(row.path).mtimeMs;
    } catch {
      issuedAt = null;
    }
    return {
      id: row.id,
      project: row.project,
      title: parsed.title,
      body: parsed.body,
      labels: parsed.labels,
      issuedAt,
    };
  }

  const store = {
    dirPath: storeDir,
    project: projectName,
    bookFile,

    book() {
      const book = loadBook();
      return {
        schema: book.schema,
        issued: [...book.issued],
        live: [...book.live],
        warm: [...book.warm],
      };
    },

    create({ title, body = "", project, labels } = {}) {
      if (typeof title !== "string" || title.trim().length === 0) {
        throw new Error("qq-tasks: create requires a title");
      }
      const dest = sanitizeProject(project ?? projectName);
      const book = loadBook();
      const id = dealId(book.live, book.warm, rng);
      const text = formatTicket({ title: title.trim(), body, labels });
      mkdirSync(projectDir(dest), { recursive: true, mode: 0o700 });
      try { chmodSync(projectDir(dest), 0o700); } catch { /* already 0700 */ }
      atomicWrite(livePath(dest, id), text.endsWith("\n") ? text : `${text}\n`, 0o600);
      book.issued.push(id);
      book.live.push(id);
      persistBook(book);
      return id;
    },

    read(id) {
      const row = findLive(id);
      if (!row) throw new Error(`qq-tasks: ticket ${id} is not live`);
      const ticket = readLive(row);
      return {
        id: ticket.id,
        project: ticket.project,
        title: ticket.title,
        body: ticket.body,
        labels: ticket.labels,
      };
    },

    list({ project } = {}) {
      const filter = project === undefined ? null : sanitizeProject(project);
      return scanLive()
        .filter((row) => filter === null || row.project === filter)
        .map((row) => {
          const ticket = readLive(row);
          return {
            id: ticket.id,
            project: ticket.project,
            title: ticket.title,
            oneLine: oneLine(ticket.body),
            labels: ticket.labels,
            issuedAt: ticket.issuedAt,
          };
        })
        .sort((left, right) => Number(left.id) - Number(right.id));
    },

    edit(id, { title, body, labels } = {}) {
      const row = findLive(id);
      if (!row) throw new Error(`qq-tasks: ticket ${id} is not live`);
      const current = readLive(row);
      const next = formatTicket({
        title: title === undefined ? current.title : title,
        body: body === undefined ? current.body : body,
        labels: labels === undefined ? current.labels : labels,
      });
      atomicWrite(row.path, next.endsWith("\n") ? next : `${next}\n`, 0o600);
      return store.read(id);
    },

    append(id, text) {
      if (typeof text !== "string" || text.length === 0) {
        throw new Error("qq-tasks: append requires text");
      }
      const row = findLive(id);
      if (!row) throw new Error(`qq-tasks: ticket ${id} is not live`);
      const current = readLive(row);
      const joined = current.body.length === 0
        ? text
        : `${current.body.replace(/\s*$/, "")}\n\n${text}`;
      return store.edit(id, { body: joined });
    },

    archive(id) {
      const row = findLive(id);
      if (!row) throw new Error(`qq-tasks: ticket ${id} is not live`);
      const destDir = archiveDir(row.project);
      mkdirSync(destDir, { recursive: true, mode: 0o700 });
      try { chmodSync(destDir, 0o700); } catch { /* already 0700 */ }
      const stamp = completionStamp(now);
      const dest = join(destDir, `${stamp}-${row.id}.md`);
      const text = readFileSync(row.path);
      atomicWrite(dest, text, 0o600);
      unlinkSync(row.path);
      const book = loadBook();
      book.live = book.live.filter((live) => live !== row.id);
      if (!book.warm.includes(row.id)) book.warm.push(row.id);
      persistBook(book);
      return row.id;
    },
  };

  return store;
}
