import { mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { generateBpmn, readPlanSpec } from './generate.mjs';
import { runPipeline } from './pipeline.mjs';

export class WikiPublishError extends Error {}

function requireDocumentation(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WikiPublishError(`${label}.documentation must be a non-empty string for OpenWiki`);
  }
}

function requireEvidenceShape(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.file !== 'string' ||
    value.file.trim().length === 0 ||
    typeof value.lines !== 'string' ||
    value.lines.trim().length === 0
  ) {
    throw new WikiPublishError(`${label}.evidence with non-empty file and lines is required for OpenWiki`);
  }
}

function repositoryRootForSpec(specPath) {
  const processesDirectory = dirname(specPath);
  const openWikiDirectory = dirname(processesDirectory);

  if (basename(processesDirectory) !== 'processes' || basename(openWikiDirectory) !== 'openwiki') {
    throw new WikiPublishError(
      'OpenWiki specs must be direct children of <Repository>/openwiki/processes/'
    );
  }

  return dirname(openWikiDirectory);
}

function parseLineRanges(value, label) {
  const ranges = value.split(',').map((part) => {
    if (!/^[1-9]\d*(?:-[1-9]\d*)?$/.test(part)) {
      throw new WikiPublishError(
        `${label}.lines must contain comma-separated positive line numbers or inclusive ranges`
      );
    }

    const [ startText, endText = startText ] = part.split('-', 2);
    const start = Number.parseInt(startText, 10);
    const end = Number.parseInt(endText, 10);

    if (start > end) {
      throw new WikiPublishError(`${label}.lines contains a reversed range: ${part}`);
    }

    return { start, end };
  });

  return ranges;
}

function sourceLineCount(source) {
  if (source.length === 0) {
    return 0;
  }

  const lines = source.split(/\r\n|\n|\r/).length;
  return /(?:\r\n|\n|\r)$/.test(source) ? lines - 1 : lines;
}

async function requireTraceableEvidence(value, label, repositoryRoot, realRepositoryRoot) {
  requireEvidenceShape(value, label);

  const { file, lines } = value;
  const normalizedFile = normalize(file);

  if (
    isAbsolute(file) ||
    file.includes('\\') ||
    normalizedFile !== file ||
    normalizedFile === '..' ||
    normalizedFile.startsWith(`..${sep}`)
  ) {
    throw new WikiPublishError(`${label}.evidence.file must be a normalized Repository-relative path`);
  }

  const sourcePath = resolve(repositoryRoot, normalizedFile);
  let realSourcePath;

  try {
    realSourcePath = await realpath(sourcePath);
  } catch (error) {
    throw new WikiPublishError(
      `${label}.evidence.file could not be resolved inside the Repository: ${file} (${error.message})`
    );
  }

  const sourceRelativePath = relative(realRepositoryRoot, realSourcePath);
  if (
    sourceRelativePath === '' ||
    sourceRelativePath === '..' ||
    sourceRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(sourceRelativePath)
  ) {
    throw new WikiPublishError(`${label}.evidence.file resolves outside the Repository: ${file}`);
  }

  if (!(await stat(realSourcePath)).isFile()) {
    throw new WikiPublishError(`${label}.evidence.file must reference a regular file: ${file}`);
  }

  const ranges = parseLineRanges(lines, `${label}.evidence`);
  const lineCount = sourceLineCount(await readFile(realSourcePath, 'utf8'));
  const furthestLine = Math.max(...ranges.map(({ end }) => end));

  if (furthestLine > lineCount) {
    throw new WikiPublishError(
      `${label}.evidence.lines exceeds ${file}'s ${lineCount} line(s): ${lines}`
    );
  }
}

export async function validateWikiSpec(spec, specPath) {
  if (extname(specPath) !== '.json' || basename(specPath, '.json') !== spec.id) {
    throw new WikiPublishError(
      `OpenWiki spec filename must match process id: expected ${spec.id}.json`
    );
  }

  const repositoryRoot = repositoryRootForSpec(specPath);
  const realRepositoryRoot = await realpath(repositoryRoot);

  for (const [index, element] of spec.elements.entries()) {
    requireDocumentation(element.documentation, `elements[${index}]`);
    await requireTraceableEvidence(
      element.evidence,
      `elements[${index}]`,
      repositoryRoot,
      realRepositoryRoot
    );
  }
  for (const [index, flow] of spec.flows.entries()) {
    requireDocumentation(flow.documentation, `flows[${index}]`);
    await requireTraceableEvidence(
      flow.evidence,
      `flows[${index}]`,
      repositoryRoot,
      realRepositoryRoot
    );
  }
}

async function generateOnce(spec, directory, logger) {
  const bpmnPath = join(directory, `${spec.id}.bpmn`);
  await writeFile(bpmnPath, await generateBpmn(spec), 'utf8');
  logger.log(`Wrote ${bpmnPath}`);
  const result = await runPipeline(bpmnPath, directory, { logger });

  return {
    bpmn: await readFile(bpmnPath),
    png: await readFile(result.paths.png)
  };
}

function requireIdentical(first, second, label) {
  if (!first.equals(second)) {
    throw new WikiPublishError(`OpenWiki ${label} output was not byte-identical across repeat generation`);
  }
}

async function requirePublishedArtifact(path, expected, label) {
  let actual;

  try {
    actual = await readFile(path);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new WikiPublishError(`Published OpenWiki ${label} is missing: ${path}`);
    }
    throw error;
  }

  if (!actual.equals(expected)) {
    throw new WikiPublishError(`Published OpenWiki ${label} does not match deterministic generation: ${path}`);
  }
}

async function publishAtomically(path, content) {
  const temporaryPath = `${path}.${process.pid}.tmp`;

  try {
    await writeFile(temporaryPath, content);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function publishWikiProcess(specPath, { check = false, logger = console } = {}) {
  const resolvedSpecPath = resolve(specPath);
  const spec = await readPlanSpec(resolvedSpecPath);
  await validateWikiSpec(spec, resolvedSpecPath);

  const firstDirectory = await mkdtemp(join(tmpdir(), 'qq-bpmn-wiki-first-'));
  const secondDirectory = await mkdtemp(join(tmpdir(), 'qq-bpmn-wiki-second-'));

  try {
    const first = await generateOnce(spec, firstDirectory, logger);
    const second = await generateOnce(spec, secondDirectory, logger);
    requireIdentical(first.bpmn, second.bpmn, 'semantic BPMN');
    requireIdentical(first.png, second.png, 'PNG');

    const outputDirectory = dirname(resolvedSpecPath);
    const bpmnPath = join(outputDirectory, `${spec.id}.bpmn`);
    const pngPath = join(outputDirectory, `${spec.id}.png`);

    if (check) {
      await requirePublishedArtifact(bpmnPath, first.bpmn, 'semantic BPMN');
      await requirePublishedArtifact(pngPath, first.png, 'PNG');
      logger.log(`Verified ${bpmnPath}`);
      logger.log(`Verified ${pngPath}`);
    } else {
      await publishAtomically(bpmnPath, first.bpmn);
      await publishAtomically(pngPath, first.png);
      logger.log(`Published ${bpmnPath}`);
      logger.log(`Published ${pngPath}`);
    }

    return { bpmnPath, pngPath };
  } finally {
    await Promise.all([
      rm(firstDirectory, { recursive: true, force: true }),
      rm(secondDirectory, { recursive: true, force: true })
    ]);
  }
}
