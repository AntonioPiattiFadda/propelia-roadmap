import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CalendarClock, LogOut } from 'lucide-react'
import { PlanningDiario } from '@/components/PlanningDiario'
import propeliaIcon from '@/assets/propelia-icon.png'
import { entradaActiva, estaActivo, hrefDe, navDe, soloSuperadmin } from '@/components/nav'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { useCerrarSesion } from '@/hooks/useCerrarSesion'
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'

/* La del producto, recortada: un solo grupo de navegación, quién sos y cerrar sesión. Sin
   tutorial. Las páginas que solo ve un SUPERADMIN llevan el badge SA, como en el producto (21/10/2026). Ofrece solo las páginas de tu rol (`navDe`). Se abre al pasar el
   cursor, como la del tablero vanilla y la del producto. */
export function Sidebar() {
  const { pathname } = useLocation()
  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)
  const cerrarSesion = useCerrarSesion()
  const { setOpen, isMobile, setOpenMobile } = useSidebar()

  const abrir = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cerrar = useRef<ReturnType<typeof setTimeout> | null>(null)

  // En el teléfono un toque emite mouseenter: sin este corte, tocar el panel dispararía
  // también el desplegado de escritorio.
  const alEntrar = () => {
    if (isMobile) return
    if (cerrar.current) { clearTimeout(cerrar.current); cerrar.current = null }
    abrir.current = setTimeout(() => setOpen(true), 200)
  }
  const alSalir = () => {
    if (isMobile) return
    if (abrir.current) { clearTimeout(abrir.current); abrir.current = null }
    cerrar.current = setTimeout(() => setOpen(false), 200)
  }
  // En el teléfono el panel tapa la pantalla: si no se cierra al elegir, llegás a la página sin verla.
  const cerrarEnTelefono = () => { if (isMobile) setOpenMobile(false) }
  const [planningAbierto, setPlanningAbierto] = useState(false)

  return (
    <>
    <SidebarRoot collapsible="icon" onMouseEnter={alEntrar} onMouseLeave={alSalir}>
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <img
                src={propeliaIcon}
                alt="Propelia"
                className="h-[42px] w-[42px] shrink-0 rounded-lg object-contain group-data-[collapsible=icon]:h-[28px] group-data-[collapsible=icon]:w-[28px] group-data-[collapsible=icon]:translate-x-[2px] group-data-[collapsible=icon]:translate-y-[5px]"
              />
              <h2 className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                Propelia
              </h2>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarMenu>
            {(yo ? navDe(yo.rol) : []).map(item => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild isActive={entradaActiva(pathname, item)} tooltip={item.label}>
                  <Link to={item.path} onClick={cerrarEnTelefono}>
                    <item.icon />
                    {/* `truncate` explícito y no el `[&>span:last-child]:truncate` del primitivo: con
                        badge, el último hijo es el badge y la etiqueta partiría en dos líneas. */}
                    <span className="truncate">{item.label}</span>
                    {soloSuperadmin(item) && (
                      <SuperadminBadge className="ml-auto group-data-[collapsible=icon]:hidden" />
                    )}
                  </Link>
                </SidebarMenuButton>
                {/* Siempre desplegado: son uno o dos hijos y plegarlos sería un clic de más
                    para llegar al backlog. Con la barra en íconos se esconde solo. */}
                {item.hijos && (
                  <SidebarMenuSub>
                    {item.hijos.map(hijo => (
                      <SidebarMenuSubItem key={hijo.id}>
                        <SidebarMenuSubButton asChild isActive={!hijo.nuevaPestana && estaActivo(pathname, hijo.path)}>
                          <Link
                            to={hrefDe(hijo)} onClick={cerrarEnTelefono}
                            {...(hijo.nuevaPestana && { target: '_blank', rel: 'noopener' })}
                          >
                            <hijo.icon />
                            <span className="truncate">{hijo.label}</span>
                            {soloSuperadmin(hijo) && <SuperadminBadge className="ml-auto" />}
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* No es una página: es un panel que se despliega encima de la que estés mirando, para
            consultar el esqueleto del día sin irte de lo que estabas haciendo. */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Planning diario"
                onClick={() => { cerrarEnTelefono(); setPlanningAbierto(true) }}
              >
                <CalendarClock />
                <span className="truncate">Planning diario</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* `mt-auto` la empuja al fondo: el hueco queda entre la navegación y la cuenta. */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Cuenta</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                {/* El color y las iniciales salen de `users`: son los mismos que pinta el tablero. */}
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: yo?.color ?? 'var(--muted-foreground)' }}
                >
                  {yo?.iniciales ?? '·'}
                </div>
                <div className="overflow-hidden leading-tight group-data-[collapsible=icon]:hidden">
                  <div className="truncate text-[13px] font-medium text-sidebar-foreground">{yo?.nombre ?? '…'}</div>
                  <div className="truncate text-[11px] text-sidebar-foreground/60">{yo?.email ?? ''}</div>
                </div>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={cerrarSesion} tooltip="Cerrar sesión">
                <LogOut />
                <span>Cerrar sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
    <PlanningDiario open={planningAbierto} onOpenChange={setPlanningAbierto} />
    </>
  )
}
