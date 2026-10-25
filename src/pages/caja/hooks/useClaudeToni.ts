import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { escribirPagados, leerPagados, type PagadosClaudeToni } from '../lib/claudeToni'

/* Los meses pagados de «Claude Toni · extra empresa» viven en una fila de `roadmap_notas` con id
   propio, como las notas de la Caja: sin migración, con la RLS por `es_usuario()` que la tabla ya
   tiene. `texto` es el JSON de meses pagados con su nota (`leerPagados`); `titulo` va vacío y
   `orden` no ubica nada. */
export const ID_CLAUDE_TONI = 'caja-claude-toni'
const CLAVE = ['caja', 'claude-toni']

export function useClaudeToni() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roadmap_notas').select('texto').eq('id', ID_CLAUDE_TONI).maybeSingle()
      if (error) throw error
      // Sin fila es «todavía no se marcó ningún mes», no un error.
      return leerPagados(data?.texto ?? '')
    },
  })
}

/* Marcar o desmarcar un mes, o guardarle la nota. Optimista: cambia al toque y, si la base no lo
   guarda, vuelve a como estaba y avisa. Se escribe el objeto entero, calculado sobre lo que hay en
   pantalla. */
export function useGuardarClaudeToni() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pagados: PagadosClaudeToni) => {
      const { error } = await supabase
        .from('roadmap_notas').upsert({ id: ID_CLAUDE_TONI, texto: escribirPagados(pagados), titulo: '', orden: 0 })
      if (error) throw error
      return pagados
    },
    onMutate: async (pagados: PagadosClaudeToni) => {
      await qc.cancelQueries({ queryKey: CLAVE })
      const previo = qc.getQueryData<PagadosClaudeToni>(CLAVE)
      qc.setQueryData(CLAVE, pagados)
      return { previo }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(CLAVE, ctx?.previo)
      toast.error('No se pudo guardar el pago de Claude Toni')
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: CLAVE }) },
  })
}
