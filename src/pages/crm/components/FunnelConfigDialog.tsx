import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { useCatalogoMutaciones } from '../hooks/useCatalogoMutaciones'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { StagesTable } from './StagesTable'

// Colores para las prioridades nuevas, por turno: la pantalla no tiene selector de color (se
// cambia por MCP si hace falta) y una prioridad sin color no se distingue en el funnel.
const PALETA = ['#639922', '#EF9F27', '#E24B4A', '#B84300', '#3B7DD8', '#8E5BD0', '#2A9D8F', '#6B7280']

/* Copiado de propelia-frontend (FunnelConfigDialog + FunnelEditor, fundidos): acá hay un solo
   funnel y ninguna organización. Crear, renombrar, reordenar y borrar etapas con su prioridad y
   tolerancia; `allow_delete`/`allow_reorder`/`allow_rename` se respetan (Nuevo y Descartado no se
   borran). Solo lo monta la cabecera para un SUPERADMIN; la RLS lo exige igual. */
export function FunnelConfigDialog() {
  const { etapasPorId, prioridadesActivas, isLoading } = useCrmCatalogos()
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
      label: 'Nueva etapa', value: 'CUSTOM', position: nueva, priority_id: prioridadesActivas[0]?.id ?? null,
      management_tolerance_hours: 24, is_out_of_funnel: false, allow_delete: true, allow_reorder: true, allow_rename: true,
    })
  }

  const crearPrioridad = async (): Promise<string | null> => {
    try {
      const creada = await m.crearPrioridad.mutateAsync({
        name: 'Nueva prioridad', color: PALETA[prioridadesActivas.length % PALETA.length], position: prioridadesActivas.length + 1,
      })
      return creada.id
    } catch {
      return null
    }
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
      <DialogContent className="w-[calc(100%-2rem)] p-4 sm:max-w-[1080px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Configuración del funnel</DialogTitle>
          <DialogDescription>Las etapas por las que pasa un lead, en orden, con su prioridad y su tiempo de gestión. Los cambios se guardan solos.</DialogDescription>
        </DialogHeader>
        <div className="ui-scale overflow-x-auto">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-secondary" />
          ) : (
            <StagesTable
              stages={etapas}
              priorities={prioridadesActivas}
              onUpdate={(id, payload) => m.actualizarEtapa.mutate({ id, payload })}
              onCreate={crear}
              onDelete={id => m.borrarEtapa.mutate(id)}
              onReorder={items => m.reordenarEtapas.mutate(items)}
              isDeletePending={m.borrarEtapa.isPending}
              onRenamePriority={(id, name) => m.actualizarPrioridad.mutate({ id, payload: { name } })}
              onDeletePriority={id => m.borrarPrioridad.mutate(id)}
              onCreatePriority={crearPrioridad}
              onReorderPriorities={items => m.reordenarPrioridades.mutate(items)}
              isPriorityDeletePending={m.borrarPrioridad.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
