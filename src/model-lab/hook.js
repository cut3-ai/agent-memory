import { runModelAdvisoryLab } from './loop.js';

export function createModelLabHook(dependencies = {}) {
  const fixed = Object.freeze({
    kimi: dependencies.kimi,
    anthropic: dependencies.anthropic,
    evaluateCandidate: dependencies.evaluateCandidate,
    acceptCandidate: dependencies.acceptCandidate,
    onRound: dependencies.onRound,
  });
  return Object.freeze({
    run(input = {}) {
      return runModelAdvisoryLab({ ...input, ...fixed });
    },
  });
}
