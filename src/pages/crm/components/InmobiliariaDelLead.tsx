import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ExternalLink, Pencil, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { cn } from '@/lib/utils'
import { useActualizarCliente } from '../hooks/useLeadMutaciones'
import { enlaceDeWeb, parsearAgentes, webALaVista } from '../lib/inmobiliaria'
import { investigacionDeClaude } from '../lib/investigacion'
import type { ClientePatch } from '../service/crm.service'
import type { CrmLeadRow } from '../types'

/* NUEVO. La pestaña con el nombre de la inmobiliaria, al lado de la actividad: lo que se sabe de
   la empresa, en tres columnas para verlo todo sin scrollear (12/10/2026, por pedido): los otros
   contactos, los datos de la empresa y su presencia online.
   Teléfono, email, origen y responsable no se repiten acá: ya están en el perfil de la
   izquierda, y dos lugares para el mismo dato es uno que miente.
   Lo de la importación (lote, activación, motivo) se sacó de la pantalla el 12/10/2026, por
   pedido: las columnas siguen en la base y la importación las sigue escribiendo. */

/* Dos modos por sección, como el «Detalle propiedad» del producto: leyendo, una ficha compacta
   —rótulo chico y gris, el dato al lado—; «Editar» la vuelve campos. Lo que falta dice «sin
   cargar», subrayado punteado, y tocarlo abre la edición justo en ese dato. */
const ROTULO = 'text-[10.5px] font-bold uppercase leading-none tracking-[0.08em] text-(--fg-muted)'
const CAMPO = 'h-7 w-full px-2 text-[13px] md:text-[13px] placeholder:text-(--fg-faint)'
const VALOR = 'min-w-0 truncate text-[13px] font-medium text-foreground'

// Los números: se escriben como texto y se interpretan recién al guardar (`parsearAgentes`, que
// pide un entero no negativo — sirve igual para agentes, años y cantidad de inmuebles).
const NUMERICOS = ['agents_count', 'idealista_years', 'idealista_listings'] as const
type Numerico = (typeof NUMERICOS)[number]
const esNumerico = (c: Campo): c is Numerico => (NUMERICOS as readonly string[]).includes(c)

/* Los dos teléfonos que trae la importación. El de Google Maps entra solo como contacto (ver el
   LeadDialog) y acá se edita solo si no entró —los tres casilleros ya estaban ocupados—: si no, el
   número quedaría sin ninguna pantalla que lo muestre. El de Idealista NO es un contacto
   (12/10/2026, por pedido): es un redirector, no una persona de la agencia, así que vive siempre
   en «Datos de la inmobiliaria», con su aviso. */
const TELEFONOS = ['google_maps_phone', 'idealista_phone'] as const
type Telefono = (typeof TELEFONOS)[number]
const esTelefono = (c: Campo): c is Telefono => (TELEFONOS as readonly string[]).includes(c)

type Campo = 'company_name' | 'website' | 'idealista_url' | 'city' | 'neighborhood' | 'office_address'
  | 'current_crm' | Numerico | Telefono
type Borrador = Record<Campo, string>
const numeroATexto = (n: number | null | undefined) => (n != null ? String(n) : '')
const borradorDe = (l: CrmLeadRow): Borrador => ({
  company_name: l.client?.company_name ?? '', website: l.client?.website ?? '',
  idealista_url: l.client?.idealista_url ?? '', city: l.client?.city ?? '',
  neighborhood: l.client?.neighborhood ?? '', office_address: l.client?.office_address ?? '',
  agents_count: numeroATexto(l.client?.agents_count),
  idealista_years: numeroATexto(l.client?.idealista_years),
  idealista_listings: numeroATexto(l.client?.idealista_listings),
  current_crm: l.client?.current_crm ?? '',
  google_maps_phone: l.client?.google_maps_phone ?? '', idealista_phone: l.client?.idealista_phone ?? '',
})

/* Cada sección se edita por su lado: «Editar» en una no vuelve campos a las otras. */
type Bloque = 'empresa' | 'online' | 'telefonos'
type Dato = { c: Campo; rotulo: string; placeholder: string; inputMode?: 'numeric' }

const DATOS_EMPRESA: Dato[] = [
  { c: 'company_name', rotulo: 'Nombre', placeholder: 'Nombre de la inmobiliaria' },
  { c: 'city', rotulo: 'Ciudad', placeholder: 'Ciudad' },
  { c: 'neighborhood', rotulo: 'Barrio', placeholder: 'Dónde opera' },
  { c: 'office_address', rotulo: 'Dirección', placeholder: 'De la oficina' },
  { c: 'agents_count', rotulo: 'Agentes', placeholder: 'Cuántos son', inputMode: 'numeric' },
  { c: 'current_crm', rotulo: 'CRM actual', placeholder: 'Qué usan hoy' },
  { c: 'idealista_phone', rotulo: 'Tel. Idealista', placeholder: '' },
]
const DATOS_ONLINE: Dato[] = [
  { c: 'website', rotulo: 'Web', placeholder: 'inmobiliaria.com' },
  { c: 'idealista_url', rotulo: 'Idealista', placeholder: 'Enlace al perfil' },
  { c: 'idealista_years', rotulo: 'Años en Idealista', placeholder: 'Cuántos años', inputMode: 'numeric' },
  { c: 'idealista_listings', rotulo: 'Inmuebles', placeholder: 'Cuántos publica', inputMode: 'numeric' },
]
const BLOQUE_DE = new Map<Campo, Bloque>([
  ...DATOS_EMPRESA.map(d => [d.c, 'empresa'] as const),
  ...DATOS_ONLINE.map(d => [d.c, 'online'] as const),
  ['google_maps_phone', 'telefonos'],
])


function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-1 flex min-h-6 items-center justify-between gap-2 px-0.5">
        <h3 className={ROTULO}>{titulo}</h3>
        {accion}
      </div>
      <div className="rounded-lg bg-card px-3 py-2 shadow-xs [border:1px_solid_var(--line)]">{children}</div>
    </section>
  )
}

/** La ficha: rótulo angosto a la izquierda y el dato pegado, sin separadores entre renglones. */
function Ficha({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1">{children}</dl>
}

function Fila({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="truncate text-[11.5px] text-(--fg-faint)" title={rotulo}>{rotulo}</dt>
      <dd className="flex min-h-6 min-w-0 items-center">{children}</dd>
    </>
  )
}

function BotonEditar({ editando, onClick }: { editando: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-full bg-card px-2 text-[11.5px] font-semibold text-foreground [border:1px_solid_var(--line)] hover:bg-(--surface-2)">
      {editando ? <><Check size={12} />Listo</> : <><Pencil size={11} />Editar</>}
    </button>
  )
}

export function InmobiliariaDelLead({ lead, puedeEscribir, otrosContactos, telefonos, emails }: {
  lead: CrmLeadRow
  puedeEscribir: boolean
  /** Todos los contactos (los fijados también), ya dibujados por el perfil: el borrador de cada persona es uno solo y
   *  vive allá, así que se los recibe hechos en vez de editarlos con un segundo borrador acá. */
  otrosContactos?: ReactNode
  /** Los teléfonos y emails sueltos, también hechos por el perfil: el fijado de cada uno vive allá. */
  telefonos?: ReactNode
  emails?: ReactNode
}) {
  const actualizarCliente = useActualizarCliente()
  const investigacion = investigacionDeClaude(lead.client?.sdr_advice)

  // Mismo patrón que el perfil: borrador local, se guarda campo por campo al salir y lo que llega
  // por realtime se toma solo si no estoy escribiendo.
  const [borrador, setBorrador] = useState<Borrador>(() => borradorDe(lead))
  const editando = useRef(false)
  useEffect(() => { if (!editando.current) setBorrador(borradorDe(lead)) }, [lead])
  // Qué sección se está editando (ninguna: todas leyendo); `foco` es el dato que se tocó para entrar.
  const [enEdicion, setEnEdicion] = useState<Bloque | null>(null)
  const [foco, setFoco] = useState<Campo | null>(null)
  const editar = (b: Bloque, c: Campo | null) => { setFoco(c); setEnEdicion(b) }
  const botonEditar = (b: Bloque) => puedeEscribir &&
    <BotonEditar editando={enEdicion === b} onClick={() => enEdicion === b ? setEnEdicion(null) : editar(b, null)} />

  const cambiar = (campo: Campo, valor: string) => { editando.current = true; setBorrador(b => ({ ...b, [campo]: valor })) }
  /* Un campo por guardado, siempre: si la base todavía no tiene la columna, falla ese dato solo
     (con el aviso de `FALTA_MIGRACION`) y no arrastra a otro que sí podía guardarse. */
  const guardar = (campo: Campo) => {
    editando.current = false
    const client = lead.client
    if (!client) return
    if (esNumerico(campo)) {
      const r = parsearAgentes(borrador[campo])
      // Lo que no es un entero no negativo no se guarda: el campo vuelve a lo que había.
      if (!r.ok) { setBorrador(b => ({ ...b, [campo]: borradorDe(lead)[campo] })); return }
      if (r.valor === (client[campo] ?? null)) return
      actualizarCliente.mutate({ clientId: client.id, patch: { [campo]: r.valor } as ClientePatch })
      return
    }
    const valor = borrador[campo].trim()
    if (valor === (client[campo] ?? '').trim()) return
    actualizarCliente.mutate({ clientId: client.id, patch: { [campo]: valor || null } as ClientePatch })
  }

  const campoDe = (d: Dato) => {
    /* PhoneInput no tiene onBlur ni autoFocus: se escucha el blur en el contenedor, como en el perfil. */
    if (esTelefono(d.c)) {
      const c = d.c
      return (
        <div className="w-full [&_.h-9]:h-7" onBlur={() => guardar(c)}>
          <PhoneInput value={borrador[c]} onChange={v => cambiar(c, v)} />
        </div>
      )
    }
    return (
      <Input className={CAMPO} aria-label={d.rotulo} placeholder={d.placeholder} value={borrador[d.c]}
        inputMode={d.inputMode} autoFocus={foco === d.c}
        onChange={e => cambiar(d.c, e.target.value)} onBlur={() => guardar(d.c)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    )
  }

  /* Lo que falta: con permiso es un botón que entra a editar ese dato; sin permiso, un texto. */
  const sinCargar = (c: Campo) => puedeEscribir
    ? <button type="button" onClick={() => editar(BLOQUE_DE.get(c) ?? 'empresa', c)}
        className="cursor-pointer text-[13px] font-medium text-(--fg-faint) underline decoration-dotted underline-offset-4 hover:text-(--fg-2)">
        sin cargar
      </button>
    : <span className="text-[13px] font-medium text-(--fg-faint)">sin cargar</span>

  /** Leyendo: el dato, o «sin cargar». La web e Idealista, como enlace. */
  const leer = (c: Campo) => {
    const v = borrador[c].trim()
    if (!v) return sinCargar(c)
    if (c === 'website' || c === 'idealista_url') {
      const href = enlaceDeWeb(v)
      return (
        <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" title={href ?? undefined}
          className={cn(VALOR, 'inline-flex items-center gap-1 text-(--brand-soft-fg) hover:underline')}>
          <span className="min-w-0 truncate">{c === 'website' ? webALaVista(v) : 'Ver perfil'}</span>
          <ExternalLink size={12} className="shrink-0" />
        </a>
      )
    }
    return <span className={cn(VALOR, (esNumerico(c) || esTelefono(c)) && 'tabular-nums')} title={v}>{v}</span>
  }

  const fila = (b: Bloque, d: Dato) => (
    <Fila key={d.c} rotulo={d.rotulo}>{enEdicion === b ? campoDe(d) : leer(d.c)}</Fila>
  )

  /* Dos columnas cuando el panel da (container query, no el ancho de la pantalla: lo que manda es
     el panel, que vive al lado de la actividad); más angosto se apilan en el mismo orden. */
  return (
    <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto bg-(--surface-2) p-2.5">
      <div className="grid items-start gap-2.5 @[560px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* Teléfonos y emails sueltos, cada uno en su sección (17/10/2026, por pedido): pelados y
              fijables. Los arma el perfil, que es donde viven los fijados. */}
          {telefonos && <Seccion titulo="Teléfonos">{telefonos}</Seccion>}
          {emails && <Seccion titulo="Emails">{emails}</Seccion>}

          {otrosContactos && <Seccion titulo="Personas">{otrosContactos}</Seccion>}

          {/* Solo lectura: es lo que trajo la importación, no un dato del perfil. */}
          {investigacion && (
            <Seccion titulo="Investigación de Claude">
              <p className="whitespace-pre-wrap py-1 text-[13px] leading-snug text-foreground">{investigacion}</p>
            </Seccion>
          )}
        </div>

        {/* El de Idealista con el aviso escrito, no en un tooltip: es un redirector, y llamar por
            ahí a la agencia le entra como un interesado en un piso. */}
        {/* Presencia online va debajo de los datos, en la misma columna (17/10/2026, por pedido). */}
        <div className="flex min-w-0 flex-col gap-2.5">
          <Seccion titulo="Datos de la inmobiliaria" accion={botonEditar('empresa')}>
            <Ficha>{DATOS_EMPRESA.map(d => fila('empresa', d))}</Ficha>
            {!!borrador.idealista_phone.trim() && (
              <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1.5 text-[11.5px] leading-snug text-warning">
                <TriangleAlert size={13} aria-hidden className="mt-px shrink-0" />
                El teléfono de Idealista es el último recurso: es un redirector. Solo si no hay otro.
              </p>
            )}
          </Seccion>

          <Seccion titulo="Presencia online" accion={botonEditar('online')}>
            <Ficha>{DATOS_ONLINE.map(d => fila('online', d))}</Ficha>
          </Seccion>
        </div>
      </div>
    </div>
  )
}
