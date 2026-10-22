# scanner (apps HTML sueltas)

Páginas HTML independientes (ubicaciones-deposito, stock-ventas, flexsort, scan_terminal, panel-salon…),
publicadas con GitHub Pages desde la rama `main`.

## ⚠️ Subir a `main` = publicar
Cualquier commit en `main` sale publicado en GitHub Pages al minuto, sin revisión.

## Reglas para trabajar desde el teléfono (Claude Code en la nube)
- Trabajar SIEMPRE en una rama aparte (`ccr-…` o la que se cree). Nunca commitear ni unir a `main`.
- No publicar nada, aunque se ofrezca: el dueño lo revisa y lo publica desde la compu.
- Al terminar: subir la rama a GitHub y anotar en este archivo, en "Historial de cambios con Claude",
  qué se cambió, qué quedó pendiente y qué hay que probar.
- Única excepción: si el dueño dice explícitamente "guardalo en main" (una urgencia en la calle).
  En ese caso sale publicado en el acto.

## Historial de cambios con Claude
### 2026-10-22 — rama `ccr-stock-hub` (sin unir a main, sin publicar)
Qué se hizo: carpeta nueva `stock-hub/` (inventario unificado, fase 1 = ver el stock de Mercado Libre en una app
propia, solo lectura). Modelo de datos en `stock-hub/MODELO.md`; reglas de Firestore por usuario
(`firestore.rules`); Cloud Functions `mlConectar`, `mlCallback`, `mlSincronizar` en `functions/`.
No toca ninguna de las páginas HTML existentes ni `main`.
Probado: 4 tests de `normalizar` (SKU, variaciones, Full) y chequeo de sintaxis. NO probado: nada contra ML real,
ni las reglas de Firestore (falta el emulador), ni el despliegue.
Pendiente: crear proyecto de Firebase nuevo (plan Blaze), app en el portal de desarrolladores de ML (guardar
ID y clave con `firebase functions:secrets:set`), la pantalla de la app (se piensa tomar el estilo de
`stock-ventas.html`, que hoy guarda todo solo en el navegador), y las fases siguientes (movimientos, avisos
de ML, empujar stock, reconciliación).
Ojo: este repo es PÚBLICO. En `stock-hub/` nunca poner claves; si el producto crece conviene pasarlo a un repo privado.
Qué probar: con la cuenta real, conectar, sincronizar y comparar 5 publicaciones (stock, SKU, estado) con ML.

## Preferencias del dueño
- Habla en español rioplatense, sin tecnicismos; quiere respuestas directas y opinión propia.
- Pedir permiso antes de unir a `main` o publicar.
