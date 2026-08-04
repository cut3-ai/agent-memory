export function visualStyle(state, defaults = {}) {
  const appearance = isPlainRecord(state.appearance) ? state.appearance : {};
  const style = { ...defaults, ...appearance };

  if (state.opacity !== undefined) style.opacity = state.opacity;

  const transform = transformString(state.transform, style.transform);
  if (transform) style.transform = transform;
  else if (style.transform === undefined) delete style.transform;

  const filter = filterString(state.filter, state.blur, style.filter);
  if (filter) style.filter = filter;
  else if (style.filter === undefined) delete style.filter;

  return style;
}

export function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, nested]) => nested !== undefined));
}

export function fragment({ React }, children) {
  return React.createElement(React.Fragment, null, ...children);
}

export function positionPercent(index, count) {
  return count <= 1 ? 0 : (100 * index) / (count - 1);
}

function transformString(transform, inherited) {
  const operations = typeof inherited === 'string' && inherited ? [inherited] : [];
  if (!isPlainRecord(transform)) return operations.join(' ');

  for (const [name, value] of Object.entries(transform)) {
    if (name === 'scale') operations.push(scale(value));
    else if (name === 'translate') operations.push(translate(value));
    else if (name === 'rotate') operations.push(rotate(value));
  }
  return operations.filter(Boolean).join(' ');
}

function filterString(filter, directBlur, inherited) {
  const operations = typeof inherited === 'string' && inherited ? [inherited] : [];
  if (isPlainRecord(filter)) {
    for (const [name, value] of Object.entries(filter)) {
      if (name === 'blur') operations.push(`blur(${value}px)`);
    }
  } else if (directBlur !== undefined) {
    operations.push(`blur(${directBlur}px)`);
  }
  return operations.join(' ');
}

function scale(value) {
  if (typeof value === 'number') return `scale(${value})`;
  if (!isPlainRecord(value)) return '';
  return value.z === undefined
    ? `scale(${value.x ?? 1}, ${value.y ?? value.x ?? 1})`
    : `scale3d(${value.x ?? 1}, ${value.y ?? 1}, ${value.z})`;
}

function translate(value) {
  if (!isPlainRecord(value)) return '';
  const unit = value.unit ?? value.units ?? 'px';
  return value.z === undefined
    ? `translate(${value.x ?? 0}${unit}, ${value.y ?? 0}${unit})`
    : `translate3d(${value.x ?? 0}${unit}, ${value.y ?? 0}${unit}, ${value.z}${unit})`;
}

function rotate(value) {
  if (typeof value === 'number') return `rotate(${value}deg)`;
  if (!isPlainRecord(value)) return '';
  return `rotate(${value.value ?? 0}${value.unit ?? value.units ?? 'deg'})`;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
