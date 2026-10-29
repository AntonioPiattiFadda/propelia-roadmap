-- El WhatsApp `tutorial_leads` cambia su cierre (29/10/2026, por pedido): la tarea «Activar el
-- tutorial de cómo funciona el sistema de leads» ahora prende en Propelia el «Tutorial de leads»
-- (un recorrido guiado por cada punto del mensaje, `activate_tour_group` de `roadmap-bridge`), así
-- que ya no es «os lo iré enseñando»: está ahí al entrar.
-- Sólo si el texto sigue siendo el de 20261029124428: uno editado a mano no se pisa.
update public.onboarding_message_templates
   set body = replace(
     body,
     'Os lo iré enseñando también con tutoriales dentro de Propelia. ¡Cualquier duda, por aquí!',
     'Al entrar a Propelia vais a ver «Tutorial de leads», arriba a la derecha: cada punto es un recorrido guiado de un minuto por la pantalla de verdad. ¡Cualquier duda, por aquí!'
   )
 where id = 'tutorial_leads'
   and body like '%Os lo iré enseñando también con tutoriales dentro de Propelia. ¡Cualquier duda, por aquí!';
