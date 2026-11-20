import { useEffect, useMemo, useState } from 'react'
import { localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { useObjetivosDe, useObjetivosDeVarios } from '../hooks/useObjetivos'
import {
  avisosDelRitmo, diasHabilesAnteriores, estadoDelRitmo, explicacionDelRitmo, META_TOP, minutosDeHora, tipoDeDia,
  type AvisoDelRitmo, type ColorDelRitmo, type EstadoDelRitmo, type MemoriaDeAvisos,
} from '../lib/ritmoDelDia'

/* La pantalla del ritmo del día (`lib/ritmoDelDia.ts`): el globo de Propelin que explica el color
   de «Contestadas» al pasar el cursor, y la viñeta con la que avisa en los puntos de control. */

const TONO: Record<ColorDelRitmo, { barra: string; texto: string; borde: string }> = {
  verde: { barra: 'bg-(--success)', texto: 'text-(--success-fg)', borde: '[border-color:color-mix(in_oklab,var(--success)_45%,transparent)]' },
  amarillo: { barra: 'bg-(--warning)', texto: 'text-(--warning-fg)', borde: '[border-color:color-mix(in_oklab,var(--warning)_50%,transparent)]' },
  rojo: { barra: 'bg-(--danger)', texto: 'text-(--danger-fg)', borde: '[border-color:color-mix(in_oklab,var(--danger)_45%,transparent)]' },
}

/** La hora, que cambia sola cada minuto: el color baja con la hora aunque no entren llamadas. */
function useReloj(activo = true) {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    if (!activo) return
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [activo])
  return ahora
}

/** El ritmo de `contestadas` del día `dia` (el del contador): hoy, a esta hora; un día pasado,
 *  cerrado. null sin datos o en un día libre. */
export function useRitmoDelDia(contestadas: number | undefined, dia: string, esHoy: boolean): EstadoDelRitmo | null {
  const ahora = useReloj(esHoy)
  if (contestadas === undefined) return null
  if (!esHoy) return estadoDelRitmo(contestadas, 24 * 60, tipoDeDia(dia))
  const reloj = relojDeEspana(ahora)
  return estadoDelRitmo(contestadas, reloj.minutos, tipoDeDia(reloj.ymd))
}

function Propelin({ className }: { className?: string }) {
  return <img src="/propelia-bot.webp" alt="" aria-hidden className={cn('shrink-0 drop-shadow-md', className)} />
}

/** La barra hacia 60 con las marcas del amarillo y el verde de este momento. */
function BarraHacia60({ estado, contestadas }: { estado: EstadoDelRitmo; contestadas: number }) {
  const pct = (n: number) => `${Math.min(100, (n / META_TOP) * 100)}%`
  const marcas = [
    { n: estado.umbralAmarillo, nombre: 'amarillo', clase: 'bg-(--warning)' },
    { n: estado.umbralVerde, nombre: 'verde', clase: 'bg-(--success)' },
  ].filter(m => m.n > 0)
  return (
    <div className="mt-2">
      <div className="relative h-2 rounded-full bg-(--surface-2)" role="progressbar"
        aria-valuemin={0} aria-valuemax={META_TOP} aria-valuenow={contestadas} aria-label={`${contestadas} de ${META_TOP}`}>
        <div className={cn('h-full rounded-full transition-[width] duration-500', TONO[estado.color].barra)} style={{ width: pct(contestadas) }} />
        {marcas.map(m => (
          <span key={m.nombre} title={`${m.nombre} desde ${m.n}`}
            className={cn('absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full', m.clase)} style={{ left: pct(m.n) }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-(--fg-muted) tabular-nums">
        <span>0</span><span>Meta {META_TOP}</span>
      </div>
    </div>
  )
}

/** Envuelve la tarjeta «Contestadas»: al pasar el cursor (o enfocarla) aparece Propelin explicando. */
export function ConGloboDelRitmo({ estado, contestadas, children }: {
  estado: EstadoDelRitmo | null; contestadas: number | undefined; children: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  if (!estado || contestadas === undefined) return <>{children}</>
  const x = explicacionDelRitmo(estado, contestadas)
  return (
    <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)} onBlur={() => setVisible(false)}>
      {children}
      {visible && (
        <div role="tooltip"
          className="pointer-events-none absolute top-full left-0 z-40 mt-1 flex w-[340px] max-w-[calc(100vw-2rem)] items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Propelin className="size-12 animate-hero-float" />
          <div className={cn('flex-1 rounded-2xl rounded-tl-sm bg-card px-3.5 py-2.5 text-left text-[12.5px] leading-snug text-foreground shadow-(--shadow-md) [border:1px_solid]', TONO[estado.color].borde)}>
            <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-(--brand)">Propelin</span>
            <p className="font-semibold">{x.titulo}</p>
            <p className={cn('mt-1', TONO[estado.color].texto)}>{x.porque}</p>
            {x.proyeccion && <p className="mt-1 text-(--fg-2)">{x.proyeccion}</p>}
            <BarraHacia60 estado={estado} contestadas={contestadas} />
          </div>
        </div>
      )}
    </div>
  )
}

const CLAVE_MEMORIA = (yo: string, dia: string) => `crm-ritmo-avisos:${yo}:${dia}`

function leerMemoria(clave: string): MemoriaDeAvisos {
  try {
    const m = JSON.parse(localStorage.getItem(clave) ?? 'null')
    if (m && Array.isArray(m.enviados)) return { enviados: m.enviados.filter((x: unknown) => typeof x === 'string'), ultimoColor: m.ultimoColor ?? null }
  } catch { /* sin storage: arranca de cero */ }
  return { enviados: [], ultimoColor: null }
}

function guardarMemoria(clave: string, m: MemoriaDeAvisos) {
  try { localStorage.setItem(clave, JSON.stringify(m)) } catch { /* sin storage: se pierde al recargar */ }
}

const SEGUNDOS_POR_AVISO = 9

/**
 * Los avisos de Propelin sobre el ritmo del día, para un SDR: una viñeta chica abajo al centro que
 * se va sola. Montado en `AppLayout`, como las alarmas, así avisa esté en la página que esté (con la
 * app abierta: sin push). Lo ya avisado se guarda por navegador y por día.
 */
export function AvisosDelRitmo({ yoId, activo }: { yoId: string | null; activo: boolean }) {
  const ahora = useReloj(activo)
  const reloj = relojDeEspana(ahora)
  const hoy = localTodayIso()
  const tipo = tipoDeDia(reloj.ymd)
  const { data } = useObjetivosDe(activo ? yoId : null, hoy)
  const contestadas = data?.resumen.contestadas

  // La media de los últimos 5 días hábiles, solo para el cierre.
  const fin = estadoDelRitmo(0, 0, tipo)?.fin
  const pideMedia = activo && !!yoId && !!fin && reloj.minutos >= minutosDeHora(fin)
  const pedidos = useMemo(
    () => (pideMedia ? diasHabilesAnteriores(hoy, 5).map(d => ({ autor: yoId!, desde: d, hasta: shiftIsoDate(d, 1) })) : []),
    [pideMedia, hoy, yoId],
  )
  const previos = useObjetivosDeVarios(pedidos, pideMedia)
  const mediaLista = !pideMedia || previos.every(q => !q.isPending)
  const ok = previos.filter(q => q.data)
  const media = ok.length ? ok.reduce((s, q) => s + q.data!.resumen.contestadas, 0) / ok.length : undefined

  const [cola, setCola] = useState<AvisoDelRitmo[]>([])
  useEffect(() => {
    if (!activo || !yoId || contestadas === undefined || !mediaLista) return
    const clave = CLAVE_MEMORIA(yoId, reloj.ymd)
    const r = avisosDelRitmo(leerMemoria(clave), contestadas, reloj.minutos, tipo, media)
    guardarMemoria(clave, r.memoria)
    // Sincroniza con la hora y las llamadas, que llegan de afuera: por eso va en un efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (r.avisos.length) setCola(c => [...c, ...r.avisos])
  }, [activo, yoId, contestadas, reloj.minutos, reloj.ymd, tipo, media, mediaLista])

  const actual = cola[0]
  useEffect(() => {
    if (!actual) return
    const t = setTimeout(() => setCola(c => c.slice(1)), SEGUNDOS_POR_AVISO * 1000)
    return () => clearTimeout(t)
  }, [actual])

  if (!actual) return null
  return (
    <div role="status" aria-live="polite" key={actual.clave}
      className="no-print fixed bottom-4 left-1/2 z-[60] flex w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 max-md:bottom-[76px]">
      <Propelin className="size-11 animate-hero-float" />
      <div className={cn('relative flex-1 rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-[12.5px] leading-snug text-foreground shadow-(--shadow-md) [border:1px_solid]', TONO[actual.color].borde)}>
        <button type="button" onClick={() => setCola(c => c.slice(1))} aria-label="Cerrar"
          className="absolute -top-2 -right-2 grid size-5 cursor-pointer place-items-center rounded-full bg-card text-[11px] text-(--fg-muted) shadow-(--shadow-sm) [border:1px_solid_var(--line)] hover:text-foreground">
          ✕
        </button>
        {actual.texto}
      </div>
    </div>
  )
}
