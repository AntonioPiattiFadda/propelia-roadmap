# Base nueva: `users`, roadmap reasignado y CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar listo en el repo todo lo que la inyección necesita: `supabase/schema.sql` con `users` + roadmap + `crm_*`, el script que reasigna `Loro`/`Toni`/`Luis` a uuids, y el front del tablero leyendo `users` en vez de `APP_CONFIG.personas`.

**Architecture:** SPA estática en vanilla JS (`index.html` + `app.js` + `supabase-sync.js`) contra Supabase. Un solo archivo de esquema, idempotente. La lógica pura nueva va en su propio archivo cargable en navegador y en Node (el patrón de `order-math.js`), con su test en `scripts/`. Lo que corre contra la base se valida con consultas: la base nueva todavía no existe y no hay Docker en WSL, así que los SQL se validan por sintaxis acá y por comportamiento en la inyección.

**Tech Stack:** JS sin build, supabase-js v2 por CDN, Postgres 17 (Supabase), Node (`node:assert`) para tests, Python para validar sintaxis SQL (`pglast`).

**Spec:** `docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md`

## Global Constraints

- Prefijos: compartido sin prefijo (`users`, `es_usuario()`), roadmap `roadmap_`, CRM `crm_`.
- `user_role` es un enum con un solo valor: `'SUPERADMIN'`.
- `users` no tiene policies de escritura: altas y cambios por MCP / service role.
- Baja = `users.activo = false`; FKs a `users` con `on delete restrict`.
- Nada de `organization_id` en `crm_*`.
- `supabase/schema.sql` tiene que poder correrse dos veces sin error (idempotente).
- La lógica va en `.js` y los estilos en `app.css`; nunca en el HTML (CLAUDE.md).
- En `supabase-sync.js` no repetir nombres globales de `app.js` (usa `_CFG`, no `CFG`).
- **Nunca** correr `npm install` desde WSL en este repo (se usa también desde Windows).
- **No tocar el proyecto viejo** (`propelia`, `gvkdyxhxsnpumxlhvhsm`): contra él solo `select`.
- Commits convencionales, sin línea de co-autoría.
- No hay build: no se corre ningún build después de cambiar código.
- **Todo en la rama `mudanza-base`, nunca en `main`.** Las Tareas 1-3 dejan al front
  esperando `users`, que la base de producción de hoy no tiene: si `main` se deploya solo,
  mergear antes de la inyección deja a los tres en «Sin acceso». La rama se mergea en el paso
  de deploy de `migracion/PASOS.md`, y no antes.

## Review Focus

1. **Un aviso sin ver pierde la chapa roja después de reasignar**: `avisosSinVer()` busca el texto literal `"visto":false` en `expl`. Si el script reescribe `expl` pasando por `jsonb::text` sale `"visto": false` (con espacio) y la chapa se apaga en todas las tareas. → Tarea 6 reemplaza por texto, y su dry run lo verifica.
2. **Un «Toni» escrito en el texto de una explicación** no tiene que convertirse en un uuid. → Tarea 6, caso del dry run.
3. **Un usuario dado de baja sigue en tareas viejas**: el nombre y el color se tienen que seguir viendo, y no tiene que ofrecerse en los menús de elegir, salvo para sacarlo de donde ya está. → Tareas 1 y 3.
4. **Cuenta logueada sin fila en `users`, o con `activo = false`**: tiene que ver «Sin acceso» y no un tablero vacío que parece roto. → Tarea 3 (en `es_usuario()` un inactivo no lee `users`, así que la lista vuelve vacía).
5. **Un socio que se da de baja con gastos en la caja**: sus movimientos tienen que seguir contando en el saldo, porque `PERSONAS_CAJA` incluye inactivos. → Tarea 1.

---

## File Structure

| archivo | responsabilidad | tarea |
|---|---|---|
| `equipo.js` (nuevo) | `personasDesdeUsuarios()`: filas de `users` → personas del tablero. Pura, navegador + Node. | 1 |
| `scripts/test-equipo.cjs` (nuevo) | test de lo de arriba | 1 |
| `supabase-sync.js` | `cargarUsuarios()`, `idActual()`; se van `esMiembro()`, `emailActual()`, `PROYECTO` | 2 |
| `app.js` | `PERSONAS`/`PERSONAS_CAJA` se llenan al entrar; menús sin inactivos; `YO` por id | 3 |
| `index.html` | carga `equipo.js`; se van `personas` y `proyecto` | 3 |
| `supabase/schema.sql` | `users`, `es_usuario()`, roadmap con `es_usuario()`, `crm_*` | 4, 5 |
| `migracion/04-reasignar-usuarios.sql` (nuevo) | `Loro`/`Toni`/`Luis` → uuid en los datos | 6 |
| `migracion/validar-sql.py` (nuevo) | parsea los `.sql` con `pglast` para validar la sintaxis | 4 |
| `CLAUDE.md`, `PENDIENTES-BACKEND.md`, `migracion/PASOS.md` | documentación | 7 |

---

### Task 1: `personasDesdeUsuarios()` en `equipo.js`

- [ ] **Step 0: Rama**

Run: `git switch -c mudanza-base`
Expected: `Switched to a new branch 'mudanza-base'`

**Files:**
- Create: `equipo.js`
- Test: `scripts/test-equipo.cjs`

**Interfaces:**
- Produces: `personasDesdeUsuarios(filas) → { personas: Persona[], caja: Persona[] }`, donde
  `Persona = { id, nombre, ini, color, email, caja, activo }`. En el navegador queda como
  `window.personasDesdeUsuarios`.
  - `personas`: todas las filas, **ordenadas por `nombre`** (la base no garantiza orden).
  - `caja`: las que tienen `caja: true`, **activas o no** (el saldo histórico las necesita).
    Si ninguna tiene `caja`, son todas.

- [ ] **Step 1: Write the failing test** — `scripts/test-equipo.cjs`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-equipo.cjs`
Expected: FAIL — `Cannot find module '../equipo.js'`

- [ ] **Step 3: Write minimal implementation** — `equipo.js`

```js
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { personasDesdeUsuarios };
}
if (typeof window !== 'undefined') {
  window.personasDesdeUsuarios = personasDesdeUsuarios;
}
```

Nota: el respaldo de color se asigna por el índice de la base, antes de ordenar. Es estable mientras la fila no tenga color, que en la práctica es nunca: `users.color` es NOT NULL.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/test-equipo.cjs && node scripts/test-calcular-orden.cjs`
Expected: `personasDesdeUsuarios: OK` y `calcularOrden: OK`

- [ ] **Step 5: Commit**

```bash
git add equipo.js scripts/test-equipo.cjs
git commit -m "feat: personas del tablero desde la tabla users"
```

---

### Task 2: `supabase-sync.js` lee `users`

**Files:**
- Modify: `supabase-sync.js` (`TABLAS` ~l.12, `PROYECTO` l.41, `faltantesDeEsquema` ~l.160, `emailActual`/`esMiembro` ~l.329-340)

**Interfaces:**
- Produces:
  - `RoadmapSync.idActual() → Promise<string|null>`: el `auth.uid()` de la sesión.
  - `RoadmapSync.cargarUsuarios() → Promise<Array<{id,email,nombre,iniciales,color,caja,activo}>>`.
    Tira si la consulta falla. Con RLS, una cuenta sin acceso recibe `[]`.
- Removes: `RoadmapSync.esMiembro`, `RoadmapSync.emailActual`, la constante `PROYECTO`.

- [ ] **Step 1: Agregar `usuarios` a `TABLAS`**

En el objeto por defecto de `TABLAS`, después de `grupos: 'roadmap_notas',`:

```js
    // Quién es quién (29/9/2026). Reemplaza a `app_miembros` + `APP_CONFIG.personas`: tener
    // fila acá ES tener acceso, y la fila dice nombre, color y si pone plata en la caja.
    usuarios: 'users',
```

- [ ] **Step 2: Borrar la constante `PROYECTO`**

Borrar la línea `const PROYECTO = _CFG.proyecto || 'propelia';`. La membresía por proyecto ya no existe: la decide `es_usuario()` en la base.

- [ ] **Step 3: Reemplazar `emailActual` y `esMiembro`**

Reemplazar las dos funciones (desde `RoadmapSync.emailActual = …` hasta el cierre de `RoadmapSync.esMiembro`) por:

```js
RoadmapSync.idActual = async function () {
  const { data } = await supabaseClient.auth.getUser();
  return data.user?.id || null;
};

// El equipo entero. La RLS de `users` deja leer la tabla solo a quien tiene fila activa en
// ella, así que una cuenta sin acceso recibe una lista vacía: no hay una consulta aparte para
// preguntar «¿puedo entrar?». Esa pregunta ya no existe como tal.
RoadmapSync.cargarUsuarios = async function () {
  const { data, error } = await supabaseClient
    .from(TABLAS.usuarios)
    .select('id,email,nombre,iniciales,color,caja,activo');
  if (error) throw error;
  return data || [];
};
```

- [ ] **Step 4: Sumar `users` a `faltantesDeEsquema()`**

Reemplazar el cuerpo de `faltantesDeEsquema()` por:

```js
  async faltantesDeEsquema() {
    const faltan = [];
    const [tareas, caja, backlog, carga, usuarios] = await Promise.all([
      supabaseClient.from(TABLAS.tareas).select('prioridad,tipo,hoy,pend,creada').limit(1),
      supabaseClient.from(TABLAS.caja).select('repite,origen').limit(1),
      supabaseClient.from(TABLAS.tareas).select('backlog,sprint,dep,loom').limit(1),
      supabaseClient.from(TABLAS.caja).select('carga').limit(1),
      supabaseClient.from(TABLAS.usuarios).select('activo,caja').limit(1),
    ]);
    if (tareas.error) faltan.push('los campos nuevos de las tareas (prioridad, tipo, hoy, responsables)');
    if (caja.error) faltan.push('los gastos fijos de la caja');
    if (backlog.error) faltan.push('el backlog y los grupos');
    if (carga.error) faltan.push('a quién se le carga cada gasto de la caja');
    if (usuarios.error) faltan.push('la tabla de usuarios');
    return faltan;
  },
```

- [ ] **Step 5: Verificar que no quedaron usos colgados**

Run: `rg -n "esMiembro\(|emailActual|PROYECTO" supabase-sync.js`
Expected: sin resultados. (`app.js` todavía llama a `esMiembro`/`emailActual`: lo arregla la Tarea 3, y las dos van en el mismo push.)

- [ ] **Step 6: Commit**

```bash
git add supabase-sync.js
git commit -m "feat: supabase-sync carga el equipo desde users"
```

---

### Task 3: `app.js` e `index.html` usan el equipo de la base

**Files:**
- Modify: `app.js:105-124` (personas), `:526` (chips), `:722-725` (`pedirResponsable`), `:1449` (`pintarPend`), `:1819-1821` (`genteDeCaja`), `:2897`, `:2963`, `:3248-3254` (`ANCHO_AVATARES`), `:3623-3628` (menú), `:5243-5268` (`resolverIdentidad`, `arrancar`), `:5308-5312` (`entrar`)
- Modify: `index.html` (bloque `APP_CONFIG` ~l.218-252, scripts ~l.256-260)

**Interfaces:**
- Consumes: `personasDesdeUsuarios` (Tarea 1, global en el navegador), `RoadmapSync.idActual`, `RoadmapSync.cargarUsuarios` (Tarea 2).
- Produces (dentro de `app.js`): `cargarEquipo(filas)`, `elegibles(lista, marcados = [])`, `anchoAvatares()`.

- [ ] **Step 1: `index.html` carga `equipo.js`**

Entre `<script src="order-math.js"></script>` y `<script src="supabase-sync.js"></script>`:

```html
<script src="equipo.js"></script>
```

- [ ] **Step 2: `index.html` saca `personas` y `proyecto`**

En el comentario de cabecera del `<script>` de config, reemplazar desde `>>> ANTONIO:` hasta `'Loro' y 'Toni' son los que ya están escritos en las tareas viejas.` por:

```
   Quién entra al tablero, cómo se llama y de qué color es ya NO se
   configura acá: sale de la tabla `users` de Supabase (29/9/2026).
   Dar de alta a alguien es crear su cuenta en Auth y su fila en
   `users` — ver PENDIENTES-BACKEND.md.
```

En `window.APP_CONFIG`, borrar la línea `proyecto: 'propelia',` y el bloque entero de `personas: [ … ],` con su comentario (`// \`caja: true\` marca a quien pone plata…`).

- [ ] **Step 3: `app.js` — las personas se llenan al entrar**

Reemplazar `app.js:105-117` (desde `// Personas del tablero.` hasta la línea de `PERSONAS_CAJA`) por:

```js
// Personas del tablero. Salen de la tabla `users` (29/9/2026) y se cargan al entrar, en
// `cargarEquipo()`: antes de eso las dos listas están vacías. Son `const` y se llenan en el
// lugar, no se reasignan, porque todo el archivo las lee por nombre. El `id` es el uuid de la
// cuenta, y es lo que se guarda en la base (responsables, autor del chat, quién puso la plata).
const PERSONAS = [];
// En la caja no participan todos: solo quien tiene `caja` en `users`, activo o no — lo que
// pagó alguien que se fue sigue contando en el saldo. Si nadie está marcado, son todos.
const PERSONAS_CAJA = [];
function cargarEquipo(filas){
  const { personas, caja } = personasDesdeUsuarios(filas);
  PERSONAS.splice(0, PERSONAS.length, ...personas);
  PERSONAS_CAJA.splice(0, PERSONAS_CAJA.length, ...caja);
}
/* A quién se le puede ofrecer algo en un menú de elegir. Los inactivos se pintan —una tarea
   vieja sigue diciendo quién la hizo— pero no se ofrecen, salvo que ya estén puestos en lo
   que se está editando: ahí tienen que aparecer, si no no habría cómo sacarlos. */
const elegibles = (lista, marcados = []) => lista.filter(p => p.activo || marcados.includes(p.id));
```

(Las funciones `persona`, `colorPersona`, `iniPersona`, `nombrePersona` y `let YO` de abajo quedan como están.)

- [ ] **Step 4: Chips de filtro — solo activos**

En `app.js:526`, `$('#chipsPend').innerHTML = PERSONAS.map(p =>` pasa a:

```js
  $('#chipsPend').innerHTML = elegibles(PERSONAS, UI.f.pend).map(p =>
```

- [ ] **Step 5: `pedirResponsable()` — alcanza con que haya alguien activo**

Reemplazar las tres líneas del comentario y el `if` (`app.js:722-725`) por:

```js
  // Sin nadie activo en `users` no hay a quién elegir, y un menú vacío dejaría el tablero sin
  // poder crear una sola tarea. Se avisa y no se crea nada: el arreglo es de la base, no algo
  // que se pueda resolver desde acá.
  if (!elegibles(PERSONAS).length) { aviso('No hay personas activas: sin responsable no se puede crear una tarea'); return; }
```

- [ ] **Step 6: Ficha — botones de responsables**

En `pintarPend(t)` (`app.js:1449`), `$('#tPend').innerHTML = PERSONAS.map(p => {` pasa a:

```js
  $('#tPend').innerHTML = elegibles(PERSONAS, t.pend || []).map(p => {
```

- [ ] **Step 7: Caja — «Pagó» sin inactivos**

Reemplazar `genteDeCaja` (`app.js:1819-1821`) por:

```js
const genteDeCaja = quien => elegibles(PERSONAS_CAJA, quien ? [quien] : [])
  .concat(PERSONAS.filter(p => p.id === quien && !PERSONAS_CAJA.some(c => c.id === quien)));
```

(Mismo contrato que antes —el dueño actual aparece siempre—, más el corte de inactivos.)

- [ ] **Step 8: Menú genérico — `pend`, `avpara` y `carga` sin inactivos**

En `abrirMenu()` (`app.js:3625-3628`), las ramas de `items`:

```js
    : tipo === 'pend' || tipo === 'avpara'
                         ? elegibles(PERSONAS, PERSONAS.filter(p => marcado(p.id)).map(p => p.id))
                             .map(p => ({ v:p.id, label:p.nombre, color:p.color }))
```

y

```js
    : tipo === 'carga'   ? elegibles(PERSONAS_CAJA, PERSONAS_CAJA.filter(p => marcado(p.id)).map(p => p.id))
                             .map(p => ({ v:p.id, label:p.nombre, color:p.color }))
```

- [ ] **Step 9: `ANCHO_AVATARES` se calcula cuando ya hay equipo**

Reemplazar `const ANCHO_AVATARES = \`--avn:${Math.max(PERSONAS.length, 1)}\`;` (`app.js:3254`) por:

```js
// Función y no constante: al cargar el script el equipo todavía no llegó de la base.
const anchoAvatares = () => `--avn:${Math.max(PERSONAS.length, 1)}`;
```

Y en el comentario de arriba, `sale de \`APP_CONFIG.personas\`` → `sale de \`users\``. En `app.js:2897` y `:2963`, `style="${ANCHO_AVATARES}"` → `style="${anchoAvatares()}"`.

Run: `rg -n "ANCHO_AVATARES" app.js`
Expected: sin resultados.

- [ ] **Step 10: Identidad por id**

Reemplazar `resolverIdentidad()` (`app.js:5243-5252`) por:

```js
/* Quién sos sale de `users` por el id de la cuenta, no por el email (29/9/2026). Membresía e
   identidad dejaron de ser dos cosas: tener fila activa en `users` ES tener acceso, y esa
   misma fila dice quién sos. Ya no existe «entraste pero el tablero no sabe quién sos». */
async function resolverIdentidad(){
  let id = null, filas = [];
  try { id = await RoadmapSync.idActual(); } catch (e) {}
  try { filas = id ? await RoadmapSync.cargarUsuarios() : []; }
  catch (e) { aviso('No se pudo cargar el equipo: ' + e.message); }
  cargarEquipo(filas);
  const p = PERSONAS.find(x => x.id === id && x.activo);
  YO = p ? { id:p.id, nombre:p.nombre, esMiembro:true } : { id:'', nombre:'', esMiembro:false };
}
```

Y en `arrancar()`, borrar el bloque:

```js
  if (!YO.id) {
    aviso('Tu cuenta todavía no está asociada a una persona del tablero. Avisale a Antonio.');
  }
```

(`entrar()` no cambia: sigue mirando `YO.esMiembro`.)

- [ ] **Step 11: Al cerrar sesión se vacía el equipo**

En el `else` de `RoadmapSync.onCambioSesion` (`app.js:~5326`), después de `YO = { id:'', nombre:'', esMiembro:false };`:

```js
      cargarEquipo([]);
```

- [ ] **Step 12: Comentarios que nombran `APP_CONFIG.personas`**

Run: `rg -n "APP_CONFIG.personas|CFG.personas" app.js`

Para cada resultado, reemplazar la mención por `users` sin cambiar el sentido. Casos conocidos: el de `destinatariosDe` (`filtra a quien ya no está en \`APP_CONFIG.personas\``) → `filtra a quien ya no está en \`users\``, y el de la chapa (`identidad cargada en \`APP_CONFIG.personas\``) → `fila en \`users\``.
Expected al final: sin resultados.

- [ ] **Step 13: Chequeos**

Run: `node --check app.js && node --check supabase-sync.js && node --check equipo.js && node scripts/test-equipo.cjs`
Expected: sin errores de sintaxis y `personasDesdeUsuarios: OK`.

Run: `rg -n "esMiembro\(\)|emailActual|proyecto:" app.js index.html`
Expected: sin resultados.

Prueba en navegador: **no se puede todavía** (la base nueva no existe y la vieja no tiene `users`). Queda en la prueba de humo de `migracion/PASOS.md`, paso 8.

- [ ] **Step 14: Commit**

```bash
git add app.js index.html
git commit -m "feat: el tablero toma el equipo e identidad de users"
```

---

### Task 4: `schema.sql` — `users`, `es_usuario()` y el roadmap sobre ellos

**Files:**
- Modify: `supabase/schema.sql`
- Create: `migracion/validar-sql.py`

**Interfaces:**
- Produces (SQL): `public.user_role`, `public.users`, `public.es_usuario() → boolean`. Las Tareas 5 y 6 dependen de estos nombres.
- Removes: `public.app_miembros`, `public.es_miembro(text)`.

- [ ] **Step 1: Validador de sintaxis** — `migracion/validar-sql.py`

```python
"""Valida la sintaxis de los .sql que se le pasan, con el parser real de Postgres (pglast).

No hay Postgres local (sin Docker en WSL) y la base nueva todavía no existe: esto es lo más
cerca de correrlos que se puede estar antes de la inyección. Parsea también el cuerpo de las
funciones plpgsql. No valida que las tablas existan: eso lo dice la inyección.

    python3 -m venv /tmp/venv-sql && /tmp/venv-sql/bin/pip install -q pglast
    /tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql migracion/04-*.sql
"""
import sys
from pathlib import Path

import pglast
from pglast import parse_plpgsql, parse_sql

errores = 0
for ruta in sys.argv[1:]:
    sql = Path(ruta).read_text()
    try:
        sentencias = parse_sql(sql)
    except pglast.parser.ParseError as e:
        errores += 1
        print(f'✗ {ruta}: {e}')
        continue
    # Los cuerpos plpgsql (funciones y DO) parse_sql los ve como un string: se parsean aparte,
    # de a una sentencia, recortando el texto original por su posición.
    crudo = sql.encode()
    for s in sentencias:
        nodo = type(s.stmt).__name__
        texto = crudo[s.stmt_location:s.stmt_location + (s.stmt_len or len(crudo))].decode()
        es_plpgsql = nodo == 'DoStmt' or (nodo == 'CreateFunctionStmt' and 'plpgsql' in texto.lower())
        if not es_plpgsql:
            continue
        try:
            parse_plpgsql(texto + ';')
        except pglast.parser.ParseError as e:
            errores += 1
            print(f'✗ {ruta} (plpgsql, cerca de «{texto.strip()[:60]}…»): {e}')
    print(f'✓ {ruta}: {len(sentencias)} sentencias')
sys.exit(1 if errores else 0)
```

Run: `python3 -m venv /tmp/venv-sql && /tmp/venv-sql/bin/pip install -q pglast && /tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql`
Expected: `✓ supabase/schema.sql: N sentencias` (el esquema actual es válido: esto calibra el validador antes de tocar nada).

- [ ] **Step 2: Cabecera**

En el comentario de cabecera de `schema.sql`, reemplazar el párrafo que empieza `--   - auth.users: se crean cuentas nuevas.` (4 líneas) por:

```sql
--   - auth.users: las cuentas se crean nuevas en el proyecto nuevo. Quién es quién vive en
--     `users` (abajo), que reemplazó a `app_miembros` + `APP_CONFIG.personas` el 29/9/2026.
```

- [ ] **Step 3: Reemplazar la sección «Membresía»**

Borrar desde `-- ---------- Membresía ----------` hasta el final de `create or replace function public.es_miembro …` (tabla `app_miembros` + función), y poner en su lugar:

```sql
-- ---------- Usuarios ----------
-- Tener fila activa acá ES tener acceso, y la fila dice quién sos. Reemplaza a
-- `app_miembros` (acceso por email) + `APP_CONFIG.personas` (identidad escrita en el HTML).
do $$ begin
  create type public.user_role as enum ('SUPERADMIN');
exception when duplicate_object then null;
end $$;

create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  nombre     text not null,
  iniciales  text not null,
  color      text not null,
  rol        public.user_role not null default 'SUPERADMIN',
  -- Quién pone plata en la caja. Un booleano y no un rol: quién paga y qué permisos tiene
  -- una cuenta son dos preguntas distintas.
  caja       boolean not null default false,
  -- La baja es esto y nunca un delete: crm_* apunta acá con FK y el roadmap guarda estos
  -- uuids adentro de su JSON.
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Va después de la tabla: una función `language sql` se valida al crearla.
create or replace function public.es_usuario()
returns boolean language sql stable security definer
set search_path to 'public' as $$
  select exists (select 1 from public.users where id = auth.uid() and activo);
$$;
```

- [ ] **Step 4: Trigger y RLS de `users`**

En la sección de triggers, agregar:

```sql
drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
```

En la sección RLS, reemplazar `alter table public.app_miembros enable row level security;` por `alter table public.users enable row level security;`, y reemplazar el bloque de la policy `app_miembros_self` por:

```sql
-- Todo el equipo se ve (avatares, menús, firma del chat). Sin policies de escritura: altas,
-- cambios y roles van por el MCP o el service role, y nadie se sube de rol desde la consola.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select using (public.es_usuario());
```

- [ ] **Step 5: El roadmap y el storage usan `es_usuario()`**

Run: `sd "public\.es_miembro\('propelia'\)" "public.es_usuario()" supabase/schema.sql && rg -n "es_miembro|app_miembros" supabase/schema.sql`
Expected: el `rg` no encuentra nada.

- [ ] **Step 6: Validar**

Run: `/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql`
Expected: `✓ supabase/schema.sql: …`

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql migracion/validar-sql.py
git commit -m "feat: tabla users y es_usuario() en el esquema"
```

---

### Task 5: `schema.sql` — el CRM (`crm_*`)

**Files:**
- Modify: `supabase/schema.sql` (sección nueva al final, después de «Storage»)

**Interfaces:**
- Consumes: `public.users`, `public.es_usuario()`, `public.set_updated_at()` (Tarea 4).
- Produces: las tablas `crm_priorities`, `crm_funnel_stages`, `crm_channels`, `crm_clients`, `crm_leads`, `crm_meetings`, `crm_tasks`, `crm_comments`, `crm_management_events`, `crm_stage_history`, `crm_assignment_history`; el enum `crm_management_action`; la función `crm_gestion_refresh(uuid)`. El sub-proyecto B consume estos nombres.

- [ ] **Step 1: Agregar la sección al final de `schema.sql`**

```sql
-- ============================================================
-- CRM interno: Propelia siguiendo a SUS clientes (las inmobiliarias).
--
-- Mismo modelo que el CRM de compradores de propelia-frontend y con los mismos nombres de
-- columna, para que la pantalla se replique sin traducir. Sin organization_id (acá hay un
-- solo equipo) y sin nada inmobiliario: propiedades, cruces, briefing, matching, IA,
-- portales, calendario. Fuente: migracion/fuente-crm-producto.sql. Diseño:
-- docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md.
-- ============================================================

do $$ begin
  create type public.crm_management_action as enum ('MANUAL', 'POSTPONED');
exception when duplicate_object then null;
end $$;

-- ---------- Catálogos (los editan ellos desde la pantalla) ----------
create table if not exists public.crm_priorities (
  id                         uuid primary key default gen_random_uuid(),
  name                       text not null,
  color                      text not null,
  position                   integer not null default 0,
  management_tolerance_hours integer default 24,
  show_in_filters            boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz
);

create table if not exists public.crm_funnel_stages (
  id                         uuid primary key default gen_random_uuid(),
  label                      text not null default '',
  value                      text not null default '',
  position                   integer not null default 0,
  priority_id                uuid references public.crm_priorities(id),
  is_out_of_funnel           boolean not null default false,
  allow_delete               boolean not null default false,
  allow_reorder              boolean not null default false,
  allow_rename               boolean not null default true,
  management_tolerance_hours integer,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  deleted_at                 timestamptz
);

create table if not exists public.crm_channels (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  position     integer not null default 0,
  allow_delete boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ---------- Entidades ----------
create table if not exists public.crm_clients (
  id                       uuid primary key default gen_random_uuid(),
  first_name               text,
  last_name                text,
  -- La única columna que el producto no tiene: acá los clientes son inmobiliarias, y la
  -- persona sin su empresa no dice nada.
  company_name             text,
  email                    text,
  phone                    text,
  alternative_phone_1      text,
  alternative_phone_1_note text,
  alternative_phone_2      text,
  alternative_phone_2_note text,
  notes                    text,
  created_by               uuid default auth.uid() references public.users(id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);
create unique index if not exists crm_clients_email_active_uidx on public.crm_clients (lower(email))
  where deleted_at is null and email is not null and email <> '';
create unique index if not exists crm_clients_phone_active_uidx on public.crm_clients (phone)
  where deleted_at is null and phone is not null and phone <> '';

create table if not exists public.crm_leads (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid not null references public.crm_clients(id) on delete cascade,
  assigned_to             uuid not null references public.users(id) on delete restrict,
  funnel_stage_id         uuid references public.crm_funnel_stages(id) on delete set null,
  channel_id              uuid references public.crm_channels(id) on delete set null,
  discard_reason          text,
  created_via             text not null default 'manual',
  last_important_event_at timestamptz not null default now(),
  last_opened_at          timestamptz,
  -- De cuándo cuenta la gestión. La escribe crm_gestion_refresh(), nunca el front.
  gestion_reference_at    timestamptz,
  gestion_postponed       boolean not null default false,
  gestion_has_events      boolean not null default false,
  created_by              uuid default auth.uid() references public.users(id) on delete restrict,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);
-- Un mismo cliente puede tener un lead por comercial (el del producto, sin lead_type).
create unique index if not exists crm_leads_client_assignee_active_uidx
  on public.crm_leads (client_id, assigned_to) where deleted_at is null;
create index if not exists crm_leads_gestion_reference_at_idx
  on public.crm_leads (gestion_reference_at desc nulls last) where deleted_at is null;

create table if not exists public.crm_meetings (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid references public.crm_leads(id) on delete cascade,
  assigned_to   uuid not null references public.users(id) on delete restrict,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'scheduled'
                check (status in ('scheduled', 'completed', 'cancelled')),
  title         text,
  description   text,
  cancel_reason text,
  created_by    uuid default auth.uid() references public.users(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint crm_meetings_time_valid check (ends_at > starts_at)
);
create index if not exists crm_meetings_lead_idx on public.crm_meetings (lead_id) where deleted_at is null;

create table if not exists public.crm_tasks (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable: una tarea puede no ser de ningún lead, como en el producto. `lead_id` directo y
  -- no el par entity_type/entity_id: acá solo hay leads, y un par polimórfico no admite FK.
  lead_id      uuid references public.crm_leads(id) on delete cascade,
  title        text not null,
  due_date     date,
  planned_for  date,
  assigned_to  uuid not null default auth.uid() references public.users(id) on delete restrict,
  completed    boolean not null default false,
  completed_at timestamptz,
  recurrence   text check (recurrence is null
                or recurrence in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly')),
  created_by   uuid default auth.uid() references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists crm_tasks_assigned_pending_idx on public.crm_tasks (assigned_to, completed, due_date);
create index if not exists crm_tasks_lead_idx on public.crm_tasks (lead_id) where deleted_at is null;

create table if not exists public.crm_comments (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.crm_leads(id) on delete cascade,
  description      text not null,
  long_description text,
  comment_type     text not null default 'MANUAL' check (comment_type in ('MANUAL', 'SYSTEM')),
  created_by       uuid default auth.uid() references public.users(id) on delete restrict,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table if not exists public.crm_management_events (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.crm_leads(id) on delete cascade,
  action       public.crm_management_action not null,
  effective_at timestamptz not null default now(),
  note         text,
  created_by   uuid default auth.uid() references public.users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists crm_management_events_lead_effective_idx
  on public.crm_management_events (lead_id, effective_at desc);

-- ---------- Historiales: los escriben triggers, nunca el front ----------
-- changed_by es nullable: lo que se hace por MCP o service role no tiene auth.uid().
create table if not exists public.crm_stage_history (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.crm_leads(id) on delete cascade,
  from_stage_id uuid references public.crm_funnel_stages(id),
  to_stage_id   uuid not null references public.crm_funnel_stages(id),
  changed_by    uuid references public.users(id) on delete restrict,
  changed_at    timestamptz not null default now()
);

create table if not exists public.crm_assignment_history (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.crm_leads(id) on delete cascade,
  from_user_id uuid references public.users(id) on delete restrict,
  to_user_id   uuid not null references public.users(id) on delete restrict,
  changed_by   uuid references public.users(id) on delete restrict,
  changed_at   timestamptz not null default now()
);

-- ---------- Funciones y triggers ----------
create or replace function public.crm_log_stage_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' and new.funnel_stage_id is not null then
    insert into public.crm_stage_history (lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, null, new.funnel_stage_id, auth.uid());
  elsif tg_op = 'UPDATE' and new.funnel_stage_id is not null
        and old.funnel_stage_id is distinct from new.funnel_stage_id then
    insert into public.crm_stage_history (lead_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, old.funnel_stage_id, new.funnel_stage_id, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.crm_log_assignment_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.crm_assignment_history (lead_id, from_user_id, to_user_id, changed_by)
  values (new.id, old.assigned_to, new.assigned_to, auth.uid());
  return new;
end;
$$;

/* De cuándo cuenta la gestión de un lead. Es la lead_gestion_reference() del producto sin su
   segunda mitad: allá también cuentan los cambios que hace el sistema sobre los cruces con
   propiedades, y acá no hay cruces. Por eso tampoco existe gestion_reopened_by_system. */
create or replace function public.crm_gestion_refresh(p_lead_id uuid)
returns void language sql security definer set search_path to 'public' as $$
  with ganador as (
    -- El de mayor effective_at; el desempate por created_at lo vuelve determinístico.
    select e.effective_at, e.action
    from public.crm_management_events e
    where e.lead_id = p_lead_id and e.deleted_at is null
    order by e.effective_at desc, e.created_at desc
    limit 1
  ), calc as (
    select coalesce(g.effective_at, l.created_at)       as reference_at,
           coalesce(g.action = 'POSTPONED', false)       as postponed,
           g.effective_at is not null                    as has_events
    from public.crm_leads l left join ganador g on true
    where l.id = p_lead_id
  )
  update public.crm_leads l
  set gestion_reference_at = c.reference_at,
      gestion_postponed    = c.postponed,
      gestion_has_events   = c.has_events
  from calc c
  where l.id = p_lead_id
    -- Solo si cambió algo: cada update de un lead dispara realtime a los tres.
    and (l.gestion_reference_at is distinct from c.reference_at
      or l.gestion_postponed    is distinct from c.postponed
      or l.gestion_has_events   is distinct from c.has_events);
$$;

create or replace function public.crm_gestion_from_event()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.crm_gestion_refresh(new.lead_id);
  end if;
  -- Un evento que se mueve de lead (o se borra) también le cambia la cuenta al de antes.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id) then
    perform public.crm_gestion_refresh(old.lead_id);
  end if;
  return null;
end;
$$;

create or replace function public.crm_gestion_from_lead()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.crm_gestion_refresh(new.id);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels','crm_clients',
                           'crm_leads','crm_meetings','crm_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

drop trigger if exists crm_leads_log_stage on public.crm_leads;
create trigger crm_leads_log_stage after insert or update of funnel_stage_id on public.crm_leads
  for each row execute function public.crm_log_stage_change();
drop trigger if exists crm_leads_log_assignment on public.crm_leads;
create trigger crm_leads_log_assignment after update of assigned_to on public.crm_leads
  for each row when (old.assigned_to is distinct from new.assigned_to)
  execute function public.crm_log_assignment_change();
drop trigger if exists crm_leads_gestion on public.crm_leads;
create trigger crm_leads_gestion after insert on public.crm_leads
  for each row execute function public.crm_gestion_from_lead();
drop trigger if exists crm_management_events_gestion on public.crm_management_events;
create trigger crm_management_events_gestion after insert or update or delete on public.crm_management_events
  for each row execute function public.crm_gestion_from_event();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['crm_priorities','crm_funnel_stages','crm_channels','crm_clients',
                           'crm_leads','crm_meetings','crm_tasks','crm_comments',
                           'crm_management_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_equipo', t);
    execute format('create policy %I on public.%I for all
                    using (public.es_usuario()) with check (public.es_usuario())', t || '_equipo', t);
  end loop;
  -- Los historiales solo se leen: los insertan triggers security definer.
  foreach t in array array['crm_stage_history','crm_assignment_history'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_lectura', t);
    execute format('create policy %I on public.%I for select using (public.es_usuario())', t || '_lectura', t);
  end loop;
end $$;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['crm_leads','crm_tasks','crm_comments','crm_management_events','crm_meetings'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Siembras (solo si la tabla está vacía: correr dos veces no duplica) ----------
insert into public.crm_priorities (name, color, position, management_tolerance_hours)
select * from (values
  ('Verde',       '#639922', 1,  24),
  ('Amarillo',    '#EF9F27', 2, 168),
  ('Rojo',        '#E24B4A', 3, 336),
  ('Oportunidad', '#B84300', 4,  24)
) v(name, color, position, management_tolerance_hours)
where not exists (select 1 from public.crm_priorities);

-- Arranca con dos: el resto lo arman ellos desde la configuración del funnel.
insert into public.crm_funnel_stages
  (label, value, position, priority_id, management_tolerance_hours,
   is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
select * from (values
  ('Nuevo',      'NEW',       1, (select id from public.crm_priorities where name = 'Verde'), 24,
   false, false, false, true),
  ('Descartado', 'DISCARDED', 2, null::uuid, null::integer,
   true,  false, false, false)
) v(label, value, position, priority_id, management_tolerance_hours,
    is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
where not exists (select 1 from public.crm_funnel_stages);
```

- [ ] **Step 2: Validar**

Run: `/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql`
Expected: `✓ supabase/schema.sql: …`

- [ ] **Step 3: Dejar escrita la prueba de comportamiento para la inyección**

Agregar a `migracion/PASOS.md`, en «Inyección», un paso nuevo después del 2 (y renumerar los que siguen), con este bloque. Corre con el MCP, sin sesión, así que `assigned_to` va explícito y `changed_by` queda en null:

````markdown
3. **Probar el CRM** (después de cargar `users`, paso 5, porque `assigned_to` lo exige). En una
   transacción que se deshace:
   ```sql
   begin;
   with u as (select id from users order by email limit 1),
        c as (insert into crm_clients (first_name, company_name) values ('Prueba', 'Inmo X') returning id),
        l as (insert into crm_leads (client_id, assigned_to, funnel_stage_id)
              select c.id, u.id, (select id from crm_funnel_stages where value = 'NEW') from c, u
              returning id)
   select id from l;                     -- anotar el id
   -- (reemplazar :lead por ese id)
   update crm_leads set funnel_stage_id = (select id from crm_funnel_stages where value = 'DISCARDED') where id = :lead;
   insert into crm_management_events (lead_id, action, effective_at) values (:lead, 'POSTPONED', now() + interval '3 days');
   select (select count(*) from crm_stage_history where lead_id = :lead) as etapas,   -- esperado 2
          gestion_postponed, gestion_has_events,                                     -- true, true
          gestion_reference_at > now() + interval '2 days' as a_futuro               -- true
   from crm_leads where id = :lead;
   update crm_management_events set deleted_at = now() where lead_id = :lead;
   select gestion_postponed, gestion_has_events, gestion_reference_at = created_at    -- false, false, true
   from crm_leads where id = :lead;
   rollback;
   ```
````

(El paso de cargar `users` pasa a ir antes de esta prueba. Reordenar la lista para que quede: esquema → datos → cuentas en Auth → filas en `users` → prueba del CRM → reasignación.)

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql migracion/PASOS.md
git commit -m "feat: esquema del CRM interno (crm_*)"
```

---

### Task 6: `04-reasignar-usuarios.sql`

**Files:**
- Create: `migracion/04-reasignar-usuarios.sql`

**Interfaces:**
- Consumes: `public.users(email, id)` (Tarea 4), las tablas `roadmap_tareas` y `roadmap_caja`.
- Produces: funciones `pg_temp.*` que solo existen en la sesión que corre el script.

- [ ] **Step 1: Escribir el script**

```sql
-- ============================================================
-- Reasigna 'Loro' / 'Toni' / 'Luis' a los uuids de `users` en los datos del roadmap.
-- Corre DESPUÉS de cargar los datos (02-datos-*) y las filas de `users`.
--
-- Una sola transacción: o se reasigna todo o nada. Idempotente: solo toca valores que
-- todavía son una de las tres claves. El mapeo sale de `users` por email; si falta alguien,
-- aborta antes de tocar una fila.
--
-- OJO con `expl`: se reemplaza como TEXTO y no pasando por jsonb. `jsonb::text` reescribe
-- el formato ("visto": false, con espacio) y avisosSinVer() busca el literal "visto":false
-- sin parsear: la chapa roja se apagaría en todas las tareas.
-- ============================================================
begin;

create temp table _mapa on commit drop as
select v.clave, u.id::text as uid
from (values ('Loro', 'lorenzopiattifadda@gmail.com'),
             ('Toni', 'antonio.piattifadda@gmail.com'),
             ('Luis', 'rubioluis13@gmail.com')) v(clave, email)
left join public.users u on lower(u.email) = v.email;

do $$ begin
  if exists (select 1 from _mapa where uid is null) then
    raise exception 'Faltan en users: %. No se tocó nada.',
      (select string_agg(clave, ', ') from _mapa where uid is null);
  end if;
end $$;

-- Un valor suelto: si es una clave, su uuid; si no, tal cual.
create function pg_temp.m(x text) returns text language sql stable as $$
  select coalesce((select uid from _mapa where clave = x), x)
$$;

-- Un array de strings (pend, carga, para).
create function pg_temp.m_arr(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'string' then to_jsonb(pg_temp.m(e #>> '{}')) else e end
                               order by o)
              from jsonb_array_elements(a) with ordinality t(e, o)), '[]'::jsonb) end
$$;

-- Un campo string de un objeto, solo si existe y es string.
create function pg_temp.m_campo(obj jsonb, campo text) returns jsonb language sql stable as $$
  select case when jsonb_typeof(obj -> campo) = 'string'
              then jsonb_set(obj, array[campo], to_jsonb(pg_temp.m(obj ->> campo)))
              else obj end
$$;

-- chat: [{autor, ts, texto}]
create function pg_temp.m_chat(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(pg_temp.m_campo(m, 'autor') order by o)
              from jsonb_array_elements(a) with ordinality t(m, o)), '[]'::jsonb) end
$$;

-- subtareas: [{resp, chat:[…], …}]
create function pg_temp.m_sub(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(
                case when jsonb_typeof(s -> 'chat') = 'array'
                     then jsonb_set(pg_temp.m_campo(s, 'resp'), '{chat}', pg_temp.m_chat(s -> 'chat'))
                     else pg_temp.m_campo(s, 'resp') end
                order by o)
              from jsonb_array_elements(a) with ordinality t(s, o)), '[]'::jsonb) end
$$;

-- expl en bloques: solo `"autor":"X"`, `"vistoPor":"X"` y los elementos de `"para":[…]`. En
-- JSON válido esas formas no aparecen dentro de un texto (ahí las comillas van escapadas:
-- \"autor\":), así que un «Toni» escrito en una explicación no se toca.
create function pg_temp.m_expl(expl text) returns text language plpgsql stable as $$
declare
  r record;
  antes text;
begin
  if expl is null or left(expl, 8) <> '<!--b-->' then return expl; end if;
  for r in select clave, uid from _mapa loop
    expl := regexp_replace(expl, '"(autor|vistoPor)":"' || r.clave || '"', '"\1":"' || r.uid || '"', 'g');
    -- Cada pasada cambia una aparición por array; se repite hasta que no quede ninguna.
    loop
      antes := expl;
      expl := regexp_replace(expl, '("para":\[[^\]]*)"' || r.clave || '"', '\1"' || r.uid || '"', 'g');
      exit when expl = antes;
    end loop;
  end loop;
  return expl;
end;
$$;

-- Conteo de antes, para comparar al final.
create temp table _antes on commit drop as
select 'pend' c, e x, count(*) n from public.roadmap_tareas, jsonb_array_elements_text(pend) e group by 1, 2
union all select 'resp', resp, count(*) from public.roadmap_tareas where resp <> '' group by 1, 2
union all select 'chat', m ->> 'autor', count(*) from public.roadmap_tareas, jsonb_array_elements(chat) m group by 1, 2
union all select 'cuenta', cuenta, count(*) from public.roadmap_caja where cuenta <> '' group by 1, 2;

update public.roadmap_tareas set
  pend      = pg_temp.m_arr(pend),
  resp      = pg_temp.m(resp),
  chat      = pg_temp.m_chat(chat),
  subtareas = pg_temp.m_sub(subtareas),
  expl      = pg_temp.m_expl(expl);

update public.roadmap_caja set
  cuenta = pg_temp.m(cuenta),
  carga  = pg_temp.m_arr(carga);

-- ---------- Verificación: si algo no cierra, se deshace todo ----------
do $$
declare quedan int; distintos int;
begin
  select count(*) into quedan from (
    select 1 from public.roadmap_tareas, jsonb_array_elements_text(pend) e where e in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas where resp in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas, jsonb_array_elements(chat) m where m ->> 'autor' in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas, jsonb_array_elements(subtareas) s where s ->> 'resp' in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas where expl ~ '"(autor|vistoPor)":"(Loro|Toni|Luis)"'
    union all select 1 from public.roadmap_tareas where expl ~ '"para":\[[^\]]*"(Loro|Toni|Luis)"'
    union all select 1 from public.roadmap_caja where cuenta in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_caja, jsonb_array_elements_text(carga) e where e in ('Loro','Toni','Luis')
  ) q;
  if quedan > 0 then raise exception 'Quedaron % claves viejas sin reasignar', quedan; end if;

  -- Mismas cuentas antes y después, traduciendo la clave al uuid. Los paréntesis del lado
  -- derecho no son decorativos: sin ellos `except` se aplicaría solo contra el primer select.
  select count(*) into distintos from (
    select c, coalesce(m.uid, a.x) x, n from _antes a left join _mapa m on m.clave = a.x
    except
    (select 'pend', e, count(*) from public.roadmap_tareas, jsonb_array_elements_text(pend) e group by 2
     union all select 'resp', resp, count(*) from public.roadmap_tareas where resp <> '' group by 2
     union all select 'chat', m ->> 'autor', count(*) from public.roadmap_tareas, jsonb_array_elements(chat) m group by 2
     union all select 'cuenta', cuenta, count(*) from public.roadmap_caja where cuenta <> '' group by 2)
  ) d;
  if distintos > 0 then raise exception 'Los conteos por persona no coinciden (% diferencias)', distintos; end if;

  -- La chapa roja lee el literal: tiene que seguir habiendo la misma cantidad.
  raise notice 'OK. Avisos sin ver (literal "visto":false): %',
    (select count(*) from public.roadmap_tareas where expl like '%"visto":false%');
end $$;

commit;
```

- [ ] **Step 2: Validar sintaxis**

Run: `/tmp/venv-sql/bin/python migracion/validar-sql.py migracion/04-reasignar-usuarios.sql`
Expected: `✓ migracion/04-reasignar-usuarios.sql: …`

- [ ] **Step 3: Dry run contra el proyecto VIEJO, solo lectura**

Con el MCP en `propelia` y `execute_sql`, crear las mismas funciones `pg_temp.*` con un `_mapa` falso y **consultar sin actualizar**. Las tablas temporales y `pg_temp` no escriben nada de la base.

```sql
create temp table _mapa as select * from (values ('Loro','u-lo'),('Toni','u-to'),('Luis','u-lu')) v(clave, uid);
-- …pegar acá las seis `create function pg_temp.*` del script, tal cual…
select
  count(*) filter (where pg_temp.m_expl(expl) ~ '"(autor|vistoPor)":"(Loro|Toni|Luis)"') as avisos_viejos,        -- 0
  count(*) filter (where pg_temp.m_expl(expl) ~ '"para":\[[^\]]*"(Loro|Toni|Luis)"')    as para_viejos,            -- 0
  count(*) filter (where expl like '%"visto":false%')                                   as chapas_antes,
  count(*) filter (where pg_temp.m_expl(expl) like '%"visto":false%')                   as chapas_despues,         -- = antes
  count(*) filter (where pg_temp.m_expl(expl) <> expl)                                   as expl_tocados,
  count(*) filter (where pg_temp.m_arr(pend) ?| array['Loro','Toni','Luis'])             as pend_viejos,            -- 0
  count(*) filter (where pg_temp.m_chat(chat)::text ~ '"autor": "(Loro|Toni|Luis)"')     as chat_viejos             -- 0
from roadmap_tareas;
```

Expected: `avisos_viejos = 0`, `para_viejos = 0`, `chapas_despues = chapas_antes`, `pend_viejos = 0`, `chat_viejos = 0`, `expl_tocados` igual a la cantidad de tareas con avisos del relevamiento (≈12).

Caso adicional, un texto libre que nombra a alguien:

```sql
select pg_temp.m_expl('<!--b-->[{"k":"text","txt":"hablar con \"Toni\" y \"autor\":\"Loro\""}]');
```

Expected: el mismo texto sin cambios (las comillas escapadas no calzan con el patrón).

Si algo no da lo esperado: corregir la función en el script, volver al Step 2.

- [ ] **Step 4: Commit**

```bash
git add migracion/04-reasignar-usuarios.sql
git commit -m "feat: script que reasigna las tareas a los uuids de users"
```

---

### Task 7: Documentación

**Files:**
- Modify: `CLAUDE.md` (sección «Identidad vs. membresía», menciones a `APP_CONFIG.personas` y a `app_miembros`)
- Modify: `PENDIENTES-BACKEND.md` (sección «Dar acceso»)
- Modify: `migracion/PASOS.md` (tabla «Estado»)

- [ ] **Step 1: `CLAUDE.md` — reescribir «Identidad vs. membresía»**

Reemplazar el cuadro entero (desde `### Identidad vs. membresía — no confundir` hasta antes de `### Modelo de datos`) por:

```markdown
### Identidad y acceso: la tabla `users`

**Desde el 29/9/2026 son una sola cosa.** Tener fila activa en `users` ES tener acceso
(`es_usuario()`, que usan todas las policies) y esa misma fila dice quién sos: nombre,
iniciales, color y si ponés plata en la caja. El front la lee al entrar
(`RoadmapSync.cargarUsuarios()` → `cargarEquipo()` → `PERSONAS` / `PERSONAS_CAJA`).

- **Hasta ese día eran dos**: el acceso salía de `app_miembros` (por email) y la identidad de
  `APP_CONFIG.personas`, escrita a mano en el HTML. Existía el caso «entraste pero el tablero
  no sabe quién sos». Ya no existe: sin fila no entrás.
- **Lo que se guarda en los datos es el uuid de la cuenta**: `pend`, `resp`, `chat[].autor`,
  los avisos y `cuenta`/`carga` de la caja. Hasta la mudanza eran `'Loro'`, `'Toni'`,
  `'Luis'`; los reescribió `migracion/04-reasignar-usuarios.sql`.
- **El front no escribe `users`**: no hay policies de escritura. Altas, cambios y roles van por
  el MCP o el service role.
- **La baja es `activo = false`, nunca un `delete`.** Un inactivo no entra (`es_usuario()` lo
  corta y la RLS le devuelve la lista vacía), pero se sigue pintando: una tarea vieja dice
  quién la hizo y lo que pagó sigue en el saldo de la caja. Lo que no se hace es **ofrecerlo
  para elegir**: `elegibles()` lo saca de los menús salvo donde ya está puesto, para poder
  sacarlo.
- **`rol` es un enum con un solo valor (`SUPERADMIN`)** y todavía no restringe nada. Un rol
  nuevo es `alter type user_role add value …`; la primera regla por rol es una policy.
- **`caja` es un booleano y no un rol**: quién pone plata y qué permisos tiene una cuenta son
  preguntas distintas.
```

Después: `rg -n "APP_CONFIG.personas|app_miembros|es_miembro" CLAUDE.md` y ajustar cada mención restante al mundo de `users` sin cambiar el porqué que explica. En menciones históricas («hasta el 26/8/2026…»), agregar «(hoy `users`)» en lugar de reescribir la historia.

- [ ] **Step 2: `PENDIENTES-BACKEND.md` — el alta de un usuario**

Reemplazar la sección `## Dar acceso: cuenta + \`app_miembros\` + \`personas\` del HTML` entera (hasta el `---` siguiente) por:

````markdown
## Dar de alta a alguien: cuenta + fila en `users`

**a) La cuenta**: `Authentication → Users → Add user`, con email y contraseña, confirmada
(el front entra con `signInWithPassword`).

**b) La fila en `users`**, por el MCP (el front no puede escribir esa tabla):

```sql
insert into public.users (id, email, nombre, iniciales, color, caja)
select id, email, 'Nombre', 'NO', '#5A7E8C', false
from auth.users where email = '<email en minúscula>';
```

Sin la fila, la persona entra y ve «Sin acceso». **Dar de baja** es
`update users set activo = false where email = …` — nunca un `delete`.

| Persona | Cuenta | Caja |
|---|---|---|
| Lorenzo | `lorenzopiattifadda@gmail.com` | sí |
| Antonio | `antonio.piattifadda@gmail.com` | sí |
| Luis | `rubioluis13@gmail.com` | no |
````

En `## Montar la base en un proyecto nuevo`, el paso 2 pasa a `2. Crear las cuentas y sus filas en \`users\` (abajo).`

- [ ] **Step 3: `migracion/PASOS.md` — estado**

En la tabla «Estado», marcar ✅ las tres filas `⏳` (esquema con `users` + `crm_*`, `04-reasignar-usuarios.sql`, front leyendo `users`) con la fecha del día.

- [ ] **Step 4: Chequeo final del repo**

Run: `node scripts/test-equipo.cjs && node scripts/test-calcular-orden.cjs && /tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql migracion/04-reasignar-usuarios.sql && rg -n "esMiembro\(\)|emailActual|app_miembros|es_miembro|APP_CONFIG.personas" --glob '!docs/**' --glob '!migracion/fuente-crm-producto.sql' .`
Expected: los dos tests OK, los dos SQL ✓, y el `rg` solo muestra menciones históricas en `CLAUDE.md` marcadas con «(hoy `users`)».

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md PENDIENTES-BACKEND.md migracion/PASOS.md
git commit -m "docs: identidad y acceso por la tabla users"
```

---

## Después de este plan

Lo que queda es la inyección, que es de otra sesión con el MCP en la cuenta nueva y sigue
`migracion/PASOS.md` al pie de la letra. El deploy del front (Tareas 1-3) **no se hace
hasta ese momento**: el front nuevo contra la base vieja no encuentra `users` y deja a todos
en «Sin acceso».
