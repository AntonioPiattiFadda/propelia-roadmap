-- Los tres avisos de demo prendidos por email (21/10/2026, por pedido): agendada, reprogramada y
-- cancelada. Es lo mismo que prenderlos en Ajustes → «Avisos a leads»; va acá para que quede
-- escrito. Si alguien ya los tocó a mano, gana lo de la pantalla: `on conflict do nothing`.
insert into public.lead_notification_preferences (event_type, channel, enabled)
values
  ('demo_scheduled', 'email', true),
  ('demo_rescheduled', 'email', true),
  ('demo_cancelled', 'email', true)
on conflict (event_type, channel) do nothing;
