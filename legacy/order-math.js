// order-math.js
// Sin `window`/`document`: la carga tanto un <script src> plano en el navegador
// como un require() en Node (para el test), sin necesitar build tools ni módulos ES.
function calcularOrden(anterior, siguiente) {
  if (anterior == null && siguiente == null) return 1;
  if (anterior == null) return siguiente - 1;
  if (siguiente == null) return anterior + 1;
  return (anterior + siguiente) / 2;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcularOrden };
}
if (typeof window !== 'undefined') {
  window.calcularOrden = calcularOrden;
}
