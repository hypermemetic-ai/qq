#!/usr/bin/env node
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !manifestPath.endsWith("/profiles/qq-console/package.json")) {
  throw new Error("usage: configure-profile.mjs <DSH_HOME>/profiles/qq-console/package.json");
}
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const consolePackage = "@hypermemetic-ai/qq-dsh-console";
const current = manifest.dsh?.profile?.bundles;
if (!Array.isArray(current) || !current.includes(consolePackage)) {
  throw new Error(`profile does not contain ${consolePackage}; add the local package first`);
}
const unexpected = current.filter(
  (bundle) => bundle !== consolePackage && bundle !== "@deepseek-ai/dsh-base",
);
if (unexpected.length) {
  throw new Error(`refusing to replace an existing surface bundle: ${unexpected.join(", ")}`);
}
manifest.dsh.profile.bundles = ["@deepseek-ai/dsh-base", consolePackage];
const temporary = `${manifestPath}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, manifestPath);
console.log(`configured ${manifestPath}`);
