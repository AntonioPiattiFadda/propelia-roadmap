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
const TIPOS = [
  { id:'nuevo',      label:'Desarrollo nuevo',          color:'#5E8467' },
  { id:'modif',      label:'Modificación de lo hecho',  color:'#5F7A9B' },
  { id:'correccion', label:'Corrección de errores',     color:'#A0565F' },
  { id:'uxui',       label:'UX / UI',                   color:'#8A6E9C' },
];
// El tablero agrupa siempre por estado: las columnas son los estados y, dentro de cada
// una, las tareas se apilan por prioridad. Las otras formas de mirar el tablero
// (prioridad, tipo) quedaron como filtros de la barra, no como vistas.
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

/* Las tres formas de mirar el tablero. `cols` y `rows` son la misma tarjeta acomodada de dos
   maneras; `lista` es OTRO componente: la lista de renglones del Backlog, con las mismas
   clases `pg`, pero agrupada por estado en vez de por sprint.
   Es una preferencia de layout y no una vista: se sigue mirando el tablero —las mismas
   tareas, los mismos filtros, el mismo contador—, cambia cómo se dibuja. Por eso vive en el
   segmentado de la barra junto a las otras dos y no en `VISTAS`. */
const LAYOUTS = ['cols', 'rows', 'lista'];

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
let datos = { tareas: [], caja: [], grupos: [] };
let UI = {
  vista: 'estado',
  layout: 'cols',
  // La columna de Terminadas arranca plegada: es lo que ya no hay que mirar.
  terminadasAbiertas: false,
  // Cuántos casilleros de sprint mostrar en el backlog. 0 = lo que diga la config.
  sprints: 0,
  // `prioridades` es una lista, como `pend`: los dos filtros admiten varias opciones a la
  // vez. Nada de esto se guarda en localStorage — un filtro puesto es de este rato, no una
  // preferencia.
  f: { q:'', pend:[], prioridades:[], tipo:'' },
};
try {
  const guardado = JSON.parse(localStorage.getItem('tablero-ui') || '{}');
  if (guardado.vista && VISTAS.some(v => v.id === guardado.vista)) UI.vista = guardado.vista;
  // Contra `LAYOUTS` y no contra dos ids sueltos: agregar un layout no puede obligar a
  // acordarse de tocar también esta línea.
  if (LAYOUTS.includes(guardado.layout)) UI.layout = guardado.layout;
  UI.terminadasAbiertas = !!guardado.terminadasAbiertas;
  UI.sprints = Number(guardado.sprints) || 0;
} catch (e) { /* preferencia local, si no se puede leer no importa */ }
function guardarUI(){
  try {
    localStorage.setItem('tablero-ui', JSON.stringify({
      vista: UI.vista, layout: UI.layout, terminadasAbiertas: UI.terminadasAbiertas,
      sprints: UI.sprints,
    }));
  } catch (e) { /* modo privado o storage lleno: no es crítico */ }
}

let tareaAbierta = null;
let arrastreId = null;

/* ---------- elementos ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const board       = $('#board');
const elFiltros   = $('#filtros');
const elVistas    = $('#views');
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

/* El chip se refresca solo: un tablero abierto toda la tarde no puede seguir diciendo
   «hace 2 h». Se reescribe el texto de cada `[data-edad]` y nada más — repintar el tablero
   entero cada minuto costaría carísimo y encima cortaría lo que alguien esté escribiendo. */
setInterval(() => {
  $$('[data-edad]').forEach(el => {
    const a = antiguedad(el.dataset.edad);
    if (a) el.textContent = (el.dataset.edadPre || '') + a.txt;
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
const tipoDe      = id => porId(TIPOS, id) || TIPOS[0];
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
  // Cambiar de pestaña sale de la página: si no, se elegiría una vista que no se ve.
  $$('[data-vista]').forEach(b => b.onclick = () => {
    cerrarPagina();
    if (UI.vista !== b.dataset.vista) { menuFila = null; renombrando = null; }
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

  $$('[data-layout]').forEach(b => b.classList.toggle('on', b.dataset.layout === UI.layout));
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

function abrirMenuPrioridad(ver){
  const cont = $('#fPrioridad');
  const menu = cont.querySelector('.selmenu'), boton = cont.querySelector('.sel');
  const mostrar = ver == null ? menu.hidden : ver;
  menu.hidden = !mostrar;
  boton.setAttribute('aria-expanded', String(mostrar));
}

function sincronizarFiltros(){
  const sel = (el, items, ph, val) => { llenarSelect(el, items, ph); el.value = val; };
  // El texto del placeholder hace de etiqueta: así los filtros no necesitan un rótulo
  // aparte arriba y toda la barra entra en una sola línea.
  sel($('#fTipo'), TIPOS, 'Tipo', UI.f.tipo);
  // Solo los <select> de verdad: el de prioridad es un botón y se marca en su propia
  // función, donde `.value` no significa nada.
  $$('#filtros select.sel').forEach(s => s.classList.toggle('activo', !!s.value));
  pintarFiltroPrioridad();
}

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
  if (f.tipo && t.tipo !== f.tipo) return false;
  if (f.pend.length && !f.pend.some(p => (t.pend || []).includes(p))) return false;
  if (f.q && !textoBuscable(t).includes(f.q)) return false;
  return true;
}
const filtrando = () => {
  const f = UI.f;
  return !!f.q || f.pend.length > 0 || f.prioridades.length > 0 || !!f.tipo;
};

/* ============================================================
   Render principal
   ============================================================ */
function render(){
  pintarChrome();
  sincronizarFiltros();
  const v = vistaActual();

  /* Una tarea abierta como página se come el board entero, venga del backlog o del tablero:
     es una pantalla, no un modal. Va antes que todo lo demás porque no depende de la vista.

     El árbol se rearma con lo último que llegó de la base salvo que haya un guardado en
     vuelo: así un cambio de otro se ve al toque, y lo que estás escribiendo no se pisa con
     una versión vieja del servidor. */
  if (paginaTarea && !tarea(paginaTarea)) cerrarPagina();
  if (paginaTarea) {
    const t = tarea(paginaTarea);
    if (!pendientesGuardado.has('tarea:' + t.id + ':expl')) {
      paginaArbol = arbolDeTarea(t);
    }
    elFiltros.hidden = true;
    board.classList.remove('cmode', 'bmode', 'rows');
    board.classList.add('pgmode');
    board.onclick = board.oninput = board.onchange = board.onkeydown = board.onfocusout = null;
    board.onpaste = board.ondragover = board.ondrop = null;
    return renderPagina();
  }
  board.classList.remove('pgmode');

  /* El tablero en modo lista NO es una vista aparte: es el mismo tablero dibujado con el
     componente del backlog. Por eso se calcula acá, cruzando la vista con el layout, y no se
     pregunta por `UI.layout` en diez lugares del archivo. El layout solo manda donde hay
     tarjetas que acomodar: la caja y el backlog ya se comen el board enteros. */
  const enLista = !anchoCompleto(v) && UI.layout === 'lista';

  // La caja y el backlog ocupan el board entero en vez de repartirlo en columnas. Los
  // filtros solo se esconden en la caja — en el backlog buscar y filtrar sirve igual que en
  // el tablero.
  elFiltros.hidden = sinTareas(v);
  board.classList.toggle('cmode', !!v.caja);
  // `bmode` es el envoltorio de la lista de renglones, no «la vista Backlog»: lo lleva
  // cualquiera que dibuje esa hoja, venga del backlog o del tablero.
  board.classList.toggle('bmode', !!v.backlog || enLista);
  board.classList.toggle('rows', !anchoCompleto(v) && UI.layout === 'rows');
  // Las hojas de renglones —backlog, caja y el tablero en modo lista— enganchan sus
  // manejadores sobre el board entero. Al salir de ellas hay que soltarlos: si no, siguen
  // escuchando encima del tablero de tarjetas. `cerrarMenu()` va acá adentro y no suelto
  // porque todas abren menús desde su propio repintado, y cerrarlo en el mismo paso lo
  // apagaría en el clic que lo abre.
  if (!v.backlog && !v.caja && !enLista) {
    board.onclick = board.oninput = board.onchange = board.onkeydown = board.onfocusout = null;
    board.onpaste = board.ondragover = board.ondrop = null;
    cerrarMenu();
  }

  if (v.caja) return renderCaja();
  if (v.backlog) return renderBacklog();
  if (enLista) return renderListaEstados();
  renderTablero(v);
}

/* Una columna por estado y, adentro, una banda por prioridad. Cada banda es su propia
   zona de destino: soltar una tarjeta en la banda «Urgente» de otra columna le cambia
   las dos cosas de una, el estado y la prioridad. Las bandas vacías no se dibujan salvo
   mientras hay un arrastre en curso, para no gastar alto con cuatro títulos por columna. */
function renderTablero(v){
  const mostradas = datos.tareas.filter(visible);

  if (!mostradas.length && filtrando()) {
    board.innerHTML = `<p class="empty-board">Ninguna tarea encaja con este filtro.<br>Probá vaciar la búsqueda o destildar los filtros.</p>`;
    return;
  }

  board.innerHTML = ESTADOS.map(c => {
    const lista = mostradas.filter(t => t.estado === c.id);

    // Terminadas va plegada a una solapa angosta. Se comía un cuarto del ancho para
    // mostrar justo lo que ya no hay que mirar; ese ancho ahora es de las otras tres.
    // No desaparece: sigue siendo zona donde soltar para dar algo por terminado, y un
    // clic la abre entera.
    if (c.id === HECHO && !UI.terminadasAbiertas) {
      const n = lista.length;
      return `<section class="col plegada" data-col="${escA(c.id)}">
        <div class="plegada-in" data-drop="${escA(c.id)}" data-abrir-term role="button" tabindex="0"
             title="${n} terminada${n === 1 ? '' : 's'} · clic para verlas, o soltá una tarea acá para darla por terminada">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 6.5"/></svg>
          <span class="plegada-n">${n}</span>
          <span class="plegada-txt">Terminadas</span>
        </div>
      </section>`;
    }

    // La barrita ya no puede medir «cuánto de esta columna está hecho» —la columna ES un
    // estado—, así que mide cuánto del tablero está parado acá. De un vistazo se ve si
    // se está amontonando todo en Bloqueadas.
    const pct = mostradas.length ? Math.round(lista.length / mostradas.length * 100) : 0;

    const bandas = PRIORIDADES.map(p => {
      const suyas = lista.filter(t => prioridadDe(t.prioridad).id === p.id);
      return `<div class="grupo${suyas.length ? '' : ' vacio'}">
        <div class="grupo-h"><i style="background:${p.color}"></i>${esc(p.label)}<span>${suyas.length}</span></div>
        <div class="cards" data-drop="${escA(c.id)}" data-prio="${escA(p.id)}">${suyas.map(tarjetaHTML).join('')}</div>
      </div>`;
    }).join('');

    return `<section class="col" data-col="${escA(c.id)}">
      <div class="col-h">
        <span class="dot" style="background:${c.color}"></span>
        <h2>${esc(c.label)}</h2>
        <span class="count">${lista.length}</span>
        ${c.id === HECHO ? `<button class="plegar" data-plegar-term title="Plegar terminadas" aria-label="Plegar la columna de terminadas">«</button>` : ''}
      </div>
      <div class="rail" title="${pct}% de las tareas visibles está en esta columna"><i style="width:${pct}%;background:${c.color}"></i></div>
      <div class="grupos">${lista.length ? '' : '<p class="empty-col">Arrastrá una tarea acá</p>'}${bandas}</div>
      <div class="col-f"><button class="add-card" data-add="${escA(c.id)}">+ Agregar tarea</button></div>
    </section>`;
  }).join('');

  conectarTablero(v);
}

function tarjetaHTML(t){
  const p = prioridadDe(t.prioridad), ty = tipoDe(t.tipo);

  const etiqueta = (c, txt, fuerte) =>
    `<span class="tag${fuerte ? ' fuerte' : ''}" style="background:${tint(c,.13)};color:${c}">${esc(txt)}</span>`;

  const tags = [etiqueta(p.color, p.label, p.id === CRITICA || p.id === 'urgente'), etiqueta(ty.color, ty.label)];

  const bits = [];
  const pasos = t.subtareas || [], hechos = pasos.filter(s => s.estado === HECHO).length;
  if (pasos.length) bits.push(`<span class="meta" title="Checklist: ${hechos} de ${pasos.length} ${pasos.length === 1 ? 'paso hecho' : 'pasos hechos'}"><span class="subbar"><i style="width:${Math.round(hechos / pasos.length * 100)}%"></i></span>${hechos}/${pasos.length}</span>`);
  if ((t.chat || []).length) bits.push(`<span class="meta" title="Intervenciones en la conversación"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a8 8 0 0 1-11.5 7.2L3.5 20.5l1.3-6A8 8 0 1 1 21 12z"/></svg>${t.chat.length}</span>`);
  if ((t.files || []).length) bits.push(`<span class="meta" title="Adjuntos"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 11l-8.5 8.5a4.5 4.5 0 1 1-6.4-6.4L13 4.8a3 3 0 1 1 4.2 4.2l-8 8a1.5 1.5 0 0 1-2.1-2.1L14.5 7"/></svg>${t.files.length}</span>`);
  // Va último de los `bits` para que quede pegado al borde de los avatares: es el dato que
  // menos se toca de los cuatro, y adelante empujaría al checklist fuera de la vista.
  const edad = antiguedad(t.creada);
  if (edad) bits.push(`<span class="meta" title="Creada el ${escA(edad.exacta)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3.4 2"/></svg><i class="edad" data-edad="${escA(t.creada)}">${esc(edad.txt)}</i></span>`);

  const who = PERSONAS.map(p2 => {
    const on = (t.pend || []).includes(p2.id);
    return `<button class="av${on ? '' : ' off'}"${on ? ` style="background:${p2.color}"` : ''} data-toggle="${escA(t.id)}|${escA(p2.id)}" title="${on ? 'Pendiente de ' : 'Marcar pendiente de '}${escA(p2.nombre)}">${esc(p2.ini)}</button>`;
  }).join('');

  // El agarre no agrega comportamiento: la tarjeta entera ya es arrastrable. Lo que hace
  // es dar un lugar donde el arrastre SIEMPRE arranca —sobre los botones del pie el
  // navegador no lo inicia— y, sobre todo, mostrar que la tarjeta se puede mover.
  return `<article class="card${t.estado === HECHO ? ' done' : ''}${p.id === CRITICA ? ' critica' : ''}" draggable="true" data-id="${escA(t.id)}" style="--spine:${tint(p.color,.55)}">
    <span class="grip" aria-hidden="true" title="Arrastrá desde acá para mover la tarea de columna"></span>
    <p class="title">${chapaNovedad(t)}${t.tarea ? esc(t.tarea) : '<em>Sin título</em>'}</p>
    <div class="tags">${tags.join('')}</div>
    <div class="card-f">${bits.join('')}<span class="who">${who}</span></div>
  </article>`;
}

/* Arrastrar entre columnas: si la columna destino quedó fuera de pantalla, el tablero se
   corre solo mientras la tarjeta se sostiene cerca del borde. Sin esto hay que soltarla,
   scrollear y volver a agarrarla. El puntero se lee del `dragover` (durante un arrastre
   no hay eventos de mouse) y el desplazamiento corre por rAF, no por evento: así sigue
   andando aunque la mano se quede quieta contra el borde. */
const punteroArrastre = { x:0, y:0 };
let bucleScroll = 0;
document.addEventListener('dragover', e => { punteroArrastre.x = e.clientX; punteroArrastre.y = e.clientY; });

const empuje = (dist, margen) => dist < margen ? Math.min(22, (margen - dist) / 3.2) : 0;

function scrollDeArrastre(){
  if (!arrastreId) { bucleScroll = 0; return; }
  const { x, y } = punteroArrastre;
  const b = board.getBoundingClientRect(), m = 110;

  if (board.classList.contains('rows')) board.scrollTop  += empuje(b.bottom - y, m) - empuje(y - b.top, m);
  else                                  board.scrollLeft += empuje(b.right - x, m) - empuje(x - b.left, m);

  const zona = document.elementFromPoint(x, y)?.closest('.grupos,.cards');
  if (zona) {
    const r = zona.getBoundingClientRect(), mv = 56;
    zona.scrollTop += empuje(r.bottom - y, mv) - empuje(y - r.top, mv);
  }
  bucleScroll = requestAnimationFrame(scrollDeArrastre);
}

function conectarTablero(v){
  $$('.card').forEach(el => {
    el.addEventListener('dragstart', e => {
      arrastreId = el.dataset.id;
      el.classList.add('dragging');
      // Con el arrastre en curso se muestran también las bandas de prioridad vacías:
      // son el destino de «esto pasa a ser urgente» y si no se ven no se puede soltar ahí.
      document.body.classList.add('arrastrando');
      if (!bucleScroll) bucleScroll = requestAnimationFrame(scrollDeArrastre);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', arrastreId);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging'); arrastreId = null;
      document.body.classList.remove('arrastrando');
      $$('.col').forEach(c => c.classList.remove('drop'));
      $$('.grupo').forEach(g => g.classList.remove('drop'));
    });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-toggle]')) return;
      abrirTarea(el.dataset.id);
    });
  });

  $$('[data-toggle]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const [id, quien] = b.dataset.toggle.split('|');
    const t = tarea(id); if (!t) return;
    const antes = alternarPend(t, quien);
    if (!antes) return;
    render();
    persistirTarea(t, { revertir: () => { t.pend = antes; render(); } });
  });

  $$('[data-add]').forEach(b => b.onclick = e =>
    pedirResponsable(b, e, quien => nuevaTarea(v, b.dataset.add, quien)));

  // Abrir / plegar la columna de Terminadas.
  $$('[data-abrir-term]').forEach(el => {
    const abrir = () => { UI.terminadasAbiertas = true; guardarUI(); render(); };
    el.onclick = abrir;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
  });
  $$('[data-plegar-term]').forEach(el => el.onclick = () => {
    UI.terminadasAbiertas = false; guardarUI(); render();
  });

  $$('[data-drop]').forEach(zona => {
    // `?.` en los dos closest: la solapa plegada de Terminadas no tiene banda de
    // prioridad adentro, así que ahí `.grupo` no existe.
    zona.addEventListener('dragover', e => {
      if (!arrastreId) return;
      e.preventDefault();
      zona.closest('.col')?.classList.add('drop');
      zona.closest('.grupo')?.classList.add('drop');
      // La solapa plegada no muestra tarjetas: se ilumina como destino y nada más.
      if (zona.hasAttribute('data-abrir-term')) return;
      const el = document.querySelector('.card.dragging'); if (!el) return;
      const despues = tarjetaDespuesDe(zona, e.clientY);
      despues ? zona.insertBefore(el, despues) : zona.appendChild(el);
      zona.closest('.col').querySelector('.empty-col')?.remove();
    });
    zona.addEventListener('dragleave', e => {
      if (zona.contains(e.relatedTarget)) return;
      zona.closest('.col')?.classList.remove('drop');
      zona.closest('.grupo')?.classList.remove('drop');
    });
    zona.addEventListener('drop', e => {
      e.preventDefault();
      const id = arrastreId || e.dataTransfer.getData('text/plain');
      const t = tarea(id); if (!t) return;
      soltarTarea(t, zona);
    });
  });
}

function tarjetaDespuesDe(zona, y){
  return [...zona.querySelectorAll('.card:not(.dragging)')].reduce((mejor, hijo) => {
    const b = hijo.getBoundingClientRect();
    const off = y - b.top - b.height / 2;
    return (off < 0 && off > mejor.off) ? { off, el: hijo } : mejor;
  }, { off: -Infinity, el: null }).el;
}

// Al soltar, la tarjeta ya está en su lugar dentro del DOM: se leen sus vecinas para
// calcular el `orden` nuevo. La zona de destino dice las dos cosas que cambian: la
// columna es el estado y la banda dentro de la columna es la prioridad.
function soltarTarea(t, zona){
  const antes = { orden:t.orden, estado:t.estado, prioridad:t.prioridad };
  const ids = [...zona.querySelectorAll('.card')].map(c => c.dataset.id);
  const pos = ids.indexOf(t.id);
  const vecino = i => { const x = ids[i] ? tarea(ids[i]) : null; return x && x.id !== t.id ? x.orden : null; };

  t.estado = zona.dataset.drop;
  if (zona.dataset.prio) t.prioridad = zona.dataset.prio;

  if (pos < 0) {
    // Soltada en la solapa plegada de Terminadas: ahí no hay tarjetas de dónde deducir
    // el lugar, así que va al final de las que ya están terminadas. La prioridad no se
    // toca: una tarea terminada conserva la que tenía.
    const yaHechas = datos.tareas.filter(x => x.estado === t.estado && x.id !== t.id);
    t.orden = RoadmapSync.calcularOrden(yaHechas.length ? yaHechas[yaHechas.length - 1].orden : null, null);
  } else {
    t.orden = RoadmapSync.calcularOrden(vecino(pos - 1), vecino(pos + 1));
  }

  datos.tareas.sort((a, b) => a.orden - b.orden);
  render();
  persistirTarea(t, {
    revertir: () => {
      Object.assign(t, antes);
      datos.tareas.sort((a, b) => a.orden - b.orden);
      render();
    },
  });
}

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
  /* La que acabás de crear no es novedad para vos: la chapa roja es para el resto. Va acá, que
     es la única puerta por la que nace una tarea, y no en cada uno de los tres creadores —con
     tres copias, olvidarse en una alcanza para que la regla no valga. */
  marcarVista(id);
  return {
    id, modulo:'', tarea:'', expl:TEXTO_LOOM, estado:'Pendiente', img:'', com:'', fecha:'',
    files:[], chat:[], subtareas:[], prioridad:'semanal', tipo:'nuevo',
    // `hoy` es la columna muerta del sistema de marcar tareas para el día, reusada como «esta
    // actividad todavía es nueva en el tablero» (ver la novedad de una actividad). Nace en
    // `true`: toda tarea es nueva hasta que alguien entra a mirarla.
    hoy:true, pend:[], creada:new Date().toISOString(), orden:0,
    backlog:false, sprint:SIN_SPRINT, dep:'', loom:'',
  };
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

function nuevaTarea(v, colId, quien){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const ultimo = datos.tareas.length ? datos.tareas[datos.tareas.length - 1].orden : null;
  const t = Object.assign(tareaVacia(id), {
    pend: [quien],
    orden: RoadmapSync.calcularOrden(ultimo, null),
  });
  if (colId) t.estado = colId;
  datos.tareas.push(t);
  render();
  persistirTarea(t, {
    revertir: () => { datos.tareas = datos.tareas.filter(x => x.id !== id); render(); },
  });
  abrirTarea(id, true);
}

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
  llenarSelect($('#tTipo'), TIPOS); $('#tTipo').value = t.tipo;
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
  texto, autor: YO.id || '', ts: new Date().toISOString(), visto: false,
});

/* ---------- la novedad de una actividad ----------
   La chapa roja que se le pone a la actividad cuando adentro hay algo que todavía no se
   miró. Son dos cosas distintas con el mismo cartel a propósito: la pregunta que contesta es
   una sola —¿hay algo nuevo acá?— y dos chapas distintas obligarían a aprenderse cuál es
   cuál antes de que sirvan para algo.

     · Avisos sin ver. Es del tablero: lo escribe uno, lo ve cualquiera, y el visto que le
       ponga cualquiera lo apaga para todos.
     · La actividad que todavía es nueva en el tablero y que este navegador no abrió nunca.

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
   tienen `hoy` en `false` y no se encienden nunca — no se migró nada. */
let vistas = new Set();
try {
  const g = JSON.parse(localStorage.getItem('tablero-vistas') || '{}');
  vistas = new Set(Array.isArray(g.ids) ? g.ids : []);
} catch (e) { /* si no se puede leer, no se marca ninguna y listo */ }
function guardarVistas(){
  try {
    localStorage.setItem('tablero-vistas', JSON.stringify({ ids: [...vistas] }));
  } catch (e) { /* modo privado o storage lleno: no es crítico */ }
}

// Los avisos de una tarea, leídos del `expl` guardado. Sin la marca de bloques no hay nada.
const avisosDeExpl = s => esExplBloques(s) ? avisosDe(cabeceraDe(bloquesDeExpl(s))) : [];

/* Son cientos de tarjetas por repintado: un `JSON.parse` en cada una para no encontrar nada
   no se paga. La marca se busca primero en el texto crudo, que es una comparación de
   cadenas, y recién si está se arma el árbol. */
function avisosSinVer(t){
  if (!esExplBloques(t.expl) || !t.expl.includes('"visto":false')) return 0;
  return avisosDeExpl(t.expl).filter(a => !a.visto).length;
}
/* Nueva en el tablero y sin abrir por mí. La chapa la ve cualquiera y no solo el responsable:
   una tarea que aparece en el tablero es algo que el equipo tiene que notar, y el que la
   escribió no es el que la tiene que ver. Cada uno la apaga entrando. */
const nuevaSinAbrir = t => !t.backlog && !!t.hoy && !vistas.has(t.id);

function novedadDe(t){
  const avisos = avisosSinVer(t);
  if (avisos) {
    return { n: avisos, txt: `${avisos} ${avisos === 1 ? 'aviso sin ver' : 'avisos sin ver'}` };
  }
  if (nuevaSinAbrir(t)) return { n: 1, txt: 'Nueva en el tablero: todavía no entraste' };
  return null;
}
function chapaNovedad(t){
  const nv = novedadDe(t);
  return nv ? `<span class="nuevo" title="${escA(nv.txt)}">${nv.n}</span>` : '';
}
// Entrar a la página es haberla visto. Devuelve si algo cambió, para no repintar de gusto.
function marcarVista(id){
  if (vistas.has(id)) return false;
  vistas.add(id);
  guardarVistas();
  return true;
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
[['tEstado','estado'], ['tPrioridad','prioridad'], ['tTipo','tipo']].forEach(([elId, campo]) => {
  $('#' + elId).addEventListener('change', e => {
    const t = actual(); if (!t) return;
    const antes = t[campo];
    t[campo] = e.target.value; render();
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
$('#tBacklog').onclick = () => {
  const t = actual(); if (!t) return;
  t.backlog ? pasarAlRoadmap(t) : mandarAlBacklog(t);
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
    ${movs.length ? movs.map(filaMovimiento).join('')
                  : '<p class="cjvacio">Sin movimientos todavía. Agregá el primero acá abajo.</p>'}
    <div class="cjcierre"></div>
    <button class="cjadd" type="button" data-nuevo="mov"><span>＋</span>Nuevo movimiento</button>
  </div>`;

  colgarManejadoresCaja();
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
    <button class="cjquien" type="button" data-pop="quien" title="De qué bolsillo salió la plata"><i class="cjdot${per ? '' : ' vacio'}" style="background:${per ? per.color : 'transparent'}"></i>${esc(per ? per.nombre : 'Sin asignar')}</button>
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
const nombresDeGrupo = () => {
  const m = new Map();
  (datos.grupos || []).forEach(g => { if (g.nombre) m.set(g.n, g.nombre); });
  return m;
};
const nombreGrupo = n => (datos.grupos || []).find(g => g.n === n && g.nombre)?.nombre || '';
// El fallback es «Grupo N» y no el nombre vacío: un bloque sin título no se puede nombrar en
// el menú «Mover a otro grupo», que es donde más falta hace saber cuál es cuál.
const nombreSprint = n => (n ? (nombreGrupo(n) || 'Grupo ' + n) : 'Sin planificar');

/* Los bloques que se dibujan aunque estén vacíos: siempre del 1 al N, sin huecos. El piso
   lo pone la config; sube si alguien agregó grupos con el botón, sube si hay una tarea
   guardada en un grupo más alto —un grupo con tareas no se puede esconder— y sube también si
   alguien bautizó uno: un grupo con nombre es un grupo que alguien creó a propósito, y ese
   nombre está en la base, así que lo ven todos. El `UI.sprints` de `localStorage` queda como
   estaba, para el caso en que la tabla de nombres no se pueda escribir. */
function sprintsVisibles(){
  const conTareas = datos.tareas.filter(enBacklog).map(sprintDe);
  const conNombre = [...nombresDeGrupo().keys()];
  const piso = Math.max(1, Number(CFG.sprints) || 3, UI.sprints || 0, ...conTareas, ...conNombre);
  return Array.from({ length: piso }, (_, i) => i + 1);
}
const tareasDeSprint = n => datos.tareas
  .filter(t => enBacklog(t) && sprintDe(t) === n)
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
// Para el selector de la ficha, que sí es un `<select>` común.
const opcionesSprint = () => sprintsVisibles().map(n => ({ id: String(n), label: nombreSprint(n) }));

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

/* Guarda el nombre de un grupo, o borra la fila si quedó vacío. Optimista como todo lo
   demás: el nombre ya está en pantalla y esto es lo que lo hace durar. */
async function persistirGrupo(n, nombre, previo){
  const revertir = () => {
    datos.grupos = (datos.grupos || []).filter(g => g.n !== n);
    if (previo) datos.grupos.push({ n, nombre: previo });
    renderBacklog();
  };
  const ok = await conEstadoDeCarga(
    () => (nombre ? RoadmapSync.guardarGrupo(n, nombre) : RoadmapSync.borrarGrupo(n)),
    { onEstado: onEstadoGlobal, revertir });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.grupos, RoadmapSync.idGrupo(n));
}

// El nombre en memoria, para pintarlo antes de que la base conteste.
function fijarNombreGrupo(n, nombre){
  datos.grupos = (datos.grupos || []).filter(g => g.n !== n);
  if (nombre) datos.grupos.push({ n, nombre });
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
    const previo = nombreGrupo(n);
    if (nombre === previo) return renderBacklog();
    fijarNombreGrupo(n, nombre);
    renderBacklog();
    persistirGrupo(n, nombre, previo);
  };
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
   algo encima le calcularía el orden contra una lista que no la incluye. */
const tareasDeEstado = id => datos.tareas
  .filter(t => !t.backlog && estadoDe(t.estado).id === id)
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));

/* ---------- pintado ----------
   El backlog y la página de una tarea son EL MISMO componente, y por eso comparten las
   clases `pg`: una columna angosta de renglones con sangría, la canaleta de controles a la
   izquierda y las catalogaciones a la derecha. Cambia lo que hay adentro de cada renglón,
   no la forma.

   Acá el árbol no se guarda en ningún lado: se arma en el momento. Los sprints son los
   renglones desplegables y las tareas los renglones `▤` que cuelgan de ellos. Un sprint no
   es una fila de ninguna tabla —es el número que tiene cada tarea en `sprint`—, así que
   plegarlo, contarlo o crear uno nuevo no toca la base. */

function renderBacklog(){
  listaActual = LISTAS.sprint;
  const mostradas = datos.tareas.filter(visible);
  const grupos = [...sprintsVisibles(), SIN_SPRINT];
  const siguiente = sprintsVisibles().length + 1;

  // «Sin planificar» solo aparece si tiene algo: es el cajón de lo que cayó sin clasificar,
  // no un casillero que haya que llenar.
  const bloques = grupos
    .map(n => ({ n, lista: mostradas.filter(t => sprintDe(t) === n)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0)) }))
    .filter(g => g.n !== SIN_SPRINT || g.lista.length);

  // Sin encabezado: la pestaña ya dice dónde estás y cada sprint ya lleva su contador al lado
  // del nombre. La miga, el contador general, el título y la bajada eran medio scroll de
  // repetir lo obvio que empujaba el primer sprint hacia abajo. El aire de arriba lo pone
  // ahora `.bkwrap`, en el CSS.
  board.innerHTML = `<div class="pgwrap bkwrap">
    <div class="pgbody">${bloques.map(g => filaSprintHTML(g.n, g.lista)).join('')}</div>
    <button class="pgnew" type="button" data-sprint-nuevo data-n="${siguiente}">＋ Nuevo grupo</button>
  </div>`;

  engancharLista();
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

  const bloque = c => filaEstadoHTML(c,
    mostradas.filter(t => estadoDe(t.estado).id === c.id)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0)),
    mostradas.length);

  board.innerHTML = (vacio
    ? `<p class="empty-board">Ninguna tarea encaja con este filtro.<br>Probá vaciar la búsqueda o destildar los filtros.</p>`
    : `<div class="pgwrap bkwrap bkcols">
    <div class="pgbody">${columnasDeEstados()
      .map(col => `<div class="bkcol">${col.map(bloque).join('')}</div>`).join('')}</div>
  </div>`);

  engancharLista();
}

/* El renglón del estado. Mismo desplegable que el del sprint, con dos cosas propias:

   - **El punto de color**, que es el mismo de la columna. Es lo que ata las tres vistas: el
     verde de Terminada tiene que ser el mismo mire por donde se mire.
   - **El porcentaje**, que es la barrita `.rail` de la columna convertida en pill. Mide cuánto
     del tablero está parado acá, no cuánto de este bloque está hecho —el bloque ES un estado—,
     así que de un vistazo se ve si se está amontonando todo en Bloqueadas. Plegado el bloque,
     el contador y las críticas son lo único que queda a la vista, que es justo el punto. Va
     como número pelado y el «del tablero» quedó en el `title`: en una columna de un tercio de
     pantalla el rótulo se comía el lugar de las críticas, que es el dato que sí alarma. */
function filaEstadoHTML(c, lista, total){
  const plegado = estadoPlegado(c.id);
  const criticas = lista.filter(t => prioridadDe(t.prioridad).id === CRITICA).length;
  const pct = total ? Math.round(lista.length / total * 100) : 0;
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
      <span class="pgpills">
        ${criticas ? `<span class="pgpill urge">${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}</span>` : ''}
        <span class="pgpill" title="${pct}% de las tareas visibles está en ${escA(c.label)}">${pct}%</span>
      </span>
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
   estados no va: ahí los bloques son el catálogo de estados y no se renombran. */
function filaSprintHTML(n, lista){
  const plegado = sprintsPlegados.has(String(n));
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
      </div>
      ${cabecera}
      <span class="pgpills">
        <button class="pgpill lapiz" type="button" data-renombrar="${n}"
          title="Ponerle nombre al grupo" aria-label="Ponerle nombre al grupo">✎</button>
        <span class="pgpill">${lista.length} por hacer</span>
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
   oscura de acciones en lote. */
function filaTareaHTML(t){
  /* La chapa de novedad es del tablero y de nadie más: en el backlog se planifica, se lee la
     lista entera y varias veces, y una chapa roja por renglón ahí no avisa nada — avisa en el
     tablero, que es donde una tarea aparece de golpe. La marca la da la vista, no la fila,
     porque la fila es la misma en las dos listas. */
  const enBk = !!vistaActual().backlog;
  return `<div class="pgrow pg-page bktarea" data-id="${escA(t.id)}">
    <div class="pgctl">
      <button class="pgadd" type="button" data-menu title="Prioridad, responsable, grupo…"
        aria-label="Acciones de la tarea">⋯</button>
      <button class="pgdrag" type="button" draggable="true" data-drag
        title="Arrastrar para reordenar o cambiarla de grupo" aria-label="Mover la tarea">⠿</button>
    </div>
    <button class="pgpg" type="button" data-pagina title="Entrar a la página de la tarea"
      aria-label="Entrar a la página de la tarea">▤</button>
    ${enBk ? '' : chapaNovedad(t)}
    <div class="pgtxt" contenteditable="true" spellcheck="false" data-f="tarea"
      data-ph="Sin título">${esc(t.tarea)}</div>
    <span class="pgpills">${pillsMetaDeTarea(t)}</span>
    ${t.backlog ? '' : `<span class="pgcol pgcol-pri">${pillPrioridad(t)}</span>`}
    <span class="pgcol pgcol-quien">${pillQuien(t)}</span>
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

/* «→ Al tablero» (26/8/2026, por pedido). Es la vuelta del botón que se había sacado esa misma
   mañana por ser cuarenta botones en pantalla para algo que se hace una vez por tarea. Vuelve
   como una columna más y solo en el backlog: adentro del tablero, ofrecerle a cada fila
   mandarla a donde ya está no es una acción, es ruido. Que la fila esté en el backlog ya
   alcanza para saber que todavía no salió — la que se manda al tablero se va de la lista.

   Quién lo dibuja lo decide quien llama y no esta función mirando la vista: la cabecera de la
   página de la tarea usa estas mismas pills y ya tiene su propio «→ Al tablero» a la derecha,
   así que preguntando por la vista se dibujaría dos veces el mismo botón. */
const pillPase = () => `<button class="pgpill ir" type="button" data-altablero
  title="Mandarla al tablero">→ Al tablero</button>`;

/* El código de la tarea. Va aparte del resto de la meta porque en la cabecera de la página
   encabeza el renglón, delante de la prioridad, y en la fila arranca el bloque que acompaña
   al título. */
const pillCodigo = t => `<span class="pgpill mono">${esc(t.id)}</span>`;

/* Lo que acompaña y no se compara entre filas: de qué depende, de qué área es y desde cuándo
   está anotada. Las que no tienen valor no dibujan nada — una columna de guiones no dice más
   que el hueco, y por eso ninguna de estas puede ser columna fija. */
function pillsSueltas(t){
  const edad = antiguedad(t.creada);
  const out = [];
  if (t.dep) out.push(`<span class="pgpill">Dep. ${esc(t.dep)}</span>`);
  if (t.modulo) out.push(`<span class="pgpill">${esc(t.modulo)}</span>`);
  if (edad) {
    out.push(`<span class="pgpill edad" title="Anotada el ${escA(edad.exacta)}"
      data-edad="${escA(t.creada)}" data-edad-pre="hace ">hace ${esc(edad.txt)}</span>`);
  }
  return out.join('');
}

// Lo que en la fila queda pegado al título, fuera de las columnas.
const pillsMetaDeTarea = t => pillCodigo(t) + pillsSueltas(t);

/* Todas juntas, en el orden en que se miran. Lo usa la cabecera de la página de la tarea, que
   no tiene cuarenta filas que alinear: ahí las pastillas envuelven y una columna fija sería
   ancho reservado para nada. */
const pillsDeTarea = (t, conPase) => pillCodigo(t) + pillPrioridad(t) + pillQuien(t)
  + (conPase ? pillPase() : '') + pillsSueltas(t);

/* El `⋯` de la fila. Es el equivalente del `＋` del diseño: ahí adentro, un renglón inserta
   bloques; acá, una tarea no tiene bloques que insertar pero sí cosas que cambiar. Los tres
   primeros abren el menú de siempre; los otros actúan derecho. */
function menuTareaHTML(t){
  const L = listaActual;
  const it = (k, ico, txt) => `<button type="button" data-acc="${k}"><span>${ico}</span>${txt}</button>`;
  // El primer renglón es siempre «mover de bloque», y qué significa mover lo dice la lista:
  // de sprint en el backlog, de estado en el tablero. Un mismo menú, un mismo lugar.
  return `<div class="pgpop">
    <div class="pgpop-t">La tarea</div>
    ${it('grupo', '▤', L.mover)}
    ${it('ir', t.backlog ? '→' : '←', t.backlog ? 'Mandar al tablero' : 'Mandar al backlog')}
    ${it('ficha', '⤢', 'Ficha completa')}
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
  // Los que la lista no usa se apagan a mano: la caja los deja puestos y se pasa de una
  // vista a la otra sin volver a tocar el tablero.
  board.onchange = board.onfocusout = null;

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
      if (k === 'ir')     return t.backlog ? pasarAlRoadmap(t) : mandarAlBacklog(t);
      if (k === 'ficha')  return abrirTarea(t.id);
      if (k === 'borrar') return borrarDeLista(t);
      return;
    }
    if (enc('.pgpop')) { e.stopPropagation(); return; }

    // El pase al tablero desde la fila. Solo lo dibuja el backlog y solo en la que todavía no
    // salió, así que acá no hace falta volver a preguntarlo.
    if (enc('[data-altablero]')) return pasarAlRoadmap(t);
    // El `▤` es la puerta a la página, como en el diseño. La ficha —conversación, archivos,
    // campos— vive en el menú `⋯`: se abre mucho menos.
    if (enc('[data-pagina]')) return abrirPagina(t.id);
    const pop = enc('[data-pop]');
    if (pop) return abrirMenu(pop, pop.dataset.pop, t);
  };

  engancharNombreDeGrupo();

  // El único campo que se edita en la lista es el título: todo lo demás pasó a ser una
  // catalogación que se cambia por menú, o vive adentro de la página.
  board.oninput = e => {
    if (e.target.dataset.f !== 'tarea') return;
    const fila = e.target.closest('.bktarea'); if (!fila) return;
    const t = tarea(fila.dataset.id); if (!t) return;
    campoTareaDebounced(t, 'tarea', e.target.textContent);
  };

  // Lo pegado en el título entra siempre como texto plano: es un campo de una línea, y el
  // HTML de otra página ahí adentro no tiene ningún sentido.
  board.onpaste = e => {
    const el = e.target;
    if (!el.isContentEditable || el.dataset.f !== 'tarea') return;
    e.preventDefault();
    const txt = (e.clipboardData?.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
    if (txt && !document.execCommand?.('insertText', false, txt)) {
      insertarEnCursor(document.createTextNode(txt), el);
    }
    board.oninput({ target: el, type: 'input' });
  };

  board.onkeydown = e => {
    // Enter en el título cierra la edición y abre una fila nueva en el mismo bloque:
    // escribir una lista de corrido es el 90% de lo que se hace en esta pantalla. Por eso
    // acá el responsable se hereda de la fila de arriba en vez de preguntarse: un menú por
    // cada Enter mataría justo el tipeo de corrido, y heredar cumple igual la regla de que
    // ninguna nazca sin dueño. Se pregunta solo si la de arriba tampoco tiene —una fila
    // vieja, de antes de esta regla—, que es cuando no hay nada que heredar.
    if (e.key === 'Enter' && e.target.dataset.f === 'tarea') {
      e.preventDefault();
      const fila = e.target.closest('.bktarea');
      const t = fila && tarea(fila.dataset.id);
      if (!t) return;
      const g = L.grupoDe(t);
      const heredado = (t.pend || [])[0];
      if (heredado) L.nueva(g, t, heredado);
      else pedirResponsable(e.target, e, quien => L.nueva(g, t, quien));
      return;
    }
  };

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
    : false;

  const items =
    tipo === 'prioridad' ? PRIORIDADES.map(p => ({ v:p.id, label:p.label, color:p.color }))
    : tipo === 'pend'    ? PERSONAS.map(p => ({ v:p.id, label:p.nombre, color:p.color }))
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
  t[campo] = valor;
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
  sprintsPlegados.delete(String(sprint)); guardarPlegados();
  render();
  const campo = board.querySelector(`.bktarea[data-id="${CSS.escape(id)}"] [data-f="tarea"]`);
  if (campo) campo.focus();
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
  const ultima = tareasDeEstado(id).filter(x => x.id !== t.id).pop();
  t.orden = RoadmapSync.calcularOrden(ultima ? ultima.orden : null, null);
  if (!silencio) render();
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
}

/* Una fila nueva adentro de un bloque de la lista del tablero. Es el gemelo de
   `nuevaEnBacklog()` y no `nuevaTarea()`: esa abre la ficha, y acá lo que se quiere es el
   cursor en el título para seguir escribiendo de corrido. La diferencia con la del backlog es
   de qué lado de la marca nace —`tareaVacia()` ya la deja en `backlog:false`— y que el bloque
   es el estado. */
function nuevaEnEstado(estadoId, despuesDe, quien){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const hermanas = tareasDeEstado(estadoId);
  const i = despuesDe ? hermanas.findIndex(x => x.id === despuesDe.id) : hermanas.length - 1;
  const t = Object.assign(tareaVacia(id), {
    estado: estadoId,
    pend: [quien],
    orden: RoadmapSync.calcularOrden(
      i >= 0 && hermanas[i] ? hermanas[i].orden : null,
      hermanas[i + 1] ? hermanas[i + 1].orden : null),
  });
  datos.tareas.push(t);
  // Agregar adentro de un bloque plegado dejaría la fila nueva escondida y el cursor en la
  // nada: se abre solo, igual que el sprint.
  LISTAS.estado.abrir(estadoId);
  render();
  const campo = board.querySelector(`.bktarea[data-id="${CSS.escape(id)}"] [data-f="tarea"]`);
  if (campo) campo.focus();
  persistirTarea(t, {
    revertir: () => { datos.tareas = datos.tareas.filter(x => x.id !== id); render(); },
  });
}

/* Los dos sentidos del mismo viaje. No se copia ni se mueve nada: la tarea es la misma fila
   de siempre y lo único que cambia es de qué lado de la marca queda. */
function pasarAlRoadmap(t, silencio){
  if (!t.backlog) return false;
  const antes = { backlog: t.backlog, orden: t.orden, hoy: t.hoy };
  // Entra al final del tablero: el orden que traía era el de su sprint y acá no dice nada.
  const ultimo = datos.tareas.reduce((m, x) => (!x.backlog && (m == null || (x.orden || 0) > m) ? (x.orden || 0) : m), null);
  t.orden = RoadmapSync.calcularOrden(ultimo, null);
  /* Llega SIEMPRE como nueva, aunque se haya anotado hace dos meses: para el tablero recién
     aparece hoy, y la chapa roja es lo que hace que el equipo la vea. Se vuelve a prender acá
     y no solo al nacer porque una tarea puede ir y volver, y la vuelta también es una llegada.
     Ver «la novedad de una actividad»: apagarla es cosa de cada uno, entrando. */
  t.hoy = true;
  t.backlog = false;
  if (!silencio) { render(); aviso(`«${t.tarea || 'sin título'}» pasó al tablero, en ${estadoDe(t.estado).label}`); }
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
   `campoTarea()`, `cambiarSprint()`, `cambiarEstado()`, `pasarAlRoadmap()` y
   `mandarAlBacklog()` era de acá, y se conserva porque no cuesta nada y es justo lo que haría
   falta el día que vuelva algo parecido. */

/* ---------- arrastrar y soltar ----------
   Mueve la fila entre sus hermanas y, si se suelta en otro bloque, la cambia de bloque: de
   sprint en el backlog, de estado en el tablero —lo mismo que arrastrar la tarjeta a otra
   columna—. El orden es el mismo decimal que usa el tablero: se guarda una fila, no la lista
   entera.

   El `antes` guarda los dos campos aunque cada lista toque uno solo: son dos números en un
   objeto de revert, y llevar la cuenta de cuál corresponde a cada lista es justo el tipo de
   detalle que se olvida al agregar la tercera. */
let arrastreBacklog = null;

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
    h.addEventListener('dragend', () => {
      arrastreBacklog = null;
      board.querySelectorAll('.arrastrando,.antes,.despues')
        .forEach(x => x.classList.remove('arrastrando', 'antes', 'despues'));
    });
  });

  board.ondragover = e => {
    if (!arrastreBacklog) return;
    e.preventDefault();
    board.querySelectorAll('.antes,.despues').forEach(x => x.classList.remove('antes', 'despues'));
    const fila = e.target.closest('.bktarea');
    if (!fila || fila.dataset.id === arrastreBacklog) return;
    const r = fila.getBoundingClientRect();
    fila.classList.add(e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
  };

  board.ondrop = e => {
    if (!arrastreBacklog) return;
    e.preventDefault();
    const t = tarea(arrastreBacklog);
    const fila = e.target.closest('.bktarea');
    const bloque = e.target.closest('[data-filas]');
    arrastreBacklog = null;
    if (!t) return;

    const antes = { sprint: t.sprint, estado: t.estado, orden: t.orden };
    if (fila && fila.dataset.id !== t.id) {
      const destino = tarea(fila.dataset.id); if (!destino) return;
      const r = fila.getBoundingClientRect();
      const encima = e.clientY < r.top + r.height / 2;
      const g = L.grupoDe(destino);
      const hermanas = L.hermanas(g).filter(x => x.id !== t.id);
      const i = hermanas.indexOf(destino);
      L.fijar(t, g);
      t.orden = RoadmapSync.calcularOrden(
        encima ? (hermanas[i - 1] ? hermanas[i - 1].orden : null) : destino.orden,
        encima ? destino.orden : (hermanas[i + 1] ? hermanas[i + 1].orden : null));
    } else if (bloque) {
      const g = bloque.dataset.filas;
      const ultima = L.hermanas(g).filter(x => x.id !== t.id).pop();
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
function abrirPagina(id){
  const t = tarea(id); if (!t) return;
  /* Entrar es haberla visto: la chapa de «todavía no entraste» se apaga acá y no cuando se
     sale, que es lo que uno espera del momento en que efectivamente la miró. En el backlog no
     cuenta: ahí se entra a planificar y se entra varias veces, y si contara, la tarea llegaría
     apagada al tablero — que es el único lugar donde la chapa significa algo. */
  if (!t.backlog) marcarVista(id);
  paginaTarea = id;
  paginaRuta = [];
  paginaMenu = null;
  paginaArbol = arbolDeTarea(t);
  if (tareaAbierta) cerrarModales();
  render();
  board.scrollTop = 0;
}
function cerrarPagina(){
  paginaTarea = null; paginaArbol = null; paginaRuta = []; paginaMenu = null;
  arrastreBloque = null;
  cerrarMenu();
}
// Escape y la miga de pan salen de a un nivel: de la subpágina a la tarea, de la tarea afuera.
function salirDePagina(){
  if (paginaRuta.length) { paginaRuta.pop(); paginaMenu = null; return renderPagina(); }
  cerrarPagina();
  render();
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
   comportamiento— y no una copia: la prioridad, quién la hace, el sprint y el pase al
   tablero se tocan desde acá igual que desde la lista. */
function metaPaginaHTML(t){
  return `<div class="pgmeta">
    <span class="pgpills">${pillsDeTarea(t)}</span>
    <button class="pgpill" type="button" data-pop="sprint">${esc(nombreSprint(sprintDe(t)))} ▾</button>
    <span class="pgflex"></span>
    ${t.backlog
      ? `<button class="pgship" type="button" data-ir
          title="Mandarla al tablero">→ Al tablero</button>`
      : `<span class="pgship ya"><button type="button" data-ir>● En el tablero</button></span>`}
    <button class="pgficha" type="button" data-ficha>Ficha completa ↗</button>
  </div>`;
}

/* El cuadro de avisos, arriba de todo y solo en la raíz de la tarea. En una subpágina no va:
   los avisos son de la tarea, y repetirlos en cada nivel haría que el mismo aviso pareciera
   tres avisos distintos.

   El cuadro se dibuja siempre, aunque esté vacío: es un lugar fijo donde dejar algo, y uno
   que aparece solo cuando ya hay algo adentro no le sirve al primero que quiere escribir. */
function cabeceraPaginaHTML(){
  const avisos = avisosDe(cabeceraDe(paginaArbol));
  const sinVer = avisos.filter(a => !a.visto).length;
  return `<div class="pghdr${sinVer ? ' hay' : ''}">
    <div class="pgavtop">
      <span class="pglbl">Avisos</span>
      ${sinVer ? `<span class="pgavn">${sinVer} sin ver</span>` : ''}
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
function avisoHTML(a){
  const quien = a.autor ? nombrePersona(a.autor) : 'Alguien';
  const cuando = fmtTs(a.ts);
  const firma = quien + (cuando ? ' · ' + cuando : '');
  return `<li class="pgavmsg${a.visto ? ' visto' : ''}" data-av="${escA(a.id)}">
    <span class="pgavtxt" title="${escA(firma)}">${esc(a.texto)}</span>
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

    if (enc('[data-salir-todo]')) { cerrarPagina(); return render(); }
    const nivel = enc('[data-nivel]');
    if (nivel) { paginaRuta = paginaRuta.slice(0, Number(nivel.dataset.nivel)); paginaMenu = null; return renderPagina(); }

    // Los de la cabecera son los mismos de la fila y hacen exactamente lo mismo.
    if (enc('[data-ficha]')) return abrirTarea(t.id);
    if (enc('[data-ir]')) return t.backlog ? pasarAlRoadmap(t) : mandarAlBacklog(t);
    // Prioridad, responsables y sprint son las mismas pills de la lista y abren el mismo
    // menú: acá se toca la tarea entera, no un bloque.
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
    if (enc('[data-entrar]')) { paginaRuta.push(b.id); paginaMenu = null; return renderPagina(); }
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
function marcarAvisoVisto(id){
  const a = avisosDe(cabeceraDe(paginaArbol)).find(x => x.id === id);
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
    // El menú de prioridades es lo de más arriba de todo: se cierra primero y no se lleva
    // por delante la ficha que pueda haber abierta debajo.
    if (!$('#fPrioridad .selmenu').hidden) { abrirMenuPrioridad(false); return; }
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
$('#fTipo').addEventListener('change', e => { UI.f.tipo = e.target.value; render(); });

/* El menú de prioridades se atiende por delegación desde el contenedor, que es lo único que
   no se repinta: el contenido de adentro se rehace en cada render y un listener por opción
   se colgaría de un botón que ya no existe. Elegir NO cierra el menú —marcar tres es un
   solo gesto—; lo cierra un clic afuera. */
$('#fPrioridad').addEventListener('click', e => {
  if (e.target.closest('.sel')) { abrirMenuPrioridad(); return; }
  const op = e.target.closest('[data-prio]');
  if (!op) return;
  const k = op.dataset.prio, i = UI.f.prioridades.indexOf(k);
  i > -1 ? UI.f.prioridades.splice(i, 1) : UI.f.prioridades.push(k);
  render();
});
// En captura y no al burbujear: elegir una opción repinta el menú, así que si esto corriera
// después el botón que se tocó ya estaría fuera del documento, `closest` no encontraría el
// contenedor y el menú se cerraría solo en cada tilde.
document.addEventListener('click', e => {
  if (!e.target.closest('#fPrioridad')) abrirMenuPrioridad(false);
}, true);
/* Cambiar de layout cierra el menú `⋯` que hubiera abierto: la fila que lo tenía puede no
   existir en el dibujo siguiente, y un menú colgado de la nada no se cierra con nada. */
$$('[data-layout]').forEach(b => b.onclick = () => {
  if (UI.layout === b.dataset.layout) return;
  UI.layout = b.dataset.layout;
  menuFila = null;
  guardarUI(); render();
});
$('#bNueva').onclick = e => {
  cerrarPagina();
  const v = vistaActual();
  // Primero quién la hace y recién después la fila: el cambio de vista también espera, para
  // que cerrar el menú sin elegir no deje al usuario en otra pantalla y sin tarea.
  pedirResponsable($('#bNueva'), e, quien => {
    // En el backlog la tarea nace ahí mismo, en el primer sprint y lista para escribirle el
    // título: abrir el detalle para una línea que todavía no dice nada sería un estorbo.
    if (v.backlog) return nuevaEnBacklog(sprintsVisibles()[0], null, quien);
    // Desde la Caja no hay tablero donde mostrarla: se vuelve a una vista de tareas para
    // que la tarea recién creada quede a la vista al cerrar el detalle.
    if (sinTareas(v)) { UI.vista = 'estado'; guardarUI(); render(); }
    nuevaTarea(vistaActual(), null, quien);
  });
};
$('#bCsv').onclick = () => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['ID','Titulo','Estado','Prioridad','Tipo','Pendiente de','Grupo','Donde','Notas','Subtareas','Conversacion','Archivos'];
  const filas = datos.tareas.map(t => [
    t.id, t.tarea,
    estadoDe(t.estado).label, prioridadDe(t.prioridad).label, tipoDe(t.tipo).label,
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
    datos = { tareas:[], caja:[], grupos:[] };
  }
  normalizarDatos();
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
      datos = { tareas:[], caja:[], grupos:[] };
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
