// Informes Distribución (Fase 2): consultas con filtros + exportación Excel.
// Cada informe: filtros declarados, run(pool, q) → {cols, rows}, xlsx aparte.
const ExcelJS = require('exceljs');

function anoVal(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : undefined;
}

const INFORMES = {
  'por-distribucion': {
    title: 'Por Distribución',
    filters: [
      { name: 'tipo', label: 'Tipo', type: 'text' },
      { name: 'ano', label: 'Año', type: 'number' },
      { name: 'municipio', label: 'Municipio', type: 'text' },
    ],
    async run(pool, q) {
      const ano = anoVal(q.ano);
      if (ano === undefined) throw Object.assign(new Error('Año inválido.'), { status: 400 });
      const cond = [];
      const p = [];
      if (q.tipo) { p.push(String(q.tipo)); cond.push(`d.tipo = $${p.length}`); }
      if (ano !== null) { p.push(ano); cond.push(`d.ano = $${p.length}`); }
      if (q.municipio) { p.push(String(q.municipio).toUpperCase()); cond.push(`d.municipio = $${p.length}`); }
      const { rows } = await pool.query(
        `SELECT d.numero, d.tipo, d.ano, d.ppto, d.municipio, m.nombre AS municipio_nombre, d.valor
         FROM distribucion_municipio d LEFT JOIN municipios m ON m.codigo = d.municipio
         ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY d.ano DESC, d.numero LIMIT 1000`, p);
      return {
        cols: ['numero', 'tipo', 'ano', 'ppto', 'municipio', 'municipio_nombre', 'valor'],
        rows,
      };
    },
  },
  'por-ano': {
    title: 'Distribuciones por Año',
    filters: [],
    async run(pool) {
      const { rows } = await pool.query(
        `SELECT ano, COUNT(*)::int AS lineas, COALESCE(SUM(ppto),0) AS ppto, COALESCE(SUM(valor),0) AS valor
         FROM distribucion_municipio GROUP BY ano ORDER BY ano DESC`);
      return { cols: ['ano', 'lineas', 'ppto', 'valor'], rows };
    },
  },
  'saldos': {
    title: 'Saldos Distribuciones',
    filters: [{ name: 'ano', label: 'Año', type: 'number' }],
    async run(pool, q) {
      const ano = anoVal(q.ano);
      if (ano === undefined) throw Object.assign(new Error('Año inválido.'), { status: 400 });
      const p = [];
      const cond = ano !== null ? 'WHERE vigencia = $1' : '';
      if (ano !== null) p.push(ano);
      const { rows } = await pool.query(
        `SELECT tipo, vigencia, asignado, ejecutado, (asignado - ejecutado) AS saldo FROM distribuciones ${cond} ORDER BY vigencia DESC, tipo`, p);
      return { cols: ['tipo', 'vigencia', 'asignado', 'ejecutado', 'saldo'], rows };
    },
  },
  'cuenta-corriente': {
    title: 'Cuenta Corriente por Municipio',
    filters: [{ name: 'municipio', label: 'Municipio', type: 'text' }],
    async run(pool, q) {
      const p = [];
      const cond = q.municipio ? 'WHERE d.municipio = $1' : '';
      if (q.municipio) p.push(String(q.municipio).toUpperCase());
      const { rows } = await pool.query(
        `SELECT d.municipio, m.nombre AS municipio_nombre, d.ano, d.numero, d.valor
         FROM distribucion_municipio d LEFT JOIN municipios m ON m.codigo = d.municipio
         ${cond} ORDER BY d.municipio, d.ano DESC, d.numero LIMIT 1000`, p);
      return { cols: ['municipio', 'municipio_nombre', 'ano', 'numero', 'valor'], rows };
    },
  },
};

async function buildXlsx(title, cols, rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIP-FNC';
  wb.created = new Date();
  const ws = wb.addWorksheet('Informe');
  ws.addRow([`SIP-FNC — ${title}`]);
  ws.addRow([`Generado: ${new Date().toLocaleString('es-CO')}`]);
  ws.addRow([]);
  ws.addRow(cols);
  for (const r of rows) ws.addRow(cols.map((c) => (r[c] == null ? '' : r[c])));
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(4).font = { bold: true };
  ws.columns.forEach((col) => { col.width = 22; });
  return wb.xlsx.writeBuffer();
}

module.exports = { INFORMES, buildXlsx };
