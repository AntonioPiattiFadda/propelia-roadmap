import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { useLeadDetalle } from '@/pages/crm/hooks/useLeadDetalle'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import { crearComentario } from '@/pages/crm/service/crm.service'

const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/* Los comentarios del lead al costado del onboarding (28/10/2026, por pedido): lo que se escribe acá
   es una nota a mano en `crm_comments`, la misma de «Registrar actividad» sin meta, así que se ve en
   la actividad del lead del CRM y ahí se edita y se borra como cualquier nota. Lista solo lo escrito
   a mano (MANUAL): lo del sistema es del CRM. Enter comenta; Shift+Enter, otra línea. */
export function ComentariosDelLead({ leadId }: { leadId: string }) {
  const qc = useQueryClient()
  const detalle = useLeadDetalle(leadId)
  const { usuarios } = useCarteras()
  const [texto, setTexto] = useState('')
  const fin = useRef<HTMLDivElement>(null)
  const comentarios = (detalle.data?.comments ?? []).filter(c => c.comment_type === 'MANUAL' && c.description?.trim())
  const nombre = (id: string | null) => usuarios.find(u => u.id === id)?.nombre ?? '—'

  const comentar = useMutation({
    mutationFn: (description: string) => crearComentario({ lead_id: leadId, description }),
    onSuccess: () => {
      setTexto('')
      void qc.invalidateQueries({ queryKey: CRM_KEYS.detalle(leadId) })
    },
    onError: (error) => { toast.error(`No se guardó el comentario: ${mensajeDeError(error)}`) },
  })
  const enviar = () => { const t = texto.trim(); if (t && !comentar.isPending) comentar.mutate(t) }

  // El último a la vista, como un chat.
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }) }, [comentarios.length])

  return (
    <aside className="flex min-h-0 flex-1 flex-col border-l border-(--line) max-lg:border-t max-lg:border-l-0">
      <h3 className="border-b border-(--line) px-4 py-2.5 text-[13px] font-semibold">Comentarios del lead</h3>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {detalle.isLoading && <Loader2 className="mx-auto size-4 animate-spin text-(--fg-muted)" />}
        {!detalle.isLoading && comentarios.length === 0 && (
          <p className="text-[12px] text-(--fg-muted)">Todavía nada. Lo que escribas queda en la actividad del lead en el CRM.</p>
        )}
        {comentarios.map(c => (
          <div key={c.id} className="text-[12.5px]">
            <div className="text-[11px] text-(--fg-muted)"><b className="font-semibold text-(--fg-2)">{nombre(c.created_by)}</b> · {fecha(c.created_at)}</div>
            <p className="mt-0.5 whitespace-pre-line break-words">{c.description}</p>
          </div>
        ))}
        <div ref={fin} />
      </div>
      <div className="flex items-end gap-2 border-t border-(--line) p-3">
        <Textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribir un comentario…" rows={2}
          className="min-h-0 resize-none bg-card text-[13px]"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} />
        <Button size="icon" className="size-8 shrink-0" aria-label="Comentar" disabled={!texto.trim() || comentar.isPending} onClick={enviar}>
          {comentar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </aside>
  )
}
