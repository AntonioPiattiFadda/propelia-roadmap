import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useCatalogoMutaciones } from '../hooks/useCatalogoMutaciones'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { StagesTable } from './StagesTable'

/* Copiado de propelia-frontend (FunnelConfigDialog + FunnelEditor, fundidos): acá hay un solo
   funnel y ninguna organización. Crear, renombrar, reordenar y borrar etapas (sin prioridad ni
   tiempo de gestión desde el 10/10/2026: se sacaron del front para rediseñarlos); `allow_delete`/`allow_reorder`/`allow_rename` se respetan (Nuevo y Descartado no se
   borran). Solo lo monta la cabecera para un SUPERADMIN; la RLS lo exige igual. */
export function FunnelConfigDialog() {
  const { etapasPorId, isLoading } = useCrmCatalogos()
  const m = useCatalogoMutaciones()
  const etapas = [...etapasPorId.values()]

  const crear = () => {
    const enFunnel = etapas.filter(e => e.deleted_at == null && !e.is_out_of_funnel)
    const nueva = Math.max(0, ...enFunnel.map(e => e.position)) + 1
    // Se corre +1 todo lo que está desde esa posición (Descartado incluido), para que la nueva
    // entre al final del funnel y antes de los de afuera, como en el producto.
    const correr = etapas.filter(e => e.deleted_at == null && e.position >= nueva).map(e => ({ id: e.id, position: e.position + 1 }))
    if (correr.length > 0) m.reordenarEtapas.mutate(correr)
    m.crearEtapa.mutate({
      label: 'Nuevo estado', value: 'CUSTOM', position: nueva,
      is_out_of_funnel: false, allow_delete: true, allow_reorder: true, allow_rename: true,
    })
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Fantasma: se toca una vez al mes; no compite con «Nuevo lead». */}
        <Button variant="ghost">
          <Icon icon={SlidersHorizontal} size="xs" />
          Funnel
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] p-4 sm:max-w-[1040px]">
        {/* 1040 y no los 760 de antes: con Tareas, Dashboard y Onboarding la tabla ya no entraba
            y se cortaba a la derecha. */}
        <DialogHeader className="sr-only">
          <DialogTitle>Configuración del funnel</DialogTitle>
          <DialogDescription>Los estados por los que pasa un lead, en orden. Los cambios se guardan solos.</DialogDescription>
        </DialogHeader>
        <div className="ui-scale overflow-x-auto">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-secondary" />
          ) : (
            <StagesTable
              stages={etapas}
              onUpdate={(id, payload) => m.actualizarEtapa.mutate({ id, payload })}
              onCreate={crear}
              onDelete={id => m.borrarEtapa.mutate(id)}
              onReorder={items => m.reordenarEtapas.mutate(items)}
              isDeletePending={m.borrarEtapa.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
