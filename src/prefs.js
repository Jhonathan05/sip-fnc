// Preferencias por usuario (nombre mostrado + foto). Clave: sub de sesión.
// Espejo en sesión para no consultar en cada render; se refresca al guardar.
const { getPool } = require('./db');

async function getPrefs(sub) {
  const pool = getPool();
  if (!pool || !sub) return { display_mode: 'full', photo: null };
  try {
    const { rows } = await pool.query('SELECT display_mode, photo FROM user_prefs WHERE sub = $1', [sub]);
    if (!rows.length) return { display_mode: 'full', photo: null };
    return { display_mode: rows[0].display_mode === 'first' ? 'first' : 'full', photo: rows[0].photo || null };
  } catch {
    return { display_mode: 'full', photo: null };
  }
}

async function savePrefs(sub, { display_mode, photo }) {
  const pool = getPool();
  if (!pool || !sub) return false;
  const mode = display_mode === 'first' ? 'first' : 'full';
  try {
    await pool.query(
      `INSERT INTO user_prefs (sub, display_mode, photo, updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (sub) DO UPDATE SET display_mode = EXCLUDED.display_mode,
         photo = COALESCE(EXCLUDED.photo, user_prefs.photo), updated_at = now()`,
      [sub, mode, photo || null],
    );
    return true;
  } catch {
    return false;
  }
}

/** Nombre a mostrar según preferencia (default: displayName completo). */
function shownName(fnc) {
  if (!fnc) return '';
  if (fnc.displayMode === 'first' && fnc.givenName) return fnc.givenName;
  return fnc.displayName || fnc.email || '';
}

/** Hidrata fnc con prefs (llamar tras login y tras guardar). */
async function hydrate(fnc) {
  if (!fnc || !fnc.sub) return fnc;
  const p = await getPrefs(fnc.sub);
  fnc.displayMode = p.display_mode;
  if (p.photo) fnc.photo = p.photo;
  return fnc;
}

module.exports = { getPrefs, savePrefs, shownName, hydrate };
