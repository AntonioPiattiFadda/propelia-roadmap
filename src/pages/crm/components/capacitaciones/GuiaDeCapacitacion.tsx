import { ArrowDownIcon, ArrowUpIcon, BookOpenTextIcon, CheckIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { contarVistos, type ModuloCapacitacion, tieneFuente, type VideoCapacitacion, type Vistos } from '../../lib/capacitaciones'

/** Lo que aparece con «Modo edición» prendido (solo SUPERADMIN). Sin esto la guía es de lectura. */
export type EdicionDeCapacitacion = {
  onNuevoModulo: () => void
  onEditarModulo: (m: ModuloCapacitacion) => void
  onBorrarModulo: (m: ModuloCapacitacion) => void
  onMoverModulo: (m: ModuloCapacitacion, dir: -1 | 1) => void
  onNuevoVideo: (m: ModuloCapacitacion) => void
  onEditarVideo: (m: ModuloCapacitacion, v: VideoCapacitacion) => void
  onBorrarVideo: (v: VideoCapacitacion) => void
  onMoverVideo: (m: ModuloCapacitacion, v: VideoCapacitacion, dir: -1 | 1) => void
}

const botonIcono =
  'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30'

/* Primera columna: los módulos numerados, cada uno con «vistos/total», y el avance de todo arriba.
   Copiado de `TrainingGuide` del producto. */
export function ModulosDeCapacitacion({
  modulos,
  vistos,
  abiertoId,
  onAbrir,
  edicion,
}: {
  modulos: ModuloCapacitacion[]
  vistos: Vistos
  abiertoId: string | null
  onAbrir: (m: ModuloCapacitacion) => void
  edicion?: EdicionDeCapacitacion
}) {
  const total = contarVistos(modulos.flatMap(m => m.videos), vistos)
  return (
    <nav aria-label="Módulos de la capacitación" className="w-full shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:flex lg:max-h-full lg:w-72 lg:flex-col">
      <div className="px-4 pb-3 pt-4">
        <p className="text-base font-semibold text-foreground">Módulos</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{total.vistos} de {total.total} completados</p>
        <Barra valor={total.vistos} maximo={total.total} etiqueta="Videos completados" className="mt-2.5" />
      </div>
      <ol className="space-y-px border-t border-border p-2 lg:min-h-0 lg:overflow-y-auto">
        {modulos.length === 0 && !edicion && <li className="px-2 py-2 text-xs text-muted-foreground">Todavía no hay módulos.</li>}
        {modulos.map((m, i) => {
          const cuenta = contarVistos(m.videos, vistos)
          const completo = cuenta.total > 0 && cuenta.vistos === cuenta.total
          const abierto = m.id === abiertoId
          return (
            <li key={m.id}>
              <div className={cn('flex items-center gap-0.5 rounded-lg pr-1.5 transition-colors', abierto ? 'bg-primary/10' : 'hover:bg-muted/60')}>
                <button
                  type="button"
                  onClick={() => onAbrir(m)}
                  aria-current={abierto ? 'true' : undefined}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg py-2.5 pl-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                      completo ? 'bg-success-soft text-(--success-strong)' : 'bg-primary/10 text-primary',
                    )}
                  >
                    {completo ? <Icon icon={CheckIcon} size="xs" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{m.titulo || 'Sin título'}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{cuenta.vistos}/{cuenta.total}</span>
                </button>
                {edicion && (
                  <>
                    <button type="button" className={botonIcono} aria-label={`Subir «${m.titulo}»`} disabled={i === 0} onClick={() => edicion.onMoverModulo(m, -1)}>
                      <Icon icon={ArrowUpIcon} size="xs" />
                    </button>
                    <button type="button" className={botonIcono} aria-label={`Bajar «${m.titulo}»`} disabled={i === modulos.length - 1} onClick={() => edicion.onMoverModulo(m, 1)}>
                      <Icon icon={ArrowDownIcon} size="xs" />
                    </button>
                    <button type="button" className={botonIcono} aria-label={`Editar «${m.titulo}»`} onClick={() => edicion.onEditarModulo(m)}>
                      <Icon icon={PencilIcon} size="xs" />
                    </button>
                    <button type="button" className={cn(botonIcono, 'hover:text-(--danger)')} aria-label={`Borrar «${m.titulo}»`} onClick={() => edicion.onBorrarModulo(m)}>
                      <Icon icon={Trash2Icon} size="xs" />
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        })}
        {edicion && (
          <li>
            <button
              type="button"
              onClick={edicion.onNuevoModulo}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg py-2.5 pl-2.5 text-left text-sm font-semibold text-primary transition-colors hover:bg-muted/60"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full [border:1px_dashed_var(--brand)]">
                <Icon icon={PlusIcon} size="xs" />
              </span>
              Nuevo módulo
            </button>
          </li>
        )}
      </ol>
    </nav>
  )
}

/* Segunda columna: la guía del módulo (texto libre, con sus saltos de línea) y sus videos. Buscando,
   lista todo lo que coincide agrupado por módulo y sin guías. */
export function VideosDeCapacitacion({
  modulos,
  completos,
  vistos,
  elegidoId,
  siguienteId,
  buscando,
  onElegir,
  edicion,
}: {
  /** Los que se muestran: el abierto, o los que coinciden con la búsqueda. */
  modulos: ModuloCapacitacion[]
  /** Todos, sin filtrar: el orden para subir y bajar. */
  completos: ModuloCapacitacion[]
  vistos: Vistos
  elegidoId: string | null
  siguienteId: string | null
  buscando: boolean
  onElegir: (m: ModuloCapacitacion, v: VideoCapacitacion) => void
  edicion?: EdicionDeCapacitacion
}) {
  return (
    <section aria-label="Videos del módulo" className="w-full shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:max-h-full lg:w-96 lg:overflow-y-auto">
      {modulos.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {buscando ? 'Ningún video coincide con la búsqueda.' : 'Elegí un módulo.'}
        </p>
      )}
      {modulos.map(m => {
        const cuenta = contarVistos(m.videos, vistos)
        const todos = completos.find(x => x.id === m.id)?.videos ?? m.videos
        return (
          <div key={m.id}>
            <div className="px-4 pb-2 pt-4">
              <p className="truncate text-base font-semibold text-foreground">Videos de {m.titulo || 'Sin título'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {m.videos.length} {m.videos.length === 1 ? 'video' : 'videos'} · {cuenta.vistos} de {cuenta.total} completados
              </p>
            </div>

            {!buscando && m.guia.trim() && (
              <details open className="group mx-3 mb-1 rounded-lg border border-border bg-muted/30">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground">
                  <Icon icon={BookOpenTextIcon} size="xs" className="text-primary" />
                  Guía del módulo
                  <span className="ml-auto text-[11px] font-normal text-muted-foreground group-open:hidden">Mostrar</span>
                  <span className="ml-auto hidden text-[11px] font-normal text-muted-foreground group-open:inline">Ocultar</span>
                </summary>
                <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words px-3 pb-3 text-[13px] leading-relaxed text-foreground">
                  {m.guia}
                </p>
              </details>
            )}

            <ol className="space-y-2 p-3 pt-2">
              {m.videos.length === 0 && !edicion && (
                <li className="px-3 py-2 text-xs text-muted-foreground">Este módulo todavía no tiene videos.</li>
              )}
              {m.videos.map(v => {
                const visto = v.id in vistos
                const cargado = tieneFuente(v)
                const elegido = v.id === elegidoId
                const indice = todos.findIndex(x => x.id === v.id)
                return (
                  <li
                    key={v.id}
                    className={cn(
                      'flex items-center gap-0.5 rounded-xl pr-1.5 transition-colors',
                      elegido ? 'bg-primary/5 [border:1px_solid_var(--brand)]' : 'bg-card hover:bg-muted/60 [border:1px_solid_var(--line)]',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onElegir(m, v)}
                      aria-current={elegido ? 'true' : undefined}
                      title={v.titulo}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl py-3 pl-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <span
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full',
                          elegido
                            ? 'bg-primary text-primary-foreground'
                            : visto
                              ? 'bg-success-soft text-(--success-strong)'
                              : cargado
                                ? 'text-foreground [border:1.5px_solid_currentColor]'
                                : 'text-muted-foreground [border:1px_dashed_var(--line)]',
                        )}
                      >
                        <Icon icon={visto && !elegido ? CheckIcon : PlayIcon} size="xs" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'line-clamp-2 text-sm leading-snug',
                            elegido ? 'font-semibold text-foreground'
                              : v.id === siguienteId ? 'font-semibold text-primary'
                                : cargado ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {v.titulo || 'Sin título'}
                        </span>
                        {!cargado && <span className="mt-0.5 block text-[10px] text-muted-foreground">Próximamente</span>}
                      </span>
                      {v.duracion && !edicion && (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">{v.duracion}</span>
                      )}
                    </button>
                    {edicion && !buscando && (
                      <>
                        <button type="button" className={botonIcono} aria-label={`Subir «${v.titulo}»`} disabled={indice <= 0} onClick={() => edicion.onMoverVideo(m, v, -1)}>
                          <Icon icon={ArrowUpIcon} size="xs" />
                        </button>
                        <button type="button" className={botonIcono} aria-label={`Bajar «${v.titulo}»`} disabled={indice < 0 || indice >= todos.length - 1} onClick={() => edicion.onMoverVideo(m, v, 1)}>
                          <Icon icon={ArrowDownIcon} size="xs" />
                        </button>
                      </>
                    )}
                    {edicion && (
                      <>
                        <button type="button" className={botonIcono} aria-label={`Editar «${v.titulo}»`} onClick={() => edicion.onEditarVideo(m, v)}>
                          <Icon icon={PencilIcon} size="xs" />
                        </button>
                        <button type="button" className={cn(botonIcono, 'hover:text-(--danger)')} aria-label={`Borrar «${v.titulo}»`} onClick={() => edicion.onBorrarVideo(v)}>
                          <Icon icon={Trash2Icon} size="xs" />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
              {edicion && !buscando && (
                <li>
                  <button
                    type="button"
                    onClick={() => edicion.onNuevoVideo(m)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-3 text-left text-xs font-semibold text-primary transition-colors hover:bg-muted"
                  >
                    <Icon icon={PlusIcon} size="xs" />
                    Agregar video a este módulo
                  </button>
                </li>
              )}
            </ol>
          </div>
        )
      })}
    </section>
  )
}

export function Barra({ valor, maximo, etiqueta, className }: { valor: number; maximo: number; etiqueta: string; className?: string }) {
  return (
    <div
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-label={etiqueta}
    >
      <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${maximo ? (valor / maximo) * 100 : 0}%` }} />
    </div>
  )
}
