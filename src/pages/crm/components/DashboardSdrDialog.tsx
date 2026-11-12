import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CopyIcon, DownloadIcon, ExternalLinkIcon, FileTextIcon, SearchIcon } from 'lucide-react'
import { fmtDayMonth, localTodayIso, toIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { SuperadminBadge } from '@/components/SuperadminBadge'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { relojDeEspana } from '@/pages/agenda/lib/horaDeEspana'
import { Explicacion, type Explicado } from './Explicacion'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useDashboardSdr, useGuardarMetaSdr, useMetaSdr } from '../hooks/useDashboardSdr'
import { useVerComo } from '../hooks/useVerComo'
import {
  armarDemos, csvDeDemos, diasHabilesRestantes, filtrarDemos, guionDeSegundaOportunidad, mesesHaciaAtras, mesLocal,
  META_POR_DEFECTO, metricasDelPeriodo, nombreDelMes, periodoDeMes, recordatorioDeDemo, resumenEnTexto, ROTULO_DE_ESTADO,
  segundaOportunidad, TASA_DE_FABRICA, trimestreDe, ultimos12Meses,
  type Cruce, type DemoDelSdr, type EstadoDeDemo, type FiltrosDeDemos, type MetricasSdr, type PeriodoSdr,
} from '../lib/dashboardSdr'
import { puedeVerComo } from '../lib/permisos'
import type { Usuario } from '../types'

/* El Dashboard SDR (11/11/2026, por pedido), desde el diálogo de Objetivos: cómo le va a quien
   agenda demos, con lo que hay en la base y nada cargado a mano. Reglas en `lib/dashboardSdr.ts`.
   Cada número se toca y dice de dónde sale (`Explicacion`, textos abajo): si cambia una consulta de
   `useDashboardSdr`, cambia el texto acá. */

const DEMOS_DE_LA_PERSONA = 'Tabla crm_meetings: reuniones creadas por la persona (created_by), sin borrar, agendadas (created_at) en el período. Una demo es del mes en que se agendó, no del mes en que se hace.'
const LLAMADAS = 'Tabla crm_comments: las actividades MANUAL que registró la persona (created_by) en el período, con meta de tipo llamada (contestada o no respondida). Las mismas que «Contestadas» y «No respondidas» de Objetivos.'

const T = {
  meta: {
    label: 'Meta de demos realizadas', title: 'Demos realizadas contra la meta del período',
    explicacion: 'Demos agendadas en el período que alguien marcó como hechas. La meta es por mes y es la misma para todo el equipo; en un trimestre o en 12 meses se multiplica por la cantidad de meses.',
    fuente: `${DEMOS_DE_LA_PERSONA} Realizada = status completed. La meta vive en roadmap_notas, fila crm-meta-sdr (por defecto ${META_POR_DEFECTO}).`,
  },
  asistencia: {
    label: 'Asistencia', title: 'De las demos que ya se resolvieron, cuántas se hicieron',
    explicacion: 'Realizadas dividido las ya resueltas: realizadas, canceladas y «sin marcar» (la hora ya pasó y nadie la marcó hecha). Las agendadas para más adelante no cuentan. Se parte en confirmadas y sin confirmar.',
    fuente: `${DEMOS_DE_LA_PERSONA} Confirmada = en crm_tasks del lead hay una «Confirmar la demo de hoy…» completada del día de la demo, o «… de mañana…» del día anterior (hora de España).`,
  },
  embudo: {
    label: 'Decisor y pitch', title: 'Qué parte de las llamadas llega a un decisor y qué parte de los decisores termina en demo',
    explicacion: 'Paso de filtro: llamadas con decisor dividido llamadas. Efectividad de pitch: demos agendadas dividido llamadas con decisor. Llamadas por demo: llamadas dividido demos agendadas. 2+ asistentes: demos con dos o más personas en «Quién asiste» (sin registro cuenta como una).',
    fuente: `${LLAMADAS} Con decisor = contestada con decisor = true. Las demos: ${DEMOS_DE_LA_PERSONA} Los asistentes salen del registro de la demo (crm_comments con meta tipo demo).`,
  },
  forecast: {
    label: 'Forecast y ritmo diario', title: 'Cuántas demos y llamadas faltan para llegar a la meta del mes',
    explicacion: `Tasa = realizadas / resueltas del mes (sin resueltas se supone ${Math.round(TASA_DE_FABRICA * 100)} %). Pipeline = agendadas que vienen × tasa. Brecha = meta − realizadas − pipeline. Demos nuevas = brecha / tasa, redondeado para arriba. Llamadas = demos nuevas × llamadas por demo. Ritmo = llamadas / días hábiles que quedan (lunes a viernes, hoy incluido). Solo para el mes en curso.`,
    fuente: `Las mismas demos y llamadas de las otras tarjetas, del mes en curso. ${LLAMADAS}`,
  },
  totales: {
    label: 'Totales del período', title: 'Llamadas, decisores y demos agendadas del período',
    explicacion: 'El forecast es solo del mes en curso: para otro período van los totales.',
    fuente: `${LLAMADAS} ${DEMOS_DE_LA_PERSONA}`,
  },
  contratado: {
    label: 'Contratado', title: 'El lead de la demo ya contrató',
    explicacion: 'El lead está en una etapa marcada «Onboarding» en la configuración del funnel, o ya es onboarding o cliente. Sin plata: no hay comisiones.',
    fuente: 'crm_leads.funnel_stage_id → crm_funnel_stages.starts_onboarding, o crm_leads.lead_type = ONBOARDING / CLIENT.',
  },
} satisfies Record<string, Explicado>

const VARIANTE: Record<EstadoDeDemo, BadgeVariant> = { realizada: 'success', cancelada: 'danger', agendada: 'info', sinMarcar: 'warning' }
const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`)
const diaLocal = (iso: string) => fmtDayMonth(toIsoDate(new Date(iso)))
const enEspana = (iso: string) => { const r = relojDeEspana(iso); return `${fmtDayMonth(r.ymd)} ${r.hora}` }

function copiar(texto: string, que: string) {
  navigator.clipboard.writeText(texto)
    .then(() => toast.success(`${que} copiado`))
    .catch(() => toast.error('No se pudo copiar'))
}

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export function DashboardSdrDialog({ open, onOpenChange, onAbrirLead }: {
  open: boolean; onOpenChange: (open: boolean) => void; onAbrirLead: (leadId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1400px,96vw)] max-md:h-[100dvh] max-md:max-h-none max-md:max-w-none max-md:rounded-none"
      >
        {open && <Contenido onAbrirLead={onAbrirLead} />}
      </DialogContent>
    </Dialog>
  )
}

type Pestana = 'mes' | 'trimestre' | 'anio' | 'segunda'

function Contenido({ onAbrirLead }: { onAbrirLead: (leadId: string) => void }) {
  const { yo, usuarios, accesos, esSuperadmin } = useCarteras()
  const { perspectivaId } = useVerComo()
  const { etapasPorId } = useCrmCatalogos()
  const elegibles = useMemo(() => {
    const otros = puedeVerComo(yo, usuarios, accesos)
    return yo ? [yo as Usuario, ...otros] : otros
  }, [yo, usuarios, accesos])
  const [personaElegida, setPersonaElegida] = useState<string | null>(null)
  const personaId = personaElegida ?? perspectivaId
  const persona = usuarios.find(u => u.id === personaId)

  const datos = useDashboardSdr(personaId, true)
  const metaQ = useMetaSdr(true)
  const metaMensual = metaQ.data ?? META_POR_DEFECTO
  const [ahora] = useState(() => new Date())
  const hoy = localTodayIso()
  const mesActual = hoy.slice(0, 7)

  const demos = useMemo(
    () => (datos.data ? armarDemos(datos.data.reuniones, datos.data.registros, datos.data.tareas, etapasPorId, ahora) : []),
    [datos.data, etapasPorId, ahora],
  )
  const llamadas = datos.data?.llamadas

  const ultimos = mesesHaciaAtras(mesActual, 12)
  const mesesConDatos = ultimos.filter(m => m === mesActual || llamadas?.has(m) || demos.some(d => mesLocal(d.agendadaEl) === m))
  const trimestres = [...new Map(ultimos.map(m => trimestreDe(m)).map(t => [t.label, t])).values()]

  const [pestana, setPestana] = useState<Pestana>('mes')
  const [mes, setMes] = useState(mesActual)
  const [trimestre, setTrimestre] = useState(trimestreDe(mesActual).label)
  const periodo: PeriodoSdr = pestana === 'trimestre' ? (trimestres.find(t => t.label === trimestre) ?? trimestreDe(mesActual))
    : pestana === 'anio' ? ultimos12Meses(mesActual)
      : periodoDeMes(mes)

  const m = useMemo(() => metricasDelPeriodo({
    meses: periodo.meses, demos, llamadas: llamadas ?? new Map(), metaMensual, mesActual, diasHabiles: diasHabilesRestantes(hoy),
  }), [periodo.meses, demos, llamadas, metaMensual, mesActual, hoy])

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-5 pb-3 pr-12 [border-bottom:1px_solid_var(--line)] max-md:px-4">
        <div className="min-w-0">
          <DialogTitle>Dashboard SDR</DialogTitle>
          <DialogDescription className="text-[12.5px]">Demos, asistencia y embudo con lo registrado en el CRM.</DialogDescription>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {elegibles.length > 1 && (
            <Select value={personaId ?? undefined} onValueChange={setPersonaElegida}>
              <SelectTrigger className="h-8 w-44" aria-label="Persona"><SelectValue placeholder="Persona" /></SelectTrigger>
              <SelectContent>
                {elegibles.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}{u.last_name ? ` ${u.last_name}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <EditorDeMeta meta={metaMensual} editable={esSuperadmin} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 max-md:px-4">
        <Tabs value={pestana} onValueChange={v => setPestana(v as Pestana)}>
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="mes">Mes</TabsTrigger>
            <TabsTrigger value="trimestre">Trimestre</TabsTrigger>
            <TabsTrigger value="anio">Últimos 12 meses</TabsTrigger>
            <TabsTrigger value="segunda">Second Chance</TabsTrigger>
          </TabsList>
        </Tabs>
        {pestana === 'mes' && (
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="h-8 w-44 capitalize" aria-label="Mes"><SelectValue /></SelectTrigger>
            <SelectContent>
              {mesesConDatos.map(x => <SelectItem key={x} value={x} className="capitalize">{nombreDelMes(x)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {pestana === 'trimestre' && (
          <Select value={trimestre} onValueChange={setTrimestre}>
            <SelectTrigger className="h-8 w-32" aria-label="Trimestre"><SelectValue /></SelectTrigger>
            <SelectContent>
              {trimestres.map(t => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 max-md:px-4">
        {datos.isError ? <p className="py-10 text-center text-(--danger)">No se pudieron leer los datos.</p>
          : !datos.data ? <p className="py-10 text-center text-(--fg-muted)">Cargando…</p>
            : pestana === 'segunda' ? <SegundaOportunidad demos={demos} onAbrirLead={onAbrirLead} />
              : (
                <div className="flex flex-col gap-5">
                  <Tarjetas m={m} />
                  <Informe m={m} persona={persona?.nombre ?? ''} periodo={periodo.label} />
                  <TablaDeDemos demos={m.demos} onAbrirLead={onAbrirLead} />
                </div>
              )}
      </div>
    </>
  )
}

function EditorDeMeta({ meta, editable }: { meta: number; editable: boolean }) {
  const guardar = useGuardarMetaSdr()
  const [borrador, setBorrador] = useState<string | null>(null)
  if (!editable) return <span className="text-[12.5px] text-(--fg-muted)">Meta: {meta} realizadas por mes</span>
  if (borrador === null) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setBorrador(String(meta))} title="Cambiar la meta del equipo">
        Meta: {meta} por mes <SuperadminBadge />
      </Button>
    )
  }
  const n = Number(borrador)
  const valida = Number.isInteger(n) && n > 0
  const confirmar = () => { if (valida) guardar.mutate(n, { onSuccess: () => setBorrador(null) }) }
  return (
    <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); confirmar() }}>
      <Input type="number" min={1} value={borrador} onChange={e => setBorrador(e.target.value)} autoFocus
        className="h-8 w-20" aria-label="Demos realizadas por mes" />
      <Button type="submit" size="sm" disabled={!valida || guardar.isPending}>Guardar</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setBorrador(null)}>Cancelar</Button>
      <SuperadminBadge />
    </form>
  )
}

function Tarjeta({ c, children }: { c: Explicado; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-card p-4 [border:1px_solid_var(--line)]">
      <Explicacion c={c} align="start"
        className="w-fit cursor-pointer text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted) underline decoration-dotted underline-offset-4 hover:text-foreground">
        {c.label}
      </Explicacion>
      {children}
    </section>
  )
}

const Grande = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[28px] font-semibold leading-none text-foreground tabular-nums">{children}</p>
)
const Renglon = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <p className="flex justify-between gap-2 text-[13px] text-(--fg-2)"><span>{k}</span><span className="font-semibold text-foreground tabular-nums">{v}</span></p>
)

function Tarjetas({ m }: { m: MetricasSdr }) {
  const { meta, asistencia, embudo, forecast, dosOMas, matrices } = m
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tarjeta c={T.meta}>
        <Grande>{meta.realizadas}<span className="text-[16px] font-normal text-(--fg-muted)"> / {meta.objetivo}</span></Grande>
        <div className="h-2 overflow-hidden rounded-full bg-(--surface-2)" role="progressbar"
          aria-valuenow={Math.round(meta.porcentaje * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-full', meta.porcentaje >= 1 ? 'bg-success' : 'bg-(--brand)')}
            style={{ width: `${Math.min(100, meta.porcentaje * 100)}%` }} />
        </div>
        <Renglon k="Cumplido" v={pct(meta.porcentaje)} />
        {meta.porEncima > 0 && <p className="text-[13px] font-semibold text-success">+{meta.porEncima} por encima de la meta</p>}
      </Tarjeta>
      <Tarjeta c={T.asistencia}>
        <Grande>{pct(asistencia.tasa)}</Grande>
        <Renglon k="Realizadas / resueltas" v={`${asistencia.realizadas} / ${asistencia.resueltas}`} />
        <Renglon k="Confirmadas" v={pct(matrices.confirmacion.con.tasa)} />
        <Renglon k="Sin confirmar" v={pct(matrices.confirmacion.sin.tasa)} />
      </Tarjeta>
      <Tarjeta c={T.embudo}>
        <Grande>{pct(embudo.pasoDeFiltro)}<span className="ml-1.5 text-[13px] font-normal text-(--fg-muted)">paso de filtro</span></Grande>
        <Renglon k="Efectividad de pitch" v={pct(embudo.efectividadDePitch)} />
        <Renglon k="Llamadas por demo" v={embudo.llamadasPorDemo === null ? '–' : embudo.llamadasPorDemo.toFixed(1)} />
        <Renglon k="Demos con 2+ asistentes" v={pct(dosOMas.tasa)} />
      </Tarjeta>
      {forecast ? (
        <Tarjeta c={T.forecast}>
          <Grande>{forecast.ritmoDiario ?? '–'}<span className="ml-1.5 text-[13px] font-normal text-(--fg-muted)">llamadas por día</span></Grande>
          <Renglon k="Demos nuevas que faltan" v={forecast.demosNecesarias} />
          <Renglon k="Pipeline (agendadas × tasa)" v={forecast.pipeline.toFixed(1)} />
          <Renglon k={`Tasa${forecast.tasaEstimada ? ' (supuesta)' : ''}`} v={pct(forecast.tasa)} />
          <Renglon k="Días hábiles que quedan" v={forecast.diasHabiles} />
        </Tarjeta>
      ) : (
        <Tarjeta c={T.totales}>
          <Grande>{embudo.llamadas}<span className="ml-1.5 text-[13px] font-normal text-(--fg-muted)">llamadas</span></Grande>
          <Renglon k="Con decisor" v={embudo.decisores} />
          <Renglon k="Demos agendadas" v={embudo.demos} />
          <Renglon k="Realizadas" v={meta.realizadas} />
        </Tarjeta>
      )}
    </div>
  )
}

function Informe({ m, persona, periodo }: { m: MetricasSdr; persona: string; periodo: string }) {
  const [abierto, setAbierto] = useState(false)
  const filaCruce = (rango: string, c: Cruce) => (
    <tr key={rango} className="[border-top:1px_solid_var(--line-soft)]">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-(--fg-2)">{rango}</th>
      <td className="px-2 py-1.5 text-right tabular-nums">{c.realizadas} / {c.demos}</td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{pct(c.tasa)}</td>
    </tr>
  )
  const matriz = (titulo: string, filas: React.ReactNode) => (
    <div className="min-w-0">
      <h4 className="mb-1 text-[12px] font-semibold text-foreground">{titulo}</h4>
      <table className="w-full text-[13px]">
        <thead><tr className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
          <th /><th className="px-2 text-right">Realizadas</th><th className="px-2 text-right">Asistencia</th>
        </tr></thead>
        <tbody>{filas}</tbody>
      </table>
    </div>
  )
  return (
    <section className="rounded-xl [border:1px_solid_var(--line)]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
          <FileTextIcon className="size-4" />Informe
        </Button>
        <span className="text-[12.5px] text-(--fg-muted)">{m.prescripciones[0]}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => copiar(resumenEnTexto(m, { persona, periodo }), 'Resumen')}>
            <CopyIcon className="size-4" />Copiar resumen
          </Button>
          <Button variant="outline" size="sm" onClick={() => descargar(`dashboard-sdr-${persona || 'sdr'}-${periodo}.csv`.replace(/\s+/g, '-'), csvDeDemos(m.demos))}>
            <DownloadIcon className="size-4" />Exportar CSV
          </Button>
        </div>
      </div>
      {abierto && (
        <div className="flex flex-col gap-5 px-4 pb-4">
          <div>
            <h4 className="mb-1 text-[12px] font-semibold text-foreground">Qué hacer</h4>
            <ul className="list-disc pl-5 text-[13.5px] text-(--fg-2)">{m.prescripciones.map(p => <li key={p}>{p}</li>)}</ul>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {matriz('Asistencia según confirmación', [filaCruce('Confirmadas', m.matrices.confirmacion.con), filaCruce('Sin confirmar', m.matrices.confirmacion.sin)])}
            {matriz('Asistencia según antelación', m.matrices.antelacion.map(f => filaCruce(f.rango, f)))}
            {matriz('Asistencia según asistentes', m.matrices.asistentes.map(f => filaCruce(f.rango, f)))}
          </div>
          <div className="overflow-x-auto">
            <h4 className="mb-1 text-[12px] font-semibold text-foreground">Mes a mes</h4>
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
                  <th className="py-1 text-left">Mes</th><th className="px-2 text-right">Llamadas</th><th className="px-2 text-right">Decisores</th>
                  <th className="px-2 text-right">Demos</th><th className="px-2 text-right">Asistencia</th><th className="px-2 text-right">Realizadas</th>
                  <th className="px-2 text-right">Contratados</th>
                </tr>
              </thead>
              <tbody>
                {m.desglose.map(f => (
                  <tr key={f.mes} className="[border-top:1px_solid_var(--line-soft)]">
                    <th scope="row" className="py-1.5 text-left font-normal capitalize text-(--fg-2)">{nombreDelMes(f.mes)}</th>
                    <td className="px-2 text-right tabular-nums">{f.llamadas}</td>
                    <td className="px-2 text-right tabular-nums">{f.decisores} <span className="text-(--fg-muted)">({pct(f.pasoDeFiltro)})</span></td>
                    <td className="px-2 text-right tabular-nums">{f.demos} <span className="text-(--fg-muted)">({pct(f.efectividadDePitch)})</span></td>
                    <td className="px-2 text-right tabular-nums">{pct(f.asistencia)}</td>
                    <td className="px-2 text-right tabular-nums">{f.realizadas}</td>
                    <td className="px-2 text-right tabular-nums">{f.contratados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function EstadoBadge({ d }: { d: DemoDelSdr }) {
  return (
    <Badge variant={VARIANTE[d.estado]} title={d.motivoCancelacion ? `Motivo: ${d.motivoCancelacion}` : undefined}>
      {ROTULO_DE_ESTADO[d.estado]}
    </Badge>
  )
}

function Buscador({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--fg-muted)" />
      <Input value={valor} onChange={e => onChange(e.target.value)} placeholder="Buscar inmobiliaria o contacto"
        className="h-8 w-60 pl-8 max-md:w-full" aria-label="Buscar" />
    </div>
  )
}

const ESTADOS: EstadoDeDemo[] = ['agendada', 'sinMarcar', 'realizada', 'cancelada']

function TablaDeDemos({ demos, onAbrirLead }: { demos: DemoDelSdr[]; onAbrirLead: (leadId: string) => void }) {
  const [f, setF] = useState<FiltrosDeDemos>({ busqueda: '', estado: 'todos', calendario: 'todos', foco: false, orden: 'demo' })
  const filas = filtrarDemos(demos, f)
  const cambiar = (patch: Partial<FiltrosDeDemos>) => setF(x => ({ ...x, ...patch }))
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-[14px] font-semibold text-foreground">Demos del período <span className="font-normal text-(--fg-muted)">{filas.length}</span></h3>
        <Buscador valor={f.busqueda} onChange={busqueda => cambiar({ busqueda })} />
        <Select value={f.estado} onValueChange={v => cambiar({ estado: v as FiltrosDeDemos['estado'] })}>
          <SelectTrigger className="h-8 w-36" aria-label="Estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS.map(e => <SelectItem key={e} value={e}>{ROTULO_DE_ESTADO[e]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={f.calendario} onValueChange={v => cambiar({ calendario: v as FiltrosDeDemos['calendario'] })}>
          <SelectTrigger className="h-8 w-40" aria-label="Calendario"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Confirmadas o no</SelectItem>
            <SelectItem value="confirmadas">Confirmadas</SelectItem>
            <SelectItem value="pendientes">Sin confirmar</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={f.foco ? 'default' : 'outline'} size="sm" aria-pressed={f.foco} onClick={() => cambiar({ foco: !f.foco })}
          title="Solo lo que hay que mover: agendadas y sin marcar">Foco</Button>
        <Select value={f.orden} onValueChange={v => cambiar({ orden: v as FiltrosDeDemos['orden'] })}>
          <SelectTrigger className="h-8 w-48" aria-label="Orden"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="demo">Por fecha de la demo</SelectItem>
            <SelectItem value="agendada">Por cuándo se agendó</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-xl [border:1px_solid_var(--line)]">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead>
            <tr className="bg-(--surface-2) text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
              <th className="px-3 py-2">Agendada</th><th className="px-3 py-2">Demo (España)</th><th className="px-3 py-2 text-right">Antelación</th>
              <th className="px-3 py-2">Inmobiliaria</th><th className="px-3 py-2">Contacto</th><th className="px-3 py-2 text-right">Asist.</th>
              <th className="px-3 py-2">Estado</th><th className="px-3 py-2">Calendario</th>
              <th className="px-3 py-2"><Explicacion c={T.contratado} align="start">Contratado</Explicacion></th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-(--fg-muted)">No hay demos con estos filtros.</td></tr>
            )}
            {filas.map(d => (
              <tr key={d.id} className="[border-top:1px_solid_var(--line-soft)]">
                <td className="px-3 py-2 tabular-nums text-(--fg-2)">{diaLocal(d.agendadaEl)}</td>
                <td className="px-3 py-2 tabular-nums">{enEspana(d.empiezaEl)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-(--fg-2)">{d.antelacion} d</td>
                <td className="max-w-[220px] truncate px-3 py-2 font-medium text-foreground" title={d.inmobiliaria}>{d.inmobiliaria}</td>
                <td className="max-w-[180px] truncate px-3 py-2 text-(--fg-2)" title={d.contacto}>{d.contacto || '–'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.con.length ? d.asistentes : <span title="Sin registro: se cuenta como uno">1?</span>}</td>
                <td className="px-3 py-2">
                  <EstadoBadge d={d} />
                  {d.motivoCancelacion && <p className="mt-0.5 max-w-[180px] truncate text-[11.5px] text-(--fg-muted)" title={d.motivoCancelacion}>{d.motivoCancelacion}</p>}
                </td>
                <td className="px-3 py-2">
                  {d.confirmada ? <Badge variant="success">Confirmada</Badge> : <Badge variant="neutral">Pendiente</Badge>}
                </td>
                <td className="px-3 py-2">{d.contratado ? <Badge variant="brand">Contratado</Badge> : null}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    {d.estado === 'agendada' && (
                      <Button variant="ghost" size="sm" onClick={() => copiar(recordatorioDeDemo(d), 'Recordatorio')} title="Copiar el WhatsApp para confirmar la demo">
                        <CopyIcon className="size-4" /><span className="max-xl:hidden">Recordatorio</span>
                      </Button>
                    )}
                    {d.leadId && (
                      <Button variant="ghost" size="sm" onClick={() => onAbrirLead(d.leadId!)} title="Abrir lead">
                        <ExternalLinkIcon className="size-4" /><span className="max-xl:hidden">Abrir lead</span>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SegundaOportunidad({ demos, onAbrirLead }: { demos: DemoDelSdr[]; onAbrirLead: (leadId: string) => void }) {
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'todos' | 'cancelada' | 'sinMarcar'>('todos')
  const filas = filtrarDemos(segundaOportunidad(demos), { busqueda, estado, calendario: 'todos', foco: false, orden: 'demo' })
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[13px] text-(--fg-2)">
        Las demos que se cayeron (canceladas) o quedaron sin marcar, de los últimos 12 meses: para volver a agendarlas.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Buscador valor={busqueda} onChange={setBusqueda} />
        <Select value={estado} onValueChange={v => setEstado(v as typeof estado)}>
          <SelectTrigger className="h-8 w-40" aria-label="Estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Canceladas y sin marcar</SelectItem>
            <SelectItem value="cancelada">Canceladas</SelectItem>
            <SelectItem value="sinMarcar">Sin marcar</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[12.5px] text-(--fg-muted)">{filas.length}</span>
      </div>
      {filas.length === 0 ? <p className="py-8 text-center text-(--fg-muted)">Nada para rescatar.</p> : (
        <ul className="flex flex-col gap-2">
          {filas.map(d => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-card px-4 py-3 [border:1px_solid_var(--line)]">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{d.inmobiliaria}</p>
                <p className="truncate text-[12.5px] text-(--fg-2)">
                  {d.contacto || 'Sin contacto'} · demo el {enEspana(d.empiezaEl)} (España)
                  {d.motivoCancelacion && ` · ${d.motivoCancelacion}`}
                </p>
              </div>
              <EstadoBadge d={d} />
              <Button variant="outline" size="sm" onClick={() => copiar(guionDeSegundaOportunidad(d), 'Guion')}>
                <CopyIcon className="size-4" />Copiar guion
              </Button>
              {d.leadId && (
                <Button variant="outline" size="sm" onClick={() => onAbrirLead(d.leadId!)} title="Abrir el lead para reagendar">
                  <ExternalLinkIcon className="size-4" />Abrir lead
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
