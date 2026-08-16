import { pathToFileURL } from "node:url";

import { qqRelayClientPath } from "./qq-relay-install-root.mjs";

let clientPath;
try {
  clientPath = qqRelayClientPath();
} catch (error) {
  throw new Error(`qq-relay installed client root is invalid: ${error.message}`, { cause: error });
}

let client;
try {
  client = await import(pathToFileURL(clientPath).href);
} catch (error) {
  throw new Error(
    `qq-relay installed client is unavailable at ${clientPath}; install qq-relay at the configured root: ${error.message}`,
    { cause: error },
  );
}

for (const name of ["QQ_RELAY_PROTOCOL", "RelayClient", "RelayError", "canonicalRelayJson"]) {
  if (!(name in client)) throw new Error(`qq-relay installed client does not export ${name}: ${clientPath}`);
}

export const QQ_RELAY_PROTOCOL = client.QQ_RELAY_PROTOCOL;
export const RelayClient = client.RelayClient;
export const RelayError = client.RelayError;
export const canonicalRelayJson = client.canonicalRelayJson;
