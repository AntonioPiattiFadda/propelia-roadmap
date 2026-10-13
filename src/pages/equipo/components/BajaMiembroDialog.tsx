import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { mensajeDeError } from '@/pages/crm/lib/errores'
import type { Usuario } from '@/pages/crm/types'
import { darDeBajaMiembro, type ResultadoDeBaja } from '../service/miembros.service'

/* Dar de baja = `activo = false` y lo que tenía en curso pasa a otro, todo en la RPC
   `crm_dar_de_baja_miembro`. Nunca se borra la fila: sus tareas cerradas y lo que pagó en la caja
   siguen diciendo que fue suyo. Lo que se mueve lo cuenta la misma RPC en simulacro, así el
   dialog dice exactamente lo que va a pasar. */
type Props = {
  /** A quién se da de baja; null con el dialog cerrado. */
  usuario: Usuario | null
  /** Los activos: de acá sale el sucesor (sin el que se va). */
  usuarios: Usuario[]
  onOpenChange: (open: boolean) => void
}

const RENGLONES: { clave: keyof Omit<ResultadoDeBaja, 'simulado'>; uno: string; varios: string }[] = [
  { clave: 'leads', uno: 'lead (con su historial)', varios: 'leads (con su historial)' },
  { clave: 'tareas', uno: 'tarea del CRM sin completar', varios: 'tareas del CRM sin completar' },
  { clave: 'reuniones', uno: 'reunión programada', varios: 'reuniones programadas' },
  { clave: 'roadmap', uno: 'tarea del roadmap sin terminar', varios: 'tareas del roadmap sin terminar' },
]

export function BajaMiembroDialog({ usuario, usuarios, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [sucesor, setSucesor] = useState<string>('')

  const cerrar = () => { onOpenChange(false); setSucesor('') }

  const previa = useQuery({
    queryKey: ['equipo', 'baja', usuario?.id],
    queryFn: () => darDeBajaMiembro(usuario!.id, null, true),
    enabled: !!usuario,
    staleTime: 0,
    gcTime: 0,
  })

  const baja = useMutation({
    mutationFn: () => darDeBajaMiembro(usuario!.id, sucesor || null, false),
    onSuccess: () => {
      // Se movieron leads, tareas y reuniones, y cambió `users`: todo el CRM se vuelve a pedir.
      void qc.invalidateQueries({ queryKey: ['crm'] })
      toast.success(`${usuario?.nombre} quedó dado de baja`)
      cerrar()
    },
    onError: e => { toast.error(mensajeDeError(e, 'No se pudo dar de baja')) },
  })

  const candidatos = usuarios.filter(u => u.activo && u.id !== usuario?.id)
  const conteo = previa.data
  const total = conteo ? conteo.leads + conteo.tareas + conteo.reuniones + conteo.roadmap : 0
  const faltaSucesor = total > 0 && !sucesor
  const listo = !!conteo && !faltaSucesor && !baja.isPending

  return (
    <Dialog open={!!usuario} onOpenChange={next => { if (!next) cerrar() }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Dar de baja a {usuario?.nombre}</DialogTitle>
          <DialogDescription>
            No se borra: deja de poder entrar y no se ofrece más en los menús, pero lo que ya hizo sigue
            diciendo que fue suyo. La caja no se toca.
          </DialogDescription>
        </DialogHeader>

        {previa.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-secondary" />
        ) : previa.error ? (
          <p className="text-sm text-destructive">{mensajeDeError(previa.error)}</p>
        ) : total === 0 ? (
          <p className="text-sm text-(--fg-2)">No tiene nada en curso: no hay nada que reasignar.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-foreground">Esto pasa a quien elijas:</p>
              <ul className="flex flex-col gap-0.5 pl-4 text-sm text-(--fg-2) [list-style:disc]">
                {RENGLONES.filter(r => conteo![r.clave] > 0).map(r => (
                  <li key={r.clave}>
                    <span className="font-semibold tabular-nums text-foreground">{conteo![r.clave]}</span>{' '}
                    {conteo![r.clave] === 1 ? r.uno : r.varios}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Se queda con todo</Label>
              <Select value={sucesor} onValueChange={setSucesor}>
                <SelectTrigger><SelectValue placeholder="Elegí a alguien" /></SelectTrigger>
                <SelectContent>
                  {candidatos.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>Cancelar</Button>
          <Button variant="destructive" onClick={() => baja.mutate()} disabled={!listo}>Dar de baja</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
