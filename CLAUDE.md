# Convenciones del proyecto

## Arquitectura

SPA que se sirve estática. **Una sola página**: `index.html`. Fue tablero doble (Propelia
y Captalia, con un router al frente); se unificó en un único sistema con tres personas:
Lorenzo, Antonio y Luis.

- `index.html` — la app entera. Define `window.APP_CONFIG` (título, `tablas`, `bucket`,
  `canal`, `personas`) y luego carga, en orden: `order-math.js`,
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

Tablas: `roadmap_tareas`, `roadmap_caja` y `roadmap_notas` (solo los nombres de los grupos
del backlog, ver abajo).
Bucket de adjuntos: `roadmap-adjuntos`.

- `roadmap_tareas`: además de lo viejo, `prioridad`, `tipo`, `hoy` (bool; era la marca de la
  vista «Hoy» y desde el 26/8/2026 significa **«esta actividad todavía es nueva en el
  tablero»** — ver la chapa de novedad), `pend` (jsonb,
  varios responsables), `creada`, `chat` (jsonb `[{autor,ts,texto}]`) y `subtareas`
  (jsonb `[{id,titulo,resp,estado,expl,chat,files}]`). `resp` se mantiene sincronizado
  con `pend[0]` por compatibilidad.
- **`estado` son cinco y no cuatro desde el 26/8/2026**: entre Bloqueada y Terminada entró
  `Revision` («En revisión»), lo que ya no se está haciendo pero tampoco está cerrado. **No
  hizo falta migración**: la columna es un `text` sin `check`, así que un valor nuevo entra
  solo, y las filas viejas simplemente no lo tienen porque nunca pasaron por ahí. El `id` va
  sin tilde —es lo que queda escrito en la base— y el `label` sí la lleva, la misma regla que
  ya tenían `Pendiente`/«Nueva» y `Hecho`/«Terminada».
- **`pend` nunca queda vacío: ninguna tarea existe sin responsable.** Son dos cortes, uno por
  cada punta. Al nacer: acá no hay formulario con submit —la fila se crea y se persiste
  vacía— así que el corte va **antes** de que exista, en `pedirResponsable()`, que abre el
  selector y recién con la elección hecha llama a `nuevaTarea()` / `nuevaEnBacklog()`. Cerrar
  el menú sin elegir no crea nada: dejar la fila nacida esperando responsable la guardaría
  sin nadie ante cualquier recarga, que es justo lo que se quiere evitar. Al editar:
  `alternarPend()` es el único camino de los tres botones (tablero, ficha y fila del backlog)
  y rechaza sacar al último. La regla vive en un lugar y no en cada botón — con cuatro
  puertas hasta la creación, olvidarse en una alcanza para que no valga. La excepción es el Enter del backlog, que **hereda** el responsable de la
  fila de arriba en vez de preguntar: escribir una lista de corrido es el 90% de esa pantalla
  y un menú por cada Enter la mataría. Solo pregunta si la de arriba tampoco tiene.
  Las filas anteriores a esta regla siguen sin responsable: no se migraron.
- `roadmap_tareas.creada` se pinta como **antigüedad**, no como fecha, y sale toda de
  `antiguedad(iso)`: elige la unidad sola (`3 d`, `2 sem`, `4 mes`) y deja la fecha exacta en
  el `title`. Se ve en la tarjeta del tablero, en la ficha y en el panel de la fila del
  backlog — en la rejilla del backlog no, que ya tiene trece columnas peleando por el ancho.
  El texto lo reescribe un `setInterval` de un minuto sobre cada `[data-edad]`, **no un
  repintado**: repintar el tablero entero cada minuto cortaría lo que alguien esté
  escribiendo. Por eso el número vive en su propio `<i class="edad">` y no suelto al lado
  del ícono.
- `roadmap_tareas.expl` guarda **tres formatos a la vez**: texto plano (todo lo escrito
  hasta el 11/8/2026), HTML nuestro con la marca `<!--h-->`, y desde el 26/8/2026 un árbol
  de bloques en JSON con la marca `<!--b-->` (la página de la tarea). Se distinguen **por la
  marca del principio y nunca adivinando**: una explicación vieja que hable de `<div>` o que
  empiece con una llave no tiene por qué volverse markup ni JSON de golpe. Una fila vieja se
  convierte recién cuando alguien la edita. Todo lo que lee `expl` para otra cosa que no sea
  pintarlo (buscador, CSV) pasa por `explATexto()`, que entiende los tres. Ojo: `explATexto()`
  devuelve **la explicación y nada más**. Los avisos viven en el mismo árbol pero se saltean
  ahí a propósito —ver el cuadro de avisos— y se leen con `avisosDeExpl()`.
- `roadmap_caja`: los movimientos. Ojo: la columna se llama `cuenta` en la base
  pero el front la expone como `quien` (persona que puso o gastó).
- `roadmap_tareas.backlog` (bool), `.sprint` (smallint, nulo = sin sprint), `.dep` (texto) y
  `.loom` (texto, el enlace al video — ya sin pantalla que lo edite, ver el Backlog) son el
  Backlog. El front usa `0` para «sin sprint» porque es más cómodo de comparar y lo
  vuelve a `null` recién al guardar. **No hay tabla de backlog ni tabla de sprints**: mirá la
  sección del Backlog para el porqué. La columna «Área» de esa vista es `modulo`, un campo
  del tablero viejo que estaba muerto y se reusó.

`roadmap_secciones` ya no se usa. Eran las **temáticas**: se sacaron del tablero el
11/8/2026 porque no aportaban nada. El front no la lee ni la escribe, y tampoco toca
`roadmap_tareas.sec_id`. La tabla y la columna siguen en Supabase hasta que se corra
`schema-v5.sql` — mientras tanto, ojo con el `on delete cascade` de `sec_id`: borrar una
fila de secciones a mano desde el panel se lleva puestas sus tareas.

`roadmap_notas` **guarda los nombres de los grupos del backlog** desde el 26/8/2026, y nada
más. La creó `schema-v3.sql` para la Visión vieja (dos hojas de texto libre) y quedó vacía;
se reusó a propósito y no por comodidad: una columna nueva habría dejado los nombres
esperando a que se corra otra migración —hay dos pendientes hace semanas— y esta tabla ya
está corrida, ya tiene su RLS por miembro y ya está publicada en realtime. Una fila por
grupo: `id = 'grupo-3'`, `titulo` = el nombre, `orden` = el número. El prefijo del `id` no
es decorativo: la tabla es de texto libre y podría volver a usarse para otra cosa, y sin él
cualquier fila que alguien meta ahí se leería como un grupo del backlog.

### Vistas

`VISTAS` en `app.js` no son todas iguales, y las diferencias son dos, no una:

- **Quién se come el board entero** (`anchoCompleto`): la caja (clase `cmode`) y el backlog
  (clase `bmode`), que en vez de columnas son dos listas de renglones.
- **Quién no sabe nada de tareas** (`sinTareas`): solo la caja. El backlog **sí** son
  tareas, así que tiene filtros, buscador y contador; la caja no.

Confundir las dos fue el error de la versión anterior, cuando había un solo helper para
todo. **La marca la lleva la vista (`caja:true`, `backlog:true`), no el render**: nadie
compara contra un id suelto por el archivo.

**Las vistas ya no son pestañas: viven en la barra lateral** (26/8/2026), y por eso cada
entrada de `VISTAS` trae un `ico` además del `label`. Con la barra plegada el ícono *es* la
vista; el rótulo aparece recién al abrirse. La caja se entra desde ahí como cualquier otra.

**La vista «Hoy» se eliminó** el 26/8/2026, y con ella todo el sistema de marcar tareas para
el día: el sol de la tarjeta, el botón de la ficha, el contador de la pestaña y la columna en
el CSV. Era una clasificación paralela a la prioridad que había que mantener a mano, tarjeta
por tarjeta, y que nadie mantenía. La columna `roadmap_tareas.hoy` quedó vacía y ese mismo día
se reusó para otra cosa —la chapa de novedad, ver su cuadro—, igual que `modulo` se había
reusado para el «Área» del backlog: un campo muerto que ya está en la base y que ya se guarda
solo evita una migración, y hay dos pendientes. Ojo con `localStorage`: una sesión vieja puede tener `vista:'hoy'`
guardada, y de eso se ocupa el `VISTAS.some(...)` que ya filtraba la preferencia al leerla.

### Los tres layouts del tablero

`LAYOUTS` (`cols`, `rows`, `lista`) es el segmentado de la barra de filtros y **no es lo mismo
que `VISTAS`**: la vista dice *qué* se mira, el layout dice *cómo se dibuja*. Por eso vive en
`UI.layout` y no en `VISTAS`, y por eso solo manda donde hay tarjetas que acomodar — la caja y
el backlog ya se comen el board enteros (`anchoCompleto`).

**`lista` (26/8/2026) es la hoja de renglones del Backlog puesta sobre el tablero**, agrupada
por estado en vez de por sprint. No es una vista nueva: sigue siendo el tablero, con sus
filtros, su buscador y su contador; lo único que cambia es el componente que lo pinta.

- **Se cruza en un solo lugar**: `const enLista = !anchoCompleto(v) && UI.layout === 'lista'`,
  arriba de `render()`. Nadie más en el archivo pregunta por `UI.layout`.
- **`bmode` es el envoltorio de la lista de renglones, no «la vista Backlog».** Lo lleva
  cualquiera que dibuje esa hoja, venga de donde venga.
- **Agrupa por estado y no por prioridad** porque el eje del tablero ES el estado: las columnas
  son estados y las filas también. Si la tercera agrupara por otra cosa, un mismo botón daría
  tres ordenamientos distintos. De paso, arrastrar un renglón a otro bloque significa lo mismo
  que arrastrar una tarjeta a otra columna.
- **Terminadas se pliega con `UI.terminadasAbiertas`**, la misma preferencia que la columna
  plegada. Los otros cuatro estados sí llevan marca propia (`tablero-plegados` en `localStorage`,
  el gemelo de `backlog-plegados`). Con dos preferencias para lo mismo, plegar Terminadas en
  columnas y encontrarla abierta en la lista sería la contradicción de siempre.
- **Los cinco bloques se dibujan aunque estén vacíos**, al revés que «Sin planificar» del
  backlog: un estado sin tareas es información («nada bloqueado») y además es dónde soltar la
  primera. Y no lleva el `＋ Sprint` del final: los estados son un catálogo cerrado.
- **Los bloques van repartidos en tres columnas** (`COLUMNAS_LISTA`, clase `bkcols`): Nueva,
  En curso, y los tres finales del camino —Bloqueada, En revisión y Terminada— apilados en la
  tercera. El reparto no es parejo a propósito: los dos primeros son los que se miran todo el
  día. Se escribe **por id y no por posición** dentro de `ESTADOS`, y lo que no esté nombrado
  cae en la última columna — desaparecer de la pantalla es peor que caer en la columna
  equivocada. Las columnas son del pintado y de nadie más: cada bloque conserva su `data-g` y
  su `data-filas`, así que arrastrar, plegar y crear no se enteran de que hay tres cajas.
  El backlog **no** se parte en columnas: los sprints son una secuencia y partirlos rompería
  justo lo que dicen.
- **Todo el tratamiento de columnas vive adentro de un `@media(min-width:1121px)`**, no de un
  `max-width` que lo deshaga. Abajo de eso, tres columnas de menos de 340px entran con el
  título recortado a la mitad, así que la lista vuelve a ser una sola. La única regla del lado
  angosto es devolverle el margen al primer bloque de cada columna: `.bksprint:first-child` lo
  pega al de arriba, y apiladas cada columna tiene un primer bloque.
- **Cambiar de layout cierra el menú `⋯`.** La fila que lo tenía abierto puede no existir en el
  dibujo siguiente, y un menú colgado de la nada no se cierra con nada.

**Las dos listas son un solo componente y un solo juego de manejadores** (`LISTAS`,
`listaActual`, `engancharLista()`, `engancharArrastreLista()`). Lo único que cambia entre el
backlog y el tablero-lista está en el descriptor: por qué se agrupa (`grupoDe`, `hermanas`,
`fijar`), qué significa plegar y crear adentro de un bloque, y el rótulo del menú `⋯`. Son
~110 líneas de delegación con ocho casos: con dos copias, el arreglo que se hace en una no
llega nunca a la otra. Por eso el menú `⋯` dice `data-acc="grupo"` y no `"sprint"` — qué
bloque es lo decide la lista pintada.

**La fila se dibuja en columnas de ancho fijo** (26/8/2026, por pedido): título, prioridad y
quién la hace. Antes eran todas pastillas apiladas contra el borde derecho, así que dónde caía
cada una dependía de cuántas tuviera la fila —la prioridad de un renglón quedaba a la altura
del área del de arriba— y con cuarenta filas eso se lee fila por fila y no bajando por una
columna.

- **Solo esos tres.** El código, la dependencia, el área y la antigüedad se dibujan nada más
  cuando hay algo que decir, y una columna reservada para un campo que la mitad de las filas no
  tiene es puro hueco. Van juntas en `.pgpills`, pegadas al título.
- **El título es el único elástico** (`flex:0 1 auto`) y lo que clava las columnas a la derecha
  es el `margin-left:auto` de la primera, escrito como `.pgpills + .pgcol` y no como
  `:first-of-type`: cuál es la primera cambia, porque en el backlog no hay prioridad.
- **El ancho es fijo y no `1fr`.** Son cuatro prioridades posibles y tres nombres: reservar lo
  que miden cuesta menos que hacer que el renglón se recalcule según lo que tenga adentro.
- **Los nombres van adentro de un `.qn`** y no sueltos en la pastilla: con ancho fijo hace falta
  un único elemento al que recortar, si no tres responsables desbordan en vez de terminar en
  puntos suspensivos. Los nombres completos quedan en el `title`.
- **Envuelto el renglón (≤760px) las columnas dejan de ser columnas**: sobre un segundo renglón
  propio, el ancho reservado solo deja huecos.

**Ya no hay selección múltiple** (26/8/2026, por pedido). Se fueron el casillero de la canaleta
(`.pgsel`), el conjunto `marcadas`, la barra oscura de acciones en lote (`.bbulk`) y
`accionEnLote()` / `aplicarEnLote()`. No se usaba, y esos 14px de canaleta eran los que le
faltaban al título. Sin dónde marcar una fila, dejar la barra habría sido dejar código que no
puede correr; las mismas acciones siguen estando de a una, en el menú `⋯`, en la pill de cada
campo y en la ficha. El `silencio` que todavía aceptan `campoTarea()`, `cambiarSprint()`,
`cambiarEstado()`, `pasarAlRoadmap()` y `mandarAlBacklog()` era de ahí y se conservó.
**Contrapartida asumida**: vaciar un grupo entero al tablero vuelve a ser una tarea por vez.

Cuidado con `filaTareaHTML()`: es compartida y tiene dos cortes que no son iguales.

- **La chapa de novedad es del tablero y de nadie más**, y ahí la marca la da la vista
  (`vistaActual().backlog`): el backlog se lee entero y varias veces, y una chapa roja por
  renglón ahí no avisa nada.
- **La pill de prioridad no se dibuja en el backlog**, y ahí la marca la da la **fila**
  (`t.backlog`), no la vista: así vale igual adentro de la página de una tarea del backlog,
  que usa las mismas pills.

### La barra lateral

Todo lo que no es una tarea (26/8/2026): a dónde ir, quién sos, exportar y cerrar sesión.
Antes eran dos renglones de encabezado; ahora arriba queda una sola línea con los filtros y
las dos acciones que sí son del tablero —la campana de críticas y «+ Nueva tarea»—.

- **Se abre sola al pasar el cursor y no tiene botón de fijar.** Es un menú al que se entra
  cuatro veces por día, no un panel de trabajo: un botón para abrirla y otro para cerrarla
  serían dos clics de más para algo que se mira dos segundos.
- **Lo que se abre es `.side-in`, apoyado ENCIMA del tablero y no dentro del flujo.** Si el
  ancho fuera parte del layout, rozar la barra con el mouse reacomodaría el tablero entero, y
  en modo columnas eso son cuatro columnas saltando de lugar.
- **Va en `z-index:40`, por debajo de los modales.** Se abre sola: una barra que se despliegue
  encima de una ficha abierta es un manotazo cada vez que el cursor pasa cerca del borde.
- **El aviso de esquema (`.nota-pop`) es `position:fixed`.** La barra recorta lo que se sale
  de su ancho y ese cartel mide bastante más que la barra.
- **En pantalla chica la abre `:focus-within`**, no el hover: sin cursor, tocar cualquiera de
  sus renglones tiene que alcanzar.
- La franja de arriba (`.bar`) quedó con `#filtros` y `.bar-acciones` como hermanos: la caja
  esconde los filtros enteros, y la campana y «Nueva tarea» tienen que seguir estando.

### La Caja

Quién puso cada peso. **Desde el 26/8/2026 es una lista de renglones y no una `<table>`**,
por un diseño de Claude Design, igual que el Backlog y por las mismas razones: reusa las
clases `pg` del encabezado y de las pills, y lo propio lleva el prefijo `cj`. Antes fue una
planilla de ocho columnas con `<input>` en cada celda.

- **Las celdas se escriben sobre el texto pintado** (`contenteditable`), no en un
  `<input type=date>` ni en uno `type=number`: es lo que hace que la fila se lea como un
  renglón y no como un formulario. El costo es tener que interpretar lo tipeado, y por eso
  hay **una sola puerta por dato**: `parsearDia()` y `parsearMonto()`. Ojo con el punto en
  `parsearMonto()`: en «1.234» separa miles y en «12.5» es la coma decimal de quien viene de
  un teclado numérico. Se decide por la forma del número —si hay coma, el punto es de miles;
  si lo que queda calza exacto con grupos de tres, también; si no, es decimal— y no por una
  preferencia, porque adivinar mal ahí multiplica un gasto por mil.
- **El texto se guarda mientras se escribe; la fecha y el monto, al salir de la celda.** Los
  dos hay que interpretarlos, y hacerlo tecla por tecla reescribiría a medias lo que alguien
  todavía está tipeando.
- **Quién pagó y a quién se le carga son dos columnas, no una.** `quien` es de qué bolsillo
  salió la plata; `carga` (jsonb, lista de ids) es a quién se le imputa para el saldo. Hasta
  el 26/8/2026 era una sola pregunta y se daba por hecho que todo gasto era de todos: la
  herramienta que paga uno pero usa el otro no tenía cómo anotarse y el saldo salía mal por
  la mitad del importe.
  - **`carga` vacío significa «a todos»**, y eso es lo que hace que no haga falta migrar
    nada: es exactamente lo que valía para cada fila antes de que la columna existiera, y
    sigue valiendo mientras `schema-v8.sql` no esté corrido. Todo lo que lee el campo pasa
    por `cargaDe(m)`, que resuelve el vacío y filtra a quien ya no está en la caja. Los
    movimientos nuevos **sí** escriben la lista completa: eligieron a todos, no se quedaron
    sin elegir.
  - **Sacar al último no vale**, igual que con `pend`: un gasto que no se le carga a nadie
    deja de deberse sin que nadie lo haya pagado. El corte está en `abrirMenu()`, que es la
    única puerta que toca el campo.
- **Cada persona trae su saldo pegado a su número.** Antes había una tarjeta oscura de «A
  favor de» al lado de una por cabeza, y para contestar si te debían había que cruzar las
  dos. `saldoCaja()` devuelve por cabeza `puesto` (lo que puso, **neto** —lo que salió menos
  lo que entró—), `toca` (lo que le corresponde bancar) y el `saldo`, que es la resta.
  `gastos` y `entradas` son las dos mitades sin repartir y solo alimentan el renglón que
  resume la lista. Dos cosas de la fórmula:
  - **`toca` divide por `cargaDe(m).length` y no por la cantidad de gente**, que es toda la
    diferencia entre repartir un gasto y cargárselo entero a uno. Con todo compartido da
    exactamente lo mismo que el viejo `total / n`.
  - **Solo se reparte lo que salió de un bolsillo de la caja.** Un movimiento sin dueño o a
    nombre de alguien que ya no participa queda fuera de las dos columnas — `total` nunca lo
    contó, así que el reparto viejo tampoco lo cargaba. Sin ese corte, tocar la fórmula
    habría movido saldos de filas que nadie tocó. Es también lo que garantiza que los saldos
    sumen cero.
- **Los gastos fijos tienen su bloque, plegable, arriba de todo.** No son otra entidad: son
  los mismos movimientos con `repite`, así que siguen apareciendo abajo. El plegado es de la
  sesión, no del tablero.
- **La condición de fijo se maneja SOLO en ese bloque.** Marcar, desmarcar y crear un gasto
  fijo son cosas de ahí: en la lista de movimientos no hay con qué prender ni apagar la
  repetición (`quitarDeFijos()` es la única puerta que toca `repite`, y cuelga del ✕ de ese
  renglón). Abajo, un movimiento es un movimiento y se edita como tal —importe, concepto,
  fecha, quién— pero no su condición. El mismo interruptor repartido entre las dos pantallas
  era invitar a que alguien volviera fijo un gasto de una vez sin darse cuenta, en el
  renglón donde estaba corrigiendo un importe. **Contrapartida asumida**: un movimiento ya
  cargado no se puede ascender a fijo; se crea con «+ Nuevo gasto fijo».
- **Pero en la lista se señala, con dos marcas y las dos siempre prendidas**: el ↻ de la
  canaleta (`.cjmarca`), que se lee bajando por la columna sin leer ningún renglón, y la
  pill `↻ fijo` al lado del concepto (`.cjtag`), para el que mira una fila sola. Ninguna de
  las dos se toca: son un dato de la fila, no un control. La llevan por igual la plantilla y
  las copias que genera; lo que las distingue es el `title`.
- **El renglón del bloque de fijos SÍ se edita** (concepto, quién, monto): es el mismo
  movimiento, y lo que se toca ahí es lo que se va a copiar el mes que viene. Como esa fila
  se dibuja dos veces —arriba y abajo—, lo escrito se espeja en la otra copia en pantalla
  con `espejarCelda()` en vez de repintar: repintar mientras alguien escribe le tira el
  cursor a la primera letra. Por lo mismo, `actualizarTotalesCaja()` refresca también los dos
  `.cjsecsub`, que salen de esos montos.
- **Las filas van de la más nueva a la más vieja**, al revés que la planilla. Una caja se
  abre para ver lo último, no para releer marzo. Las que no tienen fecha caen al final —son
  de antes— y no arriba, donde taparían justo lo que se vino a mirar.
- **`categoria` y `notas` no estaban en el diseño y se conservaron igual**: sacarlas hubiera
  dejado dos columnas de la base sin ninguna pantalla que las lea. La categoría es la pill
  que el diseño ya dibujaba, pero se toca; la nota es texto tenue al final del renglón, que
  aparece al pasar por encima cuando está vacía. La pill de categoría **se dibuja aunque no
  haya categoría**, apagada: misma regla que el «Sin asignar» del backlog, la pill vacía es
  justo la que hay que poder tocar. En pantallas chicas las dos se esconden.
- **`quien`, `carga` y `categoria` se eligen con el mismo menú del backlog** (`abrirMenu()`),
  donde `t` es un movimiento y no una tarea. Hacer una copia del menú para tres listas más
  sería mantener tres veces el mismo posicionamiento. Los disparadores llevan `data-pop` y no
  una clase propia: es la marca que mira el clic global para no cerrar el menú en el mismo
  clic que lo abre. Ojo con una diferencia: `quien` y `categoria` van por `alElegir` —un
  valor y el menú se cierra—, y `carga` **no**, porque admite varios y se resuelve adentro
  del menú como los responsables de una tarea. Pasarle `alElegir` a `carga` la haría
  cortocircuitar antes de llegar a su rama.
- **«Cargar a» es UNA pill con todos los nombres adentro**, misma regla que «quién la hace»
  del backlog: con una pill por cabeza no habría dónde tocar para sumar a la segunda.
  Compartido dibuja igual su punto, apagado — en pantalla chica el rótulo se esconde (no
  entra) y el punto es lo único que queda: color es de alguien, hueco es de todos. Sin ese
  punto, el botón mediría cero y no habría dónde tocar desde el teléfono. **No se esconde
  entera como la nota y la categoría**: es plata, y un gasto imputado a uno leído como
  compartido es un saldo mal.
- **Los manejadores se cuelgan del board entero, por delegación**, como en el backlog: la
  lista se repinta ante cualquier cambio y con `addEventListener` se acumularía uno por
  repintado. La caja usa además `onfocusout`, que el backlog no: por eso `render()` lo
  suelta con el resto y `engancharBacklog()` lo apaga a mano al entrar.
- **Se sigue moviendo como una planilla**: `↑` `↓` saltan de fila por la misma columna y
  `Enter` en la última agrega una nueva. El `Enter` se ataja **siempre**, porque en un
  `contenteditable` lo que hace de fábrica es meter un salto de línea adentro del dato.

### El Backlog

La pestaña que antes fue Visión. Es la planificación: se anota, se clasifica por sprint, se
reparte, y cuando llega el momento se manda al tablero.

**Son tareas de verdad, no otra entidad.** La misma fila de `roadmap_tareas`, los mismos
campos y la misma ficha. Lo único que las separa es la columna `backlog`. Mandar una al
tablero es apagar esa marca — llega con su explicación, su checklist, sus archivos y su
conversación intactos, porque nunca dejó de ser la misma fila. Con dos tablas, cada pasaje
sería copiar filas y mover adjuntos; con una marca es un booleano.

**Lo que se manda al tablero se va de acá** (26/8/2026, por pedido). Hasta ese día la tarea con
sprint se quedaba en su bloque, apagada y con la cinta rayada, para poder ver el sprint entero
al cerrarlo. En la práctica el backlog es lo que falta hacer, y una lista que se llena de
renglones apagados esconde justo lo que queda pendiente. Ahora `enBacklog(t)` es `!!t.backlog`
y nada más: de un lado o del otro, nunca en los dos. Lo que salió de cada grupo se sigue
sabiendo —la tarea conserva su número en `sprint`— y devolverla la deja otra vez en su bloque.
Con eso se fueron también la clase `salida`, la pill «En el tablero» de la fila y el contador
«N en el tablero» de la cabecera del grupo.

**El filtro vive en un solo lugar**: la primera línea de `visible(t)`. Todo lo que pinta
tareas pasa por ahí. Lo que hay que excluir a mano es lo que no pasa por `visible()`: la
campana de críticas.

- **`sprint` es un número y el `0` es «Sin planificar»**, último bloque y solo visible si
  tiene algo. Existe para que anotar a las apuradas no obligue a clasificar en el momento:
  si clasificar fuera obligatorio, nadie anotaría nada.
- **Los bloques se llaman como uno quiera** (26/8/2026, por pedido). Eran «Sprint 1»,
  «Sprint 2»: un número que se leía como una cadencia de dos semanas que este equipo no usa.
  Ahora son grupos con nombre —«Onboarding», «Lo de la AFIP»—, y en pantalla la palabra
  «sprint» desapareció; adentro del código sigue siendo `sprint`, porque es la columna.
  - **El número SIGUE siendo el grupo; el nombre es un rótulo colgado de ese número.** La
    tarea guarda `sprint: 3` como siempre, así que renombrar no toca ni una fila de
    `roadmap_tareas` y ninguna tarea puede quedar apuntando a un grupo que no existe. Lo que
    se guarda aparte es una línea de texto por número, en `roadmap_notas` (ver más arriba).
  - **Sin nombre, el bloque se llama «Grupo N».** No queda en blanco: el menú «Mover a otro
    grupo» es justo donde más falta hace poder distinguir uno de otro.
  - **El nombre se edita en un `<input>` que reemplaza al botón entero**, no adentro de él.
    Un `contenteditable` metido en un `<button>` es HTML inválido y, peor, cada clic para
    corregir una letra le llegaría igual al botón: renombrar plegaría y desplegaría el grupo
    de paso. Se guarda al salir del campo, no tecla por tecla. El lápiz que entra a editar
    vive en las pills de la derecha y aparece con el hover del renglón, como el resto de lo
    que se toca; en pantalla chica queda prendido, que es la regla de siempre acá.
  - **El campo se engancha a mano y no por delegación**, al revés que todo el resto de esta
    pantalla: hay uno solo, nace de cero en cada repintado y así no hay que prender el
    `onfocusout` del board, que la lista apaga a propósito porque es de la caja.
- **Los bloques son siempre `1..N`, sin huecos.** `sprintsVisibles()` toma el piso de
  `APP_CONFIG.sprints`, lo sube si alguien apretó «+ Nuevo grupo» (queda en `localStorage`),
  lo sube si hay una tarea en un grupo más alto —un grupo con tareas no se esconde— y lo sube
  también si alguien bautizó uno: un grupo con nombre es un grupo que alguien creó a
  propósito, y ese nombre está en la base, así que lo ven todos. Un grupo nuevo nace con el
  cursor adentro del nombre y sin fila en la base: si al final no se le escribe nada, queda
  como quedaba antes de todo esto, un casillero de este navegador en `UI.sprints`.
- **`modulo` es la columna «Área».** Era un campo muerto del tablero viejo, ya estaba en la
  base y ya lo guardaba `guardarTarea()`: revivirlo no costó una migración.
- **`dep` («Depende de») es texto libre a propósito**, no una relación entre tareas. La
  mitad de las dependencias reales no son otra tarea del tablero, y obligarlas a serlo hace
  que nadie las anote.
- **El Loom ya no es un campo ni una condición** (26/8/2026). Fue un input propio en la barra
  de clasificación, una pill en la fila, una entrada del menú `⋯` y el corte que frenaba el
  pase al tablero. Se sacó todo por pedido: frenar el pase por un campo vacío hacía que la
  regla se peleara con el trabajo en vez de ayudarlo. En su lugar, **toda tarea nace con el
  renglón `LOOM: ` escrito en la explicación** (`TEXTO_LOOM` en `tareaVacia()`) y el enlace
  se pega ahí adentro como cualquier otra cosa. La columna `loom` sigue en la base con lo que
  tenía cargado —`guardarTarea()` la escribe igual— pero ya no hay pantalla que la edite: no
  se migró nada. `pasarAlRoadmap()` conserva su `true`/`false` aunque hoy ya no rechace nada.
- **`TEXTO_LOOM` va como texto plano y no como bloque.** La explicación de la ficha se edita
  solo mientras `expl` no esté en bloques (ver `pintarExpl()`), así que nacer en bloques
  dejaría a toda tarea nueva con su campo de solo lectura. Por lo mismo, `borrarDeBacklog()`
  no cuenta ese renglón como algo escrito: si contara, una fila recién creada preguntaría
  antes de borrarse igual que una con media página adentro.
- **Se entra a la tarea por el `▤` de la izquierda**, que es `[data-pagina]` y llama a
  `abrirPagina()`. Ese símbolo significa lo mismo acá que adentro de una página: entrás a un
  documento. La **ficha** —el modal de siempre, con conversación, archivos y campos— quedó
  en el menú `⋯`: se abre mucho menos que la página.
- **El plegado es del navegador de cada uno**, no del tablero. Que alguien pliegue el Sprint 3
  para leer cómodo no tiene por qué plegárselo a los demás.

**El formato es el del diseño de Claude Design (26/8/2026): una lista de renglones, no una
rejilla.** Hasta ese día fue un `grid` de once columnas. Se reemplazó por pedido explícito, y
la lista pasó a usar **las mismas clases `pg` que la página de una tarea**: son el mismo
componente. La vista sigue marcándose con `bmode` en el board; lo propio de acá son
`bkwrap`, `bksprint`, `bktarea` y las pills.

- **La pantalla no tiene encabezado** (26/8/2026). Tenía miga («Backlog»), contador
  («4 tareas · 3 bloques»), título y bajada. Se sacaron los cuatro por pedido: la barra
  lateral ya dice dónde estás y cada sprint ya lleva su contador al lado del nombre, era medio
  scroll de repetir lo obvio. El aire de arriba lo pone ahora `.bkwrap{padding-top}` — sin
  eso la lista arrancaría pegada al borde. La página de una tarea **sí** conserva su miga y
  su título: ahí la jerarquía no se ve de otra forma.
- **Los sprints son los renglones desplegables y las tareas los renglones `▤` que cuelgan de
  ellos.** El árbol no se guarda en ningún lado: se arma en cada pintado. Un sprint no es
  fila de ninguna tabla —es el número que tiene cada tarea en `sprint`—, así que plegarlo,
  contarlo o crear uno nuevo no toca la base.
- **El desplegable del sprint es un botón entero (`.bkfold`), no una flechita al costado**
  (26/8/2026). Hasta ese día el único lugar donde se podía tocar para abrir un sprint era el
  `.pgcar` de siempre: un carácter de 9px, sin fondo y apagado hasta el hover. Abrir y cerrar
  bloques es *la* acción de esta pantalla y no puede ser la más difícil de acertar. Ahora la
  flecha, el nombre y el contador de actividades viven adentro de un mismo botón con marco
  propio. El contador va ahí adentro y no en las pills de la derecha porque, plegado, es el
  único dato que queda a la vista.
- **Al abrir un sprint lo que tiene que saltar a la vista es el título de cada actividad**, no
  las catalogaciones: es el dato por el que se abrió el bloque. Por eso `.bktarea .pgtxt` pesa
  más que el texto de un renglón de página común.
- **Al lado del título NO va el arranque de la explicación.** Existió un rato el 26/8/2026
  (`resumenDeExpl()`, clase `bkexpl`, en el hueco entre el título y las pills) y se sacó el
  mismo día por pedido: media línea de texto tenue recortada al medio se lee peor que el hueco
  vacío, y de qué se trata la tarea se ve entrando a la página, que está a un clic del `▤`.
  Con eso volvió también la fila sin la clase `conexpl`.
- **Las catalogaciones van todas a la derecha, en pills**, y desde el 26/8/2026 en dos zonas:
  las que se comparan entre filas —prioridad, quién la hace, «→ Al tablero»— en columnas de
  ancho fijo, y las que solo acompañan —código, dependencia, área y desde cuándo está anotada—
  juntas contra el título. Las que no tienen valor no dibujan nada: una columna de guiones no
  dice más que el hueco. La única excepción es quién la hace. La regla completa está en el
  cuadro de los tres layouts.
- **En el backlog no hay prioridad, y no es que esté escondida: no se puede poner**
  (26/8/2026, por pedido). Lo que está anotado todavía no se está haciendo, y ponerle
  «crítica» a algo que nadie empezó es una urgencia inventada que después llega al tablero
  envejecida. Se decide cuando la tarea entra a la cancha. Son dos puertas y hay que cerrar las
  dos, porque con una abierta la regla no vale: la pill de la fila (`pillPrioridad()`, que mira
  `t.backlog` y no la vista, así vale también adentro de la página de la tarea) y el `<select>`
  de la ficha, que se esconde —no se deshabilita: un campo gris invita a preguntar por qué no
  anda—. Fueron tres hasta que se sacó la barra de acciones en lote, con su «Prioridad ▾». El
  campo igual se guarda con el `semanal` de fábrica: no se migró nada y no hace falta.
- **Quién la hace es UNA pill con todos los nombres adentro, no una por persona.** Abre el
  menú donde se prenden y se apagan; con una pill por cabeza no habría dónde tocar para
  agregar a la segunda. Cuando no hay nadie igual se dibuja («Sin asignar») porque es justo
  el caso en que hay que poder tocarla. Ese menú **no se cierra al elegir**: asignar a tres
  es marcar tres, y cerrarlo en la primera obligaría a abrirlo tres veces.
- **En el tablero-lista la prioridad sí está, y es una pill-botón y no una entrada del menú
  `⋯`**: ahí es la que más se cambia, y meterla en el menú serían dos clics para lo que se
  hace veinte veces por semana.
- **El menú `⋯` es el equivalente del `＋` del diseño.** Adentro de una página ese botón
  inserta bloques; en la lista, una tarea no tiene bloques que insertar pero sí cosas que
  cambiar: sprint, pase al tablero, ficha y borrar.
- **El botón «→ Al tablero» de la fila se sacó y volvió el mismo día** (26/8/2026, las dos
  veces por pedido). Se había ido por ser un botón por renglón —cuarenta en pantalla— para
  algo que se hace una vez por tarea; volvió porque mandar tareas al tablero es *lo que se
  viene a hacer* al backlog cuando arranca el grupo, y tenerlo en el menú `⋯` son dos clics
  por tarea. La diferencia con la primera versión es dónde vive: ahora es una pill más, al
  lado de la prioridad y de quién la hace, y no un botón suelto al final del renglón.
  - **Va enganchado a esas dos y no al final de las pills** porque son las únicas que se
    dibujan siempre: así queda en el mismo lugar en las cuarenta filas, en vez de bailar
    según la fila tenga o no área, dependencia o antigüedad.
  - **Solo lo dibuja el backlog.** Quién lo dibuja lo decide quien llama y no `pillPase()`
    mirando la vista: la cabecera de la página de la tarea usa estas mismas pills y ya tiene
    su propio «→ Al tablero», así que preguntando por la vista se dibujaría dos veces el mismo
    botón. Que la fila esté ahí ya alcanza para saber que todavía no salió — la que sale se va
    de la lista. Los otros caminos siguen intactos: el menú `⋯` y la ficha.
- **El panel de planificación de la fila se eliminó.** Era donde vivían Área, «Depende de»,
  Estado y Tipo; los cuatro se mudaron a la ficha. La explicación ya no se edita en la lista
  bajo ningún concepto: dos editores sobre el mismo `expl`, uno de bloques y otro de HTML
  plano, se pisan el formato.
- **Los manejadores del backlog se cuelgan del board entero, por delegación**, y `render()`
  los suelta al salir de la vista. Si no, siguen escuchando encima del tablero. La caja
  cuelga los suyos igual, así que cada una apaga a mano los que la otra usa y ella no.
  Ojo con usar `addEventListener` ahí: la lista se repinta entera ante cualquier cambio y se
  acumularía un listener por repintado (por eso son `board.onclick`, `board.oninput`…).
- **La canaleta tiene dos controles y no tres**: el `⋯` y el `⠿`. El casillero de marcar se
  sacó el 26/8/2026 con toda la selección múltiple — ver el cuadro de los tres layouts, donde
  vive esa regla.

**Historial de la pestaña**, para no volver a caminarlo: fue un enlace a Notion, después una
hoja de texto libre con renglones anidados (`roadmap_vision`, borrada el 15/8/2026 sin haber
llegado a correrse), después una lista tipo Notion con los controles escondidos, después una
`<table>` estilo planilla, después una rejilla `grid` de once columnas, y desde el 26/8/2026
esta lista de renglones. Ojo con lo que parece contradicción: la lista de 2026 se descartó
por esconder los controles, y esta los esconde de nuevo. La diferencia es que ahora lo que
quedó a la vista son las catalogaciones —lo que se viene a mirar— y lo escondido son las
acciones. Antes era al revés.

### La tarea como página

Entrar a una tarea abre un documento tipo Notion (`renderPagina()`, clases con prefijo `pg`,
la vista se marca con `pgmode` en el board). Se agregó el 26/8/2026 a partir de un diseño
hecho en Claude Design.

**Una tarea se ENTRA, no se despliega.** El diseño proponía que cada tarea se abriera en el
lugar; se cambió por una página aparte porque desplegar tres para compararlas empuja el
resto del sprint fuera de pantalla, y la lista existe para ver el sprint entero. Los sprints
sí se despliegan: son cuatro, no cuarenta.

**La lista y la página son el mismo componente** y comparten las clases `pg`. Lo que cambia
es qué representa cada renglón: afuera, sprints y tareas; adentro, bloques de texto. Por eso
el `▤` significa lo mismo en los dos lados.

**Todo esto NO necesitó migración, y no fue casualidad.** El árbol de bloques vive en la
columna `expl` de siempre, detrás de una tercera marca (`<!--b-->`, ver más arriba). Y las
subpáginas **no son tareas**: no tienen código, ni prioridad, ni salen al tablero. Son hojas
adentro de la tarea. Si fueran tareas haría falta `padre_id` en `roadmap_tareas` — con la v5
y la v7 todavía sin correr, eso era condenar la pantalla a esperar.

- **Seis tipos de bloque** que se dibujan: `text`, `h`, `toggle` (se despliega), `check`,
  `page` (se entra), `file` (se adjunta). Solo `toggle` y `page` anidan. El séptimo, `hdr`,
  es el cuadro de avisos y no se dibuja nunca entre los bloques (ver abajo).

### El archivo como renglón

Cualquier renglón puede ser un archivo (`file`, 26/8/2026). Reemplazó a `img`, que era solo
una imagen pegada.

- **Es UN tipo para todo lo que se adjunta, no uno por formato.** Una imagen es un archivo
  que además se puede dibujar, no otra cosa. Con un `img` aparte, la misma captura se
  comportaría distinto según si se pegó con Ctrl+V o si se eligió del disco.
- **Dos estados, un solo dato**: `open`. Plegado se ve la ficha del archivo —ícono, nombre y
  peso— y el nombre lo abre en una pestaña. Desplegado se ve además el contenido acá mismo:
  la imagen pegada en la hoja, el PDF o el HTML en un marco. **La ficha no desaparece al
  desplegar**: una imagen suelta en el medio de la página no dice de qué archivo salió ni
  deja dónde apretar para bajarla.
- **La imagen nace desplegada y el resto plegado.** Es lo que uno quiso en cada caso: una
  captura se pega para verla ahí, un PDF se adjunta para tenerlo a mano.
- **Lo que no se puede dibujar no muestra la flecha.** `seVeAdentro()` son imagen, PDF y
  cualquier `text/*`; de un zip o un `.docx` no hay nada que mostrar, y una flecha que al
  apretarla no hace nada es peor que no tenerla. El marco va con `sandbox` **sin**
  `allow-scripts`: lo adjunta el equipo, pero un `<iframe>` con permiso de ejecutar sobre
  cualquier HTML que alguien pegue es una puerta que no hace falta abrir.
- **Una sola puerta de entrada**: `subirArchivosEnPagina()`. La usan los tres caminos —pegar,
  soltar del escritorio y elegir del disco desde el menú `＋`—. Con tres copias serían tres
  formas distintas de fallar a mitad de camino. Y **acá adentro el archivo se queda en el
  renglón**, sea imagen o no: en la ficha el que no era imagen se iba a los adjuntos de abajo
  porque no había forma de dibujarlo en un renglón, la página sí la tiene.
- **El enlace se firma al pintar, nunca en el clic.** Pedir la firma después de que el usuario
  apretó llega tarde: el navegador ya bloqueó la pestaña por venir de un `await`. De eso se
  ocupa `refrescarFirmasDeExpl()`, que es la misma función para los tres —imagen, marco y
  enlace—: quien lleve `data-path` se firma.
- **Los `img` viejos se convierten al leer** (`normalizarArchivos()`), no con una migración: la
  fila se reescribe recién cuando alguien la guarda, igual que ya pasó con el texto plano y
  con el HTML.

### El cuadro de avisos

Arriba de todo en la página de una tarea. Lo que se escribe ahí **queda resaltado en rojo
hasta que alguien le pone «visto» o lo borra**. Es el lugar para dejarle algo a quien entre
después, sin abrir la conversación de la ficha.

- **Es UN cuadro, sin destinatario y sin firma a la vista.** Se probó primero con un renglón
  por persona y se descartó: elegir a quién antes de poder escribir es justo lo que hace que
  no se anote nada. Quién lo escribió y cuándo quedan en el `title` — el cuadro tiene que
  leerse de un vistazo y una firma por renglón lo llenaría de nombres.
- **El visto lo pone cualquiera**, no una persona en particular: el aviso es de la tarea, y
  uno ya resuelto en una llamada tiene que poder apagarse sin esperar a nadie. Queda quién lo
  apagó en `vistoPor`.
- **Vive en `expl`, como un bloque `hdr` más del árbol** (`{avisos:[{id,texto,autor,ts,visto}]}`),
  y no en una columna nueva: con la v5 y la v7 pendientes, una columna sería condenar la
  pantalla a esperar a que se corra una migración. Se saltea en `planosPagina()` —y ahí y no
  en quien llama, que es lo único que garantiza que ningún camino lo deje arrastrable o
  borrable— y `normalizarCabecera()` lo deja siempre primero y único.
- **No se crea al abrir.** `cabeceraDe()` puede devolver `null` y la pantalla pinta igual, con
  el cuadro vacío; materializa recién cuando alguien escribe un aviso. Mirar una tarea vieja
  no la convierte a bloques, que es la misma regla que ya tenía la página.
- **Un aviso no es la explicación.** Por eso `textoDeBloques()` los saltea: alimenta el
  resumen de la fila del backlog y el CSV, y un «fijate el endpoint» ahí se leería como de qué
  se trata la tarea. Al buscador se los suma `textoBuscable()` por su lado.
- Solo va en la raíz de la tarea, no en las subpáginas: repetirlo en cada nivel haría que el
  mismo aviso pareciera tres avisos distintos.

### La chapa de novedad

La chapita roja sobre la actividad cuando adentro hay algo que todavía no se miró. **Son dos
cosas distintas con el mismo cartel a propósito**: la pregunta que contesta es una sola —¿hay
algo nuevo acá?— y dos chapas distintas obligarían a aprenderse cuál es cuál antes de que
sirvan para algo.

**Es del tablero y de nadie más** (26/8/2026). En el backlog no se dibuja ninguna chapa y
entrar a una tarea desde ahí **no la marca como vista**: el backlog se lee entero y varias
veces mientras se planifica, y si mirarla ahí contara, la tarea llegaría apagada al tablero,
que es justo donde tiene que llamar la atención.

- **Avisos sin ver**: lo escribe uno, lo ve cualquiera, y el visto lo apaga para todos.
- **La actividad que todavía es nueva en el tablero y que este navegador no abrió nunca.** Son
  **dos datos y no uno**, y esa es toda la gracia:
  - Que **sea** nueva es compartido y vive en `roadmap_tareas.hoy`, la columna muerta de la
    vista «Hoy» reusada acá — misma jugada que `modulo` con el «Área». Se prende al nacer y se
    vuelve a prender **cada vez que una tarea pasa del backlog al tablero**: llega como nueva
    siempre, aunque se haya anotado hace dos meses, porque para el tablero recién aparece hoy.
  - Que **vos** ya la hayas abierto es del navegador de cada uno (`localStorage`,
    `tablero-vistas`), como el plegado del backlog: «yo no la abrí» es una pregunta sobre vos,
    no sobre la fila. Contra: si entrás desde otra máquina, la chapa vuelve.
- **La ve cualquiera, no solo el responsable.** Una tarea que aparece en el tablero es algo que
  el equipo tiene que notar, y el que la escribió no es el que la tiene que ver. Por eso
  `tareaVacia()` la marca vista para vos al crearla: tu propia tarea recién anotada no es
  novedad tuya. Va ahí y no en cada uno de los tres creadores — con tres copias, olvidarse en
  una alcanza para que la regla no valga.
- **Con la marca compartida no hace falta ningún corte por fecha.** El `vistasDesde` que había
  hasta el 26/8/2026 existía porque un navegador sin nada guardado daba por no vista toda tarea
  que existiera y el primer día se prendían las cuarenta. Ahora solo se prenden las que alguien
  creó o mandó al tablero: las de antes de esta regla tienen `hoy` en `false` y no se encienden
  nunca. No se migró nada.
- `avisosSinVer()` mira la marca `"visto":false` **en el texto crudo antes de parsear**: son
  cientos de tarjetas por repintado y un `JSON.parse` en cada una para no encontrar nada no se
  paga.
- Se apaga al **entrar** a la página (`abrirPagina()`), no al salir: ese es el momento en que
  efectivamente la miraste. Y solo si la tarea está en el tablero, por lo de arriba.
- **El `check` no guarda su texto: guarda un `sid` que apunta a la subtarea.** El checklist
  de verdad sigue siendo `subtareas`, con su responsable, su estado y sus archivos. Dos
  listas de pasos sobre la misma tarea sería la peor de las opciones: la de la ficha y la de
  la página se desincronizarían a la semana. `sincronizarChecks()` empareja las dos al abrir
  — tira los tildes cuyo paso ya no existe y agrega al final los pasos cargados desde la
  ficha que todavía no tienen bloque.
- **La ficha lee la página pero no la edita.** Un `contenteditable` suelto sobre un árbol de
  bloques lo aplastaría a HTML en la primera tecla. El atributo se pone a `false` y, además,
  `guardarExpl()` corta si `expl` está en bloques: el atributo frena el tipeado y el pegado,
  pero **no el `drop`**, y un archivo soltado encima llegaba igual hasta el guardado.
- **Los cambios de texto no repintan; los de estructura sí** (`guardarPagina()` vs.
  `cambiarPagina()`). Repintar mientras alguien escribe le tira el cursor a la primera letra.
- **`render()` rearma el árbol desde `expl` salvo que haya un guardado en vuelo.** Así un
  cambio de otro se ve al toque y lo que estás escribiendo no se pisa con una versión vieja.
- **Todo trabaja sobre `nivelPagina()` y no sobre `paginaArbol`**: al entrar a una subpágina,
  esa subpágina *es* la raíz. Si no, indentar o arrastrar podría sacar un bloque del nivel
  que estás mirando.
- **La página se abre desde cualquier lado**, no solo desde el backlog: la ficha del tablero
  tiene su botón. Por eso el ruteo está arriba de todo en `render()` y no adentro de la vista.
- **Dónde vive cada cosa**: la estructura en `expl`; el texto de cada tilde en `subtareas`;
  los archivos en el bucket, con el `{n,t,path,size,b}` colgado del bloque `file` (por eso
  `archivosDeExpl()` recorre el árbol — si no, borrar una tarea dejaría sus capturas y sus
  adjuntos ocupando lugar para siempre).

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
hay que «migrarlo»: se pisa solo. El flip a privado se aplicó el 17/8/2026 (migración
`roadmap_buckets_privados`); la lectura la cubre la política `adjuntos_read` por miembro.

**La clave en el bucket no es el nombre del archivo.** Supabase valida las claves con un
regex ASCII: «Gestión CIMA.pdf» con su «ó» hacía fallar la subida entera con 400. La clave
sale de `claveLimpia()` (sin tildes, sin espacios); el nombre real vive en `n` y es el que
se muestra.

Lo que se pega o se adjunta dentro de la Explicación **no está en `t.files`**: vive en el
propio texto —en el bloque `file` si la tarea ya es una página, o colgado del `<img>`
(`data-path`, `data-b`) si todavía es HTML—. Por eso `borrarTodosLosArchivos()` suma
`archivosDeExpl(t.expl)`, que entiende los dos: si no, borrar una tarea dejaría sus capturas
y sus adjuntos ocupando lugar en el bucket para siempre. Quitar el renglón a mano sí deja el
archivo huérfano: se decidió no llevar la cuenta, como en cualquier editor.

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
`schema-v7.sql` → `schema-v8.sql`, en ese orden, todos idempotentes. `schema-v3.sql` unifica
los dos tableros y agrega los campos del diseño actual; `schema-v4.sql` agrega `repite` y
`origen` a la caja (gastos fijos); `schema-v5.sql` borra las temáticas; `schema-v7.sql`
agrega `backlog`, `sprint`, `dep` y `loom` a las tareas; `schema-v8.sql` agrega `carga` a la
caja (a quién se le imputa cada gasto). Las primeras cuatro están corridas en `propelia`
(`gvkdyxhxsnpumxlhvhsm`) desde el 8/8/2026 y la v7 desde el 17/8/2026; **v5 y v8 están
pendientes**. Después de correr la v5 no se pueden volver a correr las anteriores: dan por
hecho que `roadmap_secciones` y `sec_id` existen. La v8 no depende de ninguna: toca solo
`roadmap_caja`.

**No hay `schema-v6.sql`, y el hueco es a propósito.** Existió un día: creaba
`roadmap_vision` para la hoja de texto libre. Esa pestaña pasó a ser el Backlog antes de que
el archivo se corriera en ningún lado, así que se borró en vez de dejarlo invitando a crear
una tabla que ya no usa nadie. La v7 trae el `drop` comentado por si alguien alcanzó a
correrlo.

La diferencia entre las dos pendientes: sin la v5 el tablero funciona igual (es limpieza);
sin la v8 la caja se usa igual y todo se lee como compartido, pero elegir a quién cargarle un
gasto no queda guardado. Las dos las avisa en pantalla `RoadmapSync.faltantesDeEsquema()`, en
el triangulito de la barra lateral. Lo que queda pendiente de base y cuentas está en
`PENDIENTES-BACKEND.md` (raíz).

**Ojo con `guardarMovimiento()`, que es el único guardado tolerante del proyecto.** Un
`upsert` con una columna que la base no conoce no guarda «casi todo»: falla entero. Sin la v8
corrida, mandar `carga` dejaría de guardar hasta el importe. Por eso intenta con la columna
y, solo si la base contesta que no la conoce (`PGRST204` o `42703`, ver
`esColumnaDesconocida()`), reintenta una vez sin ella y se lo anota para el resto de la
sesión. Se pierde la imputación —que es lo que la base todavía no sabe guardar— y no el
movimiento. Distinguir ese error de uno de permisos o de red es lo que evita que un fallo
real pase por «falta el esquema» y se guarde a medias en silencio.

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
