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
Qué se hizo: conexión automática con la cuenta de Mercado Libre del dueño, para alimentar el comparador que
`ubicaciones-deposito.html` ya tenía (antes el stock de ML se cargaba a mano o con Excel).
- Carpeta nueva `stock-hub/` con Cloud Functions (`mlConectar`, `mlCallback`, `mlSincronizar`) que usan el MISMO
  Firebase (`ubicaciones-depositos`, empresa `deposito`) y la misma lista de usuarios. Solo leen de ML; escriben
  `productos/{id}.ml` (+ `mlFecha`, `mlPor`) por SKU. Tokens en `mlPrivado` (fuera de las reglas de la app).
- `ubicaciones-deposito.html`: dos botones nuevos en Ajustes > Stock de Mercado Libre ("Traer de Mercado Libre" y
  "Conectar cuenta", este último solo admin). El resto de la página no cambió.
- Solo cuentan publicaciones activas y fuera de Full (pausadas y Full darían diferencias falsas).
- Guía de instalación para la compu: `stock-hub/PASOS.md`. Modelo: `stock-hub/MODELO.md`.
Probado: 7 tests de la lógica (normalizar publicaciones, cruce por SKU, pausadas/Full/variaciones) y chequeo de
sintaxis de las funciones y del script de la página. NO probado: nada contra ML real, el despliegue, el login de
las funciones ni los botones en un navegador. Las reglas de Firestore actuales no se vieron (hay que revisarlas, PASOS paso 2).
Pendiente: plan Blaze, crear la app en el portal de desarrolladores de ML, secretos, `firebase deploy --only functions`
(SIEMPRE con `--only functions`), unir a `main` para publicar los botones. Después: avisos en vivo, Tienda Nube,
movimientos, empujar stock. Un SKU que deja de estar activo en ML conserva su número anterior hasta que se pise.
Ojo: este repo es PÚBLICO: nunca poner claves en `stock-hub/`.
Qué probar: PASOS.md paso 6 (conectar, traer, comparar 5 publicaciones reales con ML; probar también una pausada y una con variaciones).

## Preferencias del dueño
- Habla en español rioplatense, sin tecnicismos; quiere respuestas directas y opinión propia.
- Pedir permiso antes de unir a `main` o publicar.
