# Back-end del tablero

**Desde el 29/9/2026 la base se arma con un solo archivo: `supabase/schema.sql`.** Reemplazó
a la cadena `schema.sql` → v2 → v3 → v4 → v5 → v7 → v8, que contaba cómo se llegó al esquema
de hoy sobre el proyecto `propelia` (compartido con el CRM). Ese historial está en git; este
archivo guarda solo lo que sigue valiendo.

El tablero se muda a un proyecto Supabase propio: el paso a paso está en
`migracion/PASOS.md`.

---

## Montar la base en un proyecto nuevo

1. SQL Editor → correr `supabase/schema.sql` entero. Es idempotente.
2. Crear las cuentas y sus filas en `users` (abajo).
3. En `supabase-sync.js`, `SUPABASE_URL` y `SUPABASE_ANON_KEY` del proyecto.

Si falta algo del esquema, el tablero lo avisa en el triangulito de la barra lateral
(`RoadmapSync.faltantesDeEsquema()`).

---

## Dar de alta a alguien: cuenta + fila en `users`

**a) La cuenta**: `Authentication → Users → Add user`, con email y contraseña, confirmada
(el front entra con `signInWithPassword`).

**b) La fila en `users`**, por el MCP (el front no puede escribir esa tabla):

```sql
insert into public.users (id, email, nombre, iniciales, color, caja)
select id, email, 'Nombre', 'NO', '#5A7E8C', false
from auth.users where email = '<email en minúscula>';
```

Sin la fila, la persona entra y ve «Sin acceso». **Dar de baja** es
`update users set activo = false where email = …` — nunca un `delete`: las tareas y el CRM
guardan su uuid.

| Persona | Cuenta | Caja |
|---|---|---|
| Lorenzo | `lorenzopiattifadda@gmail.com` | sí |
| Antonio | `antonio.piattifadda@gmail.com` | sí |
| Luis | `rubioluis13@gmail.com` | no |

---

## Adjuntos

Bucket privado `roadmap-adjuntos`. Se lee con URLs firmadas que el front pide al pintar
(`RoadmapSync.urlFirmada()`); leer, subir y borrar lo cubren las policies de
`storage.objects`, gateadas por `es_usuario()`.

Algunos archivos viejos pueden traer `b: 'captalia-adjuntos'` en su JSON. Ese bucket ya no
existe en el esquema: al 29/9/2026 estaba vacío y ninguna tarea lo referenciaba.

---

## Lo que quedó afuera del tablero

Cosas que existían antes y no tienen pantalla. Ninguna rompe nada.

- **Explicación, chat y archivos por subtarea.** La subtarea es una línea: tilde, título y a
  quién. Lo que ya estaba cargado sigue en `subtareas` y no se pisa.
- **Los campos `img` y `com`** de las tareas. Quedan guardados.
- **`tipo` y `loom`**: sin pantalla que los edite. `tipo` se reusa para la fecha de entrada al
  tablero (ver CLAUDE.md).
- **Las temáticas** (`roadmap_secciones`, `sec_id`): ya no están en el esquema.
