-- El WhatsApp `tutorial_leads` pasa a ser el mensaje de arranque (2/11/2026, por pedido): se manda
-- después de activar los tutoriales y avisa a la vez que la cartera está importada (con lo que quedó
-- a medias para completar), que los tutoriales están prendidos y cuáles son los primeros pasos. Ya
-- no lista los recorridos uno por uno: los ven en Propelia.
-- Sólo si el texto sigue siendo el de 20261031183516: uno editado a mano no se pisa.
update public.onboarding_message_templates
   set body = E'¡Hola, chicos! ¿Cómo estáis? ¡Espero que tengáis una gran semana!\n\n'
     'Os he importado los pisos en Propelia. Algunos quedaron con la dirección cargada a medias o sin agente comercializador, así que el primer paso sería hacer esos ajustes: veréis que es súper sencillo.\n\n'
     'Por otro lado, he activado una serie de tutoriales muy breves para que podáis empezar a usar el sistema. Algunos son para los administradores y tienen que ver con la configuración del equipo y de la organización (como poner el logo y el manual de marca para los documentos), y otros son para los agentes.\n\n'
     'Los pasos a seguir son:\n\n'
     '- Completar la información de los inmuebles: por ahora solo la dirección. Cuando hagamos la integración completa con Idealista, el resto de los datos se traerá solo.\n'
     '- Completar la información de los miembros del equipo.\n'
     '- Configurar la entrada de leads desde Idealista.\n\n'
     'Os adjunto también un vídeo de 20 segundos con cómo va a ser el proceso de onboarding de ahora en adelante 🎥\n\n'
     'Toda la información la veréis en los tutoriales y, por cualquier duda, me podéis consultar: será un gusto ayudaros 😊'
 where id = 'tutorial_leads'
   and body like E'{nombre}, ya tenéis activado el tutorial de Propelia para todo el equipo de {inmobiliaria}%';
