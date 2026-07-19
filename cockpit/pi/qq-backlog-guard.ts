import { execFileSync } from "node:child_process";
import { resolve, sep } from "node:path";

const FEEDBACK =
  "managed Backlog markdown must be edited through the backlog CLI";

function checkoutRoot(cwd) {
  try {
    const root = execFileSync(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return root === "" ? undefined : resolve(root);
  } catch {
    return undefined;
  }
}

export default function (pi) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") {
      return undefined;
    }

    const rawPath = event.input?.path;
    if (typeof rawPath !== "string" || rawPath === "") {
      return undefined;
    }

    const root = checkoutRoot(ctx.cwd);
    if (root === undefined) {
      return undefined;
    }

    const backlogRoot = resolve(root, "backlog");
    const target = resolve(ctx.cwd, rawPath);
    if (target === backlogRoot || target.startsWith(`${backlogRoot}${sep}`)) {
      return { block: true, reason: FEEDBACK };
    }

    return undefined;
  });
}
