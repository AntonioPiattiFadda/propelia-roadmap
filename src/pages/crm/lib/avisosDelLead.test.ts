import { describe, expect, it } from 'vitest'
import { avisosPendientesDelLead, avisosPendientesPara, puedeMarcarAviso, type AvisoDelLead } from './avisosDelLead'

const aviso = (p: Partial<AvisoDelLead>): AvisoDelLead => ({
  id: 'a', lead_id: 'l1', texto: 'Falta el decisor', para: 'ana', created_by: 'toni',
  created_at: '2026-11-19T10:00:00Z', resuelto_at: null, resuelto_por: null, lead: null, ...p,
})

describe('avisosPendientesDelLead', () => {
  it('trae los pendientes de ese lead, el más nuevo arriba', () => {
    const lista = [
      aviso({ id: 'viejo', created_at: '2026-11-18T10:00:00Z' }),
      aviso({ id: 'nuevo', created_at: '2026-11-19T10:00:00Z' }),
      aviso({ id: 'listo', resuelto_at: '2026-11-19T11:00:00Z' }),
      aviso({ id: 'otro', lead_id: 'l2' }),
    ]
    expect(avisosPendientesDelLead(lista, 'l1').map(a => a.id)).toEqual(['nuevo', 'viejo'])
  })
})

describe('avisosPendientesPara', () => {
  it('solo los de esa persona y sin marcar', () => {
    const lista = [aviso({ id: 'mio' }), aviso({ id: 'de-otro', para: 'luis' }), aviso({ id: 'listo', resuelto_at: 'x' })]
    expect(avisosPendientesPara(lista, 'ana').map(a => a.id)).toEqual(['mio'])
    expect(avisosPendientesPara(lista, null)).toEqual([])
  })
})

describe('puedeMarcarAviso', () => {
  it('quien escribe el lead o el destinatario', () => {
    expect(puedeMarcarAviso(aviso({}), 'ana', false)).toBe(true)
    expect(puedeMarcarAviso(aviso({}), 'luis', false)).toBe(false)
    expect(puedeMarcarAviso(aviso({}), 'luis', true)).toBe(true)
  })
})
