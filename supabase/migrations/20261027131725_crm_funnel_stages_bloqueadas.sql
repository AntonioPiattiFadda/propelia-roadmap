-- Las etapas que ya existen quedan fijas (27/10/2026, por pedido): sin renombrar, sin reordenar y
-- sin borrar desde la configuración del funnel, como «Por contactar» y «Descartado». Gestión,
-- Tareas, Dashboard y Onboarding siguen editables, y las que se creen después nacen editables.
update public.crm_funnel_stages
   set allow_rename = false,
       allow_reorder = false,
       allow_delete = false
 where deleted_at is null;
