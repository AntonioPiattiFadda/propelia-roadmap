# Diseño: estados de carga + optimistic update, todo el tablero

## Contexto

`index.html` ya hace optimistic update de forma implícita en varios lugares: muta `estado` en memoria y pinta al toque, y recién después persiste contra Supabase en segundo plano (`persistirTarea`, `persistirSeccion`, llamadas directas a `RoadmapSync.*`). Lo que falta:

- No hay ningún indicador visual de que algo se está guardando/cargando.
- Solo "borrar tarea" y "borrar bloque" revierten el cambio si falla la persistencia (y con un solo intento, sin reintento). El resto de las acciones (guardar campo, agregar tarea/bloque, subir adjunto, drag&drop) no revierte nada si falla — el dato queda desincronizado en pantalla sin que el usuario se entere, más allá del toast de `aviso()`.
- No hay ningún estado visual durante la carga inicial (`RoadmapSync.cargarEstado()`); la pantalla queda vacía hasta que resuelve.

## Objetivo

Un único mecanismo reusable para: (1) mostrar que algo está en vuelo, (2) reintentar igual que hoy, (3) revertir el cambio óptimo si se agotan los reintentos, (4) avisar del error — aplicado de forma consistente a los ~10 puntos de persistencia de la app. Más un skeleton para la carga inicial.

## Arquitectura

### Helper central: `conEstadoDeCarga`

Vive junto a `persistirTarea`/`persistirSeccion` en `index.html`. No conoce el DOM — delega el "cómo se ve" a `onEstado`.

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
```

`persistirTarea`/`persistirSeccion` pasan a ser wrappers finos sobre esto, aceptando `opts` opcionales (`onEstado`, `revertir`) que cada call site les pasa.

### Indicador global (único, en `.bar`)

`.bar` (index.html:286, CSS línea 44) ya es `position:sticky;top:0` — se queda visible al scrollear la lista de tareas. Ahí, al lado de "Ocultar hechas"/"Plegar todo", va un `<span id="estadoGuardado">` nuevo.

El `<header>` de arriba (título, cancha Loro/Toni, "Cerrar sesión") **no** es sticky — se descarta como ubicación porque desaparecería justo cuando más se necesita ver el indicador (scrolleando la lista).

Contador para tolerar guardados concurrentes:

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
  if (enVuelo > 0) return; // sigue habiendo otra cosa en vuelo, no lo apagues
  elGuardado.className = 'estado-guardado' + (estado === 'ok' ? ' ok' : '');
  elGuardado.textContent = estado === 'ok' ? '✓ guardado' : '';
  if (estado === 'ok') setTimeout(() => {
    if (enVuelo === 0) { elGuardado.textContent = ''; elGuardado.className = 'estado-guardado'; }
  }, 1500);
}
```

### Feedback local + composición

Para acciones discretas con un control puntual (botón), feedback local además del global:

```js
function onEstadoBoton(btn, textoCargando) {
  const original = btn.textContent;
  return estado => {
    btn.disabled = estado === 'cargando';
    btn.textContent = estado === 'cargando' ? textoCargando : original;
  };
}
const combinar = (...fns) => estado => fns.forEach(fn => fn(estado));
// uso: onEstado: combinar(onEstadoBoton(btnBorrar, 'Borrando...'), onEstadoGlobal)
```

### Skeleton de carga inicial

Markup estático dentro de `<div id="lista">` (index.html:300), presente desde el HTML — sin JS para mostrarlo. `render()` ya hace `lista.innerHTML=''` la primera vez que corre (línea 865) y lo pisa con el tablero real. Mientras el modal de login tapa la pantalla, el skeleton está detrás sin que importe.

```html
<div id="lista">
  <div class="esqueleto" aria-hidden="true">
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
  </div>
</div>
```

```css
.esq-bloque{border:1px solid var(--edge);border-radius:8px;padding:14px;
  display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
.esq-cab{height:20px;width:40%;border-radius:4px}
.esq-fila{height:15px;border-radius:4px}
.shimmer{background:linear-gradient(90deg,var(--sunken) 25%,var(--edge) 37%,var(--sunken) 63%);
  background-size:400% 100%;animation:shimmer 1.4s ease-in-out infinite}
@keyframes shimmer{0%{background-position:100% 0}100%{background-position:0 0}}
```

## Mapeo de call sites

| Acción | Dónde | `onEstado` | `revertir` |
|---|---|---|---|
| Guardar campo (debounce: explicación, comentario, etc.) | `persistirTarea` | `onEstadoGlobal` | restaurar `t[campo]` + repintar el campo (nuevo) |
| Cambiar estado/responsable/mover de bloque (select inmediato) | `persistirTarea` | `onEstadoGlobal` + disable del select mientras vuela | restaurar `t[campo]` + `select.value` (nuevo) |
| Borrar tarea | `.del onclick` (línea 712) | `combinar(onEstadoBoton, onEstadoGlobal)` | ya existe (splice back) → se sube a 2 reintentos vía el helper |
| Agregar tarea | `add.onclick` (línea 849) | `combinar(onEstadoBoton, onEstadoGlobal)` | quitar la tarea nueva del array (nuevo) |
| Borrar bloque | `data-del onclick` (línea 817) | `combinar(onEstadoBoton, onEstadoGlobal)` | ya existe (splice back) → se sube a 2 reintentos |
| Agregar bloque | `bNuevoBloque.onclick` (línea 900) | `combinar(onEstadoBoton, onEstadoGlobal)` | quitar la sección nueva (nuevo) |
| Subir adjunto | `adjuntar()` (línea 390) | `onEstadoGlobal` (pueden ser varios archivos a la vez, no hay un botón único) | quitar de `t.files` los que fallaron (nuevo) |
| Borrar adjunto (con el confirm de doble-click ya implementado) | `x.onclick` en `pintarThumbs` (línea 442) | `combinar(onEstadoBoton(x, '⏳'), onEstadoGlobal)` | reinsertar el archivo en `t.files` (nuevo) |
| Drag&drop tarea/bloque | `moverTarea`/`moverTareaAlFinal`/`moverBloque` (líneas 505-539) | `onEstadoGlobal` | restaurar `{sec, orden}` previos del ítem movido (nuevo) |
| Login | submit del form (línea 972) | `onEstadoBoton(submit, 'Entrando...')` | n/a — no hay estado óptimista que deshacer |
| Cerrar sesión | `bCerrarSesion.onclick` (línea 983) | `onEstadoBoton(btn, 'Saliendo...')` | n/a |

## Fuera de alcance

- Exportar HTML/CSV (`bHtml`, `bCsv`): son síncronos, generan el archivo local al toque, no hay red de por medio.
- Sync en tiempo real entre pestañas (`refrescarDesdeSupabase`): no dispara skeleton — es una actualización incremental sobre un tablero que ya tiene contenido, mostrar skeleton ahí sería un parpadeo innecesario.

## Verificación

Sin acceso a browser en este entorno — verificación manual, extendiendo `docs/verification-checklist-supabase-persistence.md` con un caso por cada fila de la tabla: cortar red (DevTools → Network → Offline) en medio de la acción, confirmar indicador correcto, revert tras agotar los 2 reintentos, y aviso de error.
