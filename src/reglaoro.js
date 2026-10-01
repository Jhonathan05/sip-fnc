// Regla de Oro (Fase 2): parseo + validación del xlsx oficial.
// Columnas: Circunscripción | Municipio | % part. prod | 70% prod | UPAS |
// Distribución UPAS | 30% UPAS | Regla de Oro Compuesta. Filas TOTALES/vacías se omiten.
const ExcelJS = require('exceljs');

const ALIAS = { ARMERO: 'ARMERO GUAYABAL' };

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function normKey(s) {
  return norm(ALIAS[norm(s)] || s);
}

// byCodigo: Map codigo→{codigo}, byNombre: Map NOMBRE_NORM→codigo (de municipios).
async function parseReglaOro(buffer, { byCodigo, byNombre }) {
  const errors = [];
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { rows: [], errors: ['Archivo xlsx ilegible.'] };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { rows: [], errors: ['XLSX sin hojas.'] };
  const head = ws.getRow(1).values.slice(1, 9).map((x) => norm(x));
  const want = ['CIRCUNSCRIPCION', 'MUNICIPIO', '% PARTICIPACION EN LA PRODUCCION', '70% PRODUCCION', 'UPAS', 'DISTRIBUCION DE UPAS', '30% UPAS', 'REGLA DE ORO COMPUESTA'];
  const headOk = want.every((w, i) => head[i] && head[i].replace(/\s+/g, ' ').startsWith(w.split(' ')[0]));
  if (!headOk) return { rows: [], errors: ['Encabezados inesperados (se esperaba Circunscripción|Municipio|…|Regla de Oro Compuesta).'] };
  const rows = [];
  const vistos = new Set();
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values;
    const circ = v[1] == null ? '' : String(v[1]).trim();
    const mun = v[2] == null ? '' : String(v[2]).trim();
    if (!mun) continue; // TOTALES / vacías
    const regla = Number(v[8]);
    if (!Number.isFinite(regla) || regla < 0) { errors.push(`Fila ${r} (${mun}): regla inválida.`); continue; }
    const codigo = byNombre[normKey(mun)];
    if (!codigo) { errors.push(`Fila ${r}: municipio sin código (${mun}).`); continue; }
    if (!byCodigo[codigo]) { errors.push(`Fila ${r}: código ${codigo} fuera de catálogo.`); continue; }
    if (vistos.has(codigo)) { errors.push(`Fila ${r}: municipio duplicado (${mun}).`); continue; }
    vistos.add(codigo);
    rows.push({ circ, municipio: codigo, nombre: mun, regla });
  }
  if (!rows.length && !errors.length) errors.push('Sin filas de municipios.');
  const suma = rows.reduce((a, x) => a + x.regla, 0);
  if (rows.length && Math.abs(suma - 1) > 0.002) {
    errors.push(`La regla debe sumar 1.0 (suma ${suma.toFixed(4)}).`);
  }
  return { rows, errors };
}

module.exports = { parseReglaOro, norm, normKey, ALIAS };
