const adapters = new Set();

/**
 * Process-local capability discovery for an explicitly composed DSH host.
 * Durable launch ownership remains in DSH persistence and the private handoff;
 * this registry only connects the mounted Cordis adapter to the Pi-compatible
 * board extension running in the same initiator chain.
 */
export function registerNativeLaunchAdapter(adapter) {
  if (!adapter || typeof adapter.supports !== "function" || typeof adapter.launch !== "function") {
    throw new Error("native DSH launch adapter is malformed");
  }
  adapters.add(adapter);
  return () => { adapters.delete(adapter); };
}

export async function launchNativeBootstrap(requestPath, options = {}) {
  const architectSession = options.architectSession;
  const matching = [];
  for (const adapter of adapters) {
    let supported = false;
    try { supported = adapter.supports(architectSession) === true; } catch {}
    if (supported) matching.push(adapter);
  }
  if (matching.length === 0) throw new Error("native DSH launch adapter is unavailable for this architect session");
  if (matching.length !== 1) throw new Error("native DSH launch adapter ownership is ambiguous");
  return matching[0].launch(requestPath, options);
}
