# Sesión SIP-FNC — contexto de trabajo (2026-10-08, v1.10.0)

> Archivo vivo: resume el estado para retomar en cualquier momento.
> Flujo de ramas: `dev` (trabajo) → `master` (releases) → GitHub.

## Qué es
Migración del aplicativo .NET v1 (sin código) a web corporativa. Gestión e
informes contables por periodos — Comité de Cafeteros del Tolima.

## Stack (PERFIL rendimiento, acta v2 en docs/analisis.md)
Node 22 + Express 4 + Vanilla + Postgres 16 + `pg` + `multer` + `sharp` + `exceljs`.
Puerto dev `3020`, Postgres dev `5433`. Suite e2e: `npm run test:e2e` (78 tests, 13 suites).

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
`003_distribucion_maestros` · `004_app_settings` · `005_regla_oro`.
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
- Skills en `G:\Open\infra-fnc/skills` (sede canónica; `appweb-skills-fnc` congelado), nunca por proyecto. Catálogo: `skills/INDEX.md`.
- Principios Modo B en cada cierre: 1) nada KC a medias, 2) sesión por contrato, 3) re-correr e2e al flipear.
- Distribuciones UX (dev, sin versionar): sin breadcrumb; membrete `<details>` colapsado;
vigencia con 3 atajos (YN-2/YN-1/YN+1) + input año; stepper de pasos por vigencia con
CTA; tab Histórico nuevo (circ-anterior apunta allí; Carga sin sección histórica);
Carga con vigencia implícita (hidden) + condicionales por etapa (usa `form.doc`,
`circs` cargados para el tab); `distTabUrl(vy,tab)`.
- Distribuciones unificada (`?tab=` carga/mpio/circ, default mpio; hoja mpio fuera del nav, legacy → 302 a `tab=mpio`); tokens `/v/` congelados (nuevas páginas AL FINAL).
- Tablas documento calcadas de `docs/formatos/distribucion por {municipio,circunscripcion}.xlsx`: columnas MUNICIPIO|SICA 2005|DISTRIBUCIÓN (%×monto)|ASIGNACIONES CREADAS|SALDO (dist−creadas); fila `Circunscripción X` tras cada bloque + TOTAL; sin `$` (comas); centavos exactos (aritmética en enteros); en tab circ, DISTRIBUCIÓN/SALDO en blanco por municipio. Membrete 4 líneas + huecos `______` para N° distribución/acta (sin fuente en BD aún).
- Tablas documento SIN paginación (`PAGER_JS` exime `.doc-table`) y editables en línea (botón ✎): CREADAS por fila (tab mpio) + línea de monto global por tab (PUT/POST `distribuciones`); tarjetas CRUD eliminadas. Nuevo `PUT /api/distribucion-municipio/valor` (1 fila→UPDATE, 0→INSERT 1/1, N→409 ir a Carga). Consultor sin botones (server-rendered).
- Tarjetas KPI `% ejecutado` ocultas del dashboard (función + `/api/saldos` conservados, reversible).
- Regla de Oro 2 pasos (carga xlsx + asignar por circunscripción) con perimetrales, comparar y export xlsx/pdf; hoja Regla de Oro solo-histórica (carga vive en tab Carga).
- Tras cada pull/cambio con `--watch`: reinicio + re-login obligatorios (sesiones en memoria se pierden; forms viejos dan 403 CSRF con redirect a login).

## Pendiente (orden sugerido)
1. Resto módulos Fase 2 con negocio real (Adjudicaciones, Asignaciones, Órdenes SAP, Contratos).
2. Notificaciones definitivas: campana por rol + email (outbox), scheduler 3-1-0, Discord, push PWA.
3. Backups cifrados a R2 + monitoreo (skills fnc).
4. Validar opción A (consola de cuenta KC) para contraseña.
5. Staging KC: client + secret + flip `AUTH_PROVIDER` + e2e contra staging.

## Plan por fases — skills infra-fnc (2026-10-08)
Fuente: `G:\Open\infra-fnc/skills` (`INDEX.md`). Fuera: `fnc-url-masking`
(revertida 1.3.1), UI `fnc-admin-panel` (Next/Prisma), `fnc-backend`
(rige Postgres único).
- **Fase 1** ✅ 2026-10-08 — Notificaciones: `006_outbox.sql` + `src/notify.js` (encolar transaccional,
worker `setInterval` con `SKIP LOCKED`, scheduler vencimientos 3-1-0, campana por rol
`GET|PUT /api/notificaciones`, email Resend, Discord helper fire-and-forget).
- **Fase 2** ✅ 2026-10-08 — Monitoreo (`fnc-monitoring`): `/api/health|/ready` públicos,
`maestro.borrar`→Discord, `infra/backup-r2.ps1` (pg_dump|gzip|AES-256-CBC .NET nativo,
formato `openssl enc` compatible, round-trip hash) + retención R2 30d. Kuma apunta a
`/api/ready` (externo, pendiente instalar). Harness: `Connection: close` (keep-alive
Node 5s vs brechas largas → RST).
- **Fase 3** ✅ 2026-10-08 — PWA+push (`fnc-pwa-webpush`, `fnc-pwa`, `fnc-app-icon-badge`):
`007_push.sql`, `src/push.js` (VAPID), endpoints subscribe, manifest dual-UA,
`sw.js`, iconos generados (`scripts/gen-app-icon.cjs`), consent en perfil, canal push
en worker. Falta para producción: claves VAPID + HTTPS (túnel) + envío real.
- **Fase 4** ✅ 2026-10-08 — Transversales: `scripts/license-audit.cjs` + `npm run audit:licenses`,
limitador `/auth/*` 60/min (sin lockout de clave: no hay credenciales locales; KC
gobierna brute-force en staging/prod), modal Habeas CSS `:target` en login,
`.github/workflows/e2e.yml` (Postgres servicio en 5433 + `sip-fnc-dev-db` nombrado),
`.gitattributes`. Bloqueado externo: flip KC staging (sin staging disponible).
Diferido: `fnc-design-system` completo (overhaul visual).

## Skills aplicables del ecosistema
`test-hygiene` (obligatoria), `fnc-url-masking` (revertida: ver release 1.3.1),
CSRF/CSP/inactividad/rate-limit implementados; `fnc-excel-reports` parcial
(export; falta importación SAP); backups y monitoreo pendientes.
