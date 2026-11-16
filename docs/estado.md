# Stock Hub — estado actual (reescribir, no acumular)

**Actualizado: 2026-11-15** · Rama: `stock-hub-compu` (sin unir a `main`, nada publicado)

## Qué es
Programa propio del dueño para: (1) ubicaciones de la mercadería en el depósito, (2) stock real contra Mercado Libre,
(3) más adelante devoluciones y preguntas. Meta: reemplazar a Ecomm-App y poder venderlo a otros vendedores.
Se prueba primero con la tienda del dueño (cuenta ML "davidclik").

## Dónde está todo
- Carpeta: `C:\Users\lacue\proyectos\scanner` (GitHub `davoo2302/scanner`, PÚBLICO: nunca claves).
- Firebase propio: `stock-hub-c5a0e` (cuenta argenisdavid17), empresa `propia`, admin = mail del dueño.
- Código: `stock-hub/` (funciones `mlConectar`, `mlCallback`, `mlSincronizar`; reglas en `firestore.rules`; guía `PASOS.md`;
  modelo `MODELO.md`) y `stock-hub.html` (la pantalla, un archivo propio; ya NO se genera desde la página del depósito).
- App de ML: "Hub Stock" en ML Developers, solo lectura, tópicos Orders_v2, Shipments, Claims, Items.
  Redirect URI y URL de avisos hoy PROVISORIAS (`https://stock-hub-c5a0e.web.app`).
- El Firebase del depósito (`ubicaciones-depositos`) NO se toca: son datos del trabajo del dueño.

## Qué funciona hoy
"Traer de ML" copia el stock de publicaciones activas fuera de Full, por SKU, y lo compara con lo contado.
**NUEVO 2026-11-15: "Importar mis publicaciones como productos"** (función `mlImportar`, solo admin): crea un producto por
SKU (nombre, SKU, foto, link; variaciones con SKU = un producto cada una; sin SKU = marcado `sinSku`), entran activas y
pausadas, no cerradas ni Full; nunca pisa productos existentes (se puede repetir) y completa el stock de ML.
8 tests de lógica OK. Login con Google probado en local. Nada probado contra ML real ni desplegado.
Flujo del dueño: conectar → importar → contar a mano y poner la misma cifra en la app y en ML.

## Pendientes (en orden)
1. Plan Blaze en `stock-hub-c5a0e` (pide tarjeta; alerta de presupuesto 5 USD).
2. En ML Developers: Redirect URI = `https://us-central1-stock-hub-c5a0e.cloudfunctions.net/mlCallback` y URL de avisos propia.
3. Cargar `ML_CLIENT_ID` y `ML_CLIENT_SECRET` (lo hace el dueño) y `firebase deploy --only functions`.
4. Probar con 5 publicaciones reales (una pausada, una con variaciones).
5. **Libro de movimientos** (venta, cancelación, devolución): primero conversar casos reales, después código.
   Reglas propuestas (falta OK del dueño): se descuenta al estar PAGADA; cancelada antes de despachar → se devuelve;
   devolución después del envío → NO suma sola; si hay diferencia, manda el conteo del depósito.
6. Después: varias cuentas, Tienda Nube, y al final empujar stock a ML (único paso que puede dañar publicaciones).
7. Decidir cuándo unir `stock-hub-compu` a `main` (lo dice el dueño con "unilo").

## Reglas del libro de movimientos (hablado y acordado con el dueño 2026-11-15)
Todo sale de lo que DICE Mercado Libre (pago, estado del envío, colecta, devolución). Stock Hub solo escucha; no usa
FlexControl ni escaneos propios. Tres números por producto: **en estantería**, **en camino de vuelta**, **vendido**.
- Pagada → −1 de estantería (en ML no hay "pedido sin pagar").
- Cancelada ANTES de que ML diga que salió/se colectó → +1 automático (incluye el caso "al escanear en Flex salta que
  ya estaba cancelado": el paquete sigue en el depósito).
- Cancelada DESPUÉS de salir → no suma; pasa a "en camino de vuelta" (apartado de cancelados/devoluciones).
- Llega la devolución → el dueño marca "volvió sano" (+1) o "roto" (no suma). Nunca suma sola.
- Conteo físico vs sistema: manda el conteo físico.
- Id único por orden (un aviso repetido no descuenta dos veces). Casos raros por hablar: mismo SKU en dos publicaciones,
  avisos tardíos, conteo mal hecho.

## Pruebas reales que decide el dueño (esta semana)
- Cancelar una venta suya ya hecha: ver si ML devuelve el stock de una vez o solo al llegar el paquete.
- Devolución Flex de hace días, con plazo hasta el **23-nov** (después ML la da por buena sola): antes de marcarla
  "sana", anotar el stock que muestra la publicación en ML; marcarla; ver si el número de ML sube. Se puede hacer
  a mano aunque Stock Hub todavía no esté conectado.

## Dudas abiertas
- SKU repetido hoy toma el MAYOR (no suma). Cada "Traer" lee todos los productos (costo de lecturas).
- Orden acordado de módulos: inventario + ubicaciones → devoluciones → preguntas como chat.

## Cómo trabajar
Abrir sesión SIEMPRE en esta carpeta. Al cerrar cada tanda, reescribir este archivo.
