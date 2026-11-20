import { describe, expect, it } from 'vitest'
import {
  avisosDelRitmo, diasHabilesAnteriores, estadoDelRitmo, explicacionDelRitmo, minutosDeHora, tipoDeDia,
  type MemoriaDeAvisos,
} from './ritmoDelDia'

const a = (hora: string) => minutosDeHora(hora)

describe('estadoDelRitmo: la tabla de referencia', () => {
  const tabla: [string, number, number][] = [
    // hora, umbral amarillo, umbral verde
    ['11:30', 6, 8],
    ['12:30', 12, 15],
    ['13:30', 18, 23],
    ['14:00', 22, 27],
    ['16:00', 28, 35],
    ['17:00', 34, 42],
    ['18:00', 40, 50],
  ]
  it.each(tabla)('%s: rojo < %i, verde desde %i', (hora, amarillo, verde) => {
    const m = a(hora)
    expect(estadoDelRitmo(amarillo - 1, m)!.color).toBe('rojo')
    expect(estadoDelRitmo(amarillo, m)!.color).toBe('amarillo')
    expect(estadoDelRitmo(verde - 1, m)!.color).toBe('amarillo')
    expect(estadoDelRitmo(verde, m)!.color).toBe('verde')
    expect(estadoDelRitmo(0, m)).toMatchObject({ umbralAmarillo: amarillo, umbralVerde: verde })
  })
})

describe('estadoDelRitmo: bordes', () => {
  it('la pausa mantiene los umbrales de las 14:00', () => {
    for (const h of ['14:00', '14:30', '14:59', '15:00']) {
      expect(estadoDelRitmo(0, a(h))).toMatchObject({ umbralAmarillo: 22, umbralVerde: 27 })
    }
    expect(estadoDelRitmo(0, a('14:30'))!.enPausa).toBe(true)
  })

  it('antes del inicio es verde y los umbrales están en cero', () => {
    const e = estadoDelRitmo(0, a('09:00'))!
    expect(e).toMatchObject({ color: 'verde', momento: 'antes', umbralAmarillo: 0, umbralVerde: 0 })
  })

  it('los primeros 45 minutos son siempre verdes', () => {
    expect(estadoDelRitmo(0, a('10:30'))!.color).toBe('verde')
    expect(estadoDelRitmo(0, a('11:14'))).toMatchObject({ color: 'verde', momento: 'gracia' })
    // A las 11:15 ya cuenta: round(40·45/390) = 5.
    expect(estadoDelRitmo(0, a('11:15'))).toMatchObject({ color: 'rojo', momento: 'jornada' })
  })

  it('después de las 18:00 vale la meta del día entero', () => {
    expect(estadoDelRitmo(45, a('20:00'))).toMatchObject({ color: 'amarillo', momento: 'terminada', umbralAmarillo: 40, umbralVerde: 50 })
    expect(estadoDelRitmo(39, a('23:59'))!.color).toBe('rojo')
  })

  it('con 50 alcanzados es verde fijo', () => {
    expect(estadoDelRitmo(50, a('18:00'))!.color).toBe('verde')
    expect(estadoDelRitmo(50, a('12:00'))).toMatchObject({ color: 'verde', asegurado: true })
  })

  it('el día libre no tiene ritmo', () => {
    expect(estadoDelRitmo(10, a('12:00'), 'libre')).toBeNull()
  })

  it('la media jornada termina a las 14:00 con la meta de lo trabajado', () => {
    const e = estadoDelRitmo(0, a('17:00'), 'media')!
    expect(e).toMatchObject({ momento: 'terminada', umbralAmarillo: 22, umbralVerde: 27 })
    expect(estadoDelRitmo(27, a('17:00'), 'media')!.color).toBe('verde')
    expect(estadoDelRitmo(10, a('12:30'), 'media')).toMatchObject({ umbralAmarillo: 12, umbralVerde: 15 })
  })

  it('la proyección se ve desde las 12:30 y es hasta el cierre de la jornada', () => {
    expect(estadoDelRitmo(10, a('12:29'))!.proyeccion).toBeNull()
    // f = 120/390 → 12 / f = 39.
    expect(estadoDelRitmo(12, a('12:30'))!.proyeccion).toBe(39)
    // Media jornada: cierra a 210 minutos → 12 · 210/120 = 21.
    expect(estadoDelRitmo(12, a('12:30'), 'media')!.proyeccion).toBe(21)
  })
})

describe('tipoDeDia', () => {
  it('fin de semana es libre; un día marcado manda', () => {
    expect(tipoDeDia('2026-11-21')).toBe('libre') // sábado
    expect(tipoDeDia('2026-11-19')).toBe('completo')
    expect(tipoDeDia('2026-11-19', { '2026-11-19': 'media' })).toBe('media')
    expect(tipoDeDia('2026-11-20', { '2026-11-20': 'libre' })).toBe('libre')
  })
})

describe('diasHabilesAnteriores', () => {
  it('salta el fin de semana', () => {
    expect(diasHabilesAnteriores('2026-11-23', 3)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18'])
  })
})

describe('avisosDelRitmo', () => {
  const vacia = (): MemoriaDeAvisos => ({ enviados: [], ultimoColor: null })
  const correr = (m: MemoriaDeAvisos, contestadas: number, hora: string, tipo: 'completo' | 'media' = 'completo') => {
    const r = avisosDelRitmo(m, contestadas, a(hora), tipo)
    return r
  }

  it('un punto de control avisa una sola vez', () => {
    const r1 = correr(vacia(), 15, '12:30')
    expect(r1.avisos.map(x => x.clave)).toEqual(['punto-750'])
    expect(r1.avisos[0].texto).toContain('Vas en verde')
    const r2 = correr(r1.memoria, 15, '12:35')
    expect(r2.avisos).toEqual([])
    const r3 = correr(r2.memoria, 15, '12:50')
    expect(r3.avisos).toEqual([])
  })

  it('un punto que ya pasó hace rato no avisa al abrir la app', () => {
    expect(correr(vacia(), 15, '13:45').avisos).toEqual([])
  })

  it('los textos de amarillo y rojo dicen cuánto falta', () => {
    expect(correr(vacia(), 13, '12:30').avisos[0].texto)
      .toBe('🟡 Vas en amarillo: llevás 13 y para estar en verde a esta hora necesitás 15. Te faltan 2.')
    const rojo = correr(vacia(), 5, '12:30').avisos[0]
    expect(rojo).toMatchObject({ color: 'rojo' })
    expect(rojo.texto).toBe('🔴 Estás en rojo: llevás 5 contactados y a esta hora deberías tener al menos 12 (verde: 15). Al ritmo actual cerrás con 16. ¡Metele pata!')
  })

  it('fuera de los puntos avisa solo cuando el color mejora', () => {
    let m: MemoriaDeAvisos = { enviados: ['punto-750'], ultimoColor: 'rojo' }
    let r = correr(m, 10, '13:10') // sigue en rojo
    expect(r.avisos).toEqual([])
    m = r.memoria
    r = correr(m, 16, '13:10') // amarillo
    expect(r.avisos.map(x => x.texto)).toEqual(['💪 ¡Pasaste a amarillo! Llevás 16 contactados.'])
    r = correr(r.memoria, 16, '13:40') // la hora lo baja a rojo: no avisa
    expect(r.avisos).toEqual([])
  })

  it('el primer cálculo no avisa una mejora', () => {
    expect(correr(vacia(), 20, '13:40').avisos).toEqual([])
  })

  it('avisa al llegar a 50 y a 60, una vez cada uno', () => {
    let r = correr({ enviados: [], ultimoColor: 'verde' }, 50, '15:20')
    expect(r.avisos.map(x => x.clave)).toEqual(['meta-50'])
    r = correr(r.memoria, 55, '15:30')
    expect(r.avisos).toEqual([])
    r = correr(r.memoria, 60, '15:40')
    expect(r.avisos.map(x => x.texto)).toEqual(['🔥 ¡60 contactados, día top!'])
  })

  it('el cierre de las 18:00 compara con la media', () => {
    const r = avisosDelRitmo(vacia(), 44, a('18:05'), 'completo', 40)
    expect(r.avisos[0]).toMatchObject({ clave: 'punto-1080', cierre: true, color: 'amarillo' })
    expect(r.avisos[0].texto).toBe('🏁 Cierre del día: 44 contactados, en amarillo. Tu media de los últimos 5 días es 40 (+4).')
  })

  it('en media jornada el cierre es a las 14:00 y no hay puntos después', () => {
    const r = correr(vacia(), 30, '14:00', 'media')
    expect(r.avisos[0]).toMatchObject({ clave: 'punto-840', cierre: true })
    expect(correr(r.memoria, 30, '16:30', 'media').avisos).toEqual([])
  })
})

describe('explicacionDelRitmo', () => {
  it('dice por qué el color', () => {
    const e = estadoDelRitmo(13, a('12:30'))!
    const x = explicacionDelRitmo(e, 13)
    expect(x.porque).toBe('Vas en amarillo: tenés 13, más que los 12 del amarillo pero menos que los 15 del verde. Te faltan 2 para el verde.')
    expect(x.proyeccion).toBe('Proyección al cierre: 42.')
  })
})
