const test = require('node:test');
const assert = require('node:assert');
const { normalizar, urlAutorizacion } = require('./ml');

test('normalizar: SKU de seller_custom_field, miniatura https y Full', () => {
  const r = normalizar({ title: 'Remera', seller_custom_field: 'REM-01', available_quantity: 5, price: 100, status: 'active',
    thumbnail: 'http://x/y.jpg', inventory_id: 'ABC', permalink: 'https://ml/x' });
  assert.deepStrictEqual([r.sku, r.stock, r.miniatura, r.full], ['REM-01', 5, 'https://x/y.jpg', true]);
});

test('normalizar: SKU en atributo SELLER_SKU y sin stock definido', () => {
  const r = normalizar({ title: 'A', attributes: [{ id: 'SELLER_SKU', value_name: 'S-9' }], status: 'paused' });
  assert.deepStrictEqual([r.sku, r.stock, r.full], ['S-9', 0, false]);
});

test('normalizar: variaciones con su propio stock', () => {
  const r = normalizar({ title: 'B', available_quantity: 7, variations: [
    { id: 1, available_quantity: 3, seller_custom_field: 'B-R', attribute_combinations: [{ value_name: 'Rojo' }, { value_name: 'M' }] },
    { id: 2, available_quantity: 4, attribute_combinations: [{ value_name: 'Azul' }] }] });
  assert.deepStrictEqual(r.variaciones.map((v) => [v.sku, v.stock, v.atributos]), [['B-R', 3, 'Rojo / M'], [null, 4, 'Azul']]);
});

test('urlAutorizacion lleva el state', () => {
  assert.match(urlAutorizacion('1', 'https://a/b', 'xyz'), /state=xyz/);
});

const { stockPorSku, armarEscrituras, norm } = require('./ml');

test('stockPorSku: ignora pausadas y Full, usa variaciones, toma el mayor si se repite', () => {
  const { mapa, omitidas, sinSku } = stockPorSku([
    { estado: 'active', sku: 'A-1', stock: 5, variaciones: [] },
    { estado: 'paused', sku: 'B-1', stock: 9, variaciones: [] },
    { estado: 'active', sku: 'C-1', stock: 3, full: true, variaciones: [] },
    { estado: 'active', sku: null, stock: 7, variaciones: [{ sku: 'V-R', stock: 2 }, { sku: 'V-A', stock: 4 }, { sku: null, stock: 1 }] },
    { estado: 'active', sku: ' a-1 ', stock: 8, variaciones: [] },
  ]);
  assert.strictEqual(omitidas, 2);
  assert.strictEqual(sinSku, 1);
  assert.deepStrictEqual([...mapa.values()].map((v) => [v.sku, v.n]), [[' a-1 ', 8], ['V-R', 2], ['V-A', 4]]);
});

test('armarEscrituras: cruza por SKU sin importar mayúsculas/tildes y usa el SKU del producto como clave', () => {
  const { mapa } = stockPorSku([
    { estado: 'active', sku: 'Secador 2441 Negro', stock: 12, variaciones: [] },
    { estado: 'active', sku: 'HUERFANO', stock: 1, variaciones: [] },
  ]);
  const { escrituras, sinProducto } = armarEscrituras(
    [{ id: 'p1', skus: ['secador 2441 negro', 'otro'] }, { id: 'p2', skus: [] }, { id: 'p3' }], mapa);
  assert.deepStrictEqual(escrituras, [{ id: 'p1', ml: { 'secador 2441 negro': 12 } }]);
  assert.deepStrictEqual(sinProducto, ['HUERFANO']);
});

test('norm coincide con la pantalla de depósito', () => {
  assert.strictEqual(norm('  Camión   ÁÉ '), 'camion ae');
});

const { clasificar, fichaPublicacion, resumir } = require('./ml');

test('clasificar: activa, sin stock, pausada por el dueño, frenada por ML, cerrada', () => {
  assert.deepStrictEqual([
    clasificar('active', []),
    clasificar('paused', ['out_of_stock']),
    clasificar('paused', []),
    clasificar('paused', ['warning']),
    clasificar('under_review', ['forbidden']),
    clasificar('inactive', []),
    clasificar('closed', ['expired']),
    clasificar('raro', []),
  ], ['activa', 'sin_stock', 'pausada', 'frenada', 'frenada', 'frenada', 'cerrada', 'otro']);
});

test('normalizar guarda motivo, clase, categoría y vendedor', () => {
  const r = normalizar({ id: 'MLA9', title: 'X', status: 'paused', sub_status: ['out_of_stock'], category_id: 'MLA1234', seller_id: 77 });
  assert.deepStrictEqual([r.subEstado, r.clase, r.categoria, r.vendedor], [['out_of_stock'], 'sin_stock', 'MLA1234', '77']);
  const sin = normalizar({ id: 'MLA8', status: 'active' });
  assert.deepStrictEqual([sin.subEstado, sin.categoria, sin.vendedor, sin.titulo], [[], null, null, '']);
});

test('fichaPublicacion no tiene campos undefined', () => {
  const f = fichaPublicacion(normalizar({ id: 'MLA1', status: 'active', variations: [{ id: 5 }] }), 1);
  const hayUndefined = (o) => Object.values(o).some((v) => v === undefined || (v && typeof v === 'object' && hayUndefined(v)));
  assert.strictEqual(hayUndefined(f), false);
});

test('resumir: cuenta clases, poco stock (<= umbral, solo activas), unidades y detalle crudo', () => {
  const items = [
    { estado: 'active', subEstado: [], stock: 10 },
    { estado: 'active', subEstado: [], stock: 5 },
    { estado: 'active', subEstado: [], stock: 0, full: true },
    { estado: 'paused', subEstado: ['out_of_stock'], stock: 0 },
    { estado: 'paused', subEstado: [], stock: 3 },
  ].map((it) => ({ ...it, clase: clasificar(it.estado, it.subEstado) }));
  const r = resumir(items, 5);
  assert.deepStrictEqual([r.total, r.clases.activa, r.clases.sin_stock, r.clases.pausada, r.poco, r.unidades, r.full],
    [5, 3, 1, 1, 1, 15, 1]);
  assert.deepStrictEqual(r.crudo, { active: 3, 'paused / out_of_stock': 1, paused: 1 });
});

const { productosNuevos } = require('./ml');

test('productosNuevos: un producto por SKU, variaciones, sin SKU, y no pisa lo que ya existe', () => {
  const items = [
    { id: 'MLA1', titulo: 'Remera', sku: 'REM-01', estado: 'active', full: false, variaciones: [], miniatura: 'https://x/a.jpg' },
    { id: 'MLA2', titulo: 'Remera (otra publi)', sku: 'rem-01', estado: 'paused', full: false, variaciones: [] }, // mismo SKU
    { id: 'MLA3', titulo: 'Gorra', sku: null, estado: 'active', full: false, variaciones: [] },                    // sin SKU
    { id: 'MLA4', titulo: 'Buzo', sku: null, estado: 'active', full: false, variaciones: [
      { id: 11, sku: 'BUZ-R', atributos: 'Rojo' }, { id: 12, sku: 'BUZ-A', atributos: 'Azul' }] },
    { id: 'MLA5', titulo: 'Taza', sku: 'TAZ', estado: 'active', full: false, variaciones: [] },                    // ya existe
    { id: 'MLA6', titulo: 'Full', sku: 'F-1', estado: 'active', full: true, variaciones: [] },                      // Full: no
    { id: 'MLA7', titulo: 'Cerrada', sku: 'C-1', estado: 'closed', full: false, variaciones: [] },                 // cerrada: no
  ];
  const r = productosNuevos(items, [{ id: 'p1', skus: ['taz'] }], 123);
  assert.deepStrictEqual(r.nuevos.map((p) => p.nombre).sort(), ['Buzo (Azul)', 'Buzo (Rojo)', 'Gorra', 'Remera']);
  assert.deepStrictEqual([r.omitidas, r.yaExistian, r.sinSku], [2, 1, 1]);
  assert.strictEqual(r.nuevos.find((p) => p.nombre === 'Remera').foto, 'https://x/a.jpg');
  // Importar de nuevo con lo ya creado no agrega nada.
  const otra = productosNuevos(items, [{ id: 'p1', skus: ['taz'] }, ...r.nuevos.map((p) => ({ id: p.id, skus: p.skus }))], 456);
  assert.strictEqual(otra.nuevos.length, 0);
});
