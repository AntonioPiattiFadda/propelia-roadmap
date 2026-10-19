import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { requiredPhoneError, toE164 } from '@/lib/phone'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import type { Usuario } from '@/pages/crm/types'
import { cambiarTelefonoMiembro } from '../service/miembros.service'

/* Cargar o cambiar el teléfono de un miembro, por la RPC `crm_set_member_phone` (solo
   SUPERADMIN). Pide uno válido, la misma regla que el alta: sacarlo no se ofrece. */
type Props = {
  /** De quién es el teléfono; null con el dialog cerrado. */
  usuario: Usuario | null
  onOpenChange: (open: boolean) => void
}

export function TelefonoMiembroDialog({ usuario, onOpenChange }: Props) {
  return (
    <Dialog open={!!usuario} onOpenChange={next => { if (!next) onOpenChange(false) }}>
      <DialogContent className="max-w-[420px]">
        {/* El formulario se monta con el usuario: PhoneInput toma el valor inicial al nacer. */}
        {usuario && <Formulario key={usuario.id} usuario={usuario} cerrar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({ usuario, cerrar }: { usuario: Usuario; cerrar: () => void }) {
  const qc = useQueryClient()
  const [telefono, setTelefono] = useState(usuario.phone ?? '')
  const error = requiredPhoneError(telefono)

  const guardar = useMutation({
    // Se guarda en E.164, como el producto: el que se tipea con espacios es el mismo número.
    mutationFn: () => cambiarTelefonoMiembro(usuario.id, toE164(telefono) ?? telefono.trim()),
    onSuccess: () => {
      // Las carteras de Equipo y del CRM salen de `users`.
      void qc.invalidateQueries({ queryKey: ['crm'] })
      toast.success('Teléfono guardado')
      cerrar()
    },
    onError: (e: unknown) => { toast.error(mensajeDeError(e, 'No se pudo guardar el teléfono')) },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Teléfono de {usuario.nombre}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="telefono-miembro">Teléfono *</Label>
        <PhoneInput id="telefono-miembro" value={telefono} onChange={setTelefono} aria-invalid={telefono !== '' && !!error} />
        {telefono !== '' && error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button onClick={() => guardar.mutate()} disabled={!!error || guardar.isPending}>Guardar</Button>
      </DialogFooter>
    </>
  )
}
