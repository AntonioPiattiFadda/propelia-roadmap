-- El WhatsApp del primer contacto del onboarding: pide confirmar el nombre que ya tenemos
-- de la inmobiliaria y explica qué es el responsable. Solo pisa el texto de fábrica: si
-- alguien ya lo editó a mano, se respeta.
update public.onboarding_message_templates
set body = E'¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋\n\n'
  'Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.\n\n'
  'Para crear vuestra cuenta necesito dos cosas:\n\n'
  '1. Que me confirméis el nombre de la inmobiliaria tal como queréis que aparezca en Propelia (¿lo dejamos como «{inmobiliaria}»?).\n\n'
  '2. Que rellenéis el Excel que os adjunto con las personas del equipo que van a usar Propelia: una fila por persona, con nombre, apellido, email, teléfono (con +34) y rol (Administrador o Agente).\n\n'
  'En la columna Responsable, marcad con «Sí» a una sola persona (con rol Administrador): quien se va a encargar de implementar Propelia en la inmobiliaria. Será con quien hable siempre, así la comunicación va por una sola vía y es más ágil.\n\n'
  'Cuando me lo devolváis, os creo todos los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.',
  updated_at = now()
where id = 'contacto_inicial'
  and body = E'¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋\n\n'
  'Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.\n\n'
  'Para crear vuestra cuenta necesito dos cosas:\n\n'
  '1. El nombre de la inmobiliaria tal como queréis que aparezca en Propelia.\n\n'
  '2. Que rellenéis el Excel que os adjunto con las personas del equipo que van a usar Propelia: una fila por persona, con nombre, apellido, email, teléfono (con +34) y rol (Administrador o Agente). Marcad con «Sí» en la columna Responsable a quien va a llevar la cuenta.\n\n'
  'Cuando me lo devolváis, os creo todos los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.';
