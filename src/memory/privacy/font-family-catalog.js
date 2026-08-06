export const PUBLIC_FONT_FAMILY_CATALOG_VERSION = 'public-font-family-catalog-v1';

/**
 * Closed, reviewable font vocabulary for code that may enter public memory.
 * Adding a family is a source-controlled catalog revision, never runtime input.
 */
export const PUBLIC_FONT_FAMILIES = Object.freeze([
  'Anton',
  'Arial',
  'Arial Black',
  'Archivo Black',
  'Barlow',
  'Barlow Condensed',
  'Bebas Neue',
  'Courier New',
  'DM Sans',
  'Georgia',
  'Helvetica',
  'IBM Plex Mono',
  'IBM Plex Sans',
  'Impact',
  'Inter',
  'Lato',
  'League Spartan',
  'Montserrat',
  'Nunito Sans',
  'Open Sans',
  'Oswald',
  'Playfair Display',
  'Poppins',
  'Raleway',
  'Roboto',
  'Roboto Condensed',
  'Source Sans 3',
  'Space Grotesk',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'cursive',
  'fantasy',
  'monospace',
  'sans-serif',
  'serif',
  'system-ui',
  'ui-monospace',
  'ui-rounded',
  'ui-sans-serif',
  'ui-serif',
]);

const PUBLIC_FONT_FAMILY_LOOKUP = new Set(
  PUBLIC_FONT_FAMILIES.map((family) => family.toLowerCase()),
);

export function isPublicFontFamily(value) {
  return typeof value === 'string'
    && value === value.trim()
    && PUBLIC_FONT_FAMILY_LOOKUP.has(value.toLowerCase());
}
