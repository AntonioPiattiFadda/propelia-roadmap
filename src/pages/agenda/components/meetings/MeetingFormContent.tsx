import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlignLeft, Bell, CalendarDays, Check, Clock, Mail, TriangleAlert, Users } from 'lucide-react'
import { es } from 'react-day-picker/locale'
import { DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeSelect } from '@/components/ui/time-select'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { cn } from '@/lib/utils'
import { RegistroDeDemoPanel } from '@/pages/crm/components/RegistroDeDemoPanel'
import { useRegistroDeDemo } from '@/pages/crm/hooks/useRegistroDeDemo'
import { TEXTO_DE_DEMO } from '@/pages/crm/lib/actividad'
import type { DemoAgendada } from '@/pages/crm/lib/avisoDeDemo'
import { nombreDelLead, type CampoDecisor } from '@/pages/crm/lib/clientData'
import { esEmailValido, esInvitadoFijo, type RegistroInicialDeDemo } from '@/pages/crm/lib/reuniones'
import { useCreateMeeting, useFreeBusy, useUpdateMeeting } from '../../hooks/useMeetings'
import { useGoogleConnection } from '../../hooks/useCalendarConnection'
import { ZONA_ESPANA } from '@/pages/crm/lib/alarmas'
import { formatBusyRanges } from '../../lib/busyRanges'
import { horaEnTuZona, instanteDelFormulario } from '../../lib/horaDeEspana'
import { finConLaMismaDuracion, horarioDelSlot } from '../../lib/selectorDeHorario'
import { GOOGLE_EVENT_COLORS } from '../../lib/googleEventColors'
import type { Meeting } from '../../lib/meetings.types'
import { HoraDeEspana } from '../BanderaEspana'
import { SelectorDeHorario } from '../SelectorDeHorario'
import { CancelMeetingDialog } from './CancelMeetingDialog'
import { MeetingGuestsField } from './MeetingGuestsField'

// Si no hay un último color guardado (primera vez usando el picker), preseleccionamos el
// primero de la paleta en vez de dejar "sin color" — siempre queda algo elegido.
const DEFAULT_COLOR_ID = Object.keys(GOOGLE_EVENT_COLORS)[0] ?? null

const REMINDER_OPTIONS = [
  { value: 'none', label: 'Ninguno', minutes: null as number | null },
  { value: '10', label: '10 minutos antes', minutes: 10 },
  { value: '30', label: '30 minutos antes', minutes: 30 },
  { value: '60', label: '1 hora antes', minutes: 60 },
  { value: '1440', label: '1 día antes', minutes: 1440 },
]

/** Reunión existente a editar — si se pasa, el form arranca precargado y guarda con update en vez de crear. */
export type EditableMeeting = {
  id: string
  ics_sequence: number
  starts_at: string
  ends_at: string
  title: string | null
  description: string | null
  color_id: string | null
  reminder_minutes: number | null
  status: Meeting['status']
  sync_status: Meeting['sync_status']
  guest_user_ids: string[]
  guest_emails: string[]
  lead_id: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  leadId?: string
  /** De quién es la reunión que se crea (por defecto, de quien la agenda). */
  assignedTo?: string
  defaultTitle?: string
  defaultDescription?: string
  /** Fecha/horario a precargar al crear (ej. celda clickeada en el grid de /agenda). Ignorado si `meeting` está seteado. */
  defaultDate?: string
  defaultStartTime?: string
  defaultEndTime?: string
  guests?: { label: string }[]
  /** Invitados por email ya cargados al crear (la demo: la inmobiliaria y Lorenzo). Ignorado si `meeting` está seteado. */
  defaultGuestEmails?: string[]
  meeting?: EditableMeeting
  /** Se agenda una demo de `leadId` (22/10/2026; desde el 23/10/2026 desde el CRM): va el «Email del cliente» arriba de los invitados
   *  y, en una columna a la izquierda, el registro de actividad del lead (`useRegistroDeDemo`). Solo al crear. */
  demo?: boolean
  /** Con `demo`: doble clic en una persona de «Quién asiste» abre su ficha del perfil, como en la llamada. */
  onAbrirContacto?: (campo: CampoDecisor) => void
  /** Con `demo`: lo que ya se venía escribiendo en otra actividad del lead, para que no se pierda. */
  registroInicial?: RegistroInicialDeDemo
  /** Recordatorio con el que nace (minutos antes; tiene que ser una de las opciones). Por defecto, ninguno. */
  defaultReminderMinutes?: number | null
  /** Notifican cada edición de título/descripción — usado por MeetingFormPopover para reflejarlas en la URL
   * (así el contexto de "agendando reunión para X" sobrevive a cerrar y volver a abrir el popover). */
  onTitleChange?: (title: string) => void
  onDescriptionChange?: (description: string) => void
  /** Se dispara SOLO cuando la reunión se guardó con éxito (no al cancelar) — MeetingFormPopover
   * lo usa para recién ahí limpiar el contexto de agendamiento de la URL. */
  onSaved?: () => void
  /** Con `demo`, al guardarse: lo que el aviso por WhatsApp cuenta de ella (`DemoAgendadaDialog`).
   *  El responsable lo pone quien llama, que tiene los nombres del equipo. */
  onDemoAgendada?: (demo: Omit<DemoAgendada, 'responsable'>) => void
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Reversa new Date(`${date}T${time}`) tal como lo interpreta el browser (hora local),
// para poder precargar el form al editar una reunión ya guardada.
const toLocalDateTimeParts = (iso: string): { date: string; time: string } => {
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  }
}

const dateToInputValue = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

// "Jueves, 30 de julio" — mismo formato del encabezado de fecha/hora colapsado de Google Calendar.
const formatDateHeading = (isoDate: string): string => {
  const d = new Date(`${isoDate}T00:00:00`)
  const formatted = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

// Contenido del form de reunión: `VisitFormContent` de `propelia-frontend` (21/10/2026). Lo usan
// MeetingFormPopover (anclado a un punto, el click-to-create del grid de /agenda) y, con `demo`, la
// ventana de «Registrar actividad» del lead (23/10/2026).
export function MeetingFormContent({
  open,
  onClose,
  leadId,
  assignedTo,
  defaultTitle,
  defaultDescription,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  guests = [],
  defaultGuestEmails = [],
  meeting,
  demo: demoPedida = false,
  registroInicial,
  onAbrirContacto,
  defaultReminderMinutes = null,
  onTitleChange,
  onDescriptionChange,
  onSaved,
  onDemoAgendada,
}: Props) {
  const isEditing = meeting != null
  const demo = demoPedida && !isEditing && !!leadId
  const registro = useRegistroDeDemo(demo ? leadId : undefined, open, registroInicial)
  /* El «Email del cliente» es el invitado de la inmobiliaria: cambiarlo cambia ese invitado (y uno
     inválido o vacío lo saca). Arranca con el que trajo el enlace: el que no es el invitado fijo. */
  const [clientEmail, setClientEmail] = useState('')
  const clientEmailValido = esEmailValido(clientEmail)
  const createMutation = useCreateMeeting()
  const updateMutation = useUpdateMeeting()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [description, setDescription] = useState('')
  const [colorId, setColorId] = useState<string | null>(null)
  const [reminderValue, setReminderValue] = useState('none')
  const [showErrors, setShowErrors] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  // «Seleccionar día y hora» (23/10/2026, por pedido): la semana de la Agenda, encima de todo.
  const [eligiendoHorario, setEligiendoHorario] = useState(false)
  const [guestUserIds, setGuestUserIds] = useState<string[]>([])
  const [guestEmails, setGuestEmails] = useState<string[]>([])
  const { userSession } = useUserSession()
  const { data: currentUser } = useYo(userSession?.user.id)
  const { data: connection, isPending: connectionPending } = useGoogleConnection()
  const isGoogleConnected = connection?.status === 'active'
  // La demo va en hora de España (26/10/2026, por pedido): las 10:00 elegidas son las de Madrid.
  const enEspana = demo
  const { data: busy = [] } = useFreeBusy(date, isGoogleConnected, enEspana)
  const horaLocal = enEspana && date && time ? horaEnTuZona(instanteDelFormulario(date, time, true), date) : null
  const agentName = currentUser
    ? [currentUser.nombre, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email || null
    : null

  // Draft-state reset pattern: useState inicia vacío, useEffect resetea cuando se abre el dialog/popover.
  // Necesario para evitar mantener valores previos entre aperturas. La cola de effects sincroniza
  // el UI con la apertura del contenedor (fuente externa de verdad).
  // Dependency array is intentionally narrow [open] to avoid re-running when defaultTitle/defaultDescription
  // change due to async data loading (e.g., useCurrentUser resolving) — this would wipe out user input.
  // The effect reads defaultTitle/defaultDescription/meeting vía closure en cada corrida, así toma sus
  // valores más recientes al abrir, pero no resetea el form si cambian con el dialog ya abierto.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowErrors(false)
      if (meeting) {
        const { date: d, time: t } = toLocalDateTimeParts(meeting.starts_at)
        const { time: endT } = toLocalDateTimeParts(meeting.ends_at)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTitle(meeting.title ?? '')
        setDate(d)
        setTime(t)
        setEndTime(endT)
        setDescription(meeting.description ?? '')
        setColorId(meeting.color_id ?? DEFAULT_COLOR_ID)
        setReminderValue(REMINDER_OPTIONS.find(o => o.minutes === meeting.reminder_minutes)?.value ?? 'none')
        setGuestUserIds(meeting.guest_user_ids)
        setGuestEmails(meeting.guest_emails)
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTitle(defaultTitle ?? '')
        setDate(defaultDate ?? '')
        setTime(defaultStartTime ?? '')
        setEndTime(defaultEndTime ?? '')
        setDescription(defaultDescription ?? '')
        setColorId(currentUser?.last_meeting_color_id ?? DEFAULT_COLOR_ID)
        setReminderValue(REMINDER_OPTIONS.find(o => o.minutes === defaultReminderMinutes)?.value ?? 'none')
        setGuestUserIds([])
        setGuestEmails(defaultGuestEmails)
        setClientEmail(defaultGuestEmails.find(e => !esInvitadoFijo(e)) ?? '')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Sólo reuniones agendadas a futuro. Cancelar una que ya pasó le manda a los invitados una
  // cancelación con fecha de ayer y borra el evento de Google.
  const canCancel = isEditing && meeting.status === 'scheduled' && new Date(meeting.starts_at) > new Date()

  const isInvalid = date === '' || time === '' || endTime === '' || endTime <= time
  const isSaving = createMutation.isPending || updateMutation.isPending

  // Al mover el "desde", el "hasta" lo sigue preservando la misma duración —
  // si todavía no había un rango cargado, arranca en 60 min por defecto.
  const handleStartTimeChange = (newStart: string) => {
    setTime(newStart)
    setEndTime(finConLaMismaDuracion(newStart, { time, endTime }))
  }

  const handleClientEmailChange = (value: string) => {
    const antes = clientEmail.trim().toLowerCase()
    const ahora = value.trim().toLowerCase()
    setClientEmail(value)
    setGuestEmails(prev => {
      const sinEl = prev.filter(e => e !== antes)
      return esEmailValido(ahora) && !sinEl.includes(ahora) ? [ahora, ...sinEl] : sinEl
    })
  }

  const handleSave = () => {
    // El registro se valida siempre, aunque falte el horario: así se marca todo lo que falta de una vez.
    const registroOk = !demo || registro.validar()
    if (isInvalid || (demo && !clientEmailValido) || !registroOk) {
      setShowErrors(true)
      return
    }
    const starts = instanteDelFormulario(date, time, enEspana)
    const ends = instanteDelFormulario(date, endTime, enEspana)
    const reminderMinutes = REMINDER_OPTIONS.find(o => o.value === reminderValue)?.minutes ?? null
    const trimmedTitle = title.trim() === '' ? null : title.trim()
    const trimmedDescription = description.trim() === '' ? null : description.trim()

    if (isEditing) {
      updateMutation.mutate(
        {
          id: meeting.id,
          current: { ics_sequence: meeting.ics_sequence },
          changes: {
            startsAt: starts.toISOString(),
            endsAt: ends.toISOString(),
            title: trimmedTitle,
            description: trimmedDescription,
            colorId,
            reminderMinutes,
            guestUserIds,
            guestEmails,
          },
        },
        {
          onSuccess: () => {
            onSaved?.()
            onClose()
          },
        },
      )
      return
    }

    createMutation.mutate(
      {
        startsAt: starts.toISOString(),
        endsAt: ends.toISOString(),
        leadId: leadId ?? null,
        assignedTo,
        title: trimmedTitle,
        description: trimmedDescription,
        colorId,
        reminderMinutes,
        guestUserIds,
        guestEmails,
      },
      {
        onSuccess: (created) => {
          if (demo) {
            void registro.registrar({ reunionId: created.id, email: clientEmail })
            const elegibles = [...registro.contactos, ...registro.nuevos]
            const texto = registro.texto.trim()
            onDemoAgendada?.({
              inmobiliaria: registro.lead ? nombreDelLead(registro.lead.client) : null,
              ciudad: registro.lead?.client?.city ?? null,
              inicio: starts.toISOString(),
              fin: ends.toISOString(),
              agendadaPor: agentName,
              emailCliente: clientEmail,
              asistentes: registro.con.filter(c => elegibles.includes(c)),
              decisor: registro.pideDecisor ? registro.decisor : '',
              etapa: registro.opcionesEtapa.find(e => e.id === registro.etapa)?.label ?? null,
              notas: texto === TEXTO_DE_DEMO ? '' : texto,
            })
          }
          onSaved?.()
          onClose()
        },
      },
    )
  }

  return (
    <>
      {/* Con la demo, el registro va en su propia columna para que el formulario no sea tan largo.
          Va a la izquierda y la reunión a la derecha (23/10/2026, por pedido): es lo primero que se
          llena, con el orden y el diseño del registro de la llamada. En el teléfono va arriba. */}
      <div className={cn(demo && 'grid gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,360px)]')}>
      {demo && (
        <div className="md:pr-5 md:[border-right:1px_solid_var(--line)] max-md:pb-4 max-md:[border-bottom:1px_solid_var(--line)]">
          <RegistroDeDemoPanel r={registro} onAbrirContacto={onAbrirContacto} />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <Input
          id="meeting-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            onTitleChange?.(e.target.value)
          }}
          placeholder="Agregar título"
          className="h-auto rounded-none border-0 border-b border-input bg-transparent px-0 py-1 text-lg font-normal shadow-none focus-visible:ring-0 focus-visible:border-b-2 focus-visible:border-primary"
        />
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-3">
            <Clock className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-1 flex-nowrap items-center gap-2 max-md:flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-invalid={showErrors && date === ''}
                    className="font-normal"
                  >
                    {date ? formatDateHeading(date) : 'Fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date ? new Date(`${date}T00:00:00`) : undefined}
                    onSelect={(d) => d && setDate(dateToInputValue(d))}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
              <TimeSelect
                value={time}
                onChange={handleStartTimeChange}
                aria-invalid={showErrors && time === ''}
                className="w-auto rounded-full"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <TimeSelect
                value={endTime}
                onChange={setEndTime}
                minTime={time}
                aria-invalid={showErrors && (endTime === '' || endTime <= time)}
                className="w-auto rounded-full"
              />
            </div>
          </div>
          {/* Con la demo el horario también se elige mirando la semana (23/10/2026, por pedido): el
              formulario vive en la ventana de «Registrar actividad» del CRM, lejos de la Agenda. */}
          {demo && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEligiendoHorario(true)}
              className="ml-7 w-fit gap-1.5 font-normal">
              <CalendarDays className="size-4" />
              Seleccionar día y hora
            </Button>
          )}
          {enEspana && (
            <HoraDeEspana className="ml-7 text-xs font-medium text-(--fg-2)">
              {horaLocal && <span className="font-normal text-muted-foreground">{` · ${horaLocal} en tu hora`}</span>}
            </HoraDeEspana>
          )}
          {busy.length > 0 && (
            <p className="ml-7 text-xs text-muted-foreground">
              Ocupado: {formatBusyRanges(busy, enEspana ? ZONA_ESPANA : undefined)}
            </p>
          )}
        </div>
        {demo && (
          <div className="flex items-start gap-3">
            <Mail className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor="meeting-client-email" className="mr-0.5 text-[11.5px] text-(--fg-muted)">Email del cliente</label>
                <Input id="meeting-client-email" type="email" value={clientEmail}
                  onChange={e => handleClientEmailChange(e.target.value)}
                  placeholder="email@inmobiliaria.com"
                  aria-invalid={(showErrors || !!clientEmail.trim()) && !clientEmailValido}
                  title="Le llega la invitación. Si la inmobiliaria no tenía email, se le guarda al agendar."
                  className="h-8 min-w-0 flex-1 text-[13px]" />
              </div>
              {(showErrors || !!clientEmail.trim()) && !clientEmailValido && (
                <span role="alert" className="text-[11.5px] font-semibold text-(--danger)">
                  {clientEmail.trim() ? 'No es un mail válido' : 'Falta el email del cliente'}
                </span>
              )}
            </div>
          </div>
        )}
        {/* Los invitados los invita Google (attendees + sendUpdates): sin calendario conectado
            no hay evento al que sumarlos, así que la fila no se muestra. Los que ya tuviera la
            reunión se conservan igual y se vuelven a mandar tal cual al guardar. */}
        {isGoogleConnected ? (
          <MeetingGuestsField
            userIds={guestUserIds}
            emails={guestEmails}
            onUserIdsChange={setGuestUserIds}
            onEmailsChange={setGuestEmails}
            leadId={meeting?.lead_id ?? leadId}
            meetingId={meeting?.id}
            fixedLabels={guests.map(g => g.label)}
          />
        ) : guests.length > 0 && (
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{guests.map(g => g.label).join(', ')}</p>
          </div>
        )}
        {/* Con la demo la descripción no se muestra (23/10/2026, por pedido: hacía scroll esa columna).
            Se manda igual: es la `defaultDescription` con la que nace (DESCRIPCION_DE_DEMO). */}
        {!demo && <div className="flex items-start gap-3">
          <AlignLeft className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Textarea
            id="meeting-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value)
              onDescriptionChange?.(e.target.value)
            }}
            placeholder="Agregar descripción"
            className="min-h-16 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-1.5 shadow-none transition-colors focus-visible:ring-0 focus-visible:rounded-md focus-visible:bg-muted focus-visible:px-3 focus-visible:py-2"
          />
        </div>}
        {isGoogleConnected && (
          <>
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-1 flex-wrap items-center gap-3">
                {agentName && <span className="text-sm font-medium">{agentName}</span>}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title="Color del evento"
                      className="h-6 w-6 rounded-full border border-input transition-transform hover:scale-110"
                      style={colorId ? { background: GOOGLE_EVENT_COLORS[colorId]?.background } : undefined}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="start">
                    <div className="grid grid-cols-6 gap-2">
                      {Object.entries(GOOGLE_EVENT_COLORS).map(([id, c]) => (
                        <PopoverClose asChild key={id}>
                          <button
                            type="button"
                            title={c.name}
                            onClick={() => setColorId(id)}
                            className="h-5 w-5 rounded-full cursor-pointer transition-transform hover:scale-110"
                            style={{
                              background: c.background,
                              outline: colorId === id ? `2px solid ${c.background}` : 'none',
                              outlineOffset: '2px',
                            }}
                          />
                        </PopoverClose>
                      ))}
                    </div>
                    <PopoverClose asChild>
                      <button
                        type="button"
                        onClick={() => setColorId(currentUser?.last_meeting_color_id ?? DEFAULT_COLOR_ID)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm transition-colors hover:bg-muted/80"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Default
                      </button>
                    </PopoverClose>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Bell className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={reminderValue} onValueChange={setReminderValue}>
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {!connectionPending && connection?.status !== 'active' && (
          <Button asChild className="mb-2 bg-red-500 text-white hover:bg-red-600">
            <Link to="/ajustes?tab=integraciones&highlight=google-calendar">
              <TriangleAlert className="size-4" />
              Sincronizar con Google Calendar
            </Link>
          </Button>
        )}
      </div>
      </div>
      <DialogFooter className="mt-4">
        {canCancel && (
          <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={isSaving}>
            Eliminar evento
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isEditing ? 'Guardar cambios' : 'Agendar'}
        </Button>
      </DialogFooter>
      {eligiendoHorario && (
        // Adentro del formulario (no como hermano), por lo mismo que la confirmación de abajo.
        <SelectorDeHorario
          fecha={date}
          titulo="Elegí día y hora de la demo"
          horaDeEspana={enEspana}
          onElegir={slot => {
            const elegido = horarioDelSlot(slot, { time, endTime })
            setDate(elegido.date)
            setTime(elegido.time)
            setEndTime(elegido.endTime)
          }}
          onCerrar={() => setEligiendoHorario(false)}
        />
      )}
      {canCancel && (
        // Montado ADENTRO del contenido del popover/dialog (no como hermano): Radix decide qué es
        // "click afuera" por el árbol de React, y como hermano un click en la confirmación cerraría
        // el form. z-[260] porque el popover de la agenda está en z-index 250.
        <CancelMeetingDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          meeting={meeting}
          onCancelled={onClose}
          zIndexClassName="z-[260]"
        />
      )}
    </>
  )
}
