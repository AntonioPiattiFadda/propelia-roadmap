import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, ListTodo, RotateCw } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { useIsMobile } from '@/hooks/use-mobile'
import { fmtDueLabel, localTodayIso, startOfWeekIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { rotuloConHora } from '../lib/alarmas'
import { nombreDelLead } from '../lib/clientData'
import { computeLeadListCounters } from '../lib/computeLeadListCounters'
import { etapaDelLead } from '../lib/effectiveStage'
import { estadoDeLista } from '../lib/estadoDeLista'
import { vecinoMarcable } from '../lib/seleccionConFlechas'
import { vecinosEnRecorrido, type UltimaPosicion } from '../lib/recorrido'
import { fmtUltimaActividad } from '../lib/ultimaActividad'
import { fmtIngresoDate, fmtShortDate } from '../lib/leadCellFormat'
import {
  deleteLeadFilterParams, escribirFiltros, escribirLeadAbierto, escribirVista, filtrosDesdeUrl, formatFilterList, LEAD_FILTER_PARAMS_WITH_QUERY, LEAD_PARAM,
  vistaDesdeUrl, type VistaCrm,
} from '../lib/leadFilterParams'
import { agruparPorEtapa } from '../lib/columnasPorEtapa'
import { filterLeads, leadsDeCarteras, type LeadFilterContext, type LeadFilterState } from '../lib/leadFilters'
import { estaVencida, idsConTareasVencidas, ordenarPorEstado, ordenarPorProximaTarea, proximaTareaPorLead, type ProximaTarea } from '../lib/tareas'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrmLeads, useTareasPendientes } from '../hooks/useCrmLeads'
import { useReasignar } from '../hooks/useLeadMutaciones'
import { useObjetivos } from '../hooks/useObjetivos'
import { useVisibleAgents } from '../hooks/useVisibleAgents'
import { nombreDe } from '../lib/permisos'
import type { ReassignCandidate } from '../lib/reassignCollisions'
import type { CrmLeadRow, CrmStage, CrmTask, Usuario } from '../types'
import { BulkActionBar } from './BulkActionBar'
import { ColumnasCrm, type FichaProps } from './ColumnasCrm'
import { BuscadorLeads, FiltrosCrm } from './FiltrosCrm'
import { LeadDialog } from './LeadDialog'
import { LeadRowActions } from './LeadRowActions'
import { ReassignLeadsDialog } from './ReassignLeadsDialog'
import { StageBadge } from './leadCells'

const SIN_TAREAS: CrmTask[] = []
const SIN_LEADS: CrmLeadRow[] = []
const SIN_IDS: string[] = []

type RenglonProps = {
  lead: CrmLeadRow
  etapa: CrmStage | null
  responsable: Usuario | undefined
  /** El anillo de «es mío» solo dice algo con más de una cartera en pantalla. */
  esMio: boolean | null
  onAbrir: (leadId: string) => void
  /** El menú de acciones del renglón (Task 10). */
  acciones?: ReactNode
  /** Modo selección para reasignar en lote (Task 11): el riel se vuelve casilla. */
  seleccion?: { marcado: boolean; onToggle: () => void }
  /** La próxima tarea pendiente del lead (undefined = no tiene ninguna). */
  proxima: ProximaTarea | undefined
  hoy: string
  /** Con el filtro «Tareas» puesto, la tarea reemplaza a teléfono y última actividad. */
  modoTareas: boolean
}

/* Con «Tareas» la pregunta deja de ser «en qué está este lead» y pasa a ser «qué tengo que hacer
   y para cuándo». Teléfono y última actividad se cambian por la próxima tarea; la etapa se
   queda, que es lo que dice qué tipo de tarea tiene sentido hacerle a ese lead. */
function TituloTarea({ proxima }: { proxima: ProximaTarea | undefined }) {
  if (!proxima) return null
  const mas = proxima.pendientes - 1
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="line-clamp-2 text-[13px] text-foreground" title={proxima.tarea.title}>{proxima.tarea.title}</span>
      {mas > 0 && <span className="shrink-0 whitespace-nowrap text-[12px] text-(--fg-muted)">+{mas} más</span>}
    </div>
  )
}

/** El mismo rótulo que las tareas del lead: vencida en rojo, el resto apagado. */
function VenceTarea({ proxima, hoy }: { proxima: ProximaTarea | undefined; hoy: string }) {
  if (!proxima) return null
  const t = proxima.tarea
  const vencida = estaVencida(t, hoy)
  return (
    <span className={cn('whitespace-nowrap text-[12.5px] tabular-nums',
      vencida ? 'font-medium [color:var(--danger-strong)]' : 'text-(--fg-muted)')}>
      {t.due_date == null ? 'Sin fecha'
        : `${vencida ? 'Vencía ' : ''}${rotuloConHora(fmtDueLabel(t.due_date, hoy), t.due_date, t.due_time)}`}
    </span>
  )
}

/* Fuera del modo «Tareas»: si el lead tiene algo agendado o no. Con tarea, cuándo vence la
   próxima (el mismo rótulo de VenceTarea); sin tarea, dicho en ámbar, que es el lead que se
   queda sin seguimiento. */
function TareaAgendada({ proxima, hoy }: { proxima: ProximaTarea | undefined; hoy: string }) {
  if (!proxima) {
    return <span className="whitespace-nowrap text-[12.5px] font-medium text-(--warning-fg)">Sin tarea</span>
  }
  const mas = proxima.pendientes - 1
  return (
    <span className="inline-flex items-center gap-1" title={`${proxima.tarea.title}${mas > 0 ? ` (+${mas} más)` : ''}`}>
      <Icon icon={ListTodo} size="xs" className="text-(--fg-muted)" />
      <VenceTarea proxima={proxima} hoy={hoy} />
    </span>
  )
}

// Los portales (popovers, menús) burbujean por el árbol de React aunque su DOM viva afuera: sin
// este corte, un clic adentro del menú de acciones abriría el lead. Y la casilla de selección
// vive adentro de un `data-row-actions`: su clic lo atiende ella, no el renglón (si no, marcaría
// y desmarcaría en el mismo clic).
function clicDelRenglon(e: React.MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement
  return e.currentTarget.contains(target) && !target.closest('[data-row-actions]')
}

function LeadRow({ lead, etapa, responsable, esMio, onAbrir, acciones, seleccion, proxima, hoy, modoTareas }: RenglonProps) {
  return (
    <tr
      data-lead-id={lead.id}
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
          </div>
        </div>
      </td>
      {modoTareas ? (
        <>
          <td className="px-[18px] py-[11px]"><StageBadge etapa={etapa} /></td>
          <td className="px-[18px] py-[11px]"><TituloTarea proxima={proxima} /></td>
          <td className="px-[18px] py-[11px]"><VenceTarea proxima={proxima} hoy={hoy} /></td>
        </>
      ) : (
        <>
          <td className="px-[18px] py-[11px] text-[12.5px] text-(--fg-2)">
            <div className="truncate">{lead.client?.phone ?? ''}</div>
          </td>
          <td className="px-[18px] py-[11px]"><StageBadge etapa={etapa} /></td>
          {/* La hora exacta queda en el `title`: «Hoy» solo no dice a qué hora. */}
          <td className="whitespace-nowrap px-[18px] py-[11px] text-[12.5px] tabular-nums text-(--fg-muted)"
            title={lead.ultima_actividad_at ? fmtShortDate(lead.ultima_actividad_at) : undefined}>
            {fmtUltimaActividad(lead.ultima_actividad_at)}
          </td>
          <td className="px-[18px] py-[11px]"><TareaAgendada proxima={proxima} hoy={hoy} /></td>
        </>
      )}
      <td className="px-2 py-[11px] text-right" data-row-actions>{acciones}</td>
    </tr>
  )
}

/** El mismo renglón en el teléfono: empresa arriba, etapa abajo (con «Tareas», además
 *  la próxima tarea y cuándo vence). */
function LeadCard({ lead, etapa, responsable, esMio, onAbrir, acciones, seleccion, proxima, hoy, modoTareas }: RenglonProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-lead-id={lead.id}
      onClick={e => {
        if (!clicDelRenglon(e)) return
        if (seleccion) seleccion.onToggle()
        else onAbrir(lead.id)
      }}
      // Solo el Enter de la tarjeta misma: el de un botón interno (el menú de acciones) burbujea hasta acá.
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
          {modoTareas
            ? <TituloTarea proxima={proxima} />
            : <div className="truncate text-[12.5px] text-(--fg-muted)">{lead.client?.phone ?? ''}</div>}
        </div>
        <span data-row-actions>{acciones}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge etapa={etapa} />
        {modoTareas ? <VenceTarea proxima={proxima} hoy={hoy} /> : <TareaAgendada proxima={proxima} hoy={hoy} />}
      </div>
    </div>
  )
}

/* Las columnas de alta y lead no llevan título: ese lugar lo ocupa el buscador (BUSCADOR, con
   colSpan 2), que es justamente por nombre y teléfono. */
const BUSCADOR = 'buscador'
const HEADERS = ['', BUSCADOR, 'Teléfono', 'Estado', 'Última actividad', 'Tarea', '']
const HEADERS_TAREAS = ['', BUSCADOR, 'Estado', 'Tarea pendiente', 'Vence', '']

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
  // Desde dónde siguen las flechas: el último lead que se tocó en el modo selección.
  const [cursor, setCursor] = useState<string | null>(null)
  const empezarSeleccion = (leadId: string) => { setSeleccionando(true); setMarcados(new Set([leadId])); setCursor(leadId) }
  const salirDeSeleccion = () => { setSeleccionando(false); setMarcados(new Set()); setCursor(null) }
  const alternarMarcado = (leadId: string) => {
    setCursor(leadId)
    setMarcados(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }

  const filtros = useMemo(() => filtrosDesdeUrl(searchParams), [searchParams])
  const vista = vistaDesdeUrl(searchParams)
  const enColumnas = vista === 'columnas'
  const hoy = localTodayIso()
  const tareas = tareasQ.data ?? SIN_TAREAS
  const overdueLeadIds = useMemo(() => idsConTareasVencidas(tareas, hoy), [tareas, hoy])
  const proximas = useMemo(() => proximaTareaPorLead(tareas), [tareas])
  const leadIdsConTareas = useMemo(() => new Set(proximas.keys()), [proximas])
  // Un solo «ahora» por pintada (ver LeadFilterContext). `dataUpdatedAt` va en las dependencias a
  // propósito: cada vez que llegan datos nuevos (realtime, mutación) se toma un «ahora» nuevo, así
  // un descartado que llega a su fecha de recontactar con la pantalla abierta aparece en el
  // próximo refresco.
  // Los de «Objetivos semanales»: la misma consulta que el contador de arriba, sale de la caché.
  const objetivosQ = useObjetivos(startOfWeekIso(hoy), filtros.objetivo !== null)
  const leadsDelObjetivo = filtros.objetivo ? objetivosQ.data?.leads[filtros.objetivo] : undefined
  const ctx = useMemo<LeadFilterContext>(
    () => ({ overdueLeadIds, leadIdsConTareas, etapas: cat.etapasPorId, now: Date.now(), leadsDelObjetivo }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overdueLeadIds, leadIdsConTareas, cat.etapasPorId, leadsQ.dataUpdatedAt, leadsDelObjetivo],
  )

  const deCarteras = useMemo(
    () => leadsDeCarteras(leadsQ.data ?? SIN_LEADS, carteras ?? SIN_IDS), [leadsQ.data, carteras])
  // «Ordenar por estado» (el chip o la cabecera «Estado» de la tabla) ordena por etapa con o sin
  // «Tareas»; sin él, con «Tareas» la lista va por la próxima tarea (lo vencido arriba). Las flechas
  // del dialog recorren `visibles`, así que siguen este orden solas.
  const visibles = useMemo(() => {
    const filtrados = filterLeads(deCarteras, filtros, ctx)
    if (filtros.ordenPorEstado) return ordenarPorEstado(filtrados, proximas, l => etapaDelLead(l, cat.etapasPorId))
    return filtros.conTareas ? ordenarPorProximaTarea(filtrados, proximas) : filtrados
  }, [deCarteras, filtros, ctx, proximas, cat.etapasPorId])
  const headers = filtros.conTareas ? HEADERS_TAREAS : HEADERS
  // En columnas, las etapas elegidas en «Estado» dicen qué columnas se ven (agruparPorEtapa).
  const columnas = useMemo(
    () => (enColumnas ? agruparPorEtapa(visibles, cat.etapasPorId, filtros.stageFilter) : []),
    [enColumnas, visibles, cat.etapasPorId, filtros.stageFilter])
  // Las flechas del dialog recorren los leads en el orden en que se ven: en columnas, columna por
  // columna de izquierda a derecha.
  const recorrido = useMemo(() => (enColumnas ? columnas.flatMap(c => c.leads) : visibles), [enColumnas, columnas, visibles])
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
  const cambiarVista = (v: VistaCrm) =>
    setSearchParams(prev => escribirVista(prev, v), { replace: true })

  const usuariosPorId = useMemo(() => new Map(agentes.usuarios.map(u => [u.id, u])), [agentes.usuarios])
  const variasCarteras = (carteras?.length ?? 0) > 1

  const propsDe = (lead: CrmLeadRow): RenglonProps => ({
    lead,
    etapa: etapaDelLead(lead, cat.etapasPorId),
    responsable: usuariosPorId.get(lead.assigned_to),
    esMio: variasCarteras ? lead.assigned_to === agentes.myId : null,
    onAbrir: abrirLead,
    acciones: <LeadRowActions lead={lead} puedeEscribir={agentes.puedeEscribir(lead.assigned_to)} onStartReassign={empezarSeleccion} />,
    // Solo se puede marcar lo que se puede mover: un lead de una cartera de solo lectura sigue
    // abriéndose con el clic, como fuera del modo selección.
    seleccion: seleccionando && agentes.puedeEscribir(lead.assigned_to)
      ? { marcado: marcados.has(lead.id), onToggle: () => alternarMarcado(lead.id) }
      : undefined,
    proxima: proximas.get(lead.id),
    hoy,
    modoTareas: filtros.conTareas,
  })
  const fichaDe = (lead: CrmLeadRow): FichaProps => {
    const { etapa: _etapa, proxima: _proxima, hoy: _hoy, modoTareas: _modo, ...resto } = propsDe(lead)
    return { ...resto, pendientes: proximas.get(lead.id)?.pendientes ?? 0, conVencidas: overdueLeadIds.has(lead.id) }
  }

  // El lead abierto sale de TODOS los leads y no de los visibles: un enlace a `?lead=` tiene que
  // abrirlo aunque los filtros lo escondan. Las flechas recorren la lista tal como se ve.
  const leadAbiertoId = searchParams.get(LEAD_PARAM)
  const leadAbierto = leadAbiertoId ? (leadsQ.data ?? []).find(l => l.id === leadAbiertoId) ?? null : null
  // Dónde estaba el abierto: si se descarta y se va de la lista, las flechas siguen desde ahí.
  const ultimaPosicion = useRef<UltimaPosicion | null>(null)
  const vecinos = vecinosEnRecorrido(recorrido.map(l => l.id), leadAbierto?.id ?? null, ultimaPosicion.current)
  if (leadAbierto && vecinos.indice !== -1) ultimaPosicion.current = { id: leadAbierto.id, indice: vecinos.indice }
  const indiceAbierto = vecinos.indice
  const pasoLead = (delta: -1 | 1) => {
    const destino = delta < 0 ? vecinos.anterior : vecinos.siguiente
    if (destino) abrirLead(destino)
  }

  // ↓ / ↑ en modo selección marcan el lead de abajo / de arriba del último tocado, para marcar de
  // a muchos sin un clic por renglón. Solo agregan: desmarcar sigue siendo con el clic. Afuera de
  // un campo de texto (el buscador) y con ningún dialog abierto encima.
  useEffect(() => {
    if (!seleccionando || aReasignar || leadAbierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]')) return
      const ids = recorrido.map(l => l.id)
      const marcable = (id: string) => {
        const lead = recorrido.find(l => l.id === id)
        return !!lead && agentes.puedeEscribir(lead.assigned_to)
      }
      const vecino = vecinoMarcable(ids, cursor, e.key === 'ArrowDown' ? 1 : -1, marcable)
      e.preventDefault()
      if (!vecino) return
      setCursor(vecino)
      setMarcados(prev => new Set(prev).add(vecino))
      document.querySelector(`[data-lead-id="${vecino}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [seleccionando, aReasignar, leadAbierto, recorrido, cursor, agentes])

  const candidatos = (ids: string[]): ReassignCandidate[] => (leadsQ.data ?? [])
    .filter(l => ids.includes(l.id))
    .map(l => ({ id: l.id, clientId: l.client_id, clientName: nombreDelLead(l.client), assignedTo: l.assigned_to }))

  // Sin valores vacíos: un `false` o '' colado dejaría «Ningún lead con  y Estado.».
  const etiquetasFiltros = [
    filtros.q.trim() && 'Búsqueda',
    filtros.stageFilter.size > 0 && 'Estado',
    filtros.overdueOnly && 'Tareas vencidas',
    filtros.conTareas && 'Tareas',
    filtros.sinTareas && 'Sin tareas',
    filtros.objetivo && 'el objetivo elegido',
  ].filter((v): v is string => typeof v === 'string' && !!v)

  const sinResultados = (
    <div className="px-4 py-12 text-center">
      <p className="text-[15px] font-semibold text-foreground">
        Ningún lead con {formatFilterList(etiquetasFiltros) || 'estos filtros'}.
      </p>
      <Button variant="outline" className="mt-3" onClick={limpiarFiltros}>Limpiar filtros</Button>
    </div>
  )

  return (
    <>
      <FiltrosCrm
        filtros={filtros}
        contadores={contadores}
        etapas={cat.etapasActivas}
        conBuscador={isMobile || enColumnas}
        vista={vista}
        onVista={cambiarVista}
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

      {estado === 'sin-resultados' && (isMobile || enColumnas) && sinResultados}

      {estado === 'ok' && enColumnas && <ColumnasCrm columnas={columnas} fichaDe={fichaDe} />}

      {estado === 'ok' && isMobile && !enColumnas && (
        <div className="flex flex-col">
          {visibles.map(lead => <LeadCard key={lead.id} {...propsDe(lead)} />)}
        </div>
      )}

      {/* Sin resultados la tabla se queda: el buscador vive en su cabecera, y si se fuera con
          ella el campo desaparecería en medio del tipeo. */}
      {(estado === 'ok' || estado === 'sin-resultados') && !isMobile && !enColumnas && (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  colSpan={h === BUSCADOR ? 2 : undefined}
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap bg-(--surface-2) px-[18px] py-[7px] text-left text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-2)',
                    'shadow-[inset_0_-1px_0_var(--line-strong)]',
                    i === 0 && 'w-[28px] px-0',
                    h === BUSCADOR && 'py-[5px]',
                  )}
                >
                  {h === BUSCADOR ? (
                    <BuscadorLeads q={filtros.q} onCambiar={cambiarFiltros} className="w-full max-w-[340px]" />
                  ) : i === headers.length - 1 ? (
                    <span className="block text-right tabular-nums">{visibles.length} lead{visibles.length === 1 ? '' : 's'}</span>
                  ) : h === 'Estado' ? (
                    // El mismo `ordenPorEstado` que el chip de los filtros: dos puertas, un solo dato.
                    <button
                      type="button"
                      aria-pressed={filtros.ordenPorEstado}
                      title={filtros.ordenPorEstado ? 'Quitar el orden por estado' : 'Lo más avanzado del funnel arriba; descartados al final'}
                      onClick={() => cambiarFiltros({ ordenPorEstado: !filtros.ordenPorEstado })}
                      className={cn(
                        'inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-foreground',
                        filtros.ordenPorEstado && 'text-foreground',
                      )}
                    >
                      Estado
                      <Icon icon={ArrowDownWideNarrow} size="xs" className={cn(!filtros.ordenPorEstado && 'opacity-40')} />
                    </button>
                  ) : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estado === 'ok'
              ? visibles.map(lead => <LeadRow key={lead.id} {...propsDe(lead)} />)
              : <tr><td colSpan={headers.length + 1 /* el buscador ocupa dos */}>{sinResultados}</td></tr>}
          </tbody>
        </table>
      )}

      <LeadDialog
        lead={leadAbierto}
        indice={indiceAbierto}
        total={recorrido.length}
        hayAnterior={vecinos.anterior !== null}
        haySiguiente={vecinos.siguiente !== null}
        onPaso={pasoLead}
        onCerrar={() => abrirLead(null)}
        onStartReassign={leadId => setAReasignar([leadId])}
      />

      {seleccionando && (
        <BulkActionBar
          selectedCount={marcadosVisibles.length}
          totalCount={recorrido.length}
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
