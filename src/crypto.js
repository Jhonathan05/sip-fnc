// Cifrado de secretos en BD (AES-256-GCM) con ENCRYPTION_KEY del host.
// Formato guardado: ivHex:authTagHex:cipherHex. Sin clave válida → lanza.
const crypto = require('crypto');

function key() {
  const k = String(process.env.ENCRYPTION_KEY || '');
  if (k.length < 32) throw new Error('ENCRYPTION_KEY ausente o corta (mín 32).');
  return crypto.createHash('sha256').update(k).digest();
}

function encSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}

function decSecret(packed) {
  const [ivH, tagH, ctH] = String(packed || '').split(':');
  if (!ivH || !tagH || !ctH) throw new Error('Secreto corrupto.');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivH, 'hex'));
  d.setAuthTag(Buffer.from(tagH, 'hex'));
  return Buffer.concat([d.update(Buffer.from(ctH, 'hex')), d.final()]).toString('utf8');
}

function maskSecret(v) {
  const s = String(v || '');
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

module.exports = { encSecret, decSecret, maskSecret };
