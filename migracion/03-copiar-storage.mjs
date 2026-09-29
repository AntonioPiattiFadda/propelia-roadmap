// Migración del tablero — PASO 3: copiar los adjuntos del bucket viejo al nuevo.
//
// Por qué un script y no el MCP: el MCP de Supabase habla SQL, y los archivos no viven en
// la base sino en el Storage. `storage.objects` guarda solo la metadata; los bytes hay que
// bajarlos y subirlos por la API. Sin dependencias (fetch nativo, Node 18+): nada de
// `npm install`.
//
// Uso (desde Windows, PowerShell):
//   $env:ORIGEN_URL="https://gvkdyxhxsnpumxlhvhsm.supabase.co"
//   $env:ORIGEN_KEY="<service_role o sb_secret_ del proyecto viejo>"
//   $env:DESTINO_URL="https://<ref-nuevo>.supabase.co"
//   $env:DESTINO_KEY="<service_role o sb_secret_ del proyecto nuevo>"
//   node migracion/03-copiar-storage.mjs
//
// Idempotente: sube con x-upsert, así que se puede volver a correr si se corta.
// Las claves `path` NO cambian, y es lo que hace que los `{n,t,path,size,b}` guardados en
// las tareas sigan apuntando bien sin tocar un solo dato.

const BUCKET = 'roadmap-adjuntos';
const { ORIGEN_URL, ORIGEN_KEY, DESTINO_URL, DESTINO_KEY } = process.env;
if (!ORIGEN_URL || !ORIGEN_KEY || !DESTINO_URL || !DESTINO_KEY) {
  console.error('Faltan variables: ORIGEN_URL, ORIGEN_KEY, DESTINO_URL, DESTINO_KEY');
  process.exit(1);
}

// Las claves nuevas (sb_secret_…) no son JWT: van solo en `apikey`.
const cabeceras = key => ({
  apikey: key,
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
});

const rutaUrl = path => path.split('/').map(encodeURIComponent).join('/');

async function listar(prefijo = '') {
  const res = await fetch(`${ORIGEN_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...cabeceras(ORIGEN_KEY), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`listar "${prefijo}": ${res.status} ${await res.text()}`);
  const items = await res.json();
  const archivos = [];
  for (const it of items) {
    const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
    // Sin id es una carpeta: el Storage no las tiene de verdad, son prefijos.
    if (it.id === null) archivos.push(...await listar(ruta));
    else archivos.push({ ruta, tipo: it.metadata?.mimetype || 'application/octet-stream' });
  }
  return archivos;
}

const archivos = await listar();
console.log(`${archivos.length} archivos en ${BUCKET}`);

let ok = 0;
const fallas = [];
for (const { ruta, tipo } of archivos) {
  try {
    const baja = await fetch(`${ORIGEN_URL}/storage/v1/object/${BUCKET}/${rutaUrl(ruta)}`, {
      headers: cabeceras(ORIGEN_KEY),
    });
    if (!baja.ok) throw new Error(`bajar: ${baja.status}`);
    const bytes = await baja.arrayBuffer();
    const sube = await fetch(`${DESTINO_URL}/storage/v1/object/${BUCKET}/${rutaUrl(ruta)}`, {
      method: 'POST',
      headers: { ...cabeceras(DESTINO_KEY), 'Content-Type': tipo, 'x-upsert': 'true' },
      body: bytes,
    });
    if (!sube.ok) throw new Error(`subir: ${sube.status} ${await sube.text()}`);
    ok++;
    console.log(`✓ ${ruta}`);
  } catch (e) {
    fallas.push(ruta);
    console.error(`✗ ${ruta} — ${e.message}`);
  }
}

console.log(`\n${ok}/${archivos.length} copiados.`);
if (fallas.length) {
  console.log('Fallaron (volvé a correr el script, es idempotente):\n' + fallas.join('\n'));
  process.exit(1);
}
