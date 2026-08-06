/**
 * Generates all local placeholder brand/product assets:
 *   - Sweet Gonz logo (SVG)
 *   - category placeholder SVGs
 *   - per-product placeholder SVGs
 *   - demo e-wallet QR placeholder (deterministic pseudo-QR, clearly labeled)
 *   - favicon (SVG)
 *   - PWA PNG icons 192/512 + maskable (rasterized from the logo via sharp)
 *
 * Everything is generated locally; real client assets can replace files in
 * public/placeholders without touching application logic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSeedMenu } from '../packages/shared/src/seed-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '../apps/web/public');
const PLACEHOLDERS = path.join(PUBLIC, 'placeholders');
const ICONS = path.join(PUBLIC, 'icons');

const NAVY = '#1B2A4A';
const CREAM = '#FAF3E7';
const INK = '#6B5D4F';
const ACCENT = '#C96F4A';

const CATEGORY_COLORS = {
  pasta: '#C96F4A',
  snacks: '#D9A441',
  bread: '#A9845B',
  'drip-coffee': '#7B4B2A',
  espresso: '#4A2E1B',
  'ice-shaken': '#C44A6E',
  'non-coffee': '#5B7B4A',
};

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Deterministic PRNG so generated art is stable across runs. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function brushStrokeSvg(color = ACCENT, x = 40, y = 96, w = 320, h = 22) {
  return `<path d="M${x},${y + h * 0.5} Q${x + w * 0.25},${y - h * 0.6} ${x + w * 0.5},${y + h * 0.3} T${x + w},${y - h * 0.2}" fill="none" stroke="${color}" stroke-width="${h}" stroke-linecap="round" opacity="0.55"/>`;
}

function productSvg({ name, initial, category, color: _color }) {
  const bg = CATEGORY_COLORS[category] || ACCENT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="${esc(name)}">
  <rect width="600" height="400" rx="28" fill="${CREAM}"/>
  <circle cx="520" cy="70" r="150" fill="${bg}" opacity="0.10"/>
  <circle cx="90" cy="340" r="110" fill="${bg}" opacity="0.08"/>
  ${brushStrokeSvg(bg, 60, 118, 480, 16)}
  <circle cx="300" cy="176" r="104" fill="#FFFFFF" stroke="${bg}" stroke-width="10"/>
  <text x="300" y="212" font-family="'Segoe Script','Brush Script MT',cursive" font-size="104" fill="${bg}" text-anchor="middle">${esc(initial)}</text>
  <text x="300" y="300" font-family="Georgia,'Times New Roman',serif" font-size="34" font-weight="700" fill="${NAVY}" text-anchor="middle">${esc(name)}</text>
  <text x="300" y="330" font-family="Arial,sans-serif" font-size="15" letter-spacing="4" fill="${INK}" text-anchor="middle">SWEET GONZ BAKESHOP CAFÉ</text>
</svg>`;
}

function categorySvg({ slug: _slug, label, initial, color }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" role="img" aria-label="${esc(label)}">
  <rect width="600" height="400" rx="28" fill="${CREAM}"/>
  <circle cx="520" cy="70" r="150" fill="${color}" opacity="0.10"/>
  ${brushStrokeSvg(color, 60, 100, 480, 16)}
  <circle cx="300" cy="170" r="96" fill="${color}"/>
  <text x="300" y="206" font-family="'Segoe Script','Brush Script MT',cursive" font-size="88" fill="#FFFFFF" text-anchor="middle">${esc(initial)}</text>
  <text x="300" y="290" font-family="Georgia,'Times New Roman',serif" font-size="36" font-weight="700" fill="${NAVY}" text-anchor="middle">${esc(label)}</text>
  <text x="300" y="322" font-family="Arial,sans-serif" font-size="14" letter-spacing="4" fill="${INK}" text-anchor="middle">SWEET GONZ BAKESHOP CAFÉ</text>
</svg>`;
}

/**
 * Deterministic pseudo-QR placeholder: real finder patterns + seeded modules.
 * Visually QR-like, functionally decorative, labeled DEMO so it can never be
 * mistaken for a real merchant QR.
 */
function demoQrSvg() {
  const size = 29;
  const cell = 20;
  const dim = size * cell;
  const rng = mulberry32(0x5a17c0de);
  const cells = [];
  const isFinder = (r, c) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (isFinder(r, c)) continue;
      if (rng() < 0.46)
        cells.push(
          `<rect x="${c * cell + 2}" y="${r * cell + 2}" width="${cell - 4}" height="${cell - 4}" rx="3" fill="${NAVY}"/>`,
        );
    }
  }
  const finder = (x, y) => `
    <rect x="${x}" y="${y}" width="${7 * cell}" height="${7 * cell}" rx="6" fill="${NAVY}"/>
    <rect x="${x + cell}" y="${y + cell}" width="${5 * cell}" height="${5 * cell}" rx="4" fill="#FFFFFF"/>
    <rect x="${x + 2 * cell}" y="${y + 2 * cell}" width="${3 * cell}" height="${3 * cell}" rx="3" fill="${NAVY}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="Demo e-wallet QR placeholder - not a real payment QR">
  <rect width="${dim}" height="${dim}" rx="16" fill="#FFFFFF" stroke="${NAVY}" stroke-width="6"/>
  ${cells.join('')}
  ${finder(2, 2)}
  ${finder(dim - 7 * cell - 2, 2)}
  ${finder(2, dim - 7 * cell - 2)}
  <rect x="${(size / 2 - 4) * cell}" y="${(size / 2 - 2.5) * cell}" width="${8 * cell}" height="${5 * cell}" rx="10" fill="#FFFFFF" stroke="${ACCENT}" stroke-width="6"/>
  <text x="${dim / 2}" y="${dim / 2 + 12}" font-family="Arial,sans-serif" font-size="44" font-weight="800" fill="${ACCENT}" text-anchor="middle">DEMO</text>
  <text x="${dim / 2}" y="${dim / 2 + 52}" font-family="Arial,sans-serif" font-size="20" fill="${INK}" text-anchor="middle">Not a real payment QR</text>
</svg>`;
}

function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-label="Sweet Gonz Bakeshop Café logo">
  <rect width="640" height="400" rx="32" fill="${CREAM}"/>
  <circle cx="560" cy="64" r="150" fill="${ACCENT}" opacity="0.12"/>
  <circle cx="80" cy="340" r="120" fill="#D9A441" opacity="0.10"/>
  ${brushStrokeSvg(ACCENT, 90, 150, 460, 18)}
  ${brushStrokeSvg('#D9A441', 90, 176, 460, 14)}
  <g transform="translate(120,96)">
    <path d="M0,120 L60,0 L120,120 Z" fill="none" stroke="${NAVY}" stroke-width="14" stroke-linejoin="round"/>
    <path d="M16,96 Q30,64 60,58 Q90,64 104,96" fill="none" stroke="${NAVY}" stroke-width="10"/>
    <path d="M20,120 Q60,150 100,120" fill="none" stroke="${ACCENT}" stroke-width="10" stroke-linecap="round"/>
    <path d="M34,64 Q30,40 40,30" fill="none" stroke="${NAVY}" stroke-width="8" stroke-linecap="round"/>
    <path d="M86,64 Q90,40 80,30" fill="none" stroke="${NAVY}" stroke-width="8" stroke-linecap="round"/>
  </g>
  <text x="250" y="150" font-family="'Segoe Script','Brush Script MT',cursive" font-size="86" fill="${NAVY}">Sweet Gonz</text>
  <text x="252" y="212" font-family="Arial,sans-serif" font-size="30" font-weight="700" letter-spacing="12" fill="${ACCENT}">BAKESHOP CAFÉ</text>
  <text x="252" y="256" font-family="Georgia,serif" font-size="22" font-style="italic" fill="${INK}">self-service ordering kiosk</text>
  <text x="252" y="300" font-family="Arial,sans-serif" font-size="15" letter-spacing="2" fill="${INK}">FRESHLY BAKED · BREWED WITH LOVE · PILOT DEMO</text>
</svg>`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${NAVY}"/>
  <path d="M14,44 L32,10 L50,44 Z" fill="none" stroke="#FAF3E7" stroke-width="5" stroke-linejoin="round"/>
  <path d="M22,36 Q32,22 42,36" fill="none" stroke="#FAF3E7" stroke-width="4"/>
  <path d="M20,46 Q32,54 44,46" fill="none" stroke="#C96F4A" stroke-width="4" stroke-linecap="round"/>
</svg>`;
}

function writeIfChanged(file, content) {
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing !== content) fs.writeFileSync(file, content, 'utf8');
}

const { categories, products } = buildSeedMenu();

fs.mkdirSync(path.join(PLACEHOLDERS, 'categories'), { recursive: true });
fs.mkdirSync(path.join(PLACEHOLDERS, 'products'), { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });

writeIfChanged(path.join(PLACEHOLDERS, 'logo.svg'), logoSvg());
writeIfChanged(path.join(PLACEHOLDERS, 'demo-qr.svg'), demoQrSvg());
writeIfChanged(path.join(PUBLIC, 'favicon.svg'), faviconSvg());

let count = 0;
for (const category of categories) {
  const color = CATEGORY_COLORS[category.slug] || ACCENT;
  const label = category.nameEn;
  const file = path.join(PLACEHOLDERS, 'categories', `${category.slug}.svg`);
  writeIfChanged(file, categorySvg({ slug: category.slug, label, initial: label[0], color }));
  count += 1;
}
for (const product of products) {
  const color = CATEGORY_COLORS[product.categorySlug] || ACCENT;
  const file = path.join(PLACEHOLDERS, 'products', `${product.sku}.svg`);
  writeIfChanged(
    file,
    productSvg({
      name: product.name,
      initial: product.name[0],
      category: product.categorySlug,
      color,
    }),
  );
  count += 1;
}
console.log(`Wrote ${count} SVG placeholders (logo, categories, products, demo QR, favicon).`);

// PNG icons via sharp (project-local dependency).
try {
  const sharp = (await import('sharp')).default;
  const logo = path.join(PLACEHOLDERS, 'logo.svg');
  await sharp(logo).resize(192, 192).png().toFile(path.join(ICONS, 'icon-192.png'));
  await sharp(logo).resize(512, 512).png().toFile(path.join(ICONS, 'icon-512.png'));
  // Maskable: navy background fills the safe zone.
  // Note: composite() then resize() in one pipeline fails on this sharp
  // build ("Image to composite must have same dimensions or smaller"), so
  // composite to a buffer first, then resize.
  const logoPng = await sharp(logo).resize(640, 400).png().toBuffer();
  const maskableFull = await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: NAVY },
  })
    .composite([{ input: logoPng, top: 312, left: 192 }])
    .png()
    .toBuffer();
  await sharp(maskableFull)
    .resize(512, 512)
    .png()
    .toFile(path.join(ICONS, 'icon-maskable-512.png'));
  console.log('Wrote PWA PNG icons: icon-192.png, icon-512.png, icon-maskable-512.png');
} catch (err) {
  console.error('PNG icon generation failed (sharp unavailable):', err.message);
  console.error('SVG assets were still written. Run: npm install && npm run assets:generate');
  process.exit(1);
}
