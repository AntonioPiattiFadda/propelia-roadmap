import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  monthStart,
  monthEnd,
  mondayOf,
  findPreset,
  presetsForMode,
  activePresetKey,
} from './presets'

/**
 * 2026-09-20 es DOMINGO, y 23:30 en Argentina ya es 2026-09-21T02:30Z.
 * (Las fechas se arman con componentes LOCALES: así el test no depende de la zona de quien lo corre;
 * la trampa del UTC corrido solo muerde en zonas al oeste de Greenwich, como la de Argentina.)
 * Las dos cosas juntas son la trampa: cualquier implementación que use
 * `toISOString().slice(0, 10)` devuelve el día siguiente, y cualquiera que
 * calcule la semana con `getDay()` crudo manda el domingo a la semana que viene.
 */
const DOMINGO_2330_AR = new Date(2026, 8, 20, 23, 30)

/**
 * Lunes y miércoles de esa MISMA semana (la del 14 al 20), también a las 23:30 de
 * Argentina para no perder la trampa del día UTC corrido.
 */
const LUNES_2330_AR = new Date(2026, 8, 14, 23, 30)
const MIERCOLES_2330_AR = new Date(2026, 8, 16, 23, 30)

const resolve = (key: string) => findPreset(key)!.resolve()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(DOMINGO_2330_AR)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('monthStart / monthEnd', () => {
  it('lleva un día al primero y al último de su mes', () => {
    expect(monthStart('2026-09-20')).toBe('2026-09-01')
    expect(monthEnd('2026-09-20')).toBe('2026-09-30')
  })

  it('resuelve febrero de un año bisiesto', () => {
    expect(monthEnd('2028-02-10')).toBe('2028-02-29')
  })

  it('resuelve febrero de un año no bisiesto', () => {
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
  })
})

describe('mondayOf', () => {
  it('manda el domingo al lunes ANTERIOR, no al siguiente', () => {
    expect(mondayOf('2026-09-20')).toBe('2026-09-14')
  })

  it('deja el lunes donde está', () => {
    expect(mondayOf('2026-09-14')).toBe('2026-09-14')
  })

  it('cruza el cambio de mes hacia atrás', () => {
    expect(mondayOf('2026-10-01')).toBe('2026-09-28')
  })
})

describe('atajos de día', () => {
  it('Hoy usa el día LOCAL aunque en UTC ya sea mañana', () => {
    expect(resolve('hoy')).toEqual({ from: '2026-09-20', to: '2026-09-20' })
  })

  it('Ayer y Anteayer retroceden desde el día local', () => {
    expect(resolve('ayer')).toEqual({ from: '2026-09-19', to: '2026-09-19' })
    expect(resolve('anteayer')).toEqual({ from: '2026-09-18', to: '2026-09-18' })
  })

  it('Hace una semana es un día suelto, no un rango', () => {
    expect(resolve('haceUnaSemana')).toEqual({ from: '2026-09-13', to: '2026-09-13' })
  })
})

describe('atajos de rango', () => {
  it('Esta semana va de lunes a domingo', () => {
    expect(resolve('estaSemana')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
  })

  it('Semana pasada va del lunes al domingo anteriores', () => {
    expect(resolve('semanaPasada')).toEqual({ from: '2026-09-07', to: '2026-09-13' })
  })

  it('Últimos 7 días incluye hoy y los seis previos', () => {
    expect(resolve('ultimos7')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
  })

  it('Este mes entero llega al último día aunque todavía no haya pasado', () => {
    expect(resolve('esteMes')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  })

  it('Este mes hasta hoy corta en el día local, sin arrastrar días sin datos', () => {
    expect(resolve('esteMesHastaHoy')).toEqual({ from: '2026-09-01', to: '2026-09-20' })
  })

  it('Este mes hasta hoy, el día 1, es un rango de un solo día', () => {
    vi.setSystemTime(new Date(2026, 8, 1, 23, 30))

    expect(resolve('esteMesHastaHoy')).toEqual({ from: '2026-09-01', to: '2026-09-01' })
  })

  it('Mes pasado cubre el mes anterior completo', () => {
    expect(resolve('mesPasado')).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  it('Este trimestre cubre Q3', () => {
    expect(resolve('esteTrimestre')).toEqual({ from: '2026-07-01', to: '2026-09-30' })
  })

  it('Este año cubre el año entero', () => {
    expect(resolve('esteAnio')).toEqual({ from: '2026-01-01', to: '2026-12-31' })
  })
})

describe('Esta semana hasta hoy', () => {
  it('corta en el día local en vez de arrastrar el resto de la semana', () => {
    vi.setSystemTime(MIERCOLES_2330_AR)

    expect(resolve('estaSemanaHastaHoy')).toEqual({ from: '2026-09-14', to: '2026-09-16' })
  })

  it('el domingo llega hasta el final y empata con Esta semana', () => {
    expect(resolve('estaSemanaHastaHoy')).toEqual({ from: '2026-09-14', to: '2026-09-20' })
  })

  it('no se ofrece los lunes: sería un rango de un solo día y para eso está el modo Día', () => {
    vi.setSystemTime(LUNES_2330_AR)

    expect(presetsForMode('range').map((p) => p.key)).not.toContain('estaSemanaHastaHoy')
  })

  it('el resto de la semana sí se ofrece', () => {
    vi.setSystemTime(MIERCOLES_2330_AR)
    expect(presetsForMode('range').map((p) => p.key)).toContain('estaSemanaHastaHoy')

    vi.setSystemTime(DOMINGO_2330_AR)
    expect(presetsForMode('range').map((p) => p.key)).toContain('estaSemanaHastaHoy')
  })

  it('el lunes esconde SOLO este atajo, no los demás de semana', () => {
    vi.setSystemTime(LUNES_2330_AR)

    const keys = presetsForMode('range').map((p) => p.key)
    expect(keys).toContain('estaSemana')
    expect(keys).toContain('semanaPasada')
  })

  /**
  * La disponibilidad es una propiedad de la LISTA que se ofrece, no del atajo: si el
  * día de mañana algo guarda la key, `findPreset` la tiene que seguir resolviendo.
  */
  it('findPreset lo encuentra y lo resuelve igual un lunes', () => {
    vi.setSystemTime(LUNES_2330_AR)

    expect(findPreset('estaSemanaHastaHoy')).toBeDefined()
    expect(resolve('estaSemanaHastaHoy')).toEqual({ from: '2026-09-14', to: '2026-09-14' })
  })

  it('sigue siendo un atajo de rango, nunca aparece en modo Día', () => {
    vi.setSystemTime(MIERCOLES_2330_AR)

    expect(presetsForMode('single').map((p) => p.key)).not.toContain('estaSemanaHastaHoy')
  })
})

describe('resolve() se evalúa al llamarlo', () => {
  it('Hoy cambia cuando pasa la medianoche, sin recargar el módulo', () => {
    expect(resolve('hoy').from).toBe('2026-09-20')

    vi.setSystemTime(new Date(2026, 8, 21, 0, 10))

    expect(resolve('hoy').from).toBe('2026-09-21')
  })
})

describe('presetsForMode', () => {
  it('en modo single ofrece solo atajos de un día', () => {
    const keys = presetsForMode('single').map((p) => p.key)
    expect(keys).toContain('hoy')
    expect(keys).toContain('anteayer')
    expect(keys).not.toContain('esteMes')
    expect(keys).not.toContain('estaSemana')
  })

  it('en modo range ofrece los atajos de rango', () => {
    const keys = presetsForMode('range').map((p) => p.key)
    expect(keys).toContain('estaSemana')
    expect(keys).toContain('esteMes')
    expect(keys).not.toContain('anteayer')
  })

  it('en modo range no ofrece días sueltos: un rango de un día no es un atajo útil', () => {
    const keys = presetsForMode('range').map((p) => p.key)
    expect(keys).not.toContain('hoy')
    expect(keys).not.toContain('ayer')
  })

  // 'Este mes hasta hoy' el día 1 resuelve a un solo día, así que el invariante no es
  // `from < to` sino que ningún atajo devuelva el rango dado vuelta.
  it('ningún atajo de range devuelve un rango invertido', () => {
    for (const preset of presetsForMode('range')) {
      const { from, to } = preset.resolve()
      expect(from <= to).toBe(true)
    }
  })

  it('cada atajo de single devuelve un rango de un solo día', () => {
    for (const preset of presetsForMode('single')) {
      const range = preset.resolve()
      expect(range.from).toBe(range.to)
    }
  })
})

describe('activePresetKey', () => {
  it('reconoce el mes calendario completo', () => {
    expect(activePresetKey({ from: '2026-09-01', to: '2026-09-30' }, 'range')).toBe('esteMes')
  })

  it('reconoce hoy en modo single', () => {
    expect(activePresetKey({ from: '2026-09-20', to: '2026-09-20' }, 'single')).toBe('hoy')
  })

  it('devuelve null para un rango armado a mano', () => {
    expect(activePresetKey({ from: '2026-09-03', to: '2026-09-17' }, 'range')).toBeNull()
  })

  /**
  * Agosto tiene 31 días, así que 'Últimos 30 días' no coincide y el único empate es
  * entre los dos atajos de mes. En un mes de 30 días la colisión es a tres bandas y da
  * igual cuál gane: los tres describen el mismo rango.
  */
  it('el último día del mes los dos atajos de mes coinciden: gana el primero de la lista', () => {
    vi.setSystemTime(new Date(2026, 7, 31, 23, 30))

    expect(activePresetKey({ from: '2026-08-01', to: '2026-08-31' }, 'range')).toBe('esteMes')
  })

  /** Mismo empate que el de fin de mes, una semana antes: el domingo 'hasta hoy' es la semana entera. */
  it('el domingo empatan los dos atajos de semana: gana el primero de la lista', () => {
    expect(activePresetKey({ from: '2026-09-14', to: '2026-09-20' }, 'range')).toBe('estaSemana')
  })

  it('un lunes no marca activo un atajo que no se está ofreciendo', () => {
    vi.setSystemTime(LUNES_2330_AR)

    expect(activePresetKey({ from: '2026-09-14', to: '2026-09-14' }, 'range')).toBeNull()
  })
})
