#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runCbaPipeline } from './pipeline.js';

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o', default: 'cba-runs' },
      'private-out': { type: 'string', default: '.private-cba-runs' },
      cycles: { type: 'string', default: '20' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help) {
    process.stdout.write([
      'Usage: node src/cba/cli.js --input <workspaces.jsonl> [options]',
      '',
      '  -o, --out          Sanitized generated library root (default: cba-runs)',
      '      --private-out  Raw reconstruction root (default: .private-cba-runs)',
      '      --cycles       Deterministic full-corpus replay cycles (default: 20)',
      '',
    ].join('\n'));
    return null;
  }
  const inputPath = path.resolve(values.input ?? positionals[0] ?? '');
  if (!values.input && positionals.length === 0) throw new Error('Missing --input');
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const inputText = await fs.readFile(inputPath, 'utf8');
  const result = await runCbaPipeline(inputText, {
    cycles: Number(values.cycles),
    publicRoot: path.resolve(values.out),
    privateRoot: path.resolve(values['private-out']),
    repoRoot,
    onCycle({ cycle, cycles, digest, exact }) {
      process.stdout.write(`Cycle ${cycle}/${cycles}: semantic exact ${exact}/100, digest ${digest.slice(0, 12)}\n`);
    },
  });
  process.stdout.write([
    `Run: ${result.runId}`,
    `Semantic exact: ${result.final.semanticExactCompositions}/${result.final.compositions}`,
    `Production memory accepted: ${result.final.acceptedForAutomaticMemoryPromotion}`,
    `Public: ${result.publicRunDirectory}`,
    `Private: ${result.privateRunDirectory}`,
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
