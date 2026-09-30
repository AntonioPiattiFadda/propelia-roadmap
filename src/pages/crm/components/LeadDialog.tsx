import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useLeadDetalle } from '../hooks/useLeadDetalle'
import { useActualizarCliente, useActualizarLead } from '../hooks/useLeadMutaciones'
import { nombreDelLead, type ClientData } from '../lib/clientData'
import type { ClientePatch } from '../service/crm.service'
import type { CrmLeadRow } from '../types'
import { ActividadLead } from './ActividadLead'
import { ClientFields, type ClienteExtra } from './ClientFields'
import { ColumnChatSlot, DockedActivityChat, type ChatOrigin } from './DockedActivityChat'
import { LeadRowActions } from './LeadRowActions'
import { LeadTasksPanel } from './LeadTasksPanel'
import { MeetingsPanel } from './MeetingsPanel'

type Pestaña = 'cliente' | 'tareas' | 'reuniones'
const PESTAÑAS: { id: Pestaña; label: string }[] = [
  { id: 'cliente', label: 'Cliente' }, { id: 'tareas', label: 'Tareas' }, { id: 'reuniones', label: 'Reuniones' },
]
const SIN_CANAL = '__sin_canal__'

type Borrador = ClientData & ClienteExtra
const borradorDe = (l: CrmLeadRow): Borrador => ({
  company_name: l.client?.company_name ?? '', first_name: l.client?.first_name ?? '', last_name: l.client?.last_name ?? '',
  phone: l.client?.phone ?? '', email: l.client?.email ?? '',
  alternative_phone_1: l.client?.alternative_phone_1 ?? '', alternative_phone_1_note: l.client?.alternative_phone_1_note ?? '',
  alternative_phone_2: l.client?.alternative_phone_2 ?? '', alternative_phone_2_note: l.client?.alternative_phone_2_note ?? '',
  notes: l.client?.notes ?? '',
})

/* El contenido del dialog, montado por lead (key = id): cambiar de lead con las flechas arranca
   de cero la pestaña y el borrador, igual que cerrar y abrir. */
function CuerpoDelLead({ lead, pestaña }: { lead: CrmLeadRow; pestaña: Pestaña }) {
  const isMobile = useIsMobile()
  const { etapasPorId, etapasActivas, canalesActivos } = useCrmCatalogos()
  const { usuarios, puedeEscribir } = useCarteras()
  const detalleQ = useLeadDetalle(lead.id)
  /* Descartado no se elige acá: pide motivo (menú de acciones). Pero si el lead YA está en
     Descartado, o en una etapa que se borró del funnel, esa opción tiene que estar: si no, el
     select queda en blanco y parece que el lead no tiene etapa. */
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel || e.id === lead.funnel_stage_id)
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  const actualizarLead = useActualizarLead()
  const actualizarCliente = useActualizarCliente()
  const escribe = puedeEscribir(lead.assigned_to)
  const now = Date.now()

  // Borrador local: se escribe acá y se guarda campo por campo al salir (onCommit). Si llega un
  // cambio de otro por realtime mientras no estoy escribiendo, se toma.
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(lead))
  const editando = useRef(false)
  useEffect(() => { if (!editando.current) setBorrador(borradorDe(lead)) }, [lead])

  const guardar = (campo: keyof Borrador) => {
    editando.current = false
    if (!lead.client) return
    const valor = borrador[campo].trim()
    // El contenedor del teléfono dispara onBlur aunque el foco se mueva adentro del mismo campo:
    // si lo escrito ya es lo guardado, no hay nada que mandar.
    const guardado = (lead.client[campo] ?? '').trim()
    if (valor === guardado) return
    actualizarCliente.mutate({ clientId: lead.client.id, patch: { [campo]: valor || null } as ClientePatch })
  }

  // La actividad sale de la columna al dejar «Cliente» y aparece acoplada: se registra de dónde.
  const origen = useRef<ChatOrigin | null>(null)
  const alSalir = useCallback((o: ChatOrigin) => { origen.current = o }, [])
  const actividad = (
    <ActividadLead lead={lead} detalle={detalleQ.data} cargando={detalleQ.isLoading} puedeEscribir={escribe} now={now} />
  )
  const responsable = usuarios.find(u => u.id === lead.assigned_to)

  return (
    <>
      {pestaña === 'cliente' && (
        <div className="grid min-h-0 gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_380px] max-md:p-3">
          <div className="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-48 flex-col gap-1">
                <Label className="text-[12.5px] font-semibold">Etapa</Label>
                <Select
                  value={lead.funnel_stage_id ?? ''}
                  disabled={!escribe}
                  onValueChange={id => actualizarLead.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null } })}
                >
                  <SelectTrigger><SelectValue placeholder="Sin etapa" /></SelectTrigger>
                  <SelectContent>
                    {opcionesEtapa.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.deleted_at ? `${e.label} (borrada)` : e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-40 flex-col gap-1">
                <Label className="text-[12.5px] font-semibold">Canal</Label>
                <Select
                  value={lead.channel_id ?? SIN_CANAL}
                  disabled={!escribe}
                  onValueChange={v => actualizarLead.mutate({ id: lead.id, patch: { channel_id: v === SIN_CANAL ? null : v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_CANAL}>Sin canal</SelectItem>
                    {canalesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[12.5px] font-semibold">Responsable</Label>
                <div className="flex h-9 items-center gap-2 text-[13.5px]">
                  <AvatarUsuario usuario={responsable} />
                  {responsable?.nombre ?? 'Sin responsable'}
                </div>
              </div>
            </div>
            {lead.discard_reason && (
              <p className="rounded-md bg-(--surface-2) px-3 py-2 text-[13px] text-(--fg-2)">Motivo del descarte: {lead.discard_reason}</p>
            )}
            <ClientFields
              extendido
              disabled={!escribe}
              data={borrador}
              errors={{}}
              onChange={patch => { editando.current = true; setBorrador(b => ({ ...b, ...patch })) }}
              onCommit={guardar}
            />
          </div>
          {/* Abajo de lg la actividad se apila debajo del cliente (el acoplado no existe en el teléfono). */}
          <ColumnChatSlot onLeave={alSalir} className="flex min-h-[420px] flex-col overflow-hidden rounded-xl bg-card [border:1px_solid_var(--line)] lg:min-h-0">
            {actividad}
          </ColumnChatSlot>
        </div>
      )}
      {pestaña === 'tareas' && (
        <LeadTasksPanel leadId={lead.id} responsableId={lead.assigned_to} puedeEscribir={escribe}
          tareas={detalleQ.data?.tasks ?? []} cargando={detalleQ.isLoading} />
      )}
      {pestaña === 'reuniones' && (
        <MeetingsPanel leadId={lead.id} responsableId={lead.assigned_to} puedeEscribir={escribe}
          reuniones={detalleQ.data?.meetings ?? []} cargando={detalleQ.isLoading} />
      )}
      {pestaña !== 'cliente' && !isMobile && (
        <DockedActivityChat title={`Actividad · ${nombreDelLead(lead.client)}`} getOrigin={() => origen.current}>
          {actividad}
        </DockedActivityChat>
      )}
    </>
  )
}

/**
 * El dialog del lead. Copia del patrón del producto (LeadList.tsx:1767): 94vw × 92vh, a pantalla
 * completa abajo de 768px, NO se cierra clickeando afuera (adentro se edita con guardado al blur
 * y un clic al pasar por el velo tiraba todo abajo) — se sale con Escape o «Volver al panel».
 */
export function LeadDialog({ lead, indice, total, onPaso, onCerrar, onStartReassign }: {
  lead: CrmLeadRow | null
  /** Posición en la lista filtrada; −1 si el lead abierto no está en ella (llegó por enlace). */
  indice: number
  total: number
  onPaso: (delta: -1 | 1) => void
  onCerrar: () => void
  onStartReassign?: (leadId: string) => void
}) {
  const [pestaña, setPestaña] = useState<Pestaña>('cliente')
  const { puedeEscribir } = useCarteras()
  const hayAnterior = indice > 0
  const haySiguiente = indice !== -1 && indice < total - 1
  // Al cambiar de lead vuelve a «Cliente»: es la pestaña que se abre para leer un lead.
  useEffect(() => { setPestaña('cliente') }, [lead?.id])

  return (
    <Dialog open={lead != null} onOpenChange={open => { if (!open) onCerrar() }}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={e => e.preventDefault()}
        /* ↑/↓ hacen lo mismo que los chevrones, con las excepciones del producto: no mientras se
           escribe, no en controles que ya usan flechas, no si alguien más atendió la tecla, no
           desde un portal (popover) que burbujea por el árbol de React. */
        onKeyDown={e => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
          const target = e.target as HTMLElement
          if (!e.currentTarget.contains(target)) return
          if (target.isContentEditable || target.closest('input, textarea, select, [role="listbox"], [role="menu"], [role="combobox"], [role="radiogroup"], [role="slider"], [role="spinbutton"]')) return
          const delta = e.key === 'ArrowUp' ? -1 : 1
          if (delta < 0 ? !hayAnterior : !haySiguiente) return
          e.preventDefault()
          onPaso(delta)
        }}
        className="dialog-fullscreen-mobile grid h-[92vh] max-h-none w-[94vw] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-y-auto p-0 max-md:overflow-hidden lg:overflow-hidden"
      >
        <DialogHeader className="ui-scale max-md:[zoom:1] sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-end gap-2 bg-card px-3 pb-0 pt-1.5 [border-bottom:0.5px_solid_var(--line)] max-md:flex max-md:flex-wrap max-md:items-center max-md:px-2">
          <DialogTitle className="sr-only">{lead ? nombreDelLead(lead.client) : 'Lead'}</DialogTitle>
          <DialogDescription className="sr-only">Cliente, tareas, reuniones y actividad del lead.</DialogDescription>

          <div className="mb-1.5 flex min-w-0 items-center gap-2 max-md:order-1 max-md:mb-0 max-md:flex-1">
            <DialogClose asChild>
              <button type="button" aria-label="Volver al panel"
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors [border:0.5px_solid_var(--line)] hover:bg-(--surface-2) max-md:size-10 max-md:justify-center max-md:px-0">
                <ArrowLeft size={14} />
                <span className="max-md:hidden">Volver al panel</span>
              </button>
            </DialogClose>
            <div className="flex shrink-0 items-center gap-1 max-md:order-4 max-md:ml-auto">
              <button type="button" onClick={() => onPaso(-1)} disabled={!hayAnterior} aria-label="Lead anterior"
                title={hayAnterior ? 'Lead anterior' : 'Es el primero de la lista'}
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg bg-card text-foreground [border:0.5px_solid_var(--line)] hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35">
                <ChevronUp size={15} />
              </button>
              <button type="button" onClick={() => onPaso(1)} disabled={!haySiguiente} aria-label="Lead siguiente"
                title={haySiguiente ? 'Lead siguiente' : 'Es el último de la lista'}
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg bg-card text-foreground [border:0.5px_solid_var(--line)] hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35">
                <ChevronDown size={15} />
              </button>
              {indice !== -1 && <span className="ml-1 text-[11px] tabular-nums text-muted-foreground max-md:hidden">{indice + 1} de {total}</span>}
            </div>
            {lead && (
              <span className="ml-1 min-w-0 truncate text-[15px] font-semibold text-foreground max-md:order-2">{nombreDelLead(lead.client)}</span>
            )}
          </div>

          <div role="tablist" aria-label="Secciones del lead" className="flex items-end gap-1 max-md:order-3 max-md:w-full">
            {PESTAÑAS.map(p => (
              <button key={p.id} type="button" role="tab" aria-selected={pestaña === p.id} onClick={() => setPestaña(p.id)}
                className={cn(
                  'h-10 cursor-pointer px-3 text-[13px] font-medium transition-colors max-md:flex-1',
                  pestaña === p.id ? 'text-foreground shadow-[inset_0_-2px_0_var(--brand)]' : 'text-(--fg-2) hover:text-foreground',
                )}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="mb-1.5 flex justify-end max-md:order-2 max-md:mb-0">
            {lead && <LeadRowActions lead={lead} puedeEscribir={puedeEscribir(lead.assigned_to)} onStartReassign={onStartReassign} />}
          </div>
        </DialogHeader>
        {lead && (
          <div className="ui-scale flex min-h-0 flex-col max-md:h-full lg:h-full">
            <CuerpoDelLead key={lead.id} lead={lead} pestaña={pestaña} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
