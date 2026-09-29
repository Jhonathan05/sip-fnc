// Proveedor auth Modo B (PROMPT-CREAR-APP P4): mock offline | keycloak prod.
// Garantia del flip: ambos producen exactamente FncSession (src/session.js).
const { buildFncSession } = require('./session');

function mockRoles() {
  return (process.env.MOCK_ROLES || 'admin').split(',').map((r) => r.trim()).filter(Boolean);
}

function getMockSession(req) {
  const s = buildFncSession({
    sub: 'mock-00000000-0000-0000-000000000001',
    email: 'maria_del_carmen.reyes@cafedecolombia.com',
    displayName: 'María del Carmen Reyes',
    roles: mockRoles(),
    req,
  });
  // Extensión mock-only (fuera del contrato FncSession): foto de la usuaria ejemplo.
  s.photo = '/img/user/MariaDelCarmen.webp';
  return s;
}

function isKeycloakMode() {
  return process.env.AUTH_PROVIDER === 'keycloak';
}

module.exports = { mockRoles, getMockSession, isKeycloakMode };
