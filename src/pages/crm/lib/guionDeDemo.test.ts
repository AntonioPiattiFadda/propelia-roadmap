import { describe, expect, it } from 'vitest'
import { ETAPAS_DEL_GUION, idDeLaFilaDelGuion, textoDeLasNotasDeDemo } from './guionDeDemo'

describe('textoDeLasNotasDeDemo', () => {
  it('lo anotado va a la actividad tal cual, sin espacios de sobra (el título lo pone el renglón)', () => {
    expect(textoDeLasNotasDeDemo('\n  Son 4, decide Ana.\nLes gustó el bot.  \n')).toBe('Son 4, decide Ana.\nLes gustó el bot.')
  })

  it('sin nada escrito no hay qué registrar', () => {
    expect(textoDeLasNotasDeDemo('  \n ')).toBeNull()
  })
})

describe('el guion', () => {
  it('va en el orden de la demo, con encuadre y storytelling juntos', () => {
    expect(ETAPAS_DEL_GUION.map(e => e.id)).toEqual(['encuadre', 'diagnostico', 'demo', 'planes', 'prueba'])
  })

  it('el encuadre arranca por los 20 minutos', () => {
    expect(ETAPAS_DEL_GUION[0].detalle?.[0].items[0]).toMatch(/20 minutos/)
  })

  it('planes y prueba gratis no llevan detalle: son solo guía', () => {
    const sinDetalle = ETAPAS_DEL_GUION.filter(e => !e.detalle).map(e => e.id)
    expect(sinDetalle).toEqual(['planes', 'prueba'])
  })

  it('la demo del CRM incluye el seguimiento y los reportes al responsable', () => {
    const demo = ETAPAS_DEL_GUION.find(e => e.id === 'demo')!
    const crm = demo.detalle!.find(g => g.titulo === 'CRM')!
    expect(crm.items.some(i => /reportes al responsable/i.test(i))).toBe(true)
  })
})

describe('idDeLaFilaDelGuion', () => {
  it('lleva el prefijo propio, para no leerse como otra fila de roadmap_notas', () => {
    expect(idDeLaFilaDelGuion('abc')).toBe('demo-guion-abc')
  })
})
