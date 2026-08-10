import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import {
  effects,
  frame,
  paint,
  typography,
} from '@cut3/agent-memory/units/base/visual';
import { SculpturalScissorsHero } from '@cut3/agent-memory/units/sculptural-3d/SculpturalScissorsHero';
import { bindScissorStageTarget } from '@cut3/agent-memory/units/sculptural-3d/sculpturalSemantics';

const VARIANTS = Object.freeze(['impact', 'minimal']);
const BLUE = '#5D91FF';
const IMPACT_TITLE_SHADOWS = Object.freeze([
  Object.freeze({ x: 0, y: 2, blur: 40, color: 'rgba(0,0,0,0.9)' }),
  Object.freeze({ x: 0, y: 0, blur: 80, color: 'rgba(93,145,255,0.15)' }),
  Object.freeze({ x: 2, y: 2, blur: 0, color: '#1a1a20' }),
  Object.freeze({ x: 4, y: 4, blur: 0, color: '#111116' }),
]);
const IMPACT_MARK_SHADOWS = Object.freeze([
  Object.freeze({ x: 0, y: 0, blur: 60, color: '#5D91FFcc' }),
  Object.freeze({ x: 0, y: 0, blur: 30, color: '#5D91FF88' }),
  Object.freeze({ x: 0, y: 0, blur: 120, color: '#5D91FF55' }),
  Object.freeze({ x: 2, y: 2, blur: 0, color: '#0a2875' }),
  Object.freeze({ x: 5, y: 5, blur: 0, color: '#071850' }),
  Object.freeze({ x: 8, y: 8, blur: 0, color: '#04102e' }),
]);
const MINIMAL_TITLE_SHADOWS = Object.freeze([
  Object.freeze({ x: 0, y: 4, blur: 40, color: 'rgba(0,0,0,0.5)' }),
]);
const MINIMAL_SUBTITLE_SHADOWS = Object.freeze([
  Object.freeze({ x: 0, y: 2, blur: 20, color: 'rgba(0,0,0,0.5)' }),
]);

/** Full authored scissors occurrence: 3D sculpture, light fields and runtime copy. */
export class SculpturalScissorsStage extends Layer {
  static kind = 'unit.sculptural-3d.scissors-stage';

  #animationTargets;

  #copy;

  #scene;

  constructor(copy, variant) {
    const texts = requireCopy(copy);
    const recipe = String(variant);
    if (!VARIANTS.includes(recipe)) {
      throw new TypeError('SculpturalScissorsStage variant is not authored');
    }
    const authored = recipe === 'impact'
      ? impactStage(texts)
      : minimalStage(texts);
    super(authored.roots[0], authored.options);
    authored.roots.slice(1).forEach((root) => this.addUnit(root));
    this.variant = recipe;
    this.#scene = authored.scene;
    this.#copy = Object.freeze({
      lead: texts.lead,
      mark: texts.mark,
      trail: texts.trail,
      subtitle: texts.subtitle,
    });
    const specs = recipe === 'minimal'
      ? [{ owner: this, role: 'minimal-stage' }, ...authored.targets]
      : authored.targets;
    this.#animationTargets = Object.freeze(specs.map(({ owner, role }) => (
      bindScissorStageTarget(owner, recipe, role)
    )));
  }

  animationTargets() {
    return this.#animationTargets;
  }

  get copy() {
    return this.#copy;
  }

  get scene() {
    return this.#scene;
  }
}

function impactStage(copy) {
  styleImpactCopy(copy);
  const largeGlow = new Box(undefined, {
    effects: { blur: 30 },
    frame: { x: '50%', y: '40%', width: 900, height: 900 },
    name: 'sculptural-impact-large-glow',
    opacity: 0,
    paint: { backgrounds: [radial('circle', '50%', '50%', [
      stop(0, '#5D91FF28'), stop(0.65, 'transparent'),
    ])] },
    pose: { operations: [translate('-50%', '-50%')] },
  });
  const coreGlow = new Box(undefined, {
    effects: { blur: 18 },
    frame: { x: '50%', y: '40%', width: 600, height: 600 },
    name: 'sculptural-impact-core-glow',
    opacity: 0,
    paint: { backgrounds: [radial('circle', '50%', '50%', [
      stop(0, '#5D91FF18'), stop(0.7, 'transparent'),
    ])] },
    pose: { operations: [translate('-50%', '-50%')] },
  });
  const atmosphere = new Box(undefined, {
    effects: { blur: 60 },
    frame: fullFrame(),
    name: 'sculptural-impact-atmosphere',
    opacity: 0,
    paint: { backgrounds: [impactAtmosphere(0)] },
  });
  const scene = new SculpturalScissorsHero('impact');
  const sceneMount = new Layer(scene, {
    frame: { x: 0, y: '-30%', width: '100%', height: '75%' },
    name: 'sculptural-impact-scene-mount',
  });
  const snapFlash = new Box(undefined, {
    frame: fullFrame(),
    name: 'sculptural-impact-snap-flash',
    paint: { backgrounds: [snapFlashGradient(0)] },
  });
  const copyStructure = impactCopyStructure(copy);
  const vignette = new Box(undefined, {
    frame: fullFrame(),
    name: 'sculptural-impact-vignette',
    paint: { backgrounds: [radial('ellipse', '50%', '50%', [
      stop(0.4, 'transparent'), stop(1, 'rgba(0,0,0,0.75)'),
    ])] },
  });
  const scanlines = scanlineVeil();
  return Object.freeze({
    options: {
      frame: fullFrame(),
      name: 'sculptural-impact-full-stage',
      overflow: 'hidden',
      paint: { backgrounds: [radial('ellipse', '50%', '38%', [
        stop(0, '#0e1628'), stop(0.45, '#080c17'), stop(1, '#030508'),
      ])] },
    },
    roots: Object.freeze([
      largeGlow,
      coreGlow,
      atmosphere,
      sceneMount,
      snapFlash,
      copyStructure.overlay,
      vignette,
      scanlines,
    ]),
    scene,
    targets: Object.freeze([
      target(largeGlow, 'impact-large-glow'),
      target(coreGlow, 'impact-core-glow'),
      target(atmosphere, 'impact-atmosphere'),
      target(snapFlash, 'impact-snap-flash'),
      target(copyStructure.group, 'impact-copy-group'),
      target(copy.mark, 'impact-mark'),
      target(copyStructure.rule, 'impact-rule'),
    ]),
  });
}

function minimalStage(copy) {
  styleMinimalCopy(copy);
  const scene = new SculpturalScissorsHero('minimal');
  const copyStructure = minimalCopyStructure(copy);
  return Object.freeze({
    options: {
      frame: fullFrame(),
      name: 'sculptural-minimal-full-stage',
      opacity: 0,
    },
    roots: Object.freeze([scene, copyStructure.overlay]),
    scene,
    targets: Object.freeze([
      target(copyStructure.group, 'minimal-copy-group'),
      target(copy.mark, 'minimal-mark'),
    ]),
  });
}

function impactCopyStructure(copy) {
  const title = titleRow(copy);
  const subtitleMount = paddedMount(copy.subtitle, 12, 'sculptural-impact-subtitle-mount');
  const rule = new Box(undefined, {
    effects: { blur: 0.5 },
    frame: { position: 'static', width: 280, height: 1.5 },
    name: 'sculptural-impact-copy-rule',
    paint: { backgrounds: [linear(90, [
      stop(0, 'transparent'),
      stop(0.3, '#5D91FF88'),
      stop(0.5, '#5D91FFcc'),
      stop(0.7, '#5D91FF88'),
      stop(1, 'transparent'),
    ])] },
  });
  const ruleMount = paddedMount(rule, 20, 'sculptural-impact-rule-mount');
  const group = new Layout(title, {
    frame: staticFrame(),
    layout: { align: 'center', direction: 'column', gap: 0 },
    name: 'sculptural-impact-copy-group',
    opacity: 0,
  });
  group.add(subtitleMount, ruleMount);
  const overlay = new Layout(group, {
    frame: fullFrame(),
    layout: {
      align: 'center',
      direction: 'column',
      justify: 'end',
      padding: { top: 0, right: 0, bottom: 320, left: 0 },
    },
    name: 'sculptural-impact-copy-overlay',
  });
  return Object.freeze({ group, overlay, rule });
}

function minimalCopyStructure(copy) {
  const title = titleRow(copy);
  const subtitleMount = paddedMount(copy.subtitle, 2, 'sculptural-minimal-subtitle-mount');
  const rule = new Box(undefined, {
    effects: { boxShadows: [
      { x: 0, y: 0, blur: 12, spread: 0, color: '#5D91FF66', inset: false },
    ] },
    frame: { position: 'static', width: 320, height: 1.5 },
    name: 'sculptural-minimal-copy-rule',
    paint: { backgrounds: [linear(90, [
      stop(0, 'transparent'),
      stop(0.25, '#5D91FF88'),
      stop(0.5, BLUE),
      stop(0.75, '#5D91FF88'),
      stop(1, 'transparent'),
    ])] },
  });
  const ruleMount = paddedMount(rule, 6, 'sculptural-minimal-rule-mount');
  const group = new Layout(title, {
    frame: staticFrame(),
    layout: { align: 'center', direction: 'column', gap: 14 },
    name: 'sculptural-minimal-copy-group',
  });
  group.add(subtitleMount, ruleMount);
  const overlay = new Layout(group, {
    frame: fullFrame(),
    layout: {
      align: 'center',
      direction: 'column',
      justify: 'end',
      padding: { top: 0, right: 0, bottom: 260, left: 0 },
    },
    name: 'sculptural-minimal-copy-overlay',
  });
  return Object.freeze({ group, overlay, rule });
}

function titleRow(copy) {
  const row = new Layout(copy.lead, {
    frame: staticFrame(),
    layout: { align: 'baseline', direction: 'row', gap: 0 },
    name: 'sculptural-scissors-copy-title-row',
  });
  row.add(copy.mark, copy.trail);
  return row;
}

function paddedMount(unit, top, name) {
  return new Layout(unit, {
    frame: staticFrame(),
    layout: { padding: { top, right: 0, bottom: 0, left: 0 } },
    name,
  });
}

function styleImpactCopy(copy) {
  styleText(copy.lead, {
    color: '#d8dce6', family: 'Bebas Neue, system-ui', letterSpacing: 6,
    shadows: IMPACT_TITLE_SHADOWS, size: 148,
  });
  styleText(copy.mark, {
    color: BLUE, family: 'Bebas Neue, system-ui', letterSpacing: 2,
    shadows: IMPACT_MARK_SHADOWS, size: 200,
  });
  styleText(copy.trail, {
    color: '#d8dce6', family: 'Bebas Neue, system-ui', letterSpacing: 6,
    shadows: IMPACT_TITLE_SHADOWS, size: 148,
  });
  styleText(copy.subtitle, {
    color: '#6a7a9a', family: 'Montserrat, system-ui', letterSpacing: 14,
    shadows: [], size: 28, transform: 'uppercase', weight: 300,
  });
}

function styleMinimalCopy(copy) {
  styleText(copy.lead, {
    color: '#ffffff', family: 'Bebas Neue, sans-serif', letterSpacing: 4,
    shadows: MINIMAL_TITLE_SHADOWS, size: 128,
  });
  styleText(copy.mark, {
    color: BLUE, family: 'Bebas Neue, sans-serif', letterSpacing: 0,
    shadows: minimalMarkShadows(28), size: 160,
  });
  styleText(copy.trail, {
    color: '#ffffff', family: 'Bebas Neue, sans-serif', letterSpacing: 2,
    shadows: MINIMAL_TITLE_SHADOWS, size: 128,
  });
  styleText(copy.subtitle, {
    color: 'rgba(200,210,230,0.85)', family: 'Barlow Condensed, sans-serif',
    letterSpacing: 14, shadows: MINIMAL_SUBTITLE_SHADOWS, size: 34,
    transform: 'uppercase', weight: 400,
  });
}

function styleText(unit, options) {
  unit.frame = frame(staticFrame());
  unit.paint = paint({ color: options.color });
  unit.effects = effects();
  unit.typography = typography({
    family: options.family,
    letterSpacing: options.letterSpacing,
    lineHeight: 1,
    shadows: options.shadows,
    size: options.size,
    transform: options.transform ?? 'none',
    weight: options.weight ?? 400,
    wrap: { whiteSpace: 'nowrap' },
  });
}

function scanlineVeil() {
  const veil = new Layer(undefined, {
    frame: fullFrame(),
    name: 'sculptural-impact-scanline-veil',
    opacity: 0.6,
  });
  for (let index = 0; index < 640; index += 1) {
    veil.addUnit(new Box(undefined, {
      frame: { x: 0, y: index * 3, width: '100%', height: 3 },
      name: `sculptural-impact-scanline-tile-${index}`,
      paint: { backgrounds: [linear(0, [
        stop(0, 'rgba(0,0,0,0.025)'),
        stop(1 / 3, 'transparent'),
        stop(1, 'transparent'),
      ])] },
    }));
  }
  return veil;
}

export function impactAtmosphere(angle) {
  return {
    kind: 'conic-gradient',
    angle,
    position: { x: '50%', y: '40%' },
    stops: [
      stop(0, 'transparent'),
      stop(1 / 6, '#5D91FF0a'),
      stop(1 / 3, 'transparent'),
      stop(5 / 9, '#5D91FF07'),
      stop(7 / 9, 'transparent'),
      stop(1, 'transparent'),
    ],
  };
}

export function snapFlashGradient(opacity) {
  return radial('circle', '50%', '35%', [
    stop(0, `rgba(93,145,255,${opacity})`),
    stop(0.6, 'transparent'),
  ]);
}

export function minimalMarkShadows(glow) {
  return [
    { x: 0, y: 0, blur: glow, color: BLUE },
    { x: 0, y: 0, blur: glow * 1.8, color: '#5D91FF88' },
    { x: 0, y: 0, blur: glow * 3, color: '#5D91FF44' },
  ];
}

function requireCopy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('SculpturalScissorsStage requires named runtime Text Units');
  }
  const keys = ['lead', 'mark', 'trail', 'subtitle'];
  if (Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) {
    throw new TypeError('SculpturalScissorsStage runtime copy slots are not authored');
  }
  const units = keys.map((key) => value[key]);
  units.forEach((unit, index) => {
    requireUnit(unit, `SculpturalScissorsStage copy ${index + 1}`);
    requireDetachedUnit(unit, `SculpturalScissorsStage copy ${index + 1}`);
    if (unit.constructor.kind !== 'unit.text') {
      throw new TypeError('SculpturalScissorsStage copy slots require Text Units');
    }
  });
  if (new Set(units).size !== units.length) {
    throw new TypeError('SculpturalScissorsStage requires distinct Text Units');
  }
  return Object.freeze({
    lead: value.lead,
    mark: value.mark,
    trail: value.trail,
    subtitle: value.subtitle,
  });
}

function target(owner, role) {
  return Object.freeze({ owner, role });
}

function fullFrame() {
  return { x: 0, y: 0, width: 1080, height: 1920 };
}

function staticFrame() {
  return { position: 'static', width: 'auto', height: 'auto' };
}

function translate(x, y) {
  return { kind: 'translate-2d', x, y };
}

function stop(offset, color) {
  return { offset, color };
}

function linear(angle, stops) {
  return { kind: 'linear-gradient', angle, stops };
}

function radial(shape, x, y, stops) {
  return { kind: 'radial-gradient', shape, position: { x, y }, stops };
}
