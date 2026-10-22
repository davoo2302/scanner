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
