// Seed maestros Distribución (fuente: skill reportfnc/geo-data.ts — 47 municipios).
// Idempotente (ON CONFLICT DO NOTHING). Uso: node db/seed_distribucion.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const CIRCUNSCRIPCIONES = [
  ['NOR', 'Norte'], ['SUR', 'Sur'], ['ORI', 'Oriente'], ['OCC', 'Occidente'], ['CEN', 'Centro'],
];

const TIPOS = [
  ['MUN-ACT', 'Por Municipio - Vigencia Actual'],
  ['MUN-ANT', 'Por Municipio - Vigencias Anteriores'],
  ['CIR-ACT', 'Por Circunscripción - Vigencia Actual'],
  ['CIR-ANT', 'Por Circunscripción - Vigencias Anteriores'],
];

const MUNICIPIOS = [
  ['ALV', 'ALVARADO'], ['AMB', 'AMBALEMA'], ['ANZ', 'ANZOATEGUI'], ['ALP', 'ALPUJARRA'],
  ['ARG', 'ARMERO GUAYABAL'], ['ATA', 'ATACO'], ['CAJ', 'CAJAMARCA'], ['CDA', 'CARMEN DE APICALA'],
  ['CAS', 'CASABIANCA'], ['CHA', 'CHAPARRAL'], ['COE', 'COELLO'], ['COY', 'COYAIMA'],
  ['CUN', 'CUNDAY'], ['DOL', 'DOLORES'], ['ESP', 'EL ESPINAL'], ['FAL', 'FALAN'],
  ['FLA', 'FLANDES'], ['FRE', 'FRESNO'], ['GUA', 'GUAMO'], ['HER', 'HERVEO'],
  ['HON', 'HONDA'], ['IBG', 'IBAGUE'], ['ICO', 'ICONONZO'], ['LER', 'LERIDA'],
  ['LIB', 'LIBANO'], ['MAR', 'MARIQUITA'], ['MEL', 'MELGAR'], ['MUR', 'MURILLO'],
  ['NAT', 'NATAGAIMA'], ['ORT', 'ORTEGA'], ['PAL', 'PALOCABILDO'], ['PIE', 'PIEDRAS'],
  ['PLA', 'PLANADAS'], ['PRA', 'PRADO'], ['PUR', 'PURIFICACION'], ['RIO', 'RIOBLANCO'],
  ['RON', 'RONCESVALLES'], ['ROV', 'ROVIRA'], ['SAL', 'SALDAÑA'], ['SAN', 'SAN ANTONIO'],
  ['SLU', 'SAN LUIS'], ['STI', 'SANTA ISABEL'], ['SUA', 'SUAREZ'], ['VSJ', 'VALLE DE SAN JUAN'],
  ['VEN', 'VENADILLO'], ['VIL', 'VILLAHERMOSA'], ['VRI', 'VILLARRICA'],
];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const [codigo, nombre] of CIRCUNSCRIPCIONES) {
    await pool.query('INSERT INTO circunscripciones (codigo, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [codigo, nombre]);
  }
  for (const [codigo, nombre] of TIPOS) {
    await pool.query('INSERT INTO tipos_distribucion (codigo, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [codigo, nombre]);
  }
  for (const [codigo, nombre] of MUNICIPIOS) {
    await pool.query('INSERT INTO municipios (codigo, nombre) VALUES ($1,$2) ON CONFLICT DO NOTHING', [codigo, nombre]);
  }
  const n = await pool.query('SELECT (SELECT COUNT(*) FROM circunscripciones) c, (SELECT COUNT(*) FROM municipios) m, (SELECT COUNT(*) FROM tipos_distribucion) t');
  console.log('[seed]', JSON.stringify(n.rows[0]));
  await pool.end();
})().catch((e) => { console.error('[seed]', e.message); process.exit(1); });
