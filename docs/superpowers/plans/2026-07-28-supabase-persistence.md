# Persistencia compartida vía Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el `localStorage` + export/import manual de `index.html` por una base de datos Supabase compartida entre Loro y Toni, con sincronización en tiempo real y adjuntos en Supabase Storage.

**Architecture:** `index.html` sigue siendo un único archivo estático sin build tools. Se agrega `supabase-sync.js` (cargado por `<script src>` antes del script principal) como capa de datos: expone un objeto global `RoadmapSync` con funciones de lectura/escritura contra Postgres, subida/borrado de archivos contra Storage, suscripción realtime, y sesión de Auth real (email+password, reutilizando el proyecto Supabase de `propelia-frontend`). El script principal de `index.html` deja de tocar `localStorage`/`RAW` y llama a `RoadmapSync.*` en cada punto donde antes llamaba a `guardar()`. Un modal flotante bloquea toda la app hasta que hay sesión activa.

**Tech Stack:** Supabase JS SDK v2 (vía CDN `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`), Postgres, Supabase Realtime, Supabase Storage. Sin build tools, sin framework de test (proyecto HTML estático).

## Global Constraints

- Proyecto Supabase real: `propelia`, ref `gvkdyxhxsnpumxlhvhsm`. El SQL de creación de tablas lo corre el usuario mismo en el SQL Editor del dashboard — ningún agente recibe credenciales de la base.
- Prefijo de tablas: `roadmap_` (`roadmap_secciones`, `roadmap_tareas`). Bucket de Storage: `roadmap-adjuntos`.
- **[ACTUALIZADO durante la ejecución, ver spec Addendum]** RLS exige sesión autenticada (`auth.role() = 'authenticated'`) en ambas tablas y en `storage.objects` del bucket `roadmap-adjuntos` — Auth real (email+password) contra el mismo proyecto Supabase que ya usa `propelia-frontend`. Se descartaron tanto "sin auth" como el passcode de UX (decisiones originales del spec, ya supersedidas). Loro y Toni entran con la cuenta que ya tengan ahí; no hay alta de usuarios nueva en este plan.
- `orden` es `float8` en ambas tablas; al reordenar se recalcula solo el punto medio entre vecinos, nunca se reescribe la lista completa.
- Debounce de 500ms en los campos de texto (`tarea`, `expl`, `com`, `modulo`, `titulo` de sección) antes de persistir.
- Sin framework de test en este repo. Para lógica pura (`calcularOrden`, el generador de seed) se usan aserciones planas de Node (`node -e` / `assert`). Para todo lo que depende del DOM o de la red (Supabase real) la verificación es manual en dos pestañas del navegador — así lo aprobó el spec.
- Se elimina "Cargar cambios de un archivo" y "Descartar mis cambios". Se mantiene "Guardar archivo" (export HTML) y "Exportar a CSV" sin cambios de comportamiento.
- Archivo de referencia de la spec: `docs/superpowers/specs/2026-07-28-supabase-persistence-design.md`.

---

### Task 1: SQL de esquema + generador de seed

**Files:**
- Create: `supabase/schema.sql`
- Create: `scripts/generate-seed-sql.mjs`
- Create: `supabase/seed.sql` (generado por el script, no se escribe a mano)

**Interfaces:**
- Produces: `supabase/schema.sql` (DDL idempotente), `supabase/seed.sql` (52 `insert into` — 4 secciones + 48 tareas)

- [ ] **Step 1: Escribir `supabase/schema.sql`**

```sql
-- supabase/schema.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm).
-- Idempotente: se puede correr más de una vez sin error.

create table if not exists public.roadmap_secciones (
  id text primary key,
  titulo text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.roadmap_tareas (
  id text primary key,
  sec_id text not null references public.roadmap_secciones(id) on delete cascade,
  modulo text not null default '',
  tarea text not null default '',
  expl text not null default '',
  resp text not null default '',
  estado text not null default 'Pendiente',
  img text not null default '',
  com text not null default '',
  fecha date,
  files jsonb not null default '[]'::jsonb,
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create index if not exists roadmap_tareas_sec_id_idx on public.roadmap_tareas (sec_id);

create or replace function public.roadmap_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists roadmap_secciones_set_updated_at on public.roadmap_secciones;
create trigger roadmap_secciones_set_updated_at
  before update on public.roadmap_secciones
  for each row execute function public.roadmap_set_updated_at();

drop trigger if exists roadmap_tareas_set_updated_at on public.roadmap_tareas;
create trigger roadmap_tareas_set_updated_at
  before update on public.roadmap_tareas
  for each row execute function public.roadmap_set_updated_at();

alter table public.roadmap_secciones enable row level security;
alter table public.roadmap_tareas enable row level security;

drop policy if exists roadmap_secciones_all on public.roadmap_secciones;
create policy roadmap_secciones_all on public.roadmap_secciones
  for all using (true) with check (true);

drop policy if exists roadmap_tareas_all on public.roadmap_tareas;
create policy roadmap_tareas_all on public.roadmap_tareas
  for all using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roadmap_secciones'
  ) then
    alter publication supabase_realtime add table public.roadmap_secciones;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roadmap_tareas'
  ) then
    alter publication supabase_realtime add table public.roadmap_tareas;
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('roadmap-adjuntos', 'roadmap-adjuntos', true)
on conflict (id) do nothing;

drop policy if exists roadmap_adjuntos_read on storage.objects;
create policy roadmap_adjuntos_read on storage.objects
  for select using (bucket_id = 'roadmap-adjuntos');

drop policy if exists roadmap_adjuntos_write on storage.objects;
create policy roadmap_adjuntos_write on storage.objects
  for insert with check (bucket_id = 'roadmap-adjuntos');

drop policy if exists roadmap_adjuntos_delete on storage.objects;
create policy roadmap_adjuntos_delete on storage.objects
  for delete using (bucket_id = 'roadmap-adjuntos');
```

- [ ] **Step 2: Escribir el generador de seed**

```js
// scripts/generate-seed-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="datos"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error('No se encontró el bloque <script id="datos"> en index.html');
const { secciones, tareas } = JSON.parse(match[1]);

const sqlStr = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const lineas = [];
lineas.push('-- Generado por scripts/generate-seed-sql.mjs — no editar a mano');
lineas.push('begin;');

secciones.forEach((s, i) => {
  lineas.push(
    `insert into public.roadmap_secciones (id, titulo, orden) values ` +
    `(${sqlStr(s.id)}, ${sqlStr(s.titulo)}, ${i + 1});`
  );
});

tareas.forEach((t, i) => {
  lineas.push(
    `insert into public.roadmap_tareas ` +
    `(id, sec_id, modulo, tarea, expl, resp, estado, img, com, fecha, files, orden) values (` +
    `${sqlStr(t.id)}, ${sqlStr(t.sec)}, ${sqlStr(t.modulo)}, ${sqlStr(t.tarea)}, ` +
    `${sqlStr(t.expl)}, ${sqlStr(t.resp)}, ${sqlStr(t.estado)}, ${sqlStr(t.img)}, ` +
    `${sqlStr(t.com)}, ${t.fecha ? sqlStr(t.fecha) : 'null'}, '[]'::jsonb, ${i + 1});`
  );
});

lineas.push('commit;');
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), lineas.join('\n') + '\n');
console.log(`Escritas ${secciones.length} secciones y ${tareas.length} tareas en supabase/seed.sql`);
```

- [ ] **Step 3: Correr el generador y verificar la cuenta de filas**

Run: `node scripts/generate-seed-sql.mjs`
Expected: imprime `Escritas 4 secciones y 48 tareas en supabase/seed.sql`

Run: `rg -c "^insert into public\.roadmap_" supabase/seed.sql`
Expected: `52`

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql scripts/generate-seed-sql.mjs supabase/seed.sql
git commit -m "feat: add Supabase schema DDL and seed generator for roadmap tables"
```

---

### Task 2: [MANUAL — lo hace el usuario, no un subagente] Aplicar el SQL en Supabase

**Files:** ninguno (acción fuera del repo, en el dashboard de Supabase)

- [ ] **Step 1: Correr `supabase/schema.sql`**

En el dashboard de Supabase del proyecto `propelia` (ref `gvkdyxhxsnpumxlhvhsm`) → SQL Editor → pegar el contenido completo de `supabase/schema.sql` → Run. Confirmar que no tira errores.

- [ ] **Step 2: Correr `supabase/seed.sql`**

En una consulta nueva del SQL Editor, pegar el contenido de `supabase/seed.sql` → Run.

- [ ] **Step 3: Verificar los datos**

Correr en el SQL Editor:
```sql
select count(*) from public.roadmap_secciones;  -- espera 4
select count(*) from public.roadmap_tareas;     -- espera 48
```

- [ ] **Step 4: Confirmar antes de seguir**

No avanzar a la Task 3 hasta que los dos `count(*)` de arriba devuelvan los números esperados.

---

### Task 3: Cliente Supabase + CRUD base (`supabase-sync.js`)

**Files:**
- Create: `order-math.js` (función pura compartida, sin `window`/`document` — cargable tanto por `<script src>` en el navegador como por `require()` en Node)
- Create: `supabase-sync.js`
- Test: `scripts/test-calcular-orden.cjs`

**Interfaces:**
- Consumes: variables globales `SUPABASE_URL`, `SUPABASE_ANON_KEY` (a completar con los valores reales del proyecto — Dashboard → Settings → API → Project URL / anon public); `calcularOrden` global expuesta por `order-math.js` (cargado antes que `supabase-sync.js` en `index.html`, ver Task 6 Step 1)
- Produces: `window.RoadmapSync.cargarEstado()`, `.guardarSeccion(s)`, `.borrarSeccion(id)`, `.guardarTarea(t)`, `.borrarTarea(id)`, `.calcularOrden(anterior, siguiente)` — usados por las Tasks 4-6.

- [ ] **Step 1: Escribir la función pura `calcularOrden` en su propio archivo**

```js
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
```

- [ ] **Step 2: Escribir el test y correrlo**

```js
// scripts/test-calcular-orden.cjs
const assert = require('node:assert/strict');
const { calcularOrden } = require('../order-math.js');

assert.equal(calcularOrden(null, null), 1);
assert.equal(calcularOrden(null, 5), 4);
assert.equal(calcularOrden(5, null), 6);
assert.equal(calcularOrden(2, 4), 3);
console.log('calcularOrden: OK');
```

Run: `node scripts/test-calcular-orden.cjs`
Expected: `calcularOrden: OK`

- [ ] **Step 3: Preguntarle al usuario por las credenciales del proyecto**

STOP: pedirle al usuario el **Project URL** y la **anon public key** del proyecto `propelia` (Dashboard → Settings → API). No son secretas — están diseñadas para vivir en el cliente, protegidas por RLS. Guardarlas para el siguiente step.

- [ ] **Step 4: Escribir `supabase-sync.js` con el cliente y el CRUD base**

```js
// supabase-sync.js
// Requiere que scripts/generate-seed-sql.mjs + supabase/schema.sql + seed.sql
// ya se hayan corrido contra el proyecto (ver Task 1 y 2), y que order-math.js
// se cargue antes que este script (ver Task 6 Step 1) para que `calcularOrden` exista.

const SUPABASE_URL = 'REEMPLAZAR_CON_PROJECT_URL';
const SUPABASE_ANON_KEY = 'REEMPLAZAR_CON_ANON_PUBLIC_KEY';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RoadmapSync = {
  calcularOrden,

  async cargarEstado() {
    const [{ data: secciones, error: e1 }, { data: tareas, error: e2 }] = await Promise.all([
      supabaseClient.from('roadmap_secciones').select('*').order('orden'),
      supabaseClient.from('roadmap_tareas').select('*').order('orden'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    return {
      secciones: secciones.map(s => ({ id: s.id, titulo: s.titulo, orden: s.orden })),
      tareas: tareas.map(t => ({
        id: t.id, sec: t.sec_id, modulo: t.modulo, tarea: t.tarea, expl: t.expl,
        resp: t.resp, estado: t.estado, img: t.img, com: t.com,
        fecha: t.fecha || '', files: t.files || [], orden: t.orden,
      })),
    };
  },

  async guardarSeccion(s) {
    const { error } = await supabaseClient.from('roadmap_secciones')
      .upsert({ id: s.id, titulo: s.titulo, orden: s.orden });
    if (error) throw error;
  },

  async borrarSeccion(id) {
    const { error } = await supabaseClient.from('roadmap_secciones').delete().eq('id', id);
    if (error) throw error;
  },

  async guardarTarea(t) {
    const { error } = await supabaseClient.from('roadmap_tareas').upsert({
      id: t.id, sec_id: t.sec, modulo: t.modulo, tarea: t.tarea, expl: t.expl,
      resp: t.resp, estado: t.estado, img: t.img, com: t.com,
      fecha: t.fecha || null, files: t.files || [], orden: t.orden,
    });
    if (error) throw error;
  },

  async borrarTarea(id) {
    const { error } = await supabaseClient.from('roadmap_tareas').delete().eq('id', id);
    if (error) throw error;
  },
};

window.RoadmapSync = RoadmapSync;
```

- [ ] **Step 5: Commit**

```bash
git add order-math.js supabase-sync.js scripts/test-calcular-orden.cjs
git commit -m "feat: add Supabase client, order-math helper, and base CRUD in supabase-sync.js"
```

---

### Task 4: Storage de adjuntos + Auth real (login) + RLS por sesión

**Nota:** esta task fue rediseñada a mitad de la ejecución del plan — la Task 1 ya había corrido con RLS abierto (`using (true)`); el usuario pidió reemplazar el passcode de UX por Auth real (email+password), reutilizando el proyecto Supabase de `propelia-frontend`. Ver spec, sección "Addendum: Auth real reemplaza el passcode".

**Files:**
- Create: `supabase/rls-auth.sql` (migración: reemplaza las policies abiertas de Task 1 por policies que exigen sesión autenticada)
- Modify: `supabase-sync.js`

**Interfaces:**
- Consumes: `supabaseClient` (definido en Task 3, mismo archivo)
- Produces: `RoadmapSync.subirArchivo(tareaId, blob, nombreArchivo)`, `.borrarArchivo(path)`, `.urlPublica(path)`, `.sesionActiva()`, `.iniciarSesion(email, password)`, `.cerrarSesion()`, `.onCambioSesion(cb)` — usados por Task 6.

- [ ] **Step 1: Agregar las funciones de Storage antes de `window.RoadmapSync = RoadmapSync;`**

```js
RoadmapSync.subirArchivo = async function (tareaId, blob, nombreArchivo) {
  const path = `${tareaId}/${Date.now()}-${nombreArchivo}`;
  const { error } = await supabaseClient.storage.from('roadmap-adjuntos')
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
  return { n: nombreArchivo, t: blob.type || '', path, size: blob.size };
};

RoadmapSync.borrarArchivo = async function (path) {
  const { error } = await supabaseClient.storage.from('roadmap-adjuntos').remove([path]);
  if (error) throw error;
};

RoadmapSync.urlPublica = function (path) {
  const { data } = supabaseClient.storage.from('roadmap-adjuntos').getPublicUrl(path);
  return data.publicUrl;
};
```

- [ ] **Step 2: Agregar las funciones de Auth antes de `window.RoadmapSync = RoadmapSync;`**

```js
RoadmapSync.sesionActiva = async function () {
  const { data } = await supabaseClient.auth.getSession();
  return !!data.session;
};

RoadmapSync.iniciarSesion = async function (email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

RoadmapSync.cerrarSesion = async function () {
  await supabaseClient.auth.signOut();
};

RoadmapSync.onCambioSesion = function (cb) {
  supabaseClient.auth.onAuthStateChange((_evento, sesion) => cb(!!sesion));
};
```

- [ ] **Step 3: Escribir la migración de RLS**

```sql
-- supabase/rls-auth.sql
-- Ejecutar en el SQL Editor del proyecto Supabase "propelia" (gvkdyxhxsnpumxlhvhsm),
-- DESPUÉS de supabase/schema.sql (Task 1). Reemplaza las policies abiertas por
-- policies que exigen sesión autenticada (Supabase Auth real).
-- Idempotente: se puede correr más de una vez sin error.

drop policy if exists roadmap_secciones_all on public.roadmap_secciones;
create policy roadmap_secciones_auth on public.roadmap_secciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists roadmap_tareas_all on public.roadmap_tareas;
create policy roadmap_tareas_auth on public.roadmap_tareas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists roadmap_adjuntos_read on storage.objects;
create policy roadmap_adjuntos_read on storage.objects
  for select using (bucket_id = 'roadmap-adjuntos' and auth.role() = 'authenticated');

drop policy if exists roadmap_adjuntos_write on storage.objects;
create policy roadmap_adjuntos_write on storage.objects
  for insert with check (bucket_id = 'roadmap-adjuntos' and auth.role() = 'authenticated');

drop policy if exists roadmap_adjuntos_delete on storage.objects;
create policy roadmap_adjuntos_delete on storage.objects
  for delete using (bucket_id = 'roadmap-adjuntos' and auth.role() = 'authenticated');
```

- [ ] **Step 4: [MANUAL — lo hace el usuario] Correr la migración y confirmar cuentas**

STOP: pedirle al usuario que corra `supabase/rls-auth.sql` en el SQL Editor de Supabase, y que confirme que Loro y Toni ya existen como usuarios en este proyecto (Dashboard → Authentication → Users) — son las mismas cuentas que usan en `propelia-frontend`. Si alguno no existe ahí, no va a poder loguearse hasta que se le cree la cuenta manualmente en ese panel. No avanzar a Task 6 sin esta confirmación (Task 5 no depende de esto y puede seguir).

- [ ] **Step 5: Commit**

```bash
git add supabase/rls-auth.sql supabase-sync.js
git commit -m "feat: add Storage upload/delete and real Auth (session-gated RLS) to supabase-sync.js"
```

---

### Task 5: Suscripción en tiempo real

**Files:**
- Modify: `supabase-sync.js`

**Interfaces:**
- Produces: `RoadmapSync.suscribir(onCambio)` → función `onCambio` se llama en cualquier `INSERT`/`UPDATE`/`DELETE` de `roadmap_secciones` o `roadmap_tareas`; devuelve una función para cancelar la suscripción.

- [ ] **Step 1: Agregar la suscripción antes de `window.RoadmapSync = RoadmapSync;`**

```js
RoadmapSync.suscribir = function (onCambio) {
  const canal = supabaseClient
    .channel('roadmap-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roadmap_secciones' }, onCambio)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roadmap_tareas' }, onCambio)
    .subscribe(estadoCanal => {
      // 'SUBSCRIBED' se dispara tanto en la conexión inicial como en cada reconexión
      // (ej. laptop que vuelve de suspendido) — refetch completo por las dudas de haberse
      // perdido algún evento mientras estuvo desconectado, tal como pide la spec.
      if (estadoCanal === 'SUBSCRIBED') onCambio();
    });
  return () => supabaseClient.removeChannel(canal);
};
```

- [ ] **Step 2: Commit**

```bash
git add supabase-sync.js
git commit -m "feat: add realtime subscription to supabase-sync.js"
```

---

### Task 6: Reemplazar la capa de datos dentro de `index.html`

Esta es la tarea grande: reemplaza cada punto donde el script principal usaba `localStorage`/`guardar()` por llamadas a `RoadmapSync`. No se puede partir en tareas más chicas sin dejar la app rota a medio camino — todos los sub-pasos de acá abajo tienen que aplicarse juntos.

**Nota sobre los números de línea:** todas las referencias "líneas ~X actuales" de este task apuntan al archivo `index.html` ANTES de aplicar cualquier step de este mismo task — cada step corrido desplaza las líneas de los siguientes (el Step 2, por ejemplo, colapsa ~645 líneas a 1). Usar los fragmentos de código mostrados (nombres de función, selectores) para ubicar el punto de edición, no los números de línea a ciegas.

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: todo lo producido en Tasks 3-5 (`RoadmapSync.cargarEstado/guardarSeccion/borrarSeccion/guardarTarea/borrarTarea/calcularOrden/subirArchivo/borrarArchivo/urlPublica/sesionActiva/iniciarSesion/cerrarSesion/onCambioSesion/suscribir`)

**Nota sobre Auth:** ya no hay guards de passcode por handler. La RLS (Task 4) exige sesión autenticada a nivel de base — el gate es UNO SOLO, a nivel de app completa (un modal que bloquea todo hasta loguearse), no un `if(!...) return;` repetido en cada acción. Ver Step 10 (modal de login) y Step 11 (arranque con el gate de sesión) más abajo.

- [ ] **Step 1: Agregar los `<script>` de Supabase antes del script principal**

En el `<head>` o justo antes del `<script>` principal (línea 959 actual, `const RAW = ...`), agregar, en este orden exacto (`order-math.js` define `calcularOrden` en `window` antes de que `supabase-sync.js` la use):

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="order-math.js"></script>
<script src="supabase-sync.js"></script>
```

- [ ] **Step 2: Vaciar el `<script id="datos">` (ya no es la fuente de carga, solo lo usa el export)**

Reemplazar todo el contenido JSON entre líneas 313-958 (el objeto con `secciones`/`tareas` de las 4 secciones y 48 tareas) por:

```html
<script id="datos" type="application/json">{"secciones":[],"tareas":[]}</script>
```

(El tag se mantiene porque `bHtml.onclick` sigue usándolo como destino al exportar el HTML — ver Task 7.)

- [ ] **Step 3: Reemplazar la carga inicial de estado (líneas 960-987 actuales)**

Quitar:
```js
const RAW = JSON.parse(document.getElementById('datos').textContent);
const KEY = 'plan-loro-toni-v2';
const ESTADOS = ['Pendiente','En curso','Bloqueado','Hecho'];
const clon = o => JSON.parse(JSON.stringify(o));

let estado = (()=>{
  try{ const g=localStorage.getItem(KEY); if(g){const j=JSON.parse(g); if(j.secciones&&j.tareas) return j;} }catch(e){}
  return clon(RAW);
})();

estado.tareas.forEach(t=>{ if(!Array.isArray(t.files)) t.files=[]; });

let sinAlmacen=false;
function guardar(){
  try{
    localStorage.setItem(KEY, JSON.stringify(estado));
    if(sinAlmacen){ sinAlmacen=false; avisoAlmacen.hidden=true; }
  }catch(e){
    sinAlmacen=true; avisoAlmacen.hidden=false;
  }
  pintarPeso();
}
function pintarPeso(){
  const b=new Blob([JSON.stringify(estado)]).size;
  const n=estado.tareas.reduce((a,t)=>a+(t.files||[]).length,0);
  peso.textContent=(n?n+' archivos · ':'')+(b/1048576).toFixed(2)+' MB';
}
```

Reemplazar por:

```js
const ESTADOS = ['Pendiente','En curso','Bloqueado','Hecho'];

let estado = { secciones: [], tareas: [] };

const pendientesGuardado = new Map();
function guardarDebounced(entidad, guardarFn) {
  clearTimeout(pendientesGuardado.get(entidad.id));
  pendientesGuardado.set(entidad.id, setTimeout(() => guardarFn(entidad), 500));
}

async function persistirTarea(t, intentos = 2) {
  try { await RoadmapSync.guardarTarea(t); }
  catch (e) {
    if (intentos > 0) setTimeout(() => persistirTarea(t, intentos - 1), 1500);
    else aviso('No se pudo guardar «' + (t.tarea || t.id) + '». Revisa tu conexión.');
  }
}
async function persistirSeccion(s, intentos = 2) {
  try { await RoadmapSync.guardarSeccion(s); }
  catch (e) {
    if (intentos > 0) setTimeout(() => persistirSeccion(s, intentos - 1), 1500);
    else aviso('No se pudo guardar el bloque «' + (s.titulo || s.id) + '». Revisa tu conexión.');
  }
}

let refrescoPendiente = false;
async function refrescarDesdeSupabase() {
  const enFoco = document.activeElement;
  const escribiendo = enFoco && lista.contains(enFoco) && (enFoco.tagName === 'INPUT' || enFoco.tagName === 'TEXTAREA');
  if (escribiendo) { refrescoPendiente = true; return; }
  try { estado = await RoadmapSync.cargarEstado(); }
  catch (e) { aviso('No se pudo sincronizar: ' + e.message); return; }
  render();
}
document.addEventListener('focusout', e => {
  if (refrescoPendiente && lista.contains(e.target)) {
    refrescoPendiente = false;
    refrescarDesdeSupabase();
  }
});
```

Nota: `estado.tareas.forEach(t=>{ if(!Array.isArray(t.files)) t.files=[]; })` se elimina porque `RoadmapSync.cargarEstado()` ya devuelve `files` como array (default `'[]'::jsonb` en la DB).

También en este step: buscar la función `render()` (más abajo en el mismo script, no se mueve de lugar) y cambiar su última línea de:

```js
  visibles.textContent=n+' visibles';
  cancha(); pintarPeso();
}
```

a:

```js
  visibles.textContent=n+' visibles';
  cancha();
}
```

(`pintarPeso()` ya no existe — si se deja la llamada, `render()` explota con un `ReferenceError` la primera vez que se invoca.)

- [ ] **Step 4: Reemplazar `comprimirImagen`, `adjuntar`, `abrirArchivo`, `pintarThumbs` (líneas ~1000-1071 actuales)**

Quitar `leerComoDataURL` y `bytesDe` por completo (ya no se codifica a base64). Reemplazar el resto por:

```js
const MAX_LADO=1800, CALIDAD=.82, MAX_ARCHIVO=6*1048576;
const kb=n=>n<1048576?Math.round(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';

async function comprimirImagen(file){
  try{
    const bmp=await createImageBitmap(file);
    const f=Math.min(1, MAX_LADO/Math.max(bmp.width,bmp.height));
    const w=Math.round(bmp.width*f), h=Math.round(bmp.height*f);
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    c.getContext('2d').drawImage(bmp,0,0,w,h);
    if(bmp.close) bmp.close();
    const blob = await new Promise(resolve=>c.toBlob(resolve,'image/webp',CALIDAD));
    return (blob && blob.size<file.size) ? blob : file;
  }catch(e){ return file; }
}
async function adjuntar(t, files, alTerminar){
  let n=0, saltados=[], ahorro=0;
  for(const f of files){
    const esImg=/^image\//.test(f.type);
    if(!esImg && f.size>MAX_ARCHIVO){ saltados.push(f.name+' ('+kb(f.size)+')'); continue; }
    const blob = esImg ? await comprimirImagen(f) : f;
    if(blob.size>MAX_ARCHIVO){ saltados.push((f.name||'captura')+' ('+kb(blob.size)+' ya comprimida)'); continue; }
    if(esImg && f.size>blob.size) ahorro += f.size-blob.size;
    try{
      const nombre = f.name || ('captura-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.webp');
      const archivo = await RoadmapSync.subirArchivo(t.id, blob, nombre);
      t.files.push(archivo);
      n++;
    }catch(e){ saltados.push((f.name||'captura')+' (error al subir)'); }
  }
  if(n) await persistirTarea(t);
  alTerminar();
  if(saltados.length) aviso('No pude adjuntar: '+saltados.join(', ')+'. Súbelo a Drive y pega el enlace.');
  else if(n) aviso((n===1?'1 archivo adjuntado':n+' archivos adjuntados')+(ahorro>512000?' · '+kb(ahorro)+' ahorrados al comprimir':''));
}
function abrirArchivo(f, descargar){
  const url = RoadmapSync.urlPublica(f.path);
  const a=document.createElement('a'); a.href=url;
  if(descargar) a.download=f.n; else { a.target='_blank'; a.rel='noopener'; }
  a.click();
}
function pintarThumbs(t, cont){
  cont.innerHTML='';
  (t.files||[]).forEach((f,i)=>{
    const esImg=/^image\//.test(f.t);
    const box=document.createElement('div');
    box.className='th'+(esImg?'':' doc');
    const url = RoadmapSync.urlPublica(f.path);
    if(esImg){
      const im=document.createElement('img');
      im.src=url; im.alt=f.n; im.title='Abrir '+f.n;
      im.onclick=()=>abrirArchivo(f,false);
      box.appendChild(im);
    }else{
      const ic=document.createElement('div'); ic.className='ico'; ic.textContent='📄';
      box.appendChild(ic);
      box.title='Descargar '+f.n;
      box.onclick=e=>{ if(!e.target.closest('.x')) abrirArchivo(f,true); };
    }
    const nm=document.createElement('div'); nm.className='nom'; nm.textContent=f.n;
    box.appendChild(nm);
    const pz=document.createElement('div'); pz.className='kb'; pz.textContent=kb(f.size||0);
    box.appendChild(pz);
    const x=document.createElement('button');
    x.className='x'; x.type='button'; x.textContent='✕';
    x.title='Quitar este archivo'; x.setAttribute('aria-label','Quitar '+f.n);
    x.onclick=async ev=>{
      ev.stopPropagation();
      const [quitado]=t.files.splice(i,1);
      pintarThumbs(t,cont);
      try{ await RoadmapSync.borrarArchivo(quitado.path); }catch(e){}
      await persistirTarea(t);
    };
    box.appendChild(x);
    cont.appendChild(box);
  });
}
```

- [ ] **Step 5: Reemplazar `guardar()` por persistencia puntual en cada handler de `pintarFila`**

En los handlers de `.seg button` (resp) y `select.est` (estado) (líneas ~1254-1268 actuales):

```js
row.querySelectorAll('.seg button').forEach(b=>{
  b.onclick=ev=>{
    ev.stopPropagation();
    t.resp=(t.resp===b.dataset.r)?'':b.dataset.r;
    row.dataset.resp=t.resp;
    row.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.r===t.resp));
    persistirTarea(t); cancha();
    if(filtros.resp!=='todas') render();
  };
});
row.querySelector('.est').onchange=e=>{
  t.estado=e.target.value; row.dataset.estado=t.estado;
  persistirTarea(t); cancha(); actualizarPills();
  if(filtros.ocultarHechas) render();
};
```

En el handler de `[data-k]` (inputs de texto) (líneas ~1269-1280 actuales):

```js
row.querySelectorAll('[data-k]').forEach(el=>{
  el.oninput=()=>{
    t[el.dataset.k]=el.value;
    if(el.tagName==='TEXTAREA') autosize(el);
    if(el.dataset.k==='tarea'){
      const ttl=row.querySelector('.r-t');
      ttl.textContent=el.value||'Tarea sin título — ábrela y ponle nombre';
      ttl.classList.toggle('vacio', !el.value);
    }
    guardarDebounced(t, persistirTarea);
  };
});
```

En `[data-mover]` y `.del` (líneas ~1303-1308 actuales):

```js
row.querySelector('[data-mover]').onchange=e=>{
  t.sec=e.target.value;
  const delSec=estado.tareas.filter(x=>x.sec===t.sec && x.id!==t.id);
  const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
  t.orden=RoadmapSync.calcularOrden(ultimo, null);
  persistirTarea(t); render();
};
row.querySelector('.del').onclick=async ()=>{
  if(!confirm('Se borra «'+(t.tarea||t.id)+'». ¿Seguir?')) return;
  estado.tareas=estado.tareas.filter(x=>x.id!==t.id);
  abiertas.delete(t.id); render();
  for(const f of (t.files||[])){ try{ await RoadmapSync.borrarArchivo(f.path); }catch(e){} }
  await RoadmapSync.borrarTarea(t.id);
};
```

- [ ] **Step 6: Reemplazar `moverTarea`, `moverTareaAlFinal`, `moverBloque`, `moverBloquePaso` (líneas ~1117-1148 actuales)**

```js
function moverTarea(idA, idObj, despues){
  const a=estado.tareas;
  const i=a.findIndex(t=>t.id===idA); if(i<0||idA===idObj) return;
  const [t]=a.splice(i,1);
  const j=a.findIndex(x=>x.id===idObj);
  if(j<0){ a.splice(i,0,t); return; }
  t.sec=a[j].sec;
  const destino=despues?j+1:j;
  a.splice(destino,0,t);
  const anterior=a[destino-1]?.orden ?? null;
  const siguiente=a[destino+1]?.orden ?? null;
  t.orden=RoadmapSync.calcularOrden(anterior, siguiente);
  persistirTarea(t); render();
}
function moverTareaAlFinal(idA, secId){
  const a=estado.tareas;
  const i=a.findIndex(t=>t.id===idA); if(i<0) return;
  const [t]=a.splice(i,1); t.sec=secId;
  let ultimo=-1; a.forEach((x,k)=>{ if(x.sec===secId) ultimo=k; });
  a.splice(ultimo+1,0,t);
  t.orden=RoadmapSync.calcularOrden(a[ultimo]?.orden ?? null, null);
  persistirTarea(t); render();
}
function moverBloque(idA, idObj, despues){
  const a=estado.secciones;
  const i=a.findIndex(x=>x.id===idA); if(i<0||idA===idObj) return;
  const [s]=a.splice(i,1);
  const j=a.findIndex(x=>x.id===idObj);
  if(j<0){ a.splice(i,0,s); return; }
  const destino=despues?j+1:j;
  a.splice(destino,0,s);
  const anterior=a[destino-1]?.orden ?? null;
  const siguiente=a[destino+1]?.orden ?? null;
  s.orden=RoadmapSync.calcularOrden(anterior, siguiente);
  persistirSeccion(s); render();
}
function moverBloquePaso(id, paso){
  const a=estado.secciones, i=a.findIndex(x=>x.id===id), j=i+paso;
  if(i<0||j<0||j>=a.length) return;
  [a[i],a[j]]=[a[j],a[i]];
  const s=a[j];
  const anterior=a[j-1]?.orden ?? null;
  const siguiente=a[j+1]?.orden ?? null;
  s.orden=RoadmapSync.calcularOrden(anterior, siguiente);
  persistirSeccion(s); render();
}
```

Estas cuatro funciones no llevan ningún guard de auth propio: la RLS de Task 4 ya exige sesión autenticada a nivel de base, y el modal de login (Step 10b) bloquea toda interacción con la página hasta que hay sesión — no hace falta repetir un chequeo en cada call-site de drag&drop.

- [ ] **Step 7: Reemplazar el input de nombre de sección (líneas ~1355-1357 actuales)**

```js
const inp=sec.querySelector('.sec-name');
inp.oninput=()=>{
  s.titulo=inp.value;
  guardarDebounced(s, persistirSeccion);
};
inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } };
```

- [ ] **Step 8: Reemplazar borrar bloque (líneas ~1398-1403 actuales)**

```js
sec.querySelector('[data-del]').onclick=async ()=>{
  cerrarMenus();
  if(suyas.length){ aviso('Ese bloque tiene '+suyas.length+' tareas. Muévelas o bórralas primero.'); return; }
  if(!confirm('Se borra el bloque «'+s.titulo+'». ¿Seguir?')) return;
  estado.secciones=estado.secciones.filter(x=>x.id!==s.id); render();
  await RoadmapSync.borrarSeccion(s.id);
};
```

- [ ] **Step 9: Reemplazar "nueva tarea" y "nuevo bloque" (líneas ~1421-1429 y ~1470-1476 actuales)**

```js
add.onclick=()=>{
  const id=nuevoId('T', estado.tareas.map(x=>x.id));
  const delSec=estado.tareas.filter(x=>x.sec===s.id);
  const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
  const nueva={id,sec:s.id,modulo:'',tarea:'',expl:'',resp:'',estado:'Pendiente',img:'',com:'',fecha:'',files:[],orden:RoadmapSync.calcularOrden(ultimo,null)};
  estado.tareas.push(nueva);
  abiertas.add(id); cerradas.delete(s.id); render();
  persistirTarea(nueva);
  const el=document.querySelector(`.row[data-id="${id}"] [data-k=tarea]`);
  if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
};
```

```js
bNuevoBloque.onclick=()=>{
  const id=nuevoId('s', estado.secciones.map(x=>x.id));
  const ultima=estado.secciones.length ? estado.secciones[estado.secciones.length-1].orden : null;
  const nueva={id,titulo:'',orden:RoadmapSync.calcularOrden(ultima,null)};
  estado.secciones.push(nueva);
  cerradas.delete(id); render();
  persistirSeccion(nueva);
  const el=document.querySelector(`.sec[data-id="${id}"] .sec-name`);
  if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
};
```

- [ ] **Step 10: Agregar el modal de login (HTML + CSS)**

Agregar este markup justo antes de `<div class="toast" id="toast" ...>` (cerca del final del `<body>`, línea ~311 actual):

```html
<div class="login-overlay" id="loginOverlay" hidden>
  <form class="login-modal" id="loginForm">
    <h2>Iniciar sesión</h2>
    <label class="lbl">Email</label>
    <input class="fld" type="email" id="loginEmail" required autocomplete="username">
    <label class="lbl">Contraseña</label>
    <input class="fld" type="password" id="loginPassword" required autocomplete="current-password">
    <div class="login-error" id="loginError" hidden></div>
    <button class="act pri" type="submit">Entrar</button>
  </form>
</div>
```

Y este CSS al final del bloque `<style>` existente (antes de `</style>`, línea ~253 actual):

```css
.login-overlay{position:fixed;inset:0;z-index:200;background:rgba(21,28,38,.55);
  display:flex;align-items:center;justify-content:center;padding:18px}
.login-overlay[hidden]{display:none}
.login-modal{background:var(--surface);border:1px solid var(--edge);border-radius:10px;
  padding:24px;width:100%;max-width:320px;box-shadow:0 20px 50px rgba(21,28,38,.3)}
.login-modal h2{margin:0 0 16px;font-size:16px}
.login-modal .lbl{margin:12px 0 5px}
.login-error{margin-top:10px;color:#9E3131;font-size:12.5px}
.login-error[hidden]{display:none}
.login-modal button{margin-top:16px;width:100%}
```

También agregar un enlace de "Cerrar sesión" en el header, al lado del enlace de Trello (línea ~261 actual, `<a class="trello" ...>Tablero de Trello</a>`):

```html
<a class="trello" href="https://trello.com/b/vlKCxRTS/propelia" target="_blank" rel="noopener">Tablero de Trello</a>
<button class="trello" id="bCerrarSesion" style="border:0;background:transparent;cursor:pointer;font:inherit">Cerrar sesión</button>
```

- [ ] **Step 11: Reemplazar el arranque y el `render()` final (línea 1545 actual) por el gate de sesión**

Quitar la línea suelta `render();` al final del script y reemplazar por:

```js
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

function mostrarModalLogin(){ loginOverlay.hidden = false; }
function ocultarModalLogin(){ loginOverlay.hidden = true; }

async function cargarYArrancar(){
  try{
    estado = await RoadmapSync.cargarEstado();
  }catch(e){
    aviso('No se pudo conectar con la base: '+e.message);
    estado = { secciones: [], tareas: [] };
  }
  render();
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.hidden = true;
  try{
    await RoadmapSync.iniciarSesion(loginEmail.value.trim(), loginPassword.value);
  }catch(err){
    loginError.textContent = 'Email o contraseña incorrectos.';
    loginError.hidden = false;
  }
});

bCerrarSesion.onclick = () => RoadmapSync.cerrarSesion();

(async function iniciar(){
  const activa = await RoadmapSync.sesionActiva();
  if(activa){ await cargarYArrancar(); } else { mostrarModalLogin(); }

  RoadmapSync.onCambioSesion(async sesionOk => {
    if(sesionOk){ ocultarModalLogin(); await cargarYArrancar(); }
    else { estado = { secciones: [], tareas: [] }; render(); mostrarModalLogin(); }
  });

  RoadmapSync.suscribir(refrescarDesdeSupabase);
})();
```

Nota: `onCambioSesion` va a disparar una vez más apenas se registra si ya había sesión activa (comportamiento estándar de `onAuthStateChange`) — eso pisa el `cargarYArrancar()` inicial con uno idéntico, es un fetch de más pero inofensivo, no un bug. Al cerrar sesión (`bCerrarSesion`), `estado` se vacía y se vuelve a mostrar el modal — no queda data vieja visible detrás del overlay.

- [ ] **Step 12: Verificación manual (dos pestañas + login)**

Abrir `index.html` sin sesión iniciada: confirmar que el modal de login tapa toda la app. Loguearse con una cuenta real de Loro o Toni (las mismas que usan en `propelia-frontend`) y confirmar que el modal desaparece y carga la data. Abrir una segunda pestaña (misma sesión de navegador): confirmar que NO pide login de nuevo. En la pestaña A: crear una tarea, cambiar su estado, escribir en la explicación, subir un archivo. Confirmar en la pestaña B que cada cambio aparece solo, sin recargar. Confirmar que si la pestaña B tiene un textarea enfocado mientras llega un cambio remoto, no pierde el foco (se actualiza recién al salir del campo). Probar "Cerrar sesión" y confirmar que vuelve a tapar la app con el modal.

- [ ] **Step 13: Commit**

```bash
git add index.html
git commit -m "feat: wire index.html to Supabase (drop localStorage, add realtime sync)"
```

---

### Task 7: Quitar import/reset y actualizar el texto de la sección de acciones

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Quitar el aviso de almacenamiento lleno (líneas ~292-294 actuales)**

Borrar por completo el `<div class="aviso" id="avisoAlmacen" hidden>...</div>` — ya no aplica, no hay límite de `localStorage`.

- [ ] **Step 2: Actualizar el texto y los botones de la sección "Compartir los cambios" (líneas ~295-307 actuales)**

Reemplazar:

```html
<h2>Compartir los cambios</h2>
<p>Lo que tocas aquí se guarda en este navegador, no dentro del archivo. Para que tu hermano vea
   tus cambios, pulsa <strong>Guardar archivo</strong> y mándale el HTML que se descarga: al abrirlo
   tendrá tus tareas, bloques y comentarios ya puestos. Cuando él te devuelva el suyo, usa
   <strong>Cargar cambios de un archivo</strong>.</p>
<div class="btns">
  <button class="act pri" id="bHtml">Guardar archivo</button>
  <button class="act" id="bAbrir">Cargar cambios de un archivo</button>
  <button class="act" id="bCsv">Exportar a CSV</button>
  <button class="act" id="bReset">Descartar mis cambios</button>
  <input type="file" id="fIn" accept=".html,.htm,.json" hidden>
  <span class="peso" id="peso" style="align-self:center"></span>
</div>
```

por:

```html
<h2>Respaldo</h2>
<p>Los cambios ya se sincronizan solos entre vos y Toni. Estos botones son solo para guardar
   una copia de respaldo puntual, no hace falta usarlos para compartir nada.</p>
<div class="btns">
  <button class="act pri" id="bHtml">Guardar archivo</button>
  <button class="act" id="bCsv">Exportar a CSV</button>
</div>
```

- [ ] **Step 3: Quitar los handlers de `bReset`, `bAbrir` y `fIn` (líneas ~1508-1530 actuales)**

Borrar por completo:

```js
bReset.onclick=()=>{
  if(!confirm('Vuelve al contenido original y descarta todo lo que hayas cambiado o creado en este navegador. ¿Seguir?')) return;
  try{ localStorage.removeItem(KEY); }catch(e){}
  estado=clon(RAW); estado.tareas.forEach(t=>{ if(!Array.isArray(t.files)) t.files=[]; });
  abiertas.clear(); cerradas.clear(); guardar(); render();
  aviso('Cambios descartados.');
};
bAbrir.onclick=()=>fIn.click();
fIn.onchange=ev=>{
  const f=ev.target.files[0]; if(!f) return;
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const m=fr.result.match(/<script id="datos"[^>]*>([\s\S]*?)<\/script>/);
      const j=JSON.parse((m?m[1]:fr.result).replace(/<\\\//g,'</'));
      if(!j.secciones||!j.tareas) throw 0;
      estado=j; estado.tareas.forEach(t=>{ if(!Array.isArray(t.files)) t.files=[]; });
      abiertas.clear(); cerradas.clear(); guardar(); render();
      aviso('Cambios de '+f.name+' cargados.');
    }catch(e){ aviso('Ese archivo no tiene datos que pueda leer.'); }
  };
  fr.readAsText(f); ev.target.value='';
};
```

`bHtml.onclick` y `bCsv.onclick` quedan igual — ya leen solo de `estado`, no de `localStorage`.

- [ ] **Step 4: Verificación manual**

Abrir `index.html`, confirmar que solo aparecen los botones "Guardar archivo" y "Exportar a CSV", que ambos siguen funcionando (descargan el archivo correspondiente), y que no queda ninguna referencia rota a `bReset`/`bAbrir`/`fIn`/`avisoAlmacen`/`peso` en la consola del navegador.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: remove manual import/reset now that Supabase is the source of truth"
```

---

### Task 8: Verificación end-to-end

**Files:** ninguno (checklist manual)

- [ ] **Step 1: Sync en tiempo real entre dos pestañas**

Abrir `index.html` en dos pestañas. Crear, editar, mover y borrar tareas/bloques en una; confirmar que se reflejan solos en la otra.

- [ ] **Step 2: Persistencia real (no local)**

Con datos cargados, borrar `localStorage` y las cookies del sitio (o abrir en una ventana de incógnito) y recargar. Confirmar que los datos siguen ahí — vienen de Supabase, no del navegador.

- [ ] **Step 3: Adjuntos**

Subir una imagen y un PDF desde una pestaña; confirmar que ambos son visibles y descargables desde la otra pestaña.

- [ ] **Step 4: Orden persistente**

Arrastrar una tarea a otra posición y una sección a otro lugar; recargar la página; confirmar que el orden se mantiene.

- [ ] **Step 5: Login**

Abrir `index.html` en una ventana de incógnito (sin sesión): confirmar que el modal de login tapa toda la app y que no se puede interactuar con nada detrás. Probar un email/password incorrecto y confirmar que muestra el error sin dejar pasar. Loguearse con una cuenta real y confirmar que carga. Probar "Cerrar sesión" y confirmar que vuelve a tapar la app.

- [ ] **Step 6: Exportar sigue funcionando**

Probar "Guardar archivo" y "Exportar a CSV"; confirmar que ambos archivos se descargan con los datos actuales.
