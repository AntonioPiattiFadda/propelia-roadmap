import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CRM_KEYS } from '@/pages/crm/hooks/keys'
import { crearMiembro, type Rol } from '../service/miembros.service'

/* `CreateOrgUserDialog` del producto, adaptado a nuestra `users`: sin apellido ni teléfono, y
   rol SDR/SUPERADMIN. Iniciales y color los calcula la edge function; `caja` nace en false. */
type Form = { email: string; password: string; password_confirm: string; nombre: string; rol: Rol }

const VACIO: Form = { email: '', password: '', password_confirm: '', nombre: '', rol: 'SDR' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function NuevoMiembroDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(VACIO)

  const cerrar = () => { onOpenChange(false); setForm(VACIO) }

  const crear = useMutation({
    mutationFn: crearMiembro,
    onSuccess: () => {
      // Las carteras de Equipo y del CRM salen de esta lista.
      void qc.invalidateQueries({ queryKey: CRM_KEYS.usuarios })
      toast.success('Miembro creado')
      cerrar()
    },
    onError: (e: Error) => { toast.error(e.message || 'No se pudo crear el miembro') },
  })

  const noCoinciden = form.password_confirm.length > 0 && form.password !== form.password_confirm
  const valido =
    EMAIL.test(form.email.trim()) &&
    form.password.length >= 6 &&
    form.password === form.password_confirm &&
    form.nombre.trim().length > 0

  const enviar = () => {
    if (!valido) return
    crear.mutate({ email: form.email.trim(), password: form.password, nombre: form.nombre.trim(), rol: form.rol })
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
              <Label htmlFor="nuevo-miembro-nombre">Nombre</Label>
              <Input id="nuevo-miembro-nombre" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nuevo-miembro-email">Email</Label>
              <Input id="nuevo-miembro-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nuevo-miembro-password">Contraseña temporal</Label>
            <Input id="nuevo-miembro-password" type="password" autoComplete="new-password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
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
