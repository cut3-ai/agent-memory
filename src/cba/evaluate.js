import { BEHAVIOUR_CATALOG, PASS_DEFINITIONS, UNIT_CATALOG } from './catalog.js';

export function evaluateTwentyPasses(records) {
  validateCatalogCoverage(records);
  const totals = aggregateTotals(records);
  const reuse = evaluateLeaveOneWorkspaceOut(records);

  return PASS_DEFINITIONS.map((definition) => {
    const unit = progressiveFactoryCoverage(records, UNIT_CATALOG, definition.number, 'units');
    const behaviour = progressiveFactoryCoverage(
      records,
      BEHAVIOUR_CATALOG,
      definition.number,
      'behaviours',
    );
    const controlsCovered = definition.number >= 11 ? totals.controls : 0;
    const structurallyComplete = records.filter((record) => compositionHasCapabilities(
      record,
      definition.number,
    )).length;
    const semanticExact = definition.number >= 20
      ? records.filter((record) => (
        compositionHasCapabilities(record, definition.number)
        && record.verification?.semanticFrames?.exact
        && record.verification?.generatedLink === true
      )).length
      : 0;

    return {
      ...definition,
      datasetRuns: records.length,
      parsedCompositions: records.length,
      units: unit,
      behaviours: behaviour,
      controls: {
        total: totals.controls,
        covered: controlsCovered,
        coverage: ratio(controlsCovered, totals.controls),
      },
      brickCoverage: ratio(
        unit.covered + behaviour.covered,
        unit.total + behaviour.total,
      ),
      structurallyCompleteCompositions: structurallyComplete,
      semanticExactCompositions: semanticExact,
      exactAstRoundTrips: definition.number >= 20
        ? records.filter((record) => record.compilation.verification.loweredEquivalent).length
        : 0,
      leaveOneWorkspaceOut: definition.number >= 19 ? reuse : null,
    };
  });
}

export function buildFinalEvaluation(records, replayCycles = []) {
  const totals = aggregateTotals(records);
  const reuse = evaluateLeaveOneWorkspaceOut(records);
  const backend = {};
  for (const record of records) {
    const backends = new Set(record.compilation.inventory.units.map((unit) => unit.backend));
    for (const name of backends) {
      backend[name] ??= { compositions: 0, semanticExact: 0, units: 0 };
      backend[name].compositions += 1;
      backend[name].units += record.compilation.inventory.units
        .filter((unit) => unit.backend === name).length;
      if (record.verification?.semanticExact === true) backend[name].semanticExact += 1;
    }
  }

  return {
    compositions: records.length,
    semanticExactCompositions: records.filter(
      (record) => record.verification?.semanticExact === true,
    ).length,
    exactPreLoweringRoundTrips: records.filter(
      (record) => record.compilation.verification.preLoweringEquivalent,
    ).length,
    exactLoweredAstRoundTrips: records.filter(
      (record) => record.compilation.verification.loweredEquivalent,
    ).length,
    generatedProgramsParsed: records.filter(
      (record) => record.compilation.verification.generatedParse,
    ).length,
    units: totals.units,
    visualSinks: totals.sinks,
    atomicBehaviours: totals.behaviours,
    controls: totals.controls,
    unitFactories: totals.unitFactories,
    behaviourFactories: totals.behaviourFactories,
    occurrenceToFactoryRatio: {
      units: ratio(totals.units, totals.unitFactories),
      behaviours: ratio(totals.behaviours, totals.behaviourFactories),
    },
    coreFactoryLeaveOneWorkspaceOut: reuse,
    minedRecipeLeaveOneWorkspaceOut: {
      eligibleRecipes: 0,
      coverage: 0,
      note: 'Core renderer primitives are excluded from mined-memory coverage.',
    },
    backend,
    deterministicReplay: {
      requestedCycles: replayCycles.length,
      matchingCycles: replayCycles.filter((cycle) => cycle.matchesFirst).length,
      cycles: replayCycles,
    },
    proofScope: {
      proven: 'Exact AST semantics, generated-module linking, strict factory execution and all-frame semantic tree/effect/canvas-trace equivalence.',
      notProven: 'Pixel identity in a browser/Remotion render and equivalence of external network assets.',
    },
  };
}

export function buildGeneratedIndex(records) {
  const unitUsage = usageByFactory(records, 'units');
  const behaviourUsage = usageByFactory(records, 'behaviours');
  return {
    units: Object.keys(unitUsage).sort().map((id) => ({
      id,
      module: UNIT_CATALOG[id].module,
      backend: UNIT_CATALOG[id].backend,
      description: UNIT_CATALOG[id].description,
      occurrences: unitUsage[id].occurrences,
      workspaces: unitUsage[id].workspaces.size,
    })),
    behaviours: Object.keys(behaviourUsage).sort().map((id) => ({
      id,
      module: BEHAVIOUR_CATALOG[id].module,
      channel: BEHAVIOUR_CATALOG[id].channel,
      description: BEHAVIOUR_CATALOG[id].description,
      occurrences: behaviourUsage[id].occurrences,
      workspaces: behaviourUsage[id].workspaces.size,
    })),
  };
}

export function renderLazyIndex(index) {
  const unitLines = index.units.map((entry) => (
    `  ${JSON.stringify(entry.id)}: () => import(${JSON.stringify(`./${entry.module}`)}),`
  ));
  const behaviourLines = index.behaviours.map((entry) => (
    `  ${JSON.stringify(entry.id)}: () => import(${JSON.stringify(`./${entry.module}`)}),`
  ));
  return [
    '// Navigation index only: every factory stays behind a dynamic import for tree-shaking.',
    'export const unitLoaders = Object.freeze({',
    ...unitLines,
    '});',
    '',
    'export const behaviourLoaders = Object.freeze({',
    ...behaviourLines,
    '});',
    '',
    'export async function loadFactory(id) {',
    '  const load = unitLoaders[id] ?? behaviourLoaders[id];',
    "  if (!load) throw new Error(`Unknown CBA factory: ${id}`);",
    '  return load();',
    '}',
    '',
  ].join('\n');
}

function progressiveFactoryCoverage(records, catalog, passNumber, kind) {
  let total = 0;
  let covered = 0;
  const newlyAvailableFactories = [];
  for (const [id, definition] of Object.entries(catalog)) {
    if (definition.pass === passNumber && factoryOccurrences(records, kind, id) > 0) {
      newlyAvailableFactories.push(id);
    }
  }
  for (const record of records) {
    const counts = record.compilation.factories[kind];
    for (const [id, occurrences] of Object.entries(counts)) {
      total += occurrences;
      if (catalog[id].pass <= passNumber) covered += occurrences;
    }
  }
  return {
    total,
    covered,
    coverage: ratio(covered, total),
    newlyAvailableFactories,
  };
}

function compositionHasCapabilities(record, passNumber) {
  return Object.keys(record.compilation.factories.units)
    .every((id) => UNIT_CATALOG[id].pass <= passNumber)
    && Object.keys(record.compilation.factories.behaviours)
      .every((id) => BEHAVIOUR_CATALOG[id].pass <= passNumber)
    && (record.compilation.inventory.controls === 0 || passNumber >= 11);
}

function aggregateTotals(records) {
  const unitIds = new Set();
  const behaviourIds = new Set();
  let units = 0;
  let sinks = 0;
  let behaviours = 0;
  let controls = 0;
  for (const { compilation } of records) {
    units += compilation.inventory.units.length;
    sinks += compilation.inventory.behaviourSinks.length;
    behaviours += Object.values(compilation.factories.behaviours)
      .reduce((sum, count) => sum + count, 0);
    controls += compilation.inventory.controls;
    Object.keys(compilation.factories.units).forEach((id) => unitIds.add(id));
    Object.keys(compilation.factories.behaviours).forEach((id) => behaviourIds.add(id));
  }
  return {
    units,
    sinks,
    behaviours,
    controls,
    unitFactories: unitIds.size,
    behaviourFactories: behaviourIds.size,
  };
}

function evaluateLeaveOneWorkspaceOut(records) {
  const units = leaveOneOutForKind(records, 'units');
  const behaviours = leaveOneOutForKind(records, 'behaviours');
  return { units, behaviours };
}

function leaveOneOutForKind(records, kind) {
  const usage = usageByFactory(records, kind);
  let total = 0;
  let reusable = 0;
  for (const value of Object.values(usage)) {
    total += value.occurrences;
    if (value.workspaces.size > 1) reusable += value.occurrences;
  }
  return { total, reusable, coverage: ratio(reusable, total) };
}

function usageByFactory(records, kind) {
  const usage = {};
  for (const record of records) {
    for (const [id, occurrences] of Object.entries(record.compilation.factories[kind])) {
      usage[id] ??= { occurrences: 0, workspaces: new Set() };
      usage[id].occurrences += occurrences;
      usage[id].workspaces.add(record.workspaceIndex);
    }
  }
  return usage;
}

function factoryOccurrences(records, kind, id) {
  return records.reduce(
    (sum, record) => sum + (record.compilation.factories[kind][id] ?? 0),
    0,
  );
}

function validateCatalogCoverage(records) {
  for (const record of records) {
    for (const id of Object.keys(record.compilation.factories.units)) {
      if (!UNIT_CATALOG[id]) throw new Error(`Unit factory is absent from catalog: ${id}`);
    }
    for (const id of Object.keys(record.compilation.factories.behaviours)) {
      if (!BEHAVIOUR_CATALOG[id]) throw new Error(`Behaviour factory is absent from catalog: ${id}`);
    }
  }
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(6));
}
