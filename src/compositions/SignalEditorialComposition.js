import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { SignalHeadlineBand } from '@cut3/agent-memory/units/signal-editorial/SignalHeadlineBand';
import { SignalMediaPlate } from '@cut3/agent-memory/units/signal-editorial/SignalMediaPlate';
import { SignalRazorTransition } from '@cut3/agent-memory/units/signal-editorial/SignalRazorTransition';

/** Complete 9:16 editorial opener; content is replaceable, art direction is fixed. */
export class SignalEditorialComposition extends Composition {
  static kind = 'unit.composition.signal-editorial';

  constructor(options = {}) {
    const opening = signalScene(
      options.headline ?? 'MAKE THE CUT FEEL INEVITABLE',
      '#c8bba6',
      '#111111',
      options.openingMedia,
    );
    const closing = signalScene(
      options.closingHeadline ?? 'KEEP THE SIGNAL. CHANGE THE STORY.',
      '#111111',
      '#f4efe6',
      options.closingMedia,
    );
    const timeline = new Layer(new Shot(opening, {
      duration: 72,
      from: 0,
      name: 'signal-opening',
    }), { name: 'signal-editorial-timeline' });
    timeline.add(new Shot(new SignalRazorTransition(closing), {
      duration: 64,
      from: 56,
      name: 'razor-to-closing',
    }));
    super(timeline, {
      background: '#f4efe6',
      duration: 120,
      fps: 30,
      height: 1920,
      width: 1080,
    });
  }
}

function signalScene(headline, mediaFill, background, suppliedMedia) {
  const media = suppliedMedia ?? new Box(undefined, {
    frame: { x: 0, y: 0, width: '100%', height: '100%' },
    paint: { fill: mediaFill },
    name: 'replaceable-media-slot',
  });
  const scene = new Layer(new Box(undefined, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    paint: { fill: background },
    name: 'signal-scene-background',
  }), { name: 'signal-scene' });
  scene.add(
    new SignalMediaPlate(media),
    new SignalHeadlineBand(new Text(headline)),
  );
  return scene;
}
