import { describe, expect, it } from 'vitest'
import { armarMetaDeActividad } from './actividad'
import { esObjetivo, objetivosDe, pendientesDePersona, semanasHaciaAtras, sumarResumenes, tasaDeDecisor } from './objetivos'
import type { CrmLeadRow, CrmStage, CrmTask } from '../types'

const llamada = (lead_id: string, resultado: 'contestada' | 'no_respondida', decisor?: boolean, con: string[] = [], created_at = '2026-11-03T10:00:00Z') => ({
  lead_id,
  created_at,
  long_description: armarMetaDeActividad({ tipo: 'llamada', con, resultado, ...(decisor !== undefined && { decisor }) }),
})

const cero = { contestadas: 0, decisores: 0, decisoresNuevos: 0, noRespondidas: 0, presentaciones: 0, demos: 0 }

describe('objetivosDe', () => {
  const r = objetivosDe(
    [
      llamada('a', 'contestada', true, ['Ana']),
      llamada('a', 'no_respondida'),
      llamada('b', 'contestada'),
      llamada('c', 'no_respondida'),
      llamada('c', 'no_respondida'),
      { lead_id: 'd', created_at: '2026-11-03T10:00:00Z', long_description: null }, // una nota: no cuenta
    ],
    [{ lead_id: 'b' }, { lead_id: 'e' }, { lead_id: null }],
    { presentaciones: [{ lead_id: 'b' }, { lead_id: 'f' }] },
  )

  it('cuenta llamadas, mails y demos, no leads', () => {
    expect(r.resumen).toEqual({ contestadas: 2, decisores: 1, decisoresNuevos: 1, noRespondidas: 3, presentaciones: 2, demos: 3 })
  })

  it('junta los leads de cada número, sin repetir', () => {
    expect([...r.leads.contestadas].sort()).toEqual(['a', 'b'])
    expect([...r.leads.decisores]).toEqual(['a'])
    expect([...r.leads.decisoresNuevos]).toEqual(['a'])
    expect([...r.leads.noRespondidas].sort()).toEqual(['a', 'c'])
    expect([...r.leads.presentaciones].sort()).toEqual(['b', 'f'])
    expect([...r.leads.demos].sort()).toEqual(['b', 'e'])
  })

  describe('decisores nuevos', () => {
    const antes = '2026-10-20T10:00:00Z'
    const nuevos = (mias: ReturnType<typeof llamada>[], historial: ReturnType<typeof llamada>[]) =>
      objetivosDe(mias, [], { historial }).resumen.decisoresNuevos

    it('no cuenta al decisor con quien ya se habló antes, lo haya llamado quien sea', () => {
      expect(nuevos([llamada('a', 'contestada', true, ['Ana'])], [llamada('a', 'contestada', true, ['ana '], antes)])).toBe(0)
    })

    it('cuenta a un decisor distinto del mismo lead', () => {
      expect(nuevos([llamada('a', 'contestada', true, ['Pablo'])], [llamada('a', 'contestada', true, ['Ana'], antes)])).toBe(1)
    })

    it('la segunda llamada de la semana con el mismo decisor ya no es nueva', () => {
      expect(nuevos([
        llamada('a', 'contestada', true, ['Ana'], '2026-11-03T10:00:00Z'),
        llamada('a', 'contestada', true, ['Ana'], '2026-11-04T10:00:00Z'),
      ], [])).toBe(1)
    })

    it('sin saber con quién, es nuevo solo si el lead nunca había tenido una con decisor', () => {
      expect(nuevos([llamada('a', 'contestada', true)], [])).toBe(1)
      expect(nuevos([llamada('a', 'contestada', true)], [llamada('a', 'contestada', true, ['Ana'], antes)])).toBe(0)
    })

    it('una contestada sin decisor antes no le quita lo nuevo', () => {
      expect(nuevos([llamada('a', 'contestada', true, ['Ana'])], [llamada('a', 'contestada', false, ['Ana'], antes)])).toBe(1)
    })
  })
})

describe('esObjetivo', () => {
  it('acepta solo los de la lista', () => {
    expect(esObjetivo('demos')).toBe(true)
    expect(esObjetivo('presentaciones')).toBe(true)
    expect(esObjetivo('otra')).toBe(false)
    expect(esObjetivo(null)).toBe(false)
  })
})

describe('semanasHaciaAtras', () => {
  // 2026-11-04 es miércoles: la semana arranca el lunes 2.
  const hoy = '2026-11-04'

  it('da la actual primera y nombra las dos más cercanas', () => {
    const s = semanasHaciaAtras(hoy, 3)
    expect(s.map(x => x.desde)).toEqual(['2026-11-02', '2026-10-26', '2026-10-19'])
    expect(s.map(x => x.label)).toEqual(['Esta semana', 'Semana pasada', '19 oct – 25 oct'])
  })

  it('la semana en curso termina mañana, como el contador; las pasadas, el lunes siguiente', () => {
    const [actual, pasada] = semanasHaciaAtras(hoy, 2)
    expect(actual.hasta).toBe('2026-11-05')
    expect(pasada.hasta).toBe('2026-11-02')
  })

  it('salta semanas con el desplazamiento', () => {
    expect(semanasHaciaAtras(hoy, 2, 6).map(x => x.desde)).toEqual(['2026-09-21', '2026-09-14'])
  })

  it('pone el año cuando la semana es de otro', () => {
    expect(semanasHaciaAtras('2026-01-14', 3)[2].label).toBe('29 dic 25 – 4 ene')
  })
})

describe('sumarResumenes', () => {
  it('suma objetivo por objetivo', () => {
    expect(sumarResumenes([
      { ...cero, contestadas: 1, noRespondidas: 2, demos: 1 },
      { ...cero, contestadas: 3, decisores: 1, presentaciones: 2 },
    ])).toEqual({ ...cero, contestadas: 4, decisores: 1, noRespondidas: 2, presentaciones: 2, demos: 1 })
  })
})

describe('pendientesDePersona', () => {
  const etapa = (id: string, extra: Partial<CrmStage> = {}) =>
    ({ id, name: id, is_out_of_funnel: false, management_type: 'por_tarea', allows_tasks: true, ...extra }) as CrmStage
  const etapas = new Map([
    ['seg', etapa('seg')],
    ['libre', etapa('libre', { management_type: null })],
    ['desc', etapa('desc', { is_out_of_funnel: true })],
  ])
  const lead = (id: string, assigned_to: string, stage_id: string) => ({ id, assigned_to, funnel_stage_id: stage_id }) as unknown as CrmLeadRow
  const tarea = (lead_id: string, assigned_to: string, due_date: string | null) =>
    ({ lead_id, assigned_to, due_date, completed: false, deleted_at: null }) as CrmTask

  const leads = [lead('l1', 'u', 'seg'), lead('l2', 'u', 'seg'), lead('l3', 'u', 'libre'), lead('l4', 'u', 'desc'), lead('l5', 'otro', 'seg')]
  const tareas = [
    tarea('l1', 'u', '2026-11-01'), // vencida y le cubre la obligación a l1
    tarea('l2', 'otro', '2026-11-10'), // de otro: a «u» no le cubre l2
    tarea('l3', 'u', '2026-11-04'), // hoy: no está vencida
    tarea('l5', 'u', '2026-10-01'), // vencida, aunque el lead sea de otro
  ]

  it('cuenta sus tareas vencidas y los leads de su cartera en seguimiento sin tarea suya', () => {
    expect(pendientesDePersona('u', leads, tareas, etapas, '2026-11-04')).toEqual({ vencidas: 2, sinTarea: 1 })
  })
})

describe('tasaDeDecisor', () => {
  const periodo = (contestadas: string[], decisores: string[]) => {
    const vacio = objetivosDe([], [])
    return { ...vacio, leads: { ...vacio.leads, contestadas: new Set(contestadas), decisores: new Set(decisores) } }
  }
  it('cuenta inmobiliarias, no llamadas: de las que contestaron, en cuántas se habló con un decisor', () => {
    expect(tasaDeDecisor([periodo(['a', 'b', 'c', 'd'], ['a'])])).toEqual({ contestadas: 4, conDecisor: 1, tasa: 0.25 })
  })
  it('con varias personas, la misma inmobiliaria cuenta una vez', () => {
    expect(tasaDeDecisor([periodo(['a', 'b'], ['a']), periodo(['a', 'c'], ['c'])]))
      .toEqual({ contestadas: 3, conDecisor: 2, tasa: 2 / 3 })
  })
  it('sin contestadas no hay tasa', () => {
    expect(tasaDeDecisor([periodo([], [])])).toEqual({ contestadas: 0, conDecisor: 0, tasa: null })
  })
})
