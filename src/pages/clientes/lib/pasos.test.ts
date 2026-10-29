import { describe, expect, it } from 'vitest'
import { PASOS, PASOS_ABIERTOS, claveDeTarea, listoParaCompletar, pasoActual, pasosHechos } from './pasos'

const hechasHasta = (n: number) => new Set(PASOS.slice(0, n).flatMap(p => p.tareas.map(t => claveDeTarea(p.id, t.id))))

describe('el catálogo', () => {
  it('son 8 pasos y hoy se trabajan los cuatro primeros', () => {
    expect(PASOS).toHaveLength(8)
    expect(PASOS_ABIERTOS.map(p => p.id)).toEqual(['contacto', 'cartera-leads', 'mcp', 'pago'])
  })
  it('ningún task_id se repite', () => {
    const claves = PASOS.flatMap(p => p.tareas.map(t => claveDeTarea(p.id, t.id)))
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
