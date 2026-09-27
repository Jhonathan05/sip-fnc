# Acta F0 — sip-fnc (aprobada por el humano, 2026-09-27)

Migración aplicativo .NET v1 (sin código) → web corporativa. Gestión e informes contables por periodos.

## F0.1 — RF

| # | Módulo | Subfunciones (legacy) | Actores |
|---|---|---|---|
| 1 | Distribución Recursos | Actualizaciones: Circunscripciones, Municipios, Tipos de Distribuciones, Distribuciones, Distribución×Municipio. Informes: Por Distribución, por Año, Saldos, Cuenta Corriente×Municipio | admin, coordinador, analista, auxiliar crean; consultor lee |
| 2 | Adjudicaciones | Maestros: Contratistas, Invitaciones/Órdenes, Movimiento Invitaciones, Adjudicaciones, Clases Contratistas, Tipo Suspensión. Consultas: Sancionados. Informes: Estadística×Contratista. PE: Sorteo de Contrataciones (aleatorio auditable) | idem |
| 3 | Asignaciones | Actualizaciones: Asignaciones, Códigos Estado. Informes: Ejecución Detallada, ×Estado, ×Supervisor, Resumen General×Supervisor, Relación Asignación–Órdenes | idem |
| 4 | Órdenes SAP | Importación Excel ejecución mensual, Actualiza Inversión Mensual. Orden de consumo duro: vig.ant.municipio → vig.actual municipio → vig.ant.circunscripción → vig.actual circunscripción | analista/auxiliar cargan; coordinador aprueba |
| 5 | Contratos | Contratos&Convenios, Otrosíes + 14 maestros; 7 informes (×vigencia, vencimientos, pólizas, exporta maestro) | idem |
| 6 | Transversales | Seguridad/RBAC, Dashboard saldos, campana notificaciones SSE, bandeja pendientes×rol, auditoría indefinida | según matriz |

Reglas de negocio duras: 4 distribuciones/año (municipio/circunscripción × vigencia actual/anteriores); asignación sin código si es aportante; proyecto multi-municipio exige ≥1 PEP por municipio.

## F0.2 — RNF

| Eje | Respuesta |
|---|---|
| Concurrencia | ~20 usuarios; picos cierre de mes (SAP) y apertura de vigencia |
| UX | Rica: componentes React + animaciones (inspiración propia, no dependencias); tablas/filtros, upload Excel, modal sorteo |
| Datos | Postgres 16 + Prisma (datos financieros sensibles); Firebird legacy solo referencia de mapeo |
| Tiempo real | A+B: notificaciones + pendientes por SSE. Sin chat (fuera del MVP) |
| Hosting | Host FNC Docker + infra-net + KC staging/prod + Cloudflare Zero Trust |
| Seguridad | 8 capas; SESSION_SECRET y ENCRYPTION_KEY separadas; auditoría indefinida particionada (~75 MB/año) |
| Tema | Institucional FNC claro/oscuro, modificable en cualquier etapa (tokens semánticos) |

## F0.3 — PERFIL: `impactovisual`

Trazable: RNF exige React (componentes + animaciones) y Postgres sensible → Next.js 15 + React 19. Precedentes agenda-fnc/viaticos-fnc.

## F0.4 — Matriz + intake

admin todo · coordinador todo menos Seguridad · analista/auxiliar cargan+consultan sin borrar maestros · consultor lectura+informes.

```
APP_NAME=sip-fnc
APP_PORT=3020
CLIENT_ROLES=admin,coordinador,consultor,analista,auxiliar
MOCK_ROLES=admin
MODO=B
STACK=next
```

## Decisiones registradas

- Rate-limit default 600/min (skill fnc-rate-limit, NAT corporativo) en vez de 60 del ejemplo genérico.
- Prisma lazy con fallback en memoria: P4 mock funciona sin Postgres; prod lo exige.
- Plantilla Next bajo demanda (init-app.ps1 solo cubre rendimiento): scaffold propio KC-ready.
