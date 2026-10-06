import { useState } from 'react'
import { CalendarPlus, Check, ChevronDown, X } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TimeSelect } from '@/components/ui/time-select'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import { agruparReuniones, armarReunion } from '../lib/reuniones'
import { actualizarReunion, crearReunion } from '../service/crm.service'
import type { CrmMeeting, LeadDetalle } from '../types'

/* NUEVO: el producto agenda visitas a pisos contra Google Calendar; acá una reunión es con una
   inmobiliaria y vive solo en `crm_meetings`. Fue una pestaña entera (MeetingsPanel); ahora es
   una lista compacta en la columna del perfil, con agendar, completar y cancelar (con motivo).
   Sin calendario (fuera de alcance, spec §8). */

const DURACIONES = [15, 30, 45, 60, 90, 120]
const fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const ESTADO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'text-primary' },
  completed: { label: 'Hecha', className: 'text-success' },
  cancelled: { label: 'Cancelada', className: 'text-(--fg-muted)' },
}

export type CamposReunion = { fecha: string; hora: string; duracion: number }
export const camposReunionVacios = (): CamposReunion => ({ fecha: localTodayIso(), hora: '10:00', duracion: 60 })

/** Día, hora y duración. Los usan el formulario de «Agendar reunión» y el compositor de la actividad. */
export function CamposDeReunion({ value, onChange, compacto = false }: {
  value: CamposReunion
  onChange: (v: CamposReunion) => void
  compacto?: boolean
}) {
  const alto = compacto ? 'h-8 text-[12.5px]' : ''
  return (
    <div className={cn('grid gap-2', compacto ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]' : 'grid-cols-3 max-md:grid-cols-1')}>
      <div className="flex min-w-0 flex-col gap-1">
        {!compacto && <Label className="text-[12px]">Día</Label>}
        <Input type="date" aria-label="Día" className={alto} value={value.fecha} min={localTodayIso()}
          onChange={e => onChange({ ...value, fecha: e.target.value })} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {!compacto && <Label className="text-[12px]">Hora</Label>}
        <TimeSelect value={value.hora} onChange={hora => onChange({ ...value, hora })} className={alto} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {!compacto && <Label className="text-[12px]">Duración</Label>}
        <Select value={String(value.duracion)} onValueChange={v => onChange({ ...value, duracion: Number(v) })}>
          <SelectTrigger size="sm" className={cn('w-full', alto)} aria-label="Duración"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DURACIONES.map(m => <SelectItem key={m} value={String(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function FilaReunion({ r, puedeEscribir, onCompletar, onCancelar }: {
  r: CrmMeeting; puedeEscribir: boolean; onCompletar: () => void; onCancelar: () => void
}) {
  const estado = ESTADO[r.status] ?? ESTADO.scheduled
  return (
    <li className="group flex items-start gap-2 py-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-[13px] leading-snug text-foreground', r.status === 'cancelled' && 'text-(--fg-muted) line-through')}>
          {r.title || 'Reunión'}
        </span>
        <span className="text-[11.5px] leading-snug text-(--fg-muted)">
          <span className="tabular-nums">{fmt.format(new Date(r.starts_at))}</span>
          {' · '}
          <span className={cn('font-semibold', estado.className)}>{estado.label}</span>
        </span>
        {r.description && <span className="text-[11.5px] leading-snug text-(--fg-2)">{r.description}</span>}
        {r.cancel_reason && <span className="text-[11.5px] leading-snug text-(--fg-2)">Motivo: {r.cancel_reason}</span>}
      </div>
      {puedeEscribir && r.status === 'scheduled' && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={onCompletar} aria-label="Marcar como hecha" title="Marcar como hecha"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-(--surface-3) hover:text-success">
            <Icon icon={Check} size="sm" />
          </button>
          <button type="button" onClick={onCancelar} aria-label="Cancelar reunión" title="Cancelar reunión"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-(--surface-3) hover:[color:var(--danger-strong)]">
            <Icon icon={X} size="sm" />
          </button>
        </div>
      )}
    </li>
  )
}

export function ReunionesDelLead({ leadId, responsableId, puedeEscribir, reuniones, cargando }: {
  leadId: string
  responsableId: string
  puedeEscribir: boolean
  reuniones: CrmMeeting[]
  cargando: boolean
}) {
  const [agendando, setAgendando] = useState(false)
  const [campos, setCampos] = useState<CamposReunion>(camposReunionVacios)
  const [titulo, setTitulo] = useState('')
  const [verAnteriores, setVerAnteriores] = useState(false)
  const [cancelando, setCancelando] = useState<CrmMeeting | null>(null)
  const [motivo, setMotivo] = useState('')

  const agendar = useMutacionDelDetalle(leadId, () =>
    crearReunion({ lead_id: leadId, assigned_to: responsableId, title: titulo.trim() || null, ...armarReunion(campos.fecha, campos.hora, campos.duracion) }),
    { exito: 'Reunión agendada' })
  const cambiar = useMutacionDelDetalle(leadId,
    (v: { id: string; status: 'completed' | 'cancelled'; cancel_reason?: string | null }) =>
      actualizarReunion(v.id, { status: v.status, cancel_reason: v.cancel_reason ?? null }),
    { optimista: (d: LeadDetalle, v) => ({ ...d, meetings: d.meetings.map(m => m.id === v.id ? { ...m, status: v.status, cancel_reason: v.cancel_reason ?? null } : m) }) },
  )

  const { proximas, pasadas } = agruparReuniones(reuniones, Date.now())
  const fila = (r: CrmMeeting) => (
    <FilaReunion key={r.id} r={r} puedeEscribir={puedeEscribir}
      onCompletar={() => cambiar.mutate({ id: r.id, status: 'completed' })}
      onCancelar={() => { setMotivo(''); setCancelando(r) }} />
  )

  const confirmarAgenda = () => {
    agendar.mutate(undefined, { onSuccess: () => { setAgendando(false); setTitulo(''); setCampos(camposReunionVacios()) } })
  }

  return (
    <div className="flex flex-col">
      {cargando ? (
        <p className="py-1 text-[12.5px] text-(--fg-muted)">Cargando reuniones…</p>
      ) : proximas.length === 0 ? (
        <p className="py-1 text-[12.5px] text-(--fg-muted)">Sin reuniones agendadas.</p>
      ) : (
        <ul className="flex flex-col">{proximas.map(fila)}</ul>
      )}

      {/* Lo que ya pasó, plegado: a esta lista se viene a ver lo que se viene. */}
      {pasadas.length > 0 && (
        <>
          <button type="button" onClick={() => setVerAnteriores(v => !v)} aria-expanded={verAnteriores}
            className="mt-1 flex h-6 w-fit cursor-pointer items-center gap-1 text-[12px] font-medium text-(--fg-2) hover:text-foreground">
            <Icon icon={ChevronDown} size="xs" className={cn('transition-transform', !verAnteriores && '-rotate-90')} />
            Anteriores ({pasadas.length})
          </button>
          {verAnteriores && <ul className="flex flex-col">{pasadas.map(fila)}</ul>}
        </>
      )}

      {puedeEscribir && (
        <Popover open={agendando} onOpenChange={setAgendando}>
          <PopoverTrigger asChild>
            <button type="button"
              className="mt-1.5 -ml-1.5 flex h-7 w-fit cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12.5px] font-medium text-(--brand-soft-fg) hover:bg-(--brand-soft)">
              <Icon icon={CalendarPlus} size="xs" />
              Agendar reunión
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-[340px] flex-col gap-2 p-3">
            <p className="text-[12.5px] font-semibold text-foreground">Agendar reunión</p>
            <Input placeholder="Título (opcional)" value={titulo} onChange={e => setTitulo(e.target.value)} className="h-8 text-[13px]" />
            <CamposDeReunion value={campos} onChange={setCampos} compacto />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAgendando(false)}>Cancelar</Button>
              <Button size="sm" onClick={confirmarAgenda} disabled={!campos.fecha || agendar.isPending}>Agendar</Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {cancelando && (
        <AlertDialog open onOpenChange={o => { if (!o) setCancelando(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cancelar la reunión?</AlertDialogTitle>
              <AlertDialogDescription>Queda en el historial del lead como cancelada, con el motivo.</AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={() => cambiar.mutate({ id: cancelando.id, status: 'cancelled', cancel_reason: motivo.trim() || null })}>
                Cancelar reunión
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
