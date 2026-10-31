import { describe, expect, it } from 'vitest'
import { PASOS, PASOS_ABIERTOS, claveDeTarea, clavesDeTarea, listoParaCompletar, pasoActual, pasoHecho, pasosHechos, tareaReunionHecha } from './pasos'

const hechasHasta = (n: number) => new Set(PASOS.slice(0, n).flatMap(p => p.tareas.flatMap(t => clavesDeTarea(p.id, t))))

describe('el catálogo', () => {
  it('son 8 pasos y hoy se trabajan los cuatro primeros', () => {
    expect(PASOS).toHaveLength(8)
    expect(PASOS_ABIERTOS.map(p => p.id)).toEqual(['contacto', 'cartera-leads', 'mcp', 'pago'])
  })
  it('ningún task_id se repite', () => {
    const claves = PASOS.flatMap(p => p.tareas.flatMap(t => clavesDeTarea(p.id, t)))
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('pasoActual', () => {
  it('sin nada hecho, el primero', () => expect(pasoActual(new Set())).toBe(0))
  it('el primero con algo sin hacer, aunque haya tareas tildadas más adelante', () => {
    const hechas = hechasHasta(1)
    hechas.add(claveDeTarea('mcp', 'tutoriales'))
    expect(pasoActual(hechas)).toBe(1)
  })
  it('con los abiertos hechos, null: los de «Próximamente» no cuentan', () => {
    expect(pasoActual(hechasHasta(4))).toBeNull()
    expect(listoParaCompletar(hechasHasta(4))).toBe(true)
  })
})

describe('pasosHechos', () => {
  it('cuenta solo los abiertos', () => {
    expect(pasosHechos(hechasHasta(2))).toBe(2)
    expect(pasosHechos(hechasHasta(8))).toBe(4)
  })
})

describe('las reuniones de capacitación', () => {
  const paso = PASOS.find(p => p.id === 'cartera-leads')!
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
