import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { KNOWN_GLOBALS } from '../normalize.js';
import { createRuntime } from '../../core/runtime.js';
import { ingestJsonl } from '../mine.js';
import { sha256, stableStringify } from '../lib.js';
import {
  BEHAVIOUR_CATALOG,
  UNIT_CATALOG,
  renderBehaviourModule,
  renderUnitModule,
} from './catalog.js';
import { compileComposition } from './compiler.js';
import {
  buildFinalEvaluation,
  buildGeneratedIndex,
  evaluateTwentyPasses,
  renderLazyIndex,
} from './evaluate.js';
import { verifyAllFrames } from './semantic-harness.js';

export const CBA_ALGORITHM_VERSION = 'cba-lossless-v0.3.1';

export async function runCbaPipeline(inputText, options) {
  const cycles = Number(options.cycles ?? 1);
  if (!Number.isInteger(cycles) || cycles < 1) throw new Error('cycles must be a positive integer');
  const ingested = ingestJsonl(inputText);
  if (ingested.errors.length > 0) {
    throw new Error(`Dataset ingestion failed with ${ingested.errors.length} errors`);
  }
  const runId = sha256(`${CBA_ALGORITHM_VERSION}\n${inputText}`).slice(0, 20);
  const publicRunDirectory = path.resolve(options.publicRoot, runId);
  const privateRunDirectory = path.resolve(options.privateRoot, runId);
  const repoRoot = path.resolve(options.repoRoot);
  const replayCycles = [];
  let records;
  let firstDigest;

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const current = compileDataset(ingested.observations, {
      publicRunDirectory,
      privateRunDirectory,
      repoRoot,
    });
    const digest = replayDigest(current);
    firstDigest ??= digest;
    replayCycles.push({ cycle, digest, matchesFirst: digest === firstDigest });
    records ??= current;
    options.onCycle?.({ cycle, cycles, digest, exact: current.filter(
      (record) => record.verification.semanticFrames.exact,
    ).length });
  }

  const index = buildGeneratedIndex(records);
  await writeFactories(publicRunDirectory, index);
  const factoryValidation = await validateGeneratedFactories(publicRunDirectory, index);
  await writeReconstructions(privateRunDirectory, records);
  const linkResults = await verifyGeneratedLinks(records);
  for (const [indexInRecords, result] of linkResults.entries()) {
    const record = records[indexInRecords];
    record.verification.generatedLink = result.linked;
    record.verification.generatedLinkError = result.error;
    record.verification.semanticExact = (
      record.compilation.verification.structuralTransformExact
      && record.verification.semanticFrames.exact
      && record.verification.semanticFrames.maximumOrphanBehaviours === 0
      && record.verification.semanticFrames.maximumPendingBehaviours === 0
      && record.verification.semanticFrames.fallbackBehaviours === 0
      && result.linked
    );
    // Pixel identity and extraction of closure-free mined recipes are separate
    // gates. Do not call semantic equivalence a production-ready 1:1 result.
    record.verification.oneToOne = false;
  }

  const rounds = evaluateTwentyPasses(records);
  const final = buildFinalEvaluation(records, replayCycles);
  final.semanticFrames = records.reduce((aggregate, record) => {
    const frames = record.verification.semanticFrames;
    aggregate.total += frames.totalFrames;
    aggregate.matched += frames.matchedFrames;
    aggregate.effectTraceMismatches += frames.effectTraceMismatches;
    aggregate.canvasTraceMismatches += frames.canvasTraceMismatches;
    aggregate.maximumOrphanBehaviours = Math.max(
      aggregate.maximumOrphanBehaviours,
      frames.maximumOrphanBehaviours,
    );
    aggregate.maximumPendingBehaviours = Math.max(
      aggregate.maximumPendingBehaviours,
      frames.maximumPendingBehaviours,
    );
    aggregate.fallbackBehaviours += frames.fallbackBehaviours;
    return aggregate;
  }, {
    total: 0,
    matched: 0,
    effectTraceMismatches: 0,
    canvasTraceMismatches: 0,
    maximumOrphanBehaviours: 0,
    maximumPendingBehaviours: 0,
    fallbackBehaviours: 0,
  });
  final.generatedModulesLinked = records.filter(
    (record) => record.verification.generatedLink,
  ).length;
  final.productionOneToOneCompositions = 0;
  final.residualExpressionClosures = records.reduce(
    (sum, record) => sum + record.compilation.inventory.behaviourSinks.length,
    0,
  );
  final.acceptedForAutomaticMemoryPromotion = false;
  final.generatedFactoryValidation = factoryValidation;
  final.rejectionReasons = [
    'Pixel-level Remotion comparison has not been executed.',
    'Visual formulas are still wired by private expression closures; shared closure-free mined recipes are not yet proven.',
  ];

  const manifest = {
    runId,
    algorithmVersion: CBA_ALGORITHM_VERSION,
    inputSha256: sha256(inputText),
    cycles,
    counts: {
      workspaces: ingested.stats.workspaces,
      workspacesWithCompositions: ingested.stats.workspacesWithCompositions,
      compositionTracks: ingested.stats.compositionTracks,
    },
    publicArtifactsContainRawCompositionSource: false,
    privateReconstructionRoot: path.relative(repoRoot, privateRunDirectory).replaceAll('\\', '/'),
  };

  await fs.mkdir(path.join(publicRunDirectory, 'evaluation'), { recursive: true });
  await Promise.all([
    writeJson(path.join(publicRunDirectory, 'manifest.json'), manifest),
    writeJson(path.join(publicRunDirectory, 'index.generated.json'), index),
    fs.writeFile(path.join(publicRunDirectory, 'index.generated.js'), renderLazyIndex(index), 'utf8'),
    writeJson(path.join(publicRunDirectory, 'evaluation', 'rounds.json'), rounds),
    writeJson(path.join(publicRunDirectory, 'evaluation', 'final.json'), final),
    fs.writeFile(
      path.join(publicRunDirectory, 'report.md'),
      renderReport({ manifest, index, rounds, final }),
      'utf8',
    ),
  ]);
  const privacy = await scanPublicArtifacts(publicRunDirectory);
  await writeJson(path.join(publicRunDirectory, 'evaluation', 'privacy.json'), privacy);
  if (privacy.rawUrls > 0) throw new Error('Public CBA output contains raw URLs');

  return {
    runId,
    publicRunDirectory,
    privateRunDirectory,
    manifest,
    index,
    rounds,
    final,
    privacy,
    records,
  };
}

function compileDataset(observations, paths) {
  return observations.map((observation, position) => {
    const reconstructionDirectory = path.join(
      paths.privateRunDirectory,
      'reconstructions',
      `composition-${String(position + 1).padStart(3, '0')}`,
    );
    const runtimeImport = relativeModule(
      reconstructionDirectory,
      path.join(paths.repoRoot, 'core', 'runtime.js'),
    );
    const factoryModules = {
      units: Object.fromEntries(Object.entries(UNIT_CATALOG).map(([id, definition]) => [
        id,
        relativeModule(reconstructionDirectory, path.join(paths.publicRunDirectory, definition.module)),
      ])),
      behaviours: Object.fromEntries(Object.entries(BEHAVIOUR_CATALOG).map(([id, definition]) => [
        id,
        relativeModule(reconstructionDirectory, path.join(paths.publicRunDirectory, definition.module)),
      ])),
    };
    const compilation = compileComposition(observation.private.source, {
      runtimeImport,
      factoryModules,
    });
    const semanticFrames = verifyAllFrames(compilation, {
      fps: observation.workspace.fps,
      width: observation.workspace.width,
      height: observation.workspace.height,
      lengthMs: observation.track.length,
    });
    return {
      position,
      workspaceIndex: observation.workspace.index,
      reconstructionDirectory,
      compilation,
      verification: {
        semanticFrames,
        generatedLink: false,
        semanticExact: false,
        oneToOne: false,
      },
    };
  });
}

async function writeFactories(runDirectory, index) {
  const writes = [];
  for (const entry of index.units) {
    const filePath = path.join(runDirectory, entry.module);
    writes.push(writeTextFile(filePath, renderUnitModule(entry.id, UNIT_CATALOG[entry.id])));
  }
  for (const entry of index.behaviours) {
    const filePath = path.join(runDirectory, entry.module);
    writes.push(writeTextFile(
      filePath,
      renderBehaviourModule(entry.id, BEHAVIOUR_CATALOG[entry.id]),
    ));
  }
  await Promise.all(writes);
}

async function validateGeneratedFactories(runDirectory, index) {
  let units = 0;
  let behaviours = 0;
  for (const entry of index.units) {
    const url = `${pathToFileURL(path.join(runDirectory, entry.module)).href}?factory=unit-${units}`;
    const module = await import(url);
    if (module.id !== entry.id || typeof module.create !== 'function') {
      throw new Error(`Invalid generated Unit module: ${entry.id}`);
    }
    const value = module.create(createRuntime(), { type: 'div', props: {}, children: [] });
    if (value?.kind !== 'unit') throw new Error(`Factory ${entry.id} did not create a Unit`);
    units += 1;
  }
  for (const entry of index.behaviours) {
    const url = `${pathToFileURL(path.join(runDirectory, entry.module)).href}?factory=behaviour-${behaviours}`;
    const module = await import(url);
    if (module.id !== entry.id || typeof module.create !== 'function') {
      throw new Error(`Invalid generated Behaviour module: ${entry.id}`);
    }
    const value = module.create(createRuntime(), {
      read: () => entry.channel === 'opacity' ? 1 : '',
      setup: () => undefined,
      descriptor: {},
    });
    if (value?.kind !== 'behaviour') {
      throw new Error(`Factory ${entry.id} did not create a Behaviour`);
    }
    behaviours += 1;
  }
  return { units, behaviours, valid: true };
}

async function writeReconstructions(privateRunDirectory, records) {
  await Promise.all(records.map(async (record) => {
    await fs.mkdir(record.reconstructionDirectory, { recursive: true });
    const programPath = path.join(record.reconstructionDirectory, 'program.js');
    record.programPath = programPath;
    await fs.writeFile(programPath, record.compilation.program, 'utf8');
    await writeJson(path.join(record.reconstructionDirectory, 'verification.json'), {
      sourceHash: record.compilation.sourceHash,
      structural: record.compilation.verification,
      semanticFrames: record.verification.semanticFrames,
      factories: record.compilation.factories,
    });
  }));
  await writeJson(path.join(privateRunDirectory, 'manifest.private.json'), {
    reconstructions: records.map((record) => ({
      position: record.position + 1,
      sourceHash: record.compilation.sourceHash,
      directory: path.relative(privateRunDirectory, record.reconstructionDirectory).replaceAll('\\', '/'),
    })),
  });
}

async function verifyGeneratedLinks(records) {
  const restore = installLinkGlobals();
  try {
    const results = [];
    for (const record of records) {
      try {
        const url = `${pathToFileURL(record.programPath).href}?link=${Date.now()}-${record.position}`;
        const module = await import(url);
        if (
          typeof module.createCompositionUnitTree !== 'function'
          || typeof module.GeneratedComposition !== 'function'
        ) throw new Error('Generated module exports are incomplete');
        results.push({ linked: true, error: null });
      } catch (error) {
        results.push({ linked: false, error: String(error.message ?? error) });
      }
    }
    return results;
  } finally {
    restore();
  }
}

function installLinkGlobals() {
  const previous = new Map();
  const set = (name, value) => {
    previous.set(name, Object.prototype.hasOwnProperty.call(globalThis, name)
      ? { exists: true, value: globalThis[name] }
      : { exists: false });
    globalThis[name] = value;
  };
  const universal = createUniversalStub('global');
  for (const name of KNOWN_GLOBALS) {
    if (!(name in globalThis)) set(name, createUniversalStub(name));
  }
  set('loadGoogleFont', () => ({ fontFamily: 'CBA Link Font', waitUntilDone: async () => {} }));
  set('GOOGLE_FONTS', new Proxy({}, { get: (_target, property) => String(property) }));
  set('React', new Proxy({
    createContext: () => ({ Provider: universal, Consumer: universal }),
    createRef: () => ({ current: null }),
  }, { get: (target, property) => target[property] ?? universal }));
  set('THREE', new Proxy({}, { get: () => createUniversalStub('THREE') }));
  return () => {
    for (const [name, state] of previous) {
      if (state.exists) globalThis[name] = state.value;
      else delete globalThis[name];
    }
  };
}

function createUniversalStub(name) {
  const callable = (...args) => ({ name, args });
  return new Proxy(callable, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) return () => 0;
      return createUniversalStub(`${name}.${String(property)}`);
    },
    construct(_target, args) { return { name, args }; },
  });
}

function replayDigest(records) {
  return sha256(stableStringify(records.map((record) => ({
    sourceHash: record.compilation.sourceHash,
    programHash: sha256(record.compilation.program),
    factories: record.compilation.factories,
    structural: record.compilation.verification,
    semanticFrames: record.verification.semanticFrames,
  }))));
}

async function scanPublicArtifacts(root) {
  const files = await walkFiles(root);
  let rawUrls = 0;
  let sourceMarkers = 0;
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    rawUrls += text.match(/https?:\/\//gi)?.length ?? 0;
    sourceMarkers += text.match(/GeneratedComposition\s*=|cdn\.cut3/gi)?.length ?? 0;
  }
  return { files: files.length, rawUrls, sourceMarkers };
}

async function walkFiles(root) {
  const output = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const nested = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walkFiles(nested));
    else output.push(nested);
  }
  return output;
}

function renderReport({ manifest, index, rounds, final }) {
  const lastRound = rounds.at(-1);
  return [
    '# CBA reconstruction evaluation',
    '',
    `Run: \`${manifest.runId}\``,
    '',
    '## Outcome',
    '',
    `- Exact reversible AST transforms: ${final.exactLoweredAstRoundTrips}/${final.compositions}.`,
    `- Exact semantic frame trees: ${final.semanticExactCompositions}/${final.compositions} compositions and ${final.semanticFrames.matched}/${final.semanticFrames.total} frames.`,
    `- Generated modules linked: ${final.generatedModulesLinked}/${final.compositions}.`,
    `- Unit occurrences folded into factories: ${final.units} → ${final.unitFactories}.`,
    `- Atomic Behaviour occurrences folded into factories: ${final.atomicBehaviours} → ${final.behaviourFactories}.`,
    `- Production 1:1 accepted: ${final.acceptedForAutomaticMemoryPromotion ? 'yes' : 'no'}.`,
    '',
    'The semantic result is deliberately not labelled pixel-exact. Formula closures remain private reconstruction wiring and are not promoted as reusable mined recipes.',
    '',
    '## 20 passes',
    '',
    '| # | Pass | Brick coverage | Structural complete | Semantic exact |',
    '|---:|---|---:|---:|---:|',
    ...rounds.map((round) => (
      `| ${round.number} | ${round.name} | ${(round.brickCoverage * 100).toFixed(2)}% | ${round.structurallyCompleteCompositions} | ${round.semanticExactCompositions} |`
    )),
    '',
    '## Generated library',
    '',
    `- ${index.units.length} executable Unit modules.`,
    `- ${index.behaviours.length} executable Behaviour modules.`,
    '- `index.generated.js` contains lazy dynamic imports; a reconstruction imports only factories it uses, so Three.js factories are not pulled into DOM-only compositions.',
    '- Raw URLs, user text and transcript/source code exist only under the private reconstruction root.',
    '',
    '## Remaining hard gates',
    '',
    ...final.rejectionReasons.map((reason) => `- ${reason}`),
    '',
  ].join('\n');
}

async function writeJson(filePath, value) {
  await writeTextFile(filePath, `${stableStringify(value, 2)}\n`);
}

async function writeTextFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, 'utf8');
}

function relativeModule(fromDirectory, target) {
  let value = path.relative(fromDirectory, target).replaceAll('\\', '/');
  if (!value.startsWith('.')) value = `./${value}`;
  return value;
}
