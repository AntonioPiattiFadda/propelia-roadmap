-- Idealista y Fotocasa salieron de la guía de Propelia (29/10/2026, por pedido): el WhatsApp de los
-- accesos ya no los nombra. A los admins, organización y calendario; al resto, solo el calendario.
-- Solo cambia ese renglón: si alguien editó el texto a mano, no se pisa nada más.
update public.onboarding_message_templates
   set body = replace(body, 'y conectáis Idealista, Fotocasa y vuestro calendario;', 'y conectáis vuestro calendario;'),
       updated_at = now()
 where id = 'accesos_enviados'
   and body like '%y conectáis Idealista, Fotocasa y vuestro calendario;%';
