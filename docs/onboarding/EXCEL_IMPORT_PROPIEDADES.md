# Excel para importar propiedades

Cómo armar a mano el Excel que se sube en **Onboarding › Paso 5 · Cargar la cartera**.
También se puede partir de la plantilla del botón **Descargar plantilla**.

## Reglas generales

- Archivo **`.xlsx`**: no sirve `.csv` ni `.xls`.
- Se lee **sólo la primera hoja**.
- La **primera fila** son los nombres de las columnas; desde la segunda, una propiedad por fila.
- Tienen que estar **las 14 columnas**, aunque alguna quede vacía. Si falta una, el archivo
  se rechaza entero.
- Los nombres de las columnas no distinguen **mayúsculas, acentos ni orden**: `Baños`,
  `BANOS` y `baños` son la misma. Las columnas de más se ignoran.
- Las filas totalmente vacías se saltean.

## Columnas

| Columna | ¿Obligatoria? | Qué poner | Ejemplo |
|---|---|---|---|
| Código anuncio Idealista | No, pero muy recomendada | Sólo números | `108765432` |
| Tipo | **Sí** | Ver [Tipos](#tipos) | `Piso` |
| Calle | **Sí** | Nombre de la calle, sin el número | `Carrer de Manso` |
| Número | **Sí** | Número de portal | `58` |
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
| Casa / Chalet | `Casa / Chalet`, `Casa`, `Chalet` |
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

- **Calle y Número van en columnas separadas**, y los dos son obligatorios.
- Al importar, la dirección se completa sola con Google (barrio, distrito, provincia,
  coordenadas). Cuanto más completa venga (sobre todo **Ciudad**), mejor sale.
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

## Ejemplo

| Código anuncio Idealista | Tipo | Calle | Número | Código postal | Ciudad | Operación | Precio venta | Precio alquiler | Habitaciones | Baños | Ascensor | m² construidos | Balcón |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 108765432 | Piso | Carrer de Manso | 58 | 08015 | Barcelona | Venta | 250000 | | 3 | 2 | Sí | 85 | No |
| 108765433 | Casa | Calle Mayor | 12 | 28013 | Madrid | Alquiler | | 1800 | 4 | 3 | No | 160 | Sí |
| 108765434 | Garaje | Avenida Diagonal | 400 | 08037 | Barcelona | Venta y alquiler | 30000 | 120 | 0 | 0 | Sí | 12 | |

## Qué pasa al importar

1. La vista previa marca cada fila como **Lista**, **Lista con aviso** (por ejemplo, sin
   código) o **con errores**. Las que tienen errores **no se importan**: se corrigen en el
   Excel y se vuelve a subir.
2. Las propiedades se crean **sin captador ni comercializador**: se asignan después.
3. Los leads que ya habían llegado por esos códigos se vinculan en el momento.
4. Volver a subir el mismo Excel no duplica nada: los códigos que ya existen se saltean. Esto
   no vale para las filas **sin código**: ésas se crean de nuevo cada vez.
