import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspaceSplit,
  parseWorkspaceDataset,
  SPLIT_VERSION,
} from '../src/experiment/split.js';

test('structural split is deterministic, workspace-disjoint, and outcome-blind', () => {
  const records = Array.from({ length: 10 }, (_, index) => workspace(index));
  const forward = createWorkspaceSplit(parseWorkspaceDataset(jsonl(records)));
  const reverse = createWorkspaceSplit(parseWorkspaceDataset(jsonl([...records].reverse())));
  const assignment = assignmentMap(forward);

  assert.equal(SPLIT_VERSION, 'workspace-structural-stratified-v2');
  assert.deepEqual(assignment, assignmentMap(reverse));
  assert.equal(forward.manifest.splitHash, reverse.manifest.splitHash);
  assert.equal(assignment.size, 10);
  assert.deepEqual(
    Object.fromEntries(Object.entries(forward.manifest.counts.splits).map(([name, value]) => (
      [name, value.workspaces]
    ))),
    { train: 6, validation: 2, heldout: 2 },
  );
  assert.equal(forward.manifest.stratification.assignmentUnit,
    'exact-source-connected-workspace-group');
  assert.equal(forward.manifest.stratification.labelSource, 'pre-lowering-static-ast');
  assert.equal(forward.manifest.stratification.outcomeLabelsUsed, false);
  assert.equal(forward.manifest.stratification.exactSourceLeakageAllowed, false);
  assert.ok(forward.manifest.stratification.labels.some(({ label }) => label === 'render:dom'));
  assert.ok(forward.manifest.stratification.labels.some(({ label }) => label === 'render:svg'));
  assert.ok(forward.manifest.stratification.labels.some(({ label }) => label === 'motion:interpolate'));
});

test('workspaces connected by an exact composition source never cross splits', () => {
  const shared = 'export function GeneratedComposition(){return <div/>}';
  const records = Array.from({ length: 8 }, (_, index) => workspace(index));
  records[0].tracks.push({
    type: 'composition',
    length: 100,
    source: `\`\`\`jsx\r\n${shared}\r\n\`\`\``,
  });
  records[1].tracks.push({ type: 'composition', length: 100, source: shared });
  const dataset = parseWorkspaceDataset(jsonl(records));
  const split = createWorkspaceSplit(dataset);
  const sharedHash = dataset.workspaces[0].compositions.at(-1).sourceHash;
  const owners = dataset.workspaces.filter((workspaceEntry) => (
    workspaceEntry.compositions.some(({ sourceHash }) => sourceHash === sharedHash)
  ));

  assert.equal(owners.length, 2);
  assert.equal(
    split.assignmentByWorkspaceKey.get(owners[0].workspaceKey),
    split.assignmentByWorkspaceKey.get(owners[1].workspaceKey),
  );
  const groupKeys = new Set(split.manifest.assignments
    .filter(({ workspaceKey }) => owners.some((owner) => owner.workspaceKey === workspaceKey))
    .map(({ groupKey }) => groupKey));
  assert.equal(groupKeys.size, 1);
});

function workspace(index) {
  const sources = [
    `export function GeneratedComposition(){const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,9],[0,1])}}>${index}</div>}`,
    `export function GeneratedComposition(){return <svg><text>${index}</text></svg>}`,
    `export function GeneratedComposition(){return <AbsoluteFill><Img src="image-${index}.png"/></AbsoluteFill>}`,
  ];
  return {
    width: 100,
    height: 100,
    fps: 10,
    tracks: [{ type: 'composition', length: 100, source: sources[index % sources.length] }],
  };
}

function jsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function assignmentMap(split) {
  return new Map(split.manifest.assignments.map(({ workspaceKey, split: name }) => (
    [workspaceKey, name]
  )));
}
