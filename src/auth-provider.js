// Proveedor auth Modo B (PROMPT-CREAR-APP P4): mock offline | keycloak prod.
// Garantia del flip: ambos producen exactamente FncSession (src/session.js).
const { buildFncSession } = require('./session');

function mockRoles() {
  return (process.env.MOCK_ROLES || 'admin').split(',').map((r) => r.trim()).filter(Boolean);
}

function getMockSession(req) {
  return buildFncSession({
    sub: 'mock-00000000-0000-0000-0000-000000000001',
    email: 'dev@test.local',
    displayName: 'Dev Local',
    roles: mockRoles(),
    req,
  });
}

function isKeycloakMode() {
  return process.env.AUTH_PROVIDER === 'keycloak';
}

module.exports = { mockRoles, getMockSession, isKeycloakMode };
