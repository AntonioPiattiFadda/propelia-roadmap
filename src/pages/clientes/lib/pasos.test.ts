import { describe, expect, it } from 'vitest'
import { PASOS, PASOS_ABIERTOS, PASOS_EN_PAUSA, claveDeTarea, clavesDeTarea, listoParaCompletar, pasoActual, pasoHecho, pasosHechos, tareaReunionHecha } from './pasos'

const hechasHasta = (n: number) => new Set(PASOS.slice(0, n).flatMap(p => p.tareas.flatMap(t => clavesDeTarea(p.id, t))))

describe('el catálogo', () => {
  it('son 6 pasos y hoy se trabajan los dos primeros', () => {
    expect(PASOS).toHaveLength(6)
    expect(PASOS_ABIERTOS.map(p => p.id)).toEqual(['contacto', 'pago'])
  })
  it('el paso 1 es «Dar de alta» y los accesos, con los ids de siempre', () => {
    expect(PASOS[0].tareas.map(t => claveDeTarea('contacto', t.id))).toEqual(['contacto.importar-usuarios', 'contacto.credenciales'])
  })
  it('ningún task_id se repite, contando los pasos en pausa', () => {
    const claves = [...PASOS, ...PASOS_EN_PAUSA].flatMap(p => p.tareas.flatMap(t => clavesDeTarea(p.id, t)))
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('pasoActual', () => {
  it('sin nada hecho, el primero', () => expect(pasoActual(new Set())).toBe(0))
  it('el primero con algo sin hacer, aunque haya tareas tildadas más adelante', () => {
    const hechas = new Set([claveDeTarea('pago', 'link-pago'), claveDeTarea('pago', 'pago')])
    expect(pasoActual(hechas)).toBe(0)
    expect(pasoActual(hechasHasta(1))).toBe(1)
  })
  it('con los abiertos hechos, null: los de «Próximamente» no cuentan', () => {
    expect(pasoActual(hechasHasta(2))).toBeNull()
    expect(listoParaCompletar(hechasHasta(2))).toBe(true)
  })
})

describe('pasosHechos', () => {
  it('cuenta solo los abiertos', () => {
    expect(pasosHechos(hechasHasta(1))).toBe(1)
    expect(pasosHechos(hechasHasta(6))).toBe(2)
  })
})

describe('las reuniones de capacitación (en pausa)', () => {
  const paso = PASOS_EN_PAUSA.find(p => p.id === 'cartera-leads')!
  it('van arriba del tutorial de leads, primero la del equipo', () => {
    const ids = paso.tareas.map(t => t.id)
    expect(ids.indexOf('reunion-equipo')).toBe(ids.indexOf('tutorial-leads') - 2)
    expect(ids.indexOf('reunion-dueno')).toBe(ids.indexOf('tutorial-leads') - 1)
  })
  it('agendada no alcanza: el paso pide además que se hizo', () => {
    const todas = new Set(paso.tareas.flatMap(t => clavesDeTarea(paso.id, t)))
    expect(pasoHecho(paso, todas)).toBe(true)
    todas.delete(tareaReunionHecha('cartera-leads', 'reunion-dueno'))
    expect(todas.has(claveDeTarea('cartera-leads', 'reunion-dueno'))).toBe(true)
    expect(pasoHecho(paso, todas)).toBe(false)
  })
})
