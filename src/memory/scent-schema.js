/** Lightweight shared vocabulary shape; importing it pulls no AST tooling. */
export const STYLE_SCENT_KEYS = Object.freeze([
  'family',
  'composition',
  'typography',
  'palette',
  'rendering',
  'motion',
]);

const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FAMILY_ATOMS = new Set([
  'analog', 'archival', 'bold', 'broadcast', 'brutalist', 'cinematic', 'clean',
  'collage', 'comic', 'corporate', 'documentary', 'drawn', 'editorial', 'elegant',
  'energy', 'expressive', 'fashion', 'futuristic', 'gaming', 'geometric', 'glitch',
  'grainy', 'hand', 'high', 'kinetic', 'luxury', 'maximal', 'minimal', 'modern',
  'monochrome', 'music', 'neon', 'news', 'nostalgic', 'organic', 'playful',
  'podcast', 'product', 'quiet', 'retro', 'scrapbook', 'signal', 'social', 'soft',
  'sports', 'technical', 'typographic', 'vintage',
]);

export function isStyleScentToken(value) {
  return typeof value === 'string' && value.length <= 64 && TOKEN.test(value);
}

/** Family is a broad, privacy-safe navigation label, not arbitrary user text. */
export function isStyleFamily(value) {
  if (!isStyleScentToken(value)) return false;
  const atoms = value.split('-');
  return atoms.length <= 3 && atoms.every((atom) => FAMILY_ATOMS.has(atom));
}
