import { buildRoundPlan, digestArtifact, writeExperimentArtifacts } from './artifacts.js';
import { evaluateAllSplits } from './evaluator.js';
import {
  createCandidateImplementationManifest,
  createFrozenEvaluatorManifest,
} from './manifest.js';
import { createWorkspaceSplit, parseWorkspaceDataset } from './split.js';
import { sha256, stableStringify } from '../lib.js';

export function runRoundZero(inputText) {
  const dataset = parseWorkspaceDataset(inputText);
  const split = createWorkspaceSplit(dataset);
  const evaluatorManifest = createFrozenEvaluatorManifest();
  const candidateImplementation = createCandidateImplementationManifest();
  const metricsA = {
    ...evaluateAllSplits(dataset, split),
    candidateImplementation,
  };
  const metricsB = {
    ...evaluateAllSplits(dataset, split),
    candidateImplementation,
  };
  const digestInputA = {
    evaluatorHash: evaluatorManifest.evaluatorHash,
    splitHash: split.manifest.splitHash,
    metrics: metricsA,
  };
  const digestInputB = {
    evaluatorHash: evaluatorManifest.evaluatorHash,
    splitHash: split.manifest.splitHash,
    metrics: metricsB,
  };
  const digestA = digestArtifact(digestInputA);
  const digestB = digestArtifact(digestInputB);
  const experimentId = sha256(stableStringify({
    inputSha256: dataset.inputSha256,
    evaluatorHash: evaluatorManifest.evaluatorHash,
    splitHash: split.manifest.splitHash,
  })).slice(0, 20);

  return {
    experiment: {
      schemaVersion: 1,
      experimentId,
      round: 0,
      inputSha256: dataset.inputSha256,
      evaluatorHash: evaluatorManifest.evaluatorHash,
      splitHash: split.manifest.splitHash,
      candidateImplementation,
      modelApiCalls: 0,
      publicArtifactsContainRawCompositionCode: false,
    },
    evaluatorManifest,
    splitManifest: split.manifest,
    roundPlan: buildRoundPlan(),
    metrics: metricsA,
    determinism: {
      schemaVersion: 1,
      runs: 2,
      digestA,
      digestB,
      byteIdentical: digestA === digestB,
    },
  };
}

export async function runAndWriteRoundZero(inputText, outputDirectory) {
  const roundZero = runRoundZero(inputText);
  const written = await writeExperimentArtifacts(outputDirectory, roundZero);
  return { roundZero, ...written };
}
