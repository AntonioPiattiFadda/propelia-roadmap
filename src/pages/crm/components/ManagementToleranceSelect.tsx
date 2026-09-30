import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DAY_OPTIONS, MONTH_OPTIONS, WEEK_OPTIONS } from '../lib/managementTolerance'

const NEVER_VALUE = '__never__'

type Props = {
  value: number | null
  onChange: (hours: number | null) => void
  className?: string
}

/**
 * Tiempo de gestión de UN estado del funnel. Vivía en la tabla de prioridades
 * hasta el 25/08: ahora cada estado tiene el suyo, y lo usan dos pantallas
 * (StagesTable de /clientes y SellFunnelConfigDialog de /captacion).
 *
 * `null` es "Nunca": sin plazo el lead no puede vencer, así que `getGestionStatus`
 * lo resuelve como Gestionado verde de forma permanente (y no como el guion de
 * "sin estado" que dibujaba hasta el 26/08).
 */
export function ManagementToleranceSelect({ value, onChange, className }: Props) {
  return (
    <Select
      value={value == null ? NEVER_VALUE : String(value)}
      onValueChange={(v) => onChange(v === NEVER_VALUE ? null : Number(v))}
    >
      <SelectTrigger className={cn('h-7 w-fit text-xs', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NEVER_VALUE}>Nunca</SelectItem>
        <SelectGroup>
          <SelectLabel>Días</SelectLabel>
          {DAY_OPTIONS.map((opt) => (
            <SelectItem key={opt.hours} value={String(opt.hours)}>{opt.label}</SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Semanas</SelectLabel>
          {WEEK_OPTIONS.map((opt) => (
            <SelectItem key={opt.hours} value={String(opt.hours)}>{opt.label}</SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Meses</SelectLabel>
          {MONTH_OPTIONS.map((opt) => (
            <SelectItem key={opt.hours} value={String(opt.hours)}>{opt.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
