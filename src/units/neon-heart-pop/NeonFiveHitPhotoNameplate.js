import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';

const FIVE_HIT_TITLE_OWNERS = new WeakSet();

/** Five full-size photo cards, a centred title hit and a shared exposure plate. */
export class NeonFiveHitPhotoNameplate extends Layer {
  static kind = 'unit.neon-heart-pop.five-hit-photo-nameplate';

  #animationTargets;

  constructor(images, title) {
    requireImages(images);
    requireText(title);

    const cards = images.map((image, index) => new FiveHitPhotoCard(image, index));
    const anchor = new Layer(cards[0], {
      frame: { x: '50%', y: '50%', width: 0, height: 0 },
      name: 'neon-five-hit-photo-anchor',
    });
    cards.slice(1).forEach((card) => anchor.addUnit(card));
    const shake = new FiveHitCameraStage(anchor, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'neon-five-hit-camera-stage',
    });

    styleTitle(title);
    FIVE_HIT_TITLE_OWNERS.add(title);
    const titleAnchor = new Layout(title, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      layout: { align: 'center', justify: 'center' },
      name: 'neon-five-hit-title-anchor',
    });
    const exposure = new FiveHitExposurePlate(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'neon-five-hit-exposure',
      opacity: 0,
      paint: { fill: '#fff' },
      present: false,
    });

    super(shake, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'neon-five-hit-photo-nameplate',
      overflow: 'hidden',
      paint: { fill: '#000' },
    });
    this.addUnit(titleAnchor);
    this.addUnit(exposure);
    this.#animationTargets = Object.freeze({
      camera: shake,
      cards: Object.freeze(cards.map((owner, index) => Object.freeze({ index, owner }))),
      exposure,
      title,
    });
  }

  /** Frozen semantic owners in authored card, camera, title and exposure roles. */
  animationTargets() {
    return this.#animationTargets;
  }
}

class FiveHitPhotoCard extends Box {
  static kind = 'unit.neon-heart-pop.five-hit-photo-card';

  constructor(image, index) {
    image.frame = { x: 0, y: 0, width: '100%', height: '100%' };
    super(image, {
      effects: {
        boxShadows: [{ x: 0, y: 20, blur: 50, spread: 0, color: 'rgba(0,0,0,0.7)' }],
      },
      frame: { x: 0, y: 0, width: 800, height: 1000 },
      name: `neon-five-hit-card-${index + 1}`,
      overflow: 'hidden',
      paint: { radius: 6 },
    });
    Object.defineProperty(this, 'hitIndex', {
      enumerable: true,
      value: index,
      writable: false,
    });
  }
}

class FiveHitCameraStage extends Layer {
  static kind = 'unit.neon-heart-pop.five-hit-camera-stage';
}

class FiveHitExposurePlate extends Box {
  static kind = 'unit.neon-heart-pop.five-hit-exposure-plate';
}

/** Closed semantic-role check for the authored five-hit title motion owner. */
export function requireFiveHitTitleOwner(unit) {
  if (!FIVE_HIT_TITLE_OWNERS.has(unit)) {
    throw new TypeError('Five-hit title cadence requires the authored runtime Text owner');
  }
  return unit;
}

function requireImages(images) {
  if (!Array.isArray(images) || images.length !== 5) {
    throw new TypeError('NeonFiveHitPhotoNameplate requires five Image Units');
  }
  const seen = new Set();
  images.forEach((image, index) => {
    requireUnit(image, `NeonFiveHitPhotoNameplate image ${index + 1}`);
    requireDetachedUnit(image, `NeonFiveHitPhotoNameplate image ${index + 1}`);
    if (image.constructor.kind !== 'unit.image' || seen.has(image)) {
      throw new TypeError('NeonFiveHitPhotoNameplate requires distinct Image Units');
    }
    seen.add(image);
  });
}

function requireText(title) {
  requireUnit(title, 'NeonFiveHitPhotoNameplate title');
  requireDetachedUnit(title, 'NeonFiveHitPhotoNameplate title');
  if (title.constructor.kind !== 'unit.text') {
    throw new TypeError('NeonFiveHitPhotoNameplate requires a Text Unit');
  }
}

function styleTitle(title) {
  title.frame = { x: 0, y: 0, width: 'auto', height: 'auto', position: 'relative' };
  title.paint = { ...title.paint, color: '#ffffff' };
  title.typography = {
    ...title.typography,
    family: 'Bebas Neue, sans-serif',
    letterSpacing: 6,
    lineHeight: 1,
    shadows: [
      { x: 4, y: 0, blur: 0, color: '#ff00ff' },
      { x: -4, y: 0, blur: 0, color: '#00ffff' },
    ],
    size: 200,
    weight: 400,
    wrap: { ...title.typography.wrap, whiteSpace: 'nowrap' },
  };
}
