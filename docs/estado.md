# Stock Hub — estado actual (reescribir, no acumular)

**Actualizado: 2026-11-16** · `main` = página publicada (commit d360c32); rama `stock-hub-compu` tiene commits sin unir
(invoker público + datos de publicaciones para el panel). Las funciones de la rama YA están desplegadas.

## Qué es
Programa propio del dueño: inventario de Mercado Libre + ubicaciones en el depósito (más adelante devoluciones y preguntas).
Meta: stock siempre estable, reemplazar a Ecomm-App y poder venderlo a otros vendedores. Se prueba con su tienda (davidclik).
Es UN solo programa. La página vieja del trabajo (`ubicaciones-deposito.html`) se borró el 2026-11-15; su Firebase no se tocó.

## Dónde está todo
- Carpeta: `C:\Users\lacue\proyectos\scanner` (GitHub `davoo2302/scanner`, PÚBLICO: nunca claves).
- Página: `https://davoo2302.github.io/scanner/stock-hub.html` (archivo `stock-hub.html`; se edita directo).
- Firebase: `stock-hub-c5a0e` (cuenta argenisdavid17, plan Blaze), empresa `propia`. Dominio `davoo2302.github.io` autorizado.
- Funciones DESPLEGADAS (us-central1, Node 22, acceso público declarado): `mlConectar`, `mlCallback`, `mlSincronizar`,
  `mlImportar`. Claves ML_CLIENT_ID / ML_CLIENT_SECRET cargadas (Secret Manager; el Secret fue regenerado el 15-nov porque
  se expuso por error). Limpieza de imágenes en 1 día. Deploy siempre `--only functions --project stock-hub-c5a0e`.
- App de ML "Hub Stock": Redirect URI = `.../mlCallback` (hecho). Permisos en Lectura (verificado). URL de avisos: pendiente.
- Reglas de Firestore: NO publicadas todavía (`stock-hub/firestore.rules`). Ver qué reglas tiene el proyecto en la consola.

## Qué se hizo hoy y resultado
Cuenta de ML conectada; "Importar mis publicaciones": 20 publicaciones leídas → 22 productos (variaciones; catálogo y propia con
mismo SKU se juntan), 6 sin SKU (Vaso térmico 2 colores y Repasamuñecas 4 colores: sus variaciones no tienen SKU en ML).
Verificado contra las capturas de ML: los stocks coinciden (13 diferencias = las activas con SKU y stock; las otras 2 activas
son las de variaciones sin SKU; 4 pausadas sin stock). El conteo del depósito está en 0 porque el stock se guarda POR UBICACIÓN
y los 22 productos aún no tienen ubicación.

## Hecho 2026-11-16: datos para el panel (función desplegada y verificada con datos reales)
`mlSincronizar` y `mlImportar` ahora guardan, además del stock de los productos:
- `empresas/propia/publicaciones/{itemId}`: título, SKU, stock, precio, foto, link, Full, variaciones, `estado` + `subEstado`
  (motivo de ML), `clase` (activa · sin_stock · pausada [por el dueño] · frenada [por ML] · cerrada · otro) y `categoria`
  (para rubros). Las que ML ya no devuelve se borran. Solo escriben las funciones (regla en el repo, sin publicar).
- `empresas/propia/config/mlResumen`: números del panel (1 lectura al abrir): total, clases, `productos`, `unidades`, `poco`,
  `umbral`, `full` y `crudo` (estado/motivo tal cual de ML). Umbral de poco stock = `config/inventario.pocoStock` (si no hay, 5).
- Unidades y poco stock se cuentan POR SKU (publicación propia + la de catálogo con el mismo SKU = el mismo stock físico).
Resultado real (16-nov): 20 publicaciones = 16 activas + 4 `paused/out_of_stock` (sin stock) → la clasificación coincide
con ML. 19 productos, 91 unidades, 15 con ≤5. NO se vio todavía una "pausada a mano" ni una "frenada por ML" (no hay).
Ojo: con umbral 5 casi todo sale en rojo; evaluar bajarlo a 3 al armar la pantalla.
Leer los datos desde la compu: token gcloud de argenisdavid17 + REST (ver memoria "consultas desde la compu").

## PRÓXIMO PASO: pantalla de INVENTARIO clara (los datos ya están)
Feedback textual del dueño: lo actual "se ve feo, confundido": no entiende qué significan el 13 y el 22, no ve faltantes, ceros,
bajos, ni dónde buscar o editar; quiere primero un buen inventario y después las ubicaciones. Propuesta (a confirmar con él):
- Inventario como pantalla principal: lista con foto, nombre, SKU, stock en ML, contado, diferencia, estado (activa/pausada).
- Filtros claros arriba: Todos · Activas · Pausadas · Sin stock · Poco stock · Con diferencia · Sin SKU · Sin ubicación.
  Tarjetas con números que se entiendan (ej. "15 activas · 4 pausadas · 6 sin SKU").
- Buscador por nombre/SKU; ficha del producto simple (editar, ubicación, SKU, eliminar con confirmación).
- Mostrar "Stock en ML: N" en TODAS las listas; el conteo físico se carga encima. Ubicaciones queda como pestaña aparte.
- Antes: que el dueño ponga SKU a las variaciones (en ML y en la app, iguales) para que "Traer de ML" las complete.

### Pedidos extra del dueño para esa pantalla (2026-11-15, noche)
- PANTALLA PRINCIPAL = panel de números de ML: total de publicaciones, activas, pausadas, inactivas, con poco stock, sin stock.
  Que con mirarla vea el estado de su stock "aunque no me estén avisando".
- Poco stock y las que se pausaron resaltadas en ROJO; poder ver POR QUÉ se pausó una publicación.
- Pasillos/ubicaciones/mapa = otra pestaña aparte. Revisar si "Movimientos" se queda. Reacomodar Ajustes (ubicaciones a los costados).
- DECIDIDO (2026-11-15): "poco stock" = **5 o menos** (que sea configurable). "Movimientos" SE QUEDA.
- DECIDIDO: diseño de pantallas como el /admin de zonaflex-web: **menú a un costado** (barra lateral) y cada sección en su
  propia pantalla, nada mezclado. Secciones previstas: Inventario (principal), Publicaciones, Ubicaciones (pasillos/mapa),
  Movimientos, Ajustes. En el celular el menú pasa abajo o se esconde.
- "Inactiva" para el dueño = publicación que NO está a la venta: lo más común en su caso, ML la frena porque se acabó el stock;
  también las que ML baja por moderación/categoría/foto. "Pausada" = la pausó ÉL a propósito (la reactiva después). Clasificar con
  `status` + `sub_status` de ML (VERIFICAR con datos reales los valores: se espera paused+out_of_stock = sin stock,
  under_review/inactive/otros = frenada por ML, paused sin motivo = pausada por él). Estados del panel: Activas · Pausadas por él ·
  Sin stock · Frenadas por ML · Poco stock (≤5).
- Panel simple: total de publicaciones y de unidades en stock; **RUBROS** (Tecnología, Bazar/hogar, etc.): cada rubro con su
  stock total, se despliega y lista sus productos. Idea mía: sugerir el rubro automático desde la categoría de ML (`category_id` →
  ruta de categorías, llamada pública y barata) y/o palabras del nombre, y que el dueño lo corrija; guardarlo en el producto.
  Primera versión: panel + lista + filtros; rubros en el segundo paso.
- Diseño que propongo: dos niveles. **Publicaciones** (lo que dice ML: estado, motivo de pausa `sub_status`, stock, título, SKU) en
  una colección propia `publicaciones/{itemId}` que `mlSincronizar` refresca; **Productos** (lo que hay físico: conteo y ubicación).
  HECHO el 16-nov (ver arriba). Cuidar lecturas: refrescar a pedido, no en vivo. La pantalla necesita poder LEER
  `publicaciones` y `config/mlResumen`: revisar qué reglas tiene hoy el proyecto antes de armarla.

## Pendientes (en orden)
1. Pantalla de inventario (arriba). 2. SKU de los 6 sin SKU.
3. Publicar reglas de Firestore (+ colección `libro` solo para funciones; `movimientos` sigue abierto a la pantalla).
4. **Grabadora de avisos** de ML (guardar cada aviso tal cual, sin decidir) ANTES de la prueba de cancelación del dueño;
   URL de avisos propia en la app de ML.
5. Libro de movimientos con las reglas de abajo. 6. Tienda Nube, varias empresas, empujar stock a ML (al final).
7. Revisión menor: cartel de login dice "Ubicaciones/depósito"; 3 librerías externas sin integridad; carga manual por Excel
   como respaldo. Unir la rama a `main` solo con "unilo" del dueño.

## Reglas del libro de movimientos (acordadas con el dueño 2026-11-15)
Todo sale de lo que DICE Mercado Libre (pago, estado del envío, colecta, devolución). Stock Hub solo escucha; no usa
FlexControl ni escaneos propios. Tres números por producto: **en estantería**, **en camino de vuelta**, **vendido**.
- Pagada → −1 de estantería (en ML no hay "pedido sin pagar").
- Cancelada ANTES de que ML diga que salió/se colectó → +1 automático (incluye "al escanear en Flex salta que ya estaba
  cancelado": el paquete sigue en el depósito).
- Cancelada DESPUÉS de salir → no suma; pasa a "en camino de vuelta".
- Llega la devolución → el dueño marca "volvió sano" (+1) o "roto" (no suma). Nunca suma sola.
- Conteo físico vs sistema: manda el conteo físico. Id único por orden. Casos raros por hablar: mismo SKU en dos
  publicaciones, avisos tardíos, conteo mal hecho.

## Pruebas reales que decide el dueño
- Cancelar una compra suya con Stock Hub conectado y la grabadora andando (ver si ML devuelve de una vez o al llegar).
- Devolución Flex con plazo hasta el **23-nov** (ya la recibió; esa señal se perdió): antes de marcarla "sana" anotar el stock
  de ML de la publicación y mirar si sube después. Se puede hacer a mano.

## Dudas abiertas
- SKU repetido hoy toma el MAYOR (no suma). Cada "Traer"/"Importar" lee todos los productos.
- Orden de módulos: inventario + ubicaciones → devoluciones → preguntas como chat.

## Cómo trabajar
Abrir sesión SIEMPRE en esta carpeta. Al cerrar cada tanda, reescribir este archivo.
