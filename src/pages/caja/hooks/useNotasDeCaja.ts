import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* Las notas de la Caja son UNAS para todo el equipo y viven en una fila de `roadmap_notas` con id
   propio, como el planning diario y la nota del backlog: sin migración, con la RLS por
   `es_usuario()` que la tabla ya tiene. `texto` es lo escrito; `titulo` va vacío y `orden` no
   ubica nada. Hay más de un cuadro (las notas generales y los gastos a prorratear): cada uno es
   su fila. */
export const ID_NOTAS_CAJA = 'nota-caja'
export const ID_NOTAS_PRORRATEAR = 'nota-caja-prorratear'
export const ID_NOTAS_CRYPTOS = 'nota-caja-cryptos'
const claveDe = (id: string) => ['caja', 'notas', id]

export function useNotasDeCaja(id: string = ID_NOTAS_CAJA) {
  return useQuery({
    queryKey: claveDe(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_notas').select('texto').eq('id', id).maybeSingle()
      if (error) throw error
      // Sin fila es «todavía nadie escribió nada», no un error.
      return data?.texto ?? ''
    },
  })
}

export function useGuardarNotasDeCaja(id: string = ID_NOTAS_CAJA) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase
        .from('roadmap_notas').upsert({ id, texto, titulo: '', orden: 0 })
      if (error) throw error
      return texto
    },
    onSuccess: texto => qc.setQueryData(claveDe(id), texto),
  })
}
