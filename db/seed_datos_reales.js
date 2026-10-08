// Inyección de DATOS REALES 2026 desde los xlsx oficiales + vaciado de 2027.
// Fuente: docs/formatos/distribucion por municipio.xlsx (ASIGNACIONES CREADAS,
// 39 municipios) y los TOTAL de ambos documentos (montos globales).
// Idempotente: upserts ON CONFLICT DO UPDATE (actualiza BD dev existente).
// Uso: node db/seed_datos_reales.js   (DATABASE_URL del .env)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const XLSX = path.join(__dirname, '..', 'docs', 'formatos', 'distribucion por municipio.xlsx');
const Y = new Date().getFullYear();          // vigencia de los documentos reales
const VACIAR = Y + 1;                        // 2027: queda vacía para el ejercicio
const ALIAS = { ARMERO: 'ARMERO GUAYABAL', 'ARMERO(GUAYABAL)': 'ARMERO GUAYABAL' };

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}
function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  return String(v);
}
// El xlsx tiene 4 celdas numéricas con separador de miles es-CO parseado como
// decimal (406.533 = 406,533): la regla % lo confirma (0.04% × 1e9 ≈ 406k).
function fixValue(n) {
  return (!Number.isInteger(n) && n > 0 && n < 5000) ? n * 1000 : n;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.getWorksheet(1);
  if (!ws) throw new Error('xlsx sin hojas');

  const mun = (await pool.query('SELECT codigo, nombre FROM municipios')).rows;
  const byN = {};
  mun.forEach((m) => { byN[norm(m.nombre)] = m.codigo; });

  // 1. ASIGNACIONES CREADAS por municipio (fila → municipio | % | dist | CREADAS).
  const filas = [];
  for (let i = 6; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const nombre = cellText(r.getCell(1).value).replace(/\s+/g, ' ').trim();
    if (!nombre || /^circunscripci/i.test(nombre) || /^total$/i.test(nombre) || /^\d/.test(nombre)) continue;
    const raw = cellText(r.getCell(4).value).replace(/,/g, '');
    const valor = fixValue(Number(raw));
    const cod = byN[norm(ALIAS[norm(nombre)] || nombre)];
    if (!cod) throw new Error(`Municipio del xlsx no está en BD: ${nombre}`);
    if (!Number.isFinite(valor)) throw new Error(`Valor ilegible para ${nombre}`);
    filas.push({ cod, nombre, valor });
  }

  // 2. Montos globales reales (TOTAL de los documentos).
  await pool.query(
    `INSERT INTO distribuciones (tipo, vigencia, asignado, ejecutado) VALUES ('municipio_actual',$1,$2,$3)
     ON CONFLICT (tipo, vigencia) DO UPDATE SET asignado = EXCLUDED.asignado, ejecutado = EXCLUDED.ejecutado`,
    [Y, 1000000003, 967151728]);
  await pool.query(
    `INSERT INTO distribuciones (tipo, vigencia, asignado, ejecutado) VALUES ('circunscripcion_actual',$1,$2,$3)
     ON CONFLICT (tipo, vigencia) DO UPDATE SET asignado = EXCLUDED.asignado, ejecutado = EXCLUDED.ejecutado`,
    [Y, 500000000, 471018310]);

  // 3. CREADAS por municipio (upsert; ppto = total del documento).
  for (const f of filas) {
    await pool.query(
      `INSERT INTO distribucion_municipio (numero, tipo, ano, ppto, municipio, valor) VALUES (1, 1, $1, $2, $3, $4)
       ON CONFLICT (numero, tipo, ano, municipio) DO UPDATE SET valor = EXCLUDED.valor, ppto = EXCLUDED.ppto`,
      [Y, 1000000003, f.cod, f.valor]);
  }

  // 4. Basura de seeds viejos en dev (stubs con años incorrectos).
  await pool.query(`DELETE FROM distribuciones WHERE vigencia = $1 AND tipo = 'municipio_actual'`, [VACIAR]);
  await pool.query(`DELETE FROM distribuciones WHERE vigencia = $1 AND tipo = 'municipio_anteriores'`, [Y]);

  // 5. ${VACIAR} vacía: el ejercicio se configura desde 0 en la pestaña Carga.
  const d1 = await pool.query(`DELETE FROM regla_oro_anual WHERE vigencia = $1`, [VACIAR]);
  const d2 = await pool.query(`DELETE FROM distribucion_municipio WHERE ano = $1`, [VACIAR]);
  const d3 = await pool.query(`DELETE FROM distribuciones WHERE vigencia = $1`, [VACIAR]);

  const suma = filas.reduce((a, x) => a + x.valor, 0);
  console.log(`[datos-reales] ${Y}: montos globales (1,000,000,003 / 500,000,000) + ${filas.length} municipios (Σ ${suma.toLocaleString('en-US')}).`);
  console.log(`[datos-reales] ${VACIAR} vaciada (regla ${d1.rowCount}, valores ${d2.rowCount}, montos ${d3.rowCount}).`);
  await pool.end();
}

main().catch((e) => { console.error('[datos-reales]', e.message); process.exit(1); });
