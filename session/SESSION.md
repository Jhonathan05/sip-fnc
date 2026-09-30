# Sesión SIP-FNC — contexto de trabajo (2026-09-30, v1.3.1)

> Archivo vivo: resume el estado para retomar en cualquier momento.
> Flujo de ramas: `dev` (trabajo) → `master` (releases) → GitHub.

## Qué es
Migración del aplicativo .NET v1 (sin código) a web corporativa. Gestión e
informes contables por periodos — Comité de Cafeteros del Tolima.

## Stack (PERFIL rendimiento, acta v2 en docs/analisis.md)
Node 22 + Express 4 + Vanilla + Postgres 16 + `pg` + `multer` + `sharp` + `exceljs`.
Puerto dev `3020`, Postgres dev `5433`. Suite e2e: `npm run test:e2e` (24 tests).

## Puesta en marcha
```powershell
docker compose up -d db   # Postgres dev
node db/migrate.js        # 001–004 (+ seed si vacío)
node db/seed_distribucion.js  # 47 municipios Tolima (idempotente)
npm run dev               # watch en :3020
```
Mock dev: `maria_del_carmen.reyes@cafedecolombia.com` (foto en `public/img/user/`).
Flip KC staging: registrar `sip-fnc-client` en `fnc-realm` + `AUTH_PROVIDER=keycloak`.

## Arquitectura (src/)
`server.js` (rutas+guards) · `modules.js` (árbol + CONFIG + mapa tokens `/v/`) ·
`views.js` (render + JS inline con nonce) · `session.js` (FncSession canónico) ·
`auth-provider.js` (mock) · `kc.js` (OIDC split-brain) · `csrf.js` · `db.js` ·
`audit.js` (bitácora indefinida) · `task-meta.js` · `prefs.js` (auto-reparo) ·
`crypto.js` (AES-256-GCM) · `mail.js` (Resend) · `informes.js` (4 + Excel).
`db/migrate/001` (distribuciones, audit_log, tasks) · `002_user_prefs` ·
`003_distribucion_maestros` · `004_app_settings`.
`tests/e2e.mjs` + `tests/db-admin.cjs` (BD `sip_fnc_test`, cleanup verificado).

## Decisiones vigentes (no reabrir sin motivo)
- Postgres único (dev compartido + prod); Supabase descartado (soberanía del dato).
- UI vanilla plana, estilos en trabajo; Inter variable; sin bordes de color.
- Nav árbol 3 niveles + Configuración al fondo; dashboard 2 col + riel 330px fijo.
- URLs opacas `/v/xxxx` (mapa estable, nuevas páginas AL FINAL); login/api visibles; guards mandan.
- Tareas: lista solo-nombre, resolución en modal (validar / ir al formulario); crear: todos menos consultor.
- Clave: opción C (solicitud auditada, reset admin + UPDATE_PASSWORD, sin consola KC expuesta).
- Foto: jpeg/png/webp ≤5 MB → webp 256px q80, un archivo por `sub`.
- Actividad en 3 niveles (plataforma / mía / auditoría admin).
- SMTP: solo Resend, API key cifrada en BD, módulo Email solo admin.
- Skills en `fnc-base/appweb-skills-fnc` (sede canónica), nunca por proyecto.
- Principios Modo B en cada cierre: 1) nada KC a medias, 2) sesión por contrato, 3) re-correr e2e al flipear.

## Pendiente (orden sugerido)
1. Resto módulos Fase 2 con negocio real (Adjudicaciones, Asignaciones, Órdenes SAP, Contratos).
2. Notificaciones definitivas: campana por rol + email (outbox), scheduler 3-1-0, Discord, push PWA.
3. Backups cifrados a R2 + monitoreo (skills fnc).
4. Validar opción A (consola de cuenta KC) para contraseña.
5. Staging KC: client + secret + flip `AUTH_PROVIDER` + e2e contra staging.

## Skills aplicables del ecosistema
`test-hygiene` (obligatoria), `fnc-url-masking` (revertida: ver release 1.3.1),
CSRF/CSP/inactividad/rate-limit implementados; `fnc-excel-reports` parcial
(export; falta importación SAP); backups y monitoreo pendientes.
