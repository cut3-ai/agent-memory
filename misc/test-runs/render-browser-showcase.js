import { spawnSync } from 'node:child_process';
import {
  access,
  mkdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ArchivalDossierComposition } from '@cut3/agent-memory/compositions/ArchivalDossierComposition';
import { RetroRitualRankingComposition } from '@cut3/agent-memory/compositions/RetroRitualRankingComposition';
import { SignalEditorialComposition } from '@cut3/agent-memory/compositions/SignalEditorialComposition';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';

const React = {
  Fragment: 'cut3-fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

const root = path.resolve('misc/test-runs');
const outputDirectory = path.join(root, 'showcase');
const htmlDirectory = path.join(root, 'generated', 'browser-html');
const profile = path.join(root, 'generated', `browser-profile-${process.pid}`);
const browser = await findBrowser();
await mkdir(outputDirectory, { recursive: true });
await mkdir(htmlDirectory, { recursive: true });
await mkdir(profile, { recursive: true });

const showcases = [
  ['signal-editorial', SignalEditorialComposition, [12, 60, 90]],
  ['archival-dossier', ArchivalDossierComposition, [20, 74, 100]],
  ['retro-ritual-ranking', RetroRitualRankingComposition, [30, 60, 90]],
];

try {
  for (const [name, CompositionClass, frames] of showcases) {
    const composition = new CompositionClass();
    const driver = createReactDriver(React);
    const panels = frames.map((frame) => ({
      frame,
      tree: driver.render(composition, { frame }),
    }));
    const htmlFile = path.join(htmlDirectory, `${name}.html`);
    const pngFile = path.join(outputDirectory, `${name}.png`);
    await writeFile(htmlFile, documentHtml(name, panels), 'utf8');
    const result = spawnSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=2500',
      '--window-size=1080,700',
      `--user-data-dir=${profile}`,
      `--screenshot=${pngFile}`,
      pathToFileURL(htmlFile).href,
    ], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(result.stderr || `browser exited with ${result.status}`);
    }
    console.log(`${name}: ${frames.join(', ')} -> ${path.relative(process.cwd(), pngFile)}`);
  }
} finally {
  await rm(profile, { force: true, recursive: true });
}

function documentHtml(name, panels) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeText(name)}</title>
<style>
html, body { margin: 0; width: 1080px; height: 700px; overflow: hidden; background: #090909; }
body { position: relative; font-family: sans-serif; }
.labels { position: absolute; z-index: 2; left: 0; top: 0; display: grid; grid-template-columns: repeat(3, 360px); width: 1080px; height: 38px; }
.label { color: #f4efe6; background: #090909; font: 700 16px/38px monospace; text-align: center; }
.panels { position: absolute; z-index: 1; left: 0; top: 38px; display: grid; grid-template-columns: repeat(3, 360px); }
.panel { position: relative; isolation: isolate; width: 360px; height: 662px; overflow: hidden; background: #181818; }
.viewport { position: relative; width: 360px; height: 640px; overflow: hidden; }
.stage { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; transform: scale(0.3333333333); transform-origin: 0 0; }
</style>
</head>
<body>
<div class="labels">${panels.map(({ frame }) => `<div class="label">FRAME ${frame}</div>`).join('')}</div>
<div class="panels">${panels.map(({ tree }) => `<section class="panel"><div class="viewport"><div class="stage">${serialize(tree)}</div></div></section>`).join('')}</div>
</body>
</html>`;
}

function serialize(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeText(String(node));
  if (node.type === React.Fragment) return node.children.map(serialize).join('');
  const type = String(node.type);
  const inner = node.props.dangerouslySetInnerHTML?.__html
    ?? node.children.map(serialize).join('');
  const attributes = Object.entries(node.props)
    .filter(([key, value]) => (
      key !== 'dangerouslySetInnerHTML'
      && key !== 'ref'
      && typeof value !== 'function'
      && value !== undefined
      && value !== null
      && value !== false
    ))
    .map(([key, value]) => attribute(key, value))
    .filter(Boolean)
    .join(' ');
  return `<${type}${attributes ? ` ${attributes}` : ''}>${inner}</${type}>`;
}

function attribute(key, value) {
  if (key === 'style') return `style="${escapeAttribute(style(value))}"`;
  if (value === true) return key;
  const names = {
    className: 'class',
    pathLength: 'pathLength',
    strokeDasharray: 'stroke-dasharray',
    strokeDashoffset: 'stroke-dashoffset',
    strokeLinecap: 'stroke-linecap',
    strokeLinejoin: 'stroke-linejoin',
    strokeWidth: 'stroke-width',
    viewBox: 'viewBox',
  };
  return `${names[key] ?? key}="${escapeAttribute(String(value))}"`;
}

function style(value) {
  return Object.entries(value)
    .filter(([, nested]) => nested !== undefined && nested !== null && nested !== '')
    .map(([key, nested]) => `${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}:${nested}`)
    .join(';');
}

function escapeText(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replaceAll('"', '&quot;');
}

async function findBrowser() {
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  throw new Error('Chrome or Edge is required for showcase:browser');
}
