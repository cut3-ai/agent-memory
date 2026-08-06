import { round, sha256 } from '../../src/lib.js';

const COMMON_TOKEN_WEIGHTS = new Map([
  ['jsx:div', 0.25],
  ['jsx:AbsoluteFill', 0.45],
  ['style:position', 0.3],
  ['style:width', 0.35],
  ['style:height', 0.35],
  ['style:top', 0.4],
  ['style:left', 0.4],
  ['global:Math', 0.35],
  ['global:useCurrentFrame', 0.55],
  ['global:useVideoConfig', 0.55],
  ['call:useCurrentFrame', 0.55],
  ['call:useVideoConfig', 0.55],
]);

export function computeIdf(observations) {
  const documentFrequency = new Map();
  for (const observation of observations) {
    for (const token of new Set(tokenMap(observation).keys())) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const count = observations.length;
  return new Map([...documentFrequency].map(([token, frequency]) => [
    token,
    Math.log((count + 1) / (frequency + 1)) + 1,
  ]));
}

export function observationSimilarity(left, right, idf = new Map()) {
  if (left?.code?.parseStatus !== 'valid' || right?.code?.parseStatus !== 'valid') return 0;
  if (!compatibleBackend(left, right)) return 0;
  if (left.code.structuralHash === right.code.structuralHash) return 1;

  const code = weightedCosine(tokenMap(left), tokenMap(right), idf);
  const signals = jaccard(new Set(left.signals ?? []), new Set(right.signals ?? []));
  const families = jaccard(
    new Set(left.code.features?.families ?? []),
    new Set(right.code.features?.families ?? []),
  );
  const motionConflict = hasMotionDirectionConflict(left, right);
  if (motionConflict) return 0;

  return round(0.78 * code + 0.14 * signals + 0.08 * families, 6);
}

export function completeLinkClusters(observations, { threshold = 0.82 } = {}) {
  const ordered = [...observations].sort((left, right) => stableKey(left).localeCompare(stableKey(right)));
  const idf = computeIdf(ordered);
  const similarities = new Map();

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      similarities.set(
        pairKey(ordered[leftIndex], ordered[rightIndex]),
        observationSimilarity(ordered[leftIndex], ordered[rightIndex], idf),
      );
    }
  }

  let clusters = ordered.map((observation) => ({ members: [observation] }));
  while (true) {
    let best = null;
    for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < clusters.length; rightIndex += 1) {
        const similarity = clusterSimilarity(clusters[leftIndex], clusters[rightIndex], similarities);
        if (similarity < threshold) continue;
        const mergeKey = `${clusterKey(clusters[leftIndex])}|${clusterKey(clusters[rightIndex])}`;
        if (
          !best
          || similarity > best.similarity
          || (similarity === best.similarity && mergeKey.localeCompare(best.mergeKey) < 0)
        ) {
          best = { leftIndex, rightIndex, similarity, mergeKey };
        }
      }
    }
    if (!best) break;

    const merged = {
      members: [...clusters[best.leftIndex].members, ...clusters[best.rightIndex].members]
        .sort((left, right) => stableKey(left).localeCompare(stableKey(right))),
    };
    clusters = clusters.filter((_, index) => index !== best.leftIndex && index !== best.rightIndex);
    clusters.push(merged);
    clusters.sort((left, right) => clusterKey(left).localeCompare(clusterKey(right)));
  }

  return clusters
    .filter((cluster) => cluster.members.length >= 2)
    .map((cluster) => finalizeCluster(cluster, similarities))
    .sort((left, right) => (
      right.uniqueSources - left.uniqueSources
      || right.minimumSimilarity - left.minimumSimilarity
      || left.id.localeCompare(right.id)
    ));
}

function finalizeCluster(cluster, similarities) {
  const memberKeys = cluster.members.map(stableKey).sort();
  const pairScores = [];
  for (let leftIndex = 0; leftIndex < cluster.members.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cluster.members.length; rightIndex += 1) {
      pairScores.push(similarities.get(pairKey(cluster.members[leftIndex], cluster.members[rightIndex])) ?? 0);
    }
  }
  const sortedScores = [...pairScores].sort((left, right) => left - right);
  const middle = Math.floor(sortedScores.length / 2);
  const median = sortedScores.length === 0
    ? 1
    : sortedScores.length % 2 === 0
      ? (sortedScores[middle - 1] + sortedScores[middle]) / 2
      : sortedScores[middle];

  return {
    id: `composition-${sha256(memberKeys.join('|')).slice(0, 12)}`,
    uniqueSources: cluster.members.length,
    minimumSimilarity: round(sortedScores[0] ?? 1, 4),
    medianSimilarity: round(median, 4),
    memberObservationIds: cluster.members.map((observation) => observation.observationId).sort(),
    memberSourceHashes: cluster.members.map((observation) => observation.sourceHash).sort(),
    renderMode: cluster.members[0]?.code?.features?.renderMode ?? 'unknown',
    commonSignals: commonSignals(cluster.members),
  };
}

function clusterSimilarity(left, right, similarities) {
  let minimum = 1;
  for (const leftMember of left.members) {
    for (const rightMember of right.members) {
      minimum = Math.min(minimum, similarities.get(pairKey(leftMember, rightMember)) ?? 0);
    }
  }
  return minimum;
}

function compatibleBackend(left, right) {
  const leftMode = left?.code?.features?.renderMode ?? 'unknown';
  const rightMode = right?.code?.features?.renderMode ?? 'unknown';
  if (leftMode !== rightMode) return false;

  const leftMedia = mediaSignature(left);
  const rightMedia = mediaSignature(right);
  if (leftMedia === rightMedia) return true;
  if (leftMedia === 'none' || rightMedia === 'none') return false;
  return leftMedia.split('+').some((kind) => rightMedia.split('+').includes(kind));
}

function mediaSignature(observation) {
  const counts = observation?.code?.dependencies?.counts ?? {};
  const tags = observation?.code?.features?.jsxTags ?? {};
  const kinds = [];
  if ((counts.image ?? 0) > 0 || (tags.Img ?? 0) > 0 || (tags.img ?? 0) > 0) kinds.push('image');
  if ((counts.video ?? 0) > 0 || (tags.Video ?? 0) > 0 || (tags.OffthreadVideo ?? 0) > 0) kinds.push('video');
  if ((counts.audio ?? 0) > 0 || (tags.Audio ?? 0) > 0) kinds.push('audio');
  return kinds.length > 0 ? kinds.sort().join('+') : 'none';
}

function hasMotionDirectionConflict(left, right) {
  const leftDirections = motionDirections(left);
  const rightDirections = motionDirections(right);
  if (leftDirections.size === 0 || rightDirections.size === 0) return false;
  return (
    (leftDirections.has('increasing') && rightDirections.has('decreasing'))
    || (leftDirections.has('decreasing') && rightDirections.has('increasing'))
  ) && intersectionSize(leftDirections, rightDirections) === 0;
}

function motionDirections(observation) {
  const primitives = observation?.code?.features?.motionPrimitives ?? {};
  const result = new Set();
  for (const token of Object.keys(primitives)) {
    const direction = token.split(':')[1];
    if (['increasing', 'decreasing', 'peak', 'valley', 'mixed', 'constant'].includes(direction)) {
      result.add(direction);
    }
  }
  return result;
}

function weightedCosine(left, right, idf) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const key of keys) {
    const weight = (idf.get(key) ?? 1) * (COMMON_TOKEN_WEIGHTS.get(key) ?? 1);
    const leftValue = (left.get(key) ?? 0) * weight;
    const rightValue = (right.get(key) ?? 0) * weight;
    dot += leftValue * rightValue;
    leftNorm += leftValue ** 2;
    rightNorm += rightValue ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function tokenMap(observation) {
  return new Map(Array.isArray(observation?.code?.fingerprintTokens)
    ? observation.code.fingerprintTokens
    : []);
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return 1;
  const intersection = intersectionSize(left, right);
  return intersection / (left.size + right.size - intersection);
}

function intersectionSize(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function commonSignals(members) {
  if (members.length === 0) return [];
  let common = new Set(members[0].signals ?? []);
  for (const member of members.slice(1)) {
    common = new Set([...common].filter((signal) => (member.signals ?? []).includes(signal)));
  }
  return [...common].sort();
}

function pairKey(left, right) {
  return [stableKey(left), stableKey(right)].sort().join('|');
}

function stableKey(observation) {
  return observation?.sourceHash ?? observation?.observationId ?? '';
}

function clusterKey(cluster) {
  return cluster.members.map(stableKey).sort().join(',');
}
