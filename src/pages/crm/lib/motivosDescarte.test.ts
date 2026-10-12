import { describe, expect, it } from 'vitest'
import {
  GRUPOS_DE_DESCARTE, MOTIVOS_DE_DESCARTE, etiquetaDeMotivo, fechaDeRecontacto, fmtFechaCompleta, grupoDeMotivo,
  paraRecontactar, recontactoDeMotivo,
} from './motivosDescarte'

describe('catálogo de motivos de descarte', () => {
  it('son ocho, cuatro por grupo, con códigos únicos', () => {
    expect(MOTIVOS_DE_DESCARTE).toHaveLength(8)
    expect(new Set(MOTIVOS_DE_DESCARTE.map(m => m.code)).size).toBe(8)
    for (const g of GRUPOS_DE_DESCARTE) expect(MOTIVOS_DE_DESCARTE.filter(m => m.grupo === g.id)).toHaveLength(4)
  })
  it('el grupo que puede calificar avisa que se lo vuelve a llamar en 6 meses', () => {
    expect(GRUPOS_DE_DESCARTE.find(g => g.id === 'podria_calificar')?.detalle).toMatch(/6 meses/)
  })
})

describe('etiquetaDeMotivo', () => {
  it('traduce un código conocido', () => {
    expect(etiquetaDeMotivo('too_small')).toBe('Muy chica hoy (poco volumen)')
  })
  it('un texto libre viejo se devuelve tal cual', () => {
    expect(etiquetaDeMotivo('  No tiene presupuesto ')).toBe('No tiene presupuesto')
  })
  it('vacío es null', () => {
    expect(etiquetaDeMotivo(null)).toBeNull()
    expect(etiquetaDeMotivo('   ')).toBeNull()
  })
})

describe('grupoDeMotivo', () => {
  it('dice el grupo de un código', () => {
    expect(grupoDeMotivo('closed')?.id).toBe('no_califica')
    expect(grupoDeMotivo('no_budget')?.id).toBe('podria_calificar')
  })
  it('un texto libre no tiene grupo', () => {
    expect(grupoDeMotivo('lo que sea')).toBeNull()
    expect(grupoDeMotivo(null)).toBeNull()
  })
})

describe('fechaDeRecontacto', () => {
  it('suma seis meses', () => {
    expect(fechaDeRecontacto('2026-10-10')).toBe('2027-04-10')
  })
  it('un día que no existe en el mes de llegada cae en el último del mes', () => {
    expect(fechaDeRecontacto('2026-08-31')).toBe('2027-02-28')
    expect(fechaDeRecontacto('2027-08-31')).toBe('2028-02-29')
  })
})

describe('recontactoDeMotivo', () => {
  it('solo los que podrían calificar llevan fecha', () => {
    expect(recontactoDeMotivo('has_tool', '2026-10-10')).toBe('2027-04-10')
    expect(recontactoDeMotivo('do_not_contact', '2026-10-10')).toBeNull()
  })
})

describe('paraRecontactar', () => {
  it('descartado con la fecha cumplida (hoy incluido)', () => {
    expect(paraRecontactar({ recontact_at: '2026-10-10' }, true, '2026-10-10')).toBe(true)
    expect(paraRecontactar({ recontact_at: '2026-01-01' }, true, '2026-10-10')).toBe(true)
  })
  it('con la fecha por venir, sin fecha o fuera del descarte: no', () => {
    expect(paraRecontactar({ recontact_at: '2026-10-11' }, true, '2026-10-10')).toBe(false)
    expect(paraRecontactar({ recontact_at: null }, true, '2026-10-10')).toBe(false)
    expect(paraRecontactar({ recontact_at: '2026-01-01' }, false, '2026-10-10')).toBe(false)
  })
})

describe('fmtFechaCompleta', () => {
  it('DD/MM/AAAA sin pasar por Date', () => {
    expect(fmtFechaCompleta('2027-04-10')).toBe('10/04/2027')
  })
})
