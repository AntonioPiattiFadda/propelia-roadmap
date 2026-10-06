import { ListChecks, ListTodo, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react'
import type { Database } from '@/types/database.types'

export type Rol = Database['public']['Enums']['user_role']
export type NavItem = { id: string; icon: LucideIcon; label: string; path: string; roles: readonly Rol[] }

const TODOS: readonly Rol[] = ['SUPERADMIN', 'SDR']
const SOLO_SUPERADMIN: readonly Rol[] = ['SUPERADMIN']

/* Se escribe una vez y la leen la barra lateral, la de pestañas del teléfono y el guard de
   ruta: con dos copias, la página que se agrega en una no llega nunca a la otra, y un menú que
   ofrece lo que el guard rechaza es un enlace que rebota. Ojo: esto es solo el front — la RLS
   de las `roadmap_*` sigue pidiendo nada más que `es_usuario()`. */
export const NAV: NavItem[] = [
  { id: 'roadmap', icon: ListChecks, label: 'Roadmap', path: '/roadmap', roles: SOLO_SUPERADMIN },
  { id: 'backlog', icon: ListTodo, label: 'Backlog', path: '/backlog', roles: SOLO_SUPERADMIN },
  { id: 'crm', icon: Users, label: 'CRM', path: '/crm', roles: TODOS },
  { id: 'equipo', icon: UsersRound, label: 'Equipo', path: '/equipo', roles: SOLO_SUPERADMIN },
  { id: 'caja', icon: Wallet, label: 'Caja', path: '/caja', roles: SOLO_SUPERADMIN },
]

// Con la barra y no un `startsWith` pelado: si no, `/crm-viejo` marcaría activa la entrada del CRM.
export const estaActivo = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(path + '/')

export const navDe = (rol: Rol) => NAV.filter(n => n.roles.includes(rol))

export const puedeEntrar = (rol: Rol, pathname: string) => navDe(rol).some(n => estaActivo(pathname, n.path))

/** A dónde va quien entra a una página que no es suya: la primera que sí lo es. */
export const inicioDe = (rol: Rol) => navDe(rol)[0]?.path ?? '/crm'
