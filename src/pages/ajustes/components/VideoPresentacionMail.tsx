import { useRef } from 'react'
import { ExternalLinkIcon, UploadIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { URL_VIDEO } from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { pesoLegible } from '@/pages/crm/lib/playbook'
import { useReemplazarVideo, useVideoPresentacion } from '../hooks/useVideoPresentacion'
import { problemaDelVideo } from '../lib/videoPresentacion'

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : ''

/* NUEVO (20/10/2026). Pestaña de Ajustes: el vídeo que abre el mail «Presentación con vídeo»,
   solo SUPERADMIN (el gate de Ajustes y, de verdad, las policies `publico_videos_*`). Reemplazar
   pisa el archivo del bucket que reproduce `crm.propelia.es/presentacion`: el mail no cambia, y
   los ya enviados pasan a mostrar el nuevo. */
export function VideoPresentacionMail() {
  const video = useVideoPresentacion()
  const reemplazar = useReemplazarVideo()
  const input = useRef<HTMLInputElement>(null)

  const alElegir = (archivo: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!archivo) return
    const problema = problemaDelVideo(archivo)
    if (problema) return void toast.error(problema)
    if (!window.confirm(`¿Reemplazar el vídeo por «${archivo.name}»? El anterior no se guarda.`)) return
    reemplazar.mutate(archivo, {
      onSuccess: () => toast.success('Vídeo reemplazado. Puede tardar un minuto en verse en la página pública.'),
      onError: () => toast.error('No se pudo subir el vídeo. El mail sigue con el de antes.'),
    })
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">Vídeo presentación por mail</h2>
        <a href={URL_VIDEO} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12.5px] text-(--fg-2) hover:underline">
          {URL_VIDEO.replace('https://', '')}
          <Icon icon={ExternalLinkIcon} size="xs" />
        </a>
        <Button size="sm" className="ml-auto" disabled={reemplazar.isPending || video.isLoading} onClick={() => input.current?.click()}>
          <Icon icon={UploadIcon} size="xs" />
          {reemplazar.isPending ? 'Subiendo…' : 'Reemplazar vídeo'}
        </Button>
        <input ref={input} type="file" accept="video/mp4,.mp4" className="hidden" onChange={e => alElegir(e.target.files?.[0])} />
      </header>

      <p className="text-[13px] text-(--fg-2)">
        Es el que ve la inmobiliaria al tocar la portada del mail «Presentación con vídeo». Al reemplazarlo
        cambia también para los mails ya enviados. Un .mp4 de hasta 50 MB.
      </p>

      {video.isLoading && <p className="text-[13px] text-(--fg-muted)">Cargando…</p>}
      {video.isError && <p className="text-[13px] text-red-600">No se pudo leer el vídeo. ¿Está corrida la migración del bucket?</p>}
      {video.isSuccess && !video.data && <p className="text-[13px] text-red-600">No hay vídeo en el bucket: la página pública está vacía.</p>}

      {video.data && (
        <section className="flex flex-col gap-2 rounded-xl bg-card p-3 [border:1px_solid_var(--line)]">
          {/* `key`: con el mismo elemento, cambiar el `src` no recarga el vídeo en todos los navegadores. */}
          <video key={video.data.url} src={video.data.url} controls playsInline preload="metadata"
            className="aspect-video w-full rounded-lg bg-[#010C44]" />
          <p className="text-[12.5px] text-(--fg-muted)">
            {[video.data.actualizado && `Actualizado ${fecha(video.data.actualizado)}`, video.data.peso != null && pesoLegible(video.data.peso)]
              .filter(Boolean).join(' · ')}
          </p>
        </section>
      )}
    </div>
  )
}
