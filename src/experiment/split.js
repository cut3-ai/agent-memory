import { sha256, stableStringify } from '../lib.js';

export const SPLIT_VERSION = 'workspace-split-v1';
export const SPLIT_RATIOS = Object.freeze({
  train: 0.6,
  validation: 0.2,
  heldout: 0.2,
});

export function parseWorkspaceDataset(inputText) {
  const text = String(inputText ?? '');
  const lines = text.split(/\r?\n/);
  const workspaces = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].trim()) continue;
    let workspace;
    try {
      workspace = JSON.parse(lines[lineIndex]);
    } catch {
      throw new Error(`Invalid JSONL at line ${lineIndex + 1}`);
    }
    if (!workspace || typeof workspace !== 'object' || !Array.isArray(workspace.tracks)) {
      throw new Error(`Invalid workspace at line ${lineIndex + 1}`);
    }

    const compositions = workspace.tracks
      .map((track, trackIndex) => ({ track, trackIndex }))
      .filter(({ track }) => track?.type === 'composition')
      .map(({ track, trackIndex }, compositionIndex) => {
        if (typeof track.source !== 'string' || !track.source.trim()) {
          throw new Error(`Composition source is missing at line ${lineIndex + 1}`);
        }
        const sourceHash = sha256(track.source);
        return {
          compositionIndex,
          trackIndex,
          source: track.source,
          sourceHash,
          lengthMs: finiteNumber(track.length),
        };
      });
    if (compositions.length === 0) continue;

    const fingerprint = sha256(stableStringify(workspace));
    workspaces.push({
      fingerprint,
      lineIndex,
      width: finiteNumber(workspace.width),
      height: finiteNumber(workspace.height),
      fps: finiteNumber(workspace.fps),
      compositions,
    });
  }

  if (workspaces.length === 0) throw new Error('Dataset has no composition workspaces');
  assignWorkspaceKeys(workspaces);
  const canonicalDatasetHash = sha256(stableStringify(
    workspaces.map((workspace) => workspace.fingerprint).sort(),
  ));
  return {
    schemaVersion: 1,
    inputSha256: canonicalDatasetHash,
    jsonlLines: lines.filter((line) => line.trim()).length,
    workspaces,
  };
}

export function createWorkspaceSplit(dataset) {
  const groups = connectedWorkspaceGroups(dataset.workspaces);
  const ranked = groups
    .map((group) => ({
      group,
      rank: sha256(`${SPLIT_VERSION}:${group.groupKey}`),
    }))
    .sort((left, right) => (
      left.rank.localeCompare(right.rank)
      || left.group.groupKey.localeCompare(right.group.groupKey)
    ));
  const groupAssignments = assignGroups(ranked.map((entry) => entry.group), dataset.workspaces.length);
  const assignmentByWorkspaceKey = new Map();
  const assignments = [];
  for (const { group } of ranked) {
    const split = groupAssignments.get(group.groupKey);
    for (const workspace of group.workspaces) {
      assignmentByWorkspaceKey.set(workspace.workspaceKey, split);
      assignments.push({
        workspaceKey: workspace.workspaceKey,
        groupKey: group.groupKey,
        split,
        compositionCount: workspace.compositions.length,
      });
    }
  }
  assignments.sort((left, right) => left.workspaceKey.localeCompare(right.workspaceKey));
  assertExactSourcesStayInOneSplit(dataset.workspaces, assignmentByWorkspaceKey);

  const body = {
    schemaVersion: 1,
    splitVersion: SPLIT_VERSION,
    strategy: 'workspace-level-content-hash-ranking',
    grouping: 'connected-components-by-exact-composition-source-hash',
    inputSha256: dataset.inputSha256,
    requestedRatios: SPLIT_RATIOS,
    counts: {
      workspaces: dataset.workspaces.length,
      workspaceGroups: ranked.length,
      compositions: dataset.workspaces.reduce(
        (sum, workspace) => sum + workspace.compositions.length,
        0,
      ),
      splits: Object.fromEntries(['train', 'validation', 'heldout'].map((split) => [split, {
        workspaces: assignments.filter((entry) => entry.split === split).length,
        compositions: assignments
          .filter((entry) => entry.split === split)
          .reduce((sum, entry) => sum + entry.compositionCount, 0),
      }])),
    },
    assignments,
  };
  const manifest = {
    ...body,
    splitHash: sha256(stableStringify(body)),
  };
  return { manifest, assignmentByWorkspaceKey };
}

function assignWorkspaceKeys(workspaces) {
  const byFingerprint = new Map();
  for (const workspace of workspaces) {
    const entries = byFingerprint.get(workspace.fingerprint) ?? [];
    entries.push(workspace);
    byFingerprint.set(workspace.fingerprint, entries);
  }
  for (const [fingerprint, entries] of byFingerprint) {
    entries.sort((left, right) => left.lineIndex - right.lineIndex);
    entries.forEach((workspace, index) => {
      const suffix = entries.length > 1 ? `-${String(index + 1).padStart(2, '0')}` : '';
      workspace.workspaceKey = `workspace-${fingerprint.slice(0, 16)}${suffix}`;
    });
  }
}

function connectedWorkspaceGroups(workspaces) {
  const parent = workspaces.map((_, index) => index);
  const find = (index) => {
    let current = index;
    while (parent[current] !== current) current = parent[current];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = current;
      index = next;
    }
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (leftRoot < rightRoot) parent[rightRoot] = leftRoot;
    else parent[leftRoot] = rightRoot;
  };
  const sourceOwner = new Map();
  workspaces.forEach((workspace, workspaceIndex) => {
    for (const composition of workspace.compositions) {
      const previous = sourceOwner.get(composition.sourceHash);
      if (previous === undefined) sourceOwner.set(composition.sourceHash, workspaceIndex);
      else union(previous, workspaceIndex);
    }
  });

  const membersByRoot = new Map();
  workspaces.forEach((workspace, index) => {
    const root = find(index);
    const members = membersByRoot.get(root) ?? [];
    members.push(workspace);
    membersByRoot.set(root, members);
  });
  return [...membersByRoot.values()].map((members) => {
    members.sort((left, right) => left.workspaceKey.localeCompare(right.workspaceKey));
    const groupKey = `group-${sha256(members.map((entry) => entry.workspaceKey).join(':')).slice(0, 16)}`;
    return { groupKey, workspaces: members };
  });
}

function assignGroups(groups, workspaceCount) {
  const targets = splitSizes(workspaceCount);
  const splitNames = ['train', 'validation', 'heldout'];
  let states = new Map([['0:0:0', { counts: [0, 0, 0], assignments: [] }]]);

  for (const group of groups) {
    const next = new Map();
    for (const state of states.values()) {
      splitNames.forEach((split, splitIndex) => {
        const counts = [...state.counts];
        counts[splitIndex] += group.workspaces.length;
        const key = counts.join(':');
        const candidate = {
          counts,
          assignments: [...state.assignments, split],
        };
        const previous = next.get(key);
        if (!previous || assignmentKey(candidate).localeCompare(assignmentKey(previous)) < 0) {
          next.set(key, candidate);
        }
      });
    }
    states = next;
  }

  const targetCounts = [targets.train, targets.validation, targets.heldout];
  const best = [...states.values()].sort((left, right) => (
    assignmentScore(left, targetCounts) - assignmentScore(right, targetCounts)
    || assignmentKey(left).localeCompare(assignmentKey(right))
  ))[0];
  return new Map(groups.map((group, index) => [group.groupKey, best.assignments[index]]));
}

function assignmentScore(state, targets) {
  const emptyRequired = state.counts.reduce((sum, count, index) => (
    sum + (targets[index] > 0 && count === 0 ? 1 : 0)
  ), 0);
  const deviation = state.counts.reduce(
    (sum, count, index) => sum + Math.abs(count - targets[index]),
    0,
  );
  return emptyRequired * 1_000 + deviation;
}

function assignmentKey(state) {
  return state.assignments.map((split) => ({ train: '0', validation: '1', heldout: '2' })[split]).join('');
}

function assertExactSourcesStayInOneSplit(workspaces, assignments) {
  const splitBySourceHash = new Map();
  for (const workspace of workspaces) {
    const split = assignments.get(workspace.workspaceKey);
    for (const composition of workspace.compositions) {
      const previous = splitBySourceHash.get(composition.sourceHash);
      if (previous && previous !== split) {
        throw new Error('Exact composition source appears in more than one split');
      }
      splitBySourceHash.set(composition.sourceHash, split);
    }
  }
}

function splitSizes(count) {
  if (count === 1) return { train: 1, validation: 0, heldout: 0 };
  if (count === 2) return { train: 1, validation: 0, heldout: 1 };
  const validation = Math.max(1, Math.floor(count * SPLIT_RATIOS.validation));
  const heldout = Math.max(1, Math.floor(count * SPLIT_RATIOS.heldout));
  return {
    train: count - validation - heldout,
    validation,
    heldout,
  };
}

function finiteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
