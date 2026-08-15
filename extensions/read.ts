// @ts-nocheck
// Override Pi's universal read tool with a small-file/full-source,
// large-file/AST-outline policy. ast-outline is optional and stays external.

import { readFile as fsReadFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export const TOKEN_BUDGET = 9_000;
const HEAD_LINES = 20;
const TAIL_LINES = 10;

// Deterministic, dependency-free estimate: four UTF-16 code units per token.
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

export function mergeRanges(ranges, totalLines) {
  const normalized = ranges
    .map(({ offset, limit }) => ({
      start: Math.max(1, Math.trunc(offset)),
      end: Math.min(totalLines, Math.trunc(offset) + Math.trunc(limit) - 1),
    }))
    .filter(({ start, end }) => start <= end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const range of normalized) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function resolveFilePath(path, cwd) {
  let value = path.startsWith("@") ? path.slice(1) : path;
  if (value === "~") value = homedir();
  else if (value.startsWith("~/")) value = resolve(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(cwd, value);
}

function textResult(text, details) {
  return { content: [{ type: "text", text }], details };
}

function hasImagePart(result) {
  return result?.content?.some((item) => item?.type === "image") === true;
}

// Pi's file/type outcome, not the user-visible status text. Ordinary files may
// begin with "Read image file [image/..."; only a mime hit or an image part
// counts as image processing.
function isImageProcessingOutcome(result, imageMimeType) {
  return Boolean(imageMimeType) || hasImagePart(result);
}

function explicitSlice(text, offset, limit) {
  const lines = text.split("\n");
  const start = offset ? Math.max(0, offset - 1) : 0;
  if (start >= lines.length) {
    throw new Error(`Offset ${offset} is beyond end of file (${lines.length} lines total)`);
  }
  const end = limit === undefined ? lines.length : Math.min(start + limit, lines.length);
  let selected = lines.slice(start, end).join("\n");
  if (limit !== undefined && end < lines.length) {
    selected += `\n\n[${lines.length - end} more lines in file. Use offset=${end + 1} to continue.]`;
  }
  return selected;
}

function rangeSlices(text, ranges) {
  const lines = text.split("\n");
  const merged = mergeRanges(ranges, lines.length);
  if (merged.length === 0) throw new Error(`No valid ranges to read (${lines.length} lines total)`);
  return merged.map(({ start, end }) =>
    `[Lines ${start}-${end}]\n${lines.slice(start - 1, end).join("\n")}`
  ).join("\n\n");
}

function declarationDepth(declaration) {
  const children = declaration.children;
  if (!Array.isArray(children)) throw new Error("Malformed ast-outline declaration");
  return children.length === 0 ? 0 : 1 + Math.max(...children.map(declarationDepth));
}

function renderDeclaration(declaration, level, maxDepth) {
  const { signature, kind, name, start_line: start, end_line: end } = declaration;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Malformed ast-outline line range");
  const children = declaration.children;
  if (!Array.isArray(children)) throw new Error("Malformed ast-outline declaration");
  const label = typeof signature === "string" && signature.trim()
    ? signature.trim()
    : `${kind ?? "symbol"} ${name ?? "<anonymous>"}`;
  const collapsed = level >= maxDepth && children.length > 0 ? ` (${children.length} children)` : "";
  const ownLine = `${"  ".repeat(level)}${label}${collapsed} [${start}:${end}]`;
  if (level >= maxDepth) return ownLine;
  return [ownLine, ...children.map((child) => renderDeclaration(child, level + 1, maxDepth))].join("\n");
}

export function fitOutline(document, displayPath, budget = TOKEN_BUDGET) {
  if (document?.tool !== "ast-outline" || document?.command !== "outline" || document.error) {
    throw new Error("ast-outline did not return an outline");
  }
  const file = document.files?.[0];
  if (!file || !Array.isArray(file.declarations) || !Number.isFinite(file.line_count)) {
    throw new Error("Malformed ast-outline output");
  }
  const declarations = file.declarations;
  const fullDepth = declarations.length === 0 ? 0 : Math.max(...declarations.map(declarationDepth));

  for (let depth = fullDepth; depth >= 0; depth--) {
    const depthLabel = depth === fullDepth ? "full depth" : `depth ${depth}`;
    const header = `# AST outline for ${displayPath} (${file.line_count} lines, ${depthLabel}). Source bodies omitted; use offset/limit or ranges to read them.`;
    const body = declarations.map((declaration) => renderDeclaration(declaration, 0, depth)).join("\n");
    const output = body ? `${header}\n${body}` : `${header}\n(no top-level symbols)`;
    if (estimateTokens(output) <= budget || depth === 0) return output;
  }
  throw new Error("Could not render ast-outline output");
}

function fitsPreviewBudget(text, budget) {
  return estimateTokens(text) <= budget && Buffer.byteLength(text, "utf8") <= budget * 4;
}

function truncatePreview(text, budget) {
  const cappedBudget = Math.max(0, Math.floor(budget));
  if (fitsPreviewBudget(text, cappedBudget)) return text;

  const marker = "\n[... preview truncated to fit byte/token budget ...]\n";
  if (!fitsPreviewBudget(marker, cappedBudget)) {
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fitsPreviewBudget(text.slice(0, middle), cappedBudget)) low = middle;
      else high = middle - 1;
    }
    return text.slice(0, low);
  }

  const candidate = (kept) => {
    const headLength = Math.ceil(kept / 2);
    const tailLength = Math.floor(kept / 2);
    const tail = tailLength === 0 ? "" : text.slice(-tailLength);
    return `${text.slice(0, headLength)}${marker}${tail}`;
  };
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fitsPreviewBudget(candidate(middle), cappedBudget)) low = middle;
    else high = middle - 1;
  }
  return candidate(low);
}

function previewFallback(displayPath, text, budget) {
  const lines = text.split("\n");
  const head = lines.slice(0, HEAD_LINES);
  const tailStart = Math.max(head.length, lines.length - TAIL_LINES);
  const tail = lines.slice(tailStart);
  const omitted = tailStart - head.length;
  const sections = [
    `# AST outline unavailable for ${displayPath}; showing head/tail of ${lines.length} lines.`,
    ...head,
  ];
  if (omitted > 0) sections.push(`[... ${omitted} lines omitted ...]`);
  sections.push(...tail, "Use offset/limit or ranges to read specific source lines.");
  return truncatePreview(sections.join("\n"), budget);
}

export default function registerRead(pi, deps = {}) {
  const readFile = deps.readFile ?? ((path, signal) => fsReadFile(path, signal ? { signal } : undefined));
  const run = deps.exec ?? ((command, args, options) => pi.exec(command, args, options));
  const createBuiltInRead = deps.createReadToolDefinition;
  if (typeof createBuiltInRead !== "function") throw new Error("Pi's built-in read tool factory is required");
  const detectImageMimeType = deps.detectImageMimeType;
  const builtInReads = new Map();
  const budget = deps.tokenBudget ?? TOKEN_BUDGET;

  pi.registerTool({
    name: "read",
    label: "read",
    description:
      "Read a file. Text files under the context budget are returned in full; larger source files return an AST outline. Supports images (jpg, png, gif, webp, bmp), offset/limit, and merged ranges.",
    promptSnippet: "Read file contents",
    promptGuidelines: ["Use read to examine files instead of cat or sed."],
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", minLength: 1, description: "Path to the file to read (relative or absolute)" },
        offset: { type: "number", description: "Line number to start reading from (1-indexed)" },
        limit: { type: "number", description: "Maximum number of lines to read" },
        ranges: {
          type: "array",
          minItems: 1,
          description: "Non-contiguous line slices; adjacent and overlapping ranges are merged",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["offset", "limit"],
            properties: {
              offset: { type: "number", minimum: 1, description: "Start line (1-indexed)" },
              limit: { type: "number", minimum: 1, description: "Number of lines to read" },
            },
          },
        },
      },
    },
    async execute(id, params, signal, onUpdate, ctx) {
      if (signal?.aborted) throw new Error("Operation aborted");
      const cwd = ctx?.cwd ?? process.cwd();
      let builtInRead = builtInReads.get(cwd);
      if (!builtInRead) {
        builtInRead = createBuiltInRead(cwd);
        builtInReads.set(cwd, builtInRead);
      }
      const builtInResult = await builtInRead.execute(id, params, signal, onUpdate, ctx);
      const absolutePath = resolveFilePath(params.path, cwd);
      const imageMimeType = typeof detectImageMimeType === "function"
        ? await detectImageMimeType(absolutePath)
        : undefined;
      if (signal?.aborted) throw new Error("Operation aborted");
      if (isImageProcessingOutcome(builtInResult, imageMimeType)) return builtInResult;

      const buffer = await readFile(absolutePath, signal);
      const text = buffer.toString("utf-8");
      if (params.ranges !== undefined) return textResult(rangeSlices(text, params.ranges), undefined);
      if (params.offset !== undefined || params.limit !== undefined) {
        return textResult(explicitSlice(text, params.offset, params.limit), undefined);
      }
      if (estimateTokens(text) <= budget) return textResult(text, undefined);

      try {
        // The current CLI has no depth flag. Its stable nested JSON lets this
        // wrapper render the full tree, then collapse it locally by depth.
        const execution = await run("ast-outline", [absolutePath, "--json"], { cwd: ctx?.cwd, signal });
        if (execution?.code !== 0) throw new Error(execution?.stderr?.trim() || "ast-outline failed");
        return textResult(fitOutline(JSON.parse(execution.stdout), params.path, budget), undefined);
      } catch (error) {
        if (signal?.aborted || error?.name === "AbortError") throw error;
        return textResult(previewFallback(params.path, text, budget), undefined);
      }
    },
  });
}
