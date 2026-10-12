-- Etapas del funnel del SDR y motivos de descarte con fecha para volver a llamar (10/10/2026).
--
-- 1. `crm_leads.recontact_at`: el día desde el que hay que volver a llamar a un lead descartado
--    que «no califica, pero podría calificar». Lo escribe el front al descartar (hoy + 6 meses) y
--    lo borra al volver a una etapa del funnel. `discard_reason` pasa a guardar el código del
--    motivo (`MOTIVOS_DE_DESCARTE` del front); los descartes viejos quedan con su texto libre.
-- 2. Las etapas, en este orden: Intentando contactar (la NEW de siempre, renombrada: el alta y el
--    importador la buscan por `value`), Intentando contactar decisor, Contactado (decisor o
--    influencer), Seguimiento (le interesa más adelante), Meeting booked y, después de todas las
--    del funnel, Descartado. Las nuevas copian prioridad y tolerancia de NEW y se insertan solo si
--    no hay ya una viva con ese nombre. No se borra ninguna etapa que ya exista: van después de
--    las cinco, en el orden que tenían.

alter table public.crm_leads add column if not exists recontact_at date;

update public.crm_funnel_stages
   set label = 'Intentando contactar', updated_at = now()
 where value = 'NEW' and deleted_at is null and label <> 'Intentando contactar';

insert into public.crm_funnel_stages
  (label, value, position, priority_id, management_tolerance_hours,
   is_out_of_funnel, allow_delete, allow_reorder, allow_rename)
select v.label, 'CUSTOM', v.position, n.priority_id, n.management_tolerance_hours,
       false, true, true, true
  from (values
    ('Intentando contactar decisor',         2),
    ('Contactado (decisor o influencer)',    3),
    ('Seguimiento (le interesa más adelante)', 4),
    ('Meeting booked',                       5)
  ) v(label, position)
  left join lateral (
    select s.priority_id, s.management_tolerance_hours
      from public.crm_funnel_stages s
     where s.value = 'NEW' and s.deleted_at is null
     order by s.position
     limit 1
  ) n on true
 where not exists (
   select 1 from public.crm_funnel_stages s where s.deleted_at is null and s.label = v.label
 )
 order by v.position;

-- Las cinco primero, después el resto del funnel como estaba y al final las de afuera (Descartado).
with orden as (
  select s.id,
         row_number() over (
           order by s.is_out_of_funnel,
                    case
                      when s.value = 'NEW' then 1
                      when s.label = 'Intentando contactar decisor' then 2
                      when s.label = 'Contactado (decisor o influencer)' then 3
                      when s.label = 'Seguimiento (le interesa más adelante)' then 4
                      when s.label = 'Meeting booked' then 5
                      else 100
                    end,
                    s.position, s.created_at
         ) as pos
    from public.crm_funnel_stages s
   where s.deleted_at is null
)
update public.crm_funnel_stages s
   set position = o.pos, updated_at = now()
  from orden o
 where o.id = s.id and s.position is distinct from o.pos;
