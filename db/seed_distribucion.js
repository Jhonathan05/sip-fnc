// Seed maestros Distribución. FUENTE: docs/formatos/REGLA DE ORO TOLIMA 2026.xlsx
// (nombres oficiales de circunscripciones + municipios con su circunscripción).
// Códigos estables: se conservan los existentes (match por nombre normalizado);
// circunscripciones cafeteras nuevas: CHAP/FRES/IBAG/LIBA/PLAN/VILL.
// Idempotente (upserts + reporte). Uso: node db/seed_distribucion.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const ExcelJS = require('exceljs');
const { Pool } = require('pg');

const XLSX = path.join(__dirname, '..', 'docs', 'formatos', 'REGLA DE ORO TOLIMA 2026.xlsx');
const CIRC_CODIGOS = { Chaparral: 'CHAP', Fresno: 'FRES', 'Ibagué': 'IBAG', 'Líbano': 'LIBA', Planadas: 'PLAN', Villarrica: 'VILL' };
// Nombres del xlsx que difieren del seed histórico (códigos se conservan).
const ALIAS = { ARMERO: 'ARMERO GUAYABAL' };
// Circunscripciones direccionales legacy (se retiran si nada las referencia).
const LEGACY_CIRC = ['NOR', 'SUR', 'ORI', 'OCC', 'CEN'];

const TIPOS = [
  ['MUN-ACT', 'Por Municipio - Vigencia Actual'],
  ['MUN-ANT', 'Por Municipio - Vigencias Anteriores'],
  ['CIR-ACT', 'Por Circunscripción - Vigencia Actual'],
  ['CIR-ANT', 'Por Circunscripción - Vigencias Anteriores'],
];

// Base estable de 47 municipios (códigos inmutables; la circunscripción la asigna el xlsx).
const BASE_MUNICIPIOS = [
  ['ALP', 'ALPUJARRA'], ['ALV', 'ALVARADO'], ['AMB', 'AMBALEMA'], ['ANZ', 'ANZOATEGUI'],
  ['ARG', 'ARMERO GUAYABAL'], ['ATA', 'ATACO'], ['CAJ', 'CAJAMARCA'], ['CAS', 'CASABIANCA'],
  ['CDA', 'CARMEN DE APICALA'], ['CHA', 'CHAPARRAL'], ['COE', 'COELLO'], ['COY', 'COYAIMA'],
  ['CUN', 'CUNDAY'], ['DOL', 'DOLORES'], ['ESP', 'EL ESPINAL'], ['FAL', 'FALAN'],
  ['FLA', 'FLANDES'], ['FRE', 'FRESNO'], ['GUA', 'GUAMO'], ['HER', 'HERVEO'],
  ['HON', 'HONDA'], ['IBG', 'IBAGUE'], ['ICO', 'ICONONZO'], ['LER', 'LERIDA'],
  ['LIB', 'LIBANO'], ['MAR', 'MARIQUITA'], ['MEL', 'MELGAR'], ['MUR', 'MURILLO'],
  ['NAT', 'NATAGAIMA'], ['ORT', 'ORTEGA'], ['PAL', 'PALOCABILDO'], ['PIE', 'PIEDRAS'],
  ['PLA', 'PLANADAS'], ['PRA', 'PRADO'], ['PUR', 'PURIFICACION'], ['RIO', 'RIOBLANCO'],
  ['RON', 'RONCESVALLES'], ['ROV', 'ROVIRA'], ['SAL', 'SALDAÑA'], ['SAN', 'SAN ANTONIO'],
  ['SLU', 'SAN LUIS'], ['STI', 'SANTA ISABEL'], ['SUA', 'SUAREZ'], ['VEN', 'VENADILLO'],
  ['VIL', 'VILLAHERMOSA'], ['VRI', 'VILLARRICA'], ['VSJ', 'VALLE DE SAN JUAN'],
];

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('XLSX sin hojas');

  // 1. Circunscripciones cafeteras (upsert por código; actualiza nombre).
  for (const [nombre, codigo] of Object.entries(CIRC_CODIGOS)) {
    await pool.query(
      `INSERT INTO circunscripciones (codigo, nombre) VALUES ($1,$2)
       ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre`,
      [codigo, nombre]);
  }
  // 2. Retira legacy solo si nada las referencia.
  const ref = await pool.query(
    `SELECT DISTINCT circunscripcion AS c FROM municipios WHERE circunscripcion = ANY($1)`, [LEGACY_CIRC]);
  const usadas = new Set(ref.rows.map((r) => r.c));
  for (const c of LEGACY_CIRC) {
    if (!usadas.has(c)) await pool.query('DELETE FROM circunscripciones WHERE codigo = $1', [c]);
  }
  // 3. Tipos (idempotente clásico).
  for (const [codigo, nombre] of TIPOS) {
    await pool.query('INSERT INTO tipos_distribucion (codigo, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [codigo, nombre]);
  }
  // 3b. Base de municipios (imprescindible en BD frescas; no pisa existentes).
  for (const [codigo, nombre] of BASE_MUNICIPIOS) {
    await pool.query('INSERT INTO municipios (codigo, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [codigo, nombre]);
  }
  // 4. Municipios: asigna circunscripción por match de nombre; reporta.
  const db = (await pool.query('SELECT codigo, nombre FROM municipios')).rows;
  const byN = {};
  db.forEach((x) => { byN[norm(x.nombre)] = x.codigo; });
  let asignados = 0;
  const nuevos = [];
  const vistos = new Set();
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values;
    const circ = v[1] == null ? '' : String(v[1]).trim();
    const mun = v[2] == null ? '' : String(v[2]).trim();
    if (!mun) continue; // TOTALES / filas vacías
    const codigo = byN[norm(ALIAS[norm(mun)] || mun)];
    if (!codigo) { nuevos.push(mun); continue; }
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    const circCod = CIRC_CODIGOS[circ];
    if (!circCod) throw new Error(`Circunscripción desconocida en fila ${r}: ${circ}`);
    await pool.query('UPDATE municipios SET circunscripcion = $1 WHERE codigo = $2', [circCod, codigo]);
    asignados++;
  }
  const ausentes = (await pool.query(
    `SELECT nombre FROM municipios WHERE circunscripcion IS NULL ORDER BY nombre`)).rows.map((x) => x.nombre);
  console.log('[seed] regla-oro:', JSON.stringify({ asignados, ausentes, nuevos }));
  await pool.end();
}

main().catch((e) => { console.error('[seed]', e.message); process.exit(1); });
