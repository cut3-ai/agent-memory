#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { runAndWriteRoundZero } from './round0.js';

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o', default: 'experiment-runs' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.help) {
    process.stdout.write('Usage: node src/experiment/cli.js --input <workspaces.jsonl> [--out experiment-runs]\n');
    return null;
  }
  if (!values.input) throw new Error('Missing --input');
  const inputText = await fs.readFile(path.resolve(values.input), 'utf8');
  const result = await runAndWriteRoundZero(inputText, path.resolve(values.out));
  process.stdout.write([
    `Experiment: ${result.roundZero.experiment.experimentId}`,
    `Double-run identical: ${result.roundZero.determinism.byteIdentical}`,
    `Artifacts: ${result.root}`,
    '',
  ].join('\n'));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
