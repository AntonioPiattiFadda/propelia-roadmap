# Persistencia compartida vía Supabase — Design

## Contexto

`index.html` es un plan de trabajo tipo CRM ("Loro & Toni") de una sola página estática, deployado en Netlify (`roadmappropelia.netlify.app`), sin build tools ni framework. Hoy los datos viven en `localStorage` de cada navegador, más un mecanismo manual de exportar/importar el HTML completo para que Loro y Toni sincronicen sus cambios pasándose el archivo por WhatsApp/mail.

Esto significa: cada uno tiene su propia copia, no hay sync automático, y perder el `localStorage` (cambio de navegador/dispositivo, borrado de caché) pierde los cambios no exportados.

## Objetivo

Reemplazar el `localStorage` + export/import manual por una base de datos compartida en Supabase, con sincronización en **tiempo real**: si Toni cambia algo con la página de Loro abierta, Loro lo ve al instante sin recargar.

## Decisiones ya tomadas

- **Backend:** Supabase (Postgres + Realtime + Storage), cargado vía CDN (`@supabase/supabase-js@2`) — no rompe el "un solo HTML sin build".
- **Proyecto Supabase:** el mismo proyecto real de `propelia-frontend` (`propelia`, project ID `gvkdyxhxsnpumxlhvhsm`), justificado porque es literalmente el CRM del que hablan las tareas del roadmap.
- **Prefijo de tablas:** `roadmap_` para aislar lógicamente estas tablas de las del CRM (`leads`, `properties`, `clients`, etc.).
- **Auth:** ninguna. En su lugar, un código compartido (passcode) pedido en el navegador antes de habilitar edición.
- **Adjuntos:** Supabase Storage (bucket `roadmap-adjuntos`), no más base64 embebido.
- **Ejecución del SQL:** el usuario lo corre él mismo en el SQL Editor del dashboard de Supabase — Claude no recibe credenciales de la base.

## Arquitectura

```
index.html (Netlify, estático)
   │
   ├─ carga supabase-js por CDN
   ├─ al iniciar: SELECT * de roadmap_secciones y roadmap_tareas → pinta la UI
   ├─ cada cambio (tipear, mover, cambiar estado) → UPDATE/INSERT/DELETE (debounced en inputs de texto)
   └─ se suscribe a postgres_changes de ambas tablas → re-pinta cuando cambia algo del otro lado

Supabase (proyecto propelia)
   ├─ Postgres: roadmap_secciones, roadmap_tareas (RLS abierto, ver Seguridad)
   ├─ Realtime: publicación supabase_realtime incluye ambas tablas
   └─ Storage: bucket roadmap-adjuntos (público, políticas abiertas)
```

## Modelo de datos

```sql
create table public.roadmap_secciones (
  id text primary key,
  titulo text not null default '',
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create table public.roadmap_tareas (
  id text primary key,
  sec_id text not null references public.roadmap_secciones(id) on delete cascade,
  modulo text not null default '',
  tarea text not null default '',
  expl text not null default '',
  resp text not null default '',              -- '' | 'Loro' | 'Toni'
  estado text not null default 'Pendiente',    -- Pendiente | En curso | Bloqueado | Hecho
  img text not null default '',                -- enlace externo (Drive, etc.), no adjunto
  com text not null default '',
  fecha date,
  files jsonb not null default '[]'::jsonb,    -- [{n: nombre, t: mime, path: storage path, size}]
  orden double precision not null,
  updated_at timestamptz not null default now()
);

create index roadmap_tareas_sec_id_idx on public.roadmap_tareas (sec_id);
```

`orden` es `float8` (no un índice entero) para que arrastrar una tarea entre otras dos sea un solo `UPDATE` con el punto medio de los vecinos, sin reescribir toda la lista.

Un trigger `roadmap_set_updated_at()` actualiza `updated_at` en cada `UPDATE` de ambas tablas (usado para detectar conflictos groseros, ver Manejo de errores).

## Adjuntos → Storage

- Bucket `roadmap-adjuntos`, público (kebab-case, igual que `property-media`/`property-documents` en `propelia-frontend`).
- Se mantiene la compresión de imágenes en el navegador antes de subir (ya existe en el código: `comprimirImagen`, `MAX_LADO=1800`, `CALIDAD=.82`).
- El archivo sube a `roadmap-adjuntos/{tarea_id}/{nombre}`; la fila de `roadmap_tareas.files` guarda `{n, t, path, size}`, no el binario.
- Al borrar un archivo desde la UI, se borra también del bucket (`storage.remove`).

## Sincronización en tiempo real

- `supabase.channel('roadmap-sync').on('postgres_changes', {event: '*', schema: 'public', table: 'roadmap_tareas'}, cb)` (y lo mismo para `roadmap_secciones`).
- Los inputs de texto (`tarea`, `expl`, `com`, `modulo`) debouncean el `UPDATE` a Supabase (~500ms) para no disparar un request por tecla — el estado local (`estado.tareas`) se sigue actualizando al instante para que la UI no sienta lag.
- Al reconectar el WebSocket (ej. laptop que vuelve de suspendido), se hace un refetch completo por las dudas de haberse perdido algún evento mientras estuvo desconectado.

## Seguridad — caveat explícito

RLS habilitado en ambas tablas con policy `using (true) with check (true)`: cualquiera con la `anon key` (visible en el HTML, "ver código fuente") puede leer y escribir. El passcode pedido en el navegador es un **candado de UX, no de seguridad real** — no hay verificación server-side de ese código. Es el mismo nivel de exposición que ya existe hoy (cualquiera con el HTML que se pasan por WhatsApp podía editarlo todo).

Esto es aceptable para una herramienta interna de dos personas. Si en el futuro esto se abre a más gente o datos sensibles, ahí sí corresponde Supabase Auth de verdad.

## Migración de datos existentes

Las 4 secciones y 48 tareas que hoy están embebidas en el `<script id="datos">` de `index.html` se insertan una sola vez en las tablas nuevas vía un script `seed.sql` generado a partir de ese JSON (mismos IDs `s1`–`s4` y `T01`–`T48`, mismo orden). Se corre una sola vez, junto con el DDL, en el SQL Editor de Supabase.

## Qué se elimina del feature set actual

- **"Cargar cambios de un archivo"** (import manual desde HTML) — ya no hace falta, la base es la única fuente de verdad.
- **"Descartar mis cambios"** (reset a localStorage) — mismo motivo, ya no hay estado local que descartar.

## Qué se mantiene

- **"Guardar archivo" (exportar HTML)** y **"Exportar a CSV"** — se mantienen como respaldo puntual, ahora exportando lo que está cargado desde Supabase en memoria.
- Toda la UX actual (filtros, búsqueda, plegado, drag&drop, adjuntar archivos, atajos de teclado) se mantiene igual — solo cambia de dónde lee/escribe los datos.

## Manejo de errores / edge cases

- **Falla de red al guardar:** toast de error y reintento; el cambio queda en memoria local hasta que el `UPDATE` confirme.
- **Reconexión del realtime:** refetch completo al reconectar (ver arriba).
- **Ediciones concurrentes al mismo campo de texto:** last-write-wins vía `updated_at` — aceptable para 2 usuarios con debounce de 500ms; no se implementa merge ni CRDT (fuera de alcance).
- **Límite de tamaño de archivo:** se mantiene `MAX_ARCHIVO = 6MB` para no-imágenes; las imágenes siempre se comprimen antes de subir.

## Testing / verificación manual

No hay framework de test en este proyecto (HTML estático sin build). Verificación manual antes de dar por terminado:

1. Crear/editar/borrar una tarea en una pestaña y verificar que aparece en tiempo real en otra pestaña (simulando a Loro y Toni).
2. Subir un archivo y verificar que es visible desde la otra pestaña.
3. Recargar la página y confirmar que los datos vienen de Supabase, no de `localStorage` (borrar `localStorage` antes de recargar como prueba).
4. Verificar que sin el passcode correcto no se pueden editar campos (gate de UX).
5. Arrastrar una tarea entre secciones/posiciones y confirmar que el orden persiste tras recargar.

## Fuera de alcance

- Autenticación real (Supabase Auth) — explícitamente descartada por ahora.
- Resolución de conflictos más allá de last-write-wins.
- Multi-tenant / `org_id` — el roadmap no se cuelga del modelo multi-organización del CRM.
