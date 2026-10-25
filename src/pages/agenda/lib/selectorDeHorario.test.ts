import { describe, expect, it } from 'vitest'
import { diasDeLaSemana, fechaParaAbrir, finConLaMismaDuracion, horarioDelSlot } from './selectorDeHorario'

describe('finConLaMismaDuracion', () => {
  it('corre el fin con el inicio, conservando la duración', () => {
    expect(finConLaMismaDuracion('10:00', { time: '09:00', endTime: '09:45' })).toBe('10:45')
  })
  it('sin rango cargado (o con uno al revés) son 60 minutos', () => {
    expect(finConLaMismaDuracion('10:00', { time: '', endTime: '' })).toBe('11:00')
    expect(finConLaMismaDuracion('10:00', { time: '09:00', endTime: '08:00' })).toBe('11:00')
  })
  it('no pasa de las 23:45', () => {
    expect(finConLaMismaDuracion('23:30', { time: '09:00', endTime: '10:00' })).toBe('23:45')
  })
})

describe('horarioDelSlot', () => {
  const slot = { ymd: '2026-10-27', startTime: '11:00', endTime: '12:00' }
  it('toma el día y el inicio del slot y, sin rango cargado, su fin', () => {
    expect(horarioDelSlot(slot, { time: '', endTime: '' })).toEqual({ date: '2026-10-27', time: '11:00', endTime: '12:00' })
  })
  it('con un rango cargado conserva su duración', () => {
    expect(horarioDelSlot(slot, { time: '09:00', endTime: '09:30' })).toEqual({ date: '2026-10-27', time: '11:00', endTime: '11:30' })
  })
})

describe('fechaParaAbrir', () => {
  const hoy = new Date(2026, 9, 23, 15)
  it('abre en la semana de la fecha elegida, al mediodía local', () => {
    const d = fechaParaAbrir('2026-11-04', hoy)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 4, 12])
  })
  it('sin fecha, hoy', () => {
    expect(fechaParaAbrir('', hoy)).toBe(hoy)
  })
})

describe('diasDeLaSemana', () => {
  it('los siete días desde el lunes, cruzando de mes', () => {
    expect(diasDeLaSemana(new Date(2026, 9, 26))).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })
})
