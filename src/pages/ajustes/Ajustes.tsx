import { Navigate, useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { inicioDe } from '@/components/nav'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { VideoPresentacionMail } from './components/VideoPresentacionMail'

const PESTAÑAS = [
  { id: 'video', label: 'Vídeo presentación por mail' },
] as const
type Pestaña = (typeof PESTAÑAS)[number]['id']

/* NUEVO (20/10/2026). Ajustes, por ahora entera solo SUPERADMIN: además del `roles` de `NAV`
   (que ya rebota en `RequireRol`), el gate va acá adentro para que una pestaña nueva no quede
   abierta si algún día la entrada de `NAV` se abre a otro rol. La pestaña vive en `?tab=`. */
export function Ajustes() {
  const { yo, esSuperadmin } = useCarteras()
  const [params, setParams] = useSearchParams()
  const pestaña: Pestaña = PESTAÑAS.find(p => p.id === params.get('tab'))?.id ?? 'video'

  if (!yo) return null
  if (!esSuperadmin) return <Navigate to={inicioDe(yo.rol)} replace />

  return (
    <div className="ui-scale-md flex flex-col gap-4 p-4 max-md:p-2">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">Ajustes</h1>
        <div role="tablist" className="inline-flex rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          {PESTAÑAS.map(p => (
            <button key={p.id} type="button" role="tab" aria-selected={pestaña === p.id}
              onClick={() => setParams(prev => { prev.set('tab', p.id); return prev }, { replace: true })}
              className={cn('h-8 cursor-pointer rounded-md px-3 text-[12.5px]', pestaña === p.id ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
              {p.label}
            </button>
          ))}
        </div>
      </header>
      {pestaña === 'video' && <VideoPresentacionMail />}
    </div>
  )
}
