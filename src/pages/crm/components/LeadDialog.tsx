import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Briefcase, Check, ChevronDown, ChevronUp, Mail, NotebookPen, Phone, Pin, User, UserPlus, X } from 'lucide-react'
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
import { inicialesDe, nombreDelLead, type ClientData } from '../lib/clientData'
import { etapaDelLead } from '../lib/effectiveStage'
import { ORIGENES_DE_TELEFONO, valorDeOpcion } from '../lib/inmobiliaria'
import type { ClientePatch } from '../service/crm.service'
import type { CrmLeadRow } from '../types'
import { ActividadLead, PestanasDelLead, type PestanaDelLead } from './ActividadLead'
import type { ClienteExtra } from './ClientFields'
import { StageBadge } from './leadCells'
import { LeadRowActions } from './LeadRowActions'
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

const LISTA_CONTACTOS = 'flex flex-col divide-y divide-(--line-soft) rounded-md [border:1px_solid_var(--line-soft)]'

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
function CuerpoDelLead({ lead, indice, total, onPaso, onStartReassign }: {
  lead: CrmLeadRow
  indice: number
  total: number
  onPaso: (delta: -1 | 1) => void
  onStartReassign?: (leadId: string) => void
}) {
  const { etapasPorId, etapasActivas } = useCrmCatalogos()
  const { puedeEscribir } = useCarteras()
  const detalleQ = useLeadDetalle(lead.id)
  /* Descartado no se elige acá: pide motivo (menú de acciones). Pero si el lead YA está en
     Descartado, o en una etapa que se borró del funnel, esa opción tiene que estar: si no, el
     select queda en blanco y parece que el lead no tiene etapa. */
  const actual = lead.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel || e.id === lead.funnel_stage_id)
  if (actual && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)
  const actualizarLead = useActualizarLead()
  const actualizarCliente = useActualizarCliente()
  const escribe = puedeEscribir(lead.assigned_to)

  const [creandoTarea, setCreandoTarea] = useState(false)
  const [editandoNotas, setEditandoNotas] = useState(false)
  const [pestana, setPestana] = useState<PestanaDelLead>('actividad')
  const hayAnterior = indice > 0
  const haySiguiente = indice !== -1 && indice < total - 1

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

  /* Una persona extra se dibuja si tiene algo cargado o si se la acaba de agregar: un casillero
     vacío no se muestra, se ofrece «Agregar persona». */
  const [agregadas, setAgregadas] = useState<number[]>([])
  const cargada = (i: number) => {
    const p = OTRAS_PERSONAS[i]
    return [p.telefono, p.nombre, p.rol, p.notas, p.origen].some(c => borrador[c].trim())
  }
  const visibles = OTRAS_PERSONAS.map((_, i) => i).filter(i => cargada(i) || agregadas.includes(i))
  const libre = OTRAS_PERSONAS.findIndex((_, i) => !visibles.includes(i))
  const quitarPersona = (i: number) => {
    const { telefono: tel, nombre, rol, notas, origen } = OTRAS_PERSONAS[i]
    editando.current = false
    setBorrador(b => ({ ...b, [tel]: '', [nombre]: '', [rol]: '', [notas]: '', [origen]: '' }))
    setAgregadas(a => a.filter(x => x !== i))
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
  }

  /* Los fijados se ven en el perfil; el resto, en la pestaña de la inmobiliaria. Fijar es una
     preferencia de cada navegador, como el plegado del backlog: no toca la base. */
  const [fijados, setFijados] = useState<Contacto[]>(() => leerFijados(lead.client?.id))
  const alternarFijado = (c: Contacto) => {
    const nuevos = fijados.includes(c) ? fijados.filter(x => x !== c) : [...fijados, c]
    setFijados(nuevos)
    guardarFijados(lead.client?.id, nuevos)
  }
  const contactos: Contacto[] = ['principal', ...visibles.map(i => OTRAS_PERSONAS[i].telefono)]
  const arriba = contactos.filter(c => fijados.includes(c))
  const resto = contactos.filter(c => !fijados.includes(c))

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
  const rolPersona = (campo: 'contact_role' | `alternative_phone_${1 | 2}_role`) => (
    <div className="flex items-center gap-1">
      <Icon icon={Briefcase} size="sm" className="ml-1 text-(--fg-faint)" />
      {campoPersona(campo, 'Rol', 'Rol (ej.: dueño, gerente comercial)')}
    </div>
  )
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

  const filaContacto = (c: Contacto) => {
    if (c === 'principal') return (
      <li key={c} className="flex flex-col gap-0.5 p-1.5">
        <div className="flex items-center gap-1">
          <Icon icon={User} size="sm" className="ml-1 text-(--fg-faint)" />
          <div className="grid min-w-0 flex-1 grid-cols-2">
            {campoPersona('first_name', 'Nombre', 'Nombre', 'font-medium')}
            {campoPersona('last_name', 'Apellido', 'Apellido', 'font-medium')}
          </div>
          <span className="shrink-0 rounded-full bg-(--surface-2) px-2 py-0.5 text-[10.5px] font-semibold text-(--fg-muted)">Principal</span>
          {botonFijar(c)}
        </div>
        <div className="flex items-center gap-1">
          <Icon icon={Phone} size="sm" className="ml-1 text-(--fg-faint)" />
          {telefonoPersona('phone')}
          {origenTelefono('phone_source')}
        </div>
        <div className="flex items-center gap-1">
          <Icon icon={Mail} size="sm" className="ml-1 text-(--fg-faint)" />
          {campoPersona('email', 'Email', 'email@inmobiliaria.com', undefined, 'email')}
        </div>
        {rolPersona('contact_role')}
        {notasPersona('contact_notes')}
      </li>
    )
    const i = OTRAS_PERSONAS.findIndex(p => p.telefono === c)
    const { nombre, rol, notas, origen } = OTRAS_PERSONAS[i]
    return (
      <li key={c} className="flex flex-col gap-0.5 p-1.5">
        <div className="flex items-center gap-1">
          <Icon icon={User} size="sm" className="ml-1 text-(--fg-faint)" />
          {campoPersona(nombre, 'Nombre', 'Nombre', 'font-medium')}
          {botonFijar(c)}
          {escribe && (
            <button type="button" onClick={() => quitarPersona(i)} aria-label="Quitar persona" title="Quitar persona"
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-(--fg-faint) hover:bg-(--surface-2) hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Icon icon={Phone} size="sm" className="ml-1 text-(--fg-faint)" />
          {telefonoPersona(c)}
          {origenTelefono(origen)}
        </div>
        {rolPersona(rol)}
        {notasPersona(notas)}
      </li>
    )
  }

  /* Se dibujan acá, con el borrador de acá, y se pasan hechos a la pestaña de la inmobiliaria: un
     segundo borrador de las mismas columnas en la otra pestaña se pisarían entre sí. Fijar uno lo
     sube al perfil; desfijarlo lo manda de vuelta. «Agregar persona» va con ellos: la nueva nace
     sin fijar, así que aparece justo ahí. */
  const otrosContactos = (
    <div className="flex min-w-0 flex-col">
      {resto.length > 0
        ? <ul className={LISTA_CONTACTOS}>{resto.map(filaContacto)}</ul>
        : <p className="py-1 text-[12.5px] text-(--fg-muted)">
            {contactos.length > 1 ? 'Todos los contactos están fijados en el perfil.' : 'Sin otros contactos.'}
          </p>}
      {escribe && libre !== -1 && (
        <button type="button" onClick={() => setAgregadas(a => [...a, libre])}
          className="mt-1.5 flex cursor-pointer items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] font-medium text-(--fg-2) hover:bg-(--surface-2) hover:text-foreground">
          <UserPlus size={14} />Agregar persona
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
        <DialogClose asChild>
          <button type="button" aria-label="Volver al panel" title="Volver al panel"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-card text-foreground transition-colors [border:1px_solid_var(--line)] hover:bg-(--surface-2)">
            <ArrowLeft size={16} />
          </button>
        </DialogClose>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => onPaso(-1)} disabled={!hayAnterior} aria-label="Lead anterior"
              title={hayAnterior ? 'Lead anterior' : 'Es el primero de la lista'}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35">
              <ChevronUp size={15} />
            </button>
            <button type="button" onClick={() => onPaso(1)} disabled={!haySiguiente} aria-label="Lead siguiente"
              title={haySiguiente ? 'Lead siguiente' : 'Es el último de la lista'}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-(--fg-2) hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-35">
              <ChevronDown size={15} />
            </button>
            {indice !== -1 && <span className="ml-0.5 text-[11px] tabular-nums text-(--fg-muted) max-md:hidden">{indice + 1} de {total}</span>}
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
        </div>
      </header>

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
                  onValueChange={id => actualizarLead.mutate({ id: lead.id, patch: { funnel_stage_id: id, discard_reason: null } })}
                >
                  <SelectTrigger aria-label="Etapa"
                    className="h-9 w-[46%] shrink-0 justify-between gap-1 border-transparent bg-transparent px-1 shadow-none hover:border-input">
                    <StageBadge etapa={etapaDelLead(lead, etapasPorId)} className="gap-2 py-[5px] px-[12px] text-[12.5px]" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {opcionesEtapa.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        <span aria-hidden className="size-[7px] rounded-full" style={{ background: e.priority?.color ?? 'var(--line-strong)' }} />
                        {e.deleted_at ? `${e.label} (borrada)` : e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {lead.discard_reason && (
                <p className="mt-1.5 rounded-md bg-(--surface-2) px-2.5 py-1.5 text-[12.5px] text-(--fg-2)">Motivo del descarte: {lead.discard_reason}</p>
              )}

              {/* Acá solo los fijados. El resto vive en la pestaña de la inmobiliaria (`otrosContactos`):
                  fue un desplegable debajo de estos y se mudó por pedido, para que el perfil diga a
                  quién se llama y el detalle de la inmobiliaria tenga a todos. */}
              {arriba.length > 0 && <ul className={cn(LISTA_CONTACTOS, 'mt-1.5')}>{arriba.map(filaContacto)}</ul>}
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
 * y un clic al pasar por el velo tiraba todo abajo) — se sale con Escape o la flecha de volver.
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

  return (
    <Dialog open={lead != null} onOpenChange={open => { if (!open) onCerrar() }}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={e => e.preventDefault()}
        /* ↑/↓ hacen lo mismo que los chevrones, con las excepciones del producto: no mientras se
           escribe, no en controles que ya usan flechas, no si alguien más atendió la tecla, no
           desde un portal (popover) que burbujea por el árbol de React. */
        onKeyDown={e => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
          const target = e.target as HTMLElement
          if (!e.currentTarget.contains(target)) return
          if (target.isContentEditable || target.closest('input, textarea, select, [role="listbox"], [role="menu"], [role="combobox"], [role="radiogroup"], [role="slider"], [role="spinbutton"]')) return
          const delta = e.key === 'ArrowUp' ? -1 : 1
          if (delta < 0 ? !hayAnterior : !haySiguiente) return
          e.preventDefault()
          onPaso(delta)
        }}
        className="dialog-fullscreen-mobile flex h-[92vh] max-h-none w-[94vw] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">{lead ? nombreDelLead(lead.client) : 'Lead'}</DialogTitle>
        <DialogDescription className="sr-only">Etapa, datos, tareas, notas y actividad del lead.</DialogDescription>
        {lead && (
          <CuerpoDelLead key={lead.id} lead={lead} indice={indice} total={total} onPaso={onPaso} onStartReassign={onStartReassign} />
        )}
      </DialogContent>
    </Dialog>
  )
}
