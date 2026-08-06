import { Unit } from '../../../core/Unit.js';
import { Box } from '../../../units/box.js';
import { CompositionPivot } from '../../../units/composition-pivot.js';
import { Group } from '../../../units/group.js';
import { Layer } from '../../../units/layer.js';
import { SolidFill } from '../../../units/solid-fill.js';
import { EditorialSnap } from './editorial-snap.js';

/** Bundle-only fixture: exact static leaves, an authored tree, and no barrel. */
export class SignalEditorialCard extends Unit {
  static kind = 'unit.test-signal-editorial-card';

  static scent = Object.freeze({
    family: 'signal-editorial',
    composition: ['asymmetric-stack', 'edge-anchored'],
    typography: ['condensed-uppercase', 'oversized-copy'],
    palette: ['ink-black', 'paper-white', 'signal-red'],
    rendering: ['hard-shadow', 'paper-grain'],
    motion: ['two-beat-snap'],
  });

  constructor(content) {
    const copy = new Box(content, {
      color: '#f5f1e8',
      fontFamily: 'Barlow Condensed',
      fontSize: 92,
      fontWeight: 800,
      letterSpacing: -2,
      lineHeight: 0.9,
      textTransform: 'uppercase',
    });
    const marker = new SolidFill({ color: '#ff3b30' });
    const row = new Group(marker, copy);
    const panel = new Box(row, {
      backgroundColor: '#111111',
      backgroundImage: 'radial-gradient(#f5f1e822 0.7px, transparent 0.7px)',
      border: '6px solid #f5f1e8',
      boxShadow: '14px 14px 0 #ff3b30',
      display: 'flex',
      gap: 24,
      padding: 48,
      width: 820,
    });
    const stage = new Layer(panel, {
      left: 96,
      overflow: 'hidden',
      position: 'absolute',
      top: 144,
    });
    const pivot = new CompositionPivot(stage, { x: 144, y: 240 });
    pivot.add(new EditorialSnap(pivot));
    super(pivot);
  }
}
