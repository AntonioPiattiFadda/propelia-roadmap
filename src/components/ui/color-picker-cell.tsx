import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#6b7280', '#475569', '#8a8785', '#1e293b',
]

type Props = {
  value: string
  onChange: (color: string) => void
}

export function ColorPickerCell({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[--r-pill] bg-transparent hover:bg-[--surface-2] transition-colors cursor-pointer">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: value }}
          />
          <span className="text-[8px] text-[--fg-faint]">▾</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="grid grid-cols-4 gap-1.5">
          {PALETTE.map((color) => (
            <button
              key={color}
              title={color}
              onClick={() => { onChange(color); setOpen(false) }}
              className="w-5 h-5 rounded-full cursor-pointer transition-transform hover:scale-110"
              style={{
                background: color,
                outline: value === color ? `2px solid ${color}` : 'none',
                outlineOffset: '2px',
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
