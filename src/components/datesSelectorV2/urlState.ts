import type { CalendarDay } from '@/lib/dates'
import type { DatesMode, DatesValue, DayRange } from './types'

/**
 * Traducción entre los search params y el valor del selector. La URL guarda dos claves,
 * `from` y `to`, y la ausencia de `to` es lo que significa 'un día suelto' — la misma
 * convención que ya usa useDateRangeParams, para no tener dos verdades sobre las fechas.
 *
 * El atajo elegido no se guarda: si 'Este mes' viajara por la URL habría que resolverlo
 * de nuevo al leerlo, y ahí es donde se cuela el bug de zona horaria.
 */

export function datesValueFromParams(from: CalendarDay, to: string | null): DatesValue {
  if (!to) return { mode: 'single', primary: { from, to: from }, compare: null }

  // La URL es editable a mano: un rango invertido devolvería cero filas sin un solo error.
  const primary = to < from ? { from: to, to: from } : { from, to }
  return { mode: 'range', primary, compare: null }
}

export function paramsFromDatesValue(value: DatesValue): { from: CalendarDay; to: CalendarDay | null } {
  return {
    from: value.primary.from,
    to: value.mode === 'single' ? null : value.primary.to,
  }
}

const CALENDAR_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Los dos modos con UI. `compare` está parkeado y se guarda en el casillero de rango. */
export type StoredMode = 'single' | 'range'

/**
 * Lo guardado NO es 'la última selección', son DOS memorias independientes más el modo
 * activo. Día y Rango no se derivan uno del otro: si pasás a Día un segundo y volvés,
 * tu rango tiene que seguir ahí. Derivar (colapsar al inicio / expandir a 7 días) es
 * solo la semilla para la primera vez, cuando el casillero está vacío.
 *
 * Ojo con el reparto de roles: esto es memoria PERSONAL (localStorage). La URL sigue
 * llevando una sola selección, la activa, porque es el contrato compartido — dos
 * personas abriendo el mismo link tienen que ver exactamente los mismos números.
 */
export interface StoredDates {
  mode: StoredMode
  /** Último día elegido en modo Día. */
  single: CalendarDay | null
  /** Último rango elegido en modo Rango. */
  range: DayRange | null
}

function storedModeOf(mode: DatesMode): StoredMode {
  return mode === 'single' ? 'single' : 'range'
}

/**
 * Escribe en el casillero del modo de `value` y deja el otro intacto — por eso necesita
 * lo que ya había guardado. Sin el merge, cada cambio de modo borraría la otra memoria
 * y volveríamos justo al problema que esto viene a resolver.
 */
export function serializeDatesForStorage(value: DatesValue, prev: StoredDates | null): string {
  const mode = storedModeOf(value.mode)
  const stored: StoredDates = {
    mode,
    single: mode === 'single' ? value.primary.from : (prev?.single ?? null),
    range:
      mode === 'range'
        ? { from: value.primary.from, to: value.primary.to }
        : (prev?.range ?? null),
  }
  return JSON.stringify(stored)
}

/** Lo último que el usuario eligió en ese modo, o null si nunca lo usó. */
export function recallForMode(stored: StoredDates | null, mode: DatesMode): DayRange | null {
  if (!stored) return null
  if (mode === 'single') return stored.single ? { from: stored.single, to: stored.single } : null
  if (mode === 'range') return stored.range ? { ...stored.range } : null
  return null; // compare está parkeado: no tiene memoria porque no tiene UI
}

/** El valor con el que arranca la página cuando la URL no dice nada. */
export function datesValueFromStored(stored: StoredDates | null): DatesValue | null {
  if (!stored) return null

  const primary = recallForMode(stored, stored.mode)
  if (!primary) return null

  return { mode: stored.mode, primary, compare: null }
}

function parseDay(value: unknown): CalendarDay | null {
  return typeof value === 'string' && CALENDAR_DAY_RE.test(value) ? value : null
}

function parseRange(value: unknown): DayRange | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const from = parseDay((value as { from?: unknown }).from)
  const to = parseDay((value as { to?: unknown }).to)
  if (!from || !to) return null

  return to < from ? { from: to, to: from } : { from, to }
}

/**
 * Forma vieja `{ from, to }`: una sola selección, sin memoria por modo. Se MIGRA en vez
 * de descartarse — el que ya tenía una fecha guardada no tiene por qué perderla porque
 * nosotros cambiamos el formato.
 */
function parseLegacyStoredDates(obj: Record<string, unknown>): StoredDates | null {
  const from = parseDay(obj.from)
  if (!from) return null

  if (obj.to === undefined || obj.to === null) return { mode: 'single', single: from, range: null }

  const to = parseDay(obj.to)
  if (!to) return null

  return { mode: 'range', single: null, range: to < from ? { from: to, to: from } : { from, to } }
}

/**
 * localStorage es entrada NO confiable: lo escribió una versión anterior del código, lo
 * editó alguien desde devtools, o quedó a medias. Un sobre inválido (sin modo conocido)
 * se descarta entero y el llamador cae a su valor por defecto; un casillero podrido se
 * descarta SOLO, sin llevarse puesto al otro, porque perder las dos memorias por una
 * sola rota es castigar de más.
 */
export function parseStoredDates(raw: string | null): StoredDates | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null

  const obj = parsed as Record<string, unknown>

  if (!('mode' in obj)) return parseLegacyStoredDates(obj)
  if (obj.mode !== 'single' && obj.mode !== 'range') return null

  return { mode: obj.mode, single: parseDay(obj.single), range: parseRange(obj.range) }
}
