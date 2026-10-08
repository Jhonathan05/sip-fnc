// Genera iconos PWA desde el logo blanco (skill fnc-app-icon-badge).
// Fondo --primary con esquinas redondeadas ~22% DENTRO del PNG + logo
// blanco centrado con padding (apto maskable). Idempotente.
// Uso: node scripts/gen-app-icon.cjs [--force]
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'icons');
const LOGO = path.join(ROOT, 'public', 'img', 'logo-fnc-tolima-white.png');
const BG = '#6B4A2B';
const FORCE = process.argv.includes('--force');

async function roundedBg(size, radius) {
  const r = Math.round(size * radius);
  const svg = `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function build(size, padPct, file) {
  const dest = path.join(OUT, file);
  if (!FORCE && fs.existsSync(dest)) { console.log('[icon] existe:', file); return; }
  const bg = await roundedBg(size, 0.22);
  const logoSize = Math.round(size * (1 - padPct * 2));
  const logo = await sharp(LOGO).resize(logoSize, logoSize, { fit: 'inside' }).png().toBuffer();
  await sharp(bg).composite([{ input: logo, gravity: 'center' }]).png().toFile(dest);
  console.log('[icon] ok:', file, `${size}x${size}`);
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  await build(192, 0.12, 'app-icon-192.png');
  await build(512, 0.12, 'app-icon-512.png');
  await build(512, 0.22, 'app-icon-maskable-512.png');
})().catch((e) => { console.error('[icon]', e.message); process.exit(1); });
