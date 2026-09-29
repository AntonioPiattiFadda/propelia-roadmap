const assert = require('node:assert/strict');
const { personasDesdeUsuarios } = require('../equipo.js');

const filas = [
  { id:'u-lu', email:'Rubio@X.com', nombre:'Luis',    iniciales:'LU', color:'#A87A3F', caja:false, activo:true },
  { id:'u-an', email:'a@x.com',     nombre:'Antonio', iniciales:'AN', color:'#4F7F79', caja:true,  activo:true },
  { id:'u-lo', email:'l@x.com',     nombre:'Lorenzo', iniciales:'LO', color:'#6E6BA0', caja:true,  activo:false },
];

const { personas, caja } = personasDesdeUsuarios(filas);

// Forma: la misma que usa app.js (ini, no iniciales) y email en minúscula.
assert.deepEqual(personas[0], { id:'u-an', nombre:'Antonio', ini:'AN', color:'#4F7F79', email:'a@x.com', caja:true, activo:true });
// Orden por nombre, no el de la base.
assert.deepEqual(personas.map(p => p.id), ['u-an', 'u-lo', 'u-lu']);
assert.equal(personas[2].email, 'rubio@x.com');
// Los inactivos se quedan: una tarea vieja tiene que seguir pintando su nombre.
assert.equal(personas.find(p => p.id === 'u-lo').activo, false);
// La caja incluye al inactivo: sus gastos siguen contando en el saldo.
assert.deepEqual(caja.map(p => p.id), ['u-an', 'u-lo']);

// Nadie con caja → todos (la caja nunca queda sin gente).
const sinCaja = personasDesdeUsuarios(filas.map(f => ({ ...f, caja:false })));
assert.deepEqual(sinCaja.caja.map(p => p.id), ['u-an', 'u-lo', 'u-lu']);

// Sin filas (cuenta sin acceso: RLS devuelve vacío) → listas vacías, sin romper.
assert.deepEqual(personasDesdeUsuarios([]), { personas: [], caja: [] });
assert.deepEqual(personasDesdeUsuarios(null), { personas: [], caja: [] });

// Campos faltantes: iniciales y color tienen respaldo, activo por defecto es true.
const flaca = personasDesdeUsuarios([{ id:'u-x', email:'x@x.com', nombre:'Ximena' }]).personas[0];
assert.equal(flaca.ini, 'XI');
assert.match(flaca.color, /^#[0-9A-F]{6}$/i);
assert.equal(flaca.activo, true);

console.log('personasDesdeUsuarios: OK');
