import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Building2, Check, ChevronDown, ChevronUp, Copy, Mail, NotebookPen, Pencil, Phone, Pin, TriangleAlert, User, UserPlus, X } from 'lucide-react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useLeadDetalle } from '../hooks/useLeadDetalle'
import { useActualizarCliente, useActualizarLead } from '../hooks/useLeadMutaciones'
import {
  contactosConDecisor, copiasDelTelefonoDeIdealista, esTelefonoDeIdealista, esTelefonoDeOficina, ETIQUETA_OFICINA, inicialesDe,
 nombreDelLead, telefonosDelCliente, type CampoDecisor, type ClientData } from '../lib/clientData'
import { toIsoDate } from '@/lib/calendarDate'
import { decisorContactado } from '../lib/actividad'
import { etapaDelLead } from '../lib/effectiveStage'
import { ORIGENES_DE_TELEFONO, valorDeOpcion } from '../lib/inmobiliaria'
import { fmtFechaCompleta } from '../lib/motivosDescarte'
import type { ClientePatch } from '../service/crm.service'
import type { CrmLeadRow } from '../types'
import { ActividadLead, PestanasDelLead, type PestanaDelLead } from './ActividadLead'
import { DescartarLeadDialog } from './DescartarLeadDialog'
import type { ClienteExtra } from './ClientFields'
import { StageBadge } from './leadCells'
import { LeadRowActions } from './LeadRowActions'
import { BotonMensajes } from './MensajesPredeterminados'
import { TareasDelLead } from './TareasDelLead'

/* El rol (texto libre) y las notas de cada contacto. Columnas pendientes de migración: se guardan
   de a una, como los datos de la inmobiliaria, para que su falta no arrastre a otro campo. */
type DatosDeContacto = {
  contact_role: string; contact_notes: string
  alternative_phone_1_role: string; alternative_phone_1_notes: string
  alternative_phone_2_role: string; alternative_phone_2_notes: string
  // De dónde salió cada teléfono (lo trae la importación). '' es «no se sabe».
  phone_source: string; alternative_phone_1_source: string; alternative_phone_2_source: string
  // El email de cada alternativo (el principal usa `email`). Columnas pendientes de migración.
  alternative_phone_1_email: string; alternative_phone_2_email: string
}
type Borrador = ClientData & ClienteExtra & DatosDeContacto
const borradorDe = (l: CrmLeadRow): Borrador => ({
  company_name: l.client?.company_name ?? '', first_name: l.client?.first_name ?? '', last_name: l.client?.last_name ?? '',
  phone: l.client?.phone ?? '', email: l.client?.email ?? '',
  alternative_phone_1: l.client?.alternative_phone_1 ?? '', alternative_phone_1_note: l.client?.alternative_phone_1_note ?? '',
  alternative_phone_2: l.client?.alternative_phone_2 ?? '', alternative_phone_2_note: l.client?.alternative_phone_2_note ?? '',
  notes: l.client?.notes ?? '',
  contact_role: l.client?.contact_role ?? '', contact_notes: l.client?.contact_notes ?? '',
  alternative_phone_1_role: l.client?.alternative_phone_1_role ?? '', alternative_phone_1_notes: l.client?.alternative_phone_1_notes ?? '',
  alternative_phone_2_role: l.client?.alternative_phone_2_role ?? '', alternative_phone_2_notes: l.client?.alternative_phone_2_notes ?? '',
  phone_source: l.client?.phone_source ?? '',
  alternative_phone_1_source: l.client?.alternative_phone_1_source ?? '',
  alternative_phone_2_source: l.client?.alternative_phone_2_source ?? '',
  alternative_phone_1_email: l.client?.alternative_phone_1_email ?? '',
  alternative_phone_2_email: l.client?.alternative_phone_2_email ?? '',
})

/* Las otras personas de la inmobiliaria son los dos teléfonos alternativos. No hay tabla de
   contactos; dos casilleros fijos del cliente. `nombre` es la vieja «nota» del teléfono, que antes
   decía nombre y rol juntos: las filas viejas siguen ahí con los dos hasta que alguien las separe. */
const OTRAS_PERSONAS = [
  { telefono: 'alternative_phone_1', nombre: 'alternative_phone_1_note', rol: 'alternative_phone_1_role', notas: 'alternative_phone_1_notes', origen: 'alternative_phone_1_source', email: 'alternative_phone_1_email' },
  { telefono: 'alternative_phone_2', nombre: 'alternative_phone_2_note', rol: 'alternative_phone_2_role', notas: 'alternative_phone_2_notes', origen: 'alternative_phone_2_source', email: 'alternative_phone_2_email' },
] as const

/* Un contacto es el principal o uno de los dos casilleros alternativos, por su columna de teléfono. */
type Contacto = 'principal' | (typeof OTRAS_PERSONAS)[number]['telefono']
const CONTACTOS: readonly Contacto[] = ['principal', ...OTRAS_PERSONAS.map(p => p.telefono)]
/* Sin nada guardado, el principal va fijado: es a quien se llama primero. */
const FIJADOS_DE_FABRICA: Contacto[] = ['principal']
const claveFijados = (clientId: string) => `crm-contactos-fijados:${clientId}`

/* localStorage puede no estar (ventana privada, sitio bloqueado): sin él se usa el de fábrica. */
function leerFijados(clientId: string | undefined): Contacto[] {
  if (!clientId) return FIJADOS_DE_FABRICA
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(claveFijados(clientId)) ?? 'null')
    if (!Array.isArray(guardado)) return FIJADOS_DE_FABRICA
    return guardado.filter((c): c is Contacto => CONTACTOS.includes(c))
  } catch { return FIJADOS_DE_FABRICA }
}
function guardarFijados(clientId: string | undefined, fijados: Contacto[]) {
  if (!clientId) return
  try { localStorage.setItem(claveFijados(clientId), JSON.stringify(fijados)) } catch { /* queda en memoria */ }
}

/* Los teléfonos y emails sueltos de la pestaña de la inmobiliaria también se fijan (17/10/2026, por
   pedido): fijado, se ve en el perfil. Misma regla que los contactos: preferencia del navegador.
   La clave es `tel:<dígitos>` o `mail:<email>`, para que un cambio de formato no lo desfije. */
type DatoSuelto = { clave: string; valor: string; google?: boolean }
const claveDatosFijados = (clientId: string) => `crm-datos-fijados:${clientId}`
/** `null` si este navegador nunca fijó nada para el cliente: quien llama pone el de fábrica. */
function leerDatosFijados(clientId: string | undefined): string[] | null {
  if (!clientId) return null
  try {
    const guardado: unknown = JSON.parse(localStorage.getItem(claveDatosFijados(clientId)) ?? 'null')
    return Array.isArray(guardado) ? guardado.filter((c): c is string => typeof c === 'string') : null
  } catch { return null }
}
function guardarDatosFijados(clientId: string | undefined, fijados: string[]) {
  if (!clientId) return
  try { localStorage.setItem(claveDatosFijados(clientId), JSON.stringify(fijados)) } catch { /* queda en memoria */ }
}

/* Copia el número con un clic, para pegarlo en el marcador (17/10/2026, por pedido). */
function BotonCopiar({ texto }: { texto: string }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Teléfono copiado')
    } catch { toast.error('No se pudo copiar') }
  }
  return (
    <button type="button" onClick={copiar} aria-label={`Copiar ${texto}`} title="Copiar"
      className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) hover:bg-(--surface-2) hover:text-foreground">
      <Copy size={13} />
    </button>
  )
}

type OrigenDeTelefonoCampo ='phone_source' | (typeof OTRAS_PERSONAS)[number]['origen']
const SIN_ORIGEN = '__sin_origen__'

/* Las columnas de cada contacto, para dibujar la fila y la ventanita de edición con un solo mapa.
   Cada uno tiene su email: el principal en `email`, los alternativos en `alternative_phone_N_email`
   (17/10/2026, por pedido). */
type CamposDeContacto = {
  nombres: readonly { campo: keyof Borrador; label: string }[]
  telefono: 'phone' | 'alternative_phone_1' | 'alternative_phone_2'
  origen: OrigenDeTelefonoCampo
  email: 'email' | (typeof OTRAS_PERSONAS)[number]['email']
  rol: 'contact_role' | `alternative_phone_${1 | 2}_role`
  notas: 'contact_notes' | `alternative_phone_${1 | 2}_notes`
  decisor: CampoDecisor
}
function camposDe(c: Contacto): CamposDeContacto {
  if (c === 'principal') return {
    nombres: [{ campo: 'first_name', label: 'Nombre' }, { campo: 'last_name', label: 'Apellido' }],
    telefono: 'phone', origen: 'phone_source', email: 'email', rol: 'contact_role', notas: 'contact_notes',
    decisor: 'contact_is_decision_maker',
  }
  const p = OTRAS_PERSONAS[c === 'alternative_phone_1' ? 0 : 1]
  return {
    nombres: [{ campo: p.nombre, label: 'Nombre' }], telefono: p.telefono, origen: p.origen, email: p.email, rol: p.rol, notas: p.notas,
    decisor: `${p.telefono}_is_decision_maker`,
  }
}
const columnasDe = (f: CamposDeContacto): (keyof Borrador)[] =>
  [...f.nombres.map(n => n.campo), f.telefono, f.origen, f.email, f.rol, f.notas]

const LISTA_CONTACTOS = 'flex flex-col divide-y divide-(--line-soft) rounded-md [border:1px_solid_var(--line-soft)]'

const FLECHA = 'flex size-9 cursor-pointer items-center justify-center rounded-lg bg-card text-foreground transition-colors [border:1px_solid_var(--line-strong)] hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35'

const ROTULO = 'text-[10.5px] font-bold uppercase leading-none tracking-[0.08em] text-(--fg-muted)'

function Seccion({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg bg-card p-3 shadow-xs [border:1px_solid_var(--line)]', className)}>
      {titulo && <h3 className={cn(ROTULO, 'mb-2')}>{titulo}</h3>}
      {children}
    </section>
  )
}

/* El campo se ve como texto hasta que se lo toca: una ficha de doce inputs con marco se lee como
   un formulario, y acá se viene a leer el lead. El marco aparece al pasar y al escribir. */
const CAMPO = 'h-8 w-full border-transparent bg-transparent px-2 text-right text-[13px] shadow-none hover:border-input focus-visible:border-ring md:text-[13px] placeholder:text-(--fg-faint)'
/* PhoneInput no acepta className: se apaga su marco desde afuera con la misma regla. */
const TELEFONO = cn(
  'w-full [&_.h-9]:h-8 [&_.shadow-xs]:shadow-none',
  '[&_.border-input]:border-transparent [&:hover_.border-input]:border-input [&:focus-within_.border-input]:border-input',
  '[&_button]:border-transparent [&:hover_button]:border-input [&:focus-within_button]:border-input',
)

/* El contenido del dialog, montado por lead (key = id): cambiar de lead con las flechas arranca
   de cero el borrador, igual que cerrar y abrir. Va el encabezado también, porque sus flechas
   y el menú de acciones operan sobre este lead. */
function CuerpoDelLead({ lead, indice, total, hayAnterior, haySiguiente, pestana, setPestana, onPaso, onStartReassign }: {
  lead: CrmLeadRow
  indice: number
  total: number
  hayAnterior: boolean
  haySiguiente: boolean
  pestana: PestanaDelLead
  setPestana: (p: PestanaDelLead) => void
  onPaso: (delta: -1 | 1) => void
  onStartReassign?: (leadId: string) => void
}) {
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const { puedeEscribir } = useCarteras()
  const detalleQ = useLeadDetalle(lead.id)
  const decisor = detalleQ.data ? decisorContactado(detalleQ.data.comments) : null
  /* Descartado se ofrece, pero elegirlo abre el diálogo del motivo en vez de mover el lead (cancelar
     lo deja donde estaba: el select es controlado). Las otras fuera del funnel no se eligen; si el
     lead YA está en una, o en una etapa que se borró, esa opción tiene que estar: si no, el select
     queda en blanco y parece que el lead no tiene etapa. */
  const [descartandoLead, setDescartandoLead] = useState(false)
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  const opcionesEtapa = etapasActivas.filter(e =>
    !e.is_out_of_funnel || e.id === lead.funnel_stage_id || e.id === descartada?.id)
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  const actualizarLead = useActualizarLead()
  const actualizarCliente = useActualizarCliente()
  const escribe = puedeEscribir(lead.assigned_to)

  const [creandoTarea, setCreandoTarea] = useState(false)
  const [editandoNotas, setEditandoNotas] = useState(false)

  // Borrador local: se escribe acá y se guarda campo por campo al salir. Si llega un cambio de
  // otro por realtime mientras no estoy escribiendo, se toma.
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(lead))
  const editando = useRef(false)
  useEffect(() => { if (!editando.current) setBorrador(borradorDe(lead)) }, [lead])

  const cambiar = (patch: Partial<Borrador>) => { editando.current = true; setBorrador(b => ({ ...b, ...patch })) }
  const guardar = (campo: keyof Borrador) => {
    editando.current = false
    if (!lead.client) return
    const valor = borrador[campo].trim()
    // El contenedor del teléfono dispara onBlur aunque el foco se mueva adentro del mismo campo:
    // si lo escrito ya es lo guardado, no hay nada que mandar.
    const guardado = (lead.client[campo] ?? '').trim()
    if (valor === guardado) return
    actualizarCliente.mutate({ clientId: lead.client.id, patch: { [campo]: valor || null } as ClientePatch })
  }

  /* Un contacto —el principal incluido— se dibuja si tiene algo cargado o si se lo acaba de
     agregar: un casillero vacío no se muestra, se ofrece «Agregar contacto». El principal vacío
     estuvo dibujándose fijado en el perfil, una ficha en blanco arriba de todo; se sacó por pedido. */
  const [agregadas, setAgregadas] = useState<Contacto[]>([])
  const principalCargado = ([
    'first_name', 'last_name', 'phone', 'email', 'contact_role', 'contact_notes', 'phone_source',
  ] as const).some(c => borrador[c].trim())
  const cargada = (i: number) => {
    const p = OTRAS_PERSONAS[i]
    return [p.telefono, p.nombre, p.rol, p.notas, p.origen, p.email].some(c => borrador[c].trim())
  }
  const visibles = OTRAS_PERSONAS.map((_, i) => i).filter(i => cargada(i) || agregadas.includes(OTRAS_PERSONAS[i].telefono))
  /* El principal también se quita (17/10/2026, por pedido): «Agregar contacto» llena primero ese
     casillero, y sin esto el contacto recién creado no tenía cómo borrarse. Su `email` se queda:
     es el de la inmobiliaria (la demo y «Emails» lo leen), y con solo el email ya no se dibuja
     como persona (`esSoloEmail`). */
  const quitarPersona = (c: Contacto) => {
    const f = camposDe(c)
    const viejas = [...f.nombres.map(n => n.campo), f.telefono]
    const nuevas = [f.rol, f.notas, f.origen, ...(c === 'principal' ? [] : [f.email])]
    editando.current = false
    setBorrador(b => ({ ...b, ...Object.fromEntries([...viejas, ...nuevas].map(col => [col, ''])) }))
    setAgregadas(a => a.filter(x => x !== c))
    if (fijados.includes(c)) alternarFijado(c)
    const client = lead.client
    if (!client) return
    if (viejas.some(col => client[col])) {
      actualizarCliente.mutate({ clientId: client.id, patch: Object.fromEntries(viejas.map(col => [col, null])) as ClientePatch })
    }
    // Las columnas nuevas, aparte y solo si tienen algo: sin la migración, mandarlas haría fallar
    // también el borrado del teléfono.
    for (const col of nuevas) {
      if (client[col]) actualizarCliente.mutate({ clientId: client.id, patch: { [col]: null } as ClientePatch })
    }
    // El decisor es un booleano: `false` también es algo guardado que hay que borrar.
    if (client[f.decisor] != null) actualizarCliente.mutate({ clientId: client.id, patch: { [f.decisor]: null } })
  }

  /* Los fijados se ven también en el perfil; todos, en la pestaña de la inmobiliaria. Fijar es una
     preferencia de cada navegador, como el plegado del backlog: no toca la base. */
  const [fijados, setFijados] = useState<Contacto[]>(() => leerFijados(lead.client?.id))
  const alternarFijado = (c: Contacto) => {
    const nuevos = fijados.includes(c) ? fijados.filter(x => x !== c) : [...fijados, c]
    setFijados(nuevos)
    guardarFijados(lead.client?.id, nuevos)
  }
  // Funcional: la llamada fija al decisor desde el onSuccess de una mutación, con un `fijados` viejo.
  const fijar = (...cs: Contacto[]) => setFijados(prev => {
    const faltan = cs.filter(c => !prev.includes(c))
    if (faltan.length === 0) return prev
    const nuevos = [...prev, ...faltan]
    guardarFijados(lead.client?.id, nuevos)
    return nuevos
  })
  /* Una llamada con el decisor lo fija en el perfil (17/10/2026, por pedido): reemplazó al cartel
     «Decisor contactado», que decía lo mismo que la etiqueta «Decisor» del contacto. */
  const fijarDecisores = (campos: CampoDecisor[]) =>
    fijar(...CONTACTOS.filter(c => campos.includes(camposDe(c).decisor)))
  const contactos: Contacto[] = [
    ...(principalCargado || agregadas.includes('principal') ? ['principal' as const] : []),
    ...visibles.map(i => OTRAS_PERSONAS[i].telefono),
  ]
  /* El de Google Maps sin nombre es la oficina, no una persona: no se dibuja como contacto. Sigue
     contando en `contactos` para que «Agregar contacto» no elija su casillero. */
  const esOficina = (c: Contacto) => {
    const f = camposDe(c)
    return !f.nombres.some(n => (lead.client?.[n.campo] ?? '').trim())
      && esTelefonoDeOficina(lead.client?.[f.telefono], lead.client)
  }
  /* Un contacto con solo el email cargado no es una persona (17/10/2026, por pedido): se ve en
     «Emails» y nada más. Con un nombre, teléfono, rol, notas o decisor vuelve a ser alguien. */
  const esSoloEmail = (c: Contacto) => {
    const f = camposDe(c)
    const cargado = (campo: keyof Borrador) => !!(lead.client?.[campo] ?? '').trim()
    return cargado(f.email) && (lead.client?.[f.decisor] ?? null) === null
      && ![...f.nombres.map(n => n.campo), f.telefono, f.rol, f.notas].some(cargado)
  }
  const personas = contactos.filter(c => !esOficina(c) && !esSoloEmail(c))
  const arriba = personas.filter(c => fijados.includes(c))

  /* Teléfonos y emails sueltos (pestaña de la inmobiliaria). Sin nada guardado, el de Google Maps
     nace fijado: es el número de la agencia y casi siempre a quien se llama primero. */
  const digitosDe = (t: string) => t.replace(/\D/g, '')
  const telefonosSueltos: DatoSuelto[] = telefonosDelCliente(lead.client).map(t => ({
    clave: `tel:${digitosDe(t.numero)}`, valor: t.numero, google: t.etiqueta === ETIQUETA_OFICINA,
  }))
  // Los de todas las personas, sin repetir.
  const emailsSueltos: DatoSuelto[] = [...new Set(
    [lead.client?.email, lead.client?.alternative_phone_1_email, lead.client?.alternative_phone_2_email]
      .map(e => e?.trim() ?? '').filter(Boolean),
  )].map(e => ({ clave: `mail:${e.toLowerCase()}`, valor: e }))
  const [datosFijados, setDatosFijados] = useState<string[]>(() => {
    const guardados = leerDatosFijados(lead.client?.id)
    if (guardados) return guardados
    const google = lead.client?.google_maps_phone?.trim()
    return google ? [`tel:${digitosDe(google)}`] : []
  })
  const alternarDato = (clave: string) => {
    const nuevos = datosFijados.includes(clave) ? datosFijados.filter(x => x !== clave) : [...datosFijados, clave]
    setDatosFijados(nuevos)
    guardarDatosFijados(lead.client?.id, nuevos)
  }
  const datosArriba = [...telefonosSueltos, ...emailsSueltos].filter(d => datosFijados.includes(d.clave))
  // El próximo que se agrega: el principal primero, después los alternativos en orden.
  const libre = CONTACTOS.find(c => !contactos.includes(c))
  /* El contacto abierto en la ventanita de edición. Agregar uno lo abre ahí: la fila no dibuja
     campos vacíos, así que un contacto recién nacido no tendría dónde escribirse. */
  const [contactoEnEditor, setContactoEnEditor] = useState<Contacto | null>(null)
  const agregar = (c: Contacto, fijado: boolean) => {
    setAgregadas(a => [...a, c])
    if (fijado) fijar(c)
    setContactoEnEditor(c)
  }
  /* Escape cierra con el foco todavía en un campo y el blur no llega a correr: se lo fuerza antes,
     para que se guarde. Con la cruz el foco ya salió y esto no hace nada. */
  const cerrarEditor = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setContactoEnEditor(null)
  }
  // Lo guardado y no el borrador: borrar un campo en la fila no lo esconde mientras se escribe.
  const hay = (campo: keyof Borrador) => !!(lead.client?.[campo] ?? '').trim()

  /* El teléfono de Google Maps entra solo como contacto, fijado en el perfil: es el número de la
     agencia en su ficha de Google, y casi siempre es a quien se llama primero. Una vez por apertura
     y solo con permiso de escritura; dónde va (y si va) lo decide `casilleroParaTelefonoDeGoogle`,
     que nunca pisa a nadie. El de Idealista NO entra como contacto (12/10/2026, por pedido): vive
     en «Datos de la inmobiliaria». Los que ya se habían copiado a un alternativo se quitan al abrir
     (`copiasDelTelefonoDeIdealista`), salvo que alguien ya le haya cargado rol, notas o decisor. */
  /* Desde el 17/10/2026 (por pedido) el de Google Maps ya NO se copia a un contacto: la oficina no
     es una persona. Vive en «Teléfonos» de la pestaña de la inmobiliaria y nace fijado ahí (ver
     `datosFijados`). Los que ya se habían copiado siguen en su casillero pero no se dibujan como
     contacto (`esOficina`). */
  const telefonosCargados = useRef(false)
  useEffect(() => {
    const client = lead.client
    if (telefonosCargados.current || !escribe || !client) return
    telefonosCargados.current = true
    for (const i of copiasDelTelefonoDeIdealista(client)) quitarPersona(OTRAS_PERSONAS[i].telefono)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por lead: el cuerpo va con key = lead
  }, [lead.client, escribe])

  const campoPersona = (campo: keyof Borrador, label: string, placeholder: string, extra?: string, type = 'text') => (
    <Input className={cn(CAMPO, 'text-left', extra)} type={type} aria-label={label} placeholder={placeholder} value={borrador[campo]}
      disabled={!escribe} onChange={e => cambiar({ [campo]: e.target.value })} onBlur={() => guardar(campo)} />
  )
  /* PhoneInput no tiene onBlur propio: se escucha en el contenedor (el blur burbujea como focusout).
     Tampoco tiene `disabled`: el fieldset deshabilita de una los controles de adentro. */
  const telefonoPersona = (campo: 'phone' | 'alternative_phone_1' | 'alternative_phone_2') => (
    <fieldset disabled={!escribe} className={cn('m-0 min-w-0 border-0 p-0', TELEFONO)} onBlur={() => guardar(campo)}>
      <PhoneInput value={borrador[campo]} onChange={v => cambiar({ [campo]: v })} />
    </fieldset>
  )

  /* De dónde salió el teléfono, al lado del número. Se guarda al elegir, solo (es una columna
     pendiente de migración). Vacío muestra «Origen»; «Sin origen» lo borra: Radix no deja un
     ítem con valor vacío, de ahí la marca. */
  const elegirOrigen = (campo: OrigenDeTelefonoCampo, elegido: string) => {
    const valor = valorDeOpcion(ORIGENES_DE_TELEFONO, elegido === SIN_ORIGEN ? null : elegido)
    setBorrador(b => ({ ...b, [campo]: valor ?? '' }))
    const client = lead.client
    if (!client || valor === (client[campo] ?? null)) return
    actualizarCliente.mutate({ clientId: client.id, patch: { [campo]: valor } as ClientePatch })
  }
  const origenTelefono = (campo: OrigenDeTelefonoCampo) => (
    <Select value={borrador[campo]} disabled={!escribe} onValueChange={v => elegirOrigen(campo, v)}>
      <SelectTrigger size="sm" aria-label="De dónde salió el teléfono" title="De dónde salió el teléfono"
        className="w-[124px] shrink-0 border-transparent px-2 text-[12px] text-(--fg-2) shadow-none hover:border-input">
        <SelectValue placeholder="Origen" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={SIN_ORIGEN} className="text-(--fg-muted)">Sin origen</SelectItem>
        {ORIGENES_DE_TELEFONO.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
      </SelectContent>
    </Select>
  )

  /* Las notas de un contacto crecen con lo escrito (`field-sizing-content` del Textarea) desde un
     renglón: vacías no ocupan más que un campo. */
  /* Si el contacto decide en la inmobiliaria, al lado del rol. Se guarda al elegir, solo (columna
     pendiente de migración). Lo completa también la llamada al contestar «Sí»; mientras esté vacío,
     la llamada lo pregunta. Tocar la opción marcada la apaga: vuelve a «no se sabe». */
  const decisorPersona = (campo: CampoDecisor) => {
    const valor = lead.client?.[campo] ?? null
    return (
      <div role="radiogroup" aria-label="¿Es decisor?" className="flex shrink-0 items-center gap-1">
        <span className="text-[11.5px] text-(--fg-muted)">Decisor</span>
        {([[true, 'Sí'], [false, 'No']] as const).map(([v, label]) => {
          const on = valor === v
          return (
            <button key={label} type="button" role="radio" aria-checked={on} disabled={!escribe}
              onClick={() => elegirDecisor(campo, on ? null : v)}
              className={cn(
                'inline-flex h-6 cursor-pointer items-center rounded-full px-2 text-[11.5px] transition-colors disabled:cursor-default',
                on ? 'font-semibold text-(--brand-soft-fg) bg-(--brand-soft) [border:1px_solid_var(--brand-100)]'
                  : 'text-(--fg-2) bg-card [border:1px_solid_var(--line)] hover:bg-(--surface-2)',
              )}>
              {label}
            </button>
          )
        })}
      </div>
    )
  }
  const elegirDecisor = (campo: CampoDecisor, valor: boolean | null) => {
    const client = lead.client
    if (!client || valor === (client[campo] ?? null)) return
    actualizarCliente.mutate({ clientId: client.id, patch: { [campo]: valor } })
  }
  const decisorDe = (campo: CampoDecisor) => lead.client?.[campo] ?? null
  const notasPersona = (campo: 'contact_notes' | `alternative_phone_${1 | 2}_notes`) => (
    <div className="flex items-start gap-1">
      <Icon icon={NotebookPen} size="sm" className="mt-2 ml-1 text-(--fg-faint)" />
      <Textarea rows={1} aria-label="Notas del contacto" placeholder="Notas del contacto…" value={borrador[campo]}
        disabled={!escribe} onChange={e => cambiar({ [campo]: e.target.value })} onBlur={() => guardar(campo)}
        className={cn(CAMPO, 'h-auto min-h-8 resize-none py-1.5 text-left leading-snug')} />
    </div>
  )

  const botonFijar = (c: Contacto) => botonPin(fijados.includes(c), () => alternarFijado(c))
  const botonPin = (fijo: boolean, onClick: () => void) => {
    return (
      <button type="button" onClick={onClick} aria-pressed={fijo}
        aria-label={fijo ? 'Desfijar contacto' : 'Fijar arriba'} title={fijo ? 'Desfijar' : 'Fijar arriba'}
        className={cn('flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-(--surface-2)',
          fijo ? 'text-foreground' : 'text-(--fg-faint) hover:text-foreground')}>
        <Pin size={14} className={cn(fijo && 'fill-current')} />
      </button>
    )
  }

  /* El contacto fijado en el perfil, de solo lectura y en dos renglones (17/10/2026, por pedido):
     «Pedro / Director» con una etiqueta «Decisor» o «No decisor» (no los botones Sí/No, que se leían
     como un campo para elegir), y abajo el teléfono y el email. Se edita desde el lápiz; el detalle
     completo vive en «Personas», en la pestaña de la inmobiliaria. */
  const filaCompacta = (c: Contacto, f: CamposDeContacto) => {
    const valor = (campo: keyof Borrador) => (lead.client?.[campo] ?? '').trim()
    const nombre = f.nombres.map(n => valor(n.campo)).filter(Boolean).join(' ')
    const rol = valor(f.rol)
    const decide = decisorDe(f.decisor)
    const telefono = valor(f.telefono)
    const email = valor(f.email)
    /* «Contactado» (17/10/2026, por pedido): esta persona estuvo en la llamada con el decisor que da
       por contactado al lead. La llamada guarda con quién por nombre, el mismo que arma
       `contactosConDecisor`, así que se lo busca por ahí y no por el nombre que se ve acá. */
    const comoSeLlama = contactosConDecisor(lead.client).find(p => p.campoDecisor === f.decisor)?.nombre
    const contactado = !!decisor && !!comoSeLlama && decisor.con.includes(comoSeLlama)
    return (
      <li key={c} className="flex items-center gap-1 p-1.5">
        <Icon icon={User} size="sm" className="ml-1 shrink-0 text-(--fg-faint)" />
        <div className="min-w-0 flex-1 px-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
              {nombre || <span className="text-(--fg-faint)">Sin nombre</span>}
              {rol && <span className="font-normal text-(--fg-muted)"> / {rol}</span>}
            </span>
            {decide !== null && (
              <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold',
                decide ? 'bg-(--brand-soft) text-(--brand-soft-fg)' : 'bg-(--surface-2) text-(--fg-muted)')}>
                {decide ? 'Decisor' : 'No decisor'}
              </span>
            )}
            {contactado && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-(--success-soft) px-1.5 py-px text-[10.5px] font-semibold text-(--success)"
                title={`Contactado el ${fmtFechaCompleta(toIsoDate(new Date(decisor.fecha)))}`}>
                <Check size={10} strokeWidth={3} aria-hidden />Contactado
              </span>
            )}
          </div>
          {/* El teléfono y el email del contacto, los que tenga cargados (17/10/2026, por pedido: el
              email se había sacado ese mismo día y volvió). Cada uno con su botón de copiar. */}
          {(telefono || email) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-(--fg-2)">
              {telefono && (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <Phone size={11} aria-hidden className="text-(--fg-faint)" />
                  <span className="tabular-nums">{telefono}</span><BotonCopiar texto={telefono} />
                </span>
              )}
              {email && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Mail size={11} aria-hidden className="shrink-0 text-(--fg-faint)" />
                  <span className="min-w-0 truncate">{email}</span><BotonCopiar texto={email} />
                </span>
              )}
            </div>
          )}
          {esTelefonoDeIdealista(lead.client?.[f.telefono], lead.client) && (
            <p className="flex items-center gap-1 text-[11px] text-warning">
              <TriangleAlert size={11} aria-hidden className="shrink-0" />Redirector de Idealista: último recurso
            </p>
          )}
        </div>
        {escribe && (
          <button type="button" onClick={() => setContactoEnEditor(c)} aria-label="Editar contacto" title="Editar contacto"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) hover:bg-(--surface-2) hover:text-foreground">
            <Pencil size={14} />
          </button>
        )}
        {botonFijar(c)}
        {escribe && (
          <button type="button" onClick={() => quitarPersona(c)} aria-label="Quitar persona" title="Quitar persona"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) hover:bg-(--surface-2) hover:text-foreground">
            <X size={14} />
          </button>
        )}
      </li>
    )
  }

  /* La fila dibuja solo lo que el contacto tiene cargado (se sigue editando en el lugar). Lo que
     falta no se dibuja vacío: se completa desde el lápiz, que aparece mientras falte algo y abre
     el contacto entero en una ventanita. */
  /* Las personas se ven compactas en los dos lados, perfil e inmobiliaria (17/10/2026, por pedido):
     solo lo cargado, como el contacto fijado; lo vacío se completa desde el lápiz. La fila larga
     queda para el teléfono de la oficina. */
  const filaContacto = (c: Contacto) => {
    const f = camposDe(c)
    const nombres = f.nombres.filter(n => hay(n.campo))
    /* El de Google Maps sin nombre es el teléfono de la oficina, no una persona (16/10/2026, por
       pedido): se rotula así y no pide rol ni decisor. Con un nombre escrito vuelve a ser alguien. */
    const oficina = nombres.length === 0 && esTelefonoDeOficina(lead.client?.[f.telefono], lead.client)
    const falta = oficina
      ? [f.telefono, f.origen, f.notas].some(campo => !hay(campo))
      : columnasDe(f).some(campo => !hay(campo)) || decisorDe(f.decisor) === null
    if (!oficina) return filaCompacta(c, f)
    return (
      <li key={c} className="flex flex-col gap-0.5 p-1.5">
        <div className="flex items-center gap-1">
          <Icon icon={oficina ? Building2 : User} size="sm" className="ml-1 text-(--fg-faint)" />
          {oficina
            ? <span className="min-w-0 flex-1 px-2 text-[13px] font-medium text-foreground">Teléfono oficina</span>
            : nombres.length > 0
            ? <div className={cn('grid min-w-0 flex-1', nombres.length > 1 && 'grid-cols-2')}>
                {nombres.map(n => <Fragment key={n.campo}>{campoPersona(n.campo, n.label, n.label, 'font-medium')}</Fragment>)}
              </div>
            : <span className="min-w-0 flex-1 px-2 text-[13px] text-(--fg-faint)">Sin nombre</span>}
          {c === 'principal' && (
            <span className="shrink-0 rounded-full bg-(--surface-2) px-2 py-0.5 text-[10.5px] font-semibold text-(--fg-muted)">Principal</span>
          )}
          {escribe && falta && (
            <button type="button" onClick={() => setContactoEnEditor(c)} aria-label="Completar contacto" title="Completar contacto"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) hover:bg-(--surface-2) hover:text-foreground">
              <Pencil size={14} />
            </button>
          )}
          {botonFijar(c)}
          {escribe && (
            <button type="button" onClick={() => quitarPersona(c)} aria-label="Quitar persona" title="Quitar persona"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) hover:bg-(--surface-2) hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        {hay(f.telefono) && (
          <div className="flex items-center gap-1">
            <Icon icon={Phone} size="sm" className="ml-1 text-(--fg-faint)" />
            {telefonoPersona(f.telefono)}
            {hay(f.origen) && origenTelefono(f.origen)}
          </div>
        )}
        {/* Escrito y no en un tooltip: llamar por ahí a la agencia le entra como un interesado en un piso. */}
        {esTelefonoDeIdealista(lead.client?.[f.telefono], lead.client) && (
          <p className="mx-1 flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1.5 text-[11.5px] leading-snug text-warning">
            <TriangleAlert size={13} aria-hidden className="mt-px shrink-0" />
            Último recurso: es un redirector de Idealista. Solo si no hay otro teléfono.
          </p>
        )}
        {hay(f.notas) && notasPersona(f.notas)}
      </li>
    )
  }

  /* La ventanita: el contacto entero, con todos sus campos y con marco, porque acá sí se viene a
     escribir. Usa el mismo borrador y el mismo guardado al salir de cada campo que la fila. */
  const campoEditor = (campo: keyof Borrador, label: string, placeholder: string, type = 'text') => (
    <label className="flex flex-col gap-1">
      <span className={ROTULO}>{label}</span>
      <Input type={type} placeholder={placeholder} value={borrador[campo]} className="text-[13px] md:text-[13px]"
        onChange={e => cambiar({ [campo]: e.target.value })} onBlur={() => guardar(campo)} />
    </label>
  )
  const enEditor = contactoEnEditor && camposDe(contactoEnEditor)
  const editorEsOficina = !!enEditor && !enEditor.nombres.some(n => hay(n.campo))
    && esTelefonoDeOficina(lead.client?.[enEditor.telefono], lead.client)
  const editorContacto = (
    <Dialog open={contactoEnEditor != null} onOpenChange={abierto => { if (!abierto) cerrarEditor() }}>
      <DialogContent className="ui-scale gap-3 sm:max-w-md">
        <DialogTitle className="text-[15px]">{contactoEnEditor === 'principal' ? 'Contacto principal' : 'Contacto'}</DialogTitle>
        <DialogDescription className="sr-only">Cada campo se guarda al salir de él.</DialogDescription>
        {enEditor && (
          <>
            <div className={cn('grid gap-2', enEditor.nombres.length > 1 && 'grid-cols-2')}>
              {enEditor.nombres.map(n => <Fragment key={n.campo}>{campoEditor(n.campo, n.label, n.label)}</Fragment>)}
            </div>
            <div className="flex flex-col gap-1">
              <span className={ROTULO}>Teléfono</span>
              <div className="flex items-center gap-1">
                <div className="min-w-0 flex-1" onBlur={() => guardar(enEditor.telefono)}>
                  <PhoneInput value={borrador[enEditor.telefono]} onChange={v => cambiar({ [enEditor.telefono]: v })} />
                </div>
                {origenTelefono(enEditor.origen)}
              </div>
            </div>
            {campoEditor(enEditor.email, 'Email', 'email@inmobiliaria.com', 'email')}
            {!editorEsOficina && (
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">{campoEditor(enEditor.rol, 'Rol', 'Ej.: dueño, gerente comercial')}</div>
                <div className="pb-1.5">{decisorPersona(enEditor.decisor)}</div>
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className={ROTULO}>Notas</span>
              <Textarea rows={2} placeholder="Notas del contacto…" value={borrador[enEditor.notas]}
                onChange={e => cambiar({ [enEditor.notas]: e.target.value })} onBlur={() => guardar(enEditor.notas)}
                className="min-h-14 resize-none text-[13px] md:text-[13px]" />
            </label>
            <DialogClose asChild>
              <button type="button"
                className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 justify-self-end rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background transition-opacity hover:opacity-90">
                <Check size={15} />Listo
              </button>
            </DialogClose>
          </>
        )}
      </DialogContent>
    </Dialog>
  )

  /* Se dibujan acá, con el borrador de acá, y se pasan hechos a la pestaña de la inmobiliaria: un
     segundo borrador de las mismas columnas en la otra pestaña se pisarían entre sí. Acá van TODOS,
     los fijados incluidos (12/10/2026, por pedido): fijar uno lo suma al perfil, no lo saca de acá.
     «Agregar contacto» va con ellos: el nuevo nace sin fijar. */
  const otrosContactos = (
    <div className="flex min-w-0 flex-col">
      {personas.length > 0
        ? <ul className={LISTA_CONTACTOS}>{personas.map(c => filaContacto(c))}</ul>
        : <p className="py-1 text-[12.5px] text-(--fg-muted)">Sin contactos.</p>}
      {escribe && libre && (
        <button type="button" onClick={() => agregar(libre, false)}
          className="mt-1.5 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
          <UserPlus size={14} />Agregar contacto
        </button>
      )}
    </div>
  )

  /* Un teléfono o un email suelto: pelado, con el pin al final. El de Google Maps lleva su rótulo. */
  const filaDato = (d: DatoSuelto, icono: typeof Phone) => (
    <li key={d.clave} className="flex min-w-0 items-center gap-1.5 py-0.5 pl-1">
      <Icon icon={icono} size="sm" className="shrink-0 text-(--fg-faint)" />
      <span className="min-w-0 truncate text-[13px] font-medium tabular-nums text-foreground" title={d.valor}>{d.valor}</span>
      {d.clave.startsWith('tel:') && <BotonCopiar texto={d.valor} />}
      {d.google && <span className="shrink-0 text-[11px] text-(--fg-faint)">Google Maps</span>}
      <span className="flex-1" />
      {botonPin(datosFijados.includes(d.clave), () => alternarDato(d.clave))}
    </li>
  )
  const listaDatos = (datos: DatoSuelto[], icono: typeof Phone, vacio: string) => datos.length > 0
    ? <ul className="flex min-w-0 flex-col">{datos.map(d => filaDato(d, icono))}</ul>
    : <p className="py-1 text-[12.5px] text-(--fg-faint)">{vacio}</p>
  const telefonosNodo = listaDatos(telefonosSueltos, Phone, 'Sin teléfonos')
  const emailsNodo = listaDatos(emailsSueltos, Mail, 'Sin emails')

  return (
    <>
      {/* Tres tramos: navegación a la izquierda, las pestañas al medio y las acciones a la derecha.
          Los dos laterales van con base cero y el mismo crecimiento, que es lo que deja las
          pestañas en el centro del dialog y no en el centro del hueco que sobre. */}
      <header className="ui-scale max-md:[zoom:1] flex shrink-0 items-center gap-x-3 bg-card px-4 py-2.5 [border-bottom:1px_solid_var(--line)] max-md:px-2">
        <div className="flex min-w-0 flex-1 basis-0 items-center gap-3">
          {/* Con marco y del alto de los botones de la derecha: son la forma de recorrer la lista
              sin cerrar el lead, y como flechitas sueltas de 15px no se encontraban. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => onPaso(-1)} disabled={!hayAnterior} aria-label="Lead anterior"
              title={hayAnterior ? 'Lead anterior (↑)' : 'Es el primero de la lista'}
              className={FLECHA}>
              <ChevronUp size={20} strokeWidth={2.25} />
            </button>
            <button type="button" onClick={() => onPaso(1)} disabled={!haySiguiente} aria-label="Lead siguiente"
              title={haySiguiente ? 'Lead siguiente (↓)' : 'Es el último de la lista'}
              className={FLECHA}>
              <ChevronDown size={20} strokeWidth={2.25} />
            </button>
            {indice !== -1 && <span className="ml-1 text-[12.5px] font-semibold tabular-nums text-(--fg-2) max-md:hidden">{indice + 1} de {total}</span>}
          </div>
        </div>
        <PestanasDelLead lead={lead} pestana={pestana} onCambiar={setPestana} />
        <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">
          <LeadRowActions lead={lead} puedeEscribir={escribe} onStartReassign={onStartReassign} />
          {/* Todo se guarda solo al salir de cada campo; este botón es la salida explícita. Al
              apretarlo el campo con foco pierde el foco primero, así que lo que se estaba
              escribiendo se guarda antes de que el dialog se cierre. */}
          <DialogClose asChild>
            <button type="button" title="Guardar y cerrar el lead"
              className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-semibold text-background transition-opacity hover:opacity-90">
              <Check size={15} />
              <span className="max-md:hidden">Guardar y cerrar</span>
            </button>
          </DialogClose>
          {/* La cruz de «cerrar sin guardar» se sacó el 16/10/2026, por pedido: la única salida del
              encabezado es «Guardar y cerrar». */}
        </div>
      </header>

      {editorContacto}

      {/* Abajo de lg se apila: el perfil y debajo la actividad, con el compositor al pie de ella.
          Desde lg el perfil es una sola columna (inmobiliaria, tareas, notas) al lado de la actividad. */}
      <div className="ui-scale grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(380px,1.4fr)_minmax(360px,2.1fr)] lg:overflow-hidden">
        <aside className="flex min-w-0 flex-col gap-2.5 bg-(--surface-2) p-3 lg:min-h-0 lg:overflow-y-auto lg:[border-right:1px_solid_var(--line)]">
          {/* Empresa y personas en un solo bloque: la inmobiliaria arriba y debajo quién atiende,
              cada uno con su rol y cómo se lo contacta. */}
          {/* Sin rótulo: el nombre de la empresa, en negrita arriba de todo, ya dice qué es. */}
          <Seccion>
            <div className="flex min-w-0 flex-col">
              {/* La etapa va arriba a la derecha, al lado del nombre: es lo primero que se mira del
                  lead. Se dibuja con la misma chapa que en la lista, y reserva casi la mitad de la
                  fila: con un nombre largo, la chapa quedaba apretada contra el borde. */}
              <div className="flex items-center gap-2">
                {/* El círculo identifica el perfil de un vistazo, como el avatar de una persona. Sale del
                    borrador y no de lo guardado: cambia mientras se escribe el nombre. Sin empresa,
                    las iniciales de la persona; sin nada, el ícono. */}
                <span aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--brand-soft) text-[12.5px] font-semibold text-(--brand-soft-fg) [border:1px_solid_var(--brand-100)]">
                  {inicialesDe(borrador.company_name || `${borrador.first_name} ${borrador.last_name}`) || <User size={15} />}
                </span>
                {campoPersona('company_name', 'Empresa', 'Nombre de la inmobiliaria', 'min-w-0 flex-1 text-[14px] font-semibold')}
                <Select
                  value={lead.funnel_stage_id ?? ''}
                  disabled={!escribe}
                  onValueChange={id => {
                    if (id === descartada?.id) setDescartandoLead(true)
                    else actualizarLead.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null, recontact_at: null } })
                  }}
                >
                  {/* El estado ocupa todo el botón y va en el color de marca (17/10/2026, por pedido): como
                      chapita chica se perdía al lado del nombre. */}
                  <SelectTrigger aria-label="Estado"
                    className="h-10! w-[46%] shrink-0 justify-between gap-1 rounded-lg border-transparent bg-(--brand-soft) px-1 shadow-none [border:1px_solid_var(--brand-100)] hover:brightness-95">
                    <StageBadge etapa={etapaDelLead(lead, etapasPorId)}
                      className="min-w-0 flex-1 justify-center truncate [border:0] bg-transparent py-1.5 px-2 text-[14px] font-bold text-(--brand-soft-fg)" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {opcionesEtapa.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.deleted_at ? `${e.label} (borrada)` : e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {descartandoLead && descartada && (
                <DescartarLeadDialog leadId={lead.id} etapa={descartada} onClose={() => setDescartandoLead(false)} />
              )}

              {/* Acá solo los fijados. Todos, fijados incluidos, viven en la pestaña de la inmobiliaria (`otrosContactos`):
                  fue un desplegable debajo de estos y se mudó por pedido, para que el perfil diga a
                  quién se llama y el detalle de la inmobiliaria tenga a todos. */}
              {arriba.length > 0 && <ul className={cn(LISTA_CONTACTOS, 'mt-1.5')}>{arriba.map(c => filaContacto(c))}</ul>}
              {/* Los teléfonos y emails sueltos que se fijaron en la pestaña de la inmobiliaria. */}
              {datosArriba.length > 0 && (
                <ul className={cn(LISTA_CONTACTOS, 'mt-1.5 px-1')}>
                  {datosArriba.map(d => filaDato(d, d.clave.startsWith('mail:') ? Mail : Phone))}
                </ul>
              )}
              {/* Sin nadie fijado, en vez de una ficha vacía, la puerta para cargar uno: nace fijado,
                  que es lo que se vino a hacer acá. */}
              {arriba.length === 0 && escribe && libre && (
                <button type="button" onClick={() => agregar(libre, true)}
                  className="mt-1.5 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
                  <UserPlus size={14} />Agregar contacto
                </button>
              )}
              {/* Al pie de los contactos: los mensajes se les mandan a ellos. */}
              <BotonMensajes client={lead.client} className="mt-2 self-start" />
            </div>
          </Seccion>

          <Seccion titulo="Tareas">
            <TareasDelLead leadId={lead.id} responsableId={lead.assigned_to} puedeEscribir={escribe}
              tareas={detalleQ.data?.tasks ?? []} cargando={detalleQ.isLoading}
              creando={creandoTarea} onCreando={setCreandoTarea} />
          </Seccion>

          {/* Leyendo, la nota es texto y vacía es una línea tenue: un cuadro de tres renglones sin
              nada adentro ocupaba lo mismo que una nota escrita. «Editar» la vuelve campo; al
              salir se guarda y vuelve a ser texto. */}
          <Seccion>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className={ROTULO}>Notas</h3>
              {escribe && !editandoNotas && (
                <button type="button" onClick={() => setEditandoNotas(true)}
                  className="cursor-pointer text-[12.5px] font-semibold text-(--brand-soft-fg) hover:underline">
                  Editar
                </button>
              )}
            </div>
            {editandoNotas ? (
              <Textarea
                autoFocus
                rows={3}
                aria-label="Notas"
                placeholder="Lo que haya que saber de esta inmobiliaria…"
                value={borrador.notes}
                onChange={e => cambiar({ notes: e.target.value })}
                onBlur={() => { guardar('notes'); setEditandoNotas(false) }}
                className="min-h-16 resize-y text-[13px] md:text-[13px]"
              />
            ) : borrador.notes.trim() ? (
              <p className="whitespace-pre-wrap text-[13px] leading-snug text-foreground">{borrador.notes}</p>
            ) : (
              <p className="text-[13px] text-(--fg-faint)">Escribí una nota sobre el cliente…</p>
            )}
          </Seccion>
        </aside>

        <div className="flex min-h-[75vh] min-w-0 flex-col lg:min-h-0">
          <ActividadLead lead={lead} detalle={detalleQ.data} cargando={detalleQ.isLoading} puedeEscribir={escribe}
            pestana={pestana} onDecisorContactado={fijarDecisores} otrosContactos={otrosContactos} telefonosSueltos={telefonosNodo} emailsSueltos={emailsNodo} />
        </div>
      </div>
    </>
  )
}

/**
 * El dialog del lead. Copia del patrón del producto (LeadList.tsx:1767): 94vw × 92vh, a pantalla
 * completa abajo de 768px, NO se cierra clickeando afuera (adentro se edita con guardado al blur
 * y un clic al pasar por el velo tiraba todo abajo) — se sale con Escape, «Guardar y cerrar» o
 * la cruz, que cierra sin guardar y pregunta antes.
 * Sin pestañas: a la izquierda el perfil (datos con la etapa arriba, tareas, notas) y a la
 * derecha la actividad, que es lo que se viene a leer y a escribir.
 */
export function LeadDialog({ lead, indice, total, hayAnterior, haySiguiente, onPaso, onCerrar, onStartReassign }: {
  lead: CrmLeadRow | null
  /** Posición en la lista filtrada; −1 si el lead abierto no está en ella (llegó por enlace o se descartó). */
  indice: number
  total: number
  /** Los decide la lista (`vecinosEnRecorrido`): un lead que se fue de ella sigue teniendo vecinos. */
  hayAnterior: boolean
  haySiguiente: boolean
  onPaso: (delta: -1 | 1) => void
  onCerrar: () => void
  onStartReassign?: (leadId: string) => void
}) {
  /* La pestaña vive acá y no en el cuerpo: el cuerpo se remonta con cada lead (`key`), y pasar
     al siguiente desde la pestaña de la inmobiliaria tiene que dejarte en la inmobiliaria. Al
     cerrar el dialog vuelve a la actividad. */
  const [pestana, setPestana] = useState<PestanaDelLead>('actividad')
  const abierto = lead != null
  useEffect(() => { if (!abierto) setPestana('actividad') }, [abierto])

  /* ↑/↓ hacen lo mismo que los chevrones, con las excepciones del producto: no mientras se
     escribe, no en controles que ya usan flechas, no si alguien más atendió la tecla, no desde
     otro dialog encima (la confirmación de cierre, reasignar). Escucha el documento y no el
     DialogContent: un clic en una zona sin foco (el fondo del perfil) deja el foco en el body,
     y desde ahí la tecla nunca pasaba por el dialog. */
  const contenido = useRef<HTMLDivElement>(null)
  const paso = useRef({ hayAnterior, haySiguiente, onPaso })
  paso.current = { hayAnterior, haySiguiente, onPaso }
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const target = e.target as HTMLElement
      const enElDialog = contenido.current?.contains(target) ?? false
      if (!enElDialog && target !== document.body) return
      if (target.isContentEditable || target.closest('input, textarea, select, [role="listbox"], [role="menu"], [role="combobox"], [role="radiogroup"], [role="slider"], [role="spinbutton"]')) return
      if (document.querySelector('[role="alertdialog"]')) return
      const { hayAnterior, haySiguiente, onPaso } = paso.current
      const delta = e.key === 'ArrowUp' ? -1 : 1
      if (delta < 0 ? !hayAnterior : !haySiguiente) return
      e.preventDefault()
      onPaso(delta)
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierto])

  return (
    <Dialog open={lead != null} onOpenChange={open => { if (!open) onCerrar() }}>
      <DialogContent
        ref={contenido}
        showCloseButton={false}
        onInteractOutside={e => e.preventDefault()}
        className="dialog-fullscreen-mobile flex h-[92vh] max-h-none w-[94vw] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{lead ? nombreDelLead(lead.client) : 'Lead'}</DialogTitle>
        <DialogDescription className="sr-only">Estado, datos, tareas, notas y actividad del lead.</DialogDescription>
        {lead && (
          <CuerpoDelLead key={lead.id} lead={lead} indice={indice} total={total} hayAnterior={hayAnterior} haySiguiente={haySiguiente} pestana={pestana} setPestana={setPestana} onPaso={onPaso} onStartReassign={onStartReassign} />
        )}
      </DialogContent>
    </Dialog>
  )
}
