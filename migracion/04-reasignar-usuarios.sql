-- ============================================================
-- Reasigna 'Loro' / 'Toni' / 'Luis' a los uuids de `users` en los datos del roadmap.
-- Corre DESPUÉS de cargar los datos (02-datos-*) y las filas de `users`.
--
-- Una sola transacción: o se reasigna todo o nada. Idempotente: solo toca valores que
-- todavía son una de las tres claves. El mapeo sale de `users` por email; si falta alguien,
-- aborta antes de tocar una fila.
--
-- OJO con `expl`: se reemplaza como TEXTO y no pasando por jsonb. `jsonb::text` reescribe
-- el formato ("visto": false, con espacio) y avisosSinVer() busca el literal "visto":false
-- sin parsear: la chapa roja se apagaría en todas las tareas. Por eso la verificación cuenta
-- ese literal antes y después, y aborta si cambia.
--
-- Las tablas del roadmap van SIN `public.` a propósito: en la base real se resuelven a
-- public, y así el ensayo en seco puede correr este mismo archivo contra copias temporales
-- (pg_temp se busca primero). Ver «Ensayo en seco» al final.
-- ============================================================
begin;

create temp table _mapa on commit drop as
select v.clave, u.id::text as uid
from (values ('Loro', 'lorenzopiattifadda@gmail.com'),
             ('Toni', 'antonio.piattifadda@gmail.com'),
             ('Luis', 'rubioluis13@gmail.com')) v(clave, email)
left join public.users u on lower(u.email) = v.email;

do $$ begin
  if exists (select 1 from _mapa where uid is null) then
    raise exception 'Faltan en users: %. No se tocó nada.',
      (select string_agg(clave, ', ') from _mapa where uid is null);
  end if;
end $$;

-- `create or replace`: si el MCP reusa la conexión, correrlo otra vez no choca con las
-- funciones de la vez anterior.

-- Un valor suelto: si es una clave, su uuid; si no, tal cual.
create or replace function pg_temp.m(x text) returns text language sql stable as $$
  select coalesce((select uid from _mapa where clave = x), x)
$$;

-- Un array de strings (pend, carga, para).
create or replace function pg_temp.m_arr(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'string' then to_jsonb(pg_temp.m(e #>> '{}')) else e end
                               order by o)
              from jsonb_array_elements(a) with ordinality t(e, o)), '[]'::jsonb) end
$$;

-- Un campo string de un objeto, solo si existe y es string.
create or replace function pg_temp.m_campo(obj jsonb, campo text) returns jsonb language sql stable as $$
  select case when jsonb_typeof(obj -> campo) = 'string'
              then jsonb_set(obj, array[campo], to_jsonb(pg_temp.m(obj ->> campo)))
              else obj end
$$;

-- chat: [{autor, ts, texto}]
create or replace function pg_temp.m_chat(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(pg_temp.m_campo(m, 'autor') order by o)
              from jsonb_array_elements(a) with ordinality t(m, o)), '[]'::jsonb) end
$$;

-- subtareas: [{resp, chat:[…], …}]
create or replace function pg_temp.m_sub(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(
                case when jsonb_typeof(s -> 'chat') = 'array'
                     then jsonb_set(pg_temp.m_campo(s, 'resp'), '{chat}', pg_temp.m_chat(s -> 'chat'))
                     else pg_temp.m_campo(s, 'resp') end
                order by o)
              from jsonb_array_elements(a) with ordinality t(s, o)), '[]'::jsonb) end
$$;

-- expl en bloques: solo `"autor":"X"`, `"vistoPor":"X"` y los elementos de `"para":[…]`. En
-- JSON válido esas formas no aparecen dentro de un texto (ahí las comillas van escapadas:
-- \"autor\":), así que un «Toni» escrito en una explicación no se toca.
create or replace function pg_temp.m_expl(expl text) returns text language plpgsql stable as $$
declare
  r record;
  antes text;
begin
  if expl is null or left(expl, 8) <> '<!--b-->' then return expl; end if;
  for r in select clave, uid from _mapa loop
    expl := regexp_replace(expl, '"(autor|vistoPor)":"' || r.clave || '"', '"\1":"' || r.uid || '"', 'g');
    -- Cada pasada cambia una aparición por array; se repite hasta que no quede ninguna.
    loop
      antes := expl;
      expl := regexp_replace(expl, '("para":\[[^\]]*)"' || r.clave || '"', '\1"' || r.uid || '"', 'g');
      exit when expl = antes;
    end loop;
  end loop;
  return expl;
end;
$$;

-- Cuántas veces aparece cada persona en cada campo. Es la misma cuenta antes y después, así
-- que un campo que el update se olvide aparece como diferencia. `visto:false` no es una
-- persona: es la cantidad de chapas rojas, que tiene que quedar igual.
create or replace function pg_temp.conteo() returns table(c text, x text, n numeric) language sql stable as $$
  select 'pend', e, count(*) from roadmap_tareas, jsonb_array_elements_text(pend) e group by 2
  union all
  select 'resp', resp, count(*) from roadmap_tareas where resp <> '' group by 2
  union all
  select 'chat', m ->> 'autor', count(*) from roadmap_tareas, jsonb_array_elements(chat) m
   where jsonb_typeof(m -> 'autor') = 'string' group by 2
  union all
  select 'sub.resp', s ->> 'resp', count(*) from roadmap_tareas, jsonb_array_elements(subtareas) s
   where coalesce(s ->> 'resp', '') <> '' group by 2
  union all
  select 'sub.chat', m ->> 'autor', count(*) from roadmap_tareas, jsonb_array_elements(subtareas) s,
         jsonb_array_elements(case when jsonb_typeof(s -> 'chat') = 'array' then s -> 'chat' else '[]'::jsonb end) m
   where jsonb_typeof(m -> 'autor') = 'string' group by 2
  union all
  select 'expl.' || r[1], r[2], count(*) from roadmap_tareas,
         regexp_matches(expl, '"(autor|vistoPor)":"([^"]*)"', 'g') r
   where left(expl, 8) = '<!--b-->' group by 1, 2
  union all
  select 'expl.para', trim(both '"' from e), count(*) from roadmap_tareas,
         regexp_matches(expl, '"para":\[([^\]]*)\]', 'g') r, unnest(string_to_array(r[1], ',')) e
   where left(expl, 8) = '<!--b-->' and r[1] <> '' group by 2
  union all
  select 'caja.cuenta', cuenta, count(*) from roadmap_caja where cuenta <> '' group by 2
  union all
  select 'caja.carga', e, count(*) from roadmap_caja, jsonb_array_elements_text(carga) e group by 2
  union all
  select 'visto:false', '', count(*) from roadmap_tareas where expl like '%"visto":false%'
$$;

-- La cuenta de antes, ya traducida: donde decía 'Toni' tiene que pasar a decir su uuid.
-- El `sum` junta la clave con su uuid si una corrida anterior quedó a medias.
create temp table _antes on commit drop as
select a.c, coalesce(m.uid, a.x) as x, sum(a.n) as n
from pg_temp.conteo() a left join _mapa m on m.clave = a.x
group by 1, 2;

update roadmap_tareas set
  pend      = pg_temp.m_arr(pend),
  resp      = pg_temp.m(resp),
  chat      = pg_temp.m_chat(chat),
  subtareas = pg_temp.m_sub(subtareas),
  expl      = pg_temp.m_expl(expl);

update roadmap_caja set
  cuenta = pg_temp.m(cuenta),
  carga  = pg_temp.m_arr(carga);

-- ---------- Verificación: si algo no cierra, se deshace todo ----------
do $$
declare quedan numeric; distintos int; detalle text;
begin
  select coalesce(sum(n), 0) into quedan from pg_temp.conteo() where x in ('Loro', 'Toni', 'Luis');
  if quedan > 0 then raise exception 'Quedaron % claves viejas sin reasignar', quedan; end if;

  -- En las dos direcciones: lo que estaba y no está, y lo que apareció y no estaba.
  select count(*), string_agg(format('%s %s: %s', c, x, n), '; ') into distintos, detalle from (
    (select c, x, n from _antes except select c, x, n from pg_temp.conteo())
    union all
    (select c, x, n from pg_temp.conteo() except select c, x, n from _antes)
  ) d;
  if distintos > 0 then
    raise exception 'Los conteos no coinciden (incluye la cantidad de "visto":false): %', detalle;
  end if;

  raise notice 'OK. Chapas de avisos sin ver: %',
    (select n from _antes where c = 'visto:false');
end $$;

commit;

-- ============================================================
-- Ensayo en seco (contra cualquier base con roadmap_tareas y roadmap_caja, sin escribir nada):
-- correr, en UNA sola llamada, este archivo con tres cambios —
--   1. antes de `begin;`:
--        create temp table roadmap_tareas as select * from public.roadmap_tareas;
--        create temp table roadmap_caja   as select * from public.roadmap_caja;
--   2. en lugar del `create temp table _mapa … left join public.users …`:
--        create temp table _mapa on commit drop as
--        select * from (values ('Loro','u-lo'),('Toni','u-to'),('Luis','u-lu')) v(clave, uid);
--   3. `commit;` → `rollback;`
-- Los updates caen sobre las copias temporales (pg_temp se busca antes que public).
-- ============================================================
