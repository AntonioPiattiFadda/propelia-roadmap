import {
  badge,
  capitalize,
  ctaButton,
  escapeHtml,
  FADED,
  formatVisitDate,
  formatVisitTime,
  INK,
  introName,
  type LeadEmailAgent,
  type LeadEmailTheme,
  type LeadEmailOrg,
  MUTED,
  renderLeadEmailLayout,
  SUBTLE,
} from './leadEmailLayout.ts'

export { agentFullName, formatVisitDate as formatDemoDate, formatVisitTime as formatDemoTime } from './leadEmailLayout.ts'

/**
 * Lo que necesitan los mails de demo (agendada, reprogramada, cancelada). Lo arman sus handlers.
 * Copiado de `visitScheduledEmail` de `propelia-frontend` (21/10/2026): la tarjeta del inmueble
 * pasa a ser la de la demo (cuándo y con quién) y no hay botón «Cómo llegar», que es online.
 */
export type DemoScheduledCtx = {
  startsAt: string
  /** La inmobiliaria: va en la tarjeta. */
  companyName: string | null
  clientFirstName: string | null
  clientEmail?: string | null
  agent: LeadEmailAgent
  org: LeadEmailOrg
  /** Base pública de los PNG del mail (íconos Lucide y decoración de la cabecera). */
  assetsBaseUrl: string
  /** Cuánto color de marca lleva (ver `LeadEmailTheme`). Por defecto 'acento', el elegido (21/10/2026). */
  tema?: LeadEmailTheme
}

/** Logo de Propelia en color sobre transparente (410×150), publicado por propelia-landing. El de
    las plantillas de «Mensajes» es la versión blanca: va sobre la cabecera azul, ésta es blanca. */
export const PROPELIA_LOGO_URL = 'https://www.propelia.es/assets/lockup_h.png'

/** Marca de Propelia en los mails al lead (el azul de las plantillas de «Mensajes»). El lockup ya
    dice «propelia»: la cabecera muestra solo el logo (120×44, la proporción del PNG). */
export const PROPELIA_ORG: LeadEmailOrg = {
  name: 'Propelia',
  logoUrl: PROPELIA_LOGO_URL,
  brandColor: '#0147FE',
  logoLockup: { width: 120, height: 44 },
  logoOnBrandUrl: 'https://www.propelia.es/assets/lockup_h_white.png',
}

const dateRow = (date: string, time: string) =>
  `<p style="margin:0;color:${INK};font-size:16px;line-height:1.4;">${escapeHtml(capitalize(date))}</p>
                  <p style="margin:4px 0 0;color:${SUBTLE};font-size:13px;line-height:1.4;">a las ${escapeHtml(time)} (hora de España)</p>`

/** La primera fila de la tarjeta: qué es y para quién. */
function demoRowHtml(ctx: DemoScheduledCtx, faded = false): string {
  const color = faded ? FADED : '#12314c'
  const company = ctx.companyName?.trim()
  return `<p style="margin:0;color:${color};font-size:18px;line-height:1.35;font-weight:700;letter-spacing:-0.2px;">Demo de Propelia</p>${
    company ? `\n                  <p style="margin:4px 0 0;color:${SUBTLE};font-size:13px;line-height:1.4;">Para ${escapeHtml(company)}</p>` : ''
  }`
}

const closing = (text: string) =>
  `<p style="margin:24px 0 0;color:${MUTED};font-size:14px;line-height:1.55;">${escapeHtml(text)}</p>`

const strong = (html: string) => `<strong style="font-weight:700;">${html}</strong>`

const layoutBase = (ctx: DemoScheduledCtx) => ({
  assetsBaseUrl: ctx.assetsBaseUrl,
  org: ctx.org,
  agent: ctx.agent,
  clientFirstName: ctx.clientFirstName,
  tema: ctx.tema ?? 'acento',
})

export function renderDemoScheduledEmail(ctx: DemoScheduledCtx): { subject: string; html: string } {
  const date = formatVisitDate(ctx.startsAt)
  const time = formatVisitTime(ctx.startsAt)
  const html = renderLeadEmailLayout({
    ...layoutBase(ctx),
    introHtml: `${strong(introName(ctx.agent, ctx.org))} te confirma la demo:`,
    card: {
      imageUrl: null,
      rows: [
        { icon: 'house', html: demoRowHtml(ctx) },
        { icon: 'calendar', html: dateRow(date, time) },
      ],
    },
    afterCardHtml: closing('Te llega también la invitación del calendario. Si no puedes a esa hora o quieres cambiarla, responde a este mail.'),
  })
  // El asunto es texto plano: sin escapar, pero sin datos del lead.
  return { subject: `Tu demo de Propelia está confirmada: ${date} a las ${time}`, html }
}

export function renderDemoRescheduledEmail(
  ctx: DemoScheduledCtx,
  previousStartsAt: string | null,
): { subject: string; html: string } {
  const date = formatVisitDate(ctx.startsAt)
  const time = formatVisitTime(ctx.startsAt)
  const label = (text: string, color: string, top: number) =>
    `<p style="margin:${top}px 0 2px;color:${color};font-size:11px;line-height:1.3;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;">${text}</p>`
  const before = previousStartsAt
    ? `${label('Antes', FADED, 0)}
                  <p style="margin:0;color:${FADED};line-height:1.4;text-decoration:line-through;font-size:14px;">${
      escapeHtml(capitalize(formatVisitDate(previousStartsAt)))
    } · ${escapeHtml(formatVisitTime(previousStartsAt))}</p>
                  ${label('Ahora', '#3644f2', 12)}`
    : ''
  const html = renderLeadEmailLayout({
    ...layoutBase(ctx),
    badgeHtml: badge('Nuevo horario', '#e8f0fe', '#3644f2'),
    introHtml: `${strong(introName(ctx.agent, ctx.org))} cambió el horario de tu demo:`,
    card: {
      imageUrl: null,
      rows: [
        { icon: 'house', html: demoRowHtml(ctx) },
        {
          icon: 'calendar',
          html: `${before}<p style="margin:0;color:${INK};font-size:16px;line-height:1.4;font-weight:700;">${escapeHtml(capitalize(date))}</p>
                  <p style="margin:4px 0 0;color:${SUBTLE};font-size:13px;line-height:1.4;">a las ${escapeHtml(time)} (hora de España)</p>`,
        },
      ],
    },
    afterCardHtml: closing('Si el nuevo horario no te viene bien, responde a este mail y lo ajustamos.'),
  })
  return { subject: `Cambió el horario de tu demo de Propelia: ${date} a las ${time}`, html }
}

export function renderDemoCancelledEmail(ctx: DemoScheduledCtx): { subject: string; html: string } {
  const date = formatVisitDate(ctx.startsAt)
  const time = formatVisitTime(ctx.startsAt)
  const agentEmail = ctx.agent.email?.trim()
  const html = renderLeadEmailLayout({
    ...layoutBase(ctx),
    badgeHtml: badge('Demo cancelada', '#fdecec', '#b42318'),
    introHtml: `${strong(introName(ctx.agent, ctx.org))} te avisa que se canceló la demo:`,
    card: {
      imageUrl: null,
      rows: [
        { icon: 'house', html: demoRowHtml(ctx, true) },
        {
          icon: 'calendar',
          html: `<p style="margin:0;color:${FADED};font-size:16px;line-height:1.4;text-decoration:line-through;">${
            escapeHtml(capitalize(date))
          }</p>
                  <p style="margin:4px 0 0;color:${FADED};font-size:13px;line-height:1.4;text-decoration:line-through;">a las ${escapeHtml(time)}</p>`,
        },
      ],
    },
    // Sin email de quien la manda no hay a quién escribir: el botón no sale y queda "responde a este mail".
    afterCardHtml: `${
      agentEmail ? ctaButton(ctx.org, `mailto:${agentEmail}?subject=${encodeURIComponent('Nueva demo de Propelia')}`, 'Agendar otra demo') : ''
    }

      ${closing('Si quieres ver Propelia otro día, responde a este mail y buscamos un nuevo horario.')}`,
  })
  return { subject: `Tu demo de Propelia del ${date} fue cancelada`, html }
}
