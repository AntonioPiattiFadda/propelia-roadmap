-- El paso 2 cambia una tarea (29/10/2026, por pedido): «Configurar la organización con ellos» sale
-- (la org la configuran solos con la guía de Propelia, ver 20261029115832) y entra «Enviar el
-- tutorial de cómo funciona el sistema de leads», con este WhatsApp. Los tutoriales guiados dentro
-- de Propelia (el highlight flow) vienen después; este mensaje es el repaso por escrito.
-- `configurar_organizacion` queda en la tabla sin uso. `on conflict do nothing`: se respeta si ya está.
insert into public.onboarding_message_templates (id, body) values
(
  'tutorial_leads',
  E'{nombre}, os dejo cómo funciona el sistema de leads de Propelia, para que {inmobiliaria} empiece a trabajarlos desde aquí 👇\n\n'
  '📥 Cómo llegan los leads: cada consulta de un portal entra sola en Propelia como un lead, con el inmueble por el que pregunta. También podéis cargarlos a mano.\n\n'
  '⚙️ Idealista: en vuestra cuenta de Idealista tenéis que poner, para cada agente, la dirección de email de Propelia que os paso. Así los mensajes de Idealista llegan a Propelia y se convierten en leads solos.\n\n'
  '✅ Pendientes: cada lead tiene su siguiente paso (llamar, responder, agendar). En Pendientes veis qué toca hoy y qué está vencido, para que no se os quede ninguno sin atender.\n\n'
  '🔔 Avisos a los leads: cuando agendáis, cambiáis o canceláis una visita, Propelia le avisa al lead por email con vuestra marca.\n\n'
  '📅 Agendar una visita: se agenda desde el propio lead: queda en vuestro calendario y al cliente le llega el aviso.\n\n'
  '🔗 Matching: Propelia cruza lo que busca cada lead con vuestra cartera y os propone los inmuebles que encajan. Las reglas (precio, zona, habitaciones…) salen de lo que pidió el lead.\n\n'
  'Os lo iré enseñando también con tutoriales dentro de Propelia. ¡Cualquier duda, por aquí!'
)
on conflict (id) do nothing;
