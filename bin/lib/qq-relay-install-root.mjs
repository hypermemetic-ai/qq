import { isAbsolute, join } from "node:path";

export function qqRelayInstallRoot(env = process.env) {
  if (Object.prototype.hasOwnProperty.call(env, "QQ_RELAY_INSTALL_ROOT")) {
    const configured = env.QQ_RELAY_INSTALL_ROOT;
    if (typeof configured !== "string" || configured.length === 0 || !isAbsolute(configured)) {
      throw new Error("QQ_RELAY_INSTALL_ROOT must be an absolute path");
    }
    return configured;
  }

  const home = env.HOME;
  if (typeof home !== "string" || home.length === 0 || !isAbsolute(home)) {
    throw new Error("HOME must be an absolute path when QQ_RELAY_INSTALL_ROOT is unset");
  }
  return join(home, ".local", "lib", "qq", "relay");
}

export function qqRelayClientPath(env = process.env) {
  return join(qqRelayInstallRoot(env), "client.mjs");
}
