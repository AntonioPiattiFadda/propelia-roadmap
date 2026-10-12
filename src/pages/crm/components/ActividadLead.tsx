import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft, CalendarDays, ChevronDown, CircleCheck, Clock, Info, ListTodo, MessageSquare, Phone, PhoneMissed, Plus, Sparkles, Trash2, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useActualizarCliente, useActualizarLead, useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import {
  agruparPorDia, armarMetaDeActividad, horaDe, lineaDeTiempo, type ItemActividad, type MetaDeActividad,
  type ResultadoDeLlamada,
} from '../lib/actividad'
import { campoDelNuevoDecisor, contactosConDecisor, decisorSabido, nombreDelLead } from '../lib/clientData'
import { armarReunion } from '../lib/reuniones'
import { crearComentario, crearReunion, crearTarea, marcarComentarioBorrado } from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle } from '../types'
import { InmobiliariaDelLead } from './InmobiliariaDelLead'
import { CamposDeReunion, camposReunionVacios, type CamposReunion } from './ReunionesDelLead'
import { ChipsDeVencimiento } from './TareasDelLead'
import { VentanaFlotante } from './VentanaFlotante'

/* NUEVO. En el producto el chat de actividad vive adentro de LeadAccordion (5.600 líneas); acá
   es la columna derecha del dialog del lead. Arriba la línea de tiempo partida por día; abajo,
   fijo y fuera del scroll, el compositor. El compositor escribe en tres lugares según la pastilla
   —un comentario (nota, llamada o contacto fallido), una tarea o una demo (que es una reunión)—.
   La tarea se sacó el 10/10/2026 y volvió el 12/10/2026, las dos veces por pedido.
   El contacto fallido es su propia pastilla y no un resultado adentro de «Llamada» (12/10/2026,
   por pedido): es lo que más se registra y no puede costar dos clics. Se guarda igual que antes
   —una llamada con resultado 'no_respondida'—, así el contador del día no se entera. */

type Tipo = 'nota' | 'llamada' | 'fallido' | 'tarea' | 'reunion'
const TIPOS: { id: Tipo; label: string; icono: LucideIcon }[] = [
  { id: 'llamada', label: 'Llamada', icono: Phone },
  { id: 'fallido', label: 'Contacto fallido', icono: PhoneMissed },
  { id: 'nota', label: 'Actividad', icono: MessageSquare },
  { id: 'tarea', label: 'Tarea', icono: ListTodo },
  { id: 'reunion', label: 'Agendar demo', icono: CalendarDays },
]

// Sin título escrito, la reunión se guarda como «Demo»: es lo único que agenda esta pastilla.
const TITULO_DEMO = 'Demo'

const ICONO: Record<ItemActividad['tipo'], LucideIcon> = {
  comentario: MessageSquare, llamada: Phone, sistema: Info, gestion: CircleCheck, pospuesto: Clock,
  etapa: ArrowRightLeft, asignacion: UserRound, reunion: CalendarDays, tarea: ListTodo, consejo: Sparkles,
}

/* Lo que se registra desde el compositor se titula por qué es —Nota, Tarea, Demo— y lo que pasó va
   abajo, en su recuadro. El resto (gestiones, etapas, responsable) es una línea sola: ya se explica. */
const TITULO: Partial<Record<ItemActividad['tipo'], string>> = {
  comentario: 'Nota', llamada: 'Llamada', tarea: 'Tarea', reunion: 'Demo', consejo: 'Consejo de Claude para SDR',
}

/** «Laura, Marc y Ana»: la gente se lee como en una frase, no como una lista con comas. */
const enFrase = (nombres: string[]) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

/** El título de un renglón del compositor: «Llamada con Laura · decisor», «Contacto fallido». */
function tituloDe(i: ItemActividad): string | undefined {
  const base = TITULO[i.tipo]
  if (!base) return undefined
  if (i.tipo === 'llamada' && i.resultado === 'no_respondida') return 'Contacto fallido'
  const conQuien = i.con?.length ? `${base} con ${enFrase(i.con)}` : base
  return i.tipo === 'llamada' && i.decisor ? `${conQuien} · decisor` : conQuien
}

/** Lo que queda escrito en la llamada si no se escribió nada: el resultado ya es el dato. */
const TEXTO_DE_LLAMADA: Record<ResultadoDeLlamada, string> = { contestada: 'Llamada contestada.', no_respondida: 'No respondió.' }

const pastilla = (on: boolean) => cn(
  'inline-flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
  on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)

/* La columna tiene dos pestañas: la actividad y la inmobiliaria. El selector vive en la cabecera
   del dialog, centrado, y el estado en `CuerpoDelLead`: al cambiar de lead se vuelve a la
   actividad sola (el cuerpo del dialog va con key = lead). La segunda NO desmonta la primera, la
   esconde: lo que se estaba escribiendo en el compositor sigue ahí al volver. */
export type PestanaDelLead = 'actividad' | 'inmobiliaria'

export function PestanasDelLead({ lead, pestana, onCambiar }: {
  lead: CrmLeadRow
  pestana: PestanaDelLead
  onCambiar: (p: PestanaDelLead) => void
}) {
  return (
    <div role="tablist" aria-label="Actividad e inmobiliaria" className="flex h-9 min-w-0 items-stretch gap-5 max-md:gap-4">
      {([['actividad', 'Actividad'], ['inmobiliaria', nombreDelLead(lead.client)]] as const).map(([id, label]) => {
        const on = pestana === id
        return (
          <button key={id} type="button" role="tab" id={`pestana-${id}`} aria-selected={on} aria-controls={`panel-${id}`}
            onClick={() => onCambiar(id)} title={label}
            className={cn(
              'min-w-0 cursor-pointer truncate text-[14px] font-semibold transition-colors',
              id === 'inmobiliaria' ? 'max-w-[240px]' : 'shrink-0',
              on ? 'text-foreground [border-bottom:2px_solid_var(--foreground)]'
                : 'text-(--fg-muted) [border-bottom:2px_solid_transparent] hover:text-foreground',
            )}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function ActividadLead({ lead, detalle, cargando, puedeEscribir, pestana, otrosContactos }: {
  lead: CrmLeadRow
  detalle: LeadDetalle | undefined
  cargando: boolean
  puedeEscribir: boolean
  pestana: PestanaDelLead
  /** Lo pasa de largo a la pestaña de la inmobiliaria: ver `InmobiliariaDelLead`. */
  otrosContactos?: ReactNode
}) {
  const { etapasPorId, etapasActivas } = useCrmCatalogos()
  const { usuarios } = useCarteras()
  const [abierto, setAbierto] = useState(false)
  // El consejo de Claude nace plegado: se lee una vez antes de llamar y después estorba.
  const [consejoAbierto, setConsejoAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<Tipo>('llamada')
  const [con, setCon] = useState<string[]>([])
  // `null` es «todavía no contestó la pregunta»: una llamada no se registra sin decirlo.
  const [decisor, setDecisor] = useState<boolean | null>(null)
  const [vence, setVence] = useState<string | null>(() => localTodayIso())
  const conDecisor = contactosConDecisor(lead.client)
  const contactos = conDecisor.map(c => c.nombre)
  // Con quién solo tiene sentido en lo que pasó con alguien: una nota o una llamada (que siempre es
  // contestada: la que nadie atendió es «Contacto fallido»).
  const pideConQuien = tipo === 'nota' || tipo === 'llamada'
  // En una llamada los campos se piden de a uno: primero con quién, después si decide.
  // Sin contactos cargados no hay a quién elegir, y la pregunta del decisor aparece igual.
  const eligioConQuien = contactos.length === 0 || con.some(c => contactos.includes(c))
  // Si el perfil ya dice si los elegidos deciden, no se pregunta: se toma de ahí.
  const sabido = decisorSabido(conDecisor, con)
  const pideDecisor = tipo === 'llamada' && eligioConQuien && sabido === null
  /* Toda actividad registrada pide elegir en qué etapa queda el lead, para que avanzarlo no
     dependa de acordarse (12/10/2026, por pedido). Arranca VACÍA y es obligatoria: precargarla
     (con la actual o con una sugerida) hacía que se confirmara sin leerla. Registrar sin elegir
     la marca en rojo y no registra. El contacto fallido no mueve nada y no la pide. Descartar no
     se ofrece: lleva motivo y tiene su propio diálogo en el perfil. */
  const pideEtapa = tipo !== 'fallido'
  const [etapaElegida, setEtapaElegida] = useState<string | null>(null)
  const [faltaEtapa, setFaltaEtapa] = useState(false)
  const etapaFinal = etapaElegida ?? ''
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel)
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  const [reunion, setReunion] = useState<CamposReunion>(camposReunionVacios)
  const lista = useRef<HTMLDivElement>(null)
  const enActividad = pestana === 'actividad'

  const comentar = useMutacionDelDetalle(lead.id, (v: { description: string; meta: MetaDeActividad }) =>
    crearComentario({ lead_id: lead.id, description: v.description, long_description: armarMetaDeActividad(v.meta) }))
  // Tarea y reunión nuevas son del responsable del lead, igual que en sus listas del perfil.
  const agregarTarea = useMutacionDelDetalle(lead.id, (title: string) =>
    crearTarea({ lead_id: lead.id, title, due_date: vence, assigned_to: lead.assigned_to }), { exito: 'Tarea creada' })
  const agendar = useMutacionDelDetalle(lead.id, (title: string) =>
    crearReunion({ lead_id: lead.id, assigned_to: lead.assigned_to, title: title || TITULO_DEMO, ...armarReunion(reunion.fecha, reunion.hora, reunion.duracion) }),
    { exito: 'Demo agendada' })
  const actualizarLead = useActualizarLead()
  /* Lo registrado a mano (nota, llamada, contacto fallido) se puede borrar si se cargó por error
     (12/10/2026, por pedido). Es soft delete y sin confirmación: el aviso trae «Deshacer». Lo que
     escribe el sistema (cambios de etapa, de responsable, tareas y demos) no se borra desde acá:
     es el rastro de lo que pasó, y las tareas y demos se borran desde sus listas. Borrar la
     actividad no deshace la etapa que se eligió al registrarla. */
  const borrarActividad = useMutacionDelDetalle(lead.id,
    (v: { id: string; borrado: boolean }) => marcarComentarioBorrado(v.id, v.borrado),
    { optimista: (d, v) => v.borrado ? { ...d, comments: d.comments.filter(c => c.id !== v.id) } : d })
  const borrar = (id: string) => borrarActividad.mutate({ id, borrado: true }, {
    onSuccess: () => toast('Actividad borrada', {
      action: { label: 'Deshacer', onClick: () => borrarActividad.mutate({ id, borrado: false }) },
    }),
  })
  const actualizarCliente = useActualizarCliente()

  /* Recién con la actividad guardada se mueve la etapa: si el registro falla, el lead no avanza por
     algo que no quedó escrito. Lo que se confirmó igual a la actual no toca la base. */
  const moverEtapa = () => {
    const destino = etapasPorId.get(etapaFinal)
    setEtapaElegida(null)
    setFaltaEtapa(false)
    if (!pideEtapa || !destino || destino.id === lead.funnel_stage_id) return
    actualizarLead.mutate(
      { id: lead.id, patch: { funnel_stage_id: destino.id, discard_reason: null, recontact_at: null } },
      { onSuccess: () => toast.success(`Lead en «${destino.label}»`) })
  }

  const items = detalle ? lineaDeTiempo(detalle, etapasPorId, usuarios, lead.client) : []
  const dias = agruparPorDia(items, localTodayIso())
  const usuariosPorId = new Map(usuarios.map(u => [u.id, u]))

  // Se lee como un chat: lo último abajo, pegado al compositor. Al llegar algo nuevo se baja.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, enActividad])

  const enviando = comentar.isPending || agregarTarea.isPending || agendar.isPending
  const limpio = texto.trim()
  // La demo se puede agendar sin título (queda «Demo»), y la llamada y el contacto fallido sin
  // texto (el tipo ya dice qué pasó); la nota y la tarea, no. La llamada sí pide con quién se
  // habló y si es decisor.
  const listo = tipo === 'reunion' ? !!reunion.fecha
    : tipo === 'llamada' ? eligioConQuien && (sabido !== null || decisor !== null)
    : tipo === 'fallido' ? true
    : !!limpio

  const enviar = () => {
    if (!listo || enviando) return
    if (pideEtapa && !etapaFinal) { setFaltaEtapa(true); return }
    if (tipo === 'llamada' || tipo === 'fallido') {
      const resultado: ResultadoDeLlamada = tipo === 'llamada' ? 'contestada' : 'no_respondida'
      // Se guardan solo los que siguen siendo contactos: alguien pudo borrar un teléfono mientras tanto.
      const elegidos = con.filter(c => contactos.includes(c))
      const esDecisor = sabido ?? decisor === true
      const meta: MetaDeActividad = tipo === 'llamada'
        ? { tipo: 'llamada', con: elegidos, resultado, decisor: esDecisor }
        : { tipo: 'llamada', con: [], resultado }
      // Contestó que sí: el contacto queda como decisor en el perfil y la próxima no se pregunta.
      const nuevoDecisor = tipo === 'llamada' && sabido === null ? campoDelNuevoDecisor(conDecisor, elegidos, esDecisor) : null
      comentar.mutate({ description: limpio || TEXTO_DE_LLAMADA[resultado], meta },
        { onSuccess: () => {
          setTexto(''); setCon([]); setDecisor(null); setAbierto(false)
          if (nuevoDecisor && lead.client) {
            actualizarCliente.mutate({ clientId: lead.client.id, patch: { [nuevoDecisor]: true } })
          }
          moverEtapa()
        } })
    }
    else if (tipo === 'nota') {
      const meta = { tipo, con: con.filter(c => contactos.includes(c)) }
      comentar.mutate({ description: limpio, meta }, { onSuccess: () => { setTexto(''); setCon([]); setAbierto(false); moverEtapa() } })
    }
    else if (tipo === 'tarea') {
      agregarTarea.mutate(limpio, { onSuccess: () => { setTexto(''); setVence(localTodayIso()); setAbierto(false); moverEtapa() } })
    }
    else agendar.mutate(limpio, { onSuccess: () => { setTexto(''); setReunion(camposReunionVacios()); setAbierto(false); moverEtapa() } })
  }


  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {!enActividad && (
        <div role="tabpanel" id="panel-inmobiliaria" aria-labelledby="pestana-inmobiliaria" className="flex min-h-0 flex-1 flex-col">
          <InmobiliariaDelLead lead={lead} puedeEscribir={puedeEscribir} otrosContactos={otrosContactos} />
        </div>
      )}

      <div ref={lista} role="tabpanel" id="panel-actividad" aria-labelledby="pestana-actividad" hidden={!enActividad}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-3 max-md:px-3">
        {cargando && <p className="py-4 text-[13px] text-(--fg-muted)">Cargando actividad…</p>}
        {!cargando && items.length === 0 && <p className="py-4 text-[13px] text-(--fg-muted)">Sin actividad todavía.</p>}
        {dias.map(d => (
          <section key={d.dia} className="pb-1">
            <h4 className="pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">{d.rotulo}</h4>
            <ol className="flex flex-col">
              {d.items.map(i => {
                const autor = i.autorId ? usuariosPorId.get(i.autorId) : undefined
                // El consejo no lleva firma: el título ya dice que es de Claude.
                const quien = autor ? `Registrado por ${autor.nombre}`
                  : i.tipo === 'sistema' ? 'Sistema' : i.tipo === 'consejo' ? null : 'Automático'
                const titulo = tituloDe(i)
                const plegable = i.tipo === 'consejo'
                const verTexto = titulo && (!plegable || consejoAbierto)
                const borrable = puedeEscribir && (i.tipo === 'comentario' || i.tipo === 'llamada')
                return (
                  <li key={i.id} className="group flex gap-3 py-2.5 not-first:[border-top:1px_solid_var(--line-soft)]">
                    <span aria-hidden className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md bg-card text-(--fg-2) [border:1px_solid_var(--line)]">
                      <Icon icon={ICONO[i.tipo]} size="sm" />
                    </span>
                    {/* Qué fue y cuándo a la izquierda, lo escrito a la derecha; en el teléfono no
                        entran lado a lado y lo escrito baja. */}
                    <div className="flex min-w-0 flex-1 items-start gap-3 max-md:flex-col max-md:gap-1.5">
                      {/* Sin texto al lado (un cambio de estado), el registro se lleva el ancho entero. */}
                      <div className={cn('min-w-0 max-md:w-full', verTexto ? 'w-[200px] shrink-0' : 'flex-1')}>
                        <div className="flex items-baseline gap-3">
                          {plegable ? (
                            <button type="button" aria-expanded={consejoAbierto} onClick={() => setConsejoAbierto(a => !a)}
                              className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-[13px] font-semibold leading-snug text-foreground">
                              <span className="truncate">{titulo}</span>
                              <ChevronDown size={14} aria-hidden className={cn('shrink-0 transition-transform', consejoAbierto && 'rotate-180')} />
                            </button>
                          ) : (
                            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-foreground">{titulo ?? i.texto}</p>
                          )}
                          <span className="shrink-0 text-[11px] tabular-nums text-(--fg-muted)">{horaDe(i.fecha)}</span>
                        </div>
                        {quien && <p className="text-[12px] leading-snug text-(--fg-2)">{quien}</p>}
                      </div>
                      {verTexto && (
                        <p className="w-full min-w-0 flex-1 whitespace-pre-wrap rounded-md bg-(--surface-2) px-3 py-2 text-[13px] leading-snug text-foreground [border:1px_solid_var(--line-soft)]">
                          {i.texto}
                        </p>
                      )}
                    </div>
                    {borrable && (
                      <button type="button" onClick={() => borrar(i.id)} aria-label="Borrar esta actividad"
                        title="Borrar (se cargó por error)" disabled={borrarActividad.isPending}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-muted) opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-(--danger-soft) hover:text-(--danger) max-md:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>

      {puedeEscribir && (
        <div hidden={!enActividad} className="shrink-0 px-5 pb-4 pt-3 [border-top:1px_solid_var(--line)] max-md:px-3 max-md:pb-3">
          <Button className="w-full" onClick={() => setAbierto(true)}>
            <Icon icon={Plus} size="sm" />
            Registrar actividad
          </Button>
        </div>
      )}

      {/* El formulario vive en una ventana y no pegado abajo de la lista: lo que se registra se
          escribe con lugar, y la línea de tiempo no pierde alto. Es la ventana flotante de «Nueva
          tarea», no un dialog con velo (12/10/2026, por pedido): mientras se registra hay que poder
          mirar el perfil, copiar un teléfono, scrollear la actividad. Cerrar sin registrar conserva
          lo escrito: el estado es de este componente, no de la ventana. */}
      {puedeEscribir && (
        <VentanaFlotante open={abierto} onOpenChange={setAbierto} ancho={520}
          titulo={`Registrar actividad · ${nombreDelLead(lead.client)}`}
          descripcion="Qué pasó con el lead y en qué etapa queda.">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {TIPOS.map(t => {
                const on = tipo === t.id
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => setTipo(t.id)}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
                      on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
                        : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
                    )}>
                    <Icon icon={t.icono} size="xs" />
                    {t.label}
                  </button>
                )
              })}
            </div>
            {/* Con quién va en su renglón, debajo de las pastillas, igual que los campos de la demo:
                cada tipo pide lo suyo en el mismo lugar. Una pastilla por contacto, que se prenden
                varias: con dos o tres contactos, un menú era un clic de más para elegir. */}
            {pideConQuien && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11.5px] text-(--fg-muted)">Con</span>
                {contactos.length === 0
                  ? <span className="text-[12px] text-(--fg-faint)">La inmobiliaria no tiene contactos cargados</span>
                  : contactos.map(c => {
                    const on = con.includes(c)
                    return (
                      <button key={c} type="button" aria-pressed={on}
                        onClick={() => setCon(xs => on ? xs.filter(x => x !== c) : [...xs, c])}
                        className={pastilla(on)}>
                        <span className="truncate">{c}</span>
                      </button>
                    )
                  })}
              </div>
            )}
            {/* Si es decisor queda en la llamada y, desde el 12/10/2026, también en el contacto (al
                lado del rol en el perfil): se pregunta solo mientras el perfil no lo sepa. Aparece
                debajo de con quién, recién cuando se eligió, y hay que contestarla: sin respuesta
                no se registra. Contestar «Sí» con un solo contacto elegido lo marca en el perfil. */}
            {pideDecisor && (
              <div role="radiogroup" aria-label="¿Es decisor?" className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11.5px] text-(--fg-muted)">¿Es decisor?</span>
                {([[true, 'Sí'], [false, 'No']] as const).map(([valor, label]) => (
                  <button key={label} type="button" role="radio" aria-checked={decisor === valor}
                    onClick={() => setDecisor(valor)} title="Quien atendió decide en la inmobiliaria"
                    className={pastilla(decisor === valor)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {tipo === 'llamada' && eligioConQuien && sabido !== null && (
              <p className="text-[11.5px] text-(--fg-muted)">
                {sabido ? 'Figura como decisor en el perfil.' : 'Figura como no decisor en el perfil.'}
              </p>
            )}
            {tipo === 'tarea' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[11.5px] text-(--fg-muted)">Vence</span>
                <ChipsDeVencimiento value={vence} onChange={setVence} compacto />
              </div>
            )}
            {tipo === 'reunion' && <CamposDeReunion value={reunion} onChange={setReunion} />}
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar() } }}
              rows={tipo === 'reunion' || tipo === 'tarea' ? 2 : 6}
              aria-label="Registrar actividad"
              placeholder={tipo === 'llamada' ? 'Qué se habló (opcional)…'
                : tipo === 'fallido' ? 'Detalle (opcional): no atendió, buzón, número equivocado…'
                : tipo === 'tarea' ? 'Qué hay que hacer…'
                : tipo === 'nota' ? 'Escribí qué pasó o qué querés registrar…'
                : 'Título de la demo (opcional)…'}
              className="block max-h-[50vh] min-h-9 w-full resize-y rounded-md bg-card px-3 py-2 text-[13.5px] leading-5 text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]"
            />
            {pideEtapa && (
              <div className={cn('flex flex-wrap items-center gap-2 rounded-md px-3 py-2',
                faltaEtapa ? 'bg-(--danger-soft) [border:1px_solid_var(--danger)]' : 'bg-(--surface-2) [border:1px_solid_var(--line-soft)]')}>
                <span className={cn('text-[12.5px] font-semibold', faltaEtapa ? 'text-(--danger)' : 'text-foreground')}>El lead queda en</span>
                <Select value={etapaFinal} onValueChange={v => { setEtapaElegida(v); setFaltaEtapa(false) }}>
                  <SelectTrigger aria-label="Etapa en la que queda el lead" aria-invalid={faltaEtapa}
                    className={cn('h-8 w-auto min-w-[220px] bg-card text-[12.5px]', faltaEtapa && '[border-color:var(--danger)]')}>
                    <SelectValue placeholder="Elegí una etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcionesEtapa.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.deleted_at ? `${e.label} (borrada)` : e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {faltaEtapa
                  ? <span role="alert" className="text-[11.5px] font-semibold text-(--danger)">Elegí en qué etapa queda antes de registrar</span>
                  : <span className="text-[11.5px] text-(--fg-muted)">Hoy está en «{actual?.label ?? 'sin etapa'}»</span>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              <Button onClick={enviar} disabled={!listo || enviando}>
                {enviando ? 'Registrando…' : 'Registrar'}
              </Button>
            </div>
          </div>
        </VentanaFlotante>
      )}
    </div>
  )
}
