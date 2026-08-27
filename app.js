/* app.js — lógica del tablero. Un solo sistema, un solo conjunto de tareas.
   index.html define window.APP_CONFIG antes de cargar este archivo. */

const CFG = window.APP_CONFIG || {};

/* ============================================================
   Catálogos
   ------------------------------------------------------------
   `id` es SIEMPRE el valor que queda escrito en la base; `label` es solo lo que
   se lee en pantalla. Por eso los estados conservan los nombres viejos
   ('Pendiente', 'Hecho'…): así las tareas que ya estaban cargadas siguen
   cayendo en su columna sin necesidad de migrar una sola fila.
   ============================================================ */
const ESTADOS = [
  { id:'Pendiente', label:'Nueva',       color:'#9A9CA5' },
  { id:'En curso',  label:'En curso',    color:'#5F7A9B' },
  { id:'Bloqueado', label:'Bloqueada',   color:'#A44B45' },
  // 'Revision' entró el 26/8/2026, entre Bloqueada y Terminada: lo que ya no se está
  // haciendo pero tampoco está cerrado. No hizo falta migrar nada —`estado` es un `text`
  // sin `check` en la base—, y las filas viejas no lo tienen porque nunca pasaron por él.
  // El id va sin tilde: es lo que queda escrito en la base, y ahí el ASCII se agradece.
  { id:'Revision',  label:'En revisión', color:'#8A6E9C' },
  { id:'Hecho',     label:'Terminada',   color:'#5E8467' },
];
const HECHO = 'Hecho';

// El orden de esta lista es el orden en que se apilan los grupos dentro de cada columna:
// primero lo crítico, al final lo mensual.
const PRIORIDADES = [
  { id:'critica',   label:'Crítica',   color:'#A44B45' },
  { id:'urgente',   label:'Urgente',   color:'#A87A3F' },
  { id:'semanal',   label:'Semanal',   color:'#6E6BA0' },
  { id:'mensual',   label:'Mensual',   color:'#7C8A82' },
];
const CRITICA = 'critica';
// 'bisemanal' salió del tablero. Lo que quedó cargado con esa prioridad se lee como
// mensual, que es la que la reemplaza; en la base no se toca nada hasta que se edite.
const PRIORIDADES_VIEJAS = { bisemanal:'mensual' };
/* El tipo de actividad —«Desarrollo nuevo», «Modificación», «Corrección», «UX/UI»— se sacó
   el 26/8/2026: nadie lo usaba. Era una catalogación que había que elegir tarea por tarea y
   que después no filtraba nada, porque el filtro de la barra tampoco se tocaba. Con él se
   fueron el <select> de la ficha, el filtro y la columna del CSV.

   La columna `roadmap_tareas.tipo` sigue en la base con lo que tenía cargado y
   `guardarTarea()` la escribe igual, como pasó con `loom`: no se migró nada. Toda tarea
   nueva nace con el `'nuevo'` de fábrica, que es lo que ya tenía la columna por defecto.

   **Y desde el 26/8/2026 esa columna muerta guarda otra cosa: cuándo entró la tarea al
   tablero** (ver `entroAlTablero()`). Es la misma jugada que `modulo` con el «Área», `hoy` con
   la chapa de novedad y `texto`/`orden` de `roadmap_notas` con la columna de cada grupo: hay
   dos migraciones esperando hace semanas y una columna nueva sería condenar la cuenta de días
   a esperar una tercera. */

// El tablero agrupa siempre por estado: las columnas son los estados y, dentro de cada
// una, las tareas se apilan por prioridad. La otra forma de mirar el tablero —la
// prioridad— quedó como filtro de la barra, no como vista.
//
// No todas las vistas pintan tarjetas. `caja` y `backlog` son hojas de renglones: las dos
// ocupan el board entero en vez de repartirlo en columnas. La marca la
// lleva la vista, no el render, así el resto del archivo pregunta `v.backlog` en vez de
// comparar contra el id en diez lugares distintos.
//
// Ojo con la diferencia: la caja no sabe nada de tareas, pero el backlog son tareas —solo
// que del otro lado de la marca `backlog`—. Por eso el backlog sí tiene filtros, buscador
// y contador, y la caja no.
//
// Las vistas viven en la barra lateral, que la mayor parte del tiempo está plegada a una
// canaleta de íconos. Por eso cada una trae el suyo: con la barra cerrada, el ícono ES la
// vista, y el rótulo aparece recién cuando la barra se abre.
//
// La vista «Hoy» se sacó el 26/8/2026, junto con todo el sistema de marcar tareas para el
// día. Era una clasificación paralela a la prioridad que había que mantener a mano, tarjeta
// por tarjeta. Su columna `hoy` quedó vacía en la base y ese mismo día se reusó para otra cosa
// —«esta actividad todavía es nueva en el tablero»—, igual que `modulo` se había reusado para
// el «Área» del backlog. Ver «la novedad de una actividad».
const VISTAS = [
  { id:'estado',  label:'Tablero',
    ico:'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="16" rx="1.5"/><rect x="16" y="4" width="5" height="16" rx="1.5"/>' },
  { id:'backlog', label:'Backlog', backlog:true,
    ico:'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5"/>' },
  { id:'caja',    label:'Caja',    caja:true,
    ico:'<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h3"/>' },
];
// Vistas que no muestran tareas: ni filtros, ni contador, ni «+ Nueva tarea» con sentido.
const sinTareas = v => !!v.caja;
// Vistas que se comen el board entero en vez de repartirlo en columnas.
const anchoCompleto = v => !!(v.caja || v.backlog);

/* Acá vivía `LAYOUTS = ['cols','rows','lista']`, el segmentado de la barra: tres formas de
   dibujar el mismo tablero. `cols` era el kanban de tarjetas y `rows` esa misma tarjeta
   estirada a lo ancho; `lista` es OTRO componente —la lista de renglones del Backlog, con las
   mismas clases `pg`, agrupada por estado en vez de por sprint—.

   **Las dos de tarjetas se sacaron el 26/8/2026 por pedido, y con ellas el segmentado
   entero.** El tablero se dibuja de una sola forma, así que ya no hay preferencia que
   guardar ni botón que elegirla: `UI.layout` se fue de `localStorage` y una sesión vieja que
   todavía lo tenga guardado simplemente lo ignora, que es lo mismo que hacía ya con la vista
   «Hoy». La lista sí sigue siendo un layout y no una vista —las mismas tareas, los mismos
   filtros, el mismo contador—, por eso no entró en `VISTAS`: es cómo se dibuja el tablero.

   Lo que se fue con ellas: `renderTablero()`, `tarjetaHTML()`, `conectarTablero()`,
   `soltarTarea()`, `tarjetaDespuesDe()` y el autoscroll del arrastre de tarjetas. El arrastre
   de la lista es otro y vive en `engancharArrastreLista()`. */

// Personas del tablero. El `id` es lo que se guarda en la base (responsables, autor
// del chat, quién puso la plata); `email` es lo que ata cada persona a su cuenta.
const PERSONAS = (CFG.personas || []).map((p, i) => ({
  id: p.id,
  nombre: p.nombre || p.id,
  ini: p.ini || String(p.nombre || p.id).slice(0, 2).toUpperCase(),
  color: p.color || ['#6E6BA0','#4F7F79','#A87A3F','#5A7E8C'][i % 4],
  email: (p.email || '').toLowerCase(),
  caja: !!p.caja,
}));
// En la caja no participan todos: solo quienes tienen `caja:true` en la config. Si no
// hay ninguno marcado se usan todos, para que la caja nunca quede sin gente.
const PERSONAS_CAJA = PERSONAS.filter(p => p.caja).length ? PERSONAS.filter(p => p.caja) : PERSONAS;
const persona = id => PERSONAS.find(p => p.id === id) || null;
const colorPersona = id => persona(id)?.color || '#858A99';
const iniPersona = id => persona(id)?.ini || '?';
const nombrePersona = id => persona(id)?.nombre || id || '—';

// Identidad de quien está usando el tablero (se resuelve al iniciar sesión).
let YO = { id:'', nombre:'', esMiembro:false };

/* ---------- datos y estado de pantalla ---------- */
let datos = { tareas: [], caja: [], grupos: [], nota: '' };
let UI = {
  vista: 'estado',
  // La columna de Terminadas arranca plegada: es lo que ya no hay que mirar.
  terminadasAbiertas: false,
  // Cuántos casilleros de sprint mostrar en el backlog. 0 = lo que diga la config.
  sprints: 0,
  // `prioridades` es una lista, como `pend`: los dos filtros admiten varias opciones a la
  // vez. Nada de esto se guarda en localStorage — un filtro puesto es de este rato, no una
  // preferencia.
  f: { q:'', pend:[], prioridades:[] },
};
try {
  const guardado = JSON.parse(localStorage.getItem('tablero-ui') || '{}');
  if (guardado.vista && VISTAS.some(v => v.id === guardado.vista)) UI.vista = guardado.vista;
  // `guardado.layout` ya no se lee: el tablero se dibuja de una sola forma. Una sesión vieja
  // puede traerlo guardado y no molesta a nadie — se ignora, igual que se ignora la vista
  // «Hoy» que también quedó dando vueltas en `localStorage`.
  UI.terminadasAbiertas = !!guardado.terminadasAbiertas;
  UI.sprints = Number(guardado.sprints) || 0;
} catch (e) { /* preferencia local, si no se puede leer no importa */ }
function guardarUI(){
  try {
    localStorage.setItem('tablero-ui', JSON.stringify({
      vista: UI.vista, terminadasAbiertas: UI.terminadasAbiertas,
      sprints: UI.sprints,
    }));
  } catch (e) { /* modo privado o storage lleno: no es crítico */ }
}

let tareaAbierta = null;
// `arrastreId` se fue con las tarjetas: era la tarjeta que estaba en el aire. El arrastre de
// la lista lleva el suyo propio, adentro de `engancharArrastreLista()`.

/* ---------- elementos ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const board       = $('#board');
const elFiltros   = $('#filtros');
const elVistas    = $('#views');
// La misma lista de vistas, abajo y en el teléfono. Es un segundo dibujo del mismo `VISTAS`,
// no una segunda navegación: los dos usan `data-vista` y los engancha el mismo bucle.
const elTabs      = $('#tabbar');
const elGuardado  = $('#estadoGuardado');
const elToast     = $('#toast');
const elAviso     = $('#avisoEsquema');
const elAvisoTexto= $('#avisoEsquemaTexto');
const elCampana   = $('#campana');

/* ============================================================
   Infraestructura optimista: se pinta al toque, se guarda por detrás,
   y si falla después de reintentar se vuelve atrás en vez de mentir.
   ============================================================ */
const pendientesGuardado = new Map();
function guardarDebounced(clave, fn){
  clearTimeout(pendientesGuardado.get(clave));
  pendientesGuardado.set(clave, setTimeout(() => { pendientesGuardado.delete(clave); fn(); }, 500));
}
const snaps = new Map();
const ecosPropios = new Map();
function marcarEcoPropio(tabla, id){
  const clave = tabla + ':' + id;
  ecosPropios.set(clave, (ecosPropios.get(clave) || 0) + 1);
}

async function conEstadoDeCarga(accion, { revertir, intentos = 2, onEstado } = {}){
  onEstado?.('cargando');
  for (let intento = 0; intento <= intentos; intento++) {
    try { await accion(); onEstado?.('ok'); return true; }
    catch (e) {
      if (intento === intentos) {
        onEstado?.('error');
        revertir?.();
        aviso('No se pudo guardar. Revisá tu conexión.');
        return false;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
function onEstadoBoton(btn, textoCargando){
  const original = btn.textContent;
  return est => {
    btn.disabled = est === 'cargando';
    btn.textContent = est === 'cargando' ? textoCargando : original;
  };
}
const combinar = (...fns) => est => fns.forEach(fn => fn(est));

let enVuelo = 0;
function onEstadoGlobal(est){
  if (est === 'cargando') {
    enVuelo++;
    elGuardado.className = 'estado-guardado cargando';
    elGuardado.textContent = '● guardando';
    return;
  }
  enVuelo = Math.max(0, enVuelo - 1);
  if (enVuelo > 0) return;
  elGuardado.className = 'estado-guardado' + (est === 'ok' ? ' ok' : '');
  elGuardado.textContent = est === 'ok' ? '✓ guardado' : '';
  if (est === 'ok') setTimeout(() => {
    if (enVuelo === 0) { elGuardado.textContent = ''; elGuardado.className = 'estado-guardado'; }
  }, 1500);
}

async function persistirTarea(t, opts = {}){
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarTarea(t),
    { onEstado: onEstadoGlobal, ...opts });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.tareas, t.id);
  return ok;
}
async function persistirMovimiento(m, opts = {}){
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarMovimiento(m),
    { onEstado: onEstadoGlobal, ...opts });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.caja, m.id);
  return ok;
}

// Pone al día lo que quedó guardado con catálogos que ya no existen. Hoy es solo la
// prioridad 'bisemanal', que salió del tablero: en memoria pasa a 'mensual' y en la base
// recién se corrige cuando esa tarea se toca. Sin esto, el detalle de una de esas tareas
// abriría el selector de prioridad en blanco.
function normalizarDatos(){
  datos.tareas.forEach(t => {
    if (PRIORIDADES_VIEJAS[t.prioridad]) t.prioridad = PRIORIDADES_VIEJAS[t.prioridad];
  });
}

/* ---------- refresco en tiempo real ---------- */
let refrescoPendiente = false;
// No pisar la pantalla mientras alguien escribe: ni en la caja, ni en las hojas de
// Visión, ni con el detalle de una tarea abierto (ahí se está editando a mano).
function estaEditando(){
  if ($('#scrimTarea').classList.contains('on')) return true;
  const f = document.activeElement;
  if (!f || !board.contains(f)) return false;
  // `isContentEditable` también: en el backlog el título y el área son divs editables, no
  // inputs, y repintarlos encima de quien está escribiendo le come lo tipeado.
  return ['INPUT','TEXTAREA','SELECT'].includes(f.tagName) || f.isContentEditable;
}
async function refrescar(payload){
  if (payload?.table) {
    const id = payload.new?.id ?? payload.old?.id;
    const clave = payload.table + ':' + id;
    const pendientes = ecosPropios.get(clave);
    if (pendientes > 0) { ecosPropios.set(clave, pendientes - 1); return; }
  }
  if (estaEditando()) { refrescoPendiente = true; return; }
  try { datos = await RoadmapSync.cargarEstado(); normalizarDatos(); }
  catch (e) { aviso('No se pudo sincronizar: ' + e.message); return; }
  render();
}
document.addEventListener('focusout', e => {
  if (!board.contains(e.target)) return;
  if (refrescoPendiente) { refrescoPendiente = false; refrescar(); }
});

/* ============================================================
   Utilidades
   ============================================================ */
const esc  = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA = s => esc(s).replace(/"/g,'&quot;');
const porId = (arr, id) => arr.find(x => x.id === id) || null;
const tarea = id => datos.tareas.find(t => t.id === id) || null;

function nuevoId(pref, ids){
  let n = 1; const usados = new Set(ids);
  while (usados.has(pref + String(n).padStart(2,'0'))) n++;
  return pref + String(n).padStart(2,'0');
}
function tint(hex, a){
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;
}
function fmtTs(iso){
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
/* ---------- cuánto hace que existe la tarea ----------
   El dato ya estaba: `creada` se guarda desde que nace la fila. Lo que faltaba era mostrarlo,
   y se muestra en tres lados (tarjeta, ficha y panel del backlog), así que el formato sale de
   un solo lugar.

   La unidad se elige sola y se corta ahí: «3 d» dice lo mismo que «3 d 4 h 12 min» y ocupa
   un tercio. El dato exacto no se pierde, va en el `title`.

   Una tarea sin `creada` —las que vienen del tablero viejo— no muestra nada. Inventarle una
   antigüedad sería peor que no decir nada. */
const _MIN = 60000, _HORA = 60 * _MIN, _DIA = 24 * _HORA;
function antiguedad(iso){
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d)) return null;
  // El máximo con 0 es por si el reloj de la máquina está atrasado contra el del servidor:
  // «hace -2 min» no se le explica a nadie.
  const ms = Math.max(0, Date.now() - d.getTime());
  const dias = Math.floor(ms / _DIA);
  const txt =
      ms < _MIN  ? 'recién'
    : ms < _HORA ? Math.floor(ms / _MIN) + ' min'
    : ms < _DIA  ? Math.floor(ms / _HORA) + ' h'
    : dias < 7   ? dias + ' d'
    : dias < 60  ? Math.floor(dias / 7) + ' sem'
    : dias < 365 ? Math.floor(dias / 30) + ' mes'
    :              Math.floor(dias / 365) + ' a';
  const p = n => String(n).padStart(2,'0');
  const exacta = d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })
    + ' · ' + p(d.getHours()) + ':' + p(d.getMinutes());
  return { txt, exacta, dias };
}

/* Dos formatos del mismo dato y una sola puerta: la unidad que se elige sola («2 sem»), que
   es la que se lee en prosa, y los días crudos («14») del círculo del tablero, que se leen
   bajando por una columna y por eso no pueden cambiar de unidad de una fila a la otra. Los usan
   el pintado y el refresco del minuto: con el formato escrito en los dos lados, un chip diría
   una cosa al pintarse y otra a los sesenta segundos.

   El número va pelado desde el 26/8/2026: la `d` que llevaba pegada era la mitad del ancho de
   una ficha redonda de tamaño fijo, y qué unidad es lo dice el `title` (ver `pillDias()`). */
const textoEdad = (a, ds) => ds.edadFmt === 'dias' ? String(a.dias) : (ds.edadPre || '') + a.txt;

/* El chip se refresca solo: un tablero abierto toda la tarde no puede seguir diciendo
   «hace 2 h». Se reescribe el texto de cada `[data-edad]` y nada más — repintar el tablero
   entero cada minuto costaría carísimo y encima cortaría lo que alguien esté escribiendo. */
setInterval(() => {
  $$('[data-edad]').forEach(el => {
    const a = antiguedad(el.dataset.edad);
    if (a) el.textContent = textoEdad(a, el.dataset);
  });
}, _MIN);

function aviso(txt){
  elToast.textContent = txt;
  elToast.classList.add('on');
  clearTimeout(elToast._x);
  elToast._x = setTimeout(() => elToast.classList.remove('on'), 2800);
}
function autoGrow(el){ el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px'; }
function llenarSelect(el, items, placeholder){
  el.innerHTML = (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : '')
    + items.map(i => `<option value="${escA(i.id)}">${esc(i.label)}</option>`).join('');
}

const prioridadDe = id => porId(PRIORIDADES, PRIORIDADES_VIEJAS[id] || id) || PRIORIDADES[2];
const estadoDe    = id => porId(ESTADOS, id) || ESTADOS[0];
const vistaActual = () => porId(VISTAS, UI.vista) || VISTAS[1];

/* ============================================================
   Archivos adjuntos
   ============================================================ */
const MAX_LADO = 1800, CALIDAD = .82, MAX_ARCHIVO = 6 * 1048576;
const kb = n => n < 1048576 ? Math.round(n/1024) + ' KB' : (n/1048576).toFixed(1) + ' MB';

async function comprimirImagen(file){
  try {
    const bmp = await createImageBitmap(file);
    const f = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * f), h = Math.round(bmp.height * f);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', CALIDAD));
    return (blob && blob.size < file.size) ? blob : file;
  } catch (e) { return file; }
}

async function adjuntar(t, files){
  t.files = t.files || [];
  let n = 0, saltados = [], ahorro = 0;
  const subidos = [];
  onEstadoGlobal('cargando');
  // Cada archivo se ve desde antes de subir: la imagen como su miniatura local —igual que
  // en la explicación— y el resto como ficha apagada. `_subiendo` no se persiste (va con
  // guion bajo y guardarTarea arma su objeto campo por campo); se van yendo de a uno a
  // medida que cada subida termina o falla.
  const pendientes = [...files].map(f => ({
    n: f.name || 'captura',
    url: /^image\//.test(f.type) ? URL.createObjectURL(f) : '',
  }));
  t._subiendo = (t._subiendo || []).concat(pendientes);
  if (actual() === t) $('#tSecFiles').open = true;
  pintarArchivos(t);
  const listo = p => {
    if (p.url) URL.revokeObjectURL(p.url);
    const i = t._subiendo.indexOf(p); if (i > -1) t._subiendo.splice(i, 1);
    pintarArchivos(t);
  };
  let idx = 0;
  for (const f of files) {
    const p = pendientes[idx++];
    const esImg = /^image\//.test(f.type);
    if (!esImg && f.size > MAX_ARCHIVO) { saltados.push(f.name + ' (' + kb(f.size) + ')'); listo(p); continue; }
    const blob = esImg ? await comprimirImagen(f) : f;
    if (blob.size > MAX_ARCHIVO) { saltados.push((f.name || 'captura') + ' (' + kb(blob.size) + ' ya comprimida)'); listo(p); continue; }
    if (esImg && f.size > blob.size) ahorro += f.size - blob.size;
    try {
      const nombre = f.name || ('captura-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.webp');
      const archivo = await RoadmapSync.subirArchivo(t.id, blob, nombre);
      t.files.push(archivo); subidos.push(archivo); n++;
    } catch (e) { saltados.push((f.name || 'captura') + ' (error al subir)'); }
    listo(p);
  }
  if (n) {
    await persistirTarea(t, {
      onEstado: est => { if (est !== 'cargando') onEstadoGlobal(est); },
      revertir: () => {
        subidos.forEach(a => {
          const i = t.files.indexOf(a); if (i > -1) t.files.splice(i, 1);
          RoadmapSync.borrarArchivo(a).catch(() => {});
        });
        pintarArchivos(t);
      },
    });
  } else onEstadoGlobal('ok');
  pintarArchivos(t); render();
  // La ficha de archivos puede estar plegada: si acaba de entrar algo, se abre sola. Un
  // adjunto que se guarda sin que se vea es un adjunto que nadie sabe que está.
  if (n && actual() === t) $('#tSecFiles').open = true;
  if (saltados.length) aviso('No pude adjuntar: ' + saltados.join(', ') + '. Subilo a Drive y pegá el enlace.');
  else if (n) aviso((n === 1 ? '1 archivo adjuntado' : n + ' archivos adjuntados') + (ahorro > 512000 ? ' · ' + kb(ahorro) + ' ahorrados al comprimir' : ''));
}

async function borrarTodosLosArchivos(t){
  // Las imágenes pegadas dentro de la explicación no están en `t.files` —viven en el
  // propio texto—, pero ocupan lugar en el bucket igual que cualquier adjunto.
  const files = [
    ...(t.files || []),
    ...((t.subtareas || []).flatMap(s => s.files || [])),
    ...archivosDeExpl(t.expl),
  ];
  for (const f of files) { try { await RoadmapSync.borrarArchivo(f); } catch (e) { /* ya no existe */ } }
}

/* ============================================================
   Cabecera: pestañas de vista y filtros
   ============================================================ */
function pintarChrome(){
  document.title = CFG.titulo || 'Tablero de tareas';
  $('#tituloApp').textContent = CFG.titulo || 'Tablero de tareas';
  $('#subtituloApp').textContent = CFG.subtitulo || '';

  // El nombre va envuelto en `.side-txt` como el resto de los rótulos de la barra: con la
  // barra plegada queda el avatar solo, que es lo único que entra en la canaleta.
  const yo = $('#yoNombre');
  yo.innerHTML = YO.id
    ? `<span class="av mini" style="background:${colorPersona(YO.id)}">${esc(iniPersona(YO.id))}</span><span class="side-txt">Sos ${esc(YO.nombre)}</span>`
    : (YO.nombre ? `<span class="av mini off">?</span><span class="side-txt">${esc(YO.nombre)}</span>` : '');

  // Campana de críticas: mientras haya algo crítico sin terminar, late en rojo y lleva
  // de un clic al tablero filtrado por esas tareas.
  // Lo guardado en el backlog no cuenta: todavía no está en juego, por más crítico que sea.
  const criticas = datos.tareas.filter(t =>
    !t.backlog && prioridadDe(t.prioridad).id === CRITICA && t.estado !== HECHO);
  elCampana.hidden = !criticas.length;
  if (criticas.length) {
    elCampana.querySelector('b').textContent = criticas.length;
    elCampana.title = criticas.length === 1
      ? '1 tarea crítica sin terminar — clic para verla'
      : `${criticas.length} tareas críticas sin terminar — clic para verlas`;
    elCampana.classList.toggle('viendo', UI.f.prioridades.includes(CRITICA));
  }
  // La campana pone y saca lo crítico del filtro sin tocar el resto de lo elegido: ahora que
  // se pueden marcar varias prioridades, pisar la lista entera se llevaría puesto lo demás.
  elCampana.onclick = () => {
    cerrarPagina();
    const i = UI.f.prioridades.indexOf(CRITICA);
    i > -1 ? UI.f.prioridades.splice(i, 1) : UI.f.prioridades.push(CRITICA);
    // Filtrar desde una vista que no muestra tareas no se vería en ningún lado: se
    // vuelve al tablero, que es donde ese filtro tiene efecto.
    if (i < 0 && sinTareas(vistaActual())) { UI.vista = 'estado'; guardarUI(); }
    render();
  };

  // El contador del Backlog cuenta lo que todavía no salió, no todo lo que se ve ahí: lo ya
  // mandado sigue en la lista pero ya no es pendiente de nadie.
  const nBacklog = datos.tareas.filter(t => t.backlog).length;
  elVistas.innerHTML = VISTAS.map(v => {
    const on = UI.vista === v.id;
    // El contador de cada vista dice lo que esa vista sabe contar: Backlog, todo lo que
    // tiene guardado; el tablero, el resultado del filtro —solo cuando está activa, porque
    // fuera de ella el número sería el de un filtro que no se está viendo—. La caja no
    // cuenta tareas, así que no lleva número.
    let badge = '';
    if (v.backlog) badge = nBacklog ? `<small>${nBacklog}</small>` : '';
    else if (on && !v.caja) badge = `<small>${datos.tareas.filter(visible).length}</small>`;
    // El ícono es lo único que se ve con la barra plegada, así que va primero y el rótulo
    // detrás: al abrirse, la fila crece hacia la derecha sin mover el ícono de lugar.
    return `<button class="side-nav-it${on ? ' on' : ''}" data-vista="${v.id}" title="${escA(v.label)}">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${v.ico}</svg>
      <span class="side-txt">${esc(v.label)}</span>${badge}
    </button>`;
  }).join('');

  /* La barra de abajo del teléfono: las MISMAS vistas, con el mismo `data-vista`, dibujadas
     con la forma de una barra de pestañas de aplicación. No es una navegación aparte —si lo
     fuera habría dos lugares donde acordarse de agregar una vista— y por eso se pinta acá
     adentro, arriba del enganche, que las cubre a las dos de un saque.

     El ícono va arriba y el rótulo abajo: con el pulgar tapando la pantalla el ícono es lo
     último que queda a la vista, igual que con la barra lateral plegada. */
  elTabs.innerHTML = VISTAS.map(v => {
    const on = UI.vista === v.id;
    return `<button class="tab-it${on ? ' on' : ''}" data-vista="${v.id}"
      aria-current="${on ? 'page' : 'false'}">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${v.ico}</svg>
      <span>${esc(v.label)}</span>${v.backlog && nBacklog ? `<i class="tab-n">${nBacklog}</i>` : ''}
    </button>`;
  }).join('');

  /* El encabezado del teléfono. Dice dónde estás y cuántas cosas hay, que es lo que en el
     escritorio dicen la barra lateral y el contador de cada bloque. El número es el de la
     vista y no uno solo para las tres: en el tablero lo que se cuenta es lo que falta cerrar
     —lo terminado no es carga—, en el backlog lo anotado y en la caja los movimientos. */
  const vAhora = vistaActual();

  /* Las dos cosas del encabezado que solo tienen sentido sobre una lista de tareas. En la caja
     no hay qué buscar, y adentro de la página de una tarea el `＋` no significa lo que dice —ahí
     `＋` inserta bloques, que es otro botón y está en la fila—. Se esconden en vez de no hacer
     nada: un control que no responde se toca dos veces antes de darse por vencido.

     Va ANTES del contador porque cerrar el buscador vacía lo buscado, y el número tiene que
     salir del filtro que efectivamente quedó puesto. */
  $('#bBuscar').hidden = sinTareas(vAhora) || !!paginaTarea;
  $('#bFab').hidden = !!paginaTarea;
  /* Y lo buscado se vacía SOLO al irse a la caja, no al entrar a una tarea. Con el botón
     escondido no quedaría con qué cerrar el buscador, y un filtro puesto detrás de un campo que
     no está en pantalla es la forma más rápida de que el tablero parezca vacío sin que se vea
     por qué. Adentro de una página el caso es otro: la búsqueda sigue ahí, escondida con el
     resto de los filtros, y al volver el tablero tiene que estar como se lo dejó — buscar algo,
     entrar a lo que apareció y volver es exactamente para lo que se busca. */
  if (sinTareas(vAhora)) cerrarBuscador();

  $('#mVista').textContent = vAhora.label;
  $('#mCont').textContent = vAhora.caja
    ? `${datos.caja.length} ${datos.caja.length === 1 ? 'movimiento' : 'movimientos'}`
    : vAhora.backlog
      ? `${nBacklog} ${nBacklog === 1 ? 'anotada' : 'anotadas'}`
      : `${datos.tareas.filter(t => visible(t) && t.estado !== HECHO).length} sin cerrar`;
  // El avatar del encabezado es la puerta al cajón. Sin identidad cargada queda el hueco: el
  // cajón tiene que poder abrirse igual, que ahí adentro está «cerrar sesión».
  $('#bYo').innerHTML = YO.id
    ? `<span class="av mini" style="background:${colorPersona(YO.id)}">${esc(iniPersona(YO.id))}</span>`
    : '<span class="av mini off">?</span>';

  // El filtro de personas con forma de menú, para el teléfono. Va acá y no en `render()` para
  // que el enganche de abajo lo alcance: es el mismo dato que los chips de al lado.
  pintarFiltroPend();

  // Cambiar de pestaña sale de la página: si no, se elegiría una vista que no se ve.
  $$('[data-vista]').forEach(b => b.onclick = () => {
    cerrarPagina();
    if (UI.vista !== b.dataset.vista) { menuFila = null; renombrando = null; bautizando = null; }
    UI.vista = b.dataset.vista; guardarUI(); render();
  });

  $('#chipsPend').innerHTML = PERSONAS.map(p =>
    `<button class="chip${UI.f.pend.includes(p.id) ? ' on' : ''}" data-persona="${escA(p.id)}">
       <span class="av mini" style="background:${p.color}">${esc(p.ini)}</span>${esc(p.id === YO.id ? 'Lo mío' : p.nombre)}
     </button>`).join('');
  $$('[data-persona]').forEach(b => b.onclick = () => {
    const k = b.dataset.persona, i = UI.f.pend.indexOf(k);
    i > -1 ? UI.f.pend.splice(i, 1) : UI.f.pend.push(k);
    render();
  });
}

/* El filtro de prioridad admite varias a la vez —el de personas ya lo hacía—, así que no
   puede ser un <select>: es un botón con un menú de tildes. El rótulo dice qué hay puesto
   sin tener que abrirlo, y el menú no se cierra al elegir, que es toda la gracia de poder
   marcar tres de un saque.

   Se repinta entero en cada render, pero el elemento del menú es el del HTML: así el
   abierto/cerrado sobrevive al repintado que dispara cada tilde. */
function pintarFiltroPrioridad(){
  const cont = $('#fPrioridad');
  const boton = cont.querySelector('.sel'), menu = cont.querySelector('.selmenu');
  const puestas = UI.f.prioridades;
  boton.textContent = !puestas.length ? 'Prioridad'
    : puestas.length === 1 ? prioridadDe(puestas[0]).label
    : `${puestas.length} prioridades`;
  boton.classList.toggle('activo', puestas.length > 0);
  menu.innerHTML = PRIORIDADES.map(p => {
    const on = puestas.includes(p.id);
    return `<button type="button" data-prio="${escA(p.id)}"${on ? ' class="on"' : ''} aria-pressed="${on}">
      <i class="pdot" style="background:${p.color}"></i>${esc(p.label)}
      <span class="tick">${on ? '✓' : ''}</span>
    </button>`;
  }).join('');
}

/* El gemelo del de prioridad, para el teléfono: las mismas personas de `#chipsPend` con la
   forma del menú de tildes. En 390px de ancho tres chips con avatar y nombre no entran en el
   renglón, y apilarlos se come media pantalla antes de que empiece la lista.

   **Las dos formas van siempre al HTML y el CSS elige cuál se ve**, la misma regla del riel y
   los avatares de la fila: cuál corresponde es una pregunta de ancho de pantalla. Las dos
   escriben en el mismo `UI.f.pend`, así que no hay dos filtros que mantener de acuerdo. */
function pintarFiltroPend(){
  const cont = $('#fPend');
  const boton = cont.querySelector('.sel'), menu = cont.querySelector('.selmenu');
  const puestas = UI.f.pend;
  boton.textContent = !puestas.length ? 'Responsable'
    : puestas.length === 1 ? (puestas[0] === YO.id ? 'Lo mío' : nombrePersona(puestas[0]))
    : `${puestas.length} personas`;
  boton.classList.toggle('activo', puestas.length > 0);
  // `data-fpend` y no `data-persona`: ese lo engancha el bucle de los chips con un `onclick`
  // directo, y con el mismo atributo cada tilde de acá se contaría dos veces.
  menu.innerHTML = PERSONAS.map(p => {
    const on = puestas.includes(p.id);
    return `<button type="button" data-fpend="${escA(p.id)}"${on ? ' class="on"' : ''} aria-pressed="${on}">
      <span class="av mini" style="background:${p.color}">${esc(p.ini)}</span>${esc(p.id === YO.id ? 'Lo mío' : p.nombre)}
      <span class="tick">${on ? '✓' : ''}</span>
    </button>`;
  }).join('');
}

/* Abrir y cerrar cualquiera de los dos menús de filtro. Fue `abrirMenuPrioridad()` hasta que
   el teléfono sumó el de personas: con una función por menú, el segundo llega con su propia
   copia del abierto/cerrado y del `aria-expanded`. */
function abrirSelmulti(id, ver){
  const cont = $(id);
  const menu = cont.querySelector('.selmenu'), boton = cont.querySelector('.sel');
  const mostrar = ver == null ? menu.hidden : ver;
  menu.hidden = !mostrar;
  boton.setAttribute('aria-expanded', String(mostrar));
}
const selmultiAbierto = id => !$(id + ' .selmenu').hidden;

function textoBuscable(t){
  return [
    t.tarea, explATexto(t.expl), t.id,
    (t.subtareas || []).map(s => s.titulo + ' ' + (s.expl || '')).join(' '),
    (t.chat || []).map(m => m.texto).join(' '),
    // Los avisos van acá y no en `explATexto()`: se buscan, pero no son la explicación.
    avisosDeExpl(t.expl).map(a => a.texto).join(' '),
  ].join(' ').toLowerCase();
}
function visible(t){
  const f = UI.f, v = vistaActual();
  // El tablero muestra lo que ya salió del backlog. El backlog muestra lo que todavía no
  // salió y, además, lo ya mandado que tenga sprint: al cerrar un sprint uno quiere ver el
  // sprint entero. Una sola línea acá porque todo lo que pinta tareas pasa por este filtro.
  if (v.backlog ? !enBacklog(t) : !!t.backlog) return false;
  // Ninguna prioridad marcada es «todas». Se compara contra `prioridadDe()` y no contra el
  // campo crudo para que una fila vieja o con el campo vacío caiga en la misma banda por la
  // que el tablero la apila.
  if (f.prioridades.length && !f.prioridades.includes(prioridadDe(t.prioridad).id)) return false;
  if (f.pend.length && !f.pend.some(p => (t.pend || []).includes(p))) return false;
  if (f.q && !textoBuscable(t).includes(f.q)) return false;
  return true;
}
const filtrando = () => {
  const f = UI.f;
  return !!f.q || f.pend.length > 0 || f.prioridades.length > 0;
};

/* ============================================================
   Render principal
   ============================================================ */
function render(){
  pintarChrome();
  // El de prioridad: un botón con su menú, que se marca solo. El de personas es su gemelo y se
  // pinta adentro de `pintarChrome()`, junto a los chips, que son la otra cara del mismo dato.
  pintarFiltroPrioridad();
  const v = vistaActual();

  /* Una tarea abierta como página se come el board entero, venga del backlog o del tablero:
     es una pantalla, no un modal. Va antes que todo lo demás porque no depende de la vista.

     El árbol se rearma con lo último que llegó de la base salvo que haya un guardado en
     vuelo: así un cambio de otro se ve al toque, y lo que estás escribiendo no se pisa con
     una versión vieja del servidor. */
  if (paginaTarea && !tarea(paginaTarea)) cerrarPagina();
  if (paginaTarea) {
    const t = tarea(paginaTarea);
    // El `!paginaArbol` es para volver con el «atrás» del navegador: si se sale de una tarea
    // mientras su guardado está en vuelo y se vuelve a entrar enseguida, el árbol quedó en
    // `null` y el guardado sigue pendiente, así que sin esto la página se pintaría vacía.
    if (!paginaArbol || !pendientesGuardado.has('tarea:' + t.id + ':expl')) {
      paginaArbol = arbolDeTarea(t);
    }
    elFiltros.hidden = true;
    board.classList.remove('cmode', 'bmode');
    board.classList.add('pgmode');
    board.onclick = board.oninput = board.onchange = board.onkeydown = board.onfocusout = null;
    board.onpaste = board.ondragover = board.ondrop = null;
    return renderPagina();
  }
  board.classList.remove('pgmode');

  /* Las tres vistas dibujan hojas de renglones y nada más: la caja, el backlog y el tablero.
     El tablero en lista NO es una vista aparte —es el mismo tablero, con los mismos filtros y
     el mismo contador, dibujado con el componente del backlog pero agrupado por estado—, y por
     eso sigue siendo `estado` en `VISTAS` y no una entrada nueva.

     Antes acá se cruzaba la vista con `UI.layout` para saber si tocaba lista o tarjetas. Con
     las dos formas de tarjeta afuera (26/8/2026) no hay nada que cruzar: si no es la caja ni el
     backlog, es la lista. */
  // La caja y el backlog ocupan el board entero igual que el tablero. Los filtros solo se
  // esconden en la caja — en el backlog buscar y filtrar sirve igual que en el tablero.
  elFiltros.hidden = sinTareas(v);
  board.classList.toggle('cmode', !!v.caja);
  // `bmode` es el envoltorio de la lista de renglones, no «la vista Backlog»: lo lleva
  // cualquiera que dibuje esa hoja, venga del backlog o del tablero.
  board.classList.toggle('bmode', !v.caja);
  /* Acá se soltaban los manejadores del board al volver al tablero de tarjetas, que no los
     usaba, y se cerraba de paso el menú `⋯`. Ya no hace falta ninguna de las dos cosas: las
     tres vistas son hojas de renglones y las tres cuelgan los suyos del board entero, cada una
     apagando a mano los que la otra usa y ella no (el enganche de la caja y `engancharLista()`).
     El menú lo cierra su propio manejador global de clic, como siempre. */

  if (v.caja) return renderCaja();
  if (v.backlog) return renderBacklog();
  renderListaEstados();
}

/* ---------- acá vivía el tablero de tarjetas ----------
   `renderTablero()` (una columna por estado y, adentro, una banda por prioridad),
   `tarjetaHTML()`, `conectarTablero()`, `tarjetaDespuesDe()`, `soltarTarea()` y el autoscroll
   del arrastre —el que corría el tablero solo mientras la tarjeta se sostenía contra el borde—.

   **Se fue todo el 26/8/2026 por pedido**, junto con los dos layouts de tarjeta. El tablero se
   dibuja ahora con `renderListaEstados()` y nada más.

   Qué hacía cada cosa y dónde quedó, para no volver a buscarlo:

   - **Arrastrar entre columnas y entre bandas** —soltar en la banda «Urgente» de otra columna
     cambiaba el estado y la prioridad de una— es `engancharArrastreLista()`, que arrastra entre
     bloques y entre bandas igual (ver `adoptarBanda` en `LISTAS.estado`).
   - **La solapa plegada de Terminadas** es el bloque plegado de la lista, con la misma
     preferencia `UI.terminadasAbiertas`.
   - **La barrita `.rail`**, que medía cuánto del tablero estaba parado en cada estado, es la
     pill de porcentaje de `filaEstadoHTML()`.
   - **El «+ Agregar tarea» del pie de la columna** es el `＋` de la canaleta y el del final del
     bloque, los dos por `nuevaEnEstado()`.

   Lo único que NO tenía reemplazo era la ficha: la tarjeta era su última puerta. Volvió al menú
   `⋯` de la fila, de donde había salido ese mismo día — ver `menuTareaHTML()`. */

/* El renglón con el que nace toda tarea: el enlace del video se pega ahí adentro, en la
   explicación, como cualquier otra cosa que se escriba. Es un recordatorio, no un campo.
   Hasta el 26/8/2026 el Loom fue un input aparte en la barra de clasificación y la condición
   para salir al tablero; se sacó porque frenar el pase por un campo vacío hacía que la regla
   se peleara con el trabajo en vez de ayudarlo.

   Va como texto plano y no como bloque: la explicación de la ficha se edita solo mientras
   `expl` no esté en bloques (ver `pintarExpl()`), así que nacer en bloques dejaría a toda
   tarea nueva con su campo de solo lectura. La columna `loom` sigue en la base con lo que ya
   tenía cargado: no se migró nada. */
const TEXTO_LOOM = 'LOOM: ';

// La forma completa de una tarea recién nacida, en un solo lugar: la usan el tablero y el
// backlog, que crean exactamente la misma fila y solo difieren en dónde la muestran.
function tareaVacia(id){
  const t = {
    id, modulo:'', tarea:'', expl:TEXTO_LOOM, estado:'Pendiente', img:'', com:'', fecha:'',
    files:[], chat:[], subtareas:[], prioridad:'semanal', tipo:'nuevo',
    // `hoy` es la columna muerta del sistema de marcar tareas para el día, reusada como «esta
    // actividad todavía es nueva en el tablero» (ver la novedad de una actividad). Nace en
    // `true`: toda tarea es nueva hasta que alguien entra a mirarla.
    hoy:true, pend:[], creada:new Date().toISOString(), orden:0,
    backlog:false, sprint:SIN_SPRINT, dep:'', loom:'',
  };
  /* La que acabás de crear no es novedad para vos: la chapa roja es para el resto. Va acá, que
     es la única puerta por la que nace una tarea, y no en cada uno de los tres creadores —con
     tres copias, olvidarse en una alcanza para que la regla no valga. Se marca con la prioridad
     con la que nace: si no, el primer cambio de prioridad te encendería tu propia tarea. */
  marcarVista(id, prioridadDe(t.prioridad).id);
  return t;
}

/* Ninguna tarea nace sin dueño, y el corte va acá: antes de que la fila exista, no en cada
   botón. Hay cuatro caminos hasta la creación —el «＋» de cada columna, «Nueva», el «＋» de
   cada sprint y el Enter de la lista del backlog— y olvidarse en uno solo alcanzaría para
   que la regla no valga.

   Si el menú se cierra sin elegir, no se crea nada: es la única forma de que la invariante
   valga de verdad. Con la fila ya nacida y esperando responsable, cualquier recarga la deja
   guardada sin nadie, que es justo lo que se quiere evitar. */
function pedirResponsable(anclaje, ev, crear){
  ev?.stopPropagation();
  // Sin nadie cargado en `APP_CONFIG.personas` no hay a quién elegir, y un menú vacío dejaría
  // el tablero sin poder crear una sola tarea. Se avisa y no se crea nada: el arreglo es de
  // configuración, no algo que se pueda resolver desde acá.
  if (!PERSONAS.length) { aviso('No hay personas cargadas: sin responsable no se puede crear una tarea'); return; }
  abrirMenu(anclaje, 'pend', null, quien => { if (quien) crear(quien); }, '¿Quién la hace?');
}

/* Acá vivía `nuevaTarea()`, la que creaba desde el «＋» del pie de una columna y desde
   «+ Nueva tarea»: mandaba la fila al final de TODAS las tareas y abría la ficha. Se fue con
   las tarjetas (26/8/2026) y las dos puertas quedaron en `nuevaEnEstado()`, que ya existía para
   el `＋` de la lista y hace las dos cosas mejor: calcula el `orden` contra las hermanas de su
   banda de prioridad —apilado por prioridad, el final de la lista no es el final del bloque— y
   entra a la página en vez de abrir el modal. Dos creadores para lo mismo eran dos lugares
   donde arreglar el día que el orden se calcule distinto. */

/* ============================================================
   Detalle de la tarea (modal)
   ============================================================ */
const actual = () => tarea(tareaAbierta);

function abrirTarea(id, foco){
  const t = tarea(id); if (!t) return;
  tareaAbierta = id;

  llenarSelect($('#tEstado'), ESTADOS); $('#tEstado').value = t.estado;
  llenarSelect($('#tPrioridad'), PRIORIDADES); $('#tPrioridad').value = t.prioridad;
  /* Mientras está en el backlog, la prioridad no se toca en ningún lado: si la pill de la fila
     no está pero el selector de la ficha sí, la regla dura hasta que alguien abre la ficha. Se
     esconde y no se deshabilita —un `<select>` gris invita a preguntar por qué no anda—, y
     vuelve sola cuando la tarea pasa al tablero. */
  $('#tPrioridad').hidden = !!t.backlog;
  // El sprint se guarda igual en las tareas que ya están en el tablero: sirve para mirar,
  // al cerrar un sprint, qué salió de cada uno.
  llenarSelect($('#tSprint'), opcionesSprint(), 'Sin grupo');
  $('#tSprint').value = t.sprint ? String(t.sprint) : '';
  $('#tArea').value = t.modulo || '';
  $('#tDep').value = t.dep || '';
  pintarBotonBacklog(t);

  $('#tTitulo').value = t.tarea;
  pintarExpl(t);
  // Se vacía siempre: lo tipeado y no guardado en una tarea no puede aparecer en otra.
  $('#tMsg').value = '';
  // Fecha y antigüedad juntas: la fecha sola obliga a hacer la cuenta de cabeza, y el «hace
  // tanto» solo no deja ubicar la tarea en la semana en que se anotó.
  const nacimiento = antiguedad(t.creada);
  $('#tMeta').innerHTML = nacimiento
    ? `Creada el ${esc(nacimiento.exacta)} · <i class="edad" data-edad="${escA(t.creada)}" data-edad-pre="hace ">hace ${esc(nacimiento.txt)}</i>`
    : '';
  $('#tPasoNew').value = '';
  // Lo que está vacío arranca plegado: el alto que no gasta es el de la explicación. Se
  // decide solo acá, al abrir — si se decidiera en cada repintado, cerrar una ficha a mano
  // duraría hasta el próximo tilde.
  $('#tSecPasos').open = !!(t.subtareas || []).length;
  $('#tSecChat').open  = !!(t.chat || []).length;
  $('#tSecFiles').open = !!(t.files || []).length;
  pintarPend(t); pintarPasos(t); pintarConversacion(t); pintarArchivos(t);
  $('#scrimTarea').classList.add('on');
  autoGrow($('#tTitulo'));
  if (foco) setTimeout(() => $('#tTitulo').focus(), 40);
}

/* ---------- explicación: texto con las imágenes adentro ----------
   El campo dejó de ser un `<textarea>`: pegar una captura en el medio de lo escrito era el
   pedido, y un textarea pinta texto y nada más. Ahora es un `contenteditable`.

   Lo guardado sigue siendo la misma columna `expl` de siempre, pero puede venir en dos
   formas: texto plano (todo lo escrito hasta el 11/8/2026) o HTML nuestro. Se distinguen
   por una marca al principio y no adivinando si hay un `<` suelto: una explicación vieja
   que hable de `<div>` no tiene por qué volverse markup de golpe.

   Lo que se pega y no es una imagen entra SIEMPRE como texto plano. Esa es la razón por la
   que acá no hay un sanitizador: si nunca entra HTML ajeno, no hay nada que limpiar. */
const MARCA_HTML = '<!--h-->';
const esExplHtml = s => typeof s === 'string' && s.startsWith(MARCA_HTML);
const explAHtml  = s => esExplHtml(s) ? s.slice(MARCA_HTML.length) : esc(s || '');

/* ---------- tercera forma de la misma columna: la página ----------
   Desde el 26/8/2026 `expl` puede venir además como un árbol de bloques en JSON, detrás de
   la marca `<!--b-->`. Es lo que pinta la página de la tarea: renglones de texto,
   encabezados, desplegables, tildes y subpáginas, unos adentro de otros.

   Va en la misma columna y no en una nueva a propósito: es el mismo dato de siempre —lo
   que hay que hacer y cómo—, solo que ahora con estructura. Una columna aparte obligaría a
   decidir, en cada lectura, cuál de las dos manda; y sobre todo obligaría a una migración,
   que es justo lo que todavía está pendiente.

   Las tres formas conviven y se distinguen por la marca del principio, nunca adivinando:
   una explicación vieja que hable de `<div>` o que empiece con una llave no tiene por qué
   volverse markup ni JSON de golpe. Una fila vieja se convierte a bloques recién cuando
   alguien entra a su página y escribe algo. */
const MARCA_BLOQUES = '<!--b-->';
const esExplBloques = s => typeof s === 'string' && s.startsWith(MARCA_BLOQUES);

/* Un bloque es `{ id, k, txt }` más lo que pida su tipo:
     text    renglón suelto
     h       encabezado
     toggle  desplegable — `open` + `kids`
     check   tilde del checklist — `sid` apunta a la subtarea, el texto NO vive acá
     page    subpágina — `kids`, se entra en vez de desplegarse
     file    archivo adjunto — `f` ({n,t,path,size,b}) + `open` + `w` (ancho en %)
     hdr     el cuadro de avisos de la tarea — `avisos`, NO se dibuja entre los bloques
   El `check` guarda una referencia y no el texto porque el checklist de verdad sigue
   siendo `subtareas`: ahí están el responsable, el estado y los archivos de cada paso. Dos
   listas de pasos sobre la misma tarea sería la peor de las opciones.

   El `file` es UNO solo para todo lo que se adjunta y no un tipo por formato: una imagen
   es un archivo que además se puede dibujar, no otra cosa. Lo que cambia es `open` —
   plegado se ve la ficha del archivo y se abre; desplegado, la imagen queda pegada en la
   hoja y el PDF o el HTML se leen en un marco ahí mismo. Con un `img` aparte, la misma
   captura se comportaría distinto según si se pegó o si se eligió del disco. */
let _seqBloque = 0;
const idBloque = () => 'k' + Date.now().toString(36) + (++_seqBloque).toString(36);
function nuevoBloque(k, txt, extra){
  return Object.assign(
    { id: idBloque(), k, txt: txt || '' },
    k === 'toggle' || k === 'page' ? { open: true, kids: [] } : null,
    extra || null);
}
const puedeAnidar = b => !!b && (b.k === 'toggle' || b.k === 'page');

/* ---------- qué se puede mirar sin salir de la hoja ----------
   La imagen va como imagen. El PDF, el HTML y cualquier cosa de texto entran en un marco
   aparte, sin permiso para ejecutar nada: lo que se adjunta lo subió alguien del equipo,
   pero un `<iframe>` suelto con scripts sobre un archivo que alguien pegó es una puerta que
   no hace falta abrir. Del resto —un zip, un .docx— no hay nada que dibujar, así que esos
   ni siquiera ofrecen el pliegue: se abren en una pestaña y listo. */
const esImagenArchivo = f => /^image\//.test((f && f.t) || '');
function seVeAdentro(f){
  const tipo = (f && f.t) || '';
  return esImagenArchivo(f) || tipo === 'application/pdf' || /^text\//.test(tipo);
}
const archivoDe = b => (b && b.f) || {};

/* Los `img` de la primera versión de la página guardaban la imagen suelta en el bloque.
   Ahora eso es un `file` con `open` en verdadero — el mismo dibujo de siempre, pero
   plegable. Se convierten al LEER y no con una migración: la fila se reescribe recién
   cuando alguien la guarda, igual que ya pasó con el texto plano y con el HTML. */
function normalizarArchivos(lista){
  (lista || []).forEach(b => {
    if (b.k === 'img') {
      b.k = 'file';
      b.open = true;
      // `image/*` y no el tipo real: lo que se guardó fue una imagen, y de qué formato era
      // no lo sabe nadie a esta altura. Alcanza para que `esImagenArchivo()` la dibuje.
      b.f = { n: b.alt || 'imagen', t: 'image/*', path: b.path || '', b: b.b || '', size: 0 };
      delete b.alt; delete b.path; delete b.b;
    }
    if (b.kids) normalizarArchivos(b.kids);
  });
  return lista;
}

/* ---------- la cabecera: los avisos ----------
   Un cuadro arriba de todo, en la página de la tarea. Lo que se escribe ahí nace SIN VISTO
   y se pinta resaltado en rojo hasta que alguien le pone visto o lo borra.

   Es UN solo cuadro y no un renglón por persona: los avisos son de la tarea, no de nadie en
   particular. Un renglón por cabeza obliga a elegir destinatario antes de escribir, y lo que
   pasa cuando hay que elegir algo para poder anotar es que no se anota. Tampoco lleva firma
   a la vista —el nombre queda en el `title`— porque el cuadro tiene que leerse de un vistazo
   y una firma por renglón lo llenaría de nombres.

   Vive como un bloque más del árbol de `expl` y no en una columna nueva, por lo mismo que
   la página entera: con la v5 y la v7 todavía sin correr, una columna sería condenar la
   pantalla a esperar. Se distingue por su `k` y nunca se dibuja entre los bloques, así que
   no hay forma de arrastrarlo, indentarlo ni borrarlo desde el cuerpo.

   No se crea al abrir: `cabeceraDe()` puede devolver `null` y la pantalla pinta igual, con
   el cuadro vacío. Materializa recién cuando alguien escribe un aviso (`cabeceraEditable()`).
   Una tarea vieja que solo se mira no se convierte a bloques por haberla mirado, que es la
   misma regla que ya tenía la página. */
const K_HDR = 'hdr';
const cabeceraDe = arbol => (arbol || []).find(b => b.k === K_HDR) || null;
const avisosDe = h => (h && h.avisos) || [];

function cabeceraEditable(arbol){
  let h = cabeceraDe(arbol);
  if (!h) { h = nuevoBloque(K_HDR, '', { avisos:[] }); arbol.unshift(h); }
  h.avisos = h.avisos || [];
  return h;
}

/* Deja el árbol con a lo sumo una cabecera y en su lugar. Nunca la crea: si no hay, no hay
   nada que ordenar. Que arrastrar pueda dejar algo por encima es imposible —la cabecera no
   se dibuja entre los bloques—, pero un `expl` escrito por otra versión sí podría traerla
   corrida o repetida, y ahí adivinar cuál manda es peor que fijar la regla. */
function normalizarCabecera(arbol){
  const h = cabeceraDe(arbol);
  if (!h) return arbol;
  h.avisos = h.avisos || [];
  // Primero al frente y recién después el descarte: al revés, el `indexOf` del que se
  // quedó apuntaría a un índice ya movido.
  if (arbol[0] !== h) { arbol.splice(arbol.indexOf(h), 1); arbol.unshift(h); }
  for (let i = arbol.length - 1; i > 0; i--) if (arbol[i].k === K_HDR) arbol.splice(i, 1);
  return arbol;
}

let _seqAviso = 0;
const nuevoAviso = texto => ({
  id: 'a' + Date.now().toString(36) + (++_seqAviso).toString(36),
  texto, autor: YO.id || '', ts: new Date().toISOString(), visto: false, para: [],
});

/* Para quién es el aviso (26/8/2026, por pedido). Hasta ese día el cuadro no tenía
   destinatario a propósito: se había probado con un renglón por persona y elegir a quién
   antes de poder escribir es justo lo que hace que no se anote nada. Eso sigue valiendo y por
   eso el destinatario **se elige después de escrito y es opcional**: el aviso se manda con
   Enter como siempre y recién ahí, si hace falta, se le pone nombre.

   `para` vacío significa «para todos», que es exactamente lo que valía para cada aviso antes
   de que el campo existiera: por eso no hay nada que migrar. Todo lo que lee el campo pasa por
   `destinatariosDe()`, que además filtra a quien ya no está en `APP_CONFIG.personas` — un
   aviso dirigido a alguien que se fue volvería invisible para todos.

   Ojo: el destinatario decide a quién le SUENA la chapa, no quién puede leerlo. El aviso se
   dibuja igual para cualquiera que entre a la tarea: el cuadro es de la tarea, no un buzón. */
const destinatariosDe = a => ((a && a.para) || []).filter(id => persona(id));
const avisoParaMi = a => { const p = destinatariosDe(a); return !p.length || p.includes(YO.id); };

/* ---------- la novedad de una actividad ----------
   La chapa roja que se le pone a la actividad cuando adentro hay algo que todavía no se
   miró. Son dos cosas distintas con el mismo cartel a propósito: la pregunta que contesta es
   una sola —¿hay algo nuevo acá?— y dos chapas distintas obligarían a aprenderse cuál es
   cuál antes de que sirvan para algo.

     · Avisos sin ver que sean para vos. Un aviso sin destinatario es para todos; uno dirigido
       le suena solo a quien nombraron. El visto lo pone cualquiera y lo apaga para todos.
     · La actividad asignada a vos que todavía es nueva en el tablero y que este navegador no
       abrió nunca.
     · La actividad asignada a vos a la que le cambiaron la prioridad después de la última vez
       que entraste.

   **La novedad es del tablero y de nadie más.** En el backlog no se dibuja ninguna chapa y
   entrar a una tarea de ahí no la marca como vista: el backlog es planificación, se lee
   entero y varias veces, y si mirarla ahí contara como haberla visto llegaría apagada al
   tablero, que es justo donde tiene que llamar la atención.

   La segunda son dos datos y no uno, y esa es toda la gracia:

     · Que la actividad **sea** nueva es compartido y vive en la columna `hoy` — la del
       sistema de marcar tareas para el día, muerta desde el 26/8/2026 y reusada acá, igual
       que se reusó `modulo` para el «Área» del backlog. Se prende al nacer y se vuelve a
       prender cada vez que una tarea pasa del backlog al tablero: llega como nueva **siempre**,
       aunque se haya anotado hace dos meses. Una columna nueva habría dejado esto esperando a
       una migración, y hay dos pendientes hace semanas.
     · Que **vos** ya la hayas abierto es del navegador de cada uno, como el plegado del
       backlog: «yo no la abrí» es una pregunta sobre vos, no sobre la fila. Contra: si entrás
       desde otra máquina, la chapa vuelve.

   Con la marca compartida no hace falta ningún corte por fecha: solo se prenden las que
   alguien creó o mandó al tablero, no toda tarea que exista. Las de antes de esta regla
   tienen `hoy` en `false` y no se encienden nunca — no se migró nada.

   **La chapa de la actividad es del responsable y no del equipo** (26/8/2026, por pedido).
   Hasta ese día la veía cualquiera, con el argumento de que una tarea que aparece en el
   tablero es algo que el equipo tiene que notar. En la práctica eso son cuarenta chapas rojas
   para todos y ninguna dirigida a nadie, que es el ruido que hace que se dejen de mirar. Ahora
   sale de `pend`, que es el único lugar donde vive quién la hace. Contrapartidas asumidas: sin
   identidad cargada en `APP_CONFIG.personas` no le suena a nadie —el tablero no sabe quién
   sos, mal puede decirte que algo es tuyo—, y una tarea sin responsable tampoco, que es un
   caso que la invariante de `pend` ya no deja crear.

   **Y vuelve a sonar cuando le cambian la prioridad**, para el mismo responsable y por el
   mismo motivo por el que suena al llegar: que algo que era semanal pase a crítica es
   exactamente el momento en que hay que volver a entrar. Por eso lo guardado por cada
   navegador dejó de ser «la vi» y pasó a ser **con qué prioridad la vi**: `vistas` es un mapa
   `id → prioridad` y no un conjunto de ids. Es la misma jugada de siempre —el dato es del
   navegador de cada uno, no de la fila— y por eso no hay migración de base.

   El formato viejo (`{ids:[...]}`) entra como `''`, «vista, no sé con qué prioridad», y el
   corte de `prioridadSinVer()` pide que la guardada exista: una marca vieja no puede prender
   una chapa por un cambio que nunca llegó a registrar. Sin eso, el primer pintado después de
   este cambio le encendería a cada uno todas las tareas que ya había mirado. */
let vistas = new Map();
try {
  const g = JSON.parse(localStorage.getItem('tablero-vistas') || '{}');
  if (Array.isArray(g.ids)) g.ids.forEach(id => vistas.set(id, ''));
  if (g.vistas && typeof g.vistas === 'object') {
    Object.entries(g.vistas).forEach(([id, p]) => vistas.set(id, typeof p === 'string' ? p : ''));
  }
} catch (e) { /* si no se puede leer, no se marca ninguna y listo */ }
function guardarVistas(){
  try {
    localStorage.setItem('tablero-vistas', JSON.stringify({ vistas: Object.fromEntries(vistas) }));
  } catch (e) { /* modo privado o storage lleno: no es crítico */ }
}

// Los avisos de una tarea, leídos del `expl` guardado. Sin la marca de bloques no hay nada.
const avisosDeExpl = s => esExplBloques(s) ? avisosDe(cabeceraDe(bloquesDeExpl(s))) : [];

/* Son cientos de tarjetas por repintado: un `JSON.parse` en cada una para no encontrar nada
   no se paga. La marca se busca primero en el texto crudo, que es una comparación de
   cadenas, y recién si está se arma el árbol. */
function avisosSinVer(t){
  if (!esExplBloques(t.expl) || !t.expl.includes('"visto":false')) return 0;
  return avisosDeExpl(t.expl).filter(a => !a.visto && avisoParaMi(a)).length;
}

/* Las tres de abajo son mías o no son de nadie: la chapa dejó de ser del equipo. Sin identidad
   resuelta (`YO.id` vacío) no suena nada — ver el cuadro de arriba. */
const miTarea = t => !!YO.id && (t.pend || []).includes(YO.id);

// Nueva en el tablero, mía, y sin abrir por mí.
const nuevaSinAbrir = t => !t.backlog && miTarea(t) && !!t.hoy && !vistas.has(t.id);

/* Mía y con otra prioridad que la que tenía la última vez que entré. Pide que la guardada
   exista: `''` es una marca del formato viejo —«la vi, no sé con qué prioridad»— y no puede
   contar como un cambio. */
function prioridadSinVer(t){
  if (t.backlog || !miTarea(t)) return false;
  const vista = vistas.get(t.id);
  return !!vista && vista !== prioridadDe(t.prioridad).id;
}

function novedadDe(t){
  const avisos = avisosSinVer(t);
  if (avisos) {
    return { n: avisos, txt: `${avisos} ${avisos === 1 ? 'aviso sin ver' : 'avisos sin ver'}` };
  }
  if (nuevaSinAbrir(t)) return { n: 1, txt: 'Nueva en el tablero y asignada a vos: todavía no entraste' };
  if (prioridadSinVer(t)) {
    return { n: 1, txt: `Le cambiaron la prioridad: ahora es ${prioridadDe(t.prioridad).label.toLowerCase()}` };
  }
  return null;
}
function chapaNovedad(t){
  const nv = novedadDe(t);
  return nv ? `<span class="nuevo" title="${escA(nv.txt)}">${nv.n}</span>` : '';
}
/* Entrar a la página es haberla visto, y con qué prioridad la viste es parte de la marca.
   Devuelve si algo cambió, para no repintar de gusto. */
function marcarVista(id, prioridad){
  const p = prioridad || '';
  if (vistas.get(id) === p) return false;
  vistas.set(id, p);
  guardarVistas();
  return true;
}

/* La única puerta que le cambia la prioridad a una tarea desde esta pantalla. La regla que
   encierra es «lo que cambiás vos no te avisa a vos», la misma que ya tenía `tareaVacia()` con
   la tarea recién creada: sin esto, subirle la prioridad a algo tuyo te encendería tu propia
   chapa. Las cinco puertas que escriben `prioridad` —el menú, la ficha, las dos formas de
   arrastrar y el pase al tablero— pasan por acá; la regla vive en un lugar y no en cada una.

   Pone al día la marca solo si YA existía: si nunca entraste, la chapa de «nueva» tiene que
   quedarse esperando, que para eso está. */
function ponerPrioridad(t, v){
  t.prioridad = v;
  if (vistas.has(t.id)) marcarVista(t.id, prioridadDe(v).id);
}

function bloquesDeExpl(s){
  if (esExplBloques(s)) {
    try {
      const arr = JSON.parse(s.slice(MARCA_BLOQUES.length));
      return Array.isArray(arr) ? normalizarArchivos(arr) : [];
    // JSON roto: antes que perder lo escrito, entra tal cual como un renglón. Nada de
    // llamar a `explATexto()` acá — pasa por esta misma función y no volvería nunca.
    } catch (e) { return [nuevoBloque('text', s.slice(MARCA_BLOQUES.length))]; }
  }
  if (esExplHtml(s)) return bloquesDeHtml(s.slice(MARCA_HTML.length));
  return String(s || '').split(/\r?\n/).map(l => nuevoBloque('text', l));
}

/* Lo escrito antes de los bloques era un `contenteditable` que solo aceptaba texto plano e
   imágenes: no hay negritas ni enlaces que perder, así que la conversión es fiel. Cada
   corte de línea abre un bloque nuevo y cada `<img>` es el suyo. */
function bloquesDeHtml(html){
  const salida = [];
  let buffer = '';
  const cerrar = () => {
    // Un `contenteditable` mete espacios duros (U+00A0) al tipear. En texto plano son un
    // espacio como cualquier otro, y dejarlos hace fallar cualquier busqueda de dos palabras
    // seguidas. Va con escape: un espacio duro suelto adentro de una regex no se ve.
    const s = buffer.replace(/ /g, ' ').trim();
    buffer = '';
    if (s) salida.push(nuevoBloque('text', s));
  };
  const recorrer = nodo => {
    for (const n of nodo.childNodes) {
      if (n.nodeType === 3) { buffer += n.nodeValue; continue; }
      if (n.nodeName === 'BR') { cerrar(); continue; }
      if (n.nodeName === 'IMG') {
        cerrar();
        salida.push(nuevoBloque('file', '', {
          open: true, w: n.style.width || '',
          f: { n: n.alt || 'imagen', t: 'image/*', path: n.dataset.path || '', b: n.dataset.b || '', size: 0 },
        }));
        continue;
      }
      const corta = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE)$/.test(n.nodeName);
      if (corta) cerrar();
      recorrer(n);
      if (corta) cerrar();
    }
  };
  recorrer(fragmentoExpl(html));
  cerrar();
  return salida;
}

/* Lo que todavía está subiendo no tiene clave en el bucket todavía —y si es una imagen,
   apunta a un `blob:` que muere al recargar—: se guarda el árbol sin esos bloques y cada
   uno entra solo cuando su subida termina. Es la misma regla que ya tenía `leerExpl()` con
   los `<img class="cargando">`. */
function explDeBloques(lista){
  const limpiar = l => l
    .filter(b => !(b.k === 'file' && (b.cargando || !archivoDe(b).path)))
    .map(b => {
      const c = Object.assign({}, b);
      delete c.cargando; delete c.blob;
      if (c.kids) c.kids = limpiar(c.kids);
      return c;
    });
  return MARCA_BLOQUES + JSON.stringify(limpiar(lista || []));
}

// Para el buscador y el CSV. Los `check` no aportan nada acá: su texto vive en `subtareas`,
// y `textoBuscable()` ya lo suma por su lado.
function textoDeBloques(lista, salida){
  salida = salida || [];
  (lista || []).forEach(b => {
    // Un aviso NO es la explicación. Esto alimenta el resumen de la fila del backlog y el
    // CSV, y un «fijate el endpoint» ahí puesto se leería como de qué se trata la tarea. Al
    // buscador los avisos se los suma `textoBuscable()` por su lado, que es donde sí
    // corresponde encontrarlos.
    if (b.k === K_HDR) return;
    // El nombre del archivo y no un `[imagen]` fijo: buscar «contrato.pdf» y que la tarea
    // que lo tiene colgado no aparezca es justo lo que uno no entiende.
    if (b.k === 'file') salida.push(archivoDe(b).n || '[archivo]');
    else if (b.k !== 'check') salida.push(b.txt || '');
    if (b.kids) textoDeBloques(b.kids, salida);
  });
  return salida;
}
// Todo lo que la página dejó subido al bucket, para poder limpiarlo al borrar la tarea.
function archivosDeBloques(lista, salida){
  salida = salida || [];
  (lista || []).forEach(b => {
    if (b.k === 'file' && archivoDe(b).path) salida.push(b.f);
    if (b.kids) archivosDeBloques(b.kids, salida);
  });
  return salida;
}

// Un `<template>` y no un div suelto: su contenido es inerte, así que leer el texto de una
// explicación no dispara la descarga de todas sus imágenes.
function fragmentoExpl(s){
  const tpl = document.createElement('template');
  tpl.innerHTML = s;
  return tpl.content;
}
// Para el buscador y el CSV, donde una imagen no significa nada pero un salto de línea sí.
function explATexto(s){
  if (esExplBloques(s)) return textoDeBloques(bloquesDeExpl(s)).join('\n');
  if (!esExplHtml(s)) return s || '';
  const frag = fragmentoExpl(s.slice(MARCA_HTML.length).replace(/<(?:br|\/div|\/p)\b[^>]*>/gi, '\n'));
  frag.querySelectorAll('img').forEach(i => i.replaceWith(document.createTextNode(' [imagen] ')));
  return frag.textContent;
}
// Lo que se pegó o se adjuntó adentro de la explicación no está en `t.files`: vive en el
// propio texto, con los datos del archivo colgados del bloque o del propio `<img>`.
function archivosDeExpl(s){
  if (esExplBloques(s)) return archivosDeBloques(bloquesDeExpl(s));
  if (!esExplHtml(s)) return [];
  return [...fragmentoExpl(s.slice(MARCA_HTML.length)).querySelectorAll('img[data-path]')]
    .map(i => ({ path: i.dataset.path, b: i.dataset.b || '', n: i.alt || '', t: '', size: 0 }));
}

// Todo lo de acá abajo recibe el campo: el mismo editor lo usan el detalle de la tarea y
// el panel de planificación del backlog, que son dos cajas distintas sobre el mismo dato.
function pintarExpl(t, el){
  el = el || $('#tDesc');
  // Una tarea que ya tiene página se lee acá pero se escribe allá: un `contenteditable`
  // suelto sobre un árbol de bloques lo aplastaría a HTML plano en la primera tecla, y con
  // él se irían las subpáginas y los desplegables. El botón de arriba lleva a editarla.
  const conPagina = esExplBloques(t.expl);
  // El atributo y no la propiedad `contentEditable`: es lo que el CSS y el `closest()` de
  // los manejadores miran, y no depende de que el entorno refleje el setter.
  el.setAttribute('contenteditable', String(!conPagina));
  el.classList.toggle('leyendo', conPagina);
  el.innerHTML = conPagina ? previaDeBloques(bloquesDeExpl(t.expl), t) : explAHtml(t.expl);
  const abrir = $('#tPagina');
  if (abrir) abrir.textContent = conPagina ? 'Editar la página ↗' : 'Abrir como página ↗';
  refrescarFirmasDeExpl(el);
  marcarExplVacia(el);
}

/* Solo para mirar: la misma jerarquía, sin controles. Las imágenes salen con `data-path`
   para que `refrescarFirmasDeExpl()` las vuelva a firmar como en cualquier otro pintado. */
function previaDeBloques(lista, t, prof){
  prof = prof || 0;
  return (lista || []).map(b => {
    const sangria = ` style="margin-left:${prof * 16}px"`;
    // Los avisos también se leen acá: son lo primero que uno busca cuando abre la ficha en
    // vez de la página. Sin este caso saldría un renglón en blanco arriba de todo, que es
    // peor que no mostrarlos.
    if (b.k === K_HDR) {
      return avisosDe(b)
        .map(a => `<div${sangria}>${a.visto ? '·' : '⚑'} ${esc(a.texto)}</div>`).join('');
    }
    // Un archivo se lee acá como lo que es: la imagen dibujada, el resto por su nombre. El
    // pliegue no se respeta a propósito —esto es una previa de solo lectura y no hay dónde
    // apretar para abrir lo que esté plegado.
    if (b.k === 'file') {
      const f = archivoDe(b);
      if (esImagenArchivo(f)) {
        return `<div${sangria}><img alt="${escA(f.n || '')}" data-path="${escA(f.path || '')}"
          data-b="${escA(f.b || '')}"${b.w ? ` style="width:${escA(b.w)}"` : ''}></div>`;
      }
      return `<div${sangria}>▤ ${esc(f.n || 'archivo')}</div>`;
    }
    if (b.k === 'check') {
      const paso = (t.subtareas || []).find(s => s.id === b.sid);
      if (!paso) return '';
      return `<div${sangria}>${paso.estado === HECHO ? '☑' : '☐'} ${esc(paso.titulo || '')}</div>`;
    }
    const dentro = b.kids ? previaDeBloques(b.kids, t, prof + 1) : '';
    if (b.k === 'h')      return `<div${sangria}><b>${esc(b.txt || '')}</b></div>` + dentro;
    if (b.k === 'toggle') return `<div${sangria}>▸ <b>${esc(b.txt || '')}</b></div>` + dentro;
    if (b.k === 'page')   return `<div${sangria}>▤ ${esc(b.txt || 'Sin título')}</div>`;
    return `<div${sangria}>${esc(b.txt || '')}</div>`;
  }).join('');
}
/* El `src` que quedó guardado en `expl` no sirve para pintar: las filas viejas traen la URL
   pública de cuando el bucket era público y las nuevas una firmada ya vencida. La dirección
   de verdad se firma de nuevo en cada pintado, a partir de `data-path`.

   Es una sola puerta para los tres que la necesitan —la imagen dibujada, el marco del PDF o
   del HTML y el enlace que abre el archivo en una pestaña—: quien lleva `data-path` se firma,
   sin que a nadie le importe cuál de los tres es. Y el enlace se firma ACÁ y no en el clic:
   pedir la firma después de que el usuario apretó llega tarde, el navegador ya bloqueó la
   pestaña por venir de un `await`. */
async function refrescarFirmasDeExpl(el){
  // `:not([data-path=""])` deja afuera a lo que todavía está subiendo: firmar una clave
  // vacía es un viaje a Supabase que solo puede fallar.
  for (const nodo of el.querySelectorAll('[data-path]:not([data-path=""])')) {
    try {
      const url = await RoadmapSync.urlFirmada({ path: nodo.dataset.path, b: nodo.dataset.b });
      if (nodo.tagName === 'A') nodo.href = url; else nodo.src = url;
    } catch (e) { /* borrado del bucket o sin permiso: queda lo que estaba */ }
  }
}
// El placeholder lo dibuja el CSS, pero la condición no la puede escribir: un
// contenteditable donde se escribió y se borró queda con un `<br>` adentro y deja de ser
// `:empty` para siempre.
function marcarExplVacia(el){
  el = el || $('#tDesc');
  el.classList.toggle('vacio', !el.textContent.trim() && !el.querySelector('img'));
}
// Lo que todavía está subiendo apunta a un `blob:` que muere al recargar la página: se
// guarda el texto sin esas imágenes y cada una entra sola cuando su subida termina.
function leerExpl(el){
  const copia = (el || $('#tDesc')).cloneNode(true);
  copia.querySelectorAll('img.cargando').forEach(i => i.remove());
  return MARCA_HTML + copia.innerHTML;
}
function guardarExpl(t, el){
  t = t || actual(); if (!t) return;
  /* Freno de mano: este editor no sabe de bloques, así que leerlo como HTML y guardarlo
     aplastaría la página entera —subpáginas, desplegables y tildes— a un chorro de divs.
     El `contenteditable="false"` frena el tipeado y el pegado, pero no el `drop`: un
     archivo soltado encima llega igual hasta acá. Se corta en el guardado, que es el
     único lugar por el que pasan todos los caminos. */
  if (esExplBloques(t.expl)) return;
  campoTareaDebounced(t, 'expl', leerExpl(el));
}

function insertarEnCursor(nodo, el){
  el = el || $('#tDesc');
  const sel = document.getSelection();
  let r = sel && sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
  // Sin cursor adentro del campo (pegado con el foco recién puesto, por ejemplo) va al
  // final, que es donde uno esperaría que caiga.
  if (!r) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
  r.deleteContents();
  r.insertNode(nodo);
  r.setStartAfter(nodo); r.collapse(true);
  if (sel) { sel.removeAllRanges(); sel.addRange(r); }
}

// La imagen se ve al instante con el archivo local y recién después se cambia por la que
// quedó en el bucket: esperar la subida mirando un hueco sería peor que el adjunto de antes.
async function pegarImagenesEnExpl(t, files, el){
  // Primero entran todas las miniaturas, en orden y de una sola vez: si cada una esperara
  // su subida, la segunda imagen de un pegado aparecería recién cuando termina la primera.
  const pendientes = files.map(f => {
    const img = document.createElement('img');
    img.className = 'cargando';
    img.alt = f.name || 'imagen pegada';
    img.src = URL.createObjectURL(f);
    insertarEnCursor(img, el);
    return { f, img };
  });
  marcarExplVacia(el);

  for (const { f, img } of pendientes) {
    onEstadoGlobal('cargando');
    let archivo = null;
    try {
      const blob = await comprimirImagen(f);
      if (blob.size > MAX_ARCHIVO) throw new Error('pesa ' + kb(blob.size) + ' ya comprimida');
      archivo = await RoadmapSync.subirArchivo(t.id, blob,
        f.name || ('captura-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.webp'));
    } catch (e) {
      URL.revokeObjectURL(img.src);
      img.remove(); marcarExplVacia(el); onEstadoGlobal('ok');
      aviso('No pude pegar la imagen: ' + (e.message || 'error al subir'));
      continue;
    }
    // Si el detalle se cerró o se cambió de tarea mientras subía, el `<img>` ya no está en
    // pantalla: no hay dónde guardarla, así que se borra en vez de dejarla huérfana.
    if (!img.isConnected) {
      URL.revokeObjectURL(img.src);
      RoadmapSync.borrarArchivo(archivo).catch(() => {});
      onEstadoGlobal('ok');
      aviso('Se cerró la tarea antes de que terminara de subir la imagen. Pegala de nuevo.');
      continue;
    }
    const provisoria = img.src;
    // Si la firma falla, la miniatura local queda en pantalla y el próximo pintado —que
    // vuelve a firmar todo a partir de `data-path`— la repone.
    try {
      img.src = await RoadmapSync.urlFirmada(archivo);
      URL.revokeObjectURL(provisoria);
    } catch (e) {}
    img.dataset.path = archivo.path;
    img.dataset.b = archivo.b || '';
    img.alt = archivo.n;
    img.classList.remove('cargando');
    // Cierra el 'cargando' de la subida; el guardado del texto abre y cierra el suyo.
    onEstadoGlobal('ok');
    guardarExpl(t, el);
  }
}

/* ---------- imágenes de la explicación: abrirlas y cambiarles el ancho ----------
   Clic sobre la imagen la abre en el mismo lightbox de los adjuntos. Para el tamaño hay un
   agarre en la esquina: el ancho queda como % en el `style` del propio <img>, adentro de
   `expl`, así la misma imagen se ve proporcional en la ficha y en el panel del backlog,
   que no miden lo mismo. Vale para los dos editores porque comparten `.rico`. */
const GRIP = $('#grip');
let gripImg = null, gripActivo = false;

function ponerGrip(img){
  gripImg = img;
  const r = img.getBoundingClientRect();
  GRIP.style.left = (r.right - 9) + 'px';
  GRIP.style.top  = (r.bottom - 9) + 'px';
  GRIP.classList.add('on');
}
function sacarGrip(){ GRIP.classList.remove('on'); gripImg = null; }

document.addEventListener('pointerover', e => {
  if (gripActivo) return;
  if (e.target.matches?.('.rico img, .pgimg img')) return ponerGrip(e.target);
  if (e.target !== GRIP) sacarGrip();
});
// El modal y el board scrollean: sin esto el agarre queda flotando donde la imagen ya no está.
window.addEventListener('scroll', () => { if (!gripActivo) sacarGrip(); }, true);

// Quién es la tarea depende del editor: la ficha edita a la abierta; el panel del backlog,
// a la de su fila.
function guardarExplDe(img){
  // En la página el ancho es un campo del bloque, no un `style` adentro de un HTML.
  const enPagina = img.closest('.pgrow');
  if (enPagina) {
    const b = buscarBloque(enPagina.dataset.b, nivelPagina());
    if (b) { b.w = img.style.width || ''; guardarPagina(); }
    return;
  }
  const el = img.closest('.rico'); if (!el) return;
  // La previa de una página no se edita: leerla como HTML y guardarla aplastaría el árbol.
  if (!el.isContentEditable) return;
  // El único editor `.rico` que queda es el de la ficha: en la lista ya no se escribe.
  guardarExpl(actual(), el);
}

GRIP.addEventListener('pointerdown', e => {
  const img = gripImg; if (!img) return;
  e.preventDefault();
  const editor = img.closest('.rico, .pgtxt'); if (!editor) return;
  const est = getComputedStyle(editor);
  const anchoUtil = editor.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight);
  // offsetWidth y no getBoundingClientRect(): el ancho final se calcula como porcentaje de
  // anchoUtil, que sale de clientWidth. Las dos medidas tienen que estar en el mismo espacio
  // — el rect viene con el zoom del raíz ya aplicado y la imagen saltaría al primer arrastre.
  const x0 = e.clientX, w0 = img.offsetWidth;
  gripActivo = true;
  GRIP.setPointerCapture(e.pointerId);
  const mover = ev => {
    const px = Math.max(60, w0 + ev.clientX - x0);
    img.style.width = Math.min(100, px / anchoUtil * 100).toFixed(1) + '%';
    ponerGrip(img);
  };
  const soltar = () => {
    if (!gripActivo) return;
    gripActivo = false;
    GRIP.removeEventListener('pointermove', mover);
    // Si un refresco repintó el editor en medio del arrastre, no queda dónde guardar.
    if (img.isConnected) guardarExplDe(img);
  };
  GRIP.addEventListener('pointermove', mover);
  GRIP.addEventListener('pointerup', soltar, { once:true });
  GRIP.addEventListener('pointercancel', soltar, { once:true });
});

// El agarre es otro elemento: arrastrar para achicar nunca termina abriendo el visor.
document.addEventListener('click', e => {
  if (e.target.matches?.('.rico img, .pgimg img')) {
    $('#lbImg').src = e.target.src;
    $('#lightbox').classList.add('on');
  }
});

// Un solo botón para los dos sentidos, y dice a dónde va la tarea, no dónde está.
function pintarBotonBacklog(t){
  const b = $('#tBacklog');
  b.textContent = t.backlog ? '→ Pasar al tablero' : '← Guardar en el backlog';
  b.title = t.backlog
    ? 'Sale del backlog y aparece en el tablero con todo lo que tenga adentro'
    : 'Sale del tablero y queda guardada en el backlog, sin perder nada';
}

function pintarPend(t){
  $('#tPend').innerHTML = PERSONAS.map(p => {
    const on = (t.pend || []).includes(p.id);
    return `<button class="${on ? 'on' : ''}"${on ? ` style="background:${p.color}"` : ''} data-p="${escA(p.id)}">
      <span class="av mini" style="background:${on ? 'rgba(255,255,255,.28)' : p.color}">${esc(p.ini)}</span>${esc(p.nombre)}
    </button>`;
  }).join('');
  $$('#tPend [data-p]').forEach(b => b.onclick = () => {
    const antes = alternarPend(t, b.dataset.p);
    if (!antes) return;
    pintarPend(t); render();
    persistirTarea(t, { revertir: () => { t.pend = antes; pintarPend(t); render(); } });
  });
}

/* ---------- conversación ----------
   Se ve como un texto corrido y lo único que distingue a una persona de otra es el color
   de su letra: sin nombres, sin globos, sin horarios a la vista.

   Por qué no es un `<textarea>` común y corriente: un textarea pinta todo su contenido de
   un solo color, no sabe de autores. Así que cada intervención se sigue guardando por
   separado con su autor (que es lo que decide el color), y lo ya escrito se pinta como
   párrafos. La caja de abajo, donde se escribe, sí es un textarea normal, teñido con el
   color de quien está adentro. La fecha de cada intervención no se muestra, pero queda
   en el tooltip: sirve para reconstruir cuándo se dijo algo sin ensuciar la lectura. */
function pintarConversacion(t){
  const log = $('#tChat'), msgs = t.chat || [];
  $('#tChatCount').textContent = msgs.length || '';
  log.innerHTML = msgs.map((m, i) => {
    const quien = m.autor ? nombrePersona(m.autor) : 'Alguien';
    const cuando = fmtTs(m.ts);
    return `<p class="linea" style="--lc:${colorPersona(m.autor)}" title="${escA(quien + (cuando ? ' · ' + cuando : ''))}">${esc(m.texto)}${
      m.autor && m.autor === YO.id
        ? `<button class="x" data-mdel="${i}" title="Borrar lo que escribiste" aria-label="Borrar esta intervención">✕</button>`
        : ''}</p>`;
  }).join('');

  $$('[data-mdel]').forEach(b => b.onclick = () => {
    const i = Number(b.dataset.mdel);
    const [quitado] = t.chat.splice(i, 1);
    pintarConversacion(t); render();
    persistirTarea(t, { revertir: () => { t.chat.splice(i, 0, quitado); pintarConversacion(t); render(); } });
  });

  const caja = $('#tMsg');
  caja.style.setProperty('--yo', YO.id ? colorPersona(YO.id) : 'var(--ink)');
  caja.placeholder = YO.id
    ? `Escribí acá y va en tu color. Enter guarda; Shift+Enter baja de línea.`
    : 'Escribí acá. Enter guarda; Shift+Enter baja de línea.';
}

// Pasa lo escrito en la caja a una intervención propia. Se llama con Enter y también al
// salir del campo: escribir algo, hacer clic afuera y perderlo sería una traición.
function guardarLoEscrito(){
  const t = actual(), caja = $('#tMsg');
  if (!t || !caja.value.trim()) return;
  const m = { autor: YO.id || '', ts: new Date().toISOString(), texto: caja.value.trim() };
  t.chat = t.chat || [];
  t.chat.push(m);
  caja.value = '';
  pintarConversacion(t); render();
  persistirTarea(t, {
    revertir: () => {
      const i = t.chat.indexOf(m);
      if (i > -1) t.chat.splice(i, 1);
      // Se devuelve el texto a la caja en vez de tirarlo: si no se pudo guardar, al menos
      // que siga en pantalla para reintentar o copiarlo a mano.
      if (!caja.value.trim()) caja.value = m.texto;
      pintarConversacion(t); render();
    },
  });
}

function pintarArchivos(t){
  // Se puede adjuntar desde el panel del backlog, con el detalle cerrado o mostrando otra
  // tarea: pintar ahí los archivos de esta sería mostrar los de quien no es.
  if (actual() !== t) return;
  const cont = $('#tFiles');
  $('#tFilesCount').textContent = (t.files || []).length || '';
  // El HTML sale sin direcciones: la URL firmada es una promesa, y esperarlas a todas
  // para recién ahí pintar dejaría la ficha en blanco. Cada src/href entra cuando llega.
  cont.innerHTML = (t.files || []).map((f, i) => {
    return /^image\//.test(f.t)
      ? `<div class="thumb" data-fopen="${i}" title="Abrir ${escA(f.n)}"><img data-furl="${i}" alt="${escA(f.n)}"><button class="fx" data-fdel="${i}" title="Quitar" aria-label="Quitar ${escA(f.n)}">✕</button></div>`
      : `<span class="filewrap"><a class="doc" data-furl="${i}" target="_blank" rel="noopener" title="${escA(f.n)} · ${kb(f.size||0)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5"/><path d="M19 21H5V3h9l5 5v13z"/></svg>
          <span>${esc(f.n)}</span></a><button class="fx" data-fdel="${i}" title="Quitar" aria-label="Quitar ${escA(f.n)}">✕</button></span>`;
  }).join('')
  // Lo que todavía está subiendo, al final: sin botón de quitar y sin clic, porque
  // todavía no hay nada que abrir ni que borrar.
  + (t._subiendo || []).map(p => {
    return p.url
      ? `<div class="thumb subiendo" title="Subiendo ${escA(p.n)}…"><img src="${escA(p.url)}" alt="${escA(p.n)}"></div>`
      : `<span class="filewrap"><span class="doc subiendo" title="Subiendo ${escA(p.n)}…">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5"/><path d="M19 21H5V3h9l5 5v13z"/></svg>
          <span>${esc(p.n)}</span></span></span>`;
  }).join('');
  cont.querySelectorAll('[data-furl]').forEach(async el => {
    try {
      const url = await RoadmapSync.urlFirmada(t.files[Number(el.dataset.furl)]);
      if (el.tagName === 'IMG') el.src = url; else el.href = url;
    } catch (e) { /* sin dirección el enlace no abre nada; el archivo sigue listado */ }
  });

  $$('[data-fopen]').forEach(el => el.onclick = async e => {
    if (e.target.closest('.fx')) return;
    $('#lbImg').src = await RoadmapSync.urlFirmada(t.files[Number(el.dataset.fopen)]);
    $('#lightbox').classList.add('on');
  });

  // Borrado en dos pasos: el primer clic arma, el segundo confirma. Evita perder un
  // adjunto por un clic al pasar, sin meter un diálogo de confirmación encima del modal.
  $$('[data-fdel]').forEach(b => {
    let temporizador = null;
    b.onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      if (!b.classList.contains('armar')) {
        b.classList.add('armar');
        b.title = 'Clic de nuevo para confirmar';
        temporizador = setTimeout(() => { b.classList.remove('armar'); b.title = 'Quitar'; }, 3000);
        return;
      }
      clearTimeout(temporizador);
      const i = Number(b.dataset.fdel);
      const [quitado] = t.files.splice(i, 1);
      pintarArchivos(t); render();
      const ok = await persistirTarea(t, {
        revertir: () => { t.files.splice(i, 0, quitado); pintarArchivos(t); render(); },
      });
      if (ok) { try { await RoadmapSync.borrarArchivo(quitado); } catch (e2) {} }
    };
  });
}

/* ============================================================
   Checklist de la tarea
   ------------------------------------------------------------
   Una línea por paso: tilde, texto y nada más. Lo que antes hacía engorrosa esta parte
   era que cada paso tenía responsable, explicación, chat y archivos propios — una tarea
   metida adentro de otra. Eso queda guardado en la base y no se pisa (por eso cada paso
   nuevo se crea con la forma completa), pero acá se trabaja con lo único que se usa a
   diario: marcar hecho y tachar.
   ============================================================ */
function pintarPasos(t){
  const pasos = t.subtareas || [];
  const hechos = pasos.filter(s => s.estado === HECHO).length;

  $('#tPasosCount').textContent = pasos.length ? `${hechos}/${pasos.length}` : '';
  $('#tPasos').innerHTML = pasos.map((s, i) => `
    <div class="paso${s.estado === HECHO ? ' done' : ''}">
      <input type="checkbox" data-pchk="${i}"${s.estado === HECHO ? ' checked' : ''} aria-label="${escA(s.titulo || 'Paso')} — marcar como hecho">
      <input class="pt" data-ptxt="${i}" value="${escA(s.titulo)}" placeholder="Sin nombre" aria-label="Texto del paso">
      <button class="x" data-pdel="${i}" title="Borrar el paso" aria-label="Borrar el paso">✕</button>
    </div>`).join('');

  $$('#tPasos [data-pchk]').forEach(el => el.onchange = () => {
    cambiarPasos(t, () => { pasos[el.dataset.pchk].estado = el.checked ? HECHO : 'Pendiente'; });
    pintarPasos(t); render();
  });

  $$('#tPasos [data-ptxt]').forEach(el => el.oninput = () => {
    cambiarPasos(t, () => { pasos[el.dataset.ptxt].titulo = el.value; });
  });

  $$('#tPasos [data-pdel]').forEach(el => el.onclick = () => {
    cambiarPasos(t, () => { pasos.splice(Number(el.dataset.pdel), 1); });
    pintarPasos(t); render();
  });
}

// Snapshot antes de tocar, guardado en diferido después: si el guardado falla tras los
// reintentos, la lista entera vuelve a como estaba y no queda un tilde que no era.
function cambiarPasos(t, mutar){
  const clave = 'tarea:' + t.id + ':subtareas';
  if (!snaps.has(clave)) snaps.set(clave, JSON.stringify(t.subtareas || []));
  t.subtareas = t.subtareas || [];
  mutar();
  guardarDebounced(clave, () => {
    persistirTarea(t, {
      revertir: () => {
        try { t.subtareas = JSON.parse(snaps.get(clave)); } catch (e) { /* se pierde el revert, no los datos */ }
        if (actual() === t) pintarPasos(t);
        render();
      },
    }).then(() => { if (!pendientesGuardado.has(clave)) snaps.delete(clave); });
  });
}

$('#tPasoNew').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const t = actual(); if (!t) return;
  const titulo = e.target.value.trim(); if (!titulo) return;
  const id = nuevoId('S', (t.subtareas || []).map(s => s.id));
  // Se conserva la forma completa que ya usa la base (resp / expl / chat / files) aunque
  // el checklist no los muestre: así los pasos viejos no se rompen ni pierden lo suyo.
  cambiarPasos(t, () => t.subtareas.push({ id, titulo, resp:'', estado:'Pendiente', expl:'', chat:[], files:[] }));
  e.target.value = '';
  pintarPasos(t); render();
});

/* ---------- enganches del modal de tarea ---------- */
function campoTareaDebounced(t, campo, valor){
  const clave = 'tarea:' + t.id + ':' + campo;
  if (!snaps.has(clave)) snaps.set(clave, t[campo]);
  t[campo] = valor;
  guardarDebounced(clave, () => {
    persistirTarea(t, {
      revertir: () => { t[campo] = snaps.get(clave); render(); if (actual() === t) abrirTarea(t.id); },
    }).then(() => { if (!pendientesGuardado.has(clave)) snaps.delete(clave); });
  });
}

$('#tTitulo').addEventListener('input', e => {
  const t = actual(); if (!t) return;
  autoGrow(e.target);
  campoTareaDebounced(t, 'tarea', e.target.value);
  render();
});
$('#tDesc').addEventListener('input', () => { marcarExplVacia(); guardarExpl(); });
$('#tPagina').addEventListener('click', () => { const t = actual(); if (t) abrirPagina(t.id); });

/* Pegar y soltar sobre la explicación. Las imágenes van adentro del texto, donde estaba el
   cursor; cualquier otro archivo no se puede dibujar en un renglón, así que sigue yendo a
   los adjuntos de abajo. Lo demás entra como texto plano —a propósito: es lo que mantiene
   fuera el HTML de otras páginas, con sus estilos, sus scripts y su ruido. */
function repartirPegado(t, dt, el){
  const files = [...(dt?.files || [])].filter(f => f.size);
  const imgs  = files.filter(f => /^image\//.test(f.type));
  const otros = files.filter(f => !/^image\//.test(f.type));
  if (otros.length) adjuntar(t, otros);
  if (imgs.length) { pegarImagenesEnExpl(t, imgs, el); return; }
  if (files.length) return;
  const txt = dt?.getData('text/plain') || '';
  // `insertText` porque es lo único que deja el pegado en la pila de deshacer del navegador.
  // Está deprecado y algún día no va a estar: si devuelve false, se inserta a mano.
  if (txt && !document.execCommand?.('insertText', false, txt)) {
    insertarEnCursor(document.createTextNode(txt), el);
  }
  marcarExplVacia(el); guardarExpl(t, el);
}
$('#tDesc').addEventListener('paste', e => {
  const t = actual(); if (!t) return;
  e.preventDefault();
  // Frena el manejador del modal, que adjuntaría la misma imagen abajo por segunda vez.
  e.stopPropagation();
  repartirPegado(t, e.clipboardData);
});
$('#tDesc').addEventListener('dragover', e => e.preventDefault());
$('#tDesc').addEventListener('drop', e => {
  const t = actual(); if (!t) return;
  e.preventDefault(); e.stopPropagation();
  // Con página, este campo es una previa. Soltar acá subiría la imagen a un bucket donde
  // nadie la va a referenciar nunca: se avisa y se manda a la página, que es donde entra.
  if (esExplBloques(t.expl)) { aviso('Esta tarea tiene página: soltá el archivo adentro de la página.'); return; }
  repartirPegado(t, e.dataTransfer);
});
[['tEstado','estado'], ['tPrioridad','prioridad']].forEach(([elId, campo]) => {
  $('#' + elId).addEventListener('change', e => {
    const t = actual(); if (!t) return;
    const antes = t[campo];
    // La prioridad pasa por su puerta: es la que decide si la chapa de novedad te suena a vos.
    if (campo === 'prioridad') ponerPrioridad(t, e.target.value); else t[campo] = e.target.value;
    render();
    persistirTarea(t, { revertir: () => { t[campo] = antes; render(); if (actual() === t) abrirTarea(t.id); } });
  });
});
$('#tSprint').addEventListener('change', e => {
  const t = actual(); if (!t) return;
  cambiarSprint(t, Number(e.target.value) || SIN_SPRINT);
});
// Los dos se ven como pills en la lista, así que se repinta al soltar la tecla — pero con
// el guardado diferido de siempre, no uno por letra.
[['tArea', 'modulo'], ['tDep', 'dep']].forEach(([elId, campo]) => {
  $('#' + elId).addEventListener('input', e => {
    const t = actual(); if (!t) return;
    campoTareaDebounced(t, campo, e.target.value);
  });
  $('#' + elId).addEventListener('change', () => render());
});
$('#tBacklog').onclick = e => {
  const t = actual(); if (!t) return;
  // Ida: pregunta la prioridad y recién con la elección hecha pasa, así que el botón lo
  // repinta el propio pase. Vuelta: no hay nada que preguntar.
  if (t.backlog) return pasarAlRoadmap(t, e.currentTarget, e);
  mandarAlBacklog(t);
  pintarBotonBacklog(t);
};
$('#tMsg').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardarLoEscrito(); }
});
$('#tMsg').addEventListener('blur', guardarLoEscrito);

$('#tDrop').onclick = () => $('#tFileIn').click();
$('#tFileIn').addEventListener('change', e => {
  const t = actual();
  if (t && e.target.files.length) adjuntar(t, [...e.target.files]);
  e.target.value = '';
});
['dragenter','dragover'].forEach(n => $('#tDrop').addEventListener(n, e => { e.preventDefault(); $('#tDrop').classList.add('over'); }));
['dragleave','drop'].forEach(n => $('#tDrop').addEventListener(n, e => { e.preventDefault(); $('#tDrop').classList.remove('over'); }));
$('#tDrop').addEventListener('drop', e => {
  const t = actual();
  const fs = [...(e.dataTransfer?.files || [])];
  if (t && fs.length) adjuntar(t, fs);
});
$('#scrimTarea .modal').addEventListener('paste', e => {
  const t = actual(); if (!t) return;
  const fs = [...(e.clipboardData?.files || [])].filter(f => f.size);
  if (!fs.length) return;
  e.preventDefault(); adjuntar(t, fs);
});

$('#tDel').onclick = async () => {
  const t = actual(); if (!t) return;
  if (!confirm('Se borra «' + (t.tarea || 'sin título') + '» con su conversación y sus archivos. ¿Seguir?')) return;
  const idx = datos.tareas.findIndex(x => x.id === t.id);
  datos.tareas = datos.tareas.filter(x => x.id !== t.id);
  cerrarModales(); render();
  const ok = await conEstadoDeCarga(async () => {
    await borrarTodosLosArchivos(t);
    await RoadmapSync.borrarTarea(t.id);
  }, {
    onEstado: combinar(onEstadoBoton($('#tDel'), 'Borrando...'), onEstadoGlobal),
    revertir: () => { datos.tareas.splice(idx, 0, t); render(); },
  });
  if (ok) { marcarEcoPropio(RoadmapSync.TABLAS.tareas, t.id); aviso('Tarea eliminada'); }
};

/* ============================================================
   Caja · el libro de movimientos
   ------------------------------------------------------------
   Diseño de Claude Design (26/8/2026). Dejó de ser una `<table>` de ocho columnas para ser
   una lista de renglones: el mismo componente que el backlog y que la página de una tarea.
   Por eso el encabezado y las pills reusan las clases `pg` y lo propio de acá lleva el
   prefijo `cj` — no hay una segunda copia de «migas, título y pill» dando vueltas.

   Lo que cambió respecto de la planilla vieja, y por qué:

   - **Cada persona trae su saldo en su propia tarjeta.** Antes había una tarjeta oscura de
     «A favor de» al lado de una por cabeza, y para saber si te debían había que cruzar las
     dos. La cuenta es exactamente la misma (`saldoCaja()`); lo que cambió es dónde se lee.
   - **Los gastos fijos tienen su bloque, plegable, arriba de todo.** Antes se reconocían
     mirando cuál de treinta filas tenía el ↻ prendido. Ese bloque es una vista, no otra
     entidad: son los mismos movimientos con `repite`, y siguen apareciendo abajo.
   - **Las filas van de la más nueva a la más vieja**, al revés que la planilla. Una caja se
     abre para ver lo último, no para releer marzo.
   - **`categoria` y `notas` no estaban en el diseño.** Sacarlas hubiera dejado dos columnas
     de la base sin ninguna pantalla que las lea, así que la categoría es la pill que el
     diseño ya dibujaba —pero se toca— y la nota es texto tenue al final del renglón. La
     pill se dibuja aunque no haya categoría, apagada: es la misma regla que el «Sin
     asignar» del backlog, la pill vacía es justo la que hay que poder tocar.
   - **Fecha y monto se escriben sobre el texto pintado**, no en un `<input type=date>` ni en
     uno `type=number`: es lo que hace que la fila se lea como un renglón y no como un
     formulario. El costo es interpretar lo tipeado, y por eso hay una sola puerta para cada
     uno: `parsearDia()` y `parsearMonto()`.

   Los manejadores se cuelgan del board entero por delegación, igual que en el backlog: la
   lista se repinta ante cualquier cambio y con `addEventListener` se acumularía uno por
   repintado. `render()` los suelta al salir de la vista.
   ============================================================ */
const fmtMoney = n => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtEur = n => fmtMoney(n) + ' €';
const CATEGORIAS = ['Sueldos','Servicios','Herramientas','Publicidad','Impuestos','Aporte','Cobro','Otros'];

// Los gastos fijos arrancan desplegados y el plegado es de la sesión, no del tablero: que
// alguien los cierre para leer cómodo no tiene por qué cerrárselos a los demás.
let cajaFijosAbiertos = true;

/* La lista de gente es la de la caja, pero si el movimiento quedó a nombre de alguien que ya
   no participa se le agrega igual su opción: nadie cambia de dueño solo. */
const genteDeCaja = quien => (!quien || PERSONAS_CAJA.some(p => p.id === quien))
  ? PERSONAS_CAJA
  : PERSONAS_CAJA.concat(PERSONAS.filter(p => p.id === quien));

/* Quién lo pagó y a quién se le carga son dos preguntas distintas, y hasta acá las
   contestaba una sola columna: `quien` decía de qué bolsillo salió la plata y se daba por
   hecho que el gasto era de todos por partes iguales. La herramienta que paga Lorenzo pero
   usa solo Antonio no tenía cómo anotarse: quedaba compartida y el saldo salía mal por la
   mitad del importe.

   **`carga` vacío significa «a todos».** No es un caso raro que haya que tolerar: es
   exactamente lo que valía para cada movimiento antes de que la columna existiera, así que
   toda la caja vieja se lee bien sin migrar una sola fila —y sigue leyéndose bien mientras
   schema-v8.sql no esté corrido, que es donde estamos hoy—. Los movimientos nuevos sí
   escriben la lista completa: eligieron a todos, no se quedaron sin elegir. */
const cargaDe = m => {
  const ids = (m.carga || []).filter(id => PERSONAS_CAJA.some(p => p.id === id));
  return ids.length ? ids : PERSONAS_CAJA.map(p => p.id);
};

// Con todos adentro se dice «Compartido» y no la lista de nombres: es el caso de nueve de
// cada diez renglones, y repetir los mismos dos nombres columna abajo no distingue nada.
const etiquetaCarga = m => {
  const ids = cargaDe(m);
  if (PERSONAS_CAJA.length > 1 && ids.length === PERSONAS_CAJA.length) return 'Compartido';
  return ids.map(id => nombrePersona(id)).join(', ') || 'Compartido';
};

// La fecha se pinta corta —«04/08»— y la completa queda en el `title`: en un renglón, el
// año repetido treinta veces no dice nada que no diga el orden de la lista.
const diaCorto = f => { const p = String(f || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}` : '—'; };

/* Lo tipeado en la celda de fecha: «4/8», «04-08», «4/8/26». Sin año se hereda el que la
   fila ya tenía y no el de hoy — corregirle el día a un movimiento de enero no tiene por
   qué mudarlo a agosto. */
function parsearDia(txt, base){
  const t = String(txt).match(/(\d{1,2})\D+(\d{1,2})(?:\D+(\d{2,4}))?/);
  if (!t) return null;
  let anio = t[3] ? Number(t[3]) : (Number(String(base || '').slice(0, 4)) || new Date().getFullYear());
  if (anio < 100) anio += 2000;
  const mes = Math.min(12, Math.max(1, Number(t[2])));
  const ultimo = new Date(anio, mes, 0).getDate();
  const dia = Math.min(ultimo, Math.max(1, Number(t[1])));
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/* Y lo tipeado en la celda de monto. El punto es todo el problema: en «1.234» separa miles
   y en «12.5» es la coma decimal de quien viene de un teclado numérico. Se decide por la
   forma del número y no por una preferencia — si hay coma, el punto es de miles; si lo que
   queda calza exacto con grupos de tres, también; en cualquier otro caso es decimal.
   Adivinar mal acá multiplica un gasto por mil, así que no se adivina. */
function parsearMonto(txt){
  let s = String(txt).replace(/[^\d,.\-−]/g, '').replace(/−/g, '-');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* Cada movimiento lo pone alguien de su bolsillo. Lo que sale (monto negativo) es plata
   que esa persona puso; lo que entra (positivo) es plata que recuperó.

   El saldo es la resta de dos columnas que **ya no son la misma cuenta repartida**:

   - `puesto` es lo que la persona puso de su bolsillo: los movimientos donde ella es
     `quien`. Neto —lo que salió menos lo que entró—, porque es con lo que se salda.
   - `toca` es lo que le corresponde bancar: su parte de cada movimiento que se le carga,
     y nada de los que se le cargan a otro.

   Antes `toca` era el total dividido por la cantidad de gente, porque todo gasto era de
   todos. Ahora se recorre movimiento por movimiento: la división es por `cargaDe(m).length`
   y no por `PERSONAS_CAJA.length`, que es toda la diferencia entre repartir un gasto entre
   los dos y cargárselo entero a uno. Con todos los movimientos compartidos las dos cuentas
   dan exactamente lo mismo que antes.

   `gastos` y `entradas` son las dos mitades por separado, sin repartir, y solo alimentan
   el renglón que resume la lista: ahí se quiere leer cuánto se gastó, no cuánto se debe. */
function saldoCaja(movs){
  /* Se reparte lo que salió de un bolsillo de la caja, y nada más. Un movimiento sin dueño
     o a nombre de alguien que ya no participa queda afuera de las dos columnas, igual que
     antes: `total` nunca lo contó, así que `parte` tampoco lo cargaba. Sin este corte, esas
     filas viejas empezarían a repartirse solas el día que se toca la fórmula y los saldos
     cambiarían sin que nadie haya anotado nada. Es también lo que garantiza que los saldos
     sumen cero: lo que se reparte es exactamente lo que se puso. */
  const dePersona = movs.filter(m => PERSONAS_CAJA.some(p => p.id === m.quien));
  const puesto = p => dePersona.filter(m => m.quien === p.id).reduce((a, m) => a - m.monto, 0);
  const toca = p => dePersona.reduce((a, m) => {
    const entre = cargaDe(m);
    return entre.includes(p.id) ? a - m.monto / entre.length : a;
  }, 0);
  const cuentas = PERSONAS_CAJA.map(p => {
    const c = { p, puesto: puesto(p), toca: toca(p) };
    return { ...c, saldo: c.puesto - c.toca };
  });
  const total = cuentas.reduce((a, c) => a + c.puesto, 0);
  const gastos = movs.filter(m => m.monto < 0).reduce((a, m) => a - m.monto, 0);
  const entradas = movs.filter(m => m.monto > 0).reduce((a, m) => a + m.monto, 0);
  return { cuentas, total, gastos, entradas };
}

// «En cero» y no «0,00 €»: el saldo se mira para saber si hay algo que saldar, y un cero
// escrito en números obliga a leerlo dos veces para contestar que no.
const enCero = s => Math.abs(s) < 0.005;
const txtSaldo = s => enCero(s) ? 'En cero' : (s > 0 ? `A favor ${fmtEur(s)}` : `Debe ${fmtEur(-s)}`);
const claseSaldo = s => enCero(s) ? '' : (s > 0 ? ' ok' : ' debe');

// Lo que le toca bancar se da vuelta cuando le entró más de lo que se le cargó: «le tocan
// −285 €» es exacto y no se entiende, «le vuelven 285 €» dice lo mismo en castellano.
const txtToca = t => enCero(t) ? 'No le toca nada'
  : t > 0 ? `Le tocan ${fmtEur(t)}`
  : `Le vuelven ${fmtEur(-t)}`;

function renderCaja(){
  const nuevos = generarRecurrentes();
  if (nuevos) aviso(nuevos === 1 ? 'Se cargó 1 gasto fijo que faltaba' : `Se cargaron ${nuevos} gastos fijos que faltaban`);

  // De la más nueva a la más vieja: una caja se abre para ver lo último. Las que no tienen
  // fecha caen al final —son de antes de que la fecha fuera obligatoria— y no arriba, donde
  // taparían justo lo que se vino a mirar.
  const movs = [...datos.caja].sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || '') || (b.orden || 0) - (a.orden || 0));
  const { cuentas, total, gastos, entradas } = saldoCaja(movs);
  const fijos = movs.filter(m => m.repite === 'mensual');
  const porMes = fijos.reduce((a, m) => a - m.monto, 0);

  board.innerHTML = `<div class="cjwrap">
    <div class="pgbc"><span>Caja</span><span class="pgflex"></span>
      <span class="pgres">${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'}</span></div>
    <div class="pgtitle">Caja</div>

    <div class="cjcards">
      ${cuentas.map(tarjetaSaldo).join('')}
      <div class="cjcard" data-total>
        <div class="cjcard-h"><span class="cjlbl">Total puesto</span></div>
        <div class="cjnum">${fmtEur(total)}</div>
        <div class="cjsub">${fmtEur(gastos)} de gastos</div>
        <div class="cjsub${entradas ? ' ok' : ''}">${entradas ? `${fmtEur(entradas)} entraron` : 'Sin entradas'}</div>
      </div>
    </div>

    <div class="cjsec">
      <button class="cjfold" type="button" data-fold aria-expanded="${cajaFijosAbiertos}"><span class="cjcar${cajaFijosAbiertos ? ' on' : ''}">▸</span>Gastos fijos</button>
      <span class="cjsecsub">${fijos.length
        ? `${fijos.length} ${fijos.length === 1 ? 'fijo' : 'fijos'} · ${fmtEur(porMes)} por mes`
        : 'Ninguno todavía'}</span>
    </div>
    ${cajaFijosAbiertos ? `<div class="cjfijos">
      ${fijos.map(filaFijo).join('')}
      <button class="cjadd" type="button" data-nuevo="fijo"><span>＋</span>Nuevo gasto fijo</button>
    </div>` : ''}

    <div class="cjsec">
      <div class="cjsectit">Movimientos</div>
      <span class="cjsecsub">${fmtEur(gastos)} de gastos · ${fmtEur(entradas)} de entradas</span>
    </div>
    <div class="cjhead">
      <span class="cjfecha">Fecha</span><span class="cjmid">Concepto</span>
      <span class="cjquien">Pagó</span><span class="cjcarga">Cargar a</span>
      <span class="cjmonto">Monto</span><span class="cjfin"></span>
    </div>
    ${movs.length ? cuerpoDeMovimientos(movs)
                  : '<p class="cjvacio">Sin movimientos todavía. Agregá el primero acá abajo.</p>'}
    <div class="cjcierre"></div>
    <button class="cjadd" type="button" data-nuevo="mov"><span>＋</span>Nuevo movimiento</button>
  </div>`;

  colgarManejadoresCaja();
}

/* Los movimientos, con el mes escrito cada vez que cambia. **Los separadores van SIEMPRE al
   HTML y los esconde el CSS arriba de 760px**, la misma regla del riel y los avatares de la
   fila: cuál de las dos formas corresponde es una pregunta de ancho de pantalla.

   En el escritorio la caja es una planilla y la fecha de cada renglón está a la vista en su
   columna, así que el mes escrito sería un renglón de más cada treinta días. En el teléfono la
   lista se recorre con el pulgar y «24/08» sola no dice de qué mes es hasta que uno se fija en
   el renglón de arriba.

   No cambia nada de lo que ya andaba: el `↑` `↓` de la planilla salta entre `.cjrow` y esto no
   es una, y las filas siguen viniendo de `filaMovimiento()` sin enterarse. */
function rotuloMes(f){
  const d = f ? new Date(f + 'T00:00:00') : null;
  if (!d || isNaN(d)) return 'Sin fecha';
  const s = d.toLocaleDateString('es-ES', { month:'long', year:'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function cuerpoDeMovimientos(movs){
  let mes = null;
  return movs.map(m => {
    const k = mesDe(m.fecha);
    const cab = k === mes ? '' : `<div class="cjmes">${esc(rotuloMes(m.fecha))}</div>`;
    mes = k;
    return cab + filaMovimiento(m);
  }).join('');
}

/* El número grande es lo que puso; abajo, lo que le toca bancar y el saldo que sale de
   restar los dos. La línea del medio es nueva y es la que hace legible la imputación: sin
   ella, un saldo que se movió porque se le cargó un gasto a alguien no tiene de dónde
   explicarse. */
const tarjetaSaldo = c => `<div class="cjcard" data-saldo="${escA(c.p.id)}">
  <div class="cjcard-h"><i class="cjdot" style="background:${c.p.color}"></i>${esc(c.p.nombre)}</div>
  <div class="cjnum">${fmtEur(c.puesto)}</div>
  <div class="cjsub" data-toca>${esc(txtToca(c.toca))}</div>
  <div class="cjsub${claseSaldo(c.saldo)}" data-saldo-txt>${esc(txtSaldo(c.saldo))}</div>
</div>`;

/* **La condición de fijo se maneja acá y en ningún otro lado.** Marcar, desmarcar y crear un
   gasto fijo son cosas del bloque de gastos fijos; abajo, en la lista, un movimiento es un
   movimiento y se edita como tal. Repartir el mismo interruptor entre las dos pantallas era
   invitar a que alguien volviera fijo un gasto de una vez sin darse cuenta, en el renglón
   donde estaba corrigiendo un importe.

   El renglón **sí se edita**: el gasto fijo no es otra entidad, es este mismo movimiento, y
   lo que se toca acá es lo que se va a copiar el mes que viene. Como la misma fila aparece
   también abajo, lo escrito se espeja en la otra copia en pantalla (`espejarCelda()`) en vez
   de repintar: repintar mientras alguien escribe le tira el cursor a la primera letra. */
const filaFijo = m => {
  const per = persona(m.quien);
  return `<div class="cjfijo" data-id="${escA(m.id)}">
  <span class="cjmarca" title="Se copia solo todos los meses">↻</span>
  <div class="cjfijo-t" contenteditable="true" data-c="concepto" data-ph="Sin concepto">${esc(m.concepto)}</div>
  <button class="cjfijo-q" type="button" data-pop="quien" title="De qué bolsillo sale la plata"><i class="cjdot${per ? '' : ' vacio'}" style="background:${per ? per.color : 'transparent'}"></i>${esc(per ? per.nombre : 'Sin asignar')}</button>
  ${botonCarga(m)}
  <div class="cjfijo-m" contenteditable="true" data-c="monto">${fmtEur(m.monto)}</div>
  <span class="cjfijo-x">/mes</span>
  <button class="cjquitar" type="button" data-quitar title="Sacarlo de los gastos fijos: deja de copiarse cada mes y queda como un movimiento común" aria-label="Sacarlo de los gastos fijos">✕</button>
</div>`;
};

/* A quién se le carga es UNA pill con todos los nombres adentro, y no una por persona: es
   la misma regla que «quién la hace» en el backlog. Con una pill por cabeza no habría dónde
   tocar para sumar a la segunda, y compartido —que es el caso normal— dibujaría dos.

   Los puntitos son la mitad que sobrevive en pantalla chica, donde el rótulo se esconde y no
   entraría ni la palabra «Compartido»: colores = se le carga a esa gente, hueco = a todos.
   Por eso compartido dibuja igual su punto apagado, aunque no diga nada nuevo —es la misma
   regla que el «Sin asignar» de al lado—: sin él, en el teléfono el botón quedaría de ancho
   cero y no habría dónde tocar para cambiarlo. */
function botonCarga(m){
  const ids = cargaDe(m);
  const propio = PERSONAS_CAJA.length > 1 && ids.length < PERSONAS_CAJA.length;
  return `<button class="cjcarga${propio ? ' propio' : ''}" type="button" data-pop="carga" title="A quién se le imputa el gasto para el saldo">${
    propio ? ids.map(id => `<i class="cjdot" style="background:${colorPersona(id)}"></i>`).join('')
           : '<i class="cjdot vacio"></i>'
  }<b>${esc(etiquetaCarga(m))}</b></button>`;
}

/* En la lista, un gasto fijo se **señala** pero no se toca: la marca de la canaleta hace que
   se puedan barrer de un vistazo por la columna, y la pill lo dice con todas las letras al
   lado del concepto. Las dos van siempre prendidas, no al pasar por encima — es un dato de
   la fila, no un control. */
function filaMovimiento(m){
  const per = persona(m.quien);
  const esFijo = m.repite === 'mensual' || !!m.origen;
  const porQue = m.origen
    ? 'Gasto fijo: esta es la copia de este mes, la generó el tablero solo'
    : 'Gasto fijo: de este renglón salen las copias de los meses siguientes';

  return `<div class="cjrow" data-id="${escA(m.id)}">
    <div class="cjctl">${esFijo ? `<span class="cjmarca" title="${escA(porQue)}">↻</span>` : ''}</div>
    <div class="cjfecha" contenteditable="true" data-c="fecha" title="${escA(m.fecha || 'Sin fecha')}">${esc(diaCorto(m.fecha))}</div>
    <div class="cjmid">
      <div class="cjcon" contenteditable="true" data-c="concepto" data-ph="Sin concepto">${esc(m.concepto)}</div>
      <button class="pgpill cjcat${m.categoria ? '' : ' vacia'}" type="button" data-pop="categoria">${esc(m.categoria || 'Sin categoría')}</button>
      ${esFijo ? `<span class="cjtag" title="${escA(porQue)}">↻ fijo</span>` : ''}
      <div class="cjnota" contenteditable="true" data-c="notas" data-ph="nota">${esc(m.notas)}</div>
    </div>
    <button class="cjquien" type="button" data-pop="quien" title="${escA('De qué bolsillo salió la plata' + (per ? ': ' + per.nombre : ''))}"><i class="cjdot${per ? '' : ' vacio'}" style="background:${per ? per.color : 'transparent'}"></i>${esc(per ? per.nombre : 'Sin asignar')}</button>
    ${botonCarga(m)}
    <div class="cjmonto${m.monto > 0 ? ' pos' : ''}" contenteditable="true" data-c="monto">${fmtEur(m.monto)}</div>
    <button class="cjdel" type="button" data-del title="Borrar movimiento" aria-label="Borrar movimiento">🗑</button>
  </div>`;
}

/* La plantilla de un gasto fijo se dibuja dos veces —arriba en su bloque y abajo en la
   lista— y las dos son la misma fila. Al escribir en una hay que escribir en la otra, o el
   número de arriba se queda con la versión vieja hasta el próximo repintado. Se espeja el
   texto pintado y nada más: el dato ya lo guardó `editarCaja()`. */
function espejarCelda(m, campo, texto, salvo){
  board.querySelectorAll(`[data-id="${CSS.escape(m.id)}"] [data-c="${campo}"]`).forEach(el => {
    if (el !== salvo) el.textContent = texto;
  });
}

const movimientoDe = el => {
  const fila = el.closest('[data-id]');
  return fila ? datos.caja.find(x => x.id === fila.dataset.id) : null;
};

/* Delegación sobre el board, igual que en el backlog: la lista se repinta entera ante
   cualquier cambio y con `addEventListener` quedaría un manejador por repintado. Los que no
   usa la caja se apagan a mano, porque la vista anterior puede haberlos dejado puestos. */
function colgarManejadoresCaja(){
  board.onchange = board.onpaste = board.ondragover = board.ondrop = null;

  board.onclick = e => {
    if (e.target.closest('[data-fold]')) { cajaFijosAbiertos = !cajaFijosAbiertos; return renderCaja(); }
    const add = e.target.closest('[data-nuevo]');
    if (add) return nuevoMovimiento(add.dataset.nuevo === 'fijo');

    const m = movimientoDe(e.target);
    if (!m) return;
    if (e.target.closest('[data-quitar]')) return quitarDeFijos(m);
    if (e.target.closest('[data-del]')) return borrarMovimiento(m);
    // Los menús se marcan con `data-pop` y no con una clase propia: es lo que mira el clic
    // global para no cerrarlos en el mismo clic que los abre.
    const pop = e.target.closest('[data-pop]');
    if (!pop) return;
    /* «Cargar a» admite varios y por eso NO va con `alElegir`: ese camino cierra el menú y
       devuelve un valor suelto, que es lo que quieren «quién pagó» y la categoría —de un
       solo valor cada uno—. La multi-selección se resuelve adentro del menú, igual que los
       responsables de una tarea, para no cerrarlo en el primer nombre. */
    return pop.dataset.pop === 'carga'
      ? abrirMenu(pop, 'carga', m, null, '¿A quién se le carga?')
      : abrirMenu(pop, pop.dataset.pop, m, v => cambiarCampoCaja(m, pop.dataset.pop, v));
  };

  // El texto se guarda mientras se escribe; la fecha y el monto, recién al salir de la
  // celda: los dos hay que interpretarlos, y hacerlo tecla por tecla reescribiría a medias
  // lo que alguien todavía está tipeando.
  board.oninput = e => {
    const el = e.target.closest('[data-c]'); if (!el) return;
    const m = movimientoDe(el); if (!m) return;
    const campo = el.dataset.c;
    if (campo !== 'concepto' && campo !== 'notas') return;
    editarCaja(m, campo, el.textContent.trim());
    if (campo === 'concepto') espejarCelda(m, 'concepto', el.textContent, el);
  };

  board.onfocusout = e => {
    const el = e.target.closest?.('[data-c]'); if (!el) return;
    const m = movimientoDe(el); if (!m) return;

    if (el.dataset.c === 'fecha') {
      const f = parsearDia(el.textContent, m.fecha);
      // No se entendió: se devuelve lo que había. Dejar el garabato en pantalla haría creer
      // que quedó guardado algo que no es fecha de nada.
      if (!f) { el.textContent = diaCorto(m.fecha); return; }
      el.textContent = diaCorto(f);
      el.title = f;
      if (f !== m.fecha) editarCaja(m, 'fecha', f);
      return;
    }
    if (el.dataset.c === 'monto') {
      const n = parsearMonto(el.textContent);
      if (n === null) { el.textContent = fmtEur(m.monto); return; }
      el.textContent = fmtEur(n);
      espejarCelda(m, 'monto', fmtEur(n), el);
      board.querySelectorAll(`[data-id="${CSS.escape(m.id)}"] .cjmonto`)
        .forEach(c => c.classList.toggle('pos', n > 0));
      if (n !== m.monto) { editarCaja(m, 'monto', n); actualizarTotalesCaja(); }
    }
  };

  /* Se sigue moviendo como una planilla aunque las celdas ya no sean `<input>`: son
     renglones de una sola línea, así que las flechas verticales no tienen adónde ir adentro
     de la celda y se aprovechan para saltar de fila. El Enter se ataja siempre: en un
     `contenteditable` lo que hace de fábrica es meter un salto de línea adentro del dato. */
  board.onkeydown = e => {
    const el = e.target.closest?.('[data-c]'); if (!el) return;
    if (e.key === 'Escape') return el.blur();
    if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const filas = [...board.querySelectorAll('.cjrow')];
    const i = filas.indexOf(el.closest('.cjrow'));
    if (i < 0) return el.blur();
    const destino = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (destino < 0) return;
    if (destino >= filas.length) { if (e.key === 'Enter') nuevoMovimiento(); else el.blur(); return; }
    filas[destino].querySelector(`[data-c="${el.dataset.c}"]`)?.focus();
  };
}

/* Gastos fijos: un movimiento marcado con ↻ es la plantilla del mes en que se cargó, y
   de ahí en adelante se copia solo, un mes por vez, hasta el mes en curso. Cada copia es
   un movimiento común y corriente —se edita y se borra— con `origen` apuntando a la
   plantilla, que es lo que evita cargarlo dos veces. */
const mesDe = f => String(f || '').slice(0, 7);

function generarRecurrentes(){
  const plantillas = datos.caja.filter(m => m.repite === 'mensual' && m.fecha);
  if (!plantillas.length) return 0;
  const mesHoy = new Date().toISOString().slice(0, 7);
  let hechos = 0;

  plantillas.forEach(tpl => {
    const ya = new Set(datos.caja.filter(m => m.origen === tpl.id).map(m => mesDe(m.fecha)));
    ya.add(mesDe(tpl.fecha));
    const dia = Number(tpl.fecha.slice(8, 10)) || 1;
    let [anio, mes] = tpl.fecha.slice(0, 7).split('-').map(Number);

    for (let i = 0; i < 36; i++) {
      mes++; if (mes > 12) { mes = 1; anio++; }
      const clave = `${anio}-${String(mes).padStart(2, '0')}`;
      if (clave > mesHoy) break;
      if (ya.has(clave)) continue;

      const ultimoDia = new Date(anio, mes, 0).getDate();
      const orden = RoadmapSync.calcularOrden(Math.max(0, ...datos.caja.map(x => x.orden || 0)), null);
      const copia = { ...tpl,
        id: nuevoId('M', datos.caja.map(x => x.id)),
        fecha: `${clave}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`,
        repite: '', origen: tpl.id, orden };
      datos.caja.push(copia);
      hechos++;
      persistirMovimiento(copia, { revertir: () => { datos.caja = datos.caja.filter(x => x.id !== copia.id); } });
    }
  });
  return hechos;
}

function nuevoMovimiento(fijo){
  const id = nuevoId('M', datos.caja.map(x => x.id));
  const ultimo = datos.caja.length ? Math.max(...datos.caja.map(x => x.orden || 0)) : null;
  const mio = PERSONAS_CAJA.some(p => p.id === YO.id) ? YO.id : '';
  const m = {
    id, fecha:new Date().toISOString().slice(0, 10), concepto:'', categoria:'',
    monto:0, quien:mio, notas:'', repite:fijo ? 'mensual' : '', origen:'',
    // Nace compartido, que es el caso normal, pero con la lista escrita y no vacía: el
    // vacío es la marca de «esto es de antes de que se pudiera elegir», y una fila nueva
    // eligió a todos.
    carga:PERSONAS_CAJA.map(p => p.id),
    orden:RoadmapSync.calcularOrden(ultimo, null),
  };
  datos.caja.push(m);
  // Un fijo nuevo se carga desde su bloque: si estaba plegado hay que abrirlo o la fila
  // recién creada aparecería solamente al final de la lista de abajo.
  if (fijo) cajaFijosAbiertos = true;
  renderCaja();
  persistirMovimiento(m, { revertir: () => { datos.caja = datos.caja.filter(x => x.id !== id); renderCaja(); } });
  // El cursor cae donde se apretó el botón: si el fijo nuevo se creó arriba, escribir el
  // concepto en el renglón de abajo obligaría a buscar con la vista dónde apareció.
  board.querySelector(`${fijo ? '.cjfijo' : '.cjrow'}[data-id="${CSS.escape(m.id)}"] [data-c="concepto"]`)?.focus();
}

/* Sacar un gasto de los fijos. **Es la única puerta que toca `repite` desde la pantalla**, y
   vive en el bloque de gastos fijos: en la lista de movimientos no hay con qué prender ni
   apagar la repetición. Las copias que ya se generaron no se tocan —son movimientos reales
   de meses que pasaron—; lo que se corta es de acá en adelante. */
function quitarDeFijos(m){
  if (m.repite !== 'mensual') return;
  m.repite = '';
  renderCaja();
  aviso('Ya no es un gasto fijo: las copias de los meses que pasaron quedan como están');
  persistirMovimiento(m, { revertir: () => { m.repite = 'mensual'; renderCaja(); } });
}

// Lo que se elige de un menú se guarda al toque: acá no se tipea, así que no hay nada que
// esperar con un debounce.
function cambiarCampoCaja(m, campo, valor){
  const antes = m[campo] || '';
  if (antes === (valor || '')) return;
  m[campo] = valor || '';
  renderCaja();
  persistirMovimiento(m, { revertir: () => { m[campo] = antes; renderCaja(); } });
}

async function borrarMovimiento(m){
  if (!confirm('Se borra el movimiento. ¿Seguir?')) return;
  const idx = datos.caja.findIndex(x => x.id === m.id);
  datos.caja = datos.caja.filter(x => x.id !== m.id);
  renderCaja();
  const ok = await conEstadoDeCarga(() => RoadmapSync.borrarMovimiento(m.id), {
    onEstado: onEstadoGlobal,
    revertir: () => { datos.caja.splice(idx, 0, m); renderCaja(); },
  });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.caja, m.id);
}

function editarCaja(m, campo, valor){
  const clave = 'caja:' + m.id;
  if (!snaps.has(clave)) snaps.set(clave, JSON.stringify(m));
  m[campo] = valor;
  guardarDebounced(clave, () => {
    persistirMovimiento(m, {
      revertir: () => {
        try { Object.assign(m, JSON.parse(snaps.get(clave))); } catch (e) {}
        if (!estaEditando()) renderCaja();
      },
    }).then(() => { if (!pendientesGuardado.has(clave)) snaps.delete(clave); });
  });
}

// Recalcula solo los números de arriba, para no repintar la lista mientras se escribe: un
// repintado le tiraría el cursor a la primera letra a quien esté cargando un movimiento.
function actualizarTotalesCaja(){
  const { cuentas, total, gastos, entradas } = saldoCaja(datos.caja);

  // El «X por mes» del bloque de fijos y el resumen de la lista salen de los mismos montos
  // que se acaban de tocar: sin esto se quedan con la cifra vieja hasta el próximo repintado.
  const fijos = datos.caja.filter(m => m.repite === 'mensual');
  const porMes = fijos.reduce((a, m) => a - m.monto, 0);
  const secs = board.querySelectorAll('.cjsecsub');
  if (secs[0]) secs[0].textContent = fijos.length
    ? `${fijos.length} ${fijos.length === 1 ? 'fijo' : 'fijos'} · ${fmtEur(porMes)} por mes`
    : 'Ninguno todavía';
  if (secs[1]) secs[1].textContent = `${fmtEur(gastos)} de gastos · ${fmtEur(entradas)} de entradas`;

  cuentas.forEach(c => {
    const card = board.querySelector(`[data-saldo="${CSS.escape(c.p.id)}"]`);
    if (!card) return;
    card.querySelector('.cjnum').textContent = fmtEur(c.puesto);
    card.querySelector('[data-toca]').textContent = txtToca(c.toca);
    const sub = card.querySelector('[data-saldo-txt]');
    sub.textContent = txtSaldo(c.saldo);
    sub.className = 'cjsub' + claseSaldo(c.saldo);
  });

  const card = board.querySelector('[data-total]');
  if (!card) return;
  card.querySelector('.cjnum').textContent = fmtEur(total);
  const subs = card.querySelectorAll('.cjsub');
  subs[0].textContent = `${fmtEur(gastos)} de gastos`;
  subs[1].textContent = entradas ? `${fmtEur(entradas)} entraron` : 'Sin entradas';
  subs[1].className = 'cjsub' + (entradas ? ' ok' : '');
}

/* ============================================================
   Backlog · la planificación
   ------------------------------------------------------------
   Son tareas de verdad: la misma fila de `roadmap_tareas`, los mismos campos y la misma
   ficha que las del tablero. Lo único que las separa es la columna `backlog`. Mandar una
   al tablero es apagar esa marca y nada más — llega con su explicación, su checklist, sus
   archivos y su conversación, porque nunca dejó de ser la misma fila. Con dos tablas, cada
   pasaje sería copiar filas y mover adjuntos; con una marca es un booleano.

   **Lo que se manda al tablero se va de acá** (26/8/2026, por pedido). Hasta ese día una tarea
   con sprint se quedaba en su bloque, apagada y con la cinta rayada, con la idea de poder ver
   el sprint entero al cerrarlo. En la práctica el backlog es lo que falta hacer, y una lista
   que se llena de renglones apagados esconde justo lo que queda pendiente. Ahora `enBacklog()`
   es la marca y nada más: de un lado o del otro, nunca en los dos. Qué salió de cada sprint se
   sigue sabiendo —la tarea conserva su número en `sprint`—, y devolverla al backlog la deja
   otra vez en su bloque de siempre.

   El sprint es un número y el `0` es «Sin planificar», el último bloque. Existe para que
   anotar a las apuradas no obligue a clasificar en el momento: si clasificar fuera
   obligatorio, nadie anotaría nada.

   Sobre el diseño: la rejilla es un `grid` de once columnas y no una `<table>`. Con tabla,
   el panel de planificación de cada fila tendría que vivir en un `<tr>` aparte con
   `colspan`, y la fila abierta dejaría de ser un solo bloque que se puede pintar, arrastrar
   y seleccionar entero. Las clases van todas con prefijo `b`.
   ============================================================ */
const SIN_SPRINT = 0;
const sprintDe = t => Number(t.sprint) || SIN_SPRINT;
const enBacklog = t => !!t.backlog;

/* ---------- el nombre del grupo ----------
   Los bloques del backlog se llaman como uno quiera: «Onboarding», «Lo de la AFIP», lo que
   sea. Antes eran «Sprint 1», «Sprint 2» y el número se leía como una cadencia de dos
   semanas que este equipo no usa.

   **El número sigue siendo el grupo; el nombre es un rótulo colgado de ese número.** La tarea
   guarda `sprint: 3` como siempre, así que renombrar no toca ni una fila de `roadmap_tareas`
   y una tarea no puede quedar apuntando a un grupo que no existe. Lo que se guarda aparte es
   una línea de texto por número, y nada más.

   El rótulo vive en `roadmap_notas` (ver `supabase-sync.js`): la tabla vacía de la Visión
   vieja. Una columna nueva habría dejado esto esperando a una migración —hay dos pendientes
   hace semanas— y un `localStorage` habría hecho que cada uno viera nombres distintos, que es
   justo lo contrario de ponerle nombre a algo. */
const nombreGrupo = n => (datos.grupos || []).find(g => g.n === n && g.nombre)?.nombre || '';
// El fallback es «Grupo N» y no el nombre vacío: un bloque sin título no se puede nombrar en
// el menú «Mover a otro grupo», que es donde más falta hace saber cuál es cuál.
const nombreSprint = n => (n ? (nombreGrupo(n) || 'Grupo ' + n) : 'Sin planificar');

/* ---------- dónde cae cada bloque ----------
   Los grupos se arrastran entre las tres columnas y se quedan donde uno los deja (26/8/2026,
   por pedido). Hasta ese día el reparto se calculaba solo: la lista de bloques cortada en
   tramos, en orden, como las columnas de un diario, y este archivo argumentaba que cortar de
   otra forma rompía la secuencia 1, 2, 3, 4. **Eso se cae, y lo que se pierde es real**: dónde
   está el Grupo 4 ya no se deduce de nada. Se paga porque los bloques de este tablero dejaron
   de ser una cadencia el día que se les puso nombre —«Onboarding», «Lo de la AFIP»— y cuál va
   al lado de cuál lo sabe el que los escribió, no el orden en que se crearon.

   **El lugar es del tablero y no del navegador**, igual que el nombre y al revés que el
   plegado: acomodar la hoja es una decisión sobre la hoja, y que cada uno la viera acomodada
   distinto sería justo lo contrario de acomodarla. Vive en la misma fila de `roadmap_notas`
   que ya guarda el nombre (ver `supabase-sync.js`), así que tampoco esto necesitó migración.

   **O están ubicados todos los bloques de la hoja o no lo está ninguno.** Mientras nadie haya
   arrastrado nada, el reparto es el de siempre; el primer arrastre escribe la ubicación de
   todos de una sola vez. Con la mitad ubicada y la mitad no, no habría forma de decir dónde
   entra la que no lo está sin inventar una segunda regla que después se contradice con la
   primera. */
const filaGrupo = n => (datos.grupos || []).find(g => g.n === n);
const ubicacionGrupo = n => { const g = filaGrupo(n); return g && g.col != null ? g : null; };
const hayReparto = () => (datos.grupos || []).some(g => g.col != null);

/* Los bloques que se dibujan aunque estén vacíos: siempre del 1 al N, sin huecos. El piso
   lo pone la config; sube si alguien agregó grupos con el botón, sube si hay una tarea
   guardada en un grupo más alto —un grupo con tareas no se puede esconder— y sube también si
   alguien lo tocó: un grupo con nombre o con lugar propio en la hoja es un grupo que alguien
   creó a propósito, y las dos cosas están en la base, así que las ven todos. El `UI.sprints` de
   `localStorage` queda como estaba, para el caso en que la tabla no se pueda escribir. */
function sprintsVisibles(){
  const conTareas = datos.tareas.filter(enBacklog).map(sprintDe);
  const tocados = (datos.grupos || []).filter(g => g.nombre || g.col != null).map(g => g.n);
  const piso = Math.max(1, Number(CFG.sprints) || 3, UI.sprints || 0, ...conTareas, ...tocados);
  return Array.from({ length: piso }, (_, i) => i + 1);
}

/* Los bloques que van a la hoja, en su orden natural. «Sin planificar» solo aparece si tiene
   algo: es el cajón de lo que cayó sin clasificar, no un casillero que haya que llenar. Sale de
   acá y no de `renderBacklog()` porque el arrastre necesita exactamente la misma lista para
   recalcular el reparto — con dos copias, mover un bloque con un filtro puesto lo acomodaría
   contra una hoja que no es la que está en pantalla. */
function gruposEnPantalla(){
  const ns = sprintsVisibles();
  return datos.tareas.some(t => sprintDe(t) === SIN_SPRINT && visible(t)) ? [...ns, SIN_SPRINT] : ns;
}
const tareasDeSprint = n => datos.tareas
  .filter(t => enBacklog(t) && sprintDe(t) === n)
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
// Para el selector de la ficha, que sí es un `<select>` común.
const opcionesSprint = () => sprintsVisibles().map(n => ({ id: String(n), label: nombreSprint(n) }));

/* ---------- desde cuándo está anotada ----------
   El backlog no tiene prioridad a propósito (ver `pillPrioridad`), así que lo único que le
   queda para decir qué apremia es cuánto hace que algo está anotado y todavía no salió. El
   dato ya estaba en la fila —`creada`, que se pintaba como una pastilla tenue y nada más— y
   desde el 26/8/2026 además tiñe el riel de la puerta y se cuenta por grupo.

   **El umbral es uno solo y vive acá.** El color del riel, la pastilla ámbar de la fila y el
   «N sin salir» de la cabecera son tres formas de decir lo mismo: con el número escrito en
   tres lugares se contradicen la primera vez que alguien toque uno, y una fila ámbar dentro de
   un grupo que dice «0 sin salir» no se le explica a nadie. */
const UMBRAL_VIEJA = 30;
const diasAnotada = t => antiguedad(t.creada)?.dias ?? 0;
const esVieja = t => diasAnotada(t) >= UMBRAL_VIEJA;

/* ---------- desde cuándo está en el tablero ----------
   Es otra fecha que `creada`, y la diferencia es todo el punto: una tarea anotada en marzo que
   recién sale del backlog en agosto lleva cinco meses anotada y cero días en la cancha. El
   número de la fila cuenta lo segundo (ver `pillDias()`).

   **Vive en `tipo`, la columna muerta de la clasificación de actividades** (26/8/2026). Es la
   misma jugada que `modulo` con el «Área», `hoy` con la chapa de novedad y `texto`/`orden` de
   `roadmap_notas` con la columna de cada grupo, y por el mismo motivo: hay dos migraciones
   esperando hace semanas, así que una columna nueva sería condenar esta cuenta a esperar una
   tercera. La columna es `text`, nadie la lee desde que se sacó el `<select>` de la ficha y
   `guardarTarea()` ya la escribe en cada guardado.

   **Se lee estricto, con la forma de una fecha ISO, y nunca «lo que haya»**: ahí adentro está
   cargado el `'nuevo'` de fábrica y las cuatro categorías viejas, y un `new Date('nuevo')` no
   falla, devuelve `Invalid Date`. La misma regla que el prefijo `grupo-` de `roadmap_notas`:
   una tabla o una columna reusada se corta por la forma del dato y no por confianza.

   **Sin fecha guardada la cuenta cae en `creada`**, que es exactamente lo que el número decía
   antes de que esto existiera: ninguna fila cambia de valor al subir el cambio y no hay nada
   que migrar. Cada tarea empieza a contar de verdad la próxima vez que entre al tablero. */
const CAMPO_ENTRADA = 'tipo';
const entroAlTablero = t => /^\d{4}-\d{2}-\d{2}/.test(t[CAMPO_ENTRADA] || '') ? t[CAMPO_ENTRADA] : '';
const enTableroDesde = t => entroAlTablero(t) || t.creada;

/* El color del riel en el backlog, donde no hay prioridad que lo pinte. Son tres bandas y no
   un degradé: lo que se lee bajando por la columna es «esto ya lleva demasiado», no cuántos
   días exactos —eso lo dice la pastilla, que está al lado—. */
const colorRiel = t => {
  const d = diasAnotada(t);
  return d >= UMBRAL_VIEJA ? '#F0A972' : d >= 14 ? '#B6B1EE' : '#D3D1CA';
};

/* Qué bloques dejó cerrados y qué paneles dejó abiertos son del navegador de cada uno y no
   del tablero: que alguien pliegue el Sprint 3 para leer cómodo no tiene por qué
   plegárselo a los demás. */
let sprintsPlegados = new Set();
try { sprintsPlegados = new Set(JSON.parse(localStorage.getItem('backlog-plegados') || '[]')); }
catch (e) { /* si no se puede leer, abre todo y listo */ }
function guardarPlegados(){
  try { localStorage.setItem('backlog-plegados', JSON.stringify([...sprintsPlegados])); }
  catch (e) { /* modo privado o storage lleno: no es crítico */ }
}
// Fila con el menú `⋯` desplegado. Uno solo a la vez.
let menuFila = null;
// Grupo que está siendo bautizado, si hay alguno. Es de este rato y de esta pantalla: no se
// guarda en ningún lado, y cualquier repintado que no venga de acá lo deja como está.
let renombrando = null;

/* Tarea recién creada que todavía se está bautizando en la fila, si hay alguna. Es el gemelo
   exacto de `renombrando`: de este rato y de esta pantalla, sin guardarse en ningún lado.

   El título de una fila sigue sin editarse —es la puerta a la tarea, en las dos listas— y esto
   no lo contradice: dura lo que dura escribir el nombre de la tarea que se acaba de crear, y
   desaparece en cuanto se sale del campo. Anotar es lo que se viene a hacer al backlog, y
   mandar a la página por cada renglón para escribir el título era irse de la lista y volver
   por cada cosa anotada. */
let bautizando = null;

// Una copia de las filas de grupo, para poder volver a dejarlas como estaban si la base
// rechaza el guardado. Son cuatro campos por grupo y un puñado de grupos: sale más barato
// clonar la lista entera que llevar la cuenta de qué tocó cada camino.
const copiaDeGrupos = () => (datos.grupos || []).map(g => ({ ...g }));

/* Guarda una fila de grupo —el nombre y dónde está el bloque en la hoja— o la borra si no le
   queda ninguna de las dos cosas. Optimista como todo lo demás: ya está en pantalla y esto es
   lo que lo hace durar. */
async function persistirGrupo(n, previo){
  const g = filaGrupo(n);
  const ok = await conEstadoDeCarga(
    () => (g
      ? RoadmapSync.guardarGrupos([{ n, nombre: g.nombre || '', col: g.col ?? null, pos: g.pos ?? null }])
      : RoadmapSync.borrarGrupo(n)),
    { onEstado: onEstadoGlobal, revertir: () => { datos.grupos = previo; renderBacklog(); } });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.grupos, RoadmapSync.idGrupo(n));
}

/* El nombre en memoria, para pintarlo antes de que la base conteste.

   **Quedarse sin nombre ya no siempre borra la fila.** Sigue valiendo el «una fila sin nombre
   no existe» de siempre —el bloque vuelve a llamarse «Grupo N»— pero solo si esa fila no
   guarda además dónde está el bloque en la hoja: borrarla ahí le movería la columna a un
   grupo por haberle vaciado el rótulo, que son dos cosas que no tienen nada que ver. */
function fijarNombreGrupo(n, nombre){
  const g = filaGrupo(n);
  if (!nombre && (!g || g.col == null)) {
    datos.grupos = (datos.grupos || []).filter(x => x.n !== n);
    return;
  }
  if (g) { g.nombre = nombre; return; }
  (datos.grupos = datos.grupos || []).push({ n, nombre, col: null, pos: null });
}

/* El lugar de un bloque en memoria, igual que el nombre y en la misma fila. */
function fijarUbicacionGrupo(n, col, pos){
  const g = filaGrupo(n);
  if (g) { g.col = col; g.pos = pos; return; }
  (datos.grupos = datos.grupos || []).push({ n, nombre: '', col, pos });
}

/* Acomoda un bloque: lo saca de donde estaba y lo mete en la columna y el lugar donde lo
   soltaron. **Reescribe el reparto entero y no solo el bloque que se movió**, que es lo que
   materializa las ubicaciones la primera vez (ver el cuadro de arriba) y lo que después
   mantiene las posiciones sin huecos: con los números al día, la posición de un bloque es su
   índice y no hay que promediar nada entre dos vecinos como con las tareas. */
function moverGrupo(n, col, idx){
  const cols = columnasDeGrupos(gruposEnPantalla()).map(c => [...c]);
  const desde = cols.findIndex(c => c.includes(n));
  if (desde < 0) return;
  const j = cols[desde].indexOf(n);
  cols[desde].splice(j, 1);
  // El índice se calculó con el bloque todavía en su lugar: si salió de más arriba en la misma
  // columna, todo lo que estaba abajo subió uno.
  if (desde === col && j < idx) idx--;
  if (desde === col && j === idx) return;
  cols[col].splice(Math.min(idx, cols[col].length), 0, n);

  const previo = copiaDeGrupos();
  cols.forEach((c, i) => c.forEach((m, p) => fijarUbicacionGrupo(m, i, p)));
  renderBacklog();
  persistirReparto(cols.flat(), previo);
}

// Un solo viaje para toda la hoja: acomodar un bloque cambia la posición de todos los que
// tenía debajo, y N guardados sueltos serían N formas distintas de quedar a medias.
async function persistirReparto(ns, previo){
  const filas = ns.map(filaGrupo).filter(Boolean)
    .map(g => ({ n: g.n, nombre: g.nombre || '', col: g.col, pos: g.pos }));
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarGrupos(filas), {
    onEstado: onEstadoGlobal,
    revertir: () => { datos.grupos = previo; renderBacklog(); },
  });
  if (ok) filas.forEach(f => marcarEcoPropio(RoadmapSync.TABLAS.grupos, RoadmapSync.idGrupo(f.n)));
}

/* El campo del nombre se engancha a mano y no por delegación, al revés que todo lo demás de
   esta pantalla. Es que hay uno solo y nace de cero en cada repintado: colgarle sus dos
   manejadores directamente no acumula nada, y evita tener que prender el `onfocusout` del
   board —que la lista apaga a propósito, porque es de la caja— para un campo que aparece dos
   segundos cada tanto.

   Se guarda al salir del campo, no tecla por tecla: es un rótulo corto que se escribe de una
   sentada, y un guardado por letra serían diez viajes a la base para un dato de cinco. */
function engancharNombreDeGrupo(){
  const el = board.querySelector('.bkedit'); if (!el) return;
  el.focus();
  el.select();

  let cancelado = false;
  /* Las dos teclas se frenan acá: el board escucha las mismas por delegación —Enter abre una
     fila nueva, Escape quita las marcas— y escribir el nombre de un grupo no tiene por qué
     hacer ninguna de las dos cosas. */
  el.onkeydown = ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); el.blur(); return; }
    // Escape deja el nombre como estaba. El `blur` que viene atrás no tiene que guardar nada.
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      cancelado = true; renombrando = null; renderBacklog();
    }
  };

  el.onblur = () => {
    const n = Number(el.dataset.renombre);
    renombrando = null;
    if (cancelado) return;
    const nombre = el.value.trim();
    if (nombre === nombreGrupo(n)) return renderBacklog();
    // La copia va antes de tocar nada: la fila guarda además dónde está el bloque en la hoja,
    // y revertir un renombre no puede llevarse puesta la columna de nadie.
    const previo = copiaDeGrupos();
    fijarNombreGrupo(n, nombre);
    renderBacklog();
    persistirGrupo(n, previo);
  };
}

/* El título de la tarea recién creada. Se engancha a mano y no por delegación por lo mismo que
   el nombre del grupo: hay uno solo, nace de cero en cada repintado y así no hace falta prender
   el `onkeydown` ni el `onfocusout` del board, que la lista apaga a propósito.

   Guarda al salir del campo y no tecla por tecla: es un título corto que se escribe de una
   sentada, y un guardado por letra serían veinte viajes a la base para un dato de veinte. */
function engancharTituloNuevo(){
  const el = board.querySelector('[data-bautizo]');
  /* Sin campo en pantalla no hay bautizo: la fila puede no haberse dibujado —un filtro o el
     buscador prendidos dejan afuera a una tarea que todavía no dice nada—. Se limpia acá, que
     es el único lugar que sabe si el campo existe de verdad: si no, la marca quedaría puesta y
     le pondría un `<input>` encima del título a esa fila en cuanto el filtro la deje pasar. */
  if (!el) { bautizando = null; return; }
  el.focus();
  el.select();

  let cancelado = false;
  el.onkeydown = ev => {
    // Enter cierra el bautizo y nada más: no abre la fila siguiente. Anotar de corrido se fue
    // con el título editable de la fila, y volver a meterlo acá sería tener dos reglas para el
    // mismo Enter según de qué fila se trate.
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); el.blur(); return; }
    /* Escape deja la tarea como nació —sin título, con su responsable— y no la borra: ya está
       creada y persistida, igual que si se hubiera entrado a la página y salido sin escribir.
       El `blur` que viene atrás no tiene que guardar nada. */
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      cancelado = true; bautizando = null; render();
    }
  };

  el.onblur = () => {
    const t = tarea(el.dataset.bautizo);
    bautizando = null;
    if (cancelado) return;
    // La tarea puede haber desaparecido mientras se escribía —un borrado de otro, un revert—:
    // no hay a qué guardarle el título, pero la fila con el campo sigue en pantalla.
    if (!t) return render();
    const titulo = el.value.trim();
    // `campoTarea()` corta solo si el valor no cambió, y ahí no repinta: sin este render la
    // fila se quedaría con el `<input>` puesto.
    if (titulo === t.tarea) return render();
    campoTarea(t, 'tarea', titulo);
  };
}

/* ---------- la hoja de notas del backlog ----------
   Un cuadro del ancho de la hoja, arriba de todos los grupos, para escribir a mano lo que no es
   una tarea: un pendiente suelto, un recordatorio, algo que hay que preguntar. Existe porque el
   backlog es lo único que se mira antes de repartir trabajo, y hasta ahora la única forma de
   anotar algo ahí era crear una tarea — que después hay que clasificar, asignar y sacar.

   **Es texto plano y no bloques.** Tres razones y las tres apuntan al mismo lado: es una nota al
   margen, no un documento. Con bloques habría que decidir dónde vive el árbol, qué pasa al
   arrastrar y cómo se anida, que es media pantalla de reglas para algo que se escribe en diez
   segundos. Lo que se pega entra como texto y por eso tampoco hace falta un sanitizador, la
   misma regla que ya tenía la Explicación de la ficha.

   **El cuadro es del tablero y el plegado es de cada uno.** Lo escrito lo ven los tres —para eso
   está—, pero que alguien la cierre para ver más grupos a la vez no tiene por qué cerrársela a
   los demás. Es exactamente el reparto que ya tienen los grupos: el nombre en la base, el
   plegado en `localStorage`.

   **Va solo en el backlog y no en el tablero-lista**, aunque las dos listas sean el mismo
   componente. La nota es de la planificación; arriba del tablero sería un cuadro de texto libre
   compitiendo con el trabajo del día. */
let notaPlegada = false;
try { notaPlegada = localStorage.getItem('backlog-nota') === 'plegada'; }
catch (e) { /* si no se puede leer, abre y listo */ }
function guardarNotaPlegada(){
  try { localStorage.setItem('backlog-nota', notaPlegada ? 'plegada' : 'abierta'); }
  catch (e) { /* modo privado o storage lleno: no es crítico */ }
}

/* Se guarda con retraso y no tecla por tecla: es texto corrido, y un viaje a la base por letra
   son cien viajes para una nota de cien caracteres. El temporizador vive afuera del enganche
   porque la hoja se repinta entera ante cualquier cambio del tablero y el guardado pendiente
   tiene que sobrevivir a eso — por lo mismo lee `datos.nota` y no el elemento, que para cuando
   el temporizador corre puede ser otro. */
const ESPERA_NOTA = 700;
let guardadoDeNota = null;

/* Lo escrito que la base todavía no confirmó. Es la misma regla que la página de una tarea —el
   árbol se rearma desde `expl` **salvo que haya un guardado en vuelo**— y acá hace falta por lo
   mismo: un cambio de otro llegando por realtime recarga `datos` entero, y sin esto la recarga
   pisaría en pantalla lo que estás terminando de escribir con la versión que había en la base.
   Se limpia solo cuando la base confirmó ese mismo texto; si falló, lo tuyo se queda. */
let notaEnVuelo = null;
const textoDeNota = () => notaEnVuelo ?? datos.nota;

function programarGuardadoDeNota(){
  clearTimeout(guardadoDeNota);
  guardadoDeNota = setTimeout(persistirNota, ESPERA_NOTA);
}
async function persistirNota(){
  clearTimeout(guardadoDeNota);
  guardadoDeNota = null;
  const texto = textoDeNota();
  /* Sin `revertir`, al revés que el nombre de un grupo: revertir es devolver el valor anterior a
     la pantalla, y acá el valor anterior es lo que la persona tiene escrito adelante y sigue
     escribiendo. Que falle avisa y nada más, que es la regla de los campos con autoguardado. */
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarNota(texto),
    { onEstado: onEstadoGlobal });
  if (!ok) return;
  marcarEcoPropio(RoadmapSync.TABLAS.grupos, RoadmapSync.ID_NOTA);
  datos.nota = texto;
  // Solo si nadie escribió más mientras el guardado viajaba: si no, lo nuevo perdería su marca
  // de «todavía sin confirmar» y el próximo refresco se lo llevaría puesto.
  if (notaEnVuelo === texto) notaEnVuelo = null;
}

/* Alto contenido: la nota no puede robarle la pantalla al backlog, que es a lo que se vino. El
   cuadro crece con lo escrito hasta un tope y de ahí en más se scrollea solo — el tope está en
   el CSS, que es donde se mide el espacio. */
function notaHTML(){
  return `<section class="bknota${notaPlegada ? ' plegada' : ''}">
    <button class="bkfold bknota-h" type="button" data-nota-plegar aria-expanded="${!notaPlegada}"
      title="${notaPlegada ? 'Abrir las notas' : 'Cerrar las notas'}">
      <span class="bkcar${notaPlegada ? '' : ' on'}" aria-hidden="true">▸</span>
      <span class="bkname">Notas</span>
    </button>
    <div class="bknota-txt" contenteditable="true" data-nota spellcheck="false"
      role="textbox" aria-multiline="true" aria-label="Notas del backlog"
      data-ph="Lo que quieras anotar acá">${esc(textoDeNota())}</div>
  </section>`;
}

/* Se engancha a mano y no por delegación, igual que el nombre de un grupo y por el mismo motivo:
   `engancharLista()` anula `oninput`, `onpaste` y `onkeydown` del board a propósito —son de la
   caja— y hay un solo cuadro de notas, que nace de cero en cada repintado. */
function engancharNota(){
  const caja = board.querySelector('.bknota'); if (!caja) return;

  caja.querySelector('[data-nota-plegar]').onclick = () => {
    notaPlegada = !notaPlegada;
    guardarNotaPlegada();
    renderBacklog();
  };

  const el = caja.querySelector('[data-nota]');

  /* Lo pegado entra siempre como texto plano: es lo que hace que no haya nada que limpiar. Sin
     esto, copiar de una página trae su HTML entero adentro de la nota. */
  el.onpaste = ev => {
    ev.preventDefault();
    const texto = (ev.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, texto);
  };

  /* En memoria al toque y a la base con retraso: lo que se ve es lo tipeado y el viaje va atrás.
     `innerText` y no `textContent` porque los saltos de línea de un `contenteditable` son
     elementos, y `textContent` los pegotearía todos en un renglón. */
  el.oninput = () => { notaEnVuelo = el.innerText; programarGuardadoDeNota(); };

  // Salir del cuadro no espera al temporizador: es el momento en que se terminó de escribir.
  el.onblur = () => { if (guardadoDeNota) persistirNota(); };

  /* Acá adentro las teclas son de la nota y de nadie más. Enter hace lo suyo —un renglón nuevo—
     y no abre una fila, y Escape no tiene por qué tocar el tablero de atrás. */
  el.onkeydown = ev => ev.stopPropagation();
}

/* ---------- el tablero como lista ----------
   La tercera forma de mirar el tablero. Es la MISMA hoja de renglones del backlog —las mismas
   clases, los mismos controles, los mismos manejadores— agrupada por estado en vez de por
   sprint. No es una vista: la vista sigue siendo el tablero, con sus filtros, su buscador y su
   contador; lo que cambia es cómo se dibuja lo que ese filtro deja pasar.

   Agrupa por estado y no por prioridad porque el eje del tablero ES el estado: las columnas
   son estados, las filas son estados, y que la tercera agrupara por otra cosa haría que las
   tres vistas del mismo botón mostraran tres ordenamientos distintos. Además así arrastrar un
   renglón a otro bloque significa lo mismo que arrastrar una tarjeta a otra columna. */
let estadosPlegados = new Set();
try { estadosPlegados = new Set(JSON.parse(localStorage.getItem('tablero-plegados') || '[]')); }
catch (e) { /* si no se puede leer, abre todo y listo */ }
function guardarEstadosPlegados(){
  try { localStorage.setItem('tablero-plegados', JSON.stringify([...estadosPlegados])); }
  catch (e) { /* modo privado o storage lleno: no es crítico */ }
}
/* Terminadas es la excepción y no lleva marca propia: se pliega con `UI.terminadasAbiertas`,
   la misma preferencia que usa la columna. Que plegar Terminadas en columnas la dejara abierta
   en la lista sería tener dos veces la misma decisión y que se contradigan. */
const estadoPlegado = id => id === HECHO ? !UI.terminadasAbiertas : estadosPlegados.has(id);
function alternarEstadoPlegado(id){
  if (id === HECHO) { UI.terminadasAbiertas = !UI.terminadasAbiertas; return guardarUI(); }
  estadosPlegados.has(id) ? estadosPlegados.delete(id) : estadosPlegados.add(id);
  guardarEstadosPlegados();
}

/* Las hermanas de un renglón dentro de su bloque, en el orden en que se ven. Es el equivalente
   de `tareasDeSprint()`: lo que necesita el arrastre para calcular un orden entre dos.

   Compara contra `estadoDe()` y no contra el campo crudo —igual que el filtro de prioridad—
   para que el pintado, el arrastre y las hermanas usen exactamente el mismo criterio. Con el
   campo crudo, una fila con un estado que no está en el catálogo se dibujaría en «Nueva»
   (porque `grupoDe` la normaliza) pero no aparecería en las hermanas de ese bloque, y soltar
   algo encima le calcularía el orden contra una lista que no la incluye.

   **Adentro del bloque se apila por prioridad**: primero lo crítico, al final lo mensual, y
   recién dentro de cada banda manda el `orden` a mano. Es exactamente lo que ya hacen las
   otras dos formas del tablero, donde cada prioridad es su propia banda adentro de la columna;
   acá las bandas no se dibujan —cinco bloques por cuatro títulos, en una columna de un tercio
   de pantalla, es más encabezado que tarea— pero el apilado es el mismo, así que un mismo
   tablero se lee igual en los tres layouts. El backlog no entra en esto: ahí no hay prioridad.

   El rango sale del índice en `PRIORIDADES`, que ya está escrita de lo más urgente a lo menos:
   un número aparte sería un segundo lugar donde acordarse del orden. */
const rangoPrioridad = t => PRIORIDADES.indexOf(prioridadDe(t.prioridad));
const porPrioridad = (a, b) =>
  rangoPrioridad(a) - rangoPrioridad(b) || (a.orden || 0) - (b.orden || 0);
const tareasDeEstado = id => datos.tareas
  .filter(t => !t.backlog && estadoDe(t.estado).id === id)
  .sort(porPrioridad);

/* ---------- pintado ----------
   El backlog y la página de una tarea son EL MISMO componente, y por eso comparten las
   clases `pg`: una columna angosta de renglones con sangría, la canaleta de controles a la
   izquierda y las catalogaciones a la derecha. Cambia lo que hay adentro de cada renglón,
   no la forma.

   Acá el árbol no se guarda en ningún lado: se arma en el momento. Los sprints son los
   renglones desplegables y las tareas los renglones `▤` que cuelgan de ellos. Un sprint no
   es una fila de ninguna tabla —es el número que tiene cada tarea en `sprint`—, así que
   plegarlo, contarlo o crear uno nuevo no toca la base. */

/* **Los grupos van repartidos en tres columnas** (26/8/2026, por pedido), las mismas tres del
   tablero y con el mismo reparto de ancho: 1.18 / 1.18 / 0.64.

   **Cuál va en cuál lo decide el que acomodó la hoja, no esta función** (26/8/2026, por pedido).
   Mientras nadie haya arrastrado un bloque, el corte es el de siempre: en orden y de a tramos,
   así que se lee 1, 2, 3, 4 bajando por la izquierda y siguiendo por la del medio, como las
   columnas de un diario. Con la hoja acomodada esa lectura deja de estar garantizada — es la
   contrapartida, y está asumida en el cuadro de `ubicacionGrupo`.

   El reparto de ancho, en cambio, se copia y no se deduce: en el tablero la tercera columna es
   angosta porque apila los tres finales del camino, que se consultan; acá los grupos son
   intercambiables entre sí y ninguno merece menos ancho que otro. **Contrapartida asumida**:
   los últimos entran más angostos sin que eso signifique nada sobre ellos. Se paga porque las
   dos listas tienen que leerse igual — son la misma hoja mirada por otro eje.

   El bloque sin lugar propio cae al pie de la última columna: es donde nace todo lo nuevo acá
   —el «＋ Nuevo grupo» está justo ahí— y es donde ya caía «Sin planificar» por ser el último. */
function columnasDeGrupos(ns){
  if (!hayReparto()) {
    /* El corte es por cantidad de bloques y no por altura: un grupo de treinta tareas frente a
       uno de dos deja una columna mucho más larga. Balancear por altura pondría el Grupo 4
       arriba del 3, que mientras nadie acomodó nada es lo que la secuencia no permite. */
    const tramos = [];
    for (let i = 0, faltan = COLUMNAS_BACKLOG; faltan > 0; faltan--) {
      const cuantos = Math.ceil((ns.length - i) / faltan);
      tramos.push(ns.slice(i, i + cuantos));
      i += cuantos;
    }
    return tramos;
  }
  const cols = Array.from({ length: COLUMNAS_BACKLOG }, () => []);
  ns.forEach(n => {
    const u = ubicacionGrupo(n);
    // Una columna guardada que ya no existe —si algún día la hoja se parte en menos— no puede
    // hacer desaparecer un bloque: cae en la última, la misma regla que los estados sueltos.
    const c = u ? Math.min(Math.max(u.col, 0), COLUMNAS_BACKLOG - 1) : COLUMNAS_BACKLOG - 1;
    // Al final y no `Infinity`: con dos bloques sin lugar la resta daría `NaN` y el comparador
    // dejaría de ser un comparador.
    cols[c].push({ n, pos: u ? u.pos : Number.MAX_SAFE_INTEGER });
  });
  // `sort` es estable, así que los que caen sin lugar propio quedan entre sí en el orden natural.
  return cols.map(c => c.sort((a, b) => a.pos - b.pos).map(x => x.n));
}

function renderBacklog(){
  listaActual = LISTAS.sprint;
  const mostradas = datos.tareas.filter(visible);
  const grupos = gruposEnPantalla();
  const siguiente = sprintsVisibles().length + 1;

  const lista = n => mostradas.filter(t => sprintDe(t) === n)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const columnas = columnasDeGrupos(grupos);

  /* Un solo «＋ Nuevo grupo» y va al pie de la ÚLTIMA columna, aunque el diseño le ponga uno a
     cada una. El que nace es siempre el N+1 y aparece siempre ahí —después se lo arrastra a
     donde tenga que ir—, así que dos botones que hacen lo mismo pero prometen dos lugares
     distintos serían un botón que miente. */
  const nuevo = `<button class="pgnew" type="button" data-sprint-nuevo data-n="${siguiente}">＋ Nuevo grupo</button>`;

  /* Sin encabezado: la pestaña ya dice dónde estás y cada sprint ya lleva su contador al lado
     del nombre. La miga, el contador general, el título y la bajada eran medio scroll de
     repetir lo obvio que empujaba el primer sprint hacia abajo. El aire de arriba lo pone
     ahora `.bkwrap`, en el CSS.

     Lo único que va arriba de los grupos es la hoja de notas, y va AFUERA de `.pgbody`: adentro
     sería una caja más de la grilla de tres columnas y se metería en una sola. Es del ancho de
     la hoja porque lo que se escribe ahí no es de ningún grupo.

     El `data-col` es del arrastre de bloques: es lo único que le dice a dónde cayó lo que se
     soltó. La lista por estado no lo lleva —ahí la columna la fija `COLUMNAS_LISTA` y no una
     preferencia de nadie—, y eso es justo lo que hace que el mismo manejador no acomode nada
     del otro lado. */
  board.innerHTML = `<div class="pgwrap bkwrap bkcols" style="${ANCHO_AVATARES}">
    ${notaHTML()}
    <div class="pgbody">${columnas.map((col, i) => `<div class="bkcol" data-col="${i}">${
      col.map(n => filaSprintHTML(n, lista(n))).join('')
    }${i === columnas.length - 1 ? nuevo : ''}</div>`).join('')}</div>
  </div>`;

  engancharLista();
  engancharNota();
}

/* Cómo se reparten los estados en las columnas de la lista. Se escribe por id y no por
   posición dentro de `ESTADOS` para que reordenar el catálogo no le cambie la columna a nadie
   sin querer, y lo que no esté nombrado acá cae en la última: un estado nuevo tiene que
   aparecer en alguna parte, y desaparecer de la pantalla es bastante peor que caer en la
   columna equivocada.

   El reparto no es parejo a propósito. Nueva y En curso son los dos bloques que se miran
   todo el día y se llevan una columna cada uno; Bloqueada, En revisión y Terminada son los
   tres finales del camino, se apilan en la tercera y comparten el ancho que les sobra. */
const COLUMNAS_LISTA = [['Pendiente'], ['En curso'], ['Bloqueado', 'Revision', HECHO]];

/* Cuántas columnas parte el backlog. Es el largo de `COLUMNAS_LISTA` y no un `3` escrito otra
   vez: las dos listas se parten igual —misma cantidad y mismo reparto de ancho en el CSS— y con
   el número en dos lugares, agregarle una columna al tablero dejaría el backlog en tres tracks
   de grilla con dos cajas adentro. Acá el reparto no puede salir del contenido, porque los
   grupos son intercambiables entre sí: se copia a propósito, para que la pantalla se lea igual
   de los dos lados. */
const COLUMNAS_BACKLOG = COLUMNAS_LISTA.length;
function columnasDeEstados(){
  const puestos = new Set(COLUMNAS_LISTA.flat());
  const sueltos = ESTADOS.filter(c => !puestos.has(c.id));
  const ultima = COLUMNAS_LISTA.length - 1;
  return COLUMNAS_LISTA.map((ids, i) => [
    ...ids.map(id => ESTADOS.find(c => c.id === id)).filter(Boolean),
    ...(i === ultima ? sueltos : []),
  ]);
}

/* La misma hoja, agrupada por estado y repartida en tres columnas (26/8/2026). Los bloques
   son los cinco de siempre y se dibujan todos, incluso vacíos: acá no hay un «Sin planificar»
   que sea un cajón de resto — un estado sin tareas es información (nada bloqueado, nada en
   revisión) y además es dónde soltar la primera. Por eso tampoco lleva el `＋ Sprint` del
   final: los estados son un catálogo cerrado, no algo que se agregue desde la pantalla.

   Las columnas son del pintado y de nadie más: cada bloque conserva su `data-g` y su
   `data-filas`, así que arrastrar, plegar y crear siguen andando exactamente igual y los
   manejadores de `engancharLista()` no se enteran de que ahora hay tres cajas. */
function renderListaEstados(){
  listaActual = LISTAS.estado;
  const mostradas = datos.tareas.filter(visible);

  /* Con el filtro vacío se dice y nada más: cinco bloques en cero no explican que lo que
     falta es sacar un tilde. El cartel reemplaza a la lista pero NO al enganche —`render()`
     no limpia los manejadores al entrar acá, así que salir sin volver a colgarlos dejaría
     vivos los del repintado anterior, apuntando a la otra lista. */
  const vacio = !mostradas.length && filtrando();

  // Mismo criterio que `tareasDeEstado()` y no una copia del `sort`: el pintado y el arrastre
  // tienen que estar de acuerdo en dónde va cada fila, si no soltar algo encima le calcula el
  // orden contra una lista que se ve distinta.
  const bloque = c => filaEstadoHTML(c,
    mostradas.filter(t => estadoDe(t.estado).id === c.id).sort(porPrioridad));

  board.innerHTML = (vacio
    ? `<p class="empty-board">Ninguna tarea encaja con este filtro.<br>Probá vaciar la búsqueda o destildar los filtros.</p>`
    : `<div class="pgwrap bkwrap bkcols" style="${ANCHO_AVATARES}">
    <div class="pgbody">${columnasDeEstados()
      .map(col => `<div class="bkcol">${col.map(bloque).join('')}</div>`).join('')}</div>
  </div>`);

  engancharLista();
}

/* El renglón del estado. Mismo desplegable que el del sprint, con una sola cosa propia: **el
   punto de color**, que es el mismo de la columna. Es lo que ata las vistas entre sí — el verde
   de Terminada tiene que ser el mismo mire por donde se mire.

   **A la derecha ya no va nada** (26/8/2026, por pedido). Vivían ahí dos pastillas y se fueron
   las dos:

   - **«N críticas»**, que repetía en la cabecera lo que el bloque de abajo ya dice fila por
     fila y en color: las críticas se apilan arriba de todo (ver `porPrioridad`) y su riel es
     rojo. Contarlas otra vez arriba era el mismo dato dos veces en la misma pantalla.
   - **El porcentaje**, que medía cuánto del tablero estaba parado en ese estado. Un número que
     hay que interpretar —¿32% es mucho?— pegado a un contador que dice la cuenta de verdad.

   **Contrapartida asumida**: plegado el bloque, lo único que queda a la vista es el nombre y el
   contador. Es exactamente lo que se pliega para ver, así que se paga barato. */
function filaEstadoHTML(c, lista){
  const plegado = estadoPlegado(c.id);
  return `<div class="pgrow pg-toggle bksprint" data-g="${escA(c.id)}">
      <div class="pgctl">
        <button class="pgadd" type="button" data-agregar="${escA(c.id)}" title="Agregar una tarea acá" aria-label="Agregar una tarea acá">＋</button>
      </div>
      <button class="bkfold" type="button" data-plegar="${escA(c.id)}" aria-expanded="${!plegado}"
        title="${plegado ? 'Abrir' : 'Cerrar'} ${escA(c.label)}">
        <span class="bkcar${plegado ? '' : ' on'}" aria-hidden="true">▸</span>
        <span class="bkdot" style="background:${c.color}"></span>
        <span class="bkname">${esc(c.label)}</span>
        <span class="bkn">${lista.length}</span>
      </button>
    </div>
    <div class="pgkids${plegado ? ' plegado' : ''}" data-filas="${escA(c.id)}">
      ${lista.map(filaTareaHTML).join('')}
      <button class="pgadd-fila" type="button" data-agregar="${escA(c.id)}">＋ Agregar una tarea</button>
    </div>`;
}

/* El renglón del grupo: el mismo desplegable que adentro de una página. Lo que cuelga va en
   un envoltorio propio y no suelto entre hermanos, por dos razones prácticas: plegar es
   esconder un solo elemento, y soltar una tarea en el hueco de un grupo vacío necesita algo
   sobre lo que soltarla.

   **El nombre se edita en un `<input>` que reemplaza al botón entero, y no adentro de él.**
   Un `contenteditable` metido en un `<button>` es HTML inválido y, peor, cada clic para
   corregir una letra le llegaría igual al botón: cambiarle el nombre a un grupo lo plegaría y
   lo desplegaría de paso. Mientras se escribe, plegar no está disponible — dura los dos
   segundos que dura escribir un nombre.

   El lápiz vive en las pills de la derecha, con el resto de lo que se toca. En la lista de
   estados no va: ahí los bloques son el catálogo de estados y no se renombran.

   **El `⠿` de la canaleta acomoda el bloque entre las columnas** (26/8/2026, por pedido). Es el
   mismo asa, en el mismo lugar y con el mismo dibujo que la de una tarea, y eso es a propósito:
   ahí adentro la fila se arrastra para cambiarla de bloque, y acá el bloque se arrastra para
   cambiarlo de columna. Un asa distinta para lo mismo un nivel más arriba sería un control que
   hay que aprenderse aparte. Tampoco va en la lista por estado, por lo mismo que el lápiz: la
   columna de un estado la fija `COLUMNAS_LISTA`. */
function filaSprintHTML(n, lista){
  const plegado = sprintsPlegados.has(String(n));
  /* Cuántas de este grupo ya llevan demasiado anotadas. Va en la cabecera y no solo en cada
     fila porque plegado el bloque es lo único que queda a la vista: de un vistazo se ve qué
     grupo se está pudriendo sin tener que abrirlo. Fue el gemelo del «N críticas» de la lista
     por estado, que se sacó el 26/8/2026; este se queda porque no repite nada de lo de abajo:
     desde que la antigüedad salió de la fila, esto y el color del riel son lo único que el
     backlog dice sobre qué se está pudriendo. Se dibuja solo si hay alguna — un «0 sin salir»
     es un cartel para decir que no pasa nada. */
  const viejas = lista.filter(esVieja).length;
  const editando = renombrando === String(n);
  const cabecera = editando
    ? `<span class="bkfold editando">
        <span class="bkcar${plegado ? '' : ' on'}" aria-hidden="true">▸</span>
        <input class="bkedit" type="text" data-renombre="${n}" spellcheck="false"
          value="${escA(nombreGrupo(n))}" placeholder="${escA('Grupo ' + n)}"
          aria-label="Nombre del grupo">
      </span>`
    : `<button class="bkfold" type="button" data-plegar="${n}" aria-expanded="${!plegado}"
        title="${plegado ? 'Abrir el grupo' : 'Cerrar el grupo'}">
        <span class="bkcar${plegado ? '' : ' on'}" aria-hidden="true">▸</span>
        <span class="bkname">${esc(nombreSprint(n))}</span>
        <span class="bkn">${lista.length}</span>
      </button>`;
  return `<div class="pgrow pg-toggle bksprint" data-g="${n}">
      <div class="pgctl">
        <button class="pgadd" type="button" data-agregar="${n}" title="Anotar una tarea acá" aria-label="Anotar una tarea acá">＋</button>
        <button class="pgdrag" type="button" draggable="true" data-drag-grupo="${n}"
          title="Arrastrar para acomodar el grupo en otra columna" aria-label="Mover el grupo">⠿</button>
      </div>
      ${cabecera}
      <span class="pgpills">
        <button class="pgpill lapiz" type="button" data-renombrar="${n}"
          title="Ponerle nombre al grupo" aria-label="Ponerle nombre al grupo">✎</button>
        ${viejas ? `<span class="pgpill rancio" title="Anotadas hace más de ${UMBRAL_VIEJA} días y todavía sin salir al tablero">${viejas} sin salir</span>` : ''}
      </span>
    </div>
    <div class="pgkids${plegado ? ' plegado' : ''}" data-filas="${n}">
      ${lista.map(filaTareaHTML).join('')}
      <button class="pgadd-fila" type="button" data-agregar="${n}">＋ Anotar una tarea</button>
    </div>`;
}

/* El renglón de una tarea. Se entra por el `▤` de la izquierda, como en el diseño: la tarea
   es una página y ese símbolo es la puerta. El título se edita en el lugar y todo lo demás
   —las catalogaciones— va a la derecha.

   Entre el título y las pills hubo un rato el arranque de la explicación, recortado a un
   renglón. Se sacó el 26/8/2026 por pedido: media línea de texto tenue cortada al medio se
   lee peor que no tener nada, y de qué se trata la tarea se ve entrando a la página, que
   está a un clic. El hueco vuelve a ser del título.

   El «→ Al tablero» de la fila estuvo, se sacó y volvió, todo el 26/8/2026 y todo por pedido.
   Se había ido por ser un botón por renglón —cuarenta en pantalla— para algo que se hace una
   vez por tarea; volvió porque mandar tareas al tablero es lo que se viene a hacer al backlog
   cuando arranca el grupo, y tenerlo escondido en el menú `⋯` son dos clics por tarea. Ahora
   vive entre las catalogaciones, al lado de la prioridad y de quién la hace (ver
   `pillsDeTarea`), y no suelto al final del renglón como la primera vez. El menú `⋯` conserva
   la suya, igual que la ficha: son los caminos para la que ya salió.

   **Los tres campos que se miran van en columnas fijas** (26/8/2026, por pedido): título,
   prioridad y quién la hace. Antes eran pastillas apretadas contra el borde derecho, así que
   el lugar de cada una dependía de cuántas tuviera la fila: la prioridad de un renglón caía
   donde el de arriba tenía el área. Con cuarenta filas eso no es una lista, son cuarenta
   renglones distintos. Ahora cada campo tiene su ancho (`.pgcol`) y se lee bajando por la
   columna sin leer ningún renglón entero.

   Lo que no es columna —el código, la dependencia, el área y la antigüedad— sigue junto,
   pegado al título: son las catalogaciones que se miran una vez y no las que se comparan
   entre filas.

   **La canaleta ya no tiene casillero de marcar** (26/8/2026, por pedido): no se usaba, y sus
   14px eran los que le faltaban al título. Con él se fueron la selección múltiple y la barra
   oscura de acciones en lote.

   **El `▤` es también la prioridad** (26/8/2026, por diseño). En la lista en columnas deja de
   ser un glifo suelto y pasa a ser un riel continuo del alto del renglón, pintado del color de
   la prioridad. Dice un dato más sin gastar ancho, que es lo único que falta en una columna de
   un tercio de pantalla. El
   color va como `--pri` en la fila y todo el dibujo vive en el CSS: apretada la pantalla la
   lista vuelve a ser una sola y el riel vuelve a ser el `▤` de siempre, sin que el HTML se
   entere. Por eso los dos hijos del botón van siempre y no se elige uno acá: quién se dibuja
   es una pregunta de ancho, y el ancho no se sabe desde el JS.

   **El título no se edita: se entra, en las DOS listas** (26/8/2026, por pedido). La fila es
   para mirar, no para escribir, y un `contenteditable` de tres renglones en el que cualquier
   clic pone el cursor convierte la acción principal de la pantalla —entrar a la tarea— en la
   que hay que acertarle al riel de 3px. Así que el título es un botón con el mismo
   `data-pagina` que la puerta: el renglón entero es la puerta.

   El backlog quedó afuera media hora, con el argumento de que escribir una lista de corrido es
   el 90% de esa pantalla. Se descartó por pedido, y el motivo es más fuerte que el argumento:
   la fila tiene que ser LA MISMA de los dos lados. Dos renglones que se ven idénticos y
   responden distinto al mismo clic es peor que perder el tipeo de corrido.

   **Salvo la que se acaba de crear** (26/8/2026, por pedido). Esa nace con un `<input>` en el
   lugar del título y el cursor adentro (`bautizando`), y vuelve a ser un botón en cuanto se
   sale del campo. No contradice la regla de arriba: la fila ya dibujada sigue sin editarse, y
   lo que se recupera es justo lo que se había perdido —anotar sin irse de la lista—. Mandar a
   la página por cada renglón era un viaje de ida y vuelta a una pantalla que no se venía a
   mirar, y encima con el «atrás» del navegador de por medio.

   **Contrapartida asumida**: en las dos listas Enter ya no abre una fila nueva; se agrega con
   el `＋` de la canaleta o con el del final del bloque. Con el Enter se fue también la herencia
   del responsable de la fila de arriba: ahora las cuatro puertas de creación preguntan.

   **Y la chapa de novedad va en las dos**, por lo mismo. En el backlog no se enciende por las
   dos causas del tablero —`nuevaSinAbrir()` y `prioridadSinVer()` cortan por `t.backlog`, que
   ahí ni la tarea está en el tablero ni tiene prioridad— pero sí por los avisos sin ver, que
   valen igual de los dos lados. Es el mismo elemento con las mismas reglas: las que no aplican,
   no encienden. Entrar desde el backlog sigue sin marcarla vista (ver `abrirPagina()`), así que
   la tarea llega igual de nueva al tablero.

   **El bloque de columnas lo clava a la derecha un espaciador propio (`.pgesp`) y no la primera
   columna** (26/8/2026). Era `.pgpills + .pgcol{margin-left:auto}`, que funcionaba mientras las
   dos listas tuvieran una columna visible ahí —la prioridad de un lado, la antigüedad del otro—.
   El backlog se quedó sin ninguna el día que la antigüedad salió de la fila, y un `auto` sobre
   un elemento que el CSS esconde no empuja nada: las pastillas se pegaban al título y bailaban
   con el largo de cada uno. Un elemento vacío que va siempre y no depende de qué dibuje cada
   lista es lo único que no hay que volver a arreglar la próxima vez que una columna cambie. */
function filaTareaHTML(t){
  /* Lo único que la vista decide es el «→ Al tablero»: ofrecerle a una fila del tablero mandarla
     a donde ya está no es una acción, es ruido. Todo lo demás lo decide la fila, y por eso los
     dos renglones se dibujan con exactamente el mismo HTML. */
  const enBk = !!vistaActual().backlog;
  /* El color del riel sale de la prioridad y es el MISMO `tint(color,.55)` del lomo de la
     tarjeta: cambiar de layout no puede cambiarle el color a una tarea.

     **En el backlog no hay prioridad, y desde el 26/8/2026 el riel dice antigüedad** (por
     diseño). Hasta ese día la fila del backlog no llevaba la variable y el riel caía en el gris
     de `var(--line)`: un adorno de 3px que no decía nada. Ahora dice lo único que el backlog
     tiene para decir sobre qué apremia — cuánto hace que eso está anotado sin salir. Son dos
     lecturas distintas del mismo riel según el lado, y está bien que lo sean: de un lado se
     mira qué es urgente, del otro qué se está pudriendo. */
  const p = t.backlog ? null : prioridadDe(t.prioridad);
  const edad = t.backlog ? antiguedad(t.creada) : null;
  const riel = p ? tint(p.color, .55) : (t.backlog ? colorRiel(t) : '');
  const puerta = 'Entrar a la página de la tarea'
    + (p ? ' · prioridad ' + p.label.toLowerCase() : '')
    + (edad ? ' · anotada hace ' + edad.txt : '');
  return `<div class="pgrow pg-page bktarea" data-id="${escA(t.id)}"${
    riel ? ` style="--pri:${riel}"` : ''}>
    <div class="pgctl">
      <button class="pgadd" type="button" data-menu title="Prioridad, responsable, grupo…"
        aria-label="Acciones de la tarea">⋯</button>
      <button class="pgdrag" type="button" draggable="true" data-drag
        title="Arrastrar para reordenar o cambiarla de grupo" aria-label="Mover la tarea">⠿</button>
    </div>
    <button class="pgpg" type="button" data-pagina title="${escA(puerta)}"
      aria-label="Entrar a la página de la tarea"><span class="pgriel"
      aria-hidden="true"></span><span class="pgpgico" aria-hidden="true">▤</span></button>
    ${bautizando === t.id
      ? `<input class="pgtxt bktit bktitedit" type="text" data-bautizo="${escA(t.id)}"
          value="${escA(t.tarea)}" placeholder="Sin título" spellcheck="false"
          aria-label="Título de la tarea">`
      : `<button class="pgtxt bktit" type="button" data-pagina data-ph="Sin título"
          title="${escA(puerta)}">${esc(t.tarea)}</button>`}
    ${chapaNovedad(t)}
    <span class="pgpills">${pillsMetaDeTarea(t)}</span>
    <span class="pgesp" aria-hidden="true"></span>
    ${t.backlog ? '' : `<span class="pgcol pgcol-pri">${pillPrioridad(t)}</span>`}
    <span class="pgcol pgcol-quien">${pillQuien(t)}</span>
    ${avataresQuien(t)}
    ${t.backlog ? '' : `<span class="pgcol pgcol-dias">${pillDias(t)}</span>`}
    ${enBk ? `<span class="pgcol pgcol-ir">${pillPase()}</span>` : ''}
    ${menuFila === t.id ? menuTareaHTML(t) : ''}
  </div>`;
}

/* ---------- las catalogaciones ----------
   Cada una en su función porque la fila las reparte en columnas y la cabecera de la página
   las pone todas juntas en un renglón que envuelve. Con el HTML escrito dos veces, el arreglo
   que se hace en un lado no llega nunca al otro. */

/* La prioridad es un botón: es la que más se cambia, y hacerla pasar por el menú `⋯` sería
   dos clics para lo que se hace veinte veces por grupo.

   **Pero en el backlog no se dibuja** (26/8/2026, por pedido). Lo que está anotado todavía no
   se está haciendo, y ponerle «crítica» a algo que nadie empezó es una urgencia inventada que
   después llega al tablero envejecida. La prioridad se decide cuando la tarea entra a la
   cancha, no cuando se anota. El corte lo da la fila (`t.backlog`) y no la vista, que es lo
   que hace que valga también adentro de la página de una tarea del backlog: mientras esté de
   ese lado, no hay dónde tocar para clasificarla. La tarea igual guarda su campo con el
   `semanal` de fábrica — no se migró nada y no hace falta. */
function pillPrioridad(t){
  if (t.backlog) return '';
  const p = prioridadDe(t.prioridad);
  return `<button class="pgpill tono" type="button" data-pop="prioridad"
    style="--pb:${tint(p.color, .14)};--pc:${p.color}">${esc(p.label)}</button>`;
}

/* Quién la hace es UNA sola pill con todos los nombres adentro, y no una por persona: abre el
   menú donde se prenden y se apagan, y con una pill por cabeza no habría dónde tocar para
   agregar a la segunda. Cuando no hay nadie igual se dibuja —«Sin asignar»— porque es justo el
   caso en el que hay que poder tocarla.

   Los nombres van adentro de un `.qn` y no sueltos en el botón: la columna tiene ancho fijo, y
   sin un solo elemento que recortar, tres responsables desbordarían la pastilla en vez de
   terminar en puntos suspensivos. Los nombres completos quedan en el `title`. */
function pillQuien(t){
  const gente = t.pend || [];
  const nombres = gente.map(nombrePersona).join(' · ');
  return `<button class="pgpill quien" type="button" data-pop="pend"
    title="${escA(nombres ? 'Quién la hace: ' + nombres : 'Quién la hace')}"><span class="qn">${
    gente.length
      ? gente.map(id => `<i style="color:${colorPersona(id)}">${esc(nombrePersona(id))}</i>`).join('<i class="pgsep2">·</i>')
      : '<i class="nadie">Sin asignar</i>'}</span></button>`;
}

/* Los mismos responsables, como avatares (26/8/2026, por diseño). Es lo que reemplaza a la
   pastilla de arriba en la lista en columnas: a 72px «Lorenzo · Antonio» terminaba en puntos
   suspensivos igual, y tres iniciales de color se leen bajando por la columna sin leer ningún
   renglón. Los ~130px que devuelven esta columna y la de prioridad se los lleva el título, que
   es lo que se viene a leer.

   Va SIEMPRE al HTML de la fila —de las dos listas, desde que el backlog también se parte en
   columnas— y lo esconde el CSS donde no corresponde: cuál de las dos formas se dibuja depende
   del ancho de pantalla, y el ancho no se sabe desde acá. Es la misma regla que ya tenía el
   recorte del título a tres líneas.

   Es un botón con `data-pop="pend"`, el mismo que la pastilla: abre el mismo menú y se prenden
   y apagan los mismos nombres. Sin nadie igual se dibuja un hueco punteado, porque es justo el
   caso en el que hay que poder tocarlo — misma regla que el «Sin asignar». */
/* Cuánta gente tiene que entrar en el hueco reservado de los avatares. El ancho lo dibuja el
   CSS —es puro presupuesto de espacio— pero el número no lo sabe: sale de `APP_CONFIG.personas`,
   que es el techo real de responsables que puede tener una tarea, porque el menú no ofrece a
   nadie más. Va como variable en el envoltorio de la lista y no en cada fila: es el mismo
   número para las cuarenta. */
const ANCHO_AVATARES = `--avn:${Math.max(PERSONAS.length, 1)}`;

function avataresQuien(t){
  const gente = t.pend || [];
  const nombres = gente.map(nombrePersona).join(' · ');
  const rotulo = nombres ? 'Quién la hace: ' + nombres : 'Quién la hace';
  return `<button class="bkav" type="button" data-pop="pend" title="${escA(rotulo)}"
    aria-label="${escA(rotulo)}">${
    gente.length
      ? gente.map(id => `<span class="av mini" style="background:${colorPersona(id)}">${esc(iniPersona(id))}</span>`).join('')
      : '<span class="av mini off">+</span>'}</button>`;
}

/* «→ Al tablero» (26/8/2026, por pedido). Es la vuelta del botón que se había sacado esa misma
   mañana por ser cuarenta botones en pantalla para algo que se hace una vez por tarea. Vuelve
   como una columna más y solo en el backlog: adentro del tablero, ofrecerle a cada fila
   mandarla a donde ya está no es una acción, es ruido. Que la fila esté en el backlog ya
   alcanza para saber que todavía no salió — la que se manda al tablero se va de la lista.

   El rótulo va adentro de un `.irtxt` y no suelto: en el backlog en dos columnas la pastilla se
   achica hasta ser la flecha sola (por diseño), y con el texto suelto no habría a qué apuntarle
   para esconderlo. Un solo HTML para los dos anchos, como el riel y como los avatares.

   Quién lo dibuja lo decide quien llama y no esta función mirando la vista: la cabecera de la
   página de la tarea usa estas mismas pills y ya tiene su propio «→ Al tablero» a la derecha,
   así que preguntando por la vista se dibujaría dos veces el mismo botón. */
const pillPase = () => `<button class="pgpill ir" type="button" data-altablero
  title="Mandar al tablero">→<i class="irtxt">Al tablero</i></button>`;

/* El código de la tarea. Va aparte del resto de la meta porque en la cabecera de la página
   encabeza el renglón, delante de la prioridad, y en la fila arranca el bloque que acompaña
   al título. */
const pillCodigo = t => `<span class="pgpill mono">${esc(t.id)}</span>`;

/* Lo que acompaña y no se compara entre filas: de qué depende y de qué área es. Las que no
   tienen valor no dibujan nada — una columna de guiones no dice más que el hueco, y por eso
   ninguna de estas puede ser columna fija. */
function pillsSueltas(t){
  const out = [];
  if (t.dep) out.push(`<span class="pgpill">Dep. ${esc(t.dep)}</span>`);
  if (t.modulo) out.push(`<span class="pgpill">${esc(t.modulo)}</span>`);
  return out.join('');
}

/* Desde cuándo está anotada. **Ya no es columna de ninguna fila** (26/8/2026, por pedido). Fue
   la columna fija del backlog, en el lugar exacto en que el tablero pone la prioridad, con el
   argumento de que las dos listas tienen que presentar la misma tarjeta cambiando qué dice el
   dato. Se sacó por el otro lado del mismo argumento: cuánto lleva una tarea es una cuenta del
   tablero, donde el trabajo ya está en la cancha, y repetirla en la lista de lo que todavía no
   empezó era la misma pregunta contestada en dos pantallas con dos relojes distintos.

   **Lo que el backlog dice sobre qué se está pudriendo sigue estando, y sin números**: el riel
   de la puerta se tiñe con la antigüedad (`colorRiel()`) y la cabecera del grupo cuenta las que
   ya llevan demasiado («N sin salir»). Un color y un contador por bloque, no cuarenta números.

   Queda entonces un solo lugar donde se dibuja: la cabecera de la página de la tarea, que no
   tiene cuarenta filas que alinear. Por eso va siempre con el «hace» —el segundo argumento se
   fue con la columna— y por eso la clase `rancio` sigue mirando `t.backlog`: adentro de la
   página de una tarea del backlog el ámbar significa lo mismo que en su fila. */
function pillEdad(t){
  const edad = antiguedad(t.creada);
  if (!edad) return '';
  const rancia = t.backlog && esVieja(t);
  const rotulo = 'Anotada hace ' + edad.txt + ', el ' + edad.exacta
    + (rancia ? ', y todavía sin salir al tablero' : '');
  return `<span class="pgpill edad${rancia ? ' rancio' : ''}" title="${escA(rotulo)}"
    data-edad="${escA(t.creada)}" data-edad-pre="hace ">${esc(
      textoEdad(edad, { edadPre: 'hace ' }))}</span>`;
}

/* Cuántos días lleva la tarea EN EL TABLERO. **Es la última columna del tablero-lista y no va
   en el backlog** (26/8/2026, por pedido): del otro lado la cuenta ni siquiera arrancó.

   **Cuenta desde que entró al tablero y no desde que se anotó** (26/8/2026, por pedido). Para
   una tarea que estuvo dos meses en el backlog las dos fechas no son la misma, y la que importa
   acá es la segunda: el número contesta «hace cuánto que esto está en la cancha y todavía no se
   cerró», no «hace cuánto que a alguien se le ocurrió». Antes decía lo segundo porque la fecha
   de entrada no existía en ninguna columna; ahora la guarda `entroAlTablero()`.

   **Sin fecha de entrada guardada cae en `creada`**, que es exactamente lo que el número decía
   hasta hoy: las filas que ya estaban en el tablero siguen contando igual y no hubo nada que
   migrar. La cuenta de verdad arranca para cada una la próxima vez que pase por el backlog.

   **Siempre en días crudos**, y esa es toda la gracia: `antiguedad()` elige la unidad sola —«3
   d», «2 sem», «4 mes»— que es lo que hay que hacer cuando el dato se lee suelto en una frase, y
   es exactamente lo que no sirve en una columna. Bajando por cuarenta filas, «2 sem» y «12 d» no
   se comparan de un vistazo: hay que traducir cada renglón antes de poder ordenarlos. En días
   crudos el número más grande es el que lleva más tiempo y no hay nada que traducir.

   **Y el número va solo adentro de un círculo** (26/8/2026, por pedido). Era «14d», gris y sin
   marco, y a esa escala una cifra suelta al final del renglón se lee como un resto de otra
   pastilla. El círculo es una ficha: una forma cerrada del mismo tamaño en las cuarenta filas,
   que se cuenta bajando por la columna sin leer ninguna. La `d` se fue con el marco —adentro de
   una ficha de tamaño fijo una letra es la mitad del ancho, y qué unidad es lo dice el `title`
   una vez—. Sigue tabular: el círculo es fijo, el número adentro tiene que caer centrado igual
   con una cifra que con tres.

   Se ayuda con `cursor:help` y un `aria-label`: un número pelado no dice de qué es, ni en
   pantalla ni en un lector. */
function pillDias(t){
  const desde = enTableroDesde(t);
  const edad = antiguedad(desde);
  if (!edad) return '';
  const rotulo = edad.dias === 0
    ? 'Entró al tablero hoy, el ' + edad.exacta
    : 'Lleva ' + edad.dias + (edad.dias === 1 ? ' día' : ' días')
      + ' en el tablero · desde el ' + edad.exacta;
  return `<span class="pgdias" title="${escA(rotulo)}" aria-label="${escA(rotulo)}"
    data-edad="${escA(desde)}" data-edad-fmt="dias">${esc(
      textoEdad(edad, { edadFmt: 'dias' }))}</span>`;
}

// Lo que en la fila queda pegado al título, fuera de las columnas.
const pillsMetaDeTarea = t => pillCodigo(t) + pillsSueltas(t);

/* Todas juntas, en el orden en que se miran. Lo usa la cabecera de la página de la tarea, que
   no tiene cuarenta filas que alinear: ahí las pastillas envuelven y una columna fija sería
   ancho reservado para nada. */
const pillsDeTarea = (t, conPase) => pillCodigo(t) + pillPrioridad(t) + pillQuien(t)
  + (conPase ? pillPase() : '') + pillsSueltas(t) + pillEdad(t);

/* El `⋯` de la fila. Es el equivalente del `＋` del diseño: ahí adentro, un renglón inserta
   bloques; acá, una tarea no tiene bloques que insertar pero sí cosas que cambiar. El primero
   abre el menú de siempre; los otros dos actúan derecho.

   **La prioridad no está acá y estuvo un rato el 26/8/2026**, mientras la pastilla salió de la
   fila en columnas. Volvió a la fila el mismo día, así que este renglón se fue: es la que más
   se cambia en el tablero, y tenerla en los dos lados son dos caminos para lo mismo.

   **«Ficha completa» salió y volvió, las dos veces el 26/8/2026.** Salió por pedido, junto con
   la de la cabecera de la página: eran dos puertas al mismo modal y la ficha ya colgaba de la
   tarjeta del tablero, que la abría con un clic. Volvió cuando se sacaron los dos layouts de
   tarjeta ese mismo día: sin tarjeta, esa era la última puerta, y con las tres cerradas la
   conversación, los adjuntos sueltos y los campos que la página no dibuja quedaban guardados en
   la base sin ninguna pantalla que los mostrara. El motivo por el que se había ido —dos puertas
   al mismo modal— dejó de ser cierto justo cuando la otra dejó de existir.

   Va acá adentro y no como pill de la fila: se abre mucho menos que entrar a la tarea, que es
   el `▤` y sigue siendo la página. La cabecera de la página tampoco lo recupera — desde
   adentro de la tarea, un modal encima de la misma tarea no agrega nada. */
function menuTareaHTML(t){
  const L = listaActual;
  const it = (k, ico, txt) => `<button type="button" data-acc="${k}"><span>${ico}</span>${txt}</button>`;
  // El primer renglón es siempre «mover de bloque», y qué significa mover lo dice la lista:
  // de sprint en el backlog, de estado en el tablero. Un mismo menú, un mismo lugar.
  return `<div class="pgpop">
    <div class="pgpop-t">La tarea</div>
    ${it('grupo', '▤', L.mover)}
    ${it('ficha', '☰', 'Ficha completa')}
    ${it('ir', t.backlog ? '→' : '←', t.backlog ? 'Mandar al tablero' : 'Mandar al backlog')}
    ${it('borrar', '✕', 'Borrar la tarea')}
  </div>`;
}

/* Acá vivían `barraMarcadasHTML()` y el casillero de marcar de la canaleta: la selección
   múltiple y su barra oscura de acciones en lote —mover de grupo, asignar, mandar al tablero
   de a diez—. Se sacaron enteras el 26/8/2026 por pedido: no se usaban, y el casillero
   ocupaba los 14px de canaleta que le faltaban al título. Sin él no hay forma de marcar una
   fila, así que dejar la barra habría sido dejar código que no puede correr. Las mismas
   acciones siguen estando de a una: el menú `⋯` de la fila, la pill de cada campo y la ficha. */

/* ---------- las dos listas ----------
   El backlog y el tablero en modo lista son EL MISMO componente: los mismos renglones, los
   mismos controles y —lo importante— los mismos manejadores. Lo único que cambia entre las dos
   es por qué se agrupa y qué significa mover una fila de bloque, y todo eso vive acá adentro.

   Con dos copias del `onclick` el arreglo que se hace en una no llega nunca a la otra: son
   ciento veinte líneas de delegación con nueve casos, y la próxima vez que haya que tocar el
   arrastre o el Enter habría que acordarse de tocarlo dos veces. */
const LISTAS = {
  sprint: {
    tipo: 'sprint',                       // qué menú abre `abrirMenu()`
    mover: 'Mover a otro grupo',          // el primer renglón del menú `⋯`
    // Solo asigna el campo del bloque; el orden lo calcula quien llama, que es el único que
    // sabe entre qué dos filas cayó la que se soltó.
    fijar: (t, g) => { t.sprint = Number(g) || SIN_SPRINT; },
    // En el backlog no hay prioridad, así que el bloque no se apila en bandas: todas las filas
    // del grupo son hermanas entre sí y el `orden` a mano manda solo.
    bandaDe: () => '',
    adoptarBanda: () => {},
    hermanas: g => tareasDeSprint(Number(g) || SIN_SPRINT),
    plegar: g => { sprintsPlegados.has(g) ? sprintsPlegados.delete(g) : sprintsPlegados.add(g); guardarPlegados(); },
    abrir: g => { sprintsPlegados.delete(String(g)); guardarPlegados(); },
    nueva: (g, despuesDe, quien) => nuevaEnBacklog(Number(g) || SIN_SPRINT, despuesDe, quien),
    grupoDe: t => String(sprintDe(t)),
    repintar: () => renderBacklog(),
  },
  estado: {
    tipo: 'estado',
    mover: 'Cambiar el estado',
    fijar: (t, g) => { t.estado = g; },
    /* El bloque se apila por prioridad, así que el `orden` a mano solo significa algo contra
       las filas de la misma banda: entre dos bandas los números no van en el orden en que se
       ven, y promediar los de dos vecinos de bandas distintas devuelve cualquier cosa.

       Por eso soltar sobre otra banda adopta la del destino. Es lo mismo que ya hace soltar
       una tarjeta en la banda «Urgente» de otra columna, que cambia el estado y la prioridad
       de una. Sin esto, arrastrar entre bandas sería un no-op a la vista: la fila caería donde
       uno la soltó y el apilado la devolvería a su lugar en el próximo pintado. */
    bandaDe: t => prioridadDe(t.prioridad).id,
    adoptarBanda: (t, destino) => { ponerPrioridad(t, prioridadDe(destino.prioridad).id); },
    hermanas: g => tareasDeEstado(g),
    plegar: g => alternarEstadoPlegado(g),
    abrir: g => { if (estadoPlegado(g)) alternarEstadoPlegado(g); },
    nueva: (g, despuesDe, quien) => nuevaEnEstado(g, despuesDe, quien),
    grupoDe: t => estadoDe(t.estado).id,
    repintar: () => renderListaEstados(),
  },
};
// Cuál de las dos está pintada ahora. La fijan los dos `render*` de arriba, y todo lo que
// corre después —manejadores y menús— la lee de acá en vez de volver a
// preguntar por la vista y el layout.
let listaActual = LISTAS.sprint;

/* ---------- enganches ----------
   Todo por delegación sobre el board: la lista se repinta entera ante cualquier cambio de
   estructura, y colgar cien manejadores en cada repintado para tirarlos al siguiente no
   tiene sentido. */
function engancharLista(){
  const L = listaActual;
  /* Los que la lista no usa se apagan a mano: la caja y la página los dejan puestos, y se pasa
     de una vista a la otra sin volver a tocar el tablero.

     **Desde el 26/8/2026 son cinco y no dos.** Acá adentro ya no se escribe nada: el título de
     la fila dejó de ser un campo y pasó a ser la puerta a la tarea, en las dos listas, así que
     se fueron el `oninput` que lo guardaba, el `onpaste` que lo aplanaba a texto y el Enter que
     abría la fila siguiente. Quedaron nulos y no borrados porque anular es justamente lo que
     hay que hacer: si no, el `oninput` de la caja sigue vivo encima del tablero. */
  board.onchange = board.onfocusout = null;
  board.oninput = board.onpaste = board.onkeydown = null;

  board.onclick = e => {
    const enc = s => e.target.closest(s);

    const plegar = enc('[data-plegar]');
    if (plegar) { L.plegar(plegar.dataset.plegar); return L.repintar(); }

    const agregar = enc('[data-agregar]');
    if (agregar) return pedirResponsable(agregar, e,
      quien => L.nueva(agregar.dataset.agregar, null, quien));

    // El lápiz del grupo. Solo cambia qué se dibuja: el guardado llega cuando se sale del
    // campo o se aprieta Enter.
    const lapiz = enc('[data-renombrar]');
    if (lapiz) { renombrando = lapiz.dataset.renombrar; return L.repintar(); }

    /* Solo el backlog: los estados son un catálogo cerrado y no se agregan desde la pantalla.
       El grupo nuevo nace con el cursor adentro del nombre y no como «Grupo 4»: se lo creó
       justo para bautizarlo, y dejarlo esperando a que alguien se acuerde de renombrarlo es
       volver al problema que esto vino a resolver. Si al final no se le escribe nada, no se
       guarda ninguna fila: el bloque queda como estaba antes de todo esto —un casillero de
       este navegador, en `UI.sprints`— hasta que tenga nombre o tenga tareas. */
    const nuevo = enc('[data-sprint-nuevo]');
    if (nuevo) {
      const n = Number(nuevo.dataset.n) || sprintsVisibles().length + 1;
      UI.sprints = n; guardarUI();
      renombrando = String(n);
      return render();
    }
    const fila = enc('.bktarea');
    if (!fila) return;
    const t = tarea(fila.dataset.id); if (!t) return;

    // El menú `⋯` frena la propagación: si llegara al `document`, el mismo clic que lo abre
    // lo cerraría. Igual que el de la página.
    if (enc('[data-menu]')) {
      e.stopPropagation();
      menuFila = menuFila === t.id ? null : t.id;
      return L.repintar();
    }
    const acc = enc('[data-acc]');
    if (acc) {
      e.stopPropagation();
      const k = acc.dataset.acc;
      const anclaje = fila.querySelector('[data-menu]');
      menuFila = null;
      L.repintar();
      // `grupo` es «mover de bloque» y qué bloque es lo dice la lista: sprint o estado.
      if (k === 'pend' || k === 'grupo') {
        return abrirMenu(board.querySelector(`.bktarea[data-id="${CSS.escape(t.id)}"] [data-menu]`) || anclaje,
          k === 'grupo' ? L.tipo : k, t);
      }
      /* El pase pregunta la prioridad, y el menú del que salió este clic ya se cerró con su
         repintado: el anclaje hay que volver a buscarlo en la fila recién dibujada, igual que
         para `pend` y `grupo`. Colgarlo del `⋯` viejo lo dejaría flotando sobre la nada. */
      if (k === 'ir') {
        if (!t.backlog) return mandarAlBacklog(t);
        return pasarAlRoadmap(t,
          board.querySelector(`.bktarea[data-id="${CSS.escape(t.id)}"] [data-menu]`) || anclaje, e);
      }
      // La ficha es la única acción del menú que no toca la tarea: abre el modal y ya.
      if (k === 'ficha') return abrirTarea(t.id);
      if (k === 'borrar') return borrarDeLista(t);
      return;
    }
    if (enc('.pgpop')) { e.stopPropagation(); return; }

    // El pase al tablero desde la fila. Solo lo dibuja el backlog y solo en la que todavía no
    // salió, así que acá no hace falta volver a preguntar de qué lado está. La prioridad sí:
    // el menú se cuelga de la pill que lo abrió.
    const altablero = enc('[data-altablero]');
    if (altablero) return pasarAlRoadmap(t, altablero, e);
    // El `▤` es la puerta a la página, como en el diseño. La ficha —conversación, adjuntos
    // sueltos, los campos que la página no dibuja— vive en el menú `⋯`: se abre mucho menos.
    if (enc('[data-pagina]')) return abrirPagina(t.id);
    const pop = enc('[data-pop]');
    if (pop) return abrirMenu(pop, pop.dataset.pop, t);
  };

  engancharNombreDeGrupo();
  engancharTituloNuevo();

  /* Acá vivían los tres manejadores del tipeo: el `oninput` que guardaba el título mientras se
     escribía, el `onpaste` que lo aplanaba a texto plano y el Enter que abría la fila siguiente
     heredando el responsable de la de arriba. Se fueron el 26/8/2026, cuando el título del
     backlog dejó de ser un campo y pasó a ser la puerta a la tarea, igual que el del tablero.
     Los dos campos que quedan en la lista —el nombre de un grupo y el título de la tarea recién
     creada— se enganchan aparte, cada uno con sus dos manejadores propios.

     **Contrapartida asumida**: Enter ya no abre la fila siguiente, así que anotar diez cosas son
     diez `＋`. Lo que sí se recuperó el 26/8/2026 es no tener que irse de la lista para
     escribir el título: la fila nueva nace con el cursor adentro (ver `bautizando`). Con el
     Enter se fue también la herencia del responsable de la fila de arriba: ahora las cuatro
     puertas de creación preguntan, que es lo que ya hacían las otras tres. */

  engancharArrastreLista();
}

/* ---------- menús ----------
   Uno solo para los tres selectores. Se cuelga del `<body>` y no de la fila porque una fila
   tiene `overflow` y lo recortaría, y porque así se cierra siempre con el mismo clic. */
function cerrarMenu(){ $$('.bpop').forEach(p => p.remove()); }
document.addEventListener('click', e => {
  if (!e.target.closest('.bpop,[data-pop]')) cerrarMenu();
  // Los menús pegados a un renglón —el `＋` de la página y el `⋯` de la lista— se cierran
  // con cualquier clic afuera. Los clics que los abren, o que eligen algo adentro, frenan la
  // propagación y no llegan hasta acá.
  if (paginaMenu) { paginaMenu = null; renderPagina(); }
  else if (menuFila) { menuFila = null; listaActual.repintar(); }
});

/* `alElegir` convierte el mismo menú en un selector suelto: devuelve lo elegido y no toca
   ninguna tarea, porque quien lo abre todavía no tiene una. Es lo que usa la creación para
   preguntar el responsable antes de que la fila exista. El `titulo` va con él: una lista de
   tres nombres sin nada arriba no dice qué se está eligiendo. */
function abrirMenu(anclaje, tipo, t, alElegir, titulo){
  const de = (t ? t.id : 'suelto') + tipo;
  const abierto = $('.bpop');
  cerrarMenu();
  if (abierto && abierto.dataset.de === de) return;

  const pop = document.createElement('div');
  pop.className = 'bpop';
  pop.dataset.de = de;
  /* `quien` y `categoria` son de la caja, donde `t` es un movimiento y no una tarea: el
     menú es el mismo cajón —mismo estilo, misma posición, mismo cierre— y hacer una copia
     suya para dos listas más sería mantener dos veces el mismo posicionamiento. */
  const marcado = v =>
    tipo === 'prioridad'   ? t && prioridadDe(t.prioridad).id === v
    : tipo === 'pend'      ? t && (t.pend || []).includes(v)
    : tipo === 'sprint'    ? t && String(sprintDe(t)) === v
    : tipo === 'estado'    ? t && estadoDe(t.estado).id === v
    : tipo === 'quien'     ? t && (t.quien || '') === v
    : tipo === 'carga'     ? t && cargaDe(t).includes(v)
    : tipo === 'categoria' ? t && (t.categoria || '') === v
    : tipo === 'avpara'    ? t && destinatariosDe(t).includes(v)
    : false;

  const items =
    tipo === 'prioridad' ? PRIORIDADES.map(p => ({ v:p.id, label:p.label, color:p.color }))
    : tipo === 'pend' || tipo === 'avpara'
                         ? PERSONAS.map(p => ({ v:p.id, label:p.nombre, color:p.color }))
    : tipo === 'quien'   ? [{ v:'', label:'Sin asignar' },
                            ...genteDeCaja(t && t.quien).map(p => ({ v:p.id, label:p.nombre, color:p.color }))]
    : tipo === 'carga'   ? PERSONAS_CAJA.map(p => ({ v:p.id, label:p.nombre, color:p.color }))
    : tipo === 'categoria' ? [{ v:'', label:'Sin categoría' }, ...CATEGORIAS.map(c => ({ v:c, label:c }))]
    : tipo === 'estado'  ? ESTADOS.map(c => ({ v:c.id, label:c.label, color:c.color }))
    : [...sprintsVisibles().map(n => ({ v:String(n), label:nombreSprint(n) })),
       { v:'0', label:nombreSprint(SIN_SPRINT) }];

  pop.innerHTML = (titulo ? `<div class="bpoptit">${esc(titulo)}</div>` : '') + items.map(i =>
    `<button type="button" data-v="${escA(i.v)}"${marcado(i.v) ? ' class="on"' : ''}>
      ${i.color ? `<i class="bdot" style="background:${i.color}"></i>` : '<i class="bdot vacio"></i>'}${esc(i.label)}
      <span class="btick">${marcado(i.v) ? '✓' : ''}</span>
    </button>`).join('');
  document.body.appendChild(pop);

  const r = anclaje.getBoundingClientRect();
  const arriba = r.bottom + 6 + pop.offsetHeight > window.innerHeight;
  pop.style.top = (window.scrollY + (arriba ? r.top - pop.offsetHeight - 6 : r.bottom + 6)) + 'px';
  pop.style.left = Math.max(8, Math.min(
    window.scrollX + r.left,
    window.scrollX + window.innerWidth - pop.offsetWidth - 12)) + 'px';

  pop.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const v = b.dataset.v;
    // Selector suelto: se cierra primero y se avisa después, para que lo que abra el
    // llamador —una fila nueva con el cursor adentro— no quede tapado por el menú.
    if (alElegir) { cerrarMenu(); alElegir(v); return; }
    // Sin tarea y sin `alElegir` no hay a qué aplicarle lo elegido. Pasaba con la barra de
    // acciones en lote, que ya no existe; el guardo queda porque abajo todo da por hecho `t`.
    if (!t) { cerrarMenu(); return; }
    if (tipo === 'prioridad') campoTarea(t, 'prioridad', v);
    if (tipo === 'sprint') cambiarSprint(t, Number(v) || SIN_SPRINT);
    if (tipo === 'estado') cambiarEstado(t, v);
    /* Los responsables se prenden y se apagan de a uno, y el menú NO se cierra: asignar a
       tres es marcar tres, y cerrarlo en la primera obligaría a abrirlo tres veces. El
       renglón elegido se pinta a mano en vez de volver a abrir el menú: `abrirMenu()` es un
       interruptor —si lo llamás con el mismo menú abierto, lo cierra— así que reabrirlo
       desde adentro lo apagaría. */
    if (tipo === 'pend') {
      // `alternarPend` devuelve el `pend` de ANTES, que es justo lo que necesita el revert.
      const previo = alternarPend(t, v);
      if (!previo) return;
      const on = (t.pend || []).includes(v);
      b.classList.toggle('on', on);
      b.querySelector('.btick').textContent = on ? '✓' : '';
      render();
      persistirTarea(t, { revertir: () => { t.pend = previo; render(); } });
      return;
    }
    /* A quién se le carga el gasto se prende y se apaga igual que los responsables, y por
       la misma razón: pasar un gasto de compartido a «solo Antonio» son dos toques, y
       cerrar el menú en el primero obligaría a abrirlo dos veces.

       Sacar al último no vale. Un gasto que no se le carga a nadie no entra en el saldo de
       nadie: la resta seguiría cerrando, pero esa plata dejaría de deberse sin que nadie la
       haya pagado. Se corta acá y no en el render, que es el único lugar por donde se toca
       el campo. */
    /* El destinatario de un aviso se prende y se apaga de a uno y el menú NO se cierra, igual
       que los responsables: un aviso para dos es marcar dos. Acá `t` es un aviso y no una
       tarea, como en la caja es un movimiento.

       Sacar al último SÍ vale, al revés que en `pend` y en `carga`: sin nadie marcado el aviso
       vuelve a ser para todos, que es lo que valía antes de que se pudiera elegir. Quitar a
       todos no lo deja sin dueño, lo devuelve al equipo.

       Se repinta el renglón a mano y no con `renderPagina()`: repintar la página entera se
       lleva puesto el botón del que cuelga el menú abierto, y elegir a dos sería abrirlo dos
       veces. La chapa del tablero se recalcula sola al volver. */
    if (tipo === 'avpara') {
      const antes = [...(t.para || [])];
      t.para = antes.includes(v) ? antes.filter(x => x !== v) : [...antes, v];
      const on = t.para.includes(v);
      b.classList.toggle('on', on);
      b.querySelector('.btick').textContent = on ? '✓' : '';
      guardarPagina();
      repintarAviso(t);
      return;
    }
    if (tipo === 'carga') {
      const antes = [...(t.carga || [])];
      const ahora = cargaDe(t);
      if (ahora.includes(v) && ahora.length === 1) {
        aviso(`El gasto se le tiene que cargar a alguien: sumá a otro antes de sacar a ${nombrePersona(v)}`);
        return;
      }
      t.carga = ahora.includes(v) ? ahora.filter(x => x !== v) : [...ahora, v];
      const on = t.carga.includes(v);
      b.classList.toggle('on', on);
      b.querySelector('.btick').textContent = on ? '✓' : '';
      renderCaja();
      persistirMovimiento(t, { revertir: () => { t.carga = antes; renderCaja(); } });
      return;
    }
    cerrarMenu();
  };
}

/* ---------- cambios de una fila ---------- */

// Un campo simple, con revert: es lo mismo que hace el detalle, sin el debounce (acá se
// elige de una lista, no se tipea).
function campoTarea(t, campo, valor, silencio){
  const antes = t[campo];
  if (antes === valor) return;
  if (campo === 'prioridad') ponerPrioridad(t, valor); else t[campo] = valor;
  if (!silencio) render();
  persistirTarea(t, { revertir: () => { t[campo] = antes; render(); } });
}

/* La otra mitad de «ninguna tarea sin asignar»: nacer con dueño no sirve de nada si después
   se puede sacar al último. Los tres lugares que prenden y apagan personas —los avatares del
   tablero, los botones de la ficha y los de la fila del backlog— pasan por acá, en vez de
   repetir el mismo `indexOf` tres veces y que la copia que se olvide tire abajo la regla.

   Devuelve el `pend` de antes para el revert, o `null` si no se aplicó nada. Repintar es
   cosa de cada llamador: el tablero repinta entero, la ficha repinta su lista y la fila del
   backlog pinta el botón a mano. */
function alternarPend(t, id){
  const antes = [...(t.pend || [])];
  if (antes.includes(id) && antes.length === 1) {
    aviso(`La tarea tiene que quedar asignada: sumá a alguien antes de sacar a ${nombrePersona(id)}`);
    return null;
  }
  t.pend = antes.includes(id) ? antes.filter(x => x !== id) : [...antes, id];
  return antes;
}

/* Los tres botones de la fila son los mismos del detalle: siempre a la vista, un clic los
   prende y los apaga. Se pintan a mano en vez de repintar la lista entera — es un botón que
   cambia de color, y repintar cien filas para eso hace que el clic se sienta lento. */
function alternarPersona(t, id, boton){
  const antes = alternarPend(t, id);
  if (!antes) return;
  const on = t.pend.includes(id);
  if (boton) {
    boton.classList.toggle('off', !on);
    boton.style.background = on ? colorPersona(id) : '';
    boton.setAttribute('aria-pressed', String(on));
  }
  // Con un filtro de personas puesto, cambiar el responsable puede sacar la fila de la
  // lista: ahí sí hay que repintar, si no queda a la vista una fila que ya no cumple.
  if (UI.f.pend.length) render();
  persistirTarea(t, { revertir: () => { t.pend = antes; render(); } });
}

function nuevaEnBacklog(sprint, despuesDe, quien){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const hermanas = tareasDeSprint(sprint);
  const i = despuesDe ? hermanas.findIndex(x => x.id === despuesDe.id) : hermanas.length - 1;
  const t = Object.assign(tareaVacia(id), {
    backlog: true,
    pend: [quien],
    sprint,
    orden: RoadmapSync.calcularOrden(
      i >= 0 && hermanas[i] ? hermanas[i].orden : null,
      hermanas[i + 1] ? hermanas[i + 1].orden : null),
  });
  datos.tareas.push(t);
  // Agregar adentro de un grupo plegado dejaría la fila nueva escondida al volver de la
  // página: se abre solo.
  sprintsPlegados.delete(String(sprint)); guardarPlegados();
  /* Se queda en la lista con el cursor adentro del título, igual que `nuevaEnEstado()` y por lo
     mismo (26/8/2026, por pedido). Hasta ese día entraba a la página: el título de la fila no se
     edita, así que quedarse afuera dejaba una tarea sin nombre y sin dónde escribirlo. La
     contra era que anotar cinco cosas eran cinco viajes de ida y vuelta a una página que no se
     venía a mirar. El campo lo pone `bautizando`, que dura lo que dura escribir el nombre — la
     fila ya dibujada sigue sin editarse. */
  bautizando = id;
  render();
  persistirTarea(t, {
    revertir: () => { datos.tareas = datos.tareas.filter(x => x.id !== id); render(); },
  });
}

function cambiarSprint(t, n, silencio){
  const antes = { sprint: t.sprint, orden: t.orden };
  if (antes.sprint === n) return;
  t.sprint = n;
  // Al cambiar de bloque se va al final del nuevo: el orden que traía era el de otra lista.
  const ultima = tareasDeSprint(n).filter(x => x.id !== t.id).pop();
  t.orden = RoadmapSync.calcularOrden(ultima ? ultima.orden : null, null);
  if (!silencio) render();
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
}

/* El equivalente para la lista del tablero: cambiar de bloque es cambiar de estado, que es
   exactamente lo mismo que arrastrar la tarjeta a otra columna. Va al final del bloque nuevo
   por la misma razón que el sprint — el orden que traía era el de otra lista. */
function cambiarEstado(t, id, silencio){
  const antes = { estado: t.estado, orden: t.orden };
  if (antes.estado === id) return;
  t.estado = id;
  // Al final de SU banda de prioridad y no al final del bloque: adentro del estado las filas
  // se apilan por prioridad, así que un orden mayor que el de la última fila del bloque no la
  // deja última si esa última es de otra banda.
  const banda = prioridadDe(t.prioridad).id;
  const ultima = tareasDeEstado(id)
    .filter(x => x.id !== t.id && prioridadDe(x.prioridad).id === banda).pop();
  t.orden = RoadmapSync.calcularOrden(ultima ? ultima.orden : null, null);
  if (!silencio) render();
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
}

/* Una fila nueva adentro de un bloque de la lista del tablero. Es el gemelo de
   `nuevaEnBacklog()`; la diferencia con la del backlog es de qué lado de la marca nace
   —`tareaVacia()` ya la deja en `backlog:false`— y que el bloque es el estado.

   **Desde el 26/8/2026 es el único creador del lado del tablero.** Tenía al lado a
   `nuevaTarea()`, que era la del «＋» del pie de la columna y la de «+ Nueva tarea»: mandaba la
   fila al final de todas las tareas y abría la ficha. Se fue con las tarjetas y «+ Nueva tarea»
   pasa por acá, así que las dos puertas calculan el orden igual.

   **Deja el cursor en la fila y no entra a la página** (26/8/2026, por pedido). Estuvo unas
   horas entrando, porque el título de la fila dejó de editarse y quedarse afuera dejaba una
   tarea sin nombre y sin dónde escribirlo. Se corrigió por el otro lado: la fila recién creada
   —y solo esa— nace con un campo en el lugar del título (`bautizando`). Vale igual para las dos
   listas, que son el mismo componente y crear tiene que hacer lo mismo de los dos lados. */
function nuevaEnEstado(estadoId, despuesDe, quien){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const t = Object.assign(tareaVacia(id), { estado: estadoId, pend: [quien] });
  /* El orden se calcula contra las de su misma banda de prioridad y no contra el bloque
     entero: adentro del estado las filas se apilan por prioridad, y promediar el orden de dos
     vecinos de bandas distintas da un número que no cae donde uno lo ve caer. La banda es la
     que trae `tareaVacia()`, que es la que la fila va a tener al dibujarse. */
  const banda = prioridadDe(t.prioridad).id;
  const hermanas = tareasDeEstado(estadoId).filter(x => prioridadDe(x.prioridad).id === banda);
  const i = despuesDe ? hermanas.findIndex(x => x.id === despuesDe.id) : hermanas.length - 1;
  t.orden = RoadmapSync.calcularOrden(
    i >= 0 && hermanas[i] ? hermanas[i].orden : null,
    hermanas[i + 1] ? hermanas[i + 1].orden : null);
  datos.tareas.push(t);
  // Agregar adentro de un bloque plegado dejaría la fila nueva escondida: se abre solo, igual
  // que el sprint.
  LISTAS.estado.abrir(estadoId);
  // Se bautiza en la fila y no adentro de la página, igual que en el backlog: las dos listas
  // son el mismo componente y crear tiene que hacer lo mismo de los dos lados.
  bautizando = id;
  render();
  persistirTarea(t, {
    revertir: () => { datos.tareas = datos.tareas.filter(x => x.id !== id); render(); },
  });
}

/* Los dos sentidos del mismo viaje. No se copia ni se mueve nada: la tarea es la misma fila
   de siempre y lo único que cambia es de qué lado de la marca queda.

   Ninguna tarea llega al tablero sin que alguien haya elegido su prioridad, y el corte va ACÁ
   ADENTRO y no en cada botón: son cuatro puertas —la pill de la fila, el menú `⋯`, la ficha y
   la cabecera de la página— y olvidarse en una alcanzaría para que la regla no valga. Es la
   contracara de la regla del backlog: ahí la prioridad no se puede poner porque lo anotado
   todavía no se está haciendo; acá la tarea entra a la cancha, así que se decide.

   Se pregunta SIEMPRE y no solo cuando falta. Toda tarea nace con `semanal` de fábrica, así
   que «ya tiene prioridad» sería verdad para todas y la pregunta no aparecería nunca: el campo
   guardado es un valor por defecto, no una decisión que alguien haya tomado.

   Cerrar el menú sin elegir no pasa nada al tablero, igual que en `pedirResponsable()`: dejar
   la tarea del otro lado esperando una prioridad la guardaría con la de fábrica ante cualquier
   recarga, que es justo lo que se quiere evitar. */
function pasarAlRoadmap(t, anclaje, ev, silencio){
  if (!t.backlog) return false;
  // El clic que abre el menú tiene que morir acá: si llega al `document`, el cierre global lo
  // apaga en el mismo clic que lo prendió.
  ev?.stopPropagation();
  abrirMenu(anclaje, 'prioridad', t, v => { if (v) alTablero(t, v, silencio); },
    '¿Con qué prioridad entra?');
  return true;
}

// El pase de verdad, ya con la prioridad elegida. Es la única puerta que apaga `backlog`.
function alTablero(t, prioridad, silencio){
  const antes = { backlog: t.backlog, orden: t.orden, hoy: t.hoy, prioridad: t.prioridad,
    [CAMPO_ENTRADA]: t[CAMPO_ENTRADA] };
  ponerPrioridad(t, prioridad);
  /* Acá arranca la cuenta de días de la fila (ver `enTableroDesde()`). Se pisa en cada pase y
     no solo en el primero: una tarea puede ir y volver, y la vuelta es una llegada nueva —lo
     mismo que ya decía `hoy` dos líneas más abajo—. Lo que había cargado en esa columna era el
     tipo de actividad, que no lo lee ninguna pantalla desde que se sacó el filtro. */
  t[CAMPO_ENTRADA] = new Date().toISOString();
  // Entra al final del tablero: el orden que traía era el de su sprint y acá no dice nada.
  const ultimo = datos.tareas.reduce((m, x) => (!x.backlog && (m == null || (x.orden || 0) > m) ? (x.orden || 0) : m), null);
  t.orden = RoadmapSync.calcularOrden(ultimo, null);
  /* Llega SIEMPRE como nueva, aunque se haya anotado hace dos meses: para el tablero recién
     aparece hoy, y la chapa roja es lo que hace que el equipo la vea. Se vuelve a prender acá
     y no solo al nacer porque una tarea puede ir y volver, y la vuelta también es una llegada.
     Ver «la novedad de una actividad»: apagarla es cosa de cada uno, entrando. */
  t.hoy = true;
  t.backlog = false;
  if (!silencio) {
    render();
    aviso(`«${t.tarea || 'sin título'}» pasó al tablero, en ${estadoDe(t.estado).label}, `
      + `con prioridad ${prioridadDe(t.prioridad).label.toLowerCase()}`);
  }
  /* La ficha abierta sobre esa misma tarea cambia entera al pasar: el botón dice lo contrario
     y el selector de prioridad, que el backlog esconde, vuelve a estar. Se repinta con
     `abrirTarea()` —el mismo camino que usa el revert de los campos— y no botón por botón. */
  if (tareaAbierta === t.id) abrirTarea(t.id);
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
  return true;
}

function mandarAlBacklog(t, silencio){
  if (t.backlog) return;
  const antes = { backlog: t.backlog };
  t.backlog = true;
  if (!silencio) { render(); aviso(`«${t.tarea || 'sin título'}» volvió al backlog`); }
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
}

/* Una fila vacía se cierra sin preguntar —no hay nada que perder—; una escrita, no. Lo usan
   las dos listas: borrar es borrar la tarea, no sacarla del bloque. */
async function borrarDeLista(t){
  // El «LOOM:» con el que nace no cuenta como algo escrito: si contara, una fila recién
  // creada y vacía preguntaría igual que una con media página adentro.
  const escrito = explATexto(t.expl).trim();
  const tieneAlgo = (t.tarea || '').trim() || (escrito && escrito !== TEXTO_LOOM.trim())
    || (t.files || []).length || (t.chat || []).length || (t.subtareas || []).length;
  if (tieneAlgo && !confirm(`Se borra «${t.tarea || 'sin título'}» con todo lo que tenga adentro. ¿Seguir?`)) return;

  const idx = datos.tareas.findIndex(x => x.id === t.id);
  datos.tareas = datos.tareas.filter(x => x.id !== t.id);
  if (menuFila === t.id) menuFila = null;
  // Borrarla mientras se le escribía el título deja el campo apuntando a una tarea que ya no
  // está: el `blur` no tendría a qué guardarle nada.
  if (bautizando === t.id) bautizando = null;
  // Si estabas parado adentro de su página, la página deja de existir con ella.
  if (paginaTarea === t.id) cerrarPagina();
  render();
  const ok = await conEstadoDeCarga(async () => {
    await borrarTodosLosArchivos(t);
    await RoadmapSync.borrarTarea(t.id);
  }, {
    onEstado: onEstadoGlobal,
    revertir: () => { datos.tareas.splice(idx, 0, t); render(); },
  });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.tareas, t.id);
}

/* Acá vivían `accionEnLote()` y `aplicarEnLote()`, las acciones sobre varias tareas marcadas.
   Se fueron el 26/8/2026 con el casillero que las alimentaba: sin dónde marcar una fila, no
   había forma de que llegara nada a estas dos. El `silencio` que todavía aceptan
   `campoTarea()`, `cambiarSprint()`, `cambiarEstado()`, `alTablero()` y
   `mandarAlBacklog()` era de acá, y se conserva porque no cuesta nada y es justo lo que haría
   falta el día que vuelva algo parecido. */

/* ---------- arrastrar y soltar ----------
   Mueve la fila entre sus hermanas y, si se suelta en otro bloque, la cambia de bloque: de
   sprint en el backlog, de estado en el tablero —lo mismo que arrastrar la tarjeta a otra
   columna—. El orden es el mismo decimal que usa el tablero: se guarda una fila, no la lista
   entera.

   El `antes` guarda los dos campos aunque cada lista toque uno solo: son dos números en un
   objeto de revert, y llevar la cuenta de cuál corresponde a cada lista es justo el tipo de
   detalle que se olvida al agregar la tercera.

   **Desde el 26/8/2026 se arrastra otra cosa además de las filas: el bloque entero**, para
   acomodarlo en otra columna del backlog. Son dos arrastres distintos sobre el mismo board y
   por eso hay dos variables y no una: mientras una está puesta la otra es `null`, y el primer
   renglón de cada manejador es cuál de las dos manda. Con una sola bandera habría que
   preguntarle al DOM qué se está moviendo en cada `dragover`, que son decenas por segundo. */
let arrastreBacklog = null;
let arrastreGrupo = null;

// Lo que hay que dejar como estaba cuando el arrastre termina, salga bien o se cancele. Va en
// una función porque lo llaman los dos `dragend` y también el `drop` del bloque.
function limpiarArrastreLista(){
  arrastreBacklog = null;
  arrastreGrupo = null;
  board.classList.remove('mueve-grupo');
  board.querySelectorAll('.arrastrando,.antes,.despues,.alfinal')
    .forEach(x => x.classList.remove('arrastrando', 'antes', 'despues', 'alfinal'));
}

/* Dónde entraría el bloque si se soltara acá: la columna bajo el cursor y el índice entre los
   bloques que ya tiene.

   **El corte se hace contra el bloque entero —cabecera más lo que le cuelga— y no contra la
   cabecera sola.** Con veinte tareas colgando, el medio de la cabecera cae en el primer
   centímetro de un bloque de media pantalla y todo lo demás contaría como «abajo de todo». */
function suelteDeGrupo(e){
  const col = e.target.closest('.bkcol[data-col]');
  if (!col) return null;
  const cabeceras = [...col.querySelectorAll('.bksprint')];
  let i = 0;
  for (; i < cabeceras.length; i++) {
    const cab = cabeceras[i];
    const kids = cab.nextElementSibling;
    const arriba = cab.getBoundingClientRect().top;
    const abajo = (kids && kids.classList.contains('pgkids') ? kids : cab)
      .getBoundingClientRect().bottom;
    if (e.clientY < arriba + (abajo - arriba) / 2) break;
  }
  return { col, cabeceras, i, n: Number(col.dataset.col) };
}

function engancharArrastreLista(){
  const L = listaActual;
  board.querySelectorAll('.bktarea [data-drag]').forEach(h => {
    h.addEventListener('dragstart', e => {
      const fila = h.closest('.bktarea');
      arrastreBacklog = fila.dataset.id;
      fila.classList.add('arrastrando');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastreBacklog);
      e.dataTransfer.setDragImage(fila, 24, 14);
    });
    h.addEventListener('dragend', limpiarArrastreLista);
  });

  /* El bloque entero. Solo lo dibuja el backlog: en la lista por estado los bloques son el
     catálogo de estados y su columna la fija `COLUMNAS_LISTA`, así que no hay nada que
     acomodar. La imagen que se arrastra es la cabecera y no el bloque con sus tareas — un
     fantasma de media pantalla tapa justo el lugar donde uno quiere soltarlo. */
  board.querySelectorAll('.bksprint [data-drag-grupo]').forEach(h => {
    h.addEventListener('dragstart', e => {
      const cab = h.closest('.bksprint');
      arrastreGrupo = cab.dataset.g;
      cab.classList.add('arrastrando');
      /* La marca en el board le da piso a las columnas cortas mientras dura el arrastre. Sin
         eso, una columna que termina a media pantalla no llega hasta donde uno suelta: el
         `drop` cae en el hueco de la grilla, que no es de nadie, y el bloque vuelve a su lugar
         sin que nada explique por qué. */
      board.classList.add('mueve-grupo');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastreGrupo);
      e.dataTransfer.setDragImage(cab, 24, 14);
    });
    h.addEventListener('dragend', limpiarArrastreLista);
  });

  board.ondragover = e => {
    if (arrastreGrupo != null) {
      e.preventDefault();
      board.querySelectorAll('.antes,.alfinal').forEach(x => x.classList.remove('antes', 'alfinal'));
      const s = suelteDeGrupo(e); if (!s) return;
      /* La marca es una raya arriba del bloque que quedaría debajo. Al final de la columna no
         hay bloque siguiente, así que la lleva la columna: es el único caso en que la raya no
         es de nadie en particular. */
      if (s.cabeceras[s.i]) s.cabeceras[s.i].classList.add('antes');
      else s.col.classList.add('alfinal');
      return;
    }
    if (!arrastreBacklog) return;
    e.preventDefault();
    board.querySelectorAll('.antes,.despues').forEach(x => x.classList.remove('antes', 'despues'));
    const fila = e.target.closest('.bktarea');
    if (!fila || fila.dataset.id === arrastreBacklog) return;
    const r = fila.getBoundingClientRect();
    fila.classList.add(e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
  };

  board.ondrop = e => {
    if (arrastreGrupo != null) {
      e.preventDefault();
      const n = Number(arrastreGrupo);
      const s = suelteDeGrupo(e);
      limpiarArrastreLista();
      if (s) moverGrupo(n, s.n, s.i);
      return;
    }
    if (!arrastreBacklog) return;
    e.preventDefault();
    const t = tarea(arrastreBacklog);
    const fila = e.target.closest('.bktarea');
    const bloque = e.target.closest('[data-filas]');
    arrastreBacklog = null;
    if (!t) return;

    const antes = { sprint: t.sprint, estado: t.estado, prioridad: t.prioridad, orden: t.orden };
    if (fila && fila.dataset.id !== t.id) {
      const destino = tarea(fila.dataset.id); if (!destino) return;
      const r = fila.getBoundingClientRect();
      const encima = e.clientY < r.top + r.height / 2;
      const g = L.grupoDe(destino);
      L.fijar(t, g);
      // Primero la banda y recién después el orden: adoptada la del destino, las dos filas
      // quedan en la misma lista y los vecinos son los que se ven arriba y abajo. Ver `LISTAS`.
      L.adoptarBanda(t, destino);
      const hermanas = L.hermanas(g)
        .filter(x => x.id !== t.id && L.bandaDe(x) === L.bandaDe(t));
      const i = hermanas.indexOf(destino);
      t.orden = RoadmapSync.calcularOrden(
        encima ? (hermanas[i - 1] ? hermanas[i - 1].orden : null) : destino.orden,
        encima ? destino.orden : (hermanas[i + 1] ? hermanas[i + 1].orden : null));
    } else if (bloque) {
      // Al final de SU banda y no al final del bloque: soltar en el vacío no cambia la
      // prioridad, así que el apilado la va a poner ahí igual y un orden mayor que el de la
      // última fila del bloque no la dejaría última si esa última es de otra banda.
      const g = bloque.dataset.filas;
      const ultima = L.hermanas(g)
        .filter(x => x.id !== t.id && L.bandaDe(x) === L.bandaDe(t)).pop();
      L.fijar(t, g);
      t.orden = RoadmapSync.calcularOrden(ultima ? ultima.orden : null, null);
    } else return;

    render();
    persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
  };
}
/* ============================================================
   La tarea como página
   ------------------------------------------------------------
   Entrar a una tarea abre un documento, no un formulario: renglones que se escriben de
   corrido y que, cuando hace falta, se vuelven un encabezado, un desplegable, un tilde del
   checklist o una subpágina.

   La lista y la página son el MISMO componente —comparten las clases `pg`— y la diferencia
   está en qué representa cada renglón: en la lista, sprints y tareas; adentro, bloques de
   texto. Por eso el `▤` significa lo mismo en los dos lados: entrás a una página.

   Una tarea se ENTRA, no se despliega, y eso es a propósito: desplegar tres para
   compararlas empujaría el resto del sprint fuera de pantalla, y la lista existe para ver
   el sprint completo. Los sprints sí se despliegan —son cuatro, no cuarenta.

   Dónde vive cada cosa, que es lo que no hay que confundir:
     - la estructura de la página → `expl`, en bloques (ver `MARCA_BLOQUES`)
     - el texto de cada tilde     → `subtareas`, como siempre
     - las imágenes pegadas       → el bucket, con `path` colgado del bloque `img`
   La subpágina NO es una tarea: no tiene código, ni prioridad, ni sale al tablero. Es una
   hoja adentro de la tarea. Por eso no hace falta `padre_id` en la base ni migración
   ninguna — que era la condición para poder hacer esto ahora.
   ============================================================ */

/* Estado de navegación. En memoria y no en `localStorage`: dónde estás parado ahora no es
   una preferencia. */
let paginaTarea = null;   // id de la tarea abierta como página
let paginaArbol = null;   // sus bloques, ya materializados
let paginaRuta = [];      // ids de los bloques `page` por los que se fue entrando
let paginaMenu = null;    // id del bloque con el menú `＋` desplegado
let paginaAdjuntoAncla = null;  // id del bloque debajo del cual entra lo que se elija del disco
let arrastreBloque = null;

const tareaDePagina = () => tarea(paginaTarea);

/* ---------- el «atrás» del navegador ----------
   La app es una sola URL y hasta el 26/8/2026 no tocaba el historial: entrabas a una tarea,
   apretabas atrás y te ibas del tablero entero. Ahora cada nivel al que se entra —la tarea y
   cada subpágina— apila una entrada que lleva adentro dónde estás parado.

   **`popstate` es la única puerta que mueve dónde estás parado.** Todo lo que sale —Escape, la
   miga de pan, el «Tablero» del principio— le pide al navegador que retroceda y no se mueve
   por su cuenta: se mueve cuando el navegador contesta. Que las dos formas de salir escriban
   en el mismo lugar es lo que mantiene el historial y la pantalla diciendo lo mismo. Al revés
   —que salir con Escape apilara una entrada nueva— «atrás» te volvería a meter en la tarea de
   la que acabás de salir, que es el defecto clásico de atar un botón de cerrar a un `pushState`.

   **La ubicación va entera en el `state`, no como un número de profundidad.** Así cada entrada
   sabe sola a qué tarea y a qué subpágina corresponde: adelante funciona igual que atrás, y
   recargar adentro de una tarea no deja el historial diciendo una cosa y la pantalla otra. */
const ubicacionPagina = () => ({ t: paginaTarea, r: paginaRuta.slice() });
const profundidadPagina = () => paginaTarea ? 1 + paginaRuta.length : 0;

/* Los dos únicos que escriben el historial. Van con red porque `pushState` tira si no hay
   origen —abrir el `index.html` con doble clic, sin servidor—: que ahí no ande el «atrás» es
   aceptable, que no se pueda entrar a una tarea no. */
function apilarPagina(){
  try { history.pushState({ pg: ubicacionPagina() }, ''); } catch (e) {}
}
function fijarPagina(){
  try { history.replaceState({ pg: ubicacionPagina() }, ''); } catch (e) {}
}

/* Salir no mueve nada acá: pide los saltos y el `popstate` que viene atrás es el que aplica.
   Si el destino es donde ya estás —el último tramo de la miga— no salta y no pasa nada. */
function volverAProfundidad(prof){
  const saltos = profundidadPagina() - prof;
  if (saltos > 0) history.go(-saltos);
}

/* `render()` rearma el árbol solo y rutea a la página o al tablero según haya tarea o no, así
   que acá alcanza con dejar la ubicación puesta. Una entrada que apunta a una tarea borrada la
   resuelve él, que ya tenía ese corte. */
function aplicarUbicacion(u){
  cerrarMenu();
  paginaMenu = null;
  arrastreBloque = null;
  paginaTarea = (u && u.t) || null;
  paginaRuta = (u && u.r) ? u.r.slice() : [];
  render();
}
addEventListener('popstate', e => aplicarUbicacion(e.state && e.state.pg));

/* Al arrancar —y al volver a entrar después de cerrar sesión— la ubicación sale del historial
   y no de cero: recargar adentro de una tarea tiene que dejarte adentro de esa tarea. Si no,
   la entrada en la que estás parado diría «tarea P-12» y la pantalla el tablero, y el primer
   «atrás» te metería en una tarea en vez de sacarte.

   Se llama desde `arrancar()` y no acá arriba porque necesita los datos cargados: sin ellos no
   hay cómo saber si la tarea que nombra el historial todavía existe. */
function restaurarUbicacion(){
  const u = history.state && history.state.pg;
  paginaMenu = null;
  if (u && u.t && tarea(u.t)) { paginaTarea = u.t; paginaRuta = (u.r || []).slice(); return; }
  cerrarPagina();
}

/* ---------- el árbol ----------
   Todo lo que sigue trabaja sobre `nivelPagina()` y no sobre `paginaArbol`: al entrar a una
   subpágina, esa subpágina ES la raíz. Así indentar, sacar y arrastrar no pueden sacar un
   bloque del nivel que estás mirando. */
function nivelPagina(){
  let lista = paginaArbol || [];
  const validos = [];
  for (const id of paginaRuta) {
    const b = buscarBloque(id, lista);
    if (!b) break;                       // se borró desde otro lado: se corta la ruta acá
    validos.push(id);
    lista = (b.kids = b.kids || []);
  }
  if (validos.length !== paginaRuta.length) paginaRuta = validos;
  return lista;
}
function buscarBloque(id, lista){
  for (const b of lista || []) {
    if (b.id === id) return b;
    const hit = buscarBloque(id, b.kids);
    if (hit) return hit;
  }
  return null;
}
// El array que lo contiene, para poder cortar y pegar en su lugar.
function contenedorBloque(id, lista){
  lista = lista || nivelPagina();
  if (lista.some(b => b.id === id)) return lista;
  for (const b of lista) {
    const hit = b.kids && contenedorBloque(id, b.kids);
    if (hit) return hit;
  }
  return null;
}
function padreDeBloque(id, lista){
  for (const b of lista || nivelPagina()) {
    if ((b.kids || []).some(k => k.id === id)) return b;
    const hit = b.kids && padreDeBloque(id, b.kids);
    if (hit) return hit;
  }
  return null;
}
const esDescendiente = (b, id) => (b.kids || []).some(k => k.id === id || esDescendiente(k, id));

/* Insertar «debajo» de un desplegable abierto es meterlo adentro, no después: es lo que uno
   espera cuando aprieta Enter al final del título de un desplegable. */
function insertarDespues(vecino, nuevo){
  if (!vecino) { nivelPagina().push(nuevo); return nuevo; }
  if (vecino.k === 'toggle' && vecino.open) {
    vecino.kids = vecino.kids || [];
    vecino.kids.unshift(nuevo);
    return nuevo;
  }
  const cont = contenedorBloque(vecino.id) || nivelPagina();
  const i = cont.indexOf(vecino);
  cont.splice(i < 0 ? cont.length : i + 1, 0, nuevo);
  return nuevo;
}
function quitarBloque(b){
  const cont = contenedorBloque(b.id);
  if (!cont) return;
  cont.splice(cont.indexOf(b), 1);
}

/* Los tildes del checklist no guardan su texto: apuntan a una subtarea. Esto empareja las
   dos listas al abrir la página — tira los tildes cuyo paso ya no existe y agrega al final
   los pasos que se cargaron desde la ficha y todavía no tienen bloque. Sin esto habría
   pasos invisibles en la página, que es peor que no tenerlos. */
function sincronizarChecks(t, arbol){
  const pasos = t.subtareas || [];
  const vistos = new Set();
  const limpiar = lista => {
    for (let i = lista.length - 1; i >= 0; i--) {
      const b = lista[i];
      if (b.k === 'check') {
        if (!pasos.some(s => s.id === b.sid) || vistos.has(b.sid)) { lista.splice(i, 1); continue; }
        vistos.add(b.sid);
      }
      if (b.kids) limpiar(b.kids);
    }
  };
  limpiar(arbol);
  pasos.forEach(s => { if (!vistos.has(s.id)) arbol.push(nuevoBloque('check', '', { sid: s.id })); });
  return arbol;
}

/* El árbol listo para usar, en un solo lugar: los pasos emparejados con `subtareas` y la
   cabecera en su sitio. Lo llaman los dos que lo materializan —`render()` y `abrirPagina()`—
   y por eso no vive suelto en ninguno de los dos. */
function arbolDeTarea(t){
  return normalizarCabecera(sincronizarChecks(t, bloquesDeExpl(t.expl)));
}

/* ---------- entrar y salir ---------- */
/* Acá vivía el `foco`, que ponía el cursor en el título de la página. Lo usaba la creación,
   cuando crear una tarea entraba a su página; desde que la fila recién creada se bautiza en la
   lista (ver `bautizando`) no lo llama nadie, y un parámetro que nadie pasa es una promesa de
   que la página se puede abrir enfocada — que ya no es cierta. */
function abrirPagina(id){
  const t = tarea(id); if (!t) return;
  /* Entrar es haberla visto: la chapa de «todavía no entraste» se apaga acá y no cuando se
     sale, que es lo que uno espera del momento en que efectivamente la miró. En el backlog no
     cuenta: ahí se entra a planificar y se entra varias veces, y si contara, la tarea llegaría
     apagada al tablero — que es el único lugar donde la chapa significa algo. */
  if (!t.backlog) marcarVista(id, prioridadDe(t.prioridad).id);
  paginaTarea = id;
  paginaRuta = [];
  paginaMenu = null;
  paginaArbol = arbolDeTarea(t);
  if (tareaAbierta) cerrarModales();
  // Entrar apila y se mueve en el mismo acto: la entrada del historial todavía no existe, así
  // que acá no hay `popstate` que esperar. Salir es al revés — ver el cuadro de arriba.
  apilarPagina();
  render();
  board.scrollTop = 0;
}
/* Cerrar también deja la entrada del historial diciendo «el tablero», y por eso el `fijarPagina()`
   va acá adentro y no en quien llama: los caminos que cierran la página sin que nadie navegue
   —la tarea borrada, la que desapareció por realtime— dejarían una entrada que sigue jurando
   que estás adentro de algo que ya no existe. */
function cerrarPagina(){
  paginaTarea = null; paginaArbol = null; paginaRuta = []; paginaMenu = null;
  arrastreBloque = null;
  cerrarMenu();
  fijarPagina();
}
// Escape y la miga de pan salen de a un nivel: de la subpágina a la tarea, de la tarea afuera.
// No se mueve nada acá: se le pide al navegador que retroceda uno y el `popstate` hace el resto.
function salirDePagina(){
  volverAProfundidad(profundidadPagina() - 1);
}

function guardarPagina(){
  const t = tareaDePagina(); if (!t) return;
  campoTareaDebounced(t, 'expl', explDeBloques(paginaArbol));
}
// Un cambio de estructura: se guarda y se repinta. Los de texto NO pasan por acá — repintar
// mientras alguien escribe le tira el cursor a la primera letra.
function cambiarPagina(mutar){
  mutar();
  guardarPagina();
  renderPagina();
}

/* ---------- pintado ---------- */

// Las subpáginas no se despliegan en el lugar: se entra a ellas. Solo el desplegable abre.
function planosPagina(lista, prof, salida){
  salida = salida || [];
  (lista || []).forEach(b => {
    // La cabecera se saltea acá y no en quien llama: es lo único que garantiza que ningún
    // camino la dibuje como una fila más y termine dejándola arrastrable o borrable.
    if (b.k === K_HDR) return;
    salida.push({ b, prof });
    if (b.k === 'toggle' && b.open) planosPagina(b.kids, prof + 1, salida);
  });
  return salida;
}

function renderPagina(){
  const t = tareaDePagina();
  if (!t) { cerrarPagina(); return render(); }

  const lista = nivelPagina();
  const dentro = paginaRuta.length ? buscarBloque(paginaRuta[paginaRuta.length - 1], paginaArbol) : null;
  const filas = planosPagina(lista, 0, []);

  // Migas: siempre arrancan en la lista, después la tarea, después cada subpágina.
  const migas = [`<button type="button" data-salir-todo>${vistaActual().backlog ? 'Backlog' : 'Tablero'}</button>`,
    `<button type="button" data-nivel="0">${esc(t.id)}</button>`];
  let acum = paginaArbol;
  paginaRuta.forEach((id, i) => {
    const b = buscarBloque(id, acum);
    migas.push(`<button type="button" data-nivel="${i + 1}">${esc((b && b.txt) || 'Sin título')}</button>`);
    acum = (b && b.kids) || [];
  });

  const pasos = (t.subtareas || []);
  const hechos = pasos.filter(s => s.estado === HECHO).length;
  const resumen = pasos.length ? `${hechos} de ${pasos.length} pasos` : `${filas.length} bloques`;

  board.innerHTML = `<div class="pgwrap">
    <nav class="pgbc" aria-label="Dónde estás">
      ${migas.join('<span class="pgsep">/</span>')}
      <span class="pgflex"></span>
      <span class="pgres">${esc(resumen)}</span>
    </nav>
    <div class="pgtitle" contenteditable="true" spellcheck="false" data-titulo
      data-ph="Sin título">${esc(dentro ? (dentro.txt || '') : (t.tarea || ''))}</div>
    ${dentro ? '' : metaPaginaHTML(t)}
    ${dentro ? '' : cabeceraPaginaHTML()}
    <div class="pgbody">${filas.map(f => filaBloqueHTML(f, t)).join('')}</div>
    <button class="pgnew" type="button" data-nuevo aria-label="Agregar un bloque al final">＋</button>
  </div>`;

  // Los archivos se vuelven a firmar en cada pintado —la imagen, el marco y el enlace que
  // los abre—: el `path` es lo guardado, la dirección vence. Mismo criterio que la ficha.
  refrescarFirmasDeExpl(board);
  engancharPagina();
}

/* La cabecera de la tarea. Son los mismos controles de la fila —mismas clases, mismo
   comportamiento— y no una copia: la prioridad, quién la hace y el pase al tablero se tocan
   desde acá igual que desde la lista.

   **Ya no están el grupo ni «Ficha completa»** (26/8/2026, por pedido). En qué grupo cae la
   tarea es un dato de la planificación y se mira desde el backlog, que es donde los grupos
   son la estructura de la pantalla; acá adentro llenaba el renglón con algo que nadie viene a
   ver. Y la ficha ya se abre desde el menú `⋯` de la fila: dos puertas al mismo modal, una de
   ellas compitiendo por lugar con lo que sí se toca. Lo que quedó se agranda —ver `.pgmeta` en
   el CSS—: con la mitad de las pastillas afuera, las que quedan pueden pesar lo que valen. */
function metaPaginaHTML(t){
  return `<div class="pgmeta">
    <span class="pgpills">${pillsDeTarea(t)}</span>
    <span class="pgflex"></span>
    ${t.backlog
      ? `<button class="pgship" type="button" data-ir
          title="Mandar al tablero">→ Al tablero</button>`
      : `<span class="pgship ya"><button type="button" data-ir>● En el tablero</button></span>`}
  </div>`;
}

/* El cuadro de avisos, arriba de todo y solo en la raíz de la tarea. En una subpágina no va:
   los avisos son de la tarea, y repetirlos en cada nivel haría que el mismo aviso pareciera
   tres avisos distintos.

   El cuadro se dibuja siempre, aunque esté vacío: es un lugar fijo donde dejar algo, y uno
   que aparece solo cuando ya hay algo adentro no le sirve al primero que quiere escribir. */
function cabeceraPaginaHTML(){
  const avisos = avisosDe(cabeceraDe(paginaArbol));
  /* Cuenta TODOS los sin ver y no solo los dirigidos a mí, al revés que la chapa del tablero:
     el destinatario decide a quién le suena la chapa desde afuera, pero adentro de la tarea el
     cuadro se lee entero.

     **Es un booleano a la vista y no un número** (26/8/2026, por pedido). Al lado del rótulo
     iba la pastilla «N sin ver» y se sacó: los avisos sin ver están ahí abajo, contados en un
     renglón cada uno y en rojo, así que la pastilla decía en números lo que la lista ya dice
     enteros — y encima aparecía justo encima del campo, en el momento de escribir uno nuevo.
     Que hay algo sin ver lo sigue diciendo el borde rojo del cuadro, que es lo que se ve antes
     de leer nada, y para eso alcanza con saber si hay o no hay. */
  const sinVer = avisos.some(a => !a.visto);
  return `<div class="pghdr${sinVer ? ' hay' : ''}">
    <div class="pgavtop">
      <span class="pglbl">Avisos</span>
      <input class="pgavin" type="text" data-aviso spellcheck="false"
        placeholder="Escribí un aviso — Enter lo deja acá" aria-label="Escribir un aviso">
    </div>
    ${avisos.length ? `<ul class="pgavmsgs">${avisos.map(avisoHTML).join('')}</ul>` : ''}
  </div>`;
}

/* Sin ver va resaltado en rojo; con el visto puesto queda en gris y el botón se va. Se cambia
   por un cartel muerto y no por un botón apagado: «visto» ya pasó, no hay nada que apretar.
   El ✕ queda siempre — un aviso ya visto es justo el que uno quiere sacar de la lista.

   Quién lo escribió y cuándo van en el `title` y no a la vista: el cuadro tiene que poder
   leerse de un vistazo, y una firma por renglón lo llenaría de nombres. */
/* Para quién es el aviso, escrito y no solo en avatares (26/8/2026, por pedido). Los avatares
   se quedan —tres iniciales de color se leen de un vistazo— pero al lado va el nombre: un
   círculo con una «L» adentro solo es un dato para el que ya se lo sabe de memoria, y acá el
   destinatario es justo lo que hay que poder leer sin pasar el cursor por encima. Es la misma
   razón por la que la pastilla de prioridad se quedó en la fila de la lista al lado del riel.

   Sin nadie elegido va escrito y en ámbar, no un punto tenue que se prende con el hover: de
   los dos estados era el invisible, y es el que hay que notar. Ámbar y no rojo, la misma
   escala que lo rancio del backlog: es algo para mirar, no una alarma — el rojo de este cuadro
   ya significa «sin ver». Ojo con lo que quiere decir: vacío es que le suena a TODO el equipo,
   no que el aviso no le llegue a nadie, y eso lo aclara el `title`.

   Las dos formas son el mismo botón y el mismo menú. */
const rotuloPara = ids => ids.length
  ? 'Aviso para ' + ids.map(nombrePersona).join(' · ') + ' — solo a ellos les suena'
  : 'Sin destinatario: le suena a todo el equipo. Tocá para elegir a quién';
const marcasPara = ids => ids.length
  ? ids.map(id => `<span class="av mini" style="background:${colorPersona(id)}">${esc(iniPersona(id))}</span>`).join('')
    + `<span class="pgavnom">${esc(ids.map(nombrePersona).join(' · '))}</span>`
  : '<i class="pgavdot"></i><span class="pgavnom">Sin destinatario</span>';

function botonParaHTML(a){
  const ids = destinatariosDe(a);
  return `<button class="pgavpara${ids.length ? '' : ' todos'}" type="button" data-pop="avpara"
    title="${escA(rotuloPara(ids))}" aria-label="${escA(rotuloPara(ids))}">${marcasPara(ids)}</button>`;
}

function avisoHTML(a){
  const quien = a.autor ? nombrePersona(a.autor) : 'Alguien';
  const cuando = fmtTs(a.ts);
  const firma = quien + (cuando ? ' · ' + cuando : '');
  return `<li class="pgavmsg${a.visto ? ' visto' : ''}" data-av="${escA(a.id)}">
    <span class="pgavtxt" title="${escA(firma)}">${esc(a.texto)}</span>
    ${botonParaHTML(a)}
    ${a.visto
      ? `<span class="pgavya" title="${escA(firma)}">✓ visto</span>`
      : `<button class="pgavok" type="button" data-visto title="Marcarlo como visto">visto</button>`}
    <button class="pgavx" type="button" data-borrar-aviso
      title="Borrar el aviso" aria-label="Borrar el aviso">✕</button>
  </li>`;
}

const CONTROLES_BLOQUE = `<div class="pgctl">
  <button class="pgadd" type="button" data-add title="Insertar un bloque debajo" aria-label="Insertar un bloque debajo">＋</button>
  <button class="pgdrag" type="button" draggable="true" data-drag title="Arrastrar para mover" aria-label="Mover el bloque">⠿</button>
</div>`;

function filaBloqueHTML({ b, prof }, t){
  const menu = b.id === paginaMenu ? menuBloqueHTML() : '';
  const base = `class="pgrow pg-${b.k}" data-b="${escA(b.id)}" style="--ind:${prof * 22}px"`;

  if (b.k === 'file') return filaArchivoHTML(b, base, menu);

  if (b.k === 'check') {
    const paso = (t.subtareas || []).find(s => s.id === b.sid);
    if (!paso) return '';
    const hecho = paso.estado === HECHO;
    return `<div ${base}>${CONTROLES_BLOQUE}
      <button class="pgbox${hecho ? ' on' : ''}" type="button" data-tick
        aria-pressed="${hecho}" aria-label="Marcar el paso como hecho">${hecho ? '✓' : ''}</button>
      <div class="pgtxt${hecho ? ' hecho' : ''}" contenteditable="true" spellcheck="false"
        data-txt data-ph="Paso sin nombre">${esc(paso.titulo || '')}</div>
      <button class="pgdel" type="button" data-del title="Borrar el paso" aria-label="Borrar el paso">✕</button>
      ${menu}</div>`;
  }

  const marca =
    b.k === 'toggle' ? `<button class="pgcar${b.open ? ' on' : ''}" type="button" data-open
        aria-expanded="${!!b.open}" aria-label="Abrir o cerrar">▾</button>`
    : b.k === 'page' ? `<button class="pgpg" type="button" data-entrar aria-label="Entrar a la subpágina">▤</button>`
    : '';
  const extra = b.k === 'page'
    ? `<button class="pgabrir" type="button" data-entrar>abrir ⤢</button>` : '';
  const ph = b.k === 'h' ? 'Encabezado' : b.k === 'toggle' ? 'Título del desplegable'
    : b.k === 'page' ? 'Título de la subpágina' : 'Escribí algo…';

  return `<div ${base}>${CONTROLES_BLOQUE}${marca}
    <div class="pgtxt" contenteditable="true" spellcheck="false" data-txt data-ph="${escA(ph)}">${esc(b.txt || '')}</div>
    ${extra}
    <button class="pgdel" type="button" data-del title="Borrar el bloque" aria-label="Borrar el bloque">✕</button>
    ${menu}</div>`;
}

/* ---------- el renglón que es un archivo ----------
   Dos estados y un solo dato. Plegado es la ficha del archivo: ícono, nombre y peso, y el
   nombre abre el original en una pestaña. Desplegado, además, se ve el contenido acá mismo
   — la imagen pegada en la hoja, el PDF o el HTML en un marco.

   La ficha NO desaparece al desplegar, y eso es a propósito: una imagen suelta en el medio
   de la página no dice de qué archivo salió ni deja dónde apretar para bajarla, y lo que se
   adjunta se adjunta para poder pasárselo a alguien.

   Lo que no se puede dibujar —un zip, un .docx— ni siquiera muestra la flecha: una flecha
   que al apretarla no hace nada es peor que no tenerla. */
function filaArchivoHTML(b, base, menu){
  const f = archivoDe(b);
  const nombre = f.n || 'archivo';
  const esImg = esImagenArchivo(f);
  const ver = seVeAdentro(f);
  const abierto = ver && !!b.open;
  const claves = `data-path="${escA(f.path || '')}" data-b="${escA(f.b || '')}"`;

  const marca = ver
    ? `<button class="pgcar${abierto ? ' on' : ''}" type="button" data-open
        aria-expanded="${abierto}" title="${abierto ? 'Plegarlo' : 'Verlo acá adentro'}"
        aria-label="Plegar o desplegar el archivo">▾</button>`
    : `<span class="pgcar hueco" aria-hidden="true"></span>`;

  const ficha = `<span class="pgfile">
    ${esImg ? ICONO_IMG : ICONO_DOC}
    <a class="pgfn" href="#" target="_blank" rel="noopener" ${claves}
      title="Abrir ${escA(nombre)} en una pestaña">${esc(nombre)}</a>
    <span class="pgfsz">${b.cargando ? 'subiendo…' : (f.size ? esc(kb(f.size)) : '')}</span>
  </span>`;

  // El `sandbox` va sin `allow-scripts`: el archivo lo subió alguien del equipo, pero un
  // marco con permiso de ejecutar sobre cualquier HTML que alguien pegue es una puerta que
  // no hace falta abrir. Si el navegador no dibuja el PDF ahí adentro, el nombre lo sigue
  // abriendo en una pestaña, que es el camino de siempre.
  const dentro = !abierto ? ''
    : esImg
      ? `<div class="pgimg"><img alt="${escA(nombre)}" ${claves}${b.w ? ` style="width:${escA(b.w)}"` : ''}${b.cargando && b.blob ? ` src="${escA(b.blob)}" class="cargando"` : ''}></div>`
      : `<iframe class="pgframe" title="${escA(nombre)}" sandbox="allow-same-origin" ${claves}></iframe>`;

  return `<div ${base}>${CONTROLES_BLOQUE}${marca}
    <div class="pgtxt pgfilewrap">${ficha}${dentro}</div>
    <button class="pgdel" type="button" data-del title="Quitar el archivo del renglón" aria-label="Quitar el archivo">✕</button>
    ${menu}</div>`;
}

const ICONO_DOC = `<svg class="pgfico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 3v5h5"/><path d="M19 21H5V3h9l5 5v13z"/></svg>`;
const ICONO_IMG = `<svg class="pgfico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>`;

/* Los cinco del diseño más el archivo. La imagen pegada con Ctrl+V no necesita entrada acá
   —entra sola donde esté el cursor, que es como uno las mete de verdad—, pero elegir un PDF
   o un HTML del disco no tiene otro camino que este: no hay nada que pegar. */
function menuBloqueHTML(){
  const it = (k, ico, txt) =>
    `<button type="button" data-ins="${k}"><span>${ico}</span>${txt}</button>`;
  return `<div class="pgpop">
    <div class="pgpop-t">Insertar debajo</div>
    ${it('text', '¶', 'Texto')}
    ${it('h', 'H', 'Encabezado')}
    ${it('toggle', '▸', 'Desplegable')}
    ${it('check', '☐', 'Checklist')}
    ${it('page', '▤', 'Página')}
    <button type="button" data-adjuntar><span>⇪</span>Archivo</button>
  </div>`;
}

/* ---------- enganches ----------
   Por delegación sobre el board, igual que el backlog: la página se repinta entera ante
   cualquier cambio de estructura, y colgar manejadores en cada bloque para tirarlos al
   repintado siguiente no tiene sentido. `render()` los suelta al salir. */
function engancharPagina(){
  board.onclick = e => {
    const t = tareaDePagina(); if (!t) return;
    const enc = s => e.target.closest(s);

    /* La miga de pan no se mueve sola: retrocede en el historial y el `popstate` aplica. El
       `data-nivel` es cuántos tramos de ruta quedan, así que la profundidad de destino es uno
       más —el tramo de la tarea—; el último tramo de la miga es donde ya estás y no salta. */
    if (enc('[data-salir-todo]')) return volverAProfundidad(0);
    const nivel = enc('[data-nivel]');
    if (nivel) return volverAProfundidad(Number(nivel.dataset.nivel) + 1);

    // Los de la cabecera son los mismos de la fila y hacen exactamente lo mismo.
    const ir = enc('[data-ir]');
    if (ir) return t.backlog ? pasarAlRoadmap(t, ir, e) : mandarAlBacklog(t);
    // Prioridad y responsables son las mismas pills de la lista y abren el mismo menú: acá se
    // toca la tarea entera, no un bloque.
    const pop = enc('.pgmeta [data-pop]');
    if (pop) return abrirMenu(pop, pop.dataset.pop, t);

    if (enc('[data-nuevo]')) {
      const nuevo = nuevoBloque('text', '');
      cambiarPagina(() => nivelPagina().push(nuevo));
      return enfocarBloque(nuevo.id);
    }

    // Van antes del corte por `.pgrow`: el cuadro de avisos no es una fila de bloques y ahí
    // abajo se saldría sin hacer nada.
    const msg = enc('[data-av]');
    if (msg) {
      // Para quién es el aviso: el mismo cajón de siempre, marcado con `data-pop` para que el
      // cierre global no lo apague en el mismo clic que lo abre.
      const quienes = enc('[data-pop]');
      if (quienes) {
        const a = avisoDe(msg.dataset.av);
        return a ? abrirMenu(quienes, 'avpara', a, null, '¿Para quién es?') : undefined;
      }
      if (enc('[data-visto]')) return marcarAvisoVisto(msg.dataset.av);
      if (enc('[data-borrar-aviso]')) return borrarAviso(msg.dataset.av);
    }

    const fila = enc('.pgrow');
    if (!fila) return;
    const b = buscarBloque(fila.dataset.b, nivelPagina()); if (!b) return;

    // El menú `＋` frena la propagación: si llegara al `document`, el mismo clic que lo
    // abre lo cerraría.
    if (enc('[data-add]')) {
      e.stopPropagation();
      paginaMenu = paginaMenu === b.id ? null : b.id;
      return renderPagina();
    }
    const ins = enc('[data-ins]');
    if (ins) {
      e.stopPropagation();
      return insertarBloque(t, b, ins.dataset.ins);
    }
    // «Archivo» no inserta un bloque vacío: sin archivo elegido no hay bloque que valga la
    // pena, así que primero se abre el selector y el bloque nace recién con lo elegido. Se
    // anota debajo de cuál va antes de perder el foco: el selector es del sistema y el
    // repintado que cierra el menú se lleva puesta la fila desde donde se apretó.
    if (enc('[data-adjuntar]')) {
      e.stopPropagation();
      paginaAdjuntoAncla = b.id;
      paginaMenu = null;
      renderPagina();
      $('#pgFileIn').click();
      return;
    }
    if (enc('.pgpop')) { e.stopPropagation(); return; }

    // El enlace al archivo se firma después de pintar: si el clic llega antes, o si la firma
    // falló, el `href` sigue en `#` y saltar al principio de la página no es lo que se pidió.
    const link = enc('.pgfn');
    if (link && link.getAttribute('href') === '#') {
      e.preventDefault();
      return aviso('Todavía no tengo la dirección de ese archivo. Probá de nuevo en un segundo.');
    }
    if (link) return;

    if (enc('[data-open]'))   return cambiarPagina(() => { b.open = !b.open; });
    // Entrar a una subpágina es un nivel más, y apila igual que entrar a la tarea: «atrás» te
    // devuelve al nivel de arriba y no te saca del tablero de un saque.
    if (enc('[data-entrar]')) {
      paginaRuta.push(b.id); paginaMenu = null;
      apilarPagina();
      return renderPagina();
    }
    if (enc('[data-tick]'))   return tildarBloque(t, b);
    if (enc('[data-del]'))    return borrarBloque(t, b);
  };

  board.oninput = e => {
    const t = tareaDePagina(); if (!t) return;

    // El título: el de la tarea si estás en la raíz, el de la subpágina si entraste.
    if (e.target.hasAttribute('data-titulo')) {
      const txt = e.target.textContent;
      const dentro = paginaRuta.length ? buscarBloque(paginaRuta[paginaRuta.length - 1], paginaArbol) : null;
      if (dentro) { dentro.txt = txt; guardarPagina(); }
      else { campoTareaDebounced(t, 'tarea', txt); }
      return;
    }
    if (!e.target.hasAttribute('data-txt')) return;
    const fila = e.target.closest('.pgrow'); if (!fila) return;
    const b = buscarBloque(fila.dataset.b, nivelPagina()); if (!b) return;
    escribirEnBloque(t, b, e.target.textContent);
  };

  board.onkeydown = e => {
    const t = tareaDePagina(); if (!t) return;

    // Enter deja el aviso. Escape limpia la caja: escribir tres palabras y no tener cómo
    // arrepentirse sin borrarlas a mano es de las cosas que más molestan.
    if (e.target.hasAttribute('data-aviso')) {
      if (e.key === 'Enter') { e.preventDefault(); mandarAviso(e.target); }
      else if (e.key === 'Escape') { e.preventDefault(); e.target.value = ''; }
      return;
    }

    if (e.target.hasAttribute('data-titulo')) {
      if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
      return;
    }
    if (!e.target.hasAttribute('data-txt')) return;
    const fila = e.target.closest('.pgrow'); if (!fila) return;
    const b = buscarBloque(fila.dataset.b, nivelPagina()); if (!b) return;

    // Enter abre el renglón siguiente. Un tilde abre otro tilde: escribir un checklist de
    // corrido es el 90% de lo que se hace acá adentro.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      escribirEnBloque(t, b, e.target.textContent);
      const nuevo = b.k === 'check' ? crearCheck(t) : nuevoBloque('text', '');
      cambiarPagina(() => insertarDespues(b, nuevo));
      return enfocarBloque(nuevo.id);
    }
    // Backspace en un renglón vacío lo borra y sube al anterior, como en cualquier editor.
    if (e.key === 'Backspace' && !e.target.textContent) {
      e.preventDefault();
      const previo = bloqueAnterior(b);
      borrarBloque(t, b, true);
      if (previo) enfocarBloque(previo.id);
      return;
    }
    // Tab anida bajo el desplegable de arriba. Solo bajo un desplegable: adentro de una
    // subpágina el bloque desaparecería de la vista, que no es lo que uno pidió.
    if (e.key === 'Tab') {
      e.preventDefault();
      escribirEnBloque(t, b, e.target.textContent);
      e.shiftKey ? sacarBloque(b) : anidarBloque(b);
      return enfocarBloque(b.id);
    }
  };

  board.onpaste = e => pegarEnPagina(e);
  engancharArrastreBloques();
}

/* El selector del disco vive suelto en el HTML y no se cuelga en `engancharPagina()`: el
   input no está adentro del board, así que un `board.onchange` no lo escucharía, y colgarlo
   en cada pintado acumularía un manejador por repintado. */
$('#pgFileIn').addEventListener('change', e => {
  const t = tareaDePagina();
  const files = [...e.target.files].filter(f => f.size);
  // Se vacía siempre: si no, elegir dos veces el mismo archivo no vuelve a disparar `change`.
  e.target.value = '';
  const ancla = paginaAdjuntoAncla ? buscarBloque(paginaAdjuntoAncla, nivelPagina()) : null;
  paginaAdjuntoAncla = null;
  if (t && files.length) subirArchivosEnPagina(t, files, ancla);
});

/* ---------- cambios ---------- */

// El texto no repinta: guarda y listo. El cursor está adentro del campo.
function escribirEnBloque(t, b, txt){
  if (b.k === 'check') {
    const paso = (t.subtareas || []).find(s => s.id === b.sid);
    if (paso) cambiarPasos(t, () => { paso.titulo = txt; });
    return;
  }
  b.txt = txt;
  guardarPagina();
}

/* ---------- los avisos ----------
   Los tres repintan, y eso es lo contrario de lo que hace el texto de un bloque: acá no hay
   nadie con el cursor adentro de lo que cambia. Un aviso nuevo, un visto o un borrado mueven
   el contador y la lista, así que se vuelve a dibujar y el foco se devuelve a la caja:
   escribir tres avisos seguidos no tiene por qué costar tres clics. */
function mandarAviso(input){
  const texto = input.value.trim(); if (!texto) return;
  cabeceraEditable(paginaArbol).avisos.push(nuevoAviso(texto));
  // Se vacía antes de repintar por las dudas: si el repintado fallara, al menos no queda
  // el mismo texto listo para mandarse dos veces de un Enter.
  input.value = '';
  guardarPagina();
  renderPagina();
  const caja = board.querySelector('[data-aviso]');
  if (caja) caja.focus();
}

/* El visto lo pone cualquiera y no una persona en particular: el aviso es de la tarea, y uno
   ya resuelto en una llamada tiene que poder apagarse sin esperar a nadie. Queda quién lo
   apagó en `vistoPor` para poder preguntar. */
const avisoDe = id => avisosDe(cabeceraDe(paginaArbol)).find(x => x.id === id) || null;

/* El botón de destinatarios de un renglón, reescrito en el lugar. No repinta la página: el
   menú de «¿para quién es?» cuelga del botón y elegir a dos personas es marcar dos, así que
   el botón tiene que seguir existiendo entre un clic y el otro. */
function repintarAviso(a){
  const li = [...board.querySelectorAll('[data-av]')].find(x => x.dataset.av === a.id);
  const btn = li && li.querySelector('[data-pop="avpara"]');
  if (!btn) return;
  const ids = destinatariosDe(a);
  btn.classList.toggle('todos', !ids.length);
  btn.title = rotuloPara(ids);
  btn.setAttribute('aria-label', rotuloPara(ids));
  btn.innerHTML = marcasPara(ids);
}

function marcarAvisoVisto(id){
  const a = avisoDe(id);
  if (!a || a.visto) return;
  a.visto = true;
  a.vistoPor = YO.id || '';
  a.vistoTs = new Date().toISOString();
  guardarPagina();
  renderPagina();
}

// Sin confirmación: un aviso es un renglón, y preguntar por cada uno haría que limpiar el
// cuadro cueste el doble de clics que llenarlo.
function borrarAviso(id){
  const h = cabeceraDe(paginaArbol); if (!h) return;
  h.avisos = avisosDe(h).filter(x => x.id !== id);
  guardarPagina();
  renderPagina();
}

function crearCheck(t){
  const id = nuevoId('S', (t.subtareas || []).map(s => s.id));
  // La forma completa que ya usa la base: el paso creado desde la página tiene que ser
  // indistinguible del creado desde la ficha.
  cambiarPasos(t, () => t.subtareas.push({ id, titulo:'', resp:'', estado:'Pendiente', expl:'', chat:[], files:[] }));
  return nuevoBloque('check', '', { sid: id });
}

function insertarBloque(t, vecino, k){
  const nuevo = k === 'check' ? crearCheck(t) : nuevoBloque(k, '');
  cambiarPagina(() => { paginaMenu = null; insertarDespues(vecino, nuevo); });
  enfocarBloque(nuevo.id);
}

function tildarBloque(t, b){
  const paso = (t.subtareas || []).find(s => s.id === b.sid); if (!paso) return;
  cambiarPasos(t, () => { paso.estado = paso.estado === HECHO ? 'Pendiente' : HECHO; });
  renderPagina();
}

/* Borrar un desplegable o una subpágina se lleva lo que tiene adentro: se pregunta. Un
   renglón vacío no pregunta nada — no hay nada que perder. */
function borrarBloque(t, b, silencio){
  const hijos = (b.kids || []).length;
  if (!silencio && hijos && !confirm(`«${b.txt || 'sin título'}» tiene ${hijos} ${hijos === 1 ? 'bloque' : 'bloques'} adentro. ¿Borrar todo?`)) return;
  // Un tilde borrado se lleva su paso: si no, quedaría en el checklist de la ficha sin
  // bloque que lo muestre, y `sincronizarChecks()` lo volvería a agregar al final.
  if (b.k === 'check') cambiarPasos(t, () => {
    t.subtareas = (t.subtareas || []).filter(s => s.id !== b.sid);
  });
  cambiarPagina(() => quitarBloque(b));
}

// El renglón de arriba en la pantalla, que no es el hermano anterior si ese estaba abierto.
function bloqueAnterior(b){
  const planos = planosPagina(nivelPagina(), 0, []);
  const i = planos.findIndex(x => x.b.id === b.id);
  return i > 0 ? planos[i - 1].b : null;
}

function anidarBloque(b){
  const cont = contenedorBloque(b.id); if (!cont) return;
  const i = cont.indexOf(b);
  const previo = cont[i - 1];
  if (!previo || previo.k !== 'toggle') return;
  cambiarPagina(() => {
    cont.splice(i, 1);
    previo.open = true;
    previo.kids = previo.kids || [];
    previo.kids.push(b);
  });
}
function sacarBloque(b){
  const padre = padreDeBloque(b.id); if (!padre) return;   // ya está en la raíz del nivel
  const abuelo = contenedorBloque(padre.id) || nivelPagina();
  cambiarPagina(() => {
    padre.kids.splice(padre.kids.indexOf(b), 1);
    abuelo.splice(abuelo.indexOf(padre) + 1, 0, b);
  });
}

// Después de repintar, el cursor al final del bloque que corresponde.
function enfocarBloque(id){
  const el = board.querySelector(`.pgrow[data-b="${CSS.escape(id)}"] [data-txt]`);
  if (!el) return;
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el); r.collapse(false);
  const sel = document.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}

/* ---------- pegar ----------
   Acá adentro TODO archivo se queda en el renglón, no solo la imagen. En la ficha el que no
   era imagen se iba a los adjuntos de abajo porque no había forma de dibujarlo en un
   renglón; la página sí la tiene, y mandarlo abajo sería adjuntarlo donde nadie lo pidió.
   El texto entra plano, y si trae varios renglones se reparte en varios bloques: pegar una
   lista y que quede todo apelmazado en un renglón sería inservible. */
function pegarEnPagina(e){
  const t = tareaDePagina(); if (!t) return;
  const el = e.target;
  if (!el.isContentEditable) return;

  const archivos = [...(e.clipboardData?.files || [])].filter(f => f.size);
  if (archivos.length) {
    e.preventDefault();
    const filaArch = el.closest('.pgrow');
    subirArchivosEnPagina(t, archivos, filaArch ? buscarBloque(filaArch.dataset.b, nivelPagina()) : null);
    return;
  }

  e.preventDefault();
  const txt = e.clipboardData?.getData('text/plain') || '';
  const fila = el.closest('.pgrow');
  const b = fila ? buscarBloque(fila.dataset.b, nivelPagina()) : null;
  const resto = txt.split(/\r?\n/).slice(1).map(l => l.trim()).filter(Boolean);

  // La primera línea entra donde está el cursor, siempre: pegar en el medio de un renglón
  // y que el texto aparezca al final sería incomprensible. El título es de una sola línea,
  // así que ahí no se reparte nada.
  const primera = txt.split(/\r?\n/)[0];
  if (primera && !document.execCommand?.('insertText', false, primera)) {
    insertarEnCursor(document.createTextNode(primera), el);
  }
  board.oninput({ target: el, type: 'input' });
  if (!resto.length || !b) return;

  // El resto se reparte en un bloque por renglón: pegar una lista y que quede todo
  // apelmazado en un solo renglón la vuelve inservible.
  let ultimo = null;
  cambiarPagina(() => {
    let ref = b;
    resto.forEach(l => { ref = insertarDespues(ref, nuevoBloque('text', l)); ultimo = ref; });
  });
  if (ultimo) enfocarBloque(ultimo.id);
}

/* ---------- adjuntar en un renglón ----------
   La única puerta por la que un archivo entra a la página, la abra quien la abra: pegar,
   soltar del escritorio o elegir del disco desde el menú `＋`. Con tres caminos, tres copias
   de esto significan tres formas distintas de fallar a mitad de camino.

   El renglón aparece antes de que la subida termine: nombre y peso salen del archivo local,
   así que se ve QUÉ está entrando desde el primer momento, y si es una imagen se dibuja al
   instante con el archivo local. El bloque provisorio no se guarda —`explDeBloques()` lo
   filtra— porque todavía no tiene clave en el bucket y el `blob:` muere al recargar.

   La imagen nace desplegada y el resto plegado, que es lo que uno quiso en cada caso: una
   captura se pega para verla ahí, y un PDF se adjunta para tenerlo a mano. Los dos se dan
   vuelta con la flecha. */
async function subirArchivosEnPagina(t, files, ancla){
  const nuevos = files.map(f => {
    const esImg = /^image\//.test(f.type);
    return nuevoBloque('file', '', {
      cargando: true,
      blob: esImg ? URL.createObjectURL(f) : '',
      open: esImg,
      f: { n: f.name || 'captura', t: f.type || '', path: '', b: '', size: f.size },
    });
  });
  cambiarPagina(() => { let ref = ancla; nuevos.forEach(b => { ref = insertarDespues(ref, b); }); });

  for (let i = 0; i < files.length; i++) {
    const f = files[i], b = nuevos[i];
    const esImg = /^image\//.test(f.type);
    const comoSeLlama = f.name || 'el archivo';
    onEstadoGlobal('cargando');
    let archivo = null;
    try {
      // Solo las imágenes se comprimen: a un PDF o a un HTML no hay nada que achicarles sin
      // romperlos, así que ahí el límite se aplica sobre el archivo tal cual vino.
      const blob = esImg ? await comprimirImagen(f) : f;
      if (blob.size > MAX_ARCHIVO) throw new Error('pesa ' + kb(blob.size) + (esImg ? ' ya comprimida' : ''));
      archivo = await RoadmapSync.subirArchivo(t.id, blob,
        f.name || ('captura-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.webp'));
    } catch (err) {
      if (b.blob) URL.revokeObjectURL(b.blob);
      cambiarPagina(() => quitarBloque(b));
      onEstadoGlobal('ok');
      aviso('No pude adjuntar «' + comoSeLlama + '»: ' + (err.message || 'error al subir'));
      continue;
    }
    // Si te fuiste de la página mientras subía, no hay dónde guardarlo: se borra del bucket
    // en vez de quedar ocupando lugar para siempre.
    if (tareaDePagina() !== t || !buscarBloque(b.id, paginaArbol)) {
      if (b.blob) URL.revokeObjectURL(b.blob);
      RoadmapSync.borrarArchivo(archivo).catch(() => {});
      onEstadoGlobal('ok');
      aviso('Saliste de la página antes de que terminara de subir «' + comoSeLlama + '». Adjuntalo de nuevo.');
      continue;
    }
    const provisoria = b.blob;
    b.f = archivo;
    delete b.cargando; delete b.blob;
    onEstadoGlobal('ok');
    guardarPagina();

    /* La fila se retoca a mano en vez de repintar: repintar en medio de la escritura le
       tiraría el cursor a quien esté tipeando en otro bloque. Lo que cambia es poco —el peso
       de verdad (una imagen sale del compresor pesando otra cosa), el cartel de «subiendo…»
       que se va, y las claves del bucket que recién ahora existen. Puestas las claves, las
       direcciones las firma la misma función de siempre. */
    const fila = board.querySelector(`.pgrow[data-b="${CSS.escape(b.id)}"]`);
    if (fila) {
      const peso = fila.querySelector('.pgfsz');
      if (peso) peso.textContent = kb(archivo.size);
      fila.querySelectorAll('.pgfn, .pgimg img, .pgframe').forEach(n => {
        n.dataset.path = archivo.path;
        n.dataset.b = archivo.b || '';
      });
      const img = fila.querySelector('.pgimg img');
      if (img) { img.classList.remove('cargando'); img.alt = archivo.n; }
      await refrescarFirmasDeExpl(fila);
    }
    if (provisoria) URL.revokeObjectURL(provisoria);
  }
}

/* ---------- arrastrar bloques ----------
   Mueve el bloque con todo lo que tenga adentro. Lo único que hay que cuidar es no soltarlo
   adentro de sí mismo: un desplegable abierto muestra a sus hijos, así que la fila destino
   puede ser su propio descendiente y el árbol se cerraría sobre sí. */
function engancharArrastreBloques(){
  board.querySelectorAll('[data-drag]').forEach(h => {
    h.addEventListener('dragstart', ev => {
      const fila = h.closest('.pgrow');
      arrastreBloque = fila.dataset.b;
      fila.classList.add('arrastrando');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', arrastreBloque);
      ev.dataTransfer.setDragImage(fila, 24, 12);
    });
    h.addEventListener('dragend', () => {
      arrastreBloque = null;
      board.querySelectorAll('.arrastrando,.antes,.despues')
        .forEach(x => x.classList.remove('arrastrando', 'antes', 'despues'));
    });
  });

  /* Un archivo traído del escritorio entra al renglón donde se lo suelta. Sin el
     `preventDefault()` del `dragover` el navegador se abre el archivo en la pestaña y se
     lleva puesta la página con lo que se esté escribiendo. */
  const traeArchivos = e => [...(e.dataTransfer?.types || [])].includes('Files');

  board.ondragover = e => {
    if (!arrastreBloque) { if (traeArchivos(e)) e.preventDefault(); return; }
    e.preventDefault();
    board.querySelectorAll('.antes,.despues').forEach(x => x.classList.remove('antes', 'despues'));
    const fila = e.target.closest('.pgrow');
    if (!fila || fila.dataset.b === arrastreBloque) return;
    const r = fila.getBoundingClientRect();
    fila.classList.add(e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
  };

  board.ondrop = e => {
    if (!arrastreBloque) {
      const t = tareaDePagina();
      const sueltos = [...(e.dataTransfer?.files || [])].filter(f => f.size);
      if (!t || !sueltos.length) return;
      e.preventDefault();
      const fila = e.target.closest('.pgrow');
      return subirArchivosEnPagina(t, sueltos, fila ? buscarBloque(fila.dataset.b, nivelPagina()) : null);
    }
    e.preventDefault();
    const b = buscarBloque(arrastreBloque, nivelPagina());
    const fila = e.target.closest('.pgrow');
    arrastreBloque = null;
    if (!b || !fila || fila.dataset.b === b.id) return;
    const destino = buscarBloque(fila.dataset.b, nivelPagina());
    if (!destino || esDescendiente(b, destino.id)) return;
    const r = fila.getBoundingClientRect();
    const encima = e.clientY < r.top + r.height / 2;
    cambiarPagina(() => {
      quitarBloque(b);
      const cont = contenedorBloque(destino.id) || nivelPagina();
      cont.splice(cont.indexOf(destino) + (encima ? 0 : 1), 0, b);
    });
  };
}

/* ============================================================
   Barra superior, atajos y cierre de modales
   ============================================================ */
function cerrarModales(){
  // Antes de cerrar: si quedó algo escrito en la conversación, se guarda. Cerrar con
  // Escape no dispara el `blur` del campo, y perder lo tipeado sería imperdonable.
  if (tareaAbierta) guardarLoEscrito();
  $$('.scrim').forEach(s => s.classList.remove('on'));
  tareaAbierta = null;
  if (refrescoPendiente) { refrescoPendiente = false; refrescar(); }
}
// El lightbox se abre encima de la ficha: cerrarlo no puede llevarse puesto el modal que
// está abajo, así que se atiende antes y solo. Se mira que el clic haya caído adentro del
// visor porque el clic que lo abre (sobre la imagen chica) también llega hasta acá.
// La ficha, en cambio, NO se cierra tocando el fondo: un clic que se escapa del modal no
// puede bajártelo. Se sale con «Listo» o con Escape. El visor sí cierra con clic en
// cualquier lado — es un visor, no un formulario.
document.addEventListener('click', e => {
  if (e.target.closest('#lightbox')) { $('#lightbox').classList.remove('on'); return; }
  if (e.target.matches('[data-close]')) cerrarModales();
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  if (e.key === 'Escape') {
    if ($('#lightbox').classList.contains('on')) { $('#lightbox').classList.remove('on'); return; }
    // El cajón del teléfono es lo de más arriba de todo: se cierra primero y no se lleva por
    // delante la ficha ni la página que puedan estar abiertas debajo.
    if (document.body.classList.contains('menu-abierto')) { cerrarCajon(); return; }
    // Después, los menús de filtro, por lo mismo.
    if (selmultiAbierto('#fPrioridad')) { abrirSelmulti('#fPrioridad', false); return; }
    if (selmultiAbierto('#fPend')) { abrirSelmulti('#fPend', false); return; }
    // Con la ficha abierta encima de la página, Escape cierra la ficha y te deja en la
    // página. Recién el siguiente sale de un nivel.
    if (!tareaAbierta && paginaTarea) { salirDePagina(); return; }
    cerrarModales(); return;
  }
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    e.preventDefault(); $('#q').focus();
  }
});

$('#q').addEventListener('input', e => { UI.f.q = e.target.value.trim().toLowerCase(); render(); });

/* El menú de prioridades se atiende por delegación desde el contenedor, que es lo único que
   no se repinta: el contenido de adentro se rehace en cada render y un listener por opción
   se colgaría de un botón que ya no existe. Elegir NO cierra el menú —marcar tres es un
   solo gesto—; lo cierra un clic afuera. */
$('#fPrioridad').addEventListener('click', e => {
  if (e.target.closest('.sel')) { abrirSelmulti('#fPrioridad'); return; }
  const op = e.target.closest('[data-prio]');
  if (!op) return;
  const k = op.dataset.prio, i = UI.f.prioridades.indexOf(k);
  i > -1 ? UI.f.prioridades.splice(i, 1) : UI.f.prioridades.push(k);
  render();
});
// El de personas del teléfono, con exactamente la misma mecánica: delegado desde el
// contenedor, que es lo único que no se repinta, y sin cerrarse al elegir.
$('#fPend').addEventListener('click', e => {
  if (e.target.closest('.sel')) { abrirSelmulti('#fPend'); return; }
  const op = e.target.closest('[data-fpend]');
  if (!op) return;
  const k = op.dataset.fpend, i = UI.f.pend.indexOf(k);
  i > -1 ? UI.f.pend.splice(i, 1) : UI.f.pend.push(k);
  render();
});
// En captura y no al burbujear: elegir una opción repinta el menú, así que si esto corriera
// después el botón que se tocó ya estaría fuera del documento, `closest` no encontraría el
// contenedor y el menú se cerraría solo en cada tilde.
document.addEventListener('click', e => {
  if (!e.target.closest('#fPrioridad')) abrirSelmulti('#fPrioridad', false);
  if (!e.target.closest('#fPend')) abrirSelmulti('#fPend', false);
}, true);
/* Acá vivía el enganche del segmentado de layout, que además cerraba el menú `⋯` de paso: la
   fila que lo tenía abierto podía no existir en el dibujo siguiente. Con un solo layout no hay
   de dónde a dónde cambiar, así que se fue con el segmentado. Cambiar de VISTA sigue
   cerrándolo, arriba, por el mismo motivo. */
/* «+ Nueva tarea» del encabezado y el `＋` flotante del teléfono son el mismo camino, así que
   es una sola función y no dos copias. Lo único que cambia entre las dos puertas es el
   anclaje: el menú de responsables se cuelga del botón que se tocó, y en el teléfono el del
   encabezado ni siquiera está en pantalla. */
function nuevaDesdeBarra(ancla, e){
  cerrarPagina();
  const v = vistaActual();
  // Primero quién la hace y recién después la fila: el cambio de vista también espera, para
  // que cerrar el menú sin elegir no deje al usuario en otra pantalla y sin tarea.
  pedirResponsable(ancla, e, quien => {
    // En el backlog la tarea nace ahí mismo, en el primer sprint y lista para escribirle el
    // título: abrir el detalle para una línea que todavía no dice nada sería un estorbo.
    if (v.backlog) return nuevaEnBacklog(sprintsVisibles()[0], null, quien);
    // Desde la Caja no hay tablero donde mostrarla: se vuelve a una vista de tareas para
    // que la tarea recién creada quede a la vista al volver de su página.
    if (sinTareas(v)) { UI.vista = 'estado'; guardarUI(); render(); }
    /* Nace en el primer estado del catálogo —«Nueva»—, que es donde caía igual cuando esto
       llamaba a `nuevaTarea()` sin columna: `tareaVacia()` arranca ahí. La diferencia es que
       ahora pasa por el mismo creador que el `＋` de la lista, así que el `orden` se calcula
       contra su banda y la tarea nace con el cursor en su título, en la fila, en vez de abrir
       la ficha. */
    nuevaEnEstado(ESTADOS[0].id, null, quien);
  });
}
$('#bNueva').onclick = e => nuevaDesdeBarra($('#bNueva'), e);

/* ---------- lo propio del teléfono ----------
   Tres controles que en el escritorio no existen porque ahí hay lugar: el `＋` flotante, el
   buscador que se despliega y el cajón con lo que vive en la barra lateral. Los tres están
   siempre en el HTML y los esconde el CSS, así que acá no se pregunta por el ancho de
   pantalla en ningún lado — un manejador colgado de un botón escondido no molesta a nadie. */

/* El `＋` flotante. En el tablero y en el backlog hace exactamente lo mismo que «+ Nueva
   tarea», con la misma función: es la misma puerta, movida a donde llega el pulgar.

   **En la caja carga un movimiento y no una tarea**, que es lo único en lo que se separa del
   botón del encabezado. El «＋ Nuevo movimiento» de esa pantalla está al final de la lista, y
   en un teléfono eso es scrollear treinta renglones para anotar un gasto; el del encabezado,
   en cambio, manda al tablero a crear una tarea, que no es lo que se vino a hacer acá. */
$('#bFab').onclick = e => {
  if (vistaActual().caja) return nuevoMovimiento();
  nuevaDesdeBarra($('#bFab'), e);
};

/* El buscador se despliega. En 390px de ancho un campo de texto y dos filtros no entran en el
   mismo renglón, y de las tres cosas la búsqueda es la que se usa de a ratos: las otras dos
   quedan a la vista y esta aparece cuando se la pide.

   **Cerrarlo vacía lo buscado.** Un filtro puesto detrás de un campo escondido es la forma más
   rápida de que el tablero parezca vacío sin que se vea por qué — y acá el campo se esconde de
   verdad, no se achica como en el escritorio.

   `cerrarBuscador()` no repinta: lo llama también `pintarChrome()`, en medio de un `render()`
   que todavía no dibujó el tablero, y desde ahí un repintado sería una vuelta infinita.
   Devuelve si había algo puesto, para que quien lo llame de afuera decida. */
function cerrarBuscador(){
  document.body.classList.remove('buscando');
  $('#bBuscar').setAttribute('aria-expanded', 'false');
  const habia = !!UI.f.q;
  $('#q').value = '';
  UI.f.q = '';
  return habia;
}
$('#bBuscar').onclick = () => {
  if (document.body.classList.contains('buscando')) {
    if (cerrarBuscador()) render();
    return;
  }
  document.body.classList.add('buscando');
  $('#bBuscar').setAttribute('aria-expanded', 'true');
  $('#q').focus();
};

/* El cajón: la barra lateral de siempre, que en el teléfono no puede vivir plegada en una
   canaleta —no hay hover, y 44px de ancho son un octavo de la pantalla—. Se abre desde el
   avatar del encabezado y adentro queda lo que no son vistas: quién sos, el aviso de esquema,
   exportar y cerrar sesión. Las vistas están en la barra de abajo, así que ahí adentro no se
   dibujan: dos lugares para lo mismo son dos lugares que hay que aprenderse. */
function cerrarCajon(){
  document.body.classList.remove('menu-abierto');
  $('#sideScrim').hidden = true;
  $('#bYo').setAttribute('aria-expanded', 'false');
}
$('#bYo').onclick = () => {
  const abrir = !document.body.classList.contains('menu-abierto');
  document.body.classList.toggle('menu-abierto', abrir);
  $('#sideScrim').hidden = !abrir;
  $('#bYo').setAttribute('aria-expanded', String(abrir));
};
$('#sideScrim').onclick = cerrarCajon;
// Lo que se hace desde el cajón se hace una vez y cierra: dejarlo abierto encima del tablero
// después de exportar obliga a un toque más para volver a lo que se estaba mirando.
$('#side').addEventListener('click', e => { if (e.target.closest('.side-act')) cerrarCajon(); });

$('#bCsv').onclick = () => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['ID','Titulo','Estado','Prioridad','Pendiente de','Grupo','Donde','Notas','Subtareas','Conversacion','Archivos'];
  const filas = datos.tareas.map(t => [
    t.id, t.tarea,
    estadoDe(t.estado).label, prioridadDe(t.prioridad).label,
    (t.pend || []).map(nombrePersona).join(' | '),
    // El nombre del grupo y no el número: en una planilla, «Onboarding» dice algo y «3» no.
    sprintDe(t) ? nombreSprint(sprintDe(t)) : '', t.backlog ? 'backlog' : 'tablero',
    explATexto(t.expl),
    (t.subtareas || []).map(s => (s.estado === HECHO ? '[x] ' : '[ ] ') + s.titulo + (s.resp ? ' (' + nombrePersona(s.resp) + ')' : '')).join('  ||  '),
    (t.chat || []).map(m => nombrePersona(m.autor) + ': ' + m.texto).join('  ||  '),
    (t.files || []).map(f => f.n).join(' | '),
  ].map(q).join(';'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + [cab.map(q).join(';'), ...filas].join('\r\n')], { type:'text/csv;charset=utf-8' }));
  a.download = 'tablero-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  aviso('CSV guardado. Se abre en Excel con doble clic.');
};

/* ============================================================
   Sesión
   ============================================================ */
const loginOverlay = $('#loginOverlay');
const sinAccesoOverlay = $('#sinAccesoOverlay');

async function resolverIdentidad(){
  let email = null;
  try { email = await RoadmapSync.emailActual(); } catch (e) {}
  let esMiembro = false;
  try { esMiembro = email ? await RoadmapSync.esMiembro() : false; } catch (e) {}
  const p = email ? PERSONAS.find(x => x.email && x.email === email.toLowerCase()) : null;
  YO = p
    ? { id:p.id, nombre:p.nombre, esMiembro }
    : { id:'', nombre:email ? email.split('@')[0] : '', esMiembro };
}

async function arrancar(){
  try { datos = await RoadmapSync.cargarEstado(); }
  catch (e) {
    aviso('No se pudo conectar con la base: ' + e.message);
    datos = { tareas:[], caja:[], grupos:[], nota:'' };
  }
  normalizarDatos();
  // Dónde estás parado sale del historial y no de cero: recargar adentro de una tarea tiene
  // que dejarte adentro de esa tarea. Va antes del `render()`, que es quien pinta lo que salga.
  restaurarUbicacion();
  render();
  revisarEsquema();
  if (!YO.id) {
    aviso('Tu cuenta todavía no está asociada a una persona del tablero. Avisale a Antonio.');
  }
}

// Si falta correr alguno de los archivos de `supabase/`, el tablero se ve pero no puede
// guardar lo que ese archivo trae. Mejor decirlo en pantalla que dejar que falle en
// silencio al guardar. Va en el ícono del encabezado: el detalle se lee al pasar el
// cursor por encima.
async function revisarEsquema(){
  let faltan = [];
  try { faltan = await RoadmapSync.faltantesDeEsquema(); } catch (e) { return; }
  if (!faltan.length) { elAviso.hidden = true; return; }
  elAviso.hidden = false;
  elAvisoTexto.innerHTML = `<b>Falta un paso en la base de datos.</b> Todavía no se puede guardar: ${esc(faltan.join(', '))}. `
    + `Hay que correr los archivos de <b>supabase/</b> que falten, en orden, en el SQL Editor de Supabase (lo hace Antonio).`;
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').hidden = true;
  const btn = $('#loginForm button[type=submit]');
  const marcar = onEstadoBoton(btn, 'Entrando...');
  marcar('cargando');
  try { await RoadmapSync.iniciarSesion($('#loginEmail').value.trim(), $('#loginPassword').value); marcar('ok'); }
  catch (err) {
    marcar('error');
    $('#loginError').textContent = 'Email o contraseña incorrectos.';
    $('#loginError').hidden = false;
  }
});
const salir = async btn => {
  const marcar = onEstadoBoton(btn, 'Saliendo...');
  marcar('cargando');
  try { await RoadmapSync.cerrarSesion(); marcar('ok'); }
  catch (e) { marcar('error'); aviso('No se pudo cerrar sesión: ' + e.message); }
};
$('#bCerrarSesion').onclick = () => salir($('#bCerrarSesion'));
$('#bSinAccesoSalir').onclick = () => salir($('#bSinAccesoSalir'));

async function entrar(){
  await resolverIdentidad();
  if (!YO.esMiembro) { sinAccesoOverlay.hidden = false; return; }
  sinAccesoOverlay.hidden = true;
  await arrancar();
}

(async function iniciar(){
  let activa = false;
  try { activa = await RoadmapSync.sesionActiva(); }
  catch (e) { aviso('No se pudo verificar la sesión: ' + e.message); }

  if (activa) { loginOverlay.hidden = true; await entrar(); }
  else { pintarChrome(); loginOverlay.hidden = false; }

  RoadmapSync.onCambioSesion(async sesionOk => {
    if (sesionOk) { loginOverlay.hidden = true; await entrar(); }
    else {
      datos = { tareas:[], caja:[], grupos:[], nota:'' };
      YO = { id:'', nombre:'', esMiembro:false };
      cerrarModales();
      sinAccesoOverlay.hidden = true;
      board.innerHTML = '';
      pintarChrome();
      loginOverlay.hidden = false;
    }
  });

  RoadmapSync.suscribir(refrescar);
})();
