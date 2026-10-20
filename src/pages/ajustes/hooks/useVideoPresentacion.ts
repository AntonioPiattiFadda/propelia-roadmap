import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { BUCKET_VIDEO, CACHE_VIDEO_SEGUNDOS, VIDEO_PATH } from '../lib/videoPresentacion'

const CLAVE = ['ajustes', 'video-presentacion']
const [CARPETA, ARCHIVO] = [VIDEO_PATH.slice(0, VIDEO_PATH.lastIndexOf('/')), VIDEO_PATH.slice(VIDEO_PATH.lastIndexOf('/') + 1)]

export type VideoActual = { url: string; actualizado: string | null; peso: number | null }

/* La URL de la vista previa lleva `?v=` con la fecha del archivo: es la misma dirección de siempre,
   y sin eso el navegador seguiría mostrando el de antes después de reemplazarlo. */
export function useVideoPresentacion() {
  return useQuery({
    queryKey: CLAVE,
    queryFn: async (): Promise<VideoActual | null> => {
      const { data, error } = await supabase.storage.from(BUCKET_VIDEO).list(CARPETA, { search: ARCHIVO })
      if (error) throw error
      const o = data?.find(x => x.name === ARCHIVO)
      if (!o) return null
      const actualizado = o.updated_at ?? o.created_at ?? null
      const url = supabase.storage.from(BUCKET_VIDEO).getPublicUrl(VIDEO_PATH).data.publicUrl
      return {
        url: actualizado ? `${url}?v=${encodeURIComponent(actualizado)}` : url,
        actualizado,
        peso: typeof o.metadata?.size === 'number' ? o.metadata.size : null,
      }
    },
  })
}

export function useReemplazarVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (archivo: File) => {
      const { error } = await supabase.storage.from(BUCKET_VIDEO).upload(VIDEO_PATH, archivo, {
        upsert: true, contentType: 'video/mp4', cacheControl: String(CACHE_VIDEO_SEGUNDOS),
      })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}
