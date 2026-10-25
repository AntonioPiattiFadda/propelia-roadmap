import { describe, expect, it } from 'vitest'
import { enlaceDeAvisoDeDemo, mensajeDeDemoAgendada, type DemoAgendada } from './avisoDeDemo'

// 28/10/2026 10:00 y 11:00 en Madrid (UTC+1 desde el 25/10).
const demo: DemoAgendada = {
  inmobiliaria: 'Inmobiliaria Serrano',
  ciudad: 'Madrid',
  inicio: '2026-10-28T09:00:00.000Z',
  fin: '2026-10-28T10:00:00.000Z',
  responsable: 'Luis',
  agendadaPor: 'Ana',
  emailCliente: 'info@serrano.es',
  asistentes: ['Marta', 'Jordi'],
  decisor: 'Jordi',
  etapa: 'Demo agendada',
  notas: 'Usan Inmovilla y quieren ver los avisos.',
}

describe('mensajeDeDemoAgendada', () => {
  it('festeja y lleva todo lo de la demo, con la hora de España', () => {
    const m = mensajeDeDemoAgendada(demo)
    expect(m.split('\n')[0]).toBe('🎉 ¡Nueva demo agendada! 🎉')
    expect(m).toContain('🏢 Inmobiliaria Serrano (Madrid)')
    expect(m).toContain('📅 Miércoles, 28 de octubre')
    expect(m).toContain('🕙 10:00 a 11:00 (hora de España)')
    expect(m).toContain('👤 Responsable: Luis')
    expect(m).toContain('✍️ La agendó: Ana')
    expect(m).toContain('📧 Invitación: info@serrano.es')
    expect(m).toContain('🙋 Asisten: Marta, Jordi')
    expect(m).toContain('⭐ Decisor: Jordi')
    expect(m).toContain('📍 El lead queda en: Demo agendada')
    expect(m).toContain('📝 Usan Inmovilla y quieren ver los avisos.')
    expect(m.trimEnd().endsWith('¡A por ella! 💪')).toBe(true)
  })

  it('lo que falta no deja renglones vacíos ni rótulos sueltos', () => {
    const m = mensajeDeDemoAgendada({
      ...demo, inmobiliaria: null, ciudad: null, responsable: null, agendadaPor: null,
      asistentes: [], decisor: '', etapa: null, notas: '  ',
    })
    expect(m).toContain('🏢 Inmobiliaria sin nombre')
    for (const rotulo of ['Responsable', 'La agendó', 'Asisten', 'Decisor', 'queda en', '📝']) expect(m).not.toContain(rotulo)
  })

  it('si quien agenda es el responsable, no lo repite', () => {
    expect(mensajeDeDemoAgendada({ ...demo, agendadaPor: 'Luis' })).not.toContain('La agendó')
  })
})

describe('enlaceDeAvisoDeDemo', () => {
  it('va al WhatsApp de Propelia con el mensaje escrito', () => {
    const url = enlaceDeAvisoDeDemo(demo)
    expect(url.startsWith('https://wa.me/34675249146?text=')).toBe(true)
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(mensajeDeDemoAgendada(demo))
  })
  it('en el ordenador va directo a WhatsApp Web, que la redirección de wa.me rompe los emojis', () => {
    const url = enlaceDeAvisoDeDemo(demo, { web: true })
    expect(url.startsWith('https://web.whatsapp.com/send?phone=34675249146&text=')).toBe(true)
    expect(decodeURIComponent(url.split('&text=')[1])).toBe(mensajeDeDemoAgendada(demo))
  })
})
