import assert from 'node:assert/strict';
import test from 'node:test';

import { mineDataset } from '../legacy/mine.js';

function workspace(tracks) {
  return JSON.stringify({ width: 1080, height: 1920, fps: 60, length: 30_000, tracks });
}

function composition(id, source, start = 0, length = 1000, prompt = '') {
  return { id, type: 'composition', start, length, source, meta: { prompt } };
}

function dialogueSource({
  text = 'line one',
  asset = 'https://assets.example/a.jpg',
  background = '#111827',
  fontFamily = 'Inter',
  animated = false,
} = {}) {
  const animation = animated
    ? 'const frame=useCurrentFrame();const opacity=interpolate(frame,[0,12],[0,1]);'
    : '';
  const opacity = animated ? ',opacity' : '';
  return `const dialogue=${JSON.stringify(text)};const GeneratedComposition=()=>{${animation}return <AbsoluteFill><div style={{position:"absolute",bottom:48,left:48,background:${JSON.stringify(background)},borderRadius:24,boxShadow:"0 18px 50px rgba(0,0,0,.45)",padding:28,color:"#f8fafc"${opacity}}}><Img src=${JSON.stringify(asset)} style={{width:72,height:72,borderRadius:36,objectFit:"cover"}}/><span style={{fontFamily:${JSON.stringify(fontFamily)},fontSize:48,fontWeight:700,lineHeight:1.1}}>{dialogue}</span></div></AbsoluteFill>}`;
}

test('builds one evidence-ready style motif from independent workspaces', () => {
  const input = [
    workspace([
      { id: 'video', type: 'video', start: 0, length: 1000, source: 'ignored' },
      composition('a', dialogueSource({
        text: 'PRIVATE TRANSCRIPT A',
        asset: 'https://private.example/a.jpg',
      }), 0, 1000, 'secret user prompt'),
    ]),
    workspace([composition('b', dialogueSource({
      text: 'PRIVATE TRANSCRIPT B',
      asset: 'https://private.example/b.jpg',
    }))]),
  ].join('\n');
  const run = mineDataset(input);

  assert.equal(run.manifest.counts.observations, 2);
  assert.equal(run.manifest.counts.connectedMotifOccurrences, 2);
  assert.equal(run.candidates.length, 1);
  const [candidate] = run.candidates;
  assert.match(candidate.id, /^unit\.dialogue-card\.[a-f0-9]{12}$/u);
  assert.equal(candidate.detectorId, 'motif.dialogue-card');
  assert.equal(candidate.kind, 'unit');
  assert.equal(candidate.state, 'evidence-ready');
  assert.equal(candidate.eligibility.evidenceReady, true);
  assert.equal(candidate.eligibility.promotionEligible, false);
  assert.equal(candidate.trusted, false);
  assert.equal(candidate.feedback, 'unknown');
  assert.equal(candidate.evidence.observations, 2);
  assert.equal(candidate.evidence.uniqueSources, 2);
  assert.equal(candidate.evidence.workspaces, 2);
  assert.equal(candidate.evidence.independentOccurrences, 2);
  assert.equal(candidate.extraction.state, 'connected-subtree-located');
  assert.equal(candidate.extraction.connectedBoundaries, true);
  assert.ok(candidate.eligibility.blockers.includes('human-feedback-not-provided'));

  const serializedPublic = JSON.stringify({
    manifest: run.manifest,
    observations: run.observations,
    candidates: run.candidates,
    previewIndex: run.previewIndex,
  });
  assert.doesNotMatch(serializedPublic, /PRIVATE TRANSCRIPT|private\.example|secret user prompt/u);
  assert.match(JSON.stringify(run.observationsPrivate), /PRIVATE TRANSCRIPT/u);
});

test('same bytes and config produce deterministic artifacts', () => {
  const input = workspace([composition('a', dialogueSource())]);
  const first = mineDataset(input, { inputName: 'one.jsonl', clusterThreshold: 0.82 });
  const second = mineDataset(input, { inputName: 'renamed.jsonl', clusterThreshold: 0.82 });

  assert.deepEqual(first, second);
  assert.match(first.runId, /^[a-f0-9]{20}$/u);
  assert.match(first.manifest.algorithmDigest, /^[a-f0-9]{20}$/u);
});

test('composition source is parsed but never executed', () => {
  delete globalThis.__memoryMinerExecuted;
  const source = 'globalThis.__memoryMinerExecuted=true; const GeneratedComposition=()=> <div/>;';
  mineDataset(workspace([composition('x', source)]));
  assert.equal(globalThis.__memoryMinerExecuted, undefined);
});

test('quarantines malformed rows without leaking their text', () => {
  const valid = workspace([composition('ok', 'const GeneratedComposition=()=> <div/>;')]);
  const invalidTimeline = JSON.stringify({
    width: 0,
    height: 1920,
    fps: 60,
    length: 1000,
    tracks: [composition('bad', 'const GeneratedComposition=()=> <div/>;')],
  });
  const run = mineDataset(`null\nsecret user transcript\n${invalidTimeline}\n${valid}`);

  assert.equal(run.manifest.counts.observations, 1);
  assert.deepEqual(run.errors.map((error) => error.code), [
    'workspace-not-object',
    'invalid-json',
    'invalid-workspace-timeline',
  ]);
  assert.doesNotMatch(JSON.stringify(run.errors), /secret|transcript/u);
});

test('cardinality changes evidence but not motif identity', () => {
  const createRun = (count) => mineDataset(workspace(Array.from({ length: count }, (_, index) => (
    composition(
      `dialogue-${index}`,
      dialogueSource({ text: `line-${index}`, asset: `https://assets.example/${index}.jpg` }),
      index * 500,
      500,
    )
  ))));
  const two = createRun(2);
  const five = createRun(5);

  assert.equal(two.candidates.length, 1);
  assert.equal(five.candidates.length, 1);
  assert.equal(two.candidates[0].id, five.candidates[0].id);
  assert.equal(two.candidates[0].evidence.observations, 2);
  assert.equal(five.candidates[0].evidence.observations, 5);
  assert.equal(five.candidates.some((candidate) => candidate.kind === 'recipe'), false);
});

test('different palettes or typography remain different memory candidates', () => {
  const input = workspace([
    composition('dark', dialogueSource({ background: '#111827', fontFamily: 'Inter' })),
    composition('red', dialogueSource({ background: '#7f1d1d', fontFamily: 'Inter' }), 1000),
    composition('serif', dialogueSource({ background: '#111827', fontFamily: 'Georgia' }), 2000),
  ]);
  const run = mineDataset(input);

  assert.equal(run.candidates.length, 3);
  assert.equal(new Set(run.candidates.map(
    (candidate) => candidate.identity.styleFingerprintSha256,
  )).size, 3);
});

test('reuses a stylistic Behaviour law across independent workspaces', () => {
  const pulseSource = (copy) => `const copy=${JSON.stringify(copy)};const GeneratedComposition=()=>{const frame=useCurrentFrame();const pulse=.72+.28*Math.sin(frame/6);return <div data-copy={copy} style={{opacity:pulse}}/>}`;
  const run = mineDataset([
    workspace([composition('pulse-a', pulseSource('PRIVATE A'))]),
    workspace([composition('pulse-b', pulseSource('PRIVATE B'))]),
  ].join('\n'));
  const behaviours = run.candidates.filter((candidate) => candidate.kind === 'behaviour');

  assert.equal(behaviours.length, 1);
  const [candidate] = behaviours;
  assert.match(candidate.id, /^behaviour\.oscillatory-law\.[a-f0-9]{12}$/u);
  assert.equal(candidate.identity.basis, 'single-stylistic-channel-law');
  assert.equal(candidate.identity.channel, 'opacity');
  assert.match(candidate.identity.temporalFingerprintSha256, /^[a-f0-9]{64}$/u);
  assert.equal(candidate.eligibility.evidenceReady, true);
  assert.equal(candidate.eligibility.promotionEligible, false);
  assert.deepEqual(candidate.evidence.atomicChannels, ['opacity']);
  assert.equal(run.manifest.counts.stylisticBehaviourOccurrences, 2);
});

test('the same oscillatory law on opacity and scale produces separate Behaviours', () => {
  const source = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();const pulse=.72+.28*Math.sin(frame/6);return <><div style={{opacity:pulse}}/><div style={{transform:`scale(${pulse})`}}/></>}';
  const run = mineDataset(workspace([composition('two-channels', source)]));
  const behaviours = run.candidates.filter((candidate) => candidate.kind === 'behaviour');

  assert.equal(behaviours.length, 2);
  assert.deepEqual(behaviours.map((candidate) => candidate.identity.channel).sort(), [
    'opacity',
    'transform.scale',
  ]);
  assert.equal(new Set(behaviours.map((candidate) => candidate.id)).size, 2);
  assert.ok(behaviours.every(
    (candidate) => candidate.atomicity.boundary === 'single-stylistic-channel',
  ));
});

test('many copies in one workspace remain inventory with explicit blockers', () => {
  const tracks = Array.from({ length: 12 }, (_, index) => composition(
    `dialogue-${index}`,
    dialogueSource({ text: `line-${index}`, asset: `https://assets.example/${index}.jpg` }),
    index * 100,
    100,
  ));
  const run = mineDataset(workspace(tracks));
  const [candidate] = run.candidates;

  assert.equal(candidate.evidence.observations, 12);
  assert.equal(candidate.evidence.workspaces, 1);
  assert.equal(candidate.state, 'inventory');
  assert.equal(candidate.eligibility.evidenceReady, false);
  assert.ok(candidate.eligibility.blockers.includes('insufficient-independent-workspaces'));
});

test('arithmetic utilities and atomic channel writes do not become memory candidates', () => {
  const source = 'const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));const lerp=(a,b,t)=>a+(b-a)*t;const msToFrames=(ms)=>ms*60/1000;const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);const scale=interpolate(frame,[0,10],[0.8,1]);return <div style={{opacity,transform:`scale(${scale})`}}/>}';
  const run = mineDataset(workspace([composition('atomic', source)]));

  assert.deepEqual(run.candidates, []);
  assert.deepEqual(run.previewIndex.entries, []);
  assert.equal(run.manifest.counts.infrastructureChannelOccurrences, 2);
  assert.equal(run.observationsPrivate[0].infrastructureMatches.length, 2);
  assert.equal(Object.hasOwn(run.observations[0], 'infrastructureMatches'), false);
});

test('preview contains only motif units and no subjective fields', () => {
  const run = mineDataset(workspace([composition('one', dialogueSource())]));
  const serialized = JSON.stringify(run.previewIndex);

  assert.ok(run.previewIndex.entries.every((entry) => entry.kind === 'unit'));
  assert.equal(run.previewIndex.entries.some((entry) => /^(?:util|recipe|behaviour)\./u.test(entry.id)), false);
  assert.equal(/confidence|score|maturity/u.test(serialized), false);
});

test('collapses arbitrary member call names in public observations', () => {
  const source = 'const GeneratedComposition=()=>{ctx.secretCustomerAlice();return <canvas/>;}';
  const run = mineDataset(workspace([composition('x', source)]));
  const serialized = JSON.stringify(run.observations);

  assert.equal(serialized.includes('secretCustomerAlice'), false);
  assert.equal(run.observations[0].code.features.calls._custom, 1);
});
