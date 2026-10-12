import { useCallback, useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import type { DatesMode, DatesValue } from './types'
import {
  datesValueFromParams,
  datesValueFromStored,
  paramsFromDatesValue,
  parseStoredDates,
  recallForMode,
  serializeDatesForStorage,
} from './urlState'

/**
 * Estado del selector para cualquier página: la URL es la fuente de verdad y localStorage
 * es su espejo, con una memoria por ruta Y por modo.
 *
 * El orden de prioridad importa: URL > storage > valor por defecto. Si el storage pudiera
 * pisar a la URL, dos personas abriendo el mismo link verían números distintos — y en una
 * pantalla de plata eso es inaceptable. El storage es memoria personal; la URL es contrato.
 *
 * Día y Rango son estados INDEPENDIENTES. El selector, al cambiar de modo, emite un valor
 * derivado (colapsa al inicio / expande a 7 días); acá ese valor se usa solo como semilla,
 * y si el usuario ya había elegido algo en el modo destino, gana lo suyo.
 */

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null; // modo privado, site data bloqueada
  }
}

function writeStorage(key: string, raw: string): void {
  try {
    localStorage.setItem(key, raw)
  } catch {
    // cuota llena o storage bloqueado: perder la memoria no puede romper la página
  }
}

export function useDatesValueParams(
  defaultValue: DatesValue,
  storageKey?: string,
): [DatesValue, (next: DatesValue) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const { pathname } = useLocation()
  const key = storageKey ?? `${pathname}:dates`

  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  /**
  * Se resuelve en el PRIMER render, no en un efecto: si esperáramos al efecto, las
  * queries ya habrían salido con el valor por defecto y refetchearían al restaurar.
  */
  const [initialValue] = useState<DatesValue>(() => {
    return datesValueFromStored(parseStoredDates(readStorage(key))) ?? defaultValue
  })

  const value = fromParam ? datesValueFromParams(fromParam, toParam) : initialValue

  /** El modo activo AHORA. Es lo único que hace falta para detectar el salto de modo. */
  const currentMode: DatesMode = fromParam ? (toParam ? 'range' : 'single') : initialValue.mode

  const setValue = useCallback(
    (next: DatesValue) => {
      // Salto de modo: gana lo último que el usuario eligió en el modo destino. Lo
      // que emite el selector queda como semilla para cuando ese casillero está vacío.
      const recalled =
        next.mode === currentMode
          ? null
          : recallForMode(parseStoredDates(readStorage(key)), next.mode)
      const committed = recalled ? { ...next, primary: recalled } : next

      const params = paramsFromDatesValue(committed)
      setSearchParams(
        (prev) => {
          // Updater funcional para no pisar el resto de los params (locs, tabs, etc).
          const p = new URLSearchParams(prev)
          p.set('from', params.from)
          if (params.to === null) p.delete('to')
          else p.set('to', params.to)
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams, key, currentMode],
  )

  // Al montar sin fechas en la URL, publicá las que valen para que el link sea compartible.
  useEffect(() => {
    if (fromParam) return
    setValue(initialValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El storage espeja lo que diga la URL, venga de donde venga. Merge contra lo que ya
  // había: escribir el modo activo no puede borrar la memoria del otro.
  useEffect(() => {
    if (!fromParam) return
    const prev = parseStoredDates(readStorage(key))
    writeStorage(key, serializeDatesForStorage(datesValueFromParams(fromParam, toParam), prev))
  }, [fromParam, toParam, key])

  return [value, setValue]
}
