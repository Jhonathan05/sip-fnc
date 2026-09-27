// Keycloak OIDC (Express, perfil rendimiento). Sin DB.
// Canónicas KEYCLOAK_* (PROMPT-CREAR-APP P2). Sin aliases históricos.
const { Issuer, generators } = require('openid-client');

const KC_URL = process.env.KEYCLOAK_URL;
const KC_PUBLIC_URL = (process.env.KEYCLOAK_PUBLIC_URL || KC_URL).replace(/\/$/, '');
const REALM = process.env.KEYCLOAK_REALM;
const CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID;
const CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;
const APP_BASE = process.env.APP_BASE;

let _client = null;
function getClient() {
  if (_client) return _client;
  const issuer = new Issuer({
    issuer: `${KC_PUBLIC_URL}/realms/${REALM}`,
    // Frontchannel (browser): URL publica; backchannel (server): interna Docker
    authorization_endpoint: `${KC_PUBLIC_URL}/realms/${REALM}/protocol/openid-connect/auth`,
    token_endpoint: `${KC_URL}/realms/${REALM}/protocol/openid-connect/token`,
    userinfo_endpoint: `${KC_URL}/realms/${REALM}/protocol/openid-connect/userinfo`,
    jwks_uri: `${KC_URL}/realms/${REALM}/protocol/openid-connect/certs`,
    end_session_endpoint: `${KC_PUBLIC_URL}/realms/${REALM}/protocol/openid-connect/logout`,
  });
  _client = new issuer.Client({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uris: [`${APP_BASE}/auth/callback/app`],
    response_types: ['code'],
  });
  return _client;
}

function callbackUrl() {
  return `${APP_BASE}/auth/callback/app`;
}

function startLogin() {
  const client = getClient();
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const url = client.authorizationUrl({
    scope: 'openid profile email',
    response_type: 'code',
    redirect_uri: callbackUrl(),
    state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256',
    prompt: 'login', // Politica FNC: sin SSO entre apps, cada app exige credenciales propias
  });
  return { url, state, nonce, codeVerifier };
}

// Lectura ESTRICTA: solo client roles de este client (sin fallback a realm).
function rolesFromToken(accessToken) {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    const r = payload?.resource_access?.[CLIENT_ID]?.roles;
    return Array.isArray(r) ? r : [];
  } catch { return []; }
}

module.exports = { getClient, callbackUrl, startLogin, rolesFromToken, CLIENT_ID, KC_URL, REALM };
