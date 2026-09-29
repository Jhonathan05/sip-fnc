# Skill: higiene de pruebas e2e en dev (buenas prácticas SIP-FNC)

> Lección aprendida 2026-09-29: un gate subió una foto de prueba, la fila `user_prefs`
> sobrevivió y la limpieza borró el archivo pero no la fila → la foto de perfil
> "desapareció" (404 + fallback). Esta skill evita que se repita.

## Reglas inviolables al probar contra la BD dev

1. **Datos de prueba marcados**: todo lo creado por un gate lleva un marcador
   (`detalle LIKE '%[test]%'`, email `test+*`, o tabla `*_test`). Nada anónimo.
2. **Limpieza verificada, no asumida**: después de borrar, `SELECT COUNT(*)`
   debe dar 0 **en la misma corrida**. Un `rowCount: 0` inesperado es una
   alerta que se investiga, no un "listo".
3. **Integridad archivo↔BD**: si el gate crea archivos referenciados por la BD
   (fotos, uploads), el cleanup borra AMBOS lados y verifica ambos. Nunca
   borrar solo un lado.
4. **No tocar datos del usuario**: los gates usan su propio `sub`/email de
   prueba (`mock-*`, `test-*`); jamás el `sub` real en uso.
5. **Scripts en archivo, no `node -e`**: PowerShell deforma el quoting
   (comillas, `$1`, `$&`). Todo SQL/gate va en archivo `.js` temporal que
   se elimina al final (y nunca se commitea).
6. **Defensa en el código**: las referencias a archivos se validan al leer
   (`hydrate()` ignora fotos inexistentes y limpia la fila). Una preferencia
   nunca apunta a un archivo ausente.

## Checklist pre-commit tras gates con BD

- [ ] `SELECT` confirma 0 filas de prueba
- [ ] Archivos de prueba eliminados del disco
- [ ] `git status` sin `.js` temporales ni binarios de prueba
- [ ] Re-login fresco muestra el estado original (foto + prefs del usuario)
