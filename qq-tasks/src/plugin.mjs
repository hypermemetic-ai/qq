// qq-tasks: one repository, one plugin. Cordis entry point.
//
// Loading this plugin is how a DSH host gets a backlog. qq expects it and
// still runs if it is absent. The start script already binds qq-* siblings;
// this package is not named in bin/qq or host.patch.yml.

import { createTaskStore, defaultProject, defaultStoreDir } from "./store.mjs";
import { createTasksSettings } from "./settings.mjs";
import { createTasksService } from "./service.mjs";

export const name = "qq-tasks";
export const inject = [];
export const provide = "qq-tasks";

export function apply(ctx, config = {}) {
  const store = createTaskStore(defaultStoreDir(process.env, config), {
    project: defaultProject(config),
    rng: config.rng,
    now: config.now,
  });
  const settings = createTasksSettings({ settingsFile: config.settingsFile });
  const llm = ctx.get?.("llm", false) ?? null;
  const service = createTasksService(store, {
    settings,
    llm,
    runRundown: config.runRundown,
  });
  ctx.provide("qq-tasks", service);
}

export const internals = Object.freeze({
  defaultStoreDir,
  defaultProject,
});
