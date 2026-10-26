# Excel para importar los usuarios

El Excel con el equipo del cliente: se le manda en el saludo del **paso 1 · Contacto y cuentas**,
lo devuelve completado y se sube en la tarea **«Importar el Excel de usuarios»**. Reemplaza a
cargar el equipo a mano, al `/sign-up` del responsable y a crear al resto desde Equipo.

La plantilla sale del botón **Descargar Excel** del paso 1 (`usuarios-<inmobiliaria>.xlsx`), con
la fila del responsable ya completada con lo que hay en el cliente del CRM. Lleva una segunda hoja,
«Instrucciones», con la tabla de abajo en corto: el import la ignora.

## Reglas generales

- Archivo **`.xlsx`**: no sirve `.csv` ni `.xls`.
- Se lee **sólo la primera hoja**.
- La **primera fila** son los nombres de las columnas; desde la segunda, una persona por fila.
- Tienen que estar **las 6 columnas**, aunque alguna quede vacía. Si falta una, el archivo se
  rechaza entero.
- Los nombres de las columnas no distinguen **mayúsculas, acentos ni orden**. Las columnas de
  más se ignoran.
- Las filas totalmente vacías se saltean.
- **Todo o nada**: si una fila tiene un error, no se crea ninguna cuenta. Al revés que en la
  cartera, media empresa con acceso y media sin él es peor que esperar a corregir el Excel.

## Columnas

| Columna | ¿Obligatoria? | Qué poner | Ejemplo |
|---|---|---|---|
| Nombre | **Sí** | Nombre de pila | `María José` |
| Apellido | **Sí** | Uno o los dos | `Fernández` |
| Email | **Sí** | Es el usuario de acceso | `mj.fernandez@fincasribera.es` |
| Teléfono | **Sí** | Con prefijo de país | `+34 600 123 456` |
| Rol | No | `Administrador` o `Agente`. Vacío = Agente | `Agente` |
| Responsable | **Sí, en una fila** | `Sí` en una sola persona | `Sí` |

## Detalle de cada columna

### Email

- No puede estar ya registrado en Propelia (en ninguna organización).
- No se puede repetir dentro del Excel.
- Se guarda en minúsculas y sin espacios.

### Teléfono

- Con prefijo: `+34 600 123 456`, `+34600123456` y `0034 600 123 456` valen. Sin prefijo da
  error: no se adivina el país.
- Se guarda en E.164 (`+34600123456`).
- **No se puede repetir dentro de la inmobiliaria**: es el que se usa como contacto en Idealista
  y por el que llegan sus leads.

### Rol

- `Administrador` ve y gestiona todo, Ajustes incluido. `Agente` ve lo suyo.
- Se acepta `Admin`, `Administrador`, `Agente` o `Agent`. Cualquier otro texto da error.

### Responsable

- `Sí` en **exactamente una** fila (`Sí`, `Si`, `S`, `X`, `1` cuentan como sí; el resto, no).
- Es el dueño de la cuenta y la persona de contacto: a él le salen los mensajes del onboarding.
- Tiene que ser **Administrador**: si su rol dice Agente, da error.

## La contraseña no va en el Excel

Se crea sola al importar, para no pedir ni mover contraseñas en un archivo ni en el chat:

- Es `nombre.apellido`, en minúsculas y sin tildes ni espacios
  (`María José Fernández` → `mariajose.fernandez`).
- Si no llega a los **6 caracteres** que pide la app, se le suma el año (`Li Wu` → `li.wu2026`).
- La vista previa la muestra por persona y después se le manda a cada uno (tarea «Verificar
  accesos y enviar a cada uno su usuario y clave»), con el aviso de cambiarla al primer ingreso
  («¿Olvidaste tu contraseña?» en la pantalla de acceso).

Una columna `Contraseña` de más en el archivo se ignora, como cualquier otra columna de más.

## Ejemplo

| Nombre | Apellido | Email | Teléfono | Rol | Responsable |
|---|---|---|---|---|---|
| Marta | Gil | marta@fincasribera.es | +34 600 111 222 | Administrador | Sí |
| Pablo | Ruiz | pablo@fincasribera.es | +34 600 333 444 | Agente | |
| María José | Fernández | mj.fernandez@fincasribera.es | +34 600 555 666 | Agente | |

Contraseñas que quedan: `marta.gil`, `pablo.ruiz`, `mariajose.fernandez`.

## Qué pasa al importar

1. La vista previa (sin escribir nada) marca cada fila como **Lista** o **con errores** y
   muestra la contraseña automática de cada uno. Con un error en cualquier fila, el botón «Importar»
   no se habilita.
2. Importar crea **la organización** con el nombre cargado en la pantalla, la cuenta del
   responsable (que queda como dueño) y las del resto, todas adentro de esa organización. El
   lead queda vinculado a la org solo (`crm_leads.propelia_organization_id`).
3. La org arranca **sin plan** (sólo lectura) hasta que paguen el link del paso 2.
4. El contacto de Idealista de cada agente no se crea acá: los portales se conectan en el paso 4
   y después se crea desde Equipo.

## Lo que falta para que ande

Una acción nueva del puente, **`create_org_with_users`** (`organization_name` + las filas), que hoy
no existe: crear usuarios en la org de un cliente necesita un programador. La construye la sesión
de `propelia-frontend` y se suma a [`PUENTE.md`](PUENTE.md). Como `check_properties`, conviene
que tenga su par sin escritura (`check_users`) para la vista previa: si el email ya está
registrado sólo lo sabe el producto.
