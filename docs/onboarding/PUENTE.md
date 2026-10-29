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

### `import_template`

Las columnas del Excel de la cartera. El Roadmap arma la plantilla `.xlsx` con esto (cabecera +
fila de ejemplo); así las columnas tienen una sola fuente, del lado del producto.

```json
{ "columns": [
  { "key": "idealista_code", "header": "Código anuncio Idealista", "example": "108765432" },
  { "key": "property_type", "header": "Tipo", "example": "Piso" }
] }
```

Hoy son 14 (detalle en [`EXCEL_IMPORT_PROPIEDADES.md`](EXCEL_IMPORT_PROPIEDADES.md)).

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

`existing_property_id` ≠ null: esa fila ya está en la org (mismo código de Idealista) y se va a
saltear. Máximo **2000 filas** (`too_many_rows`).

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

Cada lote es todo o nada del lado de la base: si la respuesta es un error, ninguna fila de ese
lote quedó creada y se puede reintentar. Más de 50 filas → `too_many_rows`.

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
