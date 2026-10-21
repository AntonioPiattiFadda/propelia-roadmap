/**
 * Previews de los mails de «Avisos a leads», con las funciones REALES del template (no un mock).
 * El equivalente de `previewVisitScheduledEmail.ts` de `propelia-frontend` (21/10/2026).
 *
 *   node docs/avisosALeads/generar.ts             → reescribe los *-generated.html (los 3 que salen hoy)
 *   node docs/avisosALeads/generar.ts --previews  → además siembra los *-preview.html (los 6), PISANDO
 *                                                   lo que se haya editado a mano en ellos
 *
 * Cómo se itera (igual que allá): se edita a mano el *-preview.html y se mira en index.html; cuando
 * se acepta, se pasa a `supabase/functions/_shared/leadNotifications/templates/demoScheduledEmail.ts`
 * (la fuente real) y se corre esto para ver el -generated y compararlo. Node 24 corre el .ts directo.
 * Los íconos van relativos (`icons/`): los .html se abren desde esta carpeta.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROPELIA_ORG,
  renderDemoCancelledEmail,
  renderDemoRescheduledEmail,
  renderDemoScheduledEmail,
  type DemoScheduledCtx,
} from '../../supabase/functions/_shared/leadNotifications/templates/demoScheduledEmail.ts'
import {
  badge,
  capitalize,
  ctaButton,
  escapeHtml,
  formatVisitDate,
  formatVisitTime,
  INK,
  introName,
  MUTED,
  renderLeadEmailLayout,
  SUBTLE,
} from '../../supabase/functions/_shared/leadNotifications/templates/leadEmailLayout.ts'

const DIR = dirname(fileURLToPath(import.meta.url))

// Datos de ejemplo. 2026-10-28 09:00 UTC = miércoles 28 de octubre, 10:00 en Madrid.
const ctx: DemoScheduledCtx = {
  startsAt: '2026-10-28T09:00:00Z',
  companyName: 'Inmobiliaria Serrano',
  clientFirstName: 'Ana',
  clientEmail: 'ana@inmoserrano.es',
  agent: { firstName: 'Lucía Gómez', lastName: '', email: 'lucia@propelia.es', phone: '+34 612 345 678' },
  org: PROPELIA_ORG,
  assetsBaseUrl: 'icons',
}
const ANTES = '2026-10-27T16:00:00Z'

// ── Los «Próximamente»: borradores con el mismo layout, todavía sin handler ──────────────────
const date = formatVisitDate(ctx.startsAt)
const time = formatVisitTime(ctx.startsAt)
const strong = (html: string) => `<strong style="font-weight:700;">${html}</strong>`
const closing = (text: string) => `<p style="margin:24px 0 0;color:${MUTED};font-size:14px;line-height:1.55;">${escapeHtml(text)}</p>`
const demoRow = `<p style="margin:0;color:#12314c;font-size:18px;line-height:1.35;font-weight:700;letter-spacing:-0.2px;">Demo de Propelia</p>
                  <p style="margin:4px 0 0;color:${SUBTLE};font-size:13px;line-height:1.4;">Para ${escapeHtml(ctx.companyName!)}</p>`
const whenRow = (top: string, bottom: string) =>
  `<p style="margin:0;color:${INK};font-size:16px;line-height:1.4;">${escapeHtml(top)}</p>
                  <p style="margin:4px 0 0;color:${SUBTLE};font-size:13px;line-height:1.4;">${escapeHtml(bottom)}</p>`
// Mismo tema que los reales: 'acento' (franja y burbujas azules), el elegido el 21/10/2026.
const base = { assetsBaseUrl: ctx.assetsBaseUrl, org: ctx.org, agent: ctx.agent, clientFirstName: ctx.clientFirstName, tema: 'acento' as const }
const pila = ctx.agent.firstName.split(' ')[0]

function recordatorioDiaAntes() {
  const html = renderLeadEmailLayout({
    ...base,
    badgeHtml: badge('Recordatorio', '#e8f0fe', '#3644f2'),
    introHtml: `Te recordamos que mañana tienes la demo con ${strong(introName(ctx.agent, ctx.org))}:`,
    card: { imageUrl: null, rows: [{ icon: 'house', html: demoRow }, { icon: 'calendar', html: whenRow(capitalize(date), `a las ${time} (hora de España)`) }] },
    afterCardHtml: closing('Si al final no puedes o quieres cambiar la hora, responde a este mail y avisamos con tiempo.'),
  })
  return { subject: `Mañana es tu demo de Propelia, a las ${time}`, html }
}

function recordatorioMismoDia() {
  const tel = ctx.agent.phone ? `tel:${ctx.agent.phone.replace(/\s+/g, '')}` : null
  const html = renderLeadEmailLayout({
    ...base,
    badgeHtml: badge('Tu demo es hoy', '#e8f0fe', '#3644f2'),
    introHtml: `¡Hoy es el día! ${strong(introName(ctx.agent, ctx.org))} te espera a las ${escapeHtml(time)}:`,
    card: { imageUrl: null, rows: [{ icon: 'house', html: demoRow }, { icon: 'calendar', html: whenRow(`Hoy, ${date}`, `a las ${time} (hora de España)`) }] },
    afterCardHtml: `${tel ? ctaButton(ctx.org, tel, `Llamar a ${pila}`) : ''}

      ${closing(`Si se te complica, avísale a ${pila} por teléfono o responde a este mail.`)}`,
  })
  return { subject: `Hoy a las ${time} es tu demo de Propelia`, html }
}

function pedidoDeResena() {
  // Las estrellas son enlaces (Gmail no corre formularios): cada una abre un mail con la nota.
  const star = (n: number) =>
    `<td style="padding:0 4px;"><a href="mailto:${escapeHtml(ctx.agent.email ?? '')}?subject=${encodeURIComponent(`Mi nota de la demo: ${n}/5`)}" style="font-size:30px;line-height:1;color:#f5b301;text-decoration:none;" title="${n} de 5">&#9733;</a></td>`
  const html = renderLeadEmailLayout({
    ...base,
    introHtml: `Gracias por ver Propelia con ${strong(introName(ctx.agent, ctx.org))}. Tu opinión nos ayuda a mejorar:`,
    card: { imageUrl: null, rows: [{ icon: 'house', html: demoRow }, { icon: 'calendar', html: whenRow(`Fue el ${date}`, `a las ${time}`) }] },
    afterCardHtml: `<p style="margin:26px 0 8px;color:${INK};font-size:16px;line-height:1.4;font-weight:700;">¿Qué te pareció la demo?</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${[1, 2, 3, 4, 5].map(star).join('')}</tr></table>
      <p style="margin:6px 0 0;color:${SUBTLE};font-size:12px;line-height:1.4;">Toca una estrella para puntuar. Te lleva menos de un minuto.</p>
      ${ctaButton(ctx.org, `mailto:${ctx.agent.email ?? ''}?subject=${encodeURIComponent('Comentario sobre la demo')}`, 'Dejar un comentario', 22)}

      ${closing('¿Quieres seguir con Propelia o te quedaron dudas? Responde a este mail y lo vemos.')}`,
  })
  return { subject: '¿Qué te pareció la demo de Propelia?', html }
}

// ── Escritura ─────────────────────────────────────────────────────────────────────────────────
/** El asunto va en un comentario al principio: el visor (index.html) lo lee de ahí. */
function conCabecera(html: string, subject: string, nota: string) {
  return html.replace('<html lang="es">', `<html lang="es"><!--\n  ${nota}\n  Asunto: ${subject}\n-->`)
}

const reales = [
  ['demo-scheduled', renderDemoScheduledEmail(ctx)],
  ['demo-rescheduled', renderDemoRescheduledEmail(ctx, ANTES)],
  ['demo-cancelled', renderDemoCancelledEmail(ctx)],
] as const
const borradores = [
  ['demo-reminder-day-before', recordatorioDiaAntes()],
  ['demo-reminder-same-day', recordatorioMismoDia()],
  ['demo-review-request', pedidoDeResena()],
] as const

for (const [name, { subject, html }] of reales) {
  const file = join(DIR, `${name}-generated.html`)
  writeFileSync(file, conCabecera(html, subject, 'GENERADO con el template real (generar.ts). No se edita: se regenera.'))
  console.log(`${name}-generated.html  ·  ${subject}`)
}

if (process.argv.includes('--previews')) {
  for (const [name, { subject, html }] of [...reales, ...borradores]) {
    writeFileSync(join(DIR, `${name}-preview.html`), conCabecera(html, subject,
      'PREVIEW ESTÁTICO (aviso a la inmobiliaria). Datos de ejemplo. Se edita a mano para iterar; cuando se\n' +
      '  acepta, se pasa a supabase/functions/_shared/leadNotifications/templates/demoScheduledEmail.ts.'))
    console.log(`${name}-preview.html  ·  ${subject}`)
  }
}
