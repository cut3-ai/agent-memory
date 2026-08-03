#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

import { stableStringify } from './lib.js';
import { mineDataset } from './mine.js';
import { buildReportData, renderMarkdownReport } from './report.js';

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      input: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o', default: 'runs' },
      'private-out': { type: 'string', default: '.private-runs' },
      threshold: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  if (values.help) {
    process.stdout.write(helpText());
    return null;
  }
  const inputValue = values.input ?? positionals[0];
  const thresholdValue = values.threshold ?? positionals[1] ?? '0.85';
  if (!inputValue) throw new Error('Missing required --input <workspaces.jsonl>');

  const clusterThreshold = Number(thresholdValue);
  if (!Number.isFinite(clusterThreshold) || clusterThreshold <= 0 || clusterThreshold > 1) {
    throw new Error('--threshold must be a number in the interval (0, 1]');
  }

  const inputPath = path.resolve(inputValue);
  const outputRoot = path.resolve(values.out);
  const privateOutputRoot = path.resolve(values['private-out']);
  const inputText = await fs.readFile(inputPath, 'utf8');
  const run = mineDataset(inputText, {
    inputName: inputPath,
    clusterThreshold,
  });
  const runDirectory = path.join(outputRoot, run.runId);
  const privateRunDirectory = path.join(privateOutputRoot, run.runId);

  await Promise.all([
    fs.mkdir(path.join(runDirectory, 'dedupe'), { recursive: true }),
    fs.mkdir(path.join(runDirectory, 'clusters'), { recursive: true }),
    fs.mkdir(path.join(runDirectory, 'candidates'), { recursive: true }),
    fs.mkdir(privateRunDirectory, { recursive: true }),
  ]);

  const reportData = buildReportData(run);
  await Promise.all([
    writeJson(path.join(runDirectory, 'manifest.json'), run.manifest),
    writeJsonl(path.join(runDirectory, 'observations.jsonl'), run.observations),
    writeJsonl(path.join(privateRunDirectory, 'observations.private.jsonl'), run.observationsPrivate),
    writeJsonl(path.join(runDirectory, 'errors.jsonl'), run.errors),
    writeJson(path.join(runDirectory, 'dedupe', 'exact-groups.json'), run.exactGroups),
    writeJson(path.join(runDirectory, 'dedupe', 'structural-groups.json'), run.structuralGroups),
    writeJson(path.join(runDirectory, 'clusters', 'composition-code.json'), run.compositionClusters),
    writeJson(path.join(runDirectory, 'clusters', 'timeline-arrangements.json'), run.timelineArrangements),
    writeJson(path.join(runDirectory, 'candidates', 'review-candidates.json'), run.candidates),
    writeJson(path.join(runDirectory, 'index.preview.json'), run.previewIndex),
    writeJson(path.join(runDirectory, 'report.json'), reportData),
    fs.writeFile(path.join(runDirectory, 'report.md'), renderMarkdownReport(run), 'utf8'),
  ]);

  process.stdout.write([
    `Run: ${run.runId}`,
    `Observations: ${run.manifest.counts.observations}`,
    `Valid AST: ${run.manifest.counts.validSources}/${run.manifest.counts.observations}`,
    `Candidates: ${run.manifest.counts.candidates}`,
    `Timeline arrangements (diagnostic only): ${run.manifest.counts.timelineArrangements}`,
    `Public output: ${runDirectory}`,
    `Private output: ${privateRunDirectory}`,
    '',
  ].join('\n'));
  return { run, runDirectory, privateRunDirectory };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${stableStringify(value, 2)}\n`, 'utf8');
}

async function writeJsonl(filePath, values) {
  const body = values.map((value) => stableStringify(value)).join('\n');
  await fs.writeFile(filePath, body ? `${body}\n` : '', 'utf8');
}

function helpText() {
  return [
    'Usage: node src/cli.js --input <workspaces.jsonl> [options]',
    '',
    'Options:',
    '  -i, --input       Source JSONL dataset (required)',
    '  -o, --out         Public sanitized artifact root (default: runs)',
    '      --private-out Private raw artifact root (default: .private-runs)',
    '      --threshold   Complete-link code clustering threshold (default: 0.85)',
    '  -h, --help        Show this help',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
