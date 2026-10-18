import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type ArchivoPlaybook, CARPETA_PLAYBOOK, clavePlaybook, nombreDeClave } from '../lib/playbook'

const BUCKET = 'roadmap-adjuntos'
const CLAVE = ['crm', 'playbook']
const TTL_FIRMA = 60 * 60

/* Se firma al listar y no al hacer clic: pedir la firma después del clic llega tarde y el
   navegador bloquea la pestaña por venir de un `await`. */
export function usePlaybooksSubidos() {
  return useQuery({
    queryKey: CLAVE,
    staleTime: (TTL_FIRMA / 2) * 1000,
    queryFn: async (): Promise<ArchivoPlaybook[]> => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(CARPETA_PLAYBOOK, { sortBy: { column: 'created_at', order: 'desc' } })
      if (error) throw error
      const archivos = (data ?? []).filter(o => o.id && o.name !== '.emptyFolderPlaceholder')
      if (archivos.length === 0) return []
      const paths = archivos.map(o => `${CARPETA_PLAYBOOK}/${o.name}`)
      const { data: firmas, error: errFirma } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL_FIRMA)
      if (errFirma) throw errFirma
      return archivos.map((o, i) => ({
        id: o.id!,
        nombre: nombreDeClave(o.name),
        url: firmas?.[i]?.signedUrl ?? '',
        path: paths[i],
        peso: typeof o.metadata?.size === 'number' ? o.metadata.size : null,
      }))
    },
  })
}

export function useSubirPlaybook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (archivo: File) => {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(clavePlaybook(archivo.name, Date.now()), archivo, { contentType: archivo.type || undefined })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useBorrarPlaybook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (path: string) => {
      const { error } = await supabase.storage.from(BUCKET).remove([path])
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}
