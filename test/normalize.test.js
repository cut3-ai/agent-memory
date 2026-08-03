import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalAstHash, normalizeExactSource, parseComposition } from '../src/normalize.js';

function structuralHash(source) {
  return canonicalAstHash(parseComposition(source).ast.program);
}

test('normalizes local names, data literals, fences and line endings', () => {
  const left = '```jsx\r\nconst items = [{text: "ONE", start: 120}, {text: "TWO", start: 240}];\r\nconst GeneratedComposition = () => <div>{items.map((item) => <span>{item.text}</span>)}</div>;\r\n```';
  const right = '```jsx\nconst words = [{text: "ALPHA", start: 999}, {text: "BETA", start: 333}, {text: "GAMMA", start: 444}];\nconst GeneratedComposition = () => <div>{words.map((word) => <span>{word.text}</span>)}</div>;\n```';

  assert.equal(structuralHash(left), structuralHash(right));
  assert.equal(normalizeExactSource('```js\r\nlet x = 1;\r\n```'), 'let x = 1;');
});

test('preserves animation direction in numeric arrays', () => {
  const fadeIn = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[0,1]);return <div style={{opacity}}/>}';
  const fadeOut = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();const opacity=interpolate(frame,[0,10],[1,0]);return <div style={{opacity}}/>}';

  assert.notEqual(structuralHash(fadeIn), structuralHash(fadeOut));
});

test('preserves binding identity while allowing alpha-renaming', () => {
  const sameBinding = 'const GeneratedComposition=()=>{const a=1;const b=2;return <div>{a+a}</div>}';
  const differentBindings = 'const GeneratedComposition=()=>{const a=1;const b=2;return <div>{a+b}</div>}';
  const renamed = 'const GeneratedComposition=()=>{const left=1;const right=2;return <div>{left+left}</div>}';

  assert.notEqual(structuralHash(sameBinding), structuralHash(differentBindings));
  assert.equal(structuralHash(sameBinding), structuralHash(renamed));
});

test('alpha-normalizes local component names and computed members', () => {
  const left = 'const Card=({value})=><div>{value}</div>;const GeneratedComposition=()=>{const key="x";const data={x:1};return <Card value={data[key]}/>;}';
  const right = 'const Panel=({value})=><div>{value}</div>;const GeneratedComposition=()=>{const field="x";const record={x:1};return <Panel value={record[field]}/>;}';

  assert.equal(structuralHash(left), structuralHash(right));
});

test('parses multiline imports and named exports without executing modules', () => {
  const source = 'import {\n  interpolate\n} from "remotion";\nconst GeneratedComposition=()=> <div/>;\nexport { GeneratedComposition };';
  assert.doesNotThrow(() => parseComposition(source));
});

test('module wrapper formatting does not change structural hash', () => {
  const bare = 'const GeneratedComposition=()=> <div/>;';
  const oneLine = 'import { interpolate } from "remotion";\nconst GeneratedComposition=()=> <div/>;\nexport { GeneratedComposition };';
  const multiline = 'import {\n interpolate\n} from "remotion";\nexport const GeneratedComposition=()=> <div/>;';

  assert.equal(structuralHash(bare), structuralHash(oneLine));
  assert.equal(structuralHash(bare), structuralHash(multiline));
});

test('local bindings that shadow runtime globals still alpha-normalize', () => {
  const left = 'const Text=({value})=><div>{value}</div>;const GeneratedComposition=()=>{const Math=2;return <Text value={Math}/>;}';
  const right = 'const Label=({value})=><div>{value}</div>;const GeneratedComposition=()=>{const amount=2;return <Label value={amount}/>;}';

  assert.equal(structuralHash(left), structuralHash(right));
});
