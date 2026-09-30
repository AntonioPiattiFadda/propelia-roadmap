import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCw } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { useIsMobile } from '@/hooks/use-mobile'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { contactoDelCliente, nombreDelLead } from '../lib/clientData'
import { computeLeadListCounters } from '../lib/computeLeadListCounters'
import { etapaDelLead } from '../lib/effectiveStage'
import { estadoDeLista } from '../lib/estadoDeLista'
import { fmtIngresoDate, fmtShortDate } from '../lib/leadCellFormat'
import {
  deleteLeadFilterParams, escribirFiltros, escribirLeadAbierto, filtrosDesdeUrl, formatFilterList, LEAD_FILTER_PARAMS_WITH_QUERY, LEAD_PARAM,
} from '../lib/leadFilterParams'
import { filterLeads, leadsDeCarteras, type LeadFilterContext, type LeadFilterState } from '../lib/leadFilters'
import { idsConTareasVencidas, tareasVencidasPorLead } from '../lib/tareas'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrmLeads, useTareasPendientes } from '../hooks/useCrmLeads'
import { useReasignar } from '../hooks/useLeadMutaciones'
import { useVisibleAgents } from '../hooks/useVisibleAgents'
import { nombreDe } from '../lib/permisos'
import type { ReassignCandidate } from '../lib/reassignCollisions'
import type { CrmLeadRow, CrmTask, EtapaConPrioridad, Usuario } from '../types'
import { BulkActionBar } from './BulkActionBar'
import { FiltrosCrm } from './FiltrosCrm'
import { LeadDialog } from './LeadDialog'
import { LeadRowActions } from './LeadRowActions'
import { ReassignLeadsDialog } from './ReassignLeadsDialog'
import { GestionCell, StageBadge } from './leadCells'

const SIN_TAREAS: CrmTask[] = []
const SIN_LEADS: CrmLeadRow[] = []
const SIN_IDS: string[] = []

type RenglonProps = {
  lead: CrmLeadRow
  etapa: EtapaConPrioridad | null
  responsable: Usuario | undefined
  /** El anillo de «es mío» solo dice algo con más de una cartera en pantalla. */
  esMio: boolean | null
  vencidas: CrmTask[]
  puedeEscribir: boolean
  now: number
  onAbrir: (leadId: string) => void
  /** El menú de acciones del renglón (Task 10). */
  acciones?: ReactNode
  /** Modo selección para reasignar en lote (Task 11): el riel se vuelve casilla. */
  seleccion?: { marcado: boolean; onToggle: () => void }
}

// Los portales (popovers, menús) burbujean por el árbol de React aunque su DOM viva afuera: sin
// este corte, un clic adentro del menú de posponer abriría el lead. Y la casilla de selección
// vive adentro de un `data-row-actions`: su clic lo atiende ella, no el renglón (si no, marcaría
// y desmarcaría en el mismo clic).
function clicDelRenglon(e: React.MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement
  return e.currentTarget.contains(target) && !target.closest('[data-row-actions]')
}

function LeadRow({ lead, etapa, responsable, esMio, vencidas, puedeEscribir, now, onAbrir, acciones, seleccion }: RenglonProps) {
  const contacto = contactoDelCliente(lead.client)
  return (
    <tr
      onClick={e => {
        if (!clicDelRenglon(e)) return
        if (seleccion) seleccion.onToggle()
        else onAbrir(lead.id)
      }}
      className="cursor-pointer transition-colors [border-bottom:1px_solid_var(--line-soft)] hover:bg-secondary/40"
    >
      <td className={cn(seleccion ? 'px-3.5 py-[11px]' : 'p-0')} data-row-actions>
        {seleccion ? (
          <Checkbox checked={seleccion.marcado} onCheckedChange={seleccion.onToggle} aria-label="Seleccionar lead" />
        ) : (
          <span aria-hidden className="block h-[44px] w-[4px] rounded-r-[3px]" style={{ background: 'var(--line-soft)' }} />
        )}
      </td>
      <td className="whitespace-nowrap px-[18px] py-[11px] text-[13.5px] font-medium tabular-nums text-(--fg-2)">
        {fmtIngresoDate(lead.created_at)}
      </td>
      <td className="px-[18px] py-[11px]">
        <div className="flex items-center gap-[9px]">
          <AvatarUsuario usuario={responsable} anillo={esMio === true} />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-foreground">{nombreDelLead(lead.client)}</div>
            {contacto && contacto !== nombreDelLead(lead.client) && (
              <div className="truncate text-[12px] text-(--fg-muted)">{contacto}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-[18px] py-[11px] text-[12.5px] text-(--fg-2)">
        <div className="truncate">{lead.client?.phone ?? ''}</div>
        <div className="truncate text-(--fg-muted)">{lead.client?.email ?? ''}</div>
      </td>
      <td className="px-[18px] py-[11px]"><StageBadge etapa={etapa} /></td>
      <td className="px-[18px] py-[11px]">
        <GestionCell lead={lead} toleranceHours={etapa?.management_tolerance_hours} overdueTasks={vencidas}
          puedeEscribir={puedeEscribir} now={now} />
      </td>
      <td className="whitespace-nowrap px-[18px] py-[11px] text-[12.5px] tabular-nums text-(--fg-muted)">
        {fmtShortDate(lead.last_important_event_at)}
      </td>
      <td className="px-2 py-[11px] text-right" data-row-actions>{acciones}</td>
    </tr>
  )
}

/** El mismo renglón en el teléfono: empresa arriba, etapa y gestión abajo. */
function LeadCard({ lead, etapa, responsable, esMio, vencidas, puedeEscribir, now, onAbrir, acciones, seleccion }: RenglonProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={e => {
        if (!clicDelRenglon(e)) return
        if (seleccion) seleccion.onToggle()
        else onAbrir(lead.id)
      }}
      // Solo el Enter de la tarjeta misma: el de un botón interno (gestión, posponer) burbujea hasta acá.
      onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget && !seleccion) onAbrir(lead.id) }}
      className="flex flex-col gap-2 bg-card px-3 py-3 [border-bottom:1px_solid_var(--line-soft)]"
    >
      <div className="flex items-center gap-2.5">
        {seleccion && (
          <span data-row-actions>
            <Checkbox checked={seleccion.marcado} onCheckedChange={seleccion.onToggle} aria-label="Seleccionar lead" />
          </span>
        )}
        <AvatarUsuario usuario={responsable} anillo={esMio === true} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-foreground">{nombreDelLead(lead.client)}</div>
          <div className="truncate text-[12.5px] text-(--fg-muted)">
            {[contactoDelCliente(lead.client), lead.client?.phone].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span data-row-actions>{acciones}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge etapa={etapa} />
        <GestionCell lead={lead} toleranceHours={etapa?.management_tolerance_hours} overdueTasks={vencidas}
          puedeEscribir={puedeEscribir} now={now} />
      </div>
    </div>
  )
}

const HEADERS = ['', 'Alta', 'Lead', 'Contacto', 'Etapa', 'Gestión', 'Última actividad', '']

export function CrmLeadList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()
  const leadsQ = useCrmLeads()
  const tareasQ = useTareasPendientes()
  const cat = useCrmCatalogos()
  const agentes = useVisibleAgents()
  // null = la sesión todavía no llegó: nunca se decide «sin leads» sin saber de quién es la cartera.
  const carteras = agentes.selectedIds

  // Reasignar: desde el menú de un renglón se entra al modo selección con ese lead marcado (como
  // el producto); desde el dialog del lead se reasigna ese solo, sin pasar por la selección.
  const [seleccionando, setSeleccionando] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set())
  const [aReasignar, setAReasignar] = useState<string[] | null>(null)
  const reasignar = useReasignar()
  const empezarSeleccion = (leadId: string) => { setSeleccionando(true); setMarcados(new Set([leadId])) }
  const salirDeSeleccion = () => { setSeleccionando(false); setMarcados(new Set()) }
  const alternarMarcado = (leadId: string) => setMarcados(prev => {
    const next = new Set(prev)
    if (next.has(leadId)) next.delete(leadId)
    else next.add(leadId)
    return next
  })

  const filtros = useMemo(() => filtrosDesdeUrl(searchParams), [searchParams])
  const hoy = localTodayIso()
  const tareas = tareasQ.data ?? SIN_TAREAS
  const vencidasPorLead = useMemo(() => tareasVencidasPorLead(tareas, hoy), [tareas, hoy])
  const overdueLeadIds = useMemo(() => idsConTareasVencidas(tareas, hoy), [tareas, hoy])
  // Un solo «ahora» por pintada (ver LeadFilterContext). `dataUpdatedAt` va en las dependencias a
  // propósito: cada vez que llegan datos nuevos (realtime, mutación) se toma un «ahora» nuevo, así
  // una gestión que venció con la pantalla abierta se ve vencida en el próximo refresco.
  const ctx = useMemo<LeadFilterContext>(
    () => ({ overdueLeadIds, etapas: cat.etapasPorId, now: Date.now() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overdueLeadIds, cat.etapasPorId, leadsQ.dataUpdatedAt],
  )

  const deCarteras = useMemo(
    () => leadsDeCarteras(leadsQ.data ?? SIN_LEADS, carteras ?? SIN_IDS), [leadsQ.data, carteras])
  const visibles = useMemo(() => filterLeads(deCarteras, filtros, ctx), [deCarteras, filtros, ctx])
  const contadores = useMemo(() => computeLeadListCounters(deCarteras, filtros, ctx), [deCarteras, filtros, ctx])
  // Lo marcado sobrevive a los filtros, la búsqueda y el cambio de cartera, pero reasignar mueve
  // leads de cartera: solo cuenta y solo se manda lo que se está viendo. Si no, la barra dice «5 de
  // 3» y se mueven leads que nadie estaba mirando. Se cruza al usarlo y no se borra la marca: volver
  // a sacar el filtro devuelve la selección como estaba.
  const marcadosVisibles = useMemo(() => visibles.filter(l => marcados.has(l.id)).map(l => l.id), [visibles, marcados])
  const estado = estadoDeLista({
    cargando: leadsQ.isLoading || carteras === null,
    error: leadsQ.error,
    total: leadsQ.data && carteras ? deCarteras.length : undefined,
    visibles: visibles.length,
  })

  const cambiarFiltros = (patch: Partial<LeadFilterState>) =>
    setSearchParams(prev => escribirFiltros(prev, patch), { replace: true })
  const limpiarFiltros = () =>
    setSearchParams(prev => deleteLeadFilterParams(prev, LEAD_FILTER_PARAMS_WITH_QUERY), { replace: true })
  const abrirLead = (leadId: string | null) =>
    setSearchParams(prev => escribirLeadAbierto(prev, leadId), { replace: true })

  const usuariosPorId = useMemo(() => new Map(agentes.usuarios.map(u => [u.id, u])), [agentes.usuarios])
  const variasCarteras = (carteras?.length ?? 0) > 1

  const propsDe = (lead: CrmLeadRow): RenglonProps => ({
    lead,
    etapa: etapaDelLead(lead, cat.etapasPorId),
    responsable: usuariosPorId.get(lead.assigned_to),
    esMio: variasCarteras ? lead.assigned_to === agentes.myId : null,
    vencidas: vencidasPorLead.get(lead.id) ?? SIN_TAREAS,
    puedeEscribir: agentes.puedeEscribir(lead.assigned_to),
    now: ctx.now,
    onAbrir: abrirLead,
    acciones: <LeadRowActions lead={lead} puedeEscribir={agentes.puedeEscribir(lead.assigned_to)} onStartReassign={empezarSeleccion} />,
    // Solo se puede marcar lo que se puede mover: un lead de una cartera de solo lectura sigue
    // abriéndose con el clic, como fuera del modo selección.
    seleccion: seleccionando && agentes.puedeEscribir(lead.assigned_to)
      ? { marcado: marcados.has(lead.id), onToggle: () => alternarMarcado(lead.id) }
      : undefined,
  })

  // El lead abierto sale de TODOS los leads y no de los visibles: un enlace a `?lead=` tiene que
  // abrirlo aunque los filtros lo escondan. Las flechas recorren la lista tal como se ve.
  const leadAbiertoId = searchParams.get(LEAD_PARAM)
  const leadAbierto = leadAbiertoId ? (leadsQ.data ?? []).find(l => l.id === leadAbiertoId) ?? null : null
  const indiceAbierto = leadAbierto ? visibles.findIndex(l => l.id === leadAbierto.id) : -1
  const pasoLead = (delta: -1 | 1) => {
    const siguiente = visibles[indiceAbierto + delta]
    if (siguiente) abrirLead(siguiente.id)
  }

  const candidatos = (ids: string[]): ReassignCandidate[] => (leadsQ.data ?? [])
    .filter(l => ids.includes(l.id))
    .map(l => ({ id: l.id, clientId: l.client_id, clientName: nombreDelLead(l.client), assignedTo: l.assigned_to }))

  // Sin valores vacíos: un `false` o '' colado dejaría «Ningún lead con  y Etapa.».
  const etiquetasFiltros = [
    filtros.q.trim() && 'Búsqueda',
    filtros.stageFilter.size > 0 && 'Etapa',
    filtros.gestionExcluded.size > 0 && 'Gestión',
    filtros.excludedPriorities.size > 0 && 'Prioridad',
    filtros.overdueOnly && 'Tareas vencidas',
  ].filter((v): v is string => typeof v === 'string' && !!v)

  return (
    <>
      <FiltrosCrm
        filtros={filtros}
        contadores={contadores}
        etapas={cat.etapasActivas}
        prioridades={cat.prioridadesActivas}
        onCambiar={cambiarFiltros}
        onLimpiar={limpiarFiltros}
      />

      {estado === 'cargando' && (
        <div className="flex flex-col gap-2 px-3" aria-busy="true">
          {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-secondary" />)}
        </div>
      )}

      {/* Un error de red NO vacía la lista: si hay datos, se siguen viendo (estadoDeLista). */}
      {estado === 'error' && (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">No pudimos cargar los leads.</p>
          <Button variant="outline" onClick={() => void leadsQ.refetch()} disabled={leadsQ.isFetching}>
            <Icon icon={RotateCw} size="xs" className={cn(leadsQ.isFetching && 'animate-spin')} />
            {leadsQ.isFetching ? 'Reintentando…' : 'Reintentar'}
          </Button>
        </div>
      )}

      {estado === 'sin-leads' && (
        <div className="px-4 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {variasCarteras ? 'Estas carteras todavía no tienen leads.' : 'Todavía no tenés leads.'}
          </p>
          <p className="mt-1 text-[13px] text-(--fg-2)">Cargá el primero con «Nuevo lead».</p>
        </div>
      )}

      {estado === 'sin-resultados' && (
        <div className="px-4 py-12 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            Ningún lead con {formatFilterList(etiquetasFiltros) || 'estos filtros'}.
          </p>
          <Button variant="outline" className="mt-3" onClick={limpiarFiltros}>Limpiar filtros</Button>
        </div>
      )}

      {estado === 'ok' && (isMobile ? (
        <div className="flex flex-col">
          {visibles.map(lead => <LeadCard key={lead.id} {...propsDe(lead)} />)}
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {HEADERS.map((h, i) => (
                <th
                  key={i}
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap bg-(--surface-2) px-[18px] py-[7px] text-left text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)',
                    'shadow-[inset_0_-1px_0_var(--line-strong)]',
                    i === 0 && 'w-[28px] px-0',
                  )}
                >
                  {i === HEADERS.length - 1 ? (
                    <span className="block text-right tabular-nums">{visibles.length} lead{visibles.length === 1 ? '' : 's'}</span>
                  ) : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(lead => <LeadRow key={lead.id} {...propsDe(lead)} />)}
          </tbody>
        </table>
      ))}

      <LeadDialog
        lead={leadAbierto}
        indice={indiceAbierto}
        total={visibles.length}
        onPaso={pasoLead}
        onCerrar={() => abrirLead(null)}
        onStartReassign={leadId => setAReasignar([leadId])}
      />

      {seleccionando && (
        <BulkActionBar
          selectedCount={marcadosVisibles.length}
          totalCount={visibles.length}
          confirmLabel="Reasignar leads"
          onCancel={salirDeSeleccion}
          onConfirm={() => setAReasignar(marcadosVisibles)}
        />
      )}

      {aReasignar && (
        <ReassignLeadsDialog
          open
          onOpenChange={abierto => { if (!abierto) setAReasignar(null) }}
          candidatos={candidatos(aReasignar)}
          leads={leadsQ.data ?? []}
          isPending={reasignar.isPending}
          onConfirm={(nuevo, mover) => reasignar.mutate(
            { items: mover.map(c => ({ leadId: c.id, deNombre: nombreDe(agentes.usuarios, c.assignedTo) })), nuevo },
            { onSettled: () => { setAReasignar(null); salirDeSeleccion() } },
          )}
        />
      )}
    </>
  )
}
