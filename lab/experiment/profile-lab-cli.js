import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultCut3EnvFile } from '../../src/providers/env.js';
import {
  normalizeProfileLabAttemptId,
  runCbaProfileLab,
} from './profile-lab.js';

export async function runProfileLabCli(argv = process.argv.slice(2), io = {}) {
  const options = parseProfileLabArgs(argv);
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const input = await fs.readFile(path.resolve(options.input), 'utf8');
  const result = await runCbaProfileLab(input, {
    repositoryRoot,
    outputRoot: options.outputRoot,
    envFilePath: options.envFilePath ?? defaultCut3EnvFile(repositoryRoot),
    confirmPaidCalls: options.confirmPaidCalls,
    attemptId: options.attemptId,
  });
  const stdout = io.stdout ?? process.stdout;
  stdout.write(`${JSON.stringify({
    experimentId: result.experimentId,
    selectedProfileId: result.manifest.selectedProfileId,
    roundsCompleted: result.manifest.roundsCompleted,
    full: result.finalMetrics.full,
  })}\n`);
  return result;
}

export function parseProfileLabArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (![
      '--input',
      '--output',
      '--env',
      '--repository',
      '--confirm-paid-calls',
      '--attempt-id',
    ].includes(flag) || !value) {
      throw new Error('Usage: profile-lab --input workspaces.jsonl [--output directory] [--env file] [--attempt-id safe-id] [--confirm-paid-calls literal]');
    }
    index += 1;
    if (flag === '--input') options.input = value;
    else if (flag === '--output') options.outputRoot = path.resolve(value);
    else if (flag === '--env') options.envFilePath = path.resolve(value);
    else if (flag === '--repository') options.repositoryRoot = path.resolve(value);
    else if (flag === '--confirm-paid-calls') options.confirmPaidCalls = value;
    else options.attemptId = normalizeProfileLabAttemptId(value);
  }
  if (!options.input) throw new Error('Missing --input');
  return options;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runProfileLabCli().catch((error) => {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
