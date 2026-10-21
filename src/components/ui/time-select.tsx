import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { SUGGESTED_TIME_VALUES, formatTime12h, parseTimeInput } from '@/lib/time'

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  'aria-invalid'?: boolean
  className?: string
  /** Si viene, solo se aceptan horarios estrictamente posteriores (ej. "hasta" respecto del "desde"). */
  minTime?: string
}

export function TimeSelect({ id, value, onChange, 'aria-invalid': ariaInvalid, className, minTime }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const options = minTime ? SUGGESTED_TIME_VALUES.filter(t => t > minTime) : SUGGESTED_TIME_VALUES
  // Un horario a medida (ej. 9:10 o 23:30) no está entre los sugeridos: lo insertamos en
  // la lista para que se vea marcado al volver a abrir.
  const values = value === '' || options.includes(value)
    ? options
    : [...options, value].sort()

  // Al abrir, llevamos la lista al horario elegido (o al primero posterior a "desde").
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const target = value || values[0]
      listRef.current
        ?.querySelector<HTMLElement>(`[data-time="${target}"]`)
        ?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (time: string) => {
    onChange(time)
    setOpen(false)
  }

  const commitDraft = () => {
    const parsed = parseTimeInput(draft)
    if (!parsed || (minTime && parsed <= minTime)) {
      setInvalid(true)
      return
    }
    pick(parsed)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    setDraft('')
    setInvalid(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-invalid={ariaInvalid}
          className={cn(
            'border-input focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px]',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          {value ? formatTime12h(value) : 'Hora'}
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        <div className="p-1">
          <Input
            autoFocus
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              setInvalid(false)
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft()
              }
            }}
            placeholder="Escribir hora"
            aria-label="Escribir un horario a medida"
            aria-invalid={invalid}
            className="h-8 text-sm"
          />
          {invalid && (
            <p className="mt-1 text-xs text-destructive">
              {minTime ? 'Tiene que ser después del inicio' : 'Hora no válida'}
            </p>
          )}
        </div>
        <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto">
          {values.map(t => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={t === value}
              data-time={t}
              onClick={() => pick(t)}
              className={cn(
                'w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                t === value && 'bg-accent font-medium',
              )}
            >
              {formatTime12h(t)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
