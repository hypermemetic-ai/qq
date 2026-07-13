import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { BpmnModdle } from 'bpmn-moddle';

import { buildConformanceReport } from '../lib/conformance.mjs';
import { generateBpmn } from '../lib/generate.mjs';
import { lintBpmnXml, PipelineError, runPipeline } from '../lib/pipeline.mjs';
import { publishWikiProcess, validateWikiSpec, WikiPublishError } from '../lib/wiki.mjs';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(packageDirectory, 'example', 'plan-spec.example.json');
const cliPath = join(packageDirectory, 'bin', 'qq-bpmn.mjs');
const testOutputRoot = join(packageDirectory, 'out', 'test');
const silentLogger = { log() {} };

async function temporaryDirectory(t, prefix) {
  await mkdir(testOutputRoot, { recursive: true });
  const directory = await mkdtemp(join(testOutputRoot, `${prefix}-`));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function definitions(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_fixture" targetNamespace="http://qq.local/test">
${body}
</bpmn:definitions>`;
}

function validProcess(id = 'Process_fixture') {
  return `<bpmn:process id="${id}" name="Fixture process">
    <bpmn:startEvent id="${id}_start" name="Start">
      <bpmn:outgoing>${id}_flow</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:endEvent id="${id}_end" name="End">
      <bpmn:incoming>${id}_flow</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="${id}_flow" sourceRef="${id}_start" targetRef="${id}_end" />
  </bpmn:process>`;
}

async function expectRule(xml, rule) {
  await assert.rejects(
    () => lintBpmnXml(xml, { logger: silentLogger }),
    (error) => {
      assert.ok(error instanceof PipelineError);
      assert.ok(
        error.findings.some((finding) => finding.rule === rule),
        `expected a finding for ${rule}; got ${error.findings.map(({ rule: name }) => name).join(', ')}`
      );
      return true;
    }
  );
}

test('qq/no-collaboration rejects collaborations and participants', async () => {
  const xml = definitions(`${validProcess()}
  <bpmn:collaboration id="Collaboration_fixture">
    <bpmn:participant id="Participant_fixture" name="Participant" processRef="Process_fixture" />
  </bpmn:collaboration>`);

  await expectRule(xml, 'qq/no-collaboration');
});

test('qq/no-lanes rejects lane sets and lanes', async () => {
  const xml = definitions(`<bpmn:process id="Process_fixture" name="Fixture process">
    <bpmn:laneSet id="LaneSet_fixture">
      <bpmn:lane id="Lane_fixture" name="Operator">
        <bpmn:flowNodeRef>Start_fixture</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_fixture</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_fixture" name="Start">
      <bpmn:outgoing>Flow_fixture</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:endEvent id="End_fixture" name="End">
      <bpmn:incoming>Flow_fixture</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_fixture" sourceRef="Start_fixture" targetRef="End_fixture" />
  </bpmn:process>`);

  await expectRule(xml, 'qq/no-lanes');
});

test('qq/no-subprocess rejects subprocess, ad hoc, and transaction variants', async (t) => {
  for (const [label, tag] of [
    [ 'subprocess', 'subProcess' ],
    [ 'ad hoc subprocess', 'adHocSubProcess' ],
    [ 'transaction', 'transaction' ]
  ]) {
    await t.test(label, async () => {
      const xml = definitions(`<bpmn:process id="Process_fixture" name="Fixture process">
        <bpmn:startEvent id="Outer_start" name="Start"><bpmn:outgoing>Flow_in</bpmn:outgoing></bpmn:startEvent>
        <bpmn:${tag} id="Nested_work" name="Nested work">
          <bpmn:incoming>Flow_in</bpmn:incoming>
          <bpmn:outgoing>Flow_out</bpmn:outgoing>
          <bpmn:startEvent id="Inner_start" name="Begin"><bpmn:outgoing>Inner_flow</bpmn:outgoing></bpmn:startEvent>
          <bpmn:endEvent id="Inner_end" name="Finish"><bpmn:incoming>Inner_flow</bpmn:incoming></bpmn:endEvent>
          <bpmn:sequenceFlow id="Inner_flow" sourceRef="Inner_start" targetRef="Inner_end" />
        </bpmn:${tag}>
        <bpmn:endEvent id="Outer_end" name="End"><bpmn:incoming>Flow_out</bpmn:incoming></bpmn:endEvent>
        <bpmn:sequenceFlow id="Flow_in" sourceRef="Outer_start" targetRef="Nested_work" />
        <bpmn:sequenceFlow id="Flow_out" sourceRef="Nested_work" targetRef="Outer_end" />
      </bpmn:process>`);

      await expectRule(xml, 'qq/no-subprocess');
    });
  }
});

test('qq/single-process rejects definitions with more than one process', async () => {
  await expectRule(
    definitions(`${validProcess('Process_one')}\n${validProcess('Process_two')}`),
    'qq/single-process'
  );
});

test('generator is deterministic and pipeline preserves all example evidence', async (t) => {
  const directory = await temporaryDirectory(t, 'core');
  const spec = JSON.parse(await readFile(examplePath, 'utf8'));
  const firstXml = await generateBpmn(spec);
  const secondXml = await generateBpmn(spec);
  const firstPath = join(directory, 'example.bpmn');
  const secondPath = join(directory, 'example-second.bpmn');

  await writeFile(firstPath, firstXml, 'utf8');
  await writeFile(secondPath, secondXml, 'utf8');
  assert.deepEqual(await readFile(firstPath), await readFile(secondPath));

  const { rootElement, warnings } = await new BpmnModdle().fromXML(firstXml);
  assert.deepEqual(warnings, []);
  const [ process ] = rootElement.rootElements;
  const flowNodes = process.flowElements.filter((element) => element.$instanceOf('bpmn:FlowNode'));
  assert.equal(flowNodes.length, spec.elements.length);

  for (const element of flowNodes) {
    const evidence = spec.elements.find(({ id }) => id === element.id).evidence;
    assert.equal(element.documentation.length, 1);
    assert.ok(element.documentation[0].text.endsWith(`Evidence: ${evidence.file}:${evidence.lines}`));
    assert.equal(element.extensionElements.values.length, 1);
    assert.equal(element.extensionElements.values[0].$type, 'qq:evidence');
    assert.equal(element.extensionElements.values[0].file, evidence.file);
    assert.equal(element.extensionElements.values[0].lines, evidence.lines);
  }

  const result = await runPipeline(firstPath, join(directory, 'pipeline'), {
    logger: silentLogger,
    render: false
  });
  assert.equal(result.roundTrip.lossless, true);
  assert.equal(result.roundTrip.documentationBefore.length, spec.elements.length);
  assert.equal(result.roundTrip.extensionBefore.length, spec.elements.length);
  const verdict = JSON.parse(await readFile(result.paths.roundTrip, 'utf8'));
  assert.equal(verdict.lossless, true);
  assert.match(await readFile(result.paths.layout, 'utf8'), /<bpmndi:BPMNDiagram/);
});

test('generator preserves optional sequence-flow evidence without breaking legacy flows', async (t) => {
  const directory = await temporaryDirectory(t, 'flow-evidence');
  const nodeEvidence = { file: 'src/process.mjs', lines: '1-12' };
  const flowEvidence = { file: 'src/process.mjs', lines: '13-18' };
  const xml = await generateBpmn({
    id: 'flow_evidence_fixture',
    name: 'Flow evidence fixture',
    elements: [
      { id: 'start', type: 'startEvent', name: 'Start', evidence: nodeEvidence },
      { id: 'work', type: 'serviceTask', name: 'Work', evidence: nodeEvidence },
      { id: 'end', type: 'endEvent', name: 'End', evidence: nodeEvidence }
    ],
    flows: [
      {
        id: 'flow_traced',
        source: 'start',
        target: 'work',
        documentation: 'Source establishes this transition.',
        evidence: flowEvidence
      },
      { id: 'flow_legacy', source: 'work', target: 'end' }
    ]
  });
  const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
  assert.deepEqual(warnings, []);
  const [ process ] = rootElement.rootElements;
  const byId = new Map(process.flowElements.map((element) => [ element.id, element ]));
  const traced = byId.get('flow_traced');
  const legacy = byId.get('flow_legacy');

  assert.equal(traced.documentation.length, 1);
  assert.ok(traced.documentation[0].text.endsWith(
    `Evidence: ${flowEvidence.file}:${flowEvidence.lines}`
  ));
  assert.equal(traced.extensionElements.values.length, 1);
  assert.equal(traced.extensionElements.values[0].$type, 'qq:evidence');
  assert.equal(traced.extensionElements.values[0].file, flowEvidence.file);
  assert.equal(traced.extensionElements.values[0].lines, flowEvidence.lines);
  assert.equal(legacy.documentation, undefined);
  assert.equal(legacy.extensionElements, undefined);

  const inputPath = join(directory, 'flow-evidence.bpmn');
  await writeFile(inputPath, xml, 'utf8');
  const result = await runPipeline(inputPath, join(directory, 'pipeline'), {
    logger: silentLogger,
    render: false
  });
  assert.equal(result.roundTrip.lossless, true);
  assert.equal(result.roundTrip.documentationBefore.length, 4);
  assert.equal(result.roundTrip.extensionBefore.length, 4);
});

test('generator supports timer and error boundary events with deterministic evidence', async () => {
  const evidence = { file: 'src/worker.mjs', lines: '10-24' };
  const base = (id, type, name, extras = {}) => ({
    id,
    type,
    name,
    documentation: `${name} behavior.`,
    evidence,
    ...extras
  });
  const xml = await generateBpmn({
    id: 'boundary_fixture',
    name: 'Boundary event fixture',
    elements: [
      base('start', 'startEvent', 'Start'),
      base('work', 'serviceTask', 'Work'),
      base('done', 'endEvent', 'Done'),
      base('timeout', 'boundaryEvent', 'Timed out', {
        attachedTo: 'work',
        kind: 'timer',
        duration: 'PT30M'
      }),
      base('failed', 'boundaryEvent', 'Failed', {
        attachedTo: 'work',
        kind: 'error',
        cancelActivity: false
      }),
      base('timeout_end', 'endEvent', 'Timeout end', { error: true }),
      base('failure_end', 'endEvent', 'Failure end', { error: true })
    ],
    flows: [
      { id: 'flow_start', source: 'start', target: 'work' },
      { id: 'flow_done', source: 'work', target: 'done' },
      { id: 'flow_timeout', source: 'timeout', target: 'timeout_end' },
      { id: 'flow_failure', source: 'failed', target: 'failure_end' }
    ]
  });
  const { rootElement } = await new BpmnModdle().fromXML(xml);
  const [ process ] = rootElement.rootElements;
  const byId = new Map(process.flowElements.map((element) => [ element.id, element ]));

  assert.equal(byId.get('timeout').attachedToRef.id, 'work');
  assert.equal(byId.get('timeout').cancelActivity, true);
  assert.equal(byId.get('timeout').eventDefinitions[0].$type, 'bpmn:TimerEventDefinition');
  assert.equal(byId.get('timeout').eventDefinitions[0].timeDuration.body, 'PT30M');
  assert.equal(byId.get('failed').cancelActivity, false);
  assert.equal(byId.get('failed').eventDefinitions[0].$type, 'bpmn:ErrorEventDefinition');
  assert.equal(byId.get('timeout_end').eventDefinitions[0].$type, 'bpmn:ErrorEventDefinition');
});

test('generator rejects generated-id collisions, parser-reserved ids, and mixed week durations', async () => {
  const evidence = { file: 'src/validation.mjs', lines: '1-8' };
  const element = (id, type, extras = {}) => ({
    id,
    type,
    name: id,
    evidence,
    ...extras
  });
  const linearSpec = (startId = 'start', flowId = 'flow') => ({
    id: 'validation_plan',
    name: 'Validation plan',
    elements: [
      element(startId, 'startEvent'),
      element('end', 'endEvent')
    ],
    flows: [ { id: flowId, source: startId, target: 'end' } ]
  });

  await assert.rejects(
    () => generateBpmn(linearSpec('validation_plan')),
    /element conflicts with process/
  );
  await assert.rejects(
    () => generateBpmn(linearSpec('start', 'validation_plan_definitions')),
    /flow conflicts with definitions/
  );
  await assert.rejects(
    () => generateBpmn(linearSpec('constructor')),
    /reserved by the BPMN parser/
  );

  const undocumentedFlowEvidence = linearSpec();
  undocumentedFlowEvidence.flows[0].documentation = 'This would otherwise be discarded.';
  await assert.rejects(
    () => generateBpmn(undocumentedFlowEvidence),
    /flows\[0\]\.evidence is required when documentation is provided/
  );

  const timerSpec = (duration) => ({
    id: 'timer_validation_plan',
    name: 'Timer validation plan',
    elements: [
      element('timer_start', 'startEvent'),
      element('timer_work', 'serviceTask'),
      element('timer_boundary', 'boundaryEvent', {
        attachedTo: 'timer_work',
        kind: 'timer',
        duration
      }),
      element('timer_end', 'endEvent')
    ],
    flows: [
      { id: 'timer_flow_in', source: 'timer_start', target: 'timer_work' },
      { id: 'timer_flow_out', source: 'timer_work', target: 'timer_end' }
    ]
  });

  await assert.rejects(
    () => generateBpmn(timerSpec('P1Y1W')),
    /must be an ISO 8601 duration/
  );
  await generateBpmn(timerSpec('P1W'));
});

test('OpenWiki specs require traceable Repository evidence on every documented node and flow', async (t) => {
  const repository = await temporaryDirectory(t, 'wiki-validation');
  const outside = await temporaryDirectory(t, 'wiki-validation-outside');
  const processesDirectory = join(repository, 'openwiki', 'processes');
  const sourceDirectory = join(repository, 'src');
  const specPath = join(processesDirectory, 'documented_process.json');
  await mkdir(processesDirectory, { recursive: true });
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(
    join(sourceDirectory, 'process.mjs'),
    `${Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n')}\n`,
    'utf8'
  );
  await writeFile(join(outside, 'escaped.mjs'), 'outside\n', 'utf8');
  await symlink(join(outside, 'escaped.mjs'), join(sourceDirectory, 'escaped.mjs'));

  const evidence = { file: 'src/process.mjs', lines: '1-12' };
  const spec = {
    id: 'documented_process',
    name: 'Documented process',
    elements: [
      {
        id: 'start',
        type: 'startEvent',
        name: 'Start',
        documentation: 'The process begins.',
        evidence
      },
      {
        id: 'done',
        type: 'endEvent',
        name: 'Done',
        documentation: 'The process completes.',
        evidence
      }
    ],
    flows: [
      {
        id: 'flow_done',
        source: 'start',
        target: 'done',
        documentation: 'Control passes directly to completion.',
        evidence
      }
    ]
  };

  await validateWikiSpec(spec, specPath);
  await assert.rejects(
    () => validateWikiSpec(spec, join(processesDirectory, 'wrong-name.json')),
    (error) => error instanceof WikiPublishError && /filename must match process id/.test(error.message)
  );

  for (const [mutate, expected] of [
    [ (candidate) => { candidate.elements[0].documentation = ''; }, /elements\[0\]\.documentation/ ],
    [ (candidate) => { delete candidate.flows[0].documentation; }, /flows\[0\]\.documentation/ ],
    [ (candidate) => { delete candidate.flows[0].evidence; }, /flows\[0\]\.evidence/ ],
    [ (candidate) => { candidate.flows[0].evidence.file = '../../outside.mjs'; }, /normalized Repository-relative path/ ],
    [ (candidate) => { candidate.flows[0].evidence.file = '/tmp/outside.mjs'; }, /normalized Repository-relative path/ ],
    [ (candidate) => { candidate.flows[0].evidence.file = 'src/escaped.mjs'; }, /resolves outside the Repository/ ],
    [ (candidate) => { candidate.flows[0].evidence.file = 'src/missing.mjs'; }, /could not be resolved inside the Repository/ ],
    [ (candidate) => { candidate.flows[0].evidence.lines = 'not-a-range'; }, /positive line numbers or inclusive ranges/ ],
    [ (candidate) => { candidate.flows[0].evidence.lines = '12-4'; }, /reversed range/ ],
    [ (candidate) => { candidate.flows[0].evidence.lines = '1-21'; }, /exceeds .* 20 line/ ]
  ]) {
    const candidate = structuredClone(spec);
    mutate(candidate);
    await assert.rejects(
      () => validateWikiSpec(candidate, specPath),
      expected
    );
  }
});

test('OpenWiki publishing emits only deterministic semantic BPMN and PNG artifacts', async (t) => {
  if (process.env.QQ_BPMN_SKIP_RENDER === '1') {
    t.skip('QQ_BPMN_SKIP_RENDER=1');
    return;
  }

  try {
    const puppeteer = await import('puppeteer');
    await access(puppeteer.default.executablePath(), fsConstants.X_OK);
  } catch (error) {
    t.skip(`Chrome unavailable: ${error.message}`);
    return;
  }

  const repository = await temporaryDirectory(t, 'wiki-publish');
  const directory = join(repository, 'openwiki', 'processes');
  await mkdir(directory, { recursive: true });
  await mkdir(join(repository, 'src'), { recursive: true });
  await writeFile(
    join(repository, 'src', 'lifecycle.mjs'),
    `${Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n')}\n`,
    'utf8'
  );
  const evidence = { file: 'src/lifecycle.mjs', lines: '4-27' };
  const spec = {
    id: 'widget_lifecycle',
    name: 'Widget lifecycle',
    elements: [
      {
        id: 'requested',
        type: 'startEvent',
        name: 'Widget requested',
        documentation: 'A caller requests a widget.',
        evidence
      },
      {
        id: 'build',
        type: 'serviceTask',
        name: 'Build widget',
        documentation: 'The service builds the requested widget.',
        evidence
      },
      {
        id: 'built',
        type: 'endEvent',
        name: 'Widget built',
        documentation: 'The completed widget is returned.',
        evidence
      }
    ],
    flows: [
      {
        id: 'flow_request_build',
        source: 'requested',
        target: 'build',
        documentation: 'A valid request starts construction.',
        evidence
      },
      {
        id: 'flow_build_done',
        source: 'build',
        target: 'built',
        documentation: 'Successful construction produces the widget.',
        evidence
      }
    ]
  };
  const specPath = join(directory, `${spec.id}.json`);
  await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

  const published = await publishWikiProcess(specPath, { logger: silentLogger });
  const firstBpmn = await readFile(published.bpmnPath);
  const firstPng = await readFile(published.pngPath);
  assert.deepEqual((await readdir(directory)).sort(), [
    'widget_lifecycle.bpmn',
    'widget_lifecycle.json',
    'widget_lifecycle.png'
  ]);
  assert.doesNotMatch(firstBpmn.toString('utf8'), /<bpmndi:BPMNDiagram/);
  assert.deepEqual(firstPng.subarray(0, 8), Buffer.from([ 137, 80, 78, 71, 13, 10, 26, 10 ]));

  const check = spawnSync(process.execPath, [ cliPath, 'wiki', specPath, '--check' ], {
    encoding: 'utf8'
  });
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(await readFile(published.bpmnPath), firstBpmn);
  assert.deepEqual(await readFile(published.pngPath), firstPng);

  await writeFile(published.pngPath, Buffer.from('stale'));
  const stale = spawnSync(process.execPath, [ cliPath, 'wiki', '--check', specPath ], {
    encoding: 'utf8'
  });
  assert.equal(stale.status, 1, stale.stderr);
  assert.match(stale.stderr, /PNG does not match deterministic generation/);
});

test('rendered SVG and PNG are visible and deterministic when Chrome is available', async (t) => {
  if (process.env.QQ_BPMN_SKIP_RENDER === '1') {
    t.skip('QQ_BPMN_SKIP_RENDER=1');
    return;
  }

  let chromePath;

  try {
    const puppeteer = await import('puppeteer');
    chromePath = puppeteer.default.executablePath();
    await access(chromePath, fsConstants.X_OK);
  } catch (error) {
    t.skip(`Chrome unavailable: ${error.message}`);
    return;
  }

  assert.ok(chromePath);
  const directory = await temporaryDirectory(t, 'render');
  const spec = JSON.parse(await readFile(examplePath, 'utf8'));
  const inputPath = join(directory, 'render-plan.bpmn');
  await writeFile(inputPath, await generateBpmn(spec), 'utf8');

  const first = await runPipeline(inputPath, join(directory, 'first'), { logger: silentLogger });
  const second = await runPipeline(inputPath, join(directory, 'second'), { logger: silentLogger });
  const firstSvg = await readFile(first.paths.svg);
  const firstPng = await readFile(first.paths.png);

  assert.deepEqual(firstSvg, await readFile(second.paths.svg));
  assert.deepEqual(firstPng, await readFile(second.paths.png));
  assert.match(firstSvg.toString('utf8'), /bpmn-pipeline-marker-001/);
  assert.match(firstSvg.toString('utf8'), /data-element-id="release_requested"/);
  assert.ok(firstSvg.length > 10_000);
  assert.deepEqual(firstPng.subarray(0, 8), Buffer.from([ 137, 80, 78, 71, 13, 10, 26, 10 ]));
  assert.ok(firstPng.readUInt32BE(16) > 100);
  assert.ok(firstPng.readUInt32BE(20) > 100);
  assert.ok(firstPng.length > 10_000);
});

test('conformance reports done, diverged, unaccounted, and unknown paths', async () => {
  const spec = JSON.parse(await readFile(examplePath, 'utf8'));
  const xml = await generateBpmn(spec);
  const report = await buildConformanceReport(xml, {
    release_requested: {
      status: 'done',
      evidence: 'out/checks/start.txt'
    },
    inspect_change: {
      status: 'diverged',
      evidence: 'out/checks/inspection.txt'
    },
    prepare_release_notes: {
      status: 'skipped',
      note: 'Release notes were already current.'
    },
    unknown_step: {
      status: 'done',
      evidence: 'out/checks/unknown.txt'
    }
  }, { planLabel: 'example plan' });

  assert.match(report.markdown, /\| release_requested \| Release requested \| StartEvent \| done \|/);
  assert.match(report.markdown, /\| inspect_change \| Inspect the exact change \| ServiceTask \| diverged \|/);
  assert.match(report.markdown, /\| verify_release \| Run release checks \| ServiceTask \| unaccounted \|/);
  assert.match(report.markdown, /`unknown_step`/);
  assert.match(report.markdown, /missing required divergence note/);
  assert.equal(report.unaccounted.length, spec.elements.length - 3);
  assert.deepEqual(report.unknownIds, [ 'unknown_step' ]);
  assert.equal(report.strictFailed, true);

  const accounted = Object.fromEntries(spec.elements.map(({ id }) => [
    id,
    { status: 'done', evidence: `out/checks/${id}.txt` }
  ]));
  accounted.inspect_change = {
    status: 'diverged',
    evidence: 'out/checks/inspection.txt',
    note: 'Used the equivalent repository-native check.'
  };
  const strictPass = await buildConformanceReport(xml, accounted);
  assert.equal(strictPass.strictFailed, false);
});

test('conformance CLI exits zero by default and one for strict failures', async (t) => {
  const directory = await temporaryDirectory(t, 'conformance-cli');
  const spec = JSON.parse(await readFile(examplePath, 'utf8'));
  const planPath = join(directory, 'plan.bpmn');
  const completionsPath = join(directory, 'completions.json');
  const reportPath = join(directory, 'report.md');
  await writeFile(planPath, await generateBpmn(spec), 'utf8');
  await writeFile(completionsPath, `${JSON.stringify({
    release_requested: { status: 'done', evidence: 'out/start.txt' },
    inspect_change: { status: 'diverged', evidence: 'out/inspect.txt' }
  }, null, 2)}\n`, 'utf8');

  const normal = spawnSync(process.execPath, [
    cliPath,
    'conform',
    planPath,
    completionsPath,
    '-o',
    reportPath
  ], { encoding: 'utf8' });
  assert.equal(normal.status, 0, normal.stderr);
  assert.match(await readFile(reportPath, 'utf8'), /Strict verdict: FAIL/);

  const strict = spawnSync(process.execPath, [
    cliPath,
    'conform',
    planPath,
    completionsPath,
    '--strict'
  ], { encoding: 'utf8' });
  assert.equal(strict.status, 1, strict.stderr);
  assert.match(strict.stdout, /# BPMN conformance report/);
});
