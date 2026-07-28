// @ts-nocheck

import { pathToFileURL } from "node:url";

const BLOCKED_REGISTRATIONS = new Set(["registerCommand", "registerShortcut", "registerTool"]);
export function brokerOnlySubagentApi(pi) {
  return new Proxy(pi, {
    get(target, property) {
      if (BLOCKED_REGISTRATIONS.has(property)) return () => {};
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
export function registerBrokerOnlySubagents(pi, registerVendor) {
  return registerVendor(brokerOnlySubagentApi(pi));
}
export default async function register(pi) {
  const vendor = `${process.env.HOME}/.pi/agent/git/github.com/hypermemetic-ai/pi-subagents/index.ts`;
  const registerVendor = (await import(pathToFileURL(vendor).href)).default;
  return registerBrokerOnlySubagents(pi, registerVendor);
}
