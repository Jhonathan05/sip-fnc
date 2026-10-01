// Migración + seed dev. Uso: node db/migrate.js
// Idempotente: CREATE IF NOT EXISTS + seeds con ON CONFLICT / conteo.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getPool } = require('../src/db');

async function main() {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL ausente');
  const sql = fs.readFileSync(path.join(__dirname, 'migrate', '001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] 001_init ok');
  const sql2 = fs.readFileSync(path.join(__dirname, 'migrate', '002_user_prefs.sql'), 'utf8');
  await pool.query(sql2);
  console.log('[migrate] 002_user_prefs ok');
  const sql3 = fs.readFileSync(path.join(__dirname, 'migrate', '003_distribucion_maestros.sql'), 'utf8');
  await pool.query(sql3);
  console.log('[migrate] 003_distribucion_maestros ok');
  const sql4 = fs.readFileSync(path.join(__dirname, 'migrate', '004_app_settings.sql'), 'utf8');
  await pool.query(sql4);
  console.log('[migrate] 004_app_settings ok');
  const sql5 = fs.readFileSync(path.join(__dirname, 'migrate', '005_regla_oro.sql'), 'utf8');
  await pool.query(sql5);
  console.log('[migrate] 005_regla_oro ok');

  // Seed: 4 distribuciones vigencia actual
  const y = new Date().getFullYear();
  const seeds = [
    ['municipio_actual', y, 1250000000, 320000000],
    ['municipio_anteriores', y - 1, 480000000, 410000000],
    ['circunscripcion_actual', y, 860000000, 120000000],
    ['circunscripcion_anteriores', y - 1, 295000000, 260000000],
  ];
  for (const [tipo, vigencia, asignado, ejecutado] of seeds) {
    await pool.query(
      `INSERT INTO distribuciones (tipo, vigencia, asignado, ejecutado) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tipo, vigencia) DO NOTHING`,
      [tipo, vigencia, asignado, ejecutado],
    );
  }
  // Seed tareas ejemplo (solo si tabla vacía)
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM tasks');
  if (rows[0].n === 0) {
    await pool.query(`INSERT INTO tasks (rol, titulo, detalle, responsable, area, proceso, fecha_limite, automatica) VALUES
      ('analista','Cargar ejecución SAP de septiembre','Descargar de SAP y conciliar contra asignaciones','Equipo contable','Extensión Rural','Órdenes SAP / Inversión mensual', CURRENT_DATE + 5, TRUE),
      ('coordinador','Aprobar asignaciones de infraestructura vial','Revisar 12 asignaciones pendientes de memorando','Coordinación','Dirección','Asignaciones / Aprobación', CURRENT_DATE + 3, FALSE),
      ('analista','Actualizar distribución de vigencias anteriores','Crear saldos iniciales del año con remanentes','Equipo contable','Desarrollo Social','Distribución / Apertura', CURRENT_DATE + 10, TRUE),
      ('consultor','Revisar informe de saldos por municipio','Validar cuenta corriente antes del comité','Consultoría','Comité Municipal','Informes / Saldos', CURRENT_DATE + 7, FALSE)`);
    console.log('[migrate] seed tareas ok');
  }
  await pool.end();
  console.log('[migrate] listo');
}

main().catch((e) => { console.error('[migrate]', e.message); process.exit(1); });
