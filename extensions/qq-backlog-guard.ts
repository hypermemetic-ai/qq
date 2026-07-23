import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FEEDBACK =
  "managed Backlog markdown must be edited through the backlog CLI";
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function resolvePiPath(cwd, rawPath) {
  let normalized = rawPath.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  if (normalized === "~") {
    normalized = homedir();
  } else if (
    normalized.startsWith("~/") ||
    (process.platform === "win32" && normalized.startsWith("~\\"))
  ) {
    normalized = join(homedir(), normalized.slice(2));
  } else if (/^file:\/\//.test(normalized)) {
    normalized = fileURLToPath(normalized);
  }
  return resolve(cwd, normalized);
}

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
    const target = resolvePiPath(ctx.cwd, rawPath);
    if (target === backlogRoot || target.startsWith(`${backlogRoot}${sep}`)) {
      return { block: true, reason: FEEDBACK };
    }

    return undefined;
  });
}
