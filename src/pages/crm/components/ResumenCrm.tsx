import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, CalendarDays, ListTodo, Star } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Icon } from '@/components/ui/icon'
import { Select, SelectContent, SelectTrigger } from '@/components/ui/select'
import { fmtDueLabel, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { rotuloConHora } from '../lib/alarmas'
import { nombreDelLead, nombresDeDecisores } from '../lib/clientData'
import { etapaDelLead } from '../lib/effectiveStage'
import { esDescartado } from '../lib/leadFilters'
import { useGoogleAgenda, useHasCalendarConnected } from '@/pages/agenda/hooks/useCalendarConnection'
import {
  eventosDeGoogleSueltos, invitacionesSinAceptar, reunionesMias, reunionesPorDia, seguimientoDelLead,
  type OrdenDeImportantes, type Seguimiento,
} from '../lib/resumen'
import { estaVencida, tocaHoyOVencida, type ProximaTarea } from '../lib/tareas'
import { useReunionesProximas } from '../hooks/useCrmLeads'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useActualizarLead } from '../hooks/useLeadMutaciones'
import type { CrmLeadRow, CrmStage, Usuario } from '../types'
import { DescartarLeadDialog } from './DescartarLeadDialog'
import { EstrellaImportante } from './EstrellaImportante'
import { OpcionesDeEtapa } from './leadCells'

/** Cuántos días mira la agenda del resumen, hoy incluido. */
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

const caja = 'flex min-w-0 flex-col rounded-xl bg-card [border:1px_solid_var(--line)] shadow-(--shadow-sm)'
const tituloDeCaja = 'flex items-center gap-2 px-4 pb-2 pt-3 text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)'

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

/* Las columnas de los importantes (3/11/2026, por pedido: antes iba todo apretado en cuatro):
   estrella, inmobiliaria, decisor, estado (se cambia ahí mismo), seguimiento y la próxima tarea.
   La misma grilla para la cabecera y cada fila; en el teléfono la fila se apila. */
const COLUMNAS_DE_LEADS = 'md:grid md:grid-cols-[28px_minmax(0,1.3fr)_minmax(0,1fr)_168px_96px_minmax(0,1.4fr)] md:items-center md:gap-x-4'

const SEGUIMIENTO: Record<Seguimiento, { texto: string; clase: string; titulo: string }> = {
  'sin-tarea': { texto: 'Sin tarea', clase: 'bg-(--danger) text-white', titulo: 'No tenés ninguna tarea pendiente en este lead' },
  vencida: { texto: 'Vencida', clase: 'bg-(--danger-soft) [color:var(--danger-strong)] [border:1px_solid_var(--danger)]', titulo: 'La próxima tarea ya venció' },
  hoy: { texto: 'Hoy', clase: 'bg-(--warning-soft) text-(--warning-fg)', titulo: 'La próxima tarea es para hoy' },
  'al-dia': { texto: 'Al día', clase: 'bg-(--success-soft) text-(--success-fg)', titulo: 'Tiene una tarea agendada' },
  descartado: { texto: '—', clase: 'text-(--fg-faint)', titulo: 'Descartado: no se sigue' },
}

function PastillaDeSeguimiento({ seguimiento }: { seguimiento: Seguimiento }) {
  const s = SEGUIMIENTO[seguimiento]
  return (
    <span title={s.titulo}
      className={cn('inline-flex h-[22px] w-fit items-center whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold', s.clase)}>
      {s.texto}
    </span>
  )
}

/** La tarea de la columna «Próxima tarea»: el título y cuándo. Que no haya lo dice «Seguimiento». */
function TareaDeLaFila({ proxima, seguimiento, hoy }: { proxima: ProximaTarea | undefined; seguimiento: Seguimiento; hoy: string }) {
  if (!proxima) {
    return <span className="text-[12.5px] text-(--fg-faint)">—</span>
  }
  const t = proxima.tarea
  const urgente = seguimiento === 'vencida' || seguimiento === 'hoy'
  return (
    <span className="flex min-w-0 flex-col leading-tight" title={t.title}>
      <span className="truncate text-[13px] text-foreground">{t.title}</span>
      <span className={cn('truncate text-[11.5px] tabular-nums', urgente ? 'font-medium [color:var(--danger-strong)]' : 'text-(--fg-muted)')}>
        {t.due_date == null ? 'Sin fecha' : `${seguimiento === 'vencida' ? 'Vencía ' : ''}${rotuloConHora(fmtDueLabel(t.due_date, hoy), t.due_date, t.due_time)}`}
      </span>
    </span>
  )
}

/** El estado del lead, editable desde la fila (3/11/2026, por pedido): el mismo select del perfil.
 *  Descartado abre el diálogo del motivo; sin permiso de escritura es solo la chapa. */
function EtapaEditable({ lead }: { lead: CrmLeadRow }) {
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const { puedeEscribir } = useCarteras()
  const actualizarLead = useActualizarLead()
  const [descartando, setDescartando] = useState(false)
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  const opciones = etapasActivas.filter(e => !e.is_out_of_funnel || e.id === lead.funnel_stage_id || e.id === descartada?.id)
  if (actual && !opciones.some(e => e.id === actual.id)) opciones.push(actual)
  const etapa = etapaDelLead(lead, etapasPorId)
  return (
    <>
      <Select
        value={lead.funnel_stage_id ?? ''}
        disabled={!puedeEscribir(lead.assigned_to)}
        onValueChange={id => {
          if (id === descartada?.id) setDescartando(true)
          else actualizarLead.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null, recontact_at: null } })
        }}
      >
        <SelectTrigger aria-label={`Estado de ${nombreDelLead(lead.client)}`}
          className="relative z-10 h-7! w-[168px]! justify-between gap-1.5 rounded-full bg-(--surface-3) px-3 text-[12px] font-semibold text-foreground shadow-none [border:0.5px_solid_var(--line)] hover:bg-(--brand-soft) hover:text-(--brand-soft-fg) disabled:opacity-100 disabled:[&_svg]:hidden [&_svg]:size-3.5! [&_svg]:opacity-60">
          <span className="truncate">{etapa?.label ?? 'Sin estado'}</span>
        </SelectTrigger>
        <SelectContent align="start" className="min-w-[240px] rounded-xl p-1 shadow-lg">
          <OpcionesDeEtapa etapas={opciones} />
        </SelectContent>
      </Select>
      {descartando && descartada && (
        <DescartarLeadDialog leadId={lead.id} etapa={descartada} onClose={() => setDescartando(false)} />
      )}
    </>
  )
}

/** Un lead del resumen. El nombre abre el lead y estira su área a la fila entera (el resto de lo
 *  que se toca —estrella y estado— va por encima). Va en rojo sin tarea pendiente o con la próxima
 *  para hoy o vencida (26/10/2026, por pedido), salvo descartado. Cuentan solo tus tareas: con
 *  tareas solo de otros también va en rojo (4/11/2026, por pedido; del 2/11 era «De otro»). */
function FilaDeLead({ lead: l, proximas, etapas, hoy, onAbrirLead }: {
  lead: CrmLeadRow
  proximas: ReadonlyMap<string, ProximaTarea>
  etapas: ReadonlyMap<string, CrmStage>
  hoy: string
  onAbrirLead: (leadId: string) => void
}) {
  const proxima = proximas.get(l.id)
  const seguimiento = seguimientoDelLead({ proxima, descartado: esDescartado(l, etapas), hoy })
  const enRojo = seguimiento === 'sin-tarea' || seguimiento === 'vencida' || seguimiento === 'hoy'
  const decisores = nombresDeDecisores(l.client)
  return (
    <li className={cn('relative grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 px-3 py-2.5 [border-top:1px_solid_var(--line-soft)]',
      COLUMNAS_DE_LEADS, enRojo ? 'bg-(--danger-soft)/60 [box-shadow:inset_3px_0_0_var(--danger)] hover:bg-(--danger-soft)' : 'hover:bg-secondary/40')}>
      <EstrellaImportante lead={l} className="relative z-10 shrink-0" />
      <button type="button" onClick={() => onAbrirLead(l.id)}
        className="min-w-0 truncate text-left text-[14px] font-semibold text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">
        {nombreDelLead(l.client)}
      </button>
      <span className={cn('min-w-0 truncate text-[13px] max-md:col-start-2', decisores.length ? 'text-(--fg-2)' : 'text-(--fg-faint)')}
        title={decisores.join(', ') || undefined}>
        <span className="text-(--fg-muted) md:hidden">Decisor: </span>
        {decisores.length ? decisores.join(', ') : '—'}
      </span>
      <span className="max-md:col-start-2"><EtapaEditable lead={l} /></span>
      <span className="max-md:col-start-2"><PastillaDeSeguimiento seguimiento={seguimiento} /></span>
      <span className="min-w-0 max-md:col-start-2"><TareaDeLaFila proxima={proxima} seguimiento={seguimiento} hoy={hoy} /></span>
    </li>
  )
}

/** Cabecera de columna que ordena: la flecha dice que es el orden puesto. */
function CabeceraQueOrdena({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo} title={`Ordenar por ${children.toLowerCase()}`}
      className={cn('inline-flex w-fit items-center gap-1 uppercase tracking-[0.05em] outline-none hover:text-foreground focus-visible:underline',
        activo && 'text-foreground')}>
      {children}
      <Icon icon={ArrowDown} size="xs" className={cn('size-3', activo ? 'opacity-100' : 'opacity-0')} />
    </button>
  )
}

/**
 * El resumen de /crm, «Dashboard» en pantalla (23/10/2026, por pedido): lo primero que ve un SUPERADMIN. Los leads marcados
 * con la estrella (de todas las carteras) y la agenda de hoy y los próximos días. Sin contadores de
 * tareas vencidas, pendiente agendar ni recontactar, por pedido: esos son los chips de la lista.
 * Tocar un lead o una reunión abre el lead acá mismo (`?lead=`).
 */
export function ResumenCrm({ leads, importantes, orden, onOrden, hayEtapas, proximas, etapas, usuariosPorId, hoy, myId, onAbrirLead }: {
  /** Todos los que veo: de acá sale el nombre del lead de cada reunión. */
  leads: CrmLeadRow[]
  /** Con estrella o en una etapa con «Dashboard: Sí», ya ordenados (`leadsImportantes`): las
   *  flechas del dialog los recorren igual. */
  importantes: CrmLeadRow[]
  orden: OrdenDeImportantes
  onOrden: (orden: OrdenDeImportantes) => void
  /** Si alguna etapa está marcada: cambia lo que dice la caja vacía. */
  hayEtapas: boolean
  /** Solo tus tareas (`assigned_to`): la de otro no se ve en el Dashboard. */
  proximas: ReadonlyMap<string, ProximaTarea>
  etapas: ReadonlyMap<string, CrmStage>
  usuariosPorId: ReadonlyMap<string, Usuario>
  hoy: string
  myId: string | null
  onAbrirLead: (leadId: string) => void
}) {
  const leadsPorId = useMemo(() => new Map(leads.map(l => [l.id, l])), [leads])
  const fila = { proximas, etapas, hoy, onAbrirLead }

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

  return (
    <div className="flex flex-col gap-3 px-3 pb-6 pt-1 max-md:px-2">
      <h2 className="text-[15px] font-semibold text-foreground">Dashboard</h2>

      {/* La agenda va lo más angosta posible (3/11/2026, por pedido): solo hora y evento. */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_272px]">
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
            <>
              <div className={cn('hidden bg-(--surface-2) px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-(--fg-muted) [border-top:1px_solid_var(--line-soft)]', COLUMNAS_DE_LEADS)}>
                <span aria-hidden />
                <span>Inmobiliaria</span>
                <span>Decisor</span>
                <CabeceraQueOrdena activo={orden === 'estado'} onClick={() => onOrden('estado')}>Estado</CabeceraQueOrdena>
                <span>Seguimiento</span>
                <CabeceraQueOrdena activo={orden === 'tarea'} onClick={() => onOrden('tarea')}>Próxima tarea</CabeceraQueOrdena>
              </div>
              {/* En el teléfono no hay cabecera: el orden se elige acá. */}
              <div role="group" aria-label="Ordenar por"
                className="mx-3 mb-2 inline-flex w-fit items-center gap-0.5 rounded-full bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)] md:hidden">
                <button type="button" aria-pressed={orden === 'estado'} className={segmento(orden === 'estado')} onClick={() => onOrden('estado')}>Por estado</button>
                <button type="button" aria-pressed={orden === 'tarea'} className={segmento(orden === 'tarea')} onClick={() => onOrden('tarea')}>Por tarea</button>
              </div>
              <ul className="flex flex-col">
                {importantes.map(l => <FilaDeLead key={l.id} lead={l} {...fila} />)}
              </ul>
            </>
          )}
        </section>

        {/* Alto de la pantalla (3/11/2026, por pedido): la lista de días se scrollea adentro. */}
        <section className={cn(caja, 'lg:sticky lg:top-2 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[420px]')} aria-labelledby="resumen-agenda">
          <div className={cn(tituloDeCaja, 'pr-3')}>
            <Icon icon={CalendarDays} size="xs" />
            <h3 id="resumen-agenda" className="mr-auto" title={`Próximos ${DIAS_DE_AGENDA} días`}>Agenda</h3>
            <div role="group" aria-label="De quién"
              className="inline-flex items-center gap-0.5 rounded-full bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
              <button type="button" aria-pressed={!todas} className={segmento(!todas)} onClick={() => setTodas(false)}>Mías</button>
              <button type="button" aria-pressed={todas} className={segmento(todas)} onClick={() => setTodas(true)}>Todas</button>
            </div>
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
          <Link to="/agenda" className="mt-auto shrink-0 px-4 pb-3 pt-2 [border-top:1px_solid_var(--line-soft)] text-[12.5px] font-medium text-(--brand) hover:underline">
            Abrir la Agenda
          </Link>
        </section>
      </div>
    </div>
  )
}
