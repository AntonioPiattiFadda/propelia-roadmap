import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useMarcarGestion, useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { lineaDeTiempo } from '../lib/actividad'
import { etapaDelLead } from '../lib/effectiveStage'
import { gestionDeLead } from '../lib/gestionStatus'
import { fmtShortDate } from '../lib/leadCellFormat'
import { crearComentario } from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle } from '../types'
import { GestionBadge, PostponePopover } from './leadCells'

/* NUEVO. En el producto el contenido del chat de actividad vive adentro de LeadAccordion (5.600
   líneas); acá es un componente propio. Arriba, el estado de gestión con «marcar» y «posponer»;
   en el medio, la línea de tiempo; abajo, el compositor de comentarios. Lo usan la columna de la
   pestaña Cliente y la ventana acoplada (DockedActivityChat) de las otras dos. */
export function ActividadLead({ lead, detalle, cargando, puedeEscribir, now }: {
  lead: CrmLeadRow
  detalle: LeadDetalle | undefined
  cargando: boolean
  puedeEscribir: boolean
  now: number
}) {
  const { etapasPorId } = useCrmCatalogos()
  const { usuarios } = useCarteras()
  const [texto, setTexto] = useState('')
  const marcar = useMarcarGestion(lead.id)
  const comentar = useMutacionDelDetalle(lead.id, (description: string) => crearComentario({ lead_id: lead.id, description }))

  const status = gestionDeLead(lead, etapaDelLead(lead, etapasPorId)?.management_tolerance_hours, now)
  const items = detalle ? lineaDeTiempo(detalle, etapasPorId, usuarios) : []
  const usuariosPorId = new Map(usuarios.map(u => [u.id, u]))

  const enviar = () => {
    const limpio = texto.trim()
    if (!limpio) return
    comentar.mutate(limpio, { onSuccess: () => setTexto('') })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 [border-bottom:1px_solid_var(--line-soft)]">
        <span className="text-[12px] font-semibold text-(--fg-2)">Gestión</span>
        <GestionBadge status={status} onConfirm={() => marcar.mutate({ action: 'MANUAL' })} pending={marcar.isPending || !puedeEscribir} />
        {puedeEscribir && (
          <PostponePopover
            onPostpone={(effectiveAt, note) => marcar.mutate({ action: 'POSTPONED', effective_at: effectiveAt, note: note ?? null })}
            pending={marcar.isPending}
            postponed={status.postponed}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {cargando && <p className="py-4 text-[13px] text-(--fg-muted)">Cargando actividad…</p>}
        {!cargando && items.length === 0 && <p className="py-4 text-[13px] text-(--fg-muted)">Sin actividad todavía.</p>}
        <ol className="flex flex-col gap-2">
          {items.map(i => (
            <li key={i.id} className={cn('flex gap-2', i.tipo !== 'comentario' && 'text-(--fg-2)')}>
              {i.tipo === 'comentario'
                ? <AvatarUsuario usuario={i.autorId ? usuariosPorId.get(i.autorId) : null} />
                : <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-(--line-strong)" />}
              <div className="min-w-0 flex-1">
                <p className={cn('whitespace-pre-wrap text-[13.5px]', i.tipo === 'comentario' ? 'text-foreground' : 'text-[12.5px]')}>{i.texto}</p>
                <span className="text-[11px] tabular-nums text-(--fg-muted)">{fmtShortDate(i.fecha)}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {puedeEscribir && (
        <div className="flex shrink-0 items-end gap-2 bg-card px-3 py-2 [border-top:1px_solid_var(--line)]">
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviar() }}
            rows={2}
            placeholder="Escribí un comentario…"
            className="min-h-[44px] flex-1 resize-none rounded-lg bg-card px-2.5 py-2 text-[13.5px] text-foreground outline-none [border:1px_solid_var(--line)] placeholder:text-(--fg-faint) max-md:text-[16px]"
          />
          <Button size="icon" onClick={enviar} disabled={!texto.trim() || comentar.isPending} aria-label="Enviar comentario">
            <Icon icon={Send} size="sm" />
          </Button>
        </div>
      )}
    </div>
  )
}
