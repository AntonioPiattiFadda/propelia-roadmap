import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { etiquetasVivas, metaDeEtiqueta } from '../lib/etiquetas'
import type { Etiqueta, TipoGasto } from '../types'

const SECCIONES: { tipo: TipoGasto; titulo: string }[] = [{ tipo: 'FIXED', titulo: 'Fijos' }, { tipo: 'VARIABLE', titulo: 'Variables' }]

/**
 * «Gestionar etiquetas»: las vivas, por tipo, con su meta y editar/eliminar al pasar el cursor
 * (siempre visibles en el teléfono, que no tiene hover). Editar y «Agregar» abren sus dialogs
 * encima, desde quien monta esto; eliminar pregunta acá mismo.
 */
export function GestionarEtiquetasDialog({ etiquetas, uso, onNueva, onEditar, onEliminar, onCerrar }: {
  etiquetas: Etiqueta[]
  uso: Record<string, number>
  onNueva: () => void
  onEditar: (etiqueta: Etiqueta) => void
  onEliminar: (etiqueta: Etiqueta) => Promise<void>
  onCerrar: () => void
}) {
  const [aEliminar, setAEliminar] = useState<Etiqueta | null>(null)
  const [eliminando, setEliminando] = useState(false)
  const secciones = SECCIONES
    .map(s => ({ ...s, lista: etiquetasVivas(etiquetas, s.tipo).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter(s => s.lista.length)

  const eliminar = async (e: Etiqueta) => {
    setEliminando(true)
    try { await onEliminar(e); setAEliminar(null) } catch { /* toast de la mutación */ } finally { setEliminando(false) }
  }

  return (
    <>
      <Dialog open onOpenChange={o => { if (!o) onCerrar() }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>Gestionar etiquetas</DialogTitle></DialogHeader>
          <div className="flex max-h-[min(60vh,520px)] flex-col gap-[18px] overflow-y-auto">
            {secciones.length === 0 && <p className="py-2.5 text-center text-xs text-(--fg-muted)">No hay etiquetas creadas todavía.</p>}
            {secciones.map(s => (
              <section key={s.tipo}>
                <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-widest text-(--fg-muted)">
                  {s.titulo} <span className="ml-1 font-medium">{s.lista.length}</span>
                </p>
                <div className="overflow-hidden rounded-xl border border-(--line-soft)">
                  {s.lista.map(e => (
                    <div key={e.id} className="group flex items-center gap-2 border-t border-(--line-soft) py-[9px] pl-3 pr-2.5 first:border-t-0 hover:bg-(--surface-2)">
                      <div className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[13.5px] font-medium">{e.name}</span>
                        <span className="text-xs tabular-nums text-(--fg-muted)">{metaDeEtiqueta(e, uso[e.id] ?? 0)}</span>
                      </div>
                      <div className="flex gap-0.5 transition-opacity md:opacity-0 md:focus-within:opacity-100 md:group-hover:opacity-100">
                        <button type="button" title="Editar" aria-label={`Editar ${e.name}`} onClick={() => onEditar(e)}
                          className="grid size-7 cursor-pointer place-items-center rounded-md text-(--fg-muted) hover:bg-white hover:text-foreground">
                          <Icon icon={PencilIcon} size="sm" />
                        </button>
                        <button type="button" title="Eliminar" aria-label={`Eliminar ${e.name}`} onClick={() => setAEliminar(e)}
                          className="grid size-7 cursor-pointer place-items-center rounded-md text-(--fg-muted) hover:bg-white hover:text-danger">
                          <Icon icon={Trash2Icon} size="sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={onNueva}><Icon icon={PlusIcon} size="xs" />Agregar nueva etiqueta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!aEliminar} onOpenChange={o => { if (!o && !eliminando) setAEliminar(null) }}>
        <AlertDialogContent className="sm:max-w-[420px]">
          {aEliminar && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar la etiqueta «{aEliminar.name}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  Los gastos ya registrados con esta etiqueta{uso[aEliminar.id] ? ` (${uso[aEliminar.id]})` : ''} no se van a eliminar.
                  Solo no vas a poder usarla para nuevos gastos.
                  {aEliminar.expense_type === 'FIXED' ? ' Y deja de aparecer como pendiente en los meses que no se pagó.' : ''}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'destructive' })}
                  disabled={eliminando}
                  onClick={ev => { ev.preventDefault(); void eliminar(aEliminar) }}
                >
                  {eliminando ? 'Eliminando…' : 'Eliminar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
