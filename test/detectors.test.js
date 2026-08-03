import assert from 'node:assert/strict';
import test from 'node:test';

import { RULES, detectMatches, detectSignals } from '../src/detectors.js';
import { extractObservation } from '../src/extract.js';

function extract(source, prompt = '') {
  return extractObservation({
    workspace: { width: 1080, height: 1920, fps: 60, length: 1000 },
    workspaceIndex: 0,
    trackIndex: 0,
    track: { id: 'test', type: 'composition', start: 0, length: 1000, source, meta: { prompt } },
  });
}

test('canonicalizes a white flash into a generic fill unit plus opacity behavior', () => {
  const flash = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,5,10],[0,1,0]);return <AbsoluteFill style={{backgroundColor:"white",opacity}}/>}');
  const staticBackground = extract('const GeneratedComposition=()=> <AbsoluteFill style={{backgroundColor:"white"}}/>');

  assert.deepEqual(detectSignals(flash), ['motion.opacity', 'overlay.solid-fill']);
  assert.deepEqual(detectSignals(staticBackground), ['overlay.solid-fill']);
  assert.equal(detectSignals(flash).some((id) => /WhiteFlash|flashPulse|recipe/i.test(id)), false);
});

test('does not mistake a composition background containing content for a fill unit', () => {
  const observation = extract('const GeneratedComposition=()=> <AbsoluteFill style={{backgroundColor:"black"}}><div>content</div></AbsoluteFill>');
  assert.equal(detectSignals(observation).includes('overlay.solid-fill'), false);
});

test('requires a vignette to be a full-frame edge-darkening layer', () => {
  const vignette = extract('const GeneratedComposition=()=> <div style={{position:"absolute",top:0,right:0,bottom:0,left:0,background:"radial-gradient(circle, transparent 40%, black 100%)"}}/>');
  const maskedRay = extract('const GeneratedComposition=()=> <div style={{position:"absolute",top:200,left:200,width:300,height:300,transform:"rotate(20deg)",maskImage:"radial-gradient(circle, transparent 40%, black 100%)",background:"radial-gradient(circle, transparent 40%, black 100%)"}}/>');

  assert.ok(detectSignals(vignette).includes('overlay.vignette'));
  assert.equal(detectSignals(maskedRay).includes('overlay.vignette'), false);
});

test('does not classify from prompt alone', () => {
  const observation = extract('const GeneratedComposition=()=> <div/>', 'white flash grain kinetic text');
  assert.deepEqual(detectSignals(observation), []);
});

test('does not mistake CSS position for ranking semantics', () => {
  const generic = extract('const GeneratedComposition=()=> <AbsoluteFill><Img src="https://example.test/a.jpg" style={{objectFit:"cover"}}/><div style={{position:"absolute",fontSize:80}}>TITLE</div></AbsoluteFill>');
  const ranking = extract('const RANK=5;const GeneratedComposition=()=> <AbsoluteFill><Img src="https://example.test/a.jpg" style={{objectFit:"cover"}}/><div style={{position:"absolute",opacity:1,transform:"scale(1)"}}><div style={{fontSize:80}}>#{RANK}</div><div>Title</div></div></AbsoluteFill>');

  assert.equal(detectSignals(generic).includes('card.ranking'), false);
  assert.ok(detectSignals(ranking).includes('card.ranking'));
  const rankingMatch = detectMatches(ranking).find((match) => match.id === 'card.ranking');
  assert.equal(rankingMatch.rootKind, 'div');
  assert.ok(rankingMatch.span.end - rankingMatch.span.start < ranking.private.source.length);
});

test('locates a dialogue card surface instead of its whole scene', () => {
  const observation = extract('const dialogue="Hello";const GeneratedComposition=()=> <AbsoluteFill><div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%"}}><div style={{background:"rgba(0,0,0,0.8)",boxShadow:"0 4px 20px black",position:"absolute",bottom:20}}><span style={{fontSize:48}}>{dialogue}</span></div></div></AbsoluteFill>');
  const matches = detectMatches(observation).filter((match) => match.id === 'text.dialogue-card');

  assert.equal(matches.length, 1);
  assert.equal(matches[0].rootKind, 'div');
  assert.ok(matches[0].span.end - matches[0].span.start < observation.private.source.length / 2);
});

test('numeric helpers never become memory entries even when a visual behavior uses them', () => {
  const observation = extract('const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));const lerp=(a,b,t)=>a+(b-a)*t;const msToFrames=(ms)=>ms*60/1000;const half=(n)=>n/2;const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=clamp(lerp(0,1,frame/msToFrames(1000)),0,1);return <div style={{opacity}}/>}');
  const signals = detectSignals(observation);

  assert.deepEqual(signals, ['motion.opacity']);
  assert.equal(signals.some((id) => id.startsWith('util.')), false);
});

test('decomposes fade and scale on one node into two channel behaviors', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);const scale=interpolate(frame,[0,10],[0.8,1]);return <div style={{opacity,transform:`scale(${scale})`}}/>}');

  assert.deepEqual(detectSignals(observation), ['motion.opacity', 'motion.scale']);
  assert.equal(detectSignals(observation).includes('motion.fadeScale'), false);
});

test('keeps opacity and scale on different JSX nodes as independent local atoms', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);const scale=interpolate(frame,[0,10],[0.8,1]);return <AbsoluteFill><div style={{opacity}}/><div style={{transform:`scale(${scale})`}}/></AbsoluteFill>}');
  const matches = detectMatches(observation);

  assert.deepEqual([...new Set(matches.map((match) => match.id))], ['motion.opacity', 'motion.scale']);
  assert.notEqual(matches[0].span.start, matches[1].span.start);
});

test('requires the individual visual channel to be frame-driven', () => {
  const dynamicScale = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const scale=interpolate(frame,[0,10],[0.8,1]);return <div style={{opacity:0.5,transform:`scale(${scale})`}}/>}');
  const dynamicOpacity = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity,transform:"scale(0.8)"}}/>}');

  assert.deepEqual(detectSignals(dynamicScale), ['motion.scale']);
  assert.deepEqual(detectSignals(dynamicOpacity), ['motion.opacity']);
});

test('traces each primitive inside one transform string independently', () => {
  const dynamicScale = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const scale=interpolate(frame,[0,10],[0.8,1]);return <div style={{transform:`scale(${scale}) translateX(10px)`}}/>}');
  const dynamicTranslate = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const x=interpolate(frame,[0,10],[0,100]);return <div style={{transform:`scale(1) translateX(${x}px)`}}/>}');

  assert.deepEqual(detectSignals(dynamicScale), ['motion.scale']);
  assert.deepEqual(detectSignals(dynamicTranslate), ['motion.translate']);
});

test('resolves same-named variables in their lexical component scope', () => {
  const observation = extract('const Static=()=>{const opacity=0.5;return <div style={{opacity}}/>};const Animated=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity}}/>};const GeneratedComposition=()=> <><Static/><Animated/></>');
  const opacityMatches = detectMatches(observation).filter((match) => match.id === 'motion.opacity');

  assert.equal(opacityMatches.length, 1);
});

test('does not treat a static variable merely named frame as animation time', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=0.5;return <div style={{opacity:frame}}/>}');
  assert.deepEqual(detectSignals(observation), []);
});

test('does not mine JSX from an unreachable component', () => {
  const observation = extract('const Unused=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity}}/>};const GeneratedComposition=()=> <div/>');
  assert.deepEqual(detectSignals(observation), []);
});

test('does not mine JSX from an unused function nested in the composition', () => {
  const observation = extract('const GeneratedComposition=()=>{const Unused=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity}}/>};return <div/>}');
  assert.deepEqual(detectSignals(observation), []);
});

test('does mine visual atoms inside an invoked map callback', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <>{[1,2].map((item)=><div key={item} style={{opacity}}/>)}</>}');
  assert.deepEqual(detectSignals(observation), ['motion.opacity']);
});

test('does not assume an unused callback argument is rendered', () => {
  const observation = extract('const GeneratedComposition=()=>{const hidden=useCallback(()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity}}/>},[]);return <div/>}');
  assert.deepEqual(detectSignals(observation), []);
});

test('follows components wrapped in React memo', () => {
  const observation = extract('const Animated=React.memo(()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity}}/>});const GeneratedComposition=()=> <Animated/>');
  assert.deepEqual(detectSignals(observation), ['motion.opacity']);
});

test('keeps distinct formulas as distinct behavior variants', () => {
  const observation = extract('const GeneratedComposition=()=>{const frame=useCurrentFrame();return <><div style={{opacity:frame/10}}/><div style={{opacity:(frame*frame)/100}}/></>}');
  const matches = detectMatches(observation).filter((match) => match.id === 'motion.opacity');

  assert.equal(matches.length, 2);
  assert.notEqual(matches[0].variantHash, matches[1].variantHash);
});

test('every published behavior owns exactly one visual channel', () => {
  const behaviors = RULES.filter((rule) => rule.kind === 'behavior');
  assert.ok(behaviors.length > 0);
  assert.ok(behaviors.every((rule) => rule.atomicity.boundary === 'single-visual-channel'));
  assert.ok(behaviors.every((rule) => rule.writes.length === 1));
  assert.equal(RULES.some((rule) => ['utility', 'recipe'].includes(rule.kind)), false);
});
