import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadPromotionGateVerifierFile,
  PromotionGateConfigurationError,
} from './gate-receipts.js';
import { orchestrateMemoryPromotion } from './promotion.js';

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.materialize && !options.gateEnvFile) {
    throw new PromotionGateConfigurationError('materialization-requires-gate-env');
  }
  const gateVerifier = options.gateEnvFile
    ? await loadPromotionGateVerifierFile(options.gateEnvFile, { cwd: options.repositoryRoot })
    : null;
  const input = JSON.parse(await fs.readFile(options.input, 'utf8'));
  const result = await orchestrateMemoryPromotion(input, { ...options, gateVerifier });
  process.stdout.write(`${JSON.stringify({
    candidateSha256: result.candidate.candidateSha256,
    feedbackReceiptSha256: result.feedbackReceipt?.receiptSha256 ?? null,
    decisionSha256: result.decision.decisionSha256,
    action: result.decision.action,
    reasons: result.decision.reasons,
    ledgerChanged: result.ledgerChanged,
    nextLedgerSha256: result.nextLedgerSha256,
    materialized: result.materialized,
    gateAuthorityConfigured: gateVerifier !== null,
  })}\n`);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${name}`);
    values.set(name.slice(2), value);
  }
  if (!values.has('input')) throw new Error('--input is required');
  const repositoryRoot = path.resolve(values.get('repo') ?? process.cwd());
  return {
    input: path.resolve(values.get('input')),
    repositoryRoot,
    ledgerFile: values.has('ledger') ? path.resolve(values.get('ledger')) : undefined,
    materialize: values.get('materialize') === 'true',
    gateEnvFile: values.has('env') ? path.resolve(values.get('env')) : undefined,
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
