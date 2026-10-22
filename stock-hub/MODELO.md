# stock-hub — modelo de datos (fase 1: solo lectura)

Objetivo: ver el stock de Mercado Libre en una app propia, sin entrar a ML. Pensado para varias cuentas y
varios usuarios desde el día uno (hoy hay una sola, la del dueño).

## Colecciones (Firestore)

```
cuentas/{cuentaId}                       ← una cuenta de Mercado Libre conectada
  ownerUid      uid de Firebase del dueño (el único que la ve)
  canal         "ml"  (más adelante "tn" para Tienda Nube)
  mlUserId      id del vendedor en ML
  nickname      nombre visible
  ultimoSync    fecha del último traído de publicaciones
  privado/tokens                         ← SOLO funciones (las reglas bloquean al cliente)
    accessToken, refreshToken, venceEn
  publicaciones/{itemId}                 ← copia de lo que hay en ML
    titulo, sku, stock, precio, estado, miniatura, link, full, variaciones[], actualizadoEn

oauthStates/{nonce}                      ← puente para la conexión con ML (dura 10 min). Solo funciones.
```

Los datos de `cuentas/**` los escriben únicamente las Cloud Functions. El navegador solo lee y solo lo suyo.

## Fases siguientes (no están hechas)
- `productos/{sku}` + `movimientos/` (libro de movimientos con ID único por orden → no descuenta dos veces).
- Avisos de ML (`orders_v2`, `items`) para actualizar en vivo.
- Empujar stock a los canales (con modo simulación y botón de apagado).
- Reconciliación nocturna.

## Datos de la API de ML en los que se apoya (verificar con la cuenta real)
- Conexión: `auth.mercadolibre.com.ar/authorization` + `POST api.mercadolibre.com/oauth/token`.
- Listado: `GET /users/{id}/items/search` (con `search_type=scan` para pasar de 1000) y detalle con
  `GET /items?ids=…` (de a 20).
- El refresh token se renueva en cada uso: hay que guardar el nuevo siempre (el código ya lo hace).
- Stock en **Full** (`inventory_id`): lo maneja ML, se muestra pero no se puede cambiar desde afuera.
