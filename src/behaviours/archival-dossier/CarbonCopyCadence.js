import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { lerp, progress } from '@cut3/agent-memory/core/timeline';

const CADENCE = Object.freeze([0, 2, 3, 6, 7, 9, 13, 14, 18, 19, 23, 27]);

/** Uneven carbon-copy word rhythm with fixed mono ink treatment. */
export class CarbonCopyCadence extends Behaviour {
  static kind = 'behaviour.archival-dossier.carbon-copy-cadence';

  #source;

  constructor(unit) {
    super(requireOwnerKind(unit, 'unit.text', 'CarbonCopyCadence'));
    this.#source = unit.text;
  }

  onFrame({ frame }) {
    const words = this.#source.split(/\s+/u).filter(Boolean);
    const visible = words.filter((_, index) => frame >= (CADENCE[index] ?? (27 + ((index - 11) * 3))));
    const ink = progress(frame, 0, 8);
    this.unit.text = visible.join(' ');
    this.unit.opacity = progress(frame, 0, 2);
    this.unit.paint = {
      ...this.unit.paint,
      color: '#29231d',
    };
    this.unit.typography = {
      ...this.unit.typography,
      family: 'IBM Plex Mono, monospace',
      letterSpacing: lerp(2.8, 0.7, ink),
      lineHeight: 1.18,
      size: 42,
      transform: 'none',
      weight: 500,
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: lerp(1.6, 0, ink),
      contrast: 1.12,
      shadow: '1px 1px 0 rgba(116,71,48,.28)',
    };
  }
}
