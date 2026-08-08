# Convenciones del proyecto

## Arquitectura

SPA que se sirve estática. **Una sola página**: `index.html`. Fue tablero doble (Propelia
y Captalia, con un router al frente); se unificó en un único sistema con tres personas:
Lorenzo, Antonio y Luis.

- `index.html` — la app entera. Define `window.APP_CONFIG` (título, `tablas`, `bucket`,
  `canal`, `personas`, textos de `caja`) y luego carga, en orden: `order-math.js`,
  `supabase-sync.js`, `app.js`. Todo el CSS vive en `app.css`.
- `toniylorete.html` / `captalia.html` — stubs que redirigen a `index.html`. Existen solo
  para que no se rompan enlaces y favoritos viejos. No tienen lógica.
- `supabase-sync.js` expone `RoadmapSync`. Sus `const` top-level son globales de script;
  no repetir nombres en `app.js` (usa `_CFG`, no `CFG`).

**Regla de oro: la lógica va en `app.js` y los estilos en `app.css`. Nunca en el HTML.**

### Identidad vs. membresía — no confundir

Dos cosas distintas que se resuelven en lugares distintos:

- **Membresía** (¿esta cuenta puede ver el tablero?) sale de `app_miembros` en Supabase,
  protegida por RLS, vía `RoadmapSync.esMiembro()`. Es lo único que da acceso.
- **Identidad** (¿esta cuenta es Lorenzo, Antonio o Luis?) sale de `APP_CONFIG.personas`,
  cruzando el email de la sesión contra el campo `email` de cada persona. Solo sirve para
  pintar nombre y color, firmar mensajes del chat y resaltar «Lo mío».

Agregar a alguien en `personas` **no le da acceso a nada**. El acceso se otorga con un
insert en `app_miembros`. Y al revés: una cuenta con membresía pero sin `email` cargado en
`personas` entra y ve todo, pero el tablero no sabe quién es (avisa en pantalla).

### Modelo de datos

Tablas: `roadmap_secciones`, `roadmap_tareas`, `roadmap_caja`.
Bucket de adjuntos: `roadmap-adjuntos`.

- `roadmap_secciones` son las **temáticas** del tablero (`titulo`, `color`, `orden`).
- `roadmap_tareas`: además de lo viejo, `prioridad`, `tipo`, `hoy` (bool), `pend` (jsonb,
  varios responsables), `creada`, `chat` (jsonb `[{autor,ts,texto}]`) y `subtareas`
  (jsonb `[{id,titulo,resp,estado,expl,chat,files}]`). `sec_id` es **opcional** — nulo =
  «Sin temática». `resp` se mantiene sincronizado con `pend[0]` por compatibilidad.
- `roadmap_caja`: planilla de movimientos. Ojo: la columna se llama `cuenta` en la base
  pero el front la expone como `quien` (persona que puso o gastó).

`roadmap_notas` ya no se usa. Era la vista Visión (dos hojas de texto libre); Visión pasó
a ser un documento de Notion y la pestaña es solo un acceso directo. **La tabla y su
contenido siguen en Supabase**, intactos, por si hace falta recuperar lo que se escribió;
el front no la lee ni la escribe.

### Vistas y accesos directos

`VISTAS` en `app.js` mezcla dos cosas distintas: las vistas de verdad, que pintan el
`#board`, y los **accesos directos**, marcados con `enlace:true` y una `url`. Un acceso
directo se dibuja como `<a target="_blank">` en vez de `<button>`, nunca queda resaltado
como activo y no se puede restaurar desde `localStorage`. Si su `url` viene vacía, la
pestaña no se dibuja — así nadie se topa con un botón que no lleva a ningún lado. La
dirección de Visión sale de `APP_CONFIG.visionUrl` (`index.html`), no está escrita en `app.js`.

**Los valores guardados no son los que se leen en pantalla.** En `app.js` cada catálogo
tiene `id` (lo que va a la base) y `label` (lo que se ve). Los estados siguen siendo
`'Pendiente' | 'En curso' | 'Bloqueado' | 'Hecho'` aunque en pantalla digan Nueva / En
curso / Bloqueada / Terminada — así las tareas viejas no necesitan migración. Lo mismo con
las personas: el `id` es `'Loro'`, `'Toni'`, `'Luis'`, que es lo que ya está escrito en las
tareas. **Cambiar esos `id` deja huérfanas las asignaciones y los mensajes existentes.**

### Adjuntos y buckets

Cada archivo se guarda como `{n, t, path, size, b}`, donde `b` es el bucket del que salió.
Los adjuntos heredados del viejo tablero de Captalia traen `b: 'captalia-adjuntos'`; los
nuevos, el bucket principal. `RoadmapSync.urlPublica(archivo)` y `.borrarArchivo(archivo)`
reciben **el objeto entero**, no el `path`, justamente para poder leer esa clave.

### Supabase / migraciones

`schema.sql` → `schema-v2.sql` → `schema-v3.sql`, en ese orden, todos idempotentes.
`schema-v3.sql` es el que unifica los dos tableros y agrega los campos del diseño actual.
Los pendientes de base y cuentas están en `PENDIENTES-BACKEND.md` (raíz).

### Preview local

`.claude/static-server.mjs` sirve la carpeta (respeta `PORT`). La app siempre pega contra
el Supabase real; sin sesión válida la base no devuelve datos.

## Loading states & optimistic updates

Patrón para toda acción que persiste contra Supabase (`RoadmapSync.*`). El helper genérico
es `conEstadoDeCarga(accion, {revertir, intentos, onEstado})`: centraliza reintento (2 por
defecto) + revert + aviso, desacoplado del DOM — cada call site decide cómo se ve mediante
su propio `onEstado(estado)`.

- **Optimistic update por defecto**: el cambio se aplica en memoria y se pinta al toque; la
  persistencia corre en paralelo sin bloquear la UI.
- **Falla tras agotar los reintentos → revertir, no dejar colgado**: el valor vuelve al
  anterior (no se deja «sin guardar» en pantalla) y se muestra el aviso.
- **Indicador global único** (`● guardando` / `✓ guardado`) en la franja de filtros, con
  contador `enVuelo++/--`. Nada de un indicador por campo — sería ruido repartido por toda
  la pantalla.
- **Acciones discretas** (borrar tarea, borrar movimiento, login, logout): además del
  indicador global, feedback local en el propio botón vía `onEstadoBoton(el, texto)`,
  combinado con `combinar(...fns)`.
- **Campos con autoguardado debounced y drag&drop**: solo alimentan el indicador global.
- **Carga inicial**: esqueleto con shimmer escrito en el HTML dentro de `#board`, sin JS
  para mostrarlo u ocultarlo — el primer `render()` lo pisa solo.
- **No pisar lo que alguien está escribiendo**: `estaEditando()` bloquea el refresco de
  realtime mientras hay un campo con foco dentro del tablero o el detalle de una tarea
  abierto. El refresco pendiente se aplica al salir del campo o al cerrar el modal.
- **Ecos propios**: `marcarEcoPropio(tabla, id)` evita que el cambio que acabás de guardar
  vuelva por realtime y te repinte la pantalla encima.
