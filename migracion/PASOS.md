# Mudanza a un proyecto Supabase nuevo (otra cuenta)

Origen: `propelia` (`gvkdyxhxsnpumxlhvhsm`). **Queda activo**: la mudanza no lo toca nunca.
Destino: un proyecto nuevo en otra cuenta de Supabase. El MCP ve una cuenta por vez, así que
la extracción y la inyección van en sesiones distintas: **todo lo que la inyección necesita
está en este directorio**, no en la memoria de nadie.

Diseño completo: `docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md`
(sub-proyecto A: `users`, roadmap y esquema del CRM `crm_*`).

## Retomar en una sesión nueva (leer primero)

Todo lo de la mudanza vive en el repo. Una sesión que arranca en frío hace esto:

1. **Desde el 29/9/2026 todo está en `main`** y `main` apunta al proyecto nuevo. La rama
   `mudanza-base` se mergeó y se borró.
2. Leer, en orden: este archivo → `docs/superpowers/specs/2026-09-29-base-nueva-users-crm-design.md`
   (el diseño) → `docs/superpowers/plans/2026-09-29-base-nueva-users-crm.md` (lo implementado).
3. La revisión final de la rama y sus correcciones: ver «Revisión final», abajo.
4. Validar SQL sin base: `python3 -m venv /tmp/venv-sql && /tmp/venv-sql/bin/pip install -q pglast`
   y `/tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql migracion/04-reasignar-usuarios.sql`.
   Tests del front: `node scripts/test-equipo.cjs && node scripts/test-calcular-orden.cjs`.
5. Seguir «Inyección», abajo, paso por paso.

**Sobre el MCP**: la re-extracción (paso 0) necesita el proyecto VIEJO y todo lo demás el
NUEVO. Se puede tener los dos a la vez registrando dos servidores MCP de Supabase con nombres
distintos (por ejemplo `supabase-viejo` y `supabase-nuevo`, cada uno con el token de su
cuenta): así se re-extrae y se inyecta en la misma sesión y el tablero queda congelado
minutos y no horas. Si no, re-extraer con el MCP viejo ANTES de cambiarlo.

**Archivos que no están en git pero sí en disco** (ignorados a propósito):
- `migracion/02-datos-*.sql` — los datos (tienen la caja). Si faltan, se regeneran con la
  consulta de «Re-extraer» + `generar-datos.py`.
- `.superpowers/sdd/2026-09-29-base-nueva-users-crm/progress.md` — el registro de la
  implementación, con cada decisión tomada (`Ruling:`) y el resultado del dry run.

## Revisión final

Hecha el 29/9/2026 por un revisor independiente sobre toda la rama. Sin críticos.

**Corregido** (cada uno con su prueba):

| # | hallazgo | arreglo | prueba |
|---|---|---|---|
| 1 | un gasto nuevo se le cargaba también a un socio inactivo | `carga` nace con `elegibles(PERSONAS_CAJA)` | `scripts/test-equipo.cjs` |
| 2 | un aviso dirigido a un inactivo no le sonaba a nadie | `destinatariosActivos()` en `equipo.js` | `scripts/test-equipo.cjs` |
| 3 | la verificación del 04 no cubría todos los campos ni comparaba las chapas | `pg_temp.conteo()` cuenta todo, antes y después, en las dos direcciones, incluido `"visto":false` | ensayo en seco: versión rota → aborta (10 vs 0); versión real → verde (10 = 10) |
| 6 | re-correr el 04 en la misma conexión chocaba | `create or replace` | — |
| 7 | `crm_gestion_refresh()` quedaba llamable sin sesión por `/rpc` | `revoke execute` | comprobación del paso 1 de la inyección |
| 8 | borrar la cuenta en Auth borraba en cascada la fila de `users` | `on delete restrict` | comprobación del paso 1 de la inyección |
| 9 | un corte de red al refrescar el token tapaba el tablero con «Sin acceso» | si ya estabas adentro, se queda el equipo que había | revisión del código (no hay test de DOM) |

**Diferidos (menores)**: el chequeo de `users` en `faltantesDeEsquema()` nunca llega a
correr (sin la tabla nadie pasa de «Sin acceso»); el equipo no se recarga por realtime (un
alta o baja se ve al recargar); el orden de las personas pasó a ser alfabético (Antonio,
Lorenzo, Luis) y no el del viejo `personas`.

**Decisiones sobre lo que el revisor dejó abierto**: los chips de filtro no muestran a los
inactivos (lo pidió el diseño; si hace falta filtrar las tareas de alguien que se fue para
reasignarlas, se agrega); el front puede escribir `gestion_*` en `crm_leads` igual que en el
producto (la regla es de B, que es quien dibuja la pantalla).

## Estado

| | qué | cuándo |
|---|---|---|
| ✅ | Datos del roadmap extraídos (`02-datos-*`, 159 tareas · 3 caja · 8 notas) | 29/9/2026 17:28 UTC |
| ✅ | Esquema fuente del CRM del producto (`fuente-crm-producto.sql`) | 29/9/2026 |
| ✅ | `supabase/schema.sql` con `users` + `crm_*` | 29/9/2026, rama `mudanza-base` |
| ✅ | `04-reasignar-usuarios.sql` | 29/9/2026, rama `mudanza-base` |
| ✅ | Front del tablero leyendo `users` | 29/9/2026, rama `mudanza-base` |

## Inyección en curso (29/9/2026, cortada a mitad por límite de uso)

Proyecto nuevo: **`Propelia`, `itqwxnmuxuiiydsueazb`** (us-east-2). El tablero quedó
**congelado desde las 17:28 UTC** (confirmado): se usan los `02-datos-*` que ya están en disco,
no hace falta re-extraer.

| paso | estado |
|---|---|
| 1. `schema.sql` | ✅ migración `schema_inicial`; comprobación `false` · `r` · 4 · 2 |
| 2. datos | ✅ tareas 159 · caja 3 · notas 8, verificadas por huella contra el disco |
| 3. cuentas en Auth | ✅ Antonio y Lorenzo, desde el panel (Luis no se muda) |
| 4. filas en `users` | ✅ 2 filas, `SUPERADMIN`, las dos con `caja` |
| 5. prueba del CRM | ✅ `PRUEBA CRM OK`, sin residuos en `crm_*` |
| 6. `04-reasignar-usuarios.sql` | ✅ 0 claves viejas · chapas 10 = 10 · `pend`: Antonio 94, Lorenzo 62 |
| 7. adjuntos | ✅ 78/78, huella `nombre:tamaño` igual al origen (`32bc1825…`); las 53 rutas que guardan las tareas existen. Las otras 25 ya eran huérfanas en el origen |
| 8. deploy | ✅ `main` en `37904a7` apunta a `itqwxnmuxuiiydsueazb`; antes se trajo la versión de teléfono que `main` tenía y la rama no |
| 9. prueba de humo | ✅ online, 29/9/2026: todo anduvo |
| 10. proyecto viejo | intacto, es la vuelta atrás. Se limpia más adelante, a mano |

**Paso 7 sin service role** (29/9/2026): no se usó `03-copiar-storage.mjs`. Se copió con la
sesión de cada uno: un botón «Exportar archivos» de un solo uso en `main` (nunca commiteado,
ya borrado) bajó el bucket a una carpeta con un `manifest.json`, y «Importar archivos» en esta
rama lo subió a las mismas rutas. Los dos botones ya no existen: ninguno llegó a un commit.

**Paso 2 cerrado** (29/9/2026). Huellas globales de la base, iguales a las del disco
(`python3 migracion/verificar-huellas.py <tabla>`):

| tabla | filas | huella |
|---|---|---|
| `roadmap_tareas` | 159 | `66af7d6b71c533e15492778858be8866` |
| `roadmap_caja` | 3 | `3ab45468ce609b1e7debd208fb1a9ecb` |
| `roadmap_notas` | 8 | `8f6f09510f5257781491252eecf9f5f9` |

**Luis no se muda** (29/9/2026, decisión): ni cuenta, ni fila en `users`, ni baja con
`activo = false`. Estaba en `pend` de 5 tareas terminadas (T109, T29, T33, T36, T87), las
cinco compartidas con Toni: se lo sacó en la base nueva y `resp` quedó en Toni. Por eso las
huellas de arriba ya no coinciden con el disco en esas 5 filas. La mención de T124 es texto
libre de la explicación y quedó.

La huella `ac238b8a…` que figuraba antes como «esperada» no la reproduce el script actual y
está mal: la referencia es la que da el disco. Las 125 tareas cargadas antes se compararon
fila por fila y dieron idénticas (incluidos los lotes 3–5).

**Gotcha de los espacios duros**: el texto de las tareas tiene 111 `U+00A0`. Transcriptos por
el MCP se vuelven espacios comunes **sin ningún error**: 7 tareas del lote 2 quedaron casi
iguales (mismo largo en caracteres, un byte menos) y solo lo detectó la huella. Se borraron y
se recargaron en ASCII (` `). Desde entonces `generar-datos.py` escribe ASCII de fábrica.

**Aparte**: la tarea T47 tiene una contraseña en texto plano (la de `info@propelia.es`). Se
migra tal cual; conviene cambiarla y sacarla del tablero.

**El origen sigue vivo, así que los datos envejecen.** Lo que se toque en el tablero después
de las 17:28 UTC del 29/9 no está en `02-datos-*`. Antes de inyectar, re-extraer (abajo).

## Archivos

- `02-datos-01.sql` … `02-datos-07.sql` — datos del roadmap en lotes de ~30 KB (uno por
  llamada `execute_sql`). **En `.gitignore`**: tienen la caja.
- `generar-datos.py` — arma los `02-datos-*` desde el volcado del MCP, en ASCII puro.
  `--ascii` convierte los que ya están en disco.
- `verificar-huellas.py` — compara fila por fila la base contra los `02-datos-*` (md5 de
  `to_jsonb(fila)::text`).
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
   Comprobar (tienen que dar `false`, `r`, 4 y 2):
   ```sql
   select has_function_privilege('anon', 'public.crm_gestion_refresh(uuid)', 'execute'),
          (select confdeltype from pg_constraint where conname = 'users_id_fkey'),
          (select count(*) from crm_priorities), (select count(*) from crm_funnel_stages);
   ```
2. `execute_sql` con cada `02-datos-NN.sql`, en orden. Verificar 159 / 3 / 8.
3. **Panel → Authentication → Users**: crear las dos cuentas (email + contraseña, confirmadas).
4. Insertar sus filas en `users` (el `id` sale de `auth.users` por email, no se copia a mano):

   | email | nombre | iniciales | color | caja | hoy en los datos |
   |---|---|---|---|---|---|
   | `lorenzopiattifadda@gmail.com` | Lorenzo | LO | `#6E6BA0` | sí | `Loro` |
   | `antonio.piattifadda@gmail.com` | Antonio | AN | `#4F7F79` | sí | `Toni` |

   ```sql
   insert into public.users (id, email, nombre, iniciales, color, caja)
   select a.id, a.email, v.nombre, v.iniciales, v.color, v.caja
   from (values ('lorenzopiattifadda@gmail.com', 'Lorenzo', 'LO', '#6E6BA0', true),
                ('antonio.piattifadda@gmail.com', 'Antonio', 'AN', '#4F7F79', true))
        v(email, nombre, iniciales, color, caja)
   join auth.users a on lower(a.email) = v.email
   on conflict (id) do nothing;
   select count(*) from public.users;   -- esperado 2
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
9. Prueba de humo: login de los dos, responsables bien, una captura, un chat, un gasto.
10. El proyecto viejo, intacto. Se limpia más adelante, a mano.
