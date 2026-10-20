import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CalendarDays, ChevronDown, CircleCheck, Clock, Info, MessageSquare, Pencil, Phone, PhoneMissed, Plus, Trash2, UserRound, X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { localTodayIso } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useActualizarCliente, useActualizarLead, useMutacionDelDetalle } from '../hooks/useLeadMutaciones'
import {
  agruparPorDia, armarMetaDeActividad, horaDe, INTENTOS_DE_CONTACTO, lineaDeTiempo, primeroLosUltimos, TEXTO_DE_LLAMADA, textoEditado,
  ultimoContacto, type ItemActividad, type MetaDeActividad, type ResultadoDeLlamada,
} from '../lib/actividad'
import {
  campoDelNuevoDecisor, casilleroDelTelefonoNuevo, conDecisorApuntado, contactosConDecisor, tieneDecisor, decisorDelContactoNuevo, decisorSabido,
  decisoresDeLaLlamada, nombreDelLead, patchDeContactosNuevos, telefonosDelCliente, type CampoDecisor,
} from '../lib/clientData'
import { GUIA_DE_DEMO, GUIA_DE_LLAMADA, type SeccionDeGuia } from '../lib/guiaDeLlamada'
import { armarReunion, descripcionDeDemo, esEmailValido } from '../lib/reuniones'
import { actualizarComentario, crearComentario, crearReunion, marcarComentarioBorrado } from '../service/crm.service'
import type { CrmLeadRow, LeadDetalle } from '../types'
import { InmobiliariaDelLead } from './InmobiliariaDelLead'
import { DescartarLeadDialog } from './DescartarLeadDialog'
import { CamposDeReunion, camposReunionVacios, type CamposReunion } from './ReunionesDelLead'
import { VentanaFlotante } from './VentanaFlotante'
import { OpcionesDeEtapa } from './leadCells'

/* NUEVO. En el producto el chat de actividad vive adentro de LeadAccordion (5.600 líneas); acá
   es la columna derecha del dialog del lead. Arriba la línea de tiempo partida por día; abajo,
   fijo y fuera del scroll, el compositor. El compositor escribe en dos lugares según la pastilla
   —un comentario (nota, llamada o contacto fallido) o una demo (que es una reunión)—.
   La tarea se sacó el 10/10/2026, volvió el 12/10/2026 y se volvió a sacar el 16/10/2026, las
   tres veces por pedido: las tareas se crean desde su lista del perfil.
   El contacto fallido es su propia pastilla y no un resultado adentro de «Llamada» (12/10/2026,
   por pedido): es lo que más se registra y no puede costar dos clics. Se guarda igual que antes
   —una llamada con resultado 'no_respondida'—, así el contador del día no se entera. */

type Tipo = 'nota' | 'llamada' | 'fallido' | 'reunion'
const TIPOS: { id: Tipo; label: string; icono: LucideIcon }[] = [
  { id: 'llamada', label: 'Llamada', icono: Phone },
  { id: 'fallido', label: 'Contacto fallido', icono: PhoneMissed },
  // «Notas» y no «Actividad» (17/10/2026, por pedido): actividad es todo lo que se registra.
  { id: 'nota', label: 'Notas', icono: MessageSquare },
  { id: 'reunion', label: 'Agendar demo', icono: CalendarDays },
]

/* La reunión se guarda siempre como «Demo»: es lo único que agenda esta pastilla. Desde el
   16/10/2026 el texto de abajo son las notas de la demo (van a la descripción, con el mail y quién
   asiste) y no el título: la actividad no repite «Demo» y la lista de reuniones lo pinta arriba. */
const TITULO_DEMO = 'Demo'

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

const ICONO: Record<ItemActividad['tipo'], LucideIcon> = {
  comentario: MessageSquare, llamada: Phone, sistema: Info, gestion: CircleCheck, pospuesto: Clock,
  asignacion: UserRound, reunion: CalendarDays,
}

/* Lo que se registra desde el compositor se titula por qué es —Nota, Tarea, Demo— y lo que pasó va
   abajo, en su recuadro. El resto (gestiones, etapas, responsable) es una línea sola: ya se explica. */
const TITULO: Partial<Record<ItemActividad['tipo'], string>> = {
  comentario: 'Nota', llamada: 'Llamada', reunion: 'Demo',
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

const pastilla = (on: boolean) => cn(
  'inline-flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors',
  on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
    : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
)
// El «+» que abre el campo para escribir a mano: sin fondo ni marco hasta el hover, para que no
// compita con las pastillas.
const botonEscribir = 'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--fg-faint) transition-colors hover:bg-(--surface-2) hover:text-(--fg-2)'

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

export function ActividadLead({ lead, detalle, cargando, puedeEscribir, pestana, otrosContactos, telefonosSueltos, emailsSueltos, onDecisorContactado, onAbrirContacto }: {
  lead: CrmLeadRow
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
  const { usuarios } = useCarteras()
  const [abierto, setAbierto] = useState(false)
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
  const [escrito, setEscrito] = useState('')
  /* El campo para escribir a mano (con quién y a qué número) no está siempre a la vista
     (17/10/2026, por pedido): es un «+» discreto y el campo aparece al tocarlo. Lo de todos los
     días es elegir una pastilla; el campo abierto se leía como algo que había que llenar. */
  const [escribiendoCon, setEscribiendoCon] = useState(false)
  const elegibles = [...contactos, ...nuevos]
  const agregarEscrito = () => {
    setEscribiendoCon(false)
    const nombre = escrito.trim().replace(/\s+/g, ' ')
    setEscrito('')
    if (!nombre) return
    const existente = elegibles.find(c => c.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))
    if (!existente) setNuevos(xs => [...xs, nombre])
    const elegido = existente ?? nombre
    setCon(xs => xs.includes(elegido) ? xs : [...xs, elegido])
  }
  // Corre al registrar con éxito: también apaga el rojo de lo que faltaba.
  const limpiarConQuien = () => { setCon([]); setNuevos([]); setEscrito(''); setEscribiendoCon(false); setIntento(false); setDecisorApuntado('') }
  /* A qué teléfono se llamó va aparte de con quién se habló (16/10/2026, por pedido): se marca la
     oficina y atiende Laura, o el celular de Marc y atiende su socio. Lo piden la llamada y el
     contacto fallido, primero que nada; arranca vacío, como la etapa, para que no se confirme sin
     mirarlo. Se pide aunque el perfil no tenga teléfonos: se escribe con el «+». */
  const [telefono, setTelefono] = useState<string | null>(null)
  /* El número también se escribe a mano (17/10/2026, por pedido), haya o no teléfonos cargados:
     se marcó uno que el perfil no tiene. Entra como una pastilla más, elegida, y al registrar se
     carga en el perfil (`casilleroDelTelefonoNuevo`). Uno solo: se llamó a un número. */
  const [telefonoNuevo, setTelefonoNuevo] = useState<string | null>(null)
  const [telefonoEscrito, setTelefonoEscrito] = useState('')
  const digitos = (t: string) => t.replace(/\D/g, '')
  const cargados = primeroLosUltimos(telefonosDelCliente(lead.client),
    t => ultimo.telefono !== null && digitos(t.numero) === digitos(ultimo.telefono))
  const telefonos = telefonoNuevo ? [...cargados, { numero: telefonoNuevo, etiqueta: telefonoNuevo }] : cargados
  const [escribiendoTelefono, setEscribiendoTelefono] = useState(false)
  const agregarTelefono = () => {
    setEscribiendoTelefono(false)
    const numero = telefonoEscrito.trim().replace(/\s+/g, ' ')
    setTelefonoEscrito('')
    if (digitos(numero).length < 6) return
    const existente = cargados.find(t => digitos(t.numero) === digitos(numero))
    if (!existente) setTelefonoNuevo(numero)
    setTelefono(existente?.numero ?? numero)
  }
  const sacarTelefonoNuevo = () => {
    if (telefono === telefonoNuevo) setTelefono(null)
    setTelefonoNuevo(null)
  }
  const pideTelefono = tipo === 'llamada' || tipo === 'fallido'
  const telefonoElegido = telefonos.find(t => t.numero === telefono)
  /* Obligatorio siempre, también sin teléfonos cargados (17/10/2026, por pedido): el número se
     escribe con el «+». Antes, sin teléfonos en el perfil, el contacto fallido no lo pedía. */
  const eligioTelefono = !!telefonoElegido
  // Con quién solo tiene sentido en lo que pasó con alguien: una nota o una llamada (que siempre es
  // contestada: la que nadie atendió es «Contacto fallido»). En la demo es quién asiste.
  const pideConQuien = tipo === 'nota' || tipo === 'llamada' || tipo === 'reunion'
  /* La demo pide a qué mail va la invitación (16/10/2026, por pedido), precargado con el de la
     inmobiliaria. Si no tenía, el que se escriba se le guarda al agendar. */
  const [mailDemo, setMailDemo] = useState(() => lead.client?.email ?? '')
  const mailValido = esEmailValido(mailDemo)
  // En una llamada los campos se piden de a uno: primero con quién, después si decide.
  // Sin contactos cargados no hay a quién elegir, y la pregunta del decisor aparece igual.
  const eligioConQuien = elegibles.length === 0 || con.some(c => elegibles.includes(c))
  // Si el perfil ya dice si los elegidos deciden, no se pregunta: se toma de ahí.
  const sabido = decisorSabido(conDecisor, con)
  const pideDecisor = tipo === 'llamada' && eligioConQuien && sabido === null
  /* Apuntar al decisor (17/10/2026, por pedido): habló el doorkeeper u otro y dio el nombre de
     quien decide. Opcional, y deja de estar en cuanto el perfil tiene a alguien marcado como
     decisor. El contacto fallido no lo ofrece: ahí no habló nadie. */
  const [decisorApuntado, setDecisorApuntado] = useState('')
  const pideDecisorApuntado = tipo !== 'fallido' && !tieneDecisor(lead.client)
  /* Toda actividad registrada pide elegir en qué etapa queda el lead, para que avanzarlo no
     dependa de acordarse (12/10/2026, por pedido). Arranca VACÍA y es obligatoria: precargarla
     (con la actual o con una sugerida) hacía que se confirmara sin leerla. Registrar sin elegir
     la marca en rojo y no registra. El contacto fallido no mueve nada y no la pide. Descartado se
     ofrece desde el 16/10/2026 (por pedido), pero lleva motivo: con la actividad guardada se abre
     el mismo DescartarLeadDialog del perfil y de la fila, y cancelarlo deja al lead donde estaba. */
  const pideEtapa = tipo !== 'fallido'
  const [etapaElegida, setEtapaElegida] = useState<string | null>(null)
  const [faltaEtapa, setFaltaEtapa] = useState(false)
  const [descartando, setDescartando] = useState(false)
  const etapaFinal = etapaElegida ?? ''
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel)
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  if (descartada && !opcionesEtapa.some(e => e.id === descartada.id)) opcionesEtapa.push(descartada)
  const [reunion, setReunion] = useState<CamposReunion>(camposReunionVacios)
  const lista = useRef<HTMLDivElement>(null)
  const enActividad = pestana === 'actividad'

  const comentar = useMutacionDelDetalle(lead.id, (v: { description: string; meta: MetaDeActividad }) =>
    crearComentario({ lead_id: lead.id, description: v.description, long_description: armarMetaDeActividad(v.meta) }))
  // La reunión nueva es del responsable del lead, igual que en su lista del perfil.
  const agendar = useMutacionDelDetalle(lead.id, (description: string) =>
    crearReunion({ lead_id: lead.id, assigned_to: lead.assigned_to, title: TITULO_DEMO, description, ...armarReunion(reunion.fecha, reunion.hora, reunion.duracion) }),
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
  // Editar el texto: mismo optimista que borrar, sobre la `description` del comentario.
  const [editandoActividad, setEditandoActividad] = useState<ItemActividad | null>(null)
  const editarActividad = useMutacionDelDetalle(lead.id,
    (v: { id: string; description: string }) => actualizarComentario(v.id, { description: v.description }),
    { exito: 'Actividad editada',
      optimista: (d, v) => ({ ...d, comments: d.comments.map(c => c.id === v.id ? { ...c, description: v.description } : c) }) })
  const actualizarCliente = useActualizarCliente()

  /* Recién con la actividad guardada se mueve la etapa: si el registro falla, el lead no avanza por
     algo que no quedó escrito. Lo que se confirmó igual a la actual no toca la base. */
  const moverEtapa = () => {
    const destino = etapasPorId.get(etapaFinal)
    setEtapaElegida(null)
    setFaltaEtapa(false)
    if (!pideEtapa || !destino || destino.id === lead.funnel_stage_id) return
    if (destino.id === descartada?.id) { setDescartando(true); return }
    actualizarLead.mutate(
      { id: lead.id, patch: { funnel_stage_id: destino.id, discard_reason: null, recontact_at: null } },
      { onSuccess: () => toast.success(`Lead en «${destino.label}»`) })
  }

  const items = detalle ? lineaDeTiempo(detalle, usuarios) : []
  const dias = agruparPorDia(items, localTodayIso())
  const usuariosPorId = new Map(usuarios.map(u => [u.id, u]))

  // Se lee como un chat: lo último abajo, pegado al compositor. Al llegar algo nuevo se baja.
  useEffect(() => {
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [items.length, enActividad])

  const enviando = comentar.isPending || agendar.isPending
  const limpio = texto.trim()
  // La demo se puede agendar sin notas, y la llamada y el contacto fallido sin texto (el tipo ya
  // dice qué pasó); la nota, no. La llamada sí pide con quién se habló y si es decisor;
  // la demo, el mail de la invitación y quién asiste.
  const listo = tipo === 'reunion' ? !!reunion.fecha && mailValido && eligioConQuien
    : tipo === 'llamada' ? eligioTelefono && eligioConQuien && (sabido !== null || decisor !== null)
    : tipo === 'fallido' ? eligioTelefono
    : !!limpio

  /* «Registrar» ya no se apaga: tocarlo con algo sin completar pinta en rojo cada dato que falta
     (17/10/2026, por pedido), como ya hacía la etapa. Un botón gris no dice qué le falta. */
  const [intento, setIntento] = useState(false)
  const falta = {
    telefono: pideTelefono && !eligioTelefono,
    con: (tipo === 'llamada' || tipo === 'reunion') && !eligioConQuien,
    decisor: pideDecisor && decisor === null,
    texto: tipo === 'nota' && !limpio,
    fecha: tipo === 'reunion' && !reunion.fecha,
    mail: tipo === 'reunion' && !mailValido,
  }
  const enRojo = (k: keyof typeof falta) => intento && falta[k]
  const filaEnRojo = (k: keyof typeof falta) => enRojo(k) && 'rounded-md bg-(--danger-soft) px-2 py-1 [outline:1px_solid_var(--danger)]'
  const rotuloEnRojo = (k: keyof typeof falta) => enRojo(k) ? 'font-semibold text-(--danger)' : 'text-(--fg-muted)'

  // Los escritos a mano que siguen elegidos se cargan como contactos; `decisor` es el que quedó
  // como decisor, si es uno de ellos. Lo que no entra en el perfil queda solo en la actividad.
  const nuevosElegidos = nuevos.filter(c => con.includes(c))
  /* Lo escrito a mano va al perfil en un solo guardado: las personas y el número marcado. El número
     va al contacto con quien se habló, si se habló con uno solo; `elegidos` vacío (el contacto
     fallido) no carga personas. */
  const cargarAlPerfil = (decisor: string | null, elegidos: string[]) => {
    const client = lead.client
    if (!client) return {}
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
    // El decisor apuntado va último: el número marcado es de quien atendió, no del decisor.
    const apuntado = pideDecisorApuntado ? decisorApuntado.trim().replace(/\s+/g, ' ') : ''
    const conApuntado = apuntado ? conDecisorApuntado({ ...client, ...patchTelefono }, patch, apuntado) : { patch, sinLugar: false }
    if (conApuntado.sinLugar) toast(`El perfil no tiene más lugar para contactos: el decisor ${apuntado} no se cargó`)
    const todo = { ...conApuntado.patch, ...patchTelefono }
    if (Object.keys(todo).length > 0) actualizarCliente.mutate({ clientId: client.id, patch: todo })
    if (sinLugar.length > 0) toast(`El perfil no tiene más lugar para contactos: ${sinLugar.join(', ')} quedó solo en la actividad`)
    // Sin el apuntado: no es alguien con quien se habló, así que no se fija como decisor contactado.
    return patch
  }
  const cargarContactosNuevos = (decisor: string | null) => cargarAlPerfil(decisor, nuevosElegidos)

  const enviar = () => {
    if (enviando) return
    if (!listo || (pideEtapa && !etapaFinal)) {
      setIntento(true)
      if (pideEtapa && !etapaFinal) setFaltaEtapa(true)
      return
    }
    if (tipo === 'llamada' || tipo === 'fallido') {
      const resultado: ResultadoDeLlamada = tipo === 'llamada' ? 'contestada' : 'no_respondida'
      // Se guardan solo los que siguen siendo contactos: alguien pudo borrar un teléfono mientras tanto.
      const elegidos = con.filter(c => elegibles.includes(c))
      const esDecisor = sabido ?? decisor === true
      // El escrito a mano se rotula con quien atendió, si fue uno solo: es lo que el perfil va a decir.
      const marcado = telefonoElegido && { telefono: telefonoElegido.numero === telefonoNuevo && tipo === 'llamada' && elegidos.length === 1
        ? { ...telefonoElegido, etiqueta: elegidos[0] } : telefonoElegido }
      const meta: MetaDeActividad = tipo === 'llamada'
        ? { tipo: 'llamada', con: elegidos, resultado, decisor: esDecisor, ...marcado }
        : { tipo: 'llamada', con: [], resultado, ...marcado }
      // Contestó que sí: el contacto queda como decisor en el perfil y la próxima no se pregunta.
      const nuevoDecisor = tipo === 'llamada' && sabido === null ? campoDelNuevoDecisor(conDecisor, elegidos, esDecisor) : null
      // Si el único con quien se habló es uno escrito a mano y decide, se carga ya como decisor.
      const decisorNuevo = tipo === 'llamada' && esDecisor && elegidos.length === 1 && nuevos.includes(elegidos[0]) ? elegidos[0] : null
      comentar.mutate({ description: limpio || TEXTO_DE_LLAMADA[resultado], meta },
        { onSuccess: () => {
          if (tipo === 'llamada') {
            const patch = cargarAlPerfil(decisorNuevo, elegidos)
            const decisores = decisoresDeLaLlamada(conDecisor, elegidos, esDecisor, patch)
            if (decisores.length > 0) onDecisorContactado?.(decisores)
          } else cargarAlPerfil(null, [])
          setTexto(''); limpiarConQuien(); setDecisor(null); setTelefono(null); setTelefonoNuevo(null); setTelefonoEscrito(''); setEscribiendoTelefono(false)
          setAbierto(false)
          if (nuevoDecisor && lead.client) {
            actualizarCliente.mutate({ clientId: lead.client.id, patch: { [nuevoDecisor]: true } })
          }
          moverEtapa()
        } })
    }
    else if (tipo === 'nota') {
      const meta = { tipo, con: con.filter(c => elegibles.includes(c)) }
      comentar.mutate({ description: limpio, meta }, { onSuccess: () => {
        cargarContactosNuevos(null)
        setTexto(''); limpiarConQuien(); setAbierto(false); moverEtapa()
      } })
    }
    else {
      const email = mailDemo.trim()
      const asistentes = [
        ...conDecisor.filter(c => con.includes(c.nombre)).map(c => c.decisor ? `${c.nombre} (decide)` : c.nombre),
        ...nuevosElegidos,
      ]
      // El mail se le guarda a la inmobiliaria solo si no tenía: el que ya estaba no se pisa.
      const guardarMail = lead.client && !lead.client.email?.trim() ? lead.client.id : null
      agendar.mutate(descripcionDeDemo({ email, asistentes, notas: limpio }), { onSuccess: () => {
        cargarContactosNuevos(null)
        setTexto(''); limpiarConQuien(); setReunion(camposReunionVacios()); setAbierto(false)
        // Si falla (otro cliente ya tiene ese mail), la demo ya quedó: el hook avisa y no se deshace nada.
        if (guardarMail) actualizarCliente.mutate({ clientId: guardarMail, patch: { email } })
        moverEtapa()
      } })
    }
  }


  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {!enActividad && (
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
                          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-foreground">{titulo ?? i.texto}</p>
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
        // En las dos pestañas (17/10/2026, por pedido): se registra también mirando la inmobiliaria.
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
        <VentanaFlotante open={abierto} onOpenChange={setAbierto} ancho={520}
          titulo={`Registrar actividad · ${nombreDelLead(lead.client)}`}
          descripcion="Qué pasó con el lead y en qué etapa queda."
          lateral={tipo === 'llamada' ? <GuiaDelCompositor key="llamada" titulo="Guía de la llamada" secciones={GUIA_DE_LLAMADA} />
            : tipo === 'reunion' ? <GuiaDelCompositor key="demo" titulo="Antes de agendar" secciones={GUIA_DE_DEMO} />
            : undefined}>
          <div className="flex flex-col gap-4 p-4">
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
            </div>
            {/* Con quién va en su renglón, debajo de las pastillas, igual que los campos de la demo:
                cada tipo pide lo suyo en el mismo lugar. Una pastilla por contacto, que se prenden
                varias: con dos o tres contactos, un menú era un clic de más para elegir. */}
            {pideConQuien && (
              <div className={cn('flex flex-wrap items-center gap-1.5', filaEnRojo('con'))}>
                <span className={cn('mr-0.5 text-[11.5px]', rotuloEnRojo('con'))}>{tipo === 'llamada' ? 'Hablaste con' : tipo === 'reunion' ? 'Quién asiste' : 'Con'}</span>
                {contactos.map(c => {
                  const on = con.includes(c)
                  // Doble clic abre su ficha para cargarle teléfono o email. Los dos clics prenden y
                  // apagan la pastilla: la elección queda como estaba.
                  const campo = conDecisor.find(p => p.nombre === c)?.campoDecisor
                  return (
                    <button key={c} type="button" aria-pressed={on}
                      title={campo && onAbrirContacto ? 'Doble clic: abrir la ficha' : undefined}
                      onDoubleClick={() => { if (campo) onAbrirContacto?.(campo) }}
                      onClick={() => setCon(xs => on ? xs.filter(x => x !== c) : [...xs, c])}
                      className={pastilla(on)}>
                      <span className="truncate">{c}</span>
                    </button>
                  )
                })}
                {/* Los escritos a mano se eligen como cualquier otro y se sacan con su ✕ (ver el
                    teléfono escrito: el «+» que llevaban se apretaba creyendo que agregaba). */}
                {nuevos.map(c => {
                  const on = con.includes(c)
                  return (
                    <span key={`nuevo-${c}`} className={cn(pastilla(on), 'pr-1')}>
                      <button type="button" aria-pressed={on} title="Se carga como contacto al registrar"
                        onClick={() => setCon(xs => on ? xs.filter(x => x !== c) : [...xs, c])}
                        className="min-w-0 cursor-pointer truncate">
                        {c}
                      </button>
                      <button type="button" aria-label={`Sacar a ${c}`} title="Sacar"
                        onClick={() => { setNuevos(xs => xs.filter(x => x !== c)); setCon(xs => xs.filter(x => x !== c)) }}
                        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-(--surface-2)">
                        <X size={12} />
                      </button>
                    </span>
                  )
                })}
                {escribiendoCon ? (
                  <input autoFocus value={escrito} onChange={e => setEscrito(e.target.value)} onBlur={agregarEscrito}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); agregarEscrito() }
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEscrito(''); setEscribiendoCon(false) }
                    }}
                    aria-label="Escribir con quién, si no está entre los contactos"
                    placeholder="Escribí el nombre…"
                    className="h-7 min-w-[150px] flex-1 rounded-md bg-card px-2.5 text-[12.5px] text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]" />
                ) : (
                  <button type="button" onClick={() => setEscribiendoCon(true)} className={botonEscribir}
                    title="Escribir otro nombre" aria-label="Escribir otro nombre">
                    <Icon icon={Plus} size="xs" />
                  </button>
                )}
              </div>
            )}
            {pideTelefono && (
              <div className={cn('flex flex-wrap items-center gap-1.5', filaEnRojo('telefono'))}>
                <span className={cn('mr-0.5 text-[11.5px]', rotuloEnRojo('telefono'))}>Teléfono contacto</span>
                <div role="radiogroup" aria-label="Teléfono del contacto" className="contents">
                  {cargados.map(t => {
                    const on = telefono === t.numero
                    return (
                      <button key={t.numero} type="button" role="radio" aria-checked={on} title={t.numero}
                        onClick={() => setTelefono(on ? null : t.numero)} className={pastilla(on)}>
                        <span className="truncate">{t.etiqueta === t.numero ? t.numero : `${t.etiqueta} · ${t.numero}`}</span>
                      </button>
                    )
                  })}
                  {/* El escrito a mano se elige como cualquier otro y se saca con su ✕. Llevó un «+»
                      y tocarlo entero lo sacaba: nacía donde estaba el «+» de escribir, y apretarlo
                      para agregar otro lo borraba (17/10/2026). */}
                  {telefonoNuevo && (
                    <span className={cn(pastilla(telefono === telefonoNuevo), 'pr-1')}>
                      <button type="button" role="radio" aria-checked={telefono === telefonoNuevo}
                        title="Se carga en el perfil al registrar"
                        onClick={() => setTelefono(telefono === telefonoNuevo ? null : telefonoNuevo)}
                        className="min-w-0 cursor-pointer truncate tabular-nums">
                        {telefonoNuevo}
                      </button>
                      <button type="button" onClick={sacarTelefonoNuevo} aria-label={`Sacar ${telefonoNuevo}`} title="Sacar"
                        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-(--surface-2)">
                        <X size={12} />
                      </button>
                    </span>
                  )}
                </div>
                {!telefonoNuevo && (escribiendoTelefono ? (
                  <input autoFocus value={telefonoEscrito} onChange={e => setTelefonoEscrito(e.target.value)} onBlur={agregarTelefono}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); agregarTelefono() }
                      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTelefonoEscrito(''); setEscribiendoTelefono(false) }
                    }}
                    type="tel" inputMode="tel" aria-label="Escribir el número, si no está entre los cargados"
                    placeholder="Escribí el número…"
                    className="h-7 min-w-[150px] flex-1 rounded-md bg-card px-2.5 text-[12.5px] text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]" />
                ) : (
                  <button type="button" onClick={() => setEscribiendoTelefono(true)} className={botonEscribir}
                    title="Escribir otro número" aria-label="Escribir otro número">
                    <Icon icon={Plus} size="xs" />
                  </button>
                ))}
              </div>
            )}
            {/* Si es decisor queda en la llamada y, desde el 12/10/2026, también en el contacto (al
                lado del rol en el perfil): se pregunta solo mientras el perfil no lo sepa. Aparece
                debajo de con quién, recién cuando se eligió, y hay que contestarla: sin respuesta
                no se registra. Contestar «Sí» con un solo contacto elegido lo marca en el perfil. */}
            {pideDecisor && (
              <div role="radiogroup" aria-label="¿Es decisor?" className={cn('flex flex-wrap items-center gap-1.5', filaEnRojo('decisor'))}>
                <span className={cn('mr-0.5 text-[11.5px]', rotuloEnRojo('decisor'))}>¿Es decisor?</span>
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
            {tipo === 'reunion' && (
              <div className={cn('flex flex-wrap items-center gap-1.5', filaEnRojo('mail'))}>
                <label htmlFor="mail-demo" className={cn('mr-0.5 text-[11.5px]', rotuloEnRojo('mail'))}>Mail para la invitación</label>
                <input id="mail-demo" type="email" required value={mailDemo} onChange={e => setMailDemo(e.target.value)}
                  placeholder="email@inmobiliaria.com" aria-invalid={!!mailDemo.trim() && !mailValido}
                  className={cn('h-7 min-w-[220px] flex-1 rounded-md bg-card px-2.5 text-[12.5px] text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]',
                    !!mailDemo.trim() && !mailValido && '[border-color:var(--danger)]')} />
                {!!mailDemo.trim() && !mailValido && <span role="alert" className="text-[11.5px] font-semibold text-(--danger)">No es un mail válido</span>}
              </div>
            )}
            {tipo === 'reunion' && (
              <div className={cn(filaEnRojo('fecha'))}>
                <CamposDeReunion value={reunion} onChange={setReunion} />
              </div>
            )}
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar() } }}
              rows={tipo === 'reunion' ? 2 : 6}
              aria-label="Registrar actividad"
              placeholder={tipo === 'llamada' ? 'Qué se habló (opcional)…'
                : tipo === 'fallido' ? 'Detalle (opcional): no atendió, buzón, número equivocado…'
                : tipo === 'nota' ? 'Escribí qué pasó o qué querés registrar…'
                : 'Qué quiere ver en la demo, dudas… (opcional)'}
              aria-invalid={enRojo('texto')}
              className={cn('block max-h-[50vh] min-h-9 w-full resize-y rounded-md bg-card px-3 py-2 text-[13.5px] leading-5 text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]',
                enRojo('texto') && '[border-color:var(--danger)] bg-(--danger-soft)')}
            />
            {pideDecisorApuntado && (
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor="decisor-apuntado" className="mr-0.5 text-[11.5px] text-(--fg-muted)">Decisor</label>
                <input id="decisor-apuntado" value={decisorApuntado} onChange={e => setDecisorApuntado(e.target.value)}
                  placeholder="Nombre de quien decide, si te lo dijeron (opcional)"
                  title="Se carga en el perfil como decisor al registrar"
                  className="h-7 min-w-[220px] flex-1 rounded-md bg-card px-2.5 text-[12.5px] text-foreground outline-none [border:1px_solid_var(--line)] focus:[border-color:var(--line-strong)] placeholder:text-(--fg-faint) max-md:text-[16px]" />
              </div>
            )}
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
                    <OpcionesDeEtapa etapas={opcionesEtapa} />
                  </SelectContent>
                </Select>
                {faltaEtapa
                  ? <span role="alert" className="text-[11.5px] font-semibold text-(--danger)">Elegí en qué etapa queda antes de registrar</span>
                  : <span className="text-[11.5px] text-(--fg-muted)">Hoy está en «{actual?.label ?? 'sin etapa'}»</span>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
              {intento && Object.values(falta).some(Boolean) && (
                <span role="alert" className="self-center text-[11.5px] font-semibold text-(--danger)">Completá lo marcado en rojo</span>
              )}
              <Button onClick={enviar} disabled={enviando}>
                {enviando ? 'Registrando…' : 'Registrar'}
              </Button>
            </div>
          </div>
        </VentanaFlotante>
      )}
      {descartando && descartada && (
        <DescartarLeadDialog leadId={lead.id} etapa={descartada} onClose={() => setDescartando(false)} />
      )}
      {editandoActividad && (
        <EditarActividad key={editandoActividad.id} item={editandoActividad} onCerrar={() => setEditandoActividad(null)}
          onGuardar={description => editarActividad.mutate({ id: editandoActividad.id, description })} />
      )}
    </div>
  )
}
