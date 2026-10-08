# Importar un lote de inmobiliarias al CRM (7/10/2026)

Botón «Importar lote» en la cabecera de `/crm`, solo para SUPERADMIN y solo en escritorio.
Lee el Excel en formato **BCN-S01** (el que arma el agente, de a ~300 inmobiliarias), lo
revisa y crea un cliente y un lead por inmobiliaria, todos asignados a quien se elija.

## Flujo

1. Se elige el archivo y a quién se le asignan los leads (cualquier usuario activo).
2. `leerLote()` (`src/pages/crm/lib/importarLote.ts`) valida el archivo solo. Si tiene un
   error, no entra nada: se listan los errores.
3. «Revisar lote» llama a `crm_importar_lote(..., p_simular := true)`: la base hace todo el
   trabajo y lo deshace. El preview muestra el resultado exacto, incluidas las repetidas
   dentro del mismo archivo.
4. «Importar N leads» corre lo mismo con `p_simular := false`, en una sola transacción.

## El archivo (lo decide el front)

- Las 29 columnas se buscan **por nombre**. Si falta una, sobra una desconocida o hay una
  repetida, se rechaza el archivo entero: el formato ya cambió una vez (`sdr_advice` →
  `sdr_research`), y es mejor enterarse en el preview.
- Obligatorias: `company_name`, `idealista_url` (una ficha de Idealista, única en el
  archivo), `selection_reason` (`inmovilla`/`new`/`small`), `import_batch` (uno solo por
  archivo) y `sdr_research` (con sus cuatro secciones).
- `google_maps_phone` e `idealista_phone`: `+34` y 9 cifras. Enteros ≥ 0. La fecha va como
  AAAA-MM-DD. El email, en minúsculas.

## Dónde va cada columna

| Excel | Base |
|---|---|
| `company_name`, `first_name`, `last_name`, `contact_role`, `email`, `website`, `city`, `neighborhood`, `office_address`, `agents_count`, `idealista_url`, `idealista_listings`, `idealista_years`, `google_maps_phone`, `idealista_phone`, `selection_reason`, `import_batch`, `batch_activated_on` | La columna del mismo nombre en `crm_clients` |
| `google_maps_url` | `crm_clients.google_maps_url` (nueva) |
| `current_crm` | Etiqueta en `crm_software` (nueva) → `crm_clients.current_crm_id`. Un CRM por inmobiliaria; si la etiqueta no existe se crea; «Sin identificar» entra como null |
| `sdr_research` | `crm_clients.sdr_advice`, el «Consejo de Claude para SDR», con sus saltos de línea |
| `phone`, `phone_source`, `alternative_phone_1/2` (+ `_source`, `_role`) | **No se cargan.** Verificado en las 300 filas: cada uno de esos números está en la sección «TELEFONOS DE CONTACTO» del research o es el `google_maps_phone`. Esa sección lista solo los «adicionales», así que la regla se apoya en que se cargue el de Google Maps |

El lead: `assigned_to` = quien se eligió, etapa `NEW`, `created_via = 'import'`. **No se crea
la tarea «Asesorar cliente»**: serían cientos para el mismo día, y la gestión no depende de
las tareas.

## Una inmobiliaria no se repite

- Un cliente es una ficha de Idealista: índice único sobre `crm_url_clave(idealista_url)`
  (la URL sin esquema, sin www y sin barra final).
- Un cliente tiene **un** lead, sea de quien sea: `crm_leads (client_id)` único. Antes era
  uno por comercial. El alta a mano (`crm_create_lead_with_client`) sigue la misma regla.

Por cada fila, la RPC decide una de cuatro:

| Resultado | Cuándo | Qué hace |
|---|---|---|
| `nueva` | La ficha no existe | Cliente y lead nuevos |
| `posible_repetida` | La ficha no existe, pero otro cliente comparte teléfono, email o nombre normalizado | Se crea igual, con `POSIBLE REPETIDA de «X» (lead de Y): comparten …` **arriba** del consejo. Si el email ya lo tiene otro cliente (es único), entra sin email y el aviso lo dice |
| `contactos_nuevos` | La ficha existe y la fila trae algún contacto que no estaba | No se crea nada ni se pisa nada: se agrega `NUEVOS CONTACTOS (lote X, fecha)` **al final** del consejo, con los renglones nuevos |
| `sin_novedad` | La ficha existe y no trae ningún contacto nuevo | Se saltea |

«Contacto» quiere decir los `+34…` de `google_maps_phone` y del research, el email y las
personas de «PERSONAS DE LA EMPRESA». El `idealista_phone` **no cuenta**: es un redirector y
rota (cambió en 171 de 300 filas entre dos versiones del mismo lote).

**Sin historial, a propósito**: los bloques viven en el consejo y el SDR los edita o los
borra. Si algún día el consejo lo genera Claude, ese generador tiene que conservarlos.

## Archivos

- `supabase/migrations/20261007223750_crm_importar_lote.sql` (y lo mismo en `supabase/schema.sql`).
- `supabase/tests/crm-importar-lote.sql`: se corre entera con el MCP `execute_sql` y tiene que devolver `crm-importar-lote: OK`.
- `src/pages/crm/lib/importarLote.ts` (+ test), `service/excel.ts` (el único que conoce `read-excel-file`), `components/ImportarLoteDialog.tsx`.
