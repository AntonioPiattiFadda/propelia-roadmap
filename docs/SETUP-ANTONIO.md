# Setup para Antonio — conectar la nueva versión

Los cambios de código ya están en `main`. Falta **la parte de base de datos y cuentas**, que es tuya.
Son 4 pasos. Proyecto Supabase: `propelia` (`gvkdyxhxsnpumxlhvhsm`).

---

## Qué se hizo (resumen del refactor)

- **Código compartido**: `app.js` / `app.css` / `supabase-sync.js` pasan a ser config-driven vía
  `window.APP_CONFIG` (título, tablas, bucket, canal, responsables, usuarios, textos de caja).
  Cada HTML solo define su `APP_CONFIG` — nada de lógica ni estilos duplicados.
- **Página nueva `captalia.html`**: mismo código que Propelia, config distinta. Miembros:
  Loro, Toni (solo visualiza, no es responsable asignable) y Diego (solo tiene acceso a Captalia).
- **Selector de proyecto en la cabecera**: muestra solo los proyectos a los que pertenece el usuario
  logueado, según `usuarios` + membresía real en `app_miembros`.
- **Conversación por tarea**: reemplaza el viejo "último comentario" (`com`) por un chat
  (`chat: [{autor, ts, texto}]`) con líneas coloreadas por autor. El campo `com` viejo se conserva
  en la base pero ya no se usa en la UI.
- **Subtareas**: cada tarea puede tener subtareas propias (`subtareas: [{id, titulo, resp, estado,
  expl, chat, files}]`), cada una con su responsable, estado, explicación, conversación y archivos.
- **Caja por proyecto**: pestaña nueva con libro de movimientos (fecha, concepto, categoría, monto,
  cuenta, notas), saldo total e ingresos/egresos separados. Tabla `roadmap_caja` en Propelia,
  `captalia_caja` en Captalia.
- **Panel de tarea simplificado**: se sacaron módulo, fecha y enlace a Drive; la explicación quedó
  más grande. También se sacaron la "cancha", el filtro "ocultar hechas" y el recuadro de respaldo.
- **Borrar tarea** ahora desde el menú de la fila (antes no existía esa acción); el responsable
  queda resaltado en la fila.
- **Base de datos** (`supabase/schema-v2.sql`, idempotente): agrega las columnas `chat`/`subtareas`,
  las cajas, las tablas de Captalia, realtime de todo lo nuevo, y **RLS por membresía**
  (`app_miembros` + `es_miembro(proyecto)`) — esto es lo que falta activar en los pasos de abajo.

Detalle completo del patrón de guardado optimista (indicador global, reintentos, revert) en
`CLAUDE.md`, sección "Loading states & optimistic updates".

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

En `toniylorete.html` y `captalia.html` hay un objeto `usuarios` (email → nombre/color). Sirve
**solo** para pintar la conversación según quién escribe — no da acceso a nada. El acceso real
(qué proyectos ve cada cuenta, a dónde la redirige el router) sale de `app_miembros` en Supabase
(paso 3). Emails en **minúscula**.

```js
usuarios: {
  'lorenzopiattifadda@gmail.com':  { nombre:'Loro', color:'loro' },
  'TU_EMAIL@ejemplo.com':          { nombre:'Toni', color:'toni' },
  'EMAIL_DE_DIEGO@ejemplo.com':    { nombre:'Diego', color:'diego' },
},
```

Mismo objeto en las dos páginas (podés copiar/pegar). Nota: en Captalia, Toni **solo visualiza**
(no es responsable asignable), pero conviene dejarlo en `usuarios` para que sus mensajes salgan
en azul si escribe.

---

## Notas

- **Anon key**: la que está en `supabase-sync.js` es la `anon` pública (correcto que esté en el front; la RLS es la que protege).
- **Hosting**: es 100% estático (`index.html`, `toniylorete.html`, `captalia.html`, `app.js`, `app.css`, `order-math.js`, `supabase-sync.js`). Subir toda la carpeta a cualquier hosting estático. `index.html` es el router (raíz del sitio, sin tablero): redirige a `toniylorete.html` o `captalia.html` según membresía.
- **No dupliques lógica en los HTML**: toda la app vive en `app.js`/`app.css`; cada HTML solo tiene su `APP_CONFIG`. Ver `CLAUDE.md`.
- Mientras `schema-v2.sql` no esté corrido, agregar tareas/chat/caja **falla** (las tablas/columnas no existen todavía).
