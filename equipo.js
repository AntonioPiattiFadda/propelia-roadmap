// equipo.js
// Sin `window`/`document`: la carga tanto un <script src> plano en el navegador como un
// require() en Node (para el test), igual que order-math.js.
//
// Convierte las filas de `users` en las personas del tablero. Hasta el 29/9/2026 esto salía
// de `APP_CONFIG.personas`, escrito a mano en el HTML; ahora la base es la única fuente.
const COLORES_RESPALDO = ['#6E6BA0', '#4F7F79', '#A87A3F', '#5A7E8C'];

function personasDesdeUsuarios(filas) {
  const personas = (filas || [])
    .map((u, i) => ({
      id: u.id,
      nombre: u.nombre || u.email || u.id,
      ini: u.iniciales || String(u.nombre || u.email || '?').slice(0, 2).toUpperCase(),
      color: u.color || COLORES_RESPALDO[i % COLORES_RESPALDO.length],
      email: (u.email || '').toLowerCase(),
      caja: !!u.caja,
      // Un inactivo se sigue pintando (tareas viejas, saldo) pero no se ofrece para elegir.
      activo: u.activo !== false,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // La caja incluye a los inactivos: lo que alguien pagó antes de irse sigue en el saldo.
  // Si nadie está marcado, son todos, para que la caja nunca quede sin gente.
  const marcadas = personas.filter(p => p.caja);
  return { personas, caja: marcadas.length ? marcadas : personas.slice() };
}

/* A quién se le puede ofrecer algo para elegir. Los inactivos se pintan —una tarea vieja sigue
   diciendo quién la hizo— pero no se ofrecen, salvo que ya estén puestos en lo que se está
   editando: ahí tienen que aparecer, si no no habría cómo sacarlos. Es también a quién se le
   carga por defecto un gasto nuevo: lo que se anota hoy no es de alguien que ya se fue. */
function elegibles(lista, marcados = []) {
  return lista.filter(p => p.activo || marcados.includes(p.id));
}

/* Para quién es un aviso, contando solo a quien sigue activo. Un aviso dirigido a alguien que
   se fue (o que no existe) queda sin destinatarios, que es «para todos»: si no, no le sonaría
   a nadie. */
function destinatariosActivos(para, personas) {
  return (para || []).filter(id => personas.some(p => p.id === id && p.activo));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { personasDesdeUsuarios, elegibles, destinatariosActivos };
}
if (typeof window !== 'undefined') {
  window.personasDesdeUsuarios = personasDesdeUsuarios;
  window.elegibles = elegibles;
  window.destinatariosActivos = destinatariosActivos;
}
