import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* Las notas de la Caja son UNAS para todo el equipo y viven en una fila de `roadmap_notas` con id
   propio, como el planning diario y la nota del backlog: sin migración, con la RLS por
   `es_usuario()` que la tabla ya tiene. `texto` es lo escrito; `titulo` va vacío y `orden` no
   ubica nada. */
export const ID_NOTAS_CAJA = 'nota-caja'
const CLAVE = ['caja', 'notas']

export function useNotasDeCaja() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_notas').select('texto').eq('id', ID_NOTAS_CAJA).maybeSingle()
      if (error) throw error
      // Sin fila es «todavía nadie escribió nada», no un error.
      return data?.texto ?? ''
    },
  })
}

export function useGuardarNotasDeCaja() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase
        .from('roadmap_notas').upsert({ id: ID_NOTAS_CAJA, texto, titulo: '', orden: 0 })
      if (error) throw error
      return texto
    },
    onSuccess: texto => qc.setQueryData(CLAVE, texto),
  })
}
