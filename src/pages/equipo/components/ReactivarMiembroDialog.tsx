import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Usuario } from '@/pages/crm/types'
import { reactivarMiembro } from '../service/miembros.service'

/* Reactivar = `activo = true` por la edge function `reactivar-miembro`, con contraseña nueva o
   la de siempre (la baja nunca tocó la cuenta de auth). Lo que la baja le pasó al sucesor no
   vuelve, y los permisos de cartera se dan de nuevo desde Visibilidad: el dialog lo dice antes. */
type Props = {
  /** A quién se reactiva; null con el dialog cerrado. */
  usuario: Usuario | null
  onOpenChange: (open: boolean) => void
}

type Clave = 'misma' | 'nueva'

export function ReactivarMiembroDialog({ usuario, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [clave, setClave] = useState<Clave>('misma')
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')

  const cerrar = () => { onOpenChange(false); setClave('misma'); setPassword(''); setConfirmar('') }

  const reactivar = useMutation({
    mutationFn: () => reactivarMiembro(usuario!.id, clave === 'nueva' ? password : null),
    onSuccess: () => {
      // Cambió `users`: las carteras de Equipo y del CRM salen de ahí.
      void qc.invalidateQueries({ queryKey: ['crm'] })
      toast.success(`${usuario?.nombre} volvió a estar activo`)
      cerrar()
    },
    onError: (e: Error) => { toast.error(e.message || 'No se pudo reactivar') },
  })

  // La edge function lo rechaza igual: acá es para decirlo antes de mandar.
  const noCoinciden = confirmar.length > 0 && password !== confirmar
  const valido = clave === 'misma' || (password.length >= 6 && password === confirmar)

  const opcion = (c: Clave, texto: string) => (
    <button type="button" role="radio" aria-checked={clave === c} onClick={() => setClave(c)}
      className={cn('h-8 flex-1 cursor-pointer rounded-md px-3 text-[12.5px]', clave === c ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
      {texto}
    </button>
  )

  return (
    <Dialog open={!!usuario} onOpenChange={next => { if (!next) cerrar() }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Reactivar a {usuario?.nombre}</DialogTitle>
          <DialogDescription>
            Vuelve a poder entrar con el mismo rol. Lo que se le pasó a otro con la baja (leads, tareas,
            reuniones) se queda donde está, y los permisos de cartera se dan de nuevo desde Visibilidad.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Contraseña</Label>
            <div role="radiogroup" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
              {opcion('misma', 'Dejar la que tenía')}
              {opcion('nueva', 'Poner una nueva')}
            </div>
          </div>
          {clave === 'nueva' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reactivar-password">Contraseña nueva</Label>
                <Input id="reactivar-password" type="password" autoComplete="new-password" autoFocus value={password}
                  onChange={e => setPassword(e.target.value)} />
                {password.length > 0 && password.length < 6 && (
                  <p className="text-xs text-(--fg-muted)">Al menos 6 caracteres</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reactivar-password-confirm">Confirmar contraseña</Label>
                <Input id="reactivar-password-confirm" type="password" autoComplete="new-password" value={confirmar}
                  onChange={e => setConfirmar(e.target.value)} />
                {noCoinciden && <p className="text-xs text-destructive">Las contraseñas no coinciden</p>}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button onClick={() => reactivar.mutate()} disabled={!valido || reactivar.isPending}>Reactivar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
