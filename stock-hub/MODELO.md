# stock-hub — modelo de datos (fase 1: solo lectura)

Objetivo: traer el stock de Mercado Libre y dejarlo donde la pantalla (`stock-hub.html`) lo compara con lo
contado en el depósito. No cambia nada en ML. Las reglas del libro de movimientos (próxima fase) están en
`docs/estado.md`.

## Dónde escribe
Proyecto Firebase `stock-hub-c5a0e`, empresa `propia` (variable `EMPRESA` en `functions/.env.stock-hub-c5a0e`;
sin ella las funciones no trabajan). El Firebase del depósito (`ubicaciones-depositos`) NO se toca.

```
empresas/propia/productos/{id}        ← la función solo completa estos campos:
  ml        { "<SKU del producto>": stockEnML }    (merge: no pisa otros SKU)
  mlFecha   momento de la sincronización
  mlPor     "Mercado Libre (automático)"

mlPrivado/propia__{mlUserId}          ← una por cuenta de ML conectada (se pueden sumar más)
  empresa, mlUserId, conectadaPor, conectadaEn, accessToken, refreshToken, venceEn
mlOauthStates/{nonce}                 ← puente de la conexión (10 min, un solo uso)
```
`mlPrivado` y `mlOauthStates` no están en las reglas de la app: el navegador no las lee. Solo las funciones
(permisos de administrador). Ver PASOS.md, paso 2.

## Permisos
Lista de `empresas/propia/usuarios/{mail}` con `activo === true`.
- Conectar cuenta: `admin`.
- Traer de ML: `admin` o `empleado`.

## Reglas de cruce
- Solo publicaciones activas y fuera de Full. Si tienen variaciones, cada variación con su SKU.
- SKU normalizado igual que la pantalla (sin tildes, minúsculas). Si se repite, se toma el mayor.
- Los productos sin SKU no se cruzan.

## Fases siguientes (no están hechas)
- Receptor de avisos de ML (primero solo grabarlos tal cual para ver qué señales manda).
- Libro de movimientos con ID único por orden y tres números por producto (en estantería / en camino de vuelta /
  vendido). Reglas en `docs/estado.md`.
- Tienda Nube, reconciliación nocturna, y al final empujar stock a ML.
- Varias empresas/usuarios: hoy una sola empresa por proyecto.

## Datos de la API de ML en los que se apoya (verificar con la cuenta real)
- Conexión: `auth.mercadolibre.com.ar/authorization` + `POST api.mercadolibre.com/oauth/token`.
- Listado: `GET /users/{id}/items/search?search_type=scan` y detalle con `GET /items?ids=…` (de a 20).
- El refresh token se renueva en cada uso: el código guarda siempre el nuevo.
