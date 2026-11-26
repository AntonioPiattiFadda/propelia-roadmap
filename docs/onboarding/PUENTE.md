# Onboarding — el puente con Propelia

El Roadmap y Propelia son dos proyectos de Supabase distintos, con usuarios distintos. Todo lo
que el onboarding necesita del producto pasa por **una sola edge function del Roadmap**,
`propelia-bridge`. El front del Roadmap no conoce la URL ni las keys del producto.

```
navegador (Roadmap) ──invoke──▶ propelia-bridge (Roadmap)
                                  │ 1. ¿sesión válida y SUPERADMIN activo en public.users?
                                  │ 2. reenvía { action, params, actor }
                                  ▼  servidor a servidor, header x-bridge-secret
                                roadmap-bridge (Propelia, service role)
                                  └─ organizations · users · import · send-email · links de pago
```

**Estado (26/10/2026):** construido y con tests, **sin deployar**. Código:
`supabase/functions/propelia-bridge/` acá y `supabase/functions/roadmap-bridge/` en
`propelia-frontend`. Hasta que esté deployado, el front mockea `invoke` con las respuestas de
ejemplo de este archivo, que son las reales.

## Cómo se llama

```ts
const { data, error } = await supabase.functions.invoke('propelia-bridge', {
  body: { action: 'list_organizations' },
})
```

Va con la sesión del usuario del Roadmap (la pone el cliente de supabase-js). No hay otra
autenticación del lado del front.

### Errores

Cualquier error responde con status ≠ 2xx y este cuerpo:

```json
{ "error": "forbidden", "message": "Sólo un SUPERADMIN puede usar el onboarding." }
```

| `error` | Status | Cuándo |
|---|---|---|
| `invalid_session` | 401 | Sin sesión o sesión vencida |
| `forbidden` | 403 | No es SUPERADMIN activo del Roadmap, o (sólo `create_payment_link`) no tiene cuenta de superadmin en Propelia con el mismo email |
| `bad_request` | 400 | Falta un parámetro o tiene mal formato; `message` dice cuál |
| `not_found` | 404 | La org, el plan o el escenario no existen |
| `not_demo_org` | 409 | Simular un lead fuera de la org demo |
| `no_team` / `no_properties` | 409 | `create_test_leads` en una org sin equipo o sin pisos activos con precio |
| `too_many_rows` | 413 | Más filas que el máximo de la acción |
| `upstream_error` | 502 | El producto o un tercero (Google, Lemon Squeezy, Resend) falló, o el puente está mal configurado; `message` lo explica |

`message` está en español y se puede mostrar tal cual en un toast.

## Acciones

### `list_organizations`

Para el selector del paso 1 y para mostrar el nombre de la org vinculada a un lead.

```json
// → 
{ "organizations": [
  { "id": "6f1c…", "name": "Fincas Ribera", "slug": "fincas-ribera", "created_at": "2026-10-26T10:12:00Z" }
] }
```

Orgs no borradas, ordenadas por nombre. La demo incluida.

### `create_org_with_users`

El paso 1: crea la organización del cliente y las cuentas de todo su equipo, con lo que trajo el
Excel de usuarios ([`EXCEL_IMPORT_USUARIOS.md`](EXCEL_IMPORT_USUARIOS.md)). Reemplaza al
`/sign-up` del responsable y a Equipo › Crear usuario, que no podía crear en otra org. Las
contraseñas las arma el Roadmap (`nombre.apellido`); el producto no las guarda en ningún otro
lado que auth.

```json
// { "action": "create_org_with_users", "organization_name": "Fincas Ribera", "website": "fincasribera.es",
//   "users": [ { "first_name": "Marta", "last_name": "Gil", "email": "marta@fincasribera.es",
//                "phone": "+34600111222", "role": "admin", "is_owner": true, "password": "marta.gil" }, … ] } →
{ "organization": { "id": "6f1c…", "name": "Fincas Ribera", "slug": "fincas-ribera", "website": "https://fincasribera.es" },
  "users": [ { "id": "a1…", "email": "marta@fincasribera.es" } ] }
```

- **Todo o nada.** Valida a todos antes de crear nada: nombre y apellido, email, teléfono válido
  (se guarda en E.164), `role` `admin` o `agent`, contraseña de 6 o más, **un `is_owner` y solo
  uno, y `admin`**, sin emails ni teléfonos repetidos → `bad_request`. Un email que ya tiene
  cuenta en Propelia → `conflict` (409) con la lista. Si una cuenta falla a mitad de camino, se
  borran las creadas y la org → `upstream_error`.
- La org nace con su slug (con sufijo corto si está tomado) y sus seeds de siempre (embudos,
  canales, facturación `provider`: **sin plan hasta que paguen el link del paso 2**). Máximo 50
  personas (`too_many_rows`).
- Las cuentas quedan con el email confirmado y sin términos aceptados: los aceptan al entrar.
- **`website` es opcional** (28/10/2026): la web que el cliente cargó en la página de alta. Se
  normaliza como en Ajustes › Marca (`normalizeWebsite`: sin esquema va `https://`, solo http(s),
  con un punto en el dominio); una que no vale → `bad_request` antes de crear nada. Se guarda en
  `organization_settings.website` **después** de las cuentas y no deshace nada si falla: la
  respuesta trae `website: null` y el Roadmap avisa que se cargue a mano.

### `add_users_to_org`

Desde el 5/11/2026: el paso 1 cuando el cliente **ya tenía org en Propelia** («Usar una que ya
existe» en Importar). Suma el equipo a esa org con el mismo criterio que `import_properties`: lo
que falta se crea y lo que ya está se saltea **sin tocarlo**.

```json
// { "action": "add_users_to_org", "org_id": "6f1c…", "dry_run": true,
//   "users": [ …mismo formato que create_org_with_users… ] } →
{ "organization": { "id": "6f1c…", "name": "Fincas Ribera", "slug": "fincas-ribera" },
  "results": [
    { "email": "marta@fincasribera.es", "status": "skipped_existing", "user_id": "a1…" },
    { "email": "pablo@fincasribera.es", "status": "created", "user_id": "b2…" },
    { "email": "ana@otra.es", "status": "failed", "error": "ya tiene cuenta en otra organización de Propelia" }
  ] }
```

- Por persona: ya es de esa org → `skipped_existing` (ni contraseña, ni nombre, ni rol); cuenta en
  otra org o borrada → `failed`; sin cuenta → se crea (`created`) con la contraseña que manda el
  Roadmap.
- **No es todo o nada**: lo creado queda aunque otra falle, y repetir la llamada saltea lo creado.
- Misma validación del equipo que `create_org_with_users` **salvo el responsable**: la org ya
  tiene sus admins. La org tiene que existir (`not_found`).
- **`dry_run: true`** no crea nada: lo que se crearía vuelve `new`. Es la vista previa de Importar.
- Del lado del Roadmap, `client_onboarding_importar_equipo` guarda a los salteados con
  `existing_account` (no reciben mail de accesos) y rechaza una org ya atada a otro lead
  (`crm_onboarding_org_de_otro_lead`).

### `get_organization`

```json
// { "action": "get_organization", "org_id": "6f1c…" } →
{ "organization": {
    "id": "6f1c…", "name": "Fincas Ribera", "slug": "fincas-ribera", "is_demo": false,
    "agents": [
      { "id": "a1…", "name": "Marta Gil", "email": "marta@fincasribera.es", "role": "admin",
        "slug": "marta", "inbound_address": "leads.fincas-ribera.marta@<dominio de inbound>" }
    ],
    "org_inbound_address": "leads.fincas-ribera@<dominio de inbound>",
    "properties_count": 79
} }
```

`inbound_address` es la dirección a la que Idealista reenvía los leads de ese agente (paso 3);
`null` si el agente no tiene `slug`. `properties_count` sirve para ver el import reflejado.

Desde el 28/10/2026 cada agente trae además `first_sign_in_at` y `last_sign_in_at` (null = todavía
no entró): el primero es `users.terms_accepted_at` (los términos se aceptan al entrar la primera
vez) o, si falta, el último; el último es `last_sign_in_at` de auth (Admin API, uno por agente).
/clientes los muestra en la columna «Entró» de las cuentas creadas. Un `roadmap-bridge` anterior no
los manda y el front no dice nada.

Desde el 29/10/2026 cada agente trae `calendar_connected` (alguna fila `active` en
`calendar_connections`, de cualquier proveedor) y la org, `setup`: lo obligatorio de Ajustes ›
Organización y marca, que es lo que la guía del producto pide para dar el paso por hecho.

```json
"setup": { "name": true, "website": true, "logo": false, "colors": true, "done": false }
```

/clientes lo muestra en la columna «Calendario» y en el resumen debajo de las cuentas creadas. Sin
esos campos (un `roadmap-bridge` anterior) no se dibujan.

Desde el 29/10/2026 cada agente trae `tour_groups`: por grupo de tutoriales que tenga prendido,
cuántos recorridos le tocan por su rol, cuántos tiene prendidos y cuántos terminó (la última vuelta
`completed` o `already_done`; cortarlo a mitad no cuenta). Sin nada prendido, `{}`.

```json
"tour_groups": { "leads": { "total": 6, "activated": 6, "done": 2 } }
```

### `activate_tour_group`

Prende un grupo de tutoriales (los define `supabase/functions/_shared/tourGroups.ts` del producto;
hoy sólo `leads`, el «Tutorial de leads») a todo el equipo de la org. A cada uno le tocan los
recorridos de su rol: «Avisos a los leads» (`configure-lead-notifications`) sólo a admin y
superadmin. Van con el trigger `guide` de `user_tour_activations`: en Propelia aparecen como un
checklist al lado de «Primeros pasos», y cada renglón queda hecho cuando el usuario termina su
recorrido. Repetirlo no pisa nada: lo ya prendido queda como estaba (hecho o no) y a un tour que
soporte había prendido por la campanita sólo se le suma `guide`. Sirve para sumar a alguien que
entró al equipo después.

```json
// { "action": "activate_tour_group", "org_id": "6f1c…", "group_id": "leads" } →
{ "group_id": "leads", "activated": 11,
  "users": [ { "id": "a1…", "name": "Marta Gil", "role": "admin", "total": 6, "activated": 6, "done": 0 } ] }
```

`activated` cuenta las filas que esta llamada prendió. **Desde el 31/10/2026 (pedido, a construir en el
producto)** también trae `demo: { properties_created, leads_created }`. Para que haya algo que mostrar
en los recorridos, se le crea un lead comprador de ejemplo a cada usuario sin leads, armado a partir
de un inmueble de la org para que el matching le encuentre cruces. Y a la org, un inmueble de ejemplo
si no tiene ninguno. Los dos van marcados como ejemplo: no cuentan, no avisan a nadie y
`deactivate_tour_group` los borra. /clientes lo dice en el aviso (`textoDeEjemplos`). Un
`roadmap-bridge` anterior no lo trae y no pasa nada. Errores: `bad_request` (grupo desconocido u
`org_id` inválido), `not_found` (org). Hace falta la migración `20261029210026_tour_guide_trigger`
del producto (sin ella el trigger `guide` no pasa el `check`). /clientes lo llama al tildar «Activar
el tutorial de cómo funciona el sistema de leads» o con su botón.

### `deactivate_tour_group`

Lo contrario (31/10/2026): saca el grupo del checklist de todo el equipo de la org. A cada fila de
`user_tour_activations` de los tours del grupo le quita el trigger `guide`; si no le queda ningún
otro (`bell`, `page`), borra la fila. **No toca `user_tour_runs`**: lo que cada uno terminó sigue
terminado si después se vuelve a activar. Un tour que soporte había prendido por la campanita sigue
prendido por la campanita.

```json
// { "action": "deactivate_tour_group", "org_id": "6f1c…", "group_id": "leads" } →
{ "group_id": "leads", "deactivated": 11 }
```

`deactivated` cuenta las filas a las que esta llamada les sacó `guide` (0 si no había nada
prendido). Mismos errores que `activate_tour_group`. /clientes lo llama con «Desactivar tutoriales»,
que aparece al lado de «Activar de nuevo» con la tarea tildada, y destilda la tarea. Sin la acción
en el `roadmap-bridge` del producto, contesta `bad_request` («Acción desconocida») y la tarea queda
como estaba.

### `reset_tour_group_progress`

Desmarca lo hecho sin apagar nada (31/10/2026, por pedido): el grupo sigue prendido, pero cada
renglón vuelve a quedar sin hacer para todo el equipo de la org. Para cada usuario y tour del grupo
cuya última vuelta terminó bien (`completed` o `already_done`), inserta en `user_tour_runs` una
vuelta con `outcome = 'reset'`, que no cuenta como hecha. También pone en null el `completed_at`
de la activación, para que el tour vuelva a estar pendiente. **El historial no se borra**: las
vueltas de antes siguen ahí para las métricas.

```json
// { "action": "reset_tour_group_progress", "org_id": "6f1c…", "group_id": "leads" } →
{ "group_id": "leads", "reset": 4 }
```

`reset` cuenta los renglones que estaban hechos y se desmarcaron. Mismos errores que
`activate_tour_group`. /clientes lo llama con «Desmarcar lo hecho», al lado de «Desactivar
tutoriales» con la tarea tildada; la tarea no cambia. Necesita la migración del producto que suma
`'reset'` al `check` de `user_tour_runs.outcome`. Sin la acción contesta «Acción desconocida».

### `import_template`

Las columnas del Excel de la cartera. El Roadmap arma la plantilla `.xlsx` con esto (cabecera +
fila de ejemplo); así las columnas tienen una sola fuente, del lado del producto.

```json
{ "columns": [
  { "key": "idealista_code", "header": "Código anuncio Idealista", "example": "108765432" },
  { "key": "property_type", "header": "Tipo", "example": "Piso" }
] }
```

Hoy son 16: las 14 de la propiedad y, al final, «Agente captador» y «Agente comercializador»
(opcionales; detalle en [`EXCEL_IMPORT_PROPIEDADES.md`](EXCEL_IMPORT_PROPIEDADES.md)).

### `check_properties`

Valida el Excel **sin escribir nada** ni llamar a Google. Para mostrar la vista previa con
errores y avisos por fila antes de importar.

El Roadmap lee el `.xlsx` (sólo la primera hoja) y manda las celdas crudas: la primera fila es
la cabecera. Las fechas van como string ISO. **No** se interpreta nada en el front: los números a
la española, "Sí/No", tipos y operaciones los parsea el producto.

```json
// { "action": "check_properties", "org_id": "6f1c…",
//   "sheet": [["Código anuncio Idealista","Tipo", …], ["108765432","Piso", …], …] } →
{ "ok": true,
  "rows": [
    { "row_number": 2, "valid": true, "errors": [], "warnings": [],
      "existing_property_id": null,
      "summary": { "property_type": "Piso", "address": "Carrer de Manso 58, Barcelona", "operation": "sale", "price": 250000 } },
    { "row_number": 3, "valid": false, "errors": ["Falta el precio de venta"], "warnings": [],
      "existing_property_id": null, "summary": { … } }
] }
// o, si el archivo entero no sirve (200 igual: es un resultado, no una falla):
{ "ok": false, "error": "Faltan columnas: Baños. Descargá la plantilla y usá esos nombres." }
```

`summary.operation` es `sale`, `rent` o `sale_rent`; `summary.price` el de venta si hay, si no el
de alquiler.

Los agentes se buscan entre las cuentas de la org (email o nombre): uno que no es de ahí es un
error de la fila (`"Agente captador: \"x\" no es nadie de la organización"`).

`existing_property_id` ≠ null: esa fila ya está en la org (mismo código de Idealista) y se va a
saltear. Máximo **2000 filas** (`too_many_rows`).

**Fotos** (2/11/2026): con «Importar fotos» tildado el Roadmap manda además `photos`, la hoja
«Fotos» entera (cabecera `Código anuncio Idealista`, `Orden`, `URL`, `Etiqueta`; detalle en
[`EXCEL_IMPORT_PROPIEDADES.md`](EXCEL_IMPORT_PROPIEDADES.md)), y la respuesta suma:

```json
"photos": { "ok": true, "new": 985, "existing": 1, "invalid": 0,
  "rows": [ { "row_number": 2, "idealista_code": "111883889", "status": "existing", "errors": [] }, … ] }
// o { "ok": false, "error": "A la hoja «Fotos» le faltan columnas: URL" }
```

`status`: `new` (se va a importar), `existing` (la propiedad ya tiene esa foto) o `invalid`. Una
foto entra si su código es de una fila válida de la hoja de propiedades o de una propiedad que ya
está en la org. Sin `photos` la respuesta no trae la clave. Máximo **10000 fotos**.

### `import_properties`

Crea las propiedades en la org: completa cada dirección con Google y las guarda con
`superadmin_import_properties`. Se llama **en lotes de hasta 50 filas** para poder mostrar
progreso y para que un error no tire todo: el front parte las filas válidas de `check_properties`
y llama una vez por lote, en orden.

```json
// { "action": "import_properties", "org_id": "6f1c…",
//   "header": ["Código anuncio Idealista","Tipo", …],
//   "rows": [ { "row_number": 2, "cells": ["108765432","Piso", …] }, … ] } →
{ "results": [
  { "row_number": 2, "status": "created", "property_id": "p1…", "linked_leads": 0 },
  { "row_number": 5, "status": "skipped_existing", "property_id": "p0…" },
  { "row_number": 9, "status": "invalid", "errors": ["El código postal no es válido"] }
] }
```

Los agentes resueltos van como `captured_by` / `commercialized_by` y el RPC los escribe si son
de la org (migración `superadmin_import_properties_agentes` del producto; antes los ignoraba).

Cada lote es todo o nada del lado de la base: si la respuesta es un error, ninguna fila de ese
lote quedó creada y se puede reintentar. Más de 50 filas → `too_many_rows`.

### `import_photos`

Baja cada foto de su URL (la del CDN de Idealista, firmada y con vencimiento) y la sube a
`property-media` de la propiedad, con su fila en `property_images`. Se llama **después** de
`import_properties`, en lotes de hasta **20 filas** de la hoja «Fotos» (las `new` de
`check_properties`), con la cabecera de esa hoja:

```json
// { "action": "import_photos", "org_id": "6f1c…",
//   "header": ["Código anuncio Idealista","Orden","URL","Etiqueta"],
//   "rows": [ { "row_number": 2, "cells": ["111883889","1","https://img4.idealista.com/…","Terraza"] }, … ] } →
{ "results": [
  { "row_number": 2, "status": "created", "property_id": "p1…" },
  { "row_number": 3, "status": "skipped_existing", "property_id": "p1…" },
  { "row_number": 4, "status": "failed", "property_id": "p1…", "errors": ["Idealista no la deja bajar (¿venció el enlace del Excel?)"] },
  { "row_number": 5, "status": "invalid", "errors": ["La propiedad 555 no está en Propelia"] }
] }
```

- **Cada foto va sola**: una que no se puede bajar es `failed` y el resto sigue.
- **Qué foto es cuál**: la URL **sin** la firma (`?Expires=…&Signature=…` cambia en cada
  exportación). De ahí sale el nombre fijo del archivo (`<org>/<propiedad>/photos/xl-<hash>.<ext>`,
  `photoFileName` en `_shared/propertyImport/photos.ts`), y es lo que dice que ya estaba. Sin
  migración. Una que ya estaba no se toca: ni el orden ni la etiqueta.
- **Lugar en la galería**: `position` = las fotos que subió un agente + `Orden` − 1. La de orden
  1 es portada solo si la propiedad no tenía portada. La `Etiqueta` se traduce al código de
  Idealista y va a `label`, la clasificación que muestra la grilla («Salón» → `living`;
  `photoLabelCode`). «Plano» queda sin clasificar. El texto tal cual va además a `alt_text`.
- Más de 20 filas → `too_many_rows`.

### `create_test_leads`

Leads de prueba en la org (26/11/2026, por pedido): el set que se cargó a mano en Inmuga Homes
(`supabase/test-seeds/leads/inmuga-homes.json` del producto), armado contra los pisos **activos**
que la org ya tiene, así que se puede correr apenas importada la cartera o cuando sea:

- **6 compradores «Test Matching»**. Cada uno toma un piso de la cartera (repartidos de barato a
  caro) y lleva la búsqueda que cruza con él cerca del **100, 90, 80, 65 y 50 %**; el sexto no
  cruza con nada (presupuesto debajo del filtro). La búsqueda se elige con el motor de verdad
  (`composeMatch` + `passesFilters` y las `scoring_rules` de la base, `roadmap-bridge/testLeads.ts`):
  presupuesto, dormitorios, baños y m², **sin zonas** (las filas sin calle no se geocodifican) y
  **sin notas** (con notas corre la etapa de IA, que gasta y no puntúa).
- **3 consultas «Test Consulta»** atadas a un piso (`lead_properties`), por Idealista o Fotocasa.
- **3 vendedores** con su inmueble inactivo (fuera del matching), a precios de la org.
- Las tareas del archivo (1 a 4 por lead, «Asesorar cliente» ya hecha), con fechas desde hoy en
  España, y una nota a mano «[TEST] …» en cada lead.

Se reparten en ronda entre los admin y agentes de la org. **Sin marca de prueba** (por pedido):
se reconocen por el nombre, los teléfonos `+346000001xx`, los emails `@propelia-test.es` y la
nota. Cuentan como leads reales. **Repetirlo no duplica**: un teléfono que ya tiene su lead vivo
vuelve `skipped_existing`. Un lead que falla no corta los demás. Al terminar corre el matching de
cada comprador y devuelve el porcentaje **real** con su piso (si falla, queda en la cola).

```json
// { "action": "create_test_leads", "org_id": "6f1c…" } →
{ "created": 12, "skipped_existing": 0, "failed": 0,
  "leads": [
    { "key": "lucia-matching", "kind": "matching", "lead_type": "BUYER", "name": "Lucía Test Matching",
      "assigned_to": { "id": "u1", "name": "Marta Gil" }, "status": "created", "lead_id": "…", "error": null,
      "tasks": 2, "expected": { "property_label": "Calle Mayor 3, Madrid", "score": 100 },
      "matches": 7, "anchor_score": 100 }
  ] }
```

`matches` es null en vendedores o si el matching quedó en la cola. Por la RPC `roadmap_create_test_lead`
del producto (migración `20261126125938_roadmap_create_test_lead`): crea un lead entero en una
transacción por las RPC del alta manual, haciéndose pasar por el agente (`agent_bot_act_as`).
`409 no_team` sin admin ni agentes; `409 no_properties` sin pisos activos con precio.

### `simulated_inbound_scenarios`

```json
{ "scenarios": [
  { "id": "dip-visita", "label": "Diputació 142 · pide visita (sólo teléfono)", "ad_code": "112086123" },
  { "id": "dip-info", "label": "…", "ad_code": "…" }
] }
```

`ad_code` es el código de anuncio de Idealista del mail: el lead se vincula solo si en la org
demo hay una propiedad con ese código.

### `send_simulated_inbound`

Manda un mail de Idealista simulado (Resend, de verdad) a la dirección de inbound: recorre el
mismo camino que un lead real. **Sólo la org demo** (`propelia-demo`); en otra → `not_demo_org`,
porque el lead quedaría como real en la cartera del cliente.

```json
// { "action": "send_simulated_inbound", "org_id": "…", "user_slug": "marta", "scenario_id": "dip-visita" } →
{ "email_id": "re_…", "to": "leads.propelia-demo.marta@<dominio>" }
```

`user_slug: null` manda a la dirección de la org.

### `list_payment_plans`

Planes que se pueden cobrar con un link: los públicos y, con `org_id`, el individual de esa org.

```json
// { "action": "list_payment_plans", "org_id": "6f1c…" } →
{ "plans": [
  { "id": "9b2e…", "code": "pro_founder_monthly", "name": "Pro", "amount_cents": 19900, "currency": "eur", "individual": false }
] }
```

Sin `org_id`, sólo los públicos. Se sacan los archivados y los vencidos. Los importes son
**con IVA** (lo que paga el cliente).

### `create_payment_link`

El mismo link de `/facturacion-admin` › Links de pago (`docs/billing/PAYMENT_LINKS.md` del
producto): checkout de Lemon Squeezy que se paga sin login y vence a los 7 días. Con `org_id` la
suscripción se vincula sola al pagar.

```json
// { "action": "create_payment_link", "plan_id": "9b2e…", "org_id": "6f1c…",
//   "amount_cents": null, "customer_email": "marta@fincasribera.es", "note": "Onboarding Fincas Ribera" } →
{ "link": { "id": "l1…", "url": "https://…", "status": "open", "expires_at": "2026-11-02T10:00:00Z",
            "plan_id": "9b2e…", "amount_cents": 19900 } }
```

`amount_cents: null` = el importe del plan. El link queda a nombre del **superadmin de Propelia
con el mismo email** que quien lo pide en el Roadmap; si no hay, `forbidden`. Los errores de
negocio del producto vuelven con su `message` tal cual: plan inexistente o de otra org →
`not_found`; org `exempt`, org con suscripción viva, importe inválido → `bad_request` (409 o 400).

### `list_payment_links`

Para la tarea «Confirmar que pagó».

```json
// { "action": "list_payment_links", "org_id": "6f1c…" } →
{ "links": [ { "id": "l1…", "url": "https://…", "status": "linked", "plan_id": "9b2e…", "amount_cents": 19900,
               "expires_at": "…", "created_at": "…", "paid_at": "…" } ] }
```

Sólo los links generados **con** esa org. Uno de venta en vivo (sin org) aparece recién cuando
se vincula desde Facturación admin.

`status` es el de `billing_payment_links` del producto: `open` (sin pagar), `paid` (pagado, sin
vincular a una org) o `linked` (pagado y vinculado). Un `open` con `expires_at` pasado ya no se
puede pagar.

## La vuelta: el avance que ve el cliente (`onboarding-progreso`)

Desde el 6/11/2026 el puente también va al revés. La página `/onboarding` de crm.propelia.es (solo
para los admins de la org, logueados) muestra los siete hitos del onboarding y la tabla de su equipo.
Su edge `onboarding-progress` (producto) saca la org del usuario y le pregunta a la edge
`onboarding-progreso` de acá. La tabla del equipo la arma el producto con sus propios datos, los
mismos de `get_organization`.

```
POST https://itqwxnmuxuiiydsueazb.supabase.co/functions/v1/onboarding-progreso
x-bridge-secret: <el mismo secreto: PROPELIA_BRIDGE_SECRET acá, ROADMAP_BRIDGE_SECRET allá>
{ "organization_id": "<uuid>" }
```

```json
{ "onboarding": null }
{ "onboarding": { "empresa": "Fincas Ribera", "iniciado": "2026-11-01T10:00:00Z", "completado": null,
  "hitos": { "equipo": true, "google": false, "idealista": false, "portales": false,
             "ia": false, "migracion": false, "bot": false } } }
```

Errores: 401 `secreto_invalido`, 400 `org_invalida`, 500 con el mensaje de la base.

- **El alta se busca por la org**: el lead con `crm_leads.propelia_organization_id` = esa org (sin
  borrar, el más nuevo). Completada también se devuelve, con `completado`.
- **Los hitos** salen de `supabase/functions/_shared/hitosDeOnboarding.ts`: hecho por sus tareas del
  alta o tildado a mano en /clientes › «Lo que ve el cliente» (`hito.<id>` en
  `client_onboarding_tasks`, sin migración). IA, migración y bot son solo a mano.
- **`google` acá es solo el tilde a mano**: el producto lo da por hecho además cuando todo el equipo
  tiene `calendar_connected` (`calendarioListo`, misma regla en los dos lados).
- No salen tareas internas, nombres de quien lleva el alta ni comentarios: solo estos booleanos.

## Secretos (los configura quien deploya)

| Proyecto | Secreto | Para qué |
|---|---|---|
| Roadmap | `PROPELIA_BRIDGE_URL` | `https://gvkdyxhxsnpumxlhvhsm.supabase.co/functions/v1/roadmap-bridge` |
| Roadmap | `PROPELIA_BRIDGE_SECRET` | Se manda en `x-bridge-secret` |
| Propelia | `ROADMAP_BRIDGE_SECRET` | El mismo valor; `roadmap-bridge` rechaza cualquier otro |

`roadmap-bridge` va con `verify_jwt = false` (el Roadmap no tiene un JWT de Propelia); la puerta
es el secreto, comparado en tiempo constante. Sin `ROADMAP_BRIDGE_SECRET` no atiende a nadie.

`propelia-bridge` le pasa al producto el email del usuario del Roadmap que hizo el pedido
(`actor`), para que quede registrado quién importó o generó un link. Lo pone el puente: si el
navegador manda un `actor`, se descarta.

## Deploy

1. Propelia: `supabase db push` (migración `superadmin_import_properties_service_role`: el RPC
   del import acepta la service role), `supabase secrets set ROADMAP_BRIDGE_SECRET=…` y
   `supabase functions deploy roadmap-bridge`.
2. Roadmap: `supabase secrets set PROPELIA_BRIDGE_URL=… PROPELIA_BRIDGE_SECRET=…` (el mismo
   secreto) y `supabase functions deploy propelia-bridge`.
3. Probar: `list_organizations` desde la consola del Roadmap logueado como SUPERADMIN.
4. La vuelta (6/11/2026): `supabase functions deploy onboarding-progreso` acá (usa el
   `PROPELIA_BRIDGE_SECRET` que ya está) y `supabase functions deploy onboarding-progress` en el
   producto (usa `ROADMAP_BRIDGE_SECRET`). Sin secretos nuevos.
