// Tasks-owned rundown role. Required absolute settingsFile.
// Missing path, missing file, or empty role is unbound.
// This is not ~/.config/qq/execution-profiles.json and not architect scribe.

import { dirname, isAbsolute } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export const TASKS_SETTINGS_SCHEMA = "qq.tasks-settings/v1";
export const TASKS_ROLES = Object.freeze(["rundown"]);

function normalizeBinding(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.provider !== "string" || value.provider.length === 0) return null;
  if (typeof value.model !== "string" || value.model.length === 0) return null;
  return {
    provider: value.provider,
    model: value.model,
    ...(typeof value.effort === "string" && value.effort.length > 0 ? { effort: value.effort } : {}),
  };
}

function persist(path, record) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

/** Rundown role bindings. Unbound when settingsFile is missing or relative. */
export function createTasksSettings({ settingsFile } = {}) {
  const path = typeof settingsFile === "string" && isAbsolute(settingsFile) ? settingsFile : null;

  function load() {
    if (!path || !existsSync(path)) {
      return { schema: TASKS_SETTINGS_SCHEMA, roles: { rundown: null }, unbound: true };
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(`qq-tasks: settings ${path} are malformed`, { cause: error });
    }
    if (parsed?.schema && parsed.schema !== TASKS_SETTINGS_SCHEMA) {
      throw new Error("qq-tasks: settings are malformed");
    }
    const roles = parsed?.roles && typeof parsed.roles === "object" ? parsed.roles : {};
    return {
      schema: TASKS_SETTINGS_SCHEMA,
      roles: { rundown: normalizeBinding(roles.rundown) },
      unbound: false,
    };
  }

  return Object.freeze({
    path,
    unbound: () => path === null || !existsSync(path) || load().roles.rundown === null,
    get(role) {
      if (!TASKS_ROLES.includes(role)) return null;
      return load().roles[role];
    },
    write(role, binding) {
      if (!path) throw new Error("qq-tasks: settings are unbound (no settingsFile)");
      if (!TASKS_ROLES.includes(role)) throw new Error(`qq-tasks: unknown role ${role}`);
      const next = normalizeBinding(binding);
      if (!next) throw new Error("qq-tasks: role binding requires provider and model");
      persist(path, { schema: TASKS_SETTINGS_SCHEMA, roles: { rundown: next } });
      return next;
    },
  });
}
