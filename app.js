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
  { id:'Pendiente', label:'Nueva',     color:'#9A9CA5' },
  { id:'En curso',  label:'En curso',  color:'#5F7A9B' },
  { id:'Bloqueado', label:'Bloqueada', color:'#A44B45' },
  { id:'Hecho',     label:'Terminada', color:'#5E8467' },
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
// (prioridad, tipo, temática) quedaron como filtros de la barra, no como vistas.
// Una entrada con `enlace` no es una vista: es un acceso directo. No cambia lo que se ve
// en el tablero, se dibuja como enlace y abre en otra pestaña. Visión dejó de vivir acá
// —ahora es un documento de Notion— y esta es la puerta a ese documento.
//
// La marca es `enlace:true` y no «tiene url»: si la dirección viene vacía, la pestaña no
// se dibuja, en vez de volverse una vista que al tocarla no lleva a ninguna parte.
const VISTAS = [
  { id:'hoy',    label:'☀ Hoy',    soloHoy:true },
  { id:'estado', label:'Estado' },
  { id:'vision', label:'◦ Visión', enlace:true, url:CFG.visionUrl || '' },
  { id:'caja',   label:'Caja',     caja:true },
];
const esVista = v => !v.enlace;   // lo que sí se puede pintar en el board

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
// hay ninguno marcado se usan todos, para que la planilla nunca quede sin gente.
const PERSONAS_CAJA = PERSONAS.filter(p => p.caja).length ? PERSONAS.filter(p => p.caja) : PERSONAS;
const persona = id => PERSONAS.find(p => p.id === id) || null;
const colorPersona = id => persona(id)?.color || '#858A99';
const iniPersona = id => persona(id)?.ini || '?';
const nombrePersona = id => persona(id)?.nombre || id || '—';

// Paleta de reserva para temáticas sin color elegido.
const PALETA = ['#6E6BA0','#5F6B96','#4F7F79','#A87A3F','#9C6480','#5A7E8C','#6B7079','#5E8467'];

// Identidad de quien está usando el tablero (se resuelve al iniciar sesión).
let YO = { id:'', nombre:'', esMiembro:false };

/* ---------- datos y estado de pantalla ---------- */
let datos = { secciones: [], tareas: [], caja: [] };
let UI = {
  vista: 'estado',
  layout: 'cols',
  // La columna de Terminadas arranca plegada: es lo que ya no hay que mirar.
  terminadasAbiertas: false,
  f: { q:'', pend:[], prioridad:'', tipo:'', tematica:'' },
};
try {
  const guardado = JSON.parse(localStorage.getItem('tablero-ui') || '{}');
  // `esVista` en el filtro: a quien le haya quedado 'vision' guardada de cuando era una
  // vista de verdad, no lo dejamos arrancar en una pestaña que ya no pinta nada.
  if (guardado.vista && VISTAS.some(v => esVista(v) && v.id === guardado.vista)) UI.vista = guardado.vista;
  if (guardado.layout === 'rows' || guardado.layout === 'cols') UI.layout = guardado.layout;
  UI.terminadasAbiertas = !!guardado.terminadasAbiertas;
} catch (e) { /* preferencia local, si no se puede leer no importa */ }
function guardarUI(){
  try {
    localStorage.setItem('tablero-ui', JSON.stringify({
      vista: UI.vista, layout: UI.layout, terminadasAbiertas: UI.terminadasAbiertas,
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
async function persistirSeccion(s, opts = {}){
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarSeccion(s),
    { onEstado: onEstadoGlobal, ...opts });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.secciones, s.id);
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
// No pisar la pantalla mientras alguien escribe: ni en la planilla, ni en las hojas de
// Visión, ni con el detalle de una tarea abierto (ahí se está editando a mano).
function estaEditando(){
  if ($('#scrimTarea').classList.contains('on')) return true;
  const f = document.activeElement;
  return !!f && ['INPUT','TEXTAREA','SELECT'].includes(f.tagName) && board.contains(f);
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
const tematicaDe  = id => porId(datos.secciones, id);
const vistaActual = () => porId(VISTAS, UI.vista) || VISTAS[1];
function colorTematica(s){
  if (!s) return '#A9ABB4';
  if (s.color) return s.color;
  const i = datos.secciones.findIndex(x => x.id === s.id);
  return PALETA[(i < 0 ? 0 : i) % PALETA.length];
}

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
  for (const f of files) {
    const esImg = /^image\//.test(f.type);
    if (!esImg && f.size > MAX_ARCHIVO) { saltados.push(f.name + ' (' + kb(f.size) + ')'); continue; }
    const blob = esImg ? await comprimirImagen(f) : f;
    if (blob.size > MAX_ARCHIVO) { saltados.push((f.name || 'captura') + ' (' + kb(blob.size) + ' ya comprimida)'); continue; }
    if (esImg && f.size > blob.size) ahorro += f.size - blob.size;
    try {
      const nombre = f.name || ('captura-' + new Date().toISOString().slice(0,19).replace(/[:T]/g,'-') + '.webp');
      const archivo = await RoadmapSync.subirArchivo(t.id, blob, nombre);
      t.files.push(archivo); subidos.push(archivo); n++;
    } catch (e) { saltados.push((f.name || 'captura') + ' (error al subir)'); }
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
  if (saltados.length) aviso('No pude adjuntar: ' + saltados.join(', ') + '. Subilo a Drive y pegá el enlace.');
  else if (n) aviso((n === 1 ? '1 archivo adjuntado' : n + ' archivos adjuntados') + (ahorro > 512000 ? ' · ' + kb(ahorro) + ' ahorrados al comprimir' : ''));
}

async function borrarTodosLosArchivos(t){
  const files = [...(t.files || []), ...((t.subtareas || []).flatMap(s => s.files || []))];
  for (const f of files) { try { await RoadmapSync.borrarArchivo(f); } catch (e) { /* ya no existe */ } }
}

/* ============================================================
   Cabecera: pestañas de vista y filtros
   ============================================================ */
function pintarChrome(){
  document.title = CFG.titulo || 'Tablero de tareas';
  $('#tituloApp').textContent = CFG.titulo || 'Tablero de tareas';
  $('#subtituloApp').textContent = CFG.subtitulo || '';

  const yo = $('#yoNombre');
  yo.innerHTML = YO.id
    ? `<span class="av mini" style="background:${colorPersona(YO.id)}">${esc(iniPersona(YO.id))}</span>Sos ${esc(YO.nombre)}`
    : (YO.nombre ? `<span class="av mini off">?</span>${esc(YO.nombre)}` : '');

  // Campana de críticas: mientras haya algo crítico sin terminar, late en rojo y lleva
  // de un clic al tablero filtrado por esas tareas.
  const criticas = datos.tareas.filter(t => prioridadDe(t.prioridad).id === CRITICA && t.estado !== HECHO);
  elCampana.hidden = !criticas.length;
  if (criticas.length) {
    elCampana.querySelector('b').textContent = criticas.length;
    elCampana.title = criticas.length === 1
      ? '1 tarea crítica sin terminar — clic para verla'
      : `${criticas.length} tareas críticas sin terminar — clic para verlas`;
    elCampana.classList.toggle('viendo', UI.f.prioridad === CRITICA);
  }
  elCampana.onclick = () => {
    UI.f.prioridad = UI.f.prioridad === CRITICA ? '' : CRITICA;
    const v = vistaActual();
    if (UI.f.prioridad && v.caja) { UI.vista = 'estado'; guardarUI(); }
    render();
  };

  const nHoy = datos.tareas.filter(t => t.hoy).length;
  elVistas.innerHTML = VISTAS.map(v => {
    // Los accesos directos son `<a>`, no botones: así el navegador da lo que ya sabe dar
    // con un enlace —abrir en pestaña nueva con el medio, copiar la dirección, ver a
    // dónde va abajo a la izquierda—, cosas que un botón con JavaScript encima no tiene.
    if (!esVista(v)) {
      if (!v.url) return '';
      return `<a class="view-tab link" href="${escA(v.url)}" target="_blank" rel="noopener noreferrer"
        title="Se abre en otra pestaña">${esc(v.label)}<svg width="10" height="10" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
        ><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>`;
    }
    const on = UI.vista === v.id;
    let badge = '';
    if (v.soloHoy) badge = `<small>${nHoy}</small>`;
    else if (on && !v.caja) badge = `<small>${datos.tareas.filter(visible).length}</small>`;
    return `<button class="view-tab${on ? ' on' : ''}" data-vista="${v.id}">${esc(v.label)}${badge}</button>`;
  }).join('');
  $$('[data-vista]').forEach(b => b.onclick = () => {
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

function sincronizarFiltros(){
  const sel = (el, items, ph, val) => { llenarSelect(el, items, ph); el.value = val; };
  // El texto del placeholder hace de etiqueta: así los filtros no necesitan un rótulo
  // aparte arriba y toda la barra entra en una sola línea.
  sel($('#fPrioridad'), PRIORIDADES, 'Prioridad', UI.f.prioridad);
  sel($('#fTipo'), TIPOS, 'Tipo', UI.f.tipo);
  sel($('#fTematica'),
    datos.secciones.map(s => ({ id:s.id, label:s.titulo || 'Sin nombre' })).concat([{ id:'__sin__', label:'Sin temática' }]),
    'Temática', UI.f.tematica);
  $$('#filtros .sel').forEach(s => s.classList.toggle('activo', !!s.value));
}

function textoBuscable(t){
  return [
    t.tarea, t.expl, t.id,
    (t.subtareas || []).map(s => s.titulo + ' ' + (s.expl || '')).join(' '),
    (t.chat || []).map(m => m.texto).join(' '),
  ].join(' ').toLowerCase();
}
function visible(t){
  const f = UI.f;
  if (vistaActual().soloHoy && !t.hoy) return false;
  if (f.prioridad && t.prioridad !== f.prioridad) return false;
  if (f.tipo && t.tipo !== f.tipo) return false;
  if (f.tematica) {
    if (f.tematica === '__sin__') { if (t.sec) return false; }
    else if (t.sec !== f.tematica) return false;
  }
  if (f.pend.length && !f.pend.some(p => (t.pend || []).includes(p))) return false;
  if (f.q && !textoBuscable(t).includes(f.q)) return false;
  return true;
}
const filtrando = () => {
  const f = UI.f;
  return !!f.q || f.pend.length > 0 || !!f.prioridad || !!f.tipo || !!f.tematica;
};

/* ============================================================
   Render principal
   ============================================================ */
function render(){
  pintarChrome();
  sincronizarFiltros();
  const v = vistaActual();

  elFiltros.hidden = !!v.caja;
  board.classList.toggle('cmode', !!v.caja);
  board.classList.toggle('rows', !v.caja && UI.layout === 'rows');

  if (v.caja) return renderCaja();
  renderTablero(v);
}

/* Una columna por estado y, adentro, una banda por prioridad. Cada banda es su propia
   zona de destino: soltar una tarjeta en la banda «Urgente» de otra columna le cambia
   las dos cosas de una, el estado y la prioridad. Las bandas vacías no se dibujan salvo
   mientras hay un arrastre en curso, para no gastar alto con cuatro títulos por columna. */
function renderTablero(v){
  const mostradas = datos.tareas.filter(visible);

  if (v.soloHoy && !mostradas.length) {
    board.innerHTML = `<p class="empty-board">Todavía no marcaste nada para hoy.<br>Tocá el ☀ de cualquier tarjeta y aparece acá.</p>`;
    return;
  }
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
  const p = prioridadDe(t.prioridad), ty = tipoDe(t.tipo), tm = tematicaDe(t.sec);

  // Prioridad y tipo se leen en la tarjeta. La temática no: los nombres son largos y se
  // comen la ficha, así que va como barrita de color. El tooltip arranca con la palabra
  // "Temática" para que se entienda qué es esa barra sin tener que adivinarlo; el texto
  // completo igual queda en el DOM, para lectores de pantalla y para Ctrl+F.
  const etiqueta = (c, txt, fuerte) =>
    `<span class="tag${fuerte ? ' fuerte' : ''}" style="background:${tint(c,.13)};color:${c}">${esc(txt)}</span>`;
  const barra = (c, txt) =>
    `<span class="tag barra" style="background:${c}" title="Temática: ${escA(txt)}"><b>Temática: ${esc(txt)}</b></span>`;

  const tags = [etiqueta(p.color, p.label, p.id === CRITICA || p.id === 'urgente'), etiqueta(ty.color, ty.label)];
  if (tm) tags.push(barra(colorTematica(tm), tm.titulo || 'Sin nombre'));

  const bits = [`<button class="sun${t.hoy ? ' on' : ''}" data-hoy="${escA(t.id)}" aria-pressed="${t.hoy ? 'true' : 'false'}" title="${t.hoy ? 'Sacarla de hoy' : 'Marcarla para hacerla hoy'}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>Hoy
    </button>`];
  if ((t.chat || []).length) bits.push(`<span class="meta" title="Intervenciones en la conversación"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a8 8 0 0 1-11.5 7.2L3.5 20.5l1.3-6A8 8 0 1 1 21 12z"/></svg>${t.chat.length}</span>`);
  if ((t.files || []).length) bits.push(`<span class="meta" title="Adjuntos"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 11l-8.5 8.5a4.5 4.5 0 1 1-6.4-6.4L13 4.8a3 3 0 1 1 4.2 4.2l-8 8a1.5 1.5 0 0 1-2.1-2.1L14.5 7"/></svg>${t.files.length}</span>`);

  const who = PERSONAS.map(p2 => {
    const on = (t.pend || []).includes(p2.id);
    return `<button class="av${on ? '' : ' off'}"${on ? ` style="background:${p2.color}"` : ''} data-toggle="${escA(t.id)}|${escA(p2.id)}" title="${on ? 'Pendiente de ' : 'Marcar pendiente de '}${escA(p2.nombre)}">${esc(p2.ini)}</button>`;
  }).join('');

  // El agarre no agrega comportamiento: la tarjeta entera ya es arrastrable. Lo que hace
  // es dar un lugar donde el arrastre SIEMPRE arranca —sobre los botones del pie el
  // navegador no lo inicia— y, sobre todo, mostrar que la tarjeta se puede mover.
  return `<article class="card${t.estado === HECHO ? ' done' : ''}${t.hoy ? ' today' : ''}${p.id === CRITICA ? ' critica' : ''}" draggable="true" data-id="${escA(t.id)}" style="--spine:${tint(p.color,.55)}">
    <span class="grip" aria-hidden="true" title="Arrastrá desde acá para mover la tarea de columna"></span>
    <p class="title">${t.tarea ? esc(t.tarea) : '<em>Sin título</em>'}</p>
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
      if (e.target.closest('[data-toggle],[data-hoy]')) return;
      abrirTarea(el.dataset.id);
    });
  });

  $$('[data-toggle]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const [id, quien] = b.dataset.toggle.split('|');
    const t = tarea(id); if (!t) return;
    const antes = [...(t.pend || [])];
    t.pend = t.pend || [];
    const i = t.pend.indexOf(quien);
    i > -1 ? t.pend.splice(i, 1) : t.pend.push(quien);
    render();
    persistirTarea(t, { revertir: () => { t.pend = antes; render(); } });
  });

  $$('[data-hoy]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const t = tarea(b.dataset.hoy); if (!t) return;
    const antes = t.hoy;
    t.hoy = !t.hoy; render();
    aviso(t.hoy ? 'Va para hoy' : 'Sacada de hoy');
    persistirTarea(t, { revertir: () => { t.hoy = antes; render(); } });
  });

  $$('[data-add]').forEach(b => b.onclick = () => nuevaTarea(v, b.dataset.add));

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

function nuevaTarea(v, colId){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const ultimo = datos.tareas.length ? datos.tareas[datos.tareas.length - 1].orden : null;
  const t = {
    id, sec:'', modulo:'', tarea:'', expl:'', estado:'Pendiente', img:'', com:'', fecha:'',
    files:[], chat:[], subtareas:[], prioridad:'semanal', tipo:'nuevo',
    hoy: !!(v && v.soloHoy), pend:[], creada:new Date().toISOString(),
    orden: RoadmapSync.calcularOrden(ultimo, null),
  };
  if (colId && !(v && v.soloHoy)) t.estado = colId;
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
  llenarSelect($('#tTipo'), TIPOS); $('#tTipo').value = t.tipo;
  llenarSelect($('#tTematica'),
    datos.secciones.map(s => ({ id:s.id, label:s.titulo || 'Sin nombre' })), 'Sin temática');
  $('#tTematica').value = tematicaDe(t.sec) ? t.sec : '';

  $('#tTitulo').value = t.tarea;
  $('#tDesc').value = t.expl || '';
  // Se vacía siempre: lo tipeado y no guardado en una tarea no puede aparecer en otra.
  $('#tMsg').value = '';
  $('#tMeta').textContent = t.creada
    ? 'Creada el ' + new Date(t.creada).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })
    : '';
  pintarHoy(t); pintarPend(t); pintarConversacion(t); pintarArchivos(t);
  $('#scrimTarea').classList.add('on');
  autoGrow($('#tTitulo'));
  if (foco) setTimeout(() => $('#tTitulo').focus(), 40);
}

function pintarHoy(t){
  const b = $('#tHoy');
  b.classList.toggle('on', !!t.hoy);
  b.textContent = t.hoy ? '☀ Hoy' : '☀ Realizar hoy';
}

function pintarPend(t){
  $('#tPend').innerHTML = PERSONAS.map(p => {
    const on = (t.pend || []).includes(p.id);
    return `<button class="${on ? 'on' : ''}"${on ? ` style="background:${p.color}"` : ''} data-p="${escA(p.id)}">
      <span class="av mini" style="background:${on ? 'rgba(255,255,255,.28)' : p.color}">${esc(p.ini)}</span>${esc(p.nombre)}
    </button>`;
  }).join('');
  $$('#tPend [data-p]').forEach(b => b.onclick = () => {
    const antes = [...(t.pend || [])];
    t.pend = t.pend || [];
    const i = t.pend.indexOf(b.dataset.p);
    i > -1 ? t.pend.splice(i, 1) : t.pend.push(b.dataset.p);
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
  const cont = $('#tFiles');
  cont.innerHTML = (t.files || []).map((f, i) => {
    const url = RoadmapSync.urlPublica(f);
    return /^image\//.test(f.t)
      ? `<div class="thumb" data-fopen="${i}" title="Abrir ${escA(f.n)}"><img src="${escA(url)}" alt="${escA(f.n)}"><button class="fx" data-fdel="${i}" title="Quitar" aria-label="Quitar ${escA(f.n)}">✕</button></div>`
      : `<span class="filewrap"><a class="doc" href="${escA(url)}" target="_blank" rel="noopener" title="${escA(f.n)} · ${kb(f.size||0)}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3v5h5"/><path d="M19 21H5V3h9l5 5v13z"/></svg>
          <span>${esc(f.n)}</span></a><button class="fx" data-fdel="${i}" title="Quitar" aria-label="Quitar ${escA(f.n)}">✕</button></span>`;
  }).join('');

  $$('[data-fopen]').forEach(el => el.onclick = e => {
    if (e.target.closest('.fx')) return;
    $('#lbImg').src = RoadmapSync.urlPublica(t.files[Number(el.dataset.fopen)]);
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
$('#tDesc').addEventListener('input', e => {
  const t = actual(); if (!t) return;
  campoTareaDebounced(t, 'expl', e.target.value);
});
[['tEstado','estado'], ['tPrioridad','prioridad'], ['tTipo','tipo']].forEach(([elId, campo]) => {
  $('#' + elId).addEventListener('change', e => {
    const t = actual(); if (!t) return;
    const antes = t[campo];
    t[campo] = e.target.value; render();
    persistirTarea(t, { revertir: () => { t[campo] = antes; render(); if (actual() === t) abrirTarea(t.id); } });
  });
});
$('#tTematica').addEventListener('change', e => {
  const t = actual(); if (!t) return;
  const antes = t.sec;
  t.sec = e.target.value || ''; render();
  persistirTarea(t, { revertir: () => { t.sec = antes; render(); if (actual() === t) abrirTarea(t.id); } });
});
$('#tHoy').onclick = () => {
  const t = actual(); if (!t) return;
  const antes = t.hoy;
  t.hoy = !t.hoy; pintarHoy(t); render();
  persistirTarea(t, { revertir: () => { t.hoy = antes; pintarHoy(t); render(); } });
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
   Temáticas
   ============================================================ */
function pintarTem(){
  $('#temList').innerHTML = datos.secciones.map(s => `
    <div class="tem-row">
      <input type="color" value="${escA(colorTematica(s))}" data-tc="${escA(s.id)}" aria-label="Color de la temática">
      <input type="text" value="${escA(s.titulo)}" data-tl="${escA(s.id)}" placeholder="Nombre de la temática">
      <span class="hint">${datos.tareas.filter(t => t.sec === s.id).length}</span>
      <button class="x" data-td="${escA(s.id)}" title="Borrar" aria-label="Borrar temática">✕</button>
    </div>`).join('') || '<p class="hint">Todavía no hay temáticas.</p>';

  $$('[data-tc]').forEach(el => el.oninput = () => {
    const s = tematicaDe(el.dataset.tc); if (!s) return;
    const antes = s.color;
    s.color = el.value; render();
    guardarDebounced('sec-color:' + s.id, () =>
      persistirSeccion(s, { revertir: () => { s.color = antes; render(); pintarTem(); } }));
  });
  $$('[data-tl]').forEach(el => el.oninput = () => {
    const s = tematicaDe(el.dataset.tl); if (!s) return;
    const clave = 'sec:' + s.id;
    if (!snaps.has(clave)) snaps.set(clave, s.titulo);
    s.titulo = el.value; render();
    guardarDebounced(clave, () => {
      persistirSeccion(s, { revertir: () => { s.titulo = snaps.get(clave); render(); pintarTem(); } })
        .then(() => { if (!pendientesGuardado.has(clave)) snaps.delete(clave); });
    });
  });
  $$('[data-td]').forEach(el => el.onclick = async () => {
    const s = tematicaDe(el.dataset.td); if (!s) return;
    const suyas = datos.tareas.filter(t => t.sec === s.id);
    if (!confirm(suyas.length
      ? `La temática «${s.titulo || 'sin nombre'}» tiene ${suyas.length} tarea(s). Se borra la temática y esas tareas quedan en «Sin temática». ¿Seguir?`
      : `¿Borrar la temática «${s.titulo || 'sin nombre'}»?`)) return;

    const idx = datos.secciones.findIndex(x => x.id === s.id);
    const antesSec = suyas.map(t => t.sec);
    datos.secciones = datos.secciones.filter(x => x.id !== s.id);
    suyas.forEach(t => { t.sec = ''; });
    pintarTem(); render();
    // Las tareas se desenganchan primero: si no, el borrado en cascada de la base se
    // las lleva puestas junto con la temática.
    const ok = await conEstadoDeCarga(async () => {
      for (const t of suyas) await RoadmapSync.guardarTarea(t);
      await RoadmapSync.borrarSeccion(s.id);
    }, {
      onEstado: onEstadoGlobal,
      revertir: () => {
        datos.secciones.splice(idx, 0, s);
        suyas.forEach((t, i) => { t.sec = antesSec[i]; });
        pintarTem(); render();
      },
    });
    if (ok) marcarEcoPropio(RoadmapSync.TABLAS.secciones, s.id);
  });
}

function agregarTem(){
  const inp = $('#temNew'), v = inp.value.trim();
  if (!v) return;
  const id = nuevoId('s', datos.secciones.map(x => x.id));
  const ultima = datos.secciones.length ? datos.secciones[datos.secciones.length - 1].orden : null;
  const s = { id, titulo:v, color:PALETA[datos.secciones.length % PALETA.length], orden:RoadmapSync.calcularOrden(ultima, null) };
  datos.secciones.push(s);
  inp.value = '';
  pintarTem(); render();
  persistirSeccion(s, {
    revertir: () => { datos.secciones = datos.secciones.filter(x => x.id !== id); pintarTem(); render(); },
  });
}

/* ============================================================
   Caja · planilla de movimientos
   ============================================================ */
const fmtMoney = n => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits:2, maximumFractionDigits:2 });
const CATEGORIAS = ['Sueldos','Servicios','Herramientas','Publicidad','Impuestos','Aporte','Cobro','Otros'];

/* Cada movimiento lo pone alguien de su bolsillo. Lo que sale (monto negativo) es plata
   que esa persona puso; lo que entra (positivo) es plata que recuperó. Como el gasto es
   de los dos, al final cada uno debería haber puesto la mitad: quien puso de más queda
   a favor por la mitad de la diferencia. Nada se prorratea todavía, solo se lleva la
   cuenta de para qué lado está el saldo. */
function saldoCaja(movs){
  const puesto = p => movs.filter(m => m.quien === p.id).reduce((a, m) => a - m.monto, 0);
  const cuentas = PERSONAS_CAJA.map(p => ({ p, puesto: puesto(p) }));
  const total = cuentas.reduce((a, c) => a + c.puesto, 0);
  const parte = cuentas.length ? total / cuentas.length : 0;
  const conSaldo = cuentas.map(c => ({ ...c, saldo: c.puesto - parte }));
  const aFavor = [...conSaldo].sort((a, b) => b.saldo - a.saldo)[0] || null;
  const enContra = [...conSaldo].sort((a, b) => a.saldo - b.saldo)[0] || null;
  return { cuentas: conSaldo, total, aFavor, enContra };
}

function renderCaja(){
  const nuevos = generarRecurrentes();
  if (nuevos) aviso(nuevos === 1 ? 'Se cargó 1 gasto fijo que faltaba' : `Se cargaron ${nuevos} gastos fijos que faltaban`);

  // La planilla se lee por fecha, no por el orden en que se fue cargando: si no, los
  // gastos fijos que se generan solos caen todos al final y no se entiende nada.
  const movs = [...datos.caja].sort((a, b) =>
    (a.fecha || '9999-99-99').localeCompare(b.fecha || '9999-99-99') || (a.orden || 0) - (b.orden || 0));
  const { cuentas, total, aFavor, enContra } = saldoCaja(movs);
  const fijos = datos.caja.filter(m => m.repite === 'mensual');

  const tarjetaPersona = c => `<div class="saldo-card">
    <div class="lbl"><span class="av mini" style="background:${c.p.color}">${esc(c.p.ini)}</span>${esc(c.p.nombre)}</div>
    <div class="val">${fmtMoney(c.puesto)}</div>
    <span class="sub">puso · ${movs.filter(m => m.quien === c.p.id).length} mov.</span>
  </div>`;

  const enPaz = !aFavor || Math.abs(aFavor.saldo) < 0.005;
  const resumen = enPaz
    ? `<div class="val">Están a mano</div><span class="sub">puesto entre los dos: ${fmtMoney(total)}</span>`
    : `<div class="val">${esc(aFavor.p.nombre)} · ${fmtMoney(aFavor.saldo)}</div>
       <span class="sub">${esc(enContra.p.nombre)} le debe esa diferencia · puesto entre los dos: ${fmtMoney(total)}</span>`;

  board.innerHTML = `<div class="caja-wrap">
    <p class="caja-intro">${esc(CFG.caja?.intro || 'Planilla de movimientos.')}</p>
    <div class="caja-top">
      <div class="saldo-card total">
        <div class="lbl">A favor de</div>
        ${resumen}
      </div>
      ${cuentas.map(tarjetaPersona).join('')}
    </div>
    <div class="caja-tabla-wrap">
      <table class="caja">
        <thead><tr>
          <th style="width:130px">Fecha</th>
          <th>Concepto</th>
          <th style="width:124px">Quién</th>
          <th style="width:140px">Categoría</th>
          <th class="num" style="width:148px">Monto (+ entra / − sale)</th>
          <th style="width:180px">Notas</th>
          <th style="width:38px" title="Se repite todos los meses">Fijo</th>
          <th style="width:38px"></th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <button class="caja-add" type="button">+  Nuevo movimiento</button>
    <p class="caja-tip">Se mueve como una planilla: <kbd>Tab</kbd> pasa de celda, <kbd>↑</kbd> <kbd>↓</kbd> suben y bajan por la misma columna, y <kbd>Enter</kbd> al final agrega una fila nueva.<br>
      El <b>↻</b> marca un gasto fijo: se vuelve a cargar solo cada mes, con el mismo importe, hasta el mes en curso.${fijos.length ? ` Hoy hay ${fijos.length} ${fijos.length === 1 ? 'gasto fijo' : 'gastos fijos'}.` : ''}</p>
  </div>`;

  const tbody = board.querySelector('tbody');
  if (!movs.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="caja-vacia">Sin movimientos todavía. Agregá el primero abajo.</td></tr>`;
  } else {
    movs.forEach(m => tbody.appendChild(filaCaja(m)));
  }
  board.querySelector('.caja-add').onclick = () => nuevoMovimiento();
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

function nuevoMovimiento(){
  const id = nuevoId('M', datos.caja.map(x => x.id));
  const ultimo = datos.caja.length ? Math.max(...datos.caja.map(x => x.orden || 0)) : null;
  const mio = PERSONAS_CAJA.some(p => p.id === YO.id) ? YO.id : '';
  const m = {
    id, fecha:new Date().toISOString().slice(0, 10), concepto:'', categoria:'',
    monto:0, quien:mio, notas:'', repite:'', origen:'',
    orden:RoadmapSync.calcularOrden(ultimo, null),
  };
  datos.caja.push(m);
  renderCaja();
  persistirMovimiento(m, { revertir: () => { datos.caja = datos.caja.filter(x => x.id !== id); renderCaja(); } });
  board.querySelector(`tr[data-id="${m.id}"] [data-c="concepto"]`)?.focus();
}

function filaCaja(m){
  const tr = document.createElement('tr');
  tr.dataset.id = m.id;
  if (m.origen) tr.classList.add('generada');
  const cls = m.monto > 0 ? 'pos' : (m.monto < 0 ? 'neg' : '');
  // La lista de gente es la de la caja, pero si el movimiento quedó a nombre de alguien
  // que ya no participa se le agrega igual su opción: nadie cambia de dueño solo.
  const gente = PERSONAS_CAJA.some(p => p.id === m.quien) || !m.quien
    ? PERSONAS_CAJA
    : PERSONAS_CAJA.concat(PERSONAS.filter(p => p.id === m.quien));
  const fijo = m.origen
    ? `<span class="caja-rep hecha" title="Copia automática del gasto fijo — se genera todos los meses">↻</span>`
    : `<button class="caja-rep${m.repite === 'mensual' ? ' on' : ''}" type="button" title="${m.repite === 'mensual' ? 'Es un gasto fijo: dejar de repetirlo' : 'Repetir este movimiento todos los meses'}" aria-pressed="${m.repite === 'mensual'}">↻</button>`;

  tr.innerHTML = `
    <td><input class="cinp" type="date" data-c="fecha" value="${escA(m.fecha)}" aria-label="Fecha"></td>
    <td><input class="cinp" data-c="concepto" value="${escA(m.concepto)}" placeholder="En qué se fue / de dónde vino" aria-label="Concepto"></td>
    <td><select class="cinp" data-c="quien" aria-label="Quién" style="color:${m.quien ? colorPersona(m.quien) : 'var(--ink-3)'}">
      <option value="">— quién</option>
      ${gente.map(p => `<option value="${escA(p.id)}"${m.quien === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}
    </select></td>
    <td><input class="cinp" data-c="categoria" list="catCaja" value="${escA(m.categoria)}" placeholder="Categoría" aria-label="Categoría"></td>
    <td><input class="cinp num ${cls}" type="number" step="0.01" data-c="monto" value="${m.monto || 0}" aria-label="Monto"></td>
    <td><input class="cinp" data-c="notas" value="${escA(m.notas)}" placeholder="Notas" aria-label="Notas"></td>
    <td>${fijo}</td>
    <td><button class="caja-del" type="button" title="Borrar movimiento" aria-label="Borrar movimiento">✕</button></td>`;

  if (!document.getElementById('catCaja')) {
    const dl = document.createElement('datalist');
    dl.id = 'catCaja';
    dl.innerHTML = CATEGORIAS.map(c => `<option value="${escA(c)}">`).join('');
    document.body.appendChild(dl);
  }

  tr.querySelectorAll('[data-c]').forEach(inp => {
    const escribir = () => {
      const campo = inp.dataset.c;
      let val = inp.value;
      if (campo === 'monto') {
        val = parseFloat(inp.value) || 0;
        inp.classList.remove('pos', 'neg');
        if (val) inp.classList.add(val > 0 ? 'pos' : 'neg');
      }
      if (campo === 'quien') inp.style.color = val ? colorPersona(val) : 'var(--ink-3)';
      editarCaja(m, campo, val);
      if (campo === 'monto' || campo === 'quien') actualizarTotalesCaja();
    };
    inp.oninput = escribir;
    if (inp.tagName === 'SELECT') inp.onchange = escribir;

    // Navegación tipo planilla: flechas para moverse por la columna, Enter para bajar
    // (y crear fila nueva si ya estás en la última).
    inp.addEventListener('keydown', e => {
      if (!['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;
      if (inp.tagName === 'SELECT' && e.key !== 'Enter') return;
      const filas = [...board.querySelectorAll('tbody tr[data-id]')];
      const i = filas.indexOf(tr);
      const destino = e.key === 'ArrowUp' ? i - 1 : i + 1;
      if (destino >= filas.length) {
        if (e.key === 'Enter') { e.preventDefault(); nuevoMovimiento(); }
        return;
      }
      if (destino < 0) return;
      e.preventDefault();
      filas[destino].querySelector(`[data-c="${inp.dataset.c}"]`)?.focus();
    });
  });

  const btnRep = tr.querySelector('button.caja-rep');
  if (btnRep) btnRep.onclick = () => {
    const antes = m.repite || '';
    m.repite = antes === 'mensual' ? '' : 'mensual';
    if (m.repite === 'mensual' && !m.fecha) { m.repite = ''; aviso('Ponele fecha al movimiento antes de marcarlo como fijo'); return; }
    renderCaja();
    aviso(m.repite ? 'Gasto fijo: se va a repetir todos los meses' : 'Ya no se repite');
    persistirMovimiento(m, { revertir: () => { m.repite = antes; renderCaja(); } });
  };

  tr.querySelector('.caja-del').onclick = async () => {
    if (!confirm('Se borra el movimiento. ¿Seguir?')) return;
    const idx = datos.caja.findIndex(x => x.id === m.id);
    datos.caja = datos.caja.filter(x => x.id !== m.id);
    renderCaja();
    const ok = await conEstadoDeCarga(() => RoadmapSync.borrarMovimiento(m.id), {
      onEstado: onEstadoGlobal,
      revertir: () => { datos.caja.splice(idx, 0, m); renderCaja(); },
    });
    if (ok) marcarEcoPropio(RoadmapSync.TABLAS.caja, m.id);
  };
  return tr;
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

// Recalcula solo los números de arriba, para no repintar la planilla mientras se escribe.
function actualizarTotalesCaja(){
  const tarjetas = board.querySelectorAll('.saldo-card');
  if (!tarjetas.length) return;
  const { cuentas, total, aFavor, enContra } = saldoCaja(datos.caja);

  const enPaz = !aFavor || Math.abs(aFavor.saldo) < 0.005;
  tarjetas[0].querySelector('.val').textContent = enPaz ? 'Están a mano' : `${aFavor.p.nombre} · ${fmtMoney(aFavor.saldo)}`;
  tarjetas[0].querySelector('.sub').textContent = enPaz
    ? `puesto entre los dos: ${fmtMoney(total)}`
    : `${enContra.p.nombre} le debe esa diferencia · puesto entre los dos: ${fmtMoney(total)}`;

  cuentas.forEach((c, i) => {
    const card = tarjetas[i + 1]; if (!card) return;
    card.querySelector('.val').textContent = fmtMoney(c.puesto);
    card.querySelector('.sub').textContent = `puso · ${datos.caja.filter(m => m.quien === c.p.id).length} mov.`;
  });
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
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]') || e.target.classList.contains('scrim')) cerrarModales();
});
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  if (e.key === 'Escape') { cerrarModales(); return; }
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    e.preventDefault(); $('#q').focus();
  }
});

$('#q').addEventListener('input', e => { UI.f.q = e.target.value.trim().toLowerCase(); render(); });
['Prioridad','Tipo','Tematica'].forEach(k => {
  $('#f' + k).addEventListener('change', e => { UI.f[k.toLowerCase()] = e.target.value; render(); });
});
$$('[data-layout]').forEach(b => b.onclick = () => { UI.layout = b.dataset.layout; guardarUI(); render(); });
$('#bNueva').onclick = () => {
  // Desde la Caja no hay tablero donde mostrarla: se vuelve a una vista de tareas para
  // que la tarea recién creada quede a la vista al cerrar el detalle.
  const v = vistaActual();
  if (v.caja) { UI.vista = 'estado'; guardarUI(); render(); }
  nuevaTarea(vistaActual(), null);
};
$('#bTem').onclick = () => { pintarTem(); $('#scrimTem').classList.add('on'); };
$('#temAdd').onclick = agregarTem;
$('#temNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregarTem(); } });

$('#bCsv').onclick = () => {
  const nombreSec = {}; datos.secciones.forEach(s => { nombreSec[s.id] = s.titulo; });
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['ID','Titulo','Tematica','Estado','Prioridad','Tipo','Pendiente de','Hoy','Notas','Subtareas','Conversacion','Archivos'];
  const filas = datos.tareas.map(t => [
    t.id, t.tarea, nombreSec[t.sec] || '',
    estadoDe(t.estado).label, prioridadDe(t.prioridad).label, tipoDe(t.tipo).label,
    (t.pend || []).map(nombrePersona).join(' | '),
    t.hoy ? 'si' : '', t.expl,
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
    datos = { secciones:[], tareas:[], caja:[] };
  }
  normalizarDatos();
  render();
  revisarEsquema();
  if (!YO.id) {
    aviso('Tu cuenta todavía no está asociada a una persona del tablero. Avisale a Antonio.');
  }
}

// Si falta correr supabase/schema-v3.sql, el tablero se ve pero no puede guardar los
// campos nuevos. Mejor decirlo en pantalla que dejar que falle en silencio al guardar.
// Va en el ícono del encabezado: el detalle se lee al pasar el cursor por encima.
async function revisarEsquema(){
  let faltan = [];
  try { faltan = await RoadmapSync.faltantesDeEsquema(); } catch (e) { return; }
  if (!faltan.length) { elAviso.hidden = true; return; }
  elAviso.hidden = false;
  elAvisoTexto.innerHTML = `<b>Falta un paso en la base de datos.</b> Todavía no se puede guardar: ${esc(faltan.join(', '))}. `
    + `Hay que correr <b>supabase/schema-v3.sql</b> y <b>schema-v4.sql</b> en el SQL Editor de Supabase (lo hace Antonio).`;
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
      datos = { secciones:[], tareas:[], caja:[] };
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
