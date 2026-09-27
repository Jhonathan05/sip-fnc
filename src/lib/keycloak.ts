import { Issuer, generators, type Client } from 'openid-client';

/**
 * Cliente OIDC Keycloak (skill fnc-keycloak-oidc-agenda).
 * Split-brain: backchannel Docker interno vs frontchannel browser — NUNCA mezclar.
 * - KEYCLOAK_URL: backchannel (token/JWKS) → http://fnc-keycloak:8080/auth
 * - KEYCLOAK_PUBLIC_URL: frontchannel (browser) → http://localhost:8080/auth (dev)
 * Issuer manual (sin discover) + validación contra issuer público (id_token.iss).
 */

function realm(): string {
  return process.env.KEYCLOAK_REALM ?? 'fnc-realm';
}

export function getAppBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.APP_PORT ?? '3020'}`;
}

export function getClientId(): string {
  return process.env.KEYCLOAK_CLIENT_ID ?? 'sip-fnc-client';
}

let cachedClient: Client | null = null;

export function getKcClient(redirectUri: string): Client {
  if (cachedClient) return cachedClient;
  const publicBase = (process.env.KEYCLOAK_PUBLIC_URL ?? 'http://localhost:8080/auth').replace(/\/$/, '');
  const issuer = new Issuer({
    issuer: `${publicBase}/realms/${realm()}`,
    authorization_endpoint: `${publicBase}/realms/${realm()}/protocol/openid-connect/auth`,
    token_endpoint: `${(process.env.KEYCLOAK_URL ?? 'http://fnc-keycloak:8080/auth').replace(/\/$/, '')}/realms/${realm()}/protocol/openid-connect/token`,
    userinfo_endpoint: `${publicBase}/realms/${realm()}/protocol/openid-connect/userinfo`,
    jwks_uri: `${publicBase}/realms/${realm()}/protocol/openid-connect/certs`,
    end_session_endpoint: `${publicBase}/realms/${realm()}/protocol/openid-connect/logout`,
  });
  cachedClient = new issuer.Client({
    client_id: getClientId(),
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? 'obtener_de_secrets-clients.txt',
    redirect_uris: [redirectUri],
    response_types: ['code'],
  });
  return cachedClient;
}

export function getEndSessionUrl(): string {
  const publicBase = (process.env.KEYCLOAK_PUBLIC_URL ?? 'http://localhost:8080/auth').replace(/\/$/, '');
  return `${publicBase}/realms/${realm()}/protocol/openid-connect/logout`;
}

export const pkce = {
  state: () => generators.state(),
  nonce: () => generators.nonce(),
  verifier: () => generators.codeVerifier(),
  challenge: (verifier: string) => generators.codeChallenge(verifier),
};

/** Roles: prefiere resource_access[clientId] (client roles), fallback realm_access. */
export function decodeAccessRoles(accessToken: string | undefined, idTokenClaims: Record<string, unknown>, clientId?: string): string[] {
  const cid = clientId ?? getClientId();
  try {
    if (accessToken) {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8')) as {
        resource_access?: Record<string, { roles?: string[] }>;
        realm_access?: { roles?: string[] };
      };
      const clientRoles = payload.resource_access?.[cid]?.roles;
      if (clientRoles && clientRoles.length > 0) return clientRoles;
      if (payload.realm_access?.roles && payload.realm_access.roles.length > 0) return payload.realm_access.roles;
    }
  } catch {
    // cae al fallback por claims del id_token
  }
  const ra = idTokenClaims.resource_access as Record<string, { roles?: string[] }> | undefined;
  if (ra?.[cid]?.roles?.length) return ra[cid].roles as string[];
  const realmRoles = (idTokenClaims.realm_access as { roles?: string[] } | undefined)?.roles;
  return realmRoles ?? [];
}
