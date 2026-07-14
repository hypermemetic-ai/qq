import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BpmnModdle } from 'bpmn-moddle';
import bpmnlint from 'bpmnlint';
import NodeResolver from 'bpmnlint/lib/resolver/node-resolver.js';

import { layoutBpmnXml, LAYOUT_MODES } from './layout.mjs';

const { Linter } = bpmnlint;
const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(packageDirectory, '.bpmnlintrc.json');

export class PipelineError extends Error {
  constructor(message, exitCode = 1, details = {}) {
    super(message);
    this.exitCode = exitCode;
    Object.assign(this, details);
  }
}

function findingSortKey(finding) {
  const severityOrder = {
    error: '0',
    'rule-error': '0',
    warn: '1',
    info: '2'
  };

  return [
    severityOrder[finding.category] ?? '3',
    finding.rule,
    finding.id ?? '',
    (finding.path ?? []).join('.'),
    finding.message
  ].join('\u0000');
}

function formatFinding(finding) {
  const severity = finding.category === 'warn' ? 'warning' : finding.category;
  const element = finding.id ? ` ${finding.id}` : '';
  const property = finding.path?.length ? `#${finding.path.join('.')}` : '';

  return `[${severity}] ${finding.rule}${element}${property}: ${finding.message}`;
}

export async function lintBpmnXml(inputXml, {
  logger = console,
  sourceLabel = 'BPMN input'
} = {}) {
  let config;

  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    throw new PipelineError(`Could not parse ${configPath}: ${error.message}`);
  }

  const moddle = new BpmnModdle();
  let parsed;

  try {
    parsed = await moddle.fromXML(inputXml);
  } catch (error) {
    logger.log(`[error] bpmn-moddle/import: ${error.message}`);
    throw new PipelineError(`${sourceLabel} could not be parsed; lint stopped.`);
  }

  const importFindings = (parsed.warnings ?? []).map((warning) => ({
    category: 'error',
    rule: 'bpmn-moddle/import',
    id: warning.element?.id,
    message: warning.message.split(/\r?\n/, 1)[0]
  }));
  const scopedRequire = createRequire(join(packageDirectory, 'package.json'));
  const linter = new Linter({
    config,
    resolver: new NodeResolver({ require: scopedRequire })
  });
  let reportsByRule;

  try {
    reportsByRule = await linter.lint(parsed.rootElement);
  } catch (error) {
    throw new PipelineError(`Could not run bpmnlint: ${error.message}`);
  }

  const lintFindings = Object.entries(reportsByRule).flatMap(([rule, reports]) =>
    reports.map((report) => ({ rule, ...report }))
  );
  const findings = [ ...importFindings, ...lintFindings ]
    .sort((left, right) => findingSortKey(left).localeCompare(findingSortKey(right)));

  if (findings.length === 0) {
    logger.log('Lint: no findings.');
  } else {
    logger.log(`Lint findings (${findings.length}):`);
    findings.forEach((finding) => logger.log(formatFinding(finding)));
  }

  const errorCount = findings.filter(({ category }) =>
    category === 'error' || category === 'rule-error'
  ).length;
  const warningCount = findings.filter(({ category }) => category === 'warn').length;

  logger.log(`Lint summary: ${errorCount} error(s), ${warningCount} warning(s).`);

  if (errorCount > 0) {
    throw new PipelineError('Lint failed with error-severity findings.', 1, { findings });
  }

  return findings;
}

function containmentChildren(element) {
  if (element.$descriptor?.isGeneric) {
    return (element.$children ?? []).map((child, index) => ({
      child,
      segment: `$children[${index}]`
    }));
  }

  const children = [];

  for (const property of element.$descriptor?.properties ?? []) {
    if (property.isAttr || property.isBody || property.isReference || property.isVirtual) {
      continue;
    }

    const value = element[property.name];

    if (Array.isArray(value)) {
      value.forEach((child, index) => {
        if (child?.$descriptor) {
          children.push({ child, segment: `${property.name}[${index}]` });
        }
      });
    } else if (value?.$descriptor) {
      children.push({ child: value, segment: property.name });
    }
  }

  return children;
}

function ownerFields(element, ownerPath) {
  return {
    ownerId: element.id ?? null,
    ownerType: element.$type,
    ownerPath
  };
}

export async function extractRoundTripContent(xml, sourceLabel) {
  const moddle = new BpmnModdle();
  const { rootElement, warnings = [] } = await moddle.fromXML(xml);

  if (warnings.length > 0) {
    const messages = warnings.map(({ message }) => message.split(/\r?\n/, 1)[0]);
    throw new PipelineError(
      `Could not extract ${sourceLabel} round-trip evidence without import warnings: ${messages.join('; ')}`
    );
  }

  const elements = [];
  const visited = new Set();

  function visit(element, elementPath) {
    if (!element?.$descriptor || visited.has(element)) {
      return;
    }

    visited.add(element);
    elements.push({ element, elementPath });

    for (const { child, segment } of containmentChildren(element)) {
      visit(child, `${elementPath}/${segment}`);
    }
  }

  visit(rootElement, rootElement.$type);

  const documentation = [];
  const extension = [];

  for (const { element, elementPath } of elements) {
    const owner = ownerFields(element, elementPath);

    for (const [index, document] of (element.documentation ?? []).entries()) {
      documentation.push({
        ...owner,
        index,
        text: document.text ?? ''
      });
    }

    for (const [index, payload] of (element.extensionElements?.values ?? []).entries()) {
      const { xml: serialized } = await moddle.toXML(payload, {
        format: false,
        preamble: false
      });

      extension.push({
        ...owner,
        index,
        payloadType: payload.$type,
        serialized
      });
    }
  }

  return { documentation, extension };
}

function entryIdentity(entry) {
  const owner = entry.ownerId === null ? `path=${entry.ownerPath}` : `id=${entry.ownerId}`;
  return `${entry.ownerType}|${owner}|index=${entry.index}`;
}

function diffEntries(before, after) {
  const beforeByIdentity = new Map(before.map((entry) => [ entryIdentity(entry), entry ]));
  const afterByIdentity = new Map(after.map((entry) => [ entryIdentity(entry), entry ]));
  const identities = [ ...new Set([ ...beforeByIdentity.keys(), ...afterByIdentity.keys() ]) ].sort();
  const missingAfterLayout = [];
  const addedAfterLayout = [];
  const changed = [];

  for (const identity of identities) {
    const beforeEntry = beforeByIdentity.get(identity);
    const afterEntry = afterByIdentity.get(identity);

    if (!afterEntry) {
      missingAfterLayout.push(beforeEntry);
    } else if (!beforeEntry) {
      addedAfterLayout.push(afterEntry);
    } else if (JSON.stringify(beforeEntry) !== JSON.stringify(afterEntry)) {
      changed.push({ identity, before: beforeEntry, after: afterEntry });
    }
  }

  return {
    beforeCount: before.length,
    afterCount: after.length,
    lossless:
      missingAfterLayout.length === 0 &&
      addedAfterLayout.length === 0 &&
      changed.length === 0,
    missingAfterLayout,
    addedAfterLayout,
    changed
  };
}

export async function buildRoundTripEvidence(inputXml, layoutXml) {
  const before = await extractRoundTripContent(inputXml, 'input');
  const after = await extractRoundTripContent(layoutXml, 'laid-out');
  const documentationDetails = diffEntries(before.documentation, after.documentation);
  const extensionDetails = diffEntries(before.extension, after.extension);

  return {
    documentationBefore: before.documentation,
    documentationAfter: after.documentation,
    extensionBefore: before.extension,
    extensionAfter: after.extension,
    lossless: documentationDetails.lossless && extensionDetails.lossless,
    details: {
      documentation: documentationDetails,
      extension: extensionDetails
    }
  };
}

export async function canonicalizeSvgMarkerIds(svgPath, { logger = console } = {}) {
  let svg = await readFile(svgPath, 'utf8');
  const markerIds = [ ...svg.matchAll(/<marker\b[^>]*\bid="(marker-[^"]+)"/g) ]
    .map((match) => match[1])
    .filter((id, index, ids) => ids.indexOf(id) === index);

  markerIds.forEach((id, index) => {
    const canonicalId = `bpmn-pipeline-marker-${String(index + 1).padStart(3, '0')}`;
    svg = svg.replaceAll(id, canonicalId);
  });

  await writeFile(svgPath, svg, 'utf8');
  logger.log(`Canonicalized ${markerIds.length} generated SVG marker ID(s).`);

  return markerIds.length;
}

export async function renderBpmn(layoutPath, svgPath, pngPath, { logger = console } = {}) {
  logger.log('Rendering SVG and PNG with the bpmn.io footer enabled');
  const { convertAll } = await import('bpmn-to-image');

  await convertAll([
    {
      input: layoutPath,
      outputs: [ svgPath, pngPath ]
    }
  ], {
    footer: true
  });
  await canonicalizeSvgMarkerIds(svgPath, { logger });
}

export async function runPipeline(inputArgument, outdirArgument, {
  logger = console,
  layoutMode = LAYOUT_MODES.PLAN,
  render = true
} = {}) {
  const inputPath = resolve(inputArgument);
  const outdir = resolve(outdirArgument);
  const name = parse(inputPath).name;
  const layoutPath = join(outdir, `${name}.layout.bpmn`);
  const roundTripPath = join(outdir, `${name}.roundtrip.json`);
  const svgPath = join(outdir, `${name}.svg`);
  const pngPath = join(outdir, `${name}.png`);
  const inputXml = await readFile(inputPath, 'utf8');

  logger.log(`Linting ${inputPath}`);
  const findings = await lintBpmnXml(inputXml, { logger, sourceLabel: inputPath });

  logger.log(`Laying out ${inputPath} in ${layoutMode} mode`);
  const layoutXml = await layoutBpmnXml(inputXml, { mode: layoutMode });
  await mkdir(outdir, { recursive: true });
  await writeFile(layoutPath, layoutXml, 'utf8');
  logger.log(`Wrote ${layoutPath}`);

  logger.log('Checking documentation and extensionElements round trip');
  const roundTrip = await buildRoundTripEvidence(inputXml, layoutXml);
  await writeFile(roundTripPath, `${JSON.stringify(roundTrip, null, 2)}\n`, 'utf8');
  logger.log(`Round-trip verdict: ${roundTrip.lossless ? 'lossless' : 'LOSS DETECTED'}`);
  logger.log(`Wrote ${roundTripPath}`);

  if (render) {
    await renderBpmn(layoutPath, svgPath, pngPath, { logger });
  } else {
    logger.log('Rendering skipped.');
  }

  if (!roundTrip.lossless) {
    throw new PipelineError(
      `Round-trip loss was detected; inspect ${roundTripPath}.${render ? ' Render artifacts were still produced.' : ''}`,
      2,
      { roundTrip }
    );
  }

  logger.log('Pipeline completed successfully.');

  return {
    inputPath,
    outdir,
    layoutMode,
    findings,
    roundTrip,
    paths: {
      layout: layoutPath,
      roundTrip: roundTripPath,
      ...(render ? { svg: svgPath, png: pngPath } : {})
    }
  };
}
