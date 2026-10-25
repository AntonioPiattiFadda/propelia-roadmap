import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ListTodo, Star } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Icon } from '@/components/ui/icon'
import { fmtDueLabel, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { rotuloConHora } from '../lib/alarmas'
import { nombreDelLead } from '../lib/clientData'
import { etapaDelLead } from '../lib/effectiveStage'
import { useGoogleAgenda, useHasCalendarConnected } from '@/pages/agenda/hooks/useCalendarConnection'
import { eventosDeGoogleSueltos, reunionesPorDia } from '../lib/resumen'
import { estaVencida, type ProximaTarea } from '../lib/tareas'
import { useReunionesProximas } from '../hooks/useCrmLeads'
import type { CrmLeadRow, CrmMeeting, CrmStage, Usuario } from '../types'
import { EstrellaImportante } from './EstrellaImportante'
import { StageBadge } from './leadCells'

/** Cuántos días mira la agenda del resumen, hoy incluido. */
const DIAS_DE_AGENDA = 7
/** Medianoche LOCAL del día, en UTC: el día es el de quien mira. */
const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00`).toISOString()
const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })
const DIA_DE_SEMANA = new Intl.DateTimeFormat('es-ES', { weekday: 'long' })

const caja = 'flex min-w-0 flex-col rounded-xl bg-card [border:1px_solid_var(--line)] shadow-(--shadow-sm)'
const tituloDeCaja = 'flex items-center gap-2 px-4 pb-2 pt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)'

const segmento = (activo: boolean) => cn(
  'inline-flex h-7 cursor-pointer select-none items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium normal-case tracking-normal',
  'transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-(--brand-200)',
  activo ? 'bg-card text-foreground font-semibold shadow-(--shadow-sm)' : 'text-(--fg-muted) hover:text-foreground',
)

function ProximaTareaDelLead({ proxima, hoy }: { proxima: ProximaTarea | undefined; hoy: string }) {
  if (!proxima) return <span className="whitespace-nowrap text-[12.5px] font-medium text-(--warning-fg)">Sin tarea</span>
  const t = proxima.tarea
  const vencida = estaVencida(t, hoy)
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px]" title={t.title}>
      <Icon icon={ListTodo} size="xs" className="shrink-0 text-(--fg-muted)" />
      <span className="truncate text-(--fg-2)">{t.title}</span>
      <span className={cn('shrink-0 whitespace-nowrap tabular-nums', vencida ? 'font-medium [color:var(--danger-strong)]' : 'text-(--fg-muted)')}>
        {t.due_date == null ? 'Sin fecha' : `${vencida ? 'Vencía ' : ''}${rotuloConHora(fmtDueLabel(t.due_date, hoy), t.due_date, t.due_time)}`}
      </span>
    </span>
  )
}

/** Un lead del resumen: estrella, responsable, nombre, etapa y próxima tarea. Tocarlo lo abre. */
function FilaDeLead({ lead: l, proximas, etapas, usuariosPorId, hoy, onAbrirLead }: {
  lead: CrmLeadRow
  proximas: ReadonlyMap<string, ProximaTarea>
  etapas: ReadonlyMap<string, CrmStage>
  usuariosPorId: ReadonlyMap<string, Usuario>
  hoy: string
  onAbrirLead: (leadId: string) => void
}) {
  const responsable = usuariosPorId.get(l.assigned_to)
  return (
    <li className="flex items-center gap-2 px-2 [border-top:1px_solid_var(--line-soft)]">
      <EstrellaImportante lead={l} className="shrink-0" />
      <button type="button" onClick={() => onAbrirLead(l.id)}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pr-2 text-left hover:bg-secondary/40 rounded-md">
        <AvatarUsuario usuario={responsable} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-foreground">{nombreDelLead(l.client)}</span>
            <StageBadge etapa={etapaDelLead(l, etapas)} className="shrink-0" />
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-[12.5px] text-(--fg-muted)">{responsable?.nombre ?? 'Sin responsable'}</span>
            <ProximaTareaDelLead proxima={proximas.get(l.id)} hoy={hoy} />
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * El resumen de /crm, «Dashboard» en pantalla (23/10/2026, por pedido): lo primero que ve un SUPERADMIN. Los leads marcados
 * con la estrella (de todas las carteras) y la agenda de hoy y los próximos días. Sin contadores de
 * tareas vencidas, pendiente agendar ni recontactar, por pedido: esos son los chips de la lista.
 * Tocar un lead o una reunión abre el lead acá mismo (`?lead=`).
 */
export function ResumenCrm({ leads, importantes, hayEtapas, proximas, etapas, usuariosPorId, hoy, myId, onAbrirLead }: {
  /** Todos los que veo: de acá sale el nombre del lead de cada reunión. */
  leads: CrmLeadRow[]
  /** Con estrella o en una etapa con «Dashboard: Sí», ya ordenados (`leadsImportantes`): las
   *  flechas del dialog los recorren igual. */
  importantes: CrmLeadRow[]
  /** Si alguna etapa está marcada: cambia lo que dice la caja vacía. */
  hayEtapas: boolean
  proximas: ReadonlyMap<string, ProximaTarea>
  etapas: ReadonlyMap<string, CrmStage>
  usuariosPorId: ReadonlyMap<string, Usuario>
  hoy: string
  myId: string | null
  onAbrirLead: (leadId: string) => void
}) {
  const leadsPorId = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads])
  const fila = { proximas, etapas, usuariosPorId, hoy, onAbrirLead }

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
    const deQuien = reuniones.filter((r: CrmMeeting) => todas || r.assigned_to === myId)
    const deGoogle = eventosDeGoogleSueltos(googleQ.data ?? [], reuniones)
    return reunionesPorDia([...deQuien, ...deGoogle], hoy, DIAS_DE_AGENDA)
  }, [reunionesQ.data, googleQ.data, todas, myId, hoy])

  return (
    <div className="flex flex-col gap-3 px-3 pb-6 pt-1 max-md:px-2">
      <h2 className="text-[15px] font-semibold text-foreground">Dashboard</h2>

      <div className="grid gap-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={caja} aria-labelledby="resumen-importantes">
          <h3 id="resumen-importantes" className={tituloDeCaja}>
            <Icon icon={Star} size="xs" className="fill-current text-(--warning-fg)" />
            Leads importantes
            <span className="ml-auto tabular-nums text-(--fg-muted)">{importantes.length}</span>
          </h3>
          {importantes.length === 0 ? (
            <p className="px-4 pb-5 pt-2 text-[13px] text-(--fg-2)">
              {hayEtapas
                ? 'No hay leads en las etapas elegidas ni con estrella (☆).'
                : 'Todavía no hay ninguno. Elegí las etapas en la configuración del funnel (columna «Dashboard: Sí») o marcá leads con la estrella (☆) en la lista.'}
            </p>
          ) : (
            <ul className="flex flex-col">
              {importantes.map(l => <FilaDeLead key={l.id} lead={l} {...fila} />)}
            </ul>
          )}
        </section>

        <section className={caja} aria-labelledby="resumen-agenda">
          <div className={tituloDeCaja}>
            <Icon icon={CalendarDays} size="xs" />
            <h3 id="resumen-agenda" className="mr-auto">Agenda · próximos {DIAS_DE_AGENDA} días</h3>
            <div role="group" aria-label="De quién"
              className="inline-flex items-center gap-0.5 rounded-full bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
              <button type="button" aria-pressed={!todas} className={segmento(!todas)} onClick={() => setTodas(false)}>Mías</button>
              <button type="button" aria-pressed={todas} className={segmento(todas)} onClick={() => setTodas(true)}>Todas</button>
            </div>
          </div>
          {reunionesQ.isLoading ? (
            <div className="flex flex-col gap-2 px-4 pb-4" aria-busy="true">
              {[0, 1, 2].map(i => <div key={i} className="h-[36px] animate-pulse rounded-lg bg-secondary" />)}
            </div>
          ) : reunionesQ.error ? (
            <p className="px-4 pb-5 pt-2 text-[13px] text-(--fg-2)">No pudimos cargar la agenda.</p>
          ) : dias.length === 0 ? (
            <p className="px-4 pb-5 pt-2 text-[13px] text-(--fg-2)">
              {todas ? 'Nadie tiene nada agendado' : 'No tenés nada agendado'} en los próximos {DIAS_DE_AGENDA} días.
            </p>
          ) : (
            <div className="flex flex-col pb-2">
              {dias.map(d => (
                <div key={d.dia} className="flex flex-col">
                  <div className="px-4 pb-1 pt-2 text-[12px] font-semibold text-(--fg-2) first-letter:uppercase">
                    {fmtDueLabel(d.dia, hoy)} · <span className="font-normal">{DIA_DE_SEMANA.format(new Date(`${d.dia}T12:00:00`))}</span>
                  </div>
                  {d.reuniones.map(r => {
                    if ('deGoogle' in r) {
                      return (
                        <div key={`g-${r.id}`} className="flex items-center gap-2.5 px-4 py-1.5 text-left">
                          <span className="w-[44px] shrink-0 text-[12.5px] font-semibold tabular-nums text-foreground">
                            {r.todoElDia ? 'Día' : HORA.format(new Date(r.starts_at))}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[13px] font-medium text-foreground">{r.title || '(Sin título)'}</span>
                            <span className="truncate text-[12px] text-(--fg-muted)">
                              {r.todoElDia ? 'Todo el día · Google Calendar' : 'Google Calendar'}
                            </span>
                          </span>
                          {todas && <AvatarUsuario usuario={usuariosPorId.get(myId ?? '')} />}
                        </div>
                      )
                    }
                    const lead = r.lead_id ? leadsPorId.get(r.lead_id) : undefined
                    const responsable = usuariosPorId.get(r.assigned_to ?? '')
                    const contenido = (
                      <>
                        <span className={cn('w-[44px] shrink-0 text-[12.5px] font-semibold tabular-nums',
                          r.status === 'completed' ? 'text-(--fg-muted) line-through' : 'text-foreground')}>
                          {HORA.format(new Date(r.starts_at))}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px] font-medium text-foreground">{r.title || 'Reunión'}</span>
                          {lead && <span className="truncate text-[12px] text-(--fg-muted)">{nombreDelLead(lead.client)}</span>}
                        </span>
                        {todas && <AvatarUsuario usuario={responsable} />}
                      </>
                    )
                    const clase = 'flex items-center gap-2.5 px-4 py-1.5 text-left'
                    return lead ? (
                      <button key={r.id} type="button" onClick={() => onAbrirLead(lead.id)} className={cn(clase, 'hover:bg-secondary/40')}>
                        {contenido}
                      </button>
                    ) : (
                      <div key={r.id} className={clase}>{contenido}</div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          <Link to="/agenda" className="mt-auto px-4 pb-3 pt-1 text-[12.5px] font-medium text-(--brand) hover:underline">
            Abrir la Agenda
          </Link>
        </section>
      </div>
    </div>
  )
}
