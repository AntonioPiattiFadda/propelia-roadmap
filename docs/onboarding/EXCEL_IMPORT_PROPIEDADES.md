# Excel para importar propiedades

Cómo armar a mano el Excel que se sube en **Onboarding › Paso 5 · Cargar la cartera**.
También se puede partir de la plantilla del botón **Descargar plantilla**.

## Reglas generales

- Archivo **`.xlsx`**: no sirve `.csv` ni `.xls`.
- Se lee **sólo la primera hoja**.
- La **primera fila** son los nombres de las columnas; desde la segunda, una propiedad por fila.
- Tienen que estar **las 14 columnas**, aunque alguna quede vacía. Si falta una, el archivo
  se rechaza entero. Las dos de agentes y la de visibilidad (al final) son **opcionales**: sin
  ellas, las propiedades entran sin agente y con la dirección exacta.
- Los nombres de las columnas no distinguen **mayúsculas, acentos ni orden**: `Baños`,
  `BANOS` y `baños` son la misma. Las columnas de más se ignoran.
- Las filas totalmente vacías se saltean.

## Columnas

| Columna | ¿Obligatoria? | Qué poner | Ejemplo |
|---|---|---|---|
| Código anuncio Idealista | No, pero muy recomendada | Sólo números | `108765432` |
| Tipo | **Sí** | Ver [Tipos](#tipos) | `Piso` |
| Calle | No (se completa después) | Nombre de la calle, sin el número | `Carrer de Manso` |
| Número | No (se completa después) | Número de portal | `58` |
| Código postal | No | 5 dígitos, **como texto** | `08015` |
| Ciudad | No, pero recomendada | Municipio | `Barcelona` |
| Operación | No | `Venta`, `Alquiler` o `Venta y alquiler` | `Venta` |
| Precio venta | **Sí, si es venta** | Número, en euros | `250000` |
| Precio alquiler | **Sí, si es alquiler** | Número, en euros por mes | `900` |
| Habitaciones | **Sí** | Número | `3` |
| Baños | **Sí** | Número | `2` |
| Ascensor | **Sí** | `Sí` o `No` | `Sí` |
| m² construidos | No | Número | `85` |
| Balcón | No | `Sí` o `No` | `No` |
| Agente captador | No | Email (o nombre) de alguien de la organización | `marta@inmobiliaria.es` |
| Agente comercializador | No | Email (o nombre) de alguien de la organización | `marta@inmobiliaria.es` |
| Visibilidad dirección | No | `Exacta`, `Mostrar sólo calle` u `Oculta` | `Exacta` |

## Detalle de cada columna

### Código anuncio Idealista

Es el número del anuncio en Idealista: está en la URL
(`idealista.com/inmueble/108765432/` → `108765432`) y en los mails de leads.

**Es lo que vincula los leads con la propiedad.** Sin código, la fila se importa igual, pero
los leads de ese anuncio entran sin propiedad ("Pendiente de matching").

- Sólo números: nada de letras, guiones ni espacios.
- No se puede repetir dentro del Excel: la segunda fila con el mismo código no se importa.
- Si el código ya existe en la organización, la fila se saltea y la propiedad existente no se
  toca.

### Tipos

Se acepta cualquiera de estos textos:

| Tipo en Propelia | Se puede escribir |
|---|---|
| Piso | `Piso`, `Apartamento`, `Ático`, `Dúplex`, `Estudio` |
| Casa / Chalet | `Casa / Chalet`, `Casa`, `Chalet`, `Chalet pareado`, `Chalet adosado`, `Chalet independiente`, `Casa pareada`, `Casa adosada`, `Casa independiente` |
| Casa rústica | `Casa rústica` |
| Habitación | `Habitación` |
| Local o nave | `Local o nave`, `Local`, `Nave` |
| Traspaso | `Traspaso` |
| Garaje | `Garaje`, `Parking`, `Plaza de garaje` |
| Oficina | `Oficina` |
| Terreno | `Terreno`, `Solar` |
| Trastero | `Trastero` |
| Edificio | `Edificio` |

Cualquier otro texto da error en esa fila.

### Dirección (Calle, Número, Código postal, Ciudad)

- **Calle y Número van en columnas separadas.**
- **Sin calle o sin número la fila entra igual, con aviso** (1/11/2026, por pedido, con el
  Excel de Altamarco: los anuncios con la dirección oculta no la traen). En Propelia la tabla de
  Propiedades la marca con **«Dirección incompleta»** en rojo, que abre el formulario completo
  con la dirección a la vista; el formulario la exige para guardar. Hasta completarla no se
  publica en Idealista y el matching no puntúa la zona (no la descarta: no sabe dónde está).
- Al importar, la dirección se completa sola con Google (barrio, distrito, provincia,
  coordenadas). Cuanto más completa venga (sobre todo **Ciudad**), mejor sale. **Sin calle no
  se consulta a Google**: con la ciudad sola devolvería el centro del municipio y el piso
  quedaría en una zona que no es la suya.
- **Código postal:** si la columna tiene formato de número, Excel borra el 0 inicial
  (`08015` → `8015`). Poné la columna en formato **Texto** antes de escribir.
- Piso y puerta no se cargan acá: se completan después en la ficha.

### Operación y precios

- `Venta` → hace falta **Precio venta**.
- `Alquiler` → hace falta **Precio alquiler**.
- `Venta y alquiler` → hacen falta **los dos**.
- Si **Operación** queda vacía, se deduce del precio cargado: sólo precio de venta → venta;
  sólo de alquiler → alquiler; los dos → ambas.

Formatos de precio que se aceptan: `250000`, `250.000`, `250.000 €`, `1.250,50`. Lo más
seguro es una celda numérica sin formato. Textos como `Consultar` o `A convenir` dan error.

### Habitaciones, Baños, m² construidos

Números. Para los metros se acepta decimal con coma o con punto (`85,5` o `85.5`).

Habitaciones y Baños son obligatorios **para todos los tipos**, igual que en la carga rápida.
En un garaje, local o terreno, poné `0`.

### Ascensor y Balcón

Se acepta `Sí`, `Si`, `S`, `X`, `1` o `true` para sí, y `No`, `N`, `0` o `false` para no.

Ascensor es obligatorio; Balcón se puede dejar vacío.

### Agente captador y Agente comercializador

Desde el 29/10/2026 (por pedido, con el Excel de Docta). Van a `captured_by` y
`commercialized_by` de la propiedad. Se busca a la persona **entre las cuentas de la
organización** (por eso se importa después del equipo): primero por email (sin importar
mayúsculas), y si no, por «Nombre Apellido» o por el nombre solo si no hay dos iguales. Vacía =
sin agente. Alguien que no está en la org, o un nombre que son dos personas, es un error de esa
fila. También se reconocen `Captador`, `Captado por`, `Captured by`, `Comercializador`,
`Comercializado por` y `Commercialized by`, y el «▼» de un desplegable en la cabecera no cuenta.

### Visibilidad dirección

Desde el 1/11/2026 (por pedido, con el Excel de Altamarco). Qué muestra el anuncio de la
dirección. El Excel va **en español** y un adapter (`parseAddressVisibility`, en
`_shared/propertyImport/sheet.ts` de propelia-frontend) lo pasa a `properties.address_visibility`:

| En el Excel | En Propelia |
|---|---|
| `Exacta` | `exact`: calle y número |
| `Mostrar sólo calle` | `street_only` |
| `Oculta` | `hidden`: sin dirección |

Sin mayúsculas ni acentos que importen (`mostrar solo calle` vale). Vacía = `Exacta`. Otro texto
es un error de esa fila. También se reconocen `Visibilidad` y `Visibilidad de la dirección` como
nombre de la columna.

## Ejemplo

| Código anuncio Idealista | Tipo | Calle | Número | Código postal | Ciudad | Operación | Precio venta | Precio alquiler | Habitaciones | Baños | Ascensor | m² construidos | Balcón |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 108765432 | Piso | Carrer de Manso | 58 | 08015 | Barcelona | Venta | 250000 | | 3 | 2 | Sí | 85 | No |
| 108765433 | Casa | Calle Mayor | 12 | 28013 | Madrid | Alquiler | | 1800 | 4 | 3 | No | 160 | Sí |
| 108765434 | Garaje | Avenida Diagonal | 400 | 08037 | Barcelona | Venta y alquiler | 30000 | 120 | 0 | 0 | Sí | 12 | |

## Hoja «Fotos» (opcional)

Desde el 2/11/2026 (por pedido, con el Excel de Altamarco). Una segunda hoja llamada
**`Fotos`**, con una foto por fila. Se lee solo si antes de subir el Excel se tilda **«Importar
fotos»**, al lado del botón «Importar».

| Columna | ¿Obligatoria? | Qué poner | Ejemplo |
|---|---|---|---|
| Código anuncio Idealista | **Sí** | El de la propiedad, igual que en la primera hoja | `111883889` |
| Orden | **Sí** | 1, 2, 3… dentro de la propiedad. La 1 es la portada | `1` |
| URL | **Sí** | El enlace a la imagen | `https://img4.idealista.com/…` |
| Etiqueta | No | Qué se ve: queda como texto de la foto | `Salón` |

- La propiedad tiene que estar en la primera hoja sin errores, o ya en Propelia.
- Las fotos **se copian a Propelia**. Las URLs del CDN de Idealista que trae la exportación
  **vencen** (`Expires=` en la URL, ~1 día), así que hay que importar el Excel el mismo día que
  se bajó. Vencido, la vista previa las cuenta igual, pero al importar salen «no entraron»: hay que
  bajar el Excel de nuevo.
- **Volver a subir el Excel agrega solo las fotos que faltan**: una foto se reconoce por su URL
  sin la firma. Las que ya están no se tocan, ni su orden ni su etiqueta, y nada se borra.
- Si la propiedad ya tenía fotos de un agente, las del Excel van después, y la portada no cambia.
- La vista previa dice cuántas fotos se importan, cuántas ya estaban y cuáles tienen error.

## Qué pasa al importar

1. La vista previa marca cada fila como **Lista**, **Lista con aviso** (por ejemplo, sin
   código) o **con errores**. Las que tienen errores **no se importan**: se corrigen en el
   Excel y se vuelve a subir.
2. Las propiedades se crean **sin captador ni comercializador**: se asignan después.
3. Los leads que ya habían llegado por esos códigos se vinculan en el momento.
4. Volver a subir el mismo Excel no duplica nada: los códigos que ya existen se saltean. Esto
   no vale para las filas **sin código**: ésas se crean de nuevo cada vez.
5. Con «Importar fotos», después de las propiedades se suben las fotos, de a 20. Una que falla
   no frena el resto: al final avisa cuántas no entraron.
