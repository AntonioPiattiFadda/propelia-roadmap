/* app.js — lógica compartida por Propelia (index.html) y Captalia (captalia.html).
   Cada página define window.APP_CONFIG antes de cargar este archivo. Toda mejora
   se hace acá una sola vez y aplica a los dos proyectos. */

const CFG = window.APP_CONFIG || {};
const ESTADOS = CFG.estados || ['Pendiente','En curso','Bloqueado','Hecho'];
// Responsables asignables. dot = clase del puntito de color, color = clase base.
const RESP = CFG.responsables || [
  { nombre:'Loro', color:'loro', dot:'l' },
  { nombre:'Toni', color:'toni', dot:'t' },
];
// Mapa email -> { nombre, color }. Lo completa Antonio con las cuentas reales.
const USUARIOS = CFG.usuarios || {};
// Identidad del usuario logueado (se resuelve tras iniciar sesión).
let YO = { nombre:'', color:'none' };

// Mapa nombre -> color, armado con los responsables + los usuarios configurados.
// Así el color de un mensaje sale bien incluso para alguien que solo visualiza
// (ej.: Toni en Captalia, que no es responsable asignable pero sí escribe/lee).
const COLOR_NOMBRE = {};
RESP.forEach(r => { COLOR_NOMBRE[r.nombre] = r.color; });
Object.values(USUARIOS).forEach(u => { if (u.nombre && u.color) COLOR_NOMBRE[u.nombre] = u.color; });
function colorDe(nombre){ return COLOR_NOMBRE[nombre] || 'none'; }

let estado = { secciones: [], tareas: [], caja: [] };

/* ---------- elementos ---------- */
const lista        = document.getElementById('lista');
const vistaFlujo   = document.getElementById('vistaFlujo');
const vistaCaja    = document.getElementById('vistaCaja');
const filtrosFlujo = document.getElementById('filtrosFlujo');
const chipsWrap    = document.getElementById('chips');
const canchaLbl    = document.getElementById('canchaLbl');
const canchaCourt  = document.getElementById('canchaCourt');
const nota         = document.getElementById('nota');
const visiblesEl   = document.getElementById('visibles');
const toast        = document.getElementById('toast');
const elGuardado   = document.getElementById('estadoGuardado');
const q            = document.getElementById('q');
const oh           = document.getElementById('oh');
const bPlegar      = document.getElementById('bPlegar');
const bNuevoBloque = document.getElementById('bNuevoBloque');
const bHtml        = document.getElementById('bHtml');
const bCsv         = document.getElementById('bCsv');
const bCerrarSesion= document.getElementById('bCerrarSesion');

/* ---------- infra optimista (guardado + reintentos + revert) ---------- */
const pendientesGuardado = new Map();
function guardarDebounced(clave, fn) {
  clearTimeout(pendientesGuardado.get(clave));
  pendientesGuardado.set(clave, setTimeout(() => { pendientesGuardado.delete(clave); fn(); }, 500));
}
const valoresAntesDelCambio = new Map();
const pendientesEnVuelo = new Map();
const generacionGuardado = new Map();
const pendienteDeRevertir = new Set();
const snapsParcial = new Map(); // snapshots para revertir edits de subtareas / caja

const ecosPropiosEsperados = new Map();
function marcarEcoPropio(tabla, id) {
  const clave = tabla+':'+id;
  ecosPropiosEsperados.set(clave, (ecosPropiosEsperados.get(clave)||0)+1);
}

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

let enVuelo = 0;
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

async function persistirTarea(t, { onEstado = onEstadoGlobal, revertir, intentos = 2 } = {}) {
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarTarea(t), { onEstado, revertir, intentos });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.tareas, t.id);
  return ok;
}
async function persistirSeccion(s, { onEstado = onEstadoGlobal, revertir, intentos = 2 } = {}) {
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarSeccion(s), { onEstado, revertir, intentos });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.secciones, s.id);
  return ok;
}
async function persistirMovimiento(m, { onEstado = onEstadoGlobal, revertir, intentos = 2 } = {}) {
  const ok = await conEstadoDeCarga(() => RoadmapSync.guardarMovimiento(m), { onEstado, revertir, intentos });
  if (ok) marcarEcoPropio(RoadmapSync.TABLAS.caja, m.id);
  return ok;
}

let refrescoPendiente = false;
function focoEditando(){
  const f = document.activeElement;
  const dentro = f && ((lista && lista.contains(f)) || (vistaCaja && vistaCaja.contains(f)));
  return dentro && (f.tagName==='INPUT' || f.tagName==='TEXTAREA' || f.tagName==='SELECT');
}
async function refrescarDesdeSupabase(payload) {
  if (payload?.table) {
    const id = payload.new?.id ?? payload.old?.id;
    const clave = payload.table+':'+id;
    const pendientes = ecosPropiosEsperados.get(clave);
    if (pendientes > 0) { ecosPropiosEsperados.set(clave, pendientes-1); return; }
  }
  if (focoEditando()) { refrescoPendiente = true; return; }
  try { estado = await RoadmapSync.cargarEstado(); }
  catch (e) { aviso('No se pudo sincronizar: ' + e.message); return; }
  pintarTodo();
}
document.addEventListener('focusout', e => {
  const enFlujo = lista && lista.contains(e.target);
  const enCaja  = vistaCaja && vistaCaja.contains(e.target);
  if (!enFlujo && !enCaja) return;
  if (refrescoPendiente) { refrescoPendiente = false; refrescarDesdeSupabase(); return; }
  if (pendienteDeRevertir.size) { pendienteDeRevertir.clear(); pintarTodo(); }
});

/* ---------- archivos (sirve para tareas y subtareas) ---------- */
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
// destino: objeto con .id y .files (tarea o subtarea). padre: la tarea a persistir.
async function adjuntar(destino, padre, files, alTerminar){
  destino.files = destino.files || [];
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
      const archivo = await RoadmapSync.subirArchivo(destino.id, blob, nombre);
      destino.files.push(archivo); subidos.push(archivo);
      n++;
    }catch(e){ saltados.push((f.name||'captura')+' (error al subir)'); }
  }
  if(n){
    await persistirTarea(padre, {
      onEstado: estado => { if (estado !== 'cargando') onEstadoGlobal(estado); },
      revertir: () => {
        subidos.forEach(a => {
          const i=destino.files.indexOf(a); if(i>-1) destino.files.splice(i,1);
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
}
function abrirArchivo(f, descargar){
  const url = RoadmapSync.urlPublica(f.path);
  const a=document.createElement('a'); a.href=url;
  if(descargar) a.download=f.n; else { a.target='_blank'; a.rel='noopener'; }
  a.click();
}
function pintarThumbs(destino, cont, padre){
  cont.innerHTML='';
  (destino.files||[]).forEach(f=>{
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
      const idx=destino.files.indexOf(f);
      const [quitado]=destino.files.splice(idx,1);
      pintarThumbs(destino,cont,padre);
      const guardadoOk = await persistirTarea(padre, {
        revertir: () => { destino.files.splice(idx,0,quitado); pintarThumbs(destino,cont,padre); },
      });
      if(guardadoOk){ try{ await RoadmapSync.borrarArchivo(quitado.path); }catch(e){} }
    };
    box.appendChild(x);
    cont.appendChild(box);
  });
}

/* ---------- estado de UI ---------- */
const abiertas = new Set();
const cerradas = new Set();
const hechasAbiertas = new Set();
const subAbiertas = new Set();
const filtros = {resp:'todas', q:'', ocultarHechas:false};

function nuevoId(pref, ids){
  let n=1; const usados=new Set(ids);
  while(usados.has(pref+String(n).padStart(2,'0'))) n++;
  return pref+String(n).padStart(2,'0');
}
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const escA = s => esc(s).replace(/"/g,'&quot;');
function fmtTs(iso){
  if(!iso) return '';
  const d=new Date(iso); if(isNaN(d)) return '';
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const GRIP='<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">'+
  [4,8,12].map(y=>`<circle cx="3" cy="${y}" r="1.35"/><circle cx="7" cy="${y}" r="1.35"/>`).join('')+'</svg>';

let arrastre=null;
const filtrando=()=>filtros.resp!=='todas'||!!filtros.q||filtros.ocultarHechas;
function limpiarZonas(){
  document.querySelectorAll('.dz-a,.dz-b,.dz-in').forEach(e=>e.classList.remove('dz-a','dz-b','dz-in'));
}
const llevaArchivos=e=>[...(e.dataTransfer?.types||[])].includes('Files');

function asa(el, tipo, id, titulo){
  const g=document.createElement('button');
  g.className='grip'; g.type='button'; g.innerHTML=GRIP;
  g.title=titulo; g.setAttribute('aria-label',titulo);
  g.addEventListener('mousedown',()=>{ el.draggable=true; });
  g.addEventListener('touchstart',()=>{ el.draggable=true; },{passive:true});
  ['mouseup','touchend'].forEach(n=>document.addEventListener(n,()=>{ el.draggable=false; }));
  g.onclick=ev=>ev.stopPropagation();
  el.addEventListener('dragstart',e=>{
    if(!el.draggable) return;
    if(filtrando()){ e.preventDefault(); el.draggable=false; aviso('Quita el filtro y la búsqueda para poder reordenar.'); return; }
    arrastre={tipo,id};
    e.dataTransfer.effectAllowed='move';
    e.dataTransfer.setData('text/plain', id);
    setTimeout(()=>el.classList.add('dragging'),0);
  });
  el.addEventListener('dragend',()=>{
    el.classList.remove('dragging'); el.draggable=false; arrastre=null; limpiarZonas();
  });
  return g;
}

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
function moverBloquePaso(id, paso){
  const a=estado.secciones, i=a.findIndex(x=>x.id===id), j=i+paso;
  if(i<0||j<0||j>=a.length) return;
  [a[i],a[j]]=[a[j],a[i]];
  const s=a[j];
  const ordenAnterior=s.orden;
  const anterior=a[j-1]?.orden ?? null;
  const siguiente=a[j+1]?.orden ?? null;
  s.orden=RoadmapSync.calcularOrden(anterior, siguiente);
  persistirSeccion(s, { revertir: () => { [a[i],a[j]]=[a[j],a[i]]; s.orden=ordenAnterior; render(); } });
  render();
}

function textoBuscable(t){
  const subs=(t.subtareas||[]).map(s=>s.titulo+' '+(s.expl||'')).join(' ');
  const chat=(t.chat||[]).map(m=>m.texto).join(' ');
  return (t.tarea+' '+t.modulo+' '+t.expl+' '+t.com+' '+t.id+' '+subs+' '+chat).toLowerCase();
}
function visible(t){
  if(filtros.resp==='sin'){ if(t.resp) return false; }
  else if(filtros.resp!=='todas' && t.resp!==filtros.resp) return false;
  if(filtros.ocultarHechas && t.estado==='Hecho') return false;
  if(filtros.q && !textoBuscable(t).includes(filtros.q)) return false;
  return true;
}

/* ---------- cabecera: chips + cancha (dinámicos según responsables) ---------- */
function construirBarras(){
  document.title = (CFG.titulo || 'Plan de trabajo') + (CFG.subtitulo ? ' · ' + CFG.subtitulo : '');
  const h1 = document.getElementById('tituloApp');
  if(h1) h1.innerHTML = esc(CFG.titulo||'Plan de trabajo') + (CFG.subtitulo?` <span>· ${esc(CFG.subtitulo)}</span>`:'');
  const yoEl = document.getElementById('yoNombre');
  if(yoEl) yoEl.innerHTML = YO.nombre ? `<i class="dot ${colorDe(YO.nombre)==='none'?'':colorDe(YO.nombre)}"></i>Sos ${esc(YO.nombre)}` : '';

  // Selector de proyecto: muestra solo los proyectos donde el usuario es miembro real
  // en `app_miembros` (YO.proyectos siempre es un array; vacío = no se ve ningún link).
  const nav = document.getElementById('navProyectos');
  if(nav){
    const proys = CFG.proyectos || [];
    const permitidos = YO.proyectos || [];
    const vis = proys.filter(p => permitidos.includes(p.clave));
    nav.innerHTML = vis.map(p =>
      `<a href="${escA(p.url)}"${p.clave===CFG.proyecto?' aria-current="page"':''}>${esc(p.nombre)}</a>`).join('');
    nav.hidden = vis.length < 2;
  }

  if(chipsWrap){
    chipsWrap.innerHTML =
      `<button class="chip" data-f="todas" aria-pressed="true">Todas</button>` +
      RESP.map(r=>`<button class="chip" data-f="${escA(r.nombre)}" aria-pressed="false"><i class="dot ${r.dot}"></i>${r.nombre===YO.nombre?'Lo mío':esc(r.nombre)}</button>`).join('') +
      `<button class="chip" data-f="sin" aria-pressed="false"><i class="dot"></i>Sin asignar</button>`;
    chipsWrap.querySelectorAll('.chip').forEach(c=>{
      c.onclick=()=>{
        filtros.resp=c.dataset.f;
        chipsWrap.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===c));
        render();
      };
    });
  }
  if(canchaCourt){
    canchaCourt.innerHTML = RESP.map(r=>`<i class="c-${r.color}" data-r="${escA(r.nombre)}"></i>`).join('') + `<i class="c-none"></i>`;
  }
}

function cancha(){
  if(!canchaLbl) return;
  const act = t=>t.estado!=='Hecho';
  const cuentas = {};
  RESP.forEach(r=>{ cuentas[r.nombre]=estado.tareas.filter(t=>t.resp===r.nombre&&act(t)).length; });
  const sin=estado.tareas.filter(t=>!t.resp&&act(t)).length;
  const h=estado.tareas.filter(t=>t.estado==='Hecho').length;
  canchaLbl.innerHTML = RESP.map(r=>`<span class="cl-${r.color}">${esc(r.nombre)} <b>${cuentas[r.nombre]}</b></span>`).join('');
  const tot=Math.max(RESP.reduce((a,r)=>a+cuentas[r.nombre],0)+sin,1);
  RESP.forEach(r=>{
    const i=canchaCourt?.querySelector(`i[data-r="${CSS.escape(r.nombre)}"]`);
    if(i) i.style.flexGrow=cuentas[r.nombre]/tot;
  });
  const iNone=canchaCourt?.querySelector('.c-none');
  if(iNone) iNone.style.flexGrow=sin/tot;
  nota.textContent=(sin?sin+' sin asignar · ':'')+h+' hechas de '+estado.tareas.length;
}

function autosize(el){ el.style.height='auto'; el.style.height=(el.scrollHeight+2)+'px'; }

/* ---------- segmento de responsable ---------- */
function montarSeg(getResp, onPick){
  const seg=document.createElement('div'); seg.className='seg';
  RESP.forEach(r=>{
    const b=document.createElement('button'); b.type='button'; b.dataset.r=r.nombre;
    b.setAttribute('aria-pressed', getResp()===r.nombre);
    b.innerHTML=`<i class="dot ${r.dot}"></i>${esc(r.nombre)}`;
    b.onclick=ev=>{
      ev.stopPropagation();
      const nuevo = getResp()===r.nombre ? '' : r.nombre;
      onPick(nuevo);
      seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed', x.dataset.r===nuevo));
    };
    seg.appendChild(b);
  });
  return seg;
}

/* ---------- chat (tareas y subtareas) ---------- */
// chatArr: array de {autor, ts, texto}. persist: (opts)=>Promise que guarda el padre.
function montarChat(chatArr, persist){
  const box=document.createElement('div'); box.className='chat';
  const log=document.createElement('div'); log.className='chat-log';
  const inp=document.createElement('div'); inp.className='chat-input';
  const ta=document.createElement('textarea'); ta.rows=1; ta.placeholder='Escribí…';
  const bt=document.createElement('button'); bt.className='chat-enviar'; bt.type='button'; bt.textContent='Enviar';
  inp.append(ta,bt); box.append(log,inp);

  function pintar(){
    log.innerHTML='';
    chatArr.forEach((m,i)=>{
      const col=colorDe(m.autor);
      const ln=document.createElement('div'); ln.className='linea a-'+col;
      ln.innerHTML=`<span class="aut">${esc(m.autor||'—')}:</span><span class="txt">${esc(m.texto)}</span><span class="ts">${fmtTs(m.ts)}</span>`;
      if(m.autor && m.autor===YO.nombre){
        const x=document.createElement('button');
        x.className='del-linea'; x.type='button'; x.title='Borrar'; x.textContent='✕';
        x.onclick=()=>{
          const [q]=chatArr.splice(i,1); pintar();
          persist({ revertir:()=>{ chatArr.splice(i,0,q); pintar(); } });
        };
        ln.appendChild(x);
      }
      log.appendChild(ln);
    });
    log.scrollTop=log.scrollHeight;
  }
  function enviar(){
    const txt=ta.value.trim(); if(!txt) return;
    const m={ autor:YO.nombre||'', ts:new Date().toISOString(), texto:txt };
    chatArr.push(m); ta.value=''; autosize(ta); pintar();
    persist({ revertir:()=>{ const i=chatArr.indexOf(m); if(i>-1) chatArr.splice(i,1); pintar(); } });
  }
  bt.onclick=enviar;
  ta.oninput=()=>autosize(ta);
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); enviar(); } });
  pintar();
  return box;
}

/* ---------- subtareas ---------- */
function todosLosSubIds(){
  return estado.tareas.flatMap(t=>(t.subtareas||[]).map(s=>s.id));
}
function guardarPadreDebounced(t, key){
  if(!snapsParcial.has(key)) snapsParcial.set(key, JSON.stringify(t.subtareas||[]));
  guardarDebounced(key, ()=>{
    persistirTarea(t, {
      revertir: ()=>{
        try{ t.subtareas = JSON.parse(snapsParcial.get(key)); }catch(e){}
        if(!focoEditando()) render();
      },
    }).then(()=>{ if(!pendientesGuardado.has(key)) snapsParcial.delete(key); });
  });
}

function pintarSub(t, sub){
  const el=document.createElement('div');
  el.className='sub'+(subAbiertas.has(sub.id)?' open':'');
  el.dataset.resp=sub.resp||''; el.dataset.estado=sub.estado;

  const head=document.createElement('div'); head.className='sub-head';
  const chk=document.createElement('input'); chk.type='checkbox'; chk.className='sub-chk';
  chk.checked = sub.estado==='Hecho'; chk.title='Marcar hecha';
  const car=document.createElement('button'); car.className='caret'; car.type='button'; car.innerHTML='&#9654;';
  const ttl=document.createElement('div'); ttl.className='sub-t'+(sub.titulo?'':' vacio');
  ttl.textContent=sub.titulo||'Subtarea sin título';
  const seg=montarSeg(()=>sub.resp, nuevo=>{
    const snap=JSON.stringify(t.subtareas);
    sub.resp=nuevo; el.dataset.resp=nuevo;
    persistirTarea(t, { revertir:()=>{ t.subtareas=JSON.parse(snap); render(); } });
    cancha();
  });
  const del=document.createElement('button'); del.className='sub-del'; del.type='button'; del.title='Borrar subtarea'; del.innerHTML='🗑';

  head.append(chk,car,ttl,seg,del);

  const body=document.createElement('div'); body.className='sub-body';
  body.innerHTML=`
    <div class="grp"><input class="fld titulo-grande" data-sk="titulo" value="${escA(sub.titulo)}" placeholder="Título de la subtarea"></div>
    <div class="grp"><label class="lbl">Explicación</label>
      <textarea class="fld expl" data-sk="expl" placeholder="Detalle de la subtarea">${esc(sub.expl||'')}</textarea></div>
    <div class="grp"><label class="lbl">Chat de la subtarea</label><div class="chat-slot"></div></div>
    <div class="grp"><label class="lbl">Archivos</label>
      <div class="zona">
        <span class="zona-txt">Arrastra archivos, pega con <kbd>Ctrl</kbd>+<kbd>V</kbd>, o</span>
        <button class="mini2" type="button" data-pick>Elegir archivos</button>
        <input type="file" multiple hidden data-file>
      </div>
      <div class="thumbs"></div>
    </div>`;
  el.append(head,body);

  // abrir/cerrar
  const toggle=e=>{
    if(e.target.closest('.seg,.sub-chk,.sub-del,.sub-body')) return;
    el.classList.toggle('open');
    el.classList.contains('open')?subAbiertas.add(sub.id):subAbiertas.delete(sub.id);
    if(el.classList.contains('open')) body.querySelectorAll('textarea').forEach(autosize);
  };
  head.onclick=toggle;

  chk.onclick=ev=>ev.stopPropagation();
  chk.onchange=()=>{
    const snap=JSON.stringify(t.subtareas);
    sub.estado = chk.checked ? 'Hecho' : 'Pendiente';
    el.dataset.estado=sub.estado; ttl.className='sub-t'+(sub.titulo?'':' vacio');
    persistirTarea(t, { revertir:()=>{ t.subtareas=JSON.parse(snap); render(); } });
  };
  del.onclick=async ev=>{
    ev.stopPropagation();
    if(!confirm('Se borra la subtarea «'+(sub.titulo||sub.id)+'». ¿Seguir?')) return;
    const snap=JSON.stringify(t.subtareas);
    const files=sub.files||[];
    t.subtareas=t.subtareas.filter(x=>x.id!==sub.id);
    render();
    const ok=await persistirTarea(t, { revertir:()=>{ t.subtareas=JSON.parse(snap); render(); } });
    if(ok){ for(const f of files){ try{ await RoadmapSync.borrarArchivo(f.path); }catch(e){} } }
  };

  // campos texto (título / explicación) con autoguardado
  body.querySelectorAll('[data-sk]').forEach(inp=>{
    inp.oninput=()=>{
      sub[inp.dataset.sk]=inp.value;
      if(inp.tagName==='TEXTAREA') autosize(inp);
      if(inp.dataset.sk==='titulo'){ ttl.textContent=inp.value||'Subtarea sin título'; ttl.classList.toggle('vacio',!inp.value); }
      guardarPadreDebounced(t, 'sub:'+sub.id);
    };
  });

  // chat de la subtarea
  sub.chat=sub.chat||[];
  body.querySelector('.chat-slot').appendChild(montarChat(sub.chat, opts=>persistirTarea(t, opts)));

  // archivos de la subtarea
  const thumbs=body.querySelector('.thumbs'), zona=body.querySelector('.zona');
  const inFile=body.querySelector('[data-file]');
  sub.files=sub.files||[];
  pintarThumbs(sub, thumbs, t);
  const repinta=()=>pintarThumbs(sub, thumbs, t);
  body.querySelector('[data-pick]').onclick=ev=>{ ev.stopPropagation(); inFile.click(); };
  inFile.onchange=ev=>{ if(ev.target.files.length) adjuntar(sub, t, [...ev.target.files], repinta); ev.target.value=''; };
  ['dragenter','dragover'].forEach(n=>zona.addEventListener(n,e=>{ if(!llevaArchivos(e))return; e.preventDefault();e.stopPropagation();zona.classList.add('drag'); }));
  ['dragleave','drop'].forEach(n=>zona.addEventListener(n,e=>{ if(!llevaArchivos(e))return; e.preventDefault();e.stopPropagation();zona.classList.remove('drag'); }));
  zona.addEventListener('drop',e=>{ const fs=[...(e.dataTransfer?.files||[])]; if(fs.length) adjuntar(sub, t, fs, repinta); });

  if(subAbiertas.has(sub.id)) setTimeout(()=>body.querySelectorAll('textarea').forEach(autosize),0);
  return el;
}

function montarSubtareas(t){
  t.subtareas=t.subtareas||[];
  const cont=document.createElement('div'); cont.className='subs';
  t.subtareas.forEach(sub=>cont.appendChild(pintarSub(t, sub)));
  const add=document.createElement('button'); add.className='addsub'; add.type='button';
  add.textContent='+  Nueva subtarea';
  add.onclick=()=>{
    const id=nuevoId('ST', todosLosSubIds());
    const sub={ id, titulo:'', resp:'', estado:'Pendiente', expl:'', chat:[], files:[] };
    t.subtareas.push(sub);
    subAbiertas.add(id);
    render();
    persistirTarea(t, { revertir:()=>{ t.subtareas=t.subtareas.filter(x=>x.id!==id); render(); } });
    const el=document.querySelector(`.sub[data-id="${id}"] [data-sk=titulo]`);
  };
  cont.appendChild(add);
  return cont;
}

/* ---------- fila de tarea ---------- */
function pintarFila(t){
  t.chat=t.chat||[]; t.subtareas=t.subtareas||[];
  const row=document.createElement('article');
  row.className='row'+(abiertas.has(t.id)?' open':'');
  row.dataset.resp=t.resp||''; row.dataset.estado=t.estado; row.dataset.id=t.id;
  const roja=(t.com||'').includes('🔴');
  const nSub=t.subtareas.length;
  const opciones=estado.secciones.map(s=>
    `<option value="${s.id}" ${s.id===t.sec?'selected':''}>${esc(s.titulo.slice(0,58))}</option>`).join('');
  row.innerHTML=`
   <div class="r-head">
     <span class="grip-slot"></span>
     <button class="caret" aria-label="Abrir o cerrar">&#9654;</button>
     <span class="r-id">${t.id}</span>
     <div class="r-t${t.tarea?'':' vacio'}">${esc(t.tarea)||'Tarea sin título — ábrela y ponle nombre'}</div>
     ${nSub?`<span class="sub-count" title="Subtareas">☑ ${nSub}</span>`:''}
     ${roja?'<span class="flag" title="Nota marcada">🔴</span>':''}
     <span class="seg-slot"></span>
     <select class="est" aria-label="Estado">${ESTADOS.map(e=>`<option ${e===t.estado?'selected':''}>${e}</option>`).join('')}</select>
     <span class="menu-slot"></span>
   </div>
   <div class="r-body">
     <div class="grp"><input class="fld titulo-grande" data-k="tarea" value="${escA(t.tarea)}" placeholder="Qué hay que hacer"></div>
     <div class="grp"><label class="lbl">Explicación</label>
       <textarea class="fld expl" data-k="expl" placeholder="El detalle completo: qué pasa, cuándo, y cómo debería quedar">${esc(t.expl)}</textarea></div>

     <div class="grp seccion-panel"><label class="lbl">Subtareas</label><div class="subs-slot"></div></div>

     <div class="grp seccion-panel"><label class="lbl">Conversación</label><div class="chat-slot"></div></div>

     <div class="grp seccion-panel"><label class="lbl">Archivos y capturas</label>
       <div class="zona">
         <span class="zona-txt">Arrastra archivos aquí, pega una captura con <kbd>Ctrl</kbd>+<kbd>V</kbd>, o</span>
         <button class="mini2" type="button" data-pick>Elegir archivos</button>
         <input type="file" multiple hidden data-file>
       </div>
       <div class="thumbs"></div>
     </div>

     <div class="r-foot">
       <div class="mover"><span class="lbl">Bloque</span>
         <select data-mover>${opciones}</select></div>
       <button class="del">Borrar tarea</button>
     </div>
   </div>`;

  row.querySelector('.grip-slot').replaceWith(asa(row,'tarea',t.id,'Arrastra para mover la tarea'));

  // segmento de responsable (resaltado)
  const seg=montarSeg(()=>t.resp, nuevo=>{
    const respAnterior=t.resp;
    t.resp=nuevo; row.dataset.resp=t.resp;
    persistirTarea(t, { revertir: () => { t.resp=respAnterior; render(); cancha(); } });
    cancha();
    if(filtros.resp!=='todas') render();
  });
  row.querySelector('.seg-slot').replaceWith(seg);

  // menú de tres puntos (borrar sin desplegar)
  const menuSlot=row.querySelector('.menu-slot');
  const wrap=document.createElement('span'); wrap.className='menu-wrap';
  wrap.innerHTML=`
    <button class="tool" data-menu title="Más opciones" aria-haspopup="true" aria-expanded="false">&#8943;</button>
    <div class="menu" hidden role="menu">
      <button data-abrir role="menuitem">Abrir / editar</button>
      <button data-sub role="menuitem">Agregar subtarea</button>
      <hr>
      <button data-del class="peligro" role="menuitem">Borrar tarea</button>
    </div>`;
  menuSlot.replaceWith(wrap);
  const bm=wrap.querySelector('[data-menu]'), menu=wrap.querySelector('.menu');
  bm.onclick=ev=>{
    ev.stopPropagation();
    const abierto=!menu.hidden; cerrarMenus();
    if(!abierto){ menu.hidden=false; bm.setAttribute('aria-expanded','true'); }
  };
  menu.onclick=ev=>ev.stopPropagation();
  menu.querySelector('[data-abrir]').onclick=()=>{ cerrarMenus(); if(!row.classList.contains('open')){ abiertas.add(t.id); render(); } };
  menu.querySelector('[data-sub]').onclick=()=>{
    cerrarMenus();
    if(!row.classList.contains('open')){ abiertas.add(t.id); }
    const id=nuevoId('ST', todosLosSubIds());
    t.subtareas.push({ id, titulo:'', resp:'', estado:'Pendiente', expl:'', chat:[], files:[] });
    subAbiertas.add(id); render();
    persistirTarea(t, { revertir:()=>{ t.subtareas=t.subtareas.filter(x=>x.id!==id); render(); } });
  };

  const btnDel=menu.querySelector('[data-del]');
  const borrarTarea=async (btn)=>{
    if(!confirm('Se borra «'+(t.tarea||t.id)+'». ¿Seguir?')) return;
    const idx=estado.tareas.findIndex(x=>x.id===t.id);
    const copia=t;
    estado.tareas=estado.tareas.filter(x=>x.id!==t.id);
    abiertas.delete(t.id); render();
    const files=[...(t.files||[]), ...((t.subtareas||[]).flatMap(s=>s.files||[]))];
    const okBorrado = await conEstadoDeCarga(async () => {
      for(const f of files){ try{ await RoadmapSync.borrarArchivo(f.path); }catch(e){} }
      await RoadmapSync.borrarTarea(t.id);
    }, {
      onEstado: combinar(onEstadoBoton(btn, 'Borrando...'), onEstadoGlobal),
      revertir: () => { estado.tareas.splice(idx,0,copia); render(); },
    });
    if (okBorrado) marcarEcoPropio(RoadmapSync.TABLAS.tareas, t.id);
  };
  btnDel.onclick=()=>{ cerrarMenus(); borrarTarea(btnDel); };

  // abrir/cerrar
  const toggle = e=>{
    if(e.target.closest('.seg,select,.r-body,.grip,.menu-wrap')) return;
    row.classList.toggle('open');
    row.classList.contains('open') ? abiertas.add(t.id) : abiertas.delete(t.id);
    if(row.classList.contains('open')) row.querySelectorAll('.r-body textarea').forEach(autosize);
  };
  row.querySelector('.r-head').onclick = toggle;

  // estado
  row.querySelector('.est').onchange=e=>{
    const estadoAnterior=t.estado;
    t.estado=e.target.value; row.dataset.estado=t.estado;
    persistirTarea(t, { revertir: () => { t.estado=estadoAnterior; render(); cancha(); actualizarPills(); } });
    cancha(); actualizarPills();
    if(filtros.ocultarHechas || estadoAnterior==='Hecho' || t.estado==='Hecho') render();
  };

  // campos de texto de la tarea (con la lógica optimista original)
  row.querySelectorAll('.r-body [data-k]').forEach(el=>{
    el.oninput=()=>{
      if(!valoresAntesDelCambio.has(t.id)) valoresAntesDelCambio.set(t.id, {...t});
      t[el.dataset.k]=el.value;
      if(el.tagName==='TEXTAREA') autosize(el);
      if(el.dataset.k==='tarea'){
        const ttl=row.querySelector('.r-t');
        ttl.textContent=el.value||'Tarea sin título — ábrela y ponle nombre';
        ttl.classList.toggle('vacio', !el.value);
      }
      guardarDebounced(t.id, () => {
        pendientesEnVuelo.set(t.id, (pendientesEnVuelo.get(t.id)||0)+1);
        const miGen = (generacionGuardado.get(t.id)||0)+1;
        generacionGuardado.set(t.id, miGen);
        persistirTarea(t, {
          revertir: () => {
            if (generacionGuardado.get(t.id) !== miGen) return;
            const previo = valoresAntesDelCambio.get(t.id);
            if (previo) Object.assign(t, previo);
            const enFoco=document.activeElement;
            if(enFoco && row.contains(enFoco) && (enFoco.tagName==='INPUT'||enFoco.tagName==='TEXTAREA')){
              pendienteDeRevertir.add(t.id);
            } else render();
          },
        }).then(() => {
          const restantes = (pendientesEnVuelo.get(t.id)||1) - 1;
          if (restantes <= 0 && !pendientesGuardado.has(t.id)) {
            pendientesEnVuelo.delete(t.id); valoresAntesDelCambio.delete(t.id);
          } else pendientesEnVuelo.set(t.id, Math.max(0, restantes));
        });
      });
    };
  });

  // subtareas
  row.querySelector('.subs-slot').appendChild(montarSubtareas(t));
  // asignar data-id a cada .sub para poder enfocar la nueva
  row.querySelectorAll('.sub').forEach((el,i)=>{ el.dataset.id=t.subtareas[i]?.id||''; });

  // chat de la tarea
  row.querySelector('.chat-slot').appendChild(montarChat(t.chat, opts=>persistirTarea(t, opts)));

  // archivos de la tarea
  const thumbs=row.querySelector('.r-body>.seccion-panel .thumbs')||row.querySelector('.thumbs');
  const zona=row.querySelector('.r-body .zona');
  const inFile=row.querySelector('.r-body [data-file]');
  pintarThumbs(t, thumbs, t);
  const repinta=()=>pintarThumbs(t, thumbs, t);
  row.querySelector('.r-body [data-pick]').onclick=ev=>{ ev.stopPropagation(); inFile.click(); };
  inFile.onchange=ev=>{ if(ev.target.files.length) adjuntar(t, t, [...ev.target.files], repinta); ev.target.value=''; };
  ['dragenter','dragover'].forEach(n=>zona.addEventListener(n,e=>{
    if(!llevaArchivos(e)) return;
    e.preventDefault(); e.stopPropagation(); zona.classList.add('drag'); }));
  ['dragleave','drop'].forEach(n=>zona.addEventListener(n,e=>{
    if(!llevaArchivos(e)) return;
    e.preventDefault(); e.stopPropagation(); zona.classList.remove('drag'); }));
  zona.addEventListener('drop',e=>{
    const fs=[...(e.dataTransfer?.files||[])];
    if(fs.length) adjuntar(t, t, fs, repinta);
  });
  row.querySelector('.r-body').addEventListener('paste',e=>{
    const fs=[...(e.clipboardData?.files||[])].filter(f=>f.size);
    if(!fs.length) return;
    e.preventDefault(); adjuntar(t, t, fs, repinta);
  });

  // arrastre de la fila
  row.addEventListener('dragover',e=>{
    if(arrastre?.tipo!=='tarea'||arrastre.id===t.id||llevaArchivos(e)) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='move';
    const r=row.getBoundingClientRect();
    const abajo=e.clientY > r.top + r.height/2;
    limpiarZonas(); row.classList.add(abajo?'dz-b':'dz-a');
  });
  row.addEventListener('drop',e=>{
    if(arrastre?.tipo!=='tarea'||llevaArchivos(e)) return;
    e.preventDefault(); e.stopPropagation();
    const abajo=row.classList.contains('dz-b');
    const id=arrastre.id; limpiarZonas();
    moverTarea(id, t.id, abajo);
  });

  // mover de bloque
  row.querySelector('[data-mover]').onchange=e=>{
    const secAnterior=t.sec, ordenAnterior=t.orden;
    t.sec=e.target.value;
    const delSec=estado.tareas.filter(x=>x.sec===t.sec && x.id!==t.id);
    const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
    t.orden=RoadmapSync.calcularOrden(ultimo, null);
    persistirTarea(t, { revertir: () => { t.sec=secAnterior; t.orden=ordenAnterior; render(); } });
    render();
  };
  row.querySelector('.del').onclick=e=>{ borrarTarea(e.currentTarget); };

  if(abiertas.has(t.id)) setTimeout(()=>row.querySelectorAll('.r-body textarea').forEach(autosize),0);
  return row;
}

function actualizarPills(){
  estado.secciones.forEach(s=>{
    const el=document.querySelector(`.sec[data-id="${s.id}"] .pill`);
    if(!el) return;
    const suyas=estado.tareas.filter(t=>t.sec===s.id);
    el.textContent=suyas.filter(t=>t.estado!=='Hecho').length+' abiertas / '+suyas.length;
  });
}

function pintarSeccion(s){
  const suyas=estado.tareas.filter(t=>t.sec===s.id);
  const vis=suyas.filter(visible);
  if(filtrando() && !vis.length) return null;

  const sec=document.createElement('section');
  sec.className='sec'+(cerradas.has(s.id)?'':' open');
  sec.dataset.id=s.id;
  sec.innerHTML=`
    <div class="sec-h">
      <span class="grip-slot"></span>
      <button class="caret" aria-label="Plegar o desplegar bloque">&#9654;</button>
      <input class="sec-name" value="${escA(s.titulo)}" aria-label="Nombre del bloque" placeholder="Nombre del bloque">
      <div class="sec-tools">
        <span class="menu-wrap">
          <button class="tool" data-menu title="Más opciones" aria-haspopup="true" aria-expanded="false">&#8943;</button>
          <div class="menu" hidden role="menu">
            <button data-up role="menuitem">Subir bloque</button>
            <button data-down role="menuitem">Bajar bloque</button>
            <hr>
            <button data-del class="peligro" role="menuitem">Borrar bloque</button>
          </div>
        </span>
      </div>
      <span class="pill">${suyas.filter(t=>t.estado!=='Hecho').length} abiertas / ${suyas.length}</span>
    </div>
    <div class="sec-body"></div>`;

  sec.querySelector('.caret').onclick=()=>{
    sec.classList.toggle('open');
    sec.classList.contains('open')?cerradas.delete(s.id):cerradas.add(s.id);
  };
  const inp=sec.querySelector('.sec-name');
  inp.oninput=()=>{
    if(!valoresAntesDelCambio.has(s.id)) valoresAntesDelCambio.set(s.id, {...s});
    s.titulo=inp.value;
    guardarDebounced(s.id, () => {
      pendientesEnVuelo.set(s.id, (pendientesEnVuelo.get(s.id)||0)+1);
      const miGen = (generacionGuardado.get(s.id)||0)+1;
      generacionGuardado.set(s.id, miGen);
      persistirSeccion(s, {
        revertir: () => {
          if (generacionGuardado.get(s.id) !== miGen) return;
          const previo = valoresAntesDelCambio.get(s.id);
          if (previo) Object.assign(s, previo);
          const enFoco=document.activeElement;
          if(enFoco && sec.contains(enFoco) && (enFoco.tagName==='INPUT'||enFoco.tagName==='TEXTAREA')){
            pendienteDeRevertir.add(s.id);
          } else render();
        },
      }).then(() => {
        const restantes = (pendientesEnVuelo.get(s.id)||1) - 1;
        if (restantes <= 0 && !pendientesGuardado.has(s.id)) {
          pendientesEnVuelo.delete(s.id); valoresAntesDelCambio.delete(s.id);
        } else pendientesEnVuelo.set(s.id, Math.max(0, restantes));
      });
    });
  };
  inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); inp.blur(); } };
  const cab=sec.querySelector('.sec-h');
  cab.querySelector('.grip-slot').replaceWith(asa(cab,'bloque',s.id,'Arrastra para mover el bloque'));
  cab.addEventListener('dragover',e=>{
    if(llevaArchivos(e)) return;
    if(arrastre?.tipo==='bloque'&&arrastre.id!==s.id){
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='move';
      const r=cab.getBoundingClientRect();
      limpiarZonas(); sec.classList.add(e.clientY>r.top+r.height/2?'dz-b':'dz-a');
    } else if(arrastre?.tipo==='tarea'){
      e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect='move';
      limpiarZonas(); cab.classList.add('dz-in');
    }
  });
  cab.addEventListener('drop',e=>{
    if(llevaArchivos(e)||!arrastre) return;
    e.preventDefault(); e.stopPropagation();
    const {tipo,id}=arrastre;
    if(tipo==='bloque'){ const abajo=sec.classList.contains('dz-b'); limpiarZonas(); moverBloque(id,s.id,abajo); }
    else { limpiarZonas(); cerradas.delete(s.id); moverTareaAlFinal(id,s.id); }
  });

  const wrap=sec.querySelector('.menu-wrap'), bm=wrap.querySelector('[data-menu]'), menu=wrap.querySelector('.menu');
  bm.onclick=ev=>{
    ev.stopPropagation();
    const abierto=!menu.hidden; cerrarMenus();
    if(!abierto){
      menu.hidden=false; sec.classList.add('menu-open'); bm.setAttribute('aria-expanded','true');
      const i=estado.secciones.findIndex(x=>x.id===s.id);
      menu.querySelector('[data-up]').disabled = i<=0;
      menu.querySelector('[data-down]').disabled = i>=estado.secciones.length-1;
    }
  };
  menu.onclick=ev=>ev.stopPropagation();
  menu.querySelector('[data-up]').onclick=()=>{ cerrarMenus(); moverBloquePaso(s.id,-1); };
  menu.querySelector('[data-down]').onclick=()=>{ cerrarMenus(); moverBloquePaso(s.id,1); };
  const btnDelBloque=sec.querySelector('[data-del]');
  btnDelBloque.onclick=async ()=>{
    cerrarMenus();
    if(suyas.length){ aviso('Ese bloque tiene '+suyas.length+' tareas. Muévelas o bórralas primero.'); return; }
    if(!confirm('Se borra el bloque «'+s.titulo+'». ¿Seguir?')) return;
    const idx=estado.secciones.findIndex(x=>x.id===s.id);
    estado.secciones=estado.secciones.filter(x=>x.id!==s.id); render();
    const okBorrado = await conEstadoDeCarga(() => RoadmapSync.borrarSeccion(s.id), {
      onEstado: combinar(onEstadoBoton(btnDelBloque, 'Borrando...'), onEstadoGlobal),
      revertir: () => { estado.secciones.splice(idx,0,s); render(); },
    });
    if (okBorrado) marcarEcoPropio(RoadmapSync.TABLAS.secciones, s.id);
  };

  const body=sec.querySelector('.sec-body');
  body.addEventListener('dragover',e=>{
    if(arrastre?.tipo!=='tarea'||llevaArchivos(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    if(!body.querySelector('.dz-a,.dz-b')){ limpiarZonas(); body.classList.add('dz-in'); }
  });
  body.addEventListener('drop',e=>{
    if(arrastre?.tipo!=='tarea'||llevaArchivos(e)) return;
    e.preventDefault(); const id=arrastre.id; limpiarZonas(); moverTareaAlFinal(id,s.id);
  });
  const activas = vis.filter(t=>t.estado!=='Hecho');
  const hechas  = vis.filter(t=>t.estado==='Hecho');
  activas.forEach(t=>body.appendChild(pintarFila(t)));
  if(!vis.length){
    const v=document.createElement('div');
    v.className='empty'; v.style.padding='18px'; v.textContent='Bloque vacío.';
    body.appendChild(v);
  } else if(!activas.length && !filtros.q){
    const v=document.createElement('div');
    v.className='empty'; v.style.padding='18px'; v.textContent='Sin tareas pendientes. 🎉';
    body.appendChild(v);
  }
  if(hechas.length){
    const abierto = hechasAbiertas.has(s.id) || !!filtros.q;
    const drawer=document.createElement('div');
    drawer.className='hechas'+(abierto?' open':'');
    drawer.innerHTML=`<button class="hechas-h"><span class="cr">&#9654;</span> ${hechas.length} ${hechas.length===1?'hecha':'hechas'}</button><div class="hechas-body"></div>`;
    const cuerpo=drawer.querySelector('.hechas-body');
    hechas.forEach(t=>cuerpo.appendChild(pintarFila(t)));
    drawer.querySelector('.hechas-h').onclick=()=>{
      drawer.classList.toggle('open');
      drawer.classList.contains('open')?hechasAbiertas.add(s.id):hechasAbiertas.delete(s.id);
    };
    body.appendChild(drawer);
  }
  const add=document.createElement('button');
  add.className='addrow'; add.textContent='+  Nueva tarea en este bloque';
  add.onclick=()=>{
    const id=nuevoId('T', estado.tareas.map(x=>x.id));
    const delSec=estado.tareas.filter(x=>x.sec===s.id);
    const ultimo=delSec.length ? delSec[delSec.length-1].orden : null;
    const nueva={id,sec:s.id,modulo:'',tarea:'',expl:'',resp:'',estado:'Pendiente',img:'',com:'',fecha:'',files:[],chat:[],subtareas:[],orden:RoadmapSync.calcularOrden(ultimo,null)};
    estado.tareas.push(nueva);
    abiertas.add(id); cerradas.delete(s.id); render();
    persistirTarea(nueva, {
      revertir: () => { estado.tareas=estado.tareas.filter(x=>x.id!==id); abiertas.delete(id); render(); },
    });
    const el=document.querySelector(`.row[data-id="${id}"] [data-k=tarea]`);
    if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
  };
  body.appendChild(add);
  return sec;
}

function render(){
  if(!lista) return;
  lista.innerHTML='';
  let n=0;
  estado.secciones.forEach(s=>{
    const el=pintarSeccion(s);
    if(el){ lista.appendChild(el); n+=estado.tareas.filter(t=>t.sec===s.id&&visible(t)).length; }
  });
  if(!estado.secciones.length){
    lista.innerHTML='<div class="empty">No hay bloques. Crea el primero con el botón de abajo.</div>';
  } else if(!n && filtrando()){
    lista.innerHTML='<div class="empty">Ninguna tarea encaja con este filtro. Prueba «Todas» o vacía la búsqueda.</div>';
  }
  if(visiblesEl) visiblesEl.textContent=n+' visibles';
  cancha();
}

/* ---------- caja ---------- */
const fmtMoney = n => (Number(n)||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2});

function editCaja(m, campo, valor){
  const key='caja:'+m.id;
  if(!snapsParcial.has(key)) snapsParcial.set(key, JSON.stringify(m));
  m[campo]=valor;
  guardarDebounced(key, ()=>{
    persistirMovimiento(m, {
      revertir: ()=>{
        try{ Object.assign(m, JSON.parse(snapsParcial.get(key))); }catch(e){}
        if(!focoEditando()) renderCaja();
      },
    }).then(()=>{ if(!pendientesGuardado.has(key)) snapsParcial.delete(key); });
  });
}

function renderCaja(){
  if(!vistaCaja) return;
  const movs=[...estado.caja].sort((a,b)=>(a.orden||0)-(b.orden||0));
  const ingresos=movs.filter(m=>m.monto>0).reduce((a,m)=>a+m.monto,0);
  const egresos =movs.filter(m=>m.monto<0).reduce((a,m)=>a+m.monto,0);
  const saldo=ingresos+egresos;
  const etiquetaMonto = CFG.caja?.etiquetaMonto || 'Monto (+ ingreso / − gasto)';
  const intro = CFG.caja?.intro || 'Anotá los movimientos de dinero. Montos en positivo = entra, en negativo = sale.';

  vistaCaja.innerHTML=`
    <p class="caja-intro">${esc(intro)}</p>
    <div class="caja-top">
      <div class="saldo-card total"><div class="lbl">Saldo</div><div class="val">${fmtMoney(saldo)}</div></div>
      <div class="saldo-card ingresos"><div class="lbl">${esc(CFG.caja?.etiquetaIngresos || 'Ingresos / aportes')}</div><div class="val">${fmtMoney(ingresos)}</div></div>
      <div class="saldo-card egresos"><div class="lbl">${esc(CFG.caja?.etiquetaEgresos || 'Gastos')}</div><div class="val">${fmtMoney(Math.abs(egresos))}</div></div>
    </div>
    <div class="caja-tabla-wrap">
      <table class="caja">
        <thead><tr>
          <th style="width:130px">Fecha</th>
          <th>Concepto</th>
          <th style="width:150px">Categoría</th>
          <th style="width:150px">Cuenta</th>
          <th class="num" style="width:150px">${esc(etiquetaMonto)}</th>
          <th>Notas</th>
          <th style="width:40px"></th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <button class="caja-add" type="button">+  Nuevo movimiento</button>`;

  const tbody=vistaCaja.querySelector('tbody');
  if(!movs.length){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="7" style="padding:22px;text-align:center;color:var(--muted)">Sin movimientos todavía. Agregá el primero abajo.</td>`;
    tbody.appendChild(tr);
  }
  movs.forEach(m=>tbody.appendChild(filaCaja(m)));

  vistaCaja.querySelector('.caja-add').onclick=()=>{
    const id=nuevoId('M', estado.caja.map(x=>x.id));
    const ultimo=movs.length ? movs[movs.length-1].orden : null;
    const nuevo={ id, fecha:new Date().toISOString().slice(0,10), concepto:'', categoria:'', monto:0, cuenta:'', notas:'', orden:RoadmapSync.calcularOrden(ultimo,null) };
    estado.caja.push(nuevo); renderCaja();
    persistirMovimiento(nuevo, { revertir:()=>{ estado.caja=estado.caja.filter(x=>x.id!==id); renderCaja(); } });
    const el=vistaCaja.querySelector(`tr[data-id="${id}"] [data-c=concepto]`);
    if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
  };
}

function filaCaja(m){
  const tr=document.createElement('tr'); tr.dataset.id=m.id;
  const cls=m.monto>0?'monto-pos':(m.monto<0?'monto-neg':'');
  tr.innerHTML=`
    <td><input class="cinp" type="date" data-c="fecha" value="${m.fecha||''}"></td>
    <td><input class="cinp" data-c="concepto" value="${escA(m.concepto)}" placeholder="Concepto"></td>
    <td><input class="cinp" data-c="categoria" value="${escA(m.categoria)}" placeholder="Categoría"></td>
    <td><input class="cinp" data-c="cuenta" value="${escA(m.cuenta)}" placeholder="Cuenta / quién"></td>
    <td class="num"><input class="cinp num ${cls}" type="number" step="0.01" data-c="monto" value="${m.monto||0}"></td>
    <td><input class="cinp" data-c="notas" value="${escA(m.notas)}" placeholder="Notas"></td>
    <td><button class="caja-del" type="button" title="Borrar movimiento">✕</button></td>`;

  tr.querySelectorAll('[data-c]').forEach(inp=>{
    inp.oninput=()=>{
      const campo=inp.dataset.c;
      let val=inp.value;
      if(campo==='monto'){
        val=parseFloat(inp.value)||0;
        inp.classList.remove('monto-pos','monto-neg');
        inp.classList.add(val>0?'monto-pos':(val<0?'monto-neg':''));
      }
      editCaja(m, campo, val);
      if(campo==='monto') actualizarSaldos();
    };
  });
  tr.querySelector('.caja-del').onclick=async ()=>{
    if(!confirm('Se borra el movimiento. ¿Seguir?')) return;
    const idx=estado.caja.findIndex(x=>x.id===m.id);
    estado.caja=estado.caja.filter(x=>x.id!==m.id); renderCaja();
    await conEstadoDeCarga(()=>RoadmapSync.borrarMovimiento(m.id), {
      onEstado:onEstadoGlobal,
      revertir:()=>{ estado.caja.splice(idx,0,m); renderCaja(); },
    }).then(ok=>{ if(ok) marcarEcoPropio(RoadmapSync.TABLAS.caja, m.id); });
  };
  return tr;
}

function actualizarSaldos(){
  if(!vistaCaja) return;
  const ingresos=estado.caja.filter(m=>m.monto>0).reduce((a,m)=>a+m.monto,0);
  const egresos =estado.caja.filter(m=>m.monto<0).reduce((a,m)=>a+m.monto,0);
  const set=(sel,v)=>{ const el=vistaCaja.querySelector(sel+' .val'); if(el) el.textContent=fmtMoney(v); };
  set('.saldo-card.total', ingresos+egresos);
  set('.saldo-card.ingresos', ingresos);
  set('.saldo-card.egresos', Math.abs(egresos));
}

function pintarTodo(){ render(); renderCaja(); }

/* ---------- pestañas ---------- */
function activarTab(nombre){
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected', t.dataset.tab===nombre));
  if(vistaFlujo) vistaFlujo.hidden = nombre!=='flujo';
  if(vistaCaja)  vistaCaja.hidden  = nombre!=='caja';
  if(filtrosFlujo) filtrosFlujo.hidden = nombre!=='flujo';
}

/* ---------- menús / atajos globales ---------- */
function cerrarMenus(){
  document.querySelectorAll('.menu:not([hidden])').forEach(m=>{
    m.hidden=true; m.closest('.sec')?.classList.remove('menu-open');
    m.parentElement.querySelector('[data-menu]')?.setAttribute('aria-expanded','false');
  });
}

/* ---------- utilidades ---------- */
function aviso(txt){
  toast.textContent=txt; toast.classList.add('on');
  clearTimeout(toast._x); toast._x=setTimeout(()=>toast.classList.remove('on'),2800);
}
function bajar(nombre,contenido,tipo){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([contenido],{type:tipo}));
  a.download=nombre; a.click(); URL.revokeObjectURL(a.href);
}
const hoy=()=>new Date().toISOString().slice(0,10);
const slug=(CFG.proyecto||'plan');

/* ---------- arranque ---------- */
q.oninput=e=>{ filtros.q=e.target.value.trim().toLowerCase(); render(); };
if(oh) oh.onchange=e=>{ filtros.ocultarHechas=e.target.checked; render(); };
bPlegar.onclick=()=>{
  const algoAbierto = abiertas.size>0 || cerradas.size<estado.secciones.length;
  if(algoAbierto){
    abiertas.clear(); estado.secciones.forEach(s=>cerradas.add(s.id));
    bPlegar.textContent='Desplegar todo';
  }else{
    cerradas.clear(); bPlegar.textContent='Plegar todo';
  }
  render();
};
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
};

if(bHtml) bHtml.onclick=()=>{
  bajar(slug+'-respaldo-'+hoy()+'.json', JSON.stringify(estado,null,2), 'application/json;charset=utf-8');
  aviso('Respaldo JSON guardado.');
};
if(bCsv) bCsv.onclick=()=>{
  const sec={}; estado.secciones.forEach(s=>sec[s.id]=s.titulo);
  const e=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const cab=['ID','Bloque','Modulo','Tarea','Explicacion','Responsable','Estado','Enlace','Archivos','Chat','Subtareas','Fecha limite'];
  const filas=estado.tareas.map(t=>[t.id,sec[t.sec]||'',t.modulo,t.tarea,t.expl,t.resp,t.estado,t.img,
    (t.files||[]).map(f=>f.n).join(' | '),
    (t.chat||[]).map(m=>(m.autor||'?')+': '+m.texto).join('  ||  '),
    (t.subtareas||[]).map(s=>(s.estado==='Hecho'?'[x] ':'[ ] ')+s.titulo+(s.resp?' ('+s.resp+')':'')).join('  ||  '),
    t.fecha].map(e).join(';'));
  bajar(slug+'-'+hoy()+'.csv','﻿'+[cab.map(e).join(';'),...filas].join('\r\n'),'text/csv;charset=utf-8');
  aviso('CSV guardado. Se abre en Excel con doble clic.');
};

document.addEventListener('click',()=>cerrarMenus());
document.addEventListener('dragend',()=>{ arrastre=null; limpiarZonas(); });
document.addEventListener('keydown',e=>{
  const t=document.activeElement.tagName;
  if(e.key==='Escape'){ cerrarMenus(); }
  if(e.key==='/' && t!=='INPUT' && t!=='TEXTAREA'){ e.preventDefault(); q.focus(); }
  if(e.key==='Escape' && t!=='INPUT' && t!=='TEXTAREA' && abiertas.size){ abiertas.clear(); render(); }
});
document.querySelectorAll('.tab').forEach(tab=>{ tab.onclick=()=>activarTab(tab.dataset.tab); });

/* ---------- login / sesión ---------- */
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const sinAccesoOverlay = document.getElementById('sinAccesoOverlay');
const bSinAccesoSalir = document.getElementById('bSinAccesoSalir');

function mostrarModalLogin(){ loginOverlay.hidden = false; }
function ocultarModalLogin(){ loginOverlay.hidden = true; }
function mostrarSinAcceso(){ sinAccesoOverlay.hidden = false; }
function ocultarSinAcceso(){ sinAccesoOverlay.hidden = true; }

// Guard de ruta: aunque la RLS ya protege los datos, una cuenta autenticada pero no
// miembro de CFG.proyecto no debe ver ni el esqueleto del tablero (bloques, botones, etc).
// Si la página define CFG.rutaPublica (ej.: index.html -> captalia.html), la cuenta no
// autorizada se manda ahí en silencio, sin mostrar ningún mensaje de "sin acceso".
function verificarAcceso(){
  if((YO.proyectos||[]).includes(CFG.proyecto)){ ocultarSinAcceso(); return true; }
  if(CFG.rutaPublica){ location.replace(CFG.rutaPublica); return false; }
  mostrarSinAcceso();
  return false;
}

async function resolverIdentidad(){
  let email=null;
  try{ email=await RoadmapSync.emailActual(); }catch(e){}
  // Membresía por proyecto: viene de app_miembros en Supabase (RoadmapSync.misProyectos),
  // no de un mapa hardcodeado. `usuarios` acá solo aporta nombre/color para el chat.
  let proyectos=[];
  try{ proyectos = email ? await RoadmapSync.misProyectos() : []; }catch(e){}
  const u = email && USUARIOS[email.toLowerCase()];
  if(u){ YO={ nombre:u.nombre, color:u.color||colorDe(u.nombre), proyectos }; }
  else if(email){ YO={ nombre:email.split('@')[0], color:'none', proyectos }; }
  else { YO={ nombre:'', color:'none', proyectos:[] }; }
}

async function cargarYArrancar(){
  try{
    estado = await RoadmapSync.cargarEstado();
  }catch(e){
    aviso('No se pudo conectar con la base: '+e.message);
    estado = { secciones: [], tareas: [], caja: [] };
  }
  pintarTodo();
}

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

bCerrarSesion.onclick = async () => {
  const marcar = onEstadoBoton(bCerrarSesion, 'Saliendo...');
  marcar('cargando');
  try{ await RoadmapSync.cerrarSesion(); marcar('ok'); }
  catch(e){ marcar('error'); aviso('No se pudo cerrar sesión: '+e.message); }
};

bSinAccesoSalir.onclick = async () => {
  const marcar = onEstadoBoton(bSinAccesoSalir, 'Saliendo...');
  marcar('cargando');
  try{ await RoadmapSync.cerrarSesion(); marcar('ok'); }
  catch(e){ marcar('error'); aviso('No se pudo cerrar sesión: '+e.message); }
};

(async function iniciar(){
  activarTab('flujo');
  let activa = false;
  try{ activa = await RoadmapSync.sesionActiva(); }
  catch(e){ aviso('No se pudo verificar la sesión: '+e.message); }
  if(activa){
    await resolverIdentidad(); construirBarras();
    if(verificarAcceso()) await cargarYArrancar();
  }
  else { construirBarras(); mostrarModalLogin(); }

  RoadmapSync.onCambioSesion(async sesionOk => {
    if(sesionOk){
      ocultarModalLogin(); await resolverIdentidad(); construirBarras();
      if(verificarAcceso()) await cargarYArrancar();
    }
    else { estado = { secciones: [], tareas: [], caja: [] }; YO={nombre:'',color:'none'}; pintarTodo(); ocultarSinAcceso(); mostrarModalLogin(); }
  });

  RoadmapSync.suscribir(refrescarDesdeSupabase);
})();
