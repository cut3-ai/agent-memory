import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCorpusCensus } from '../census/corpus.js';
import { inspectPublicArtifact } from '../../src/memory/privacy.js';

function workspace(source, id = 'private-track-id') {
  return JSON.stringify({
    width: 1080,
    height: 1920,
    fps: 60,
    length: 2000,
    tracks: [{
      id,
      type: 'composition',
      start: 0,
      length: 1000,
      source,
      meta: { prompt: 'private prompt' },
    }],
  });
}

function workspaceWithSources(sources) {
  return JSON.stringify({
    width: 1080,
    height: 1920,
    fps: 60,
    length: Math.max(2000, sources.length * 1000),
    tracks: sources.map((source, index) => ({
      id: `dialogue-${index}`,
      type: 'composition',
      start: index * 1000,
      length: 1000,
      source,
    })),
  });
}

function nestedDialogueSource(index) {
  return `const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"relative",background:"#020617",borderRadius:40,color:"#f8fafc",padding:20}}><div style={{position:"absolute",bottom:48,left:48,background:"#111827",borderRadius:24,boxShadow:"0 18px 50px rgba(0,0,0,.45)",padding:28,color:"#f8fafc"}}><span style={{fontFamily:"Inter",fontSize:48,fontWeight:700,lineHeight:1.1}}>dialogue line ${index}</span></div></div></AbsoluteFill>`;
}

function dialogueSource({
  text = 'line one',
  asset = 'https://assets.example/a.jpg',
  background = '#111827',
  fontFamily = 'Inter',
} = {}) {
  return `const dialogue=${JSON.stringify(text)};const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",bottom:48,left:48,background:${JSON.stringify(background)},borderRadius:24,boxShadow:"0 18px 50px rgba(0,0,0,.45)",padding:28,color:"#f8fafc"}}><Img src=${JSON.stringify(asset)} style={{width:72,height:72,borderRadius:36,objectFit:"cover"}}/><span style={{fontFamily:${JSON.stringify(fontFamily)},fontSize:48,fontWeight:700,lineHeight:1.1}}>{dialogue}</span></div></AbsoluteFill>`;
}

test('corpus census separates mechanics from authentic memory', () => {
  const source = [
    'const clamp = (value, min, max) => Math.min(max, Math.max(min, value));',
    'const GeneratedComposition = () => {',
    '  const frame = useCurrentFrame();',
    '  return <AbsoluteFill><div style={{',
    '    opacity: interpolate(frame, [0, 9], [0, 1]),',
    '    transform: `scale(${frame}) translateX(${frame}px)`,',
    '  }} /></AbsoluteFill>;',
    '};',
  ].join('\n');
  const input = `${workspace(source)}\n`;

  const first = buildCorpusCensus(input);
  const second = buildCorpusCensus(input);
  assert.equal(first.schemaVersion, 6);
  assert.equal(first.rulesetVersion, 'stylistic-subtree-memory-census-v6');
  assert.equal(first.censusSha256, second.censusSha256);
  assert.equal(first.counts.compositions, 1);
  assert.equal(first.counts.visualSinks, 2);
  assert.equal(first.counts.atomicBehaviourWitnesses, 3);
  assert.equal(first.counts.rejectedNonVisualHelperDeclarations, 1);
  assert.equal(first.counts.mappedBehaviourWitnesses, 0);
  assert.equal(first.counts.infrastructureBehaviourWitnesses, 3);
  assert.deepEqual(
    first.behaviours.filter((entry) => entry.infrastructureKind).map(
      (entry) => entry.infrastructureKind,
    ).sort(),
    ['behaviour.opacity', 'behaviour.scale', 'behaviour.translate'],
  );
  assert.equal(JSON.stringify(first).includes('memoryKind'), false);
  assert.deepEqual(first.memoryCandidates, []);
  assert.deepEqual(inspectPublicArtifact(first), []);
  assert.doesNotMatch(JSON.stringify(first), /private prompt|private-track-id/u);
});

test('content and asset changes reuse one style identity across workspaces', () => {
  const input = [
    workspace(dialogueSource({
      text: 'PRIVATE TRANSCRIPT ALPHA',
      asset: 'https://private.example/alice.jpg',
    }), 'private-a'),
    workspace(dialogueSource({
      text: 'DIFFERENT PRIVATE WORDS',
      asset: 'https://private.example/bob.jpg',
    }), 'private-b'),
  ].join('\n');
  const census = buildCorpusCensus(input);

  assert.equal(census.memoryCandidates.length, 1);
  const [candidate] = census.memoryCandidates;
  assert.match(candidate.candidateKind, /^unit\.dialogue-card\.[a-f0-9]{12}$/u);
  assert.match(candidate.styleFingerprintSha256, /^[a-f0-9]{64}$/u);
  assert.equal(candidate.boundary, 'connected-styled-subtree');
  assert.equal(candidate.witnesses, 2);
  assert.equal(candidate.workspaces, 2);
  assert.equal(candidate.independentReuse, true);
  assert.equal(candidate.eligibility.evidenceReady, true);
  assert.equal(candidate.eligibility.promotionEligible, false);
  assert.ok(candidate.eligibility.blockers.includes('human-feedback-not-provided'));
  assert.doesNotMatch(
    JSON.stringify(census),
    /PRIVATE TRANSCRIPT|DIFFERENT PRIVATE|private\.example/u,
  );
});

test('smallest same-family card boundary survives for two or five dialogue cards', () => {
  const run = (count) => buildCorpusCensus(workspaceWithSources(
    Array.from({ length: count }, (_, index) => nestedDialogueSource(index)),
  ));
  const two = run(2);
  const five = run(5);
  const twoUnits = two.memoryCandidates.filter((candidate) => candidate.kind === 'unit');
  const fiveUnits = five.memoryCandidates.filter((candidate) => candidate.kind === 'unit');

  assert.equal(twoUnits.length, 1);
  assert.equal(fiveUnits.length, 1);
  assert.equal(twoUnits[0].candidateKind, fiveUnits[0].candidateKind);
  assert.equal(twoUnits[0].witnesses, 2);
  assert.equal(fiveUnits[0].witnesses, 5);
  assert.equal(two.counts.stylisticUnitCandidateWitnesses, 2);
  assert.equal(five.counts.stylisticUnitCandidateWitnesses, 5);
  assert.ok(two.compositions.every((composition) => composition.candidateWitnesses === 1));
  assert.ok(five.compositions.every((composition) => composition.candidateWitnesses === 1));
});

test('JSXText and JSX expression payloads are value data, not tree identity', () => {
  const literal = 'const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",bottom:48,background:"#111827",borderRadius:24,boxShadow:"0 18px 50px #000",padding:28,color:"#f8fafc"}}><span style={{fontFamily:"Inter",fontSize:48,fontWeight:700}}>dialogue literal alpha</span></div></AbsoluteFill>';
  const expression = 'const dialogue="private expression payload";const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",bottom:48,background:"#111827",borderRadius:24,boxShadow:"0 18px 50px #000",padding:28,color:"#f8fafc"}}><span style={{fontFamily:"Inter",fontSize:48,fontWeight:700}}>{dialogue}</span></div></AbsoluteFill>';
  const census = buildCorpusCensus([
    workspace(literal, 'literal'),
    workspace(expression, 'expression'),
  ].join('\n'));
  const units = census.memoryCandidates.filter((candidate) => candidate.kind === 'unit');

  assert.equal(units.length, 1);
  assert.equal(units[0].witnesses, 2);
  assert.equal(units[0].structuralVariants, 1);
  assert.equal(units[0].valueVariants, 2);
  assert.doesNotMatch(JSON.stringify(census), /private expression payload/u);
});

test('palette and typography changes produce distinct candidate identities', () => {
  const input = [
    workspace(dialogueSource({ background: '#111827', fontFamily: 'Inter' }), 'a'),
    workspace(dialogueSource({ background: '#7f1d1d', fontFamily: 'Inter' }), 'b'),
    workspace(dialogueSource({ background: '#111827', fontFamily: 'Georgia' }), 'c'),
  ].join('\n');
  const census = buildCorpusCensus(input);

  assert.equal(census.memoryCandidates.length, 3);
  assert.equal(new Set(census.memoryCandidates.map(
    (candidate) => candidate.styleFingerprintSha256,
  )).size, 3);
  assert.ok(census.memoryCandidates.every(
    (candidate) => candidate.eligibility.evidenceReady === false,
  ));
  assert.ok(census.memoryCandidates.every(
    (candidate) => candidate.eligibility.blockers.includes('insufficient-independent-workspaces'),
  ));
});

test('corpus records reusable authored multi-stage Behaviours as single-channel laws', () => {
  const pulseSource = (copy) => `const copy=${JSON.stringify(copy)};const GeneratedComposition=()=>{const frame=useCurrentFrame();const pulse=interpolate(frame,[0,3,6,9],[0,1,.4,0]);return <div data-copy={copy} style={{opacity:pulse}}/>}`;
  const census = buildCorpusCensus([
    workspace(pulseSource('PRIVATE A'), 'pulse-a'),
    workspace(pulseSource('PRIVATE B'), 'pulse-b'),
  ].join('\n'));
  const behaviours = census.memoryCandidates.filter(
    (candidate) => candidate.kind === 'behaviour',
  );

  assert.equal(behaviours.length, 1);
  const [candidate] = behaviours;
  assert.match(candidate.candidateKind, /^behaviour\.staged-curve\.[a-f0-9]{12}$/u);
  assert.equal(candidate.boundary, 'single-stylistic-channel-law');
  assert.equal(candidate.channel, 'opacity');
  assert.deepEqual(candidate.temporalEvidence.drivers, ['keyframes']);
  assert.deepEqual(candidate.temporalEvidence.shapes, ['peak-4-points']);
  assert.equal(candidate.temporalEvidence.singleChannel, true);
  assert.equal(candidate.eligibility.evidenceReady, true);
  assert.equal(candidate.eligibility.promotionEligible, false);
  assert.equal(census.counts.stylisticBehaviourCandidateWitnesses, 2);
});

test('one staged law applied to opacity and scale stays two Behaviour candidates', () => {
  const source = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();const pulse=interpolate(frame,[0,3,6,9],[0,1,.4,0]);return <><div style={{opacity:pulse}}/><div style={{transform:`scale(${pulse})`}}/></>}';
  const census = buildCorpusCensus(workspace(source));
  const behaviours = census.memoryCandidates.filter(
    (candidate) => candidate.kind === 'behaviour',
  );

  assert.equal(behaviours.length, 2);
  assert.deepEqual(behaviours.map((candidate) => candidate.channel).sort(), [
    'opacity',
    'transform.scale',
  ]);
  assert.equal(new Set(behaviours.map((candidate) => candidate.candidateKind)).size, 2);
});

test('bare spring and oscillation mechanics do not become memory Behaviours', () => {
  const source = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();const a=spring({frame,fps:30});const b=.72+.28*Math.sin(frame/6);return <><div style={{opacity:a}}/><div style={{transform:`scale(${b})`}}/></>}';
  const census = buildCorpusCensus(workspace(source));

  assert.deepEqual(census.memoryCandidates, []);
  assert.equal(census.counts.infrastructureBehaviourWitnesses, 2);
});

test('thin CSS leaves and full-frame overlays never become motif candidates', () => {
  const source = 'const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=clamp(frame/10,0,1);return <AbsoluteFill style={{background:"white",opacity}}/>}';
  const census = buildCorpusCensus(workspace(source));

  assert.deepEqual(census.memoryCandidates, []);
  assert.equal(census.counts.mappedBehaviourWitnesses, 0);
  assert.equal(census.counts.infrastructureBehaviourWitnesses, 1);
});
