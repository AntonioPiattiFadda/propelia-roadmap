import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { MobileTabBar } from '@/components/MobileTabBar'
import { puedeEntrar } from '@/components/nav'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { useAlarmasDeTareas } from '@/pages/crm/hooks/useAlarmasDeTareas'
import { useAvisosDeEmails } from '@/pages/crm/hooks/useEmails'
import { useAvisosDeDemos } from '@/pages/demos/hooks/useDemos'

// El del producto sin el asistente, las sugerencias ni el saludo al entrar.
export function AppLayout() {
  // Las alarmas de las tareas con hora (17/10/2026) viven acá y no en la página del CRM: siguen
  // sonando si uno se fue al Roadmap en la misma pestaña. Solo para quien puede entrar al CRM.
  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)
  const conCrm = !!yo && puedeEntrar(yo.rol, '/crm')
  useAlarmasDeTareas(conCrm)
  // Lo mismo con los emails que no llegaron (20/10/2026): el toast sale aunque estés en otra página.
  useAvisosDeEmails(conCrm)
  // Y la demo nueva (20/10/2026): solo a quien puede entrar a Demos, o sea a los SUPERADMIN.
  useAvisosDeDemos(!!yo && puedeEntrar(yo.rol, '/demos'))

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
