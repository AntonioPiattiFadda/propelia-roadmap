import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* La fila de `users` de quien entró: dice si tiene acceso y quién es (nombre, iniciales,
   color). `maybeSingle` y no `single`: sin fila no es un error — es exactamente el caso
   «sin acceso», y lo decide `accesoDe()`, no un throw. */
export function useYo(uid: string | undefined) {
  return useQuery({
    queryKey: ['yo', uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').eq('id', uid ?? '').maybeSingle()
      if (error) throw error
      return data
    },
  })
}
