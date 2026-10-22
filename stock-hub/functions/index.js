const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const ml = require('./ml');

admin.initializeApp();
const db = admin.firestore();

// Claves de la app de ML: van en Secret Manager (firebase functions:secrets:set ML_CLIENT_ID), nunca en el código.
const ML_CLIENT_ID = defineSecret('ML_CLIENT_ID');
const ML_CLIENT_SECRET = defineSecret('ML_CLIENT_SECRET');

// Dirección a la que vuelve ML tras autorizar (la de la función mlCallback, ya desplegada).
const redirectUri = () => `https://${process.env.GCLOUD_REGION || 'us-central1'}-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/mlCallback`;

// 1) El usuario logueado pide la URL para conectar su cuenta de ML.
exports.mlConectar = onCall({ secrets: [ML_CLIENT_ID] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const nonce = crypto.randomBytes(24).toString('hex');
  await db.doc(`oauthStates/${nonce}`).set({ uid: req.auth.uid, vence: Date.now() + 10 * 60 * 1000 });
  return { url: ml.urlAutorizacion(ML_CLIENT_ID.value(), redirectUri(), nonce) };
});

// 2) ML vuelve acá con ?code=…&state=…. El state dice qué usuario era.
exports.mlCallback = onRequest({ secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET] }, async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Faltan datos.');
    const ref = db.doc(`oauthStates/${state}`);
    const snap = await ref.get();
    await ref.delete(); // de un solo uso
    if (!snap.exists || snap.data().vence < Date.now()) return res.status(400).send('El enlace venció. Probá de nuevo.');

    const t = await ml.canjearCodigo(ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value(), String(code), redirectUri());
    const cuentaId = `ml_${t.mlUserId}`;
    const cuenta = db.doc(`cuentas/${cuentaId}`);
    const previa = await cuenta.get();
    if (previa.exists && previa.data().ownerUid !== snap.data().uid) {
      return res.status(403).send('Esa cuenta ya está conectada a otro usuario.');
    }
    await cuenta.set({ ownerUid: snap.data().uid, canal: 'ml', mlUserId: t.mlUserId, creadoEn: Date.now() }, { merge: true });
    await db.doc(`cuentas/${cuentaId}/privado/tokens`).set({ accessToken: t.accessToken, refreshToken: t.refreshToken, venceEn: t.venceEn });
    res.status(200).send('Cuenta conectada. Ya podés volver a la app.');
  } catch (e) {
    console.error(e);
    res.status(500).send('No se pudo conectar. Probá de nuevo.');
  }
});

async function tokenValido(cuentaId) {
  const ref = db.doc(`cuentas/${cuentaId}/privado/tokens`);
  const t = (await ref.get()).data();
  if (!t) throw new HttpsError('failed-precondition', 'La cuenta no tiene tokens.');
  if (t.venceEn > Date.now()) return t.accessToken;
  const n = await ml.renovar(ML_CLIENT_ID.value(), ML_CLIENT_SECRET.value(), t.refreshToken);
  await ref.set({ accessToken: n.accessToken, refreshToken: n.refreshToken, venceEn: n.venceEn });
  return n.accessToken;
}

// 3) Trae las publicaciones de ML y las guarda. Solo lectura sobre ML: no cambia nada allá.
exports.mlSincronizar = onCall({ secrets: [ML_CLIENT_ID, ML_CLIENT_SECRET], timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión.');
  const cuentaId = String(req.data && req.data.cuentaId || '');
  const cuenta = await db.doc(`cuentas/${cuentaId}`).get();
  if (!cuenta.exists || cuenta.data().ownerUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Cuenta no encontrada.');

  const token = await tokenValido(cuentaId);
  const ids = await ml.listarIds(cuenta.data().mlUserId, token);
  const ahora = Date.now();
  let guardadas = 0;
  for (let i = 0; i < ids.length; i += 20) {
    const items = await ml.detalle(ids.slice(i, i + 20), token);
    const batch = db.batch();
    for (const it of items) {
      batch.set(db.doc(`cuentas/${cuentaId}/publicaciones/${it.id}`), { ...ml.normalizar(it), actualizadoEn: ahora });
      guardadas++;
    }
    await batch.commit();
  }
  await db.doc(`cuentas/${cuentaId}`).update({ ultimoSync: ahora });
  return { total: ids.length, guardadas };
});
