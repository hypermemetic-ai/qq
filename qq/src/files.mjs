import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const MAX_READABLE_FILE_BYTES = 512 * 1024;
export const MAX_OPEN_FILE_BYTES = 32 * 1024 * 1024;

const CODE_LANGUAGES = Object.freeze({
  ".bash": "bash",
  ".c": "c",
  ".cc": "cpp",
  ".cjs": "javascript",
  ".cpp": "cpp",
  ".css": "css",
  ".diff": "diff",
  ".go": "go",
  ".h": "c",
  ".hpp": "cpp",
  ".htm": "xml",
  ".html": "xml",
  ".ini": "ini",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "javascript",
  ".lua": "lua",
  ".mjs": "javascript",
  ".patch": "diff",
  ".php": "php",
  ".pl": "perl",
  ".py": "python",
  ".rb": "ruby",
  ".rs": "rust",
  ".scss": "scss",
  ".sh": "bash",
  ".sql": "sql",
  ".toml": "ini",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".vue": "xml",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".zsh": "bash",
});

const NAMED_CODE_LANGUAGES = Object.freeze({
  dockerfile: "dockerfile",
  makefile: "makefile",
  rakefile: "ruby",
});

const NAMED_TEXT_FILES = new Set([
  "authors",
  "changelog",
  "copying",
  "license",
  "readme",
]);

const TEXT_EXTENSIONS = new Set([".csv", ".log", ".text", ".tsv", ".txt"]);
const MARKDOWN_EXTENSIONS = new Set([".markdown", ".md", ".mdown", ".mkd"]);
const BINARY_TYPES = Object.freeze({
  ".avif": { mediaType: "image/avif", disposition: "inline" },
  ".gif": { mediaType: "image/gif", disposition: "inline" },
  ".gz": { mediaType: "application/gzip", disposition: "attachment" },
  ".jpeg": { mediaType: "image/jpeg", disposition: "inline" },
  ".jpg": { mediaType: "image/jpeg", disposition: "inline" },
  ".pdf": { mediaType: "application/pdf", disposition: "inline" },
  ".png": { mediaType: "image/png", disposition: "inline" },
  ".tar": { mediaType: "application/x-tar", disposition: "attachment" },
  ".webp": { mediaType: "image/webp", disposition: "inline" },
  ".zip": { mediaType: "application/zip", disposition: "attachment" },
});

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function canonicalDirectory(value, label) {
  let path;
  try {
    path = realpathSync(value);
  } catch (error) {
    throw new Error(`qq: ${label} is not a resolvable directory`, { cause: error });
  }
  try {
    if (!statSync(path).isDirectory()) throw new Error("not a directory");
  } catch (error) {
    throw new Error(`qq: ${label} is not a resolvable directory`, { cause: error });
  }
  return path;
}

function contained(root, candidate) {
  const rel = relative(root, candidate);
  if (!rel || rel === ".") return true;
  if (isAbsolute(rel)) return false;
  return !rel.split(sep).includes("..");
}

function relativePath(value, allowEmpty = false) {
  const path = String(value ?? "");
  if (!path) {
    if (allowEmpty) return "";
    throw httpError(400, "qq: file path is required");
  }
  if (path.includes("\0") || path.startsWith("/") || path.endsWith("/")) {
    throw httpError(400, "qq: file path must be project-relative");
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw httpError(400, "qq: file path must be canonical and project-relative");
  }
  return parts.join("/");
}

function canonicalEntry(projectRoot, path, expected) {
  const requested = relativePath(path, expected === "directory");
  const listed = requested ? resolve(projectRoot, ...requested.split("/")) : projectRoot;
  let canonical;
  try {
    canonical = realpathSync(listed);
  } catch {
    throw httpError(404, "qq: project file not found");
  }
  if (!contained(projectRoot, canonical)) {
    throw httpError(403, "qq: project file escapes the selected project", "escape");
  }
  let info;
  try {
    info = statSync(canonical);
  } catch {
    throw httpError(404, "qq: project file not found");
  }
  if (expected === "directory" && !info.isDirectory()) {
    throw httpError(400, "qq: project path is not a directory");
  }
  if (expected === "file" && !info.isFile()) {
    throw httpError(400, "qq: project path is not a regular file");
  }
  return { canonical, info, requested };
}

/** Deterministic display metadata derived only from a file's basename. */
export function projectFileType(name) {
  const basename = String(name ?? "");
  const lower = basename.toLocaleLowerCase("en-US");
  const extension = extname(lower);
  if (MARKDOWN_EXTENSIONS.has(extension)) return Object.freeze({ kind: "markdown" });
  if (TEXT_EXTENSIONS.has(extension) || NAMED_TEXT_FILES.has(lower)) {
    return Object.freeze({ kind: "text" });
  }
  if (CODE_LANGUAGES[extension]) {
    return Object.freeze({ kind: "code", language: CODE_LANGUAGES[extension] });
  }
  if (NAMED_CODE_LANGUAGES[lower]) {
    return Object.freeze({ kind: "code", language: NAMED_CODE_LANGUAGES[lower] });
  }
  if (lower === ".env" || lower.startsWith(".env.")) {
    return Object.freeze({ kind: "code", language: "ini" });
  }
  if ([".editorconfig", ".gitconfig"].includes(lower)) {
    return Object.freeze({ kind: "code", language: "ini" });
  }
  if ([".gitattributes", ".gitignore", ".npmignore"].includes(lower)) {
    return Object.freeze({ kind: "text" });
  }
  if (BINARY_TYPES[extension]) {
    return Object.freeze({ kind: "binary", ...BINARY_TYPES[extension] });
  }
  return Object.freeze({ kind: "unsupported" });
}

function breadcrumbs(project, path) {
  const crumbs = [{ type: "projects", name: "projects", path: null }];
  if (!project) return crumbs;
  crumbs.push({ type: "project", name: project, path: "" });
  const segments = path ? path.split("/") : [];
  let at = "";
  for (const segment of segments) {
    at = at ? `${at}/${segment}` : segment;
    crumbs.push({ type: "directory", name: segment, path: at });
  }
  return crumbs;
}

function readBoundedFile(projectRoot, canonical, maximum, includeBody = true) {
  let descriptor;
  try {
    descriptor = openSync(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let resolved;
    try {
      // Linux exposes the canonical target of the opened capability, closing
      // the parent-directory rename race between realpath and open.
      resolved = realpathSync(`/proc/self/fd/${descriptor}`);
    } catch {
      resolved = realpathSync(canonical);
    }
    if (!contained(projectRoot, resolved)) {
      throw httpError(403, "qq: project file escapes the selected project", "escape");
    }
    const info = fstatSync(descriptor);
    if (!info.isFile()) throw httpError(400, "qq: project path is not a regular file");
    if (info.size > maximum) {
      throw httpError(413, `qq: file exceeds the ${Math.floor(maximum / 1024)} KiB limit`, "oversized");
    }
    return { size: info.size, ...(includeBody ? { body: readFileSync(descriptor) } : {}) };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Create the bounded filesystem capability exposed by qq. Results contain only
 * project-relative paths and bytes; absolute project roots never cross into a
 * presentation plugin.
 */
export function createProjectFileService(projectsRoot, listProjects, options = {}) {
  const root = canonicalDirectory(projectsRoot, "projectsRoot");
  if (typeof listProjects !== "function") {
    throw new Error("qq: project file service requires the project catalog");
  }
  const readableLimit = options.readableLimit ?? MAX_READABLE_FILE_BYTES;
  const openLimit = options.openLimit ?? MAX_OPEN_FILE_BYTES;
  for (const [value, name] of [[readableLimit, "readableLimit"], [openLimit, "openLimit"]]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`qq: ${name} must be a positive integer`);
    }
  }

  function projectByName(name) {
    const wanted = String(name ?? "");
    const project = listProjects().find((entry) => entry.name === wanted);
    if (!project) throw httpError(404, "qq: project not found");
    const canonical = canonicalDirectory(project.cwd, "project root");
    if (!contained(root, canonical)) {
      throw httpError(403, "qq: project root escapes projectsRoot", "escape");
    }
    return { name: project.name, cwd: canonical };
  }

  function listProjectFiles(projectName, path = "") {
    if (projectName === undefined || projectName === null || projectName === "") {
      const entries = listProjects().map((project) => ({
        name: project.name,
        type: "project",
        project: project.name,
      }));
      entries.sort((left, right) => left.name.localeCompare(right.name));
      return Object.freeze({
        scope: "projects",
        project: null,
        path: "",
        parent: null,
        breadcrumbs: Object.freeze(breadcrumbs(null, "")),
        entries: Object.freeze(entries.map(Object.freeze)),
      });
    }

    const project = projectByName(projectName);
    const directory = canonicalEntry(project.cwd, path, "directory");
    let listed;
    try {
      listed = readdirSync(directory.canonical, { withFileTypes: true });
    } catch {
      throw httpError(403, "qq: project directory is not readable");
    }
    const entries = [];
    for (const entry of listed) {
      if (!entry.name || entry.name === "." || entry.name === "..") continue;
      const child = join(directory.canonical, entry.name);
      let canonical;
      let info;
      try {
        lstatSync(child);
        canonical = realpathSync(child);
        if (!contained(project.cwd, canonical)) continue;
        info = statSync(canonical);
      } catch {
        continue;
      }
      const childPath = directory.requested
        ? `${directory.requested}/${entry.name}`
        : entry.name;
      if (info.isDirectory()) {
        entries.push({ name: entry.name, type: "directory", path: childPath });
      } else if (info.isFile()) {
        entries.push({ name: entry.name, type: "file", path: childPath, ...projectFileType(entry.name) });
      }
    }
    entries.sort((left, right) => {
      if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
    const parent = directory.requested
      ? directory.requested.split("/").slice(0, -1).join("/")
      : null;
    return Object.freeze({
      scope: "project",
      project: project.name,
      path: directory.requested,
      parent,
      breadcrumbs: Object.freeze(breadcrumbs(project.name, directory.requested).map(Object.freeze)),
      entries: Object.freeze(entries.map(Object.freeze)),
    });
  }

  function readProjectFile(projectName, path) {
    const project = projectByName(projectName);
    const file = canonicalEntry(project.cwd, path, "file");
    const name = file.requested.split("/").at(-1);
    const type = projectFileType(name);
    if (type.kind === "binary") {
      throw httpError(415, "qq: binary file opens outside the read-only text view", "binary");
    }
    if (type.kind === "unsupported") {
      throw httpError(415, "qq: unsupported file type", "unsupported");
    }
    const { body, size } = readBoundedFile(project.cwd, file.canonical, readableLimit);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(body);
    } catch {
      throw httpError(415, "qq: file is not valid UTF-8 text", "unsupported");
    }
    if (text.includes("\0")) {
      throw httpError(415, "qq: file contains binary data", "unsupported");
    }
    return Object.freeze({
      project: project.name,
      path: file.requested,
      name,
      size,
      ...type,
      text,
    });
  }

  function openProjectFile(projectName, path, options = {}) {
    const project = projectByName(projectName);
    const file = canonicalEntry(project.cwd, path, "file");
    const name = file.requested.split("/").at(-1);
    const type = projectFileType(name);
    if (type.kind !== "binary") {
      throw httpError(415, type.kind === "unsupported"
        ? "qq: unsupported file type"
        : "qq: text file must use the read-only file view", type.kind);
    }
    const opened = readBoundedFile(project.cwd, file.canonical, openLimit, options.includeBody !== false);
    return Object.freeze({
      project: project.name,
      path: file.requested,
      name,
      size: opened.size,
      kind: type.kind,
      mediaType: type.mediaType,
      disposition: type.disposition,
      ...(opened.body ? { body: opened.body } : {}),
    });
  }

  return Object.freeze({ listProjectFiles, readProjectFile, openProjectFile });
}

export const internals = Object.freeze({
  CODE_LANGUAGES,
  BINARY_TYPES,
  contained,
  relativePath,
  canonicalEntry,
});
