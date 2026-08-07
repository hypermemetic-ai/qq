import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [extensionArg, bundleArg, loaderArg, scratchArg] = process.argv.slice(2);
if (!extensionArg || !bundleArg || !loaderArg || !scratchArg) {
  throw new Error(
    "usage: check-qq-prompt-loader.mjs <extension> <bundle-root> <resource-loader> <scratch>",
  );
}

const extensionPath = resolve(extensionArg);
const bundleRoot = resolve(bundleArg);
const scratch = resolve(scratchArg);
const agentDir = join(scratch, "agent");
const expectedNames = ["architect", "bro", "check-in", "model-analysis", "model-benchmarks", "update"];
const expectedPaths = expectedNames.map((name) => join(bundleRoot, "prompts", `${name}.md`));
const { DefaultResourceLoader } = await import(pathToFileURL(resolve(loaderArg)));
const { default: registerMethodology } = await import(
  `${pathToFileURL(extensionPath).href}?prompt-loader-test=${Date.now()}`
);

function runtime() {
  const handlers = new Map();
  const pi = {
    on(name, handler) {
      const entries = handlers.get(name) ?? [];
      entries.push(handler);
      handlers.set(name, entries);
    },
    registerTool() {},
    registerCommand() {},
    registerShortcut() {},
    sendMessage() {},
  };
  return { pi, handlers };
}

async function emit(instance, name, event, context) {
  const results = [];
  for (const handler of instance.handlers.get(name) ?? []) {
    results.push(await handler(event, context));
  }
  return results;
}

function context() {
  return {
    hasUI: false,
    isProjectTrusted: () => true,
    ui: { setStatus() {}, notify() {} },
  };
}

function watch() {
  return { on() { return this; }, close() {} };
}

async function methodologyResources(cwd, linked) {
  const instance = runtime();
  await registerMethodology(instance.pi, {
    cwd,
    bundleRoot,
    inspectLink: async () => linked
      ? { linked: true, state: "linked", repositoryRoot: cwd }
      : { linked: false, state: "unlinked" },
    siblingRegisters: [],
    watch,
  });
  if (!linked) {
    assert.equal(instance.handlers.size, 0, "unlinked methodology registered handlers");
    return undefined;
  }

  const ctx = context();
  await emit(instance, "session_start", { reason: "startup" }, ctx);
  const [resources] = await emit(
    instance,
    "resources_discover",
    { reason: "startup", cwd },
    ctx,
  );
  assert.deepEqual(
    Object.keys(resources).sort(),
    ["promptPaths"],
    "linked methodology must contribute prompts and no Skill root",
  );
  assert.equal(
    JSON.stringify(resources).includes(join(bundleRoot, "skills")),
    false,
    "linked methodology leaked the canonical Skill root",
  );
  return resources;
}

async function projectLoader(cwd) {
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload({ resolveProjectTrust: async () => true });
  return loader;
}

function mountPrompts(loader, resources) {
  if (!resources?.promptPaths?.length) return;
  loader.extendResources({
    promptPaths: resources.promptPaths.map((path) => ({
      path,
      metadata: {
        source: "extension:qq-methodology",
        scope: "temporary",
        origin: "top-level",
        baseDir: join(bundleRoot, "extensions"),
      },
    })),
  });
}

function promptResult(loader) {
  const result = loader.getPrompts();
  return {
    prompts: result.prompts.map(({ name, filePath }) => ({ name, filePath })),
    diagnostics: result.diagnostics,
  };
}

function assertCanonical(result, label) {
  assert.deepEqual(
    result.prompts.map(({ name }) => name).sort(),
    expectedNames,
    `${label}: wrong prompt names`,
  );
  assert.deepEqual(
    result.prompts.map(({ filePath }) => filePath).sort(),
    expectedPaths.slice().sort(),
    `${label}: prompts did not come from the canonical root`,
  );
  assert.deepEqual(result.diagnostics, [], `${label}: unexpected prompt diagnostics`);
}

await rm(scratch, { recursive: true, force: true });
await mkdir(agentDir, { recursive: true });

// qq itself has no project-local prompt copy; its linked mount supplies each
// canonical prompt, including the native manual Architect template, exactly
// once through stock Pi resource loading.
const qqResources = await methodologyResources(bundleRoot, true);
const qqLoader = await projectLoader(bundleRoot);
mountPrompts(qqLoader, qqResources);
assertCanonical(promptResult(qqLoader), "qq root");

// Another linked Repository receives those exact canonical files.
const linkedRepository = join(scratch, "linked-repository");
await mkdir(linkedRepository, { recursive: true });
const linkedResources = await methodologyResources(linkedRepository, true);
const linkedLoader = await projectLoader(linkedRepository);
mountPrompts(linkedLoader, linkedResources);
assertCanonical(promptResult(linkedLoader), "linked Repository");

// An unlinked Repository receives no qq prompt resources.
const unlinkedRepository = join(scratch, "unlinked-repository");
await mkdir(unlinkedRepository, { recursive: true });
const unlinkedResources = await methodologyResources(unlinkedRepository, false);
const unlinkedLoader = await projectLoader(unlinkedRepository);
mountPrompts(unlinkedLoader, unlinkedResources);
assert.deepEqual(promptResult(unlinkedLoader), { prompts: [], diagnostics: [] });

// A different project-local file keeps Pi's genuine same-name collision.
const collisionRepository = join(scratch, "collision-repository");
const localBro = join(collisionRepository, ".pi", "prompts", "bro.md");
await mkdir(join(collisionRepository, ".pi", "prompts"), { recursive: true });
await writeFile(localBro, "different Repository-local prompt\n", "utf8");
const collisionResources = await methodologyResources(collisionRepository, true);
const collisionLoader = await projectLoader(collisionRepository);
mountPrompts(collisionLoader, collisionResources);
const collision = promptResult(collisionLoader);
assert.deepEqual(collision.prompts.map(({ name }) => name).sort(), expectedNames);
assert.equal(collision.diagnostics.length, 1, JSON.stringify(collision.diagnostics));
assert.equal(collision.diagnostics[0].type, "collision");
assert.equal(collision.diagnostics[0].collision?.name, "bro");
assert.equal(collision.diagnostics[0].collision?.winnerPath, localBro);
assert.equal(collision.diagnostics[0].collision?.loserPath, join(bundleRoot, "prompts", "bro.md"));

console.log("qq prompt loader integration: pass");
