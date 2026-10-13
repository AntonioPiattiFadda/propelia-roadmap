import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { localTodayIso } from '@/lib/calendarDate'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { useCrmCatalogos } from '@/pages/crm/hooks/useCrmCatalogos'
import { useCrmLeads, useReunionesDelMes, useTareasPendientes } from '@/pages/crm/hooks/useCrmLeads'
import { useCrmRealtime } from '@/pages/crm/hooks/useCrmRealtime'
import { TablaEquipo } from './components/TablaEquipo'
import { VisibilityMatrix } from './components/VisibilityMatrix'
import { NuevoMiembroDialog } from './components/NuevoMiembroDialog'
import { BajaMiembroDialog } from './components/BajaMiembroDialog'
import type { Usuario } from '@/pages/crm/types'
import { estadisticasPorCartera } from './lib/estadisticasPorCartera'

type Pestaña = 'tabla' | 'visibilidad'
type Estado = 'activos' | 'inactivos'

/* Equipo: los números por cartera y quién ve a quién. Comparte la cache con el CRM (mismas keys):
   entrar acá después del CRM no pide nada de nuevo. El alta de miembros va por la edge function
   `crear-miembro` y la baja por la RPC `crm_dar_de_baja_miembro` (las dos solo SUPERADMIN); los
   demás cambios de `users` siguen por MCP. */
export function Equipo() {
  useCrmRealtime()
  const [pestaña, setPestaña] = useState<Pestaña>('tabla')
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [deBaja, setDeBaja] = useState<Usuario | null>(null)
  const [estado, setEstado] = useState<Estado>('activos')
  const { myId, usuarios, visibles, esSuperadmin, isLoading: cargandoCarteras } = useCarteras()
  const { etapasPorId, isLoading: cargandoCatalogos } = useCrmCatalogos()
  const leadsQ = useCrmLeads()
  const tareasQ = useTareasPendientes()
  const reunionesQ = useReunionesDelMes()

  const filas = useMemo(() => estadisticasPorCartera({
    carteras: visibles,
    leads: leadsQ.data ?? [],
    tareasPendientes: tareasQ.data ?? [],
    reunionesDelMes: reunionesQ.data ?? [],
    etapas: etapasPorId,
    hoy: localTodayIso(),
  }), [visibles, leadsQ.data, tareasQ.data, reunionesQ.data, etapasPorId])

  const activos = useMemo(() => filas.filter(f => f.usuario.activo), [filas])
  const inactivos = useMemo(() => filas.filter(f => !f.usuario.activo), [filas])

  // Mientras no se sabe quién sos (sesión/permisos) `visibles` es []: sin este corte se pintaría
  // una tabla vacía que se lee como «no hay nadie».
  const cargando = cargandoCarteras || cargandoCatalogos || leadsQ.isLoading || tareasQ.isLoading || reunionesQ.isLoading

  return (
    <div className="ui-scale-md flex flex-col gap-3 p-4 max-md:p-2">
      <header className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">Equipo</h1>
        {/* La matriz la ve solo un SUPERADMIN: es quien puede cambiarla (la RLS lo exige). */}
        {esSuperadmin && (
          <div role="tablist" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
            {(['tabla', 'visibilidad'] as const).map(p => (
              <button key={p} type="button" role="tab" aria-selected={pestaña === p} onClick={() => setPestaña(p)}
                className={cn('h-8 cursor-pointer rounded-md px-3 text-[12.5px]', pestaña === p ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
                {p === 'tabla' ? 'Tabla' : 'Visibilidad'}
              </button>
            ))}
          </div>
        )}
        {/* Solo SUPERADMIN: la edge function lo exige igual. */}
        {esSuperadmin && (
          <Button size="sm" className="ml-auto" onClick={() => setNuevoAbierto(true)}>
            <Plus className="size-4" />
            Nuevo miembro
          </Button>
        )}
      </header>
      {pestaña === 'visibilidad' && esSuperadmin ? (
        <VisibilityMatrix />
      ) : cargando ? (
        <div className="h-48 animate-pulse rounded-lg bg-secondary" />
      ) : leadsQ.error && !leadsQ.data ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-foreground">No pudimos cargar los números.</p>
          <button type="button" className="text-sm underline" onClick={() => void leadsQ.refetch()}>Reintentar</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Los inactivos siguen apareciendo porque sus leads viejos pueden seguir en su cartera,
              pero aparte: en la misma lista se leían como parte del equipo de hoy. */}
          <div role="tablist" className="inline-flex self-start rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
            {([['activos', activos.length], ['inactivos', inactivos.length]] as const).map(([e, n]) => (
              <button key={e} type="button" role="tab" aria-selected={estado === e} onClick={() => setEstado(e)}
                className={cn('h-8 cursor-pointer rounded-md px-3 text-[12.5px]', estado === e ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
                {e === 'activos' ? 'Activos' : 'Inactivos'} <span className="tabular-nums text-(--fg-muted)">{n}</span>
              </button>
            ))}
          </div>
          {estado === 'inactivos' && inactivos.length === 0 ? (
            <p className="text-sm text-(--fg-2)">No hay nadie dado de baja.</p>
          ) : (
            <TablaEquipo filas={estado === 'activos' ? activos : inactivos} myId={myId}
              onDarDeBaja={esSuperadmin ? setDeBaja : undefined} />
          )}
        </div>
      )}
      <NuevoMiembroDialog open={nuevoAbierto} onOpenChange={setNuevoAbierto} />
      <BajaMiembroDialog usuario={deBaja} usuarios={usuarios} onOpenChange={open => { if (!open) setDeBaja(null) }} />
    </div>
  )
}
