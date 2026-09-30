import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (value: string) => void
  min?: number
  className?: string
}

export function NumberStepper({ value, onChange, min = 0, className }: Props) {
  const numeric = value === '' ? 0 : Number(value)

  const step = (delta: number) => {
    const next = numeric + delta
    if (next < min) return
    onChange(String(next))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    if (raw === '') { onChange(raw); return }
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    onChange(String(Math.max(min, Math.round(parsed))))
  }

  return (
    <div className={cn('flex items-center border border-[--line] rounded-lg overflow-hidden w-fit', className)}>
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={numeric <= min}
        className="w-8 h-8 flex items-center justify-center text-[--fg-2] hover:bg-[--surface-2] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        min={min}
        value={value}
        onChange={handleInputChange}
        className="w-10 h-8 text-center text-[13px] border-x border-[--line] focus:outline-none"
      />
      <button
        type="button"
        onClick={() => step(1)}
        className="w-8 h-8 flex items-center justify-center text-[--fg-2] hover:bg-[--surface-2]"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
