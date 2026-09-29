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
| ✅ | `supabase/schema.sql` con `users` + `crm_*` | 29/9/2026, rama `mudanza-base` |
| ✅ | `04-reasignar-usuarios.sql` | 29/9/2026, rama `mudanza-base` |
| ✅ | Front del tablero leyendo `users` | 29/9/2026, rama `mudanza-base` |

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

   ```sql
   insert into public.users (id, email, nombre, iniciales, color, caja)
   select a.id, a.email, v.nombre, v.iniciales, v.color, v.caja
   from (values ('lorenzopiattifadda@gmail.com', 'Lorenzo', 'LO', '#6E6BA0', true),
                ('antonio.piattifadda@gmail.com', 'Antonio', 'AN', '#4F7F79', true),
                ('rubioluis13@gmail.com',         'Luis',    'LU', '#A87A3F', false))
        v(email, nombre, iniciales, color, caja)
   join auth.users a on lower(a.email) = v.email
   on conflict (id) do nothing;
   select count(*) from public.users;   -- esperado 3
   ```

5. **Probar el CRM**. Un solo bloque que termina con una excepción A PROPÓSITO: eso deshace
   todo lo que insertó. Resultado bueno = el error dice `PRUEBA CRM OK`; cualquier otro error
   (un `assert` que falla) dice qué no anduvo. Corre por el MCP, sin sesión: `assigned_to` va
   explícito y `changed_by` queda en null.
   ```sql
   do $$
   declare
     v_user uuid := (select id from users order by email limit 1);
     v_otro uuid := (select id from users order by email desc limit 1);
     v_cli  uuid;
     v_lead uuid;
     r      record;
   begin
     insert into crm_clients (first_name, company_name) values ('Prueba', 'Inmo X') returning id into v_cli;
     insert into crm_leads (client_id, assigned_to, funnel_stage_id)
       values (v_cli, v_user, (select id from crm_funnel_stages where value = 'NEW')) returning id into v_lead;
     assert (select gestion_reference_at = created_at and not gestion_has_events from crm_leads where id = v_lead),
       'al nacer, la gestión cuenta desde created_at';

     update crm_leads set funnel_stage_id = (select id from crm_funnel_stages where value = 'DISCARDED') where id = v_lead;
     assert (select count(*) from crm_stage_history where lead_id = v_lead) = 2, 'dos filas de historial de etapa';

     update crm_leads set assigned_to = v_otro where id = v_lead;
     assert (select count(*) from crm_assignment_history where lead_id = v_lead) = (case when v_otro <> v_user then 1 else 0 end),
       'una fila de historial de asignación';

     insert into crm_management_events (lead_id, action, effective_at) values (v_lead, 'POSTPONED', now() + interval '3 days');
     select * into r from crm_leads where id = v_lead;
     assert r.gestion_postponed and r.gestion_has_events and r.gestion_reference_at > now() + interval '2 days',
       'la postergación manda la referencia a futuro';

     update crm_management_events set deleted_at = now() where lead_id = v_lead;
     select * into r from crm_leads where id = v_lead;
     assert not r.gestion_postponed and not r.gestion_has_events and r.gestion_reference_at = r.created_at,
       'borrado el evento, vuelve a created_at';

     raise exception 'PRUEBA CRM OK (se deshace todo)';
   end $$;
   ```
6. `04-reasignar-usuarios.sql`. Aborta solo si algo no cierra; al final avisa cuántas chapas
   de avisos sin ver quedaron (tiene que ser igual a antes).
7. `03-copiar-storage.mjs` desde PowerShell (ver su cabecera) → `78/78 copiados`.
8. Deploy del front: mergear la rama `mudanza-base` y poner URL + key nuevas en
   `supabase-sync.js`, en el mismo deploy (cada mitad sola no anda).
9. Prueba de humo: login de los tres, responsables bien, una captura, un chat, un gasto.
10. El proyecto viejo, intacto. Se limpia más adelante, a mano.
