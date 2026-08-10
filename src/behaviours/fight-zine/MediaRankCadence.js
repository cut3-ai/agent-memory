import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  interpolateRange,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import {
  fightZineMediaRecipes,
  requireMediaRankTarget,
} from '@cut3/agent-memory/units/fight-zine/MediaRankPlate';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const LEFT_CLAMP = Object.freeze({ extrapolateLeft: 'clamp' });

/** Complete cross-dissolve, editorial copy and gold-finale motion law. */
export class MediaRankCadence extends Behaviour {
  static kind = 'behaviour.fight-zine.media-rank-cadence';

  #index;
  #recipe;
  #role;

  constructor(unit, recipe, role, index = 0) {
    super(requireMediaOwner(unit, recipe, role, index));
    this.#recipe = String(recipe);
    this.#role = String(role);
    this.#index = Number(index);
  }

  onFrame({ duration, fps, frame }) {
    const spec = fightZineMediaRecipes[this.#recipe];
    if (this.#role === 'stage') {
      const exitStart = duration - Math.round(fps * (this.#recipe === 'gold-finale' ? 0.5 : 0.45));
      this.unit.opacity = interpolateRange(frame, [exitStart, duration - 1], [1, 0], {
        ...CLAMP,
        easing: cubicIn,
      });
      return;
    }
    if (this.#role === 'image') {
      applyImage(this.unit, this.#recipe, this.#index, frame, fps, duration, spec.fadeSeconds);
      return;
    }
    if (this.#role === 'foreground') {
      this.unit.pose = {
        ...this.unit.pose,
        operations: [{
          kind: 'translate-x',
          value: `${interpolateRange(frame, [0, duration], [18, -18])}px`,
        }],
      };
      return;
    }
    if (this.#role === 'rank' || this.#role === 'rank-stage') {
      applyRank(this.unit, this.#recipe, this.#role, frame, fps);
      return;
    }
    if (this.#role === 'label' || this.#role === 'label-rule') {
      applyLabel(this.unit, this.#recipe, this.#role, frame, fps);
      return;
    }
    if (this.#role === 'nameplate') {
      const delay = this.#recipe === 'shutter-shake'
        ? 20
        : this.#recipe === 'gold-finale'
          ? 38
          : 22;
      const amount = springValue({
        frame: frame - delay,
        fps,
        config: { damping: 20, stiffness: 110 },
      });
      this.unit.opacity = amount;
      this.unit.pose = {
        ...this.unit.pose,
        operations: [{
          kind: 'translate-y',
          value: `${interpolateRange(amount, [0, 1], [80, 0])}px`,
        }],
      };
      return;
    }
    if (this.#role === 'gold-rays' || this.#role === 'gold-glow') {
      const glow = interpolateRange(frame, [0, 30], [0, 1], CLAMP);
      if (this.#role === 'gold-rays') {
        this.unit.opacity = glow * (0.18 + (Math.sin(frame * 0.06) * 0.05));
        this.unit.rotation = frame * 0.25;
      } else {
        this.unit.opacity = glow;
      }
      return;
    }
    if (this.#role === 'crown') {
      const amount = springValue({
        frame: frame - 30,
        fps,
        config: { damping: 14, stiffness: 120 },
      });
      this.unit.opacity = amount;
      this.unit.offsetY = interpolateRange(amount, [0, 1], [-260, 0]);
      return;
    }
    applyParticle(this.unit, this.#index, frame);
  }
}

function applyImage(unit, recipe, index, frame, fps, duration, fadeSeconds) {
  const segment = duration / 3;
  const start = index * segment;
  const local = frame - start;
  const fade = Math.round(fps * fadeSeconds);
  const inOpacity = index === 0
    ? 1
    : interpolateRange(local, [0, fade], [0, 1], CLAMP);
  const outOpacity = index === 2
    ? 1
    : interpolateRange(local, [segment - fade, segment], [1, 0], CLAMP);
  const opacity = Math.min(inOpacity, outOpacity);
  const saturate = recipe === 'shutter-shake'
    ? interpolateRange(frame, [0, 12], [0.15, 1.12], CLAMP)
    : recipe === 'gold-finale'
      ? interpolateRange(frame, [0, 18], [0.2, 1.08], CLAMP)
      : interpolateRange(frame, [0, 14], [0.2, 1.05], CLAMP);
  const contrast = recipe === 'shutter-shake' ? 1.15 : 1.1;
  let scale;
  let x = 0;
  if (recipe === 'lateral-push') {
    scale = interpolateRange(local, [0, segment], [1.18, 1.34], LEFT_CLAMP);
    x = interpolateRange(local, [0, segment], index % 2 ? [24, -24] : [-24, 24]);
  } else if (recipe === 'foreground-drift') {
    scale = interpolateRange(local, [0, segment], [1.16, 1.24], LEFT_CLAMP);
    x = interpolateRange(local, [0, segment], index % 2 ? [-50, 50] : [50, -50]);
  } else if (recipe === 'shutter-shake') {
    scale = interpolateRange(local, [0, segment], [1.42, 1.2], LEFT_CLAMP)
      + interpolateRange(local, [0, segment], [0, 0.1]);
  } else if (recipe === 'paparazzi-burst') {
    scale = interpolateRange(local, [0, segment], [1.16, 1.28], LEFT_CLAMP);
  } else {
    scale = interpolateRange(local, [0, segment], [1.12, 1.25], LEFT_CLAMP);
  }
  const operations = [{ kind: 'scale-2d', x: scale, y: scale }];
  if (x !== 0) operations.push({ kind: 'translate-x', value: `${x}px` });
  unit.present = opacity > 0;
  unit.opacity = opacity;
  unit.pose = { ...unit.pose, operations };
  unit.effects = { ...unit.effects, contrast, saturate };
}

function applyRank(unit, recipe, role, frame, fps) {
  const gold = recipe === 'gold-finale';
  const delay = gold ? 10 : recipe === 'shutter-shake' ? 6 : 8;
  const amount = springValue({
    frame: frame - delay,
    fps,
    config: gold
      ? { damping: 12, stiffness: 130, mass: 0.9 }
      : recipe === 'shutter-shake'
        ? { damping: 8, stiffness: 190, mass: 0.8 }
        : recipe === 'paparazzi-burst'
          ? { damping: 9, stiffness: 175, mass: 0.8 }
          : { damping: 9, stiffness: 170, mass: 0.8 },
  });
  const startScale = gold ? 2.2 : recipe === 'shutter-shake' ? 2.6 : 2.4;
  if (role === 'rank-stage') {
    unit.opacity = amount;
    return;
  }
  const operations = [{
    kind: 'scale-2d',
    x: interpolateRange(amount, [0, 1], [startScale, 1]),
    y: interpolateRange(amount, [0, 1], [startScale, 1]),
  }];
  if (!gold) {
    operations.push({
      kind: 'rotate-z',
      degrees: interpolateRange(amount, [0, 1], [recipe === 'shutter-shake' ? -16 : -14, -6]),
    });
  }
  unit.opacity = gold ? 1 : amount;
  unit.pose = { ...unit.pose, operations };
  if (gold) {
    const glow = interpolateRange(Math.sin(frame * 0.08), [-1, 1], [20, 55]);
    unit.typography = {
      ...unit.typography,
      shadows: [
        { x: 0, y: 0, blur: glow, color: '#f6c945' },
        { x: 0, y: 10, blur: 50, color: 'rgba(0,0,0,0.8)' },
      ],
    };
  }
}

function applyLabel(unit, recipe, role, frame, fps) {
  const delay = recipe === 'shutter-shake' ? 14 : recipe === 'gold-finale' ? 20 : 16;
  const amount = springValue({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 120 },
  });
  const x = interpolateRange(amount, [0, 1], [-500, 0]);
  unit.opacity = amount;
  unit.pose = {
    ...unit.pose,
    operations: role === 'label-rule'
      ? [
        { kind: 'translate-x', value: `${x}px` },
        { kind: 'scale-2d', x: amount, y: 1 },
      ]
      : [{ kind: 'translate-x', value: `${x}px` }],
  };
}

function applyParticle(unit, index, frame) {
  const seed = index * 37.7;
  const speed = 0.4 + (((Math.sin(seed * 2.1) * 0.5) + 0.5) * 0.8);
  const y = 1920 - ((frame * speed * 6 + (index * 140)) % 2100);
  const twinkle = 0.3 + (((Math.sin((frame * 0.1) + seed) * 0.5) + 0.5) * 0.7);
  const glow = interpolateRange(frame, [0, 30], [0, 1], CLAMP);
  unit.frame = { ...unit.frame, y };
  unit.opacity = twinkle * glow;
}

function requireMediaOwner(unit, recipe, role, index) {
  const authoredRecipe = String(recipe);
  if (!fightZineMediaRecipes[authoredRecipe]) {
    throw new TypeError('MediaRankCadence requires an authored semantic owner');
  }
  return requireMediaRankTarget(unit, authoredRecipe, role, index);
}

function cubicIn(value) {
  return value ** 3;
}
