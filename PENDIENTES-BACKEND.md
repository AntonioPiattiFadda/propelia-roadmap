# Pendientes de back-end — tablero unificado

**Al 17/8/2026 quedan dos puntos abiertos:**

- **El 8 (pasar los buckets a privados) espera al deploy del front.** El código con URLs
  firmadas ya está; el flip se hace después de publicarlo, no antes (ver el punto 8).
- **El 5 (sacar las temáticas de la base) es limpieza.** El tablero anda igual sin correrlo.
- **El 7 (`schema-v7.sql`, el Backlog) — ✅ HECHO (17/8/2026).** Aplicado como migración
  `roadmap_schema_v7_backlog`; columnas e índice verificados contra la base.

Los puntos 1 a 3 están hechos y verificados contra la base; el 4 es opcional y conviene
dejarlo reposar. El archivo se conserva como registro de qué se tocó y por qué.

**Contexto en una frase:** los dos tableros que había (Propelia y Captalia) se unificaron
en uno solo, con tres personas: Lorenzo, Antonio y Luis. Diego queda fuera del sistema.

---

## 1. Correr `supabase/schema-v3.sql` — ✅ HECHO (8/8/2026)

Aplicado sobre `propelia` (`gvkdyxhxsnpumxlhvhsm`) como migración
`roadmap_schema_v3_unificacion`. Resultado verificado: las 10 tareas y la sección de
Captalia quedaron copiadas con prefijo `c-` (140 tareas y 6 temáticas en total), 117
tareas con `pend` cargado desde el viejo `resp`, y `app_miembros` quedó solo con Lorenzo
y Antonio en `propelia`. Es idempotente: se puede volver a correr sin romper nada.

Lo que hizo, en orden:

| Paso | Qué toca |
|---|---|
| 1 | Agrega a las tareas: `prioridad`, `tipo`, `hoy`, `pend` (varios responsables), `creada`. Hace `sec_id` opcional para permitir «Sin temática». Agrega `color` a las secciones. |
| 2 | Crea `roadmap_notas` (las dos hojas de la vista Visión) con su RLS y realtime. |
| 3 | Copia secciones y tareas de Captalia a las tablas `roadmap_*` con el prefijo `c-` en el id. **Nada se borra**: `captalia_*` queda intacta como respaldo. |
| 4 | Borra las membresías de `captalia` de `app_miembros` — eso también saca a Diego, que era miembro solo de ahí. Deja el bucket viejo de Captalia en solo lectura, para que los adjuntos copiados se sigan viendo. |

### Decisiones que tomé y podés revertir

- **La caja de Captalia NO se mezcla.** Son movimientos de otra plata y mezclarlos ensucia
  justo lo que se quiere tener limpio. Si igual la querés unir, hay un bloque comentado
  en el paso 3.c del SQL: descomentalo y volvé a correr el archivo.
- **Los adjuntos de Captalia no se mueven de bucket.** A cada archivo copiado se le anota
  de qué bucket sale, en la clave `b` del JSON. El tablero lee esa clave y, si no está,
  usa el bucket principal. Cero transferencia de archivos, cero enlaces rotos.

---

## 1 bis. Correr `supabase/schema-v4.sql` — ✅ HECHO (8/8/2026)

Aplicado después del anterior, como migración `roadmap_schema_v4_gastos_fijos`. Agregó a
`roadmap_caja` las columnas `repite` y `origen` para los gastos fijos: los que se repiten
todos los meses y el tablero vuelve a cargar solo.

Con esto el triangulito de aviso del encabezado ya no aparece: las tres comprobaciones
que hace `RoadmapSync.faltantesDeEsquema()` pasan.

---

## 2. Crear las cuentas en Supabase Auth — ✅ HECHO

`Authentication → Users → Add user`, una por persona, con su email real.

Las tres existen, confirmadas:

| Persona | Cuenta |
|---|---|
| Lorenzo | `lorenzopiattifadda@gmail.com` |
| Antonio | `antonio.piattifadda@gmail.com` |
| Luis | `rubioluis13@gmail.com` (programador; confirmado por Antonio el 8/8/2026) |

Ojo con esa última: en las tablas del producto figura como `agent` de «Organization
Antonio», el mismo perfil que tiene Diego, que **no** es del tablero. El perfil del
producto no dice nada sobre quién entra al roadmap — eso se confirma con una persona,
no se deduce de la base.

---

## 3. Dar acceso: `app_miembros` + `personas` del HTML — ✅ HECHO (8/8/2026)

Son **dos** cosas separadas y hacen falta las dos. Es el error más fácil de cometer acá.

**a) El acceso** lo da una fila en `app_miembros`. Sin esta fila la persona entra, ve
«Sin acceso» y no lee un solo dato — la RLS se lo impide en la base, no en la pantalla.

Las tres filas ya están cargadas (`propelia` las tres). Si algún día entra alguien más:

```sql
insert into public.app_miembros (email, proyecto)
values ('<email real, en minúscula>', 'propelia')
on conflict do nothing;
```

Los emails van **en minúscula** y tienen que coincidir exactos con los de Auth.

**b) El nombre y el color** salen del bloque `personas` en `index.html`. Ya está completo:

```js
personas: [
  { id: 'Loro', nombre: 'Lorenzo', ini: 'LO', color: '#6E6BA0', email: 'lorenzopiattifadda@gmail.com', caja: true },
  { id: 'Toni', nombre: 'Antonio', ini: 'AN', color: '#4F7F79', email: 'antonio.piattifadda@gmail.com', caja: true },
  { id: 'Luis', nombre: 'Luis',    ini: 'LU', color: '#A87A3F', email: 'rubioluis13@gmail.com' },
],
```

`caja: true` marca quién participa de la caja. Solo Lorenzo y Antonio ponen plata, así
que la planilla muestra a esos dos y el saldo se reparte entre ellos. Luis usa el
tablero igual que siempre, pero no aparece en la caja.

Con el email en blanco la persona igual entra (si tiene su fila en `app_miembros`), pero
el tablero no la reconoce: no puede firmar sus mensajes en el chat ni marcarle «Lo mío».
El tablero avisa con un mensaje cuando le pasa eso a la cuenta que entró.

> **No cambiar el campo `id`.** `'Loro'` y `'Toni'` son los valores que ya están escritos
> dentro de las tareas viejas (responsable, autor de cada mensaje). Si se tocan, esas
> asignaciones y esos mensajes quedan huérfanos.

---

## 4. Opcional: limpiar Captalia una vez verificado

Después de correr el paso 1 y comprobar en el tablero que las tareas de Captalia
llegaron bien, se pueden borrar las tablas viejas. **No corras esto el mismo día** — es
lo único de toda la lista que no tiene vuelta atrás.

```sql
drop table if exists public.captalia_tareas;
drop table if exists public.captalia_secciones;
drop table if exists public.captalia_caja;
```

El bucket `captalia-adjuntos` **no se borra nunca**: ahí siguen viviendo los archivos de
las tareas copiadas.

---

## 5. Correr `supabase/schema-v5.sql` — ⏳ PENDIENTE (11/8/2026)

Las temáticas salieron del tablero: no se ven en la tarjeta, no filtran, no se eligen en
la tarea y no hay pantalla para administrarlas. El front ya no lee ni escribe `sec_id`,
así que **sin correr esto el tablero funciona igual**.

Lo que sí conviene desarmar es la trampa que queda en la base: `roadmap_tareas.sec_id`
apunta a `roadmap_secciones` con `on delete cascade`. Hoy nadie puede borrar una temática
desde el tablero, pero si alguien borra una fila a mano desde el panel de Supabase, se
lleva puestas todas las tareas de esa temática. El archivo suelta la columna y borra la
tabla.

No tiene vuelta atrás: se pierde qué tarea estaba en qué temática. Si esa clasificación
vieja se quiere guardar como registro, al final del SQL hay un bloque comentado que solo
saca la cascada y deja los datos donde están.

Después de correrlo, **no volver a correr `schema.sql`, `v2` ni `v3`**: dan por hecho que
la tabla y la columna existen.

---

## 6. `supabase/schema-v6.sql` — ❌ YA NO EXISTE (15/8/2026)

Creaba `roadmap_vision`, la hoja de texto libre de la pestaña Visión. Esa pestaña pasó a ser
el **Backlog** antes de que el archivo se corriera en ningún lado, así que se borró: dejarlo
ahí era invitar a crear una tabla que ya no usa nadie.

Si alcanzaste a correrlo, la tabla quedó y no molesta: el tablero no la lee ni la escribe.
El paso 3 de `schema-v7.sql` trae el `drop` comentado para cuando quieras limpiarla.

---

## 7. Correr `supabase/schema-v7.sql` — ✅ HECHO (17/8/2026)

Aplicado sobre `propelia` (`gvkdyxhxsnpumxlhvhsm`) como migración
`roadmap_schema_v7_backlog`. Verificado: las 4 columnas y el índice quedaron creados.

Es el Backlog: la pestaña donde se anota lo que todavía no entra al tablero, clasificado
por sprint. Antes de correrlo, la marca que separa backlog de tablero no se guardaba y
cada tarea anotada ahí aparecía también en el tablero.

Agrega dos columnas a `roadmap_tareas`:

| Columna | Qué es |
|---|---|
| `backlog` (bool, default `false`) | Lo único que separa el backlog del tablero. Pasar una tarea al roadmap es apagar esta marca. |
| `sprint` (smallint, nulo) | A qué sprint pertenece. Nulo es «sin clasificar». Se guarda también en las tareas que ya están en el tablero: es lo que las deja seguir apareciendo en su bloque, apagadas, para poder mirar el sprint entero al cerrarlo. |
| `dep` (text) | De qué depende, escrito a mano («T04», «diseño cerrado»). Texto libre y no una relación entre tareas: la mitad de las dependencias reales no son otra tarea del tablero, y obligarlas a serlo hace que nadie las anote. |
| `loom` (text) | El enlace al Loom de la tarea. Texto y no un booleano: saber que «hay video» sin poder abrirlo obliga a ir a buscarlo a mano. El tilde de la lista se prende solo cuando esta columna tiene algo. |

Más un índice por `(backlog, sprint, orden)`, que es exactamente cómo se pide la lista.

No borra ni toca nada de lo que ya existe, y no hace falta tocar RLS ni realtime: son
columnas de una tabla que ya tiene las dos cosas desde `schema-v3.sql`. Se puede correr las
veces que haga falta.

**Por qué no hay una tabla de backlog aparte:** una tarea que se manda al tablero tiene que
llegar con su explicación, su checklist, sus archivos y su conversación. Con dos tablas eso
es copiar filas y mover adjuntos cada vez, y se hace seguido. Con una marca es un booleano.

**Por qué no hay una tabla de sprints:** un sprint no tiene más datos que su número.

## 8. Pasar los buckets de adjuntos a privados — ⏳ ESPERA AL DEPLOY (17/8/2026)

Los buckets `roadmap-adjuntos` y `captalia-adjuntos` son públicos: cualquiera que tenga
la URL de un archivo lo abre sin login. El front ya está preparado para el cambio
(`RoadmapSync.urlFirmada()`, URLs firmadas que se piden al pintar y se cachean por
sesión), y las políticas de lectura por miembro ya existen en `storage.objects`
(`adjuntos_read`, gateada por `es_miembro('propelia')`), así que el flip es solo esto:

```sql
update storage.buckets set public = false
where id in ('roadmap-adjuntos', 'captalia-adjuntos');
```

**El orden importa: primero publicar el front nuevo, después correr el SQL.** Al revés,
la versión vieja (que guarda y usa URLs públicas) deja de mostrar todas las imágenes y
adjuntos hasta que llegue el deploy. El front nuevo funciona igual con el bucket todavía
público — `createSignedUrl` firma también sobre buckets públicos — así que no hay apuro
ni ventana rota entre un paso y el otro.

Vuelta atrás, si hiciera falta: el mismo `update` con `true`.

---

## Lo que quedó afuera del tablero nuevo

Cosas que existían antes y que el diseño nuevo no tiene. Ninguna rompe nada: los datos
siguen guardados, simplemente no hay pantalla que los muestre.

- **Explicación, chat y archivos por subtarea.** Antes cada subtarea se desplegaba y tenía
  lo suyo. Ahora la subtarea es una línea: tilde, título y a quién. Lo que ya estaba
  cargado sigue en la base y no se pisa, pero no se ve ni se edita.
- **Los campos `modulo`, `img` y `com`** de las tareas. Ya casi no se usaban y el diseño
  nuevo no los contempla. Quedan guardados.
- **Las temáticas.** Se sacaron el 11/8/2026 (ver el punto 5). En la base siguen hasta que
  se corra `schema-v5.sql`; en pantalla no queda nada de ellas.
- **La pestaña Visión.** Fue un enlace a Notion y después una hoja de texto libre con
  renglones anidados. El 15/8/2026 pasó a ser el **Backlog**. El documento de Notion sigue
  existiendo, nadie lo tocó; el tablero ya no lo enlaza.

Si algo de esto hace falta, se agrega — decilo y lo hago.
