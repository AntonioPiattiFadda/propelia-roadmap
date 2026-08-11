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

Tablas: `roadmap_tareas`, `roadmap_caja`.
Bucket de adjuntos: `roadmap-adjuntos`.

- `roadmap_tareas`: además de lo viejo, `prioridad`, `tipo`, `hoy` (bool), `pend` (jsonb,
  varios responsables), `creada`, `chat` (jsonb `[{autor,ts,texto}]`) y `subtareas`
  (jsonb `[{id,titulo,resp,estado,expl,chat,files}]`). `resp` se mantiene sincronizado
  con `pend[0]` por compatibilidad.
- `roadmap_tareas.expl` guarda **dos formatos a la vez**: texto plano (todo lo escrito
  hasta el 11/8/2026) o HTML nuestro, y se distinguen por la marca `<!--h-->` al principio
  — no por adivinar si hay un `<` suelto, que rompería una explicación vieja que hable de
  `<div>`. Una fila vieja se convierte a HTML recién cuando alguien la edita. Todo lo que
  lee `expl` para otra cosa que no sea pintarlo (buscador, CSV) pasa por `explATexto()`.
- `roadmap_caja`: planilla de movimientos. Ojo: la columna se llama `cuenta` en la base
  pero el front la expone como `quien` (persona que puso o gastó).
- `roadmap_vision`: la hoja de Visión. Una fila por renglón (`texto`, `hecho`, `tipo`,
  `orden`) y la jerarquía en `padre`, que apunta a otra fila de la misma tabla — nulo =
  primer nivel. `tipo` es `'titulo' | 'subtitulo' | 'check' | 'texto'`, con `'check'` por
  defecto porque la hoja arrancó siendo solo tareas. El
  front trabaja con `padre: ''` en vez de `null` porque es más cómodo de comparar, y lo
  vuelve a `null` recién al guardar. Borrar una línea es **en cascada**: se van con ella
  todas las que tenía adentro. La clave foránea es `deferrable initially deferred` para que
  pegar una página entera entre en un solo upsert sin importar el orden de las filas.

`roadmap_secciones` ya no se usa. Eran las **temáticas**: se sacaron del tablero el
11/8/2026 porque no aportaban nada. El front no la lee ni la escribe, y tampoco toca
`roadmap_tareas.sec_id`. La tabla y la columna siguen en Supabase hasta que se corra
`schema-v5.sql` — mientras tanto, ojo con el `on delete cascade` de `sec_id`: borrar una
fila de secciones a mano desde el panel se lleva puestas sus tareas.

`roadmap_notas` no se usa nunca. La creó `schema-v3.sql` para la Visión vieja (dos hojas de
texto libre) y quedó **vacía**: para cuando el esquema se corrió, Visión ya era un documento
de Notion. La hoja de hoy usa `roadmap_vision`, no esta. `schema-v6.sql` trae el `drop`
comentado por si se quiere limpiar.

### Vistas

`VISTAS` en `app.js` no son todas iguales: `estado` y `hoy` pintan tarjetas, `caja` es una
planilla y `vision` es una hoja de texto. Las dos últimas ocupan el board entero y no saben
nada de tareas — el helper `sinTareas(v)` es el que decide, en un solo lugar, si esconder los
filtros, si el botón «+ Nueva tarea» tiene que rebotar al tablero y si el contador de la
pestaña significa algo. **La marca la lleva la vista (`caja:true`, `doc:true`), no el
render**: nadie compara contra el id `'vision'` suelto por el archivo.

### La hoja de Visión

Fue un enlace a Notion; desde el 11/8/2026 es una vista de verdad: una página con renglones
de cuatro tipos —título, subtítulo, tarea y texto— donde cualquiera puede tener renglones
adentro. Una tarea con tareas adentro **es** la checklist con subchecklist; no hay una
entidad aparte para eso.

**Es una hoja en blanco de ancho completo, y eso es un requisito, no una casualidad.** No
lleva encabezado, ni barra de progreso, ni contadores por bloque, ni pie de ayuda, ni caja
de bienvenida, ni columna centrada: se pidió explícitamente que fuera «como Notion o Word»
y que no hubiera contenedores. Se construyó con todo eso y hubo que sacarlo. Antes de
agregar cualquier cosa acá arriba, tener presente que le come lugar a lo único que importa,
que es la lista. Lo que reemplaza al botón de «agregar» es `.hoja-fin`: el vacío de abajo
es clickeable y ocupa lo que queda de pantalla, como en Notion.

La única excepción a esa regla es `.hoja-notion`, el enlace al documento original de Notion
(`APP_CONFIG.visionUrl`, en `index.html`): va arriba a la derecha, pegado al bajar, y si la
dirección viene vacía no se dibuja. Lo pidió Lorenzo después de la limpieza — la hoja del
tablero es la que se usa, ese documento queda como consulta.

- **El tipo y la jerarquía son ortogonales.** `tipo` dice cómo se ve el renglón; `padre`, de
  quién cuelga. Una tarea puede colgar de un título y un título de una tarea. Atarlas
  obligaría a inventar una regla por cada mezcla, y ninguna sería la que uno quiere el día
  que la necesita.
- **`tipo` por defecto es `'check'`, no `'texto'`.** La hoja arrancó siendo solo tareas, así
  que una fila sin `tipo` es una tarea. Cambiar ese default reinterpreta lo ya guardado.
- **Solo las tareas cuentan.** El único número que quedó es el de la pestaña, y filtra por
  `esTarea()`: los títulos y los textos no suman pendientes.
- **La jerarquía vive en `padre`, no en una lista anidada.** Mover un renglón es cambiarle
  una cadena y un número, y se guarda esa fila sola — nunca la rama entera.
- **El plegado no se guarda en la base**, va a `localStorage` (`vision-plegados`). Que
  alguien cierre un bloque para leer cómodo no tiene por qué cerrárselo a los demás.
- **Se repinta la hoja entera ante cualquier cambio de estructura** y el foco se devuelve a
  mano con `renderVision({id, pos})`. El tilde y el texto, en cambio, se pintan
  quirúrgicamente (`actualizarProgresoVision`): ahí hay un cursor en juego.

**No usar la clase `.doc` para nada de la hoja.** Ya es el chip de adjuntos del detalle de
tarea. Se usó una vez y dejó la hoja entera dibujada como una pastilla de 34px de alto: la
regla nueva solo pisaba `max-width` y `margin`, y el `display:inline-flex`, el `height` y el
borde se filtraron. Todo lo de la hoja va con prefijo `hoja-`/`v`.

#### Por qué pegar una página de Notion necesita dos pasadas

`parsearHoja()` corre dos veces sobre lo pegado, y las dos hacen falta:

1. Una **pila con la sangría de cada antepasado**, en vez de medir contra una tabla de
   anchos. Es la única cuenta que sale bien cuando un mismo pegado trae tabulaciones en una
   rama y espacios en otra, y de paso hace imposible bajar dos niveles de golpe.
2. `anidarBajoTitulos()`, porque **Notion no sangra lo que va abajo de un título**. Una
   página con dos títulos y sus tareas se copia con todo al mismo margen: tomando solo la
   sangría entraría plana, sin un solo nivel. Un encabezado queda abierto y adopta lo que
   viene después, hasta que aparece otro de rango igual o mayor a su misma sangría. La
   sangría de verdad no se ignora, se suma a lo que aporta el título.

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

Las imágenes pegadas dentro de la Explicación **no están en `t.files`**: viven en el propio
texto, y los datos del archivo quedan colgados del `<img>` (`data-path`, `data-b`). Por eso
`borrarTodosLosArchivos()` suma `imagenesDeExpl(t.expl)` — si no, borrar una tarea dejaría
sus capturas ocupando lugar en el bucket para siempre. Borrar una imagen del texto a mano sí
deja el archivo huérfano: se decidió no llevar la cuenta, como en cualquier editor.

### El detalle de la tarea

La Explicación es un `contenteditable`, no un `<textarea>`: hace falta que una captura
pegada quede **adentro del texto**, en el lugar donde estaba el cursor, y un textarea pinta
un solo tipo de contenido. Tres cosas que dependen de eso:

- **Lo que se pega y no es una imagen entra siempre como texto plano.** Es la razón por la
  que no hay un sanitizador: si nunca entra HTML de otras páginas, no hay nada que limpiar.
  Un archivo que no sea imagen no se puede dibujar en un renglón, así que sigue yendo a los
  adjuntos de abajo.
- **La imagen se ve al instante con el archivo local (`blob:`) y recién después se cambia
  por la del bucket.** Mientras tanto lleva la clase `cargando`, y `leerExpl()` la saca de
  lo que guarda: un `blob:` muere al recargar la página. Entra sola cuando termina de subir.
- El manejador de pegado del campo hace `stopPropagation()`: sin eso, el del modal adjuntaría
  la misma imagen abajo por segunda vez.

Checklist, conversación y archivos son `<details>` que arrancan plegados si están vacíos —el
alto que no gastan es el de la Explicación—, y el estado abierto/cerrado se decide **solo al
abrir la tarea**. Si se decidiera en cada repintado, plegar una ficha a mano duraría hasta el
próximo tilde.

### Supabase / migraciones

`schema.sql` → `schema-v2.sql` → `schema-v3.sql` → `schema-v4.sql` → `schema-v5.sql` →
`schema-v6.sql`, en ese orden, todos idempotentes. `schema-v3.sql` unifica los dos tableros
y agrega los campos del diseño actual; `schema-v4.sql` agrega `repite` y `origen` a la caja
(gastos fijos); `schema-v5.sql` borra las temáticas; `schema-v6.sql` crea `roadmap_vision`.
Las primeras cuatro están corridas en `propelia` (`gvkdyxhxsnpumxlhvhsm`) desde el 8/8/2026;
**v5 y v6 están pendientes**. Después de correr la v5 no se pueden volver a correr las
anteriores: dan por hecho que `roadmap_secciones` y `sec_id` existen.

La diferencia entre las dos pendientes: sin la v5 el tablero funciona igual (es limpieza),
sin la v6 la pestaña Visión se abre pero no puede guardar nada. Las dos las avisa en
pantalla `RoadmapSync.faltantesDeEsquema()`, en el triangulito del encabezado. Lo que queda
pendiente de base y cuentas está en `PENDIENTES-BACKEND.md` (raíz).

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
