import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { MobileTabBar } from '@/components/MobileTabBar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

// El del producto sin el asistente, las sugerencias ni el saludo al entrar.
export function AppLayout() {
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
