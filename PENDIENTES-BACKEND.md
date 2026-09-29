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
2. Crear las cuentas y darles acceso (abajo).
3. En `supabase-sync.js`, `SUPABASE_URL` y `SUPABASE_ANON_KEY` del proyecto.

Si falta algo del esquema, el tablero lo avisa en el triangulito de la barra lateral
(`RoadmapSync.faltantesDeEsquema()`).

---

## Dar acceso: cuenta + `app_miembros` + `personas` del HTML

Son **tres** cosas separadas. Es el error más fácil de cometer acá.

**a) La cuenta**: `Authentication → Users → Add user`, con email y contraseña, confirmada
(el front entra con `signInWithPassword`).

**b) El acceso** lo da una fila en `app_miembros`. Sin ella la persona entra, ve «Sin acceso»
y no lee un solo dato: la RLS se lo impide en la base, no en la pantalla.

```sql
insert into public.app_miembros (email, proyecto)
values ('<email real, en minúscula>', 'propelia')
on conflict do nothing;
```

`proyecto` es `'propelia'` aunque la base ya no sea la de Propelia: es la clave que miran
`es_miembro()` y `APP_CONFIG.proyecto`, no el nombre del proyecto de Supabase.

**c) El nombre y el color** salen del bloque `personas` de `index.html`, cruzando por email.
Con el email en blanco la persona entra igual, pero el tablero no sabe quién es: no firma sus
mensajes ni le marca lo suyo.

| Persona | Cuenta | Caja |
|---|---|---|
| Lorenzo | `lorenzopiattifadda@gmail.com` | sí |
| Antonio | `antonio.piattifadda@gmail.com` | sí |
| Luis | `rubioluis13@gmail.com` | no |

> **No cambiar el campo `id` de `personas`.** `'Loro'` y `'Toni'` son los valores escritos
> dentro de las tareas (responsable, autor de cada mensaje, `carga` de la caja). Si se tocan,
> esas asignaciones quedan huérfanas.

---

## Adjuntos

Bucket privado `roadmap-adjuntos`. Se lee con URLs firmadas que el front pide al pintar
(`RoadmapSync.urlFirmada()`); leer, subir y borrar lo cubren las policies de
`storage.objects`, gateadas por `es_miembro('propelia')`.

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
