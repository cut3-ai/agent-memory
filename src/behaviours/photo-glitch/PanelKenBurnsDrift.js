import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { lerp, progress } from '@cut3/agent-memory/core/timeline';

const PANEL_DRIFTS = Object.freeze([
  drift(1.12, -2, -3),
  drift(1, 3, 2),
  drift(1.13, -3, 3),
]);

/** Full-duration panel camera drift with authored scale bias and pixel pan. */
export class PanelKenBurnsDrift extends Behaviour {
  static kind = 'behaviour.photo-glitch.panel-ken-burns';

  #panX;
  #panY;
  #scaleTo;

  constructor(unit, index) {
    super(requireOwnerKind(unit, 'unit.photo-glitch.masked-panel-media', 'PanelKenBurnsDrift'));
    if (!Number.isInteger(index) || !PANEL_DRIFTS[index]) {
      throw new RangeError('PanelKenBurnsDrift index must select an authored panel');
    }
    if (unit.panelIndex !== index) {
      throw new RangeError('PanelKenBurnsDrift index must match its MaskedPanelMedia owner');
    }
    const authored = PANEL_DRIFTS[index];
    this.#scaleTo = 1 + ((authored.scaleAxis - 1) * 0.5) + 0.12;
    this.#panX = authored.panX * 6;
    this.#panY = authored.panY * 6;
  }

  onFrame({ duration, frame }) {
    const amount = progress(frame, 0, duration);
    const scale = lerp(1, this.#scaleTo, amount);
    this.unit.cameraProgress = amount;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'scale-2d', x: scale, y: scale },
        {
          kind: 'translate-2d',
          x: lerp(0, this.#panX, amount),
          y: lerp(0, this.#panY, amount),
        },
      ],
    };
    this.unit.opacity = 1;
  }
}

function drift(scaleAxis, panX, panY) {
  return Object.freeze({ panX, panY, scaleAxis });
}
