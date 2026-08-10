import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { effects, frame } from '@cut3/agent-memory/units/base/visual';

const CUT_TARGETS = new WeakMap();

const OVERLAYS = Object.freeze({
  'zoom-out': vignette(0.2, 'rgba(0,0,0,0.6)'),
  'zoom-in': vignette(0.2, 'rgba(0,0,0,0.6)'),
  'snap-zoom': vignette(0.2, 'rgba(0,0,0,0.4)'),
  'lateral-pan': vignette(0.3, 'rgba(0,0,0,0.6)'),
  'ease-in-zoom': vignette(0.2, 'rgba(0,0,0,0.5)'),
  'vertical-drift': Object.freeze([
    Object.freeze({ offset: 0, color: 'transparent' }),
    Object.freeze({ offset: 0.4, color: 'transparent' }),
    Object.freeze({ offset: 1, color: 'rgba(0,0,0,0.5)' }),
  ]),
});

/** Renderer-neutral semantic owner for one authored camera layer and its grade overlay. */
export class RapidPhotoPlate extends Unit {
  static kind = 'unit.rapid-photo.plate';

  #animationTargets;

  constructor(image, recipe) {
    requireUnit(image, 'RapidPhotoPlate image');
    requireDetachedUnit(image, 'RapidPhotoPlate image');
    if (image.constructor.kind !== 'unit.image') {
      throw new TypeError('RapidPhotoPlate requires an Image Unit');
    }
    const stops = OVERLAYS[String(recipe)];
    if (!stops) throw new TypeError('RapidPhotoPlate recipe is not authored');

    const authoredRecipe = String(recipe);
    image.frame = frame({ position: 'static', width: '100%', height: '100%' });
    image.fit = 'cover';
    if (authoredRecipe === 'ease-in-zoom') {
      image.effects = effects({
        filters: [
          { kind: 'contrast', amount: 1.2 },
          { kind: 'brightness', amount: 1.05 },
        ],
      });
    }

    const cameraLayer = authoredRecipe === 'zoom-in'
      ? new Layout(image, {
        frame: { position: 'static', width: '100%', height: '100%' },
        layout: { mode: 'flex', align: 'center', justify: 'center' },
        overflow: 'hidden',
        name: 'rapid-photo-camera-layer',
      })
      : new Layer(image, {
        frame: {
          position: ['snap-zoom', 'lateral-pan'].includes(authoredRecipe)
            ? 'static'
            : 'absolute',
          width: '100%',
          height: '100%',
        },
        name: 'rapid-photo-camera-layer',
      });

    const gradeOverlay = new Box(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      paint: {
        backgrounds: [{
          kind: 'radial-gradient',
          shape: 'circle',
          position: { x: '50%', y: '50%' },
          stops,
        }],
      },
      name: 'rapid-photo-grade-overlay',
    });

    super(cameraLayer);
    this.name = 'rapid-photo-plate';
    this.recipe = authoredRecipe;
    this.addUnit(gradeOverlay);
    const motionTarget = registerCutTarget(
      authoredRecipe === 'zoom-in' ? image : cameraLayer,
      authoredRecipe,
    );
    this.#animationTargets = Object.freeze({
      camera: Object.freeze({ owner: cameraLayer, role: 'camera' }),
      grade: Object.freeze({ owner: gradeOverlay, role: 'grade' }),
      image: Object.freeze({ owner: image, role: 'image' }),
      motion: motionTarget,
    });
  }

  imageUnit() {
    return this.#animationTargets.image.owner;
  }

  animationTarget() {
    return this.#animationTargets.motion.owner;
  }

  /** Named projection owners; callers never depend on semantic child positions. */
  animationTargets() {
    return this.#animationTargets;
  }
}

/** Fail closed unless the owner was registered by one RapidPhotoPlate recipe. */
export function requireRapidPhotoCutTarget(unit, recipe, name) {
  const target = CUT_TARGETS.get(unit);
  if (!target || target.recipe !== String(recipe)) {
    throw new TypeError(`${name} requires an authored RapidPhotoPlate motion target`);
  }
  return unit;
}

/** Read the immutable semantic binding without relying on child positions. */
export function rapidPhotoCutTarget(unit, recipe, name) {
  requireRapidPhotoCutTarget(unit, recipe, name);
  return CUT_TARGETS.get(unit);
}

function registerCutTarget(owner, recipe) {
  const expectedKind = recipe === 'zoom-in' ? 'unit.image' : 'unit.layer';
  if (owner?.constructor?.kind !== expectedKind || CUT_TARGETS.has(owner)) {
    throw new TypeError('RapidPhotoPlate motion target is invalid');
  }
  const target = Object.freeze({ owner, recipe, role: 'motion' });
  CUT_TARGETS.set(owner, target);
  return target;
}

function vignette(innerOffset, edgeColor) {
  return Object.freeze([
    Object.freeze({ offset: innerOffset, color: 'transparent' }),
    Object.freeze({ offset: 1, color: edgeColor }),
  ]);
}
