import { describe, expect, it } from 'vitest'
import { armarMetaDeActividad } from './actividad'
import {
  antelacionEnDias, armarDemos, csvDeDemos, demoConfirmada, diasHabilesRestantes, escribirMetaSdr, esContratado,
  estadoDeDemo, filtrarDemos, guionDeSegundaOportunidad, leerMetaSdr, llamadasPorMes, mesLocal, mesesHaciaAtras,
  META_POR_DEFECTO, metricasDelPeriodo, periodoDeMes, recordatorioDeDemo, resumenEnTexto, segundaOportunidad,
  trimestreDe, ultimos12Meses, type DemoDelSdr, type ReunionDelSdr,
} from './dashboardSdr'

const AHORA = new Date('2026-11-11T12:00:00Z')

/** Una demo ya armada, con lo mínimo cambiado en cada test. Mediodía UTC: el mes local no se corre. */
function demo(p: Partial<DemoDelSdr> = {}): DemoDelSdr {
  return {
    id: 'd1', leadId: 'l1', inmobiliaria: 'Inmo Sol', contacto: 'Ana', con: ['Ana'], asistentes: 1,
    agendadaEl: '2026-11-02T12:00:00Z', empiezaEl: '2026-11-05T12:00:00Z', estado: 'realizada',
    motivoCancelacion: null, confirmada: false, contratado: false, antelacion: 3,
    ...p,
  }
}

describe('meta del SDR', () => {
  it('sin fila, vacía o rota es la de fábrica', () => {
    expect(leerMetaSdr(null)).toBe(META_POR_DEFECTO)
    expect(leerMetaSdr('')).toBe(15)
    expect(leerMetaSdr('{roto')).toBe(15)
    expect(leerMetaSdr('{"demosRealizadasPorMes":"diez"}')).toBe(15)
    expect(leerMetaSdr('{"demosRealizadasPorMes":-3}')).toBe(15)
  })
  it('lee y escribe la guardada', () => {
    expect(leerMetaSdr('{"demosRealizadasPorMes":20}')).toBe(20)
    expect(leerMetaSdr(escribirMetaSdr(8))).toBe(8)
    expect(JSON.parse(escribirMetaSdr(12))).toEqual({ demosRealizadasPorMes: 12 })
  })
})

describe('estadoDeDemo', () => {
  it('completada es realizada y cancelada es cancelada, sea cuando sea', () => {
    expect(estadoDeDemo({ status: 'completed', starts_at: '2026-12-01T10:00:00Z' }, AHORA)).toBe('realizada')
    expect(estadoDeDemo({ status: 'cancelled', starts_at: '2026-12-01T10:00:00Z' }, AHORA)).toBe('cancelada')
  })
  it('agendada en el futuro es agendada; ya pasada sin marcar es «sin marcar»', () => {
    expect(estadoDeDemo({ status: 'scheduled', starts_at: '2026-11-12T10:00:00Z' }, AHORA)).toBe('agendada')
    expect(estadoDeDemo({ status: 'scheduled', starts_at: '2026-11-10T10:00:00Z' }, AHORA)).toBe('sinMarcar')
  })
})

describe('demoConfirmada', () => {
  // 10/11 a las 09:30 de Madrid (08:30Z): lleva tarea el 9 («de mañana») y el 10 («de hoy»).
  const reunion = { lead_id: 'l1', starts_at: '2026-11-10T08:30:00Z' }
  const tarea = (p: Partial<{ lead_id: string; title: string; due_date: string; completed: boolean }>) => ({
    lead_id: 'l1', title: 'Confirmar la demo de hoy a las 09:30', due_date: '2026-11-10', completed: true, ...p,
  })
  it('con la de hoy del mismo día completada', () => {
    expect(demoConfirmada(reunion, [tarea({})])).toBe(true)
  })
  it('con la de mañana del día anterior completada', () => {
    expect(demoConfirmada(reunion, [tarea({ title: 'Confirmar la demo de mañana a las 09:30', due_date: '2026-11-09' })])).toBe(true)
  })
  it('no si está sin completar, es de otro lead, de otro día o es otra tarea', () => {
    expect(demoConfirmada(reunion, [tarea({ completed: false })])).toBe(false)
    expect(demoConfirmada(reunion, [tarea({ lead_id: 'l2' })])).toBe(false)
    expect(demoConfirmada(reunion, [tarea({ due_date: '2026-11-03' })])).toBe(false)
    expect(demoConfirmada(reunion, [tarea({ title: 'Llamar a Ana' })])).toBe(false)
    expect(demoConfirmada(reunion, [tarea({ title: 'Confirmar la demo de hoy a las 09:30', due_date: '2026-11-09' })])).toBe(false)
  })
  it('sin lead no hay cómo saberlo', () => {
    expect(demoConfirmada({ ...reunion, lead_id: null }, [tarea({})])).toBe(false)
  })
})

describe('esContratado', () => {
  const etapas = new Map([['e1', { starts_onboarding: true }], ['e2', { starts_onboarding: false }], ['e3', {}]])
  it('por la etapa que arranca el onboarding', () => {
    expect(esContratado({ funnel_stage_id: 'e1' }, etapas)).toBe(true)
    expect(esContratado({ funnel_stage_id: 'e2' }, etapas)).toBe(false)
    expect(esContratado({ funnel_stage_id: 'e3' }, etapas)).toBe(false)
  })
  it('o por el tipo de lead', () => {
    expect(esContratado({ funnel_stage_id: 'e2', lead_type: 'ONBOARDING' }, etapas)).toBe(true)
    expect(esContratado({ funnel_stage_id: null, lead_type: 'CLIENT' }, etapas)).toBe(true)
    expect(esContratado({ funnel_stage_id: null, lead_type: 'LEAD' }, etapas)).toBe(false)
    expect(esContratado(null, etapas)).toBe(false)
  })
})

describe('fechas', () => {
  it('antelación en días entre agendar y la demo, nunca negativa', () => {
    expect(antelacionEnDias('2026-11-02T12:00:00Z', '2026-11-05T12:00:00Z')).toBe(3)
    expect(antelacionEnDias('2026-11-02T12:00:00Z', '2026-11-02T15:00:00Z')).toBe(0)
    expect(antelacionEnDias('2026-11-05T12:00:00Z', '2026-11-02T12:00:00Z')).toBe(0)
  })
  it('mes local de un instante', () => {
    expect(mesLocal('2026-11-15T12:00:00Z')).toBe('2026-11')
  })
  it('días hábiles que quedan en el mes, hoy incluido', () => {
    expect(diasHabilesRestantes('2026-11-11')).toBe(14) // mié 11 → lun 30: 3 + 5 + 5 + 1
    expect(diasHabilesRestantes('2026-11-30')).toBe(1) // lunes
    expect(diasHabilesRestantes('2026-11-29')).toBe(1) // domingo: queda el lunes 30
    expect(diasHabilesRestantes('2026-10-31')).toBe(0) // sábado, último día
  })
})

describe('períodos', () => {
  it('meses hacia atrás, el más nuevo primero, cruzando el año', () => {
    expect(mesesHaciaAtras('2026-02', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
  })
  it('un mes', () => {
    expect(periodoDeMes('2026-11')).toEqual({ meses: ['2026-11'], label: 'noviembre 2026' })
  })
  it('el trimestre calendario de un mes', () => {
    expect(trimestreDe('2026-11')).toEqual({ meses: ['2026-10', '2026-11', '2026-12'], label: 'T4 2026' })
    expect(trimestreDe('2026-01').meses).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('los últimos 12 meses, del más viejo al más nuevo', () => {
    const p = ultimos12Meses('2026-11')
    expect(p.meses).toHaveLength(12)
    expect(p.meses[0]).toBe('2025-12')
    expect(p.meses[11]).toBe('2026-11')
    expect(p.label).toBe('Últimos 12 meses')
  })
})

describe('llamadasPorMes', () => {
  const llamada = (created_at: string, resultado: 'contestada' | 'no_respondida', decisor?: boolean) => ({
    created_at, long_description: armarMetaDeActividad({ tipo: 'llamada', con: [], resultado, ...(decisor !== undefined && { decisor }) }),
  })
  it('cuenta contestadas y no respondidas como llamadas, y aparte las de decisor', () => {
    const m = llamadasPorMes([
      llamada('2026-11-03T12:00:00Z', 'contestada', true),
      llamada('2026-11-04T12:00:00Z', 'contestada'),
      llamada('2026-11-04T12:00:00Z', 'no_respondida'),
      llamada('2026-10-04T12:00:00Z', 'no_respondida'),
      { created_at: '2026-11-04T12:00:00Z', long_description: null }, // una nota
      { created_at: '2026-11-04T12:00:00Z', long_description: armarMetaDeActividad({ tipo: 'demo', con: ['Ana'] }) },
    ])
    expect(m.get('2026-11')).toEqual({ llamadas: 3, decisores: 1 })
    expect(m.get('2026-10')).toEqual({ llamadas: 1, decisores: 0 })
  })
})

describe('armarDemos', () => {
  const etapas = new Map([['firmado', { starts_onboarding: true }]])
  const reunion = (p: Partial<ReunionDelSdr> = {}): ReunionDelSdr => ({
    id: 'r1', lead_id: 'l1', starts_at: '2026-11-10T08:30:00Z', created_at: '2026-11-02T12:00:00Z',
    status: 'scheduled', cancel_reason: null,
    lead: { funnel_stage_id: 'firmado', lead_type: 'LEAD', client: { company_name: 'Inmo Sol', first_name: 'Ana', last_name: 'Pérez' } },
    ...p,
  })
  it('junta reunión, registro, tarea de confirmar y etapa', () => {
    const [d] = armarDemos(
      [reunion()],
      new Map([['r1', { con: ['Ana', 'Luis'], texto: 'Demo agendada.' }]]),
      [{ lead_id: 'l1', title: 'Confirmar la demo de hoy a las 09:30', due_date: '2026-11-10', completed: true }],
      etapas, AHORA,
    )
    expect(d).toEqual({
      id: 'r1', leadId: 'l1', inmobiliaria: 'Inmo Sol', contacto: 'Ana, Luis', con: ['Ana', 'Luis'], asistentes: 2,
      agendadaEl: '2026-11-02T12:00:00Z', empiezaEl: '2026-11-10T08:30:00Z', estado: 'sinMarcar',
      motivoCancelacion: null, confirmada: true, contratado: true, antelacion: 7,
    })
  })
  it('sin registro: un asistente y el contacto del cliente', () => {
    const [d] = armarDemos([reunion({ lead: { funnel_stage_id: null, client: { company_name: null, first_name: 'Ana', last_name: 'Pérez' } } })], new Map(), [], etapas, AHORA)
    expect(d.asistentes).toBe(1)
    expect(d.contacto).toBe('Ana Pérez')
    expect(d.inmobiliaria).toBe('Sin nombre')
    expect(d.contratado).toBe(false)
  })
  it('la cancelada trae su motivo', () => {
    const [d] = armarDemos([reunion({ status: 'cancelled', cancel_reason: 'No le interesa' })], new Map(), [], etapas, AHORA)
    expect(d.estado).toBe('cancelada')
    expect(d.motivoCancelacion).toBe('No le interesa')
  })
})

describe('metricasDelPeriodo', () => {
  const demos = [
    demo({ id: 'a', estado: 'realizada', confirmada: true, asistentes: 2, antelacion: 2, contratado: true }),
    demo({ id: 'b', estado: 'realizada', confirmada: false, asistentes: 1, antelacion: 6 }),
    demo({ id: 'c', estado: 'cancelada', confirmada: false, asistentes: 1, antelacion: 9 }),
    demo({ id: 'd', estado: 'sinMarcar', confirmada: true, asistentes: 1, antelacion: 3 }),
    demo({ id: 'e', estado: 'agendada', confirmada: false, asistentes: 2, antelacion: 10, empiezaEl: '2026-11-20T12:00:00Z' }),
    demo({ id: 'f', estado: 'agendada', confirmada: true, asistentes: 1, antelacion: 1, empiezaEl: '2026-11-21T12:00:00Z' }),
    // De octubre: no entra en noviembre.
    demo({ id: 'g', estado: 'realizada', agendadaEl: '2026-10-10T12:00:00Z' }),
  ]
  const llamadas = new Map([['2026-11', { llamadas: 60, decisores: 6 }], ['2026-10', { llamadas: 20, decisores: 1 }]])
  const m = metricasDelPeriodo({ meses: ['2026-11'], demos, llamadas, metaMensual: 4, mesActual: '2026-11', diasHabiles: 15 })

  it('meta: realizadas contra la meta del período', () => {
    expect(m.meta).toEqual({ objetivo: 4, realizadas: 2, porcentaje: 0.5, porEncima: 0 })
  })
  it('asistencia sobre las ya resueltas, con y sin confirmar', () => {
    expect(m.asistencia).toEqual({ realizadas: 2, resueltas: 4, tasa: 0.5 })
    expect(m.matrices.confirmacion).toEqual({
      con: { demos: 2, realizadas: 1, tasa: 0.5 },
      sin: { demos: 2, realizadas: 1, tasa: 0.5 },
    })
  })
  it('ratios del embudo', () => {
    expect(m.embudo).toEqual({ llamadas: 60, decisores: 6, demos: 6, pasoDeFiltro: 0.1, efectividadDePitch: 1, llamadasPorDemo: 10 })
  })
  it('demos con 2+ asistentes', () => {
    expect(m.dosOMas).toEqual({ demos: 2, total: 6, tasa: 2 / 6 })
  })
  it('matrices por antelación y por asistentes (solo resueltas)', () => {
    expect(m.matrices.antelacion).toEqual([
      { rango: '0–4 días', demos: 2, realizadas: 1, tasa: 0.5 },
      { rango: '5–7 días', demos: 1, realizadas: 1, tasa: 1 },
      { rango: '8+ días', demos: 1, realizadas: 0, tasa: 0 },
    ])
    expect(m.matrices.asistentes).toEqual([
      { rango: '1 asistente', demos: 3, realizadas: 1, tasa: 1 / 3 },
      { rango: '2+ asistentes', demos: 1, realizadas: 1, tasa: 1 },
    ])
  })
  it('forecast del mes en curso', () => {
    // tasa 2/4 = 0.5; pipeline 2 × 0.5 = 1; brecha 4 − 2 − 1 = 1; demos 1/0.5 = 2; llamadas 2 × 10 = 20; 20/15 → 2
    expect(m.forecast).toEqual({
      tasa: 0.5, tasaEstimada: false, pipeline: 1, brecha: 1, demosNecesarias: 2, llamadasRestantes: 20, ritmoDiario: 2, diasHabiles: 15,
    })
  })
  it('sin forecast fuera del mes en curso', () => {
    expect(metricasDelPeriodo({ meses: ['2026-10'], demos, llamadas, metaMensual: 4, mesActual: '2026-11', diasHabiles: 15 }).forecast).toBeNull()
    expect(metricasDelPeriodo({ meses: ['2026-10', '2026-11'], demos, llamadas, metaMensual: 4, mesActual: '2026-11', diasHabiles: 15 }).forecast).toBeNull()
  })
  it('forecast sin demos resueltas usa la tasa de fábrica (60 %)', () => {
    const f = metricasDelPeriodo({
      meses: ['2026-11'], demos: [demo({ estado: 'agendada' })], llamadas, metaMensual: 3, mesActual: '2026-11', diasHabiles: 0,
    }).forecast!
    // pipeline 0.6; brecha 2.4; demos ceil(4) = 4; llamadas 4 × 60; ritmo con mínimo 1 día
    expect(f.tasa).toBe(0.6)
    expect(f.tasaEstimada).toBe(true)
    expect(f.demosNecesarias).toBe(4)
    expect(f.llamadasRestantes).toBe(240)
    expect(f.ritmoDiario).toBe(240)
  })
  it('meta de varios meses = mensual × meses, y lo que sobra se dice', () => {
    const t = metricasDelPeriodo({ meses: ['2026-10', '2026-11'], demos, llamadas, metaMensual: 1, mesActual: '2026-11', diasHabiles: 15 })
    expect(t.meta).toEqual({ objetivo: 2, realizadas: 3, porcentaje: 1.5, porEncima: 1 })
  })
  it('desglose mes a mes, del más viejo al más nuevo', () => {
    const t = metricasDelPeriodo({ meses: ['2026-10', '2026-11'], demos, llamadas, metaMensual: 1, mesActual: '2026-11', diasHabiles: 15 })
    expect(t.desglose).toEqual([
      { mes: '2026-10', llamadas: 20, decisores: 1, pasoDeFiltro: 0.05, demos: 1, efectividadDePitch: 1, asistencia: 1, realizadas: 1, contratados: 0 },
      { mes: '2026-11', llamadas: 60, decisores: 6, pasoDeFiltro: 0.1, demos: 6, efectividadDePitch: 1, asistencia: 0.5, realizadas: 2, contratados: 1 },
    ])
  })
  it('sin datos no divide por cero', () => {
    const v = metricasDelPeriodo({ meses: ['2026-09'], demos: [], llamadas: new Map(), metaMensual: 15, mesActual: '2026-11', diasHabiles: 15 })
    expect(v.asistencia.tasa).toBeNull()
    expect(v.embudo.pasoDeFiltro).toBeNull()
    expect(v.embudo.llamadasPorDemo).toBeNull()
    expect(v.dosOMas.tasa).toBeNull()
  })
  it('prescripciones', () => {
    expect(m.prescripciones).toEqual([
      'Confirmá 1 demo agendada que todavía no se confirmó.',
      'Solo el 10 % de las llamadas llega a un decisor: trabajá la apertura para pasar el filtro.',
      'Solo el 33 % de las demos tiene 2 o más asistentes: pedí que se sume el decisor o el dueño.',
    ])
    const enRitmo = metricasDelPeriodo({
      meses: ['2026-11'], demos: [demo({ asistentes: 2 })], llamadas: new Map([['2026-11', { llamadas: 10, decisores: 5 }]]),
      metaMensual: 1, mesActual: '2026-11', diasHabiles: 15,
    })
    expect(enRitmo.prescripciones).toEqual(['Todo en ritmo.'])
  })
})

describe('tabla de demos', () => {
  const demos = [
    demo({ id: 'a', inmobiliaria: 'Inmo Sol', estado: 'agendada', confirmada: false, empiezaEl: '2026-11-20T12:00:00Z', agendadaEl: '2026-11-01T12:00:00Z' }),
    demo({ id: 'b', inmobiliaria: 'Casas Luna', contacto: 'Pedro', estado: 'realizada', confirmada: true, empiezaEl: '2026-11-05T12:00:00Z', agendadaEl: '2026-11-03T12:00:00Z' }),
    demo({ id: 'c', inmobiliaria: 'Pisos Mar', estado: 'sinMarcar', empiezaEl: '2026-11-08T12:00:00Z', agendadaEl: '2026-11-02T12:00:00Z' }),
  ]
  const base = { busqueda: '', estado: 'todos', calendario: 'todos', foco: false, orden: 'demo' } as const
  it('ordena por fecha de la demo (la más nueva primero) o por cuándo se agendó', () => {
    expect(filtrarDemos(demos, base).map(d => d.id)).toEqual(['a', 'c', 'b'])
    expect(filtrarDemos(demos, { ...base, orden: 'agendada' }).map(d => d.id)).toEqual(['b', 'c', 'a'])
  })
  it('busca por inmobiliaria o contacto sin tildes ni mayúsculas', () => {
    expect(filtrarDemos(demos, { ...base, busqueda: 'pedro' }).map(d => d.id)).toEqual(['b'])
    expect(filtrarDemos(demos, { ...base, busqueda: 'LUNA' }).map(d => d.id)).toEqual(['b'])
  })
  it('filtra por estado, calendario y foco', () => {
    expect(filtrarDemos(demos, { ...base, estado: 'realizada' }).map(d => d.id)).toEqual(['b'])
    expect(filtrarDemos(demos, { ...base, calendario: 'confirmadas' }).map(d => d.id)).toEqual(['b'])
    expect(filtrarDemos(demos, { ...base, calendario: 'pendientes' }).map(d => d.id)).toEqual(['a', 'c'])
    expect(filtrarDemos(demos, { ...base, foco: true }).map(d => d.id)).toEqual(['a', 'c'])
  })
  it('second chance: canceladas y sin marcar, la más nueva primero', () => {
    const todas = [...demos, demo({ id: 'x', estado: 'cancelada', empiezaEl: '2026-09-01T12:00:00Z' })]
    expect(segundaOportunidad(todas).map(d => d.id)).toEqual(['c', 'x'])
  })
})

describe('textos', () => {
  const d = demo({ contacto: 'Ana', inmobiliaria: 'Inmo Sol', empiezaEl: '2026-11-10T08:30:00Z' })
  it('el recordatorio va en hora de España y en «tú»', () => {
    const t = recordatorioDeDemo(d)
    expect(t).toContain('Ana')
    expect(t).toContain('martes 10 de noviembre a las 09:30 (hora de España)')
    expect(t).toContain('Propelia')
  })
  it('el guion de rescate nombra a la inmobiliaria', () => {
    const t = guionDeSegundaOportunidad(d)
    expect(t).toContain('Ana')
    expect(t).toContain('Inmo Sol')
    expect(t).toContain('Propelia')
  })
  it('el CSV va con BOM, separado por ; y con comillas donde hace falta', () => {
    const csv = csvDeDemos([demo({ inmobiliaria: 'Inmo; "Sol"' })])
    expect(csv.startsWith('﻿')).toBe(true)
    const [cabecera, fila] = csv.slice(1).split('\r\n')
    expect(cabecera.split(';')[0]).toBe('Agendada el')
    expect(fila).toContain('"Inmo; ""Sol"""')
    expect(csv).not.toContain('€')
  })
  it('el resumen en texto dice la meta y las prescripciones', () => {
    const m = metricasDelPeriodo({ meses: ['2026-11'], demos: [demo()], llamadas: new Map(), metaMensual: 15, mesActual: '2026-11', diasHabiles: 15 })
    const t = resumenEnTexto(m, { persona: 'Ana', periodo: 'noviembre 2026' })
    expect(t).toContain('Ana · noviembre 2026')
    expect(t).toContain('Demos realizadas: 1 de 15')
    expect(t).not.toContain('€')
  })
})
