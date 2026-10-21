import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Menu, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getWeekRange, toLocalYmd } from '@/lib/time'
import { useIsMobile } from '@/hooks/use-mobile'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { cn } from '@/lib/utils'
import { MeetingFormPopover } from './components/meetings/MeetingFormPopover'
import type { EditableMeeting } from './components/meetings/MeetingFormContent'
import { useMeetingsInRange } from './hooks/useMeetings'
import { useGoogleAgenda } from './hooks/useCalendarConnection'
import { buildAgendaEvents, groupEventsByDay, type AgendaEvent } from './lib/agendaEvents'
import type { MeetingStatus } from './lib/meetings.types'
import { WeekGrid } from './components/WeekGrid'
import { AgendaSidePanel } from './components/AgendaSidePanel'

/* NUEVO (21/10/2026, por pedido): la Agenda de `propelia-frontend`, copiada igual. Lo que en el
   producto son visitas acá son las reuniones del CRM (`crm_meetings`, las demos incluidas): las
   tuyas, junto con el resto de tu Google Calendar (solo lectura). Click en la grilla agenda una
   reunión; click en una reunión la edita. Las dos van solas a tu Google (`calendar-sync`). La
   cabecera es la `PageHeader` del producto escrita acá: este repo no tiene una. */

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })
const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' })

const weekTitle = (start: Date, end: Date): string => {
  if (start.getMonth() === end.getMonth()) return MONTH_LABEL.format(start)
  return `${MONTH_SHORT.format(start)} – ${MONTH_LABEL.format(end)}`
}

function Encabezado({ title, titleActions, children }: { title: ReactNode; titleActions: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-card border-b border-border px-5 py-3.5 shadow-sm max-md:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="min-w-0 text-xl leading-tight font-semibold text-foreground tracking-[-0.015em]">{title}</h1>
        <div className="flex items-center gap-2">{titleActions}</div>
      </div>
      {children}
    </div>
  )
}

export function Agenda() {
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()
  // `null` = el usuario todavía no lo tocó: abierto en escritorio, cerrado en el teléfono
  // (ahí le comía 256px a una grilla de 7 días y empujaba la página de costado).
  const [panelOpenChoice, setPanelOpenChoice] = useState<boolean | null>(null)
  const panelOpen = panelOpenChoice ?? !isMobile
  const [showMeetings, setShowMeetings] = useState(true)
  const [showGoogleEvents, setShowGoogleEvents] = useState(true)
  const [gridCreate, setGridCreate] = useState<{
    key: number
    ymd?: string
    startTime?: string
    endTime?: string
    x: number
    y: number
  } | null>(null)
  const gridCreateCounter = useRef(0)
  const [editTarget, setEditTarget] = useState<{ key: number; meeting: EditableMeeting; x: number; y: number } | null>(null)
  const editCounter = useRef(0)

  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)

  // La semana visible vive en el search param `date` (no en state local): así se puede
  // llegar directo a una reunión con un link tipo /agenda?date=2026-10-15.
  const referenceDate = useMemo(() => {
    const dateParam = searchParams.get('date')
    return dateParam ? new Date(`${dateParam}T12:00:00`) : new Date()
  }, [searchParams])

  const goToDate = (date: Date) => {
    const next = new URLSearchParams(searchParams)
    next.set('date', toLocalYmd(date))
    setSearchParams(next, { replace: true })
  }

  // Contexto de "vengo a agendar esto de este lead" (el «Agendar demo» del lead, ver
  // `enlaceParaAgendarDemo`): mientras esté presente, cualquier creación (click en el grid o el
  // botón +) queda atada a ese lead con el mismo título/descripción/responsable/invitados.
  const schedulingContext = useMemo(() => {
    const leadId = searchParams.get('leadId')
    if (!leadId) return null
    const guest = searchParams.get('guest')
    return {
      leadId,
      assignedTo: searchParams.get('assignedTo') ?? undefined,
      title: searchParams.get('title') ?? undefined,
      description: searchParams.get('description') ?? undefined,
      guests: guest ? [{ label: guest }] : undefined,
      guestEmails: searchParams.getAll('guestEmail'),
    }
  }, [searchParams])

  const clearSchedulingContext = () => {
    const next = new URLSearchParams(searchParams)
    for (const key of ['leadId', 'assignedTo', 'title', 'description', 'guest', 'guestEmail']) next.delete(key)
    setSearchParams(next, { replace: true })
  }

  // El título/descripción que el usuario edita en el popover se reflejan en la URL — así el
  // contexto de agendamiento sobrevive a cerrar y volver a abrir el popover sin guardar.
  // Se limpia solo con la X del banner (clearSchedulingContext) o al agendar con éxito
  // (MeetingFormPopover.onSaved, más abajo) — nunca por cancelar/cerrar sin guardar.
  const setSchedulingParam = (key: 'title' | 'description', value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  const { start, end } = useMemo(() => getWeekRange(referenceDate), [referenceDate])
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toLocalYmd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))),
    [start],
  )
  const isCurrentWeek = days.includes(toLocalYmd(new Date()))
  const selectedYmd = toLocalYmd(referenceDate)

  const { data: meetings = [] } = useMeetingsInRange(start.toISOString(), end.toISOString())
  const { data: googleEvents = [] } = useGoogleAgenda(start.toISOString(), end.toISOString(), true)

  const events = useMemo(
    () =>
      buildAgendaEvents(
        showMeetings ? meetings.map(m => ({ ...m, status: m.status as MeetingStatus })) : [],
        showGoogleEvents ? googleEvents : [],
      ),
    [meetings, googleEvents, showMeetings, showGoogleEvents],
  )
  const eventsByDay = useMemo(() => groupEventsByDay(events, days), [events, days])

  const shiftWeek = (deltaDays: number) =>
    goToDate(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + deltaDays))

  // Solo las reuniones del CRM son editables (los eventos de Google ya vienen filtrados por
  // AgendaEventBlock, que no llama a esto para source==='google'). Buscamos la fila completa en
  // `meetings` porque AgendaEvent no carga ics_sequence/description (no los necesita para
  // mostrarse en el grid, pero sí hacen falta para editar).
  const handleEditMeeting = (event: AgendaEvent, clientX: number, clientY: number) => {
    const full = meetings.find(m => m.id === event.id)
    if (!full) return
    editCounter.current += 1
    setEditTarget({
      key: editCounter.current,
      meeting: {
        id: full.id,
        ics_sequence: full.ics_sequence,
        starts_at: full.starts_at,
        ends_at: full.ends_at,
        title: full.title,
        description: full.description,
        color_id: full.color_id,
        reminder_minutes: full.reminder_minutes,
        status: full.status,
        sync_status: full.sync_status,
        guest_user_ids: full.guest_user_ids,
        guest_emails: full.guest_emails,
        lead_id: full.lead_id,
      },
      x: clientX,
      y: clientY,
    })
  }

  return (
    <div className="ui-scale ui-screen-h flex flex-col">
      {/* En el teléfono "Agenda" + botones + mes no entraban en una línea y forzaban scroll
          lateral: el mes pasa a ser el título, "Hoy" se achica y lo de la derecha se oculta
          (el selector Week está deshabilitado y el avatar no aporta). */}
      <Encabezado
        title={isMobile ? <span className="capitalize">{weekTitle(start, end)}</span> : 'Agenda'}
        titleActions={
          <>
            <Button
              size="sm"
              variant="outline"
              className={cn(isMobile ? 'px-3' : 'w-28')}
              onClick={() => goToDate(new Date())}
            >
              {isCurrentWeek || isMobile ? 'Hoy' : 'Ir a hoy'}
            </Button>
            <div className="flex items-center gap-1 max-md:gap-0">
              <Button size="icon" variant="ghost" onClick={() => shiftWeek(-7)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => shiftWeek(7)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            {!isMobile && <span className="text-lg font-semibold capitalize">{weekTitle(start, end)}</span>}
          </>
        }
      >
        <div className="flex items-center gap-1 max-md:hidden">
          <Button size="sm" variant="outline" className="gap-1" disabled>
            Week
            <ChevronDown className="size-3.5" />
          </Button>
          <div
            className="ml-1 w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
            style={{ backgroundColor: yo?.color ?? 'var(--primary)' }}
          >
            {yo?.iniciales ?? '…'}
          </div>
        </div>
      </Encabezado>

      {schedulingContext && (
        <div className="flex items-center justify-between gap-3 bg-primary/10 border-b border-primary/20 px-4 py-2 text-sm">
          <span className="min-w-0">
            Agendando: <strong>{schedulingContext.title}</strong> —{' '}
            {isMobile ? 'tocá un horario.' : 'hacé click en la grilla para elegir el horario.'}
          </span>
          <Button size="icon" variant="ghost" onClick={clearSchedulingContext}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* En el teléfono la grilla baja (pt-12) para que los botones flotantes no tapen el
          lunes, y el panel se superpone en vez de empujar la grilla fuera de la pantalla. */}
      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden bg-card">
        <div className="absolute top-3 left-[27px] max-md:top-1.5 max-md:left-2 z-20 flex items-center gap-1 bg-card rounded-lg p-1 shadow-sm">
          <Button size="icon" variant="ghost" onClick={() => setPanelOpenChoice(!panelOpen)}>
            <Menu className="size-4" />
          </Button>
          <Button
            size="icon"
            onClick={(e) => {
              gridCreateCounter.current += 1
              setGridCreate({ key: gridCreateCounter.current, x: e.clientX, y: e.clientY })
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <AgendaSidePanel
          open={panelOpen}
          className={cn(
            'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-10 max-md:bg-card',
            panelOpen && 'max-md:shadow-lg',
          )}
          selectedYmd={selectedYmd}
          onSelectDay={ymd => {
            goToDate(new Date(`${ymd}T12:00:00`))
            if (isMobile) setPanelOpenChoice(false)
          }}
          showMeetings={showMeetings}
          onToggleMeetings={setShowMeetings}
          showGoogleEvents={showGoogleEvents}
          onToggleGoogleEvents={setShowGoogleEvents}
        />
        <div className="flex flex-col flex-1 min-h-0 min-w-0 p-4 max-md:p-2 max-md:pt-12">
          <WeekGrid
            compact={isMobile}
            days={days}
            eventsByDay={eventsByDay}
            selectedYmd={selectedYmd}
            onCreateAt={({ ymd, startTime, endTime, clientX, clientY }) => {
              gridCreateCounter.current += 1
              setGridCreate({ key: gridCreateCounter.current, ymd, startTime, endTime, x: clientX, y: clientY })
            }}
            onEditMeeting={handleEditMeeting}
          />
        </div>
      </div>

      <MeetingFormPopover
        key={gridCreate?.key ?? 'grid-create-popover'}
        open={gridCreate != null}
        onOpenChange={(open) => {
          if (open) return
          setGridCreate(null)
        }}
        anchorPoint={gridCreate ? { x: gridCreate.x, y: gridCreate.y } : { x: 0, y: 0 }}
        defaultDate={gridCreate?.ymd}
        defaultStartTime={gridCreate?.startTime}
        defaultEndTime={gridCreate?.endTime}
        leadId={schedulingContext?.leadId}
        assignedTo={schedulingContext?.assignedTo}
        defaultGuestEmails={schedulingContext?.guestEmails}
        defaultTitle={schedulingContext?.title}
        defaultDescription={schedulingContext?.description}
        guests={schedulingContext?.guests}
        onTitleChange={title => setSchedulingParam('title', title)}
        onDescriptionChange={description => setSchedulingParam('description', description)}
        onSaved={() => { if (schedulingContext) clearSchedulingContext() }}
      />

      <MeetingFormPopover
        key={`edit-${editTarget?.key ?? 'none'}`}
        open={editTarget != null}
        onOpenChange={(open) => { if (!open) setEditTarget(null) }}
        anchorPoint={editTarget ? { x: editTarget.x, y: editTarget.y } : { x: 0, y: 0 }}
        meeting={editTarget?.meeting}
      />
    </div>
  )
}
