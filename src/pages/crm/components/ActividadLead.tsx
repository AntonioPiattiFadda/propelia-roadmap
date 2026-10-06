import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRightLeft, ArrowUp, CalendarDays, CircleCheck, Clock, Info, ListTodo, MessageSquare, Phone, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import {
  agruparPorDia, armarMetaDeActividad, horaDe, lineaDeTiempo, type ItemActividad, type MetaDeActividad,
} from '../lib/actividad'
import { contactosDelCliente, nombreDelLead } from '../lib/clientData'
import { armarReunion } from '../lib/reuniones'
import { crearComentario, crearReunion, crearTarea } from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle } from '../types'
import { InmobiliariaDelLead } from './InmobiliariaDelLead'
import { CamposDeReunion, camposReunionVacios, type CamposReunion } from './ReunionesDelLead'
import { ChipsDeVencimiento } from './TareasDelLead'

/* NUEVO. En el producto el chat de actividad vive adentro de LeadAccordion (5.600 líneas); acá
   es la columna derecha del dialog del lead. Arriba la línea de tiempo partida por día; abajo,
   fijo y fuera del scroll, el compositor. El compositor escribe en tres lugares distintos según
   la pastilla —un comentario, una tarea o una demo (que es una reunión)— y solo en esos: no hay
   «llamada» ni «con quién» porque la base no tiene dónde guardarlos. */

type Tipo = 'nota' | 'llamada' | 'tarea' | 'reunion'
const TIPOS: { id: Tipo; label: string; icono: LucideIcon }[] = [
  { id: 'llamada', label: 'Llamada', icono: Phone },
  { id: 'nota', label: 'Actividad', icono: MessageSquare },
  { id: 'tarea', label: 'Tarea', icono: ListTodo },
  { id: 'reunion', label: 'Agendar demo', icono: CalendarDays },
]

// Sin título escrito, la reunión se guarda como «Demo»: es lo único que agenda esta pastilla.
const TITULO_DEMO = 'Demo'

const ICONO: Record<ItemActividad['tipo'], LucideIcon> = {
  comentario: MessageSquare, llamada: Phone, sistema: Info, gestion: CircleCheck, pospuesto: Clock,
  etapa: ArrowRightLeft, asignacion: UserRound, reunion: CalendarDays, tarea: ListTodo,
}

/* Lo que se registra desde el compositor se titula por qué es —Nota, Tarea, Demo— y lo que pasó va
   abajo, en su recuadro. El resto (gestiones, etapas, responsable) es una línea sola: ya se explica. */
const TITULO: Partial<Record<ItemActividad['tipo'], string>> = { comentario: 'Nota', llamada: 'Llamada', tarea: 'Tarea', reunion: 'Demo' }

/** «Laura, Marc y Ana»: la gente se lee como en una frase, no como una lista con comas. */
const enFrase = (nombres: string[]) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

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
  const { etapasPorId } = useCrmCatalogos()
  const { usuarios } = useCarteras()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<Tipo>('llamada')
  const [con, setCon] = useState<string[]>([])
  const contactos = contactosDelCliente(lead.client)
  // Con quién solo tiene sentido en lo que pasó con alguien: una nota o una llamada.
  const pideConQuien = tipo === 'nota' || tipo === 'llamada'
  const [vence, setVence] = useState<string | null>(() => localTodayIso())
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

  const items = detalle ? lineaDeTiempo(detalle, etapasPorId, usuarios) : []
  const dias = agruparPorDia(items, localTodayIso())
  const usuariosPorId = new Map(usuarios.map(u => [u.id, u]))

  // Se lee como un chat: lo último abajo, pegado al compositor. Al llegar algo nuevo se baja.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, enActividad])

  const enviando = comentar.isPending || agregarTarea.isPending || agendar.isPending
  const limpio = texto.trim()
  // La demo se puede agendar sin título (queda «Demo»); la nota y la tarea, no.
  const listo = tipo === 'reunion' ? !!reunion.fecha : !!limpio

  const enviar = () => {
    if (!listo || enviando) return
    const alTerminar = { onSuccess: () => setTexto('') }
    if (tipo === 'nota' || tipo === 'llamada') {
      // Se guardan solo los que siguen siendo contactos: alguien pudo borrar un teléfono mientras tanto.
      const meta = { tipo, con: con.filter(c => contactos.includes(c)) }
      comentar.mutate({ description: limpio, meta }, { onSuccess: () => { setTexto(''); setCon([]) } })
    }
    else if (tipo === 'tarea') agregarTarea.mutate(limpio, alTerminar)
    else agendar.mutate(limpio, { onSuccess: () => { setTexto(''); setReunion(camposReunionVacios()) } })
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
                const quien = autor ? `Registrado por ${autor.nombre}` : i.tipo === 'sistema' ? 'Sistema' : 'Automático'
                const titulo = TITULO[i.tipo] && (i.con?.length ? `${TITULO[i.tipo]} con ${enFrase(i.con)}` : TITULO[i.tipo])
                return (
                  <li key={i.id} className="flex gap-3 py-2.5 not-first:[border-top:1px_solid_var(--line-soft)]">
                    <span aria-hidden className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md bg-card text-(--fg-2) [border:1px_solid_var(--line)]">
                      <Icon icon={ICONO[i.tipo]} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3">
                        <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-foreground">{titulo ?? i.texto}</p>
                        <span className="shrink-0 text-[11px] tabular-nums text-(--fg-muted)">{horaDe(i.fecha)}</span>
                      </div>
                      <p className="text-[12px] leading-snug text-(--fg-2)">{quien}</p>
                      {titulo && (
                        <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-(--surface-2) px-3 py-2 text-[13px] leading-snug text-foreground [border:1px_solid_var(--line-soft)]">
                          {i.texto}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>

      {puedeEscribir && (
        <div hidden={!enActividad} className="shrink-0 px-5 pb-4 pt-3 [border-top:1px_solid_var(--line)] max-md:px-3 max-md:pb-3">
          <div className="rounded-xl bg-card shadow-xs [border:1px_solid_var(--line)] focus-within:[border-color:var(--line-strong)]">
            <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5">
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
            {/* Con quién va en su renglón, debajo de las pastillas, igual que el «Vence» de la tarea:
                cada tipo pide lo suyo en el mismo lugar. Una pastilla por contacto, que se prenden
                varias: con dos o tres contactos, un menú era un clic de más para elegir. */}
            {pideConQuien && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
                <span className="mr-0.5 text-[11.5px] text-(--fg-muted)">Con</span>
                {contactos.length === 0
                  ? <span className="text-[12px] text-(--fg-faint)">La inmobiliaria no tiene contactos cargados</span>
                  : contactos.map(c => {
                    const on = con.includes(c)
                    return (
                      <button key={c} type="button" aria-pressed={on}
                        onClick={() => setCon(xs => on ? xs.filter(x => x !== c) : [...xs, c])}
                        className={cn(
                          'inline-flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center rounded-full px-2.5 text-[12px] transition-colors',
                          on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
                            : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
                        )}>
                        <span className="truncate">{c}</span>
                      </button>
                    )
                  })}
              </div>
            )}
            {tipo === 'tarea' && (
              <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
                <span className="mr-0.5 text-[11.5px] text-(--fg-muted)">Vence</span>
                <ChipsDeVencimiento value={vence} onChange={setVence} compacto />
              </div>
            )}
            {tipo === 'reunion' && (
              <div className="px-3 pt-2">
                <CamposDeReunion value={reunion} onChange={setReunion} compacto />
              </div>
            )}
            {/* El campo y el botón de enviar en el mismo renglón, como un chat: el botón abajo a la
                derecha del texto, que lo acompaña si el campo se estira. */}
            <div className="flex items-end gap-2 px-3 pb-2.5 pt-2">
              <textarea
                value={texto}
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar() } }}
                rows={1}
                aria-label="Registrar actividad"
                placeholder={tipo === 'nota' || tipo === 'llamada' ? 'Escribí qué pasó o qué querés registrar…'
                  : tipo === 'tarea' ? 'Qué hay que hacer…' : 'Título de la demo (opcional)…'}
                // Un renglón del alto del botón (32px) para que arranquen alineados; crece con lo escrito.
                className="block max-h-40 min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-5 text-foreground outline-none [field-sizing:content] placeholder:text-(--fg-faint) max-md:text-[16px]"
              />
              <Button size="icon" className="size-8 shrink-0 rounded-full" onClick={enviar} disabled={!listo || enviando} aria-label="Registrar">
                <Icon icon={ArrowUp} size="sm" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
