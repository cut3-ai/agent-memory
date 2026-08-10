import { Unit, requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Audio } from '@cut3/agent-memory/units/base/Audio';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { visual } from '@cut3/agent-memory/units/base/visual';

const GOLD = '#f6c945';
const GOLD_RAY_SIZE = 2400;
const GOLD_RAY_CENTER = GOLD_RAY_SIZE / 2;
const GOLD_RAY_RADIUS = Math.hypot(GOLD_RAY_CENTER, GOLD_RAY_CENTER);
const MEDIA_TARGET_BINDINGS = new WeakMap();
const WHITE = '#ffffff';

export const fightZineMediaRecipes = Object.freeze({
  'foreground-drift': Object.freeze({
    duration: 259,
    fadeSeconds: 0.35,
    nameSize: 90,
  }),
  'gold-finale': Object.freeze({
    duration: 366,
    fadeSeconds: 0.45,
    nameSize: 104,
  }),
  'lateral-push': Object.freeze({
    duration: 262,
    fadeSeconds: 0.35,
    nameSize: 96,
  }),
  'paparazzi-burst': Object.freeze({
    duration: 323,
    fadeSeconds: 0.18,
    nameSize: 96,
  }),
  'shutter-shake': Object.freeze({
    duration: 259,
    fadeSeconds: 0.22,
    nameSize: 100,
  }),
});

/** Three-shot editorial ranking plate with runtime media, copy and cut audio. */
export class MediaRankPlate extends Layer {
  static kind = 'unit.fight-zine.media-rank-plate';

  #animationTargets;

  constructor(images, audioHits, rank, label, name, descriptor, recipe) {
    const authoredRecipe = String(recipe);
    const spec = fightZineMediaRecipes[authoredRecipe];
    if (!spec) throw new TypeError('MediaRankPlate recipe is not authored');
    requireImages(images, authoredRecipe);
    requireAudioHits(audioHits);
    requireBaseText(rank, 'MediaRankPlate rank');
    requireBaseText(label, 'MediaRankPlate label');
    requireBaseText(name, 'MediaRankPlate name');
    requireBaseText(descriptor, 'MediaRankPlate descriptor');

    const deck = new FightZineMediaDeck(images[0], fullLayer('fight-zine-media-deck'));
    deck.addUnit(images[1]);
    deck.addUnit(images[2]);
    bind(deck, authoredRecipe, 'deck');

    const vignette = mediaVignette(authoredRecipe);
    const footerShade = mediaFooterShade(authoredRecipe);
    styleRank(rank, authoredRecipe);
    styleLabel(label, authoredRecipe);
    const rule = mediaLabelRule(authoredRecipe);
    styleName(name, spec.nameSize, authoredRecipe);
    styleDescriptor(descriptor, authoredRecipe);
    const nameplate = new FightZineMediaNameplate(name, {
      frame: {
        x: 70,
        bottom: authoredRecipe === 'gold-finale' ? 190 : 180,
        width: 'auto',
        height: 'auto',
      },
      layout: { direction: 'column', align: 'start', gap: 8 },
      name: 'fight-zine-media-nameplate',
      opacity: 0,
    });
    nameplate.addUnit(descriptor);

    let rays;
    let glow;
    let crown;
    let rankStage;
    const particles = [];
    if (authoredRecipe === 'gold-finale') {
      rays = goldRays();
      glow = goldGlow();
      crown = new FightZineCrownMark();
      rankStage = new FightZineGoldRankStage(crown, {
        frame: {
          x: undefined,
          y: 150,
          right: 90,
          width: 'auto',
          height: 'auto',
        },
        name: 'fight-zine-gold-rank-stage',
        opacity: 0,
        overflow: 'visible',
        pose: { origin: { x: '50%', y: 0, z: 0 } },
      });
      rankStage.addUnit(rank);
      for (let index = 0; index < 18; index += 1) particles.push(goldParticle(index));
    }
    const foreground = new FightZineMediaForeground(
      authoredRecipe === 'gold-finale' ? rankStage : rank,
      fullLayer('fight-zine-media-foreground'),
    );
    foreground.addUnit(label);
    foreground.addUnit(rule);
    foreground.addUnit(nameplate);

    let flash;
    if (authoredRecipe === 'shutter-shake') flash = shutterFlash('#ff2a2a', 'overlay');
    if (authoredRecipe === 'paparazzi-burst') flash = shutterFlash(WHITE, 'normal');

    super(deck, {
      ...fullLayer('fight-zine-media-rank-plate'),
      overflow: 'hidden',
      paint: { fill: '#000000' },
    });
    const firstCut = Math.round(spec.duration / 3);
    const secondCut = Math.round((spec.duration * 2) / 3);
    this.addUnit(new Shot(audioHits[0], {
      from: firstCut,
      duration: spec.duration - firstCut,
      name: 'fight-zine-first-cut-audio',
    }));
    this.addUnit(new Shot(audioHits[1], {
      from: secondCut,
      duration: spec.duration - secondCut,
      name: 'fight-zine-second-cut-audio',
    }));
    if (rays) this.addUnit(rays);
    if (glow) this.addUnit(glow);
    if (authoredRecipe === 'shutter-shake') this.addUnit(flash);
    this.addUnit(vignette);
    this.addUnit(footerShade);
    particles.forEach((particle) => this.addUnit(particle));
    this.addUnit(foreground);
    if (authoredRecipe === 'paparazzi-burst') this.addUnit(flash);

    bind(this, authoredRecipe, 'stage');
    images.forEach((image, index) => bind(image, authoredRecipe, 'image', index));
    if (authoredRecipe === 'gold-finale') bind(rankStage, authoredRecipe, 'rank-stage');
    bind(rank, authoredRecipe, 'rank');
    bind(label, authoredRecipe, 'label');
    bind(rule, authoredRecipe, 'label-rule');
    bind(nameplate, authoredRecipe, 'nameplate');
    const cadence = [
      target(this, 'stage'),
      ...images.map((image, index) => target(image, 'image', index)),
      ...(authoredRecipe === 'gold-finale' ? [target(rankStage, 'rank-stage')] : []),
      target(rank, 'rank'),
      target(label, 'label'),
      target(rule, 'label-rule'),
      target(nameplate, 'nameplate'),
    ];
    if (authoredRecipe === 'foreground-drift') {
      bind(foreground, authoredRecipe, 'foreground');
      cadence.push(target(foreground, 'foreground'));
    }
    if (authoredRecipe === 'gold-finale') {
      bind(rays, authoredRecipe, 'gold-rays');
      bind(glow, authoredRecipe, 'gold-glow');
      bind(crown, authoredRecipe, 'crown');
      cadence.push(target(rays, 'gold-rays'));
      cadence.push(target(glow, 'gold-glow'));
      cadence.push(target(crown, 'crown'));
      particles.forEach((particle, index) => {
        bind(particle, authoredRecipe, 'particle', index);
        cadence.push(target(particle, 'particle', index));
      });
    }
    const shutter = [];
    if (authoredRecipe === 'shutter-shake') {
      bind(flash, authoredRecipe, 'red-flash');
      shutter.push(target(deck, 'deck'));
      shutter.push(target(flash, 'red-flash'));
    }
    if (authoredRecipe === 'paparazzi-burst') {
      bind(flash, authoredRecipe, 'white-flash');
      images.forEach((image, index) => shutter.push(target(image, 'image-flash', index)));
      shutter.push(target(flash, 'white-flash'));
    }
    this.#animationTargets = Object.freeze({
      cadence: Object.freeze(cadence),
      shutter: Object.freeze(shutter),
    });
  }

  animationTargets() {
    return this.#animationTargets;
  }
}

/** Runtime image carrier with fight-zine media identity. */
export class FightZineMediaImage extends Image {
  static kind = 'unit.fight-zine.media-image';

  #identity;

  constructor(source, recipe, imageIndex) {
    super(source, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      fit: 'cover',
      opacity: 0,
    });
    this.#identity = Object.freeze({
      imageIndex: Number(imageIndex),
      recipe: String(recipe),
    });
  }

  mediaIdentity() {
    return this.#identity;
  }
}

class FightZineMediaDeck extends Layer {
  static kind = 'unit.fight-zine.media-deck';
}

class FightZineMediaForeground extends Layer {
  static kind = 'unit.fight-zine.media-foreground';
}

class FightZineMediaNameplate extends Layout {
  static kind = 'unit.fight-zine.media-nameplate';
}

class FightZineMediaRule extends Box {
  static kind = 'unit.fight-zine.media-rule';
}

class FightZineMediaVignette extends Box {
  static kind = 'unit.fight-zine.media-vignette';
}

class FightZineMediaFooterShade extends Box {
  static kind = 'unit.fight-zine.media-footer-shade';
}

class FightZineShutterFlash extends Box {
  static kind = 'unit.fight-zine.shutter-flash';
}

class FightZineGoldRays extends Unit {
  static kind = 'unit.fight-zine.gold-rays';

  constructor() {
    super();
    Object.assign(this, visual({
      effects: { blendMode: 'screen' },
      frame: {
        x: '50%',
        y: '36%',
        width: GOLD_RAY_SIZE,
        height: GOLD_RAY_SIZE,
      },
      opacity: 0,
    }));
    this.name = 'fight-zine-gold-rays';
    this.rayCount = 20;
    this.rotation = 0;
    this.treatment = 'radial-gold-rays';
  }
}

class FightZineGoldGlow extends Box {
  static kind = 'unit.fight-zine.gold-glow';
}

class FightZineGoldRankStage extends Layer {
  static kind = 'unit.fight-zine.gold-rank-stage';
}

class FightZineCrownMark extends Unit {
  static kind = 'unit.fight-zine.crown-mark';

  constructor() {
    super();
    Object.assign(this, visual({
      effects: {
        filters: [{ kind: 'drop-shadow', x: 0, y: 0, blur: 24, color: GOLD }],
      },
      frame: { x: '50%', y: -30, width: 150, height: 180 },
      opacity: 0,
    }));
    this.name = 'fight-zine-crown-mark';
    this.mark = 'three-point-crown';
    this.offsetY = 0;
  }
}

/** Host-native SVG adapters for the finale rays and crown mark. */
export const fightZineMediaUnitRenderers = Object.freeze({
  [FightZineGoldRays.kind]: renderGoldRays,
  [FightZineCrownMark.kind]: renderCrownMark,
});

class FightZineGoldParticle extends Box {
  static kind = 'unit.fight-zine.gold-particle';
}

function mediaVignette(recipe) {
  const inner = recipe === 'shutter-shake' ? 0.38 : recipe === 'gold-finale' ? 0.36 : 0.4;
  const edge = recipe === 'shutter-shake'
    ? 'rgba(0,0,0,0.72)'
    : recipe === 'gold-finale'
      ? 'rgba(0,0,0,0.74)'
      : 'rgba(0,0,0,0.7)';
  return new FightZineMediaVignette(undefined, {
    ...fullLayer('fight-zine-media-vignette'),
    paint: {
      backgrounds: [{
        kind: 'radial-gradient',
        shape: 'ellipse',
        position: { x: '50%', y: '40%' },
        stops: [
          { offset: inner, color: 'transparent' },
          { offset: 1, color: edge },
        ],
      }],
    },
  });
}

function mediaFooterShade(recipe) {
  return new FightZineMediaFooterShade(undefined, {
    ...fullLayer('fight-zine-media-footer-shade'),
    paint: {
      backgrounds: [{
        kind: 'linear-gradient',
        angle: 0,
        stops: [
          { offset: 0, color: recipe === 'gold-finale' ? 'rgba(0,0,0,0.94)' : 'rgba(0,0,0,0.92)' },
          { offset: recipe === 'gold-finale' ? 0.4 : 0.38, color: 'transparent' },
        ],
      }],
    },
  });
}

function mediaLabelRule(recipe) {
  return new FightZineMediaRule(undefined, {
    frame: { x: 70, y: 330, width: recipe === 'gold-finale' ? 520 : 360, height: 8 },
    name: 'fight-zine-media-label-rule',
    paint: { fill: recipe === 'gold-finale' ? GOLD : WHITE },
    pose: { origin: { x: 0, y: 4, z: 0 } },
    effects: recipe === 'gold-finale'
      ? { boxShadows: [{ x: 0, y: 0, blur: 18, spread: 0, color: GOLD }] }
      : {},
  });
}

function shutterFlash(color, blendMode) {
  return new FightZineShutterFlash(undefined, {
    ...fullLayer('fight-zine-shutter-flash'),
    effects: { blendMode },
    opacity: 0,
    paint: { fill: color },
  });
}

function goldGlow() {
  return new FightZineGoldGlow(undefined, {
    ...fullLayer('fight-zine-gold-glow'),
    opacity: 0,
    paint: {
      backgrounds: [{
        kind: 'radial-gradient',
        shape: 'ellipse',
        position: { x: '50%', y: '34%' },
        stops: [
          { offset: 0, color: '#f6c94522' },
          { offset: 0.45, color: 'transparent' },
        ],
      }],
    },
  });
}

function goldRays() {
  return new FightZineGoldRays();
}

function goldParticle(index) {
  const seed = index * 37.7;
  const size = 4 + (((Math.sin(seed * 3.3) * 0.5) + 0.5) * 8);
  const x = ((Math.sin(seed) * 0.5) + 0.5) * 1080;
  const particle = new FightZineGoldParticle(undefined, {
    frame: { x, y: 1920, width: size, height: size },
    name: `fight-zine-gold-particle-${index + 1}`,
    opacity: 0,
    paint: { fill: GOLD, radius: size / 2 },
    effects: {
      boxShadows: [{ x: 0, y: 0, blur: size * 2, spread: 0, color: GOLD }],
    },
  });
  particle.particleSeed = seed;
  particle.particleSize = size;
  return particle;
}

function styleRank(unit, recipe) {
  const gold = recipe === 'gold-finale';
  unit.frame = gold
    ? { x: 0, y: 0, width: 'auto', height: 'auto', position: 'relative' }
    : { x: undefined, y: 120, right: 60, width: 'auto', height: 'auto' };
  unit.opacity = gold ? 1 : 0;
  unit.paint = { ...unit.paint, color: gold ? GOLD : WHITE };
  unit.pose = {
    ...unit.pose,
    origin: { x: '50%', y: 0, z: 0 },
  };
  unit.typography = {
    ...unit.typography,
    align: 'right',
    family: 'Anton, system-ui',
    letterSpacing: 0,
    lineHeight: 0.8,
    paintOrder: ['stroke', 'fill'],
    shadows: gold
      ? [
        { x: 0, y: 0, blur: 20, color: GOLD },
        { x: 0, y: 10, blur: 50, color: 'rgba(0,0,0,0.8)' },
      ]
      : [{ x: 0, y: 10, blur: 50, color: 'rgba(0,0,0,0.8)' }],
    size: gold ? 480 : 460,
    stroke: { color: gold ? '#6b4e00' : '#000000', width: 6 },
    style: 'normal',
    transform: 'none',
    weight: 400,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function styleLabel(unit, recipe) {
  unit.frame = { x: 70, y: 250, width: 'auto', height: 'auto' };
  unit.opacity = 0;
  unit.paint = { ...unit.paint, color: recipe === 'gold-finale' ? GOLD : WHITE };
  unit.typography = {
    ...unit.typography,
    family: 'Oswald, system-ui',
    letterSpacing: 14,
    lineHeight: 'normal',
    shadows: [{ x: 0, y: 4, blur: 20, color: 'rgba(0,0,0,0.9)' }],
    size: 70,
    style: 'normal',
    transform: 'none',
    weight: 700,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function styleName(unit, size, recipe) {
  unit.frame = { position: 'static', width: 'auto', height: 'auto' };
  unit.paint = { ...unit.paint, color: WHITE };
  unit.typography = {
    ...unit.typography,
    family: 'Anton, system-ui',
    letterSpacing: 0,
    lineHeight: 0.95,
    shadows: recipe === 'gold-finale'
      ? [
        { x: 0, y: 6, blur: 30, color: 'rgba(0,0,0,0.9)' },
        { x: 0, y: 0, blur: 30, color: '#f6c94566' },
      ]
      : [{ x: 0, y: 6, blur: 30, color: 'rgba(0,0,0,0.9)' }],
    size,
    style: 'normal',
    transform: 'none',
    weight: 400,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function styleDescriptor(unit, recipe) {
  unit.frame = { position: 'static', width: 'auto', height: 'auto' };
  unit.paint = { ...unit.paint, color: recipe === 'gold-finale' ? GOLD : '#ffd24a' };
  unit.typography = {
    ...unit.typography,
    family: 'Oswald, system-ui',
    letterSpacing: 8,
    lineHeight: 'normal',
    size: recipe === 'gold-finale' ? 42 : 40,
    style: 'normal',
    transform: 'none',
    weight: 400,
    wrap: { ...unit.typography.wrap, whiteSpace: 'nowrap' },
  };
}

function renderGoldRays({ React, state }) {
  const gradient = React.createElement('radialGradient', {
    cx: GOLD_RAY_CENTER,
    cy: GOLD_RAY_CENTER,
    gradientUnits: 'userSpaceOnUse',
    id: 'fight-zine-gold-ray-fade',
    r: GOLD_RAY_RADIUS,
  },
  React.createElement('stop', { offset: 0, stopColor: '#ffffff', stopOpacity: 1 }),
  React.createElement('stop', { offset: 0.6, stopColor: '#ffffff', stopOpacity: 0 }));
  const mask = React.createElement('mask', {
    height: GOLD_RAY_SIZE,
    id: 'fight-zine-gold-ray-mask',
    maskContentUnits: 'userSpaceOnUse',
    maskUnits: 'userSpaceOnUse',
    width: GOLD_RAY_SIZE,
    x: 0,
    y: 0,
  }, React.createElement('rect', {
    fill: 'url(#fight-zine-gold-ray-fade)',
    height: GOLD_RAY_SIZE,
    width: GOLD_RAY_SIZE,
    x: 0,
    y: 0,
  }));
  const rays = Array.from({ length: state.rayCount }, (_, index) => (
    React.createElement('path', {
      d: goldRayPath(index),
      fill: GOLD,
      key: index,
      mask: 'url(#fight-zine-gold-ray-mask)',
    })
  ));
  return React.createElement('svg', {
    'data-fight-zine': state.treatment,
    style: {
      height: `${state.frame.height}px`,
      left: state.frame.x,
      mixBlendMode: state.effects.blendMode,
      opacity: state.opacity,
      position: 'absolute',
      top: state.frame.y,
      transform: `translate(-50%, -50%) rotate(${state.rotation}deg)`,
      width: `${state.frame.width}px`,
    },
    viewBox: `0 0 ${GOLD_RAY_SIZE} ${GOLD_RAY_SIZE}`,
  }, React.createElement('defs', null, gradient, mask), ...rays);
}

function renderCrownMark({ React, state }) {
  const outlined = { stroke: '#6b4e00', strokeLinejoin: 'round', strokeWidth: 5 };
  const facets = [31, 75, 119].map((x) => React.createElement('polygon', {
    fill: '#6b4e00',
    key: x,
    points: `${x},126 ${x + 8},133 ${x},140 ${x - 8},133`,
  }));
  return React.createElement('svg', {
    'data-fight-zine': state.mark,
    style: {
      filter: `drop-shadow(0px 0px 24px ${GOLD})`,
      height: `${state.frame.height}px`,
      left: state.frame.x,
      opacity: state.opacity,
      position: 'absolute',
      top: `${state.frame.y}px`,
      transform: `translate(-50%, ${state.offsetY}px)`,
      width: `${state.frame.width}px`,
    },
    viewBox: '0 0 150 180',
  },
  React.createElement('polygon', {
    ...outlined,
    fill: GOLD,
    points: '12,118 7,47 43,77 75,22 107,77 143,47 138,118',
  }),
  React.createElement('polygon', {
    ...outlined,
    fill: '#ffe89a',
    points: '12,118 138,118 132,147 18,147',
  }),
  ...facets);
}

function goldRayPath(index) {
  const start = ((index * 18) - 90) * (Math.PI / 180);
  const end = (((index * 18) + 6) - 90) * (Math.PI / 180);
  const startX = GOLD_RAY_CENTER + (Math.cos(start) * GOLD_RAY_RADIUS);
  const startY = GOLD_RAY_CENTER + (Math.sin(start) * GOLD_RAY_RADIUS);
  const endX = GOLD_RAY_CENTER + (Math.cos(end) * GOLD_RAY_RADIUS);
  const endY = GOLD_RAY_CENTER + (Math.sin(end) * GOLD_RAY_RADIUS);
  return `M ${GOLD_RAY_CENTER} ${GOLD_RAY_CENTER} L ${startX} ${startY} A ${GOLD_RAY_RADIUS} ${GOLD_RAY_RADIUS} 0 0 1 ${endX} ${endY} Z`;
}

function requireImages(images, recipe) {
  if (!Array.isArray(images) || images.length !== 3 || new Set(images).size !== 3) {
    throw new TypeError('MediaRankPlate requires three distinct semantic Image Units');
  }
  images.forEach((unit, index) => {
    requireUnit(unit, `MediaRankPlate image ${index + 1}`);
    requireDetachedUnit(unit, `MediaRankPlate image ${index + 1}`);
    const identity = unit instanceof FightZineMediaImage ? unit.mediaIdentity() : null;
    if (!identity || identity.recipe !== recipe || identity.imageIndex !== index) {
      throw new TypeError('MediaRankPlate image identity does not match its authored slot');
    }
  });
}

function requireAudioHits(audioHits) {
  if (!Array.isArray(audioHits) || audioHits.length !== 2 || new Set(audioHits).size !== 2) {
    throw new TypeError('MediaRankPlate requires two distinct Audio Units');
  }
  audioHits.forEach((unit, index) => {
    requireUnit(unit, `MediaRankPlate audio ${index + 1}`);
    requireDetachedUnit(unit, `MediaRankPlate audio ${index + 1}`);
    if (!(unit instanceof Audio)) throw new TypeError('MediaRankPlate audio hits must be Audio Units');
  });
}

function requireBaseText(unit, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor !== Text) {
    throw new TypeError(`${name} must be a base Text Unit`);
  }
}

function fullLayer(name) {
  return { frame: { x: 0, y: 0, width: '100%', height: '100%' }, name };
}

function bind(owner, recipe, role, index = 0) {
  MEDIA_TARGET_BINDINGS.set(owner, Object.freeze({ index, recipe, role }));
  return owner;
}

function target(owner, role, index = 0) {
  return Object.freeze({ index, owner, role });
}

/** Closed semantic-owner validation shared by complete fight-zine media laws. */
export function requireMediaRankTarget(unit, recipe, role, index = 0) {
  const binding = MEDIA_TARGET_BINDINGS.get(unit);
  if (!binding
    || binding.recipe !== String(recipe)
    || binding.role !== String(role)
    || binding.index !== Number(index)) {
    throw new TypeError('Fight-zine media law requires a bound MediaRankPlate target');
  }
  return unit;
}
