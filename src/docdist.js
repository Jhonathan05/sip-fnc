// Documento oficial de Distribución (formato .xlsx de referencia): montaje
// de datos compartido por los exportadores Excel/PDF. Mismas reglas que la
// vista (docDatos/docTablaFrom): DISTRIBUCIÓN = % × monto global, CREADAS =
// valores cargados, SALDO = dist − creadas; aritmética exacta en centavos.
const CENTS = (n) => Math.round((Number(n) || 0) * 100);

function totalFor(montos, kind, vy, yNow) {
  const suf = vy === yNow ? '_actual' : '_anteriores';
  const hit = montos.find((r) => r.tipo === `${kind}${suf}` && Number(r.vigencia) === vy)
    || montos.find((r) => String(r.tipo || '').startsWith(kind) && Number(r.vigencia) === vy);
  return hit ? Number(hit.asignado) : null;
}

// Devuelve { vy, tab, monto, blocks[{circ, items[{nombre,pct,dist,creadas,saldo}], sub}], total, hay }.
// En tab circ las filas municipio dejan dist/saldo en blanco (calcado xlsx);
// el exportador decide qué celdas omite según tab y monto.
async function docDistData(pool, vy, tab) {
  const kind = tab === 'circ' ? 'circunscripcion' : 'municipio';
  const [rr, vv, mm] = await Promise.all([
    pool.query(
      `SELECT r.municipio, m.nombre AS municipio_nombre, m.circunscripcion AS circ_cod, c.nombre AS circ_nombre, r.regla
       FROM regla_oro_anual r JOIN municipios m ON m.codigo = r.municipio
       LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
       WHERE r.vigencia = $1 ORDER BY c.nombre NULLS LAST, m.nombre`, [vy]),
    pool.query(
      `SELECT m.circunscripcion AS circ_cod, c.nombre AS circ_nombre, d.municipio,
              m.nombre AS municipio_nombre, SUM(d.valor)::float8 AS total
       FROM distribucion_municipio d JOIN municipios m ON m.codigo = d.municipio
       LEFT JOIN circunscripciones c ON c.codigo = m.circunscripcion
       WHERE d.ano = $1 GROUP BY 1, 2, 3, 4 ORDER BY c.nombre NULLS LAST, m.nombre`, [vy]),
    pool.query(`SELECT tipo, vigencia, asignado, ejecutado FROM distribuciones WHERE vigencia = $1 ORDER BY tipo`, [vy]),
  ]);
  const byMun = {};
  for (const r of rr.rows) byMun[r.municipio] = { nombre: r.municipio_nombre || r.municipio, circ: r.circ_nombre || '—', pct: Number(r.regla) };
  for (const v of vv.rows) {
    byMun[v.municipio] = byMun[v.municipio] || { nombre: v.municipio_nombre || v.municipio, circ: v.circ_nombre || '—', pct: null };
    byMun[v.municipio].creadas = Number(v.total);
  }
  const monto = totalFor(mm.rows, kind, vy, new Date().getFullYear());
  const byCirc = {};
  for (const [cod, m] of Object.entries(byMun)) (byCirc[m.circ] = byCirc[m.circ] || []).push({ cod, ...m });
  const blocks = [];
  for (const [c, items] of Object.entries(byCirc)) {
    const b = { circ: c, items: [], sub: { pct: 0, dist: 0, creadas: 0, saldo: 0 } };
    for (const x of items) {
      const pct = x.pct == null ? null : Number(x.pct);
      const creadas = CENTS(x.creadas || 0);
      const dist = pct == null || monto == null ? null : CENTS(pct * monto);
      const saldo = dist == null ? null : dist - creadas;
      if (pct != null) b.sub.pct += pct;
      if (dist != null) b.sub.dist += dist;
      if (saldo != null) b.sub.saldo += saldo;
      b.sub.creadas += creadas;
      b.items.push({ nombre: x.nombre, pct, dist, creadas, saldo });
    }
    blocks.push(b);
  }
  const total = blocks.reduce((a, b) => ({
    pct: a.pct + b.sub.pct, dist: a.dist + b.sub.dist,
    creadas: a.creadas + b.sub.creadas, saldo: a.saldo + b.sub.saldo,
  }), { pct: 0, dist: 0, creadas: 0, saldo: 0 });
  return { vy, tab, kind, monto, blocks, total, hay: rr.rows.length > 0 || vv.rows.length > 0 };
}

module.exports = { docDistData, CENTS };
