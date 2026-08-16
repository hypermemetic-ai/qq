import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const QQ_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const relationPath = join(QQ_ROOT, "qq-relay", "upstream.env");

let relation;
try {
  relation = await readFile(relationPath, "utf8");
} catch (error) {
  throw new Error(`qq-relay source relation is unavailable at ${relationPath}: ${error.message}`, { cause: error });
}

const prefix = "QQ_RELAY_LANDED_REPOSITORY=";
const landed = relation.split("\n").find((line) => line.startsWith(prefix))?.slice(prefix.length);
if (!landed) throw new Error(`qq-relay source relation has no ${prefix.slice(0, -1)} value: ${relationPath}`);

const sourceRoot = resolve(process.env.QQ_RELAY_SOURCE || landed);
const clientPath = join(sourceRoot, "client.mjs");
let client;
try {
  client = await import(pathToFileURL(clientPath).href);
} catch (error) {
  throw new Error(
    `qq-relay linked client is unavailable at ${clientPath}; set QQ_RELAY_SOURCE or restore the configured landed repository: ${error.message}`,
    { cause: error },
  );
}

for (const name of ["QQ_RELAY_PROTOCOL", "RelayClient", "RelayError", "canonicalRelayJson"]) {
  if (!(name in client)) throw new Error(`qq-relay linked client does not export ${name}: ${clientPath}`);
}

export const QQ_RELAY_PROTOCOL = client.QQ_RELAY_PROTOCOL;
export const RelayClient = client.RelayClient;
export const RelayError = client.RelayError;
export const canonicalRelayJson = client.canonicalRelayJson;
