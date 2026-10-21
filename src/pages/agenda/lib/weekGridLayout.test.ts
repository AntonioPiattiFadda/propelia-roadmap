import { describe, it, expect } from 'vitest'
import { HOUR_HEIGHT_PX, minutesToPx, layoutOverlappingEvents, pxToSnappedTime, minutesToHHMM, viewportPxToLayoutPx } from './weekGridLayout'

describe('minutesToPx', () => {
  it('convierte minutos a píxeles según HOUR_HEIGHT_PX', () => {
    expect(minutesToPx(0)).toBe(0)
    expect(minutesToPx(60)).toBe(HOUR_HEIGHT_PX)
    expect(minutesToPx(90)).toBe(HOUR_HEIGHT_PX * 1.5)
  })
})

describe('layoutOverlappingEvents', () => {
  it('sin eventos, devuelve lista vacía', () => {
    expect(layoutOverlappingEvents([])).toEqual([])
  })

  it('un solo evento ocupa toda la columna', () => {
    const result = layoutOverlappingEvents([{ id: 'a', startMinutes: 600, endMinutes: 660 }])
    expect(result).toEqual([{ id: 'a', startMinutes: 600, endMinutes: 660, column: 0, columns: 1 }])
  })

  it('dos eventos sin superposición, cada uno ocupa toda la columna', () => {
    const result = layoutOverlappingEvents([
      { id: 'a', startMinutes: 600, endMinutes: 660 },
      { id: 'b', startMinutes: 700, endMinutes: 760 },
    ])
    expect(result.find(r => r.id === 'a')).toMatchObject({ column: 0, columns: 1 })
    expect(result.find(r => r.id === 'b')).toMatchObject({ column: 0, columns: 1 })
  })

  it('dos eventos superpuestos por completo se dividen en 2 columnas', () => {
    const result = layoutOverlappingEvents([
      { id: 'a', startMinutes: 600, endMinutes: 660 },
      { id: 'b', startMinutes: 600, endMinutes: 660 },
    ])
    const a = result.find(r => r.id === 'a')!
    const b = result.find(r => r.id === 'b')!
    expect(a.columns).toBe(2)
    expect(b.columns).toBe(2)
    expect(new Set([a.column, b.column])).toEqual(new Set([0, 1]))
  })

  it('tres eventos mutuamente superpuestos se dividen en 3 columnas', () => {
    const result = layoutOverlappingEvents([
      { id: 'a', startMinutes: 600, endMinutes: 720 },
      { id: 'b', startMinutes: 610, endMinutes: 700 },
      { id: 'c', startMinutes: 620, endMinutes: 690 },
    ])
    expect(result.every(r => r.columns === 3)).toBe(true)
    expect(new Set(result.map(r => r.column))).toEqual(new Set([0, 1, 2]))
  })

  it('cadena de superposición A-B-C (A no se superpone con C) igual arma un solo cluster', () => {
    const result = layoutOverlappingEvents([
      { id: 'a', startMinutes: 600, endMinutes: 660 }, // 10:00-11:00
      { id: 'b', startMinutes: 630, endMinutes: 690 }, // 10:30-11:30, se superpone con A
      { id: 'c', startMinutes: 675, endMinutes: 735 }, // 11:15-12:15, se superpone con B, no con A
    ])
    // A termina antes de que empiece C -> C puede reusar la columna de A
    const a = result.find(r => r.id === 'a')!
    const b = result.find(r => r.id === 'b')!
    const c = result.find(r => r.id === 'c')!
    expect(a.column).toBe(0)
    expect(b.column).toBe(1)
    expect(c.column).toBe(0)
    expect([a.columns, b.columns, c.columns]).toEqual([2, 2, 2])
  })

  it('eventos en clusters separados por el día no se afectan entre sí', () => {
    const result = layoutOverlappingEvents([
      { id: 'a', startMinutes: 600, endMinutes: 660 },
      { id: 'b', startMinutes: 600, endMinutes: 660 },
      { id: 'c', startMinutes: 900, endMinutes: 960 },
    ])
    expect(result.find(r => r.id === 'c')).toMatchObject({ column: 0, columns: 1 })
  })
})

describe('minutesToHHMM', () => {
  it('formatea con padding de horas y minutos', () => {
    expect(minutesToHHMM(0)).toBe('00:00')
    expect(minutesToHHMM(90)).toBe('01:30')
    expect(minutesToHHMM(600)).toBe('10:00')
  })
})

describe('pxToSnappedTime', () => {
  it('trunca al slot de 30 minutos: la banda donde caés es la que se crea', () => {
    // Todo click dentro de la banda 10:00-10:30 crea las 10:00, cruce o no la mitad.
    expect(pxToSnappedTime(minutesToPx(600))).toEqual({ startMinutes: 600, endMinutes: 660 })
    expect(pxToSnappedTime(minutesToPx(605))).toEqual({ startMinutes: 600, endMinutes: 660 })
    expect(pxToSnappedTime(minutesToPx(620))).toEqual({ startMinutes: 600, endMinutes: 660 })
    expect(pxToSnappedTime(minutesToPx(629))).toEqual({ startMinutes: 600, endMinutes: 660 })
    // Recién al cruzar la línea se pasa a la banda siguiente.
    expect(pxToSnappedTime(minutesToPx(630))).toEqual({ startMinutes: 630, endMinutes: 690 })
  })

  // Antes se usaba `Math.round`, y la banda que producía las 07:00 iba de 06:45 a 07:15:
  // corrida media banda hacia ARRIBA de la grilla dibujada. Se sentía como un grid desplazado.
  it('un click justo debajo de una línea de hora no cae en la banda de arriba', () => {
    expect(pxToSnappedTime(minutesToPx(7 * 60 + 20)).startMinutes).toBe(7 * 60)
    expect(pxToSnappedTime(minutesToPx(7 * 60 + 50)).startMinutes).toBe(7 * 60 + 30)
  })

  it('un click exactamente sobre la línea abre esa hora, no la media hora anterior', () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(pxToSnappedTime(minutesToPx(hour * 60)).startMinutes).toBe(hour * 60)
    }
  })

  it('la duración default es 60 minutos', () => {
    expect(pxToSnappedTime(minutesToPx(480))).toEqual({ startMinutes: 480, endMinutes: 540 })
  })

  it('no permite un start negativo (click arriba del todo)', () => {
    expect(pxToSnappedTime(-50)).toEqual({ startMinutes: 0, endMinutes: 60 })
  })

  it('clampea el end a las 24hs (click al final del todo)', () => {
    expect(pxToSnappedTime(minutesToPx(23 * 60 + 50))).toEqual({ startMinutes: 23 * 60 + 30, endMinutes: 24 * 60 })
  })
})

describe('viewportPxToLayoutPx', () => {
  it('sin zoom (1) es la identidad', () => {
    expect(viewportPxToLayoutPx(600, 1)).toBe(600)
  })

  it('deshace el zoom: 1080px de viewport al 90% son 1200px de layout', () => {
    expect(viewportPxToLayoutPx(1080, 0.9)).toBeCloseTo(1200)
  })

  it('un zoom inválido (0, NaN) no rompe la medición: se comporta como sin zoom', () => {
    expect(viewportPxToLayoutPx(600, 0)).toBe(600)
    expect(viewportPxToLayoutPx(600, Number.NaN)).toBe(600)
  })
})

// Regresión del desfasaje del click en la agenda. La página entera corre con `.ui-scale`
// (`zoom: 0.9`), y `clientY - rect.top` viene en px de viewport — ya escalados —, mientras
// que HOUR_HEIGHT_PX es px de layout. Sin corregir, el error es del 10% y crece con la hora.
describe('click en el grid con zoom: 0.9 (regresión del desfasaje)', () => {
  const ZOOM = 0.9
  const clickAt = (minutes: number) => minutesToPx(minutes) * ZOOM // lo que reporta el navegador

  it('sin corregir, un click a las 20:00 crea la visita a las 18:00', () => {
    expect(minutesToHHMM(pxToSnappedTime(clickAt(20 * 60)).startMinutes)).toBe('18:00')
  })

  it('corrigiendo por el zoom, un click a las 20:00 crea la visita a las 20:00', () => {
    const startMinutes = pxToSnappedTime(viewportPxToLayoutPx(clickAt(20 * 60), ZOOM)).startMinutes
    expect(minutesToHHMM(startMinutes)).toBe('20:00')
  })

  it('cae en el horario correcto a lo largo de todo el día', () => {
    for (const hour of [0, 7, 9, 12, 15, 20, 23]) {
      const startMinutes = pxToSnappedTime(viewportPxToLayoutPx(clickAt(hour * 60), ZOOM)).startMinutes
      expect(minutesToHHMM(startMinutes)).toBe(minutesToHHMM(hour * 60))
    }
  })
})
