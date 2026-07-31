// @ts-nocheck
// qq owns the accountable-session lineage contract: qq-delegate reads
// PI_SUBAGENT_PARENT_SESSION to bind delegate TERMINAL records to their
// accountable session (qq-observe assemble's parent-of-delegate lineage).
// The vendor extension that used to set it is deleted; this setter keeps
// the contract qq-owned. qq-delegate children run with --no-extensions,
// so only root (interactive) sessions ever set it, each to its own id.

export default function register(pi) {
  pi.on("session_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager?.getSessionId?.();
    if (typeof sessionId === "string" && sessionId !== "") {
      process.env.PI_SUBAGENT_PARENT_SESSION = sessionId;
    }
  });
}
