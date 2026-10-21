import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

// Llegada desde un link "Conectar ahora"/deep link externo: resalta el elemento referenciado
// y limpia el param `highlight` para no re-disparar el efecto en renders posteriores.
export function useHighlightOnDeepLink<T extends HTMLElement>(paramValue: string): {
  ref: React.RefObject<T | null>
  highlighted: boolean
} {
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlighted, setHighlighted] = useState(false)
  const ref = useRef<T>(null)

  useEffect(() => {
    if (searchParams.get('highlight') !== paramValue) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- llegada por deep link externo, no hay otro disparador React
    setHighlighted(true)
    const timeout = setTimeout(() => setHighlighted(false), 2500)
    const next = new URLSearchParams(searchParams)
    next.delete('highlight')
    setSearchParams(next, { replace: true })
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr una vez al montar con el param presente
  }, [])

  return { ref, highlighted }
}
