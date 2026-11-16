import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { conCommit, escribirCommits, ID_COMMITS, leerCommits, type CampoDeCommit, type Commits } from '../lib/commits'
import { CRM_KEYS } from './keys'

/* Los commits viven en una fila de `roadmap_notas`, como la meta del Dashboard SDR: sin migración.
   Los edita solo un SUPERADMIN, y eso es solo del front. */
export function useCommits() {
  return useQuery({
    queryKey: CRM_KEYS.commits,
    queryFn: async () => {
      const { data, error } = await supabase.from('roadmap_notas').select('texto').eq('id', ID_COMMITS).maybeSingle()
      if (error) throw error
      return leerCommits(data?.texto)
    },
  })
}

type Cambio = { persona: string; dia: string; campo: CampoDeCommit; valor: number | null }

/** Optimista: se pinta al toque y vuelve atrás si no se guarda. Se relee la fila antes de escribir
 *  para no pisar lo que otro haya guardado mientras tanto. */
export function useGuardarCommit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ persona, dia, campo, valor }: Cambio) => {
      const { data, error } = await supabase.from('roadmap_notas').select('texto').eq('id', ID_COMMITS).maybeSingle()
      if (error) throw error
      const nuevos = conCommit(leerCommits(data?.texto), persona, dia, campo, valor)
      const { error: e } = await supabase.from('roadmap_notas')
        .upsert({ id: ID_COMMITS, texto: escribirCommits(nuevos), titulo: '', orden: 0 })
      if (e) throw e
      return nuevos
    },
    onMutate: async ({ persona, dia, campo, valor }) => {
      await qc.cancelQueries({ queryKey: CRM_KEYS.commits })
      const antes = qc.getQueryData<Commits>(CRM_KEYS.commits)
      qc.setQueryData<Commits>(CRM_KEYS.commits, conCommit(antes ?? {}, persona, dia, campo, valor))
      return { antes }
    },
    onSuccess: nuevos => qc.setQueryData(CRM_KEYS.commits, nuevos),
    onError: (_e, _v, ctx) => {
      qc.setQueryData(CRM_KEYS.commits, ctx?.antes)
      toast.error('No se pudo guardar el commit')
    },
  })
}
