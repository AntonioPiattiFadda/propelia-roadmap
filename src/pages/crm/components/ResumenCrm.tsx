import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ListTodo, X } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Icon } from '@/components/ui/icon'
import { fmtDueLabel, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { rotuloConHora } from '../lib/alarmas'
import { nombreDelLead } from '../lib/clientData'
import { useGoogleAgenda, useHasCalendarConnected } from '@/pages/agenda/hooks/useCalendarConnection'
import { eventosDeGoogleSueltos, invitacionesSinAceptar, reunionesMias, reunionesPorDia } from '../lib/resumen'
import { estaVencida, tocaHoyOVencida, type ProximaTarea } from '../lib/tareas'
import { useReunionesProximas } from '../hooks/useCrmLeads'
import type { CrmLeadRow, Usuario } from '../types'

/** Cuántos días mira la agenda del Dashboard, hoy incluido. */
const DIAS_DE_AGENDA = 7
/** Medianoche LOCAL del día, en UTC: el día es el de quien mira. */
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()
const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const DIA_DE_SEMANA = new Intl.DateTimeFormat('es-ES', { weekday: 'long' })
const DIA_Y_MES = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })

/** Me invitaron por Google y todavía no acepté: se ve igual, avisado. */
function PendienteAceptar() {
  return (
    <span className="mt-0.5 w-fit whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-semibold text-(--warning-fg) bg-(--warning-soft)"
      title="Te invitaron por Google Calendar y todavía no aceptaste">
      Pendiente aceptar
    </span>
  )
}

const segmento = (activo: boolean) => cn(
  'inline-flex h-6 cursor-pointer select-none items-center rounded-full px-2.5 text-[12px] font-medium normal-case tracking-normal',
  'transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-(--brand-200)',
  activo ? 'bg-card text-foreground font-semibold shadow-(--shadow-sm)' : 'text-(--fg-muted) hover:text-foreground',
)

/** La próxima tarea pendiente de un lead, con su día y hora; en rojo si toca hoy o venció. La usa
 *  la columna «Tareas» de /clientes. */
export function ProximaTareaDelLead({ proxima, hoy }: { proxima: ProximaTarea | undefined; hoy: string }) {
  if (!proxima) return <span className="whitespace-nowrap text-[12.5px] font-semibold text-(--danger-fg)">No hay tarea</span>
  const t = proxima.tarea
  const vencida = estaVencida(t, hoy)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]" title={t.title}>
      <Icon icon={ListTodo} size="xs" className="shrink-0 text-(--fg-muted)" />
      <span className="truncate text-(--fg-2)">{t.title}</span>
      <span className={cn('shrink-0 whitespace-nowrap tabular-nums', tocaHoyOVencida(t, hoy) ? 'font-medium [color:var(--danger-strong)]' : 'text-(--fg-muted)')}>
        {t.due_date == null ? 'Sin fecha' : `${vencida ? 'Vencía ' : ''}${rotuloConHora(fmtDueLabel(t.due_date, hoy), t.due_date, t.due_time)}`}
      </span>
    </span>
  )
}

/**
 * La agenda del Dashboard (16/11/2026, por pedido: fue una columna fija a la derecha de los
 * importantes). Plegada es una pestaña pegada al borde derecho con lo que hay hoy; tocarla abre
 * una ventanita encima de la lista, sin taparla entera ni bloquearla. Hoy arriba y los próximos
 * días debajo. Tocar una reunión con lead abre el lead (`?lead=`).
 */
export function AgendaPlegable({ leads, usuariosPorId, hoy, myId, onAbrirLead }: {
  /** Todos los que veo: de acá sale el nombre del lead de cada reunión. */
  leads: readonly CrmLeadRow[]
  usuariosPorId: ReadonlyMap<string, Usuario>
  hoy: string
  myId: string | null
  onAbrirLead: (leadId: string) => void
}) {
  const [abierta, setAbierta] = useState(false)
  const leadsPorId = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads])

  // Las mías por defecto: es mi semana. «Todas» mira la del equipo (la RLS de un SUPERADMIN las trae).
  const [todas, setTodas] = useState(false)
  const desde = inicioDelDia(hoy)
  const hasta = inicioDelDia(shiftIsoDate(hoy, DIAS_DE_AGENDA))
  const reunionesQ = useReunionesProximas(desde, hasta)
  // Y lo demás de mi Google (es el único que se puede leer: la conexión es de cada uno). Va en
  // «Mías» y en «Todas»; si Google falla, las reuniones del CRM se ven igual.
  const conGoogle = useHasCalendarConnected().data === true
  const googleQ = useGoogleAgenda(desde, hasta, conGoogle)
  const dias = useMemo(() => {
    const reuniones = reunionesQ.data ?? []
    const google = googleQ.data ?? []
    const deQuien = todas ? reuniones : reunionesMias(reuniones, google, myId)
    const deGoogle = eventosDeGoogleSueltos(google, reuniones)
    return reunionesPorDia([...deQuien, ...deGoogle], hoy, DIAS_DE_AGENDA)
  }, [reunionesQ.data, googleQ.data, todas, myId, hoy])
  const sinAceptar = useMemo(() => invitacionesSinAceptar(googleQ.data ?? []), [googleQ.data])
  const deHoy = dias.find(d => d.dia === hoy)?.reuniones.length ?? 0

  useEffect(() => {
    if (!abierta) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierta])

  if (!abierta) {
    return (
      <button type="button" onClick={() => setAbierta(true)}
        title="Ver lo agendado"
        className="fixed right-0 top-1/3 z-30 flex flex-col items-center gap-1.5 rounded-l-xl bg-card px-1.5 py-3 text-[12px] font-semibold text-(--fg-2) shadow-(--shadow-md) [border:1px_solid_var(--line)] [border-right:0] transition-colors hover:text-foreground hover:bg-(--surface-2)">
        <Icon icon={CalendarDays} size="sm" />
        <span className="[writing-mode:vertical-rl] rotate-180 tracking-[0.04em]">Agenda</span>
        {deHoy > 0 && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-(--brand) px-1 text-[11px] font-semibold tabular-nums text-white"
            aria-label={`${deHoy} hoy`}>
            {deHoy}
          </span>
        )}
      </button>
    )
  }

  return (
    <section aria-labelledby="dashboard-agenda"
      className="fixed right-3 top-24 z-40 flex max-h-[calc(100dvh-8rem)] w-[300px] max-w-[calc(100vw-1.5rem)] flex-col rounded-xl bg-card shadow-(--shadow-lg) [border:1px_solid_var(--line)]">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)">
        <Icon icon={CalendarDays} size="xs" />
        <h3 id="dashboard-agenda" className="mr-auto" title={`Próximos ${DIAS_DE_AGENDA} días`}>Agenda</h3>
        <div role="group" aria-label="De quién"
          className="inline-flex items-center gap-0.5 rounded-full bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          <button type="button" aria-pressed={!todas} className={segmento(!todas)} onClick={() => setTodas(false)}>Mías</button>
          <button type="button" aria-pressed={todas} className={segmento(todas)} onClick={() => setTodas(true)}>Todas</button>
        </div>
        <button type="button" onClick={() => setAbierta(false)} aria-label="Plegar la agenda" title="Plegar"
          className="inline-flex size-6 items-center justify-center rounded-md text-(--fg-muted) hover:bg-(--surface-2) hover:text-foreground">
          <Icon icon={X} size="xs" />
        </button>
      </div>
      {reunionesQ.isLoading ? (
        <div className="flex flex-col gap-2 px-3 pb-4" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className="h-[40px] animate-pulse rounded-lg bg-secondary" />)}
        </div>
      ) : reunionesQ.error ? (
        <p className="px-4 pb-5 pt-2 text-[13px] text-(--fg-2)">No pudimos cargar la agenda.</p>
      ) : dias.length === 0 ? (
        <p className="px-4 pb-5 pt-2 text-[13px] text-(--fg-2)">
          {todas ? 'Nadie tiene nada agendado' : 'No tenés nada agendado'} en los próximos {DIAS_DE_AGENDA} días.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-2 pt-1">
          {dias.map(d => {
            const fecha = new Date(`${d.dia}T12:00:00`)
            const esHoy = d.dia === hoy
            return (
              <div key={d.dia} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5 px-0.5">
                  <span className={cn('text-[12.5px] font-bold first-letter:uppercase', esHoy ? 'text-(--brand)' : 'text-foreground')}>
                    {fmtDueLabel(d.dia, hoy)}
                  </span>
                  <span className="text-[11.5px] text-(--fg-muted) first-letter:uppercase">
                    {DIA_DE_SEMANA.format(fecha)} · {DIA_Y_MES.format(fecha)}
                  </span>
                </div>
                {d.reuniones.map(r => {
                  if ('deGoogle' in r) {
                    return (
                      <div key={`g-${r.id}`} title="Google Calendar"
                        className="flex items-start gap-2 rounded-lg bg-(--surface-2) py-1.5 pl-2.5 pr-2 [box-shadow:inset_3px_0_0_var(--line-strong)]">
                        <span className="w-[38px] shrink-0 pt-px text-[11.5px] font-semibold tabular-nums text-(--fg-2)">
                          {r.todoElDia ? 'Día' : HORA.format(new Date(r.starts_at))}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12.5px] font-medium text-foreground">{r.title || '(Sin título)'}</span>
                          {sinAceptar.has(r.id) && <PendienteAceptar />}
                        </span>
                        {todas && <AvatarUsuario usuario={usuariosPorId.get(myId ?? '')} />}
                      </div>
                    )
                  }
                  const lead = r.lead_id ? leadsPorId.get(r.lead_id) : undefined
                  const responsable = usuariosPorId.get(r.assigned_to ?? '')
                  const hecha = r.status === 'completed'
                  const contenido = (
                    <>
                      <span className={cn('w-[38px] shrink-0 pt-px text-[11.5px] font-semibold tabular-nums',
                        hecha ? 'text-(--fg-muted) line-through' : 'text-(--brand-soft-fg)')}>
                        {HORA.format(new Date(r.starts_at))}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[12.5px] font-semibold text-foreground">{r.title || 'Reunión'}</span>
                        {lead && <span className="truncate text-[11.5px] text-(--fg-2)">{nombreDelLead(lead.client)}</span>}
                        {r.external_event_id != null && sinAceptar.has(r.external_event_id) && <PendienteAceptar />}
                      </span>
                      {todas && <AvatarUsuario usuario={responsable} />}
                    </>
                  )
                  const clase = cn('flex items-start gap-2 rounded-lg py-1.5 pl-2.5 pr-2 text-left',
                    hecha ? 'bg-(--surface-2) opacity-70' : 'bg-(--brand-soft)', '[box-shadow:inset_3px_0_0_var(--brand)]')
                  return lead ? (
                    <button key={r.id} type="button" onClick={() => onAbrirLead(lead.id)}
                      className={cn(clase, 'transition-[filter] hover:brightness-[0.97]')}>
                      {contenido}
                    </button>
                  ) : (
                    <div key={r.id} className={clase}>{contenido}</div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      <Link to="/agenda" className="shrink-0 px-4 pb-3 pt-2 [border-top:1px_solid_var(--line-soft)] text-[12.5px] font-medium text-(--brand) hover:underline">
        Abrir la Agenda
      </Link>
    </section>
  )
}
