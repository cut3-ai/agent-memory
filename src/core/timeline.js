export function frameContext(input = {}) {
  const frame = finite(input.frame ?? 0, 'frame');
  const absoluteFrame = finite(input.absoluteFrame ?? frame, 'absoluteFrame');
  const fps = positive(input.fps ?? 30, 'fps');
  return Object.freeze({
    absoluteFrame,
    duration: positive(input.duration ?? 1, 'duration'),
    fps,
    frame,
    height: positive(input.height ?? 1920, 'height'),
    width: positive(input.width ?? 1080, 'width'),
  });
}

export function localContext(context, offset) {
  return frameContext({ ...context, frame: context.frame - finite(offset, 'offset') });
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function progress(frame, from, duration) {
  if (duration <= 0) return Number(frame >= from);
  return clamp((frame - from) / duration);
}

export function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

export function easeOutCubic(value) {
  return 1 - ((1 - clamp(value)) ** 3);
}

export function easeOutBack(value, overshoot = 1.70158) {
  const x = clamp(value) - 1;
  return 1 + ((overshoot + 1) * (x ** 3)) + (overshoot * (x ** 2));
}

export function smoothstep(value) {
  const x = clamp(value);
  return x * x * (3 - (2 * x));
}

export function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

export function positive(value, name) {
  const number = finite(value, name);
  if (number <= 0) throw new RangeError(`${name} must be greater than zero`);
  return number;
}
