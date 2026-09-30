import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

/* El cache se limpia al SALIR y no al entrar: si el próximo que entra es otro, la app no
   recarga, y sin esto la fila `yo` del anterior seguiría viva. Lo usan la barra lateral y
   la pantalla de «sin acceso». */
export function useCerrarSesion() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/sign-in', { replace: true })
  }
}
