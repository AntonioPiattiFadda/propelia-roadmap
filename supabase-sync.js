// supabase-sync.js
// Requiere que scripts/generate-seed-sql.mjs + supabase/schema.sql + seed.sql
// ya se hayan corrido contra el proyecto (ver Task 1 y 2), y que order-math.js
// se cargue antes que este script (ver Task 6 Step 1) para que `calcularOrden` exista.

const SUPABASE_URL = 'https://gvkdyxhxsnpumxlhvhsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2a2R5eGh4c25wdW14bGh2aHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDUwMzAsImV4cCI6MjA5NjY4MTAzMH0.rBFXKVaMyyWfTwz8uAfL2LNFyEiGrpWpWlcTa60xeak';

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

window.RoadmapSync = RoadmapSync;
