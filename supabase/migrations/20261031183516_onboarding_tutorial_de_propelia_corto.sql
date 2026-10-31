-- El WhatsApp `tutorial_leads` se acorta (31/10/2026, por pedido): cada punto ya lo enseña su
-- recorrido guiado dentro de Propelia (grupo `leads` de `roadmap-bridge`, que suma Inmuebles,
-- Vendedores, Equipo y el cierre en Capacitación), así que el mensaje sólo avisa que está prendido
-- y lista los recorridos. No nombra el rótulo de la pastilla («Tutorial de leads» hoy, «Tutorial de
-- Propelia» con el cambio del producto): dice dónde está.
-- Sólo si el texto sigue siendo el de 20261029211937: uno editado a mano no se pisa.
update public.onboarding_message_templates
   set body = E'{nombre}, ya tenéis activado el tutorial de Propelia para todo el equipo de {inmobiliaria} 🎓\n\n'
     'Al entrar lo veis arriba a la derecha, al lado de «Primeros pasos». Son recorridos guiados de un minuto por la pantalla de verdad:\n\n'
     '📥 Cómo llegan los leads\n'
     '⚙️ Idealista\n'
     '✅ Pendientes\n'
     '📅 Agendar una visita\n'
     '🔗 Matching\n'
     '🏠 Inmuebles y su ficha\n'
     '🤝 Vendedores\n'
     '🔔 Avisos a los leads (administradores)\n'
     '👥 Equipo y visibilidad (administradores)\n\n'
     'Y cuando queráis repasar algo, en Capacitación tenéis un vídeo corto de cada parte. ¡Cualquier duda, por aquí!'
 where id = 'tutorial_leads'
   and body like E'{nombre}, os dejo cómo funciona el sistema de leads de Propelia%'
   and body like '%Al entrar a Propelia vais a ver «Tutorial de leads», arriba a la derecha: cada punto es un recorrido guiado de un minuto por la pantalla de verdad. ¡Cualquier duda, por aquí!';
