const assert = require('node:assert/strict');
const { calcularOrden } = require('../order-math.js');

assert.equal(calcularOrden(null, null), 1);
assert.equal(calcularOrden(null, 5), 4);
assert.equal(calcularOrden(5, null), 6);
assert.equal(calcularOrden(2, 4), 3);
console.log('calcularOrden: OK');
