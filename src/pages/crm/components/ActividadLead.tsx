import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CalendarDays, CalendarX, ChevronDown, CircleCheck, Clock, Info, MessageSquare, Pencil, Phone, PhoneMissed, Plus, Presentation, Sparkles, Trash2, UserRound,
  type LucideIcon,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Textarea } from '@/components/ui/textarea'
import { fmtDayMonth, localTodayIso, toIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useActualizarCliente, useActualizarLead, useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import {
  agruparPorDia, armarMetaDeActividad, horaDe, INTENTOS_DE_CONTACTO, lineaDeTiempo, primeroLosUltimos, TEXTO_DE_LLAMADA, textoEditado,
  pideAvancesDelDecisor, proximoContactoDelBloque, tituloDeLaTareaDelProximo, tituloDeLlamarAlDecisor, ultimoContacto,
  type ItemActividad, type MetaDeActividad, type ProximoContactoDecisor, type ResultadoDeLlamada,
} from '../lib/actividad'
import {
  campoDelNuevoDecisor, casilleroDelTelefonoNuevo, conDatosDelDecisor, conPrefijoDePais, contactosConDecisor, decisorDelContactoNuevo, decisorSabido,
  decisoresDeLaLlamada, nombreDelLead, nombresDeDecisores, patchDeContactosNuevos, telefonoEscrito, telefonosDelCliente, tieneDecisor, type CampoDecisor,
} from '../lib/clientData'
import { mensajeDeError } from '../lib/errores'
import { permiteAgendarTarea } from '../lib/gestionDeEtapa'
import { CRM_KEYS } from '../hooks/keys'
import { useQueryClient } from '@tanstack/react-query'
import { MensajesPredeterminadosDialog } from './MensajesPredeterminados'
import { MeetingFormContent } from '@/pages/agenda/components/meetings/MeetingFormContent'
import {
  GUIA_DE_DEMO, GUIA_DE_DISCOVERY, GUIA_DE_LLAMADA, PLACEHOLDER_DE_DISCOVERY, muestraDiscovery, type SeccionDeGuia,
} from '../lib/guiaDeLlamada'
import { DESCRIPCION_DE_DEMO, esEmailValido, invitadosDeLaDemo, RECORDATORIO_DE_DEMO, registroDeDemoDesdeLaActividad, tituloDeLaDemo } from '../lib/reuniones'
import { actualizarComentario, cancelarReunion, crearComentario, crearTarea, marcarComentarioBorrado } from '../service/crm.service'
import type { CrmLeadRow, CrmMeeting, CrmStage, LeadDetalle } from '../types'
import { CancelarDemoDialog } from './CancelarDemoDialog'
import { GuionDeDemo } from './GuionDeDemo'
import { InmobiliariaDelLead } from './InmobiliariaDelLead'
import { DescartarLeadDialog } from './DescartarLeadDialog'
import { CualificaLeadDialog } from './CualificaLeadDialog'
import { esBuscarContacto } from '../lib/buscarContacto'
import { investigacionDeClaude } from '../lib/investigacion'
import { ANCHO_DEL_COSTADO, useEntraAlCostado, VentanaFlotante } from './VentanaFlotante'

/** Ancho de la ventana de registrar actividad (salvo la demo, que se ensancha). */
const ANCHO_DEL_REGISTRO = 520
import { DemoAgendadaDialog } from './DemoAgendadaDialog'
import type { DemoAgendada } from '../lib/avisoDeDemo'
import {
  BLOQUE_DEL_DECISOR_VACIO, BloqueDecisor, CajaDeEtapa, claseDelTexto, FilaDePersonas, FilaDeTelefono, FilaEsDecisor, NotaDeDecisorSabido,
  type BloqueDelDecisor,
} from './FilasDelRegistro'

/* NUEVO. En el producto el chat de actividad vive adentro de LeadAccordion (5.600 líneas); acá
   es la columna derecha del dialog del lead. Arriba la línea de tiempo partida por día; abajo,
   fijo y fuera del scroll, el compositor. El compositor escribe en dos lugares según la pastilla
   —un comentario (nota, llamada o contacto fallido) o una demo (que es una reunión)—.
   La tarea se sacó el 10/10/2026, volvió el 12/10/2026 y se volvió a sacar el 16/10/2026, las
   tres veces por pedido: las tareas se crean desde su lista del perfil.
   «Agendar demo» se agenda acá mismo desde el 23/10/2026 (ver `ANCHO_DE_DEMO`).
   El contacto fallido es su propia pastilla y no un resultado adentro de «Llamada» (12/10/2026,
   por pedido): es lo que más se registra y no puede costar dos clics. Se guarda igual que antes
   —una llamada con resultado 'no_respondida'—, así el contador del día no se entera. */

type Tipo = 'nota' | 'llamada' | 'fallido' | 'demo'
const TIPOS: { id: Tipo; label: string; icono: LucideIcon }[] = [
  { id: 'llamada', label: 'Llamada', icono: Phone },
  { id: 'fallido', label: 'Contacto fallido', icono: PhoneMissed },
  // «Notas» y no «Actividad» (17/10/2026, por pedido): actividad es todo lo que se registra.
  { id: 'nota', label: 'Notas', icono: MessageSquare },
  { id: 'demo', label: 'Agendar demo', icono: CalendarDays },
]

/* «Agendar demo» volvió a ser una pastilla de acá (23/10/2026, por pedido; del 22/10 abría la
   Agenda en otra pestaña): la ventana se ensancha y muestra el formulario de la reunión de la
   Agenda (`MeetingFormContent` con `demo`) con el registro de actividad al lado
   (`useRegistroDeDemo`). El horario se escribe o se elige mirando la semana con «Seleccionar día
   y hora». El formulario guarda solo (reunión + registro + etapa): «Registrar» no va. */
const ANCHO_DE_DEMO = 880

/* La guía de la llamada y la de la demo: texto fijo de `lib/guiaDeLlamada.ts`, sin tildes que se
   guarden. Cuelga del borde izquierdo de la ventana de registrar (16/10/2026, por pedido): plegada
   es una pestaña que asoma, y abierta sale de la ventana como un panel al costado, sin quitarle
   alto al formulario. Nace plegada cada vez que se abre la ventana. En el teléfono la ventana
   ocupa el ancho y no hay costado: la pestaña y el panel van encima de la ventana. */
function GuiaDelCompositor({ titulo, secciones }: { titulo: string; secciones: readonly SeccionDeGuia[] }) {
  const [abierta, setAbierta] = useState(false)
  if (!abierta) {
    return (
      <button type="button" aria-expanded={false} onClick={() => setAbierta(true)} title={`Ver ${titulo.toLowerCase()}`}
        className="absolute top-14 right-full flex cursor-pointer items-center gap-1.5 rounded-l-md bg-(--surface-2) px-1 py-2.5 text-[11.5px] font-semibold text-(--fg-2) shadow-[-4px_4px_12px_rgba(0,0,0,0.08)] [border:1px_solid_var(--line-strong)] [border-right:none] hover:bg-card [writing-mode:vertical-rl] rotate-180 max-md:right-auto max-md:left-0 max-md:rotate-0 max-md:rounded-l-none max-md:rounded-r-md max-md:[border-left:none] max-md:[border-right:1px_solid_var(--line-strong)]">
        <ChevronDown size={13} aria-hidden className="shrink-0" />
        {titulo}
      </button>
    )
  }
  return (
    <aside aria-label={titulo}
      className="absolute top-0 right-full mr-2 flex max-h-full w-[280px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] [border:1px_solid_var(--line-strong)] animate-in fade-in-0 slide-in-from-right-2 max-md:inset-x-2 max-md:top-12 max-md:mr-0 max-md:w-auto">
      <div className="flex shrink-0 items-center gap-2 bg-(--surface-2) px-3 py-2 [border-bottom:1px_solid_var(--line)]">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{titulo}</span>
        <button type="button" aria-expanded onClick={() => setAbierta(false)} aria-label={`Plegar ${titulo.toLowerCase()}`}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-card">
          <ChevronDown size={14} aria-hidden className="-rotate-90" />
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto p-3">
        {secciones.map((s, n) => (
          <section key={s.titulo ?? n} className="flex flex-col gap-1.5">
            {s.titulo && (
              <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-(--brand-soft) text-[10px] text-(--brand-soft-fg)">{n + 1}</span>
                {s.titulo}
              </h3>
            )}
            <ul className="flex flex-col gap-1">
              {s.pasos.map(p => (
                <li key={p.titulo} className="flex gap-1.5 text-[11.5px] leading-snug text-(--fg-muted)">
                  <CircleCheck size={12} aria-hidden className="mt-px shrink-0 text-(--fg-faint)" />
                  <span><span className="font-semibold text-(--fg-2)">{p.titulo}</span>{p.pista && <> — {p.pista}</>}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}

/* La investigación de Claude al costado (21/11/2026, por pedido): el botón «Investigación» de la
   ventana de registrar la despliega a la izquierda, para leerla mientras se llama sin ir a la
   pestaña de la inmobiliaria. Es la misma de esa pestaña (`investigacionDeClaude`) y acá solo se
   lee: se edita allá. Mientras está abierta ocupa el borde izquierdo (tapa guía y Discovery). */
function InvestigacionAlCostado({ texto, onPlegar }: { texto: string; onPlegar: () => void }) {
  return (
    <aside aria-label="Investigación de Claude"
      className="absolute top-0 right-full mr-2 flex max-h-full w-[320px] flex-col overflow-hidden rounded-xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] [border:1px_solid_var(--line-strong)] animate-in fade-in-0 slide-in-from-right-2 max-md:inset-x-2 max-md:top-12 max-md:mr-0 max-md:w-auto">
      <div className="flex shrink-0 items-center gap-2 bg-(--surface-2) px-3 py-2 [border-bottom:1px_solid_var(--line)]">
        <Sparkles size={14} aria-hidden className="shrink-0 text-(--brand-700)" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">Investigación de Claude</span>
        <button type="button" aria-expanded onClick={onPlegar} aria-label="Plegar la investigación de Claude"
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-card">
          <ChevronDown size={14} aria-hidden className="-rotate-90" />
        </button>
      </div>
      <p className="min-h-0 overflow-y-auto whitespace-pre-wrap p-3 text-[12.5px] leading-snug text-foreground">{texto}</p>
    </aside>
  )
}

/* Discovery (20/11/2026, por pedido): asoma a la izquierda de la ventana en cuanto se empieza a
   escribir en llamada o notas (`muestraDiscovery`). Sutil a propósito: sin sombra fuerte, texto
   tenue y entrada lenta, para acompañar sin tapar. Mientras se ve, reemplaza a la pestaña de la
   guía de la llamada (las dos cuelgan del mismo borde). En el teléfono no va: no hay costado. */
function DiscoveryAlCostado() {
  return (
    <aside aria-label="Guía de discovery"
      className="absolute top-0 right-full mr-2 flex max-h-full w-[250px] flex-col overflow-hidden rounded-xl bg-white/85 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.06)] [border:1px_solid_var(--line)] animate-in fade-in-0 slide-in-from-right-1 duration-500 max-md:hidden">
      <div className="shrink-0 px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-(--fg-faint) uppercase">Discovery</span>
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 pb-3">
        {GUIA_DE_DISCOVERY.map(s => (
          <section key={s.titulo} className="flex flex-col gap-1">
            <h3 className="text-[11.5px] font-semibold text-(--fg-2)">{s.titulo}</h3>
            <ul className="flex flex-col gap-1">
              {s.pasos.map(p => (
                <li key={p.titulo} className="text-[11px] leading-snug text-(--fg-muted)">
                  {p.titulo}{p.pista && <span className="text-(--fg-faint)"> — {p.pista}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}

const ICONO: Record<ItemActividad['tipo'], LucideIcon> = {
  comentario: MessageSquare, llamada: Phone, sistema: Info, gestion: CircleCheck, pospuesto: Clock,
  asignacion: UserRound, reunion: CalendarDays, demoHecha: Presentation,
}

/* Lo que se registra desde el compositor se titula por qué es —Nota, Tarea, Demo— y lo que pasó va
   abajo, en su recuadro. El resto (gestiones, etapas, responsable) es una línea sola: ya se explica. */
const TITULO: Partial<Record<ItemActividad['tipo'], string>> = {
  comentario: 'Nota', llamada: 'Llamada', reunion: 'Demo', demoHecha: 'Demo realizada',
}

/** «Laura, Marc y Ana»: la gente se lee como en una frase, no como una lista con comas. */
const enFrase = (nombres: string[]) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`

/** El título de un renglón del compositor: «Llamada con Laura · decisor», «Contacto fallido». */
function tituloDe(i: ItemActividad): string | undefined {
  const base = TITULO[i.tipo]
  if (!base) return undefined
  if (i.tipo === 'llamada' && i.resultado === 'no_respondida') {
    const fallido = i.intento ? `Contacto fallido ${i.intento}/${INTENTOS_DE_CONTACTO}` : 'Contacto fallido'
    return i.telefono ? `${fallido} · ${i.telefono.etiqueta}` : fallido
  }
  // «Llamada a Oficina con Laura»: el número marcado y quien atendió, que no siempre coinciden.
  const a = i.tipo === 'llamada' && i.telefono && i.telefono.etiqueta !== i.con?.[0] ? `${base} a ${i.telefono.etiqueta}` : base
  const conQuien = i.con?.length ? `${a} con ${enFrase(i.con)}` : a
  return i.tipo === 'llamada' && i.decisor ? `${conQuien} · decisor` : conQuien
}


/* Editar lo escrito de una nota, llamada o contacto fallido (20/10/2026, por pedido). Solo el
   texto: con quién, el teléfono, el resultado y la etapa quedan como se registraron. Vaciada, la
   llamada vuelve a su texto de fábrica y la nota no se guarda (`textoEditado`). Se monta por
   actividad (`key`), así nace con el texto de la que se abrió. */
function EditarActividad({ item, onCerrar, onGuardar }: {
  item: ItemActividad
  onCerrar: () => void
  onGuardar: (description: string) => void
}) {
  const [texto, setTexto] = useState(item.texto)
  const nuevo = textoEditado(item, texto)
  const guardar = () => {
    if (nuevo === null) return
    if (nuevo !== item.texto) onGuardar(nuevo)
    onCerrar()
  }
  return (
    <VentanaFlotante open onOpenChange={abierto => { if (!abierto) onCerrar() }} titulo="Editar actividad"
      descripcion="Solo el texto: el resto queda como se registró.">
      <form className="flex flex-col gap-3 p-4" onSubmit={e => { e.preventDefault(); guardar() }}>
        <Textarea autoFocus rows={5} aria-label="Texto de la actividad" value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guardar() } }}
          className="min-h-28 resize-y text-[13px] md:text-[13px]" />
        {nuevo === null && <p className="text-[12px] text-(--fg-muted)">La nota no puede quedar vacía.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" disabled={nuevo === null}>Guardar</Button>
        </div>
      </form>
    </VentanaFlotante>
  )
}

/* La columna tiene tres pestañas: la actividad, la inmobiliaria y, desde el 4/11/2026 (por pedido),
   el guion de la demo (`GuionDeDemo`). El selector vive en la cabecera del dialog, centrado, y el
   estado en `CuerpoDelLead`: al cambiar de lead se vuelve a la actividad sola (el cuerpo del dialog
   va con key = lead). Las otras NO desmontan la actividad, la esconden: lo que se estaba escribiendo
   en el compositor sigue ahí al volver. */
export type PestanaDelLead = 'actividad' | 'inmobiliaria' | 'demo'

export function PestanasDelLead({ lead, pestana, onCambiar }: {
  lead: CrmLeadRow
  pestana: PestanaDelLead
  onCambiar: (p: PestanaDelLead) => void
}) {
  return (
    <div role="tablist" aria-label="Actividad, inmobiliaria y demo" className="flex h-9 min-w-0 items-stretch gap-5 max-md:gap-4">
      {([['actividad', 'Actividad'], ['inmobiliaria', nombreDelLead(lead.client)], ['demo', 'Demo']] as const).map(([id, label]) => {
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

export function ActividadLead({ lead, detalle, cargando, puedeEscribir, pestana, otrosContactos, telefonosSueltos, emailsSueltos, onDecisorContactado, onAbrirContacto, onRegistrado }: {
  lead: CrmLeadRow
  /** Se registró una llamada, un contacto fallido o una nota: el dialog pregunta al irse si el
   *  lead quedó sin tarea tuya (21/11/2026, por pedido). */
  onRegistrado?: () => void
  /** Doble clic en una persona del registro abre su ficha del perfil (20/10/2026, por pedido). */
  onAbrirContacto?: (campo: CampoDecisor) => void
  /** Una llamada con el decisor fija a ese contacto en el perfil (17/10/2026, por pedido). */
  onDecisorContactado?: (campos: CampoDecisor[]) => void
  detalle: LeadDetalle | undefined
  cargando: boolean
  puedeEscribir: boolean
  pestana: PestanaDelLead
  /** Los tres los pasa de largo a la pestaña de la inmobiliaria: ver `InmobiliariaDelLead`. */
  otrosContactos?: ReactNode
  telefonosSueltos?: ReactNode
  emailsSueltos?: ReactNode
}) {
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  // `myId` es la sesión de verdad y no el «yo» de «Ver como»: la tarea del próximo contacto es tuya.
  const { usuarios, myId } = useCarteras()
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  // La investigación de Claude desplegada a la izquierda de la ventana de registrar.
  const [verInvestigacion, setVerInvestigacion] = useState(false)
  const investigacion = investigacionDeClaude(lead.client?.sdr_advice)
  // La demo recién agendada: abre el aviso por WhatsApp (`DemoAgendadaDialog`).
  const [demoAgendada, setDemoAgendada] = useState<DemoAgendada | null>(null)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<Tipo>('llamada')
  const [con, setCon] = useState<string[]>([])
  // `null` es «todavía no contestó la pregunta»: una llamada no se registra sin decirlo.
  const [decisor, setDecisor] = useState<boolean | null>(null)
  const conDecisor = contactosConDecisor(lead.client)
  // Lo último marcado y con quién se habló va primero en cada fila (17/10/2026, por pedido): ordena, no elige.
  const ultimo = ultimoContacto(detalle?.comments ?? [])
  const mismoNombre = (a: string, b: string) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es')
  const contactos = primeroLosUltimos(conDecisor.map(c => c.nombre), n => ultimo.con.some(u => mismoNombre(u, n)))
  /* Con quién también se escribe a mano (16/10/2026, por pedido): si el que atendió no está entre
     los contactos, se tipea, entra como una pastilla más y al registrar se carga solo en el perfil
     (`patchDeContactosNuevos`). Escribir uno que ya está lo elige, no lo duplica. */
  const [nuevos, setNuevos] = useState<string[]>([])
  /* El campo para escribir a mano (con quién y a qué número) no está siempre a la vista
     (17/10/2026, por pedido): es un «+» discreto y el campo aparece al tocarlo (`FilaDePersonas`).
     Lo de todos los días es elegir una pastilla; el campo abierto se leía como algo que había que llenar. */
  const elegibles = [...contactos, ...nuevos]
  const agregarEscrito = (escrito: string) => {
    const nombre = escrito.trim().replace(/\s+/g, ' ')
    if (!nombre) return
    const existente = elegibles.find(c => c.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))
    if (!existente) setNuevos(xs => [...xs, nombre])
    const elegido = existente ?? nombre
    setCon(xs => xs.includes(elegido) ? xs : [...xs, elegido])
  }
  // Corre al registrar con éxito: también apaga el rojo de lo que faltaba.
  const limpiarConQuien = () => { setCon([]); setNuevos([]); setIntento(false); setBloqueDecisor(BLOQUE_DEL_DECISOR_VACIO) }
  /* A qué teléfono se llamó va aparte de con quién se habló (16/10/2026, por pedido): se marca la
     oficina y atiende Laura, o el celular de Marc y atiende su socio. Lo piden la llamada y el
     contacto fallido, primero que nada; arranca vacío, como la etapa, para que no se confirme sin
     mirarlo. Se pide aunque el perfil no tenga teléfonos: se escribe con el «+». */
  const [telefono, setTelefono] = useState<string | null>(null)
  /* El número también se escribe a mano (17/10/2026, por pedido), haya o no teléfonos cargados:
     se marcó uno que el perfil no tiene. Entra como una pastilla más, elegida, y al registrar se
     carga en el perfil (`casilleroDelTelefonoNuevo`). Uno solo: se llamó a un número. */
  const [telefonoNuevo, setTelefonoNuevo] = useState<string | null>(null)
  const digitos = (t: string) => t.replace(/\D/g, '')
  const cargados = primeroLosUltimos(telefonosDelCliente(lead.client),
    t => ultimo.telefono !== null && digitos(t.numero) === digitos(ultimo.telefono))
  const telefonos = telefonoNuevo ? [...cargados, { numero: telefonoNuevo, etiqueta: telefonoNuevo }] : cargados
  const agregarTelefono = (escrito: string) => {
    const t = telefonoEscrito(cargados, escrito)
    if (!t) return
    if (t.nuevo) setTelefonoNuevo(t.numero)
    setTelefono(t.numero)
  }
  const sacarTelefonoNuevo = () => {
    if (telefono === telefonoNuevo) setTelefono(null)
    setTelefonoNuevo(null)
  }
  const esDemo = tipo === 'demo'
  const pideTelefono = tipo === 'llamada' || tipo === 'fallido'
  const telefonoElegido = telefonos.find(t => t.numero === telefono)
  /* Obligatorio siempre, también sin teléfonos cargados (17/10/2026, por pedido): el número se
     escribe con el «+». Antes, sin teléfonos en el perfil, el contacto fallido no lo pedía. */
  const eligioTelefono = !!telefonoElegido
  // Con quién solo tiene sentido en lo que pasó con alguien: una nota o una llamada (que siempre es
  // contestada: la que nadie atendió es «Contacto fallido»). En la demo es quién asiste.
  const pideConQuien = tipo === 'nota' || tipo === 'llamada'
  // En una llamada los campos se piden de a uno: primero con quién, después si decide.
  // Sin contactos cargados no hay a quién elegir, y la pregunta del decisor aparece igual.
  const eligioConQuien = elegibles.length === 0 || con.some(c => elegibles.includes(c))
  // Si el perfil ya dice si los elegidos deciden, no se pregunta: se toma de ahí.
  const sabido = decisorSabido(conDecisor, con)
  const pideDecisor = tipo === 'llamada' && eligioConQuien && sabido === null
  /* «Avances para contactar al decisor» (18/11/2026, por pedido; `BloqueDecisor`): solo en la
     llamada y solo cuando quien atendió no decide (lo contestado o lo que ya sabe el perfil) y el
     perfil todavía no tiene un decisor cargado (21/11/2026, por pedido; hasta ese día salía igual). Cuatro Sí/No obligatorios: el nombre, el teléfono, el horario en
     que se lo encuentra y el email. Lo conseguido va al perfil (`conDatosDelDecisor`; el horario no,
     queda solo en la actividad) y a la meta de la actividad; con el email en Sí,
     registrar abre «Mensajes» en Email con ese «Para». La nota ya no lo lleva. */
  const pideDecisorApuntado = pideAvancesDelDecisor(tipo, sabido ?? decisor, tieneDecisor(lead.client))
  const [bloqueDecisor, setBloqueDecisor] = useState<BloqueDelDecisor>(BLOQUE_DEL_DECISOR_VACIO)
  const cambiarBloqueDecisor = (parcial: Partial<BloqueDelDecisor>) => setBloqueDecisor(b => {
    const nuevo = { ...b, ...parcial }
    // El mail arranca con el primero que tenga la inmobiliaria, si tiene: se edita.
    if (parcial.email === true && !b.emailValor.trim()) {
      const c = lead.client
      nuevo.emailValor = [c?.email, c?.alternative_phone_1_email, c?.alternative_phone_2_email].map(e => e?.trim()).find(Boolean) ?? ''
    }
    return nuevo
  })
  const decisorApuntado = bloqueDecisor.nombre ? bloqueDecisor.nombreValor.trim().replace(/\s+/g, ' ') : ''
  const telefonoDelDecisor = bloqueDecisor.telefono
    ? telefonoEscrito([], conPrefijoDePais(bloqueDecisor.prefijo, bloqueDecisor.telefonoValor))?.numero ?? '' : ''
  const horarioDelDecisor = bloqueDecisor.horario ? bloqueDecisor.horarioValor.trim().replace(/\s+/g, ' ') : ''
  const emailDelDecisor = bloqueDecisor.email && esEmailValido(bloqueDecisor.emailValor) ? bloqueDecisor.emailValor.trim() : ''
  /* «Horario del decisor / próximo contacto» (19/11/2026, por pedido: eran dos preguntas): el mismo
     Sí del horario pide además día y hora de España, obligatorios, y al registrar se crea la tarea
     «Llamar al decisor» (`crearTareaDeProximoContacto`). */
  const proximoContacto = proximoContactoDelBloque(bloqueDecisor.horario, bloqueDecisor.proximoFecha, bloqueDecisor.proximoHora)
  // El título de la tarea se elige y se escribe (20/11/2026, por pedido); sin tocar, el sugerido.
  const tituloSugeridoProximo = tituloDeLlamarAlDecisor(decisorApuntado, nombresDeDecisores(lead.client))
  const tituloProximo = tituloDeLaTareaDelProximo(bloqueDecisor.proximoTitulo, tituloSugeridoProximo)
  // Las cuatro se contestan siempre, Sí o No (18/11/2026, por pedido); el Sí además pide su campo.
  const faltaDelDecisor = {
    nombre: pideDecisorApuntado && (bloqueDecisor.nombre === null || (bloqueDecisor.nombre && !decisorApuntado)),
    telefono: pideDecisorApuntado && (bloqueDecisor.telefono === null || (bloqueDecisor.telefono && !telefonoDelDecisor)),
    horario: pideDecisorApuntado && (bloqueDecisor.horario === null || (bloqueDecisor.horario && !horarioDelDecisor)),
    email: pideDecisorApuntado && (bloqueDecisor.email === null || (bloqueDecisor.email && !emailDelDecisor)),
    // Con Sí, sin día u hora no se registra: la tarea tiene que nacer con alarma.
    proximo: pideDecisorApuntado && bloqueDecisor.horario === true && proximoContacto.falta,
    tarea: pideDecisorApuntado && bloqueDecisor.horario === true && !tituloProximo,
  }
  // Lo del decisor que va en la meta de la actividad: solo lo que se pidió y se escribió.
  const metaDelDecisor = pideDecisorApuntado ? {
    ...(decisorApuntado && { decisorApuntado }),
    ...(telefonoDelDecisor && { telefonoDecisor: telefonoDelDecisor }),
    ...(horarioDelDecisor && { horarioDecisor: horarioDelDecisor }),
    ...(emailDelDecisor && { emailDecisor: emailDelDecisor }),
    ...(proximoContacto.valor && { proximoContactoDecisor: proximoContacto.valor }),
  } : {}
  // El mail al decisor se abre con la actividad ya registrada; `n` remonta el dialog cada vez.
  const [mailAlDecisor, setMailAlDecisor] = useState<{ para: string; n: number } | null>(null)
  const [mailAbierto, setMailAbierto] = useState(false)
  /* Toda actividad registrada pide elegir en qué etapa queda el lead, para que avanzarlo no
     dependa de acordarse (12/10/2026, por pedido). Arranca VACÍA y es obligatoria: precargarla
     (con la actual o con una sugerida) hacía que se confirmara sin leerla. Registrar sin elegir
     la marca en rojo y no registra. El contacto fallido no mueve nada y no la pide. Descartado se
     ofrece desde el 16/10/2026 (por pedido), pero lleva motivo: con la actividad guardada se abre
     el mismo DescartarLeadDialog del perfil y de la fila, y cancelarlo deja al lead donde estaba. */
  const pideEtapa = tipo === 'nota' || tipo === 'llamada'
  const [etapaElegida, setEtapaElegida] = useState<string | null>(null)
  const [faltaEtapa, setFaltaEtapa] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const etapaFinal = etapaElegida ?? ''
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel)
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  if (descartada && !opcionesEtapa.some(e => e.id === descartada.id)) opcionesEtapa.push(descartada)
  const lista = useRef<HTMLDivElement>(null)
  const enActividad = pestana === 'actividad'

  const comentar = useMutacionDelDetalle(lead.id, (v: { description: string; meta: MetaDeActividad }) =>
    crearComentario({ lead_id: lead.id, description: v.description, long_description: armarMetaDeActividad(v.meta) }))
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
  // Editar el texto: mismo optimista que borrar, sobre la `description` del comentario.
  const [editandoActividad, setEditandoActividad] = useState<ItemActividad | null>(null)
  const editarActividad = useMutacionDelDetalle(lead.id,
    (v: { id: string; description: string }) => actualizarComentario(v.id, { description: v.description }),
    { exito: 'Actividad editada',
      optimista: (d, v) => ({ ...d, comments: d.comments.map(c => c.id === v.id ? { ...c, description: v.description } : c) }) })
  const actualizarCliente = useActualizarCliente()

  /* Recién con la actividad guardada se mueve la etapa: si el registro falla, el lead no avanza por
     algo que no quedó escrito. Lo que se confirmó igual a la actual no toca la base. */
  /* Devuelven cuándo terminó de guardarse la etapa: la tarea del próximo contacto se crea recién
     ahí, porque el trigger `crm_tasks_etapa_permite` mira la etapa en la que quedó el lead. */
  const moverEtapa = async () => {
    setEtapaElegida(null)
    setFaltaEtapa(false)
    if (pideEtapa) await moverA(etapaFinal)
  }
  const moverA = async (etapaId: string) => {
    const destino = etapasPorId.get(etapaId)
    if (!destino || destino.id === lead.funnel_stage_id) return
    if (destino.id === descartada?.id) { setDescartando(true); return }
    if (esBuscarContacto(destino)) setPreguntandoCualifica(true)
    try {
      await actualizarLead.mutateAsync({ id: lead.id, patch: { funnel_stage_id: destino.id, discard_reason: null, recontact_at: null } })
      toast.success(`Lead en «${destino.label}»`)
    } catch { /* el toast lo da `useActualizarLead` */ }
  }
  /* Dónde va a quedar el lead al registrar: la elegida, salvo Descartado (que espera su motivo y,
     mientras, deja al lead donde estaba). De ahí sale si la tarea del próximo contacto se puede crear. */
  const etapaElegidaObj = etapaElegida ? etapasPorId.get(etapaElegida) : undefined
  const etapaAlRegistrar = etapaElegidaObj && etapaElegidaObj.id !== descartada?.id ? etapaElegidaObj : actual
  const avisoProximo = bloqueDecisor.horario && etapaAlRegistrar && !permiteAgendarTarea(etapaAlRegistrar)
    ? `En la etapa «${etapaAlRegistrar.label}» no se agendan tareas: el horario queda en la actividad, pero la tarea no se crea.`
    : null
  /* La tarea «Llamar al decisor» (19/11/2026, por pedido): de quien registra (`myId`, la sesión de
     verdad, nunca el «Ver como»), para el día y la hora acordados. Si falla, la actividad queda. */
  const crearTareaDeProximoContacto = async (p: ProximoContactoDecisor, titulo: string, etapaFinalDelLead: CrmStage | undefined) => {
    if (etapaFinalDelLead && !permiteAgendarTarea(etapaFinalDelLead)) {
      toast(`La actividad quedó registrada, pero en la etapa «${etapaFinalDelLead.label}» no se agendan tareas: «${titulo}» no se creó`)
      return
    }
    if (!myId) { toast.error(`La actividad quedó registrada, pero no se pudo crear «${titulo}»: no se sabe quién sos.`); return }
    try {
      await crearTarea({ lead_id: lead.id, title: titulo, due_date: p.fecha, due_time: p.hora, assigned_to: myId })
      toast.success(`Tarea creada: «${titulo}»`)
    } catch (e) {
      toast.error(`La actividad quedó registrada, pero no se pudo crear «${titulo}»: ${mensajeDeError(e)}`)
    }
    void qc.invalidateQueries({ queryKey: CRM_KEYS.detalle(lead.id) })
    void qc.invalidateQueries({ queryKey: CRM_KEYS.tareasPendientes })
  }
  const [preguntandoCualifica, setPreguntandoCualifica] = useState(false)

  /* Cancelar una demo desde su renglón (23/10/2026, por pedido): la ventana pide la etapa en la que
     queda el lead, y la etapa se mueve recién con la reunión cancelada, como al registrar. */
  const [demoACancelar, setDemoACancelar] = useState<CrmMeeting | null>(null)
  const cancelarDemo = useMutacionDelDetalle(lead.id,
    (v: { reunion: CrmMeeting; motivo: string | null }) => cancelarReunion(v.reunion, v.motivo),
    { exito: 'Demo cancelada' })
  const cuandoEs = (m: CrmMeeting) => `${fmtDayMonth(toIsoDate(new Date(m.starts_at)))} a las ${horaDe(m.starts_at)}`

  const items = detalle ? lineaDeTiempo(detalle, usuarios) : []
  const dias = agruparPorDia(items, localTodayIso())
  const usuariosPorId = new Map(usuarios.map(u => [u.id, u]))

  // Se lee como un chat: lo último abajo, pegado al compositor. Al llegar algo nuevo se baja.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, enActividad])

  const enviando = comentar.isPending
  const limpio = texto.trim()
  // La demo se puede agendar sin notas, y la llamada y el contacto fallido sin texto (el tipo ya
  // dice qué pasó); la nota, no. La llamada sí pide con quién se habló y si es decisor;
  // la demo, el mail de la invitación y quién asiste.
  const listo = tipo === 'llamada' ? eligioTelefono && eligioConQuien && (sabido !== null || decisor !== null)
    : tipo === 'fallido' ? eligioTelefono
    : !!limpio

  /* «Registrar» ya no se apaga: tocarlo con algo sin completar pinta en rojo cada dato que falta
     (17/10/2026, por pedido), como ya hacía la etapa. Un botón gris no dice qué le falta. */
  const [intento, setIntento] = useState(false)
  const falta = {
    telefono: pideTelefono && !eligioTelefono,
    con: tipo === 'llamada' && !eligioConQuien,
    decisor: pideDecisor && decisor === null,
    texto: tipo === 'nota' && !limpio,
    decisorNombre: faltaDelDecisor.nombre,
    decisorTelefono: faltaDelDecisor.telefono,
    decisorHorario: faltaDelDecisor.horario,
    decisorEmail: faltaDelDecisor.email,
    decisorProximo: faltaDelDecisor.proximo,
    decisorTarea: faltaDelDecisor.tarea,
  }
  const enRojo = (k: keyof typeof falta) => intento && falta[k]

  // Los escritos a mano que siguen elegidos se cargan como contactos; `decisor` es el que quedó
  // como decisor, si es uno de ellos. Lo que no entra en el perfil queda solo en la actividad.
  const nuevosElegidos = nuevos.filter(c => con.includes(c))
  /* Lo escrito a mano va al perfil en un solo guardado: las personas y el número marcado. El número
     va al contacto con quien se habló, si se habló con uno solo; `elegidos` vacío (el contacto
     fallido) no carga personas. */
  const cargarAlPerfil = (decisor: string | null, elegidos: string[]) => {
    const client = lead.client
    if (!client) return { patch: {}, decisorConseguido: null }
    const { patch, sinLugar } = elegidos.length > 0 && nuevosElegidos.length > 0
      ? patchDeContactosNuevos(client, nuevosElegidos, decisor) : { patch: {}, sinLugar: [] }
    const numero = pideTelefono && telefonoNuevo && telefono === telefonoNuevo ? telefonoNuevo : null
    const patchTelefono: Partial<Record<'phone' | 'alternative_phone_1' | 'alternative_phone_2', string>> = {}
    if (numero) {
      const persona = elegidos.length === 1
        ? conDecisor.find(c => c.nombre === elegidos[0])?.campoDecisor ?? decisorDelContactoNuevo(patch, elegidos[0])
        : null
      const casillero = casilleroDelTelefonoNuevo({ ...client, ...patch }, persona)
      if (casillero) patchTelefono[casillero] = numero
      else toast(`El perfil no tiene más lugar para teléfonos: ${numero} quedó solo en la actividad`)
    }
    /* Lo del decisor va último: el número marcado es de quien atendió, no del decisor. Nombre,
       teléfono y email (18/11/2026), sin pisar nada (`conDatosDelDecisor`). */
    const del: ReturnType<typeof conDatosDelDecisor> = pideDecisorApuntado
      ? conDatosDelDecisor({ ...client, ...patchTelefono }, patch,
        { nombre: decisorApuntado, telefono: telefonoDelDecisor, email: emailDelDecisor })
      : { patch, sinLugar: [], campo: null }
    if (del.sinLugar.includes('nombre')) toast(`El perfil no tiene más lugar para contactos: el decisor ${decisorApuntado} no se cargó`)
    if (del.sinLugar.includes('telefono')) toast(`El perfil no tiene lugar para el teléfono del decisor: ${telefonoDelDecisor} quedó solo en la actividad`)
    if (del.sinLugar.includes('email')) toast(`El contacto del decisor ya tiene otro email: ${emailDelDecisor} quedó solo en la actividad`)
    const todo = { ...del.patch, ...patchTelefono }
    if (Object.keys(todo).length > 0) actualizarCliente.mutate({ clientId: client.id, patch: todo })
    if (sinLugar.length > 0) toast(`El perfil no tiene más lugar para contactos: ${sinLugar.join(', ')} quedó solo en la actividad`)
    /* El contacto que quedó con el nombre o el teléfono conseguidos se fija (18/11/2026, por
       pedido; antes el apuntado no se fijaba porque no es alguien con quien se habló). */
    return { patch, decisorConseguido: del.campo }
  }
  const cargarContactosNuevos = (decisor: string | null) => cargarAlPerfil(decisor, nuevosElegidos)

  /* Contacto fallido con texto escrito pide confirmar (12/11/2026, por pedido): muchas veces se
     elige «Contacto fallido» por error y se escribe lo que se habló. Con el detalle vacío no pregunta. */
  const [confirmandoFallido, setConfirmandoFallido] = useState(false)

  const enviar = (fallidoConfirmado = false) => {
    if (enviando || esDemo) return
    if (!listo || (pideEtapa && !etapaFinal) || Object.values(faltaDelDecisor).some(Boolean)) {
      setIntento(true)
      if (pideEtapa && !etapaFinal) setFaltaEtapa(true)
      return
    }
    if (tipo === 'fallido' && limpio && !fallidoConfirmado) { setConfirmandoFallido(true); return }
    if (tipo === 'llamada' || tipo === 'fallido') {
      const resultado: ResultadoDeLlamada = tipo === 'llamada' ? 'contestada' : 'no_respondida'
      // Se guardan solo los que siguen siendo contactos: alguien pudo borrar un teléfono mientras tanto.
      const elegidos = con.filter(c => elegibles.includes(c))
      const esDecisor = sabido ?? decisor === true
      // El escrito a mano se rotula con quien atendió, si fue uno solo: es lo que el perfil va a decir.
      const marcado = telefonoElegido && { telefono: telefonoElegido.numero === telefonoNuevo && tipo === 'llamada' && elegidos.length === 1
        ? { ...telefonoElegido, etiqueta: elegidos[0] } : telefonoElegido }
      const meta: MetaDeActividad = tipo === 'llamada'
        ? { tipo: 'llamada', con: elegidos, resultado, decisor: esDecisor, ...marcado, ...metaDelDecisor }
        : { tipo: 'llamada', con: [], resultado, ...marcado }
      // Contestó que sí: el contacto queda como decisor en el perfil y la próxima no se pregunta.
      const nuevoDecisor = tipo === 'llamada' && sabido === null ? campoDelNuevoDecisor(conDecisor, elegidos, esDecisor) : null
      // Se toman antes de limpiar el formulario: el registro los vacía.
      const proximo = tipo === 'llamada' && pideDecisorApuntado ? proximoContacto.valor : null
      const tituloDeLaTarea = tituloProximo
      const etapaDeLaTarea = etapaAlRegistrar
      // Si el único con quien se habló es uno escrito a mano y decide, se carga ya como decisor.
      const decisorNuevo = tipo === 'llamada' && esDecisor && elegidos.length === 1 && nuevos.includes(elegidos[0]) ? elegidos[0] : null
      comentar.mutate({ description: limpio || TEXTO_DE_LLAMADA[resultado], meta },
        { onSuccess: () => {
          if (tipo === 'llamada') {
            const { patch, decisorConseguido } = cargarAlPerfil(decisorNuevo, elegidos)
            const decisores = decisoresDeLaLlamada(conDecisor, elegidos, esDecisor, patch)
            if (decisorConseguido && !decisores.includes(decisorConseguido)) decisores.push(decisorConseguido)
            if (decisores.length > 0) onDecisorContactado?.(decisores)
          } else cargarAlPerfil(null, [])
          setTexto(''); limpiarConQuien(); setDecisor(null); setTelefono(null); setTelefonoNuevo(null)
          setAbierto(false)
          onRegistrado?.()
          if (nuevoDecisor && lead.client) {
            actualizarCliente.mutate({ clientId: lead.client.id, patch: { [nuevoDecisor]: true } })
          }
          // El mail se abre ya; la tarea espera a que la etapa quede guardada (la mira el trigger).
          const etapaGuardada = moverEtapa()
          abrirMailAlDecisor()
          if (proximo) void etapaGuardada.then(() => crearTareaDeProximoContacto(proximo, tituloDeLaTarea, etapaDeLaTarea))
        } })
    }
    else if (tipo === 'nota') {
      const meta: MetaDeActividad = { tipo, con: con.filter(c => elegibles.includes(c)) }
      comentar.mutate({ description: limpio, meta }, { onSuccess: () => {
        cargarContactosNuevos(null)
        setTexto(''); limpiarConQuien(); setAbierto(false); onRegistrado?.(); void moverEtapa()
      } })
    }
  }
  /* Con «Enviar mail» en Sí, «Mensajes» se abre en Email («Presentación con vídeo») con el «Para» del
     decisor. Va después de mover la etapa: si se abre el descarte o «¿Cualifica?», queda encima. */
  const abrirMailAlDecisor = () => {
    if (!pideDecisorApuntado || !emailDelDecisor) return
    setMailAlDecisor(m => ({ para: emailDelDecisor, n: (m?.n ?? 0) + 1 }))
    setMailAbierto(true)
  }

  /* El bloque se dibuja en un solo lugar: a la derecha de la ventana si entra en la pantalla, adentro
     si no (`useEntraAlCostado`). */
  const decisorAlCostado = useEntraAlCostado(ANCHO_DEL_REGISTRO)
  const bloqueDelDecisor = (
    <BloqueDecisor valor={bloqueDecisor} onCambiar={cambiarBloqueDecisor}
      rojo={{ nombre: enRojo('decisorNombre'), telefono: enRojo('decisorTelefono'), horario: enRojo('decisorHorario'), email: enRojo('decisorEmail'),
        proximo: enRojo('decisorProximo'), tarea: enRojo('decisorTarea') }}
      avisoProximo={avisoProximo} tituloSugerido={tituloSugeridoProximo} />
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {pestana === 'demo' && (
        <div role="tabpanel" id="panel-demo" aria-labelledby="pestana-demo" className="flex min-h-0 flex-1 flex-col">
          <GuionDeDemo leadId={lead.id} puedeEscribir={puedeEscribir} />
        </div>
      )}

      {pestana === 'inmobiliaria' && (
        <div role="tabpanel" id="panel-inmobiliaria" aria-labelledby="pestana-inmobiliaria" className="flex min-h-0 flex-1 flex-col">
          <InmobiliariaDelLead lead={lead} puedeEscribir={puedeEscribir} otrosContactos={otrosContactos}
            telefonos={telefonosSueltos} emails={emailsSueltos} />
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
                const titulo = tituloDe(i)
                const verTexto = !!titulo
                const borrable = puedeEscribir && (i.tipo === 'comentario' || i.tipo === 'llamada' || i.tipo === 'demoHecha')
                const reunionCancelable = puedeEscribir && i.reunion?.estado === 'scheduled'
                  ? detalle?.meetings.find(m => m.id === i.reunion?.id) : undefined
                // La demo realizada (4/11/2026, por pedido) va resaltada: es lo más importante que
                // le pasa a un lead y tiene que encontrarse de un vistazo entre las llamadas.
                const resaltada = i.tipo === 'demoHecha'
                return (
                  <li key={i.id} className={cn('group flex gap-3 py-2.5 not-first:[border-top:1px_solid_var(--line-soft)]',
                    resaltada && 'my-1 rounded-lg bg-(--brand-soft) px-2.5 [border:1px_solid_var(--brand-100)]!')}>
                    <span aria-hidden className={cn('mt-px flex size-7 shrink-0 items-center justify-center rounded-md',
                      resaltada ? 'bg-(--brand) text-white' : 'bg-card text-(--fg-2) [border:1px_solid_var(--line)]')}>
                      <Icon icon={ICONO[i.tipo]} size="sm" />
                    </span>
                    {/* Qué fue y cuándo a la izquierda, lo escrito a la derecha; en el teléfono no
                        entran lado a lado y lo escrito baja. */}
                    <div className="flex min-w-0 flex-1 items-start gap-3 max-md:flex-col max-md:gap-1.5">
                      {/* Sin texto al lado (un cambio de estado), el registro se lleva el ancho entero. */}
                      <div className={cn('min-w-0 max-md:w-full', verTexto ? 'w-[200px] shrink-0' : 'flex-1')}>
                        <div className="flex items-baseline gap-3">
                          <p className={cn('min-w-0 flex-1 text-[13px] font-semibold leading-snug', resaltada ? 'text-(--brand-soft-fg)' : 'text-foreground')}>{titulo ?? i.texto}</p>
                          <span className="shrink-0 text-[11px] tabular-nums text-(--fg-muted)">{horaDe(i.fecha)}</span>
                        </div>
                        {quien && <p className="text-[12px] leading-snug text-(--fg-2)">{quien}</p>}
                        {/* Lo conseguido del decisor (18/11/2026, por pedido): de la meta, no del texto. */}
                        {i.decisorConseguido && (
                          <p className="mt-0.5 text-[12px] leading-snug text-(--fg-2)">
                            <span className="font-semibold text-foreground">Decisor conseguido:</span> {i.decisorConseguido}
                          </p>
                        )}
                        {/* El horario acordado para llamar al decisor (19/11/2026, por pedido). */}
                        {i.proximoContactoDecisor && (
                          <p className="mt-0.5 text-[12px] leading-snug text-(--fg-2)">
                            <span className="font-semibold text-foreground">Próximo contacto:</span> {i.proximoContactoDecisor}
                          </p>
                        )}
                      </div>
                      {verTexto && (
                        <p className={cn('w-full min-w-0 flex-1 whitespace-pre-wrap rounded-md px-3 py-2 text-[13px] leading-snug text-foreground',
                          resaltada ? 'bg-card [border:1px_solid_var(--brand-100)]' : 'bg-(--surface-2) [border:1px_solid_var(--line-soft)]')}>
                          {i.texto}
                        </p>
                      )}
                    </div>
                    {reunionCancelable && (
                      <button type="button" onClick={() => setDemoACancelar(reunionCancelable)} aria-label="Cancelar esta demo"
                        title="Cancelar la demo"
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-muted) opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-(--danger-soft) hover:text-(--danger) max-md:opacity-100">
                        <CalendarX size={14} />
                      </button>
                    )}
                    {borrable && (
                      <button type="button" onClick={() => setEditandoActividad(i)} aria-label="Editar esta actividad"
                        title="Editar el texto"
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-muted) opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-(--surface-2) hover:text-foreground max-md:opacity-100">
                        <Pencil size={14} />
                      </button>
                    )}
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
        // En todas las pestañas (17/10/2026, por pedido): se registra también mirando la inmobiliaria
        // o con el guion de la demo abierto.
        <div className="shrink-0 px-5 pb-4 pt-3 [border-top:1px_solid_var(--line)] max-md:px-3 max-md:pb-3">
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
        <VentanaFlotante open={abierto} onOpenChange={setAbierto} ancho={esDemo ? ANCHO_DE_DEMO : ANCHO_DEL_REGISTRO}
          titulo={`Registrar actividad · ${nombreDelLead(lead.client)}`}
          descripcion="Qué pasó con el lead y en qué etapa queda."
          /* «Avances para contactar al decisor» va a la derecha, afuera de la ventana (19/11/2026, por
             pedido), y la ventana nace corrida a la izquierda para dejarle lugar: así no crece hasta
             scrollear. Si no entra en la pantalla, va adentro, como antes. */
          derecha={!esDemo && pideDecisorApuntado && decisorAlCostado ? bloqueDelDecisor : undefined}
          corrida={!esDemo && decisorAlCostado ? (ANCHO_DEL_COSTADO + 8) / 2 : 0}
          lateral={verInvestigacion && investigacion ? <InvestigacionAlCostado texto={investigacion} onPlegar={() => setVerInvestigacion(false)} />
            : muestraDiscovery(tipo, texto) ? <DiscoveryAlCostado />
            : tipo === 'llamada' ? <GuiaDelCompositor key="llamada" titulo="Guía de la llamada" secciones={GUIA_DE_LLAMADA} />
            : esDemo ? <GuiaDelCompositor key="demo" titulo="Guía de la demo" secciones={GUIA_DE_DEMO} />
            : undefined}>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {TIPOS.map(t => {
                const on = tipo === t.id
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => { setTipo(t.id); setIntento(false) }}
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
              {/* Solo si el lead tiene investigación: un botón que no abre nada no se ofrece. */}
              {investigacion && (
                <button type="button" aria-pressed={verInvestigacion} onClick={() => setVerInvestigacion(v => !v)}
                  title={verInvestigacion ? 'Plegar la investigación de Claude' : 'Ver la investigación de Claude al costado'}
                  className={cn(
                    'ml-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
                    verInvestigacion ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
                      : 'text-(--brand-700) bg-card [border:1px_dashed_var(--brand-200)] hover:bg-(--brand-soft)',
                  )}>
                  <Icon icon={Sparkles} size="xs" />
                  Investigación
                </button>
              )}
            </div>
            {esDemo ? (
              <div>
                <MeetingFormContent
                  open={abierto}
                  onClose={() => setAbierto(false)}
                  leadId={lead.id}
                  assignedTo={lead.assigned_to}
                  defaultTitle={tituloDeLaDemo(lead.client?.company_name)}
                  defaultDescription={DESCRIPCION_DE_DEMO}
                  defaultReminderMinutes={RECORDATORIO_DE_DEMO}
                  defaultGuestEmails={invitadosDeLaDemo(lead.client?.email ?? null)}
                  demo
                  /* Se lee al montarse (al elegir «Agendar demo»): lo escrito en la llamada o la nota pasa. */
                  registroInicial={registroDeDemoDesdeLaActividad(
                    { con, nuevos, decisorApuntado, esDecisor: decisor, texto, etapa: etapaElegida }, descartada?.id)}
                  onAbrirContacto={onAbrirContacto}
                  onSaved={() => setTipo('llamada')}
                  onDemoAgendada={d => setDemoAgendada({ ...d, responsable: usuariosPorId.get(lead.assigned_to)?.nombre ?? null })}
                />
              </div>
            ) : (<>
            {/* Con quién va en su renglón, debajo de las pastillas, igual que los campos de la demo:
                cada tipo pide lo suyo en el mismo lugar. Una pastilla por contacto, que se prenden
                varias: con dos o tres contactos, un menú era un clic de más para elegir. */}
            {pideConQuien && (
              <FilaDePersonas rotulo={tipo === 'llamada' ? 'Hablaste con' : 'Con'}
                contactos={contactos} nuevos={nuevos} con={con}
                onAlternar={c => setCon(xs => xs.includes(c) ? xs.filter(x => x !== c) : [...xs, c])}
                onSacar={c => { setNuevos(xs => xs.filter(x => x !== c)); setCon(xs => xs.filter(x => x !== c)) }}
                onAgregar={agregarEscrito}
                campoDe={c => conDecisor.find(p => p.nombre === c)?.campoDecisor}
                onAbrirContacto={onAbrirContacto} rojo={enRojo('con')}
                tituloNuevo="Se carga como contacto al registrar"
                ariaEscribir="Escribir con quién, si no está entre los contactos" />
            )}
            {pideTelefono && (
              <FilaDeTelefono cargados={cargados} nuevo={telefonoNuevo} elegido={telefono}
                onElegir={setTelefono} onEscrito={agregarTelefono} onSacarNuevo={sacarTelefonoNuevo}
                rojo={!!enRojo('telefono')} tituloNuevo="Se carga en el perfil al registrar" />
            )}
            {/* Si es decisor queda en la llamada y, desde el 12/10/2026, también en el contacto (al
                lado del rol en el perfil): se pregunta solo mientras el perfil no lo sepa. Aparece
                debajo de con quién, recién cuando se eligió, y hay que contestarla: sin respuesta
                no se registra. Contestar «Sí» con un solo contacto elegido lo marca en el perfil. */}
            {pideDecisor && (
              <FilaEsDecisor valor={decisor} rojo={enRojo('decisor')}
                // Pasar a Sí esconde el bloque: lo contestado ahí se vacía, así no queda nada oculto.
                onCambiar={v => { setDecisor(v); if (v) setBloqueDecisor(BLOQUE_DEL_DECISOR_VACIO) }}
                title="Quien atendió decide en la inmobiliaria" />
            )}
            {tipo === 'llamada' && eligioConQuien && sabido !== null && <NotaDeDecisorSabido sabido={sabido} />}
            {pideDecisorApuntado && !decisorAlCostado && bloqueDelDecisor}
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar() } }}
              // Con «Avances para contactar al decisor» adentro (pantalla angosta), más bajo: así la ventana no scrollea.
              rows={pideDecisorApuntado && !decisorAlCostado ? 3 : 6}
              aria-label="Registrar actividad"
              placeholder={tipo === 'llamada' || tipo === 'nota' ? PLACEHOLDER_DE_DISCOVERY
                : tipo === 'fallido' ? 'Detalle (opcional): no atendió, buzón, número equivocado…'
                : 'Escribí qué pasó o qué querés registrar…'}
              aria-invalid={enRojo('texto')}
              className={claseDelTexto(enRojo('texto'))}
            />
            {pideEtapa && (
              <CajaDeEtapa valor={etapaFinal} onCambiar={v => { setEtapaElegida(v); setFaltaEtapa(false) }}
                opciones={opcionesEtapa} actual={actual} rojo={faltaEtapa}
                aviso="Elegí en qué etapa queda antes de registrar" />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              {intento && Object.values(falta).some(Boolean) && (
                <span role="alert" className="self-center text-[11.5px] font-semibold text-(--danger)">Completá lo marcado en rojo</span>
              )}
              <Button onClick={() => enviar()} disabled={enviando}>
                {enviando ? 'Registrando…' : 'Registrar'}
              </Button>
            </div>
            </>)}
          </div>
        </VentanaFlotante>
      )}
      {descartando && descartada && (
        <DescartarLeadDialog leadId={lead.id} etapa={descartada} onClose={() => setDescartando(false)} />
      )}
      {preguntandoCualifica && <CualificaLeadDialog leadId={lead.id} onClose={() => setPreguntandoCualifica(false)} />}
      <DemoAgendadaDialog demo={demoAgendada} onCerrar={() => setDemoAgendada(null)} />
      {/* Queda montado al cerrarse: «¿Registrar la actividad?» del envío vive adentro. */}
      {mailAlDecisor && (
        <MensajesPredeterminadosDialog key={mailAlDecisor.n} client={lead.client} leadId={lead.id}
          abierto={mailAbierto} onCerrar={() => setMailAbierto(false)} canalInicial="email" paraInicial={mailAlDecisor.para} />
      )}
      <AlertDialog open={confirmandoFallido} onOpenChange={setConfirmandoFallido}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Fue un contacto fallido?</AlertDialogTitle>
            <AlertDialogDescription>
              Escribiste un detalle: «{limpio}». Si hablaste con alguien, registralo como «Llamada».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setTipo('llamada'); setIntento(false) }}>Era una llamada</AlertDialogCancel>
            <AlertDialogAction onClick={() => enviar(true)}>Sí, contacto fallido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {demoACancelar && (
        <CancelarDemoDialog key={demoACancelar.id} cuando={cuandoEs(demoACancelar)} reunion={demoACancelar}
          opciones={opcionesEtapa} actual={actual} cancelando={cancelarDemo.isPending}
          onCerrar={() => setDemoACancelar(null)}
          onConfirmar={({ motivo, etapaId }) => cancelarDemo.mutate({ reunion: demoACancelar, motivo }, {
            onSuccess: () => { setDemoACancelar(null); void moverA(etapaId) },
          })} />
      )}
      {editandoActividad && (
        <EditarActividad key={editandoActividad.id} item={editandoActividad} onCerrar={() => setEditandoActividad(null)}
          onGuardar={description => editarActividad.mutate({ id: editandoActividad.id, description })} />
      )}
    </div>
  )
}
