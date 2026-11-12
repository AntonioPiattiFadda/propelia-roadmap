import { useState } from 'react'
import { CheckIcon, ExternalLinkIcon, Maximize2Icon, Minimize2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useUrlDeVideo } from '../../hooks/useCapacitaciones'
import { fuenteDeVideo, tieneFuente, type VideoCapacitacion } from '../../lib/capacitaciones'

/* La tercera columna: el video elegido, compacto y con «Ampliar» para que ocupe la columna entera,
   y debajo la descripción con «Marcar como visto». Copiado de `TrainingPlayerPanel` del producto. */
export function ReproductorDeCapacitacion({
  video,
  codigo,
  visto,
  onAlternarVisto,
  onTermino,
}: {
  video: VideoCapacitacion
  codigo: string
  visto: boolean
  onAlternarVisto: () => void
  onTermino: () => void
}) {
  const [ampliado, setAmpliado] = useState(false)

  return (
    <section
      aria-label="Video seleccionado"
      className={cn('mx-auto w-full space-y-3 transition-[max-width] duration-300', ampliado ? 'max-w-none' : 'max-w-3xl')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-primary tabular-nums">Video {codigo}</p>
          <h2 className="text-lg font-semibold leading-tight text-foreground">{video.titulo || 'Sin título'}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 max-lg:hidden"
          onClick={() => setAmpliado(a => !a)}
          aria-pressed={ampliado}
        >
          <Icon icon={ampliado ? Minimize2Icon : Maximize2Icon} size="xs" />
          {ampliado ? 'Reducir' : 'Ampliar'}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl bg-black shadow-sm">
        {/* key: cambiar de video remonta el reproductor y no arrastra la posición del anterior. */}
        <Pantalla key={video.id} video={video} onTermino={onTermino} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {video.descripcion || 'Este video no tiene descripción.'}
        </p>
        {tieneFuente(video) && (
          <Button type="button" variant={visto ? 'secondary' : 'outline'} size="sm" className="shrink-0" onClick={onAlternarVisto}>
            <Icon icon={CheckIcon} size="xs" className={cn(visto && 'text-(--success-strong)')} />
            {visto ? 'Visto · marcar como no visto' : 'Marcar como visto'}
          </Button>
        )}
      </div>
    </section>
  )
}

function Pantalla({ video, onTermino }: { video: VideoCapacitacion; onTermino: () => void }) {
  const fuente = fuenteDeVideo(video)
  const firma = useUrlDeVideo(fuente.tipo === 'archivo' ? fuente.archivo : undefined)

  if (fuente.tipo === 'archivo' || fuente.tipo === 'directo') {
    const src = fuente.tipo === 'archivo' ? firma.data : fuente.url
    if (fuente.tipo === 'archivo' && firma.isError) return <Cartel>No se pudo abrir el video.</Cartel>
    if (!src) return <Cartel>Cargando el video…</Cartel>
    return <video src={src} controls playsInline preload="metadata" onEnded={onTermino} className="aspect-video w-full bg-black" />
  }
  if (fuente.tipo === 'embed') {
    return (
      <iframe
        src={fuente.url}
        title={video.titulo}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        className="aspect-video w-full border-0"
      />
    )
  }
  if (fuente.tipo === 'enlace') {
    return (
      <Cartel>
        <a href={fuente.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-white underline">
          <Icon icon={ExternalLinkIcon} size="xs" />
          Abrir video
        </a>
      </Cartel>
    )
  }
  return <Cartel>Este video todavía no está cargado.</Cartel>
}

const Cartel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex aspect-video w-full items-center justify-center p-4 text-center text-sm text-white/80">{children}</div>
)
