import { assertEquals } from 'jsr:@std/assert@1'
import {
  bolsasDeLlamada, type Etapa, esPendienteAgendar, esParaRecontactar, lunesDe, objetivosDe, ordenarImportantes,
  nutricionDeLaCuenta, ordenarPorEstado, pendientesDePersona, periodoDe, proximaTareaPorLead, semanasHaciaAtras, seguimientoDelLead,
  sumarDias, type Tarea, tasaDeDecisor,
} from './crmReglas.ts'

const act = (m: Record<string, unknown>) => `<!--act-->${JSON.stringify(m)}`
const llamada = (lead: string, created_at: string, m: Record<string, unknown>) =>
  ({ lead_id: lead, created_at, long_description: act({ tipo: 'llamada', con: [], ...m }) })

const ETAPAS = new Map<string, Etapa>([
  ['nuevo', { id: 'nuevo', label: 'Nuevo', position: 1, is_out_of_funnel: false, management_type: 'sin_contactar' }],
  ['seg', { id: 'seg', label: 'Seguimiento', position: 2, is_out_of_funnel: false, management_type: 'por_tarea', allows_tasks: true, show_in_dashboard: true }],
  ['firmado', { id: 'firmado', label: 'Contratado', position: 5, is_out_of_funnel: false, management_type: 'por_tarea', allows_tasks: false }],
  ['desc', { id: 'desc', label: 'Descartado', position: 9, is_out_of_funnel: true, management_type: null }],
])

const tarea = (lead_id: string | null, due_date: string | null, assigned_to = 'yo', completed = false): Tarea =>
  ({ lead_id, due_date, assigned_to, completed })

Deno.test('días: lunes, sumar y períodos en hora de calendario', () => {
  assertEquals(lunesDe('2026-11-06'), '2026-11-02') // viernes
  assertEquals(lunesDe('2026-11-08'), '2026-11-02') // domingo
  assertEquals(lunesDe('2026-11-02'), '2026-11-02')
  assertEquals(sumarDias('2026-10-31', 1), '2026-11-01')
  assertEquals(periodoDe('semana', '2026-11-06'), { desde: '2026-11-02', hasta: '2026-11-07', nombre: 'Esta semana' })
  assertEquals(periodoDe('semana_pasada', '2026-11-06'), { desde: '2026-10-26', hasta: '2026-11-02', nombre: 'Semana pasada' })
  assertEquals(periodoDe('mes', '2026-11-06').desde, '2026-11-01')
  const semanas = semanasHaciaAtras('2026-11-06', 3)
  assertEquals(semanas.map((s) => [s.desde, s.hasta]), [['2026-11-02', '2026-11-07'], ['2026-10-26', '2026-11-02'], ['2026-10-19', '2026-10-26']])
})

Deno.test('bolsas: la de decisor es también contestada; lo que no es llamada no cuenta', () => {
  assertEquals(bolsasDeLlamada(act({ tipo: 'llamada', con: [], resultado: 'contestada', decisor: true })), ['contestadas', 'decisores'])
  assertEquals(bolsasDeLlamada(act({ tipo: 'llamada', con: [], resultado: 'no_respondida' })), ['noRespondidas'])
  assertEquals(bolsasDeLlamada(act({ tipo: 'nota', con: [] })), [])
  assertEquals(bolsasDeLlamada('texto suelto'), [])
  assertEquals(bolsasDeLlamada(act({ tipo: 'llamada', con: 'Pedro', resultado: 'contestada' })), []) // forma rota
})

Deno.test('objetivos: decisor nuevo por nombre contra el historial del lead, y la tasa por inmobiliaria', () => {
  const historial = [llamada('l1', '2026-10-01T10:00:00Z', { resultado: 'contestada', decisor: true, con: ['Pedro Gómez'] })]
  const llamadas = [
    llamada('l1', '2026-11-03T10:00:00Z', { resultado: 'contestada', decisor: true, con: ['pedro gomez'] }), // ya conocido
    llamada('l2', '2026-11-03T11:00:00Z', { resultado: 'contestada', decisor: true, con: [] }), // primera con decisor
    llamada('l2', '2026-11-04T11:00:00Z', { resultado: 'contestada', decisor: true, con: [] }), // ya hubo una
    llamada('l3', '2026-11-04T12:00:00Z', { resultado: 'contestada' }),
    llamada('l4', '2026-11-04T13:00:00Z', { resultado: 'no_respondida' }),
  ]
  const o = objetivosDe(llamadas, [{ lead_id: 'l2' }], { presentaciones: [{ lead_id: 'l5' }], historial })
  assertEquals(o.resumen, {
    contestadas: 4, decisores: 3, decisoresNuevos: 1, noRespondidas: 1, presentaciones: 1, nombresDecisor: 0, telefonosDecisor: 0, demos: 1,
  })
  assertEquals(tasaDeDecisor([o]), { contestadas: 3, con_decisor: 2, tasa: 0.667 })
  assertEquals(tasaDeDecisor([objetivosDe([], [])]).tasa, null)
})

Deno.test('objetivos: nombres y teléfonos de decisores conseguidos en llamadas y notas, y la nutrición', () => {
  const llamadas = [
    llamada('l1', '2026-11-18T10:00:00Z', { resultado: 'contestada', decisorApuntado: 'Pablo', telefonoDecisor: '+34600000000' }),
    { lead_id: 'l2', created_at: '2026-11-18T11:00:00Z', long_description: act({ tipo: 'nota', con: [], decisorApuntado: 'Ana' }) },
    llamada('l3', '2026-11-18T12:00:00Z', { resultado: 'contestada', decisorApuntado: ' ' }), // vacío: no
    { lead_id: 'l4', created_at: '2026-11-18T13:00:00Z', long_description: act({ tipo: 'demo', con: [], decisorApuntado: 'Luis' }) }, // demo: no
  ]
  const o = objetivosDe(llamadas, [], { presentaciones: [{ lead_id: 'l5' }] })
  assertEquals([o.resumen.nombresDecisor, o.resumen.telefonosDecisor], [2, 1])
  assertEquals([...o.leads.nombresDecisor].sort(), ['l1', 'l2'])
  assertEquals(nutricionDeLaCuenta(o.resumen), 4)
})

Deno.test('pendiente agendar: Seguimiento que deja tareas y sin tarea de quien mira', () => {
  const mias = new Set(['conMia'])
  assertEquals(esPendienteAgendar({ id: 'a', funnel_stage_id: 'seg' }, ETAPAS, mias), true)
  assertEquals(esPendienteAgendar({ id: 'conMia', funnel_stage_id: 'seg' }, ETAPAS, mias), false)
  assertEquals(esPendienteAgendar({ id: 'a', funnel_stage_id: 'firmado' }, ETAPAS, mias), false) // no deja tareas
  assertEquals(esPendienteAgendar({ id: 'a', funnel_stage_id: 'nuevo' }, ETAPAS, mias), false)
  assertEquals(esPendienteAgendar({ id: 'a', funnel_stage_id: 'desc' }, ETAPAS, mias), false)
})

Deno.test('recontactar: descartado y con la fecha cumplida, hoy incluido', () => {
  assertEquals(esParaRecontactar({ id: 'a', funnel_stage_id: 'desc', recontact_at: '2026-11-06' }, ETAPAS, '2026-11-06'), true)
  assertEquals(esParaRecontactar({ id: 'a', funnel_stage_id: 'desc', recontact_at: '2026-11-07' }, ETAPAS, '2026-11-06'), false)
  assertEquals(esParaRecontactar({ id: 'a', funnel_stage_id: 'seg', recontact_at: '2026-11-01' }, ETAPAS, '2026-11-06'), false)
})

Deno.test('seguimiento y próxima tarea: la de hoy es «hoy», la de ayer «vencida»', () => {
  const proximas = proximaTareaPorLead([tarea('a', '2026-11-08'), tarea('a', '2026-11-05'), tarea('b', '2026-11-06'), tarea(null, '2026-01-01')])
  assertEquals(proximas.get('a')!.pendientes, 2)
  assertEquals(seguimientoDelLead(proximas.get('a'), false, '2026-11-06'), 'vencida')
  assertEquals(seguimientoDelLead(proximas.get('b'), false, '2026-11-06'), 'hoy')
  assertEquals(seguimientoDelLead(undefined, false, '2026-11-06'), 'sin tarea')
  assertEquals(seguimientoDelLead(proximas.get('a'), true, '2026-11-06'), 'descartado')
})

Deno.test('orden por estado: lo más avanzado arriba, descartados y sin etapa al final', () => {
  const leads = [
    { id: 'd', funnel_stage_id: 'desc' }, { id: 'x', funnel_stage_id: null },
    { id: 'n', funnel_stage_id: 'nuevo' }, { id: 'f', funnel_stage_id: 'firmado' },
  ]
  assertEquals(ordenarPorEstado(leads, new Map(), ETAPAS).map((l) => l.id), ['f', 'n', 'd', 'x'])
})

Deno.test('importantes por estado: etapas anteriores arriba; por tarea: la más próxima arriba', () => {
  const leads = [
    { id: 'f', funnel_stage_id: 'firmado', n: 'B' }, { id: 'n', funnel_stage_id: 'nuevo', n: 'A' },
    { id: 'd', funnel_stage_id: 'desc', n: 'C' },
  ]
  const proximas = proximaTareaPorLead([tarea('f', '2026-11-01')])
  assertEquals(ordenarImportantes(leads, proximas, ETAPAS, 'estado', (l) => l.n).map((l) => l.id), ['n', 'f', 'd'])
  assertEquals(ordenarImportantes(leads, proximas, ETAPAS, 'tarea', (l) => l.n).map((l) => l.id), ['f', 'n', 'd'])
})

Deno.test('pendiente ahora: vencidas suyas (la de hoy no) y leads suyos sin tarea suya', () => {
  const leads = [
    { id: 'a', funnel_stage_id: 'seg', assigned_to: 'ana' },
    { id: 'b', funnel_stage_id: 'seg', assigned_to: 'ana' },
    { id: 'c', funnel_stage_id: 'seg', assigned_to: 'otro' },
  ]
  const tareas = [tarea('b', '2026-11-06', 'ana'), tarea('a', '2026-11-01', 'otro'), tarea(null, '2026-11-05', 'ana')]
  assertEquals(pendientesDePersona('ana', leads, tareas, ETAPAS, '2026-11-06'), { tareas_vencidas: 1, leads_sin_tarea: 1 })
})
