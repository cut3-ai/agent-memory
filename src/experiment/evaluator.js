import { compileComposition } from '../cba/compiler.js';
import { verifyAllFrames } from '../cba/semantic-harness.js';
import { sha256 } from '../lib.js';

export function evaluateAllSplits(dataset, split) {
  return {
    schemaVersion: 1,
    proofLevel: 'compiler-structural-and-all-frame-semantic',
    oneToOneVerified: false,
    oneToOneBlockers: [
      'generated modules are not linked or executed by the round-0 evaluator',
      'pixel equivalence is not measured by the round-0 evaluator',
      'visual formulas still use residual private expression closures',
      'closure-free mined recipes are not available',
    ],
    splits: Object.fromEntries(['train', 'validation', 'heldout'].map((name) => [
      name,
      evaluateSplit(dataset, split, name),
    ])),
  };
}

export function evaluateSplit(dataset, split, splitName) {
  const workspaces = dataset.workspaces.filter(
    (workspace) => split.assignmentByWorkspaceKey.get(workspace.workspaceKey) === splitName,
  );
  const totals = emptyTotals(workspaces.length);
  const compositionResults = [];

  for (const workspace of workspaces) {
    for (const composition of workspace.compositions) {
      totals.compositions += 1;
      totals.potentialFrames += Math.max(
        1,
        Math.ceil(composition.lengthMs / 1000 * workspace.fps),
      );
      const compositionKey = `composition-${sha256([
        workspace.workspaceKey,
        composition.compositionIndex,
        composition.sourceHash,
      ].join(':')).slice(0, 20)}`;
      try {
        const compilation = compileComposition(composition.source);
        const verification = compilation.verification;
        totals.compiled += 1;
        totals.residualExpressionClosures += compilation.inventory.behaviourSinks.length;
        addBoolean(totals.verification, 'preLoweringEquivalent', verification.preLoweringEquivalent);
        addBoolean(totals.verification, 'loweredEquivalent', verification.loweredEquivalent);
        addBoolean(totals.verification, 'generatedParse', verification.generatedParse);
        addBoolean(totals.verification, 'structuralTransformExact', verification.structuralTransformExact);
        totals.inventory.jsxUnitsExpected += verification.jsxUnits.expected;
        totals.inventory.jsxUnitsEmitted += verification.jsxUnits.emitted;
        totals.inventory.visualSinksExpected += verification.visualSinks.expected;
        totals.inventory.visualSinksEmitted += verification.visualSinks.emitted;
        totals.inventory.atomicBehaviours += verification.visualSinks.atomicBehaviours;
        totals.inventory.controlsExpected += verification.controls.expected;
        if (verification.controls.preservedByAstRoundTrip) {
          totals.inventory.controlsPreserved += verification.controls.expected;
        }
        mergeCounts(totals.factories.units, compilation.factories.units);
        mergeCounts(totals.factories.behaviours, compilation.factories.behaviours);
        for (const unit of compilation.inventory.units) {
          totals.backends[unit.backend] = (totals.backends[unit.backend] ?? 0) + 1;
        }
        const result = {
          compositionKey,
          compiled: true,
          structuralTransformExact: verification.structuralTransformExact,
          jsxUnits: verification.jsxUnits,
          visualSinks: verification.visualSinks,
          controls: verification.controls.expected,
        };
        try {
          const semantic = verifyAllFrames(compilation, {
            fps: workspace.fps,
            width: workspace.width,
            height: workspace.height,
            lengthMs: composition.lengthMs,
          });
          totals.semantic.evaluatedCompositions += 1;
          totals.semantic.evaluatedFrames += semantic.totalFrames;
          totals.semantic.matchedFrames += semantic.matchedFrames;
          totals.semantic.baselineRenderErrors += semantic.baselineRenderErrors;
          totals.semantic.generatedRenderErrors += semantic.generatedRenderErrors;
          totals.semantic.renderErrors += (
            semantic.baselineRenderErrors + semantic.generatedRenderErrors
          );
          totals.semantic.effectTraceMismatches += semantic.effectTraceMismatches;
          totals.semantic.canvasTraceMismatches += semantic.canvasTraceMismatches;
          totals.semantic.maximumOrphanBehaviours = Math.max(
            totals.semantic.maximumOrphanBehaviours,
            semantic.maximumOrphanBehaviours,
          );
          totals.semantic.maximumPendingBehaviours = Math.max(
            totals.semantic.maximumPendingBehaviours,
            semantic.maximumPendingBehaviours,
          );
          totals.semantic.fallbackBehaviours += semantic.fallbackBehaviours;
          if (semantic.exact) totals.semantic.exactCompositions += 1;
          if (semantic.maximumOrphanBehaviours > 0) {
            totals.semantic.compositionsWithOrphanBehaviours += 1;
          }
          if (semantic.maximumPendingBehaviours > 0) {
            totals.semantic.compositionsWithPendingBehaviours += 1;
          }
          if (semantic.fallbackBehaviours > 0) {
            totals.semantic.compositionsWithFallbackBehaviours += 1;
          }
          const hasRenderErrors = (
            semantic.baselineRenderErrors > 0 || semantic.generatedRenderErrors > 0
          );
          if (hasRenderErrors) totals.semantic.compositionsWithRenderErrors += 1;
          result.semantic = {
            exact: semantic.exact,
            totalFrames: semantic.totalFrames,
            matchedFrames: semantic.matchedFrames,
            baselineRenderErrors: semantic.baselineRenderErrors,
            generatedRenderErrors: semantic.generatedRenderErrors,
            effectTraceMismatches: semantic.effectTraceMismatches,
            canvasTraceMismatches: semantic.canvasTraceMismatches,
            maximumOrphanBehaviours: semantic.maximumOrphanBehaviours,
            maximumPendingBehaviours: semantic.maximumPendingBehaviours,
            fallbackBehaviours: semantic.fallbackBehaviours,
            firstMismatch: sanitizedFirstMismatch(semantic.firstMismatch),
            ...(hasRenderErrors ? {
              failureCode: sanitizedSemanticFailureCode(semantic.firstMismatch),
            } : {}),
          };
        } catch (error) {
          totals.semantic.evaluatorFailures += 1;
          totals.semantic.compositionsWithRenderErrors += 1;
          result.semantic = {
            exact: false,
            failureCode: sanitizedRenderFailureCode(error),
          };
        }
        compositionResults.push(result);
      } catch {
        totals.compileFailures += 1;
        compositionResults.push({
          compositionKey,
          compiled: false,
          failureCode: 'compile-failure',
        });
      }
    }
  }

  totals.factories.unitKinds = Object.keys(totals.factories.units).length;
  totals.factories.behaviourKinds = Object.keys(totals.factories.behaviours).length;
  totals.rates = {
    compile: ratio(totals.compiled, totals.compositions),
    structuralExact: ratio(
      totals.verification.structuralTransformExact,
      totals.compositions,
    ),
    jsxUnitAccounting: ratio(
      totals.inventory.jsxUnitsEmitted,
      totals.inventory.jsxUnitsExpected,
    ),
    visualSinkAccounting: ratio(
      totals.inventory.visualSinksEmitted,
      totals.inventory.visualSinksExpected,
    ),
    semanticExactCompositions: ratio(
      totals.semantic.exactCompositions,
      totals.compositions,
    ),
    semanticMatchedFrames: ratio(
      totals.semantic.matchedFrames,
      totals.potentialFrames,
    ),
  };
  totals.semantic.totalFrames = totals.potentialFrames;
  totals.minedRecipes = {
    eligibleRecipes: 0,
    coveredExpressionClosures: 0,
    residualExpressionClosures: totals.residualExpressionClosures,
    coverage: 0,
    reason: 'round-0 has no closure-free mined recipe implementation',
  };
  totals.runtime = {
    generatedModulesLinked: false,
    factoryResolutionMeasured: false,
    framesExecuted: totals.semantic.evaluatedFrames,
    potentialFrames: totals.potentialFrames,
    pixelFramesCompared: 0,
  };
  delete totals.potentialFrames;
  compositionResults.sort((left, right) => left.compositionKey.localeCompare(right.compositionKey));
  return { ...totals, compositionResults };
}

function emptyTotals(workspaces) {
  return {
    workspaces,
    compositions: 0,
    compiled: 0,
    compileFailures: 0,
    potentialFrames: 0,
    verification: {
      preLoweringEquivalent: 0,
      loweredEquivalent: 0,
      generatedParse: 0,
      structuralTransformExact: 0,
    },
    inventory: {
      jsxUnitsExpected: 0,
      jsxUnitsEmitted: 0,
      visualSinksExpected: 0,
      visualSinksEmitted: 0,
      atomicBehaviours: 0,
      controlsExpected: 0,
      controlsPreserved: 0,
    },
    factories: {
      units: {},
      behaviours: {},
      unitKinds: 0,
      behaviourKinds: 0,
    },
    backends: {},
    residualExpressionClosures: 0,
    semantic: {
      evaluatedCompositions: 0,
      exactCompositions: 0,
      renderErrors: 0,
      baselineRenderErrors: 0,
      generatedRenderErrors: 0,
      evaluatorFailures: 0,
      compositionsWithRenderErrors: 0,
      evaluatedFrames: 0,
      matchedFrames: 0,
      effectTraceMismatches: 0,
      canvasTraceMismatches: 0,
      maximumOrphanBehaviours: 0,
      maximumPendingBehaviours: 0,
      fallbackBehaviours: 0,
      compositionsWithOrphanBehaviours: 0,
      compositionsWithPendingBehaviours: 0,
      compositionsWithFallbackBehaviours: 0,
    },
  };
}

function addBoolean(target, key, value) {
  if (value === true) target[key] += 1;
}

function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(6));
}

function sanitizedRenderFailureCode(error) {
  const name = String(error?.name ?? '');
  const message = String(error?.message ?? '');
  if (name === 'SyntaxError') return 'semantic-render-syntax-error';
  if (/timed?\s*out|timeout/i.test(message)) return 'semantic-render-timeout';
  if (/factory/i.test(message)) return 'semantic-render-factory-error';
  if (/hook/i.test(message)) return 'semantic-render-hook-error';
  return 'semantic-render-error';
}

function sanitizedSemanticFailureCode(firstMismatch) {
  if (/SyntaxError/.test(firstMismatch?.evaluatorError ?? '')) {
    return 'semantic-render-syntax-error';
  }
  return 'semantic-render-error';
}

function sanitizedFirstMismatch(firstMismatch) {
  if (!firstMismatch) return null;
  return {
    frame: Number.isSafeInteger(firstMismatch.frame) && firstMismatch.frame >= 0
      ? firstMismatch.frame
      : 0,
    treeMatches: firstMismatch.treeMatches === true,
    effectsMatch: firstMismatch.effectsMatch === true,
    canvasMatches: firstMismatch.canvasMatches === true,
    ...(firstMismatch.baselineError ? {
      baselineError: sanitizedErrorName(firstMismatch.baselineError),
    } : {}),
    ...(firstMismatch.generatedError ? {
      generatedError: sanitizedErrorName(firstMismatch.generatedError),
    } : {}),
    ...(firstMismatch.evaluatorError ? {
      evaluatorError: sanitizedEvaluatorError(firstMismatch.evaluatorError),
    } : {}),
  };
}

function sanitizedEvaluatorError(value) {
  const [phase, name] = String(value).split(':', 2);
  const safePhase = phase === 'evaluator-setup' ? phase : 'evaluator';
  return `${safePhase}:${sanitizedErrorName(name)}`;
}

function sanitizedErrorName(value) {
  const name = String(value);
  return [
    'Error',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'RenderError',
    'SyntaxError',
    'TimeoutError',
    'TypeError',
    'URIError',
  ].includes(name) ? name : 'RenderError';
}
