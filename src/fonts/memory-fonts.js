export const memoryFonts = Object.freeze([
  font({
    family: 'Barlow Condensed',
    file: new URL('../assets/fonts/BarlowCondensed-ExtraBold.ttf', import.meta.url).href,
    sha256: '724c9c25952d5f4a2d87185d9767aa006144c5f0d944dc05bf7d5d603551c260',
    weight: 800,
  }),
  font({
    family: 'IBM Plex Mono',
    file: new URL('../assets/fonts/IBMPlexMono-Medium.ttf', import.meta.url).href,
    sha256: 'a9b4c49bb299e05b5f6c481e7fb5e78943d2793249a0c8874ab574a2d1ea6755',
    weight: 500,
  }),
  font({
    family: 'Silkscreen',
    file: new URL('../assets/fonts/Silkscreen-Bold.ttf', import.meta.url).href,
    sha256: '768476aa712d4f5c3e18d3bce80f980a8bd3f72b7094d22ec5e768df3acfed61',
    weight: 700,
  }),
  font({
    family: 'Press Start 2P',
    file: new URL('../assets/fonts/PressStart2P-Regular.ttf', import.meta.url).href,
    sha256: '034c77f1f05ec89421e4a63f0e3a4ca1ecf852cc6d2bf611f126f275728e017d',
    weight: 400,
  }),
  font({
    family: 'Bebas Neue',
    file: new URL('../assets/fonts/BebasNeue-Regular.ttf', import.meta.url).href,
    sha256: '08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73',
    weight: 400,
  }),
  font({
    family: 'Caveat',
    file: new URL('../assets/fonts/Caveat-Variable.ttf', import.meta.url).href,
    sha256: '0bdb6b660482d31531b3945849fba5916b3ef8695da7024a9e6b9ee3c4157988',
    weight: 700,
  }),
  font({
    family: 'Anton',
    file: new URL('../assets/fonts/Anton-Regular.ttf', import.meta.url).href,
    sha256: 'a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab',
    weight: 400,
  }),
  font({
    family: 'Permanent Marker',
    file: new URL('../assets/fonts/PermanentMarker-Regular.ttf', import.meta.url).href,
    sha256: '28f82c8a7943cb8e9d599f8554da1d4fc75dbcf69b9885ad6c0611d20c6946c5',
    weight: 400,
  }),
]);

export function memoryFontFaceCss() {
  return memoryFonts.map((entry) => `@font-face {
  font-family: "${entry.family}";
  font-style: ${entry.style};
  font-weight: ${entry.weight};
  font-display: block;
  src: url("${entry.file}") format("truetype");
}`).join('\n');
}

/** Call once before registering/rendering a Remotion composition. */
export async function loadMemoryFonts(environment = {}) {
  const FontFaceClass = environment.FontFace ?? globalThis.FontFace;
  const fontSet = environment.fontSet ?? globalThis.document?.fonts;
  if (typeof FontFaceClass !== 'function' || typeof fontSet?.add !== 'function') {
    throw new TypeError('FontFace and document.fonts are required');
  }
  const loaded = await Promise.all(memoryFonts.map(async (entry) => {
    const face = new FontFaceClass(entry.family, `url("${entry.file}")`, {
      style: entry.style,
      weight: String(entry.weight),
    });
    const ready = await face.load();
    fontSet.add(ready);
    return ready;
  }));
  if (fontSet.ready) await fontSet.ready;
  return Object.freeze(loaded);
}

function font({ family, file, sha256, weight }) {
  return Object.freeze({ family, file, sha256, style: 'normal', weight });
}
