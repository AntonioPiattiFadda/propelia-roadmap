import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { MobileTabBar } from '@/components/MobileTabBar'
import { puedeEntrar } from '@/components/nav'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { useAlarmasDeTareas } from '@/pages/crm/hooks/useAlarmasDeTareas'

// El del producto sin el asistente, las sugerencias ni el saludo al entrar.
export function AppLayout() {
  // Las alarmas de las tareas con hora (17/10/2026) viven acá y no en la página del CRM: siguen
  // sonando si uno se fue al Roadmap en la misma pestaña. Solo para quien puede entrar al CRM.
  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)
  useAlarmasDeTareas(!!yo && puedeEntrar(yo.rol, '/crm'))

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <MobileTabBar />
    </SidebarProvider>
  )
}
