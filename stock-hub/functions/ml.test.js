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
