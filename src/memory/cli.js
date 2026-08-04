import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMemoryPipeline } from './pipeline.js';

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputText = await fs.readFile(options.input, 'utf8');
  const result = await runMemoryPipeline(inputText, options);
  process.stdout.write(`${JSON.stringify(summarizeMemoryRun(result))}\n`);
}

export function summarizeMemoryRun(result) {
  return {
    runId: result.runId,
    runDirectory: result.runDirectory,
    indexSha256: result.index.indexSha256,
    modulesValid: result.moduleValidation.valid,
    compositions: result.manifest.counts.compositions,
    renderBoundaries: result.manifest.counts.renderBoundaries,
    visualWrites: result.manifest.counts.visualWrites,
    rounds: result.manifest.counts.rounds,
    indexedUnits: result.manifest.counts.indexedUnits,
    indexedBehaviours: result.manifest.counts.indexedBehaviours,
    reconstructionProven: result.manifest.reconstructionProven,
    automaticPromotionAllowed: result.manifest.automaticPromotionAllowed,
  };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    values.set(name.slice(2), value);
    index += 1;
  }
  if (!values.has('input')) throw new Error('--input is required');
  const repositoryRoot = path.resolve(values.get('repo') ?? process.cwd());
  return {
    input: path.resolve(values.get('input')),
    repositoryRoot,
    outputRoot: path.resolve(values.get('out') ?? path.join(repositoryRoot, 'memory-runs')),
  };
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
