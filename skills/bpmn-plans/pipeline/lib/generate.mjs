import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { BpmnModdle } from 'bpmn-moddle';

export const EVIDENCE_NAMESPACE = 'http://qq.local/schema/evidence';
export const TARGET_NAMESPACE = 'http://qq.local/schema/bpmn';

const elementTypes = new Map([
  [ 'startEvent', 'StartEvent' ],
  [ 'endEvent', 'EndEvent' ],
  [ 'serviceTask', 'ServiceTask' ],
  [ 'userTask', 'UserTask' ],
  [ 'manualTask', 'ManualTask' ],
  [ 'exclusiveGateway', 'ExclusiveGateway' ],
  [ 'boundaryEvent', 'BoundaryEvent' ]
]);

const bpmnIdPattern = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const reservedBpmnIds = new Set(Object.getOwnPropertyNames(Object.prototype));
const isoDurationPattern = /^(?!.*[.,]\d+[YMDHMS].*[YMDHMS])(?:P\d+(?:[.,]\d+)?W|P(?=\d|T\d)(?:\d+(?:[.,]\d+)?Y)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?D)?(?:T(?=\d)(?:\d+(?:[.,]\d+)?H)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?S)?)?)$/;

export class PlanSpecError extends Error {}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new PlanSpecError(`${label} must be an object`);
  }

  return value;
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new PlanSpecError(`${label} must be ${allowEmpty ? 'a string' : 'a non-empty string'}`);
  }

  return value;
}

function requireId(value, label) {
  const id = requireString(value, label);

  if (!bpmnIdPattern.test(id)) {
    throw new PlanSpecError(
      `${label} must be a BPMN-safe id matching ${bpmnIdPattern}`
    );
  }

  if (reservedBpmnIds.has(id)) {
    throw new PlanSpecError(`${label} uses an id reserved by the BPMN parser: ${id}`);
  }

  return id;
}

function validateEvidence(value, label) {
  const evidence = requireRecord(value, label);

  requireString(evidence.file, `${label}.file`);
  requireString(evidence.lines, `${label}.lines`);
}

function validateElement(element, index) {
  const label = `elements[${index}]`;
  requireRecord(element, label);
  requireId(element.id, `${label}.id`);
  requireString(element.type, `${label}.type`);
  requireString(element.name, `${label}.name`);
  requireString(element.documentation ?? '', `${label}.documentation`, { allowEmpty: true });
  validateEvidence(element.evidence, `${label}.evidence`);

  if (!elementTypes.has(element.type)) {
    throw new PlanSpecError(
      `${label}.type must be one of: ${[...elementTypes.keys()].join(', ')}`
    );
  }

  if (element.type === 'endEvent' &&
      element.error !== undefined &&
      typeof element.error !== 'boolean') {
    throw new PlanSpecError(`${label}.error must be a boolean when provided`);
  }

  if (element.type === 'boundaryEvent') {
    requireId(element.attachedTo, `${label}.attachedTo`);

    if (element.kind !== 'error' && element.kind !== 'timer') {
      throw new PlanSpecError(`${label}.kind must be "error" or "timer"`);
    }

    if (element.cancelActivity !== undefined && typeof element.cancelActivity !== 'boolean') {
      throw new PlanSpecError(`${label}.cancelActivity must be a boolean when provided`);
    }

    if (element.kind === 'timer') {
      const duration = requireString(element.duration, `${label}.duration`);

      if (!isoDurationPattern.test(duration)) {
        throw new PlanSpecError(`${label}.duration must be an ISO 8601 duration`);
      }
    }
  }
}

function validateFlow(flow, index) {
  const label = `flows[${index}]`;
  requireRecord(flow, label);
  requireId(flow.id, `${label}.id`);
  requireId(flow.source, `${label}.source`);
  requireId(flow.target, `${label}.target`);

  if (flow.name !== undefined) {
    requireString(flow.name, `${label}.name`);
  }

  if (flow.documentation !== undefined) {
    requireString(flow.documentation, `${label}.documentation`, { allowEmpty: true });
  }

  if (flow.evidence !== undefined) {
    validateEvidence(flow.evidence, `${label}.evidence`);
  } else if (flow.documentation !== undefined) {
    throw new PlanSpecError(`${label}.evidence is required when documentation is provided`);
  }
}

export function validatePlanSpec(spec) {
  requireRecord(spec, 'plan spec');
  requireId(spec.id, 'id');
  requireString(spec.name, 'name');

  if (!Array.isArray(spec.elements) || spec.elements.length === 0) {
    throw new PlanSpecError('elements must be a non-empty array');
  }

  if (!Array.isArray(spec.flows)) {
    throw new PlanSpecError('flows must be an array');
  }

  spec.elements.forEach(validateElement);
  spec.flows.forEach(validateFlow);

  const ids = new Map([
    [ spec.id, 'process' ],
    [ `${spec.id}_definitions`, 'definitions' ]
  ]);

  for (const [kind, entries] of [ [ 'element', spec.elements ], [ 'flow', spec.flows ] ]) {
    for (const entry of entries) {
      const existingKind = ids.get(entry.id);

      if (existingKind) {
        throw new PlanSpecError(
          `Duplicate BPMN id: ${entry.id} (${kind} conflicts with ${existingKind})`
        );
      }

      ids.set(entry.id, kind);
    }
  }

  const elementIds = new Set(spec.elements.map(({ id }) => id));

  for (const flow of spec.flows) {
    if (!elementIds.has(flow.source) || !elementIds.has(flow.target)) {
      throw new PlanSpecError(
        `Unknown flow endpoint for ${flow.id}: ${flow.source} -> ${flow.target}`
      );
    }
  }

  for (const element of spec.elements) {
    if (element.type === 'boundaryEvent' && !elementIds.has(element.attachedTo)) {
      throw new PlanSpecError(
        `Unknown boundary attachment for ${element.id}: ${element.attachedTo}`
      );
    }
  }

  return spec;
}

function eventDefinitions(moddle, element) {
  if ((element.type === 'endEvent' && element.error === true) ||
      (element.type === 'boundaryEvent' && element.kind === 'error')) {
    return [ moddle.create('bpmn:ErrorEventDefinition') ];
  }

  if (element.type === 'boundaryEvent' && element.kind === 'timer') {
    return [
      moddle.create('bpmn:TimerEventDefinition', {
        timeDuration: moddle.create('bpmn:FormalExpression', {
          body: element.duration
        })
      })
    ];
  }

  return [];
}

function evidenceProperties(moddle, element) {
  const description = (element.documentation ?? '').trimEnd();
  const { file, lines } = element.evidence;
  const text = `${description ? `${description} ` : ''}Evidence: ${file}:${lines}`;
  const payload = moddle.createAny('qq:evidence', EVIDENCE_NAMESPACE, {
    file,
    lines
  });

  return {
    documentation: [ moddle.create('bpmn:Documentation', { text }) ],
    extensionElements: moddle.create('bpmn:ExtensionElements', {
      values: [ payload ]
    })
  };
}

export async function generateBpmn(spec) {
  validatePlanSpec(spec);

  const moddle = new BpmnModdle();
  const process = moddle.create('bpmn:Process', {
    id: spec.id,
    name: spec.name,
    isExecutable: false
  });
  const definitions = moddle.create('bpmn:Definitions', {
    id: `${spec.id}_definitions`,
    targetNamespace: TARGET_NAMESPACE,
    rootElements: [ process ]
  });
  const elements = new Map();

  for (const elementSpec of spec.elements) {
    const properties = {
      id: elementSpec.id,
      name: elementSpec.name,
      ...evidenceProperties(moddle, elementSpec)
    };
    const definitionsForEvent = eventDefinitions(moddle, elementSpec);

    if (definitionsForEvent.length > 0) {
      properties.eventDefinitions = definitionsForEvent;
    }

    if (elementSpec.type === 'boundaryEvent') {
      properties.cancelActivity = elementSpec.cancelActivity ?? true;
    }

    const element = moddle.create(`bpmn:${elementTypes.get(elementSpec.type)}`, properties);
    elements.set(elementSpec.id, element);
    process.get('flowElements').push(element);
  }

  for (const elementSpec of spec.elements) {
    if (elementSpec.type !== 'boundaryEvent') {
      continue;
    }

    const boundary = elements.get(elementSpec.id);
    const activity = elements.get(elementSpec.attachedTo);

    if (!activity.$instanceOf('bpmn:Activity')) {
      throw new PlanSpecError(
        `Boundary event ${elementSpec.id} must attach to an activity; ${elementSpec.attachedTo} is ${activity.$type}`
      );
    }

    boundary.attachedToRef = activity;
  }

  for (const flowSpec of spec.flows) {
    const sourceRef = elements.get(flowSpec.source);
    const targetRef = elements.get(flowSpec.target);
    const flow = moddle.create('bpmn:SequenceFlow', {
      id: flowSpec.id,
      ...(flowSpec.name === undefined ? {} : { name: flowSpec.name }),
      ...(flowSpec.evidence === undefined ? {} : evidenceProperties(moddle, flowSpec)),
      sourceRef,
      targetRef
    });

    sourceRef.get('outgoing').push(flow);
    targetRef.get('incoming').push(flow);
    process.get('flowElements').push(flow);
  }

  const { xml } = await moddle.toXML(definitions, {
    format: true,
    preamble: true
  });

  return xml;
}

export async function readPlanSpec(specPath) {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(specPath, 'utf8'));
  } catch (error) {
    throw new PlanSpecError(`Could not read plan spec ${specPath}: ${error.message}`);
  }

  return validatePlanSpec(parsed);
}

export async function buildPlanFile(specPath, outputPath) {
  const spec = await readPlanSpec(specPath);
  const xml = await generateBpmn(spec);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');

  return { spec, xml, outputPath };
}
