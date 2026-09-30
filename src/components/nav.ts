import { ListChecks, Users, Wallet, type LucideIcon } from 'lucide-react'

export type NavItem = { id: string; icon: LucideIcon; label: string; path: string }

/* Se escribe una vez y la leen la barra lateral y la de pestañas del teléfono: con dos
   copias, la página que se agrega en una no llega nunca a la otra. */
export const NAV: NavItem[] = [
  { id: 'roadmap', icon: ListChecks, label: 'Roadmap', path: '/roadmap' },
  { id: 'crm', icon: Users, label: 'CRM', path: '/crm' },
  { id: 'caja', icon: Wallet, label: 'Caja', path: '/caja' },
]

// Con la barra y no un `startsWith` pelado: si no, `/crm-viejo` marcaría activa la entrada del CRM.
export const estaActivo = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(path + '/')
