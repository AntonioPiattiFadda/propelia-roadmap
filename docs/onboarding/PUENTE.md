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

**Estado:** a construir por la sesión de `propelia-frontend`. Hasta que esté deployado, el front
mockea `invoke` con las respuestas de ejemplo de este archivo.

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
| `forbidden` | 403 | No es SUPERADMIN activo del Roadmap |
| `bad_request` | 400 | Falta un parámetro o tiene mal formato; `message` dice cuál |
| `not_found` | 404 | La org, el plan o el escenario no existen |
| `not_demo_org` | 409 | Simular un lead fuera de la org demo |
| `too_many_rows` | 413 | Más filas que el máximo de la acción |
| `upstream_error` | 502 | El producto o un tercero (Google, Lemon Squeezy, Resend) falló; `message` lo explica |

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
// o, si el archivo entero no sirve:
{ "ok": false, "error": "Falta la columna «Baños»." }
```

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
  { "id": "dip-visita", "label": "Diputació 142 · pide visita (sólo teléfono)" },
  { "id": "dip-info", "label": "…" }
] }
```

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
  { "id": "pro", "name": "Pro", "amount_cents": 19900, "interval": "month", "individual": false }
] }
```

Los importes son **con IVA** (lo que paga el cliente).

### `create_payment_link`

El mismo link de `/facturacion-admin` › Links de pago (`docs/billing/PAYMENT_LINKS.md` del
producto): checkout de Lemon Squeezy que se paga sin login y vence a los 7 días. Con `org_id` la
suscripción se vincula sola al pagar.

```json
// { "action": "create_payment_link", "plan_id": "pro", "org_id": "6f1c…",
//   "amount_cents": null, "customer_email": "marta@fincasribera.es", "note": "Onboarding Fincas Ribera" } →
{ "link": { "id": "l1…", "url": "https://…", "status": "open", "expires_at": "2026-11-02T10:00:00Z",
            "plan_id": "pro", "amount_cents": 19900 } }
```

`amount_cents: null` = el importe del plan. Los errores de negocio del producto (org `exempt`,
org con suscripción viva) vuelven como `bad_request` con el `message` del producto.

### `list_payment_links`

Para la tarea «Confirmar que pagó».

```json
// { "action": "list_payment_links", "org_id": "6f1c…" } →
{ "links": [ { "id": "l1…", "url": "https://…", "status": "linked", "created_at": "…", "paid_at": "…" } ] }
```

`status` es el de `billing_payment_links` del producto: `open` (sin pagar), `paid` (pagado, sin
vincular a una org) o `linked` (pagado y vinculado). Un `open` con `expires_at` pasado ya no se
puede pagar.

## Secretos (los configura quien deploya)

| Proyecto | Secreto | Para qué |
|---|---|---|
| Roadmap | `PROPELIA_BRIDGE_URL` | URL de `roadmap-bridge` en el producto |
| Roadmap | `PROPELIA_BRIDGE_SECRET` | Se manda en `x-bridge-secret` |
| Propelia | `ROADMAP_BRIDGE_SECRET` | El mismo valor; `roadmap-bridge` rechaza cualquier otro |

`propelia-bridge` le pasa al producto el email del usuario del Roadmap que hizo el pedido
(`actor`), para que quede registrado quién importó o generó un link.
