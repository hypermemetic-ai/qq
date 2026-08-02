// @ts-nocheck

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const REFRESH_DESCRIPTION = "Refresh quota usage for the active provider";
const BAR_CELLS = 8;
const FILLED_CELL = "▓";
const EMPTY_CELL = "░";
const STATUS_BLOCKLIST = new Set(["pi-lens-lsp", "hunk", "merge-ready"]);
const PROVIDER_MARKS = {
  "kimi-coding": "K",
  "openai-codex": "CX",
  anthropic: "A",
};
const MAX_DELEGATE_ROWS = 8;
const EMPTY_DELEGATE_ROWS = {
  getDelegateRows: () => [],
  subscribeDelegateRows: () => () => {},
};
let delegateRowsPromise;

async function delegateRowsApi() {
  if (!delegateRowsPromise) {
    delegateRowsPromise = import("./qq-delegate-watch.ts").catch((error) => {
      // A copied standalone footer is used by its hermetic unit test. The real
      // extension mount always includes the watcher sibling; other load errors
      // remain visible instead of silently replacing delegate visibility.
      if (error?.code === "ERR_MODULE_NOT_FOUND") return EMPTY_DELEGATE_ROWS;
      throw error;
    });
  }
  return delegateRowsPromise;
}

function compactNumber(value) {
  if (!Number.isFinite(value)) return "?";
  if (value < 1000) return String(Math.round(value));
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1000000) return `${Math.round(value / 1000)}k`;
  if (value < 10000000) return `${(value / 1000000).toFixed(1)}M`;
  return `${Math.round(value / 1000000)}M`;
}

function collapsedCwd(cwd, home) {
  if (typeof cwd !== "string" || cwd === "") return "";
  if (typeof home !== "string" || home === "") return cwd;

  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const child = relative(resolvedHome, resolvedCwd);
  const insideHome =
    child === "" ||
    (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
  if (!insideHome) return cwd;
  return child === "" ? "~" : `~${sep}${child}`;
}

function stripAnsi(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function singleLine(value) {
  return stripAnsi(String(value ?? ""))
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function quotaWindow(used, limit, durationSeconds, label) {
  const parsedUsed = finiteNumber(used);
  const parsedLimit = finiteNumber(limit);
  if (
    parsedUsed === undefined ||
    parsedLimit === undefined ||
    parsedLimit <= 0 ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return undefined;
  }
  return {
    fraction: Math.max(0, Math.min(1, parsedUsed / parsedLimit)),
    durationSeconds,
    label: label ?? durationLabel(durationSeconds),
  };
}

function percentWindow(percent, durationSeconds, label) {
  const parsed = finiteNumber(percent);
  if (parsed === undefined) return undefined;
  return quotaWindow(parsed, 100, durationSeconds, label);
}

function durationLabel(seconds) {
  if (seconds === 5 * 60 * 60) return "5h";
  if (seconds === 7 * 24 * 60 * 60) return "wk";
  if (seconds % (7 * 24 * 60 * 60) === 0) {
    return `${seconds / (7 * 24 * 60 * 60)}w`;
  }
  if (seconds % (24 * 60 * 60) === 0) return `${seconds / (24 * 60 * 60)}d`;
  if (seconds % (60 * 60) === 0) return `${seconds / (60 * 60)}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${Math.round(seconds)}s`;
}

function kimiDuration(window) {
  const duration = finiteNumber(window?.duration);
  if (duration === undefined || duration <= 0) return undefined;
  switch (window?.timeUnit) {
    case "TIME_UNIT_SECOND":
      return duration;
    case "TIME_UNIT_MINUTE":
      return duration * 60;
    case "TIME_UNIT_HOUR":
      return duration * 60 * 60;
    case "TIME_UNIT_DAY":
      return duration * 24 * 60 * 60;
    case "TIME_UNIT_WEEK":
      return duration * 7 * 24 * 60 * 60;
    default:
      return undefined;
  }
}

function parseKimi(body) {
  if (body === null || typeof body !== "object") return undefined;
  const windows = [];
  if (Array.isArray(body.limits)) {
    for (const candidate of body.limits) {
      const durationSeconds = kimiDuration(candidate?.window);
      const parsed = quotaWindow(
        candidate?.detail?.used,
        candidate?.detail?.limit,
        durationSeconds,
      );
      if (parsed) windows.push(parsed);
    }
  }
  const weekly = quotaWindow(
    body.usage?.used,
    body.usage?.limit,
    7 * 24 * 60 * 60,
    "wk",
  );
  if (weekly) windows.push(weekly);
  return windows.length > 0 ? windows : undefined;
}

function parseCodex(body) {
  if (body === null || typeof body !== "object") return undefined;
  const rateLimit = body.rate_limit;
  if (rateLimit === null || typeof rateLimit !== "object") return undefined;
  const windows = [];
  for (const candidate of [
    rateLimit.primary_window,
    rateLimit.secondary_window,
  ]) {
    if (candidate === null || candidate === undefined) continue;
    const durationSeconds = finiteNumber(candidate.limit_window_seconds);
    if (durationSeconds === undefined || durationSeconds <= 0) continue;
    const parsed = percentWindow(candidate.used_percent, durationSeconds);
    if (parsed) windows.push(parsed);
  }
  return windows.length > 0 ? windows : undefined;
}

function parseAnthropic(body) {
  if (body === null || typeof body !== "object") return undefined;
  const windows = [];
  const fiveHour = percentWindow(
    body.five_hour?.utilization,
    5 * 60 * 60,
    "5h",
  );
  const sevenDay = percentWindow(
    body.seven_day?.utilization,
    7 * 24 * 60 * 60,
    "wk",
  );
  if (fiveHour) windows.push(fiveHour);
  if (sevenDay) windows.push(sevenDay);
  return windows.length > 0 ? windows : undefined;
}

function providerRequest(provider, auth) {
  if (provider === "kimi-coding") {
    if (typeof auth?.key !== "string" || auth.key === "") return undefined;
    return {
      url: "https://api.kimi.com/coding/v1/usages",
      headers: {
        Authorization: `Bearer ${auth.key}`,
        Accept: "application/json",
      },
      parse: parseKimi,
    };
  }
  if (provider === "openai-codex") {
    if (
      typeof auth?.access !== "string" ||
      auth.access === "" ||
      typeof auth?.accountId !== "string" ||
      auth.accountId === ""
    ) {
      return undefined;
    }
    return {
      url: "https://chatgpt.com/backend-api/wham/usage",
      headers: {
        Authorization: `Bearer ${auth.access}`,
        "ChatGPT-Account-Id": auth.accountId,
        Accept: "application/json",
      },
      parse: parseCodex,
    };
  }
  if (provider === "anthropic") {
    if (
      auth?.type !== "oauth" ||
      typeof auth?.access !== "string" ||
      auth.access === ""
    ) {
      return undefined;
    }
    return {
      url: "https://api.anthropic.com/api/oauth/usage",
      headers: {
        Authorization: `Bearer ${auth.access}`,
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
      parse: parseAnthropic,
    };
  }
  return undefined;
}

function bar(window) {
  const filled = Math.max(
    0,
    Math.min(BAR_CELLS, Math.round(window.fraction * BAR_CELLS)),
  );
  return `${FILLED_CELL.repeat(filled)}${EMPTY_CELL.repeat(BAR_CELLS - filled)} ${window.label}`;
}

function quotaText(provider, windows) {
  if (!Array.isArray(windows) || windows.length === 0) return "";
  const mark = PROVIDER_MARKS[provider];
  if (!mark) return "";
  const ordered = [...windows].sort(
    (left, right) => left.durationSeconds - right.durationSeconds,
  );
  return `${mark} ${ordered.map(bar).join(" · ")}`;
}

function extensionStatuses(footerData) {
  const source = footerData.getExtensionStatuses?.();
  let entries;
  if (source instanceof Map) {
    entries = [...source.entries()];
  } else if (source !== null && typeof source === "object") {
    entries = Object.entries(source);
  } else {
    entries = [];
  }
  return entries
    .filter(([key]) => !STATUS_BLOCKLIST.has(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, text]) => singleLine(text))
    .filter(Boolean);
}

function contextText(ctx) {
  let usage;
  try {
    usage = ctx.getContextUsage?.();
  } catch {
    usage = undefined;
  }
  const contextWindow = finiteNumber(
    usage?.contextWindow ?? ctx.model?.contextWindow,
  );
  const windowText = compactNumber(contextWindow ?? 0);
  const percent = finiteNumber(usage?.percent);
  return usage?.percent === null || percent === undefined
    ? `?/${windowText}`
    : `${percent.toFixed(1)}%/${windowText}`;
}

function rightAlignedLine(left, right, width, measure, cut) {
  if (width <= 0) return "";
  if (right === "") return cut(left, width);
  if (left === "") {
    const visibleRight = cut(right, width, "");
    return " ".repeat(Math.max(0, width - measure(visibleRight))) + visibleRight;
  }

  const gap = 2;
  if (measure(right) >= width) return cut(right, width, "");
  const leftLimit = width - measure(right) - gap;
  const visibleLeft = cut(left, Math.max(0, leftLimit));
  if (visibleLeft === "") {
    return " ".repeat(width - measure(right)) + right;
  }
  return (
    visibleLeft +
    " ".repeat(width - measure(visibleLeft) - measure(right)) +
    right
  );
}

function createFooter(
  pi,
  ctx,
  tui,
  theme,
  footerData,
  quotaCache,
  widthKit,
  delegates,
) {
  const repaint = () => tui.requestRender();
  const unsubscribeBranch = footerData.onBranchChange?.(repaint);
  const unsubscribeDelegates = delegates.subscribeDelegateRows(repaint);
  const measure = (value) => widthKit.visibleWidth(stripAnsi(value));
  const cut = (value, width, ellipsis = "...") =>
    widthKit.truncateToWidth(stripAnsi(value), width, ellipsis);

  function delegateLine(row, prefix, width) {
    const label = `${prefix} ${singleLine(row.name)}`;
    const age = singleLine(row.age);
    const withAge = age === "" ? label : `${label} · ${age}`;
    return cut(measure(withAge) <= width ? withAge : label, width);
  }

  return {
    render(width) {
      const w = Number.isFinite(width)
        ? Math.min(Math.max(0, Math.floor(width)), 10000)
        : 0;
      let first = collapsedCwd(ctx.cwd, homedir());
      const branch = singleLine(footerData.getGitBranch?.());
      if (branch !== "") first += ` (${branch})`;
      const sessionName = singleLine(pi.getSessionName?.());
      if (sessionName !== "") first += ` • ${sessionName}`;
      const statuses = extensionStatuses(footerData);
      if (statuses.length > 0) first += ` • ${statuses.join(" ")}`;

      const compactParts = [contextText(ctx)];
      const provider = ctx.model?.provider;
      const quotas = quotaText(provider, quotaCache.get(provider));
      if (quotas !== "") compactParts.push(quotas);
      const line = rightAlignedLine(
        singleLine(first),
        compactParts.join(" • "),
        w,
        measure,
        cut,
      );

      const running = delegates.getDelegateRows();
      const shown = running.slice(0, MAX_DELEGATE_ROWS);
      const overflow = Math.max(0, running.length - shown.length);
      const delegateLines = shown.map((row, index) => {
        const isLast = index === shown.length - 1 && overflow === 0;
        return theme.fg("dim", delegateLine(row, isLast ? "└─" : "├─", w));
      });
      if (overflow > 0) {
        delegateLines.push(theme.fg("dim", cut(`└─ +${overflow} more`, w)));
      }
      delegateLines.push(theme.fg("dim", line));
      return delegateLines;
    },
    invalidate() {},
    dispose() {
      if (typeof unsubscribeBranch === "function") unsubscribeBranch();
      if (typeof unsubscribeDelegates === "function") unsubscribeDelegates();
    },
  };
}

export default function register(pi, deps = {}) {
  const authPath = deps.authPath ?? AUTH_PATH;
  const loadFile = deps.readFile ?? readFile;
  const request = deps.fetch ?? globalThis.fetch;
  const startInterval = deps.setInterval ?? globalThis.setInterval;
  const stopInterval = deps.clearInterval ?? globalThis.clearInterval;
  const startTimeout = deps.setTimeout ?? globalThis.setTimeout;
  const stopTimeout = deps.clearTimeout ?? globalThis.clearTimeout;
  const quotaCache = new Map();
  // Width semantics come from pi-tui (the host's own visibleWidth/
  // truncateToWidth, same functions pi core's footer uses); injected in tests.
  let widthKit = deps.widthKit;
  let ctx;
  let tui;
  let timer;
  let polling = false;

  function repaint() {
    tui?.requestRender?.();
  }

  async function readAuth() {
    const raw = await loadFile(authPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    return {
      entries: parsed,
      fingerprint: createHash("sha256").update(raw).digest("hex"),
    };
  }

  async function pollActiveProvider() {
    if (polling) return;
    const provider = ctx?.model?.provider;
    if (!Object.hasOwn(PROVIDER_MARKS, provider)) return;
    polling = true;
    try {
      let authFile;
      try {
        authFile = await readAuth();
      } catch {
        quotaCache.delete(provider);
        repaint();
        return;
      }

      const auth = authFile?.entries?.[provider];
      const providerAuth = providerRequest(provider, auth);
      if (!providerAuth) {
        quotaCache.delete(provider);
        repaint();
        return;
      }

      const controller = new AbortController();
      const timeout = startTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await request(providerAuth.url, {
          method: "GET",
          headers: providerAuth.headers,
          signal: controller.signal,
        });
        if (!response || response.ok === false) {
          quotaCache.delete(provider);
          repaint();
          return;
        }
        let body;
        try {
          body = await response.json();
        } catch {
          quotaCache.delete(provider);
          repaint();
          return;
        }
        const windows = providerAuth.parse(body);
        if (!windows) {
          quotaCache.delete(provider);
          repaint();
          return;
        }
        quotaCache.set(provider, windows);
        repaint();
      } catch {
        // Keep a last-good cache on transport failure; without one, no quota is shown.
      } finally {
        stopTimeout(timeout);
      }
    } finally {
      polling = false;
    }
  }

  pi.registerCommand("qq-footer-refresh", {
    description: REFRESH_DESCRIPTION,
    handler: async () => {
      await pollActiveProvider();
      repaint();
    },
  });

  pi.on("session_start", async (_event, nextCtx) => {
    ctx = nextCtx;
    const delegates = await delegateRowsApi();
    if (!widthKit) {
      const mod = await import("@earendil-works/pi-tui");
      widthKit = {
        visibleWidth: mod.visibleWidth,
        truncateToWidth: mod.truncateToWidth,
      };
    }
    ctx.ui.setFooter((nextTui, theme, footerData) => {
      tui = nextTui;
      return createFooter(
        pi,
        ctx,
        nextTui,
        theme,
        footerData,
        quotaCache,
        widthKit,
        delegates,
      );
    });
    if (timer !== undefined) stopInterval(timer);
    timer = startInterval(() => {
      void pollActiveProvider();
    }, POLL_INTERVAL_MS);
    void pollActiveProvider();
  });

  pi.on("session_shutdown", () => {
    if (timer !== undefined) {
      stopInterval(timer);
      timer = undefined;
    }
    ctx?.ui?.setFooter?.(undefined);
    ctx = undefined;
    tui = undefined;
  });
}
