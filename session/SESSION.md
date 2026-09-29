# Sesión SIP-FNC — contexto de trabajo (2026-09-29, v1.3.0)

> Archivo vivo: resume el estado para retomar en cualquier momento.
> Flujo de ramas: `dev` (trabajo) → `master` (releases) → GitHub.

## Qué es
Migración del aplicativo .NET v1 (sin código) a web corporativa. Gestión e
informes contables por periodos — Comité de Cafeteros del Tolima.

## Stack (PERFIL rendimiento, acta v2 en docs/analisis.md)
Node 22 + Express 4 + Vanilla + Postgres 16 + `pg` + `multer` + `sharp`.
0 vulnerabilidades (`npm audit`). Puerto dev `3020`, Postgres dev `5433`.

## Puesta en marcha
```powershell
docker compose up -d db   # Postgres dev
node db/migrate.js        # 001 + 002 (+ seed si vacío)
npm run dev               # watch en :3020
```
Mock dev: `maria_del_carmen.reyes@cafedecolombia.com` (foto en `public/img/user/`).
Flip KC staging: registrar `sip-fnc-client` en `fnc-realm` + `AUTH_PROVIDER=keycloak`.

## Arquitectura (src/)
`server.js` (rutas+guards) · `modules.js` (árbol 49 hojas + CONFIG) ·
`views.js` (render + 7 JS inline con nonce) · `session.js` (FncSession canónico) ·
`auth-provider.js` (mock) · `kc.js` (OIDC split-brain) · `csrf.js` · `db.js` ·
`audit.js` (bitácora indefinida) · `task-meta.js` · `prefs.js` (con auto-reparo).
`db/migrate/001_init.sql` (distribuciones, audit_log, tasks) · `002_user_prefs.sql`.

## Decisiones vigentes (no reabrir sin motivo)
- Postgres único (dev compartido + prod); Supabase descartado (soberanía del dato).
- UI vanilla plana, estilos en trabajo; Inter variable; sin bordes de color.
- Nav árbol 3 niveles + Configuración al fondo; dashboard 2 col + riel 330px.
- Tareas: lista solo-nombre, resolución en modal (validar / ir al formulario).
- Clave: opción C (solicitud auditada, reset admin + UPDATE_PASSWORD, sin consola KC expuesta).
- Foto: jpeg/png/webp ≤5 MB → webp 256px q80, un archivo por `sub`.
- Skills en `fnc-base/appweb-skills-fnc` (sede canónica), nunca por proyecto.

## Pendiente (orden sugerido)
1. Skeletons → negocio real por módulo (piloto: Distribución).
2. Excel (importación SAP + exportación informes, skill fnc-excel-reports).
3. Backups cifrados a R2 + monitoreo (skills fnc).
4. Validar opción A (consola de cuenta KC) para contraseña.
5. Staging KC: client + secret + flip `AUTH_PROVIDER`.

## Skills aplicables del ecosistema
`test-hygiene` (higiene de gates, obligatoria), CSRF/CSP/inactividad/rate-limit
implementados; `fnc-excel-reports`, backups y monitoreo pendientes.
