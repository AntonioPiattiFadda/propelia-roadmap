/* Las plantillas HTML de los mails a inmobiliarias (18/10/2026). Este archivo lo importan las dos
   puntas: la edge function `send-email`, que arma el HTML que sale, y el diálogo «Mensajes» del
   CRM, que pinta la vista previa. Una sola copia: si el front armara el HTML y lo mandara, el
   servidor estaría firmando como `info@propelia.es` cualquier HTML que le llegue. Acá solo entra
   texto, y todo texto se escapa.

   Sin imports a propósito: Deno pide la extensión `.ts` y Vite no conoce `Deno`, y así no hay
   nada que resolver de ninguno de los dos lados.

   Las imágenes viven en la landing (`propelia-landing/assets/`, se sirve en propelia.es): son las
   que va a pedir el cliente de correo de quien lo reciba, y tienen que ser públicas y no vencer. */

export type PlantillaEmailId = 'presentacion-video' | 'puntual'

export type CamposEmail = {
  asunto: string
  /** Lo que se lee en la bandeja al lado del asunto. */
  preencabezado: string
  /** El «Hola {nombre},». Vacío queda «Hola,». */
  nombre: string
  /** Vacío, la fila del titular no se dibuja. */
  titular: string
  /** Párrafos separados por una línea en blanco; un salto simple es un salto de línea. */
  cuerpo: string
  /** Solo el del vídeo: una tarjeta por renglón, y lo que va hasta el primer punto va en negrita. */
  puntos: string
  /** Sin texto o sin enlace, el botón no se dibuja. */
  textoBoton: string
  urlBoton: string
  /** Solo el del vídeo: la línea gris debajo del botón. */
  notaBoton: string
  /** Solo el del vídeo, y obligatorio: a dónde lleva la portada con el play. */
  urlVideo: string
}

export type CampoEmail = keyof CamposEmail

/* La portada lleva a la página pública del vídeo en el producto (`propelia-frontend`,
   `src/pages/presentacion/`), que reproduce el mp4 del bucket público `publico` de este proyecto.
   Un vídeo nuevo se cambia allá, no acá. */
export const URL_VIDEO = 'https://crm.propelia.es/presentacion'

/* Quién firma: sale de la fila de `users` de quien manda, nunca de lo que mande el front
   (19/10/2026). El mail sale siempre desde info@propelia.es; lo que cambia por persona es el email
   que se muestra (firma, pie, «Darse de baja», «Contáctame» sin teléfono) y el `reply_to`:
   - el email es el de login (`users.email`) si es del dominio propelia.es; si no (los gmail de
     Lorenzo y Antonio), info@propelia.es, y sin `reply_to` propio. `firma_email` ya no se lee.
   - el teléfono es `users.phone` (obligatorio en el alta) y, si falta, `firma_telefono`. */
export const EMAIL_POR_DEFECTO = 'info@propelia.es'
const DOMINIO_PROPIO = '@propelia.es'

export type Remitente = { nombre: string; cargo: string; email: string; telefono: string }

type FilaUsuario = {
  nombre?: string | null; email?: string | null; phone?: string | null
  firma_nombre?: string | null; firma_cargo?: string | null; firma_telefono?: string | null
}

export function remitenteDe(u: FilaUsuario | null | undefined): Remitente {
  const t = (v: string | null | undefined) => v?.trim() ?? ''
  const email = t(u?.email).toLowerCase()
  return {
    nombre: t(u?.firma_nombre) || t(u?.nombre) || 'Equipo Propelia',
    cargo: t(u?.firma_cargo),
    email: email.endsWith(DOMINIO_PROPIO) ? email : EMAIL_POR_DEFECTO,
    telefono: t(u?.phone) || t(u?.firma_telefono),
  }
}

/** El nombre del remitente en la bandeja: el nombre de pila de quien manda, «de Propelia».
    El mail sale igual desde info@propelia.es. */
export function nombreEnBandeja(r: Remitente): string {
  const pila = r.nombre === 'Equipo Propelia' ? '' : r.nombre.trim().split(/\s+/)[0]
  return pila ? `${pila} de Propelia` : 'Propelia'
}

/** A dónde van las respuestas: el email de quien manda, si es uno propio de propelia.es. */
export const replyToDe = (r: Remitente) => (r.email === EMAIL_POR_DEFECTO ? undefined : r.email)
const ASSETS = 'https://www.propelia.es/assets'
const PRIVACIDAD = 'https://www.propelia.es/politica-privacidad.html'

export type PlantillaEmail = {
  id: PlantillaEmailId
  nombre: string
  descripcion: string
  /** Qué campos se editan en el diálogo, en ese orden. El resto la plantilla no lo usa. */
  editables: CampoEmail[]
  predeterminados: CamposEmail
}

const VACIOS: CamposEmail = {
  asunto: '', preencabezado: '', nombre: '', titular: '', cuerpo: '', puntos: '',
  textoBoton: '', urlBoton: '', notaBoton: '', urlVideo: '',
}

export const PLANTILLAS_EMAIL: PlantillaEmail[] = [
  {
    id: 'presentacion-video',
    nombre: 'Presentación con vídeo',
    descripcion: 'Después de la llamada: el vídeo de dos minutos y «Reservar 20 minutos» por WhatsApp.',
    editables: ['asunto', 'preencabezado', 'nombre', 'titular', 'cuerpo', 'urlVideo', 'puntos', 'textoBoton', 'urlBoton', 'notaBoton'],
    predeterminados: {
      ...VACIOS,
      asunto: 'Propelia en dos minutos',
      preencabezado: 'Dos minutos de vídeo para ver Propelia por dentro.',
      titular: 'Esto es Propelia por dentro',
      cuerpo: 'Como quedamos, te dejo la presentación. Son dos minutos de vídeo y se entiende mucho mejor que cualquier dossier.',
      urlVideo: URL_VIDEO,
      puntos: [
        'El Coordinador cogiendo el teléfono. Atiende la llamada, pregunta qué busca la persona, mira tu agenda y le confirma la visita.',
        'Los portales en un solo sitio. Idealista, Fotocasa, Milanuncios y Habitaclia. Publicas una vez y los leads entran todos al CRM.',
        'Tu web con valorador. El propietario calcula lo que vale su piso y te deja sus datos.',
        'La IA en el trabajo del día. Corrige las fotos de los anuncios y redacta la documentación.',
      ].join('\n'),
      textoBoton: 'Reservar 20 minutos',
      // Lo pone `predeterminadosPara`: el WhatsApp de quien manda, pidiendo la demo.
      urlBoton: '',
      notaBoton: 'Te lo enseño en directo sobre tus propios anuncios.\nSi lo prefieres, contéstame a este correo y lo vemos por aquí.',
    },
  },
  {
    id: 'puntual',
    nombre: 'Mail puntual',
    descripcion: 'Texto libre con la marca de Propelia: titular, párrafos y el botón «Contáctame» a tu WhatsApp.',
    editables: ['asunto', 'preencabezado', 'nombre', 'titular', 'cuerpo', 'textoBoton', 'urlBoton'],
    predeterminados: {
      ...VACIOS,
      asunto: 'Propelia',
      preencabezado: 'Te escribo por lo que hablamos.',
      titular: 'Gracias por tu tiempo',
      cuerpo: 'Te escribo por lo que hablamos por teléfono.\n\nSi te encaja, buscamos un rato esta semana y te lo enseño en directo sobre tus propios anuncios. Puedes contestar a este correo directamente.',
      textoBoton: 'Contáctame',
      // Lo pone `predeterminadosPara`: el WhatsApp de quien manda.
      urlBoton: '',
    },
  },
]

export const plantillaEmail = (id: string): PlantillaEmail | undefined => PLANTILLAS_EMAIL.find(p => p.id === id)

/** A quién le llega el mail: lo que se sabe del lead para escribir el WhatsApp en su nombre. */
export type Destinatario = { nombre?: string | null; empresa?: string | null }

/* Qué pide el WhatsApp según el mail: el del vídeo cierra con «Reservar 20 minutos», así que pide
   la demo; el puntual, saber más. */
const PEDIDO: Record<PlantillaEmailId, string> = {
  'presentacion-video': 'Me gustaría reservar 20 minutos para ver una demo de Propelia.',
  puntual: 'Me interesa saber más sobre cómo podéis ayudar a mi inmobiliaria.',
}

/** El mensaje que queda escrito en el WhatsApp. Lo manda quien recibió el mail, así que va en su
    voz: «¡Hola Propelia! Soy Ana, de Inmobiliaria Sol. Me interesa…». Sin nombre ni empresa, solo
    el saludo y el pedido. */
export function mensajeDeWhatsapp(d: Destinatario = {}, id: PlantillaEmailId = 'puntual'): string {
  const nombre = d.nombre?.trim() ?? ''
  const empresa = d.empresa?.trim() ?? ''
  const quien = nombre && empresa ? ` Soy ${nombre}, de ${empresa}.`
    : nombre ? ` Soy ${nombre}.`
    : empresa ? ` Os escribo desde ${empresa}.`
    : ''
  return `¡Hola Propelia!${quien} ${PEDIDO[id]}`
}

/** El botón de los dos mails: el WhatsApp de quien manda (wa.me abre WhatsApp Web en el ordenador
    y la app en el móvil), con el mensaje ya escrito. Sin teléfono, un mail a su email (o a info@).
    wa.me pide el número en dígitos, con el código de país. */
export function whatsappDe(r: Remitente, d?: Destinatario, id: PlantillaEmailId = 'puntual'): string {
  const digitos = r.telefono.replace(/\D/g, '')
  if (!digitos) return `mailto:${r.email}`
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensajeDeWhatsapp(d, id))}`
}

/** Lo que arranca cargado en el diálogo: el botón de los dos va al WhatsApp de quien manda. */
export function predeterminadosPara(id: PlantillaEmailId, r: Remitente, d?: Destinatario): CamposEmail {
  return { ...plantillaEmail(id)!.predeterminados, urlBoton: whatsappDe(r, d, id) }
}

export const ROTULOS_CAMPOS: Record<CampoEmail, string> = {
  asunto: 'Asunto',
  preencabezado: 'Preencabezado',
  nombre: 'Nombre',
  titular: 'Titular',
  cuerpo: 'Cuerpo',
  puntos: 'Lo que verás',
  textoBoton: 'Texto del botón',
  urlBoton: 'Enlace del botón',
  notaBoton: 'Nota bajo el botón',
  urlVideo: 'Enlace del vídeo',
}

const ES_URL = /^https?:\/\/[^\s"'<>]+$/i
/** El botón además puede ser un `mailto:` (el «Contáctame» de quien no tiene teléfono). */
const ES_MAILTO = /^mailto:[^\s@"'<>]+@[^\s@"'<>]+\.[^\s"'<>]+$/i

/** Lo que llega del front, recortado a los campos conocidos y siempre como texto. `null` si no es un objeto. */
export function camposDesde(valor: unknown): CamposEmail | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const v = valor as Record<string, unknown>
  const out = { ...VACIOS }
  for (const k of Object.keys(VACIOS) as CampoEmail[]) out[k] = typeof v[k] === 'string' ? (v[k] as string) : ''
  return out
}

/** El primer problema que impide mandar, o `null`. La usa el servidor y el botón «Enviar». */
export function problemaDeCampos(id: PlantillaEmailId, c: CamposEmail): string | null {
  if (!c.asunto.trim()) return 'Falta el asunto'
  if (!c.cuerpo.trim()) return 'Falta el cuerpo'
  if (id === 'presentacion-video') {
    if (!c.urlVideo.trim()) return 'Falta el enlace del vídeo'
    if (!ES_URL.test(c.urlVideo.trim())) return 'El enlace del vídeo no es válido'
  }
  const boton = c.urlBoton.trim()
  if (boton && !ES_URL.test(boton) && !ES_MAILTO.test(boton)) return 'El enlace del botón no es válido'
  return null
}

const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Escapado y con los saltos simples como `<br>`. */
const enLinea = (s: string) => escapar(s.trim()).replace(/\r?\n/g, '<br>')

export const parrafos = (s: string) => s.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean)

/** «Título. Resto» → negrita hasta el primer punto. Sin punto, el renglón va entero sin negrita. */
export function partirPunto(linea: string): { negrita: string; resto: string } {
  const i = linea.indexOf('. ')
  return i === -1 ? { negrita: '', resto: linea.trim() } : { negrita: linea.slice(0, i + 1).trim(), resto: linea.slice(i + 2).trim() }
}

const puntosDe = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

const FUENTE = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"

const saludo = (nombre: string) => (nombre.trim() ? `Hola ${nombre.trim()},` : 'Hola,')

function boton(c: CamposEmail, padTop: number, padBoton: number): string {
  if (!c.textoBoton.trim() || !c.urlBoton.trim()) return ''
  return `
    <tr>
      <td class="pad" align="center" style="padding:${padTop}px 40px 0 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" width="100%">
          <tr>
            <td align="center" bgcolor="#0147FE" style="border-radius:10px;">
              <a href="${escapar(c.urlBoton.trim())}" target="_blank"
                 style="display:block;padding:${padBoton}px 32px;${FUENTE}font-size:17px;line-height:21px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">
                ${escapar(c.textoBoton.trim())}
              </a>
            </td>
          </tr>
        </table>${c.notaBoton.trim() ? `
        <p style="margin:14px 0 0 0;${FUENTE}font-size:14px;line-height:21px;color:#8390AE;text-align:center;">
          ${enLinea(c.notaBoton)}
        </p>` : ''}
      </td>
    </tr>`
}

function contenidoVideo(c: CamposEmail): string {
  const p = (texto: string, margen: string) =>
    `<p style="margin:${margen};${FUENTE}font-size:17px;line-height:27px;color:#4A5776;">${texto}</p>`
  const cuerpo = parrafos(c.cuerpo)
  const tarjetas = puntosDe(c.puntos)
  return `
    <tr>
      <td class="pad" style="padding:38px 40px 0 40px;">${c.titular.trim() ? `
        <h1 class="h1" style="margin:0 0 18px 0;${FUENTE}font-size:32px;line-height:38px;font-weight:700;color:#07123A;letter-spacing:-0.8px;">
          ${escapar(c.titular.trim())}
        </h1>` : ''}
        ${p(escapar(saludo(c.nombre)), '0 0 14px 0')}
        ${cuerpo.map((t, i) => p(enLinea(t), i === cuerpo.length - 1 ? '0 0 4px 0' : '0 0 14px 0')).join('\n        ')}
      </td>
    </tr>

    <tr>
      <td class="pad" style="padding:26px 40px 0 40px;">
        <a href="${escapar(c.urlVideo.trim())}" target="_blank" style="text-decoration:none;display:block;">
          <img src="${ASSETS}/mail-video.png" width="520" height="292"
               alt="Ver el vídeo: Propelia en dos minutos"
               style="width:100%;max-width:520px;height:auto;display:block;border-radius:12px;background-color:#F7FAFF;border:1px solid #DCE5F4;">
        </a>
        <p style="margin:11px 0 0 0;${FUENTE}font-size:13px;line-height:19px;color:#8390AE;">
          2 minutos · Se abre en el navegador
        </p>
      </td>
    </tr>${tarjetas.length ? `

    <tr>
      <td class="pad" style="padding:32px 40px 0 40px;">
        <p style="margin:0 0 14px 0;${FUENTE}font-size:11px;line-height:15px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#8390AE;">
          Lo que verás
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tarjetas.map((l, i) => {
          const { negrita, resto } = partirPunto(l)
          return `
          <tr><td${i < tarjetas.length - 1 ? ' style="padding-bottom:10px;"' : ''}>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F7FD;border-radius:10px;border-left:3px solid #0147FE;">
              <tr><td style="padding:15px 18px;${FUENTE}font-size:16px;line-height:24px;color:#4A5776;">
                ${negrita ? `<strong style="color:#07123A;">${escapar(negrita)}</strong> ` : ''}${escapar(resto)}
              </td></tr>
            </table>
          </td></tr>`
        }).join('')}
        </table>
      </td>
    </tr>` : ''}
${boton(c, 32, 17)}`
}

function contenidoPuntual(c: CamposEmail): string {
  return `${c.titular.trim() ? `
    <tr>
      <td class="pad" style="padding:36px 40px 0 40px;">
        <h1 style="margin:0 0 18px 0;${FUENTE}font-size:24px;line-height:31px;font-weight:700;color:#07123A;letter-spacing:-0.5px;">
          ${escapar(c.titular.trim())}
        </h1>
      </td>
    </tr>` : ''}

    <tr>
      <td class="pad" style="padding:${c.titular.trim() ? 0 : 36}px 40px 0 40px;${FUENTE}font-size:17px;line-height:27px;color:#4A5776;">
        <p style="margin:0 0 16px 0;">${escapar(saludo(c.nombre))}</p>
        ${parrafos(c.cuerpo).map(t => `<p style="margin:0 0 16px 0;">${enLinea(t)}</p>`).join('\n        ')}
      </td>
    </tr>
${boton(c, 26, 16)}`
}

const telHref = (tel: string) => tel.replace(/[^\d+]/g, '')

function firma(r: Remitente): string {
  const contacto = [
    r.telefono && `<a href="tel:${escapar(telHref(r.telefono))}" style="color:#0147FE;text-decoration:none;">${escapar(r.telefono)}</a>`,
    `<a href="https://www.propelia.es" style="color:#0147FE;text-decoration:none;">propelia.es</a>`,
  ].filter(Boolean).join(' ·\n              ')
  return `Un saludo,<br>
              <strong style="color:#07123A;font-size:16px;">${escapar(r.nombre)}</strong><br>${r.cargo ? `
              <span style="color:#8390AE;">${escapar(r.cargo)}</span><br>` : ''}
              <a href="mailto:${escapar(r.email)}" style="color:#0147FE;text-decoration:none;">${escapar(r.email)}</a><br>
              ${contacto}`
}

function documento(preencabezado: string, contenido: string, motivoPie: string, r: Remitente): string {
  return `<!doctype html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Propelia</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;display:block}
  a{color:#0147FE}
  @media screen and (max-width:620px){
    .wrap{width:100%!important}
    .pad{padding-left:22px!important;padding-right:22px!important}
    .h1{font-size:27px!important;line-height:33px!important}
    .btn a{display:block!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#EDF2FB;">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
  ${escapar(preencabezado.trim())}
  &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDF2FB;">
<tr><td align="center" style="padding:28px 12px 36px 12px;">

  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;">

    <tr>
      <td style="font-size:0;line-height:0;">
        <img src="${ASSETS}/mail-header.png" width="600" height="140"
             alt="Propelia · Software con IA para inmobiliarias"
             style="width:100%;max-width:600px;height:auto;display:block;background-color:#FFFFFF;">
      </td>
    </tr>
${contenido}

    <tr>
      <td class="pad" style="padding:30px 40px 36px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #DCE5F4;">
          <tr>
            <td style="padding-top:24px;${FUENTE}font-size:15px;line-height:24px;color:#4A5776;">
              ${firma(r)}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="background-color:#F4F7FD;padding:26px 40px;border-top:1px solid #DCE5F4;">
        <img src="${ASSETS}/lockup_h.png" width="104" height="38"
             alt="Propelia" style="width:104px;height:auto;display:block;margin:0 auto 12px auto;">
        <p style="margin:0;${FUENTE}font-size:12px;line-height:18px;color:#8390AE;text-align:center;">
          Propelia · Barcelona, España · ${escapar(r.email)}<br>${motivoPie ? `
          ${motivoPie}<br>` : ''}
          <a href="mailto:${escapar(r.email)}?subject=Baja" style="color:#8390AE;text-decoration:underline;">Darse de baja</a> ·
          <a href="${PRIVACIDAD}" style="color:#8390AE;text-decoration:underline;">Política de privacidad</a>
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>

</body>
</html>
`
}

/** La versión de texto plano que va junto al HTML: la leen los clientes sin HTML y los filtros de spam. */
function textoPlano(id: PlantillaEmailId, c: CamposEmail, r: Remitente): string {
  const partes = [c.titular.trim(), saludo(c.nombre), ...parrafos(c.cuerpo)]
  if (id === 'presentacion-video') {
    partes.push(`Ver el vídeo: ${c.urlVideo.trim()}`)
    const tarjetas = puntosDe(c.puntos)
    if (tarjetas.length) partes.push(['Lo que verás:', ...tarjetas.map(l => `- ${l}`)].join('\n'))
  }
  if (c.textoBoton.trim() && c.urlBoton.trim()) partes.push(`${c.textoBoton.trim()}: ${c.urlBoton.trim()}`)
  if (id === 'presentacion-video' && c.notaBoton.trim()) partes.push(c.notaBoton.trim())
  partes.push(['Un saludo,', r.nombre, r.cargo, [r.email, r.telefono, 'propelia.es'].filter(Boolean).join(' · ')].filter(Boolean).join('\n'))
  return partes.filter(Boolean).join('\n\n') + '\n'
}

/** `assets` cambia de dónde salen las imágenes: solo para la vista previa, que las sirve la app
    (`public/email/`) y así se ven aunque la landing todavía no las tenga publicadas. */
export function renderEmail(
  id: PlantillaEmailId, c: CamposEmail, r: Remitente, { assets = ASSETS }: { assets?: string } = {},
): { subject: string; html: string; text: string } {
  const contenido = id === 'presentacion-video' ? contenidoVideo(c) : contenidoPuntual(c)
  const motivo = id === 'presentacion-video' ? 'Recibes este correo porque nos lo pediste en nuestra conversación.' : ''
  const html = documento(c.preencabezado, contenido, motivo, r).replaceAll(`${ASSETS}/`, `${assets}/`)
  return { subject: c.asunto.trim(), html, text: textoPlano(id, c, r) }
}
