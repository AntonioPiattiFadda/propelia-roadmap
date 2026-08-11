// supabase-sync.js
// Capa de sincronización con Supabase. Un solo tablero, un solo conjunto de tablas.
// Requiere order-math.js cargado antes (para `calcularOrden`).

const SUPABASE_URL = 'https://gvkdyxhxsnpumxlhvhsm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2a2R5eGh4c25wdW14bGh2aHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDUwMzAsImV4cCI6MjA5NjY4MTAzMH0.rBFXKVaMyyWfTwz8uAfL2LNFyEiGrpWpWlcTa60xeak';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Nombre propio (_CFG) para no chocar con el `CFG` que declara app.js en el ámbito global.
const _CFG = window.APP_CONFIG || {};
const TABLAS = Object.assign(
  {
    tareas: 'roadmap_tareas',
    caja: 'roadmap_caja',
    vision: 'roadmap_vision',
  },
  _CFG.tablas || {}
);
const BUCKET = _CFG.bucket || 'roadmap-adjuntos';
const CANAL = _CFG.canal || 'roadmap-sync';
const PROYECTO = _CFG.proyecto || 'propelia';

const arr = v => (Array.isArray(v) ? v : []);

const RoadmapSync = {
  calcularOrden,
  TABLAS,
  BUCKET,

  async cargarEstado() {
    const [tarRes, cajaRes, visRes] = await Promise.all([
      supabaseClient.from(TABLAS.tareas).select('*').order('orden'),
      supabaseClient.from(TABLAS.caja).select('*').order('orden'),
      supabaseClient.from(TABLAS.vision).select('*').order('orden'),
    ]);
    if (tarRes.error) throw tarRes.error;
    // La caja puede no existir todavía si falta correr schema-v3.sql: seguimos con una
    // lista vacía en vez de dejar el tablero entero sin cargar. Lo mismo con la hoja de
    // Visión, que llega recién con schema-v6.sql.
    const caja = cajaRes.error ? [] : (cajaRes.data || []);
    const vision = visRes.error ? [] : (visRes.data || []);

    return {
      tareas: (tarRes.data || []).map(t => ({
        id: t.id, modulo: t.modulo || '', tarea: t.tarea || '',
        expl: t.expl || '', estado: t.estado, img: t.img || '', com: t.com || '',
        fecha: t.fecha || '', orden: t.orden,
        files: arr(t.files),
        chat: arr(t.chat),
        subtareas: arr(t.subtareas),
        // Campos del tablero nuevo. Si falta correr schema-v3.sql llegan `undefined`,
        // así que cada uno cae en su valor por defecto y la app igual funciona en pantalla.
        prioridad: t.prioridad || 'semanal',
        tipo: t.tipo || 'nuevo',
        hoy: !!t.hoy,
        // `resp` era el responsable único de antes; si `pend` todavía no existe, se usa
        // como semilla para no perder las asignaciones ya hechas.
        pend: arr(t.pend).length ? arr(t.pend) : (t.resp ? [t.resp] : []),
        creada: t.creada || null,
      })),
      caja: caja.map(m => ({
        id: m.id, fecha: m.fecha || '', concepto: m.concepto || '', categoria: m.categoria || '',
        monto: Number(m.monto) || 0, quien: m.cuenta || '', notas: m.notas || '', orden: m.orden,
        // Gastos fijos: `repite` marca la plantilla y `origen` apunta de la copia de cada
        // mes a esa plantilla. Sin schema-v4.sql llegan `undefined` y la caja funciona
        // igual, solo que sin repetir nada.
        repite: m.repite || '', origen: m.origen || '',
      })),
      // Hoja de Visión: una fila por línea. `padre` vacío = línea de primer nivel; el
      // front trabaja siempre con cadena vacía y recién al guardar lo vuelve a `null`,
      // así no hay que preguntar por `null` en cada comparación.
      // `tipo` decide cómo se dibuja el renglón (título, subtítulo, tarea o texto). Las
      // filas guardadas antes de que existiera vienen sin él: se leen como tarea, que es
      // lo único que había, y así no hace falta migrar nada.
      vision: vision.map(i => ({
        id: i.id, padre: i.padre || '', texto: i.texto || '',
        hecho: !!i.hecho, tipo: i.tipo || 'check', orden: Number(i.orden) || 0,
      })),
    };
  },

  // Comprueba qué partes de schema-v3.sql están corridas. El tablero lo usa para avisar
  // en pantalla en vez de fallar en silencio al guardar.
  async faltantesDeEsquema() {
    const faltan = [];
    const [tareas, caja, vision] = await Promise.all([
      supabaseClient.from(TABLAS.tareas).select('prioridad,tipo,hoy,pend,creada').limit(1),
      supabaseClient.from(TABLAS.caja).select('repite,origen').limit(1),
      supabaseClient.from(TABLAS.vision).select('id,padre,texto,hecho,tipo').limit(1),
    ]);
    if (tareas.error) faltan.push('los campos nuevos de las tareas (prioridad, tipo, hoy, responsables)');
    if (caja.error) faltan.push('los gastos fijos de la caja (schema-v4.sql)');
    if (vision.error) faltan.push('la hoja de Visión (schema-v6.sql)');
    return faltan;
  },

  async guardarTarea(t) {
    const { error } = await supabaseClient.from(TABLAS.tareas).upsert({
      id: t.id,
      modulo: t.modulo || '',
      tarea: t.tarea || '',
      expl: t.expl || '',
      // `resp` queda sincronizado con el primero de la lista: mantiene compatibles el
      // export a CSV y cualquier consulta vieja que todavía mire esa columna.
      resp: (t.pend && t.pend[0]) || '',
      estado: t.estado,
      img: t.img || '',
      com: t.com || '',
      fecha: t.fecha || null,
      files: t.files || [],
      chat: t.chat || [],
      subtareas: t.subtareas || [],
      orden: t.orden,
      prioridad: t.prioridad || 'semanal',
      tipo: t.tipo || 'nuevo',
      hoy: !!t.hoy,
      pend: t.pend || [],
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
      monto: Number(m.monto) || 0, cuenta: m.quien || '', notas: m.notas || '', orden: m.orden,
      repite: m.repite || '', origen: m.origen || '',
    });
    if (error) throw error;
  },

  async borrarMovimiento(id) {
    const { error } = await supabaseClient.from(TABLAS.caja).delete().eq('id', id);
    if (error) throw error;
  },

  async guardarItemVision(i) {
    const { error } = await supabaseClient.from(TABLAS.vision).upsert(filaVision(i));
    if (error) throw error;
  },

  // Pegar una página entera son decenas de líneas: van en un solo viaje. La clave es que
  // los padres estén antes que sus hijos en la lista — la de arriba antes que la de
  // adentro, que es el orden natural de una hoja leída de arriba abajo.
  async guardarItemsVision(items) {
    if (!items.length) return;
    const { error } = await supabaseClient.from(TABLAS.vision).upsert(items.map(filaVision));
    if (error) throw error;
  },

  // El borrado es en cascada en la base: se borra la línea y se van con ella todas las
  // que tenía adentro, sin que el front tenga que ir una por una.
  async borrarItemVision(id) {
    const { error } = await supabaseClient.from(TABLAS.vision).delete().eq('id', id);
    if (error) throw error;
  },
};

// El front usa cadena vacía para «sin padre» porque es más cómodo de comparar; la base
// quiere `null`, que es lo que la clave foránea sabe leer.
function filaVision(i) {
  return {
    id: i.id,
    padre: i.padre || null,
    texto: i.texto || '',
    hecho: !!i.hecho,
    tipo: i.tipo || 'check',
    orden: i.orden,
  };
}

RoadmapSync.subirArchivo = async function (refId, blob, nombreArchivo) {
  const path = `${refId}/${Date.now()}-${nombreArchivo}`;
  const { error } = await supabaseClient.storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
  return { n: nombreArchivo, t: blob.type || '', path, size: blob.size, b: BUCKET };
};

// `b` es el bucket del que salió el archivo. Los adjuntos que vienen del tablero viejo de
// Captalia lo traen apuntando a su bucket original; los que no lo traen son del principal.
RoadmapSync.borrarArchivo = async function (archivo) {
  const bucket = (typeof archivo === 'string' ? BUCKET : archivo.b) || BUCKET;
  const path = typeof archivo === 'string' ? archivo : archivo.path;
  const { error } = await supabaseClient.storage.from(bucket).remove([path]);
  if (error) throw error;
};

RoadmapSync.urlPublica = function (archivo) {
  const bucket = (typeof archivo === 'string' ? BUCKET : archivo.b) || BUCKET;
  const path = typeof archivo === 'string' ? archivo : archivo.path;
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

RoadmapSync.sesionActiva = async function () {
  const { data } = await supabaseClient.auth.getSession();
  return !!data.session;
};

RoadmapSync.emailActual = async function () {
  const { data } = await supabaseClient.auth.getUser();
  return data.user?.email || null;
};

// ¿La cuenta logueada es miembro del tablero? Sale de `app_miembros` en Supabase
// (protegida por RLS), no de un mapa escrito en el HTML.
RoadmapSync.esMiembro = async function () {
  const { data, error } = await supabaseClient.from('app_miembros').select('proyecto');
  if (error) throw error;
  return (data || []).some(r => r.proyecto === PROYECTO);
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
  const canal = supabaseClient.channel(CANAL);
  [TABLAS.tareas, TABLAS.caja, TABLAS.vision].forEach(tabla => {
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, onCambio);
  });
  canal.subscribe(estadoCanal => {
    // 'SUBSCRIBED' se dispara en la conexión inicial y en cada reconexión —
    // refetch completo por las dudas de haberse perdido algún evento.
    if (estadoCanal === 'SUBSCRIBED') onCambio();
  });
  return () => supabaseClient.removeChannel(canal);
};

window.RoadmapSync = RoadmapSync;
