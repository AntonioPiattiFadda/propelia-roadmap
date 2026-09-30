import { Link, useLocation } from 'react-router-dom'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { NAV, estaActivo } from '@/components/nav'

/* Navegación fija abajo, solo bajo 768px. Va en el layout y no en cada página. Su alto se
   publica en `--tabbar-h` (index.css, copiado del producto), y de ahí lo lee el padding
   inferior del `main`: se toca en un solo lugar. */
export function MobileTabBar() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Navegación principal"
      className="no-print fixed inset-x-0 bottom-0 z-40 flex h-(--tabbar-h) items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {NAV.map(item => {
        const activo = estaActivo(pathname, item.path)
        return (
          <Link
            key={item.id}
            to={item.path}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none',
              activo ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon icon={item.icon} size="lg" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
