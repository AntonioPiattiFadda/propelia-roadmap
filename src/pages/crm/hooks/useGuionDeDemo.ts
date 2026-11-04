import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { idDeLaFilaDelGuion } from '../lib/guionDeDemo'

/* Las notas de la demo viven en una fila de `roadmap_notas` por lead, como el planning diario: sin
   migración, con la RLS de `es_usuario()` (no la de la cartera del lead) y el vanilla corta por id,
   así que el prefijo `demo-guion-` no se lee como otra cosa. `texto` es lo escrito. */
const clave = (leadId: string) => ['guion-de-demo', leadId]

export function useNotasDeDemo(leadId: string) {
  return useQuery({
    queryKey: clave(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_notas').select('texto').eq('id', idDeLaFilaDelGuion(leadId)).maybeSingle()
      if (error) throw error
      // Sin fila es «todavía nadie anotó nada», no un error.
      return data?.texto ?? ''
    },
  })
}

export function useGuardarNotasDeDemo(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (texto: string) => {
      const { error } = await supabase.from('roadmap_notas')
        .upsert({ id: idDeLaFilaDelGuion(leadId), texto, titulo: '', orden: 0 })
      if (error) throw error
      return texto
    },
    onSuccess: texto => qc.setQueryData(clave(leadId), texto),
  })
}
