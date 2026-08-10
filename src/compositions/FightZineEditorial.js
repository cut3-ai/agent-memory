import { FightZineChartCadence } from '@cut3/agent-memory/behaviours/fight-zine/FightZineChartCadence';
import { FightZineTitleCadence } from '@cut3/agent-memory/behaviours/fight-zine/FightZineTitleCadence';
import { FightNightShutterHit } from '@cut3/agent-memory/behaviours/fight-zine/FightNightShutterHit';
import { MarkerScrawlTrace } from '@cut3/agent-memory/behaviours/fight-zine/MarkerScrawlTrace';
import { MediaRankCadence } from '@cut3/agent-memory/behaviours/fight-zine/MediaRankCadence';
import { RankingTableCadence } from '@cut3/agent-memory/behaviours/fight-zine/RankingTableCadence';
import { Audio } from '@cut3/agent-memory/units/base/Audio';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { FightZineChart } from '@cut3/agent-memory/units/fight-zine/FightZineChart';
import {
  FightZineRankingTable,
  FightZineScoreBadge,
  FightZineScoreCounter,
} from '@cut3/agent-memory/units/fight-zine/FightZineRankingTable';
import {
  FightZineMediaImage,
  MediaRankPlate,
} from '@cut3/agent-memory/units/fight-zine/MediaRankPlate';
import {
  FightZineTitle,
  FightZineTitleWord,
} from '@cut3/agent-memory/units/fight-zine/FightZineTitle';

export function fightZineChart(
  title,
  subtitle,
  risingValue,
  risingLabel,
  fallingValue,
  fallingLabel,
) {
  const unit = new FightZineChart(
    new Text(title),
    new Text(subtitle),
    new Text(risingValue),
    new Text(risingLabel),
    new Text(fallingValue),
    new Text(fallingLabel),
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role }) => new FightZineChartCadence(owner, role),
  );
  const traces = unit.animationTargets().traces.map(
    ({ owner, role }) => new MarkerScrawlTrace(owner, 'chart', role),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  traces.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZineTitle(first, second, third) {
  const unit = new FightZineTitle([
    new FightZineTitleWord(first, 0),
    new FightZineTitleWord(second, 1),
    new FightZineTitleWord(third, 2),
  ]);
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new FightZineTitleCadence(owner, role, index),
  );
  const traces = unit.animationTargets().traces.map(
    ({ owner, role, index }) => new MarkerScrawlTrace(owner, 'title', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  traces.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZineLateralPush(
  firstSource,
  secondSource,
  thirdSource,
  audioSource,
  rank,
  label,
  name,
  descriptor,
) {
  const unit = new MediaRankPlate(
    [
      new FightZineMediaImage(firstSource, 'lateral-push', 0),
      new FightZineMediaImage(secondSource, 'lateral-push', 1),
      new FightZineMediaImage(thirdSource, 'lateral-push', 2),
    ],
    [new Audio(audioSource), new Audio(audioSource)],
    new Text(rank),
    new Text(label),
    new Text(name),
    new Text(descriptor),
    'lateral-push',
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new MediaRankCadence(owner, 'lateral-push', role, index),
  );
  const shutter = unit.animationTargets().shutter.map(
    ({ owner, role, index }) => new FightNightShutterHit(owner, 'lateral-push', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  shutter.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZineForegroundDrift(
  firstSource,
  secondSource,
  thirdSource,
  audioSource,
  rank,
  label,
  name,
  descriptor,
) {
  const unit = new MediaRankPlate(
    [
      new FightZineMediaImage(firstSource, 'foreground-drift', 0),
      new FightZineMediaImage(secondSource, 'foreground-drift', 1),
      new FightZineMediaImage(thirdSource, 'foreground-drift', 2),
    ],
    [new Audio(audioSource), new Audio(audioSource)],
    new Text(rank),
    new Text(label),
    new Text(name),
    new Text(descriptor),
    'foreground-drift',
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new MediaRankCadence(owner, 'foreground-drift', role, index),
  );
  const shutter = unit.animationTargets().shutter.map(
    ({ owner, role, index }) => new FightNightShutterHit(owner, 'foreground-drift', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  shutter.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZineShutterShake(
  firstSource,
  secondSource,
  thirdSource,
  audioSource,
  rank,
  label,
  name,
  descriptor,
) {
  const unit = new MediaRankPlate(
    [
      new FightZineMediaImage(firstSource, 'shutter-shake', 0),
      new FightZineMediaImage(secondSource, 'shutter-shake', 1),
      new FightZineMediaImage(thirdSource, 'shutter-shake', 2),
    ],
    [new Audio(audioSource), new Audio(audioSource)],
    new Text(rank),
    new Text(label),
    new Text(name),
    new Text(descriptor),
    'shutter-shake',
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new MediaRankCadence(owner, 'shutter-shake', role, index),
  );
  const shutter = unit.animationTargets().shutter.map(
    ({ owner, role, index }) => new FightNightShutterHit(owner, 'shutter-shake', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  shutter.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZinePaparazziBurst(
  firstSource,
  secondSource,
  thirdSource,
  audioSource,
  rank,
  label,
  name,
  descriptor,
) {
  const unit = new MediaRankPlate(
    [
      new FightZineMediaImage(firstSource, 'paparazzi-burst', 0),
      new FightZineMediaImage(secondSource, 'paparazzi-burst', 1),
      new FightZineMediaImage(thirdSource, 'paparazzi-burst', 2),
    ],
    [new Audio(audioSource), new Audio(audioSource)],
    new Text(rank),
    new Text(label),
    new Text(name),
    new Text(descriptor),
    'paparazzi-burst',
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new MediaRankCadence(owner, 'paparazzi-burst', role, index),
  );
  const shutter = unit.animationTargets().shutter.map(
    ({ owner, role, index }) => new FightNightShutterHit(owner, 'paparazzi-burst', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  shutter.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZineGoldFinale(
  firstSource,
  secondSource,
  thirdSource,
  audioSource,
  rank,
  label,
  name,
  descriptor,
) {
  const unit = new MediaRankPlate(
    [
      new FightZineMediaImage(firstSource, 'gold-finale', 0),
      new FightZineMediaImage(secondSource, 'gold-finale', 1),
      new FightZineMediaImage(thirdSource, 'gold-finale', 2),
    ],
    [new Audio(audioSource), new Audio(audioSource)],
    new Text(rank),
    new Text(label),
    new Text(name),
    new Text(descriptor),
    'gold-finale',
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new MediaRankCadence(owner, 'gold-finale', role, index),
  );
  const shutter = unit.animationTargets().shutter.map(
    ({ owner, role, index }) => new FightNightShutterHit(owner, 'gold-finale', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  shutter.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}

export function fightZineRankingTable(title, subtitle, rows) {
  const runtimeRows = rows.map((row, index) => ({
    rank: new Text(row.rank),
    name: new Text(row.name),
    score: new FightZineScoreCounter(String(row.baseScore), row.baseScore, row.gain, index),
    badge: new FightZineScoreBadge(new Text(row.gainText), index),
  }));
  const unit = new FightZineRankingTable(
    new Text(title),
    new Text(subtitle),
    runtimeRows,
  );
  const cadence = unit.animationTargets().cadence.map(
    ({ owner, role, index }) => new RankingTableCadence(owner, role, index),
  );
  const traces = unit.animationTargets().traces.map(
    ({ owner, role, index }) => new MarkerScrawlTrace(owner, 'table', role, index),
  );
  cadence.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  traces.forEach((behaviour) => behaviour.unit.addBehaviour(behaviour));
  return unit;
}
