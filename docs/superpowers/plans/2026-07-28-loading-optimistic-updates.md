# Estados de carga + optimistic update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar feedback visual consistente (indicador de guardado global + feedback local) a cada acción que persiste contra Supabase en `index.html`, con revert automático si falla tras 2 reintentos, más un skeleton para la carga inicial.

**Architecture:** Un helper genérico `conEstadoDeCarga(accion, {revertir, intentos, onEstado})` centraliza reintento+revert+aviso; cada call site define su propio `onEstado` (feedback local, global, o ambos combinados) y su propio `revertir` (cómo deshacer el cambio óptimo).

**Tech Stack:** Vanilla JS (sin build, sin framework), un solo `index.html`. Sin test runner ni framework de testing en el repo.

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-07-28-loading-optimistic-updates-design.md` — cualquier duda sobre el "por qué" de una decisión, está ahí.
- **Sin infraestructura de test automatizado en este repo** (no hay `package.json`, ni Jest/Playwright/etc.) y sin acceso a browser en el entorno de ejecución de estas tareas. Cada tarea reemplaza "correr el test" por: (a) revisar visualmente el diff, y (b) agregar el caso correspondiente al checklist manual (`docs/verification-checklist-supabase-persistence.md`), que el usuario corre en un navegador real. La Tarea 12 consolida todos los casos nuevos en ese checklist.
- Los números de línea de `index.html` referenciados son los del archivo ANTES de empezar la Tarea 1. Cada tarea desplaza los números de las siguientes — buscar por el snippet de código citado, no confiar ciegamente en el número.
- Todo el código nuevo va dentro de `<script>` en `index.html` (línea 332 en adelante), sin módulos ES ni imports — mismo estilo que el resto del archivo (funciones planas en scope global).
- Reusar `aviso(txt)` (index.html:912) para todo mensaje de error — no inventar un mecanismo de notificación nuevo.
- No tocar `supabase-sync.js` — todos los cambios son de UI/orquestación en `index.html`.

---

### Task 1: Helper central `conEstadoDeCarga` + `onEstadoBoton` + `combinar`

**Files:**
- Modify: `index.html` (agregar después de la línea 341, justo antes de `async function persistirTarea`)

**Interfaces:**
- Produces: `conEstadoDeCarga(accion: () => Promise<void>, opts?: {revertir?: () => void, intentos?: number, onEstado?: (estado: 'cargando'|'ok'|'error') => void}) => Promise<boolean>`
- Produces: `onEstadoBoton(btn: HTMLButtonElement, textoCargando: string) => (estado: string) => void`
- Produces: `combinar(...fns: Array<(estado:string)=>void>) => (estado:string) => void`

- [ ] **Step 1: Agregar las tres funciones**

En `index.html`, inmediatamente antes de `async function persistirTarea(t, intentos = 2) {` (línea 343), insertar:

```js
async function conEstadoDeCarga(accion, { revertir, intentos = 2, onEstado } = {}) {
  onEstado?.('cargando');
  for (let intento = 0; intento <= intentos; intento++) {
    try { await accion(); onEstado?.('ok'); return true; }
    catch (e) {
      if (intento === intentos) {
        onEstado?.('error');
        revertir?.();
        aviso('No se pudo completar la acción. Revisa tu conexión.');
        return false;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
function onEstadoBoton(btn, textoCargando) {
  const original = btn.textContent;
  return estado => {
    btn.disabled = estado === 'cargando';
    btn.textContent = estado === 'cargando' ? textoCargando : original;
  };
}
const combinar = (...fns) => estado => fns.forEach(fn => fn(estado));
```

- [ ] **Step 2: Verificación manual en consola del navegador**

Abrir `index.html` en el navegador (servido con `python3 -m http.server 8080`), loguearse, abrir DevTools → Console, y pegar:

```js
let btn = document.createElement('button'); btn.textContent = 'Borrar';
conEstadoDeCarga(() => new Promise((_, rej) => setTimeout(rej, 100)), {
  intentos: 1, onEstado: onEstadoBoton(btn, 'Borrando...')
}).then(r => console.log('resultado:', r, 'texto final:', btn.textContent));
```

Esperado: durante ~1.7s (100ms + 1500ms de espera entre reintentos + 100ms) `btn.textContent` es `'Borrando...'` y `btn.disabled` es `true`; al final imprime `resultado: false texto final: Borrar` y aparece el toast "No se pudo completar la acción. Revisa tu conexión." en la esquina de la pantalla.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add conEstadoDeCarga helper for retry+revert+loading state"
```

---

### Task 2: Indicador global de guardado en `.bar`

**Files:**
- Modify: `index.html:296` (markup de `.bar`)
- Modify: `index.html` (CSS, cerca de línea 44, junto a la regla `.bar`)
- Modify: `index.html` (JS, después de las funciones de la Tarea 1)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `onEstadoGlobal(estado: 'cargando'|'ok'|'error') => void` — usado por todas las tareas siguientes.

- [ ] **Step 1: Agregar el `<span>` al markup de `.bar`**

En `index.html:296`, reemplazar:

```html
  <span class="count" id="visibles"></span>
</div></div>
```

por:

```html
  <span class="count" id="visibles"></span>
  <span class="estado-guardado" id="estadoGuardado" aria-live="polite"></span>
</div></div>
```

- [ ] **Step 2: Agregar el CSS**

Cerca de la línea 44 (regla `.bar{...}`), agregar:

```css
.estado-guardado{font:600 11px var(--mono);color:var(--faint);white-space:nowrap}
.estado-guardado.cargando{color:var(--ink-2)}
.estado-guardado.ok{color:#2E7D32}
```

- [ ] **Step 3: Agregar `onEstadoGlobal` con contador**

Después de las funciones de la Tarea 1 (`combinar`), agregar:

```js
let enVuelo = 0;
const elGuardado = document.getElementById('estadoGuardado');
function onEstadoGlobal(estado) {
  if (estado === 'cargando') {
    enVuelo++;
    elGuardado.className = 'estado-guardado cargando';
    elGuardado.textContent = '● guardando';
    return;
  }
  enVuelo = Math.max(0, enVuelo - 1);
  if (enVuelo > 0) return;
  elGuardado.className = 'estado-guardado' + (estado === 'ok' ? ' ok' : '');
  elGuardado.textContent = estado === 'ok' ? '✓ guardado' : '';
  if (estado === 'ok') setTimeout(() => {
    if (enVuelo === 0) { elGuardado.textContent = ''; elGuardado.className = 'estado-guardado'; }
  }, 1500);
}
```

- [ ] **Step 4: Verificación manual**

En la consola del navegador (logueado), pegar `onEstadoGlobal('cargando')` → al lado del buscador debe aparecer `● guardando` en gris. Pegar `onEstadoGlobal('ok')` → cambia a `✓ guardado` en verde y a los 1.5s desaparece. Scrollear la lista de tareas hacia abajo mientras se ve el texto — debe seguir visible (la franja de filtros es sticky).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add global save indicator in filter bar"
```

---

### Task 3: Skeleton de carga inicial

**Files:**
- Modify: `index.html:300` (`<div id="lista"></div>`)
- Modify: `index.html` (CSS)

**Interfaces:**
- Consumes: nada.
- Produces: nada que otras tareas consuman directamente — `render()` (ya existente, línea 864) lo pisa solo al hacer `lista.innerHTML=''`.

- [ ] **Step 1: Reemplazar el markup de `#lista`**

En `index.html:300`, reemplazar:

```html
  <div id="lista"></div>
```

por:

```html
  <div id="lista"><div class="esqueleto" aria-hidden="true">
    <div class="esq-bloque">
      <div class="esq-cab shimmer"></div>
      <div class="esq-fila shimmer"></div>
      <div class="esq-fila shimmer"></div>
      <div class="esq-fila shimmer" style="width:70%"></div>
    </div>
    <div class="esq-bloque">
      <div class="esq-cab shimmer"></div>
      <div class="esq-fila shimmer"></div>
      <div class="esq-fila shimmer" style="width:60%"></div>
    </div>
  </div></div>
```

- [ ] **Step 2: Agregar el CSS del shimmer**

Agregar junto al resto de las reglas de `.th`/`.aviso` (cerca de línea 198):

```css
.esq-bloque{border:1px solid var(--edge);border-radius:8px;padding:14px;
  display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.esq-cab{height:20px;width:40%;border-radius:4px}
.esq-fila{height:15px;border-radius:4px}
.shimmer{background:linear-gradient(90deg,var(--sunken) 25%,var(--edge) 37%,var(--sunken) 63%);
  background-size:400% 100%;animation:shimmer 1.4s ease-in-out infinite}
@keyframes shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
```

- [ ] **Step 3: Verificación manual**

En DevTools → Network, activar throttling "Slow 3G". Recargar `index.html` ya logueado. Esperado: se ve el skeleton con shimmer animado durante la carga, y se reemplaza por el tablero real apenas resuelve `cargarEstado()`. Sacar el throttling después.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add shimmer skeleton for initial board load"
```

---

### Task 4: Migrar `persistirTarea`/`persistirSeccion` al helper (indicador global automático)

**Files:**
- Modify: `index.html:343-356` (`persistirTarea`, `persistirSeccion`)

**Interfaces:**
- Consumes: `conEstadoDeCarga` (Task 1), `onEstadoGlobal` (Task 2).
- Produces: `persistirTarea(t, opts?: {onEstado?, revertir?, intentos?}) => Promise<boolean>`, `persistirSeccion(s, opts?) => Promise<boolean>` — firma retrocompatible (opts es opcional), usada por todas las tareas siguientes.

- [ ] **Step 1: Reemplazar ambas funciones**

Reemplazar (índice.html:343-356):

```js
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
```

por:

```js
async function persistirTarea(t, { onEstado = onEstadoGlobal, revertir, intentos = 2 } = {}) {
  return conEstadoDeCarga(() => RoadmapSync.guardarTarea(t), { onEstado, revertir, intentos });
}
async function persistirSeccion(s, { onEstado = onEstadoGlobal, revertir, intentos = 2 } = {}) {
  return conEstadoDeCarga(() => RoadmapSync.guardarSeccion(s), { onEstado, revertir, intentos });
}
```

Nota: como `onEstado` tiene default `onEstadoGlobal`, **todos los ~15 call sites existentes que llaman `persistirTarea(t)`/`persistirSeccion(s)` sin opciones siguen andando sin tocarlos**, y automáticamente prenden el indicador global. El mensaje de error genérico de `conEstadoDeCarga` ("No se pudo completar la acción...") reemplaza a los mensajes específicos anteriores ("No se pudo guardar «...»") — es una pérdida de especificidad aceptada a cambio de centralizar la lógica; si se quiere mantener el texto específico, se puede pasar `onEstado` custom más adelante, pero no es parte de este plan.

- [ ] **Step 2: Verificación manual**

Con la app abierta y logueada, abrir una tarea, cambiar el campo "Explicación", esperar ~1s. Esperado: aparece `● guardando` en la franja de filtros y después `✓ guardado`. Repetir cortando la red (DevTools → Network → Offline) antes de escribir: tras ~3.5s debe aparecer el toast de error.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "refactor: migrate persistirTarea/persistirSeccion to conEstadoDeCarga"
```

---

### Task 5: Revert en campos con debounce y en selects/botones inmediatos

**Files:**
- Modify: `index.html:338-341` (`guardarDebounced`)
- Modify: `index.html:656-682` (segmento de responsable, select de estado, campos `[data-k]`)
- Modify: `index.html:705-711` (`[data-mover]`)
- Modify: `index.html:771-775` (nombre del bloque, `sec-name`)

**Interfaces:**
- Consumes: `persistirTarea`/`persistirSeccion` con opts (Task 4), `onEstadoGlobal` (Task 2).
- Produces: `valoresAntesDelCambio: Map<id, objetoOriginal>` — snapshot para revert, consumido solo dentro de esta tarea.

- [ ] **Step 1: Cambiar `guardarDebounced` para aceptar una clave + un thunk**

Reemplazar (index.html:338-341):

```js
const pendientesGuardado = new Map();
function guardarDebounced(entidad, guardarFn) {
  clearTimeout(pendientesGuardado.get(entidad.id));
  pendientesGuardado.set(entidad.id, setTimeout(() => guardarFn(entidad), 500));
}
```

por:

```js
const pendientesGuardado = new Map();
function guardarDebounced(clave, fn) {
  clearTimeout(pendientesGuardado.get(clave));
  pendientesGuardado.set(clave, setTimeout(fn, 500));
}
const valoresAntesDelCambio = new Map();
```

- [ ] **Step 2: Actualizar el bloque `[data-k]` (campos con debounce) en `pintarFila`**

Reemplazar (index.html:671-682):

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

por:

```js
  row.querySelectorAll('[data-k]').forEach(el=>{
    el.oninput=()=>{
      if(!valoresAntesDelCambio.has(t.id)) valoresAntesDelCambio.set(t.id, {...t});
      t[el.dataset.k]=el.value;
      if(el.tagName==='TEXTAREA') autosize(el);
      if(el.dataset.k==='tarea'){
        const ttl=row.querySelector('.r-t');
        ttl.textContent=el.value||'Tarea sin título — ábrela y ponle nombre';
        ttl.classList.toggle('vacio', !el.value);
      }
      guardarDebounced(t.id, () => persistirTarea(t, {
        revertir: () => {
          const previo = valoresAntesDelCambio.get(t.id);
          if (previo) Object.assign(t, previo);
          render();
        },
      }).then(ok => { if (ok) valoresAntesDelCambio.delete(t.id); }));
    };
  });
```

- [ ] **Step 3: Actualizar el nombre del bloque (`sec-name`) en `pintarBloque`**

Reemplazar (index.html:771-775):

```js
  const inp=sec.querySelector('.sec-name');
  inp.oninput=()=>{
    s.titulo=inp.value;
    guardarDebounced(s, persistirSeccion);
  };
```

por:

```js
  const inp=sec.querySelector('.sec-name');
  inp.oninput=()=>{
    if(!valoresAntesDelCambio.has(s.id)) valoresAntesDelCambio.set(s.id, {...s});
    s.titulo=inp.value;
    guardarDebounced(s.id, () => persistirSeccion(s, {
      revertir: () => {
        const previo = valoresAntesDelCambio.get(s.id);
        if (previo) Object.assign(s, previo);
        render();
      },
    }).then(ok => { if (ok) valoresAntesDelCambio.delete(s.id); }));
  };
```

- [ ] **Step 4: Revert en el toggle de responsable (`.seg button`)**

Reemplazar (index.html:656-665):

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
```

por:

```js
  row.querySelectorAll('.seg button').forEach(b=>{
    b.onclick=ev=>{
      ev.stopPropagation();
      const respAnterior=t.resp;
      t.resp=(t.resp===b.dataset.r)?'':b.dataset.r;
      row.dataset.resp=t.resp;
      row.querySelectorAll('.seg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.r===t.resp));
      persistirTarea(t, { revertir: () => { t.resp=respAnterior; render(); cancha(); } });
      cancha();
      if(filtros.resp!=='todas') render();
    };
  });
```

- [ ] **Step 5: Revert en el select de estado (`.est`)**

Reemplazar (index.html:666-670):

```js
  row.querySelector('.est').onchange=e=>{
    t.estado=e.target.value; row.dataset.estado=t.estado;
    persistirTarea(t); cancha(); actualizarPills();
    if(filtros.ocultarHechas) render();
  };
```

por:

```js
  row.querySelector('.est').onchange=e=>{
    const estadoAnterior=t.estado;
    t.estado=e.target.value; row.dataset.estado=t.estado;
    persistirTarea(t, { revertir: () => { t.estado=estadoAnterior; render(); cancha(); actualizarPills(); } });
    cancha(); actualizarPills();
    if(filtros.ocultarHechas) render();
  };
```

- [ ] **Step 6: Revert en el select de mover de bloque (`[data-mover]`)**

Reemplazar (index.html:705-711):

```js
  row.querySelector('[data-mover]').onchange=e=>{
    t.sec=e.target.value;
    const delSec=estado.tareas.filter(x=>x.sec===t.sec && x.id!==t.id);
    const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
    t.orden=RoadmapSync.calcularOrden(ultimo, null);
    persistirTarea(t); render();
  };
```

por:

```js
  row.querySelector('[data-mover]').onchange=e=>{
    const secAnterior=t.sec, ordenAnterior=t.orden;
    t.sec=e.target.value;
    const delSec=estado.tareas.filter(x=>x.sec===t.sec && x.id!==t.id);
    const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
    t.orden=RoadmapSync.calcularOrden(ultimo, null);
    persistirTarea(t, { revertir: () => { t.sec=secAnterior; t.orden=ordenAnterior; render(); } });
    render();
  };
```

- [ ] **Step 7: Verificación manual**

Cortar la red (DevTools → Network → Offline). Cambiar el estado de una tarea a "Hecho" → esperar ~3.5s → debe volver solo a "Pendiente" (o el valor previo) y aparecer el toast de error. Repetir escribiendo en "Explicación": el texto debe volver al valor de antes de empezar a escribir. Reconectar la red y confirmar que en condiciones normales todo guarda bien (aparece `✓ guardado`, no se revierte nada).

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add optimistic-update revert for debounced fields and selects"
```

---

### Task 6: Revert al agregar tarea/bloque

**Files:**
- Modify: `index.html:849-858` (botón "+ Nueva tarea en este bloque")
- Modify: `index.html:900-908` (botón "+ Nuevo bloque")

**Interfaces:**
- Consumes: `persistirTarea`/`persistirSeccion` con opts (Task 4).

- [ ] **Step 1: Revert al agregar tarea**

Reemplazar (index.html:849-858):

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

por:

```js
  add.onclick=()=>{
    const id=nuevoId('T', estado.tareas.map(x=>x.id));
    const delSec=estado.tareas.filter(x=>x.sec===s.id);
    const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
    const nueva={id,sec:s.id,modulo:'',tarea:'',expl:'',resp:'',estado:'Pendiente',img:'',com:'',fecha:'',files:[],orden:RoadmapSync.calcularOrden(ultimo,null)};
    estado.tareas.push(nueva);
    abiertas.add(id); cerradas.delete(s.id); render();
    persistirTarea(nueva, {
      revertir: () => { estado.tareas=estado.tareas.filter(x=>x.id!==id); abiertas.delete(id); render(); },
    });
    const el=document.querySelector(`.row[data-id="${id}"] [data-k=tarea]`);
    if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
  };
```

- [ ] **Step 2: Revert al agregar bloque**

Reemplazar (index.html:900-908):

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
```

por:

```js
bNuevoBloque.onclick=()=>{
  const id=nuevoId('s', estado.secciones.map(x=>x.id));
  const ultima=estado.secciones.length ? estado.secciones[estado.secciones.length-1].orden : null;
  const nueva={id,titulo:'',orden:RoadmapSync.calcularOrden(ultima,null)};
  estado.secciones.push(nueva);
  cerradas.delete(id); render();
  persistirSeccion(nueva, {
    revertir: () => { estado.secciones=estado.secciones.filter(x=>x.id!==id); render(); },
  });
  const el=document.querySelector(`.sec[data-id="${id}"] .sec-name`);
  if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
```

(la línea que sigue, `};`, no cambia — se deja igual).

- [ ] **Step 3: Verificación manual**

Cortar la red. Click en "+ Nueva tarea en este bloque" → esperar ~3.5s → la tarea nueva debe desaparecer y aparecer el toast de error. Repetir con "+ Nuevo bloque". Reconectar la red y confirmar que en condiciones normales las tareas/bloques nuevos quedan y persisten bien tras recargar.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: revert new task/block on save failure"
```

---

### Task 7: Migrar borrar tarea/borrar bloque al helper (2 reintentos + feedback local)

**Files:**
- Modify: `index.html:712-724` (`.del onclick`)
- Modify: `index.html:817-829` (`[data-del] onclick`)

**Interfaces:**
- Consumes: `conEstadoDeCarga`, `onEstadoBoton`, `combinar` (Task 1), `onEstadoGlobal` (Task 2).

- [ ] **Step 1: Migrar borrar tarea**

Reemplazar (index.html:712-724):

```js
  row.querySelector('.del').onclick=async ()=>{
    if(!confirm('Se borra «'+(t.tarea||t.id)+'». ¿Seguir?')) return;
    const idx=estado.tareas.findIndex(x=>x.id===t.id);
    estado.tareas=estado.tareas.filter(x=>x.id!==t.id);
    abiertas.delete(t.id); render();
    try{
      for(const f of (t.files||[])){ try{ await RoadmapSync.borrarArchivo(f.path); }catch(e){} }
      await RoadmapSync.borrarTarea(t.id);
    }catch(e){
      estado.tareas.splice(idx,0,t); render();
      aviso('No se pudo borrar «'+(t.tarea||t.id)+'». Revisa tu conexión.');
    }
  };
```

por:

```js
  const btnDel=row.querySelector('.del');
  btnDel.onclick=async ()=>{
    if(!confirm('Se borra «'+(t.tarea||t.id)+'». ¿Seguir?')) return;
    const idx=estado.tareas.findIndex(x=>x.id===t.id);
    estado.tareas=estado.tareas.filter(x=>x.id!==t.id);
    abiertas.delete(t.id); render();
    await conEstadoDeCarga(async () => {
      for(const f of (t.files||[])){ try{ await RoadmapSync.borrarArchivo(f.path); }catch(e){} }
      await RoadmapSync.borrarTarea(t.id);
    }, {
      onEstado: combinar(onEstadoBoton(btnDel, 'Borrando...'), onEstadoGlobal),
      revertir: () => { estado.tareas.splice(idx,0,t); render(); },
    });
  };
```

Nota: `btnDel` se resuelve antes del `onclick` porque una vez que `render()` reconstruye la fila el botón original ya no está en el DOM — igual que antes, el feedback "Borrando..." es efímero (la fila se saca del árbol al toque), pero queda documentado por consistencia con el resto de los call sites; el feedback visible real sigue siendo la desaparición inmediata de la fila.

- [ ] **Step 2: Migrar borrar bloque**

Reemplazar (index.html:817-829):

```js
  sec.querySelector('[data-del]').onclick=async ()=>{
    cerrarMenus();
    if(suyas.length){ aviso('Ese bloque tiene '+suyas.length+' tareas. Muévelas o bórralas primero.'); return; }
    if(!confirm('Se borra el bloque «'+s.titulo+'». ¿Seguir?')) return;
    const idx=estado.secciones.findIndex(x=>x.id===s.id);
    estado.secciones=estado.secciones.filter(x=>x.id!==s.id); render();
    try{
      await RoadmapSync.borrarSeccion(s.id);
    }catch(e){
      estado.secciones.splice(idx,0,s); render();
      aviso('No se pudo borrar el bloque «'+(s.titulo||s.id)+'». Revisa tu conexión.');
    }
  };
```

por:

```js
  const btnDelBloque=sec.querySelector('[data-del]');
  btnDelBloque.onclick=async ()=>{
    cerrarMenus();
    if(suyas.length){ aviso('Ese bloque tiene '+suyas.length+' tareas. Muévelas o bórralas primero.'); return; }
    if(!confirm('Se borra el bloque «'+s.titulo+'». ¿Seguir?')) return;
    const idx=estado.secciones.findIndex(x=>x.id===s.id);
    estado.secciones=estado.secciones.filter(x=>x.id!==s.id); render();
    await conEstadoDeCarga(() => RoadmapSync.borrarSeccion(s.id), {
      onEstado: combinar(onEstadoBoton(btnDelBloque, 'Borrando...'), onEstadoGlobal),
      revertir: () => { estado.secciones.splice(idx,0,s); render(); },
    });
  };
```

(nota igual que en Step 1: el botón desaparece del menú al re-renderizar, el feedback local es efímero pero queda por consistencia).

- [ ] **Step 3: Verificación manual**

Cortar la red. Borrar una tarea (confirmando el diálogo) → esperar ~3.5s → la tarea debe reaparecer en su posición original y mostrarse el toast de error. Repetir con un bloque vacío. Reconectar y confirmar que en condiciones normales el borrado persiste tras recargar.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "refactor: migrate task/block delete to conEstadoDeCarga"
```

---

### Task 8: Indicador + revert al subir adjunto

**Files:**
- Modify: `index.html:390-409` (`adjuntar`)

**Interfaces:**
- Consumes: `persistirTarea` con opts (Task 4), `onEstadoGlobal` (Task 2).

- [ ] **Step 1: Reemplazar `adjuntar`**

Reemplazar (index.html:390-409):

```js
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
```

por:

```js
async function adjuntar(t, files, alTerminar){
  let n=0, saltados=[], ahorro=0, subidos=[];
  onEstadoGlobal('cargando');
  for(const f of files){
    const esImg=/^image\//.test(f.type);
    if(!esImg && f.size>MAX_ARCHIVO){ saltados.push(f.name+' ('+kb(f.size)+')'); continue; }
    const blob = esImg ? await comprimirImagen(f) : f;
    if(blob.size>MAX_ARCHIVO){ saltados.push((f.name||'captura')+' ('+kb(blob.size)+' ya comprimida)'); continue; }
    if(esImg && f.size>blob.size) ahorro += f.size-blob.size;
    try{
      const nombre = f.name || ('captura-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.webp');
      const archivo = await RoadmapSync.subirArchivo(t.id, blob, nombre);
      t.files.push(archivo); subidos.push(archivo);
      n++;
    }catch(e){ saltados.push((f.name||'captura')+' (error al subir)'); }
  }
  if(n){
    await persistirTarea(t, {
      onEstado: estado => { if (estado !== 'cargando') onEstadoGlobal(estado); },
      revertir: () => {
        subidos.forEach(a => {
          const i=t.files.indexOf(a); if(i>-1) t.files.splice(i,1);
          RoadmapSync.borrarArchivo(a.path).catch(()=>{});
        });
        alTerminar();
      },
    });
  } else {
    onEstadoGlobal('ok');
  }
  alTerminar();
  if(saltados.length) aviso('No pude adjuntar: '+saltados.join(', ')+'. Súbelo a Drive y pega el enlace.');
  else if(n) aviso((n===1?'1 archivo adjuntado':n+' archivos adjuntados')+(ahorro>512000?' · '+kb(ahorro)+' ahorrados al comprimir':''));
```

Nota sobre el `onEstado` custom en `persistirTarea`: ya llamamos `onEstadoGlobal('cargando')` a mano al principio de `adjuntar` (para cubrir el tiempo de compresión+subida, no solo el guardado en la tabla), así que le pasamos a `persistirTarea` un `onEstado` que ignora el segundo `'cargando'` (evitaría un `enVuelo++` sin su `--` correspondiente) y solo reenvía `'ok'`/`'error'` a `onEstadoGlobal`.

(la línea que sigue, `}`, cierra la función y no cambia).

- [ ] **Step 2: Verificación manual**

Con red normal: abrir una tarea, subir una imagen → debe verse `● guardando` mientras comprime/sube, `✓ guardado` al terminar, y la miniatura aparece. Cortar la red, subir un archivo → tras los reintentos debe verse el toast de error y la miniatura debe desaparecer (revert) — confirmar además en el dashboard de Supabase Storage (o recargando la página) que el archivo no quedó huérfano en el bucket `roadmap-adjuntos`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add loading indicator and revert to file upload"
```

---

### Task 9: Indicador + revert al borrar adjunto

**Files:**
- Modify: `index.html` (función `pintarThumbs`, el `x.onclick` con el confirm de doble-click)

**Interfaces:**
- Consumes: `persistirTarea` con opts (Task 4), `onEstadoGlobal` (Task 2).

- [ ] **Step 1: Reemplazar el `x.onclick` dentro de `pintarThumbs`**

Buscar el bloque (ya existente, con el confirm de doble-click):

```js
    let armarTimeout=null;
    x.onclick=async ev=>{
      ev.stopPropagation();
      if(!x.classList.contains('armar')){
        x.classList.add('armar');
        x.title='Click de nuevo para confirmar el borrado';
        armarTimeout=setTimeout(()=>{ x.classList.remove('armar'); x.title='Quitar este archivo'; }, 3000);
        return;
      }
      clearTimeout(armarTimeout);
      const [quitado]=t.files.splice(i,1);
      pintarThumbs(t,cont);
      try{ await RoadmapSync.borrarArchivo(quitado.path); }catch(e){}
      await persistirTarea(t);
    };
```

y reemplazarlo por:

```js
    let armarTimeout=null;
    x.onclick=async ev=>{
      ev.stopPropagation();
      if(!x.classList.contains('armar')){
        x.classList.add('armar');
        x.title='Click de nuevo para confirmar el borrado';
        armarTimeout=setTimeout(()=>{ x.classList.remove('armar'); x.title='Quitar este archivo'; }, 3000);
        return;
      }
      clearTimeout(armarTimeout);
      const idx=t.files.indexOf(f);
      const [quitado]=t.files.splice(idx,1);
      pintarThumbs(t,cont);
      await persistirTarea(t, {
        revertir: () => { t.files.splice(idx,0,quitado); pintarThumbs(t,cont); },
      });
      try{ await RoadmapSync.borrarArchivo(quitado.path); }catch(e){}
    };
```

Nota de diseño (se aparta del mapeo original de la spec, que sugería `combinar(onEstadoBoton(x,'⏳'), onEstadoGlobal)`): `pintarThumbs(t,cont)` vacía y reconstruye `cont` de inmediato tras el `splice`, así que el botón `x` original queda desmontado del DOM antes de que `persistirTarea` termine — poner feedback local en un botón que ya no existe no se ve. La miniatura desapareciendo al toque ya es el feedback local (más fuerte que un spinner en un botón invisible); se usa solo `onEstadoGlobal` (default de `persistirTarea`) para el feedback de "algo se está guardando".

- [ ] **Step 2: Verificación manual**

Con red normal: borrar un adjunto (doble-click) → la miniatura desaparece al toque, aparece `● guardando`/`✓ guardado` en la franja de filtros. Cortar la red, borrar un adjunto → tras los reintentos, la miniatura debe reaparecer (revert) y mostrarse el toast de error.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add loading indicator and revert to file delete"
```

---

### Task 10: Revert en drag&drop (tarea y bloque)

**Files:**
- Modify: `index.html:505-539` (`moverTarea`, `moverTareaAlFinal`, `moverBloque`)

**Interfaces:**
- Consumes: `persistirTarea`/`persistirSeccion` con opts (Task 4).

- [ ] **Step 1: Revert en `moverTarea`**

Reemplazar:

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
```

por:

```js
function moverTarea(idA, idObj, despues){
  const a=estado.tareas;
  const i=a.findIndex(t=>t.id===idA); if(i<0||idA===idObj) return;
  const [t]=a.splice(i,1);
  const j=a.findIndex(x=>x.id===idObj);
  if(j<0){ a.splice(i,0,t); return; }
  const secAnterior=t.sec, ordenAnterior=t.orden;
  t.sec=a[j].sec;
  const destino=despues?j+1:j;
  a.splice(destino,0,t);
  const anterior=a[destino-1]?.orden ?? null;
  const siguiente=a[destino+1]?.orden ?? null;
  t.orden=RoadmapSync.calcularOrden(anterior, siguiente);
  persistirTarea(t, { revertir: () => { t.sec=secAnterior; t.orden=ordenAnterior; render(); } });
  render();
}
```

- [ ] **Step 2: Revert en `moverTareaAlFinal`**

Reemplazar:

```js
function moverTareaAlFinal(idA, secId){
  const a=estado.tareas;
  const i=a.findIndex(t=>t.id===idA); if(i<0) return;
  const [t]=a.splice(i,1); t.sec=secId;
  let ultimo=-1; a.forEach((x,k)=>{ if(x.sec===secId) ultimo=k; });
  a.splice(ultimo+1,0,t);
  t.orden=RoadmapSync.calcularOrden(a[ultimo]?.orden ?? null, null);
  persistirTarea(t); render();
}
```

por:

```js
function moverTareaAlFinal(idA, secId){
  const a=estado.tareas;
  const i=a.findIndex(t=>t.id===idA); if(i<0) return;
  const [t]=a.splice(i,1);
  const secAnterior=t.sec, ordenAnterior=t.orden;
  t.sec=secId;
  let ultimo=-1; a.forEach((x,k)=>{ if(x.sec===secId) ultimo=k; });
  a.splice(ultimo+1,0,t);
  t.orden=RoadmapSync.calcularOrden(a[ultimo]?.orden ?? null, null);
  persistirTarea(t, { revertir: () => { t.sec=secAnterior; t.orden=ordenAnterior; render(); } });
  render();
}
```

- [ ] **Step 3: Revert en `moverBloque`**

Reemplazar:

```js
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
```

por:

```js
function moverBloque(idA, idObj, despues){
  const a=estado.secciones;
  const i=a.findIndex(x=>x.id===idA); if(i<0||idA===idObj) return;
  const [s]=a.splice(i,1);
  const j=a.findIndex(x=>x.id===idObj);
  if(j<0){ a.splice(i,0,s); return; }
  const ordenAnterior=s.orden;
  const destino=despues?j+1:j;
  a.splice(destino,0,s);
  const anterior=a[destino-1]?.orden ?? null;
  const siguiente=a[destino+1]?.orden ?? null;
  s.orden=RoadmapSync.calcularOrden(anterior, siguiente);
  persistirSeccion(s, { revertir: () => { s.orden=ordenAnterior; render(); } });
  render();
}
```

- [ ] **Step 4: Verificación manual**

Cortar la red. Arrastrar una tarea a otra posición → esperar ~3.5s → debe volver a su posición/bloque original y aparecer el toast de error. Repetir arrastrando un bloque completo. Reconectar y confirmar que en condiciones normales el nuevo orden persiste tras recargar.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: revert drag-and-drop reorder on save failure"
```

---

### Task 11: Feedback local en login/logout

**Files:**
- Modify: `index.html:972-986` (`loginForm` submit, `bCerrarSesion.onclick`)

**Interfaces:**
- Consumes: `onEstadoBoton` (Task 1).

- [ ] **Step 1: Feedback en el submit de login**

Reemplazar:

```js
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
```

por:

```js
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.hidden = true;
  const submitBtn = loginForm.querySelector('button[type=submit]');
  const marcar = onEstadoBoton(submitBtn, 'Entrando...');
  marcar('cargando');
  try{
    await RoadmapSync.iniciarSesion(loginEmail.value.trim(), loginPassword.value);
    marcar('ok');
  }catch(err){
    marcar('error');
    loginError.textContent = 'Email o contraseña incorrectos.';
    loginError.hidden = false;
  }
});
```

- [ ] **Step 2: Feedback en cerrar sesión**

Reemplazar:

```js
bCerrarSesion.onclick = async () => {
  try{ await RoadmapSync.cerrarSesion(); }
  catch(e){ aviso('No se pudo cerrar sesión: '+e.message); }
};
```

por:

```js
bCerrarSesion.onclick = async () => {
  const marcar = onEstadoBoton(bCerrarSesion, 'Saliendo...');
  marcar('cargando');
  try{ await RoadmapSync.cerrarSesion(); marcar('ok'); }
  catch(e){ marcar('error'); aviso('No se pudo cerrar sesión: '+e.message); }
};
```

- [ ] **Step 3: Verificación manual**

Comprobar que `loginForm` tiene un `<button type="submit">` (si el markup usa otro selector, ajustar el `querySelector` del Step 1 al botón real de submit del formulario de login). Intentar loguearse con una contraseña incorrecta → el botón debe decir "Entrando..." y estar deshabilitado mientras se verifica, y volver a su texto original al mostrar el error. Cerrar sesión → el botón debe decir "Saliendo..." brevemente.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add local loading feedback to login and logout buttons"
```

---

### Task 12: Actualizar el checklist de verificación manual

**Files:**
- Modify: `docs/verification-checklist-supabase-persistence.md`

**Interfaces:**
- Consumes: nada (es documentación).

- [ ] **Step 1: Agregar una sección nueva al checklist**

Al final de `docs/verification-checklist-supabase-persistence.md`, antes de la sección "## Cómo reportar resultados", agregar:

```markdown
### 9. Estados de carga y optimistic update

- [ ] Recargar la página con DevTools → Network → throttling "Slow 3G". Esperado: se ve un skeleton con shimmer (bloques y filas grises pulsando) mientras carga, reemplazado por el tablero real al terminar.
- [ ] Con red normal, cambiar el estado de una tarea. Esperado: aparece `● guardando` junto al buscador (franja de filtros) y después `✓ guardado`, que desaparece solo.
- [ ] Scrollear la lista de tareas mientras se ve `● guardando`/`✓ guardado`. Esperado: el indicador sigue visible (la franja de filtros es sticky).
- [ ] Cortar la red (DevTools → Network → Offline) y repetir, uno por uno: cambiar estado de tarea, cambiar responsable, escribir en explicación/comentario, mover una tarea de bloque con el select, arrastrar una tarea o un bloque, agregar tarea nueva, agregar bloque nuevo, borrar tarea, borrar bloque, subir un adjunto, borrar un adjunto. Esperado en TODOS: tras ~3.5s (2 reintentos de 1.5s) el cambio vuelve a como estaba antes y aparece el toast "No se pudo completar la acción. Revisa tu conexión." — nada queda "colgado" a mitad de camino.
- [ ] Reconectar la red y repetir la lista anterior. Esperado: todo persiste normalmente, sin reverts, y recargando la página los cambios siguen ahí.
- [ ] Intentar loguearse con credenciales incorrectas. Esperado: el botón de submit dice "Entrando..." mientras verifica, y vuelve a su texto normal al mostrar el error.
- [ ] Cerrar sesión. Esperado: el botón dice "Saliendo..." brevemente antes de que aparezca el modal de login.
```

- [ ] **Step 2: Commit**

```bash
git add docs/verification-checklist-supabase-persistence.md
git commit -m "docs: extend manual verification checklist with loading-state cases"
```
