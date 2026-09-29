# Mudanza a un proyecto Supabase nuevo (otra cuenta)

Origen: `propelia` (`gvkdyxhxsnpumxlhvhsm`). **Queda activo**: la mudanza no lo toca nunca.
Destino: un proyecto nuevo en otra cuenta de Supabase. El MCP ve una cuenta por vez, así que
la extracción y la inyección van en sesiones distintas: **todo lo que la inyección necesita
está en este directorio**, no en la memoria de nadie.

Diseño completo: `docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md`
(sub-proyecto A: `users`, roadmap y esquema del CRM `crm_*`).

## Estado

| | qué | cuándo |
|---|---|---|
| ✅ | Datos del roadmap extraídos (`02-datos-*`, 159 tareas · 3 caja · 8 notas) | 29/9/2026 17:28 UTC |
| ✅ | Esquema fuente del CRM del producto (`fuente-crm-producto.sql`) | 29/9/2026 |
| ⏳ | `supabase/schema.sql` con `users` + `crm_*` | pendiente de la spec |
| ⏳ | `04-reasignar-usuarios.sql` | pendiente de la spec |
| ⏳ | Front del tablero leyendo `users` | pendiente de la spec |

**El origen sigue vivo, así que los datos envejecen.** Lo que se toque en el tablero después
de las 17:28 UTC del 29/9 no está en `02-datos-*`. Antes de inyectar, re-extraer (abajo).

## Archivos

- `02-datos-01.sql` … `02-datos-07.sql` — datos del roadmap en lotes de ~30 KB (uno por
  llamada `execute_sql`). **En `.gitignore`**: tienen la caja.
- `generar-datos.py` — arma los `02-datos-*` desde el volcado del MCP.
- `fuente-crm-producto.sql` — REFERENCIA, no se corre. Tablas, triggers y funciones del CRM
  del producto, para escribir las `crm_*`.
- `03-copiar-storage.mjs` — copia los 78 adjuntos (el MCP no mueve binarios).

## Re-extraer los datos (MCP apuntando a `propelia`)

```sql
select jsonb_build_object(
 'extraido', now(),
 'roadmap_tareas', (select jsonb_agg(to_jsonb(t) - 'sec_id' order by orden) from roadmap_tareas t),
 'roadmap_caja',   (select jsonb_agg(to_jsonb(c) order by orden) from roadmap_caja c),
 'roadmap_notas',  (select jsonb_agg(to_jsonb(n) order by id) from roadmap_notas n)
)::text as dump;
```

El resultado no entra en la respuesta y el MCP lo guarda en un `.txt`; esa ruta va a
`python3 migracion/generar-datos.py <ruta>`. **No se transcribe a mano.**

## Inyección (MCP apuntando al proyecto nuevo)

0. Congelar el tablero: avisar a Lorenzo y Luis. Re-extraer justo antes (arriba).
1. `apply_migration` con `supabase/schema.sql`: `users`, roadmap y `crm_*` con sus siembras.
2. `execute_sql` con cada `02-datos-NN.sql`, en orden. Verificar 159 / 3 / 8.
3. **Panel → Authentication → Users**: crear las tres cuentas (email + contraseña, confirmadas).
4. Insertar sus filas en `users` (el `id` sale de `auth.users` por email, no se copia a mano):

   | email | nombre | iniciales | color | caja | hoy en los datos |
   |---|---|---|---|---|---|
   | `lorenzopiattifadda@gmail.com` | Lorenzo | LO | `#6E6BA0` | sí | `Loro` |
   | `antonio.piattifadda@gmail.com` | Antonio | AN | `#4F7F79` | sí | `Toni` |
   | `rubioluis13@gmail.com` | Luis | LU | `#A87A3F` | no | `Luis` |

5. `04-reasignar-usuarios.sql` y su verificación: cero `Loro`/`Toni`/`Luis` en los datos.
6. `03-copiar-storage.mjs` desde PowerShell (ver su cabecera) → `78/78 copiados`.
7. Deploy del front: URL + key nuevas en `supabase-sync.js` **y** el cambio a `users`, en el
   mismo commit (cada mitad sola no anda).
8. Prueba de humo: login de los tres, responsables bien, una captura, un chat, un gasto, un
   `crm_leads` creado por el MCP.
9. El proyecto viejo, intacto. Se limpia más adelante, a mano.
