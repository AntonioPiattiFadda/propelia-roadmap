import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* El planning diario es UNO para todo el equipo y vive en una fila de `roadmap_notas` con id
   propio, como la nota del backlog: la tabla ya está corrida, ya tiene su RLS por `es_usuario()`
   y el vanilla corta por id (`grupo-`, `nota-backlog`), así que esta fila no se lee como otra cosa.
   `texto` es lo escrito; `titulo` va vacío y `orden` no ubica nada. */
export const ID_PLANNING = 'planning-diario'
const CLAVE = ['planning-diario']

export function usePlanningDiario() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_notas').select('texto').eq('id', ID_PLANNING).maybeSingle()
      if (error) throw error
      // Sin fila es «todavía nadie lo escribió», no un error.
      return data?.texto ?? ''
    },
  })
}

export function useGuardarPlanningDiario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase
        .from('roadmap_notas').upsert({ id: ID_PLANNING, texto, titulo: '', orden: 0 })
      if (error) throw error
      return texto
    },
    onSuccess: texto => qc.setQueryData(CLAVE, texto),
  })
}
