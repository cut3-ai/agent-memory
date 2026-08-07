import { ArchivalDossierComposition } from '@cut3/agent-memory/compositions/ArchivalDossierComposition';
import { RetroRitualRankingComposition } from '@cut3/agent-memory/compositions/RetroRitualRankingComposition';
import { SignalEditorialComposition } from '@cut3/agent-memory/compositions/SignalEditorialComposition';
import { Engine } from '@cut3/agent-memory/core/Engine';

const showcases = [
  ['SIGNAL EDITORIAL', new SignalEditorialComposition(), [0, 12, 60, 90]],
  ['ARCHIVAL DOSSIER', new ArchivalDossierComposition(), [0, 12, 72, 100]],
  ['RETRO RITUAL RANKING', new RetroRitualRankingComposition(), [0, 12, 70, 100]],
];

for (const [title, composition, frames] of showcases) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
  const engine = new Engine(composition);
  for (const frame of frames) {
    console.log(`\nframe ${frame}`);
    console.log(renderTree(engine.at({ frame })));
  }
}

function renderTree(root) {
  const lines = [];
  const walk = (node, depth) => {
    const details = [];
    if (node.name) details.push(node.name);
    if (node.pivot) details.push(`pivot=${node.pivot.x},${node.pivot.y}`);
    if (node.pose && meaningfulPose(node.pose)) {
      details.push(`pose=${compact(node.pose)}`);
    }
    if (node.paint?.fill && node.paint.fill !== 'transparent') details.push(`fill=${node.paint.fill}`);
    if (node.paint?.stroke && node.paint.stroke !== 'transparent') details.push(`stroke=${node.paint.stroke}`);
    if (node.typography) details.push(`font=${node.typography.family} ${node.typography.size}/${node.typography.weight}`);
    lines.push(`${'  '.repeat(depth)}${node.kind}${details.length ? ` · ${details.join(' · ')}` : ''}`);
    node.children.forEach((child) => walk(child, depth + 1));
  };
  walk(root, 0);
  return lines.join('\n');
}

function meaningfulPose(pose) {
  return pose.x !== 0 || pose.y !== 0 || pose.rotate !== 0 || pose.scaleX !== 1 || pose.scaleY !== 1;
}

function compact(value) {
  return Object.entries(value)
    .filter(([, nested]) => nested !== 0 && nested !== 1)
    .map(([key, nested]) => `${key}:${Number.isFinite(nested) ? Number(nested.toFixed(2)) : nested}`)
    .join(',');
}
