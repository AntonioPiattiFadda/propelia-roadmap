import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { subirVideoDeCapacitacion } from '../../hooks/useCapacitaciones'
import { type ArchivoDeVideo, fuenteDeVideo, type ModuloCapacitacion, type VideoCapacitacion } from '../../lib/capacitaciones'
import { pesoLegible } from '../../lib/playbook'

/* El tope de subida de Storage del proyecto (50 MB): más que eso falla en el servidor. Un video
   más largo se sube a YouTube/Loom/Drive y se pega el enlace. */
const TOPE_DE_SUBIDA = 50 * 1024 * 1024

export function ModuloFormDialog({
  modulo,
  onCerrar,
  onGuardar,
}: {
  /** null = cerrado; 'nuevo' = alta. */
  modulo: ModuloCapacitacion | 'nuevo' | null
  onCerrar: () => void
  onGuardar: (datos: { titulo: string; guia: string }) => void
}) {
  return (
    <Dialog open={modulo !== null} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="sm:max-w-[640px]">
        {modulo !== null && (
          <FormModulo key={modulo === 'nuevo' ? 'nuevo' : modulo.id} modulo={modulo === 'nuevo' ? null : modulo} onCerrar={onCerrar} onGuardar={onGuardar} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FormModulo({ modulo, onCerrar, onGuardar }: { modulo: ModuloCapacitacion | null; onCerrar: () => void; onGuardar: (d: { titulo: string; guia: string }) => void }) {
  const [titulo, setTitulo] = useState(modulo?.titulo ?? '')
  const [guia, setGuia] = useState(modulo?.guia ?? '')
  const [error, setError] = useState(false)

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) { setError(true); return }
    onGuardar({ titulo: titulo.trim(), guia })
    onCerrar()
  }

  return (
    <form onSubmit={enviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{modulo ? 'Editar módulo' : 'Nuevo módulo'}</DialogTitle>
        <DialogDescription>La guía se lee arriba de los videos del módulo. Se respetan los saltos de línea.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="cap-modulo-titulo">Nombre</Label>
        <Input id="cap-modulo-titulo" value={titulo} autoFocus aria-invalid={error} onChange={e => { setTitulo(e.target.value); setError(false) }} />
        {error && <p className="text-xs text-(--danger)">Poné un nombre.</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cap-modulo-guia">Guía (opcional)</Label>
        <Textarea id="cap-modulo-guia" value={guia} rows={12} onChange={e => setGuia(e.target.value)} className="max-h-[50vh]" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit">Guardar</Button>
      </DialogFooter>
    </form>
  )
}

/** Qué archivos del bucket hay que borrar según cómo termine el guardado. */
export type LimpiezaDeArchivos = { siGuarda: ArchivoDeVideo[]; siFalla: ArchivoDeVideo[] }

export function VideoFormDialog({
  edicion,
  onCerrar,
  onGuardar,
}: {
  /** null = cerrado; `video` null = alta en ese módulo. */
  edicion: { modulo: ModuloCapacitacion; video: VideoCapacitacion | null } | null
  onCerrar: () => void
  onGuardar: (moduloId: string, video: VideoCapacitacion, limpieza: LimpiezaDeArchivos) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  return (
    <Dialog open={edicion !== null} onOpenChange={o => { if (!o && !subiendo) onCerrar() }}>
      <DialogContent className="sm:max-w-[600px]">
        {edicion && (
          <FormVideo
            key={edicion.video?.id ?? `nuevo-${edicion.modulo.id}`}
            modulo={edicion.modulo}
            video={edicion.video}
            subiendo={subiendo}
            setSubiendo={setSubiendo}
            onCerrar={onCerrar}
            onGuardar={onGuardar}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

type Origen = 'archivo' | 'enlace'

function FormVideo({
  modulo,
  video,
  subiendo,
  setSubiendo,
  onCerrar,
  onGuardar,
}: {
  modulo: ModuloCapacitacion
  video: VideoCapacitacion | null
  subiendo: boolean
  setSubiendo: (s: boolean) => void
  onCerrar: () => void
  onGuardar: (moduloId: string, video: VideoCapacitacion, limpieza: LimpiezaDeArchivos) => void
}) {
  const [titulo, setTitulo] = useState(video?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(video?.descripcion ?? '')
  const [duracion, setDuracion] = useState(video?.duracion ?? '')
  const [origen, setOrigen] = useState<Origen>(video?.url && !video.archivo ? 'enlace' : 'archivo')
  const [url, setUrl] = useState(video?.url ?? '')
  const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) { setError('Poné un título.'); return }
    const base = { id: video?.id ?? crypto.randomUUID(), titulo: titulo.trim(), descripcion: descripcion.trim(), duracion: duracion.trim() }
    const viejo = video?.archivo

    if (origen === 'enlace') {
      const candidato: VideoCapacitacion = { ...base, url: url.trim() }
      if (fuenteDeVideo(candidato).tipo === 'ninguna') { setError('Pegá un enlace que empiece con https://'); return }
      onGuardar(modulo.id, candidato, { siGuarda: viejo ? [viejo] : [], siFalla: [] })
      onCerrar()
      return
    }

    if (!archivoNuevo) {
      if (!viejo) { setError('Elegí un archivo de video.'); return }
      onGuardar(modulo.id, { ...base, archivo: viejo }, { siGuarda: [], siFalla: [] })
      onCerrar()
      return
    }
    if (archivoNuevo.size > TOPE_DE_SUBIDA) {
      setError(`El archivo pesa ${pesoLegible(archivoNuevo.size)} y el tope es 50 MB. Subilo a YouTube, Loom o Drive y pegá el enlace.`)
      return
    }
    setSubiendo(true)
    try {
      const archivo = await subirVideoDeCapacitacion(archivoNuevo)
      onGuardar(modulo.id, { ...base, archivo }, { siGuarda: viejo ? [viejo] : [], siFalla: [archivo] })
      onCerrar()
    } catch {
      toast.error(`No se pudo subir «${archivoNuevo.name}»`)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{video ? 'Editar video' : 'Agregar video'}</DialogTitle>
        <DialogDescription>Módulo «{modulo.titulo || 'Sin título'}».</DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="cap-video-titulo">Título</Label>
        <Input id="cap-video-titulo" value={titulo} autoFocus onChange={e => { setTitulo(e.target.value); setError(null) }} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cap-video-descripcion">Descripción (opcional)</Label>
        <Textarea id="cap-video-descripcion" value={descripcion} rows={4} onChange={e => setDescripcion(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cap-video-duracion">Duración (opcional)</Label>
        <Input id="cap-video-duracion" value={duracion} placeholder="4:30" className="w-32" onChange={e => setDuracion(e.target.value)} />
      </div>

      <div className="grid gap-2">
        <div role="radiogroup" aria-label="De dónde sale el video" className="inline-flex w-fit rounded-md border border-border p-0.5">
          {(['archivo', 'enlace'] as const).map(o => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={origen === o}
              onClick={() => { setOrigen(o); setError(null) }}
              className={cn('rounded px-3 py-1 text-xs font-semibold transition-colors', origen === o ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {o === 'archivo' ? 'Subir archivo' : 'Pegar enlace'}
            </button>
          ))}
        </div>
        {origen === 'archivo' ? (
          <div className="grid gap-1">
            <Input type="file" accept="video/*" aria-label="Archivo de video" onChange={e => { setArchivoNuevo(e.target.files?.[0] ?? null); setError(null) }} />
            <p className="text-xs text-muted-foreground">
              {video?.archivo && !archivoNuevo ? `Ahora: ${video.archivo.n}. Elegí otro para reemplazarlo. ` : ''}Hasta 50 MB.
            </p>
          </div>
        ) : (
          <div className="grid gap-1">
            <Input type="url" value={url} placeholder="https://www.youtube.com/watch?v=…" aria-label="Enlace del video" onChange={e => { setUrl(e.target.value); setError(null) }} />
            <p className="text-xs text-muted-foreground">YouTube, Loom y Drive se ven acá mismo; un .mp4 o .webm también. Otro enlace se abre aparte.</p>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-(--danger)">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={subiendo} onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" disabled={subiendo}>{subiendo ? 'Subiendo…' : 'Guardar'}</Button>
      </DialogFooter>
    </form>
  )
}
