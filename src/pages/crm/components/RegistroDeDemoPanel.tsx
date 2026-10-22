import { useState } from 'react'
import { Lock, Plus, X } from 'lucide-react'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { RegistroDeDemo } from '../hooks/useRegistroDeDemo'
import { OpcionesDeEtapa } from './leadCells'

const pastilla = (on: boolean) => cn(
  'inline-flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
  on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)
const campo = 'h-7 min-w-0 flex-1 rounded-md bg-card px-2.5 text-[12.5px] text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]'

/* La columna derecha del formulario de la Agenda cuando se agenda una demo de un lead (22/10/2026,
   por pedido): lo que antes pedía el «Agendar demo» del lead, con sus mismos rótulos y pastillas.
   El estado vive en `useRegistroDeDemo`, que también lo guarda; esto solo lo pinta. */
export function RegistroDeDemoPanel({ r }: { r: RegistroDeDemo }) {
  const [escribiendo, setEscribiendo] = useState(false)
  const [escrito, setEscrito] = useState('')
  const enRojo = (k: keyof RegistroDeDemo['falta']) => r.intento && r.falta[k]
  const agregar = () => { r.agregar(escrito); setEscrito(''); setEscribiendo(false) }

  return (
    <section aria-label="Registro de actividad" className="flex flex-col gap-3">
      <div>
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">Registro de actividad</h3>
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-(--fg-2)">
          <Lock size={12} aria-hidden className="shrink-0" />
          Queda en el CRM. No le llega al cliente.
        </p>
      </div>

      {r.pideDecisor && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="demo-decisor" className="mr-0.5 text-[11.5px] text-(--fg-muted)">Decisor</label>
          <input id="demo-decisor" value={r.decisor} onChange={e => r.setDecisor(e.target.value)}
            placeholder="Nombre de quien decide, si te lo dijeron (opcional)"
            title="Se carga en el perfil como decisor al agendar" className={campo} />
        </div>
      )}

      <div className={cn('flex flex-wrap items-center gap-1.5',
        enRojo('con') && 'rounded-md bg-(--danger-soft) px-2 py-1 [outline:1px_solid_var(--danger)]')}>
        <span className={cn('mr-0.5 text-[11.5px]', enRojo('con') ? 'font-semibold text-(--danger)' : 'text-(--fg-muted)')}>Quién asiste</span>
        {r.contactos.map(c => (
          <button key={c} type="button" aria-pressed={r.con.includes(c)} onClick={() => r.alternar(c)} className={pastilla(r.con.includes(c))}>
            <span className="truncate">{c}</span>
          </button>
        ))}
        {r.nuevos.map(c => {
          const on = r.con.includes(c)
          return (
            <span key={`nuevo-${c}`} className={cn(pastilla(on), 'pr-1')}>
              <button type="button" aria-pressed={on} title="Se carga como contacto al agendar"
                onClick={() => r.alternar(c)} className="min-w-0 cursor-pointer truncate">{c}</button>
              <button type="button" aria-label={`Sacar a ${c}`} title="Sacar" onClick={() => r.sacar(c)}
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-(--surface-2)">
                <X size={12} />
              </button>
            </span>
          )
        })}
        {escribiendo ? (
          <input autoFocus value={escrito} onChange={e => setEscrito(e.target.value)} onBlur={agregar}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); agregar() }
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEscrito(''); setEscribiendo(false) }
            }}
            aria-label="Escribir quién asiste, si no está entre los contactos" placeholder="Escribí el nombre…"
            className={cn(campo, 'max-w-[180px]')} />
        ) : (
          <button type="button" onClick={() => setEscribiendo(true)} aria-label="Escribir quién asiste" title="Escribir quién asiste"
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--fg-faint) transition-colors hover:bg-(--surface-2) hover:text-(--fg-2)">
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="demo-registro" className="text-[11.5px] text-(--fg-muted)">Registro de actividad</label>
        <textarea id="demo-registro" rows={4} value={r.texto} onChange={e => r.setTexto(e.target.value)}
          placeholder="Qué quiere ver en la demo, dudas… (opcional)"
          className="block max-h-[40vh] min-h-9 w-full resize-y rounded-md bg-card px-3 py-2 text-[13.5px] leading-5 text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]" />
      </div>

      <div className={cn('flex flex-wrap items-center gap-2 rounded-md px-3 py-2',
        enRojo('etapa') ? 'bg-(--danger-soft) [border:1px_solid_var(--danger)]' : 'bg-(--surface-2) [border:1px_solid_var(--line-soft)]')}>
        <span className={cn('text-[12.5px] font-semibold', enRojo('etapa') ? 'text-(--danger)' : 'text-foreground')}>El lead queda en</span>
        <Select value={r.etapa ?? ''} onValueChange={r.setEtapa}>
          <SelectTrigger aria-label="Etapa en la que queda el lead" aria-invalid={enRojo('etapa')}
            className={cn('h-8 w-auto min-w-[200px] bg-card text-[12.5px]', enRojo('etapa') && '[border-color:var(--danger)]')}>
            <SelectValue placeholder="Elegí una etapa" />
          </SelectTrigger>
          <SelectContent>
            <OpcionesDeEtapa etapas={r.opcionesEtapa} />
          </SelectContent>
        </Select>
        {enRojo('etapa')
          ? <span role="alert" className="text-[11.5px] font-semibold text-(--danger)">Elegí en qué etapa queda</span>
          : <span className="text-[11.5px] text-(--fg-muted)">Hoy está en «{r.actual?.label ?? 'sin etapa'}»</span>}
      </div>
    </section>
  )
}
