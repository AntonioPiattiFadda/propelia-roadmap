import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useGuardarPlanningDiario, usePlanningDiario } from '@/hooks/usePlanningDiario'

/* El esqueleto del día de trabajo. Se pliega siempre: se abre desde la barra lateral cuando
   alguien lo quiere mirar y se lee primero; editar es un paso aparte, para que abrirlo a
   consultar no deje el cursor adentro de un texto que es de todos. */
export function PlanningDiario({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: texto = '', isLoading, isError } = usePlanningDiario()
  const guardar = useGuardarPlanningDiario()
  const [borrador, setBorrador] = useState<string | null>(null)
  const editando = borrador !== null

  const cerrar = (v: boolean) => {
    // Cerrar con un borrador a medias lo descarta: se vuelve a leer lo guardado al abrir.
    if (!v) setBorrador(null)
    onOpenChange(v)
  }

  const alGuardar = () => {
    if (borrador === null) return
    guardar.mutate(borrador, {
      onSuccess: () => { setBorrador(null); toast.success('Planning guardado') },
      onError: () => toast.error('No se pudo guardar el planning'),
    })
  }

  return (
    <Sheet open={open} onOpenChange={cerrar}>
      <SheetContent side="left" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Planning diario</SheetTitle>
          <SheetDescription>La estructura de trabajo de cada día, para todo el equipo.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : isError ? (
            <p className="text-sm text-destructive">No pudimos cargar el planning.</p>
          ) : editando ? (
            <Textarea
              autoFocus
              value={borrador}
              onChange={e => setBorrador(e.target.value)}
              placeholder={'09:00 – Revisar CRM\n10:00 – Llamadas\n…'}
              className="h-full min-h-[300px] resize-none font-mono text-sm"
            />
          ) : texto.trim() ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{texto}</div>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay planning. Tocá «Editar» para escribirlo.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {editando ? (
            <>
              <Button variant="outline" onClick={() => setBorrador(null)} disabled={guardar.isPending}>Cancelar</Button>
              <Button onClick={alGuardar} disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setBorrador(texto)} disabled={isLoading || isError}>
              <Pencil /> Editar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
