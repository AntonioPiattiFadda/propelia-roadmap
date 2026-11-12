import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/* Qué es un número y de dónde sale (5/11/2026, por pedido): lo usan Objetivos y el Dashboard SDR. */
export type Explicado = { label: string; title: string; explicacion: string; fuente: string }

/** El encabezado que, tocado, explica qué es el número y de qué parte de la base sale. */
export function Explicacion({ c, children, align = 'end', className }: {
  c: Explicado; children: React.ReactNode; align?: 'start' | 'end'; className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={`${c.title}. Tocá para ver qué es y de dónde sale.`}
          className={className ?? 'cursor-pointer uppercase underline decoration-dotted underline-offset-4 hover:text-foreground'}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 text-left text-[13px] font-normal normal-case tracking-normal">
        <p className="font-semibold text-foreground">{c.label}</p>
        <p className="mt-1 text-(--fg-2)">{c.explicacion}</p>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">De dónde sale</p>
        <p className="mt-0.5 text-[12px] text-(--fg-2)">{c.fuente}</p>
      </PopoverContent>
    </Popover>
  )
}
