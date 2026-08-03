// supabase-sync.js
// Capa de sincronización compartida por Propelia (index.html) y Captalia (captalia.html).
// Los nombres de tablas / bucket / canal se leen de window.APP_CONFIG, así el mismo
// código sirve para los dos proyectos sin duplicarse.
// Requiere order-math.js cargado antes (para `calcularOrden`).

const SUPABASE_URL = 'https://gvkdyxhxsnpumxlhvhsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2a2R5eGh4c25wdW14bGh2aHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDUwMzAsImV4cCI6MjA5NjY4MTAzMH0.rBFXKVaMyyWfTwz8uAfL2LNFyEiGrpWpWlcTa60xeak';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Config por proyecto (con valores por defecto = Propelia, por si falta APP_CONFIG).
// Nombre propio (_CFG) para no chocar con el `CFG` que declara app.js en el ámbito global.
const _CFG = window.APP_CONFIG || {};
const TABLAS = Object.assign(
  { secciones: 'roadmap_secciones', tareas: 'roadmap_tareas', caja: 'roadmap_caja' },
  _CFG.tablas || {}
);
const BUCKET = _CFG.bucket || 'roadmap-adjuntos';
const CANAL = _CFG.canal || 'roadmap-sync';

const RoadmapSync = {
  calcularOrden,
  TABLAS,

  async cargarEstado() {
    const [{ data: secciones, error: e1 }, { data: tareas, error: e2 }, cajaRes] = await Promise.all([
      supabaseClient.from(TABLAS.secciones).select('*').order('orden'),
      supabaseClient.from(TABLAS.tareas).select('*').order('orden'),
      supabaseClient.from(TABLAS.caja).select('*').order('orden'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    // La caja puede no existir todavía en la base; si falla, seguimos con [] sin romper.
    const caja = cajaRes.error ? [] : (cajaRes.data || []);
    return {
      secciones: secciones.map(s => ({ id: s.id, titulo: s.titulo, orden: s.orden })),
      tareas: tareas.map(t => ({
        id: t.id, sec: t.sec_id, modulo: t.modulo, tarea: t.tarea, expl: t.expl,
        resp: t.resp, estado: t.estado, img: t.img, com: t.com,
        fecha: t.fecha || '', files: t.files || [], orden: t.orden,
        chat: Array.isArray(t.chat) ? t.chat : [],
        subtareas: Array.isArray(t.subtareas) ? t.subtareas : [],
      })),
      caja: caja.map(m => ({
        id: m.id, fecha: m.fecha || '', concepto: m.concepto || '', categoria: m.categoria || '',
        monto: Number(m.monto) || 0, cuenta: m.cuenta || '', notas: m.notas || '', orden: m.orden,
      })),
    };
  },

  async guardarSeccion(s) {
    const { error } = await supabaseClient.from(TABLAS.secciones)
      .upsert({ id: s.id, titulo: s.titulo, orden: s.orden });
    if (error) throw error;
  },

  async borrarSeccion(id) {
    const { error } = await supabaseClient.from(TABLAS.secciones).delete().eq('id', id);
    if (error) throw error;
  },

  async guardarTarea(t) {
    const { error } = await supabaseClient.from(TABLAS.tareas).upsert({
      id: t.id, sec_id: t.sec, modulo: t.modulo, tarea: t.tarea, expl: t.expl,
      resp: t.resp, estado: t.estado, img: t.img, com: t.com,
      fecha: t.fecha || null, files: t.files || [], orden: t.orden,
      chat: t.chat || [], subtareas: t.subtareas || [],
    });
    if (error) throw error;
  },

  async borrarTarea(id) {
    const { error } = await supabaseClient.from(TABLAS.tareas).delete().eq('id', id);
    if (error) throw error;
  },

  async guardarMovimiento(m) {
    const { error } = await supabaseClient.from(TABLAS.caja).upsert({
      id: m.id, fecha: m.fecha || null, concepto: m.concepto || '', categoria: m.categoria || '',
      monto: Number(m.monto) || 0, cuenta: m.cuenta || '', notas: m.notas || '', orden: m.orden,
    });
    if (error) throw error;
  },

  async borrarMovimiento(id) {
    const { error } = await supabaseClient.from(TABLAS.caja).delete().eq('id', id);
    if (error) throw error;
  },
};

RoadmapSync.subirArchivo = async function (refId, blob, nombreArchivo) {
  const path = `${refId}/${Date.now()}-${nombreArchivo}`;
  const { error } = await supabaseClient.storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
  return { n: nombreArchivo, t: blob.type || '', path, size: blob.size };
};

RoadmapSync.borrarArchivo = async function (path) {
  const { error } = await supabaseClient.storage.from(BUCKET).remove([path]);
  if (error) throw error;
};

RoadmapSync.urlPublica = function (path) {
  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

RoadmapSync.sesionActiva = async function () {
  const { data } = await supabaseClient.auth.getSession();
  return !!data.session;
};

// Devuelve el email del usuario logueado (o null). Sirve para saber si soy Loro/Toni/Diego.
RoadmapSync.emailActual = async function () {
  const { data } = await supabaseClient.auth.getUser();
  return data.user?.email || null;
};

// Proyectos de los que el usuario logueado es miembro, según `app_miembros` (RLS: cada
// cuenta solo puede leer sus propias filas). Fuente de verdad para el selector de proyecto
// y el guard de ruta — vive en la base, no en un mapa hardcodeado en el HTML.
RoadmapSync.misProyectos = async function () {
  const { data, error } = await supabaseClient.from('app_miembros').select('proyecto');
  if (error) throw error;
  return (data || []).map(r => r.proyecto);
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

RoadmapSync.suscribir = function (onCambio) {
  const canal = supabaseClient
    .channel(CANAL)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLAS.secciones }, onCambio)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLAS.tareas }, onCambio)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLAS.caja }, onCambio)
    .subscribe(estadoCanal => {
      // 'SUBSCRIBED' se dispara en la conexión inicial y en cada reconexión —
      // refetch completo por las dudas de haberse perdido algún evento.
      if (estadoCanal === 'SUBSCRIBED') onCambio();
    });
  return () => supabaseClient.removeChannel(canal);
};

window.RoadmapSync = RoadmapSync;
