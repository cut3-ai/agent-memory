import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { interpolateRange } from '@cut3/agent-memory/core/timeline';
import { requireMediaRankTarget } from '@cut3/agent-memory/units/fight-zine/MediaRankPlate';

const CLAMP = Object.freeze({ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Complete cut-impact law: deck shake, color hit, strobe and image exposure. */
export class FightNightShutterHit extends Behaviour {
  static kind = 'behaviour.fight-zine.fight-night-shutter-hit';

  #recipe;
  #role;

  constructor(unit, recipe, role, index = 0) {
    super(requireShutterOwner(unit, recipe, role, index));
    this.#recipe = String(recipe);
    this.#role = String(role);
  }

  onFrame({ duration, frame }) {
    const segment = duration / 3;
    if (this.#recipe === 'shutter-shake') {
      const local = frame % segment;
      if (this.#role === 'deck') {
        const decay = interpolateRange(local, [0, 12], [1, 0], CLAMP);
        this.unit.pose = {
          ...this.unit.pose,
          x: local < 12 ? Math.sin(frame * 2.7) * 24 * decay : 0,
          y: local < 12 ? Math.cos(frame * 3.3) * 18 * decay : 0,
        };
      } else {
        const opacity = interpolateRange(local, [0, 3, 9], [0.5, 0.18, 0], CLAMP);
        this.unit.present = opacity > 0;
        this.unit.opacity = opacity;
      }
      return;
    }

    const flash = Math.max(
      flashAt(frame, 0, 0.95),
      flashAt(frame, Math.round(segment), 0.9),
      flashAt(frame, Math.round(segment * 2), 0.9),
      flashAt(frame, Math.round(segment * 0.5), 0.4),
      flashAt(frame, Math.round(segment * 1.5), 0.4),
    );
    if (this.#role === 'white-flash') {
      this.unit.present = flash > 0;
      this.unit.opacity = flash;
    } else {
      this.unit.effects = { ...this.unit.effects, brightness: 1 + (flash * 0.25) };
    }
  }
}

function flashAt(frame, start, peak) {
  return interpolateRange(frame, [start, start + 2, start + 9], [0, peak, 0], CLAMP);
}

function requireShutterOwner(unit, recipe, role, index) {
  const authoredRecipe = String(recipe);
  const expectedRole = role === 'image-flash' ? 'image' : role;
  if (!['shutter-shake', 'paparazzi-burst'].includes(authoredRecipe)) {
    throw new TypeError('FightNightShutterHit requires an authored shutter owner');
  }
  return requireMediaRankTarget(unit, authoredRecipe, expectedRole, index);
}
