import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleCheck, CircleHelp, CircleX, Clock, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useUserSession } from '@/hooks/useUserSession'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { getUsuarios } from '@/pages/crm/service/crm.service'
import type { Usuario } from '@/pages/crm/types'
import { isValidGuestEmail, normalizeGuestEmail } from '../../lib/guestEmail'
import { getLeadClientGuest, getMeetingGuestResponses, type GuestResponse } from '../../service/meetings.service'

const displayName = (u: Pick<Usuario, 'nombre' | 'last_name'>) => [u.nombre, u.last_name].filter(Boolean).join(' ')

type Props = {
  userIds: string[]
  emails: string[]
  onUserIdsChange: (userIds: string[]) => void
  onEmailsChange: (emails: string[]) => void
  /** Si la reunión es de un lead, el email de su inmobiliaria se ofrece primero. */
  leadId?: string | null
  /** Reunión ya guardada: con esto se piden a Google las respuestas de los invitados. */
  meetingId?: string
  /** Invitados que sólo se muestran (la inmobiliaria que viene del lead por `?guest=`): no se quitan. */
  fixedLabels?: string[]
}

// Fila "Agregar invitados" del form de reunión (`VisitGuestsField` de `propelia-frontend`,
// 21/10/2026), estilo Google Calendar. Se puede invitar a
// compañeros del equipo (por id) y a cualquier email (la inmobiliaria del lead, su decisor...). La
// invitación la manda Google (`calendar-sync`: attendees + sendUpdates), por eso el form sólo
// muestra esta fila con el calendario conectado.
//
// Los compañeros se ofrecen a TODO el equipo y no sólo a los que la matriz de visibilidad me deja
// ver (`useVisibleAgents`): invitar a alguien a una reunión no es leer su cartera.
export function MeetingGuestsField({ userIds, emails, onUserIdsChange, onEmailsChange, leadId, meetingId, fixedLabels = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { userSession } = useUserSession()
  const myId = userSession?.user.id ?? null
  // Misma key que el CRM: la lista del equipo se comparte en cache. Los dados de baja no se ofrecen.
  const { data: usuarios = [] } = useQuery({
    queryKey: CRM_KEYS.usuarios,
    queryFn: getUsuarios,
    staleTime: 5 * 60_000,
  })
  const orgUsers = useMemo(() => usuarios.filter(u => u.activo), [usuarios])
  const { data: clientGuest = null } = useQuery({
    queryKey: ['lead-client-guest', leadId],
    queryFn: () => getLeadClientGuest(leadId!),
    enabled: !!leadId,
  })
  // Las respuestas viven en Google: se piden al abrir. Mientras cargan va un skeleton en el lugar
  // del badge; si fallan, no hay badge.
  const { data: responses, isLoading: loadingResponses } = useQuery({
    queryKey: ['meeting-guest-responses', meetingId],
    queryFn: () => getMeetingGuestResponses(meetingId!),
    enabled: !!meetingId,
    staleTime: 30_000,
  })
  // Sin respuesta de Google para ese email: todavía no se le mandó (se agregó recién, o la
  // reunión es nueva) — se invita al guardar.
  const statusFor = (email: string | null): GuestStatus | 'loading' | null => {
    if (!email) return null
    if (!meetingId) return 'unsent'
    if (loadingResponses) return 'loading'
    if (!responses) return null
    return responses[normalizeGuestEmail(email)] ?? 'unsent'
  }

  const byId = useMemo(() => new Map(orgUsers.map(u => [u.id, u])), [orgUsers])
  // Un id que ya no está activo (dado de baja) queda en la base pero no se pinta.
  const selectedUsers = userIds.map(id => byId.get(id)).filter(u => u != null)
  const clientEmail = clientGuest ? normalizeGuestEmail(clientGuest.email) : null

  // Emails que ya están invitados por cualquiera de los dos caminos: un compañero no se ofrece
  // como "email suelto" ni al revés.
  const takenEmails = useMemo(() => {
    const set = new Set(emails)
    for (const u of selectedUsers) if (u.email) set.add(normalizeGuestEmail(u.email))
    return set
  }, [emails, selectedUsers])

  const teammateCandidates = useMemo(
    () => orgUsers
      .filter(u => u.id !== myId && !userIds.includes(u.id))
      .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [orgUsers, myId, userIds],
  )
  const offerClient = clientGuest != null && clientEmail != null && !takenEmails.has(clientEmail)

  const typed = normalizeGuestEmail(query)
  const typedIsEmail = isValidGuestEmail(query)
  const typedMatchesKnown =
    typed === clientEmail || orgUsers.some(u => u.email && normalizeGuestEmail(u.email) === typed)
  const offerTyped = typedIsEmail && !takenEmails.has(typed) && !typedMatchesKnown

  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const addUser = (id: string) => {
    onUserIdsChange([...userIds, id])
    close()
  }
  const addEmail = (email: string) => {
    onEmailsChange([...emails, normalizeGuestEmail(email)])
    close()
  }

  const emailLabel = (email: string) =>
    email === clientEmail && clientGuest?.name ? `${clientGuest.name} (inmobiliaria)` : email === clientEmail ? 'Inmobiliaria' : null

  return (
    <div className="flex items-start gap-3">
      <Users className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Popover open={open} onOpenChange={next => (next ? setOpen(true) : close())}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="self-start rounded-md py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Agregar invitados
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CommandInput value={query} onValueChange={setQuery} placeholder="Nombre o email" />
              <CommandList>
                <CommandEmpty>
                  {query.includes('@')
                    ? 'Escribí un email completo para invitar a alguien de afuera.'
                    : 'Nadie coincide. Escribí un email para invitar a alguien de afuera.'}
                </CommandEmpty>
                {offerTyped && (
                  <CommandGroup>
                    {/* `value` = lo tipeado: así cmdk nunca lo filtra y Enter lo elige. */}
                    <CommandItem value={query} onSelect={() => addEmail(typed)}>
                      <span className="truncate" title={typed}>Invitar a <span className="font-medium">{typed}</span></span>
                    </CommandItem>
                  </CommandGroup>
                )}
                {offerClient && (
                  <CommandGroup heading="Inmobiliaria del lead">
                    <CommandItem value={`${clientGuest.name ?? ''} ${clientEmail}`} onSelect={() => addEmail(clientEmail)}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate" title={clientGuest.name ?? clientEmail}>{clientGuest.name ?? clientEmail}</span>
                        {clientGuest.name && <span className="truncate text-xs text-muted-foreground" title={clientEmail}>{clientEmail}</span>}
                      </div>
                    </CommandItem>
                  </CommandGroup>
                )}
                {teammateCandidates.length > 0 && (
                  <CommandGroup heading="Equipo">
                    {teammateCandidates.map(u => (
                      <CommandItem key={u.id} value={`${displayName(u)} ${u.email ?? ''}`} onSelect={() => addUser(u.id)}>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate" title={displayName(u)}>{displayName(u)}</span>
                          {u.email && <span className="truncate text-xs text-muted-foreground" title={u.email}>{u.email}</span>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {fixedLabels.map(label => (
          <p key={label} className="text-sm text-muted-foreground">{label}</p>
        ))}
        {selectedUsers.map(u => (
          <GuestRow
            key={u.id}
            name={displayName(u)}
            email={u.email}
            status={statusFor(u.email)}
            onRemove={() => onUserIdsChange(userIds.filter(id => id !== u.id))}
          />
        ))}
        {emails.map(email => {
          const label = emailLabel(email)
          return (
            <GuestRow
              key={email}
              name={label ?? email}
              email={label ? email : null}
              status={statusFor(email)}
              onRemove={() => onEmailsChange(emails.filter(e => e !== email))}
            />
          )
        })}
      </div>
    </div>
  )
}

type GuestStatus = GuestResponse | 'unsent'

const STATUS_BADGE: Record<GuestStatus, { label: string; icon: typeof CircleCheck; variant: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  accepted: { label: 'Aceptó', icon: CircleCheck, variant: 'success' },
  declined: { label: 'Rechazó', icon: CircleX, variant: 'danger' },
  tentative: { label: 'Quizás', icon: CircleHelp, variant: 'warning' },
  needsAction: { label: 'Pendiente', icon: Clock, variant: 'neutral' },
  unsent: { label: 'Se invita al guardar', icon: Clock, variant: 'neutral' },
}

function GuestRow({
  name,
  email,
  status,
  onRemove,
}: {
  name: string
  email: string | null
  status: GuestStatus | 'loading' | null
  onRemove: () => void
}) {
  const badge = status && status !== 'loading' ? STATUS_BADGE[status] : null
  const BadgeIcon = badge?.icon
  return (
    <div className="flex items-center justify-between gap-2 rounded-md py-0.5 text-sm">
      {/* El email en su propio renglón, con todo el ancho: al lado del nombre quedaba cortado. Si igual
          no entra, el `title` lo muestra entero al pasar el cursor. */}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium" title={name}>{name}</span>
        {email && <span className="truncate text-xs text-muted-foreground" title={email}>{email}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Mismo alto y ancho aproximado que el badge, para que la fila no salte al llegar. */}
        {status === 'loading' && <Skeleton className="h-[18px] w-16 rounded-full" />}
        {badge && BadgeIcon && (
          <Badge variant={badge.variant}>
            <BadgeIcon />
            {badge.label}
          </Badge>
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Quitar invitado"
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
