import { describe, expect, it } from 'vitest'
import {
  demoRecipientEmail, normalizeDemoScheduledRow, sameMailbox, type DemoScheduledRow,
} from '../../../../supabase/functions/_shared/leadNotifications/demoQuery'
import {
  createDemoCancelledHandler, createDemoRescheduledHandler, createDemoScheduledHandler,
} from '../../../../supabase/functions/_shared/leadNotifications/handlers/demoScheduled'
import type { LeadNotificationEvent } from '../../../../supabase/functions/_shared/leadNotifications/types'
import { contactarUrl, mensajeDeContacto } from '../../../../supabase/functions/_shared/leadNotifications/templates/demoScheduledEmail'
import { emailAssetsBaseUrl } from '../../../../supabase/functions/_shared/leadNotifications/assets'

/* Lo que las demos tienen distinto de las visitas del producto: a quién le llega, quién firma y qué
   dice el mail. El orquestador es el mismo y sus tests están en leadNotificationsDispatch.test.ts. */

const NOW = new Date('2030-01-01T00:00:00Z')
const EQUIPO = ['lorenzopiattifadda@gmail.com', 'antonio.piattifadda@gmail.com', 'lucia@propelia.es']

const row = (over: Partial<DemoScheduledRow> = {}): DemoScheduledRow => ({
  id: 'm1',
  status: 'scheduled',
  deleted_at: null,
  starts_at: '2030-01-10T09:00:00Z', // 10:00 en Madrid
  guest_emails: ['ana@inmo.es', 'lorenzo.piattifadda@gmail.com'],
  has_lead: true,
  lead_deleted_at: null,
  client: { first_name: 'Ana', company_name: 'Inmo Serrano', email: 'oficina@inmo.es', deleted_at: null },
  agent: {
    nombre: 'Lucía', last_name: 'Gómez', email: 'lucia@propelia.es', phone: '+34600111222', activo: true,
    firma_nombre: null, firma_cargo: null, firma_telefono: null,
  },
  ...over,
})

const ev = (type: string, payload: Record<string, unknown> = {}): LeadNotificationEvent => ({
  id: 'ev1', type, subject_id: 'm1', actor_user_id: 'u1', attempts: 1, payload,
})

const deps = (r: DemoScheduledRow | null) => ({
  db: { loadDemo: () => Promise.resolve(r), teamEmails: () => Promise.resolve(EQUIPO) },
  assetsBaseUrl: 'https://assets.example.com/v2',
})

describe('a quién le llega', () => {
  it('el mismo buzón de gmail con o sin puntos, sin mayúsculas', () => {
    expect(sameMailbox('Lorenzo.Piattifadda@gmail.com', 'lorenzopiattifadda@gmail.com')).toBe(true)
    expect(sameMailbox('lorenzo.p@empresa.es', 'lorenzop@empresa.es')).toBe(false)
  })
  it('el mail de la invitación, no Lorenzo ni nadie del equipo', () => {
    expect(demoRecipientEmail(row(), EQUIPO)).toBe('ana@inmo.es')
    expect(demoRecipientEmail(row({ guest_emails: ['lorenzo.piattifadda@gmail.com', 'lucia@propelia.es', 'ana@inmo.es'] }), EQUIPO)).toBe('ana@inmo.es')
  })
  it('sin invitado de afuera, el email de la inmobiliaria', () => {
    expect(demoRecipientEmail(row({ guest_emails: ['lorenzo.piattifadda@gmail.com'] }), EQUIPO)).toBe('oficina@inmo.es')
    expect(demoRecipientEmail(row({ guest_emails: [], client: null }), EQUIPO)).toBeNull()
  })
  it('normaliza lo que devuelve PostgREST (objeto o array)', () => {
    const r = normalizeDemoScheduledRow({
      id: 'm1', status: 'scheduled', deleted_at: null, starts_at: 'x', guest_emails: null,
      lead: [{ deleted_at: null, client: [{ first_name: 'Ana', company_name: 'Inmo', email: 'a@b.es', deleted_at: null }] }],
      agent: [{ nombre: 'Lucía' }],
    })
    expect(r.has_lead).toBe(true)
    expect(r.guest_emails).toEqual([])
    expect(r.client?.company_name).toBe('Inmo')
    expect(r.agent?.nombre).toBe('Lucía')
  })
})

describe('demo agendada', () => {
  it('manda al mail de la invitación, firmado por quien la tiene y con respuesta a su email de propelia', async () => {
    const h = createDemoScheduledHandler(deps(row()))
    const loaded = await h.load(ev('demo_scheduled'), NOW)
    if (!('ctx' in loaded)) throw new Error(JSON.stringify(loaded))
    expect(h.recipient('email', loaded.ctx)).toEqual({ to: 'ana@inmo.es' })
    expect(h.recipient('sms', loaded.ctx)).toEqual({ skip: 'channel_not_supported' })
    const msg = h.render('email', loaded.ctx, {}, 'ana@inmo.es')
    expect(msg.subject).toBe('Tu demo de Propelia está confirmada: jueves, 10 de enero a las 10:00')
    expect(msg.fromName).toBe('Lucía de Propelia')
    expect(msg.replyTo).toBe('lucia@propelia.es')
    expect(msg.html).toContain('Hola Ana,')
    expect(msg.html).toContain('Lucía Gómez')
    expect(msg.html).toContain('Para Inmo Serrano')
  })
  it('un gmail no es el reply-to: responde a info@propelia.es', async () => {
    const r = row({ agent: { ...row().agent!, email: 'lorenzopiattifadda@gmail.com' } })
    const h = createDemoScheduledHandler(deps(r))
    const loaded = await h.load(ev('demo_scheduled'), NOW)
    if (!('ctx' in loaded)) throw new Error(JSON.stringify(loaded))
    expect(h.render('email', loaded.ctx, {}, 'ana@inmo.es').replyTo).toBeUndefined()
  })
  it('no sale si la reunión no es de un lead, se canceló, ya pasó o quien la tiene se fue', async () => {
    const skip = async (r: DemoScheduledRow | null, now = NOW) => {
      const loaded = await createDemoScheduledHandler(deps(r)).load(ev('demo_scheduled'), now)
      return 'skip' in loaded ? loaded.skip : null
    }
    expect(await skip(null)).toBe('demo_deleted')
    expect(await skip(row({ has_lead: false, client: null }))).toBe('no_lead')
    expect(await skip(row({ status: 'cancelled' }))).toBe('demo_deleted')
    expect(await skip(row(), new Date('2030-02-01T00:00:00Z'))).toBe('demo_in_past')
    expect(await skip(row({ agent: { ...row().agent!, activo: false } }))).toBe('agent_inactive')
    expect(await skip(row({ lead_deleted_at: '2029-12-01T00:00:00Z' }))).toBe('lead_deleted')
  })
})

describe('demo reprogramada y cancelada', () => {
  it('reprogramada: el horario anterior tachado y el nuevo en el asunto', async () => {
    const h = createDemoRescheduledHandler(deps(row()))
    const loaded = await h.load(ev('demo_rescheduled', { previous_starts_at: '2030-01-08T16:00:00Z', starts_at: '2030-01-10T09:00:00Z' }), NOW)
    if (!('ctx' in loaded)) throw new Error(JSON.stringify(loaded))
    const msg = h.render('email', loaded.ctx, {}, 'ana@inmo.es')
    expect(msg.subject).toContain('Cambió el horario de tu demo de Propelia')
    expect(msg.subject).toContain('10:00')
    expect(msg.html).toContain('Nuevo horario')
    expect(msg.html).toContain('17:00')
  })
  it('reprogramada otra vez antes de salir: este se saltea', async () => {
    const loaded = await createDemoRescheduledHandler(deps(row()))
      .load(ev('demo_rescheduled', { starts_at: '2030-01-09T09:00:00Z' }), NOW)
    expect(loaded).toEqual({ skip: 'superseded' })
  })
  it('cancelada: badge y «Contactar» por WhatsApp para agendar otra', async () => {
    const h = createDemoCancelledHandler(deps(row({ status: 'cancelled' })))
    const loaded = await h.load(ev('demo_cancelled'), NOW)
    if (!('ctx' in loaded)) throw new Error(JSON.stringify(loaded))
    const msg = h.render('email', loaded.ctx, {}, 'ana@inmo.es')
    expect(msg.subject).toContain('fue cancelada')
    expect(msg.html).toContain('Demo cancelada')
    expect(msg.html).toContain('https://wa.me/34675249146?text=')
    expect(msg.html).toContain(encodeURIComponent('Me gustaría agendar otra.'))
  })
  it('cancelada pero reactivada antes de salir: no se manda', async () => {
    const loaded = await createDemoCancelledHandler(deps(row())).load(ev('demo_cancelled'), NOW)
    expect(loaded).toEqual({ skip: 'not_cancelled' })
  })
})

describe('diseño: tema acento', () => {
  it('es el de los tres mails: borde de arriba y burbujas en azul Propelia', async () => {
    for (const [h, r, type] of [
      [createDemoScheduledHandler, row(), 'demo_scheduled'],
      [createDemoRescheduledHandler, row(), 'demo_rescheduled'],
      [createDemoCancelledHandler, row({ status: 'cancelled' }), 'demo_cancelled'],
    ] as const) {
      const handler = h(deps(r))
      const loaded = await handler.load(ev(type), NOW)
      if (!('ctx' in loaded)) throw new Error(JSON.stringify(loaded))
      const { html } = handler.render('email', loaded.ctx, {}, 'ana@inmo.es')
      expect(html).toContain('border-top:5px solid #0147FE')
      expect(html).toContain('https://assets.example.com/v2/header-corner-brand.png')
      expect(html).toContain('https://www.propelia.es/assets/lockup_h.png')
    }
  })
})

describe('dónde viven los íconos', () => {
  it('en esta app si hay APP_BASE_URL, si no en el bucket del producto; EMAIL_ASSETS_BASE_URL pisa todo', () => {
    expect(emailAssetsBaseUrl(undefined, 'https://equipo.propelia.es/')).toBe('https://equipo.propelia.es/email/avisos')
    expect(emailAssetsBaseUrl(undefined, undefined)).toContain('gvkdyxhxsnpumxlhvhsm.supabase.co/storage/v1/object/public/email-assets/v2')
    expect(emailAssetsBaseUrl('https://otro.cdn/x', 'https://equipo.propelia.es')).toBe('https://otro.cdn/x')
  })
})

describe('botón Contactar', () => {
  const base = { startsAt: '2030-01-10T09:00:00Z', clientFirstName: 'Ana', companyName: 'Inmo Serrano' }
  it('va al WhatsApp fijo con el mensaje en la voz de la inmobiliaria', () => {
    expect(mensajeDeContacto(base, 'agendada')).toBe('¡Hola Propelia! Soy Ana, de Inmo Serrano. Os escribo por la demo del jueves, 10 de enero a las 10:00.')
    expect(mensajeDeContacto(base, 'mismoDia')).toBe('¡Hola Propelia! Soy Ana, de Inmo Serrano. Os escribo por la demo de hoy a las 10:00.')
    expect(contactarUrl(base, 'resena')).toMatch(/^https:\/\/wa\.me\/34675249146\?text=/)
  })
  it('sin nombre, con la empresa; sin nada, solo el saludo', () => {
    expect(mensajeDeContacto({ ...base, clientFirstName: null }, 'cancelada'))
      .toBe('¡Hola Propelia! Somos Inmo Serrano. Vi que se canceló la demo del jueves, 10 de enero. Me gustaría agendar otra.')
    expect(mensajeDeContacto({ ...base, clientFirstName: ' ', companyName: null }, 'diaAntes'))
      .toBe('¡Hola Propelia! Os escribo por la demo de mañana a las 10:00.')
  })
  it('los tres mails que salen lo llevan', async () => {
    for (const [h, r, type] of [
      [createDemoScheduledHandler, row(), 'demo_scheduled'],
      [createDemoRescheduledHandler, row(), 'demo_rescheduled'],
      [createDemoCancelledHandler, row({ status: 'cancelled' }), 'demo_cancelled'],
    ] as const) {
      const handler = h(deps(r))
      const loaded = await handler.load(ev(type), NOW)
      if (!('ctx' in loaded)) throw new Error(JSON.stringify(loaded))
      const { html } = handler.render('email', loaded.ctx, {}, 'ana@inmo.es')
      expect(html).toContain('>Contactar&nbsp;&rarr;</a>')
      expect(html).toContain('https://wa.me/34675249146?text=')
    }
  })
})
