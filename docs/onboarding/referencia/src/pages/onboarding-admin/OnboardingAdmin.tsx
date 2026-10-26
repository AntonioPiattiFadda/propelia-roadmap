import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Copy, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { formatPhoneNational } from '@/lib/phone'
import { buildWhatsAppLink } from '@/lib/propertyShare'
import { cn } from '@/lib/utils'
import {
  addClientOnboardingMember,
  createClientOnboarding,
  deleteClientOnboardingMember,
  linkClientOnboardingOrganization,
  listClientOnboardingMembers,
  listClientOnboardings,
  listOnboardingOrganizations,
  listOnboardingTemplates,
  setClientOnboardingContact,
  setClientOnboardingTask,
  updateClientOnboardingMember,
  updateOnboardingTemplate,
  type ClientOnboarding,
  type ClientOnboardingMember,
  type ClientOnboardingMemberInput,
} from '@/service/clientOnboardings.service'
import {
  currentStep,
  fillTemplate,
  initialPassword,
  MIN_PASSWORD_LENGTH,
  ONBOARDING_STEPS,
  stepStatus,
  taskKey,
  TOTAL_TASKS,
  type OnboardingStep,
  type OnboardingTask,
  type OnboardingTemplateId,
  type StepStatus,
} from './onboardingCatalog'
import { MemberDialog, NewOnboardingDialog } from './OnboardingDialogs'
import { InboundSimulator } from './InboundSimulator'
import { PropertyImport } from './PropertyImport'

const ONBOARDINGS_KEY = ['client-onboardings'] as const
const MEMBERS_KEY = (id: string | null) => ['client-onboarding-members', id] as const
const TEMPLATES_KEY = ['onboarding-templates'] as const

const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const ROLE_LABELS = { agent: 'Agente', admin: 'Administrador' } as const

const STATUS_PILL: Record<StepStatus, { label: string; className: string }> = {
  done: { label: 'Completado', className: 'bg-(--success-soft) text-(--success-fg)' },
  doing: { label: 'En curso', className: 'bg-(--brand-soft) text-(--brand-soft-fg)' },
  todo: { label: 'Sin empezar', className: 'bg-muted text-muted-foreground' },
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'error desconocido')

/**
 * Soporte: el paso a paso del alta de cada inmobiliaria nueva. Sólo superadmin (la ruta cuelga
 * de RequireSuperadmin y las policies de las tablas lo vuelven a exigir).
 *
 * Arriba se elige el onboarding (uno por cliente, existe antes que su organización) y se ve en
 * qué paso está. Los pasos salen de `onboardingCatalog`; lo hecho y los mensajes, de la base.
 */
export function OnboardingAdmin() {
  const qc = useQueryClient()
  const onboardingsQuery = useQuery({ queryKey: ONBOARDINGS_KEY, queryFn: listClientOnboardings })
  const onboardings = onboardingsQuery.data ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  // Quien firma los mensajes: el usuario logueado, salvo que lo cambie. Vive acá para que
  // valga para todos los mensajes y no se pierda al cambiar de inmobiliaria.
  const { user } = useCurrentUser()
  const [signerEdit, setSignerEdit] = useState<string | null>(null)
  const signer: Signer = { name: signerEdit ?? (user?.first_name?.trim() || ''), onChange: setSignerEdit }
  const selected = onboardings.find((o) => o.id === selectedId) ?? onboardings[0] ?? null

  const create = useMutation({
    mutationFn: createClientOnboarding,
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ONBOARDINGS_KEY })
      setSelectedId(id)
      setNewOpen(false)
      toast.success('Onboarding creado')
    },
    onError: (e) => toast.error(`No se pudo crear: ${errorMessage(e)}`),
  })

  return (
    <div className="ui-scale flex flex-1 flex-col">
      <PageHeader titleActions={<SuperadminBadge />} />
      <div className="flex-1 bg-card p-4">
        <div className="mx-auto flex w-full max-w-270 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-110">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Inmobiliaria</span>
              <Select value={selected?.id} onValueChange={setSelectedId} disabled={onboardings.length === 0}>
                <SelectTrigger aria-label="Inmobiliaria">
                  <SelectValue placeholder={onboardingsQuery.isLoading ? 'Cargando…' : 'Todavía no hay onboardings'} />
                </SelectTrigger>
                <SelectContent>
                  {onboardings.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.agencyName} — {stepLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button onClick={() => setNewOpen(true)}>
              <Icon icon={Plus} size="sm" />
              Nuevo onboarding
            </Button>
          </div>

          {onboardingsQuery.isError ? (
            <p className="p-6 text-center text-sm text-(--danger-fg)">No se pudieron cargar los onboardings.</p>
          ) : !selected ? (
            !onboardingsQuery.isLoading && (
              <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Cuando cierres una venta, creá el onboarding con la inmobiliaria y el WhatsApp de su responsable.
              </p>
            )
          ) : (
            <OnboardingDetail key={selected.id} onboarding={selected} signer={signer} />
          )}
        </div>
      </div>
      <NewOnboardingDialog open={newOpen} onOpenChange={setNewOpen} onSubmit={(f) => create.mutate(f)} pending={create.isPending} />
    </div>
  )
}

function stepLabel(o: ClientOnboarding): string {
  const done = new Set(o.doneTasks)
  const step = currentStep(done)
  if (stepStatus(step, done) === 'done') return 'completado'
  return `paso ${ONBOARDING_STEPS.indexOf(step) + 1} · ${step.title}`
}

type Signer = { name: string; onChange: (name: string) => void }

function OnboardingDetail({ onboarding, signer }: { onboarding: ClientOnboarding; signer: Signer }) {
  const done = useMemo(() => new Set(onboarding.doneTasks), [onboarding.doneTasks])
  const current = currentStep(done)
  const [openStepId, setOpenStepId] = useState(current.id)
  const openStep = ONBOARDING_STEPS.find((s) => s.id === openStepId) ?? current

  const membersQuery = useQuery({
    queryKey: MEMBERS_KEY(onboarding.id),
    queryFn: () => listClientOnboardingMembers(onboarding.id),
  })
  const members = membersQuery.data ?? []
  const owner = members.find((m) => m.isOwner) ?? null
  // A quien le salen los mensajes. Arranca siendo el responsable.
  const contact = members.find((m) => m.isContact) ?? owner

  const doneCount = ONBOARDING_STEPS.reduce((n, s) => n + s.tasks.filter((t) => done.has(taskKey(s.id, t.id))).length, 0)
  const pct = Math.round((doneCount / TOTAL_TASKS) * 100)
  const finished = stepStatus(current, done) === 'done'

  return (
    <>
      <section className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{onboarding.agencyName}</h2>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              Alta: <b className="font-medium text-foreground">{dateFormat.format(new Date(onboarding.createdAt))}</b>
            </span>
            <span>
              Responsable:{' '}
              <b className="font-medium text-foreground">{owner ? `${owner.firstName} ${owner.lastName}`.trim() : '—'}</b>
            </span>
            <span>
              Contacto:{' '}
              <b className="font-medium text-foreground">{contact ? `${contact.firstName} ${contact.lastName}`.trim() : '—'}</b>
            </span>
            <span>
              Equipo: <b className="font-medium text-foreground">{members.length} personas</b>
            </span>
            <span>
              Cuenta:{' '}
              <b className="font-medium text-foreground">{onboarding.organizationId ? 'creada' : 'todavía no'}</b>
            </span>
          </div>
        </div>
        <div className="sm:text-right">
          <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Estamos en</span>
          <strong className="text-sm">
            {finished ? 'Onboarding completado' : `Paso ${ONBOARDING_STEPS.indexOf(current) + 1} · ${current.title}`}
          </strong>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Progreso del onboarding"
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {doneCount} de {TOTAL_TASKS} tareas
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Pasos del onboarding" className="rounded-lg border border-border p-1.5">
          <ol className="flex flex-col gap-0.5">
            {ONBOARDING_STEPS.map((s, i) => {
              const status = stepStatus(s, done)
              const n = s.tasks.filter((t) => done.has(taskKey(s.id, t.id))).length
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={s.id === openStep.id ? 'step' : undefined}
                    onClick={() => setOpenStepId(s.id)}
                    className={cn(
                      'grid w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-2.5 rounded-md p-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      s.id === openStep.id ? 'bg-(--brand-soft)' : 'hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 place-items-center rounded-full border-[1.5px] text-xs font-bold',
                        status === 'done' && 'border-(--success) bg-(--success) text-white',
                        status === 'doing' && 'border-primary text-primary',
                        status === 'todo' && 'border-border text-muted-foreground',
                      )}
                    >
                      {status === 'done' ? <Icon icon={Check} size="sm" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {status === 'done' ? 'Completado' : `${n} de ${s.tasks.length} · ${s.summary}`}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        <StepDetail step={openStep} onboarding={onboarding} done={done} members={members} contact={contact} signer={signer} />
      </div>
    </>
  )
}

function StepDetail({
  step,
  onboarding,
  done,
  members,
  contact,
  signer,
}: {
  step: OnboardingStep
  onboarding: ClientOnboarding
  done: ReadonlySet<string>
  members: ClientOnboardingMember[]
  contact: ClientOnboardingMember | null
  signer: Signer
}) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: ({ key, next }: { key: string; next: boolean }) => setClientOnboardingTask(onboarding.id, key, next),
    // Optimista: el tilde se ve al toque; si falla, vuelve con el refetch.
    onMutate: async ({ key, next }) => {
      await qc.cancelQueries({ queryKey: ONBOARDINGS_KEY })
      qc.setQueryData<ClientOnboarding[]>(ONBOARDINGS_KEY, (list = []) =>
        list.map((o) =>
          o.id !== onboarding.id
            ? o
            : { ...o, doneTasks: next ? [...o.doneTasks, key] : o.doneTasks.filter((k) => k !== key) },
        ),
      )
    },
    onError: (e) => toast.error(`No se pudo guardar: ${errorMessage(e)}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ONBOARDINGS_KEY }),
  })

  const status = stepStatus(step, done)
  const n = step.tasks.filter((t) => done.has(taskKey(step.id, t.id))).length

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold">
          Paso {ONBOARDING_STEPS.indexOf(step) + 1} · {step.title}
        </h3>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_PILL[status].className)}>
          {STATUS_PILL[status].label}
        </span>
        <p className="basis-full text-xs text-muted-foreground">
          {n} de {step.tasks.length} tareas hechas para {onboarding.agencyName}.
        </p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {step.tasks.map((task) => {
          const key = taskKey(step.id, task.id)
          const checked = done.has(key)
          return (
            <li
              key={key}
              className={cn('overflow-hidden rounded-lg border', checked ? 'border-(--success)/40' : 'border-border')}
            >
              <div className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 px-3.5 py-3">
                <Checkbox
                  id={`task-${key}`}
                  className="mt-0.5"
                  checked={checked}
                  onCheckedChange={(next) => toggle.mutate({ key, next: next === true })}
                />
                <label htmlFor={`task-${key}`} className="min-w-0 cursor-pointer">
                  <span className={cn('block text-sm font-semibold', checked && 'text-muted-foreground line-through')}>
                    {task.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">{task.description}</span>
                </label>
                {task.blocked && !checked && (
                  <span className="rounded-full bg-(--warning-soft) px-2 py-0.5 text-[11px] font-bold text-(--warning-fg)">
                    Bloqueado
                  </span>
                )}
              </div>
              {task.extra && (
                <div className="flex flex-col gap-2.5 border-t border-border bg-muted/40 px-3.5 py-3 text-sm">
                  <TaskExtra task={task} onboarding={onboarding} members={members} contact={contact} signer={signer} />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function TaskExtra({
  task,
  onboarding,
  members,
  contact,
  signer,
}: {
  task: OnboardingTask
  onboarding: ClientOnboarding
  members: ClientOnboardingMember[]
  contact: ClientOnboardingMember | null
  signer: Signer
}) {
  const extra = task.extra!
  return (
    <>
      {task.blocked && (
        <div role="note" className="flex gap-2.5 rounded-md bg-(--warning-soft) px-3 py-2.5 text-xs text-(--warning-fg)">
          <Icon icon={AlertTriangle} size="md" className="mt-px" />
          <span>{task.blocked} Ver «Bloqueo actual» en la guía.</span>
        </div>
      )}
      {extra.kind === 'message' && (
        <MessageBlock templateId={extra.templateId} onboarding={onboarding} contact={contact} signer={signer} />
      )}
      {extra.kind === 'organization' && <OrganizationLink onboarding={onboarding} />}
      {extra.kind === 'team' && <TeamTable onboardingId={onboarding.id} members={members} />}
      {extra.kind === 'contact' && <ContactPicker onboardingId={onboarding.id} members={members} contact={contact} />}
      {extra.kind === 'properties' && <PropertyImport organizationId={onboarding.organizationId} agencyName={onboarding.agencyName} />}
      {extra.kind === 'properties' && onboarding.organizationId && <InboundSimulator organizationId={onboarding.organizationId} />}
    </>
  )
}

function MessageBlock({
  templateId,
  onboarding,
  contact,
  signer,
}: {
  templateId: OnboardingTemplateId
  onboarding: ClientOnboarding
  contact: ClientOnboardingMember | null
  signer: Signer
}) {
  const qc = useQueryClient()
  const { user } = useCurrentUser()
  const templatesQuery = useQuery({ queryKey: TEMPLATES_KEY, queryFn: listOnboardingTemplates })
  const template = templatesQuery.data?.[templateId]

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const save = useMutation({
    mutationFn: () => updateOnboardingTemplate(templateId, draft, user!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: TEMPLATES_KEY })
      setEditing(false)
      toast.success('Mensaje guardado para todos los onboardings')
    },
    onError: (e) => toast.error(`No se pudo guardar: ${errorMessage(e)}`),
  })

  if (templatesQuery.isLoading) return <p className="text-xs text-muted-foreground">Cargando mensaje…</p>
  if (!template) return <p className="text-xs text-(--danger-fg)">No se encontró el mensaje «{templateId}» en la base.</p>

  const text = fillTemplate(template, {
    nombre: contact?.firstName ?? '',
    soporte: signer.name.trim() || '[tu nombre]',
    inmobiliaria: onboarding.agencyName,
  })
  const phone = contact?.phone ?? null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Mensaje copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Variables: <code>{'{nombre}'}</code> (responsable), <code>{'{soporte}'}</code> (quien envía),{' '}
          <code>{'{inmobiliaria}'}</code>. El cambio vale para todos los onboardings.
        </p>
        <Textarea rows={9} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Plantilla del mensaje" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate()}>
            Guardar mensaje
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="flex w-56 flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Firmas como</span>
          <Input
            value={signer.name}
            placeholder="Tu nombre"
            onChange={(e) => signer.onChange(e.target.value)}
          />
        </label>
        <p className="pb-2 text-xs text-muted-foreground">
          Para {contact ? `${contact.firstName} ${contact.lastName}`.trim() : 'la persona de contacto'} ·{' '}
          {phone ? formatPhoneNational(phone) : 'sin teléfono'}
        </p>
      </div>
      <pre className="rounded-md border border-border bg-card px-3 py-2.5 font-sans text-xs whitespace-pre-wrap">{text}</pre>
      <div className="flex flex-wrap gap-2">
        {phone ? (
          <Button size="sm" asChild>
            <a href={buildWhatsAppLink(text, phone)} target="_blank" rel="noopener noreferrer">
              <Icon icon={MessageCircle} size="sm" />
              Abrir en WhatsApp
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            <Icon icon={MessageCircle} size="sm" />
            Falta el teléfono del contacto
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={copy}>
          <Icon icon={Copy} size="sm" />
          Copiar mensaje
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(template)
            setEditing(true)
          }}
        >
          <Icon icon={Pencil} size="sm" />
          Editar mensaje
        </Button>
      </div>
    </div>
  )
}

function OrganizationLink({ onboarding }: { onboarding: ClientOnboarding }) {
  const qc = useQueryClient()
  const orgsQuery = useQuery({ queryKey: ['onboarding-organizations'], queryFn: listOnboardingOrganizations })
  const link = useMutation({
    mutationFn: (orgId: string) => linkClientOnboardingOrganization(onboarding.id, orgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ONBOARDINGS_KEY }),
    onError: (e) => toast.error(`No se pudo vincular: ${errorMessage(e)}`),
  })

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Organización creada</span>
      <Select value={onboarding.organizationId ?? undefined} onValueChange={(id) => link.mutate(id)} disabled={link.isPending}>
        <SelectTrigger className="w-full sm:w-80" aria-label="Organización creada">
          <SelectValue placeholder={orgsQuery.isLoading ? 'Cargando…' : 'Elegí la organización del cliente'} />
        </SelectTrigger>
        <SelectContent>
          {(orgsQuery.data ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/**
 * La persona de contacto del cliente: habla con soporte y con su equipo, configura la
 * organización y conecta los portales. Arranca siendo el responsable; si nombran a otra persona
 * que todavía no está en el equipo, se agrega acá y queda como contacto.
 */
function ContactPicker({
  onboardingId,
  members,
  contact,
}: {
  onboardingId: string
  members: ClientOnboardingMember[]
  contact: ClientOnboardingMember | null
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const invalidate = () => qc.invalidateQueries({ queryKey: MEMBERS_KEY(onboardingId) })

  const setContact = useMutation({
    mutationFn: setClientOnboardingContact,
    onSuccess: invalidate,
    onError: (e) => toast.error(`No se pudo cambiar el contacto: ${errorMessage(e)}`),
  })
  const addAsContact = useMutation({
    mutationFn: async (input: ClientOnboardingMemberInput) => {
      const id = await addClientOnboardingMember(onboardingId, input)
      await setClientOnboardingContact(id)
    },
    onSuccess: async () => {
      await invalidate()
      setAdding(false)
    },
    onError: (e) => toast.error(`No se pudo agregar: ${errorMessage(e)}`),
  })

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Persona de contacto</span>
          <Select value={contact?.id} onValueChange={(id) => setContact.mutate(id)} disabled={setContact.isPending}>
            <SelectTrigger className="w-full sm:w-72" aria-label="Persona de contacto">
              <SelectValue placeholder="Elegí a la persona de contacto" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {`${m.firstName} ${m.lastName}`.trim()}
                  {m.isOwner ? ' · responsable' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Icon icon={Plus} size="sm" />
          Es otra persona
        </Button>
      </div>
      {contact && !contact.phone && (
        <p className="text-xs text-(--warning-fg)">Falta su teléfono: sin él no se le pueden abrir los mensajes en WhatsApp.</p>
      )}
      <MemberDialog
        open={adding}
        onOpenChange={setAdding}
        member={null}
        onSubmit={(input) => addAsContact.mutate(input)}
        pending={addAsContact.isPending}
      />
    </>
  )
}

function TeamTable({ onboardingId, members }: { onboardingId: string; members: ClientOnboardingMember[] }) {
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<{ open: boolean; member: ClientOnboardingMember | null }>({ open: false, member: null })
  const invalidate = () => qc.invalidateQueries({ queryKey: MEMBERS_KEY(onboardingId) })

  const save = useMutation({
    mutationFn: async (input: ClientOnboardingMemberInput) => {
      if (dialog.member) await updateClientOnboardingMember(dialog.member.id, input)
      else await addClientOnboardingMember(onboardingId, input)
    },
    onSuccess: async () => {
      await invalidate()
      setDialog({ open: false, member: null })
    },
    onError: (e) => toast.error(`No se pudo guardar: ${errorMessage(e)}`),
  })
  const remove = useMutation({
    mutationFn: deleteClientOnboardingMember,
    onSuccess: invalidate,
    onError: (e) => toast.error(`No se pudo borrar: ${errorMessage(e)}`),
  })

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-170 text-xs">
          <thead className="bg-muted/60 text-[11px] tracking-wide text-muted-foreground uppercase">
            <tr>
              {['Persona', 'Email', 'Teléfono', 'Rol', 'Contraseña inicial', ''].map((h) => (
                <th key={h} className="px-2.5 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => {
              const password = initialPassword(m.firstName, m.lastName)
              return (
                <tr key={m.id}>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    {m.firstName} {m.lastName}
                    {m.isOwner && (
                      <span className="ml-1.5 rounded-full bg-(--brand-soft) px-2 py-0.5 text-[10px] font-bold text-(--brand-soft-fg)">
                        Responsable
                      </span>
                    )}
                    {m.isContact && (
                      <span className="ml-1.5 rounded-full bg-(--success-soft) px-2 py-0.5 text-[10px] font-bold text-(--success-fg)">
                        Contacto
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-2">{m.email || <span className="text-(--warning-fg)">falta</span>}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    {m.phone ? formatPhoneNational(m.phone) : <span className="text-(--warning-fg)">falta</span>}
                  </td>
                  <td className="px-2.5 py-2">{ROLE_LABELS[m.role]}</td>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{password}</code>
                    {password.length < MIN_PASSWORD_LENGTH && (
                      <span className="ml-1.5 font-semibold text-(--danger-fg)">· menos de 6, agregar año</span>
                    )}
                  </td>
                  <td className="px-1.5 py-1 text-right whitespace-nowrap">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar a ${m.firstName}`}
                      onClick={() => setDialog({ open: true, member: m })}
                    >
                      <Icon icon={Pencil} size="sm" />
                    </Button>
                    {/* Ni el responsable ni el contacto: el alta se quedaría sin a quién escribirle. */}
                    {!m.isOwner && !m.isContact && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Borrar a ${m.firstName}`}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(m.id)}
                      >
                        <Icon icon={Trash2} size="sm" />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, member: null })}>
          <Icon icon={Plus} size="sm" />
          Agregar persona
        </Button>
      </div>
      <MemberDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        member={dialog.member}
        onSubmit={(input) => save.mutate(input)}
        pending={save.isPending}
      />
    </>
  )
}
