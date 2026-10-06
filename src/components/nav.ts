import { ListChecks, ListTodo, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react'

export type NavItem = { id: string; icon: LucideIcon; label: string; path: string; hijos?: NavItem[] }

/* Se escribe una vez y la leen la barra lateral y la de pestañas del teléfono: con dos
   copias, la página que se agrega en una no llega nunca a la otra. El backlog es un
   subgrupo del roadmap y no una página hermana: la barra lateral lo dibuja colgando y la de
   pestañas, que no tiene lugar para niveles, solo muestra el primero. */
export const NAV: NavItem[] = [
  {
    id: 'roadmap', icon: ListChecks, label: 'Roadmap', path: '/roadmap',
    hijos: [{ id: 'backlog', icon: ListTodo, label: 'Backlog', path: '/roadmap/backlog' }],
  },
  { id: 'crm', icon: Users, label: 'CRM', path: '/crm' },
  { id: 'equipo', icon: UsersRound, label: 'Equipo', path: '/equipo' },
  { id: 'caja', icon: Wallet, label: 'Caja', path: '/caja' },
]

// Con la barra y no un `startsWith` pelado: si no, `/crm-viejo` marcaría activa la entrada del CRM.
export const estaActivo = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(path + '/')

// Parado en un hijo, se marca el hijo y no el padre: dos renglones prendidos no dicen dónde estás.
export const entradaActiva = (pathname: string, item: NavItem) =>
  estaActivo(pathname, item.path) && !item.hijos?.some(h => estaActivo(pathname, h.path))
