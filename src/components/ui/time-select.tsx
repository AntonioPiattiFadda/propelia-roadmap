import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { TIME_VALUES, formatTime12h } from '@/lib/time'

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  'aria-invalid'?: boolean
  className?: string
  /** Si viene, solo se listan horarios estrictamente posteriores (ej. "hasta" respecto del "desde"). */
  minTime?: string
}

export function TimeSelect({ id, value, onChange, 'aria-invalid': ariaInvalid, className, minTime }: Props) {
  const options = minTime ? TIME_VALUES.filter(t => t > minTime) : TIME_VALUES
  // Si el valor actual no cae en un múltiplo de 15 (ej. una visita ya creada con otro
  // horario), lo insertamos en la lista para que el trigger siempre muestre algo.
  const values = value === '' || options.includes(value)
    ? options
    : [...options, value].sort()

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} size="sm" className={cn('w-full', className)} aria-invalid={ariaInvalid}>
        <SelectValue placeholder="Hora" />
      </SelectTrigger>
      <SelectContent>
        {values.map(t => (
          <SelectItem key={t} value={t}>{formatTime12h(t)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
