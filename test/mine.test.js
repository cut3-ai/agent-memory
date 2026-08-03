import assert from 'node:assert/strict';
import test from 'node:test';

import { mineDataset } from '../src/mine.js';

function workspace(tracks) {
  return JSON.stringify({ width: 1080, height: 1920, fps: 60, length: 2000, tracks });
}

const reusableSource = 'const PrivateNamedHelper=()=>null;const GeneratedComposition=()=>{const frame=useCurrentFrame();const {fps}=useVideoConfig();const ms2f=(ms)=>Math.round(ms*fps/1000);const opacity=interpolate(frame,[0,ms2f(100)],[0,1]);return <PrivateNamedHelper><div style={{fontSize:80,opacity}}>PRIVATE TRANSCRIPT</div></PrivateNamedHelper>}';

function rankingSource(rank) {
  return `const RANK=${rank};const GeneratedComposition=()=> <AbsoluteFill><Img src="https://example.test/${rank}.jpg" style={{objectFit:"cover"}}/><div style={{position:"absolute",opacity:1,transform:"scale(1)"}}><div style={{fontSize:80}}>#{RANK}</div><div>Title</div></div></AbsoluteFill>;`;
}

test('ingests only composition tracks and keeps discovery untrusted', () => {
  const input = workspace([
    { id: 'video', type: 'video', start: 0, length: 1000, source: 'not composition' },
    { id: 'a', type: 'composition', start: 0, length: 1000, source: reusableSource, meta: { prompt: 'secret https://private.example/a.mp4' } },
    { id: 'b', type: 'composition', start: 1000, length: 1000, source: reusableSource, meta: { prompt: 'another transcript' } },
  ]);
  const run = mineDataset(input, { inputName: 'fixture.jsonl' });

  assert.equal(run.manifest.counts.observations, 2);
  assert.equal(run.manifest.counts.uniqueSources, 1);
  assert.ok(run.candidates.length > 0);
  assert.ok(run.candidates.every((candidate) => candidate.trusted === false));
  assert.ok(run.candidates.every((candidate) => candidate.feedback === 'unknown'));
  assert.equal(JSON.stringify(run.previewIndex).includes('private.example'), false);
  assert.equal(JSON.stringify(run.observations).includes('PRIVATE TRANSCRIPT'), false);
  assert.equal(JSON.stringify(run.observations).includes('PrivateNamedHelper'), false);
  assert.ok(JSON.stringify(run.observationsPrivate).includes('PRIVATE TRANSCRIPT'));

  const opacityCandidate = run.candidates.find((candidate) => candidate.id === 'motion.opacity');
  assert.equal(opacityCandidate.evidence.observations, 2);
  assert.equal(opacityCandidate.evidence.uniqueSources, 1);
  assert.equal(opacityCandidate.evidence.independentOccurrences, 1);
  assert.equal(opacityCandidate.extraction.state, 'atomic-occurrences-located');
  assert.equal(opacityCandidate.extraction.spansAvailable, true);
  assert.deepEqual(opacityCandidate.writes, ['opacity']);
  assert.equal(run.candidates.some((candidate) => candidate.id.startsWith('util.')), false);
});

test('same bytes and config produce deterministic artifacts', () => {
  const input = workspace([
    { id: 'a', type: 'composition', start: 0, length: 1000, source: reusableSource },
  ]);
  const first = mineDataset(input, { inputName: 'one.jsonl', clusterThreshold: 0.82 });
  const second = mineDataset(input, { inputName: 'one.jsonl', clusterThreshold: 0.82 });

  assert.deepEqual(first, second);
  assert.match(first.runId, /^[a-f0-9]{20}$/);
  assert.match(first.manifest.algorithmDigest, /^[a-f0-9]{20}$/);
  assert.deepEqual(
    mineDataset(input, { inputName: 'renamed.jsonl', clusterThreshold: 0.82 }),
    first,
  );
});

test('composition source is parsed but never executed', () => {
  delete globalThis.__memoryMinerExecuted;
  const source = 'globalThis.__memoryMinerExecuted=true; const GeneratedComposition=()=> <div/>;';
  mineDataset(workspace([{ id: 'x', type: 'composition', start: 0, length: 1000, source }]));

  assert.equal(globalThis.__memoryMinerExecuted, undefined);
});

test('quarantines primitive, malformed and invalid timeline rows without leaking input', () => {
  const valid = workspace([{ id: 'ok', type: 'composition', start: 0, length: 1000, source: 'const GeneratedComposition=()=> <div/>;' }]);
  const invalidTimeline = JSON.stringify({
    width: 0,
    height: 1920,
    fps: 60,
    length: 1000,
    tracks: [{ id: 'bad', type: 'composition', start: 0, length: 1000, source: 'const GeneratedComposition=()=> <div/>;' }],
  });
  const run = mineDataset(`null\nsecret user transcript\n${invalidTimeline}\n${valid}`);

  assert.equal(run.manifest.counts.observations, 1);
  assert.deepEqual(run.errors.map((error) => error.code), [
    'workspace-not-object',
    'invalid-json',
    'invalid-workspace-timeline',
  ]);
  assert.equal(JSON.stringify(run.errors).includes('secret'), false);
  assert.equal(JSON.stringify(run.errors).includes('transcript'), false);
});

test('cardinality changes evidence but never creates a new module identity', () => {
  const createTracks = (count) => Array.from({ length: count }, (_, index) => ({
    id: `rank-${index + 1}`,
    type: 'composition',
    start: index * 1000,
    length: 1000,
    source: rankingSource(index + 1),
  }));
  const two = mineDataset(workspace(createTracks(2)));
  const three = mineDataset(workspace(createTracks(3)));
  const five = mineDataset(workspace(createTracks(5)));
  const ids = (run) => run.candidates.map((candidate) => candidate.id).sort();

  assert.deepEqual(ids(two), ['card.ranking']);
  assert.deepEqual(ids(three), ids(two));
  assert.deepEqual(ids(five), ids(two));
  assert.equal(five.candidates.some((candidate) => candidate.kind === 'recipe'), false);
  assert.equal(five.previewIndex.entries.some((candidate) => candidate.id.startsWith('recipe.')), false);
  assert.ok(five.timelineArrangements.some((item) => item.id === 'arrangement.repeated-ranking-card'));
  assert.equal(two.candidates[0].evidence.observations, 2);
  assert.equal(five.candidates[0].evidence.observations, 5);
});

test('two or ten timed text chunks reuse one scatter unit', () => {
  const createTracks = (count) => Array.from({ length: count }, (_, index) => ({
    id: `chunk-${index}`,
    type: 'composition',
    start: index * 200,
    length: 200,
    source: `const ms2f=(ms)=>Math.round(ms*60/1000);const GeneratedComposition=()=>{const frame=useCurrentFrame();if(frame>ms2f(${index * 100 + 500}))return null;return <AbsoluteFill><div style={{position:"absolute",left:120,top:240,fontSize:64}}>word-${index}</div></AbsoluteFill>}`,
  }));
  const two = mineDataset(workspace(createTracks(2)));
  const ten = mineDataset(workspace(createTracks(10)));
  const candidateIds = (run) => run.candidates.map((candidate) => candidate.id).sort();

  assert.deepEqual(candidateIds(two), ['text.scatter-chunk']);
  assert.deepEqual(candidateIds(ten), candidateIds(two));
  assert.equal(two.candidates[0].evidence.observations, 2);
  assert.equal(ten.candidates[0].evidence.observations, 10);
});

test('two or five dialogue cards reuse one card unit', () => {
  const createTracks = (count) => Array.from({ length: count }, (_, index) => ({
    id: `dialogue-${index}`,
    type: 'composition',
    start: index * 500,
    length: 500,
    source: `const dialogue="line-${index}";const GeneratedComposition=()=> <AbsoluteFill><div style={{background:"rgba(0,0,0,0.8)",boxShadow:"0 4px 20px black",position:"absolute",bottom:20}}><span style={{fontSize:48}}>{dialogue}</span></div></AbsoluteFill>`,
  }));
  const two = mineDataset(workspace(createTracks(2)));
  const five = mineDataset(workspace(createTracks(5)));

  assert.deepEqual(two.candidates.map((candidate) => candidate.id), ['text.dialogue-card']);
  assert.deepEqual(five.candidates.map((candidate) => candidate.id), ['text.dialogue-card']);
  assert.equal(two.candidates[0].evidence.observations, 2);
  assert.equal(five.candidates[0].evidence.observations, 5);
  assert.equal(five.candidates[0].confidence.tier, 'inventory-only');
});

test('many copies inside one workspace stay inventory-only', () => {
  const tracks = Array.from({ length: 25 }, (_, index) => ({
    id: `rank-${index}`,
    type: 'composition',
    start: index * 50,
    length: 50,
    source: rankingSource(index + 1),
  }));
  const run = mineDataset(workspace(tracks));
  const ranking = run.candidates.find((candidate) => candidate.id === 'card.ranking');

  assert.ok(ranking);
  assert.equal(ranking.evidence.observations, 25);
  assert.equal(ranking.evidence.workspaces, 1);
  assert.equal(ranking.evidence.independentOccurrences, 1);
  assert.equal(ranking.confidence.tier, 'inventory-only');
});

test('repeated arithmetic utilities never become memory candidates', () => {
  const utilityOnly = (id) => ({
    id,
    type: 'composition',
    start: 0,
    length: 1000,
    source: 'const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));const lerp=(a,b,t)=>a+(b-a)*t;const msToFrames=(ms)=>ms*60/1000;const half=(n)=>n/2;const GeneratedComposition=()=> <div/>',
  });
  const input = [workspace([utilityOnly('a')]), workspace([utilityOnly('b')]), workspace([utilityOnly('c')])].join('\n');
  const run = mineDataset(input);

  assert.deepEqual(run.candidates, []);
  assert.deepEqual(run.previewIndex.entries, []);
});

test('local AST spans distinguish separate visual sinks', () => {
  const source = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);const scale=interpolate(frame,[0,10],[0.8,1]);return <AbsoluteFill><div style={{opacity}}/><div style={{transform:`scale(${scale})`}}/></AbsoluteFill>}';
  const run = mineDataset(workspace([{
    id: 'atomic',
    type: 'composition',
    start: 0,
    length: 1000,
    source,
  }]));
  const byId = new Map(run.candidates.map((candidate) => [candidate.id, candidate]));

  assert.deepEqual([...byId.keys()].sort(), ['motion.opacity', 'motion.scale']);
  assert.notEqual(
    byId.get('motion.opacity').evidence.sampleOccurrences[0].span.start,
    byId.get('motion.scale').evidence.sampleOccurrences[0].span.start,
  );
  assert.ok(run.observations[0].code.visualAtoms.length >= 2);
});

test('only units and behaviors can enter the preview index', () => {
  const tracks = [1, 2, 3].map((rank, index) => ({
    id: `rank-${rank}`,
    type: 'composition',
    start: index * 1000,
    length: 1000,
    source: rankingSource(rank),
  }));
  const run = mineDataset(workspace(tracks));

  assert.ok(run.previewIndex.entries.length > 0);
  assert.ok(run.previewIndex.entries.every((entry) => ['unit', 'behavior'].includes(entry.kind)));
  assert.equal(run.previewIndex.entries.some((entry) => /^(?:util|recipe)\./.test(entry.id)), false);
});

test('collapses arbitrary member call names in public observations', () => {
  const source = 'const GeneratedComposition=()=>{ctx.secretCustomerAlice();return <canvas/>;}';
  const run = mineDataset(workspace([{ id: 'x', type: 'composition', start: 0, length: 1000, source }]));
  const serialized = JSON.stringify(run.observations);

  assert.equal(serialized.includes('secretCustomerAlice'), false);
  assert.equal(run.observations[0].code.features.calls._custom, 1);
});
