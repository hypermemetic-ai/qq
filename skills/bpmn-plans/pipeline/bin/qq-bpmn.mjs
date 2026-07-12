#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { conformFiles } from '../lib/conformance.mjs';
import { buildPlanFile, generateBpmn, readPlanSpec } from '../lib/generate.mjs';
import { PipelineError, runPipeline } from '../lib/pipeline.mjs';

const usage = `Usage:
  qq-bpmn build <spec.json> <out.bpmn>
  qq-bpmn render <in.bpmn> <outdir>
  qq-bpmn all <spec.json> <outdir>
  qq-bpmn conform <plan.bpmn> <completions.json> [-o report.md] [--strict]`;

class CliError extends Error {
  constructor(message, exitCode = 64) {
    super(message);
    this.exitCode = exitCode;
  }
}

function requirePositionals(command, arguments_, count) {
  if (arguments_.length !== count) {
    throw new CliError(`${command} expects ${count} argument(s).\n\n${usage}`);
  }
}

async function build(specArgument, outputArgument) {
  const outputPath = resolve(outputArgument);
  await buildPlanFile(resolve(specArgument), outputPath);
  console.log(`Wrote ${outputPath}`);
}

async function render(inputArgument, outdirArgument) {
  await runPipeline(resolve(inputArgument), resolve(outdirArgument));
}

async function all(specArgument, outdirArgument) {
  const specPath = resolve(specArgument);
  const outdir = resolve(outdirArgument);
  const spec = await readPlanSpec(specPath);
  const bpmnPath = join(outdir, `${spec.id}.bpmn`);
  const xml = await generateBpmn(spec);

  await mkdir(outdir, { recursive: true });
  await writeFile(bpmnPath, xml, 'utf8');
  console.log(`Wrote ${bpmnPath}`);
  await runPipeline(bpmnPath, outdir);
}

async function conform(arguments_) {
  let parsed;

  try {
    parsed = parseArgs({
      args: arguments_,
      allowPositionals: true,
      strict: true,
      options: {
        output: {
          type: 'string',
          short: 'o'
        },
        strict: {
          type: 'boolean'
        }
      }
    });
  } catch (error) {
    throw new CliError(`${error.message}\n\n${usage}`);
  }

  requirePositionals('conform', parsed.positionals, 2);
  const [ planArgument, completionsArgument ] = parsed.positionals;
  const outputPath = parsed.values.output ? resolve(parsed.values.output) : undefined;
  const report = await conformFiles(
    resolve(planArgument),
    resolve(completionsArgument),
    { outputPath }
  );

  if (outputPath) {
    console.log(`Wrote ${outputPath}`);
  } else {
    process.stdout.write(report.markdown);
  }

  if (parsed.values.strict && report.strictFailed) {
    process.exitCode = 1;
  }
}

async function main() {
  const nodeMajor = Number.parseInt(process.versions.node.split('.', 1)[0], 10);

  if (nodeMajor < 20) {
    throw new CliError(`qq-bpmn requires Node.js >=20; found ${process.versions.node}`, 1);
  }

  const [ command, ...arguments_ ] = process.argv.slice(2);

  switch (command) {
    case 'build':
      requirePositionals(command, arguments_, 2);
      await build(...arguments_);
      break;
    case 'render':
      requirePositionals(command, arguments_, 2);
      await render(...arguments_);
      break;
    case 'all':
      requirePositionals(command, arguments_, 2);
      await all(...arguments_);
      break;
    case 'conform':
      await conform(arguments_);
      break;
    default:
      throw new CliError(usage);
  }
}

main().catch((error) => {
  const prefix = error instanceof PipelineError ? 'Pipeline failed' : 'qq-bpmn failed';
  console.error(`${prefix}: ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
});
