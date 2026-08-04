import assert from 'node:assert/strict';
import test from 'node:test';

import { detectTimelineArrangements } from '../src/timeline.js';
import { mineDataset } from '../src/mine.js';

function observation({ id, workspace = 0, start, length, signals }) {
  return {
    observationId: id,
    sourceHash: `source-${id}`,
    workspace: { index: workspace },
    track: { id: `track-${id}`, start, length },
    signals,
  };
}

test('detects photo scenes joined by short white flashes', () => {
  const observations = [
    observation({ id: 'scene-c', start: 1300, length: 500, signals: ['unit.media.fullFrameCover'] }),
    observation({ id: 'flash-a', start: 680, length: 120, signals: [{ id: 'overlay.WhiteFlash' }] }),
    observation({ id: 'scene-a', start: 0, length: 700, signals: [{ id: 'media.FullFrameCover' }] }),
    observation({ id: 'flash-b', start: 1270, length: 120, signals: ['unit.overlay.whiteFlash'] }),
    observation({ id: 'scene-b', start: 700, length: 600, signals: ['unit.image.fullFrameCover'] }),
  ];

  assert.deepEqual(detectTimelineArrangements(observations), [{
    id: 'arrangement.photo-flash-cuts',
    kind: 'arrangement-diagnostic',
    memoryEligible: false,
    description: 'Diagnostic evidence that solid-fill plus opacity is reused at media cut boundaries.',
    intents: ['fast photo edit', 'flash transition', 'velocity montage'],
    evidenceObservationIds: ['flash-a', 'flash-b', 'scene-a', 'scene-b', 'scene-c'],
    workspaceIndexes: [0],
    evidenceOccurrences: [{
      workspaceIndex: 0,
      observationIds: ['flash-a', 'flash-b', 'scene-a', 'scene-b', 'scene-c'],
    }],
    why: 'At least three image scenes and two short flashes align at adjacent scene boundaries.',
  }]);
});

test('detects sequential cards and timed-scatter chunks without crossing workspaces', () => {
  const observations = [
    ...['a', 'b', 'c'].map((id, index) => observation({
      id: `card-${id}`,
      workspace: 2,
      start: index * 1000,
      length: 1000,
      signals: [{ signalId: 'unit.card.rankingHero' }],
    })),
    ...['a', 'b', 'c'].map((id, index) => observation({
      id: `text-${id}`,
      workspace: 3,
      start: index * 900,
      length: 900,
      signals: ['text.TimedScatterWords'],
    })),
    observation({ id: 'isolated-card', workspace: 3, start: 9000, length: 1000, signals: ['card.RankingHero'] }),
  ];

  const result = detectTimelineArrangements(observations);
  assert.deepEqual(result.map((entry) => entry.id), [
    'arrangement.repeated-ranking-card',
    'arrangement.repeated-timed-word-scatter',
  ]);
  assert.deepEqual(result[0].workspaceIndexes, [2]);
  assert.deepEqual(result[1].workspaceIndexes, [3]);
});

test('detects a contiguous dialogue-card lane', () => {
  const observations = ['a', 'b', 'c', 'd'].map((id, index) => observation({
    id: `dialogue-${id}`,
    workspace: 6,
    start: index * 1200,
    length: 1200,
    signals: ['text.DialogueBox'],
  }));

  const [result] = detectTimelineArrangements(observations);
  assert.equal(result.id, 'arrangement.repeated-dialogue-card');
  assert.equal(result.evidenceObservationIds.length, 4);
  assert.deepEqual(result.workspaceIndexes, [6]);
});

test('requires an extracted timed-text unit and excludes ranking cards', () => {
  const chunk = (id, start) => observation({
    id,
    workspace: 7,
    start,
    length: 1000,
    signals: ['text.timed-word-scatter'],
  });
  const ranking = (id, start) => observation({
    id,
    workspace: 8,
    start,
    length: 1000,
    signals: ['card.RankingHero', 'text.TimedScatterWords'],
  });

  const result = detectTimelineArrangements([
    chunk('a', 0), chunk('b', 1000), chunk('c', 2000),
    ranking('rank-a', 0), ranking('rank-b', 1000), ranking('rank-c', 2000),
  ]);
  assert.deepEqual(result.map((entry) => entry.id), [
    'arrangement.repeated-ranking-card',
    'arrangement.repeated-timed-word-scatter',
  ]);
  assert.deepEqual(result[1].workspaceIndexes, [7]);
});

test('returns deterministic aggregate and does not expose private observation data', () => {
  const createWorkspace = (workspace) => ['a', 'b', 'c'].map((id, index) => ({
    ...observation({
      id: `${workspace}-${id}`,
      workspace,
      start: index * 1000,
      length: 1000,
      signals: ['unit.card.rankingCard'],
    }),
    private: {
      prompt: 'user transcript https://private.example/video.mp4',
      source: 'secret source',
    },
  }));
  const observations = [...createWorkspace(9), ...createWorkspace(4)].reverse();

  const result = detectTimelineArrangements(observations);
  assert.deepEqual(result[0].workspaceIndexes, [4, 9]);
  assert.equal(JSON.stringify(result).includes('private.example'), false);
  assert.equal(JSON.stringify(result).includes('user transcript'), false);
  assert.deepEqual(result, detectTimelineArrangements([...observations].reverse()));
});

test('does not call heavily overlapping tracks a sequential lane', () => {
  const observations = [0, 100, 200].map((start, index) => observation({
    id: `overlap-${index}`,
    workspace: 11,
    start,
    length: 2000,
    signals: ['text.DialogueBox'],
  }));

  assert.deepEqual(detectTimelineArrangements(observations), []);
});

test('timeline arrangements are ineligible and disjoint from memory entries', () => {
  const tracks = [1, 2, 3].map((rank, index) => ({
    id: `rank-${rank}`,
    type: 'composition',
    start: index * 1000,
    length: 1000,
    source: `const RANK=${rank};const GeneratedComposition=()=> <AbsoluteFill><Img src="https://example.test/${rank}.jpg" style={{objectFit:"cover"}}/><div data-kind="ranking-card" style={{position:"absolute",backgroundColor:"#111",borderRadius:24,padding:20}}><div style={{fontSize:80,fontWeight:800}}>#{RANK}</div><div style={{color:"white",fontWeight:600}}>Title</div></div></AbsoluteFill>;`,
  }));
  const run = mineDataset(JSON.stringify({
    width: 1080,
    height: 1920,
    fps: 60,
    length: 3000,
    tracks,
  }));
  const memoryIds = new Set(run.previewIndex.entries.map((entry) => entry.id));

  assert.ok(run.timelineArrangements.length > 0);
  assert.ok(run.timelineArrangements.every((item) => item.memoryEligible === false));
  assert.deepEqual(
    run.timelineArrangements.filter((item) => memoryIds.has(item.id)),
    [],
  );
});
