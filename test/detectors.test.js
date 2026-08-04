import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INFRASTRUCTURE_RULES,
  RULES,
  detectInfrastructureMatches,
  detectInfrastructureSignals,
  detectMatches,
  detectSignals,
} from '../src/detectors.js';
import { extractObservation } from '../src/extract.js';

function extract(source, prompt = '') {
  return extractObservation({
    workspace: { width: 1080, height: 1920, fps: 60, length: 1000 },
    workspaceIndex: 0,
    trackIndex: 0,
    track: {
      id: 'test', type: 'composition', start: 0, length: 1000, source, meta: { prompt },
    },
  });
}

function dialogueSource({
  text = 'A private line',
  asset = 'https://assets.example/a.jpg',
  background = '#111827',
  fontFamily = 'Inter',
} = {}) {
  return `const dialogue=${JSON.stringify(text)};const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",bottom:48,left:48,background:${JSON.stringify(background)},borderRadius:24,boxShadow:"0 18px 50px rgba(0,0,0,.45)",padding:28,color:"#f8fafc"}}><Img src=${JSON.stringify(asset)} style={{width:72,height:72,borderRadius:36,objectFit:"cover"}}/><span style={{fontFamily:${JSON.stringify(fontFamily)},fontSize:48,fontWeight:700,lineHeight:1.1}}>{dialogue}</span></div></AbsoluteFill>`;
}

function rankingSource() {
  return 'const rankNumber=3;const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",left:72,bottom:96,background:"#0b1020",border:"2px solid #7c3aed",borderRadius:32,boxShadow:"0 24px 70px rgba(124,58,237,.35)",color:"#f8fafc",padding:36}}><div style={{fontSize:96,fontWeight:900}}>#{rankNumber}</div><div style={{fontFamily:"Inter",fontSize:42,fontWeight:700}}>Signal over noise</div></div></AbsoluteFill>';
}

test('thin overlays and CSS leaves stay outside memory', () => {
  const flash = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,5,10],[0,1,0]);return <AbsoluteFill style={{backgroundColor:"white",opacity}}/>}');
  const vignette = extract('const GeneratedComposition=()=> <div style={{position:"absolute",inset:0,background:"radial-gradient(circle, transparent 40%, black 100%)"}}/>');

  assert.deepEqual(detectSignals(flash), []);
  assert.deepEqual(detectSignals(vignette), []);
  assert.deepEqual(detectInfrastructureSignals(flash), ['motion.opacity']);
});

test('numeric helpers never become memory even when used by visual infrastructure', () => {
  const observation = extract('const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));const lerp=(a,b,t)=>a+(b-a)*t;const msToFrames=(ms)=>ms*60/1000;const half=(n)=>n/2;const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=clamp(lerp(0,1,frame/msToFrames(1000)),0,1);return <div style={{opacity}}/>}');

  assert.deepEqual(detectSignals(observation), []);
  assert.deepEqual(detectInfrastructureSignals(observation), ['motion.opacity']);
});

test('fade and scale remain two atomic infrastructure channels', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);const scale=interpolate(frame,[0,10],[0.8,1]);return <div style={{opacity,transform:`scale(${scale})`}}/>}');
  const matches = detectInfrastructureMatches(observation);

  assert.deepEqual([...new Set(matches.map((match) => match.id))], [
    'motion.opacity',
    'motion.scale',
  ]);
  assert.equal(matches.some((match) => /fade.?scale/i.test(match.id)), false);
  assert.notEqual(matches[0].variantHash, matches[1].variantHash);
});

test('discovers bounded stylistic timing laws without combining their channels', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const pulse=.75+.25*Math.sin(frame/6);const staged=interpolate(frame,[0,8,16,24],[0,18,3,12]);const bounce=spring({frame,fps:60,config:{damping:8,stiffness:180}});return <><div style={{opacity:pulse}}/><div style={{transform:`scale(${pulse})`}}/><div style={{transform:`rotate(${staged}deg)`}}/><div style={{transform:`translateX(${bounce}px)`}}/></>}');
  const matches = detectMatches(observation).filter((match) => match.kind === 'behaviour');

  assert.deepEqual([...new Set(matches.map((match) => match.id))], [
    'motif.behaviour.authored-spring-law',
    'motif.behaviour.oscillatory-law',
    'motif.behaviour.staged-curve',
  ]);
  assert.equal(matches.length, 4);
  assert.ok(matches.every((match) => match.writes.length === 1));
  assert.ok(matches.every((match) => match.temporalEvidence.singleChannel === true));
  assert.equal(new Set(matches.map((match) => match.temporalFingerprintSha256)).size, 4);
  assert.deepEqual(matches.filter(
    (match) => match.family === 'oscillatory-law',
  ).map((match) => match.channel).sort(), ['opacity', 'transform.scale']);
});

test('static channels and unreachable JSX are ignored', () => {
  const staticStyle = extract('const GeneratedComposition=()=> <div style={{opacity:0.5,transform:"scale(.8)"}}/>');
  const unreachable = extract(`const dialogue="unused";const Unused=()=>${dialogueSource().match(/<AbsoluteFill>[\s\S]*/u)[0]};const GeneratedComposition=()=> <div/>`);

  assert.deepEqual(detectInfrastructureSignals(staticStyle), []);
  assert.deepEqual(detectSignals(unreachable), []);
});

test('detects an authored ranking motif at its connected subtree boundary', () => {
  const observation = extract(rankingSource());
  const matches = detectMatches(observation);

  assert.deepEqual(detectSignals(observation), ['motif.ranking-card']);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].family, 'ranking-card');
  assert.equal(matches[0].occurrenceKind, 'connected-styled-subtree');
  assert.equal(matches[0].treeEvidence.connected, true);
  assert.equal(matches[0].treeEvidence.directChildren, 2);
  assert.ok(matches[0].span.end - matches[0].span.start < observation.private.source.length);
});

test('semantic names without an authored child hierarchy do not create a motif', () => {
  const semanticLeaf = extract('const rankNumber=1;const GeneratedComposition=()=> <div style={{position:"absolute",color:"white",fontSize:80}}>#{rankNumber}</div>');
  const genericTree = extract('const GeneratedComposition=()=> <div style={{position:"absolute",background:"#111",borderRadius:20,color:"white"}}><div style={{fontSize:80}}>1</div><div>Title</div></div>');

  assert.deepEqual(detectSignals(semanticLeaf), []);
  assert.deepEqual(detectSignals(genericTree), []);
});

test('locates the dialogue surface instead of its enclosing scene', () => {
  const observation = extract(dialogueSource());
  const [match] = detectMatches(observation);

  assert.equal(match.id, 'motif.dialogue-card');
  assert.equal(match.rootKind, 'div');
  assert.equal(match.treeEvidence.directChildren, 2);
  assert.ok(match.span.end - match.span.start < observation.private.source.length * 0.8);
});

test('detects one styled timed-text item, not a cardinality-specific sequence', () => {
  const source = 'const words=["one","two"];const startFrame=12;const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",left:120,top:240,color:"#facc15",fontSize:64,fontWeight:900,textShadow:"0 5px 20px #000"}}><span style={{fontFamily:"Impact",letterSpacing:2}}>{words[startFrame>0?0:1]}</span></div></AbsoluteFill>';
  const observation = extract(source);

  assert.deepEqual(detectSignals(observation), ['motif.timed-text-card']);
  assert.equal(detectMatches(observation)[0].treeEvidence.directChildren, 1);
});

test('style identity ignores content and assets but preserves colors and typography', () => {
  const first = detectMatches(extract(dialogueSource({
    text: 'First confidential transcript',
    asset: 'https://private.example/alice.png',
  })))[0];
  const contentVariant = detectMatches(extract(dialogueSource({
    text: 'Completely different words',
    asset: 'https://private.example/bob.png',
  })))[0];
  const paletteVariant = detectMatches(extract(dialogueSource({
    background: '#7f1d1d',
  })))[0];
  const typographyVariant = detectMatches(extract(dialogueSource({
    fontFamily: 'Georgia',
  })))[0];

  assert.equal(first.styleFingerprintProven, true);
  assert.equal(first.styleFingerprintSha256, contentVariant.styleFingerprintSha256);
  assert.notEqual(first.styleFingerprintSha256, paletteVariant.styleFingerprintSha256);
  assert.notEqual(first.styleFingerprintSha256, typographyVariant.styleFingerprintSha256);
  assert.match(first.styleFingerprintSha256, /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(first), /private\.example|confidential transcript/u);
});

test('published memory rules are bounded motifs and infrastructure rules own one channel', () => {
  assert.ok(RULES.length > 0);
  assert.ok(RULES.filter((rule) => rule.kind === 'unit').every(
    (rule) => rule.atomicity.boundary === 'connected-styled-subtree',
  ));
  assert.ok(RULES.filter((rule) => rule.kind === 'behaviour').every(
    (rule) => rule.atomicity.boundary === 'single-stylistic-channel',
  ));
  assert.ok(INFRASTRUCTURE_RULES.every((rule) => rule.kind === 'infrastructure-behaviour'));
  assert.ok(INFRASTRUCTURE_RULES.every((rule) => rule.writes.length === 1));
  assert.equal(JSON.stringify({ RULES, INFRASTRUCTURE_RULES }).includes('confidence'), false);
});
