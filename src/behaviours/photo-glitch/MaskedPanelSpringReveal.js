import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';

const PANEL_ENTRANCES = Object.freeze([
  entrance(0, 0, -1200, 14, 110),
  entrance(10, -1200, 0, 16, 120),
  entrance(20, 1200, 0, 16, 120),
]);

/** Complete delayed panel arrival coordinating spring translation and visibility. */
export class MaskedPanelSpringReveal extends Behaviour {
  static kind = 'behaviour.photo-glitch.masked-panel-reveal';

  #authored;

  constructor(unit, index) {
    super(requireOwnerKind(unit, 'unit.photo-glitch.masked-panel', 'MaskedPanelSpringReveal'));
    if (!Number.isInteger(index) || !PANEL_ENTRANCES[index]) {
      throw new RangeError('MaskedPanelSpringReveal index must select an authored panel');
    }
    this.#authored = PANEL_ENTRANCES[index];
  }

  onFrame({ fps, frame }) {
    const authored = this.#authored;
    const localFrame = frame - authored.delay;
    const amount = springValue({
      frame: localFrame,
      fps,
      config: { damping: authored.damping, stiffness: authored.stiffness, mass: 1 },
    });
    this.unit.pose = {
      ...this.unit.pose,
      operations: [{
        kind: 'translate-2d',
        x: lerp(authored.fromX, 0, amount),
        y: lerp(authored.fromY, 0, amount),
      }],
      x: 0,
      y: 0,
    };
    this.unit.opacity = progress(localFrame, 0, 4);
  }
}

function entrance(delay, fromX, fromY, damping, stiffness) {
  return Object.freeze({ damping, delay, fromX, fromY, stiffness });
}
