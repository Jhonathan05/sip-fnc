# SIP-FNC — Sistema de Información de Proyectos (perfil rendimiento)

Migración del aplicativo .NET v1 (sin código) a web corporativa. Gestión e informes contables por periodos — Comité del Tolima.

Stack: Node 22 + Express 4 + Vanilla (plantilla `app-template-fnc` vía `init-app.ps1`). Sin React a propósito: carga instantánea.

## Dev offline (sin KC ni infra)

```powershell
npm install
npm run dev   # http://localhost:3020 (watch)
```

Gates: `/login` → Continuar → `/dashboard` → `/roles` (matriz viva) → `/api/me` (contrato FncSession, `exp-iat=28800`).

## Flip a Keycloak (staging)

Registrar client `sip-fnc-client` en `fnc-realm`, copiar secret a `.env`, `AUTH_PROVIDER=keycloak`. Cero cambios de negocio.

## Estructura

- `src/server.js` — Express + guards + rutas auth/mock + módulos SIP
- `src/kc.js` — cliente OIDC (solo se usa con `keycloak`)
- `src/session.js` — `FncSession` + fingerprint + 8h
- `src/auth-provider.js` — rama mock (`MOCK_ROLES`)
- `src/modules.js` — catálogo módulos/roles (matriz F0.4)
- `src/views.js` — layout vanilla + nav por rol + `/roles`
- `docs/analisis.md` — acta F0 (v1 impactovisual → v2 rendimiento)
- `docs/requerimientos/` — fuente legacy (.NET v1): manual + capturas
