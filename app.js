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
// No todas las vistas pintan tarjetas. `caja` es una planilla y `backlog` es una hoja de
// renglones: las dos ocupan el board entero en vez de repartirlo en columnas. La marca la
// lleva la vista, no el render, así el resto del archivo pregunta `v.backlog` en vez de
// comparar contra el id en diez lugares distintos.
//
// Ojo con la diferencia: la caja no sabe nada de tareas, pero el backlog son tareas —solo
// que del otro lado de la marca `backlog`—. Por eso el backlog sí tiene filtros, buscador
// y contador, y la caja no.
const VISTAS = [
  { id:'hoy',     label:'☀ Hoy',     soloHoy:true },
  { id:'estado',  label:'Estado' },
  { id:'backlog', label:'◦ Backlog', backlog:true },
  { id:'caja',    label:'Caja',      caja:true },
];
// Vistas que no muestran tareas: ni filtros, ni contador, ni «+ Nueva tarea» con sentido.
const sinTareas = v => !!v.caja;
// Vistas que se comen el board entero en vez de repartirlo en columnas.
const anchoCompleto = v => !!(v.caja || v.backlog);

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
let datos = { tareas: [], caja: [] };
let UI = {
  vista: 'estado',
  layout: 'cols',
  // La columna de Terminadas arranca plegada: es lo que ya no hay que mirar.
  terminadasAbiertas: false,
  // Cuántos casilleros de sprint mostrar en el backlog. 0 = lo que diga la config.
  sprints: 0,
  f: { q:'', pend:[], prioridad:'', tipo:'' },
};
try {
  const guardado = JSON.parse(localStorage.getItem('tablero-ui') || '{}');
  if (guardado.vista && VISTAS.some(v => v.id === guardado.vista)) UI.vista = guardado.vista;
  if (guardado.layout === 'rows' || guardado.layout === 'cols') UI.layout = guardado.layout;
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
// No pisar la pantalla mientras alguien escribe: ni en la planilla, ni en las hojas de
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
  // Lo guardado en el backlog no cuenta: todavía no está en juego, por más crítico que sea.
  const criticas = datos.tareas.filter(t =>
    !t.backlog && prioridadDe(t.prioridad).id === CRITICA && t.estado !== HECHO);
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

  const nHoy = datos.tareas.filter(t => t.hoy && !t.backlog).length;
  // El contador del Backlog cuenta lo que todavía no salió, no todo lo que se ve ahí: lo ya
  // mandado sigue en la lista pero ya no es pendiente de nadie.
  const nBacklog = datos.tareas.filter(t => t.backlog).length;
  elVistas.innerHTML = VISTAS.map(v => {
    const on = UI.vista === v.id;
    // El contador de cada pestaña dice lo que esa pestaña sabe contar: Hoy muestra
    // siempre lo marcado para hoy, Backlog todo lo que tiene guardado, y Estado el
    // resultado del filtro —solo cuando está activa, porque fuera de ella el número
    // sería el de un filtro que no se está viendo.
    let badge = '';
    if (v.soloHoy) badge = `<small>${nHoy}</small>`;
    else if (v.backlog) badge = nBacklog ? `<small>${nBacklog}</small>` : '';
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
  const f = UI.f, v = vistaActual();
  // El tablero muestra lo que ya salió del backlog. El backlog muestra lo que todavía no
  // salió y, además, lo ya mandado que tenga sprint: al cerrar un sprint uno quiere ver el
  // sprint entero. Una sola línea acá porque todo lo que pinta tareas pasa por este filtro.
  if (v.backlog ? !enBacklog(t) : !!t.backlog) return false;
  if (v.soloHoy && !t.hoy) return false;
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

  // La caja y el backlog ocupan el board entero en vez de repartirlo en columnas. Los
  // filtros solo se esconden en la caja — en el backlog buscar y filtrar sirve igual que en
  // el tablero.
  elFiltros.hidden = sinTareas(v);
  board.classList.toggle('cmode', !!v.caja);
  board.classList.toggle('bmode', !!v.backlog);
  board.classList.toggle('rows', !anchoCompleto(v) && UI.layout === 'rows');
  // El backlog engancha sus manejadores sobre el board entero. Al salir de la vista hay que
  // soltarlos: si no, siguen escuchando encima del tablero y de la caja.
  if (!v.backlog) { board.onclick = board.oninput = board.onchange = board.onkeydown = null;
                    board.onpaste = board.ondragover = board.ondrop = null; cerrarMenu(); }

  if (v.caja) return renderCaja();
  if (v.backlog) return renderBacklog();
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

// La forma completa de una tarea recién nacida, en un solo lugar: la usan el tablero y el
// backlog, que crean exactamente la misma fila y solo difieren en dónde la muestran.
function tareaVacia(id){
  return {
    id, modulo:'', tarea:'', expl:'', estado:'Pendiente', img:'', com:'', fecha:'',
    files:[], chat:[], subtareas:[], prioridad:'semanal', tipo:'nuevo',
    hoy:false, pend:[], creada:new Date().toISOString(), orden:0,
    backlog:false, sprint:SIN_SPRINT, dep:'', loom:'',
  };
}

function nuevaTarea(v, colId){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const ultimo = datos.tareas.length ? datos.tareas[datos.tareas.length - 1].orden : null;
  const t = Object.assign(tareaVacia(id), {
    hoy: !!(v && v.soloHoy),
    orden: RoadmapSync.calcularOrden(ultimo, null),
  });
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
  // El sprint se guarda igual en las tareas que ya están en el tablero: sirve para mirar,
  // al cerrar un sprint, qué salió de cada uno.
  llenarSelect($('#tSprint'), opcionesSprint(), 'Sin sprint');
  $('#tSprint').value = t.sprint ? String(t.sprint) : '';
  $('#tLoom').value = t.loom || '';
  pintarLoom(t);
  pintarBotonBacklog(t);

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

// Todo lo de acá abajo recibe el campo: el mismo editor lo usan el detalle de la tarea y
// el panel de planificación del backlog, que son dos cajas distintas sobre el mismo dato.
function pintarExpl(t, el){
  el = el || $('#tDesc');
  el.innerHTML = explAHtml(t.expl);
  refrescarImagenesDeExpl(el);
  marcarExplVacia(el);
}
// El `src` que quedó guardado en `expl` no sirve para pintar: las filas viejas traen la
// URL pública de cuando el bucket era público y las nuevas una firmada ya vencida. La
// dirección de verdad se firma de nuevo en cada pintado, a partir de `data-path`.
async function refrescarImagenesDeExpl(el){
  for (const img of el.querySelectorAll('img[data-path]')) {
    try { img.src = await RoadmapSync.urlFirmada({ path: img.dataset.path, b: img.dataset.b }); }
    catch (e) { /* borrada del bucket o sin permiso: queda el src que estaba */ }
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
  if (e.target.matches?.('.rico img')) return ponerGrip(e.target);
  if (e.target !== GRIP) sacarGrip();
});
// El modal y el board scrollean: sin esto el agarre queda flotando donde la imagen ya no está.
window.addEventListener('scroll', () => { if (!gripActivo) sacarGrip(); }, true);

// Quién es la tarea depende del editor: la ficha edita a la abierta; el panel del backlog,
// a la de su fila.
function guardarExplDe(img){
  const el = img.closest('.rico'); if (!el) return;
  const fila = el.closest('.brow');
  guardarExpl(fila ? tarea(fila.dataset.id) : actual(), el);
}

GRIP.addEventListener('pointerdown', e => {
  const img = gripImg; if (!img) return;
  e.preventDefault();
  const editor = img.closest('.rico'); if (!editor) return;
  const est = getComputedStyle(editor);
  const anchoUtil = editor.clientWidth - parseFloat(est.paddingLeft) - parseFloat(est.paddingRight);
  const x0 = e.clientX, w0 = img.getBoundingClientRect().width;
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
  if (e.target.matches?.('.rico img')) {
    $('#lbImg').src = e.target.src;
    $('#lightbox').classList.add('on');
  }
});

function pintarHoy(t){
  const b = $('#tHoy');
  b.classList.toggle('on', !!t.hoy);
  b.textContent = t.hoy ? '☀ Hoy' : '☀ Realizar hoy';
  // Guardada en el backlog todavía no se trabaja: marcarla para hoy no querría decir nada.
  b.hidden = !!t.backlog;
}

// Un solo botón para los dos sentidos, y dice a dónde va la tarea, no dónde está.
function pintarBotonBacklog(t){
  const b = $('#tBacklog');
  const falta = t.backlog && !tieneLoom(t);
  b.textContent = t.backlog ? '→ Pasar al tablero' : '← Guardar en el backlog';
  // Se avisa antes de tocarlo, no después: un botón que rebota sin decir por qué es peor
  // que uno que ya avisa qué le falta.
  b.classList.toggle('falta', !!falta);
  b.title = falta ? 'Primero cargá el Loom, es obligatorio para mandarla al tablero'
    : t.backlog ? 'Sale del backlog y aparece en el tablero con todo lo que tenga adentro'
    : 'Sale del tablero y queda guardada en el backlog, sin perder nada';
}

// El enlace de al lado del campo: se ve solo cuando hay algo que abrir.
function pintarLoom(t){
  const url = (t.loom || '').trim();
  const ver = $('#tLoomVer'), abrible = /^https?:\/\//i.test(url);
  ver.hidden = !abrible;
  if (abrible) ver.href = url;
  $('#tLoom').classList.toggle('cargado', !!url);
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
$('#tLoom').addEventListener('input', e => {
  const t = actual(); if (!t) return;
  campoTareaDebounced(t, 'loom', e.target.value);
  pintarLoom(t); pintarBotonBacklog(t);
});
$('#tHoy').onclick = () => {
  const t = actual(); if (!t) return;
  const antes = t.hoy;
  t.hoy = !t.hoy; pintarHoy(t); render();
  persistirTarea(t, { revertir: () => { t.hoy = antes; pintarHoy(t); render(); } });
};
$('#tBacklog').onclick = () => {
  const t = actual(); if (!t) return;
  t.backlog ? pasarAlRoadmap(t) : mandarAlBacklog(t);
  pintarBotonBacklog(t); pintarHoy(t);
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
    <div class="planilla-wrap">
      <table class="planilla">
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
   Backlog · la planificación
   ------------------------------------------------------------
   Son tareas de verdad: la misma fila de `roadmap_tareas`, los mismos campos y la misma
   ficha que las del tablero. Lo único que las separa es la columna `backlog`. Mandar una
   al tablero es apagar esa marca y nada más — llega con su explicación, su checklist, sus
   archivos y su conversación, porque nunca dejó de ser la misma fila. Con dos tablas, cada
   pasaje sería copiar filas y mover adjuntos; con una marca es un booleano.

   **Lo que ya se mandó no desaparece de acá.** Una tarea con sprint sigue apareciendo en su
   bloque, apagada y con la cinta rayada: al cerrar un sprint uno quiere ver el sprint
   entero, no el resto. Eso es `enBacklog()`: pendiente, o ya salida pero planificada. La
   que nunca tuvo sprint y se manda al tablero sí se va — nunca estuvo planificada.

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
const nombreSprint = n => (n ? 'Sprint ' + n : 'Sin planificar');
const enBacklog = t => !!t.backlog || sprintDe(t) > 0;

/* Los bloques que se dibujan aunque estén vacíos: siempre del 1 al N, sin huecos. El piso
   lo pone la config; sube si alguien agregó sprints con el botón, y sube igual si hay una
   tarea guardada en un sprint más alto — un sprint con tareas no se puede esconder. */
function sprintsVisibles(){
  const conTareas = datos.tareas.filter(enBacklog).map(sprintDe);
  const piso = Math.max(1, Number(CFG.sprints) || 3, UI.sprints || 0, ...conTareas);
  return Array.from({ length: piso }, (_, i) => i + 1);
}
const tareasDeSprint = n => datos.tareas
  .filter(t => enBacklog(t) && sprintDe(t) === n)
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
// Para el selector de la ficha, que sí es un `<select>` común.
const opcionesSprint = () => sprintsVisibles().map(n => ({ id: String(n), label: nombreSprint(n) }));

/* Tres cosas que son del navegador de cada uno y no del tablero: qué bloques dejó cerrados,
   qué paneles dejó abiertos y qué filas tiene marcadas. Que alguien pliegue el Sprint 3 para
   leer cómodo no tiene por qué plegárselo a los demás. */
let sprintsPlegados = new Set();
try { sprintsPlegados = new Set(JSON.parse(localStorage.getItem('backlog-plegados') || '[]')); }
catch (e) { /* si no se puede leer, abre todo y listo */ }
function guardarPlegados(){
  try { localStorage.setItem('backlog-plegados', JSON.stringify([...sprintsPlegados])); }
  catch (e) { /* modo privado o storage lleno: no es crítico */ }
}
const planAbierto = new Set();
const marcadas = new Set();

/* ---------- pintado ---------- */

function renderBacklog(){
  const mostradas = datos.tareas.filter(visible);
  const grupos = [...sprintsVisibles(), SIN_SPRINT];
  const siguiente = sprintsVisibles().length + 1;

  // Sin franja de totales ni cabecera de columnas: la lista es lo único que importa acá, y
  // cada cosa que se agregue arriba le come alto. Lo que cada columna es se entiende de lo
  // que tiene adentro.
  board.innerHTML = `<div class="bwrap">
    <div class="bbloques"></div>
    <button class="bsprint" type="button" data-sprint-nuevo>+ ${esc(nombreSprint(siguiente))}</button>
  </div>
  ${barraMarcadasHTML()}`;

  const cont = board.querySelector('.bbloques');
  grupos.forEach(n => {
    const lista = mostradas.filter(t => sprintDe(t) === n).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    // «Sin planificar» solo aparece si tiene algo: es el cajón de lo que cayó sin
    // clasificar, no un casillero que haya que llenar.
    if (n === SIN_SPRINT && !lista.length) return;
    cont.appendChild(bloqueSprint(n, lista));
  });

  board.querySelector('[data-sprint-nuevo]').onclick = () => {
    UI.sprints = siguiente; guardarUI(); render();
  };
  engancharBacklog();
}

function bloqueSprint(n, lista){
  const sec = document.createElement('section');
  sec.className = 'bbloque' + (sprintsPlegados.has(String(n)) ? ' plegado' : '');
  sec.dataset.g = n;

  const pend = lista.filter(t => t.backlog);
  const reparto = PERSONAS.map(p => ({ p, n: pend.filter(x => (x.pend || []).includes(p.id)).length }))
    .filter(x => x.n > 0);
  const total = reparto.reduce((s, x) => s + x.n, 0) || 1;

  sec.innerHTML = `<div class="bghead">
      <button class="bgtog" type="button" data-plegar="${n}"><span class="bcaret">▾</span>${esc(nombreSprint(n))}</button>
      <span class="bgmeta">${pend.length} por hacer${lista.length - pend.length ? ` · ${lista.length - pend.length} en el tablero` : ''}</span>
      <div class="bcarga" title="Reparto por persona">${
        reparto.map(x => `<span style="width:${x.n / total * 100}%;background:${x.p.color}" title="${escA(x.p.nombre)}: ${x.n}"></span>`).join('')}</div>
      <button class="bgadd" type="button" data-agregar="${n}">+ Tarea</button>
    </div>
    <div class="bfilas" data-filas="${n}">
      ${lista.map(filaBacklogHTML).join('')}
      <button class="bnueva" type="button" data-agregar="${n}">+ Añadir tarea</button>
    </div>`;
  return sec;
}

function filaBacklogHTML(t){
  const p = prioridadDe(t.prioridad);
  const abierta = planAbierto.has(t.id);
  // El ⋯ se marca cuando la ficha tiene algo que la rejilla no muestra. Sin eso no habría
  // forma de saber, mirando la lista, cuáles están pensadas y cuáles son un título suelto.
  const conFicha = explATexto(t.expl).trim() || (t.subtareas || []).length
    || (t.chat || []).length || (t.files || []).length;

  return `<div class="brow${abierta ? ' abierta' : ''}${t.backlog ? '' : ' salida'}${marcadas.has(t.id) ? ' marcada' : ''}"
      data-id="${escA(t.id)}" style="--rc:${p.color}">
    <div class="brmain bgrid">
      <div><button class="bcheck" type="button" data-marcar aria-pressed="${marcadas.has(t.id)}" aria-label="Marcar la tarea">${marcadas.has(t.id) ? '✓' : ''}</button></div>
      <div class="bhandle" draggable="true" title="Arrastrar para reordenar">⠿</div>
      <div><button class="bcode" type="button" data-ficha title="Abrir la ficha completa">${esc(t.id)}</button></div>
      <div class="btitle" contenteditable="true" spellcheck="false" data-f="tarea"
        data-ph="Sin título">${esc(t.tarea)}</div>
      <div class="b-area barea" contenteditable="true" spellcheck="false" data-f="modulo"
        data-ph="—">${esc(t.modulo || '')}</div>
      <div><button class="bchip" type="button" data-pop="prioridad"
        style="--chb:${tint(p.color, .12)};--chc:${p.color}">${esc(p.label)}</button></div>
      <div class="bpend">${PERSONAS.map(p => {
        const on = (t.pend || []).includes(p.id);
        return `<button type="button" class="av mini${on ? '' : ' off'}" data-p="${escA(p.id)}"
          style="${on ? `background:${p.color}` : ''}" aria-pressed="${on}"
          title="${escA(p.nombre)}">${esc(p.ini)}</button>`;
      }).join('')}</div>
      <div><button class="bsprintsel" type="button" data-pop="sprint">${esc(nombreSprint(sprintDe(t)))}<span class="bcaret">▾</span></button></div>
      <div><button class="bship${t.backlog && !tieneLoom(t) ? ' falta' : ''}" type="button" data-ir
        ${t.backlog && !tieneLoom(t) ? 'title="Primero cargá el Loom"' : ''}>${t.backlog ? '→ Al tablero' : '✓ En el tablero'}</button></div>
      <div><button class="bloom${tieneLoom(t) ? ' on' : ''}" type="button" data-loom
        title="${tieneLoom(t) ? escA('Ver el Loom: ' + t.loom) : 'Sin Loom — hace falta para mandarla al tablero'}"
        aria-pressed="${tieneLoom(t)}">${tieneLoom(t) ? '✓' : '○'} Loom</button></div>
      <div><button class="bfull" type="button" data-ficha title="Abrir la ficha completa" aria-label="Abrir la ficha completa">⤢</button></div>
      <div><button class="bexp" type="button" data-plan title="Espacio de planificación">›</button></div>
      <div><button class="bdel" type="button" data-borrar title="Eliminar">✕</button></div>
    </div>
    ${abierta ? panelPlanHTML(t) : ''}
  </div>`;
}

/* El panel de cada fila. La Explicación es la misma que la de la ficha —el mismo campo, el
   mismo formato, las mismas imágenes pegadas—; no es una nota aparte que después haya que
   ir a buscar a otro lado. */
function panelPlanHTML(t){
  const opciones = (items, val) => items.map(i =>
    `<option value="${escA(i.id)}"${i.id === val ? ' selected' : ''}>${esc(i.label)}</option>`).join('');
  return `<div class="bplan">
    <div class="bplan-grid">
      <div>
        <label>Plan · pasos · decisiones</label>
        <div class="rico bplan-txt" contenteditable="true" role="textbox" aria-multiline="true"
          data-plan-expl data-ph="Cómo se ataca: pasos, criterio de terminado, dudas abiertas…"></div>
      </div>
      <div>
        <div class="bcampo"><label>Loom</label>
          <input data-f="loom" value="${escA(t.loom || '')}" placeholder="Pegá el enlace del video"></div>
        <div class="bcampo"><label>Depende de</label>
          <input data-f="dep" value="${escA(t.dep || '')}" placeholder="T04, diseño cerrado…"></div>
        <div class="bcampo"><label>Estado</label>
          <select data-f="estado">${opciones(ESTADOS, t.estado)}</select></div>
        <div class="bcampo"><label>Tipo de actividad</label>
          <select data-f="tipo">${opciones(TIPOS, tipoDe(t.tipo).id)}</select></div>
        <button class="bficha" type="button" data-ficha>Abrir la ficha completa</button>
      </div>
    </div>
  </div>`;
}

function barraMarcadasHTML(){
  return `<div class="bbulk${marcadas.size ? ' on' : ''}">
    <span class="bcount">${marcadas.size} ${marcadas.size === 1 ? 'marcada' : 'marcadas'}</span>
    <span class="bsep"></span>
    <button type="button" data-lote="sprint">Mover a sprint ▾</button>
    <button type="button" data-lote="prioridad">Prioridad ▾</button>
    <button type="button" data-lote="pend">Asignar a ▾</button>
    <span class="bsep"></span>
    <button class="bprimary" type="button" data-lote="ir">Mandar al tablero</button>
    <button type="button" data-lote="limpiar">Quitar marcas</button>
  </div>`;
}

/* ---------- enganches ----------
   Todo por delegación sobre el board: la lista se repinta entera ante cualquier cambio de
   estructura, y colgar cien manejadores en cada repintado para tirarlos al siguiente no
   tiene sentido. */
function engancharBacklog(){
  board.onclick = e => {
    const enc = s => e.target.closest(s);

    const plegar = enc('[data-plegar]');
    if (plegar) {
      const g = plegar.dataset.plegar;
      sprintsPlegados.has(g) ? sprintsPlegados.delete(g) : sprintsPlegados.add(g);
      guardarPlegados();
      return renderBacklog();
    }
    const agregar = enc('[data-agregar]');
    if (agregar) return nuevaEnBacklog(Number(agregar.dataset.agregar), null);

    const lote = enc('[data-lote]');
    if (lote) return accionEnLote(lote.dataset.lote, lote);

    const fila = enc('.brow');
    if (!fila) return;
    const t = tarea(fila.dataset.id); if (!t) return;

    if (enc('[data-marcar]')) {
      marcadas.has(t.id) ? marcadas.delete(t.id) : marcadas.add(t.id);
      return renderBacklog();
    }
    if (enc('[data-ir]'))     return t.backlog ? pasarAlRoadmap(t) : mandarAlBacklog(t);
    if (enc('[data-borrar]')) return borrarDeBacklog(t);
    // La ficha es exactamente la misma que la del tablero: el mismo modal, los mismos
    // campos. Se entra por el código de la izquierda, por el ⤢ o desde el panel.
    if (enc('[data-ficha]'))  return abrirTarea(t.id);
    if (enc('[data-loom]'))   return verLoom(t);
    const quien = enc('.bpend [data-p]');
    if (quien) return alternarPersona(t, quien.dataset.p, quien);
    if (enc('[data-plan]')) {
      planAbierto.has(t.id) ? planAbierto.delete(t.id) : planAbierto.add(t.id);
      renderBacklog();
      const campo = board.querySelector(`.brow[data-id="${CSS.escape(t.id)}"] [data-plan-expl]`);
      if (campo) campo.focus();
      return;
    }
    const pop = enc('[data-pop]');
    if (pop) return abrirMenu(pop, pop.dataset.pop, t);
  };

  // Texto editable de la rejilla y campos del panel: el mismo camino que cualquier otro
  // campo de una tarea, con su guardado diferido y su revert.
  board.oninput = e => {
    // Un `<select>` dispara `input` y `change`: se atiende solo el segundo, si no cada
    // elección se guardaría y repintaría dos veces.
    if (e.target.tagName === 'SELECT' && e.type === 'input') return;
    const campo = e.target.dataset.f;
    const fila = e.target.closest('.brow'); if (!fila) return;
    const t = tarea(fila.dataset.id); if (!t) return;
    if (e.target.hasAttribute('data-plan-expl')) {
      marcarExplVacia(e.target); guardarExpl(t, e.target);
      return;
    }
    if (!campo) return;
    const valor = e.target.isContentEditable ? e.target.textContent : e.target.value;
    campoTareaDebounced(t, campo, valor);
    // El tilde de Loom se prende en el acto, sin repintar: hay un cursor en el campo y
    // repintar la lista entera lo tiraría a la primera letra.
    if (campo === 'loom') {
      const tilde = fila.querySelector('.bloom');
      tilde.classList.toggle('on', !!valor.trim());
      tilde.textContent = valor.trim() ? '✓' : '';
    }
    // El estado y el tipo cambian cómo se ve la tarea en el tablero, no acá.
    if (campo === 'estado' || campo === 'tipo') render();
  };
  // `onchange` y no `addEventListener`: esto se vuelve a enganchar en cada repintado, y un
  // listener acumulado por repintado dispararía el guardado veinte veces seguidas.
  board.onchange = e => { if (e.target.tagName === 'SELECT') board.oninput(e); };

  // Lo pegado en el título o en el área entra siempre como texto plano: son campos de una
  // línea, y el HTML de otra página ahí adentro no tiene ningún sentido. La Explicación del
  // panel tiene su propio manejador —con imágenes— y frena este.
  board.onpaste = e => {
    const el = e.target;
    if (!el.isContentEditable || !el.dataset.f) return;
    e.preventDefault();
    const txt = (e.clipboardData?.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
    if (txt && !document.execCommand?.('insertText', false, txt)) {
      insertarEnCursor(document.createTextNode(txt), el);
    }
    board.oninput({ target: el, type: 'input' });
  };

  board.onkeydown = e => {
    // Enter en el título cierra la edición y abre una fila nueva en el mismo bloque:
    // escribir una lista de corrido es el 90% de lo que se hace en esta pantalla.
    if (e.key === 'Enter' && e.target.dataset.f === 'tarea') {
      e.preventDefault();
      const fila = e.target.closest('.brow');
      const t = fila && tarea(fila.dataset.id);
      if (t) nuevaEnBacklog(sprintDe(t), t);
      return;
    }
    if (e.key === 'Enter' && e.target.dataset.f === 'modulo') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape' && marcadas.size) { marcadas.clear(); renderBacklog(); }
  };

  // El editor de la Explicación del panel: se llena por JS y no por HTML porque lo guardado
  // puede ser HTML nuestro, y `innerHTML` en la plantilla lo escaparía.
  board.querySelectorAll('[data-plan-expl]').forEach(el => {
    const t = tarea(el.closest('.brow').dataset.id);
    if (t) pintarExpl(t, el);
    el.addEventListener('paste', ev => {
      ev.preventDefault(); ev.stopPropagation();
      const tt = tarea(el.closest('.brow').dataset.id);
      if (tt) repartirPegado(tt, ev.clipboardData, el);
    });
  });

  engancharArrastreBacklog();
}

/* ---------- menús ----------
   Uno solo para los tres selectores. Se cuelga del `<body>` y no de la fila porque una fila
   tiene `overflow` y lo recortaría, y porque así se cierra siempre con el mismo clic. */
function cerrarMenu(){ $$('.bpop').forEach(p => p.remove()); }
document.addEventListener('click', e => { if (!e.target.closest('.bpop,[data-pop],[data-lote]')) cerrarMenu(); });

function abrirMenu(anclaje, tipo, t){
  const abierto = $('.bpop');
  cerrarMenu();
  if (abierto && abierto.dataset.de === (t ? t.id : 'lote') + tipo) return;

  const pop = document.createElement('div');
  pop.className = 'bpop';
  pop.dataset.de = (t ? t.id : 'lote') + tipo;
  const marcado = v =>
    tipo === 'prioridad' ? t && prioridadDe(t.prioridad).id === v
    : tipo === 'pend'    ? t && (t.pend || []).includes(v)
    : tipo === 'sprint'  ? t && String(sprintDe(t)) === v
    : false;

  const items =
    tipo === 'prioridad' ? PRIORIDADES.map(p => ({ v:p.id, label:p.label, color:p.color }))
    : tipo === 'pend'    ? PERSONAS.map(p => ({ v:p.id, label:p.nombre, color:p.color }))
    : [...sprintsVisibles().map(n => ({ v:String(n), label:nombreSprint(n) })),
       { v:'0', label:nombreSprint(SIN_SPRINT) }];

  pop.innerHTML = items.map(i =>
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
    // Con `t` en nulo el menú es el de la barra de marcadas, no el de una fila. Los
    // responsables solo llegan por ahí: en la fila son tres botones, no un menú.
    if (!t) { aplicarEnLote(tipo, v); cerrarMenu(); return; }
    if (tipo === 'prioridad') campoTarea(t, 'prioridad', v);
    if (tipo === 'sprint') cambiarSprint(t, Number(v) || SIN_SPRINT);
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

/* El tilde de Loom no se prende a mano: se prende solo cuando el campo tiene un enlace.
   Un booleano suelto diría «hay video» sin dejarte abrirlo, que es justo lo que se quiere
   evitar. Si todavía no hay nada, el clic lleva al campo donde se carga. */
const tieneLoom = t => !!(t.loom || '').trim();

function verLoom(t){
  const url = (t.loom || '').trim();
  if (/^https?:\/\//i.test(url)) { window.open(url, '_blank', 'noopener'); return; }
  // Desde la ficha abierta el campo es el del modal; desde la lista, el del panel de la
  // fila. Se manda al que esté en pantalla, no al que no se ve.
  if (actual() === t) { $('#tLoom').focus(); $('#tLoom').select(); return; }
  if (!vistaActual().backlog) return;
  planAbierto.add(t.id);
  renderBacklog();
  const campo = board.querySelector(`.brow[data-id="${CSS.escape(t.id)}"] [data-f="loom"]`);
  if (campo) { campo.focus(); campo.select(); }
}

/* Los tres botones de la fila son los mismos del detalle: siempre a la vista, un clic los
   prende y los apaga. Se pintan a mano en vez de repintar la lista entera — es un botón que
   cambia de color, y repintar cien filas para eso hace que el clic se sienta lento. */
function alternarPersona(t, id, boton){
  const antes = [...(t.pend || [])];
  t.pend = t.pend || [];
  const i = t.pend.indexOf(id);
  i > -1 ? t.pend.splice(i, 1) : t.pend.push(id);
  const on = i < 0;
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

function nuevaEnBacklog(sprint, despuesDe){
  const id = nuevoId('T', datos.tareas.map(x => x.id));
  const hermanas = tareasDeSprint(sprint);
  const i = despuesDe ? hermanas.findIndex(x => x.id === despuesDe.id) : hermanas.length - 1;
  const t = Object.assign(tareaVacia(id), {
    backlog: true,
    sprint,
    orden: RoadmapSync.calcularOrden(
      i >= 0 && hermanas[i] ? hermanas[i].orden : null,
      hermanas[i + 1] ? hermanas[i + 1].orden : null),
  });
  datos.tareas.push(t);
  sprintsPlegados.delete(String(sprint)); guardarPlegados();
  render();
  const campo = board.querySelector(`.brow[data-id="${CSS.escape(id)}"] [data-f="tarea"]`);
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

/* Los dos sentidos del mismo viaje. No se copia ni se mueve nada: la tarea es la misma fila
   de siempre y lo único que cambia es de qué lado de la marca queda. */
function pasarAlRoadmap(t, silencio){
  if (!t.backlog) return false;
  // El Loom es la condición para salir: mandarla al tablero es decir «esto está hecho», y
  // sin el video nadie lo puede verificar. Se corta acá y no en cada botón porque hay tres
  // caminos hasta este punto —la fila, la ficha y la barra de marcadas— y olvidarse en uno
  // solo alcanzaría para que la regla no valga.
  if (!tieneLoom(t)) {
    if (!silencio) { aviso('Falta el Loom: cargalo antes de mandarla al tablero'); verLoom(t); }
    return false;
  }
  const antes = { backlog: t.backlog, orden: t.orden };
  // Entra al final del tablero: el orden que traía era el de su sprint y acá no dice nada.
  const ultimo = datos.tareas.reduce((m, x) => (!x.backlog && (m == null || (x.orden || 0) > m) ? (x.orden || 0) : m), null);
  t.orden = RoadmapSync.calcularOrden(ultimo, null);
  t.backlog = false;
  if (!silencio) { render(); aviso(`«${t.tarea || 'sin título'}» pasó al tablero, en ${estadoDe(t.estado).label}`); }
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
  return true;
}

function mandarAlBacklog(t, silencio){
  if (t.backlog) return;
  const antes = { backlog: t.backlog, hoy: t.hoy };
  t.backlog = true;
  // Marcada para hoy no tiene sentido guardada en el backlog: sale del sol también.
  t.hoy = false;
  if (!silencio) { render(); aviso(`«${t.tarea || 'sin título'}» volvió al backlog`); }
  persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
}

/* Una fila vacía se cierra sin preguntar —no hay nada que perder—; una escrita, no. */
async function borrarDeBacklog(t){
  const tieneAlgo = (t.tarea || '').trim() || explATexto(t.expl).trim()
    || (t.files || []).length || (t.chat || []).length || (t.subtareas || []).length;
  if (tieneAlgo && !confirm(`Se borra «${t.tarea || 'sin título'}» con todo lo que tenga adentro. ¿Seguir?`)) return;

  const idx = datos.tareas.findIndex(x => x.id === t.id);
  datos.tareas = datos.tareas.filter(x => x.id !== t.id);
  planAbierto.delete(t.id); marcadas.delete(t.id);
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

/* ---------- varias a la vez ----------
   Marcar diez y moverlas juntas es la razón de ser de una pantalla de planificación: de a
   una, repartir un sprint entre tres personas son treinta clics. */
const marcadasComoTareas = () => [...marcadas].map(tarea).filter(Boolean);

function accionEnLote(accion, boton){
  if (accion === 'limpiar') { marcadas.clear(); return renderBacklog(); }
  if (accion === 'ir') {
    const lista = marcadasComoTareas();
    if (!lista.length) return;
    // Si están todas afuera, el botón hace el camino de vuelta: un solo control para los
    // dos sentidos, igual que en la fila.
    const todasAfuera = lista.every(t => !t.backlog);
    if (todasAfuera) {
      lista.forEach(t => mandarAlBacklog(t, true));
      marcadas.clear(); render();
      aviso(`${lista.length} ${lista.length === 1 ? 'tarea volvió' : 'tareas volvieron'} al backlog`);
      return;
    }
    // Las que no tienen Loom se quedan, y quedan marcadas: así se ve cuáles fueron y se
    // puede ir a cargarles el video sin volver a buscarlas una por una.
    const sinLoom = lista.filter(t => t.backlog && !tieneLoom(t));
    const fueron = lista.filter(t => t.backlog && tieneLoom(t));
    fueron.forEach(t => pasarAlRoadmap(t, true));
    marcadas.clear();
    sinLoom.forEach(t => marcadas.add(t.id));
    render();
    aviso(sinLoom.length
      ? `${fueron.length} al tablero · ${sinLoom.length} sin Loom ${sinLoom.length === 1 ? 'quedó' : 'quedaron'} marcada${sinLoom.length === 1 ? '' : 's'}`
      : `${fueron.length} ${fueron.length === 1 ? 'tarea pasó' : 'tareas pasaron'} al tablero`);
    return;
  }
  abrirMenu(boton, accion, null);
}

function aplicarEnLote(tipo, v){
  const lista = marcadasComoTareas();
  if (!lista.length) return;
  // Todas en silencio y un solo repintado al final: treinta marcadas serían treinta
  // repintados completos de la pantalla.
  lista.forEach(t => {
    if (tipo === 'prioridad') campoTarea(t, 'prioridad', v, true);
    if (tipo === 'sprint') cambiarSprint(t, Number(v) || SIN_SPRINT, true);
    // En lote, asignar reemplaza en vez de alternar: marcar diez y que a unas se les prenda
    // y a otras se les apague la misma persona sería impredecible.
    if (tipo === 'pend') {
      const antes = [...(t.pend || [])];
      t.pend = [v];
      persistirTarea(t, { revertir: () => { t.pend = antes; render(); } });
    }
  });
  render();
}

/* ---------- arrastrar y soltar ----------
   Mueve la fila entre sus hermanas y, si se suelta en otro bloque, le cambia el sprint. El
   orden es el mismo decimal que usa el tablero: se guarda una fila, no la lista entera. */
let arrastreBacklog = null;

function engancharArrastreBacklog(){
  board.querySelectorAll('.bhandle').forEach(h => {
    h.addEventListener('dragstart', e => {
      const fila = h.closest('.brow');
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
    const fila = e.target.closest('.brow');
    if (!fila || fila.dataset.id === arrastreBacklog) return;
    const r = fila.getBoundingClientRect();
    fila.classList.add(e.clientY < r.top + r.height / 2 ? 'antes' : 'despues');
  };

  board.ondrop = e => {
    if (!arrastreBacklog) return;
    e.preventDefault();
    const t = tarea(arrastreBacklog);
    const fila = e.target.closest('.brow');
    const bloque = e.target.closest('[data-filas]');
    arrastreBacklog = null;
    if (!t) return;

    const antes = { sprint: t.sprint, orden: t.orden };
    if (fila && fila.dataset.id !== t.id) {
      const destino = tarea(fila.dataset.id); if (!destino) return;
      const r = fila.getBoundingClientRect();
      const encima = e.clientY < r.top + r.height / 2;
      const hermanas = tareasDeSprint(sprintDe(destino)).filter(x => x.id !== t.id);
      const i = hermanas.indexOf(destino);
      t.sprint = sprintDe(destino);
      t.orden = RoadmapSync.calcularOrden(
        encima ? (hermanas[i - 1] ? hermanas[i - 1].orden : null) : destino.orden,
        encima ? destino.orden : (hermanas[i + 1] ? hermanas[i + 1].orden : null));
    } else if (bloque) {
      const n = Number(bloque.dataset.filas) || SIN_SPRINT;
      const ultima = tareasDeSprint(n).filter(x => x.id !== t.id).pop();
      t.sprint = n;
      t.orden = RoadmapSync.calcularOrden(ultima ? ultima.orden : null, null);
    } else return;

    render();
    persistirTarea(t, { revertir: () => { Object.assign(t, antes); render(); } });
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
    cerrarModales(); return;
  }
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
  const v = vistaActual();
  // En el backlog la tarea nace ahí mismo, en el primer sprint y lista para escribirle el
  // título: abrir el detalle para una línea que todavía no dice nada sería un estorbo.
  if (v.backlog) return nuevaEnBacklog(sprintsVisibles()[0], null);
  // Desde la Caja no hay tablero donde mostrarla: se vuelve a una vista de tareas para
  // que la tarea recién creada quede a la vista al cerrar el detalle.
  if (sinTareas(v)) { UI.vista = 'estado'; guardarUI(); render(); }
  nuevaTarea(vistaActual(), null);
};
$('#bCsv').onclick = () => {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const cab = ['ID','Titulo','Estado','Prioridad','Tipo','Pendiente de','Sprint','Donde','Hoy','Notas','Subtareas','Conversacion','Archivos'];
  const filas = datos.tareas.map(t => [
    t.id, t.tarea,
    estadoDe(t.estado).label, prioridadDe(t.prioridad).label, tipoDe(t.tipo).label,
    (t.pend || []).map(nombrePersona).join(' | '),
    t.sprint || '', t.backlog ? 'backlog' : 'tablero',
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
    datos = { tareas:[], caja:[] };
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
      datos = { tareas:[], caja:[] };
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
