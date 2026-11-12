import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { GraduationCapIcon, PlayIcon, SearchIcon } from 'lucide-react'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Switch } from '@/components/ui/switch'
import { useCarteras } from '../../hooks/useCarteras'
import {
  borrarArchivosDeCapacitacion,
  CLAVE_CAPACITACIONES,
  useCapacitaciones,
  useGuardarCapacitaciones,
  useGuardarVistos,
  useVistosDeCapacitaciones,
} from '../../hooks/useCapacitaciones'
import {
  actualizarModulo,
  alternarVisto,
  borrarModulo,
  borrarVideo,
  type Capacitaciones,
  codigoDeVideo,
  contarVistos,
  filtrarPorBusqueda,
  guardarVideo,
  type ModuloCapacitacion,
  moverModulo,
  moverVideo,
  nuevoModulo,
  siguienteSinVer,
  tieneFuente,
  todosLosVideos,
  type VideoCapacitacion,
} from '../../lib/capacitaciones'
import { Barra, type EdicionDeCapacitacion, ModulosDeCapacitacion, VideosDeCapacitacion } from './GuiaDeCapacitacion'
import { type LimpiezaDeArchivos, ModuloFormDialog, VideoFormDialog } from './FormulariosDeCapacitacion'
import { ReproductorDeCapacitacion } from './ReproductorDeCapacitacion'

/* Capacitaciones (5/11/2026, por pedido): la Capacitación de propelia-frontend dentro de las
   Herramientas del CRM, para todos (SDR incluido). Módulos con guía y videos; cada uno marca lo que
   ya vio. Editar es solo de SUPERADMIN y solo del front: la fila de `roadmap_notas` y el bucket los
   puede escribir cualquier `es_usuario()` (como el Playbook). */
export function CapacitacionesDialog() {
  const [abierto, setAbierto] = useState(false)
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={GraduationCapIcon} size="xs" />
          <span className="max-md:hidden">Capacitaciones</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,96vw)] max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:rounded-none"
      >
        {abierto && <Contenido />}
      </DialogContent>
    </Dialog>
  )
}

function Contenido() {
  const { esSuperadmin, myId } = useCarteras()
  const capQ = useCapacitaciones()
  const vistosQ = useVistosDeCapacitaciones(myId)
  const guardar = useGuardarCapacitaciones()
  const guardarVistos = useGuardarVistos(myId)
  const qc = useQueryClient()

  const [busqueda, setBusqueda] = useState('')
  // Arranca apagado: el SUPERADMIN ve primero lo mismo que el resto del equipo.
  const [modoEdicion, setModoEdicion] = useState(false)
  const [moduloAbiertoId, setModuloAbiertoId] = useState<string | null>(null)
  const [videoElegidoId, setVideoElegidoId] = useState<string | null>(null)
  const [moduloEnForm, setModuloEnForm] = useState<ModuloCapacitacion | 'nuevo' | null>(null)
  const [videoEnForm, setVideoEnForm] = useState<{ modulo: ModuloCapacitacion; video: VideoCapacitacion | null } | null>(null)

  const cap: Capacitaciones = capQ.data ?? { modulos: [] }
  const modulos = cap.modulos
  const vistos = vistosQ.data ?? {}
  const todos = todosLosVideos(modulos)
  const progreso = contarVistos(todos, vistos)
  const siguiente = siguienteSinVer(modulos, vistos)

  // Sin elección: por dónde seguir, si no el primero con algo para ver, si no el primero.
  const videoElegido = todos.find(v => v.id === videoElegidoId) ?? siguiente?.video ?? todos.find(tieneFuente) ?? todos[0] ?? null
  const moduloDelVideo = videoElegido ? modulos.find(m => m.videos.some(v => v.id === videoElegido.id)) : undefined
  const moduloAbierto = modulos.find(m => m.id === moduloAbiertoId) ?? moduloDelVideo ?? modulos[0] ?? null

  const buscando = busqueda.trim().length > 0
  const mostrados = buscando ? filtrarPorBusqueda(modulos, busqueda) : moduloAbierto ? [moduloAbierto] : []

  const editar = esSuperadmin && modoEdicion
  const persistir = (c: Capacitaciones, limpieza?: LimpiezaDeArchivos) => guardar.mutate(c, {
    onSuccess: () => { void borrarArchivosDeCapacitacion(limpieza?.siGuarda ?? []) },
    onError: () => { void borrarArchivosDeCapacitacion(limpieza?.siFalla ?? []) },
  })

  const edicion: EdicionDeCapacitacion | undefined = editar ? {
    onNuevoModulo: () => setModuloEnForm('nuevo'),
    onEditarModulo: m => setModuloEnForm(m),
    onBorrarModulo: m => {
      const n = m.videos.length
      if (!window.confirm(`¿Borrar el módulo «${m.titulo}»${n ? ` y sus ${n} ${n === 1 ? 'video' : 'videos'}` : ''}?`)) return
      const r = borrarModulo(cap, m.id)
      persistir(r.capacitaciones, { siGuarda: r.archivos, siFalla: [] })
    },
    onMoverModulo: (m, dir) => persistir(moverModulo(cap, m.id, dir)),
    onNuevoVideo: m => setVideoEnForm({ modulo: m, video: null }),
    onEditarVideo: (m, v) => setVideoEnForm({ modulo: m, video: v }),
    onBorrarVideo: v => {
      if (!window.confirm(`¿Borrar el video «${v.titulo}»?`)) return
      const r = borrarVideo(cap, v.id)
      persistir(r.capacitaciones, { siGuarda: r.archivo ? [r.archivo] : [], siFalla: [] })
    },
    onMoverVideo: (m, v, dir) => persistir(moverVideo(cap, m.id, v.id, dir)),
  } : undefined

  const elegir = (m: ModuloCapacitacion, v: VideoCapacitacion) => {
    setModuloAbiertoId(m.id)
    setVideoElegidoId(v.id)
  }
  const alternar = (v: VideoCapacitacion) => guardarVistos.mutate(alternarVisto(vistos, v.id, new Date()))

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 pr-12">
        <div className="mr-auto min-w-0">
          <DialogTitle className="text-lg">Capacitaciones</DialogTitle>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Barra valor={progreso.vistos} maximo={progreso.total} etiqueta="Progreso de la capacitación" className="w-28" />
            <span className="tabular-nums">{progreso.vistos} de {progreso.total} vistos</span>
          </div>
        </div>

        <div className="relative w-56 max-sm:w-full">
          <Icon icon={SearchIcon} size="xs" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar un video…"
            aria-label="Buscar un video por título o descripción"
            className="h-8 w-full rounded-md bg-card pl-8 pr-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-(--brand) [border:1px_solid_var(--line)]"
          />
        </div>

        {esSuperadmin && (
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-warning-soft/30 px-2 py-1 text-xs font-semibold text-foreground [border:1px_dashed_var(--line)]">
            <SuperadminBadge />
            <Switch checked={modoEdicion} onCheckedChange={setModoEdicion} aria-label="Modo edición de las capacitaciones" />
            Modo edición
          </label>
        )}

        {siguiente && (
          <Button size="sm" onClick={() => elegir(siguiente.modulo, siguiente.video)}>
            <Icon icon={PlayIcon} size="xs" />
            Seguir con {codigoDeVideo(modulos, siguiente.video.id)}
          </Button>
        )}
      </header>

      {capQ.isLoading ? (
        <p className="p-6 text-sm text-muted-foreground">Cargando las capacitaciones…</p>
      ) : capQ.isError ? (
        <p className="p-6 text-sm text-(--danger)">No se pudieron leer las capacitaciones.</p>
      ) : modulos.length === 0 && !editar ? (
        <p className="m-5 rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {esSuperadmin ? 'Todavía no hay capacitaciones. Prendé «Modo edición» para crear el primer módulo.' : 'Las capacitaciones todavía no tienen contenido.'}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-muted/20 p-4 lg:flex-row lg:items-start lg:overflow-hidden">
          <ModulosDeCapacitacion
            modulos={modulos}
            vistos={vistos}
            abiertoId={buscando ? null : moduloAbierto?.id ?? null}
            onAbrir={m => { setModuloAbiertoId(m.id); setBusqueda('') }}
            edicion={edicion}
          />
          <VideosDeCapacitacion
            modulos={mostrados}
            completos={modulos}
            vistos={vistos}
            elegidoId={videoElegido?.id ?? null}
            siguienteId={siguiente?.video.id ?? null}
            buscando={buscando}
            onElegir={elegir}
            edicion={edicion}
          />
          <div className="min-w-0 flex-1 max-lg:order-first lg:max-h-full lg:overflow-y-auto">
            {videoElegido ? (
              <ReproductorDeCapacitacion
                video={videoElegido}
                codigo={codigoDeVideo(modulos, videoElegido.id)}
                visto={videoElegido.id in vistos}
                onAlternarVisto={() => alternar(videoElegido)}
                onTermino={() => { if (!(videoElegido.id in vistos)) alternar(videoElegido) }}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Todavía no hay videos.
              </p>
            )}
          </div>
        </div>
      )}

      {esSuperadmin && (
        <>
          <ModuloFormDialog
            modulo={moduloEnForm}
            onCerrar={() => setModuloEnForm(null)}
            onGuardar={datos => {
              if (moduloEnForm === 'nuevo') {
                const m = { ...nuevoModulo(crypto.randomUUID(), datos.titulo), guia: datos.guia }
                persistir({ modulos: [...modulos, m] })
                setModuloAbiertoId(m.id)
              } else if (moduloEnForm) {
                persistir(actualizarModulo(cap, moduloEnForm.id, datos))
              }
            }}
          />
          <VideoFormDialog
            edicion={videoEnForm}
            onCerrar={() => setVideoEnForm(null)}
            onGuardar={(moduloId, video, limpieza) => {
              // Leído del caché recién ahora: la subida pudo tardar y haber cambiado algo mientras.
              persistir(guardarVideo(qc.getQueryData<Capacitaciones>(CLAVE_CAPACITACIONES) ?? cap, moduloId, video), limpieza)
              setModuloAbiertoId(moduloId)
              setVideoElegidoId(video.id)
            }}
          />
        </>
      )}
    </>
  )
}
