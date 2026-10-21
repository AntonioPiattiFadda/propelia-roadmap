import { CalendarCheck, CalendarDays, ListChecks, ListTodo, Settings, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react'
import type { Database } from '@/types/database.types'

export type Rol = Database['public']['Enums']['user_role']
export type NavItem = { id: string; icon: LucideIcon; label: string; path: string; roles: readonly Rol[]; hijos?: NavItem[] }

const TODOS: readonly Rol[] = ['SUPERADMIN', 'SDR']
const SOLO_SUPERADMIN: readonly Rol[] = ['SUPERADMIN']

/* Se escribe una vez y la leen la barra lateral, la de pestañas del teléfono y el guard de
   ruta: con dos copias, la página que se agrega en una no llega nunca a la otra, y un menú que
   ofrece lo que el guard rechaza es un enlace que rebota. Ojo: esto es solo el front — la RLS
   de las `roadmap_*` sigue pidiendo nada más que `es_usuario()`. El backlog es un subgrupo del
   roadmap y no una página hermana: la barra lateral lo dibuja colgando y la de pestañas, que no
   tiene lugar para niveles, solo muestra el primero. Cada hijo lleva sus propios `roles`. */
export const NAV: NavItem[] = [
  {
    id: 'roadmap', icon: ListChecks, label: 'Roadmap', path: '/roadmap', roles: SOLO_SUPERADMIN,
    hijos: [{ id: 'backlog', icon: ListTodo, label: 'Backlog', path: '/roadmap/backlog', roles: SOLO_SUPERADMIN }],
  },
  { id: 'crm', icon: Users, label: 'CRM', path: '/crm', roles: TODOS },
  // La agenda y Ajustes son de todos (21/10/2026): cada uno conecta su Google y mira su semana.
  // La pestaña del vídeo de Ajustes sigue siendo solo SUPERADMIN, con su gate adentro.
  { id: 'agenda', icon: CalendarDays, label: 'Agenda', path: '/agenda', roles: TODOS },
  { id: 'demos', icon: CalendarCheck, label: 'Demos', path: '/demos', roles: SOLO_SUPERADMIN },
  { id: 'equipo', icon: UsersRound, label: 'Equipo', path: '/equipo', roles: SOLO_SUPERADMIN },
  { id: 'caja', icon: Wallet, label: 'Caja', path: '/caja', roles: SOLO_SUPERADMIN },
  { id: 'ajustes', icon: Settings, label: 'Ajustes', path: '/ajustes', roles: TODOS },
]

/* La lleva el badge SA de la barra lateral (`SuperadminBadge`, copiado del producto): avisa que esa
   entrada no está en la pantalla del resto del equipo. Es informativo, no controla nada. */
export const soloSuperadmin = (item: NavItem) => !item.roles.some(r => r !== 'SUPERADMIN')

// Con la barra y no un `startsWith` pelado: si no, `/crm-viejo` marcaría activa la entrada del CRM.
export const estaActivo = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(path + '/')

// Parado en un hijo, se marca el hijo y no el padre: dos renglones prendidos no dicen dónde estás.
export const entradaActiva = (pathname: string, item: NavItem) =>
  estaActivo(pathname, item.path) && !item.hijos?.some(h => estaActivo(pathname, h.path))

/** Lo que ve cada rol, con los hijos ya recortados por su propio `roles`. */
export const navDe = (rol: Rol): NavItem[] =>
  NAV.filter(n => n.roles.includes(rol)).map(n =>
    n.hijos ? { ...n, hijos: n.hijos.filter(h => h.roles.includes(rol)) } : n)

const TODAS = NAV.flatMap(n => [n, ...(n.hijos ?? [])])

/* Decide la entrada MÁS específica que calce, no la primera: `/roadmap/backlog` también empieza
   con `/roadmap/`, y si se validara por el padre un hijo con otros roles pasaría de largo. */
export const puedeEntrar = (rol: Rol, pathname: string) => {
  const entrada = TODAS
    .filter(n => estaActivo(pathname, n.path))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return !!entrada && entrada.roles.includes(rol)
}

/** A dónde va quien entra a una página que no es suya: la primera que sí lo es. */
export const inicioDe = (rol: Rol) => navDe(rol)[0]?.path ?? '/crm'
