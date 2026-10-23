// Rasteriza public/icons/icon.svg a PNG con el Chromium del sistema (playwright-core).
// Uso: npm run icons   (CHROMIUM_PATH opcional). Los PNG resultantes se versionan.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      const p = join(base, d, 'chrome-linux64', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return undefined; // deja que playwright-core busque su propio navegador
}

// Maskable: la bolilla ocupa ~70 % centrado (zona segura) sobre fondo rojo a sangre.
const maskableWrapped = svg.replace(/<rect[^>]*\/>/, '').replace(/<circle cx="400" cy="112"[^>]*\/>/, '').replace(
  /(<svg[^>]*>)([\s\S]*)(<\/svg>)/,
  '$1<rect width="512" height="512" fill="#facc15"/><g transform="translate(256 256) scale(0.72) translate(-256 -256)">' +
    '$2</g>$3',
);

const targets = [
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'apple-touch-icon.png', size: 180, svg: svg.replace(/rx="112"/, 'rx="0"') },
  { file: 'icon-maskable-512.png', size: 512, svg: maskableWrapped },
];

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  for (const t of targets) {
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${t.size}px;height:${t.size}px}</style>${t.svg}`,
    );
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
    writeFileSync(join(dir, t.file), buf);
    console.log(`${t.file} (${t.size}x${t.size}) ${buf.length} bytes`);
  }
} finally {
  await browser.close();
}
