import { describe, expect, it } from 'vitest'
import type { CrmLeadRow, CrmMeeting, CrmStage } from '../types'
import {
  RESUMEN_PARAM, escribirResumen, fijarResumenEnLaUrl, hayEtapasEnElDashboard,
  eventosDeGoogleSueltos, invitacionesSinAceptar, leadsImportantes, muestraResumen, reunionesMias, reunionesPorDia,
} from './resumen'
import type { ProximaTarea } from './tareas'

const params = (qs: string) => new URLSearchParams(qs)
const SA = { esSuperadmin: true, como: false }
const SDR = { esSuperadmin: false, como: false }

describe('muestraResumen', () => {
  it('un SUPERADMIN que entra a /crm pelado ve el resumen', () => {
    expect(muestraResumen(params(''), SA)).toBe(true)
  })
  it('un SDR nunca, ni pidiéndolo por la URL', () => {
    expect(muestraResumen(params(''), SDR)).toBe(false)
    expect(muestraResumen(params(`${RESUMEN_PARAM}=1`), SDR)).toBe(false)
  })
  it('mirando con «Ver como» tampoco: se ve el CRM de la otra persona', () => {
    expect(muestraResumen(params(`como=u7&${RESUMEN_PARAM}=1`), { esSuperadmin: true, como: true })).toBe(false)
  })
  it('un enlace con lead, filtros, vista o carteras llega a la lista', () => {
    for (const qs of ['lead=l1', 'hoy=1', 'q=ana', 'stages=a', 'vista=columnas', 'owners=u1', 'tareas=1&overdue=1']) {
      expect(muestraResumen(params(qs), SA)).toBe(false)
    }
  })
  it('el parámetro explícito gana sobre todo lo demás', () => {
    expect(muestraResumen(params(`${RESUMEN_PARAM}=0`), SA)).toBe(false)
    expect(muestraResumen(params(`${RESUMEN_PARAM}=1&lead=l1`), SA)).toBe(true)
  })
})

describe('escribirResumen', () => {
  it('pone 1 o 0 y deja el resto', () => {
    const p = escribirResumen(params('lead=l1&owners=u1'), true)
    expect(p.get(RESUMEN_PARAM)).toBe('1')
    expect(p.get('lead')).toBe('l1')
    expect(escribirResumen(p, false).get(RESUMEN_PARAM)).toBe('0')
  })
  it('no muta la entrada', () => {
    const p = params('')
    escribirResumen(p, true)
    expect(p.has(RESUMEN_PARAM)).toBe(false)
  })
})

describe('fijarResumenEnLaUrl', () => {
  it('un SUPERADMIN en /crm pelado fija el resumen: abrir un lead desde ahí no lo manda a la lista', () => {
    const p = fijarResumenEnLaUrl(params(''), SA)!
    expect(p.get(RESUMEN_PARAM)).toBe('1')
    expect(muestraResumen(new URLSearchParams([...p, ['lead', 'l1']]), SA)).toBe(true)
  })
  it('el que llegó a la lista por un enlace la fija, así limpiar filtros no lo saca', () => {
    expect(fijarResumenEnLaUrl(params('hoy=1'), SA)?.get(RESUMEN_PARAM)).toBe('0')
  })
  it('nada que fijar con el parámetro puesto, para un SDR o con «Ver como»', () => {
    expect(fijarResumenEnLaUrl(params(`hoy=1&${RESUMEN_PARAM}=1`), SA)).toBeNull()
    expect(fijarResumenEnLaUrl(params(''), SDR)).toBeNull()
    expect(fijarResumenEnLaUrl(params('hoy=1'), SDR)).toBeNull()
    expect(fijarResumenEnLaUrl(params('como=u7'), { esSuperadmin: true, como: true })).toBeNull()
  })
})

const etapa = (id: string, extra: Partial<CrmStage> = {}) => ({ id, value: id, label: id, position: 1, is_out_of_funnel: false, deleted_at: null, ...extra }) as CrmStage
const lead = (id: string, extra: Partial<CrmLeadRow> = {}) =>
  ({ id, importante: true, deleted_at: null, funnel_stage_id: 'nuevo', client: { company_name: id }, ...extra }) as unknown as CrmLeadRow
const tarea = (due_date: string | null) => ({ tarea: { due_date }, pendientes: 1 }) as unknown as ProximaTarea

describe('leadsImportantes', () => {
  const etapas = new Map([['nuevo', etapa('nuevo')], ['desc', etapa('desc', { value: 'DISCARDED', is_out_of_funnel: true })]])

  it('solo los marcados; sin la columna en la base (undefined) no hay ninguno', () => {
    const leads = [lead('a'), lead('b', { importante: false }), lead('c', { importante: undefined as unknown as boolean })]
    expect(leadsImportantes(leads, new Map(), etapas).map(l => l.id)).toEqual(['a'])
  })
  it('primero lo que tiene tarea más próxima (lo vencido arriba), después sin tarea, descartados al final', () => {
    const leads = [
      lead('sin-tarea'),
      lead('descartado', { funnel_stage_id: 'desc' }),
      lead('manana'),
      lead('vencida'),
    ]
    const proximas = new Map([['manana', tarea('2026-10-24')], ['vencida', tarea('2026-10-01')], ['descartado', tarea('2026-09-01')]])
    expect(leadsImportantes(leads, proximas, etapas).map(l => l.id)).toEqual(['vencida', 'manana', 'sin-tarea', 'descartado'])
  })
  it('a igualdad, por nombre', () => {
    const leads = [lead('Zeta'), lead('alfa')]
    expect(leadsImportantes(leads, new Map(), etapas).map(l => l.id)).toEqual(['alfa', 'Zeta'])
  })

  describe('las etapas con «Dashboard: Sí» también hacen importantes a sus leads', () => {
    const conEtapas = new Map([
      ['nuevo', etapa('nuevo')],
      ['demo', etapa('demo', { show_in_dashboard: true })],
      ['vieja', etapa('vieja', { show_in_dashboard: true, deleted_at: '2026-10-01T00:00:00Z' })],
    ])
    it('sin estrella, por la etapa marcada', () => {
      const leads = [lead('a', { importante: false, funnel_stage_id: 'demo' }), lead('b', { importante: false })]
      expect(leadsImportantes(leads, new Map(), conEtapas).map(l => l.id)).toEqual(['a'])
    })
    it('una etapa borrada no cuenta aunque esté marcada: ya no se puede desmarcar', () => {
      expect(leadsImportantes([lead('a', { importante: false, funnel_stage_id: 'vieja' })], new Map(), conEtapas)).toEqual([])
    })
    it('los eliminados no van', () => {
      expect(leadsImportantes([lead('a', { funnel_stage_id: 'demo', deleted_at: '2026-10-22T00:00:00Z' })], new Map(), conEtapas)).toEqual([])
    })
  })
})

describe('hayEtapasEnElDashboard', () => {
  it('alguna viva marcada', () => {
    expect(hayEtapasEnElDashboard([etapa('a', { show_in_dashboard: true })])).toBe(true)
    expect(hayEtapasEnElDashboard([etapa('a'), etapa('b', { show_in_dashboard: false })])).toBe(false)
    expect(hayEtapasEnElDashboard([etapa('a', { show_in_dashboard: true, deleted_at: '2026-10-01T00:00:00Z' })])).toBe(false)
  })
})

const reunion = (id: string, inicio: Date, extra: Partial<CrmMeeting> = {}) => ({
  id, starts_at: inicio.toISOString(), ends_at: new Date(inicio.getTime() + 3_600_000).toISOString(),
  status: 'scheduled', deleted_at: null, ...extra,
}) as CrmMeeting
const a = (dia: number, hora: number) => new Date(2026, 9, dia, hora, 0, 0)

describe('reunionesPorDia', () => {
  it('agrupa por día local, en orden, solo los días con algo y dentro de la ventana', () => {
    const r = reunionesPorDia([
      reunion('tarde', a(23, 17)), reunion('pasado', a(25, 9)), reunion('temprano', a(23, 9)),
      reunion('ayer', a(22, 10)), reunion('lejos', a(31, 10)),
    ], '2026-10-23', 7)
    expect(r.map(d => [d.dia, d.reuniones.map(x => x.id)])).toEqual([
      ['2026-10-23', ['temprano', 'tarde']],
      ['2026-10-25', ['pasado']],
    ])
  })
  it('las canceladas y las borradas no van; las hechas sí (siguen siendo del día)', () => {
    const r = reunionesPorDia([
      reunion('cancelada', a(23, 9), { status: 'cancelled' }),
      reunion('borrada', a(23, 10), { deleted_at: '2026-10-22T00:00:00Z' }),
      reunion('hecha', a(23, 11), { status: 'completed' }),
    ], '2026-10-23', 7)
    expect(r.flatMap(d => d.reuniones.map(x => x.id))).toEqual(['hecha'])
  })
})

const google = (id: string, start: string, isAllDay = false) => ({ id, summary: `Evento ${id}`, start, end: start, isAllDay })

describe('reunionesMias', () => {
  it('las que tengo de responsable y las de otro a las que me invitaron (están en mi Google)', () => {
    const r = reunionesMias([
      reunion('mia', a(23, 9), { assigned_to: 'yo' }),
      reunion('invitado', a(24, 10), { assigned_to: 'otra', external_event_id: 'g1' }),
      reunion('ajena', a(24, 11), { assigned_to: 'otra', external_event_id: 'g2' }),
    ], [google('g1', a(24, 10).toISOString())], 'yo')
    expect(r.map(x => x.id)).toEqual(['mia', 'invitado'])
  })
  it('y la invitada no sale además como evento suelto de Google', () => {
    const reuniones = [reunion('invitado', a(24, 10), { assigned_to: 'otra', external_event_id: 'g1' })]
    const g = [google('g1', a(24, 10).toISOString())]
    const todo = [...reunionesMias(reuniones, g, 'yo'), ...eventosDeGoogleSueltos(g, reuniones)]
    expect(todo.map(x => x.id)).toEqual(['invitado'])
  })
})

describe('invitacionesSinAceptar', () => {
  it('los ids de Google de lo que todavía no acepté: sirve para el evento suelto y para la reunión del CRM', () => {
    const r = invitacionesSinAceptar([
      { ...google('g1', a(24, 10).toISOString()), sinAceptar: true },
      google('g2', a(24, 11).toISOString()),
    ])
    expect([...r]).toEqual(['g1'])
  })
})

describe('eventosDeGoogleSueltos', () => {

  it('saca los eventos que ya son una reunión del CRM (de cualquiera, cancelada incluida)', () => {
    const r = eventosDeGoogleSueltos(
      [google('g1', a(23, 9).toISOString()), google('g2', a(23, 10).toISOString())],
      [reunion('m', a(23, 9), { external_event_id: 'g1', status: 'cancelled' })],
    )
    expect(r.map(e => e.id)).toEqual(['g2'])
  })
  it('el de todo el día cae en su día local y antes que los que tienen hora', () => {
    const eventos = eventosDeGoogleSueltos([google('con-hora', a(23, 9).toISOString()), google('dia', '2026-10-23', true)], [])
    expect(eventos.find(e => e.id === 'dia')).toMatchObject({ title: 'Evento dia', todoElDia: true, deGoogle: true })
    const r = reunionesPorDia([...eventos, reunion('m', a(24, 9))], '2026-10-23', 7)
    expect(r.map(d => [d.dia, d.reuniones.map(x => x.id)])).toEqual([
      ['2026-10-23', ['dia', 'con-hora']],
      ['2026-10-24', ['m']],
    ])
  })
})
