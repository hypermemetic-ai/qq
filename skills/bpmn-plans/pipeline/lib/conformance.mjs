import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { BpmnModdle } from 'bpmn-moddle';

const statuses = new Set([ 'done', 'skipped', 'diverged' ]);

export class ConformanceError extends Error {}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function markdownCell(value) {
  const text = value === undefined || value === null || value === '' ? '—' : String(value);
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, '<br>');
}

function containedChildren(element) {
  if (!element?.$descriptor || element.$descriptor.isGeneric) {
    return [];
  }

  const children = [];

  for (const property of element.$descriptor.properties ?? []) {
    if (property.isAttr || property.isBody || property.isReference || property.isVirtual) {
      continue;
    }

    const value = element[property.name];

    if (Array.isArray(value)) {
      children.push(...value.filter((child) => child?.$descriptor));
    } else if (value?.$descriptor) {
      children.push(value);
    }
  }

  return children;
}

function collectFlowNodes(rootElement) {
  const flowNodes = [];
  const visited = new Set();

  function visit(element) {
    if (!element?.$descriptor || visited.has(element)) {
      return;
    }

    visited.add(element);

    if (element.$instanceOf?.('bpmn:FlowNode')) {
      flowNodes.push(element);
    }

    containedChildren(element).forEach(visit);
  }

  visit(rootElement);

  return flowNodes;
}

function validateCompletions(completions) {
  if (!isRecord(completions)) {
    throw new ConformanceError('Completions JSON must be an object keyed by BPMN element id');
  }

  for (const [id, completion] of Object.entries(completions)) {
    if (!isRecord(completion)) {
      throw new ConformanceError(`Completion ${id} must be an object`);
    }

    if (!statuses.has(completion.status)) {
      throw new ConformanceError(
        `Completion ${id}.status must be one of: ${[...statuses].join(', ')}`
      );
    }

    for (const field of [ 'evidence', 'note' ]) {
      if (completion[field] !== undefined && typeof completion[field] !== 'string') {
        throw new ConformanceError(`Completion ${id}.${field} must be a string when provided`);
      }
    }
  }
}

function completionDetails(completion) {
  if (!completion) {
    return '—';
  }

  const parts = [];

  if (completion.evidence?.trim()) {
    parts.push(`Evidence: ${markdownCell(completion.evidence)}`);
  }

  if (completion.note?.trim()) {
    parts.push(`Note: ${markdownCell(completion.note)}`);
  }

  return parts.join('<br>') || '—';
}

function bulletList(elements, emptyText) {
  if (elements.length === 0) {
    return emptyText;
  }

  return elements
    .map(({ id, name }) => `- \`${id}\` — ${name || '(unnamed)'}`)
    .join('\n');
}

export async function buildConformanceReport(planXml, completions, {
  planLabel = 'BPMN plan'
} = {}) {
  validateCompletions(completions);

  let parsed;

  try {
    parsed = await new BpmnModdle().fromXML(planXml);
  } catch (error) {
    throw new ConformanceError(`Could not parse ${planLabel}: ${error.message}`);
  }

  if ((parsed.warnings ?? []).length > 0) {
    const messages = parsed.warnings.map(({ message }) => message.split(/\r?\n/, 1)[0]);
    throw new ConformanceError(
      `Could not inspect ${planLabel} without import warnings: ${messages.join('; ')}`
    );
  }

  const nodes = collectFlowNodes(parsed.rootElement);
  const nodeIds = new Set(nodes.map(({ id }) => id));
  const rows = nodes.map((node) => {
    const completion = completions[node.id];

    return {
      id: node.id,
      name: node.name ?? '',
      type: node.$type.replace(/^bpmn:/, ''),
      status: completion?.status ?? 'unaccounted',
      completion
    };
  });
  const unaccounted = rows.filter(({ completion }) => completion === undefined);
  const divergences = rows.filter(({ status }) => status === 'diverged');
  const divergencesWithoutNote = divergences.filter(
    ({ completion }) => !completion.note?.trim()
  );
  const unknownIds = Object.keys(completions)
    .filter((id) => !nodeIds.has(id))
    .sort();
  const strictFailed = unaccounted.length > 0 || divergencesWithoutNote.length > 0;

  const tableRows = rows.map(({ id, name, type, status, completion }) =>
    `| ${markdownCell(id)} | ${markdownCell(name)} | ${markdownCell(type)} | ${status} | ${completionDetails(completion)} |`
  );
  const divergenceText = divergences.length === 0
    ? 'No elements diverged.'
    : divergences.map(({ id, name, completion }) => {
      const note = completion.note?.trim()
        ? ` — ${completion.note.trim()}`
        : ' — **missing required divergence note**';
      return `- \`${id}\` (${name || 'unnamed'})${note}`;
    }).join('\n');
  const unknownText = unknownIds.length === 0
    ? 'None.'
    : unknownIds.map((id) => `- \`${id}\``).join('\n');
  const markdown = [
    '# BPMN conformance report',
    '',
    `Plan: ${planLabel}`,
    '',
    '## Summary',
    '',
    `- Flow nodes: ${rows.length}`,
    `- Accounted: ${rows.length - unaccounted.length}`,
    `- Unaccounted: ${unaccounted.length}`,
    `- Diverged: ${divergences.length}`,
    `- Unknown completion IDs: ${unknownIds.length}`,
    `- Strict verdict: ${strictFailed ? 'FAIL' : 'PASS'}`,
    '',
    '## Per-element status',
    '',
    '| ID | Name | Type | Status | Evidence / note |',
    '| --- | --- | --- | --- | --- |',
    ...tableRows,
    '',
    '## Unaccounted elements',
    '',
    bulletList(unaccounted, 'None.'),
    '',
    '## Unknown completion IDs',
    '',
    unknownText,
    '',
    '## Divergence summary',
    '',
    divergenceText,
    ''
  ].join('\n');

  return {
    markdown,
    rows,
    unaccounted,
    unknownIds,
    divergences,
    divergencesWithoutNote,
    strictFailed
  };
}

export async function conformFiles(planPath, completionsPath, { outputPath } = {}) {
  let completions;

  try {
    completions = JSON.parse(await readFile(completionsPath, 'utf8'));
  } catch (error) {
    throw new ConformanceError(`Could not read completions ${completionsPath}: ${error.message}`);
  }

  const planXml = await readFile(planPath, 'utf8');
  const report = await buildConformanceReport(planXml, completions, {
    planLabel: planPath
  });

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, report.markdown, 'utf8');
  }

  return report;
}
