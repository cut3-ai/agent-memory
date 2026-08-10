import { EmulsionDrift } from '@cut3/agent-memory/behaviours/turbulent-emulsion/EmulsionDrift';
import { EmulsionFlicker } from '@cut3/agent-memory/behaviours/turbulent-emulsion/EmulsionFlicker';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { Video } from '@cut3/agent-memory/units/base/Video';
import { EmulsionOverlay } from '@cut3/agent-memory/units/turbulent-emulsion/EmulsionOverlay';
import { HandwrittenEmulsionTitle } from '@cut3/agent-memory/units/turbulent-emulsion/HandwrittenEmulsionTitle';

/** Plain application output for the seven authored runtime cue words. */
export function handwrittenEmulsionTitle(words) {
  const texts = words.map((word) => new Text(word));
  const unit = new HandwrittenEmulsionTitle(texts, 'handwritten-cues');

  attachEmulsionLaws(unit);

  return unit;
}

/** Plain application output for the content-free subtle grain field. */
export function softGrainEmulsion() {
  const unit = new EmulsionOverlay(undefined, 'soft-grain');

  attachEmulsionLaws(unit);

  return unit;
}

/** Plain application output for one runtime stock-video slot. */
export function stockVideoEmulsion(source) {
  const video = new Video(source);
  const unit = new EmulsionOverlay(video, 'stock-video');

  attachEmulsionLaws(unit);

  return unit;
}

/** Plain application output for the content-free dense grain field. */
export function denseGrainEmulsion() {
  const unit = new EmulsionOverlay(undefined, 'dense-grain');

  attachEmulsionLaws(unit);

  return unit;
}

/** Plain application output for the content-free driven grain field. */
export function drivenGrainEmulsion() {
  const unit = new EmulsionOverlay(undefined, 'driven-grain');

  attachEmulsionLaws(unit);

  return unit;
}

/** Plain application output for the content-free neon heart trace. */
export function neonEmulsionTrace() {
  const unit = new HandwrittenEmulsionTitle([], 'neon-trace');

  attachEmulsionLaws(unit);

  return unit;
}

function attachEmulsionLaws(unit) {
  const targets = unit.animationTargets();
  const drifts = targets.drift.map(({ owner }) => new EmulsionDrift(owner));
  const flickers = targets.flicker.map(({ owner }) => new EmulsionFlicker(owner));

  drifts.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  flickers.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
}
