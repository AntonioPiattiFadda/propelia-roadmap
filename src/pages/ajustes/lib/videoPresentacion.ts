/* NUEVO. El vídeo de presentación que abre el mail «Presentación con vídeo» (20/10/2026). Vive en
   el bucket público `publico` y lo reproduce la página pública `crm.propelia.es/presentacion` de
   propelia-frontend, que tiene el nombre del archivo escrito a mano. Por eso reemplazar es pisar
   ESE archivo: con otro nombre habría que cambiar aquella página. */

export const BUCKET_VIDEO = 'publico'
export const VIDEO_PATH = 'videos/propelia-presentacion-v8.mp4'
/** El `file_size_limit` del bucket (50 MB): subir algo más grande falla igual, mejor decirlo antes. */
export const PESO_MAXIMO_VIDEO = 52_428_800
/* Caché corto para que el reemplazo se vea pronto. El que se subió a mano el 18/10/2026 lleva una
   hora: el primer reemplazo puede tardar eso en llegarle a quien ya lo tenía cacheado. */
export const CACHE_VIDEO_SEGUNDOS = 60

/** Por qué no se puede subir este archivo, o null si se puede. */
export function problemaDelVideo(archivo: { name: string; type: string; size: number }): string | null {
  const esMp4 = archivo.type === 'video/mp4' || (!archivo.type && /\.mp4$/i.test(archivo.name))
  if (!esMp4) return 'Tiene que ser un .mp4: es el formato que reproduce cualquier navegador.'
  if (archivo.size > PESO_MAXIMO_VIDEO) return 'Pesa más de 50 MB, el máximo del bucket. Comprimilo antes de subirlo.'
  return null
}
