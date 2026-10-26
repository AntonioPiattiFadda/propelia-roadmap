import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { requiredPhoneError } from '@/lib/phone'
import type {
  ClientOnboardingMember,
  ClientOnboardingMemberInput,
  OnboardingMemberRole,
} from '@/service/clientOnboardings.service'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type NewOnboardingForm = {
  agencyName: string
  ownerFirstName: string
  ownerLastName: string
  ownerPhone: string
}
const EMPTY_ONBOARDING: NewOnboardingForm = {
  agencyName: '',
  ownerFirstName: '',
  ownerLastName: '',
  ownerPhone: '',
}

/** Alta nueva: la inmobiliaria y su responsable, que es a quien le sale el WhatsApp inicial. */
export function NewOnboardingDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (form: NewOnboardingForm) => void
  pending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        {/* El formulario se desmonta al cerrar: cada apertura arranca vacía. */}
        <NewOnboardingForm onCancel={() => onOpenChange(false)} onSubmit={onSubmit} pending={pending} />
      </DialogContent>
    </Dialog>
  )
}

function NewOnboardingForm({
  onCancel,
  onSubmit,
  pending,
}: {
  onCancel: () => void
  onSubmit: (form: NewOnboardingForm) => void
  pending: boolean
}) {
  const [form, setForm] = useState<NewOnboardingForm>(EMPTY_ONBOARDING)
  const phoneError = requiredPhoneError(form.ownerPhone)
  const valid = form.agencyName.trim() !== '' && form.ownerFirstName.trim() !== '' && phoneError === null

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nuevo onboarding</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onb-agency">Inmobiliaria</Label>
          <Input
            id="onb-agency"
            value={form.agencyName}
            placeholder="Inmobiliaria Ejemplo"
            onChange={(e) => setForm((f) => ({ ...f, agencyName: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onb-first">Nombre del responsable</Label>
            <Input
              id="onb-first"
              value={form.ownerFirstName}
              onChange={(e) => setForm((f) => ({ ...f, ownerFirstName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onb-last">Apellido</Label>
            <Input
              id="onb-last"
              value={form.ownerLastName}
              onChange={(e) => setForm((f) => ({ ...f, ownerLastName: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onb-phone">WhatsApp del responsable</Label>
          <PhoneInput id="onb-phone" value={form.ownerPhone} onChange={(ownerPhone) => setForm((f) => ({ ...f, ownerPhone }))} />
          {form.ownerPhone !== '' && phoneError && <p className="text-xs text-(--danger-fg)">{phoneError}</p>}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={!valid || pending} onClick={() => onSubmit(form)}>
          Crear onboarding
        </Button>
      </DialogFooter>
    </>
  )
}

const EMPTY_MEMBER: ClientOnboardingMemberInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'agent',
}

/** Agregar o editar a una persona del equipo que pasó el cliente. */
export function MemberDialog({
  open,
  onOpenChange,
  member,
  onSubmit,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = persona nueva. */
  member: ClientOnboardingMember | null
  onSubmit: (input: ClientOnboardingMemberInput) => void
  pending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px]">
        {/* Desmontado al cerrar: cada apertura arranca de `member` (o vacío). */}
        <MemberForm member={member} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} pending={pending} />
      </DialogContent>
    </Dialog>
  )
}

function MemberForm({
  member,
  onCancel,
  onSubmit,
  pending,
}: {
  member: ClientOnboardingMember | null
  onCancel: () => void
  onSubmit: (input: ClientOnboardingMemberInput) => void
  pending: boolean
}) {
  const [form, setForm] = useState<ClientOnboardingMemberInput>(() =>
    member
      ? {
          firstName: member.firstName,
          lastName: member.lastName,
          email: member.email ?? '',
          phone: member.phone ?? '',
          role: member.role,
        }
      : EMPTY_MEMBER,
  )

  // Todo opcional salvo el nombre: el cliente suele pasar los datos de a poco.
  const email = form.email?.trim() ?? ''
  const phone = form.phone?.trim() ?? ''
  const emailError = email && !EMAIL_PATTERN.test(email) ? 'Email inválido' : null
  const phoneError = phone ? requiredPhoneError(phone) : null
  const valid = form.firstName.trim() !== '' && !emailError && !phoneError

  return (
    <>
      <DialogHeader>
        <DialogTitle>{member ? `Editar a ${member.firstName}` : 'Agregar persona del equipo'}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onb-m-first">Nombre</Label>
            <Input
              id="onb-m-first"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onb-m-last">Apellido</Label>
            <Input id="onb-m-last" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onb-m-email">Email</Label>
            <Input
              id="onb-m-email"
              type="email"
              value={form.email ?? ''}
              aria-invalid={!!emailError}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            {emailError && <p className="text-xs text-(--danger-fg)">{emailError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="onb-m-phone">Teléfono</Label>
            <PhoneInput id="onb-m-phone" value={form.phone ?? ''} onChange={(p) => setForm((f) => ({ ...f, phone: p }))} />
            {phoneError && <p className="text-xs text-(--danger-fg)">{phoneError}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Rol</Label>
          <Select value={form.role} onValueChange={(role) => setForm((f) => ({ ...f, role: role as OnboardingMemberRole }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agente</SelectItem>
              <SelectItem value="admin">Administrador</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button disabled={!valid || pending} onClick={() => onSubmit(form)}>
          {member ? 'Guardar' : 'Agregar'}
        </Button>
      </DialogFooter>
    </>
  )
}
