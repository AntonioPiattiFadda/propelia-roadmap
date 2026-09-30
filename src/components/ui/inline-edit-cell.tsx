import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onSave: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

/**
 * Celda de edición inline: siempre es un input, sin bordes ni fondo.
 * Click sobre el texto para editar; blur confirma (solo si cambió y no
 * quedó vacío), Enter dispara el blur y Escape cancela sin guardar.
 */
export function InlineEditCell({ value, onSave, className, style }: Props) {
  // null = sin editar (el input muestra el valor del server); string = borrador en curso.
  const [draft, setDraft] = useState<string | null>(null)
  // Escape también dispara blur al soltar el foco: sin este flag, cancelar guardaría igual.
  const cancelled = useRef(false)

  // Si el valor del server cambia, el borrador viejo deja de tener sentido.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(null)
  }

  const handleBlur = () => {
    if (cancelled.current) {
      cancelled.current = false
      setDraft(null)
      return
    }
    const next = (draft ?? '').trim()
    if (draft === null || !next || next === value) {
      setDraft(null)
      return
    }
    onSave(next)
  }

  const shown = draft ?? value

  return (
    <input
      value={shown}
      size={Math.max(shown.length, 1)}
      onFocus={() => { cancelled.current = false }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      aria-label="Editar valor"
      className={cn(
        // `box-content`: el ancho lo fija el atributo `size` (en caracteres) y con
        // border-box el padding se lo comería, recortando el texto. Sin padding —el
        // caso por defecto— no cambia nada.
        'box-content min-w-0 text-[12px] bg-transparent border-none p-0 font-[inherit] outline-none',
        className,
      )}
      style={style}
    />
  )
}
