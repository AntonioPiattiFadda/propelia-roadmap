export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Base común de los mails al lead (cabecera con la marca, tarjeta y pie con quien la manda).
 * Copiada de `propelia-frontend` (21/10/2026), donde la tarjeta es la del inmueble; acá es la de la
 * demo. Cada evento arma su cuerpo con estas piezas. Diseño: docs/leadNotifications/ del producto.
 *
 * HTML de mail: tablas + estilos inline. El <style> del head sólo lleva un @media para el pie en
 * móvil (Gmail con cuentas IMAP lo ignora y el pie queda entero, sin romperse). Gmail no muestra
 * SVG ni imágenes base64, y no entiende flex/grid ni variables CSS. Los íconos son PNG de Lucide.
 */

export type LeadEmailAgent = { firstName: string; lastName: string; email: string | null; phone: string | null }
export type LeadEmailOrg = {
  name: string
  logoUrl: string | null
  brandColor: string | null
  /**
   * El logo ya trae el nombre escrito (un lockup, como el de Propelia): la cabecera muestra solo el
   * logo, a tamaño fijo, sin el separador ni el nombre repetido al lado. Agregado acá (21/10/2026).
   */
  logoLockup?: { width: number; height: number }
  /** El mismo logo para fondo de color (versión blanca): lo usa el tema 'marca' en la cabecera. */
  logoOnBrandUrl?: string
}

/**
 * Cuánto color de marca lleva el mail (21/10/2026, para probar en docs/avisosALeads/):
 *   - 'neutro': el del producto, cabecera blanca con los círculos y pie gris.
 *   - 'acento': franja de marca arriba, tarjeta y pie teñidos, nombre de quien firma en el color.
 *   - 'marca':  cabecera entera del color con el logo blanco, y el pie teñido como 'acento'.
 */
export type LeadEmailTheme = 'neutro' | 'acento' | 'marca'

/** El color mezclado con blanco: `amount` 0 = el color, 1 = blanco. */
export function tint(hex: string, amount: number): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return '#' + c.map((v) => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')).join('')
}

/** Azul del diseño: el botón lo usa cuando la org no tiene color de marca válido. */
export const NEUTRAL_BRAND = '#183b56'
export const INK = '#142f47'
export const MUTED = '#49657c'
export const SUBTLE = '#55728b'
export const FADED = '#8ba0b1'
export const LINE = '#e8eef3'
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const HEX_RE = /^#[0-9a-f]{6}$/i
const TIME_ZONE = 'Europe/Madrid'

export function formatVisitDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE })
    .format(new Date(iso))
}

export function formatVisitTime(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIME_ZONE })
    .format(new Date(iso))
}

export const brandOf = (color: string | null) => (color && HEX_RE.test(color) ? color : NEUTRAL_BRAND)

/** Blanco o tinta oscura, lo que se lea mejor sobre el color de marca. */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.55 ? INK : '#ffffff'
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const agentFullName = (agent: LeadEmailAgent) =>
  [agent.firstName, agent.lastName].filter((p) => p && p.trim()).join(' ').trim()

export const icon = (base: string, name: string, size: number, extra = 'display:block;') =>
  `<img src="${escapeHtml(`${base}/${name}.png`)}" alt="" width="${size}" height="${size}" style="${extra}width:${size}px;height:${size}px;border:0;" />`

/** "{Agente} de {Org}" (escapado). Sin nombre de agente no se arma un "de {Org}" colgado. */
export function introName(agent: LeadEmailAgent, org: LeadEmailOrg): string {
  const agentName = escapeHtml(agentFullName(agent))
  const orgName = escapeHtml(org.name)
  return agentName ? `${agentName} de ${orgName}` : orgName
}

/** Pastilla de estado arriba del saludo ("Nuevo horario", "Visita cancelada"...). */
export const badge = (label: string, bg: string, fg: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr><td style="background:${bg};color:${fg};border-radius:999px;padding:5px 12px;font-size:12px;line-height:1.3;font-weight:600;letter-spacing:0.2px;">${escapeHtml(label)}</td></tr></table>`

/** Botón con el color de marca de la org. `href` y `label` sin escapar: se escapan acá. */
export function ctaButton(org: LeadEmailOrg, href: string, label: string, marginTop = 26): string {
  const brand = brandOf(org.brandColor)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:${marginTop}px;"><tr>
        <td style="background:${brand};border-radius:12px;">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;color:${textOn(brand)};font-size:14px;line-height:1.25;font-weight:600;text-decoration:none;">${escapeHtml(label)}&nbsp;&rarr;</a>
        </td>
      </tr></table>`
}

export const mapsUrl = (address: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address)

/** Una fila de la tarjeta: ícono a la izquierda y contenido (HTML ya escapado) a la derecha. */
export type CardRow = { icon: string; html: string }

export type PropertyCard = {
  imageUrl: string | null
  /** Debajo de la foto (p. ej. "Vendido"). La foto sale además en gris. */
  imageStamp?: string
  rows: CardRow[]
}

/** Calle + ciudad (o "Dirección a confirmar"), escapado: la primera fila de la tarjeta. */
export function addressRowHtml(addressLine: string | null, city: string | null): string {
  return addressLine
    ? `<p style="margin:0;color:#12314c;font-size:18px;line-height:1.35;font-weight:700;letter-spacing:-0.2px;">${escapeHtml(addressLine)}</p>${
      city ? `\n                  <p style="margin:4px 0 0;color:${SUBTLE};font-size:13px;line-height:1.4;">${escapeHtml(city)}</p>` : ''
    }`
    : `<p style="margin:0;color:#12314c;font-size:18px;line-height:1.35;font-weight:700;">Dirección a confirmar</p>`
}

function cardHtml(assets: string, card: PropertyCard, background = '#f3f8fb'): string {
  const grey = card.imageStamp ? 'filter:grayscale(100%);opacity:0.75;' : ''
  const stamp = card.imageStamp
    ? `<table role="presentation" width="180" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;"><tr><td align="center" style="background:${INK};color:#ffffff;border-radius:8px;padding:6px 0;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(card.imageStamp)}</td></tr></table>`
    : ''
  const image = card.imageUrl
    ? `<td class="stack-mobile photo-cell" width="180" valign="middle" style="padding-right:24px;"><img class="photo-mobile" src="${escapeHtml(card.imageUrl)}" alt="" width="180" height="160" style="display:block;width:180px;height:160px;object-fit:cover;border-radius:14px;border:0;${grey}" />${stamp}</td>`
    : ''
  const rows = card.rows.map((row, i) => {
    const last = i === card.rows.length - 1
    return `
              <tr>
                <td valign="top" style="width:34px;padding:1px 10px ${last ? '0' : '18px'} 0;">${icon(assets, row.icon, 24)}</td>
                <td valign="top"${last ? '' : ' style="padding-bottom:18px;"'}>
                  ${row.html}
                </td>
              </tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${background};border-radius:15px;">
      <tr><td style="padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          ${image}
          <td class="stack-mobile" valign="middle">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}
            </table>
          </td>
        </tr></table>
      </td></tr>
      </table>`
}

export type LeadEmailLayout = {
  assetsBaseUrl: string
  org: LeadEmailOrg
  agent: LeadEmailAgent
  clientFirstName: string | null
  /** HTML ya armado (badge()). Opcional. */
  badgeHtml?: string
  /** Frase antes de la tarjeta, HTML ya escapado. */
  introHtml: string
  card: PropertyCard
  /** Lo que va después de la tarjeta (botones, cierre), HTML ya escapado. */
  afterCardHtml: string
  /** Por defecto 'neutro', el del producto. */
  tema?: LeadEmailTheme
}

export function renderLeadEmailLayout(l: LeadEmailLayout): string {
  const assets = l.assetsBaseUrl.replace(/\/+$/, '')
  const org = escapeHtml(l.org.name)
  const agentName = escapeHtml(agentFullName(l.agent))
  const greeting = l.clientFirstName?.trim() ? `Hola ${escapeHtml(l.clientFirstName.trim())},` : 'Hola,'
  const phone = l.agent.phone?.trim() ? escapeHtml(l.agent.phone.trim()) : null
  const tema = l.tema ?? 'neutro'
  const brand = brandOf(l.org.brandColor)
  const conColor = tema !== 'neutro'
  const onBrand = tema === 'marca' && !!l.org.logoOnBrandUrl
  const logoUrl = onBrand ? l.org.logoOnBrandUrl! : l.org.logoUrl

  // Cabecera: logo (con tope, sin deformarse) | nombre de la org. Sin logo, sólo el nombre.
  const lockup = logoUrl && l.org.logoLockup
  // Ancho y alto escritos, no max-*: Outlook ignora max-width/max-height y lo pintaría a tamaño real.
  const logo = lockup
    ? `<td valign="middle"><img src="${escapeHtml(logoUrl!)}" alt="${org}" width="${l.org.logoLockup!.width}" height="${l.org.logoLockup!.height}" style="display:block;width:${l.org.logoLockup!.width}px;height:${l.org.logoLockup!.height}px;border:0;" /></td>`
    : l.org.logoUrl
    ? `<td valign="middle"><img src="${escapeHtml(l.org.logoUrl)}" alt="${org}" style="display:block;width:auto;height:auto;max-width:170px;max-height:40px;border:0;" /></td>
            <td valign="middle" style="padding:0 20px;"><div style="width:2px;height:36px;background:#8ba0b1;"></div></td>`
    : ''

  const nameColor = conColor ? brand : INK
  const footerName = agentName
    ? `<strong style="font-weight:700;color:${nameColor};">${agentName}</strong> <span style="color:${MUTED};font-size:12px;">·&nbsp;${org}</span>`
    : `<strong style="font-weight:700;color:${nameColor};">${org}</strong>`

  // Cabecera: blanca con los círculos (neutro / acento) o del color de marca (marca). En 'acento' el
  // borde de arriba del mail va en el color: un borde y no una fila, así sigue la curva de las
  // esquinas (una fila de color quedaba recta y se salía del redondeado). Los círculos van en azul
  // (`header-corner-brand.png`, el mismo dibujo recoloreado).
  const cornerPng = tema === 'acento' ? 'header-corner-brand.png' : 'header-corner.png'
  const header = tema === 'marca'
    ? `<tr><td style="padding:30px 40px;background:${brand};border-radius:17px 17px 0 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            ${logo}${lockup ? '' : `
            <td valign="middle" style="font-size:20px;line-height:1.2;color:#ffffff;font-weight:600;letter-spacing:-0.2px;">${org}</td>`}
      </tr></table>
    </td></tr>`
    : `<tr><td style="padding:0;border-bottom:2px solid ${conColor ? tint(brand, 0.82) : '#dceaf3'};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding:28px 0 28px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            ${logo}${lockup ? '' : `
            <td valign="middle" style="font-size:20px;line-height:1.2;color:#172f43;font-weight:500;letter-spacing:-0.2px;">${org}</td>`}
          </tr></table>
        </td>
        <!-- Decoración: círculos de la esquina. Imagen porque los mails no soportan posicionamiento. -->
        <td width="130" valign="top" align="right" style="padding:0;width:130px;"><img src="${escapeHtml(`${assets}/${cornerPng}`)}" alt="" width="130" height="110" style="display:block;width:130px;height:110px;border:0;border-top-right-radius:17px;" /></td>
      </tr></table>
    </td></tr>`
  const footerBg = conColor ? `background:${tint(brand, 0.94)};border-radius:0 0 17px 17px;` : ''
  const footerLine = conColor ? '' : `border-top:1px solid ${LINE};`
  const avatarBg = conColor ? tint(brand, 0.85) : '#e8f3f9'
  const tagColor = conColor ? brand : '#66849a'
  const sepColor = conColor ? tint(brand, 0.8) : LINE

  const footerPhone = phone
    ? `\n          <p style="margin:4px 0 0;color:${MUTED};font-size:12px;line-height:1.4;">${icon(assets, 'phone', 13, 'display:inline-block;vertical-align:-2px;')}&nbsp;&nbsp;${phone}</p>`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Inter: la cargan Apple Mail / iOS / Outlook web; Gmail la ignora y cae al stack del sistema. -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<!-- Único CSS fuera de línea, sólo para móvil: se oculta la parte derecha del pie y la tarjeta del
     inmueble se apila (foto arriba, datos abajo). Gmail descarta el bloque entero si hay un error
     de sintaxis: mantenerlo mínimo. -->
<style>
  @media only screen and (max-width:600px) {
    .hide-mobile { display:none !important; }
    .stack-mobile { display:block !important; width:100% !important; }
    .photo-cell { padding:0 0 18px !important; }
    .photo-mobile { width:100% !important; height:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f2f6f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f6f9;padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid ${LINE};${tema === 'acento' ? `border-top:5px solid ${brand};` : ''}border-radius:18px;font-family:${FONT};color:${INK};">

    ${header}

    <tr><td style="padding:32px 40px 34px;">
      ${l.badgeHtml ? `${l.badgeHtml}
      ` : ''}<p style="margin:0 0 16px;color:${MUTED};font-size:16px;line-height:1.5;">${greeting}</p>
      <p style="margin:0 0 24px;color:${INK};font-size:16px;line-height:1.5;">${l.introHtml}</p>

      ${cardHtml(assets, l.card, conColor ? tint(brand, 0.93) : undefined)}

      ${l.afterCardHtml}
    </td></tr>

    <tr><td style="padding:0 40px;${footerBg}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${footerLine}"><tr>
        <td width="54" valign="middle" style="padding:22px 0 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" style="width:38px;height:38px;background:${avatarBg};border-radius:50%;">${
    icon(assets, 'user', 20, 'display:block;margin:0 auto;')
  }</td></tr></table>
        </td>
        <td valign="middle" style="padding:22px 0 24px;">
          <p style="margin:0;color:${INK};font-size:13px;line-height:1.4;">${footerName}</p>${footerPhone}
        </td>
        <td class="hide-mobile" width="1" valign="middle" style="padding:22px 0 24px;"><div style="width:1px;height:52px;background:${sepColor};"></div></td>
        <td class="hide-mobile" width="128" valign="middle" style="padding:22px 0 24px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="padding-right:10px;">${icon(assets, 'house', 26)}</td>
            <td valign="middle" style="color:${tagColor};font-size:10px;line-height:1.35;">El CRM que<br />trabaja por tu<br />inmobiliaria</td>
          </tr></table>
        </td>
      </tr></table>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`
}

/** De: "{Agente} · {Org}", o sólo la org. */
export const fromNameOf = (agent: LeadEmailAgent, org: LeadEmailOrg) =>
  agentFullName(agent) ? `${agentFullName(agent)} · ${org.name}` : org.name
