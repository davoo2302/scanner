const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
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
exports.mlConectar = onCall({ secrets: [ML_CLIENT_ID] }, async (req) => {
  const yo = await exigirRol(req, ['admin']);
  const nonce = crypto.randomBytes(24).toString('hex');
  await estados().doc(nonce).set({ email: yo.email, vence: Date.now() + 10 * 60 * 1000 });
  return { url: ml.urlAutorizacion(ML_CLIENT_ID.value(), redirectUri(), nonce) };
});

// 2) ML vuelve acá con ?code=…&state=…. El state dice quién pidió la conexión (de un solo uso, vence en 10 min).
exports.mlCallback = onRequest({ secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET] }, async (req, res) => {
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

const leerProductos = async () =>
  (await base().collection('productos').select('skus').get()).docs.map((d) => ({ id: d.id, skus: d.get('skus') || [] }));

// 3) Trae las publicaciones de ML y completa el campo `ml` de cada producto que YA existe (por SKU).
exports.mlSincronizar = onCall({ secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const yo = await exigirRol(req, ['admin', 'empleado']);
  const { items, cuentas: n } = await traerItems();
  const r = await completarML(items, await leerProductos());
  return {
    cuentas: n, publicaciones: items.length, omitidas: r.omitidas, sinSku: r.sinSku,
    actualizados: r.actualizados, sinProductoTotal: r.sinProducto.length, sinProducto: r.sinProducto.slice(0, 20), por: yo.nombre,
  };
});

// 4) IMPORTAR: crea un producto por cada publicación (nombre, SKU, foto) que todavía no esté en la app y le pone el stock
// de ML. Nunca pisa productos existentes (ubicaciones, conteos, códigos): se puede apretar las veces que haga falta.
exports.mlImportar = onCall({ secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  const yo = await exigirRol(req, ['admin']);
  const { items, cuentas: n } = await traerItems();
  const existentes = await leerProductos();
  const { nuevos, omitidas, yaExistian, sinSku } = ml.productosNuevos(items, existentes, Date.now());
  for (let i = 0; i < nuevos.length; i += 400) {
    const b = db.batch();
    nuevos.slice(i, i + 400).forEach((p) => b.create(base().collection('productos').doc(p.id), p));
    await b.commit();
  }
  const r = await completarML(items, [...existentes, ...nuevos.map((p) => ({ id: p.id, skus: p.skus }))]);
  return {
    cuentas: n, publicaciones: items.length, creados: nuevos.length, yaExistian, omitidas, sinSku,
    conStockML: r.actualizados, por: yo.nombre,
  };
});
