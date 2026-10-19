import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import type { Usuario } from '@/pages/crm/types'
import { cambiarApellidoMiembro } from '../service/miembros.service'

/* Cargar o cambiar el apellido de un miembro, por la RPC `crm_set_member_last_name` (solo
   SUPERADMIN). Obligatorio, la misma regla que el alta: sacarlo no se ofrece. El gemelo de
   `TelefonoMiembroDialog`. Las iniciales no se recalculan: las de antes ya están en los avatares. */
type Props = {
  /** De quién es el apellido; null con el dialog cerrado. */
  usuario: Usuario | null
  onOpenChange: (open: boolean) => void
}

export function ApellidoMiembroDialog({ usuario, onOpenChange }: Props) {
  return (
    <Dialog open={!!usuario} onOpenChange={next => { if (!next) onOpenChange(false) }}>
      <DialogContent className="max-w-[420px]">
        {usuario && <Formulario key={usuario.id} usuario={usuario} cerrar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Formulario({ usuario, cerrar }: { usuario: Usuario; cerrar: () => void }) {
  const qc = useQueryClient()
  const [apellido, setApellido] = useState(usuario.last_name ?? '')
  const valido = apellido.trim().length > 0

  const guardar = useMutation({
    mutationFn: () => cambiarApellidoMiembro(usuario.id, apellido.trim()),
    onSuccess: () => {
      // Las carteras de Equipo y del CRM salen de `users`.
      void qc.invalidateQueries({ queryKey: ['crm'] })
      toast.success('Apellido guardado')
      cerrar()
    },
    onError: (e: unknown) => { toast.error(mensajeDeError(e, 'No se pudo guardar el apellido')) },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Apellido de {usuario.nombre}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apellido-miembro">Apellido *</Label>
        <Input id="apellido-miembro" autoFocus value={apellido} onChange={e => setApellido(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && valido && !guardar.isPending) guardar.mutate() }} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={cerrar}>Cancelar</Button>
        <Button onClick={() => guardar.mutate()} disabled={!valido || guardar.isPending}>Guardar</Button>
      </DialogFooter>
    </>
  )
}
