import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCarteras } from '../hooks/useCarteras'
import { particionarReasignacion, slotsDeCartera, type ReassignCandidate } from '../lib/reassignCollisions'
import type { CrmLeadRow, Usuario } from '../types'

/* Copiado de propelia-frontend (src/pages/leads/components/ReassignLeadsDialog.tsx). Solo ofrece
   carteras con write (la base rechaza el resto: reasignar exige write en la vieja y en la nueva).
   Las casillas ocupadas del destino salen de la lista en memoria, no de otra consulta. */
export function ReassignLeadsDialog({ open, onOpenChange, candidatos, leads, isPending, onConfirm }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  candidatos: ReassignCandidate[]
  leads: CrmLeadRow[]
  isPending: boolean
  onConfirm: (nuevo: Usuario, mover: ReassignCandidate[]) => void
}) {
  const { conEscritura } = useCarteras()
  const [destinoId, setDestinoId] = useState('')
  const [avisoAbierto, setAvisoAbierto] = useState(false)
  const destino = conEscritura.find(u => u.id === destinoId) ?? null

  const reparto = useMemo(
    () => particionarReasignacion(candidatos, destinoId, destinoId ? slotsDeCartera(leads, destinoId) : []),
    [candidatos, destinoId, leads],
  )

  const cerrar = (v: boolean) => {
    if (!v) { setDestinoId(''); setAvisoAbierto(false) }
    onOpenChange(v)
  }

  const mandar = () => {
    if (!destino) return
    // Nada que mover (todos chocan o ya eran de ese responsable): se dice y no se llama a la base.
    if (reparto.mover.length === 0) {
      toast.warning(reparto.chocan.length > 0
        ? `No se reasignó ninguno: ${destino.nombre} ya tiene un lead de ${reparto.chocan.length === 1 ? 'ese cliente' : 'esos clientes'}.`
        : `Ya ${candidatos.length === 1 ? 'es' : 'son'} de ${destino.nombre}.`)
      cerrar(false)
      return
    }
    onConfirm(destino, reparto.mover)
  }

  const confirmar = () => {
    if (!destino) return
    if (reparto.chocan.length > 0) { setAvisoAbierto(true); return }
    mandar()
  }

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Reasignar {candidatos.length === 1 ? 'el lead' : `${candidatos.length} leads`} a…
          </DialogTitle>
        </DialogHeader>
        <Select value={destinoId} onValueChange={setDestinoId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Elegí un responsable" /></SelectTrigger>
          <SelectContent>
            {conEscritura.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={!destino || isPending}>Confirmar</Button>
        </DialogFooter>

        {/* Descendiente del Dialog y no hermano: con un hermano, la capa de dismissal de Radix
            decide por árbol de React y el cartel se cerraría junto con el diálogo de abajo. */}
        <AlertDialog open={avisoAbierto} onOpenChange={setAvisoAbierto}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {reparto.chocan.length === 1 ? 'Uno no se puede reasignar' : `${reparto.chocan.length} no se pueden reasignar`}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>{destino?.nombre ?? 'Ese responsable'} ya tiene un lead de:</p>
                  <ul className="list-disc pl-5">{reparto.chocan.map(c => <li key={c.id}>{c.clientName}</li>)}</ul>
                  <p>
                    {reparto.mover.length > 0
                      ? `Se reasignan los otros ${reparto.mover.length}; esos quedan donde están.`
                      : 'No queda ninguno para reasignar.'}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Volver</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setAvisoAbierto(false); mandar() }} disabled={isPending}>
                {reparto.mover.length > 0 ? 'Reasignar los demás' : 'Entendido'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
