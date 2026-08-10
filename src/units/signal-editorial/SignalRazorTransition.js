import { requireUnit, Unit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { CompositionPivot } from '@cut3/agent-memory/units/base/CompositionPivot';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Incoming scene revealed beneath three fixed diagonal editorial blades. */
export class SignalRazorTransition extends Unit {
  static kind = 'unit.signal-editorial.razor-transition';

  #animationTargets;

  constructor(incomingScene) {
    requireUnit(incomingScene, 'SignalRazorTransition incomingScene');
    requireDetachedUnit(incomingScene, 'SignalRazorTransition incomingScene');
    const incoming = new CompositionPivot(incomingScene, {
      name: 'signal-incoming-reveal',
      x: 540,
      y: 960,
    });
    const bladeStack = new Layer(undefined, { name: 'razor-blades' });
    bladeStack.add(
      new Box(undefined, {
        // The black carrier is deliberately wider than the composition: at
        // the handoff it fully occludes the old shot, while the narrow red
        // and paper blades retain the recognizable diagonal cut on top.
        frame: { x: -320, y: -320, width: 1720, height: 2600, z: 30 },
        paint: { fill: '#111111' },
        pose: { rotate: 8 },
        name: 'paper-black-carrier',
      }),
      new Box(undefined, {
        frame: { x: 260, y: -320, width: 210, height: 2600, z: 31 },
        paint: { fill: '#ff3b30' },
        pose: { rotate: 8 },
        name: 'signal-red-blade',
      }),
      new Box(undefined, {
        frame: { x: 438, y: -320, width: 96, height: 2600, z: 32 },
        paint: { fill: '#f4efe6' },
        pose: { rotate: 8 },
        name: 'paper-white-blade',
      }),
    );
    const pivot = new CompositionPivot(bladeStack, { x: 0, y: 960 });
    const root = new Layer(incoming, { name: 'signal-razor-transition' });
    root.add(pivot);
    super(root);
    this.#animationTargets = Object.freeze({
      incoming,
      sweep: pivot,
    });
  }

  /** Frozen semantic owners in authored reveal-then-sweep attachment order. */
  animationTargets() {
    return this.#animationTargets;
  }
}
