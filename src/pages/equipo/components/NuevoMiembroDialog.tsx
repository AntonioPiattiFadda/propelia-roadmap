import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { requiredPhoneError, toE164 } from '@/lib/phone'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { VerEmail } from '@/components/EmailPreviewDialog'
import { useYo } from '@/hooks/useYo'
import { useUserSession } from '@/hooks/useUserSession'
import { nombreEnBandeja, remitenteDe, renderEmailDeAccesoAlEquipo } from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { crearMiembro, type Rol } from '../service/miembros.service'

/* `CreateOrgUserDialog` del producto, adaptado a nuestra `users`: rol SDR/SUPERADMIN. Nombre,
   apellido y teléfono son obligatorios, como allá (19/10/2026). `nombre` es el corto de los
   avatares. Iniciales y color los calcula la edge function; `caja` nace en false. Al crearlo,
   `crear-miembro` le manda su usuario y contraseña por mail; «Ver el mail» lo muestra armado con la
   misma plantilla (`renderEmailDeAccesoAlEquipo`) y lo cargado en el formulario (4/11/2026, copiado
   de `CreateOrgUserDialog` + `NewMemberEmailPreviewDialog` del producto). */
type Form = { email: string; password: string; password_confirm: string; nombre: string; apellido: string; telefono: string; rol: Rol }

const VACIO: Form = { email: '', password: '', password_confirm: '', nombre: '', apellido: '', telefono: '', rol: 'SDR' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function NuevoMiembroDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(VACIO)
  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)
  // La firma real la pone el servidor con la fila de quien da el alta: es la misma.
  const remitente = remitenteDe(yo)
  const emailDestino = form.email.trim() || 'email@delmiembro.com'
  // Mientras falta algo, va un texto de ejemplo en su lugar, como en el producto.
  const vistaPrevia = () => renderEmailDeAccesoAlEquipo(
    { nombre: form.nombre.trim() || 'Nombre', email: emailDestino, contrasena: form.password || 'contraseña temporal' },
    remitente, { assets: `${window.location.origin}/email` },
  )

  const cerrar = () => { onOpenChange(false); setForm(VACIO) }

  const crear = useMutation({
    mutationFn: crearMiembro,
    onSuccess: user => {
      // Las carteras de Equipo y del CRM salen de esta lista.
      void qc.invalidateQueries({ queryKey: CRM_KEYS.usuarios })
      if (user.accessEmailSent) toast.success('Miembro creado', { description: `Le enviamos sus accesos a ${user.email}` })
      // La cuenta quedó creada: lo que falta es pasarle los datos por otro lado.
      else toast.warning('Miembro creado, pero no le llegó el mail de accesos', { description: 'Pásale su email y contraseña a mano.', duration: Infinity, closeButton: true })
      cerrar()
    },
    onError: (e: Error) => { toast.error(e.message || 'No se pudo crear el miembro') },
  })

  // La edge function lo rechaza igual: acá es para decirlo antes de mandar.
  const conTildes = /[^\x00-\x7F]/.test(form.email)
  const noCoinciden = form.password_confirm.length > 0 && form.password !== form.password_confirm
  const errorTelefono = requiredPhoneError(form.telefono)
  const valido =
    !conTildes &&
    EMAIL.test(form.email.trim()) &&
    form.password.length >= 6 &&
    form.password === form.password_confirm &&
    form.nombre.trim().length > 0 &&
    form.apellido.trim().length > 0 &&
    errorTelefono === null

  const enviar = () => {
    if (!valido) return
    crear.mutate({ email: form.email.trim(), password: form.password, nombre: form.nombre.trim(), apellido: form.apellido.trim(),
      // En E.164, como el producto: el que se tipea con espacios es el mismo número.
      telefono: toE164(form.telefono) ?? form.telefono.trim(), rol: form.rol })
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : cerrar())}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nuevo miembro</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nuevo-miembro-nombre">Nombre *</Label>
              <Input id="nuevo-miembro-nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nuevo-miembro-apellido">Apellido *</Label>
              <Input id="nuevo-miembro-apellido" value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-miembro-email">Email *</Label>
            <Input id="nuevo-miembro-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            {conTildes && <p className="text-xs text-destructive">El email no puede llevar tildes ni ñ</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-miembro-telefono">Teléfono *</Label>
            <PhoneInput id="nuevo-miembro-telefono" value={form.telefono} onChange={telefono => setForm(f => ({ ...f, telefono }))}
              aria-invalid={form.telefono !== '' && !!errorTelefono} />
            {form.telefono !== '' && errorTelefono && <p className="text-xs text-destructive">{errorTelefono}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-miembro-password">Contraseña temporal</Label>
            <Input id="nuevo-miembro-password" type="password" autoComplete="new-password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            {form.password.length > 0 && form.password.length < 6
              ? <p className="text-xs text-destructive">Mínimo 6 caracteres</p>
              : (
                <p className="text-xs text-muted-foreground">
                  Le llega por mail junto con su usuario.{' '}
                  <VerEmail render={vistaPrevia} label="Ver el mail" title="Así le llega el mail"
                    description="Se manda al crear el miembro, con lo que cargaste en el formulario."
                    from={`${nombreEnBandeja(remitente)} <info@propelia.es>`} to={emailDestino} />
                </p>
              )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-miembro-password-confirm">Confirmar contraseña</Label>
            <Input id="nuevo-miembro-password-confirm" type="password" autoComplete="new-password" value={form.password_confirm}
              onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))} />
            {noCoinciden && <p className="text-xs text-destructive">Las contraseñas no coinciden</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Rol</Label>
            <Select value={form.rol} onValueChange={v => setForm(f => ({ ...f, rol: v as Rol }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SDR">SDR — solo el CRM</SelectItem>
                <SelectItem value="SUPERADMIN">Superadmin — todo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!valido || crear.isPending}>Crear miembro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
