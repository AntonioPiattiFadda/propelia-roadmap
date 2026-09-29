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
-- sin parsear: la chapa roja se apagaría en todas las tareas.
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

-- Un valor suelto: si es una clave, su uuid; si no, tal cual.
create function pg_temp.m(x text) returns text language sql stable as $$
  select coalesce((select uid from _mapa where clave = x), x)
$$;

-- Un array de strings (pend, carga, para).
create function pg_temp.m_arr(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(case when jsonb_typeof(e) = 'string' then to_jsonb(pg_temp.m(e #>> '{}')) else e end
                               order by o)
              from jsonb_array_elements(a) with ordinality t(e, o)), '[]'::jsonb) end
$$;

-- Un campo string de un objeto, solo si existe y es string.
create function pg_temp.m_campo(obj jsonb, campo text) returns jsonb language sql stable as $$
  select case when jsonb_typeof(obj -> campo) = 'string'
              then jsonb_set(obj, array[campo], to_jsonb(pg_temp.m(obj ->> campo)))
              else obj end
$$;

-- chat: [{autor, ts, texto}]
create function pg_temp.m_chat(a jsonb) returns jsonb language sql stable as $$
  select case when jsonb_typeof(a) <> 'array' then a else
    coalesce((select jsonb_agg(pg_temp.m_campo(m, 'autor') order by o)
              from jsonb_array_elements(a) with ordinality t(m, o)), '[]'::jsonb) end
$$;

-- subtareas: [{resp, chat:[…], …}]
create function pg_temp.m_sub(a jsonb) returns jsonb language sql stable as $$
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
create function pg_temp.m_expl(expl text) returns text language plpgsql stable as $$
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

-- Conteo de antes, para comparar al final.
create temp table _antes on commit drop as
select 'pend' c, e x, count(*) n from public.roadmap_tareas, jsonb_array_elements_text(pend) e group by 1, 2
union all select 'resp', resp, count(*) from public.roadmap_tareas where resp <> '' group by 1, 2
union all select 'chat', m ->> 'autor', count(*) from public.roadmap_tareas, jsonb_array_elements(chat) m group by 1, 2
union all select 'cuenta', cuenta, count(*) from public.roadmap_caja where cuenta <> '' group by 1, 2;

update public.roadmap_tareas set
  pend      = pg_temp.m_arr(pend),
  resp      = pg_temp.m(resp),
  chat      = pg_temp.m_chat(chat),
  subtareas = pg_temp.m_sub(subtareas),
  expl      = pg_temp.m_expl(expl);

update public.roadmap_caja set
  cuenta = pg_temp.m(cuenta),
  carga  = pg_temp.m_arr(carga);

-- ---------- Verificación: si algo no cierra, se deshace todo ----------
do $$
declare quedan int; distintos int;
begin
  select count(*) into quedan from (
    select 1 from public.roadmap_tareas, jsonb_array_elements_text(pend) e where e in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas where resp in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas, jsonb_array_elements(chat) m where m ->> 'autor' in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas, jsonb_array_elements(subtareas) s where s ->> 'resp' in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_tareas where expl ~ '"(autor|vistoPor)":"(Loro|Toni|Luis)"'
    union all select 1 from public.roadmap_tareas where expl ~ '"para":\[[^\]]*"(Loro|Toni|Luis)"'
    union all select 1 from public.roadmap_caja where cuenta in ('Loro','Toni','Luis')
    union all select 1 from public.roadmap_caja, jsonb_array_elements_text(carga) e where e in ('Loro','Toni','Luis')
  ) q;
  if quedan > 0 then raise exception 'Quedaron % claves viejas sin reasignar', quedan; end if;

  -- Mismas cuentas antes y después, traduciendo la clave al uuid. Los paréntesis del lado
  -- derecho no son decorativos: sin ellos `except` se aplicaría solo contra el primer select.
  select count(*) into distintos from (
    select c, coalesce(m.uid, a.x) x, n from _antes a left join _mapa m on m.clave = a.x
    except
    (select 'pend', e, count(*) from public.roadmap_tareas, jsonb_array_elements_text(pend) e group by 2
     union all select 'resp', resp, count(*) from public.roadmap_tareas where resp <> '' group by 2
     union all select 'chat', m ->> 'autor', count(*) from public.roadmap_tareas, jsonb_array_elements(chat) m group by 2
     union all select 'cuenta', cuenta, count(*) from public.roadmap_caja where cuenta <> '' group by 2)
  ) d;
  if distintos > 0 then raise exception 'Los conteos por persona no coinciden (% diferencias)', distintos; end if;

  -- La chapa roja lee el literal: tiene que seguir habiendo la misma cantidad.
  raise notice 'OK. Avisos sin ver (literal "visto":false): %',
    (select count(*) from public.roadmap_tareas where expl like '%"visto":false%');
end $$;

commit;
