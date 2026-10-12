import type { ReactNode } from 'react'
import { ListTodo } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { nombreDelLead } from '../lib/clientData'
import type { ColumnaDeEtapa } from '../lib/columnasPorEtapa'
import type { CrmLeadRow, Usuario } from '../types'

/* La vista en columnas (`?vista=columnas`, 12/10/2026): una columna por etapa y una ficha por
   lead. Qué columna lleva cada lead lo decide `agruparPorEtapa` (lib/), no este archivo. Sin
   arrastrar entre columnas a propósito: cambiar de etapa es registrar una actividad. */

export type FichaProps = {
  lead: CrmLeadRow
  responsable: Usuario | undefined
  esMio: boolean | null
  /** Cuántas tareas pendientes tiene; 0 no dibuja nada. */
  pendientes: number
  /** Alguna de esas pendientes ya venció: el contador se pone rojo. */
  conVencidas: boolean
  onAbrir: (leadId: string) => void
  acciones?: ReactNode
  seleccion?: { marcado: boolean; onToggle: () => void }
}

// El mismo corte que el renglón de la lista: lo que pasa adentro de `data-row-actions` (y de los
// portales del menú, que burbujean por el árbol de React) no abre el lead.
function clicDeLaFicha(e: React.MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement
  return e.currentTarget.contains(target) && !target.closest('[data-row-actions]')
}

function FichaLead({ lead, responsable, esMio, pendientes, conVencidas, onAbrir, acciones, seleccion }: FichaProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-lead-id={lead.id}
      onClick={e => {
        if (!clicDeLaFicha(e)) return
        if (seleccion) seleccion.onToggle()
        else onAbrir(lead.id)
      }}
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget && !seleccion) onAbrir(lead.id) }}
      className="flex cursor-pointer items-center gap-2 rounded-lg bg-card px-2.5 py-2 transition-colors [border:1px_solid_var(--line)] hover:[border-color:var(--line-strong)]"
    >
      {seleccion && (
        <span data-row-actions>
          <Checkbox checked={seleccion.marcado} onCheckedChange={seleccion.onToggle} aria-label="Seleccionar lead" />
        </span>
      )}
      <AvatarUsuario usuario={responsable} anillo={esMio === true} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13.5px] font-semibold text-foreground">{nombreDelLead(lead.client)}</div>
      </div>
      {pendientes > 0 && (
        <span
          title={`${pendientes} tarea${pendientes === 1 ? '' : 's'} pendiente${pendientes === 1 ? '' : 's'}${conVencidas ? ', alguna vencida' : ''}`}
          className={cn('inline-flex shrink-0 items-center gap-1 text-[12px] tabular-nums',
            conVencidas ? 'font-medium [color:var(--danger-strong)]' : 'text-(--fg-muted)')}
        >
          <Icon icon={ListTodo} size="xs" />
          {pendientes}
        </span>
      )}
      <span data-row-actions>{acciones}</span>
    </div>
  )
}

/** El tablero: columnas de ancho fijo y scroll horizontal adentro, nunca en la página. */
export function ColumnasCrm({ columnas, fichaDe }: {
  columnas: ColumnaDeEtapa<CrmLeadRow>[]
  fichaDe: (lead: CrmLeadRow) => FichaProps
}) {
  return (
    <div className="flex w-full min-w-0 items-start gap-3 overflow-x-auto px-3 pb-3 max-md:px-2">
      {columnas.map(c => (
        <section
          key={c.id}
          aria-label={c.titulo}
          className="flex w-[272px] shrink-0 flex-col rounded-lg bg-(--surface-2) [border:1px_solid_var(--line-soft)] max-md:w-[248px]"
        >
          <header className="flex items-center gap-2 px-3 py-2">
            <h2 className={cn('truncate text-[12px] font-bold uppercase tracking-[0.06em]',
              c.etapa && c.etapa.deleted_at == null ? 'text-(--fg-2)' : 'text-(--fg-muted) italic')}>
              {c.titulo}
            </h2>
            <span className="ml-auto text-[12px] tabular-nums text-(--fg-muted)">{c.leads.length}</span>
          </header>
          <div className="flex flex-col gap-1.5 px-2 pb-2">
            {c.leads.length === 0
              ? <p className="px-1 py-3 text-center text-[12px] text-(--fg-faint)">Ningún lead</p>
              : c.leads.map(l => <FichaLead key={l.id} {...fichaDe(l)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
