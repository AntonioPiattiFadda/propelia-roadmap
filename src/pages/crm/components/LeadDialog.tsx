import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Briefcase, Check, ChevronDown, ChevronUp, Mail, NotebookPen, Pencil, Phone, Pin, TriangleAlert, User, UserPlus, X } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  casilleroParaTelefonoDeGoogle, esTelefonoDeIdealista, inicialesDe,
 nombreDelLead, type CampoDecisor, type ClientData } from '../lib/clientData'
import { etapaDelLead } from '../lib/effectiveStage'
import { ORIGENES_DE_TELEFONO, valorDeOpcion } from '../lib/inmobiliaria'
import { etiquetaDeMotivo, fmtFechaCompleta, grupoDeMotivo } from '../lib/motivosDescarte'
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
})

/* Las otras personas de la inmobiliaria son los dos teléfonos alternativos. No hay tabla de
   contactos; dos casilleros fijos del cliente. `nombre` es la vieja «nota» del teléfono, que antes
   decía nombre y rol juntos: las filas viejas siguen ahí con los dos hasta que alguien las separe. */
const OTRAS_PERSONAS = [
  { telefono: 'alternative_phone_1', nombre: 'alternative_phone_1_note', rol: 'alternative_phone_1_role', notas: 'alternative_phone_1_notes', origen: 'alternative_phone_1_source' },
  { telefono: 'alternative_phone_2', nombre: 'alternative_phone_2_note', rol: 'alternative_phone_2_role', notas: 'alternative_phone_2_notes', origen: 'alternative_phone_2_source' },
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

type OrigenDeTelefonoCampo = 'phone_source' | (typeof OTRAS_PERSONAS)[number]['origen']
const SIN_ORIGEN = '__sin_origen__'

/* Las columnas de cada contacto, para dibujar la fila y la ventanita de edición con un solo mapa.
   El email es solo del principal: los alternativos no tienen columna. */
type CamposDeContacto = {
  nombres: readonly { campo: keyof Borrador; label: string }[]
  telefono: 'phone' | 'alternative_phone_1' | 'alternative_phone_2'
  origen: OrigenDeTelefonoCampo
  email?: 'email'
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
    nombres: [{ campo: p.nombre, label: 'Nombre' }], telefono: p.telefono, origen: p.origen, rol: p.rol, notas: p.notas,
    decisor: `${p.telefono}_is_decision_maker`,
  }
}
const columnasDe = (f: CamposDeContacto): (keyof Borrador)[] =>
  [...f.nombres.map(n => n.campo), f.telefono, f.origen, ...(f.email ? [f.email] : []), f.rol, f.notas]

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
function CuerpoDelLead({ lead, indice, total, pestana, setPestana, onPaso, onCerrar, onStartReassign }: {
  lead: CrmLeadRow
  indice: number
  total: number
  pestana: PestanaDelLead
  setPestana: (p: PestanaDelLead) => void
  onPaso: (delta: -1 | 1) => void
  onCerrar: () => void
  onStartReassign?: (leadId: string) => void
}) {
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const { puedeEscribir } = useCarteras()
  const detalleQ = useLeadDetalle(lead.id)
  /* Descartado se ofrece, pero elegirlo abre el diálogo del motivo en vez de mover el lead (cancelar
     lo deja donde estaba: el select es controlado). Las otras fuera del funnel no se eligen; si el
     lead YA está en una, o en una etapa que se borró, esa opción tiene que estar: si no, el select
     queda en blanco y parece que el lead no tiene etapa. */
  const [descartandoLead, setDescartandoLead] = useState(false)
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  const opcionesEtapa = etapasActivas.filter(e =>
    !e.is_out_of_funnel || e.id === lead.funnel_stage_id || e.id === descartada?.id)
  const grupoDescarte = grupoDeMotivo(lead.discard_reason)
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  const actualizarLead = useActualizarLead()
  const actualizarCliente = useActualizarCliente()
  const escribe = puedeEscribir(lead.assigned_to)

  const [creandoTarea, setCreandoTarea] = useState(false)
  const [editandoNotas, setEditandoNotas] = useState(false)
  const hayAnterior = indice > 0
  const haySiguiente = indice !== -1 && indice < total - 1

  // Borrador local: se escribe acá y se guarda campo por campo al salir. Si llega un cambio de
  // otro por realtime mientras no estoy escribiendo, se toma.
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(lead))
  const editando = useRef(false)
  useEffect(() => { if (!editando.current) setBorrador(borradorDe(lead)) }, [lead])

  /* La cruz cierra sin guardar: mientras pregunta, el blur del campo que se estaba escribiendo no
     manda nada. Si se cancela, el foco vuelve a ese campo y se guarda al salir, como siempre. */
  const descartando = useRef(false)
  const focoPrevio = useRef<HTMLElement | null>(null)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false)

  const cambiar = (patch: Partial<Borrador>) => { editando.current = true; setBorrador(b => ({ ...b, ...patch })) }
  const guardar = (campo: keyof Borrador) => {
    if (descartando.current) return
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
    return [p.telefono, p.nombre, p.rol, p.notas, p.origen].some(c => borrador[c].trim())
  }
  const visibles = OTRAS_PERSONAS.map((_, i) => i).filter(i => cargada(i) || agregadas.includes(OTRAS_PERSONAS[i].telefono))
  const quitarPersona = (i: number) => {
    const { telefono: tel, nombre, rol, notas, origen } = OTRAS_PERSONAS[i]
    editando.current = false
    setBorrador(b => ({ ...b, [tel]: '', [nombre]: '', [rol]: '', [notas]: '', [origen]: '' }))
    setAgregadas(a => a.filter(x => x !== tel))
    if (fijados.includes(tel)) alternarFijado(tel)
    const client = lead.client
    if (!client) return
    if (client[tel] || client[nombre]) {
      actualizarCliente.mutate({ clientId: client.id, patch: { [tel]: null, [nombre]: null } as ClientePatch })
    }
    // Las columnas nuevas, aparte y solo si tienen algo: sin la migración, mandarlas haría fallar
    // también el borrado del teléfono.
    for (const c of [rol, notas, origen]) {
      if (client[c]) actualizarCliente.mutate({ clientId: client.id, patch: { [c]: null } as ClientePatch })
    }
    // El decisor es un booleano: `false` también es algo guardado que hay que borrar.
    const decisor = `${tel}_is_decision_maker` as const
    if (client[decisor] != null) actualizarCliente.mutate({ clientId: client.id, patch: { [decisor]: null } })
  }

  /* Los fijados se ven también en el perfil; todos, en la pestaña de la inmobiliaria. Fijar es una
     preferencia de cada navegador, como el plegado del backlog: no toca la base. */
  const [fijados, setFijados] = useState<Contacto[]>(() => leerFijados(lead.client?.id))
  const alternarFijado = (c: Contacto) => {
    const nuevos = fijados.includes(c) ? fijados.filter(x => x !== c) : [...fijados, c]
    setFijados(nuevos)
    guardarFijados(lead.client?.id, nuevos)
  }
  const fijar = (c: Contacto) => { if (!fijados.includes(c)) alternarFijado(c) }
  const contactos: Contacto[] = [
    ...(principalCargado || agregadas.includes('principal') ? ['principal' as const] : []),
    ...visibles.map(i => OTRAS_PERSONAS[i].telefono),
  ]
  const arriba = contactos.filter(c => fijados.includes(c))
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
     en «Datos de la inmobiliaria». Los que ya se habían copiado a un contacto quedan ahí. */
  const telefonosCargados = useRef(false)
  useEffect(() => {
    const client = lead.client
    if (telefonosCargados.current || !escribe || !client) return
    telefonosCargados.current = true
    const google = casilleroParaTelefonoDeGoogle(client)
    if (google) {
      const origen = google === 'phone' ? 'phone_source' : `${google}_source` as const
      actualizarCliente.mutate({ clientId: client.id, patch: { [google]: client.google_maps_phone, [origen]: 'google_maps' } as ClientePatch })
      fijar(google === 'phone' ? 'principal' : google)
    }
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

  /* Rol y notas de un contacto, los dos de texto libre. Las notas crecen con lo escrito
     (`field-sizing-content` del Textarea) desde un renglón: vacías no ocupan más que un campo. */
  const rolPersona = (campo: 'contact_role' | `alternative_phone_${1 | 2}_role`, decisor: CampoDecisor) => (
    <div className="flex items-center gap-1">
      <Icon icon={Briefcase} size="sm" className="ml-1 text-(--fg-faint)" />
      {campoPersona(campo, 'Rol', 'Rol (ej.: dueño, gerente comercial)')}
      {decisorPersona(decisor)}
    </div>
  )

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

  const botonFijar = (c: Contacto) => {
    const fijo = fijados.includes(c)
    return (
      <button type="button" onClick={() => alternarFijado(c)} aria-pressed={fijo}
        aria-label={fijo ? 'Desfijar contacto' : 'Fijar arriba'} title={fijo ? 'Desfijar' : 'Fijar arriba'}
        className={cn('flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-(--surface-2)',
          fijo ? 'text-foreground' : 'text-(--fg-faint) hover:text-foreground')}>
        <Pin size={14} className={cn(fijo && 'fill-current')} />
      </button>
    )
  }

  /* La fila dibuja solo lo que el contacto tiene cargado (se sigue editando en el lugar). Lo que
     falta no se dibuja vacío: se completa desde el lápiz, que aparece mientras falte algo y abre
     el contacto entero en una ventanita. */
  const filaContacto = (c: Contacto) => {
    const f = camposDe(c)
    const i = OTRAS_PERSONAS.findIndex(p => p.telefono === c)
    const nombres = f.nombres.filter(n => hay(n.campo))
    const falta = columnasDe(f).some(campo => !hay(campo)) || decisorDe(f.decisor) === null
    return (
      <li key={c} className="flex flex-col gap-0.5 p-1.5">
        <div className="flex items-center gap-1">
          <Icon icon={User} size="sm" className="ml-1 text-(--fg-faint)" />
          {nombres.length > 0
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
          {escribe && c !== 'principal' && (
            <button type="button" onClick={() => quitarPersona(i)} aria-label="Quitar persona" title="Quitar persona"
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
        {f.email && hay(f.email) && (
          <div className="flex items-center gap-1">
            <Icon icon={Mail} size="sm" className="ml-1 text-(--fg-faint)" />
            {campoPersona(f.email, 'Email', 'email@inmobiliaria.com', undefined, 'email')}
          </div>
        )}
        {(hay(f.rol) || decisorDe(f.decisor) !== null) && rolPersona(f.rol, f.decisor)}
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
            {enEditor.email && campoEditor(enEditor.email, 'Email', 'email@inmobiliaria.com', 'email')}
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">{campoEditor(enEditor.rol, 'Rol', 'Ej.: dueño, gerente comercial')}</div>
              <div className="pb-1.5">{decisorPersona(enEditor.decisor)}</div>
            </div>
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
      {contactos.length > 0
        ? <ul className={LISTA_CONTACTOS}>{contactos.map(filaContacto)}</ul>
        : <p className="py-1 text-[12.5px] text-(--fg-muted)">Sin contactos.</p>}
      {escribe && libre && (
        <button type="button" onClick={() => agregar(libre, false)}
          className="mt-1.5 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
          <UserPlus size={14} />Agregar contacto
        </button>
      )}
    </div>
  )

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
          {/* La cruz es la salida sin guardar. El mousedown no le saca el foco al campo: si lo
              hiciera, el blur guardaría justo lo que se quiere tirar. */}
          <button type="button" aria-label="Cerrar sin guardar" title="Cerrar sin guardar"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              focoPrevio.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
              descartando.current = true
              setConfirmandoCierre(true)
            }}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--fg-2) transition-colors hover:bg-(--surface-2) hover:text-foreground">
            <X size={18} />
          </button>
        </div>
      </header>

      {editorContacto}

      <AlertDialog open={confirmandoCierre} onOpenChange={abierto => { if (!abierto) setConfirmandoCierre(false) }}>
        <AlertDialogContent
          onCloseAutoFocus={e => {
            if (!descartando.current) return
            // Canceló: vuelve al campo que estaba escribiendo, para que se guarde al salir.
            e.preventDefault()
            descartando.current = false
            focoPrevio.current?.focus()
          }}>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar sin guardar?</AlertDialogTitle>
            <AlertDialogDescription>
              Lo que estés escribiendo y todavía no se guardó se pierde. Para conservarlo, usá «Guardar y cerrar».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction onClick={onCerrar}>Cerrar sin guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Abajo de lg se apila: el perfil y debajo la actividad, con el compositor al pie de ella.
          Desde lg el perfil es una sola columna (inmobiliaria, tareas, notas) al lado de la actividad. */}
      <div className="ui-scale grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(320px,1fr)_minmax(360px,2.1fr)] lg:overflow-hidden">
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
                  <SelectTrigger aria-label="Estado"
                    className="h-9 w-[46%] shrink-0 justify-between gap-1 border-transparent bg-transparent px-1 shadow-none hover:border-input">
                    <StageBadge etapa={etapaDelLead(lead, etapasPorId)} className="gap-2 py-[5px] px-[12px] text-[12.5px]" />
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
              {lead.discard_reason && (
                <div className="mt-1.5 rounded-md bg-(--surface-2) px-2.5 py-1.5 text-[12.5px] text-(--fg-2)">
                  <p>Motivo del descarte: {etiquetaDeMotivo(lead.discard_reason)}</p>
                  {grupoDescarte && <p className="text-(--fg-muted)">{grupoDescarte.label}</p>}
                  {lead.recontact_at && (
                    <p className="font-medium text-foreground">Volver a llamar desde {fmtFechaCompleta(lead.recontact_at)}</p>
                  )}
                </div>
              )}

              {/* Acá solo los fijados. Todos, fijados incluidos, viven en la pestaña de la inmobiliaria (`otrosContactos`):
                  fue un desplegable debajo de estos y se mudó por pedido, para que el perfil diga a
                  quién se llama y el detalle de la inmobiliaria tenga a todos. */}
              {arriba.length > 0 && <ul className={cn(LISTA_CONTACTOS, 'mt-1.5')}>{arriba.map(filaContacto)}</ul>}
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
            pestana={pestana} otrosContactos={otrosContactos} />
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
export function LeadDialog({ lead, indice, total, onPaso, onCerrar, onStartReassign }: {
  lead: CrmLeadRow | null
  /** Posición en la lista filtrada; −1 si el lead abierto no está en ella (llegó por enlace). */
  indice: number
  total: number
  onPaso: (delta: -1 | 1) => void
  onCerrar: () => void
  onStartReassign?: (leadId: string) => void
}) {
  const hayAnterior = indice > 0
  const haySiguiente = indice !== -1 && indice < total - 1
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
          <CuerpoDelLead key={lead.id} lead={lead} indice={indice} total={total} pestana={pestana} setPestana={setPestana} onPaso={onPaso} onCerrar={onCerrar} onStartReassign={onStartReassign} />
        )}
      </DialogContent>
    </Dialog>
  )
}
