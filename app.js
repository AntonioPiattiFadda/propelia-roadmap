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
// (prioridad, tipo) quedaron como filtros de la barra, no como vistas.
//
// No todas las vistas pintan tarjetas. `caja` es una planilla y `doc` es una hoja de
// texto —Visión—: las dos ocupan el board entero, esconden los filtros y no saben nada
// de tareas. La marca la lleva la vista, no el render, así el resto del archivo pregunta
// `v.doc` en vez de comparar contra el id 'vision' en diez lugares distintos.
const VISTAS = [
  { id:'hoy',    label:'☀ Hoy',    soloHoy:true },
  { id:'estado', label:'Estado' },
  { id:'vision', label:'◦ Visión', doc:true },
  { id:'caja',   label:'Caja',     caja:true },
];
// Vistas que no muestran tareas: ni filtros, ni contador, ni «+ Nueva tarea» con sentido.
const sinTareas = v => !!(v.caja || v.doc);

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

// Identidad de quien está usando el tablero (se resuelve al iniciar sesión).
let YO = { id:'', nombre:'', esMiembro:false };

/* ---------- datos y estado de pantalla ---------- */
let datos = { tareas: [], caja: [], vision: [] };
let UI = {
  vista: 'estado',
  layout: 'cols',
  // La columna de Terminadas arranca plegada: es lo que ya no hay que mirar.
  terminadasAbiertas: false,
  f: { q:'', pend:[], prioridad:'', tipo:'' },
};
try {
  const guardado = JSON.parse(localStorage.getItem('tablero-ui') || '{}');
  if (guardado.vista && VISTAS.some(v => v.id === guardado.vista)) UI.vista = guardado.vista;
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
  // Visión: una línea cuyo padre ya no está se volvería invisible, y con ella toda su
  // rama. Sube a primer nivel en vez de desaparecer — la base la borra en cascada, así
  // que esto solo pasa si dos personas borran y escriben al mismo tiempo.
  const ids = new Set(datos.vision.map(i => i.id));
  datos.vision.forEach(i => { if (i.padre && !ids.has(i.padre)) i.padre = ''; });
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
  // La ficha de archivos puede estar plegada: si acaba de entrar algo, se abre sola. Un
  // adjunto que se guarda sin que se vea es un adjunto que nadie sabe que está.
  if (n) $('#tSecFiles').open = true;
  if (saltados.length) aviso('No pude adjuntar: ' + saltados.join(', ') + '. Subilo a Drive y pegá el enlace.');
  else if (n) aviso((n === 1 ? '1 archivo adjuntado' : n + ' archivos adjuntados') + (ahorro > 512000 ? ' · ' + kb(ahorro) + ' ahorrados al comprimir' : ''));
}

async function borrarTodosLosArchivos(t){
  // Las imágenes pegadas dentro de la explicación no están en `t.files` —viven en el
  // propio texto—, pero ocupan lugar en el bucket igual que cualquier adjunto.
  const files = [
    ...(t.files || []),
    ...((t.subtareas || []).flatMap(s => s.files || [])),
    ...imagenesDeExpl(t.expl),
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
    // Filtrar desde una vista que no muestra tareas no se vería en ningún lado: se
    // vuelve al tablero, que es donde ese filtro tiene efecto.
    if (UI.f.prioridad && sinTareas(vistaActual())) { UI.vista = 'estado'; guardarUI(); }
    render();
  };

  const nHoy = datos.tareas.filter(t => t.hoy).length;
  const pendVision = datos.vision.filter(i => esTarea(i) && !i.hecho).length;
  elVistas.innerHTML = VISTAS.map(v => {
    const on = UI.vista === v.id;
    // El contador de cada pestaña dice lo que esa pestaña sabe contar: Hoy muestra
    // siempre lo marcado para hoy, Visión lo que le queda sin tildar, y Estado el
    // resultado del filtro —solo cuando está activa, porque fuera de ella el número
    // sería el de un filtro que no se está viendo.
    let badge = '';
    if (v.soloHoy) badge = `<small>${nHoy}</small>`;
    else if (v.doc) badge = pendVision ? `<small>${pendVision}</small>` : '';
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
  $$('#filtros .sel').forEach(s => s.classList.toggle('activo', !!s.value));
}

function textoBuscable(t){
  return [
    t.tarea, explATexto(t.expl), t.id,
    (t.subtareas || []).map(s => s.titulo + ' ' + (s.expl || '')).join(' '),
    (t.chat || []).map(m => m.texto).join(' '),
  ].join(' ').toLowerCase();
}
function visible(t){
  const f = UI.f;
  if (vistaActual().soloHoy && !t.hoy) return false;
  if (f.prioridad && t.prioridad !== f.prioridad) return false;
  if (f.tipo && t.tipo !== f.tipo) return false;
  if (f.pend.length && !f.pend.some(p => (t.pend || []).includes(p))) return false;
  if (f.q && !textoBuscable(t).includes(f.q)) return false;
  return true;
}
const filtrando = () => {
  const f = UI.f;
  return !!f.q || f.pend.length > 0 || !!f.prioridad || !!f.tipo;
};

/* ============================================================
   Render principal
   ============================================================ */
function render(){
  pintarChrome();
  sincronizarFiltros();
  const v = vistaActual();

  // La caja y la hoja de Visión ocupan el board entero y no se filtran: `cmode` les
  // saca la grilla de columnas y les da un scroll de página normal.
  elFiltros.hidden = sinTareas(v);
  board.classList.toggle('cmode', sinTareas(v));
  board.classList.toggle('dmode', !!v.doc);
  board.classList.toggle('rows', !sinTareas(v) && UI.layout === 'rows');

  if (v.caja) return renderCaja();
  if (v.doc) return renderVision();
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
  const p = prioridadDe(t.prioridad), ty = tipoDe(t.tipo);

  const etiqueta = (c, txt, fuerte) =>
    `<span class="tag${fuerte ? ' fuerte' : ''}" style="background:${tint(c,.13)};color:${c}">${esc(txt)}</span>`;

  const tags = [etiqueta(p.color, p.label, p.id === CRITICA || p.id === 'urgente'), etiqueta(ty.color, ty.label)];

  const bits = [`<button class="sun${t.hoy ? ' on' : ''}" data-hoy="${escA(t.id)}" aria-pressed="${t.hoy ? 'true' : 'false'}" title="${t.hoy ? 'Sacarla de hoy' : 'Marcarla para hacerla hoy'}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>Hoy
    </button>`];
  const pasos = t.subtareas || [], hechos = pasos.filter(s => s.estado === HECHO).length;
  if (pasos.length) bits.push(`<span class="meta" title="Checklist: ${hechos} de ${pasos.length} ${pasos.length === 1 ? 'paso hecho' : 'pasos hechos'}"><span class="subbar"><i style="width:${Math.round(hechos / pasos.length * 100)}%"></i></span>${hechos}/${pasos.length}</span>`);
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
    id, modulo:'', tarea:'', expl:'', estado:'Pendiente', img:'', com:'', fecha:'',
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

  $('#tTitulo').value = t.tarea;
  pintarExpl(t);
  // Se vacía siempre: lo tipeado y no guardado en una tarea no puede aparecer en otra.
  $('#tMsg').value = '';
  $('#tMeta').textContent = t.creada
    ? 'Creada el ' + new Date(t.creada).toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })
    : '';
  $('#tPasoNew').value = '';
  // Lo que está vacío arranca plegado: el alto que no gasta es el de la explicación. Se
  // decide solo acá, al abrir — si se decidiera en cada repintado, cerrar una ficha a mano
  // duraría hasta el próximo tilde.
  $('#tSecPasos').open = !!(t.subtareas || []).length;
  $('#tSecChat').open  = !!(t.chat || []).length;
  $('#tSecFiles').open = !!(t.files || []).length;
  pintarHoy(t); pintarPend(t); pintarPasos(t); pintarConversacion(t); pintarArchivos(t);
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

// Un `<template>` y no un div suelto: su contenido es inerte, así que leer el texto de una
// explicación no dispara la descarga de todas sus imágenes.
function fragmentoExpl(s){
  const tpl = document.createElement('template');
  tpl.innerHTML = s;
  return tpl.content;
}
// Para el buscador y el CSV, donde una imagen no significa nada pero un salto de línea sí.
function explATexto(s){
  if (!esExplHtml(s)) return s || '';
  const frag = fragmentoExpl(s.slice(MARCA_HTML.length).replace(/<(?:br|\/div|\/p)\b[^>]*>/gi, '\n'));
  frag.querySelectorAll('img').forEach(i => i.replaceWith(document.createTextNode(' [imagen] ')));
  return frag.textContent;
}
// Las imágenes pegadas no están en `t.files`: se las reconoce por los datos del archivo que
// quedaron colgados del propio `<img>`.
function imagenesDeExpl(s){
  if (!esExplHtml(s)) return [];
  return [...fragmentoExpl(s.slice(MARCA_HTML.length)).querySelectorAll('img[data-path]')]
    .map(i => ({ path: i.dataset.path, b: i.dataset.b || '', n: i.alt || '', t: '', size: 0 }));
}

function pintarExpl(t){
  $('#tDesc').innerHTML = explAHtml(t.expl);
  marcarExplVacia();
}
// El placeholder lo dibuja el CSS, pero la condición no la puede escribir: un
// contenteditable donde se escribió y se borró queda con un `<br>` adentro y deja de ser
// `:empty` para siempre.
function marcarExplVacia(){
  const el = $('#tDesc');
  el.classList.toggle('vacio', !el.textContent.trim() && !el.querySelector('img'));
}
// Lo que todavía está subiendo apunta a un `blob:` que muere al recargar la página: se
// guarda el texto sin esas imágenes y cada una entra sola cuando su subida termina.
function leerExpl(){
  const copia = $('#tDesc').cloneNode(true);
  copia.querySelectorAll('img.cargando').forEach(i => i.remove());
  return MARCA_HTML + copia.innerHTML;
}
function guardarExpl(){
  const t = actual(); if (!t) return;
  campoTareaDebounced(t, 'expl', leerExpl());
}

function insertarEnCursor(nodo){
  const el = $('#tDesc'), sel = document.getSelection();
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
async function pegarImagenesEnExpl(t, files){
  // Primero entran todas las miniaturas, en orden y de una sola vez: si cada una esperara
  // su subida, la segunda imagen de un pegado aparecería recién cuando termina la primera.
  const pendientes = files.map(f => {
    const img = document.createElement('img');
    img.className = 'cargando';
    img.alt = f.name || 'imagen pegada';
    img.src = URL.createObjectURL(f);
    insertarEnCursor(img);
    return { f, img };
  });
  marcarExplVacia();

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
      img.remove(); marcarExplVacia(); onEstadoGlobal('ok');
      aviso('No pude pegar la imagen: ' + (e.message || 'error al subir'));
      continue;
    }
    // Si el detalle se cerró o se cambió de tarea mientras subía, el `<img>` ya no está en
    // pantalla: no hay dónde guardarla, así que se borra en vez de dejarla huérfana.
    if (!img.isConnected || actual() !== t) {
      URL.revokeObjectURL(img.src);
      RoadmapSync.borrarArchivo(archivo).catch(() => {});
      onEstadoGlobal('ok');
      aviso('Se cerró la tarea antes de que terminara de subir la imagen. Pegala de nuevo.');
      continue;
    }
    const provisoria = img.src;
    img.src = RoadmapSync.urlPublica(archivo);
    img.dataset.path = archivo.path;
    img.dataset.b = archivo.b || '';
    img.alt = archivo.n;
    img.classList.remove('cargando');
    URL.revokeObjectURL(provisoria);
    // Cierra el 'cargando' de la subida; el guardado del texto abre y cierra el suyo.
    onEstadoGlobal('ok');
    guardarExpl();
  }
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
  const cont = $('#tFiles');
  $('#tFilesCount').textContent = (t.files || []).length || '';
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

/* Pegar y soltar sobre la explicación. Las imágenes van adentro del texto, donde estaba el
   cursor; cualquier otro archivo no se puede dibujar en un renglón, así que sigue yendo a
   los adjuntos de abajo. Lo demás entra como texto plano —a propósito: es lo que mantiene
   fuera el HTML de otras páginas, con sus estilos, sus scripts y su ruido. */
function repartirPegado(t, dt){
  const files = [...(dt?.files || [])].filter(f => f.size);
  const imgs  = files.filter(f => /^image\//.test(f.type));
  const otros = files.filter(f => !/^image\//.test(f.type));
  if (otros.length) adjuntar(t, otros);
  if (imgs.length) { pegarImagenesEnExpl(t, imgs); return; }
  if (files.length) return;
  const txt = dt?.getData('text/plain') || '';
  // `insertText` porque es lo único que deja el pegado en la pila de deshacer del navegador.
  // Está deprecado y algún día no va a estar: si devuelve false, se inserta a mano.
  if (txt && !document.execCommand?.('insertText', false, txt)) {
    insertarEnCursor(document.createTextNode(txt));
  }
  marcarExplVacia(); guardarExpl();
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
   Visión · la hoja
   ------------------------------------------------------------
   Una página del estilo de Notion: renglones apretados, letra chica y todo el documento
   a la vista de una. Cada renglón es de un tipo —título, subtítulo, tarea o texto— y
   cualquiera puede tener renglones adentro. Una tarea con tareas adentro es una checklist
   con subchecklist; no hace falta nada más para armarla.

   Cuatro decisiones que explican casi todo el código de acá abajo:

   1. **El tipo y la jerarquía son cosas distintas.** El tipo dice cómo se ve el renglón
      (`tipo`); la jerarquía, de quién cuelga (`padre`). Son ortogonales a propósito: una
      tarea puede colgar de un título, y un título puede colgar de una tarea. Atarlas
      —"lo que cuelga de un título es siempre una tarea"— obligaría a inventar reglas para
      cada mezcla y ninguna sería la que uno quiere el día que la necesita.
   2. La jerarquía vive en `padre`, no en una lista anidada. Mover una línea es cambiarle
      una cadena y un número, y se guarda esa fila sola — no la rama entera.
   3. El plegado NO se guarda en la base. Que alguien cierre un bloque para leer cómodo
      no tiene por qué cerrárselo a los demás: eso es del navegador de cada uno.
   4. Se repinta la hoja completa ante cualquier cambio de estructura, y se devuelve el
      foco a mano con `foco`. Es más simple de sostener que ir moviendo nodos del DOM, y
      la hoja es chica. El tilde y el texto, en cambio, se pintan quirúrgicamente: ahí
      hay un cursor en juego.

   Las clases CSS de acá van todas con prefijo `hoja-`/`v`. **No usar `.doc`**: esa clase
   ya es el chip de adjuntos del detalle de tarea, y pisarla deja la hoja entera dibujada
   como una pastilla de 34px.
   ============================================================ */

/* Los tipos de renglón. `id` es lo que se guarda en la base; `atajo` es lo que se escribe
   al principio de la línea para convertirla, como en Markdown. El orden importa: se prueba
   de arriba abajo, así '## ' gana antes de que '# ' se lo lleve. */
const TIPOS_HOJA = [
  { id:'titulo',    label:'Título',    glifo:'H₁', atajo:/^#\s/,          nuevo:'texto' },
  { id:'subtitulo', label:'Subtítulo', glifo:'H₂', atajo:/^##\s/,         nuevo:'texto' },
  { id:'check',     label:'Tarea',     glifo:'☐',  atajo:/^(\[[ xX]?\]|[-*])\s/, nuevo:'check' },
  { id:'texto',     label:'Texto',     glifo:'¶',  atajo:/^\|\s/,         nuevo:'texto' },
];
// Las filas guardadas antes de que existieran los tipos no tienen `tipo`: son tareas, que
// es lo único que había. Por eso el valor por defecto es 'check' y no 'texto'.
const tipoHoja = i => TIPOS_HOJA.find(t => t.id === (i.tipo || 'check')) || TIPOS_HOJA[2];
const esTarea  = i => (i.tipo || 'check') === 'check';

/* Qué bloques quedaron cerrados. Es preferencia de lectura, no dato del tablero. */
let plegados = new Set();
try { plegados = new Set(JSON.parse(localStorage.getItem('vision-plegados') || '[]')); }
catch (e) { /* si no se puede leer, la hoja abre entera y listo */ }
function guardarPlegados(){
  try { localStorage.setItem('vision-plegados', JSON.stringify([...plegados])); }
  catch (e) { /* modo privado o storage lleno: no es crítico */ }
}

const itemVision = id => datos.vision.find(i => i.id === id) || null;
const hijosVision = padre => datos.vision
  .filter(i => (i.padre || '') === (padre || ''))
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));

function descendientesVision(id, acc = []){
  hijosVision(id).forEach(h => { acc.push(h); descendientesVision(h.id, acc); });
  return acc;
}

/* La hoja aplanada en el orden en que se lee, con el nivel de cada línea. Los bloques
   cerrados no aportan sus hijos: no están en pantalla y no hay que dibujarlos.
   `vistos` es un cinturón de seguridad contra una rama que apunte a sí misma: no debería
   poder pasar desde el tablero, pero un ciclo acá sería un cuelgue del navegador. */
function hojaVision(){
  const filas = [], vistos = new Set();
  const bajar = (padre, nivel) => {
    hijosVision(padre).forEach(i => {
      if (vistos.has(i.id)) return;
      vistos.add(i.id);
      const hijos = hijosVision(i.id).length;
      filas.push({ i, nivel, hijos });
      if (hijos && !plegados.has(i.id)) bajar(i.id, nivel + 1);
    });
  };
  bajar('', 0);
  return filas;
}

async function persistirItemVision(i, opts = {}){
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarItemVision(i),
    { onEstado: onEstadoGlobal, ...opts });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.vision, i.id);
  return ok;
}

/* ---------- pintado ---------- */

/* La hoja no tiene encabezado, ni barra de progreso, ni pie de ayuda, ni recuadro para
   empezar. Es una hoja en blanco de ancho completo: renglones y nada más. Todo lo que se
   agregue acá arriba le come lugar a lo único que importa, que es la lista.

   Abajo de todo hay una zona de clic alta: es el «hacer clic en el vacío para seguir
   escribiendo» de Notion, y hace innecesario un botón de «agregar». Cuando la hoja está
   vacía, esa misma zona es la que invita a escribir o pegar. */
function renderVision(foco){
  const filas = hojaVision();
  const vacia = !datos.vision.length;

  board.innerHTML = `<div class="hoja">
    ${CFG.visionUrl ? `<div class="hoja-top"><a class="hoja-notion" href="${escA(CFG.visionUrl)}"
      target="_blank" rel="noopener noreferrer" title="Se abre en otra pestaña">Ver en Notion<svg width="10" height="10"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a></div>` : ''}
    <div class="hoja-list">${filas.map(filaVisionHTML).join('')}</div>
    <div class="hoja-fin"${vacia ? ' data-vacia="1"' : ''} role="button" tabindex="0"
      aria-label="Escribir un renglón nuevo"></div>
  </div>`;

  filas.forEach(f => engancharFila(board.querySelector(`.vrow[data-id="${CSS.escape(f.i.id)}"]`), f.i));

  const fin = board.querySelector('.hoja-fin');
  fin.onclick = () => nuevaLineaVision(null);
  fin.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nuevaLineaVision(null); } };

  if (foco) {
    const ta = board.querySelector(`.vrow[data-id="${CSS.escape(foco.id)}"] .vtxt`);
    if (ta) { ta.focus(); const p = foco.pos == null ? ta.value.length : Math.min(foco.pos, ta.value.length); ta.setSelectionRange(p, p); }
  }
}

/* Un renglón. Lo único que cambia entre tipos es si lleva tilde y con qué letra se pinta
   —el resto de los controles son los mismos—, así que el tipo viaja como clase y el CSS
   hace la diferencia. El menú de tipos se dibuja siempre, pero está oculto hasta que se
   abre: son cuatro botones por fila, no vale la pena construirlos a mano en cada clic. */
const filaVisionHTML = f => {
  const t = tipoHoja(f.i), cerrado = plegados.has(f.i.id);
  const tildable = esTarea(f.i);
  return `<div class="vrow t-${t.id}${f.i.hecho && tildable ? ' ok' : ''}" data-id="${escA(f.i.id)}" style="--d:${f.nivel}">
    <button class="vtipo" type="button" tabindex="-1" title="Cambiar el tipo de renglón"
      aria-label="Cambiar el tipo de renglón" aria-haspopup="menu" aria-expanded="false">⋮⋮</button>
    <button class="vtwist${f.hijos ? '' : ' vacio'}${cerrado ? ' cerrado' : ''}" type="button" tabindex="-1"
      aria-label="${f.hijos ? (cerrado ? 'Desplegar' : 'Plegar') : ''}" aria-expanded="${f.hijos ? String(!cerrado) : 'false'}">▸</button>
    ${tildable
      ? `<button class="vchk" type="button" role="checkbox" tabindex="-1" aria-checked="${!!f.i.hecho}" aria-label="Marcar como hecha"></button>`
      : `<span class="vbullet" aria-hidden="true"></span>`}
    <textarea class="vtxt" rows="1" spellcheck="false" aria-label="${esc(t.label)}"
      placeholder="${esc(t.id === 'check' ? 'Tarea…' : t.label + '…')}">${esc(f.i.texto)}</textarea>
    <button class="vdel" type="button" tabindex="-1" title="Borrar renglón" aria-label="Borrar renglón">✕</button>
    <div class="vmenu" role="menu" hidden>${TIPOS_HOJA.map(x =>
      `<button type="button" role="menuitem" data-tipo="${x.id}"${x.id === t.id ? ' class="on"' : ''}
        ><i>${esc(x.glifo)}</i>${esc(x.label)}</button>`).join('')}</div>
  </div>`;
};

function engancharFila(row, i){
  if (!row) return;
  const ta = row.querySelector('.vtxt');
  autoGrow(ta);

  row.querySelector('.vtwist').onclick = () => {
    if (!hijosVision(i.id).length) return;
    plegados.has(i.id) ? plegados.delete(i.id) : plegados.add(i.id);
    guardarPlegados();
    renderVision();
  };
  row.querySelector('.vchk')?.addEventListener('click', () => tildarVision(i));
  row.querySelector('.vdel').onclick = () => borrarLineaVision(i);

  const btnTipo = row.querySelector('.vtipo'), menu = row.querySelector('.vmenu');
  btnTipo.onclick = e => { e.stopPropagation(); abrirMenuTipo(row, menu, btnTipo); };
  menu.querySelectorAll('[data-tipo]').forEach(b => {
    b.onclick = e => { e.stopPropagation(); cerrarMenuTipo(); cambiarTipo(i, b.dataset.tipo); };
  });

  ta.addEventListener('input', () => {
    // Un atajo de Markdown se aplica al escribirlo y se lo come: lo que queda es el
    // renglón ya convertido, sin el '#' ni el '[]' colgando adelante.
    const atajo = TIPOS_HOJA.find(t => t.atajo.test(ta.value));
    if (atajo && atajo.id !== (i.tipo || 'check')) {
      const resto = ta.value.replace(atajo.atajo, '');
      ta.value = resto;
      i.texto = resto;
      // El cursor va al final de lo que quedó, no al principio: escribiendo a mano el
      // resto está vacío y da igual, pero si el renglón entró pegado de una («# Norte»)
      // el cursor tiene que quedar donde uno seguiría escribiendo.
      cambiarTipo(i, atajo.id, resto.length);
      return;
    }
    autoGrow(ta);
    editarLineaVision(i, ta.value);
  });
  ta.addEventListener('keydown', e => teclasVision(e, i, ta));
  ta.addEventListener('paste', e => pegarEnVision(e, i, ta));
}

/* ---------- menú de tipos ---------- */

// Uno solo abierto a la vez, y se cierra con un clic en cualquier lado o con Escape. Se
// guarda el nodo abierto en vez de recorrer el DOM buscando el que quedó suelto.
let menuTipoAbierto = null;
function abrirMenuTipo(row, menu, btn){
  const yaEstaba = menuTipoAbierto?.menu === menu;
  cerrarMenuTipo();
  if (yaEstaba) return;
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  row.classList.add('menu-abierto');
  menuTipoAbierto = { row, menu, btn };
}
function cerrarMenuTipo(){
  if (!menuTipoAbierto) return;
  const { row, menu, btn } = menuTipoAbierto;
  menu.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  row.classList.remove('menu-abierto');
  menuTipoAbierto = null;
}
document.addEventListener('click', cerrarMenuTipo);

/* Cambiar el tipo de un renglón. Lo único que se pierde en el camino es el tilde de una
   tarea que deja de serlo: un título «hecho» no significa nada, y si volviera a tarea más
   tarde reaparecería tildado sin que nadie lo haya tildado. */
function cambiarTipo(i, tipo, pos){
  const antes = { tipo: i.tipo, hecho: i.hecho, texto: i.texto };
  i.tipo = tipo;
  if (tipo !== 'check') i.hecho = false;
  renderVision({ id: i.id, pos: pos == null ? null : pos });
  persistirItemVision(i, { revertir: () => { Object.assign(i, antes); renderVision(); } });
}

/* Lo único que se recalcula al tildar es el número de la pestaña, que vive afuera de la
   hoja. Adentro no hay ni un contador: tildar mueve el tilde y nada más, sin repintar y
   sin sacarle el cursor a nadie. */
const actualizarProgresoVision = () => pintarChrome();

/* ---------- cambios ---------- */

function tildarVision(i){
  // Un título o un texto no se tildan: no tienen tilde que tocar.
  if (!esTarea(i)) return;
  i.hecho = !i.hecho;
  const row = board.querySelector(`.vrow[data-id="${CSS.escape(i.id)}"]`);
  if (row) {
    row.classList.toggle('ok', i.hecho);
    row.querySelector('.vchk').setAttribute('aria-checked', String(i.hecho));
  }
  actualizarProgresoVision();
  persistirItemVision(i, { revertir: () => { i.hecho = !i.hecho; renderVision(); } });
}

function editarLineaVision(i, texto){
  const clave = 'vision:' + i.id;
  if (!snaps.has(clave)) snaps.set(clave, JSON.stringify(i));
  i.texto = texto;
  guardarDebounced(clave, () => {
    persistirItemVision(i, {
      revertir: () => {
        try { Object.assign(i, JSON.parse(snaps.get(clave))); } catch (e) {}
        if (!estaEditando()) renderVision();
      },
    }).then(() => { if (!pendientesGuardado.has(clave)) snaps.delete(clave); });
  });
}

/* Dónde cae una línea nueva: si la de arriba tiene cosas adentro y está abierta, entra
   como su primera hija. Es lo que se ve en pantalla —el renglón de abajo es el primer
   hijo—, así que meterla como hermana la mandaría varios renglones más abajo. */
function nuevaLineaVision(desde){
  let padre = '', antes = null, despues = null, tipo = 'check';

  if (desde && hijosVision(desde.id).length && !plegados.has(desde.id)) {
    padre = desde.id;
    const dentro = hijosVision(desde.id);
    despues = dentro[0].orden;
    // Entra arriba de todo dentro del bloque: hereda el tipo del que hoy es primero, que
    // es al lado de quién va a quedar. Abrir un renglón encima de una lista de tareas y
    // que salga texto suelto sería justo lo que no se quiere.
    tipo = dentro[0].tipo || 'check';
  } else {
    padre = desde ? (desde.padre || '') : '';
    const hermanos = hijosVision(padre);
    const idx = desde ? hermanos.findIndex(h => h.id === desde.id) : hermanos.length - 1;
    antes = hermanos[idx] ? hermanos[idx].orden : null;
    despues = hermanos[idx + 1] ? hermanos[idx + 1].orden : null;
    // Enter sobre una tarea da otra tarea —así se escribe una lista de corrido—; sobre un
    // título da texto, porque nadie escribe dos títulos seguidos.
    if (desde) tipo = tipoHoja(desde).nuevo;
  }

  const i = {
    id: nuevoId('V', datos.vision.map(x => x.id)),
    padre, texto:'', hecho:false, tipo,
    orden: RoadmapSync.calcularOrden(antes, despues),
  };
  datos.vision.push(i);
  renderVision({ id: i.id, pos: 0 });
  persistirItemVision(i, {
    revertir: () => { datos.vision = datos.vision.filter(x => x.id !== i.id); renderVision(); },
  });
}

// Meter una línea adentro de la de arriba. Sin hermana arriba no hay de quién colgarla:
// no se puede indentar la primera línea de un bloque, igual que en Notion.
function indentarVision(i, pos){
  const hermanos = hijosVision(i.padre || '');
  const idx = hermanos.findIndex(h => h.id === i.id);
  if (idx <= 0) return;
  const nuevoPadre = hermanos[idx - 1];
  const sub = hijosVision(nuevoPadre.id);
  const antes = { padre: i.padre, orden: i.orden };
  i.padre = nuevoPadre.id;
  i.orden = RoadmapSync.calcularOrden(sub.length ? sub[sub.length - 1].orden : null, null);
  // Si el bloque que la recibe estaba cerrado, la línea desaparecería al escribirla.
  if (plegados.delete(nuevoPadre.id)) guardarPlegados();
  moverLinea(i, antes, pos);
}

// Sacarla del bloque: queda como hermana de su padre, justo debajo de él.
function desindentarVision(i, pos){
  const padre = itemVision(i.padre);
  if (!padre) return;
  const tios = hijosVision(padre.padre || '');
  const idx = tios.findIndex(h => h.id === padre.id);
  const antes = { padre: i.padre, orden: i.orden };
  i.padre = padre.padre || '';
  i.orden = RoadmapSync.calcularOrden(padre.orden, tios[idx + 1] ? tios[idx + 1].orden : null);
  moverLinea(i, antes, pos);
}

// Subir o bajar entre hermanas. Lo que tenga adentro viaja con ella: cuelga de su `padre`
// y no de su posición, así que no hay nada más que tocar.
function moverVision(i, delta, pos){
  const hermanos = hijosVision(i.padre || '');
  const idx = hermanos.findIndex(h => h.id === i.id);
  const j = idx + delta;
  if (idx < 0 || j < 0 || j >= hermanos.length) return;
  const antes = { padre: i.padre, orden: i.orden };
  const cruza = hermanos[j];
  const siguiente = hermanos[j + delta];
  i.orden = delta > 0
    ? RoadmapSync.calcularOrden(cruza.orden, siguiente ? siguiente.orden : null)
    : RoadmapSync.calcularOrden(siguiente ? siguiente.orden : null, cruza.orden);
  moverLinea(i, antes, pos);
}

function moverLinea(i, antes, pos){
  renderVision({ id: i.id, pos });
  persistirItemVision(i, { revertir: () => { Object.assign(i, antes); renderVision(); } });
}

async function borrarLineaVision(i, foco){
  const dentro = descendientesVision(i.id);
  if (dentro.length && !confirm(`«${i.texto || 'Sin texto'}» tiene ${dentro.length} ${dentro.length === 1 ? 'línea' : 'líneas'} adentro. Se borran también. ¿Seguir?`)) return;

  const rama = [i, ...dentro];
  const ids = new Set(rama.map(x => x.id));
  datos.vision = datos.vision.filter(x => !ids.has(x.id));
  renderVision(foco);

  const ok = await conEstadoDeCarga(() => RoadmapSync.borrarItemVision(i.id), {
    onEstado: onEstadoGlobal,
    revertir: () => { datos.vision.push(...rama); renderVision(); },
  });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.vision, i.id);
}

/* ---------- teclado ---------- */

function teclasVision(e, i, ta){
  const filas = [...board.querySelectorAll('.vrow')];
  const idx = filas.findIndex(r => r.dataset.id === i.id);
  const pos = ta.selectionStart;
  const irA = (n, alFinal) => {
    const t = filas[n]?.querySelector('.vtxt');
    if (!t) return;
    t.focus();
    const p = alFinal ? t.value.length : 0;
    t.setSelectionRange(p, p);
  };

  // Ctrl/⌘+Enter va primero: si no, lo agarraría el Enter de abajo y abriría una línea.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); tildarVision(i); return; }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); nuevaLineaVision(i); return; }

  if (e.key === 'Tab') {
    e.preventDefault();
    e.shiftKey ? desindentarVision(i, pos) : indentarVision(i, pos);
    return;
  }

  // Borrar con Backspace solo si la línea está vacía y no se lleva nada puesto: que una
  // tecla de corrección haga desaparecer un bloque entero sería una trampa.
  if (e.key === 'Backspace' && !ta.value && pos === 0 && !hijosVision(i.id).length) {
    e.preventDefault();
    const anterior = filas[idx - 1]?.dataset.id;
    borrarLineaVision(i, anterior ? { id: anterior, pos: null } : null);
    return;
  }

  if (e.key === 'ArrowUp' && (e.altKey || pos === 0)) {
    e.preventDefault();
    e.altKey ? moverVision(i, -1, pos) : irA(idx - 1, true);
    return;
  }
  if (e.key === 'ArrowDown' && (e.altKey || pos === ta.value.length)) {
    e.preventDefault();
    e.altKey ? moverVision(i, 1, pos) : irA(idx + 1, false);
  }
}

/* ---------- traer una hoja de afuera ---------- */

/* Convierte el texto pegado en líneas con nivel. La sangría llega distinta según de dónde
   se copie —tabulaciones, dos espacios, cuatro—, y un mismo pegado puede traer las tres
   mezcladas si se armó juntando pedazos.

   Por eso no se mide la sangría contra una tabla de anchos, ni se ordenan todas las que
   aparecen: se lleva una pila con la sangría de cada antepasado de la línea que se está
   leyendo. Más sangría que la de arriba entra un escalón; menos, sale los que hagan falta.
   Es la única cuenta que sale bien cuando una rama usa tabulaciones y otra usa espacios,
   y además hace imposible bajar dos niveles de golpe. */
function parsearHoja(txt){
  const sangria = l => l.match(/^[\t ]*/)[0].replace(/\t/g, '    ').length;
  const lineas = [];
  const pila = [0];   // sangría de cada nivel abierto; el 0 es el primer nivel

  String(txt || '').replace(/\r/g, '').split('\n').forEach(l => {
    if (!l.trim()) return;

    let t = l.trim(), hecho = false, tipo;

    // El orden de las pruebas es el que decide: primero el tilde (puede venir detrás de
    // una viñeta), después los títulos por cantidad de almohadillas, y lo que no es nada
    // de eso queda como texto — salvo que traiga viñeta, que es la marca de una lista.
    const tilde = t.match(/^(?:[-*•]\s*)?\[([ xX])\]\s*(.*)$/);
    const titulo = t.match(/^(#{1,6})\s+(.*)$/);
    if (tilde) { hecho = tilde[1].toLowerCase() === 'x'; t = tilde[2]; tipo = 'check'; }
    else if (titulo) { tipo = titulo[1].length === 1 ? 'titulo' : 'subtitulo'; t = titulo[2]; }
    else if (/^[-*•]\s+/.test(t)) { tipo = 'check'; t = t.replace(/^[-*•]\s+/, ''); }
    else if (/^\d+[.)]\s+/.test(t)) { tipo = 'check'; t = t.replace(/^\d+[.)]\s+/, ''); }
    else tipo = 'texto';

    t = t.trim();
    // Una línea que quedó vacía al sacarle la viñeta no cuenta, y tampoco toca la pila:
    // no puede abrir ni cerrar un nivel algo que no se va a dibujar.
    if (!t) return;

    const s = sangria(l);
    while (pila.length > 1 && pila[pila.length - 1] > s) pila.pop();
    if (s > pila[pila.length - 1]) pila.push(s);

    lineas.push({ ind: pila.length - 1, texto: t, hecho, tipo });
  });
  return anidarBajoTitulos(lineas);
}

/* La sangría sola no alcanza para armar la página, y esta es la razón: Notion NO sangra lo
   que va abajo de un título. Una página con dos títulos y sus tareas se copia con todo al
   mismo margen, así que tomando solo la sangría entraría plana, sin un solo nivel.

   Entonces un encabezado se queda abierto y adopta lo que viene después, hasta que aparece
   otro encabezado de rango igual o mayor a su misma sangría —ahí cierra— o algo menos
   sangrado que él. La sangría no se ignora: se suma a la profundidad que aporta el título,
   así una subtarea sangrada dentro de una tarea que está bajo un título queda dos niveles
   adentro, que es donde tiene que estar. */
function anidarBajoTitulos(lineas){
  const RANGO = { titulo:1, subtitulo:2 };
  const abiertos = [];   // encabezados que todavía pueden adoptar: { ind, rango, nivel }
  let previo = -1;

  return lineas.map(l => {
    const rango = RANGO[l.tipo] || 3;   // 3 = no es encabezado, no adopta a nadie

    while (abiertos.length) {
      const t = abiertos[abiertos.length - 1];
      if (l.ind < t.ind || (l.ind === t.ind && rango <= t.rango)) abiertos.pop();
      else break;
    }

    const padre = abiertos[abiertos.length - 1];
    // El clamp es el mismo de siempre: nadie baja más de un escalón por renglón. Sin él,
    // un título seguido de algo ya sangrado saltaría dos niveles y la línea quedaría
    // colgando de un padre que no existe.
    const crudo = padre ? padre.nivel + 1 + (l.ind - padre.ind) : l.ind;
    const nivel = Math.min(crudo, previo + 1);
    previo = nivel;

    if (rango < 3) abiertos.push({ ind: l.ind, rango, nivel });
    return { nivel, texto: l.texto, hecho: l.hecho, tipo: l.tipo };
  });
}

function pegarEnVision(e, i, ta){
  const txt = (e.clipboardData || window.clipboardData)?.getData('text/plain') || '';
  // Pegar una sola línea es pegar texto: que lo haga el navegador, con su cursor y todo.
  if (!/\n/.test(txt.trim())) return;
  const lineas = parsearHoja(txt);
  if (lineas.length < 2) return;
  e.preventDefault();
  importarLineas(lineas, i);
}

function importarLineas(lineas, desde){
  const padreBase = desde ? (desde.padre || '') : '';
  const hermanos = hijosVision(padreBase);
  const idx = desde ? hermanos.findIndex(h => h.id === desde.id) : hermanos.length - 1;
  const despues = hermanos[idx + 1] ? hermanos[idx + 1].orden : null;
  let antes = hermanos[idx] ? hermanos[idx].orden : null;

  // `ultimoDe[n]` es la última línea creada en el nivel n: de ahí cuelgan las del n+1.
  const ultimoDe = [], nuevos = [];
  lineas.forEach(l => {
    const padre = l.nivel === 0 ? padreBase : (ultimoDe[l.nivel - 1] || padreBase);
    let orden;
    if (padre === padreBase) {
      orden = RoadmapSync.calcularOrden(antes, despues);
      antes = orden;
    } else {
      const previos = hijosVision(padre);
      orden = RoadmapSync.calcularOrden(previos.length ? previos[previos.length - 1].orden : null, null);
    }
    const i = {
      id: nuevoId('V', datos.vision.map(x => x.id)),
      padre, texto: l.texto, hecho: l.hecho, tipo: l.tipo || 'check', orden,
    };
    datos.vision.push(i);
    nuevos.push(i);
    ultimoDe[l.nivel] = i.id;
    ultimoDe.length = l.nivel + 1;
  });

  // Si se pegó sobre una línea en blanco, esa línea sobra: lo pegado ocupa su lugar.
  const sobra = desde && !desde.texto.trim() && !hijosVision(desde.id).length ? desde : null;
  if (sobra) datos.vision = datos.vision.filter(x => x.id !== sobra.id);

  renderVision({ id: nuevos[nuevos.length - 1].id, pos: null });
  guardarLoTraido(nuevos, sobra);
}

async function guardarLoTraido(nuevos, sobra){
  onEstadoGlobal('cargando');
  try {
    await RoadmapSync.guardarItemsVision(nuevos);
    if (sobra) await RoadmapSync.borrarItemVision(sobra.id);
    nuevos.forEach(n => marcarEcoPropio(RoadmapSync.TABLAS.vision, n.id));
    if (sobra) marcarEcoPropio(RoadmapSync.TABLAS.vision, sobra.id);
    onEstadoGlobal('ok');
    aviso(nuevos.length === 1 ? 'Se trajo 1 línea' : `Se trajeron ${nuevos.length} líneas`);
  } catch (e) {
    onEstadoGlobal('error');
    const ids = new Set(nuevos.map(n => n.id));
    datos.vision = datos.vision.filter(x => !ids.has(x.id));
    if (sobra) datos.vision.push(sobra);
    renderVision();
    aviso('No se pudo guardar lo pegado. Revisá tu conexión y probá de nuevo.');
  }
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
  if (e.key === 'Escape') { cerrarMenuTipo(); cerrarModales(); return; }
  if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    e.preventDefault(); $('#q').focus();
  }
});

$('#q').addEventListener('input', e => { UI.f.q = e.target.value.trim().toLowerCase(); render(); });
['Prioridad','Tipo'].forEach(k => {
  $('#f' + k).addEventListener('change', e => { UI.f[k.toLowerCase()] = e.target.value; render(); });
});
$$('[data-layout]').forEach(b => b.onclick = () => { UI.layout = b.dataset.layout; guardarUI(); render(); });
$('#bNueva').onclick = () => {
  // Desde la Caja no hay tablero donde mostrarla: se vuelve a una vista de tareas para
  // que la tarea recién creada quede a la vista al cerrar el detalle.
  const v = vistaActual();
  if (sinTareas(v)) { UI.vista = 'estado'; guardarUI(); render(); }
  nuevaTarea(vistaActual(), null);
};
$('#bCsv').onclick = () => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['ID','Titulo','Estado','Prioridad','Tipo','Pendiente de','Hoy','Notas','Subtareas','Conversacion','Archivos'];
  const filas = datos.tareas.map(t => [
    t.id, t.tarea,
    estadoDe(t.estado).label, prioridadDe(t.prioridad).label, tipoDe(t.tipo).label,
    (t.pend || []).map(nombrePersona).join(' | '),
    t.hoy ? 'si' : '', explATexto(t.expl),
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
    datos = { tareas:[], caja:[], vision:[] };
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
      datos = { tareas:[], caja:[], vision:[] };
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
