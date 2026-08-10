export const PIXEL_CRT_BODY_TYPOGRAPHY = terminalTypography({
  family: "'Press Start 2P', 'Courier New', Courier, monospace",
  letterSpacing: 0.88,
  lineHeight: 2.1,
  size: 22,
  weight: 400,
});

export const PIXEL_CRT_STATUS_TYPOGRAPHY = terminalTypography({
  family: "'Press Start 2P', monospace",
  letterSpacing: 0,
  lineHeight: 1,
  size: 13,
  weight: 400,
});

export const SOFT_SPEAKER_BODY_TYPOGRAPHY = terminalTypography({
  family: "'Nunito', monospace",
  letterSpacing: 1.5,
  lineHeight: 1.55,
  size: 26,
  weight: 800,
});

export const SOFT_SPEAKER_LABEL_TYPOGRAPHY = terminalTypography({
  family: "'Nunito', monospace",
  letterSpacing: 2,
  lineHeight: 'normal',
  size: 20,
  transform: 'uppercase',
  weight: 900,
});

export const BEVEL_STATUS_BODY_TYPOGRAPHY = terminalTypography({
  family: "'Nunito', monospace",
  letterSpacing: 1.5,
  lineHeight: 1.55,
  size: 26,
  weight: 900,
});

export const TAGGED_STATUS_BODY_TYPOGRAPHY = terminalTypography({
  family: "'Nunito', monospace",
  letterSpacing: 1,
  lineHeight: 1.55,
  size: 28,
  weight: 800,
});

export const TAGGED_STATUS_LABEL_TYPOGRAPHY = terminalTypography({
  family: "'Nunito', monospace",
  letterSpacing: 2,
  lineHeight: 'normal',
  size: 20,
  weight: 900,
});

export const PRESS_START_CRT_BODY_TYPOGRAPHY = terminalTypography({
  family: "'Press Start 2P', monospace",
  letterSpacing: 0.5,
  lineHeight: 1.9,
  size: 15,
  weight: 400,
});

export const PRESS_START_CRT_LABEL_TYPOGRAPHY = terminalTypography({
  family: "'Press Start 2P', monospace",
  letterSpacing: 1,
  lineHeight: 'normal',
  size: 11,
  weight: 400,
});

export const STEEL_SPEAKER_BODY_TYPOGRAPHY = terminalTypography({
  family: 'Nunito, monospace',
  letterSpacing: 1.5,
  lineHeight: 1.55,
  size: 26,
  weight: 900,
});

export const STEEL_SPEAKER_LABEL_TYPOGRAPHY = terminalTypography({
  family: 'Nunito, monospace',
  letterSpacing: 3,
  lineHeight: 'normal',
  size: 20,
  transform: 'uppercase',
  weight: 900,
});

function terminalTypography(options) {
  return Object.freeze({
    align: 'left',
    family: options.family,
    letterSpacing: options.letterSpacing,
    lineHeight: options.lineHeight,
    size: options.size,
    style: 'normal',
    transform: options.transform ?? 'none',
    weight: options.weight,
  });
}
