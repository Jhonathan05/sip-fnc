# SIP-FNC — Sistema de Información de Proyectos (impactovisual, Modo B)

Migración del aplicativo .NET v1 (sin código) a web corporativa. Gestión e informes contables por periodos — Comité del Tolima.

## Dev offline (sin KC ni infra)

```powershell
npm install
npx prisma generate   # requiere red una vez; sin DATABASE_URL la app usa stores en memoria
npm run dev           # http://localhost:3020
```

Gates: `/login` → Entrar (desarrollo local) → `/dashboard` → `/roles` (matriz viva) → `/api/me` (contrato FncSession, `exp-iat=28800`).

## Postgres local (opcional en dev)

```powershell
docker compose up -d db   # postgres:16 en localhost:5433
npx prisma migrate dev
```

## Flip a Keycloak (staging)

Registrar client `sip-fnc-client` en `fnc-realm`, copiar secret a `.env`, `AUTH_PROVIDER=keycloak` + `NEXT_PUBLIC_AUTH_PROVIDER=keycloak`. Cero cambios de código.

## Estructura

- `src/app/` — rutas (login, dashboard, 5 módulos stub, tareas, roles, seguridad, error) + API
- `src/lib/` — session (contrato inmutable), auth-provider (mock), keycloak (split-brain PKCE), rate-limit/guard, client-roles (matriz), audit, notify (SSE), db (Prisma lazy)
- `src/components/` — ClientLayout (sidebar 280↔72 + campana SSE + modal inactividad), ThemeToggle
- `prisma/` — User, AuditLog (retención indefinida), Notification, Task
- `docs/analisis.md` — acta F0 aprobada
- `docs/requerimientos/` — fuente legacy (.NET v1): manual + capturas de módulos
