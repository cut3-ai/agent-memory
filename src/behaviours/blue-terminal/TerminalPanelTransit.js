import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  easeOutCubic,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import {
  requireTerminalTransitTarget,
  terminalTransitTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const TRANSITS = Object.freeze({
  'pixel-crt': transit(154, 'spring-exit', ['panel']),
  'soft-speaker': transit(187, 'slide', ['panel']),
  'bevel-status': transit(336, 'bevel-open', ['panel']),
  'tagged-status': transit(331, 'tag-open', ['tagged-tail', 'tagged-body']),
  'press-start-crt': transit(317, 'hold', ['panel']),
  'steel-speaker': transit(355, 'steel-open-exit', [
    'steel-scene',
    'steel-label',
    'steel-body',
    'steel-tail',
    'steel-corner-top',
    'steel-corner-bottom',
  ]),
});

/** Complete authored entrance/hold/exit law for one named semantic panel surface. */
export class TerminalPanelTransit extends Behaviour {
  static kind = 'behaviour.blue-terminal.panel-transit';

  #authored;

  #role;

  constructor(unit) {
    super(requireTerminalTransitTarget(unit, 'TerminalPanelTransit'));
    const target = terminalTransitTarget(unit, 'TerminalPanelTransit');
    const authored = TRANSITS[target.recipe];
    if (!authored || !authored.roles.includes(target.role)) {
      throw new TypeError('TerminalPanelTransit target is not authored');
    }
    this.#authored = authored;
    this.#role = target.role;
  }

  onFrame({ frame, fps }) {
    const state = transitState(this.#authored, this.#role, frame, fps);
    this.unit.opacity = state.opacity;
    this.unit.pose = {
      ...this.unit.pose,
      rotate: 0,
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      x: 0,
      y: state.y,
    };
  }
}

function transit(duration, mode, roles) {
  return Object.freeze({ duration, mode, roles: Object.freeze([...roles]) });
}

function transitState(authored, role, frame, fps) {
  if (authored.mode === 'spring-exit') {
    const entrance = springValue({
      frame,
      fps,
      config: { damping: 20, stiffness: 120 },
    });
    const exitStart = authored.duration - Math.round(fps * 0.4);
    return state(
      entrance * (1 - progress(frame, exitStart, authored.duration - exitStart)),
      lerp(0.85, 1, entrance),
      lerp(0.85, 1, entrance),
      0,
    );
  }
  if (authored.mode === 'slide') {
    const entrance = easeOutCubic(progress(frame, 0, 10));
    return state(progress(frame, 0, 8), 1, 1, lerp(30, 0, entrance));
  }
  if (authored.mode === 'bevel-open') {
    return state(
      progress(frame, 0, 6),
      1,
      lerp(0.1, 1, easeOutCubic(progress(frame, 0, 8))),
      0,
    );
  }
  if (authored.mode === 'tag-open') {
    return state(
      easeOutCubic(progress(frame, 0, 8)),
      1,
      lerp(0.05, 1, easeOutCubic(progress(frame, 0, 10))),
      0,
    );
  }
  if (authored.mode === 'steel-open-exit') {
    const entrance = easeOutCubic(progress(frame, 0, 12));
    const entranceOpacity = entrance < 0.4 ? entrance / 0.4 : 1;
    const exitOpacity = 1 - progress(frame, authored.duration - 10, 10);
    const scaleY = lerp(0.05, 1, entrance);
    if (role === 'steel-scene') {
      return state(exitOpacity, 1, 1, 0);
    }
    if (role === 'steel-tail') {
      return state(entranceOpacity, 1, 1, 220 * (scaleY - 1));
    }
    if (role === 'steel-corner-top' || role === 'steel-corner-bottom') {
      return state(entranceOpacity * 0.8, 1, scaleY, 0);
    }
    return state(entranceOpacity, 1, scaleY, 0);
  }
  return state(1, 1, 1, 0);
}

function state(opacity, scaleX, scaleY, y) {
  return { opacity, scaleX, scaleY, y };
}
