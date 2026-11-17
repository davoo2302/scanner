const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const ml = require('./ml');

admin.initializeApp();
const db = admin.firestore();

// Empresa de este proyecto: viene de functions/.env.<proyecto> (EMPRESA=propia). Sin eso las funciones se niegan a
// trabajar: antes caían en 'deposito' y podían escribir en datos que no son tuyos.
const EMPRESA = process.env.EMPRESA;
const base = () => {
  if (!EMPRESA) throw new HttpsError('failed-precondition', 'Falta EMPRESA en functions/.env.<proyecto>.');
  return db.doc(`empresas/${EMPRESA}`);
};

// Claves de la app de ML: Secret Manager (firebase functions:secrets:set ML_CLIENT_ID), nunca en el código.
const ML_CLIENT_ID = defineSecret('ML_CLIENT_ID');
const ML_CLIENT_SECRET = defineSecret('ML_CLIENT_SECRET');

// A donde vuelve ML tras autorizar. Tiene que ser IDÉNTICA a la "URL de redirección" cargada en la app de ML.
const proyecto = () => process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;
const redirectUri = () => `https://us-central1-${proyecto()}.cloudfunctions.net/mlCallback`;

// Los tokens van en colecciones de primer nivel que NO están en las reglas de la app: nadie las lee desde el navegador
// (con reglas "todo cerrado por defecto"). Verificarlo en la consola de Firebase antes de conectar.
const cuentas = () => db.collection('mlPrivado');
const estados = () => db.collection('mlOauthStates');

// Misma lista de autorizados que usa la pantalla: empresas/{EMPRESA}/usuarios/{mail} con rol y activo === true.
async function exigirRol(req, roles) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const email = String(req.auth.token.email || '').toLowerCase();
  if (!email || req.auth.token.email_verified === false) throw new HttpsError('permission-denied', 'Mail no verificado.');
  const u = (await base().collection('usuarios').doc(email).get()).data();
  if (!u || u.activo !== true || !roles.includes(u.rol)) throw new HttpsError('permission-denied', 'No tenés permiso para esto.');
  return { email, nombre: u.nombre || email };
}

// 1) El administrador pide la URL para conectar una cuenta de ML.
exports.mlConectar = onCall({ invoker: 'public', secrets: [ML_CLIENT_ID] }, async (req) => {
  const yo = await exigirRol(req, ['admin']);
  const nonce = crypto.randomBytes(24).toString('hex');
  await estados().doc(nonce).set({ email: yo.email, vence: Date.now() + 10 * 60 * 1000 });
  return { url: ml.urlAutorizacion(ML_CLIENT_ID.value(), redirectUri(), nonce) };
});

// 2) ML vuelve acá con ?code=…&state=…. El state dice quién pidió la conexión (de un solo uso, vence en 10 min).
exports.mlCallback = onRequest({ invoker: 'public', secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET] }, async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Faltan datos.');
    const ref = estados().doc(String(state));
    const snap = await ref.get();
    await ref.delete();
    if (!snap.exists || snap.data().vence < Date.now()) return res.status(400).send('El enlace venció. Probá de nuevo.');

    const t = await ml.canjearCodigo(ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value(), String(code), redirectUri());
    await cuentas().doc(`${EMPRESA}__${t.mlUserId}`).set({
      empresa: EMPRESA, mlUserId: t.mlUserId, conectadaPor: snap.data().email, conectadaEn: Date.now(),
      accessToken: t.accessToken, refreshToken: t.refreshToken, venceEn: t.venceEn,
    }, { merge: true });
    res.status(200).send('Cuenta de Mercado Libre conectada. Ya podés volver a la app.');
  } catch (e) {
    console.error(e);
    res.status(500).send('No se pudo conectar. Probá de nuevo.');
  }
});

async function tokenValido(doc) {
  const t = doc.data();
  if (t.venceEn > Date.now()) return t.accessToken;
  try {
    const n = await ml.renovar(ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value(), t.refreshToken);
    await doc.ref.update({ accessToken: n.accessToken, refreshToken: n.refreshToken, venceEn: n.venceEn });
    return n.accessToken;
  } catch (e) {
    // Si otra sincronización renovó justo antes, el refresh token ya se gastó: se usa el que dejó guardado.
    const otra = (await doc.ref.get()).data();
    if (otra.venceEn > Date.now()) return otra.accessToken;
    throw new HttpsError('failed-precondition', 'La conexión con Mercado Libre venció. Volvé a conectar la cuenta.');
  }
}

// Lee de ML TODAS las publicaciones de las cuentas conectadas (solo LEE: no cambia nada en tus publicaciones).
async function traerItems() {
  const conectadas = await cuentas().where('empresa', '==', EMPRESA).get();
  if (conectadas.empty) throw new HttpsError('failed-precondition', 'Todavía no conectaste ninguna cuenta de Mercado Libre.');
  const items = [];
  for (const c of conectadas.docs) {
    const token = await tokenValido(c);
    const ids = await ml.listarIds(c.data().mlUserId, token);
    for (let i = 0; i < ids.length; i += 20) items.push(...(await ml.detalle(ids.slice(i, i + 20), token)).map(ml.normalizar));
  }
  return { items, cuentas: conectadas.size };
}

// Completa el campo `ml` (stock en ML) de los productos, por SKU.
async function completarML(items, prods) {
  const { mapa, omitidas, sinSku } = ml.stockPorSku(items);
  const { escrituras, sinProducto } = ml.armarEscrituras(prods, mapa);
  const ahora = Date.now();
  for (let i = 0; i < escrituras.length; i += 400) {
    const b = db.batch();
    escrituras.slice(i, i + 400).forEach((x) =>
      b.set(base().collection('productos').doc(x.id), { ml: x.ml, mlFecha: ahora, mlPor: 'Mercado Libre (automático)' }, { merge: true }));
    await b.commit();
  }
  return { omitidas, sinSku, actualizados: escrituras.length, sinProducto };
}

// Guarda la foto de ML de cada publicación en empresas/{e}/publicaciones/{itemId} (estado, motivo de pausa, stock...)
// y el resumen para el panel en empresas/{e}/config/mlResumen (la pantalla abre con 1 sola lectura).
// Las publicaciones que ML ya no devuelve se borran. Costo por vez: 1 escritura por publicación + 1 lectura por cada
// una guardada antes + 2 (resumen y umbral). Solo corre cuando alguien aprieta el botón, nunca solo.
async function guardarPublicaciones(items) {
  const ahora = Date.now();
  const col = base().collection('publicaciones');
  const cfg = (await base().collection('config').doc('inventario').get()).data() || {};
  const umbral = Number.isFinite(cfg.pocoStock) ? cfg.pocoStock : 5;

  const vigentes = new Set(items.map((it) => it.id).filter(Boolean));
  const viejas = (await col.select().get()).docs.map((d) => d.id).filter((id) => !vigentes.has(id));

  const ops = [
    ...items.filter((it) => it.id).map((it) => (b) => b.set(col.doc(it.id), ml.fichaPublicacion(it, ahora))),
    ...viejas.map((id) => (b) => b.delete(col.doc(id))),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
  const resumen = { ...ml.resumir(items, umbral), fecha: ahora };
  await base().collection('config').doc('mlResumen').set(resumen);
  return { ...resumen, borradas: viejas.length };
}

const leerProductos = async () =>
  (await base().collection('productos').select('skus').get()).docs.map((d) => ({ id: d.id, skus: d.get('skus') || [] }));

// Productos que se crearon sin SKU y ahora ML ya trae el SKU de su publicación/variante: se les pone.
// Corre en "Actualizar" y en "Traer publicaciones nuevas" (no hace falta saber cuál tocar). Devuelve los productos con el SKU puesto.
async function completarSkus(items, prods) {
  const { completar } = ml.productosNuevos(items, prods, Date.now());
  for (let i = 0; i < completar.length; i += 400) {
    const b = db.batch();
    completar.slice(i, i + 400).forEach((c) => b.set(base().collection('productos').doc(c.id), { skus: [c.sku], sinSku: false }, { merge: true }));
    await b.commit();
  }
  const conSku = new Map(completar.map((c) => [c.id, [c.sku]]));
  return { prods: prods.map((p) => ({ id: p.id, skus: conSku.get(p.id) || p.skus })), completados: completar.length };
}

// 3) Trae las publicaciones de ML y completa el campo `ml` de cada producto que YA existe (por SKU).
exports.mlSincronizar = onCall({ invoker: 'public', secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const yo = await exigirRol(req, ['admin', 'empleado']);
  const { items, cuentas: n } = await traerItems();
  const resumen = await guardarPublicaciones(items);
  const { prods, completados } = await completarSkus(items, await leerProductos());
  const r = await completarML(items, prods);
  return {
    cuentas: n, publicaciones: items.length, omitidas: r.omitidas, sinSku: r.sinSku, completados,
    actualizados: r.actualizados, sinProductoTotal: r.sinProducto.length, sinProducto: r.sinProducto.slice(0, 20), por: yo.nombre,
    resumen,
  };
});

// 5) GRABADORA DE AVISOS. URL que se carga en la app de ML como "URL de notificaciones".
// Guarda cada aviso tal cual en empresas/{EMPRESA}/avisos y responde enseguida (ML pide respuesta en menos de 500 ms;
// si no, reintenta). NO decide nada ni cambia stock: es para mirar qué manda ML en cada situación.
// Solo acepta avisos de NUESTRA app de ML (application_id = ML_CLIENT_ID); el resto se ignora sin guardar.
exports.mlAvisos = onRequest({ invoker: 'public', secrets: [ML_CLIENT_ID], memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  try {
    const b = req.body;
    if (req.method !== 'POST' || !ml.avisoValido(b, ML_CLIENT_ID.value())) return res.status(200).send('ok');
    const doc = {
      topic: String(b.topic), resource: b.resource, userId: String(b.user_id),
      intentos: b.attempts ?? null, enviado: b.sent ?? null, recibido: Date.now(), crudo: JSON.stringify(b).slice(0, 5000),
    };
    const id = ml.idAviso(b);
    const col = base().collection('avisos');
    if (id) await col.doc(id).create(doc).catch((e) => { if (e.code !== 6) throw e; }); // 6 = ya existía (reintento)
    else await col.add(doc);
    res.status(200).send('ok');
  } catch (e) {
    console.error('aviso', e);
    res.status(500).send('error'); // ML reintenta más tarde
  }
});

// Actualiza UNA publicación (ficha + stock de ML de sus productos) a partir de un aviso. Barato: 1 escritura de la ficha
// y solo los productos que tienen esos SKU (búsqueda por SKU, no lee todo). Devuelve un resumen para dejar en el aviso.
async function actualizarDesdeAviso(emp, it) {
  const b = db.doc(`empresas/${emp}`);
  await b.collection('publicaciones').doc(it.id).set(ml.fichaPublicacion(it, Date.now()));
  const skus = [...new Set((it.variaciones.length ? it.variaciones.map((v) => v.sku) : [it.sku]).filter(Boolean))];
  if (!skus.length) return 'ficha actualizada (sin SKU)';
  const prods = [];
  for (let i = 0; i < skus.length; i += 10) {
    const s = await b.collection('productos').where('skus', 'array-contains-any', skus.slice(i, i + 10)).select('skus').get();
    s.docs.forEach((x) => prods.push({ id: x.id, skus: x.get('skus') || [] }));
  }
  const { mapa } = ml.stockPorSku([it]); // solo activas y fuera de Full, igual que "Actualizar"
  const { escrituras } = ml.armarEscrituras(prods, mapa);
  const ahora = Date.now();
  // set + merge mezcla el mapa `ml` clave por clave (los SKU tienen espacios y "/": no sirven como ruta de campo).
  for (const x of escrituras) {
    await b.collection('productos').doc(x.id).set({ ml: x.ml, mlFecha: ahora, mlPor: 'Mercado Libre (aviso)' }, { merge: true });
  }
  return `ficha actualizada · ${escrituras.length} producto(s) con stock nuevo`;
}

// 6) Cuando entra un aviso, le pregunta a ML qué dice ESE recurso en ese momento (la orden, el envío, la publicación)
// y lo anota en el mismo aviso (`detalle`, como texto). Corre en la región de la base (southamerica-east1).
exports.mlAvisoDetalle = onDocumentCreated({
  document: 'empresas/{emp}/avisos/{id}', region: 'southamerica-east1', secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], memory: '256MiB',
}, async (ev) => {
  const a = ev.data && ev.data.data(); if (!a) return;
  const ref = ev.data.ref;
  try {
    if (!ml.rutaSegura(a.resource)) return ref.update({ detalleError: 'ruta no válida' });
    const cta = await cuentas().doc(`${ev.params.emp}__${a.userId}`).get();
    if (!cta.exists) return ref.update({ detalleError: 'esa cuenta de ML no está conectada' });
    const token = await tokenValido(cta);
    const esItem = a.topic === 'items' && /^\/items\/MLA?\w+$/.test(a.resource);
    // Para publicaciones se piden también los atributos de las variantes (ahí está el SKU de cada una).
    const d = await ml.get(esItem ? `${a.resource}?include_attributes=all` : a.resource, token);
    const extra = {};
    // INVENTARIO EN VIVO: el aviso de una publicación trae su estado y stock nuevos → se actualiza su ficha y el stock
    // de ML de los productos con ese SKU, sin esperar a que alguien toque "Actualizar".
    if (esItem && d && d.id) {
      try { extra.inventario = await actualizarDesdeAviso(ev.params.emp, ml.normalizar(d)); }
      catch (e) { extra.inventarioError = String(e.message || e).slice(0, 300); }
    }
    // Reclamo: también la ficha de la devolución (puede no existir todavía: se anota el motivo y listo).
    const rd = ml.rutaDevolucion(a.resource);
    if (rd) {
      try { extra.devolucion = JSON.stringify(await ml.get(rd, token)).slice(0, 200000); }
      catch (e) { extra.devolucionError = String(e.message || e).slice(0, 300); }
    }
    await ref.update({ detalle: JSON.stringify(d).slice(0, 800000), detalleEn: Date.now(), ...extra });
  } catch (e) {
    await ref.update({ detalleError: String(e.message || e).slice(0, 500), detalleEn: Date.now() });
  }
});

// 4) IMPORTAR: crea un producto por cada publicación (nombre, SKU, foto) que todavía no esté en la app y le pone el stock
// de ML. Nunca pisa productos existentes (ubicaciones, conteos, códigos): se puede apretar las veces que haga falta.
exports.mlImportar = onCall({ invoker: 'public', secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const yo = await exigirRol(req, ['admin']);
  const { items, cuentas: n } = await traerItems();
  const resumen = await guardarPublicaciones(items);
  const existentes = await leerProductos();
  // Primero se completan los SKU que faltan (así no se crean productos repetidos), después se crean los nuevos.
  const { prods, completados } = await completarSkus(items, existentes);
  const { nuevos, omitidas, yaExistian, sinSku } = ml.productosNuevos(items, prods, Date.now());
  for (let i = 0; i < nuevos.length; i += 400) {
    const b = db.batch();
    nuevos.slice(i, i + 400).forEach((p) => b.create(base().collection('productos').doc(p.id), p));
    await b.commit();
  }
  const r = await completarML(items, [...prods, ...nuevos.map((p) => ({ id: p.id, skus: p.skus }))]);
  return {
    cuentas: n, publicaciones: items.length, creados: nuevos.length, completados, yaExistian, omitidas, sinSku,
    conStockML: r.actualizados, por: yo.nombre, resumen,
  };
});
