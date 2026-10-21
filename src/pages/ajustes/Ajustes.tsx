import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { useCarteras } from '@/pages/crm/hooks/useCarteras'
import { IntegrationsPanel } from './components/IntegrationsPanel'
import { LeadNotificationsCard } from './components/LeadNotificationsCard'
import { VideoPresentacionMail } from './components/VideoPresentacionMail'

type Pestaña = { id: string; label: string; soloSuperadmin: boolean }

const PESTAÑAS: Pestaña[] = [
  { id: 'integraciones', label: 'Integraciones', soloSuperadmin: false },
  // Como en el producto, donde la ve el admin de la org: acá, el SUPERADMIN (21/10/2026).
  { id: 'avisos', label: 'Avisos a leads', soloSuperadmin: true },
  { id: 'video', label: 'Vídeo presentación por mail', soloSuperadmin: true },
]

/* Ajustes (20/10/2026). Desde el 21/10/2026 la página es de todos: «Integraciones» (conectar tu
   Google Calendar, copiado del producto) la ve cualquiera. El vídeo sigue siendo solo SUPERADMIN, y
   el gate va acá adentro: la pestaña ni se ofrece a los demás, y un `?tab=video` cae en la primera.
   El badge SA no controla nada: avisa que el resto del equipo no la tiene. La pestaña vive en `?tab=`. */
export function Ajustes() {
  const { yo, esSuperadmin } = useCarteras()
  const [params, setParams] = useSearchParams()

  if (!yo) return null

  const visibles = PESTAÑAS.filter(p => !p.soloSuperadmin || esSuperadmin)
  const pestaña = visibles.find(p => p.id === params.get('tab'))?.id ?? visibles[0].id

  return (
    <div className="ui-scale-md flex flex-col gap-4 p-4 max-md:p-2">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">Ajustes</h1>
        <div role="tablist" className="inline-flex flex-wrap rounded-lg bg-(--surface-2) p-0.5 [border:1px_solid_var(--line)]">
          {visibles.map(p => (
            <button key={p.id} type="button" role="tab" aria-selected={pestaña === p.id}
              onClick={() => setParams(prev => { prev.set('tab', p.id); return prev }, { replace: true })}
              className={cn('inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-[12.5px]', pestaña === p.id ? 'bg-card font-semibold shadow-xs' : 'text-(--fg-2)')}>
              {p.label}
              {p.soloSuperadmin && <SuperadminBadge className="ml-1.5" />}
            </button>
          ))}
        </div>
      </header>
      {pestaña === 'integraciones' && <IntegrationsPanel />}
      {pestaña === 'avisos' && esSuperadmin && <LeadNotificationsCard />}
      {pestaña === 'video' && esSuperadmin && <VideoPresentacionMail />}
    </div>
  )
}
