/**
 * Mails reales de Idealista que recibió Docta Capital (`.inbound-corpus/`), para simular el
 * email inbound en la org demo. El cuerpo es el texto plano tal cual llegó — es lo que lee
 * `parseIdealistaEmail` — con los datos del interesado reemplazados por unos inventados: esto
 * va en el bundle, así que no puede llevar nombres, teléfonos ni mails de clientes reales.
 *
 * Los códigos de anuncio y las refs son los reales de Docta: son los que tienen que coincidir
 * con las propiedades importadas desde el Excel y, después, con la sincronización de Idealista.
 */

export type SimulatedInboundEmail = {
  id: string
  label: string
  adCode: string
  subject: string
  text: string
}

const FOOTER = `Para conocer el uso que hacemos de tus datos puedes consultar nuestra política
de privacidad
[https://x]

idealista en tu móvil o tabletApple
[https://x]
https://idealista.onelink.me/3139118072/4cc77b80  Android
[https://x]
https://idealista.onelink.me/3139118072/4cc77b80  Huawei
[https://st3.idealista.com/static/email/img/badge_huawei.png]https://idealista.onelink.me/3139118072/4cc77b80idealista
© 2026`

const HEADER = `[https://x]

[https://x]

idealista.com
[https://st3.idealista.com/static/email/img/logo.png]https://www.idealista.com/?utm_medium=email&utm_campaign=contact_to…

Tienes un nuevo mensaje que espera tu respuesta

- 1
[https://x]
Tienes un nuevo mensaje que espera tu respuesta

[https://x]
`

const CHAT_TIP = `[https://st3.idealista.com/static/common/emails/img/infoIcon.png]Si te contactan
por chat intenta responder por chat. Las posibilidades de cerrar la operación se
reducen a la mitad si ignoras la forma de contacto preferida de tu cliente`

const DIPUTACIO = `Piso en Calle de la Diputació, La Nova Esquerra de l'Eixample, Barcelona
[https://x]

Ref. lor-dip

Código del anuncio: 112086123

629.000 €`

const VILLARROEL = `Piso en Calle de Villarroel, Sant Antoni, Barcelona
[https://x]

Ref. Lor-villa

Código del anuncio: 112021451

559.000 €`

export const SIMULATED_INBOUND_EMAILS: SimulatedInboundEmail[] = [
  {
    id: 'dip-visita',
    label: 'Diputació 142 · pide visita (sólo teléfono)',
    adCode: '112086123',
    subject: 'Nuevo mensaje de Jordi Puig sobre tu inmueble, con ref: lor-dip',
    text: `${HEADER}
Jordi Puig

611 23 45 67 [tel:+34611234567]

Hola, me interesa este piso y me gustaría hacer una visita.
Un saludo
Ver mensaje en idealista/tools
[https://x]

[https://x]

${DIPUTACIO}

${CHAT_TIP}

${FOOTER}`,
  },
  {
    id: 'dip-info',
    label: 'Diputació 142 · pide información (teléfono + mail)',
    adCode: '112086123',
    subject: 'Nuevo mensaje de Laura Gómez sobre tu inmueble, con ref: lor-dip',
    text: `${HEADER}
Laura Gómez

622 98 76 54 [tel:+34622987654]

k3v9q2m7x1p8w4z6r0t5y2u8i1o7a3s9d4f6g0h2j5l8@contacts.idealista.com
[https://x]

Hola, me interesa esta propiedad.

Me podrías mandar más información?

Contacto: Laura Gómez
laura.gomez.demo@example.com
+34 622 98 76 54

Un saludo

Laura
Responder desde idealista/tools
[https://x]
También puedes responderle contestando a este email
[https://x]

[https://x]

${DIPUTACIO}

${CHAT_TIP}

${FOOTER}`,
  },
  {
    id: 'villa-visita',
    label: 'Villarroel 34 · pide visita (teléfono + mail)',
    adCode: '112021451',
    subject: 'Nuevo mensaje de Marta Soler sobre tu inmueble, con ref: Lor-villa',
    text: `${HEADER}
Marta Soler

633 45 67 89 [tel:+34633456789]

marta.soler.demo@example.com [marta.soler.demo@example.com]

Hola, me interesa este piso y me gustaría hacer una visita.
Un saludo
Responder desde idealista/tools
[https://x]

[https://x]

${VILLARROEL}

${CHAT_TIP}

${FOOTER}`,
  },
  {
    id: 'villa-respuesta',
    label: 'Villarroel 34 · responde en el chat (mandar después del anterior)',
    adCode: '112021451',
    subject: 'Respuesta de Marta Soler sobre tu inmueble, Piso en Sant Antoni, Barcelona',
    text: `[https://x]
[https://x]
Tienes nuevos mensajes que esperan tu respuesta
- [image: 1]
Tienes nuevos mensajes que esperan tu respuesta
Marta Soler
Tu último mensaje:
Hola,

La vivienda estará disponible para entrar a ...
Mensajes de Marta Solernuevos
Buena tardes, estoy muy interesada. Sería posible visitarlo l...
Responder
[https://x]

Piso en Sant Antoni, Barcelona
[https://x]

Ref. Lor-villa

Código del anuncio: 112021451

559.000 €
Responde lo antes posible, el 78% de los compradores acaban trabajando con
el primer agente que les atiende.
${FOOTER}`,
  },
]
