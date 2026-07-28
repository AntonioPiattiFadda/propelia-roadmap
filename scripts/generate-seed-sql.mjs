// scripts/generate-seed-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="datos"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error('No se encontró el bloque <script id="datos"> en index.html');
const { secciones, tareas } = JSON.parse(match[1]);

const sqlStr = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const lineas = [];
lineas.push('-- Generado por scripts/generate-seed-sql.mjs — no editar a mano');
lineas.push('begin;');

secciones.forEach((s, i) => {
  lineas.push(
    `insert into public.roadmap_secciones (id, titulo, orden) values ` +
    `(${sqlStr(s.id)}, ${sqlStr(s.titulo)}, ${i + 1});`
  );
});

tareas.forEach((t, i) => {
  lineas.push(
    `insert into public.roadmap_tareas ` +
    `(id, sec_id, modulo, tarea, expl, resp, estado, img, com, fecha, files, orden) values (` +
    `${sqlStr(t.id)}, ${sqlStr(t.sec)}, ${sqlStr(t.modulo)}, ${sqlStr(t.tarea)}, ` +
    `${sqlStr(t.expl)}, ${sqlStr(t.resp)}, ${sqlStr(t.estado)}, ${sqlStr(t.img)}, ` +
    `${sqlStr(t.com)}, ${t.fecha ? sqlStr(t.fecha) : 'null'}, '[]'::jsonb, ${i + 1});`
  );
});

lineas.push('commit;');
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), lineas.join('\n') + '\n');
console.log(`Escritas ${secciones.length} secciones y ${tareas.length} tareas en supabase/seed.sql`);
