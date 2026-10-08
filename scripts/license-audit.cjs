// Auditoría de licencias (skill fnc-license-compliance): prohíbe copyleft
// fuerte (GPLv3, AGPLv3, SSPL) en dependencias de producción.
// Uso: node scripts/license-audit.cjs (exit 0 = limpio). Offline: lee node_modules.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const FORBIDDEN = /GPL|AGPL|SSPL|Commons Clause/i;

const bad = [];
for (const name of Object.keys(pkg.dependencies || {})) {
  const pj = path.join(ROOT, 'node_modules', name, 'package.json');
  if (!fs.existsSync(pj)) { bad.push(`${name}: NO INSTALADO`); continue; }
  const lic = JSON.parse(fs.readFileSync(pj, 'utf8')).license || 'SIN-LICENCIA';
  if (FORBIDDEN.test(lic)) bad.push(`${name}: ${lic}`);
}

const n = Object.keys(pkg.dependencies || {}).length;
if (bad.length) {
  console.error(`[license] PROHIBIDAS (${bad.length}/${n}):\n- ${bad.join('\n- ')}`);
  process.exit(1);
}
console.log(`[license] limpio: ${n} dependencias de producción, sin copyleft fuerte.`);
