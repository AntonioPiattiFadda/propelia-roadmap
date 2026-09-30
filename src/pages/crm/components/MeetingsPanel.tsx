import { useState } from 'react'
import { CalendarPlus, Check, X } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
   inmobiliaria y vive solo en `crm_meetings`. Listado con agendar, completar y cancelar (con
   motivo). Sin calendario (fuera de alcance, spec §8). */

const DURACIONES = [15, 30, 45, 60, 90, 120]
const fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const ESTADO: Record<string, { label: string; className: string }> = {
  scheduled: { label: 'Agendada', className: 'text-primary' },
  completed: { label: 'Hecha', className: 'text-success' },
  cancelled: { label: 'Cancelada', className: 'text-(--fg-muted) line-through' },
}

function Tarjeta({ r, puedeEscribir, onCompletar, onCancelar }: {
  r: CrmMeeting; puedeEscribir: boolean; onCompletar: () => void; onCancelar: () => void
}) {
  const estado = ESTADO[r.status] ?? ESTADO.scheduled
  return (
    <div className="flex items-start gap-3 rounded-xl bg-card p-3 [border:1px_solid_var(--line)]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium text-foreground">{r.title || 'Reunión'}</span>
        <span className="text-[12.5px] tabular-nums text-(--fg-2)">{fmt.format(new Date(r.starts_at))}</span>
        {r.description && <span className="text-[12.5px] text-(--fg-muted)">{r.description}</span>}
        {r.cancel_reason && <span className="text-[12.5px] text-(--fg-muted)">Motivo: {r.cancel_reason}</span>}
        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.06em]', estado.className)}>{estado.label}</span>
      </div>
      {puedeEscribir && r.status === 'scheduled' && (
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={onCompletar}><Icon icon={Check} size="xs" />Hecha</Button>
          <Button variant="ghost" size="sm" onClick={onCancelar}><Icon icon={X} size="xs" />Cancelar</Button>
        </div>
      )}
    </div>
  )
}

export function MeetingsPanel({ leadId, responsableId, puedeEscribir, reuniones, cargando }: {
  leadId: string
  responsableId: string
  puedeEscribir: boolean
  reuniones: CrmMeeting[]
  cargando: boolean
}) {
  const [agendando, setAgendando] = useState(false)
  const [fecha, setFecha] = useState(localTodayIso())
  const [hora, setHora] = useState('10:00')
  const [duracion, setDuracion] = useState(60)
  const [titulo, setTitulo] = useState('')
  const [cancelando, setCancelando] = useState<CrmMeeting | null>(null)
  const [motivo, setMotivo] = useState('')

  const agendar = useMutacionDelDetalle(leadId, () =>
    crearReunion({ lead_id: leadId, assigned_to: responsableId, title: titulo.trim() || null, ...armarReunion(fecha, hora, duracion) }),
    { exito: 'Reunión agendada' })
  const cambiar = useMutacionDelDetalle(leadId,
    (v: { id: string; status: 'completed' | 'cancelled'; cancel_reason?: string | null }) =>
      actualizarReunion(v.id, { status: v.status, cancel_reason: v.cancel_reason ?? null }),
    { optimista: (d: LeadDetalle, v) => ({ ...d, meetings: d.meetings.map(m => m.id === v.id ? { ...m, status: v.status, cancel_reason: v.cancel_reason ?? null } : m) }) },
  )

  const { proximas, pasadas } = agruparReuniones(reuniones, Date.now())

  const confirmarAgenda = () => {
    agendar.mutate(undefined, { onSuccess: () => { setAgendando(false); setTitulo('') } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-(--surface-2)">
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {cargando ? (
          <p className="py-6 text-[13.5px] text-(--fg-muted)">Cargando reuniones…</p>
        ) : proximas.length === 0 && pasadas.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[15.5px] font-semibold text-foreground">Sin reuniones con este lead</p>
            <p className="mt-1 text-[13.5px] text-(--fg-2)">Las que se agenden aparecen acá, con su estado.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {([{ rotulo: 'Próximas', lista: proximas }, { rotulo: 'Anteriores', lista: pasadas }]).map(({ rotulo, lista }) =>
              lista.length > 0 && (
                <section key={rotulo} className="flex flex-col gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-(--fg-2)">{rotulo}</span>
                  {lista.map(r => (
                    <Tarjeta key={r.id} r={r} puedeEscribir={puedeEscribir}
                      onCompletar={() => cambiar.mutate({ id: r.id, status: 'completed' })}
                      onCancelar={() => { setMotivo(''); setCancelando(r) }} />
                  ))}
                </section>
              ))}
          </div>
        )}
      </div>

      {puedeEscribir && (
        <div className="shrink-0 bg-card px-4 pb-4 pt-2.5 [border-top:1px_solid_var(--line)]">
          {agendando ? (
            <div className="flex flex-col gap-2">
              <Input placeholder="Título (opcional)" value={titulo} onChange={e => setTitulo(e.target.value)} />
              <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px]">Día</Label>
                  <Input type="date" value={fecha} min={localTodayIso()} onChange={e => setFecha(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px]">Hora</Label>
                  <TimeSelect value={hora} onChange={setHora} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[12px]">Duración</Label>
                  <Select value={String(duracion)} onValueChange={v => setDuracion(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURACIONES.map(m => <SelectItem key={m} value={String(m)}>{m < 60 ? `${m} min` : `${m / 60} h`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAgendando(false)}>Cancelar</Button>
                <Button onClick={confirmarAgenda} disabled={!fecha || agendar.isPending}>Agendar</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="h-12 w-full rounded-xl text-[16px]" onClick={() => setAgendando(true)}>
              <Icon icon={CalendarPlus} size="sm" />
              Agendar reunión
            </Button>
          )}
        </div>
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
