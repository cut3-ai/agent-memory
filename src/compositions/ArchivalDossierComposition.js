import { CasefileShutterTransition } from '@cut3/agent-memory/units/archival-dossier/CasefileShutterTransition';
import { DossierPhotoMount } from '@cut3/agent-memory/units/archival-dossier/DossierPhotoMount';
import { DossierQuoteStrip } from '@cut3/agent-memory/units/archival-dossier/DossierQuoteStrip';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Text } from '@cut3/agent-memory/units/base/Text';

/** Documentary quote composition with evidence-board drawing and shutter cut. */
export class ArchivalDossierComposition extends Composition {
  static kind = 'unit.composition.archival-dossier';

  constructor(options = {}) {
    const quote = options.quote ?? 'THE MOMENT WAS QUIET. THE RECORDING WAS NOT.';
    const opening = dossierScene(quote, '#8c7d68', options.openingMedia);
    const closing = dossierScene(
      options.closingQuote ?? 'FILE CLOSED — BUT THE SOUND REMAINS.',
      '#5f6b68',
      options.closingMedia,
    );
    const timeline = new Layer(new Shot(opening, {
      duration: 86,
      from: 0,
      name: 'dossier-opening',
    }), { name: 'dossier-timeline' });
    timeline.add(new Shot(new CasefileShutterTransition(closing), {
      duration: 66,
      from: 66,
      name: 'casefile-shutter-to-closing',
    }));
    super(timeline, {
      background: '#b9a98e',
      duration: 132,
      fps: 30,
      height: 1920,
      width: 1080,
    });
  }
}

function dossierScene(quote, imageTone, suppliedMedia) {
  const scene = new Layer(new Box(undefined, {
    frame: { x: 0, y: 0, width: 1080, height: 1920 },
    paint: { fill: '#b9a98e' },
    name: 'evidence-board',
  }), { name: 'dossier-scene' });
  const mediaSlot = suppliedMedia ?? new Box(undefined, {
    effects: { contrast: 1.12, saturate: 0.48 },
    frame: { x: 0, y: 0, width: '100%', height: '100%' },
    paint: { fill: imageTone },
    name: 'replaceable-archival-media',
  });
  scene.add(
    new DossierPhotoMount(mediaSlot),
    new DossierQuoteStrip(new Text(quote)),
  );
  return scene;
}
