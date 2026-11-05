import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { localTodayIso, shiftIsoDate, startOfMonthIso, startOfWeekIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrmLeads, useTareasPendientes } from '../hooks/useCrmLeads'
import { useObjetivos, useObjetivosDeVarios } from '../hooks/useObjetivos'
import { useVerComo } from '../hooks/useVerComo'
import { escribirFiltros, filtrosDesdeUrl } from '../lib/leadFilterParams'
import { pendientesDePersona, semanasHaciaAtras, sumarResumenes, tasaDeDecisor, type Objetivo, type PeriodoDeObjetivos } from '../lib/objetivos'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { puedeVerComo } from '../lib/permisos'
import type { Usuario } from '../types'

/* Qué es cada número y de dónde sale (5/11/2026, por pedido): tocar el encabezado en el diálogo lo
   explica. Si cambia una consulta de `useObjetivos` / `crm.service`, cambia el texto acá. */
type Explicado = { label: string; title: string; explicacion: string; fuente: string }

const LLAMADAS_DE_LA_PERSONA = 'Tabla crm_comments: las actividades escritas a mano (comment_type = MANUAL, sin borrar) que registró la persona (created_by) en el período (created_at), con la meta de la actividad (long_description que empieza con <!--act-->)'

// «No respondidas» va primera, a la izquierda (17/10/2026, por pedido), en el contador y en el diálogo.
const COLUMNAS: (Explicado & { k: Objetivo })[] = [
  {
    k: 'noRespondidas', label: 'No respondidas', title: 'Llamadas que nadie atendió',
    explicacion: 'Cada «Contacto fallido» que registraste: llamaste y nadie atendió. Cuenta llamadas, no inmobiliarias: tres intentos al mismo lead son tres.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada y resultado no_respondida.`,
  },
  {
    k: 'contestadas', label: 'Contestadas', title: 'Llamadas en las que hablaste con alguien de la inmobiliaria',
    explicacion: 'Cada «Llamada» registrada: alguien de la inmobiliaria atendió, decida o no. Cuenta llamadas.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada y resultado contestada.`,
  },
  {
    k: 'decisores', label: 'Con decisor', title: 'De las contestadas, en cuántas hablaste con alguien que decide',
    explicacion: 'De las contestadas, las que se registraron con «¿Es decisor?» en Sí (o con alguien que el perfil ya marca como decisor). Cuenta llamadas.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada, resultado contestada y decisor = true en la meta.`,
  },
  {
    k: 'decisoresNuevos', label: 'Decisores nuevos', title: 'Llamadas en las que hablaste por primera vez con un decisor: con quien ya había hablado alguien del equipo no cuenta',
    explicacion: 'De las llamadas con decisor, aquellas en las que se habló con un decisor con quien nadie del equipo había hablado antes en ese lead (se compara por nombre). Sin nombre, cuenta solo si el lead nunca había tenido una llamada con decisor.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, con decisor, comparadas contra todas las actividades anteriores de esos leads en crm_comments, de cualquier persona.`,
  },
  {
    k: 'presentaciones', label: 'Mails de presentación', title: 'Mails «Presentación con vídeo» enviados',
    explicacion: 'Mails «Presentación con vídeo» que mandaste desde «Mensajes» del lead. No cuentan los que no salieron (falló el envío o la dirección estaba suprimida).',
    fuente: 'Tabla crm_emails: plantilla = presentacion-video, enviados por la persona (sent_by) en el período (sent_at), sin status failed ni suppressed.',
  },
  {
    k: 'demos', label: 'Demos agendadas', title: 'Demos que agendaste (cuenta el día en que se agendaron, no para cuándo son)',
    explicacion: 'Reuniones que agendaste en el período. Cuenta el día en que se agendaron, no el día de la demo.',
    fuente: 'Tabla crm_meetings: creadas por la persona (created_by) en el período (created_at), sin borrar.',
  },
]

const TASA: Explicado = {
  label: 'Decisor por contactado',
  title: 'De las inmobiliarias que contestaron, en cuántas se habló con un decisor',
  explicacion: 'De las inmobiliarias que contestaron una llamada en el período, qué parte terminó en una llamada con un decisor. Cuenta inmobiliarias y no llamadas: dos llamadas al mismo lead son una. Ejemplo: 10 inmobiliarias contestaron y en 4 se habló con un decisor = 40 %. Con varias personas, la misma inmobiliaria cuenta una vez.',
  fuente: `Las mismas llamadas de «Contestadas» y «Con decisor» (${LLAMADAS_DE_LA_PERSONA}), contando inmobiliarias distintas (lead_id): las de «Con decisor» dividido las de «Contestadas».`,
}

/** La tasa va pegada después de esta columna, en el contador y en el diálogo. */
const TRAS: Objetivo = 'decisores'

const porciento =(t: ReturnType<typeof tasaDeDecisor> | undefined) => (
  t ? <span className="tabular-nums" title={`${t.conDecisor} de ${t.contestadas} inmobiliarias`}>
    {t.tasa === null ? '–' : `${Math.round(t.tasa * 100)} %`}
    <span className="ml-1 text-[11px] font-normal text-(--fg-muted)">{t.conDecisor}/{t.contestadas}</span>
  </span> : numero(undefined)
)

/** El encabezado que, tocado, explica qué es el número y de qué parte de la base sale. */
function Explicacion({ c, children, align = 'end', className }: {
  c: Explicado; children: React.ReactNode; align?: 'start' | 'end'; className?: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" title={`${c.title}. Tocá para ver qué es y de dónde sale.`}
          className={className ?? 'cursor-pointer uppercase underline decoration-dotted underline-offset-4 hover:text-foreground'}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 text-left text-[13px] font-normal normal-case tracking-normal">
        <p className="font-semibold text-foreground">{c.label}</p>
        <p className="mt-1 text-(--fg-2)">{c.explicacion}</p>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">De dónde sale</p>
        <p className="mt-0.5 text-[12px] text-(--fg-2)">{c.fuente}</p>
      </PopoverContent>
    </Popover>
  )
}

/** Cuántas semanas se ven a la vez en el selector; las flechas saltan de a tantas. */
const SEMANAS_A_LA_VEZ = 6

const numero = (n: number | undefined) => (
  <span className={cn('tabular-nums', n === undefined && 'text-(--fg-faint)')}>{n ?? '–'}</span>
)

/* Lo que registré ESTA SEMANA: llamadas por resultado, decisores nuevos, mails de presentación y
   demos. Fue «Objetivos hoy» y desde el 17/10/2026 (por pedido) cuenta desde el lunes: vuelve a
   cero cuando termina el domingo. Cada número es un botón: filtra la lista a esos leads
   (`?objetivo=`, también de la semana) y otro clic lo saca. El rótulo abre el diálogo para comparar
   semanas y personas. */
export function ContadorDeLlamadas() {
  const [abierto, setAbierto] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const elegido = filtrosDesdeUrl(searchParams).objetivo
  const { data, isError } = useObjetivos(startOfWeekIso(localTodayIso()))
  if (isError) return null

  const alternar = (k: Objetivo) =>
    setSearchParams(prev => escribirFiltros(prev, { objetivo: elegido === k ? null : k }), { replace: true })

  return (
    <>
      <div role="group" aria-label="Objetivos de la semana"
        className="flex flex-wrap items-stretch overflow-hidden rounded-lg bg-card [border:1px_solid_var(--line)]">
        <button type="button" onClick={() => setAbierto(true)} title="Comparar semanas y personas"
          className="flex cursor-pointer items-center px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted) hover:bg-(--surface-2) hover:text-foreground">
          Objetivos semanales
        </button>
        {COLUMNAS.map(c => (
          <Fragment key={c.k}>
            <button type="button" aria-pressed={elegido === c.k}
              title={elegido === c.k ? 'Quitar el filtro' : `${c.title}. Tocá para ver esos leads.`}
              onClick={() => alternar(c.k)}
              className={cn(
                'flex cursor-pointer items-baseline gap-1.5 px-2.5 py-1 [border-left:1px_solid_var(--line)] hover:bg-(--surface-2)',
                elegido === c.k && 'bg-(--surface-2) shadow-[inset_0_-2px_0_var(--brand)]',
              )}>
              <span className="text-[15px] font-semibold text-foreground">{numero(data?.resumen[c.k])}</span>
              <span className={cn('text-[12px] text-(--fg-2)', elegido === c.k && 'font-semibold text-foreground')}>{c.label}</span>
            </button>
            {/* La tasa no filtra (no es un conjunto de leads): tocarla la explica. */}
            {c.k === TRAS && (
              <Explicacion c={TASA} align="start"
                className="flex cursor-pointer items-baseline gap-1.5 px-2.5 py-1 [border-left:1px_solid_var(--line)] hover:bg-(--surface-2)">
                <span className="text-[15px] font-semibold text-foreground">{porciento(data ? tasaDeDecisor([data]) : undefined)}</span>
                <span className="text-[12px] text-(--fg-2)">{TASA.label}</span>
              </Explicacion>
            )}
          </Fragment>
        ))}
      </div>
      {abierto && <ObjetivosDialog onClose={() => setAbierto(false)} />}
    </>
  )
}

/** Hoy y el mes van como períodos más, al lado de las semanas: es lo que mostraba el diálogo antes. */
function periodosFijos(hoy: string): PeriodoDeObjetivos[] {
  const manana = shiftIsoDate(hoy, 1)
  return [
    { desde: hoy, hasta: manana, label: 'Hoy' },
    { desde: startOfMonthIso(hoy), hasta: manana, label: 'Este mes' },
  ]
}

const clave = (p: PeriodoDeObjetivos) => `${p.desde}_${p.hasta}`

/* El diálogo de Objetivos (4/11/2026, por pedido): grande, para comparar. Se eligen uno o varios
   períodos (hoy, el mes o cualquier semana, con flechas hacia atrás) y, quien ve otras carteras,
   una o varias personas. Con varias, cada período lleva una fila por persona y el total. Abajo, lo
   que cada una tiene pendiente ahora. Se monta al abrir: cada vez arranca en «esta semana» y en el
   «yo» de pantalla. Los números de otro salen de lo que la RLS me deja leer, como «Ver como». */
function ObjetivosDialog({ onClose }: { onClose: () => void }) {
  const hoy = localTodayIso()
  const { yo, usuarios, accesos } = useCarteras()
  const { perspectivaId } = useVerComo()

  const elegibles = useMemo(() => {
    const otros = puedeVerComo(yo, usuarios, accesos)
    return yo ? [yo as Usuario, ...otros] : otros
  }, [yo, usuarios, accesos])
  const [personasIds, setPersonasIds] = useState<string[] | null>(null)
  const personas = (personasIds ?? (perspectivaId ? [perspectivaId] : []))
    .map(id => usuarios.find(u => u.id === id)).filter((u): u is Usuario => !!u)

  const [saltar, setSaltar] = useState(0)
  const ventana = semanasHaciaAtras(hoy, SEMANAS_A_LA_VEZ, saltar)
  const fijos = periodosFijos(hoy)
  const [elegidos, setElegidos] = useState<PeriodoDeObjetivos[]>(() => semanasHaciaAtras(hoy, 1))
  // Hoy primero, después las semanas de la más nueva a la más vieja y el mes al final.
  const periodos = [...elegidos].sort((a, b) => orden(a) - orden(b) || b.desde.localeCompare(a.desde))
  function orden(p: PeriodoDeObjetivos) { return p.label === 'Hoy' ? 0 : p.label === 'Este mes' ? 2 : 1 }

  const alternarPeriodo = (p: PeriodoDeObjetivos) => setElegidos(prev =>
    prev.some(x => clave(x) === clave(p))
      ? (prev.length > 1 ? prev.filter(x => clave(x) !== clave(p)) : prev) // siempre queda uno
      : [...prev, p])
  const alternarPersona = (id: string) => {
    const actuales = personas.map(u => u.id)
    if (actuales.includes(id)) { if (actuales.length > 1) setPersonasIds(actuales.filter(x => x !== id)) }
    else setPersonasIds([...actuales, id])
  }

  const pedidos = periodos.flatMap(p => personas.map(u => ({ autor: u.id, desde: p.desde, hasta: p.hasta })))
  const resultados = useObjetivosDeVarios(pedidos, true)
  const resultadoDe = (p: PeriodoDeObjetivos, u: Usuario) =>
    resultados[pedidos.findIndex(x => x.autor === u.id && x.desde === p.desde && x.hasta === p.hasta)]
  const varias = personas.length > 1

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[min(1180px,96vw)]">
        <DialogHeader>
          <DialogTitle>Objetivos</DialogTitle>
          <DialogDescription>Elegí uno o varios períodos{elegibles.length > 1 && ' y una o varias personas'} para compararlos.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {elegibles.length > 1 && (
            <Fila rotulo="Personas">
              {elegibles.map(u => (
                <Chip key={u.id} activo={personas.some(x => x.id === u.id)} onClick={() => alternarPersona(u.id)}>
                  <AvatarUsuario usuario={u} />{u.nombre}
                </Chip>
              ))}
            </Fila>
          )}
          <Fila rotulo="Períodos">
            {fijos.map(p => (
              <Chip key={p.label} activo={elegidos.some(x => clave(x) === clave(p))} onClick={() => alternarPeriodo(p)}>{p.label}</Chip>
            ))}
            <span className="mx-1 h-5 [border-left:1px_solid_var(--line)]" />
            <Button variant="ghost" size="icon" aria-label="Semanas anteriores" title="Semanas anteriores"
              onClick={() => setSaltar(s => s + SEMANAS_A_LA_VEZ)}>
              <ChevronLeftIcon className="size-4" />
            </Button>
            {[...ventana].reverse().map(p => (
              <Chip key={p.desde} activo={elegidos.some(x => clave(x) === clave(p))} onClick={() => alternarPeriodo(p)}>{p.label}</Chip>
            ))}
            <Button variant="ghost" size="icon" aria-label="Semanas más nuevas" title="Semanas más nuevas"
              disabled={saltar === 0} onClick={() => setSaltar(s => Math.max(0, s - SEMANAS_A_LA_VEZ))}>
              <ChevronRightIcon className="size-4" />
            </Button>
          </Fila>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
                <th className="py-2 font-bold" />
                {COLUMNAS.map(c => (
                  <Fragment key={c.k}>
                    <th className="px-3 py-2 text-right font-bold"><Explicacion c={c}>{c.label}</Explicacion></th>
                    {c.k === TRAS && <th className="px-3 py-2 text-right font-bold"><Explicacion c={TASA}>{TASA.label}</Explicacion></th>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => {
                const filas = personas.map(u => ({ u, q: resultadoDe(p, u) }))
                const todos = filas.every(f => f.q?.data) ? filas.map(f => f.q!.data!) : undefined
                const total = todos ? sumarResumenes(todos.map(d => d.resumen)) : undefined
                const tasaTotal = todos ? tasaDeDecisor(todos) : undefined
                return (
                  <Fragment key={clave(p)}>
                    {varias && (
                      <tr className="[border-top:1px_solid_var(--line)]">
                        <th colSpan={COLUMNAS.length + 2} scope="rowgroup" className="pt-4 pb-1 text-left text-[13px] font-semibold text-foreground">{p.label}</th>
                      </tr>
                    )}
                    {filas.map(({ u, q }) => (
                      <tr key={u.id} className={cn(!varias && '[border-top:1px_solid_var(--line-soft)]')}>
                        <th scope="row" className={cn('py-3 text-left', varias ? 'pl-3 font-normal text-(--fg-2)' : 'font-semibold text-foreground')}>
                          {varias ? <span className="flex items-center gap-2"><AvatarUsuario usuario={u} />{u.nombre}</span> : p.label}
                        </th>
                        {COLUMNAS.map(c => (
                          <Fragment key={c.k}>
                            <td className="px-3 py-3 text-right text-[18px] font-semibold text-foreground">
                              {q?.isError ? <span className="text-(--fg-faint)" title="No se pudo leer">!</span> : numero(q?.data?.resumen[c.k])}
                            </td>
                            {c.k === TRAS && (
                              <td className="px-3 py-3 text-right text-[18px] font-semibold text-foreground">
                                {q?.isError ? <span className="text-(--fg-faint)" title="No se pudo leer">!</span> : porciento(q?.data ? tasaDeDecisor([q.data]) : undefined)}
                              </td>
                            )}
                          </Fragment>
                        ))}
                      </tr>
                    ))}
                    {varias && (
                      <tr className="bg-(--surface-2)">
                        <th scope="row" className="py-2.5 pl-3 text-left text-[12px] font-bold uppercase tracking-[0.06em] text-(--fg-muted)">Total</th>
                        {COLUMNAS.map(c => (
                          <Fragment key={c.k}>
                            <td className="px-3 py-2.5 text-right text-[18px] font-bold text-foreground">{numero(total?.[c.k])}</td>
                            {c.k === TRAS && <td className="px-3 py-2.5 text-right text-[18px] font-bold text-foreground">{porciento(tasaTotal)}</td>}
                          </Fragment>
                        ))}
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <PendientesAhora personas={personas} hoy={hoy} />
      </DialogContent>
    </Dialog>
  )
}

const VENCIDAS: Explicado = {
  label: 'Tareas vencidas', title: 'Sus tareas pendientes con fecha anterior a hoy',
  explicacion: 'Tareas suyas sin completar cuyo día ya pasó. La de hoy no cuenta. No depende del período elegido: es lo que hay ahora.',
  fuente: 'Tabla crm_tasks: completed = false, sin borrar, asignadas a la persona (assigned_to) y con due_date anterior a hoy.',
}
const SIN_TAREA: Explicado = {
  label: 'Leads sin tarea', title: 'Leads de su cartera en una etapa de «Seguimiento» sin ninguna tarea suya pendiente',
  explicacion: 'Leads de su cartera que están en una etapa de «Seguimiento» y no tienen ninguna tarea suya pendiente (la de otro no cuenta). Es lo que filtra el chip «Pendiente agendar tarea».',
  fuente: 'Tabla crm_leads (responsable = la persona, assigned_to), cruzada con crm_funnel_stages (management_type = por_tarea y allows_tasks) y con crm_tasks pendientes de la persona en ese lead.',
}

/** Lo que cada persona tiene pendiente hoy: no depende del período elegido. */
function PendientesAhora({ personas, hoy }: { personas: Usuario[]; hoy: string }) {
  const leadsQ = useCrmLeads()
  const tareasQ = useTareasPendientes()
  const { etapasPorId } = useCrmCatalogos()
  const listo = !!leadsQ.data && !!tareasQ.data

  return (
    <section className="mt-2">
      <h3 className="mb-1 text-[13px] font-semibold text-foreground">Pendiente ahora</h3>
      <table className="w-full max-w-[640px] text-[14px]">
        <thead>
          <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
            <th className="py-2 font-bold" />
            <th className="px-3 py-2 text-right font-bold"><Explicacion c={VENCIDAS}>{VENCIDAS.label}</Explicacion></th>
            <th className="px-3 py-2 text-right font-bold"><Explicacion c={SIN_TAREA}>{SIN_TAREA.label}</Explicacion></th>
          </tr>
        </thead>
        <tbody>
          {personas.map(u => {
            const p = listo ? pendientesDePersona(u.id, leadsQ.data!, tareasQ.data!, etapasPorId, hoy) : undefined
            return (
              <tr key={u.id} className="[border-top:1px_solid_var(--line-soft)]">
                <th scope="row" className="py-2.5 text-left font-normal text-(--fg-2)">
                  <span className="flex items-center gap-2"><AvatarUsuario usuario={u} />{u.nombre}</span>
                </th>
                <td className={cn('px-3 py-2.5 text-right text-[18px] font-semibold', p?.vencidas ? 'text-(--danger)' : 'text-foreground')}>{numero(p?.vencidas)}</td>
                <td className={cn('px-3 py-2.5 text-right text-[18px] font-semibold', p?.sinTarea ? 'text-(--danger)' : 'text-foreground')}>{numero(p?.sinTarea)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Fila({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">{rotulo}</span>
      {children}
    </div>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
        activo ? 'bg-(--brand-soft) font-semibold text-(--brand-soft-fg) [border-color:var(--brand)]' : 'text-(--fg-2)',
      )}>
      {children}
    </button>
  )
}
