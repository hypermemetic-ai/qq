import { layoutProcess } from 'bpmn-auto-layout';
import { BpmnModdle } from 'bpmn-moddle';
import ELK from 'elkjs/lib/elk.bundled.js';

export const LAYOUT_MODES = Object.freeze({
  OPENWIKI: 'openwiki',
  PLAN: 'plan'
});

const planLayoutOptions = Object.freeze({
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.aspectRatio': '2.0',
  'org.eclipse.elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
  'org.eclipse.elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'org.eclipse.elk.layered.feedbackEdges': 'true',
  'org.eclipse.elk.layered.wrapping.strategy': 'MULTI_EDGE',
  'org.eclipse.elk.layered.wrapping.correctionFactor': '1.0',
  'org.eclipse.elk.layered.wrapping.additionalEdgeSpacing': '25',
  'org.eclipse.elk.layered.wrapping.multiEdge.improveCuts': 'true',
  'org.eclipse.elk.layered.wrapping.multiEdge.improveWrappedEdges': 'true',
  'elk.layered.spacing.nodeNodeBetweenLayers': '70',
  'elk.spacing.nodeNode': '55',
  'elk.spacing.edgeNode': '28',
  'elk.padding': '[top=40,left=40,bottom=40,right=40]'
});
const boundaryLabelGap = 24;
const boundaryLabelEdgeGap = 8;
const boundaryExternalLabelWidth = 90;
const boundaryExternalLabelHeight = 30;

function processFor(definitions) {
  const process = definitions.rootElements.find((element) =>
    element.$instanceOf('bpmn:Process')
  );

  if (!process) {
    throw new Error('Plan layout requires one BPMN process');
  }

  return process;
}

function flowNodes(process) {
  return process.flowElements.filter((element) => element.$instanceOf('bpmn:FlowNode'));
}

function sequenceFlows(process) {
  return process.flowElements.filter((element) => element.$instanceOf('bpmn:SequenceFlow'));
}

function pointsFor(edge) {
  const points = [];

  for (const section of edge.sections ?? []) {
    const candidates = [ section.startPoint, ...(section.bendPoints ?? []), section.endPoint ];

    for (const point of candidates) {
      const previous = points.at(-1);

      if (!previous || previous.x !== point.x || previous.y !== point.y) {
        points.push(point);
      }
    }
  }

  return points;
}

function requireDiagramElement(elements, id, kind) {
  const element = elements.get(id);

  if (!element) {
    throw new Error(`Plan layout could not find ${kind} for ${id}`);
  }

  return element;
}

function activityIdFor(node) {
  return node.$instanceOf('bpmn:BoundaryEvent') ? node.attachedToRef.id : node.id;
}

function estimatedBoundaryLabelWidth(boundary, iconWidth) {
  return (boundary.name ?? '').trim() ? boundaryExternalLabelWidth : iconWidth;
}

function activityWidthForBoundaries(boundaries, shapes, defaultWidth) {
  if (boundaries.length < 2) {
    return defaultWidth;
  }

  const labelWidth = boundaries.reduce((total, boundary) => {
    const shape = requireDiagramElement(shapes, boundary.id, 'boundary shape');
    return total + estimatedBoundaryLabelWidth(boundary, shape.bounds.width);
  }, 0);

  return Math.max(defaultWidth, labelWidth + boundaryLabelGap * (boundaries.length - 1));
}

function elkChildren(nodes, shapes) {
  const boundaryByActivity = new Map();

  for (const node of nodes) {
    if (!node.$instanceOf('bpmn:BoundaryEvent')) {
      continue;
    }

    const activityId = node.attachedToRef?.id;

    if (!activityId) {
      throw new Error(`Boundary event ${node.id} has no attached activity`);
    }

    const boundaries = boundaryByActivity.get(activityId) ?? [];
    boundaries.push(node);
    boundaryByActivity.set(activityId, boundaries);
  }

  return nodes
    .filter((node) => !node.$instanceOf('bpmn:BoundaryEvent'))
    .map((node) => {
      const shape = requireDiagramElement(shapes, node.id, 'BPMN shape');
      const boundaries = boundaryByActivity.get(node.id) ?? [];
      const child = {
        id: node.id,
        width: activityWidthForBoundaries(boundaries, shapes, shape.bounds.width),
        height: shape.bounds.height
      };

      if (boundaries.length > 0) {
        child.layoutOptions = {
          'org.eclipse.elk.portConstraints': 'FIXED_SIDE',
          'org.eclipse.elk.spacing.portPort': String(boundaryLabelGap)
        };
        child.ports = boundaries.map((boundary) => {
          const boundaryShape = requireDiagramElement(shapes, boundary.id, 'boundary shape');

          return {
            id: boundary.id,
            width: estimatedBoundaryLabelWidth(boundary, boundaryShape.bounds.width),
            height: boundaryShape.bounds.height,
            layoutOptions: {
              'org.eclipse.elk.port.side': 'SOUTH'
            }
          };
        });
      }

      return child;
    });
}

function boundaryOffsets(result) {
  return new Map(
    (result.children ?? []).flatMap((node) =>
      (node.ports ?? []).map((port) => [
        port.id,
        { x: 0, y: -port.height / 2 }
      ])
    )
  );
}

function applyElkNodes(result, shapes, offsets, moddle) {
  for (const node of result.children ?? []) {
    const shape = requireDiagramElement(shapes, node.id, 'BPMN shape');
    shape.bounds.x = node.x;
    shape.bounds.y = node.y;
    shape.bounds.width = node.width;
    shape.bounds.height = node.height;

    for (const port of node.ports ?? []) {
      const boundaryShape = requireDiagramElement(shapes, port.id, 'boundary shape');
      const offset = offsets.get(port.id);
      const iconWidth = boundaryShape.bounds.width;
      const iconHeight = boundaryShape.bounds.height;
      boundaryShape.bounds.x = node.x + port.x + (port.width - iconWidth) / 2 + offset.x;
      boundaryShape.bounds.y = node.y + port.y + offset.y;
      boundaryShape.bounds.width = iconWidth;
      boundaryShape.bounds.height = iconHeight;

      if ((boundaryShape.bpmnElement.name ?? '').trim()) {
        const centerX = boundaryShape.bounds.x + iconWidth / 2;
        const label = moddle.create('bpmndi:BPMNLabel');
        label.bounds = moddle.create('dc:Bounds', {
          x: centerX - port.width - boundaryLabelEdgeGap,
          y: boundaryShape.bounds.y + iconHeight,
          width: port.width,
          height: boundaryExternalLabelHeight
        });
        boundaryShape.label = label;
      }
    }
  }
}

function applyElkEdges(result, diagramEdges, moddle, offsets) {
  for (const edge of result.edges ?? []) {
    const diagramEdge = requireDiagramElement(diagramEdges, edge.id, 'BPMN edge');
    const points = pointsFor(edge);

    if (points.length < 2) {
      throw new Error(`Plan layout produced no usable route for ${edge.id}`);
    }

    const sourceOffset = offsets.get(edge.sources?.[0]);

    if (sourceOffset) {
      points[0] = {
        x: points[0].x + sourceOffset.x,
        y: points[0].y + sourceOffset.y
      };
    }

    diagramEdge.waypoint = points.map((point) => moddle.create('dc:Point', point));
  }
}

export async function layoutPlanProcess(xml) {
  const officialXml = await layoutProcess(xml);
  const moddle = new BpmnModdle();
  const { rootElement: definitions, warnings = [] } = await moddle.fromXML(officialXml);

  if (warnings.length > 0) {
    throw new Error(`Could not parse initial plan layout: ${warnings[0].message}`);
  }

  const process = processFor(definitions);
  const plane = definitions.diagrams?.[0]?.plane;

  if (!plane) {
    throw new Error('Initial plan layout did not produce a BPMN plane');
  }

  const shapes = new Map(
    plane.planeElement
      .filter((element) => element.$instanceOf('bpmndi:BPMNShape'))
      .map((shape) => [ shape.bpmnElement.id, shape ])
  );
  const diagramEdges = new Map(
    plane.planeElement
      .filter((element) => element.$instanceOf('bpmndi:BPMNEdge'))
      .map((edge) => [ edge.bpmnElement.id, edge ])
  );
  const nodes = flowNodes(process);
  const orderedActivityIds = nodes
    .filter((node) => !node.$instanceOf('bpmn:BoundaryEvent'))
    .map(({ id }) => id);
  const nodeOrder = new Map(orderedActivityIds.map((id, index) => [ id, index ]));
  const graph = {
    id: 'root',
    layoutOptions: planLayoutOptions,
    children: elkChildren(nodes, shapes),
    edges: sequenceFlows(process).map((flow) => {
      const sourceId = flow.sourceRef.id;
      const targetId = flow.targetRef.id;
      const sourceOrder = nodeOrder.get(activityIdFor(flow.sourceRef));
      const targetOrder = nodeOrder.get(activityIdFor(flow.targetRef));

      return {
        id: flow.id,
        sources: [ sourceId ],
        targets: [ targetId ],
        layoutOptions: {
          'org.eclipse.elk.layered.priority.direction': String(
            targetOrder > sourceOrder ? 100 : 0
          )
        }
      };
    })
  };
  const result = await new ELK().layout(graph);
  const offsets = boundaryOffsets(result);

  applyElkNodes(result, shapes, offsets, moddle);
  applyElkEdges(result, diagramEdges, moddle, offsets);

  const { xml: wrappedXml } = await moddle.toXML(definitions, {
    format: true,
    preamble: true
  });
  return wrappedXml;
}

export async function layoutBpmnXml(xml, { mode = LAYOUT_MODES.PLAN } = {}) {
  if (mode === LAYOUT_MODES.OPENWIKI) {
    return layoutProcess(xml);
  }

  if (mode === LAYOUT_MODES.PLAN) {
    return layoutPlanProcess(xml);
  }

  throw new Error(`Unknown BPMN layout mode: ${mode}`);
}
