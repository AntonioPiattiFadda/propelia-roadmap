# Setup para Antonio — conectar la nueva versión

Los cambios de código ya están en `main`. Falta **la parte de base de datos y cuentas**, que es tuya.
Son 4 pasos. Proyecto Supabase: `propelia` (`gvkdyxhxsnpumxlhvhsm`).

---

## 1) Correr el SQL

En el **SQL Editor** de Supabase, correr en este orden (los dos son idempotentes, se pueden re-correr):

1. `supabase/schema.sql` — solo si el proyecto es nuevo y no lo corriste antes.
2. `supabase/schema-v2.sql` — **este es el nuevo**. Agrega:
   - columnas `chat` y `subtareas` en `roadmap_tareas`,
   - la caja de Propelia (`roadmap_caja`),
   - las tablas de Captalia (`captalia_secciones`, `captalia_tareas`, `captalia_caja`),
   - el bucket `captalia-adjuntos`,
   - realtime de todo lo nuevo,
   - **RLS por membresía** (tabla `app_miembros` + función `es_miembro`).

> ⚠️ Ojo: `schema-v2.sql` cambia las policies de Propelia de "cualquiera autenticado" a "miembro de propelia".
> Apenas lo corras, **nadie ve nada hasta cargar `app_miembros` (paso 3)**. Hacé 1→3 casi seguido.

---

## 2) Crear las cuentas en Supabase Auth

En **Authentication → Users**, asegurate de que existan (email + password):

- Loro → `lorenzopiattifadda@gmail.com` (ya existe)
- Toni → tu email
- Diego → su email

---

## 3) Cargar los miembros (define quién ve qué)

Al final de `schema-v2.sql` hay un bloque comentado. Completá con los emails reales (en **minúscula**,
tal cual como quedaron en Auth) y corré:

```sql
insert into public.app_miembros (email, proyecto) values
  ('lorenzopiattifadda@gmail.com', 'propelia'),
  ('lorenzopiattifadda@gmail.com', 'captalia'),
  ('TU_EMAIL@ejemplo.com',         'propelia'),
  ('TU_EMAIL@ejemplo.com',         'captalia'),
  ('EMAIL_DE_DIEGO@ejemplo.com',   'captalia')
on conflict do nothing;
```

Regla: **Propelia = Loro + Toni** · **Captalia = Loro + Toni + Diego**. Diego NO va en propelia.

---

## 4) Completar los emails en el front (para el color del chat)

En cada HTML hay un objeto `usuarios` (email → nombre/color/proyectos). Sirve para pintar la
conversación según quién escribe y para mostrar el selector de proyecto. Emails en **minúscula**.

**`index.html`** (Propelia):
```js
usuarios: {
  'lorenzopiattifadda@gmail.com': { nombre:'Loro', color:'loro', proyectos:['propelia','captalia'] },
  'TU_EMAIL@ejemplo.com':         { nombre:'Toni', color:'toni', proyectos:['propelia','captalia'] },
  'EMAIL_DE_DIEGO@ejemplo.com':   { nombre:'Diego', color:'diego', proyectos:['captalia'] },
},
```

**`captalia.html`** (Captalia) — mismo objeto `usuarios` (podés copiar/pegar el de arriba).
Nota: en Captalia, Toni **solo visualiza** (no es responsable asignable), pero conviene dejarlo en
`usuarios` para que sus mensajes salgan en azul si escribe.

---

## Notas

- **Anon key**: la que está en `supabase-sync.js` es la `anon` pública (correcto que esté en el front; la RLS es la que protege).
- **Hosting**: es 100% estático (`index.html`, `captalia.html`, `app.js`, `app.css`, `order-math.js`, `supabase-sync.js`). Subir toda la carpeta a cualquier hosting estático. `index.html` = Propelia; `captalia.html` = Captalia.
- **No dupliques lógica en los HTML**: toda la app vive en `app.js`/`app.css`; cada HTML solo tiene su `APP_CONFIG`. Ver `CLAUDE.md`.
- Mientras `schema-v2.sql` no esté corrido, agregar tareas/chat/caja **falla** (las tablas/columnas no existen todavía).
