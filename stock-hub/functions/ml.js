// Lógica pura de Mercado Libre (sin Firebase), para poder probarla sola.

const API = 'https://api.mercadolibre.com';
const AUTH = 'https://auth.mercadolibre.com.ar/authorization';

function urlAutorizacion(clientId, redirectUri, state) {
  const p = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state });
  return `${AUTH}?${p}`;
}

async function pedirToken(body) {
  const r = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`ML token ${r.status}: ${j.message || j.error || 'error'}`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token, // ML lo renueva en cada uso: hay que guardar siempre el nuevo
    mlUserId: String(j.user_id),
    venceEn: Date.now() + (j.expires_in - 60) * 1000,
  };
}

const canjearCodigo = (clientId, clientSecret, code, redirectUri) =>
  pedirToken({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri });

const renovar = (clientId, clientSecret, refreshToken) =>
  pedirToken({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });

async function get(path, token) {
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`ML ${r.status} en ${path}`);
  return r.json();
}

// Todos los ids de publicaciones del vendedor (modo scan: sirve para más de 1000).
async function listarIds(mlUserId, token) {
  const ids = [];
  let scrollId;
  for (;;) {
    const q = new URLSearchParams({ search_type: 'scan', limit: '100' });
    if (scrollId) q.set('scroll_id', scrollId);
    const j = await get(`/users/${mlUserId}/items/search?${q}`, token);
    if (!j.results || j.results.length === 0) break;
    ids.push(...j.results);
    scrollId = j.scroll_id;
    if (!scrollId) break;
  }
  return ids;
}

// Detalle de hasta 20 publicaciones por llamada.
async function detalle(ids, token) {
  const filas = await get(`/items?ids=${ids.join(',')}`, token);
  return filas.filter((f) => f.code === 200).map((f) => f.body);
}

// Del formato de ML al que guardamos. El SKU puede estar en seller_custom_field o en el atributo SELLER_SKU.
function normalizar(item) {
  const attr = (item.attributes || []).find((a) => a.id === 'SELLER_SKU');
  const sku = item.seller_custom_field || (attr && attr.value_name) || null;
  const variaciones = (item.variations || []).map((v) => ({
    id: String(v.id),
    sku: v.seller_custom_field || ((v.attributes || []).find((a) => a.id === 'SELLER_SKU') || {}).value_name || null,
    stock: v.available_quantity ?? 0,
    atributos: (v.attribute_combinations || []).map((a) => a.value_name).filter(Boolean).join(' / '),
  }));
  const subEstado = Array.isArray(item.sub_status) ? item.sub_status.map(String) : [];
  return {
    id: item.id || null,
    titulo: item.title ?? '',
    sku,
    stock: item.available_quantity ?? 0,
    precio: item.price ?? null,
    estado: item.status ?? null, // active | paused | closed | under_review | inactive ...
    subEstado, // motivo que da ML: out_of_stock, warning, held, ... (VERIFICAR con datos reales)
    clase: clasificar(item.status, subEstado),
    categoria: item.category_id || null, // para sugerir el rubro más adelante
    vendedor: item.seller_id != null ? String(item.seller_id) : null,
    miniatura: (item.thumbnail || '').replace('http://', 'https://'),
    link: item.permalink || null,
    full: Boolean(item.inventory_id), // stock en Full: lo maneja ML
    variaciones,
  };
}

// Estado "para el dueño" de una publicación, a partir de status + sub_status de ML:
//   activa    = a la venta
//   sin_stock = la frenó ML porque se acabó el stock (paused + out_of_stock)
//   pausada   = la pausó el dueño a propósito (paused sin motivo)
//   frenada   = la bajó ML por otro motivo (moderación, revisión, foto, categoría...)
//   cerrada   = finalizada
// Los valores de sub_status no están verificados con datos reales: se guarda también el dato crudo.
function clasificar(status, subEstado = []) {
  if (status === 'active') return 'activa';
  if (status === 'closed') return 'cerrada';
  if (status === 'paused') {
    if (subEstado.includes('out_of_stock')) return 'sin_stock';
    return subEstado.length ? 'frenada' : 'pausada';
  }
  if (status === 'under_review' || status === 'inactive') return 'frenada';
  return 'otro';
}

// Ficha que se guarda en empresas/{e}/publicaciones/{itemId}. Sin `undefined` (Firestore no los acepta).
function fichaPublicacion(it, ahora) {
  return {
    id: it.id, titulo: it.titulo, sku: it.sku, stock: it.stock, precio: it.precio,
    estado: it.estado, subEstado: it.subEstado, clase: it.clase, categoria: it.categoria, vendedor: it.vendedor,
    foto: it.miniatura || null, link: it.link, full: it.full,
    variaciones: it.variaciones.map((v) => ({ id: v.id, sku: v.sku, stock: v.stock, atributos: v.atributos })),
    actualizada: ahora,
  };
}

// Números del panel: cuántas publicaciones hay de cada clase, unidades a la venta, y el detalle crudo
// estado/motivo de ML (para verificar qué manda de verdad). `poco` = activas con stock <= umbral.
function resumir(items, umbral = 5) {
  const clases = { activa: 0, sin_stock: 0, pausada: 0, frenada: 0, cerrada: 0, otro: 0 };
  const crudo = {};
  let unidades = 0, poco = 0, full = 0;
  for (const it of items) {
    clases[it.clase] = (clases[it.clase] || 0) + 1;
    const k = `${it.estado}${it.subEstado.length ? ' / ' + it.subEstado.join(',') : ''}`;
    crudo[k] = (crudo[k] || 0) + 1;
    if (it.full) full++; // el stock de Full está en el depósito de ML: no suma a tus unidades ni a "poco stock"
    else if (it.clase === 'activa') {
      unidades += it.stock;
      if (it.stock <= umbral) poco++;
    }
  }
  return { total: items.length, clases, poco, umbral, unidades, full, crudo };
}

// Igual que la pantalla (stock-hub.html): sin tildes, minúsculas, espacios simples.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// De las publicaciones (ya normalizadas) saca el stock por SKU.
// Solo cuentan las ACTIVAS y las que NO están en Full: una pausada no vende y el stock de Full no está en tu depósito,
// así que compararlas daría diferencias falsas. Si un SKU se repite se toma el mayor (igual que la carga manual).
function stockPorSku(items) {
  const mapa = new Map();
  let omitidas = 0, sinSku = 0;
  const sumar = (sku, n) => {
    const k = norm(sku);
    if (!k) { sinSku++; return; }
    const o = mapa.get(k);
    if (!o || n > o.n) mapa.set(k, { sku, n });
  };
  for (const it of items) {
    if (it.estado !== 'active' || it.full) { omitidas++; continue; }
    if (it.variaciones && it.variaciones.length) it.variaciones.forEach((v) => sumar(v.sku, v.stock));
    else sumar(it.sku, it.stock);
  }
  return { mapa, omitidas, sinSku };
}

// Cruza con los productos del depósito por SKU. La clave del mapa `ml` es el SKU como lo tiene el producto.
function armarEscrituras(productos, mapa) {
  const escrituras = [], usados = new Set();
  for (const p of productos) {
    const ml = {};
    for (const s of p.skus || []) {
      const k = norm(s);
      if (mapa.has(k)) { ml[s] = mapa.get(k).n; usados.add(k); }
    }
    if (Object.keys(ml).length) escrituras.push({ id: p.id, ml });
  }
  const sinProducto = [...mapa.entries()].filter(([k]) => !usados.has(k)).map(([, v]) => v.sku);
  return { escrituras, sinProducto };
}

// Productos a CREAR a partir de las publicaciones (ya normalizadas). `existentes` = [{ id, skus }] de la app.
// - Un producto por SKU (dos publicaciones con el mismo SKU son el mismo producto físico).
// - Cada variación con SKU es su propio producto. Sin SKU: un producto marcado `sinSku`, para ponerle SKU a mano.
// - Entran las activas y las pausadas (hay mercadería en el depósito); no entran las cerradas ni las de Full.
// - Nunca pisa un producto que ya existe (mismo SKU o mismo id): importar dos veces no duplica nada.
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

function productosNuevos(items, existentes, ahora) {
  const ids = new Set(existentes.map((p) => p.id));
  const skusYa = new Set();
  existentes.forEach((p) => (p.skus || []).forEach((s) => skusYa.add(norm(s))));
  const nuevos = new Map();
  let omitidas = 0, yaExistian = 0, sinSku = 0;

  const agregar = (sku, nombre, it, extraId) => {
    const k = norm(sku);
    let id;
    if (k) {
      if (skusYa.has(k)) { yaExistian++; return; }
      id = 'ml_' + slug(sku) + '_' + hash(k); // el hash evita que dos SKU distintos choquen al limpiarlos
      if (nuevos.has(id)) return; // mismo SKU en otra publicación: ya está
    } else {
      id = 'ml_' + slug(it.id || nombre) + (extraId ? '-' + extraId : '') + '_' + hash(String(it.id || nombre) + extraId);
      if (nuevos.has(id)) return;
    }
    if (ids.has(id)) { yaExistian++; return; }
    if (!k) sinSku++;
    nuevos.set(id, {
      id, nombre, skus: k ? [sku] : [], codigos: [], creado: ahora,
      foto: it.miniatura || null, mlLink: it.link || null, mlItem: it.id || null, sinSku: !k,
    });
  };

  for (const it of items) {
    if (!['active', 'paused'].includes(it.estado) || it.full) { omitidas++; continue; }
    if (it.variaciones && it.variaciones.length) {
      for (const v of it.variaciones) agregar(v.sku, v.atributos ? `${it.titulo} (${v.atributos})` : it.titulo, it, String(v.id));
    } else agregar(it.sku, it.titulo, it, '');
  }
  return { nuevos: [...nuevos.values()], omitidas, yaExistian, sinSku };
}

module.exports = {
  urlAutorizacion, canjearCodigo, renovar, listarIds, detalle, normalizar, norm, stockPorSku, armarEscrituras, productosNuevos,
  clasificar, fichaPublicacion, resumir,
};
