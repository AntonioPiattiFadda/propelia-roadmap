import { describe, expect, it } from 'vitest'
import {
  alarmasParaDisparar, claveDeAlarma, horaCorta, horaEnVenezuela, MINUTOS_DE_AVISO, MINUTOS_DE_VIGENCIA,
  momentoDeLaTarea, opcionesConLaEscrita, opcionesDeHora, podarAvisadas, rotuloConHora, type TareaConAlarma,
} from './alarmas'

const tarea = (over: Partial<TareaConAlarma> = {}): TareaConAlarma => ({
  id: 't1', due_date: '2026-10-19', due_time: '10:30:00', completed: false, deleted_at: null, ...over,
})
// La hora de la tarea es hora de España. El 19/10/2026 Madrid va en horario de verano (UTC+2):
// los instantes se arman en UTC para que el test no dependa de la zona de la máquina que lo corre.
const a = (h: number, m: number, dia = 19) => new Date(Date.UTC(2026, 9, dia, h - 2, m))

describe('momentoDeLaTarea', () => {
  it('día + hora de España, en verano (UTC+2)', () => {
    expect(momentoDeLaTarea('2026-10-19', '10:30')?.toISOString()).toBe('2026-10-19T08:30:00.000Z')
  })
  it('día + hora de España, en invierno (UTC+1, desde el 25/10/2026)', () => {
    expect(momentoDeLaTarea('2026-10-26', '10:30')?.toISOString()).toBe('2026-10-26T09:30:00.000Z')
  })
  it('día + hora en España', () => {
    expect(momentoDeLaTarea('2026-10-19', '10:30:00')?.getTime()).toBe(a(10, 30).getTime())
  })
  it('acepta la hora sin segundos (lo que da el <input type="time">)', () => {
    expect(momentoDeLaTarea('2026-10-19', '10:30')?.getTime()).toBe(a(10, 30).getTime())
  })
  it('sin hora, sin fecha o sin la columna (antes de la migración llega undefined): null', () => {
    expect(momentoDeLaTarea('2026-10-19', null)).toBeNull()
    expect(momentoDeLaTarea('2026-10-19', undefined)).toBeNull()
    expect(momentoDeLaTarea(null, '10:30:00')).toBeNull()
  })
  it('basura: null y no Invalid Date', () => {
    expect(momentoDeLaTarea('2026-10-19', 'mañana')).toBeNull()
  })
})

describe('alarmasParaDisparar', () => {
  const nada = new Set<string>()

  it('suena 5 minutos antes, no 6', () => {
    expect(MINUTOS_DE_AVISO).toBe(5)
    expect(alarmasParaDisparar([tarea()], a(10, 24), nada)).toEqual([])
    expect(alarmasParaDisparar([tarea()], a(10, 25), nada).map(t => t.id)).toEqual(['t1'])
  })
  it('sigue sonando si el tic llegó tarde (pestaña en segundo plano)', () => {
    expect(alarmasParaDisparar([tarea()], a(10, 40), nada).map(t => t.id)).toEqual(['t1'])
  })
  it('no suena dos veces', () => {
    expect(alarmasParaDisparar([tarea()], a(10, 26), new Set([claveDeAlarma(tarea())]))).toEqual([])
  })
  it('reagendar la tarea vuelve a armar la alarma', () => {
    const avisada = new Set([claveDeAlarma(tarea())])
    expect(alarmasParaDisparar([tarea({ due_time: '10:45:00' })], a(10, 41), avisada).map(t => t.id)).toEqual(['t1'])
    expect(alarmasParaDisparar([tarea({ due_date: '2026-10-20' })], a(10, 26, 20), avisada).map(t => t.id)).toEqual(['t1'])
  })
  it('vieja: abrir el CRM a la tarde no hace sonar las de la mañana', () => {
    const limite = new Date(a(10, 30).getTime() + MINUTOS_DE_VIGENCIA * 60_000)
    expect(alarmasParaDisparar([tarea()], limite, nada).map(t => t.id)).toEqual(['t1'])
    expect(alarmasParaDisparar([tarea()], new Date(limite.getTime() + 1), nada)).toEqual([])
    expect(alarmasParaDisparar([tarea()], a(16, 0), nada)).toEqual([])
  })
  it('completada, borrada o sin hora: nunca', () => {
    expect(alarmasParaDisparar([
      tarea({ id: 'hecha', completed: true }),
      tarea({ id: 'borrada', deleted_at: '2026-10-19T08:00:00Z' }),
      tarea({ id: 'sinHora', due_time: null }),
      tarea({ id: 'sinFecha', due_date: null }),
    ], a(10, 26), nada)).toEqual([])
  })
  it('devuelve varias en orden de hora', () => {
    const r = alarmasParaDisparar([
      tarea({ id: 'tarde', due_time: '10:33:00' }),
      tarea({ id: 'temprano', due_time: '10:28:00' }),
      tarea({ id: 'futura', due_time: '12:00:00' }),
    ], a(10, 30), nada)
    expect(r.map(t => t.id)).toEqual(['temprano', 'tarde'])
  })
})

describe('claveDeAlarma', () => {
  it('lleva el id, el día y la hora sin segundos', () => {
    expect(claveDeAlarma(tarea())).toBe('t1@2026-10-19T10:30')
    expect(claveDeAlarma(tarea({ due_time: '10:30' }))).toBe('t1@2026-10-19T10:30')
  })
})

describe('podarAvisadas', () => {
  it('tira las de hace más de dos días y las que no se entienden', () => {
    const ahora = a(9, 0, 19)
    expect(podarAvisadas([
      't1@2026-10-19T10:30', 't2@2026-10-17T10:30', 't3@2026-10-16T10:30', 'basura',
    ], ahora)).toEqual(['t1@2026-10-19T10:30', 't2@2026-10-17T10:30'])
  })
})

describe('horaCorta / rotuloConHora', () => {
  it('HH:MM sin segundos', () => {
    expect(horaCorta('10:30:00')).toBe('10:30')
    expect(horaCorta('09:05')).toBe('09:05')
    expect(horaCorta(null)).toBeNull()
    expect(horaCorta(undefined)).toBeNull()
  })
  it('pega la hora de España y, al lado, la de Venezuela', () => {
    expect(rotuloConHora('Hoy', '2026-10-19', '10:30:00')).toBe('Hoy 10:30 (04:30 VE)')
    expect(rotuloConHora('Hoy', '2026-10-19', null)).toBe('Hoy')
    expect(rotuloConHora('Hoy', '2026-10-19', undefined)).toBe('Hoy')
  })
})

describe('horaEnVenezuela', () => {
  it('6 horas menos en verano y 5 en invierno (Venezuela no cambia la hora)', () => {
    expect(horaEnVenezuela('2026-10-19', '10:30')).toEqual({ hora: '04:30', dias: 0 })
    expect(horaEnVenezuela('2026-10-26', '10:30')).toEqual({ hora: '05:30', dias: 0 })
  })
  it('de madrugada en España cae el día anterior en Venezuela', () => {
    expect(horaEnVenezuela('2026-10-19', '02:00')).toEqual({ hora: '20:00', dias: -1 })
  })
  it('sin día u hora: null', () => {
    expect(horaEnVenezuela(null, '10:30')).toBeNull()
    expect(horaEnVenezuela('2026-10-19', null)).toBeNull()
  })
})

describe('opcionesDeHora', () => {
  it('de 15 en 15 minutos, de 07:00 a 23:00 de España, con la hora de Venezuela de cada una', () => {
    const o = opcionesDeHora('2026-10-19')
    expect(o).toHaveLength(65)
    expect(o[0]).toEqual({ value: '07:00', venezuela: '01:00', dias: 0 })
    expect(o.find(x => x.value === '10:30')).toEqual({ value: '10:30', venezuela: '04:30', dias: 0 })
    expect(o[o.length - 1]).toEqual({ value: '23:00', venezuela: '17:00', dias: 0 })
  })
})

describe('opcionesConLaEscrita', () => {
  it('una hora escrita a mano que no está en la lista entra en su lugar, en orden', () => {
    const o = opcionesConLaEscrita('2026-10-19', '10:10')
    expect(o).toHaveLength(66)
    const i = o.findIndex(x => x.value === '10:10')
    expect(o[i]).toEqual({ value: '10:10', venezuela: '04:10', dias: 0 })
    expect([o[i - 1].value, o[i + 1].value]).toEqual(['10:00', '10:15'])
  })
  it('fuera del rango también (06:30, antes de las 07:00)', () => {
    expect(opcionesConLaEscrita('2026-10-19', '06:30')[0].value).toBe('06:30')
  })
  it('si ya está en la lista o no hay hora, la lista queda igual', () => {
    expect(opcionesConLaEscrita('2026-10-19', '10:30')).toHaveLength(65)
    expect(opcionesConLaEscrita('2026-10-19', '')).toHaveLength(65)
  })
})
