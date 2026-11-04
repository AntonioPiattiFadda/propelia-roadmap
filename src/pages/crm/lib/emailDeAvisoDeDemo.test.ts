import { describe, expect, it } from 'vitest'
import { createDemoScheduledHandler } from '../../../../supabase/functions/_shared/leadNotifications/handlers/demoScheduled'
import type { DemoScheduledRow } from '../../../../supabase/functions/_shared/leadNotifications/demoQuery'
import {
  assetsDeLosAvisos, deLaBandeja, destinatarioDelAviso, esAvisoDeDemo, inicioDeEjemplo, muestraDeAvisoDeDemo, renderAvisoDeDemo,
} from './emailDeAvisoDeDemo'

const LUCIA = {
  nombre: 'Lucía', last_name: 'Gómez', email: 'lucia@propelia.es', phone: '+34600111222',
  firma_nombre: null, firma_cargo: null, firma_telefono: null,
}
const ASSETS = 'https://assets.example.com/v2'

describe('«Ver email» de los avisos de demo', () => {
  it('es el mismo mail que manda el dispatcher (asunto, html y bandeja)', async () => {
    const row: DemoScheduledRow = {
      id: 'm1', status: 'scheduled', deleted_at: null, starts_at: '2030-01-10T09:00:00Z', guest_emails: ['ana@inmo.es'],
      has_lead: true, lead_deleted_at: null,
      client: { first_name: 'Ana', company_name: 'Inmo Serrano', email: 'oficina@inmo.es', deleted_at: null },
      agent: { ...LUCIA, activo: true },
    }
    const h = createDemoScheduledHandler({
      db: { loadDemo: () => Promise.resolve(row), teamEmails: () => Promise.resolve([]) }, assetsBaseUrl: ASSETS,
    })
    const loaded = await h.load({ id: 'e', type: 'demo_scheduled', subject_id: 'm1', actor_user_id: 'u', attempts: 1 }, new Date('2030-01-01'))
    if (!('ctx' in loaded)) throw new Error('no cargó')
    const real = h.render('email', loaded.ctx, {}, 'ana@inmo.es')

    const vista = renderAvisoDeDemo('demo_scheduled', {
      inicio: row.starts_at, inmobiliaria: 'Inmo Serrano', nombreDelCliente: 'Ana', firmante: LUCIA, assets: ASSETS,
    })
    expect(vista.subject).toBe(real.subject)
    expect(vista.html).toBe(real.html)
    expect(vista.from).toBe(real.fromName)
    expect(deLaBandeja(LUCIA)).toBe('Lucía de Propelia <info@propelia.es>')
  })

  it('reprogramada lleva el horario anterior y cancelada el tachado', () => {
    const base = { inicio: '2030-01-10T09:00:00Z', inmobiliaria: 'Inmo', nombreDelCliente: 'Ana', firmante: LUCIA, assets: ASSETS }
    const re = renderAvisoDeDemo('demo_rescheduled', { ...base, inicioAnterior: '2030-01-09T15:00:00Z' })
    expect(re.subject).toMatch(/^Cambió el horario/)
    expect(re.html).toContain('Antes')
    expect(renderAvisoDeDemo('demo_cancelled', base).subject).toMatch(/fue cancelada$/)
  })

  it('a quién le llega: el invitado de afuera, no Lorenzo ni info@, y si no la inmobiliaria', () => {
    expect(destinatarioDelAviso(['lorenzopiattifadda@gmail.com', 'info@propelia.es', 'ana@inmo.es'], 'of@inmo.es', ['lucia@propelia.es'])).toBe('ana@inmo.es')
    expect(destinatarioDelAviso(['lucia@propelia.es'], 'of@inmo.es', ['lucia@propelia.es'])).toBe('of@inmo.es')
    expect(destinatarioDelAviso([], null, [])).toBeNull()
  })

  it('la muestra de Ajustes: pasado mañana, con un horario anterior el día antes', () => {
    const { inicio, anterior } = inicioDeEjemplo(new Date('2030-03-01T20:00:00Z'))
    expect(inicio).toBe('2030-03-03T09:00:00.000Z')
    expect(anterior).toBe('2030-03-02T15:00:00.000Z')
    const m = muestraDeAvisoDeDemo('demo_scheduled', null, ASSETS, new Date('2030-03-01T20:00:00Z'))
    expect(m.html).toContain('Inmobiliaria Serrano')
    expect(m.from).toBe('Propelia')
  })

  it('los íconos salen de esta app y solo hay vista previa de los tres avisos con plantilla', () => {
    expect(assetsDeLosAvisos('https://propelia-roadmap.vercel.app')).toBe('https://propelia-roadmap.vercel.app/email/avisos')
    expect(esAvisoDeDemo('demo_cancelled')).toBe(true)
    expect(esAvisoDeDemo('demo_review_request')).toBe(false)
  })
})
