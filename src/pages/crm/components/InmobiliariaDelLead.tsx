import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ExternalLink, Pencil, Sparkles, TriangleAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useActualizarCliente } from '../hooks/useLeadMutaciones'
import {
  enlaceDeWeb, fechaALaVista, MOTIVOS_DE_SELECCION, parsearAgentes, parsearFecha, valorDeOpcion, webALaVista,
} from '../lib/inmobiliaria'
import type { ClientePatch } from '../service/crm.service'
import type { CrmLeadRow } from '../types'

/* NUEVO. La pestaña con el nombre de la inmobiliaria, al lado de la actividad: lo que se sabe de
   la empresa. En orden: lo que trajo la importación (lote, activación, motivo), los otros
   contactos, los teléfonos de Google Maps e Idealista y, abajo de todo, los datos de la empresa
   (web, Idealista, ciudad, tamaño, qué CRM usa hoy).
   Teléfono, email, origen y responsable no se repiten acá: ya están en el perfil de la
   izquierda, y dos lugares para el mismo dato es uno que miente. */

/* Dos modos por sección, como el «Detalle propiedad» del producto: leyendo, una ficha compacta
   —rótulo chico y gris, el dato al lado— que ocupa la mitad que una pila de campos; «Editar» la
   vuelve campos. Lo que falta dice «sin cargar», subrayado punteado, y tocarlo abre la edición
   justo en ese dato: es la forma más corta de completar lo que falta. */
const ROTULO = 'text-[10.5px] font-bold uppercase leading-none tracking-[0.08em] text-(--fg-muted)'
const CAMPO = 'h-8 w-full px-2 text-[13px] md:text-[13px] placeholder:text-(--fg-faint)'
const VALOR = 'min-w-0 truncate text-[13.5px] font-medium text-foreground'

// Los números: se escriben como texto y se interpretan recién al guardar (`parsearAgentes`, que
// pide un entero no negativo — sirve igual para agentes, años y cantidad de inmuebles).
const NUMERICOS = ['agents_count', 'idealista_years', 'idealista_listings'] as const
type Numerico = (typeof NUMERICOS)[number]
const esNumerico = (c: Campo): c is Numerico => (NUMERICOS as readonly string[]).includes(c)

/* Los dos teléfonos de la empresa que no son de ninguna persona: se editan con el mismo campo de
   teléfono que los del perfil. */
const TELEFONOS = ['google_maps_phone', 'idealista_phone'] as const
type Telefono = (typeof TELEFONOS)[number]
const esTelefono = (c: Campo): c is Telefono => (TELEFONOS as readonly string[]).includes(c)

type Campo = 'company_name' | 'website' | 'idealista_url' | 'city' | 'neighborhood' | 'office_address'
  | 'current_crm' | Numerico
  | 'import_batch' | 'batch_activated_on' | Telefono
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
  import_batch: l.client?.import_batch ?? '', batch_activated_on: l.client?.batch_activated_on ?? '',
  google_maps_phone: l.client?.google_maps_phone ?? '', idealista_phone: l.client?.idealista_phone ?? '',
})

/* Cada sección se edita por su lado: «Editar» en una no vuelve campos a las otras. */
type Bloque = 'datos' | 'importacion' | 'telefonos'
const BLOQUE_DE: Partial<Record<Campo, Bloque>> = {
  import_batch: 'importacion', batch_activated_on: 'importacion',
  google_maps_phone: 'telefonos', idealista_phone: 'telefonos',
}
const bloqueDe = (c: Campo): Bloque => BLOQUE_DE[c] ?? 'datos'
// Radix no deja un ítem con valor vacío: «Sin motivo» lleva esta marca y se guarda como null.
const SIN_MOTIVO = '__sin_motivo__'

function Seccion({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex min-h-7 items-center justify-between gap-2 px-0.5">
        <h3 className={ROTULO}>{titulo}</h3>
        {accion}
      </div>
      <div className="rounded-lg bg-card px-3.5 py-2.5 shadow-xs [border:1px_solid_var(--line)]">{children}</div>
    </section>
  )
}

/** La ficha: rótulo angosto a la izquierda y el dato pegado, sin separadores entre renglones. */
function Ficha({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">{children}</dl>
}

function Fila({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[12px] text-(--fg-faint)">{rotulo}</dt>
      <dd className="flex min-h-6 min-w-0 items-center">{children}</dd>
    </>
  )
}

function BotonEditar({ editando, onClick }: { editando: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-card px-2.5 text-[12px] font-semibold text-foreground [border:1px_solid_var(--line)] hover:bg-(--surface-2)">
      {editando ? <><Check size={13} />Listo</> : <><Pencil size={12} />Editar</>}
    </button>
  )
}

/* El consejo para el SDR, arriba de todo: es lo que se lee antes de levantar el teléfono. Hoy se
   escribe a mano; la idea es que lo genere Claude con los datos y la actividad del lead, y por eso
   ya lleva su nombre y su columna (`sdr_advice`, pendiente de migración como las de la ficha).
   Mismo trato que las notas del perfil: leyendo es texto, vacío es una línea, «Editar» lo abre. */
function ConsejoSdr({ lead, puedeEscribir }: { lead: CrmLeadRow; puedeEscribir: boolean }) {
  const actualizarCliente = useActualizarCliente()
  const guardado = lead.client?.sdr_advice ?? ''
  const [texto, setTexto] = useState(guardado)
  const [abierto, setAbierto] = useState(false)
  // Lo que llega por realtime se toma solo si no lo estoy escribiendo.
  useEffect(() => { if (!abierto) setTexto(guardado) }, [guardado, abierto])

  const guardar = () => {
    setAbierto(false)
    const client = lead.client
    if (!client || texto.trim() === guardado.trim()) return
    actualizarCliente.mutate({ clientId: client.id, patch: { sdr_advice: texto.trim() || null } })
  }

  return (
    <Seccion titulo="Consejo de Claude para SDR"
      accion={puedeEscribir && !abierto && (
        <button type="button" onClick={() => setAbierto(true)}
          className="cursor-pointer text-[12.5px] font-semibold text-(--brand-soft-fg) hover:underline">
          Editar
        </button>
      )}>
      <div className="flex gap-2.5">
        <Sparkles size={15} aria-hidden className="mt-0.5 shrink-0 text-(--brand-soft-fg)" />
        {abierto ? (
          <Textarea autoFocus rows={4} aria-label="Consejo para el SDR" value={texto}
            placeholder="Cómo encarar a esta inmobiliaria: qué le duele, qué decirle, qué evitar…"
            onChange={e => setTexto(e.target.value)} onBlur={guardar}
            className="min-h-20 flex-1 resize-y text-[13px] md:text-[13px]" />
        ) : texto.trim() ? (
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-snug text-foreground">{texto}</p>
        ) : (
          <p className="min-w-0 flex-1 text-[13px] text-(--fg-faint)">Todavía no hay consejo para esta inmobiliaria.</p>
        )}
      </div>
    </Seccion>
  )
}

export function InmobiliariaDelLead({ lead, puedeEscribir, otrosContactos }: {
  lead: CrmLeadRow
  puedeEscribir: boolean
  /** Los contactos sin fijar, ya dibujados por el perfil: el borrador de cada persona es uno solo y
   *  vive allá, así que se los recibe hechos en vez de editarlos con un segundo borrador acá. */
  otrosContactos?: ReactNode
}) {
  const actualizarCliente = useActualizarCliente()

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
    if (campo === 'batch_activated_on') {
      const r = parsearFecha(borrador[campo])
      if (!r.ok) { setBorrador(b => ({ ...b, [campo]: borradorDe(lead)[campo] })); return }
      if (r.valor === (client[campo] ?? null)) return
      actualizarCliente.mutate({ clientId: client.id, patch: { [campo]: r.valor } })
      return
    }
    const valor = borrador[campo].trim()
    if (valor === (client[campo] ?? '').trim()) return
    actualizarCliente.mutate({ clientId: client.id, patch: { [campo]: valor || null } as ClientePatch })
  }

  /* El motivo se elige de una lista y se guarda al elegir, solo, como todo lo de esta pestaña. */
  const motivoGuardado = lead.client?.selection_reason ?? ''
  const elegirMotivo = (elegido: string) => {
    const client = lead.client
    const valor = valorDeOpcion(MOTIVOS_DE_SELECCION, elegido === SIN_MOTIVO ? null : elegido)
    if (!client || valor === (client.selection_reason ?? null)) return
    actualizarCliente.mutate({ clientId: client.id, patch: { selection_reason: valor } })
  }

  const campoDe = (c: Campo, label: string, placeholder: string, inputMode?: 'numeric') => {
    /* PhoneInput no tiene onBlur ni autoFocus: se escucha el blur en el contenedor, como en el perfil. */
    if (esTelefono(c)) return (
      <div className="w-full [&_.h-9]:h-8" onBlur={() => guardar(c)}>
        <PhoneInput value={borrador[c]} onChange={v => cambiar(c, v)} />
      </div>
    )
    return (
      <Input className={CAMPO} aria-label={label} placeholder={placeholder} value={borrador[c]}
        type={c === 'batch_activated_on' ? 'date' : 'text'} inputMode={inputMode} autoFocus={foco === c}
        onChange={e => cambiar(c, e.target.value)} onBlur={() => guardar(c)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
    )
  }

  /* Lo que falta: con permiso es un botón que entra a editar ese dato; sin permiso, un texto. */
  const sinCargar = (c?: Campo) => puedeEscribir && c
    ? <button type="button" onClick={() => editar(bloqueDe(c), c)}
        className="cursor-pointer text-[13.5px] font-medium text-(--fg-faint) underline decoration-dotted underline-offset-4 hover:text-(--fg-2)">
        sin cargar
      </button>
    : <span className="text-[13.5px] font-medium text-(--fg-faint)">sin cargar</span>

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
          <ExternalLink size={13} className="shrink-0" />
        </a>
      )
    }
    if (c === 'batch_activated_on') return <span className={cn(VALOR, 'tabular-nums')}>{fechaALaVista(v)}</span>
    return <span className={cn(VALOR, (esNumerico(c) || esTelefono(c)) && 'tabular-nums')}>{v}</span>
  }

  const fila = (b: Bloque, d: { c: Campo; rotulo: string; placeholder: string; inputMode?: 'numeric' }) => (
    <Fila key={d.c} rotulo={d.rotulo}>{enEdicion === b ? campoDe(d.c, d.rotulo, d.placeholder, d.inputMode) : leer(d.c)}</Fila>
  )

  /* Dos columnas por tema: la empresa a la izquierda y su presencia online a la derecha. Si la
     pestaña es angosta se apilan en ese mismo orden (container query, no el ancho de la pantalla:
     lo que manda es el panel, que vive al lado de la actividad). */
  const DATOS_EMPRESA: { c: Campo; rotulo: string; placeholder: string; inputMode?: 'numeric' }[] = [
    { c: 'company_name', rotulo: 'Nombre', placeholder: 'Nombre de la inmobiliaria' },
    { c: 'city', rotulo: 'Ciudad', placeholder: 'Ciudad' },
    { c: 'neighborhood', rotulo: 'Barrio', placeholder: 'Dónde opera' },
    { c: 'office_address', rotulo: 'Dirección', placeholder: 'De la oficina' },
    { c: 'agents_count', rotulo: 'Nº de agentes', placeholder: 'Cuántos son', inputMode: 'numeric' },
    { c: 'current_crm', rotulo: 'CRM actual', placeholder: 'Qué usan hoy' },
  ]
  const DATOS_ONLINE: { c: Campo; rotulo: string; placeholder: string; inputMode?: 'numeric' }[] = [
    { c: 'website', rotulo: 'Web', placeholder: 'inmobiliaria.com' },
    { c: 'idealista_url', rotulo: 'Idealista', placeholder: 'Enlace al perfil' },
    { c: 'idealista_years', rotulo: 'Años en Idealista', placeholder: 'Cuántos años', inputMode: 'numeric' },
    { c: 'idealista_listings', rotulo: 'Propiedades en Idealista', placeholder: 'Cuántas publica', inputMode: 'numeric' },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-(--surface-2) p-3">
      <ConsejoSdr lead={lead} puedeEscribir={puedeEscribir} />

      {otrosContactos && <Seccion titulo="Otros contactos">{otrosContactos}</Seccion>}

      {/* Los teléfonos de la empresa que no son de ninguna persona. El de Idealista va último y con
          el aviso escrito, no en un tooltip: es un redirector, y llamar por ahí a la agencia le entra
          como un interesado en un piso. Nada en la pantalla lo ofrece como número por defecto. */}
      <Seccion titulo="Otros teléfonos" accion={botonEditar('telefonos')}>
        <Ficha>{fila('telefonos', { c: 'google_maps_phone', rotulo: 'Google Maps', placeholder: '' })}</Ficha>
        <div className="mt-2.5 flex flex-col gap-1.5 pt-2.5 [border-top:1px_solid_var(--line-soft)]">
          <span className="text-[12px] text-(--fg-faint)">Teléfono Idealista · último recurso</span>
          <div className="flex min-h-6 min-w-0 items-center">
            {enEdicion === 'telefonos' ? campoDe('idealista_phone', 'Teléfono Idealista', '') : leer('idealista_phone')}
          </div>
          <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-[7px] text-[11.5px] leading-snug text-warning">
            <TriangleAlert size={13} aria-hidden className="mt-px shrink-0" />
            Solo si no hay ningún otro teléfono. Es un redirector de Idealista: a la agencia le entra
            como un cliente interesado en un piso.
          </p>
        </div>
      </Seccion>

      {/* Abajo (6/10/2026, por pedido): es contexto que se consulta, no lo que se usa para llamar. */}
      <Seccion titulo="Datos de la inmobiliaria" accion={botonEditar('datos')}>
        <div className="@container">
          <div className="grid gap-x-6 gap-y-1.5 @[540px]:grid-cols-2">
            <Ficha>{DATOS_EMPRESA.map(d => fila('datos', d))}</Ficha>
            <Ficha>{DATOS_ONLINE.map(d => fila('datos', d))}</Ficha>
          </div>
        </div>
      </Seccion>

      {/* De qué lote de la importación salió, cuándo se le activó al SDR y por qué se la eligió. El
          motivo es un select siempre, no solo en edición: es un toque, y leyendo dice el rótulo.
          Último de todo (6/10/2026, por pedido): es de dónde vino el dato, no algo del día a día. */}
      <Seccion titulo="Importación" accion={botonEditar('importacion')}>
        <Ficha>
          {fila('importacion', { c: 'import_batch', rotulo: 'Lote', placeholder: 'Ej.: BCN-S01' })}
          {fila('importacion', { c: 'batch_activated_on', rotulo: 'Activada para el SDR', placeholder: '' })}
          <Fila rotulo="Motivo">
            <Select value={motivoGuardado} disabled={!puedeEscribir} onValueChange={elegirMotivo}>
              <SelectTrigger size="sm" aria-label="Motivo de selección" title="Con qué ángulo abrir la llamada"
                className="h-7 w-full max-w-[200px] px-2 text-[13px] font-medium">
                <SelectValue placeholder="Sin cargar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_MOTIVO} className="text-(--fg-muted)">Sin motivo</SelectItem>
                {MOTIVOS_DE_SELECCION.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </Fila>
        </Ficha>
      </Seccion>
    </div>
  )
}
