// @ts-nocheck
// Adapted from https://github.com/mitsuhiko/agent-stuff, extensions/continue.ts (Apache-2.0).

export default function register(pi, deps = {}) {
  pi.registerShortcut("shift+alt+enter", {
    description: 'Send "continue" when the agent is stopped',
    handler: (ctx) => {
      if (!ctx.isIdle()) return;
      pi.sendUserMessage("continue");
    },
  });
}
