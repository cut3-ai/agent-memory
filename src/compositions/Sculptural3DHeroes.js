import { HeartPulseOrbit } from '@cut3/agent-memory/behaviours/sculptural-3d/HeartPulseOrbit';
import { InkTendrilReveal } from '@cut3/agent-memory/behaviours/sculptural-3d/InkTendrilReveal';
import { ScissorSnapFlight } from '@cut3/agent-memory/behaviours/sculptural-3d/ScissorSnapFlight';
import { ScissorsStageCadence } from '@cut3/agent-memory/behaviours/sculptural-3d/ScissorsStageCadence';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { InkTendrilPlane } from '@cut3/agent-memory/units/sculptural-3d/InkTendrilPlane';
import { SculpturalHeartHero } from '@cut3/agent-memory/units/sculptural-3d/SculpturalHeartHero';
import { SculpturalScissorsHero } from '@cut3/agent-memory/units/sculptural-3d/SculpturalScissorsHero';
import { SculpturalScissorsStage } from '@cut3/agent-memory/units/sculptural-3d/SculpturalScissorsStage';

/** Plain application output for the slower authored beat pulse. */
export function slowPulseHeartHero() {
  const unit = new SculpturalHeartHero('slow-pulse');
  const behaviours = unit.animationTargets().map(({ owner }) => (
    new HeartPulseOrbit(owner)
  ));

  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}

/** Plain application output for the faster authored beat pulse. */
export function fastPulseHeartHero() {
  const unit = new SculpturalHeartHero('fast-pulse');
  const behaviours = unit.animationTargets().map(({ owner }) => (
    new HeartPulseOrbit(owner)
  ));

  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}

/** Plain application output for the fly-in, snap and collapse scissors hero. */
export function impactScissorsHero() {
  const unit = new SculpturalScissorsHero('impact');
  const behaviours = unit.animationTargets().map(({ owner }) => (
    new ScissorSnapFlight(owner)
  ));

  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}

/** Plain application output for the floating minimal-metal scissors hero. */
export function minimalScissorsHero() {
  const unit = new SculpturalScissorsHero('minimal');
  const behaviours = unit.animationTargets().map(({ owner }) => (
    new ScissorSnapFlight(owner)
  ));

  behaviours.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}

/** Plain full-occurrence output for the impact sculpture and four runtime copy slots. */
export function impactScissorsStage(lead, mark, trail, subtitle) {
  const copy = {
    lead: new Text(lead),
    mark: new Text(mark),
    trail: new Text(trail),
    subtitle: new Text(subtitle),
  };
  const unit = new SculpturalScissorsStage(copy, 'impact');
  const sceneCadences = unit.scene.motionTargets().map(({ owner }) => (
    new ScissorSnapFlight(owner)
  ));
  const stageCadences = unit.animationTargets().map(({ owner }) => (
    new ScissorsStageCadence(owner)
  ));

  sceneCadences.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  stageCadences.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}

/** Plain full-occurrence output for the minimal sculpture and four runtime copy slots. */
export function minimalScissorsStage(lead, mark, trail, subtitle) {
  const copy = {
    lead: new Text(lead),
    mark: new Text(mark),
    trail: new Text(trail),
    subtitle: new Text(subtitle),
  };
  const unit = new SculpturalScissorsStage(copy, 'minimal');
  const sceneCadences = unit.scene.motionTargets().map(({ owner }) => (
    new ScissorSnapFlight(owner)
  ));
  const stageCadences = unit.animationTargets().map(({ owner }) => (
    new ScissorsStageCadence(owner)
  ));

  sceneCadences.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  stageCadences.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));

  return unit;
}

/** Plain application output for the authored procedural ink treatment. */
export function inkTendrilPlane() {
  const unit = new InkTendrilPlane();
  const plane = unit.plane;
  const behaviour = new InkTendrilReveal(plane);

  plane.addBehaviour(behaviour);

  return unit;
}
