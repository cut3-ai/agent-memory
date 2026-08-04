const FORBIDDEN_KEY_TOKENS = new Set([
  'rawsource',
  'prompt',
  'prompts',
  'transcript',
  'transcripts',
  'messages',
  'caption',
  'captions',
  'usercontent',
  'dialogue',
  'dialogues',
  'sourcecode',
  'cover',
  'url',
  'urls',
  'text',
  'content',
  'payload',
  'input',
  'output',
  'data',
]);
const RAW_URL = /https?:\/\//iu;
const RAW_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\b/iu;
const NON_HTTP_URI = /(?<![A-Z0-9+.-])(?!https?:)[A-Z][A-Z0-9+.-]{1,31}:[^\s<>()]+/iu;
const BARE_DOMAIN = /(?<![\p{L}\p{N}_@/.-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]{2,59})(?![\p{L}\p{N}_-])/iu;
const IPV4_ADDRESS = /(?<![\w@])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?![\w.])/u;
const IPV6_ADDRESS = /(?<![A-F0-9:])(?:\[[A-F0-9:]{2,}\]|(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4})(?::\d{1,5})?(?![A-F0-9:])/iu;
const LOCALHOST = /(?<![\p{L}\p{N}_-])localhost(?::\d{1,5})?(?![\p{L}\p{N}_-])/iu;
const SECRET = /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u;
const FREE_TEXT = /\s|["'`{};]/u;
const DOTTED_LABEL_KEYS = new Set([
  'candidatekind',
  'capability',
  'channel',
  'infrastructurekind',
  'kind',
  'memorykind',
  'sourcekind',
]);
const SAFE_DOTTED_LABEL = /^(?:ast|attribute|behaviour|canvas|card|content|css|dom|filter|jsx|layout|media|motion|overlay|paint|procedural|property|react|remotion|scene|style|structure|svg|syntax|text|three|timeline|transform|typography|unit|vector|visual)\.[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SAFE_STRATIFICATION_LABEL = /^(?:render:(?:unknown|dom|svg|canvas2d|three)|family:(?:image|video|audio|text|three|canvas)|motion:(?:interpolate|spring|oscillation)|structure:(?:collection|timeline))$/u;

/** Public memory artifacts are JSON metadata, never user/code payloads. */
export function inspectPublicArtifact(value, path = [], findings = []) {
  if (typeof value === 'string') {
    const safeMetadataString = isSafeOpaqueLabel(value, path) || isSafeArtifactFile(value, path);
    if (RAW_URL.test(value)) findings.push(finding(path, 'raw-url'));
    if (RAW_EMAIL.test(value)) findings.push(finding(path, 'raw-email'));
    if (!safeMetadataString && NON_HTTP_URI.test(value)) findings.push(finding(path, 'raw-uri'));
    if (!safeMetadataString && (BARE_DOMAIN.test(value)
        || IPV4_ADDRESS.test(value)
        || IPV6_ADDRESS.test(value)
        || LOCALHOST.test(value))) {
      findings.push(finding(path, 'raw-host'));
    }
    if (SECRET.test(value)) findings.push(finding(path, 'secret-like-token'));
    if (value.length > 256 || FREE_TEXT.test(value)) findings.push(finding(path, 'free-text'));
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPublicArtifact(entry, [...path, index], findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, nested] of Object.entries(value)) {
    const keyToken = normalizeKeyToken(key);
    if (keyToken === 'source') {
      if (isSafeModuleSource(nested)) continue;
      findings.push(finding([...path, key], 'raw-source'));
    }
    if (FORBIDDEN_KEY_TOKENS.has(keyToken)) {
      findings.push(finding([...path, key], 'forbidden-key'));
    }
    inspectPublicArtifact(nested, [...path, key], findings);
  }
  return findings;
}

export function assertPublicArtifact(value) {
  const findings = inspectPublicArtifact(value);
  if (findings.length > 0) {
    throw new Error(
      `Public memory artifact failed privacy validation: ${findings[0].code} at ${findings[0].path}`,
    );
  }
  return value;
}

function finding(path, code) {
  return { path: path.map(String).join('.') || '<root>', code };
}

function isSafeModuleSource(value) {
  if (typeof value !== 'string' || value.includes('\\')) return false;
  const normalized = value.startsWith('./') ? value.slice(2) : value;
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  if (!['units', 'behaviours'].includes(segments[0])) return false;
  return segments.slice(1).every((segment, index, files) => (
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(segment)
    && (index < files.length - 1 || /\.(?:js|mjs|jsx)$/u.test(segment))
  ));
}

function normalizeKeyToken(value) {
  return value.toLowerCase().replace(/[-_]/gu, '');
}

function isSafeOpaqueLabel(value, path) {
  const keyToken = normalizeKeyToken(String(path.at(-1) ?? ''));
  if (DOTTED_LABEL_KEYS.has(keyToken)) return SAFE_DOTTED_LABEL.test(value);
  return keyToken === 'label' && SAFE_STRATIFICATION_LABEL.test(value);
}

function isSafeArtifactFile(value, path) {
  if (normalizeKeyToken(String(path.at(-1) ?? '')) !== 'file') return false;
  return /^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.json$/u.test(value);
}
