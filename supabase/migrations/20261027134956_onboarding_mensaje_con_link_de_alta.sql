-- El primer WhatsApp del onboarding lleva el enlace a la página pública de alta (27/10/2026, por
-- pedido): el equipo ya no llega por Excel. {link} lo completa /clientes con
-- crm.propelia.es/alta/<public_token> (`linkDeAlta`). Solo pisa el texto de la migración
-- 20261027122509: si alguien ya lo editó a mano, se respeta.
update public.onboarding_message_templates
set body = E'¡Hola {nombre}! Soy {soporte}, de Propelia 👋\n\n'
  '¡Bienvenidos al primer paso del onboarding! Gracias por sumaros a Propelia: nos hace mucha ilusión empezar este viaje con {inmobiliaria} 🚀\n\n'
  'A partir de ahora voy a ser vuestra persona de contacto y os voy a ir guiando paso a paso por aquí, para que en pocos días estéis trabajando vuestros leads desde Propelia.\n\n'
  'Para arrancar, entrad a este enlace (son 5 minutos):\n'
  '{link}\n\n'
  'Os va a preguntar dos cosas: el nombre de la inmobiliaria y quiénes del equipo van a usar Propelia, marcando al responsable (la persona que implementa Propelia en la inmobiliaria y con quien hablaré siempre).\n\n'
  'En cuanto lo enviéis, creo todos los accesos y os paso a cada uno su usuario y contraseña. ¡Cualquier duda, escribidme por aquí!',
  updated_at = now()
where id = 'contacto_inicial'
  and body = E'¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋\n\n'
  'Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.\n\n'
  'Para crear vuestra cuenta necesito dos cosas:\n\n'
  '1. Que me confirméis el nombre de la inmobiliaria tal como queréis que aparezca en Propelia (¿lo dejamos como «{inmobiliaria}»?).\n\n'
  '2. Que rellenéis el Excel que os adjunto con las personas del equipo que van a usar Propelia: una fila por persona, con nombre, apellido, email, teléfono (con +34) y rol (Administrador o Agente).\n\n'
  'En la columna Responsable, marcad con «Sí» a una sola persona (con rol Administrador): quien se va a encargar de implementar Propelia en la inmobiliaria. Será con quien hable siempre, así la comunicación va por una sola vía y es más ágil.\n\n'
  'Cuando me lo devolváis, os creo todos los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.';
