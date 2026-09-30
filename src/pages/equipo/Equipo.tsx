import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { localTodayIso } from '@/lib/calendarDate'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { useCrmCatalogos } from '@/pages/crm/hooks/useCrmCatalogos'
import { useCrmLeads, useReunionesDelMes, useTareasPendientes } from '@/pages/crm/hooks/useCrmLeads'
import { useCrmRealtime } from '@/pages/crm/hooks/useCrmRealtime'
import { TablaEquipo } from './components/TablaEquipo'
import { VisibilityMatrix } from './components/VisibilityMatrix'
import { estadisticasPorCartera } from './lib/estadisticasPorCartera'

type Pestaña = 'tabla' | 'visibilidad'

/* Equipo: los números por cartera y quién ve a quién. Comparte la cache con el CRM (mismas keys):
   entrar acá después del CRM no pide nada de nuevo. Sin alta de miembros: `users` sigue por MCP. */
export function Equipo() {
  useCrmRealtime()
  const [pestaña, setPestaña] = useState<Pestaña>('tabla')
  const { visibles, esSuperadmin, isLoading: cargandoCarteras } = useCarteras()
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
    now: Date.now(),
  }), [visibles, leadsQ.data, tareasQ.data, reunionesQ.data, etapasPorId])

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
        <TablaEquipo filas={filas} />
      )}
    </div>
  )
}
