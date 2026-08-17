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
- `roadmap_tareas.backlog` (bool), `.sprint` (smallint, nulo = sin sprint), `.dep` (texto) y
  `.loom` (texto, el enlace al video) son el Backlog. El front usa `0` para «sin sprint» porque es más cómodo de comparar y lo
  vuelve a `null` recién al guardar. **No hay tabla de backlog ni tabla de sprints**: mirá la
  sección del Backlog para el porqué. La columna «Área» de esa vista es `modulo`, un campo
  del tablero viejo que estaba muerto y se reusó.

`roadmap_secciones` ya no se usa. Eran las **temáticas**: se sacaron del tablero el
11/8/2026 porque no aportaban nada. El front no la lee ni la escribe, y tampoco toca
`roadmap_tareas.sec_id`. La tabla y la columna siguen en Supabase hasta que se corra
`schema-v5.sql` — mientras tanto, ojo con el `on delete cascade` de `sec_id`: borrar una
fila de secciones a mano desde el panel se lleva puestas sus tareas.

`roadmap_notas` no se usa nunca. La creó `schema-v3.sql` para la Visión vieja (dos hojas de
texto libre) y quedó **vacía**. Ninguna pantalla la lee.

### Vistas

`VISTAS` en `app.js` no son todas iguales, y las diferencias son dos, no una:

- **Quién se come el board entero** (`anchoCompleto`): la caja (clase `cmode`) y el backlog
  (clase `bmode`), que en vez de columnas son una planilla y una rejilla.
- **Quién no sabe nada de tareas** (`sinTareas`): solo la caja. El backlog **sí** son
  tareas, así que tiene filtros, buscador y contador; la caja no.

Confundir las dos fue el error de la versión anterior, cuando había un solo helper para
todo. **La marca la lleva la vista (`caja:true`, `backlog:true`), no el render**: nadie
compara contra un id suelto por el archivo.

### El Backlog

La pestaña que antes fue Visión. Es la planificación: se anota, se clasifica por sprint, se
reparte, y cuando llega el momento se manda al tablero.

**Son tareas de verdad, no otra entidad.** La misma fila de `roadmap_tareas`, los mismos
campos y la misma ficha. Lo único que las separa es la columna `backlog`. Mandar una al
tablero es apagar esa marca — llega con su explicación, su checklist, sus archivos y su
conversación intactos, porque nunca dejó de ser la misma fila. Con dos tablas, cada pasaje
sería copiar filas y mover adjuntos; con una marca es un booleano.

**Lo que ya se mandó no desaparece de acá.** Una tarea con sprint sigue en su bloque,
apagada y con la cinta rayada. Al cerrar un sprint uno quiere ver el sprint entero, no lo
que le queda. Eso es `enBacklog(t)`: pendiente, **o** ya salida pero planificada. La que
nunca tuvo sprint y se manda al tablero sí se va — nunca estuvo planificada.

**El filtro vive en un solo lugar**: la primera línea de `visible(t)`. Todo lo que pinta
tareas pasa por ahí. Lo que hay que excluir a mano es lo que no pasa por `visible()`: el
contador de «Hoy» y la campana de críticas.

- **`sprint` es un número y el `0` es «Sin planificar»**, último bloque y solo visible si
  tiene algo. Existe para que anotar a las apuradas no obligue a clasificar en el momento:
  si clasificar fuera obligatorio, nadie anotaría nada.
- **Los bloques son siempre `1..N`, sin huecos.** `sprintsVisibles()` toma el piso de
  `APP_CONFIG.sprints`, lo sube si alguien apretó «+ Sprint» (queda en `localStorage`) y lo
  sube igual si hay una tarea en un sprint más alto — un sprint con tareas no se esconde.
- **`modulo` es la columna «Área».** Era un campo muerto del tablero viejo, ya estaba en la
  base y ya lo guardaba `guardarTarea()`: revivirlo no costó una migración.
- **`dep` («Depende de») es texto libre a propósito**, no una relación entre tareas. La
  mitad de las dependencias reales no son otra tarea del tablero, y obligarlas a serlo hace
  que nadie las anote.
- **`loom` guarda el enlace, no un booleano.** El cartel de la columna no se prende a mano:
  se prende solo cuando el campo tiene algo, y con el enlace adentro el mismo cartel abre el
  video. Un booleano suelto diría «hay video» sin dejarte llegar a él, que es justo lo que
  se quería evitar. Lleva la palabra «Loom» escrita porque, sin fila de rótulos de columna,
  un cuadradito suelto no dice de qué es. Se carga desde el panel de la fila o desde la
  ficha, y el cartel se actualiza en el acto, sin repintar: hay un cursor en el campo.
- **Sin Loom, la tarea no sale al tablero.** El corte está adentro de `pasarAlRoadmap()` y
  no en cada botón: hay tres caminos hasta ahí —la fila, la ficha y la barra de marcadas— y
  olvidarse en uno solo alcanzaría para que la regla no valga. Los botones lo avisan antes
  de que los toques (clase `falta`), no después. En lote, las que no tienen Loom se quedan
  **y quedan marcadas**, para poder ir a cargárselo sin volver a buscarlas una por una.
  Por eso `pasarAlRoadmap()` devuelve `true`/`false`.
- **Quién hace la actividad son los tres botones del detalle, siempre a la vista**, no un
  menú colgante: escondía justo lo que más se toca, y como `pend` admite varias personas
  había que abrirlo tres veces para asignar a tres. Van con las iniciales y el nombre en el
  tooltip — los tres nombres completos no entran en un renglón sin comerse la columna del
  título. Se pintan a mano (`alternarPersona` recibe el botón) en vez de repintar la lista:
  es un botón que cambia de color, y repintar cien filas para eso se siente lento.
- **A la ficha completa —el mismo modal del tablero, con checklist, conversación y
  archivos— se entra desde la fila por tres lados**: el código de la izquierda (como el
  número de un ticket), el `⤢` de la derecha y el botón del panel. Los tres son
  `[data-ficha]` y llaman a `abrirTarea()`. El panel de la fila es el plan rápido; la ficha
  es todo lo demás.
- **Plegado, paneles abiertos y filas marcadas son del navegador de cada uno**, no del
  tablero. Que alguien pliegue el Sprint 3 para leer cómodo no tiene por qué plegárselo a
  los demás.

**No lleva encabezado ni franja de totales, y es un requisito.** Se construyó con una barra
de panorama arriba (totales por prioridad y por persona, «desplegar todo») y una fila de
rótulos de columna pegada, y hubo que sacarlas el 15/8/2026. Antes de agregar algo acá
arriba, tener presente que le come alto a lo único que importa, que es la lista.

**El diseño es una rejilla `grid` de once columnas, no una `<table>`.** Con tabla, el panel
de planificación de cada fila tendría que ir en un `<tr>` aparte con `colspan`, y la fila
abierta dejaría de ser un solo bloque que se pinta, se arrastra y se marca entero. Las
clases van todas con prefijo `b`; la vista se marca con `bmode` en el board.

- **La Explicación del panel es la misma que la de la ficha**, no una nota aparte: el mismo
  campo, el mismo formato con marca `<!--h-->`, las mismas imágenes pegadas. Por eso
  `pintarExpl` / `leerExpl` / `guardarExpl` / `insertarEnCursor` reciben el elemento — hay
  dos cajas sobre el mismo dato.
- **Los manejadores del backlog se cuelgan del board entero, por delegación**, y `render()`
  los suelta al salir de la vista. Si no, siguen escuchando encima del tablero y de la caja.
  Ojo con usar `addEventListener` ahí: la lista se repinta entera ante cualquier cambio y se
  acumularía un listener por repintado (por eso son `board.onclick`, `board.oninput`…).
- **Un `<select>` dispara `input` y `change`**: se atiende solo el segundo, si no cada
  elección se guarda y repinta dos veces.
- **Marcar varias y moverlas juntas es la razón de ser de esta pantalla**: de a una,
  repartir un sprint entre tres personas son treinta clics. Las acciones en lote corren en
  silencio y repintan una sola vez al final.

**Historial de la pestaña**, para no volver a caminarlo: fue un enlace a Notion, después una
hoja de texto libre con renglones anidados (`roadmap_vision`, borrada el 15/8/2026 sin haber
llegado a correrse), después una lista tipo Notion con los controles escondidos, después una
`<table>` estilo planilla, y ahora esta rejilla. Las dos últimas se descartaron el mismo día:
lo que se pide acá es un cuadro con todo a la vista, editable en la celda, y con lugar para
planificar sin salir de la fila.

### Adjuntos y buckets

Cada archivo se guarda como `{n, t, path, size, b}`, donde `b` es el bucket del que salió.
Los adjuntos heredados del viejo tablero de Captalia traen `b: 'captalia-adjuntos'`; los
nuevos, el bucket principal. `RoadmapSync.urlFirmada(archivo)` y `.borrarArchivo(archivo)`
reciben **el objeto entero**, no el `path`, justamente para poder leer esa clave.

**Los buckets son privados y las direcciones, URLs firmadas que vencen.** `urlFirmada()`
es async, cachea por sesión y se llama **al pintar**, nunca para guardar: una URL firmada
guardada es un enlace muerto en unas horas. Por eso `pintarExpl` vuelve a firmar el `src`
de cada `<img data-path>` en cada pintado — el `src` que quedó escrito dentro de `expl`
(público de la época del bucket público, o firmado ya vencido) no sirve para pintar y no
hay que «migrarlo»: se pisa solo. Ojo: mientras el flip del punto 8 de
`PENDIENTES-BACKEND.md` no se corra, los buckets siguen públicos; el front firmado
funciona igual en los dos estados.

**La clave en el bucket no es el nombre del archivo.** Supabase valida las claves con un
regex ASCII: «Gestión CIMA.pdf» con su «ó» hacía fallar la subida entera con 400. La clave
sale de `claveLimpia()` (sin tildes, sin espacios); el nombre real vive en `n` y es el que
se muestra.

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
`schema-v7.sql`, en ese orden, todos idempotentes. `schema-v3.sql` unifica los dos tableros
y agrega los campos del diseño actual; `schema-v4.sql` agrega `repite` y `origen` a la caja
(gastos fijos); `schema-v5.sql` borra las temáticas; `schema-v7.sql` agrega `backlog`,
`sprint`, `dep` y `loom` a las tareas. Las primeras cuatro están corridas en `propelia`
(`gvkdyxhxsnpumxlhvhsm`) desde el 8/8/2026; **v5 y v7 están pendientes**. Después de correr
la v5 no se pueden volver a correr las anteriores: dan por hecho que `roadmap_secciones` y
`sec_id` existen.

**No hay `schema-v6.sql`, y el hueco es a propósito.** Existió un día: creaba
`roadmap_vision` para la hoja de texto libre. Esa pestaña pasó a ser el Backlog antes de que
el archivo se corriera en ningún lado, así que se borró en vez de dejarlo invitando a crear
una tabla que ya no usa nadie. La v7 trae el `drop` comentado por si alguien alcanzó a
correrlo.

La diferencia entre las dos pendientes: sin la v5 el tablero funciona igual (es limpieza),
sin la v7 la pestaña Backlog se ve pero cada tarea que anotes ahí aparece también en el
tablero — la marca no se guarda. Las dos las avisa en pantalla
`RoadmapSync.faltantesDeEsquema()`, en el triangulito del encabezado. Lo que queda pendiente
de base y cuentas está en `PENDIENTES-BACKEND.md` (raíz).

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
