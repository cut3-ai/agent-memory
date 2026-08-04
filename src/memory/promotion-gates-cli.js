import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateAndIssuePromotionGates,
  loadPromotionGateCapabilitiesFile,
} from './promotion-gates.js';

/**
 * Evaluate a staged class and emit one public, hash-only bundle containing the
 * five final signed gate receipts. Raw candidate and dataset bytes are inputs
 * only and are never copied into stdout or the output artifact.
 */
export async function main(argv = process.argv.slice(2), io = {}) {
  const options = parseArguments(argv);
  const readFile = io.readFile ?? fs.readFile;
  const writeFile = io.writeFile ?? fs.writeFile;
  const writeStdout = io.writeStdout ?? ((value) => process.stdout.write(value));
  const staged = JSON.parse(await readFile(options.input, 'utf8'));
  const candidate = staged?.candidate ?? staged;
  const evidence = await loadEvidence(options, readFile);
  const capabilities = await loadPromotionGateCapabilitiesFile(options.envFile, {
    cwd: options.repositoryRoot,
  });
  const result = await evaluateAndIssuePromotionGates({ candidate, evidence }, {
    repositoryRoot: options.repositoryRoot,
    promotionLedgerFile: options.promotionLedgerFile,
    ...capabilities,
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) await writeFile(options.output, serialized, 'utf8');
  writeStdout(serialized);
  return result;
}

async function loadEvidence(options, readFile) {
  if (options.dataset) {
    return { datasetText: await readFile(options.dataset, 'utf8') };
  }
  if (options.bundle) {
    return {
      reconstructionBundle: JSON.parse(await readFile(options.bundle, 'utf8')),
      attestations: JSON.parse(await readFile(options.attestations, 'utf8')),
    };
  }
  return undefined;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${name}`);
    }
    const key = name.slice(2);
    if (values.has(key)) throw new Error(`Duplicate argument: ${name}`);
    values.set(key, value);
    index += 1;
  }
  if (!values.has('input')) throw new Error('--input is required');
  if (!values.has('env')) throw new Error('--env is required');
  const allowed = new Set([
    'input', 'repo', 'env', 'ledger', 'dataset', 'bundle', 'attestations', 'out',
  ]);
  const unsupported = [...values.keys()].find((name) => !allowed.has(name));
  if (unsupported) throw new Error(`Unsupported argument: --${unsupported}`);
  const externalCount = Number(values.has('bundle')) + Number(values.has('attestations'));
  if (externalCount === 1) throw new Error('--bundle and --attestations must be supplied together');
  if (values.has('dataset') && externalCount > 0) {
    throw new Error('--dataset cannot be combined with attested evidence');
  }
  const repositoryRoot = path.resolve(values.get('repo') ?? process.cwd());
  return {
    input: path.resolve(values.get('input')),
    repositoryRoot,
    envFile: path.resolve(values.get('env')),
    promotionLedgerFile: values.has('ledger') ? path.resolve(values.get('ledger')) : undefined,
    dataset: values.has('dataset') ? path.resolve(values.get('dataset')) : undefined,
    bundle: values.has('bundle') ? path.resolve(values.get('bundle')) : undefined,
    attestations: values.has('attestations')
      ? path.resolve(values.get('attestations'))
      : undefined,
    output: values.has('out') ? path.resolve(values.get('out')) : undefined,
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
