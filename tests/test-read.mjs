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

function harness({ text = "", tokenBudget, execReply, builtInReadResult } = {}) {
  const registrations = [];
  const calls = [];
  const readCalls = [];
  const builtInCalls = [];
  const pi = {
    registerTool(tool) { registrations.push(tool); },
    exec: async () => { throw new Error("unexpected real exec"); },
  };
  const exec = async (command, args, options) => {
    calls.push({ command, args, options });
    if (execReply) return execReply({ command, args, options });
    throw new Error("ast-outline unavailable");
  };
  const createReadToolDefinition = (cwd) => ({
    async execute(id, params, signal, onUpdate, ctx) {
      builtInCalls.push({ cwd, id, params, signal, onUpdate, ctx });
      if (typeof builtInReadResult === "function") return builtInReadResult({ cwd, id, params, signal, onUpdate, ctx });
      return builtInReadResult ?? { content: [{ type: "text", text: "Pi classified this file as text" }], details: undefined };
    },
  });
  module.default(pi, {
    tokenBudget,
    readFile: async (path, signal) => {
      readCalls.push({ path, signal });
      return Buffer.isBuffer(text) ? text : Buffer.from(text);
    },
    exec,
    createReadToolDefinition,
  });
  assert.equal(registrations.length, 1);
  return { tool: registrations[0], calls, readCalls, builtInCalls };
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

const fallbackText = Array.from({ length: 1_000 }, (_, index) => `source line ${index + 1}`).join("\n");
for (const [name, execReply] of [
  ["missing CLI", () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); }],
  ["parse failure", () => ({ code: 2, stdout: "", stderr: "parse failed" })],
  ["unknown language", () => ({ code: 0, stdout: JSON.stringify({ tool: "ast-outline", command: "outline", error: { notes: ["unsupported"] } }), stderr: "" })],
]) {
  const fallback = harness({ text: fallbackText, tokenBudget: 200, execReply });
  const result = await fallback.tool.execute(name, { path: "large.unknown" }, undefined, undefined, { cwd: "/work" });
  assert.match(result.content[0].text, /AST outline unavailable/);
  assert.match(result.content[0].text, /source line 1/);
  assert.match(result.content[0].text, /source line 1000/);
  assert.match(result.content[0].text, /970 lines omitted/);
  assert.match(result.content[0].text, /offset\/limit or ranges/);
}

const hugeFallbackBudget = 64;
const hugeFallback = harness({
  text: `HEAD-${"😀".repeat(20_000)}-TAIL`,
  tokenBudget: hugeFallbackBudget,
});
const hugeFallbackResult = await hugeFallback.tool.execute(
  "huge-line",
  { path: "huge.unknown" },
  undefined,
  undefined,
  { cwd: "/work" },
);
const hugeFallbackText = hugeFallbackResult.content[0].text;
assert.ok(module.estimateTokens(hugeFallbackText) <= hugeFallbackBudget);
assert.ok(Buffer.byteLength(hugeFallbackText, "utf8") <= hugeFallbackBudget * 4);
assert.match(hugeFallbackText, /HEAD-/);
assert.match(hugeFallbackText, /-TAIL/);
assert.match(hugeFallbackText, /preview truncated to fit byte\/token budget/);

const validPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const resizedPngResult = {
  content: [
    {
      type: "text",
      text: "Read image file [image/png]\n[Image: original 4000x3000, displayed at 2000x1500. Multiply coordinates by 2.00 to map to original image.]",
    },
    { type: "image", data: "pi-resized-png", mimeType: "image/png" },
  ],
  details: undefined,
};
const png = harness({ text: validPngBytes, builtInReadResult: resizedPngResult });
const pngResult = await png.tool.execute("image", { path: "image.png" }, undefined, undefined, { cwd: "/work" });
assert.strictEqual(pngResult, resizedPngResult, "Pi's resize result was not returned unchanged");
assert.equal(png.builtInCalls.length, 1);
assert.equal(png.readCalls.length, 0, "wrapper re-read an image handled by Pi");
assert.equal(png.calls.length, 0);

const validBmpBytes = Buffer.alloc(58);
validBmpBytes.write("BM", 0, "ascii");
validBmpBytes.writeUInt32LE(validBmpBytes.length, 2);
validBmpBytes.writeUInt32LE(54, 10);
validBmpBytes.writeUInt32LE(40, 14);
validBmpBytes.writeInt32LE(1, 18);
validBmpBytes.writeInt32LE(1, 22);
validBmpBytes.writeUInt16LE(1, 26);
validBmpBytes.writeUInt16LE(24, 28);
validBmpBytes.writeUInt32LE(4, 34);
validBmpBytes.set([0, 0, 255, 0], 54);
const convertedBmpResult = {
  content: [
    { type: "text", text: "Read image file [image/png]\n[Image converted from image/bmp to image/png.]" },
    { type: "image", data: "pi-converted-png", mimeType: "image/png" },
  ],
  details: undefined,
};
const bmp = harness({ text: validBmpBytes, builtInReadResult: convertedBmpResult });
const bmpResult = await bmp.tool.execute("bmp", { path: "image.bmp" }, undefined, undefined, { cwd: "/work" });
assert.strictEqual(bmpResult, convertedBmpResult, "Pi's BMP conversion result was not returned unchanged");
assert.equal(bmp.readCalls.length, 0);

const failedImageResult = {
  content: [{
    type: "text",
    text: "Read image file [image/bmp]\n[Image omitted: could not be converted to a supported inline image format.]",
  }],
  details: undefined,
};
// Pi recognizes the valid BMP header, then safely omits the truncated pixel payload.
const failedImage = harness({ text: validBmpBytes.subarray(0, 54), builtInReadResult: failedImageResult });
const failedResult = await failedImage.tool.execute("failed-image", { path: "broken.bmp" }, undefined, undefined, { cwd: "/work" });
assert.strictEqual(failedResult, failedImageResult, "Pi's safe image failure was not returned unchanged");
assert.equal(failedResult.content.some((item) => item.type === "image"), false);
assert.equal(failedImage.readCalls.length, 0);

for (const [name, bytes] of [
  ["ordinary BM text", Buffer.from("BM this is ordinary text")],
  ["truncated PNG prefix", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
]) {
  const decodedText = bytes.toString("utf-8");
  const nonImage = harness({
    text: bytes,
    builtInReadResult: { content: [{ type: "text", text: decodedText }], details: undefined },
  });
  const nonImageResult = await nonImage.tool.execute(name, { path: "ordinary.txt" }, undefined, undefined, { cwd: "/work" });
  assert.deepEqual(nonImageResult.content, [{ type: "text", text: decodedText }]);
  assert.equal(nonImageResult.content.some((item) => item.type === "image"), false);
  assert.equal(nonImage.readCalls.length, 1);
}

console.log("test-read: pass");
