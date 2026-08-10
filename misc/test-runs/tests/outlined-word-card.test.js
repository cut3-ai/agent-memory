import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { WordCueState } from '@cut3/agent-memory/behaviours/outlined-word-card/WordCueState';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { outlinedWordCard } from '@cut3/agent-memory/compositions/OutlinedWordCard';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import {
  OutlinedWordGroup,
  outlinedWordCardUnitRenderers,
} from '@cut3/agent-memory/units/outlined-word-card/OutlinedWordGroup';

const FPS = 60;
const HEIGHT = 1920;
const WIDTH = 1080;
const POSITIONS = Object.freeze({
  1: Object.freeze([[50, 50]]),
  2: Object.freeze([[30, 50], [70, 50]]),
  3: Object.freeze([[30, 42], [70, 42], [50, 62]]),
  4: Object.freeze([[30, 40], [70, 40], [30, 62], [70, 62]]),
});
const CORPUS_CASES = Object.freeze([
  corpusCase(330,
    [34, 42, 50, 55, 68, 79, 84, 97, 143, 157, 172, 217, 260, 271],
    [1, 4, 3, 5, 3, 3, 3, 5, 5, 4, 10, 5, 4, 9]),
  corpusCase(150,
    [2, 8, 24, 32, 41, 53, 67, 76, 82, 86, 95, 98, 106],
    [1, 7, 4, 2, 3, 5, 4, 2, 3, 4, 2, 3, 5]),
  corpusCase(300,
    [12, 36, 41, 48, 54, 144, 151, 179, 188, 210, 215, 230],
    [2, 3, 3, 2, 11, 2, 5, 3, 5, 3, 6, 5]),
  corpusCase(210,
    [6, 11, 22, 61, 68, 76, 94, 121, 122, 130, 139, 161, 166, 175],
    [1, 3, 12, 2, 3, 7, 4, 3, 3, 3, 7, 2, 3, 5]),
  corpusCase(120, [25, 34, 47, 65, 73, 90], [3, 3, 5, 3, 4, 5]),
  corpusCase(210,
    [22, 23, 32, 48, 58, 101, 108, 114, 128, 143, 143, 143, 145, 150, 162, 170, 191],
    [5, 3, 5, 3, 5, 3, 3, 3, 8, 2, 2, 4, 2, 3, 4, 5, 7]),
  corpusCase(132, [4, 17, 44, 52, 62, 77, 89, 102], [3, 5, 1, 4, 7, 2, 3, 4]),
  corpusCase(228,
    [12, 12, 18, 23, 41, 48, 64, 124, 157, 182, 182, 184],
    [3, 4, 3, 5, 2, 3, 6, 8, 6, 8, 6, 8]),
  corpusCase(100, [7, 38, 56, 64, 77, 88, 96], [8, 6, 1, 5, 4, 2, 4]),
  corpusCase(260,
    [1, 11, 17, 17, 17, 18, 34, 49, 65, 80, 104, 108, 122, 155, 158, 169, 180, 202, 211],
    [3, 4, 4, 3, 3, 5, 7, 8, 5, 7, 1, 5, 7, 1, 5, 6, 8, 2, 3]),
]);

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

test('outlined word builder is guard/style-free and attaches semantic cue owners in order', () => {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\||\?\?/u;
  const styleTokens = /(?:font|stroke|shadow|frame|paint|pose|opacity|present|style)/iu;
  assert.doesNotMatch(outlinedWordCard.toString(), forbidden);
  assert.doesNotMatch(outlinedWordCard.toString(), styleTokens);

  const fixture = corpusCase(50, [4, 9, 12, 15, 20], [5, 6, 4, 3, 5]);
  const words = runtimeCopy(fixture.lengths);
  const unit = outlinedWordCard(words, fixture.cues);
  assert.ok(unit instanceof OutlinedWordGroup);
  assert.deepEqual(unit.runtimeWords().map((word) => word.text), words);
  assert.equal(unit.behaviours.length, 0);
  assert.ok(Object.isFrozen(unit.animationTargets()));
  assert.deepEqual(unit.animationTargets().map(({ index, role }) => ({ index, role })), [
    { index: 0, role: 'word-cue' },
    { index: 1, role: 'word-cue' },
    { index: 2, role: 'word-cue' },
    { index: 3, role: 'word-cue' },
    { index: 4, role: 'word-cue' },
  ]);
  unit.animationTargets().forEach(({ owner, word }, index) => {
    assert.equal(owner.constructor.kind, 'unit.outlined-word-card.cued-word');
    assert.equal(word, unit.runtimeWords()[index]);
    assert.deepEqual(word.behaviours, []);
    assert.equal(owner.behaviours.length, 1);
    assert.ok(owner.behaviours[0] instanceof WordCueState);
    assert.equal(owner.behaviours[0].unit, owner);
  });
});

test('bare semantic outlined word tree has named roles and zero hidden Behaviours', () => {
  const fixture = corpusCase(40, [3, 7, 11, 15, 22, 29], [1, 2, 3, 4, 5, 6]);
  const content = runtimeCopy(fixture.lengths);
  const unit = new OutlinedWordGroup(content, fixture.cues);
  const kinds = [];
  visitUnits(unit, (child) => kinds.push(...child.behaviours.map((entry) => entry.constructor.kind)));
  assert.deepEqual(kinds, []);
  assert.deepEqual(unit.runtimeWords().map((word) => word.text), content);
  assert.deepEqual(Object.keys(unit).sort(), ['present', 'style']);
  assert.equal(unit.animationTargets().length, content.length);
  assert.equal(new Set(unit.animationTargets().map(({ owner }) => owner)).size, content.length);
  unit.animationTargets().forEach(({ owner, word }) => {
    assert.deepEqual(Object.keys(owner).sort(), ['present', 'style']);
    assert.deepEqual(Object.keys(word).sort(), ['present', 'style', 'text']);
  });
});

test('semantic cue state preserves exact slots, direct style and same-frame handoff', () => {
  const fixture = corpusCase(50, [4, 9, 12, 15, 20], [5, 6, 4, 3, 5]);
  const unit = outlinedWordCard(runtimeCopy(fixture.lengths), fixture.cues);
  const composition = compositionFor(unit, fixture.duration);
  const [first, second, third, fourth, fifth] = unit.animationTargets();

  assert.equal(state(composition, first.owner, 3).present, false);
  assert.equal(state(composition, first.owner, 4).present, true);
  assert.equal(state(composition, second.owner, 8).present, false);
  assert.equal(state(composition, second.owner, 9).present, true);
  assert.equal(state(composition, first.owner, 20).present, false);
  assert.equal(state(composition, fourth.owner, 20).present, false);
  assert.equal(state(composition, fifth.owner, 20).present, true);

  const firstOwner = state(composition, first.owner, 10);
  const firstText = state(composition, first.word, 10);
  assert.equal(firstOwner.style.left, '30%');
  assert.equal(firstOwner.style.top, '40%');
  assert.equal(firstOwner.style.width, 'auto');
  assert.equal(firstOwner.style.height, 'auto');
  assert.equal(firstOwner.style.transform, 'translate(-50%, -50%)');
  assert.equal(firstText.style.fontFamily, 'TheBoldFont, system-ui, sans-serif');
  assert.equal(firstText.style.fontSize, '132px');
  assert.equal(firstText.style.WebkitTextStroke, '12px #000');
  assert.equal(firstText.style.lineHeight, 'normal');
  assert.equal(firstText.style.paintOrder, 'stroke');
  assert.equal(firstText.style.textShadow, '0px 6px 24px rgba(0,0,0,0.6)');

  const terminalOwner = state(composition, fifth.owner, 24);
  assert.equal(terminalOwner.style.left, '50%');
  assert.equal(terminalOwner.style.top, '50%');

  const genericUnit = outlinedWordCard(runtimeCopy(fixture.lengths), fixture.cues);
  const generic = createReactDriver(React).render(genericUnit, frameContext(composition, 10));
  assert.equal(nodesOfType(generic, 'div').length, 0);
  assert.equal(findTextWithParent(generic, first.word.text), null);

  const nativeDriver = createReactDriver(React, {
    unitRenderers: outlinedWordCardUnitRenderers,
  });
  const rendered = nativeDriver.render(composition, { frame: 10 });
  assert.deepEqual(familyNodes(rendered).map((node) => node.props['data-outlined-word-card']), [
    'group', 'cue', 'word', 'cue', 'word',
  ]);
  const renderedFirst = findTextWithParent(rendered, first.word.text);
  assert.equal(renderedFirst.parent.props.style.left, '30%');
  assert.equal(renderedFirst.parent.props.style.top, '40%');
  assert.equal(renderedFirst.parent.props.style.transform, 'translate(-50%, -50%)');
  assert.equal(renderedFirst.node.props.style.position, undefined);
  assert.equal(renderedFirst.node.props.style.paintOrder, 'stroke');
  assert.equal(renderedFirst.node.props.style.lineHeight, 'normal');
  assert.equal(renderedFirst.node.props.style.WebkitTextStroke, '12px #000');
  assert.equal(renderedFirst.node.props.style.textShadow, '0px 6px 24px rgba(0,0,0,0.6)');

  const handoff = nativeDriver.render(composition, { frame: 20 });
  assert.deepEqual(familyNodes(handoff).map((node) => node.props['data-outlined-word-card']), [
    'group', 'cue', 'word',
  ]);
  assert.ok(findTextWithParent(handoff, fifth.word.text));
  assert.equal(findTextWithParent(handoff, fourth.word.text), null);
});

test('all ten cue sheets project and roll back deterministically for 2040 authored frames', () => {
  assert.equal(CORPUS_CASES.length, 10);
  assert.equal(CORPUS_CASES.reduce((sum, fixture) => sum + fixture.duration, 0), 2040);
  let projectedFrames = 0;
  for (const fixture of CORPUS_CASES) {
    const unit = outlinedWordCard(runtimeCopy(fixture.lengths), fixture.cues);
    const composition = compositionFor(unit, fixture.duration);
    const targets = unit.animationTargets();
    const ownerBaselines = targets.map(({ owner }) => JSON.stringify({
      present: owner.present,
      style: owner.style,
    }));
    const wordBaselines = targets.map(({ word }) => JSON.stringify({
      present: word.present,
      style: word.style,
      text: word.text,
    }));

    for (let frame = 0; frame < fixture.duration; frame += 1) {
      const projection = projectFrame(composition, frameContext(composition, frame));
      projectedFrames += 1;
      let visible = 0;
      targets.forEach(({ cue, owner, word }, index) => {
        const ownerState = projection.stateOf(owner);
        const wordState = projection.stateOf(word);
        const expectedPresent = frame >= cue.appearFrame && frame < cue.disappearFrame;
        visible += expectedPresent ? 1 : 0;
        assert.equal(ownerState.present, expectedPresent);
        assertExactOwnerState(ownerState, cue);
        assertExactWordState(wordState, fixture.lengths[index], cue.groupSize);
        assert.equal(JSON.stringify({
          present: owner.present,
          style: owner.style,
        }), ownerBaselines[index]);
        assert.equal(JSON.stringify({
          present: word.present,
          style: word.style,
          text: word.text,
        }), wordBaselines[index]);
      });
      assert.equal(visible, expectedVisibleCount(frame, fixture.cues));
    }

    const sampleFrames = [fixture.duration - 1, 0, Math.floor(fixture.duration / 2), 0];
    const firstTarget = targets[0];
    const snapshots = sampleFrames.map((frame) => JSON.stringify(
      projectFrame(composition, frameContext(composition, frame)).stateOf(firstTarget.owner),
    ));
    assert.equal(snapshots[1], snapshots[3]);
  }
  assert.equal(projectedFrames, 2040);
});

test('F14 sources expose no legacy DOM DSL, exported cue wrappers or positional lookups', async () => {
  const files = [
    new URL('../../../src/units/outlined-word-card/OutlinedWordGroup.js', import.meta.url),
    new URL('../../../src/behaviours/outlined-word-card/WordCueState.js', import.meta.url),
    new URL('../../../src/compositions/OutlinedWordCard.js', import.meta.url),
  ];
  const [unitSource, behaviourSource, builderSource] = await Promise.all(
    files.map((file) => readFile(file, 'utf8')),
  );
  assert.equal((unitSource.match(/\bexport\s+class\b/gu) ?? []).length, 1);
  assert.equal((behaviourSource.match(/\bexport\s+class\b/gu) ?? []).length, 1);
  assert.doesNotMatch(`${unitSource}\n${behaviourSource}\n${builderSource}`, /\.(?:units|children)\s*\[/u);
  assert.doesNotMatch(builderSource, /(?:typography|paint|pose|effects|frame)\s*[:=]/u);
  assert.doesNotMatch(unitSource, /units\/base\/(?:Layer|Text|visual)/u);
  assert.doesNotMatch(unitSource, /\b(?:extends\s+(?:Layer|Text)|visual\s*\()/u);
  assert.match(unitSource, /outlinedWordCardUnitRenderers/u);
});

function corpusCase(duration, starts, lengths) {
  return Object.freeze({
    cues: cueSheet(duration, starts),
    duration,
    lengths: Object.freeze(lengths),
  });
}

function cueSheet(duration, starts) {
  return Object.freeze(starts.map((appearFrame, index) => {
    const groupStart = Math.floor(index / 4) * 4;
    const nextGroupStart = groupStart + 4;
    return Object.freeze({
      appearFrame,
      disappearFrame: starts[nextGroupStart] ?? duration,
      groupSize: Math.min(4, starts.length - groupStart),
      slot: index - groupStart,
    });
  }));
}

function runtimeCopy(lengths) {
  return lengths.map((length, index) => String.fromCharCode(65 + (index % 26)).repeat(length));
}

function compositionFor(unit, duration) {
  return new Composition(unit, { duration, fps: FPS, height: HEIGHT, width: WIDTH });
}

function frameContext(composition, frame) {
  return {
    duration: composition.duration,
    fps: composition.fps,
    frame,
    height: composition.height,
    width: composition.width,
  };
}

function state(composition, unit, frame) {
  return projectFrame(composition, frameContext(composition, frame)).stateOf(unit);
}

function assertExactOwnerState(ownerState, cue) {
  const [xPercent, yPercent] = POSITIONS[cue.groupSize][cue.slot];
  assert.equal(ownerState.style.left, `${xPercent}%`);
  assert.equal(ownerState.style.top, `${yPercent}%`);
  assert.equal(ownerState.style.width, 'auto');
  assert.equal(ownerState.style.height, 'auto');
  assert.equal(ownerState.style.position, 'absolute');
  assert.equal(ownerState.style.transform, 'translate(-50%, -50%)');
}

function assertExactWordState(wordState, textLength, groupSize) {
  const availableWidth = groupSize === 1 ? 980 : 500;
  const fontSize = Math.max(56, Math.min(132, Math.round(availableWidth / (textLength * 0.6))));
  assert.ok(Number.isFinite(fontSize));
  assert.equal(wordState.present, true);
  assert.equal(wordState.style.width, 'auto');
  assert.equal(wordState.style.height, 'auto');
  assert.equal(wordState.style.color, '#fff');
  assert.equal(wordState.style.fontFamily, 'TheBoldFont, system-ui, sans-serif');
  assert.equal(wordState.style.fontSize, `${fontSize}px`);
  assert.equal(wordState.style.WebkitTextStroke, `${Math.round(fontSize * 0.09)}px #000`);
  assert.equal(wordState.style.whiteSpace, 'nowrap');
  assert.equal(wordState.style.paintOrder, 'stroke');
}

function expectedVisibleCount(frame, cues) {
  return cues.filter((cue) => frame >= cue.appearFrame && frame < cue.disappearFrame).length;
}

function findTextWithParent(root, content, parent = null) {
  if (root?.children?.includes(content)) return { node: root, parent };
  for (const child of root?.children ?? []) {
    const match = findTextWithParent(child, content, root);
    if (match) return match;
  }
  return null;
}

function familyNodes(root) {
  if (Array.isArray(root)) return root.flatMap(familyNodes);
  if (!root || typeof root !== 'object') return [];
  const current = root.props?.['data-outlined-word-card'] ? [root] : [];
  return [...current, ...familyNodes(root.children)];
}

function nodesOfType(root, type) {
  if (Array.isArray(root)) return root.flatMap((value) => nodesOfType(value, type));
  if (!root || typeof root !== 'object') return [];
  const current = root.type === type ? [root] : [];
  return [...current, ...nodesOfType(root.children, type)];
}
