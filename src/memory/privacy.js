const FORBIDDEN_KEYS = new Set([
  'rawSource',
  'prompt',
  'prompts',
  'transcript',
  'messages',
  'cover',
  'url',
  'text',
  'content',
  'payload',
  'input',
  'output',
  'data',
]);
const RAW_URL = /https?:\/\//i;
const SECRET = /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/;
const FREE_TEXT = /\s|["'`{};]/u;
const SAFE_MODULE_SOURCE = /^(?:\.\/)?(?:units|behaviours)\/[A-Za-z0-9_./-]+\.js$/;

/** Public memory artifacts are JSON metadata, never user/code payloads. */
export function inspectPublicArtifact(value, path = [], findings = []) {
  if (typeof value === 'string') {
    if (RAW_URL.test(value)) findings.push(finding(path, 'raw-url'));
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
    if (key === 'source' && (
      typeof nested !== 'string' || !SAFE_MODULE_SOURCE.test(nested)
    )) {
      findings.push(finding([...path, key], 'raw-source'));
    }
    if (FORBIDDEN_KEYS.has(key)) findings.push(finding([...path, key], 'forbidden-key'));
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
