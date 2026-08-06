import { runModelAdvisoryLab } from './loop.js';
import { prepareModelLabRun, runLiveModelAdvisoryLab } from './live.js';

export async function runModelLabCli(options, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  if (!stdout || typeof stdout.write !== 'function') {
    throw new TypeError('CLI stdout must expose write');
  }
  const result = await runModelAdvisoryLab(options);
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

export async function runModelLabDryRunCli(options, io = {}) {
  return writePublicResult(prepareModelLabRun(options), io);
}

export async function runLiveModelLabCli(options, io = {}) {
  const result = await runLiveModelAdvisoryLab(options);
  return writePublicResult(result, io);
}

function writePublicResult(result, io) {
  const stdout = io.stdout ?? process.stdout;
  if (!stdout || typeof stdout.write !== 'function') {
    throw new TypeError('CLI stdout must expose write');
  }
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}
