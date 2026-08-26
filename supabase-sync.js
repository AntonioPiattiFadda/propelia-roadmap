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
    // Los nombres de los grupos del backlog. Es `roadmap_notas`, la tabla que creó
    // schema-v3.sql para la Visión vieja y que quedó vacía: ninguna pantalla la lee ni la
    // escribe. Se reusa a propósito, y no es una comodidad: una columna o una tabla nueva
    // significaría esperar a que se corra otra migración —hay dos pendientes hace semanas—
    // para poder ponerle nombre a un grupo. Esta ya está corrida, ya tiene su RLS por
    // miembro y ya está publicada en realtime.
    grupos: 'roadmap_notas',
  },
  _CFG.tablas || {}
);
/* Las filas de grupo llevan prefijo en el `id`. La tabla es de texto libre y podría volver a
   usarse para otra cosa: sin el prefijo, cualquier fila que alguien meta ahí se leería como
   un grupo del backlog. */
const PREFIJO_GRUPO = 'grupo-';
const idGrupo = n => PREFIJO_GRUPO + n;
const BUCKET = _CFG.bucket || 'roadmap-adjuntos';
const CANAL = _CFG.canal || 'roadmap-sync';
const PROYECTO = _CFG.proyecto || 'propelia';

const arr = v => (Array.isArray(v) ? v : []);

/* ¿La base rechazó el guardado porque no conoce una columna, o por cualquier otra cosa?
   Solo el primer caso se puede reintentar recortando la fila; confundirlo con un error de
   permisos o de red haría que un fallo real pase por «falta el esquema» y se guarde a
   medias en silencio. PostgREST avisa con `PGRST204` cuando la columna no está en su
   caché de esquema, y Postgres con `42703` (undefined_column). */
const esColumnaDesconocida = e => e && (e.code === 'PGRST204' || e.code === '42703');

// Se prende sola la primera vez que la base rechaza `carga` y dura lo que dure la sesión.
let sinColumnaCarga = false;

const RoadmapSync = {
  calcularOrden,
  TABLAS,
  BUCKET,
  // Lo usa el tablero para reconocer su propio eco por realtime: el id de la fila que acaba
  // de escribir. Sale de acá para que el prefijo esté escrito en un solo lugar.
  idGrupo,

  async cargarEstado() {
    const [tarRes, cajaRes, gruposRes] = await Promise.all([
      supabaseClient.from(TABLAS.tareas).select('*').order('orden'),
      supabaseClient.from(TABLAS.caja).select('*').order('orden'),
      supabaseClient.from(TABLAS.grupos).select('id,titulo,orden').order('orden'),
    ]);
    if (tarRes.error) throw tarRes.error;
    // La caja puede no existir todavía si falta correr schema-v3.sql: seguimos con una
    // lista vacía en vez de dejar el tablero entero sin cargar.
    const caja = cajaRes.error ? [] : (cajaRes.data || []);
    // Y los nombres de los grupos, igual: sin la tabla, cada bloque se llama «Grupo N» y el
    // backlog funciona como siempre. Es un rótulo, no un dato del que dependa nada.
    const grupos = gruposRes.error ? [] : (gruposRes.data || []);

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
        // Backlog (schema-v7.sql). Sin el esquema corrido llegan `undefined`: toda tarea
        // se lee como del tablero y sin sprint, que es exactamente como estaba antes.
        backlog: !!t.backlog,
        sprint: Number(t.sprint) || 0,
        dep: t.dep || '',
        loom: t.loom || '',
      })),
      caja: caja.map(m => ({
        id: m.id, fecha: m.fecha || '', concepto: m.concepto || '', categoria: m.categoria || '',
        monto: Number(m.monto) || 0, quien: m.cuenta || '', notas: m.notas || '', orden: m.orden,
        // Gastos fijos: `repite` marca la plantilla y `origen` apunta de la copia de cada
        // mes a esa plantilla. Sin schema-v4.sql llegan `undefined` y la caja funciona
        // igual, solo que sin repetir nada.
        repite: m.repite || '', origen: m.origen || '',
        // A quién se le carga el gasto (schema-v8.sql). Vacío significa «a todos», que es
        // lo que valía para todos los movimientos antes de que la columna existiera: sin
        // el esquema corrido llega `undefined` y toda la caja se lee como compartida, o
        // sea igual que siempre.
        carga: arr(m.carga),
      })),
      /* Un grupo es el número que las tareas ya tienen en `sprint`; acá solo viaja su
         nombre. Por eso no hay «lista de grupos» que mantener sincronizada con las tareas:
         una fila sin nombre no existe, y un grupo sin fila se llama «Grupo N». */
      grupos: grupos
        .filter(g => String(g.id).startsWith(PREFIJO_GRUPO))
        .map(g => ({ n: Number(String(g.id).slice(PREFIJO_GRUPO.length)) || 0, nombre: g.titulo || '' }))
        .filter(g => g.n > 0),
    };
  },

  // Comprueba qué partes de schema-v3.sql están corridas. El tablero lo usa para avisar
  // en pantalla en vez de fallar en silencio al guardar.
  async faltantesDeEsquema() {
    const faltan = [];
    const [tareas, caja, backlog, carga] = await Promise.all([
      supabaseClient.from(TABLAS.tareas).select('prioridad,tipo,hoy,pend,creada').limit(1),
      supabaseClient.from(TABLAS.caja).select('repite,origen').limit(1),
      supabaseClient.from(TABLAS.tareas).select('backlog,sprint,dep,loom').limit(1),
      supabaseClient.from(TABLAS.caja).select('carga').limit(1),
    ]);
    if (tareas.error) faltan.push('los campos nuevos de las tareas (prioridad, tipo, hoy, responsables)');
    if (caja.error) faltan.push('los gastos fijos de la caja (schema-v4.sql)');
    if (backlog.error) faltan.push('el backlog y los sprints (schema-v7.sql)');
    if (carga.error) faltan.push('a quién se le carga cada gasto de la caja (schema-v8.sql)');
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
      backlog: !!t.backlog,
      // `0` es "sin sprint" para el front, pero en la base eso es un hueco, no un cero.
      sprint: Number(t.sprint) || null,
      dep: t.dep || '',
      // Faltaba: se leía al cargar pero no se escribía nunca, así que el enlace del Loom
      // duraba hasta recargar la página. Y sin Loom guardado, la regla de «no sale al
      // tablero sin video» se volvía a aplicar sola en cada visita.
      loom: t.loom || '',
    });
    if (error) throw error;
  },

  async borrarTarea(id) {
    const { error } = await supabaseClient.from(TABLAS.tareas).delete().eq('id', id);
    if (error) throw error;
  },

  /* Guardar un movimiento tiene una vuelta que las tareas no tienen, y es por `carga`
     (schema-v8.sql, todavía sin correr). Un `upsert` con una columna que no existe no
     guarda «casi todo»: **falla entero**, con lo cual sin el esquema corrido dejaría de
     guardarse hasta el importe. Así que se intenta con la columna y, si la base contesta
     que no la conoce, se reintenta una vez sin ella: se pierde la imputación —que es lo
     que la base no sabe todavía guardar— y no el movimiento.

     La marca es de la sesión y no de cada guardado: una vez que se supo que la columna no
     está, no tiene sentido pagar el viaje de ida y vuelta en cada tecla. Se resuelve sola
     al recargar, que es justo cuando puede haber cambiado el esquema. */
  async guardarMovimiento(m) {
    const fila = {
      id: m.id, fecha: m.fecha || null, concepto: m.concepto || '', categoria: m.categoria || '',
      monto: Number(m.monto) || 0, cuenta: m.quien || '', notas: m.notas || '', orden: m.orden,
      repite: m.repite || '', origen: m.origen || '',
    };
    if (!sinColumnaCarga) {
      const { error } = await supabaseClient.from(TABLAS.caja)
        .upsert({ ...fila, carga: m.carga || [] });
      if (!error) return;
      if (!esColumnaDesconocida(error)) throw error;
      sinColumnaCarga = true;
    }
    const { error } = await supabaseClient.from(TABLAS.caja).upsert(fila);
    if (error) throw error;
  },

  async borrarMovimiento(id) {
    const { error } = await supabaseClient.from(TABLAS.caja).delete().eq('id', id);
    if (error) throw error;
  },

  /* El nombre de un grupo del backlog. `orden` es `not null` sin default en la tabla, así
     que va sí o sí; se usa el número del grupo, que es justo el orden en que se dibujan. */
  async guardarGrupo(n, nombre) {
    const { error } = await supabaseClient.from(TABLAS.grupos).upsert({
      id: idGrupo(n), titulo: nombre, texto: '', orden: n,
    });
    if (error) throw error;
  },

  // Quedarse sin nombre no es tener el nombre vacío: la fila se va y el bloque vuelve a
  // llamarse «Grupo N», que es como estaba antes de que alguien lo bautizara.
  async borrarGrupo(n) {
    const { error } = await supabaseClient.from(TABLAS.grupos).delete().eq('id', idGrupo(n));
    if (error) throw error;
  },

};

// Supabase valida las claves del bucket con un regex ASCII: una «ó» en «Gestión.pdf»
// hace fallar la subida entera con 400. La clave va limpia; el nombre real viaja aparte,
// en `n`, y es el que se muestra en pantalla.
function claveLimpia(nombre){
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
}

RoadmapSync.subirArchivo = async function (refId, blob, nombreArchivo) {
  const path = `${refId}/${Date.now()}-${claveLimpia(nombreArchivo)}`;
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

// Los buckets son privados: la dirección de un archivo es una URL firmada que vence, no
// una fija que se pueda guardar. Se cachean por sesión para no pedir una firma nueva en
// cada repintado, con margen para no entregar una que esté por vencer.
const URL_FIRMADA_TTL = 60 * 60 * 8; // segundos
const _urlsFirmadas = new Map();
RoadmapSync.urlFirmada = async function (archivo) {
  const bucket = (typeof archivo === 'string' ? BUCKET : archivo.b) || BUCKET;
  const path = typeof archivo === 'string' ? archivo : archivo.path;
  const clave = bucket + '/' + path;
  const hit = _urlsFirmadas.get(clave);
  if (hit && hit.vence > Date.now()) return hit.url;
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, URL_FIRMADA_TTL);
  if (error) throw error;
  _urlsFirmadas.set(clave, { url: data.signedUrl, vence: Date.now() + (URL_FIRMADA_TTL - 1800) * 1000 });
  return data.signedUrl;
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
  [TABLAS.tareas, TABLAS.caja, TABLAS.grupos].forEach(tabla => {
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
