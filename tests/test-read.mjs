import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
const module = await import(pathToFileURL(join(root, "extensions/read.ts")));

assert.equal(module.TOKEN_BUDGET, 9_000);
assert.equal(module.estimateTokens("12345"), 2);
assert.deepEqual(
  module.mergeRanges([
    { offset: 10, limit: 2 },
    { offset: 3, limit: 3 },
    { offset: 1, limit: 2 },
    { offset: 11, limit: 4 },
    { offset: 30, limit: 99 },
  ], 20),
  [{ start: 1, end: 5 }, { start: 10, end: 14 }],
);

function outlineDocument(declarations, lineCount = 100) {
  return {
    tool: "ast-outline",
    schema_version: 1,
    command: "outline",
    notes: [],
    files: [{ path: "large.ts", language: "TypeScript", line_count: lineCount, declarations }],
  };
}

function declaration(signature, start, end, children = []) {
  return { kind: "function", name: signature, signature, start_line: start, end_line: end, children };
}

function harness({ text = "", tokenBudget, execReply } = {}) {
  const registrations = [];
  const calls = [];
  const pi = {
    registerTool(tool) { registrations.push(tool); },
    exec: async () => { throw new Error("unexpected real exec"); },
  };
  const exec = async (command, args, options) => {
    calls.push({ command, args, options });
    if (execReply) return execReply({ command, args, options });
    throw new Error("ast-outline unavailable");
  };
  module.default(pi, {
    tokenBudget,
    readFile: async () => Buffer.isBuffer(text) ? text : Buffer.from(text),
    exec,
  });
  assert.equal(registrations.length, 1);
  return { tool: registrations[0], calls };
}

const registered = harness();
assert.equal(registered.tool.name, "read");
assert.equal(registered.tool.label, "read");
assert.equal(registered.tool.promptSnippet, "Read file contents");
assert.deepEqual(registered.tool.parameters.required, ["path"]);
assert.ok(registered.tool.parameters.properties.ranges);

const small = harness({ text: "const answer = 42;\n" });
const smallResult = await small.tool.execute("small", { path: "small.ts" }, undefined, undefined, { cwd: "/work" });
assert.equal(smallResult.content[0].text, "const answer = 42;\n");
assert.equal(smallResult.details, undefined);
assert.equal(small.calls.length, 0);

const lines = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join("\n");
const slice = harness({ text: lines, tokenBudget: 1 });
const sliceResult = await slice.tool.execute("slice", { path: "large.ts", offset: 4, limit: 3 }, undefined, undefined, { cwd: "/work" });
assert.equal(sliceResult.content[0].text, "line 4\nline 5\nline 6\n\n[6 more lines in file. Use offset=7 to continue.]");
assert.equal(slice.calls.length, 0, "offset/limit unexpectedly invoked ast-outline");

const ranges = harness({ text: lines, tokenBudget: 1 });
const rangesResult = await ranges.tool.execute("ranges", {
  path: "large.ts",
  ranges: [
    { offset: 9, limit: 2 },
    { offset: 2, limit: 2 },
    { offset: 4, limit: 2 },
  ],
}, undefined, undefined, { cwd: "/work" });
assert.equal(
  rangesResult.content[0].text,
  "[Lines 2-5]\nline 2\nline 3\nline 4\nline 5\n\n[Lines 9-10]\nline 9\nline 10",
);
assert.equal(ranges.calls.length, 0, "ranges unexpectedly invoked ast-outline");

const fullDoc = outlineDocument([
  declaration("class Service", 1, 80, [declaration("run(): void", 10, 20)]),
]);
const full = harness({
  text: "x".repeat(241),
  tokenBudget: 60,
  execReply: () => ({ code: 0, stdout: JSON.stringify(fullDoc), stderr: "" }),
});
const fullResult = await full.tool.execute("outline", { path: "large.ts" }, undefined, undefined, { cwd: "/work" });
assert.match(fullResult.content[0].text, /full depth/);
assert.match(fullResult.content[0].text, /class Service \[1:80\]/);
assert.match(fullResult.content[0].text, /  run\(\): void \[10:20\]/);
assert.deepEqual(full.calls[0].args, ["/work/large.ts", "--json"]);

const manyChildren = Array.from({ length: 20 }, (_, index) =>
  declaration(`methodWithLongName${index}(): Promise<Result>`, index + 2, index + 2),
);
const deepDoc = outlineDocument([declaration("class LargeService", 1, 100, manyChildren)]);
const fullOutline = module.fitOutline(deepDoc, "large.ts", 1_000_000);
const floorOutline = module.fitOutline(deepDoc, "large.ts", 1);
assert.ok(module.estimateTokens(fullOutline) > module.estimateTokens(floorOutline));
const shallowBudget = Math.floor((module.estimateTokens(fullOutline) + module.estimateTokens(floorOutline)) / 2);
const shallow = harness({
  text: "x".repeat((shallowBudget + 1) * 4),
  tokenBudget: shallowBudget,
  execReply: () => ({ code: 0, stdout: JSON.stringify(deepDoc), stderr: "" }),
});
const shallowResult = await shallow.tool.execute("shallow", { path: "large.ts" }, undefined, undefined, { cwd: "/work" });
assert.match(shallowResult.content[0].text, /depth 0/);
assert.match(shallowResult.content[0].text, /class LargeService \(20 children\) \[1:100\]/);
assert.doesNotMatch(shallowResult.content[0].text, /methodWithLongName0/);

const fallbackText = Array.from({ length: 40 }, (_, index) => `source line ${index + 1}`).join("\n");
for (const [name, execReply] of [
  ["missing CLI", () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); }],
  ["parse failure", () => ({ code: 2, stdout: "", stderr: "parse failed" })],
  ["unknown language", () => ({ code: 0, stdout: JSON.stringify({ tool: "ast-outline", command: "outline", error: { notes: ["unsupported"] } }), stderr: "" })],
]) {
  const fallback = harness({ text: fallbackText, tokenBudget: 1, execReply });
  const result = await fallback.tool.execute(name, { path: "large.unknown" }, undefined, undefined, { cwd: "/work" });
  assert.match(result.content[0].text, /AST outline unavailable/);
  assert.match(result.content[0].text, /source line 1/);
  assert.match(result.content[0].text, /source line 40/);
  assert.match(result.content[0].text, /10 lines omitted/);
  assert.match(result.content[0].text, /offset\/limit or ranges/);
}

const png = harness({ text: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]) });
const pngResult = await png.tool.execute("image", { path: "image.png" }, undefined, undefined, { cwd: "/work" });
assert.equal(pngResult.content[0].text, "Read image file [image/png]");
assert.equal(pngResult.content[1].type, "image");
assert.equal(pngResult.content[1].mimeType, "image/png");
assert.equal(png.calls.length, 0);

console.log("test-read: pass");
