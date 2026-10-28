-- El WhatsApp de los accesos (28/10/2026, por pedido), en el tono del primero (`contacto_inicial`).
-- Es UN mensaje: `accesos_enviados` avisa al responsable que cada uno recibió por mail su usuario y
-- contraseña temporal y, si algún mail no llegó, /clientes le pega debajo `corregir_mails`, que pide
-- por WhatsApp el email bien escrito. {mails}: un renglón por mail que no llegó.
-- `on conflict do nothing`: si alguien ya los cargó o editó a mano, se respeta.
insert into public.onboarding_message_templates (id, body) values
(
  'accesos_enviados',
  E'¡{nombre}, ya están listos los accesos de {inmobiliaria}! 🎉\n\n'
  'Acabo de enviar a cada persona del equipo un email desde info@propelia.es con su usuario y una contraseña temporal. Si alguien no lo encuentra, que revise la carpeta de spam o de promociones.\n\n'
  'La contraseña es temporal: la cambiaréis al terminar el onboarding, así que de momento no hace falta tocarla.\n\n'
  'En cuanto hayáis entrado, decídmelo por aquí y seguimos con el siguiente paso 🚀'
), (
  'corregir_mails',
  E'⚠️ Una cosa: el email con los accesos no les ha llegado a estas personas del equipo 👇\n\n'
  '{mails}\n\n'
  'Seguramente la dirección esté mal escrita o no reciba correo. ¿Me pasáis por aquí el email correcto de cada una? En cuanto lo tenga, se lo vuelvo a enviar.'
)
on conflict (id) do nothing;
