// Web Push (skill fnc-pwa-webpush): envío best-effort con VAPID.
// Claves: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (mailto:) en env.
// Sin claves → Error('push-no-configurado'). 404/410 → Error('push-expirada')
// para que el llamador purgue la suscripción.
let webpush = null;
function lib() {
  if (!webpush) webpush = require('web-push');
  return webpush;
}

function vapid() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const prv = process.env.VAPID_PRIVATE_KEY || '';
  const subject = process.env.VAPID_SUBJECT || '';
  if (!pub || !prv || !subject) {
    const e = new Error('Push no configurado: define VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT.');
    e.code = 'push-no-configurado';
    throw e;
  }
  return { pub, prv, subject };
}

function publicKey() {
  return (process.env.VAPID_PUBLIC_KEY || '').trim();
}

async function sendPush(subscription, { titulo, detalle = '', url = '/dashboard' }) {
  const { pub, prv, subject } = vapid();
  const wp = lib();
  wp.setVapidDetails(subject, pub, prv);
  const payload = JSON.stringify({ title: titulo, body: detalle, url });
  try {
    await wp.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 24 * 3600 });
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) {
      const gone = new Error('Suscripción expirada.');
      gone.code = 'push-expirada';
      throw gone;
    }
    throw e;
  }
}

module.exports = { vapid, publicKey, sendPush };
