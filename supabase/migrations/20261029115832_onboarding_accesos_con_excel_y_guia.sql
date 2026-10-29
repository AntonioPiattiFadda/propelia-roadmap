-- El WhatsApp de los accesos suma dos cosas (29/10/2026, por pedido): el Excel de propiedades que
-- va adjunto (se baja del botón de la tarea en /clientes y se adjunta a mano: WhatsApp Web no lleva
-- archivos por enlace) y la guía de Propelia, el checklist que ve cada cuenta al entrar: a los
-- admins, configurar la organización y conectar calendario, Idealista y Fotocasa; al resto, solo el
-- calendario. (Idealista y Fotocasa salieron de la guía ese mismo día: 20261029120417.) Pisa el texto de 20261028115945 aunque se haya editado a mano.
insert into public.onboarding_message_templates (id, body) values
(
  'accesos_enviados',
  E'¡{nombre}, ya están listos los accesos de {inmobiliaria}! 🎉\n\n'
  'Acabo de enviar a cada persona del equipo un email desde info@propelia.es con su usuario y una contraseña temporal. Si alguien no lo encuentra, que revise la carpeta de spam o de promociones.\n\n'
  'La contraseña es temporal: la cambiaréis al terminar el onboarding, así que de momento no hace falta tocarla.\n\n'
  'Al entrar, Propelia os va a mostrar una guía paso a paso. Los administradores configuráis ahí la organización (nombre, web, logo y colores) y conectáis Idealista, Fotocasa y vuestro calendario; el resto del equipo solo tiene que conectar su calendario.\n\n'
  'Os adjunto también un Excel para cargar vuestras propiedades 📎 Rellenadlo con vuestra cartera y devolvédmelo por aquí: yo me encargo de subirlas.\n\n'
  'En cuanto hayáis entrado, decídmelo por aquí y seguimos con el siguiente paso 🚀'
)
on conflict (id) do update set body = excluded.body, updated_at = now();
