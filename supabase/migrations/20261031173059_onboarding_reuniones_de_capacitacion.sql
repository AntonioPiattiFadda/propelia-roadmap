-- El paso 2 del onboarding suma dos reuniones de capacitación por Google Meet, arriba del tutorial
-- de leads (31/10/2026, por pedido): una con el equipo y otra con el dueño. Cada una lleva su
-- WhatsApp para proponerla y se agenda como una reunión del CRM del lead (va al Google de quien la
-- agenda). El link de Meet todavía no se genera: por ahora sale de Google a mano.
--
-- `onboarding_task` dice de qué tarea del alta es la reunión (la clave `<paso>.<tarea>` de
-- `client_onboarding_tasks`): /clientes la busca entre las reuniones del lead y, pasada la hora,
-- pregunta si se hizo. Null en todas las demás.
alter table public.crm_meetings
  add column if not exists onboarding_task text;

-- `on conflict do nothing`: se respeta si ya está.
insert into public.onboarding_message_templates (id, body) values
(
  'reunion_equipo',
  E'{nombre}, para que {inmobiliaria} le saque todo el partido a Propelia nos gustaría hacer una capacitación online con todo el equipo 🎓\n\n'
  'Es por Google Meet y dura unos 45 minutos: os conocemos, vemos cómo trabajáis y qué necesitáis, y os enseñamos cómo Propelia os ayuda en el día a día.\n\n'
  '¿Qué día y hora os viene bien? En cuanto lo cerremos os llega la invitación con el enlace.'
),
(
  'reunion_dueno',
  E'{nombre}, además de la capacitación con el equipo, me gustaría tener una reunión contigo 🤝\n\n'
  'Es por Google Meet, unos 30 minutos: te enseño cómo ver desde Propelia el trabajo de tu equipo (qué leads atiende cada uno, qué tiene pendiente, qué visitas agenda) y vemos juntos cómo lo vais a usar para sacarle el máximo.\n\n'
  '¿Cuándo te viene bien? Te mando la invitación con el enlace.'
)
on conflict (id) do nothing;
