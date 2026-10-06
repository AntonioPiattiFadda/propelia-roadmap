import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthPageShell } from '@/pages/auth/AuthPageShell'
import { SignIn } from '@/pages/auth/SignIn'
import { PublicRoutesAuthCheck, RequireAcceso, RequireAuth } from '@/pages/auth/guards'
import { Roadmap } from '@/pages/roadmap/Roadmap'
import { Backlog } from '@/pages/roadmap/Backlog'
import { Crm } from '@/pages/crm/Crm'
import { Equipo } from '@/pages/equipo/Equipo'
import { Caja } from '@/pages/caja/Caja'
import { NotFound } from '@/pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Una sesión vencida no se arregla reintentando; un corte de red sí.
      retry: (intentos, error) => {
        if (error instanceof Error && /JWT|No active session/i.test(error.message)) return false
        return intentos < 3
      },
    },
  },
})

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* Sin TooltipProvider acá: lo pone `SidebarProvider` (components/ui/sidebar), igual que en el producto. */}
    <Toaster />
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoutesAuthCheck />}>
          <Route element={<AuthPageShell />}>
            <Route path="/sign-in" element={<SignIn />} />
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<RequireAcceso />}>
            <Route element={<AppLayout />}>
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/roadmap/backlog" element={<Backlog />} />
              {/* La ruta vieja, de cuando el backlog era una página hermana: que no se rompan los favoritos. */}
              <Route path="/backlog" element={<Navigate to="/roadmap/backlog" replace />} />
              <Route path="/crm" element={<Crm />} />
              <Route path="/equipo" element={<Equipo />} />
              <Route path="/caja" element={<Caja />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/roadmap" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
)

export default App
