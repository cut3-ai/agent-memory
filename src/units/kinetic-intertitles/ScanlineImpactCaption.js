import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Layout } from '@cut3/agent-memory/units/base/Layout';
import { Text } from '@cut3/agent-memory/units/base/Text';

const VARIANTS = Object.freeze(['scanline', 'spring-breath']);
const TARGETS = new WeakMap();

/** Runtime impact letters in exact CRT or dual-plane spring topology. */
export class ScanlineImpactCaption extends Layer {
  static kind = 'unit.kinetic-intertitles.scanline-impact';

  #animationTargets;

  constructor(letters, variant) {
    validateLetters(letters);
    const authored = String(variant);
    if (!VARIANTS.includes(authored)) {
      throw new TypeError('ScanlineImpactCaption variant is not authored');
    }

    const scanline = createScanline(authored === 'scanline');
    let stage;
    let cadenceTargets;
    if (authored === 'scanline') {
      letters.forEach((letter) => styleLetter(letter, 'scanline-letter'));
      const glyphRow = new Layout(letters[0], {
        frame: { position: 'relative', width: 'auto', height: 'auto' },
        layout: { direction: 'row' },
        name: 'scanline-impact-glyph-row',
      });
      letters.slice(1).forEach((letter) => glyphRow.addUnit(letter));
      glyphRow.addUnit(scanline);
      const row = new Layout(glyphRow, {
        frame: { x: 0, y: 160, right: 0, height: 'auto' },
        layout: { direction: 'row', justify: 'center' },
        name: 'scanline-impact-stage-row',
      });
      stage = row;
      cadenceTargets = [
        targetDescriptor(registerTarget(row, { role: 'scanline-row', variant: authored })),
        ...letters.map((owner, index) => targetDescriptor(registerTarget(owner, {
          count: letters.length,
          index,
          role: 'scanline-letter',
          variant: authored,
        }), index)),
      ];
    } else {
      const backing = letters.map((letter) => new Text(letter.text));
      backing.forEach((letter) => styleLetter(letter, 'spring-back-letter'));
      letters.forEach((letter) => styleLetter(letter, 'spring-front-letter'));
      const backRow = createSpringRow(backing, 'spring-breath-back-row', true);
      const frontRow = createSpringRow(letters, 'spring-breath-front-row', false);
      const row = new Layout(backRow, {
        frame: { x: 0, y: 140, right: 0, height: 'auto' },
        layout: { align: 'center', direction: 'row', justify: 'center' },
        name: 'spring-breath-stage-row',
      });
      row.addUnit(frontRow);
      row.addUnit(scanline);
      stage = row;
      cadenceTargets = [
        targetDescriptor(registerTarget(backRow, {
          role: 'spring-back-row',
          variant: authored,
        })),
        ...backing.map((owner, index) => targetDescriptor(registerTarget(owner, {
          count: backing.length,
          index,
          role: 'spring-back-letter',
          variant: authored,
        }), index)),
        targetDescriptor(registerTarget(frontRow, {
          role: 'spring-front-row',
          variant: authored,
        })),
        ...letters.map((owner, index) => targetDescriptor(registerTarget(owner, {
          count: letters.length,
          index,
          role: 'spring-front-letter',
          variant: authored,
        }), index)),
      ];
    }

    super(stage, {
      frame: { x: 0, y: 0, width: 1080, height: 1920 },
      name: 'scanline-impact-caption',
    });

    const scanlineOwner = registerTarget(scanline, {
      count: letters.length,
      role: 'scanline',
      variant: authored,
    });
    this.#animationTargets = Object.freeze({
      cadence: Object.freeze(cadenceTargets),
      letters: Object.freeze(letters.map((owner, index) => Object.freeze({
        index,
        owner,
        role: authored === 'scanline' ? 'scanline-letter' : 'spring-front-letter',
      }))),
      scanline: Object.freeze({ owner: scanlineOwner, role: 'scanline' }),
    });
  }

  /** Named projection owners preserve row planes, glyph roles and the scanline contract. */
  animationTargets() {
    return this.#animationTargets;
  }
}

export function requireImpactCaptionTarget(unit, roles, name) {
  requireUnit(unit, `${name} owner`);
  const target = TARGETS.get(unit);
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!target || !allowed.includes(target.role)) {
    throw new TypeError(`${name} requires a ScanlineImpactCaption semantic owner`);
  }
  return unit;
}

export function impactCaptionTarget(unit, roles, name) {
  requireImpactCaptionTarget(unit, roles, name);
  return TARGETS.get(unit);
}

function createSpringRow(letters, name, backing) {
  const row = new Layout(letters[0], {
    effects: backing ? { blur: 20 } : {},
    frame: backing
      ? { x: 0, y: 0, right: 0, height: 'auto' }
      : { position: 'static', width: 'auto', height: 'auto' },
    layout: {
      align: 'center',
      direction: 'row',
      gap: 16,
      justify: 'center',
      padding: { top: 0, right: 8, bottom: 0, left: 8 },
    },
    name,
  });
  letters.slice(1).forEach((letter) => row.addUnit(letter));
  return row;
}

function createScanline(present) {
  return new Box(undefined, {
    effects: {
      boxShadows: [
        { x: 0, y: 0, blur: 8, spread: 0, color: '#8888ff' },
        { x: 0, y: 0, blur: 18, spread: 0, color: '#6666dd' },
      ],
    },
    frame: { x: -40, y: -12, right: -40, height: 2 },
    name: 'impact-caption-scanline',
    opacity: 0,
    paint: {
      backgrounds: [{
        kind: 'linear-gradient',
        angle: 90,
        stops: [
          { offset: 0, color: 'transparent' },
          { offset: 0.25, color: '#9999ff' },
          { offset: 0.5, color: '#ffffff' },
          { offset: 0.75, color: '#9999ff' },
          { offset: 1, color: 'transparent' },
        ],
      }],
    },
    present,
  });
}

function styleLetter(letter, role) {
  const scanline = role === 'scanline-letter';
  const front = role === 'spring-front-letter';
  letter.frame = {
    x: undefined,
    y: undefined,
    right: undefined,
    bottom: undefined,
    width: scanline && letter.text === ' ' ? 22 : 'auto',
    height: 'auto',
    minWidth: undefined,
    maxWidth: undefined,
    minHeight: undefined,
    maxHeight: undefined,
    aspectRatio: undefined,
    boxSizing: 'border-box',
    position: 'static',
    z: 'auto',
  };
  letter.paint = { ...letter.paint, color: scanline ? '#e8e8ff' : front ? '#ffffff' : '#ff0033' };
  letter.typography = {
    ...letter.typography,
    align: 'left',
    family: scanline ? 'Impact, sans-serif' : 'Impact, Anton, "Bebas Neue", sans-serif',
    letterSpacing: scanline ? 10 : 0,
    lineHeight: 'normal',
    shadows: front
      ? [{ x: 4, y: 4, blur: 0, color: '#cc0022' }]
      : [],
    size: scanline ? 80 : 110,
    style: 'normal',
    transform: 'uppercase',
    weight: scanline ? 400 : 700,
    wrap: { ...letter.typography.wrap, whiteSpace: 'normal' },
  };
}

function registerTarget(owner, metadata) {
  TARGETS.set(owner, Object.freeze({ ...metadata }));
  return owner;
}

function targetDescriptor(owner, index) {
  const target = TARGETS.get(owner);
  return Object.freeze({
    ...(index === undefined ? {} : { index }),
    owner,
    role: target.role,
  });
}

function validateLetters(letters) {
  if (!Array.isArray(letters) || letters.length === 0) {
    throw new TypeError('ScanlineImpactCaption requires runtime Text Units');
  }
  for (const [index, letter] of letters.entries()) {
    requireUnit(letter, `ScanlineImpactCaption letter ${index + 1}`);
    requireDetachedUnit(letter, `ScanlineImpactCaption letter ${index + 1}`);
    if (letter.constructor.kind !== 'unit.text') {
      throw new TypeError('ScanlineImpactCaption requires Text Units');
    }
  }
  if (new Set(letters).size !== letters.length) {
    throw new TypeError('ScanlineImpactCaption requires distinct Text Units');
  }
}
