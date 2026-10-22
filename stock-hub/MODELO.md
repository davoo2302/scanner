# stock-hub — modelo de datos (fase 1: solo lectura, conectado al depósito)

Objetivo: auditor de solo lectura. Trae el stock de Mercado Libre y lo deja donde `ubicaciones-deposito.html`
ya lo compara con el depósito. No cambia nada en ML.

## Dónde escribe (mismo Firebase que la pantalla: `ubicaciones-depositos`, empresa `deposito`)

```
empresas/deposito/productos/{id}      ← ya existe; la función solo completa estos campos:
  ml        { "<SKU del producto>": stockEnML }    (merge: no pisa otros SKU)
  mlFecha   momento de la sincronización
  mlPor     "Mercado Libre (automático)"

mlPrivado/deposito__{mlUserId}        ← una por cuenta de ML conectada (se pueden sumar más)
  empresa, mlUserId, conectadaPor, conectadaEn, accessToken, refreshToken, venceEn
mlOauthStates/{nonce}                 ← puente de la conexión (10 min, un solo uso)
```
`mlPrivado` y `mlOauthStates` no están en las reglas de la app: el navegador no las lee. Solo las funciones
(que usan permisos de administrador). Ver PASOS.md, paso 2.

## Permisos
Quién puede: la misma lista de la pantalla, `empresas/deposito/usuarios/{mail}` con `activo === true`.
- Conectar cuenta: `admin`.
- Traer de ML: `admin` o `empleado`.

## Reglas de cruce
- Solo publicaciones activas y fuera de Full. Si tienen variaciones, cada variación con su SKU.
- SKU normalizado igual que la pantalla (sin tildes, minúsculas). Si se repite, se toma el mayor.
- Los productos sin SKU no se cruzan.

## Fases siguientes (no están hechas)
- Avisos de ML (`orders_v2`, `items`) para actualizar en vivo en vez de apretar el botón.
- Libro de movimientos con ID único por orden (para no descontar dos veces) y empujar stock a los canales.
- Tienda Nube, y reconciliación nocturna.
- Varias empresas/usuarios: hoy `EMPRESA = 'deposito'` es fija en `functions/index.js`.

## Datos de la API de ML en los que se apoya (verificar con la cuenta real)
- Conexión: `auth.mercadolibre.com.ar/authorization` + `POST api.mercadolibre.com/oauth/token`.
- Listado: `GET /users/{id}/items/search?search_type=scan` y detalle con `GET /items?ids=…` (de a 20).
- El refresh token se renueva en cada uso: el código guarda siempre el nuevo.
