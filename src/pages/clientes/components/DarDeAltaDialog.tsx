import { useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Download, FileSpreadsheet, Loader2, Minus, Plus, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { leerHojaYOtra } from '@/pages/crm/service/excel'
import { PREFIJOS_DE_PAIS } from '@/pages/crm/lib/clientData'
import type { Celda } from '@/pages/crm/lib/importarLote'
import { CLIENTES_KEYS, useOrganizacion } from '../hooks/useClientes'
import { cuentaDe, equipoInicial, erroresDelEquipo, erroresGenerales, personaVacia, type PersonaDelAlta } from '../lib/alta'
import { normalizarWeb } from '../lib/equipo'
import { TAREA_CARTERA_IMPORTADA, TAREA_CARTERA_RECIBIDA } from '../lib/pasos'
import { guardarDatosDeLaInmobiliaria, importarEquipo, marcarTarea, vincularOrg } from '../service/clientes.service'
import { descargarExcel } from '../service/excel'
import {
  crearLeadsDePrueba, crearOrgConUsuarios, FILAS_POR_LOTE, FOTOS_POR_LOTE, getColumnasDeCartera, HOJA_DE_FOTOS, importarLoteDeCartera,
  importarLoteDeFotos, PUENTE_SIMULADO, revisarCartera, sumarUsuariosAOrg, type FilaRevisada, type OrgEnLista, type ResultadoDeLeadsDePrueba,
  type ResultadoDeUsuario, type RevisionDeFotos,
} from '../service/puente'
import { SelectorDeOrg } from './ImportarUsuariosPanel'
import { QUE_SE_CREA, resumenDeLeadsDePrueba, TablaDeLeadsDePrueba } from './LeadsDePrueba'
import type { DatosDelAlta } from './datosDelAlta'

/* «Dar de alta» (24/11/2026, por pedido; mock en docs/onboarding/alta-en-un-paso.html): la
   inmobiliaria, el equipo y, si ya está, la cartera, en una sola ventana y un solo «Confirmar». Lo
   cargamos nosotros: reemplazó a la página pública de alta, al «Importar» del equipo y al de la
   cartera. Tres etapas:
   1. Datos: nombre, web y link de Idealista; crear la org o usar una que ya existe; el equipo fila
      por fila; el Excel de la cartera (opcional) con «Importar fotos».
   2. Revisar: con una org existente, el simulacro de cuentas (`add_users_to_org` con `dry_run`) y el
      de la cartera (`check_properties`). Con una org nueva la cartera no se puede revisar antes (los
      agentes del Excel se buscan entre las cuentas de la org): se revisa apenas existe, y las filas
      con error no entran y quedan listadas al final, como en el import de siempre.
   3. Dar de alta: guarda los datos, crea la org (y la ata al lead en el acto, para que un reintento
      sume a esa y no cree otra) o suma al equipo a la existente, guarda el equipo
      (`client_onboarding_importar_equipo`, que tilda la tarea) y, con Excel, importa propiedades y
      fotos de a lotes y tilda las tareas de la cartera. Si algo se corta, «Reintentar» sigue: las
      cuentas, propiedades y fotos que ya están se saltean.
   `modo = 'cartera'` es «Importar cartera» con el alta ya hecha: solo el Excel. Reimportar suma lo
   que falta y no toca lo que ya estaba. */

type Etapa = 'datos' | 'revisar' | 'corriendo' | 'listo'
type Cartera = { archivo: string; hoja: string[][]; fotos: string[][] | null }
type RevisionDeCartera = { ok: true; orgId: string; filas: FilaRevisada[]; fotos: RevisionDeFotos | null } | { ok: false; error: string }
type RevisionDeCuentas = { estado: 'cargando' } | { estado: 'error'; error: string } | { estado: 'lista'; porEmail: Map<string, ResultadoDeUsuario> }
type EstadoDelPaso = 'pendiente' | 'corriendo' | 'ok' | 'salteado' | 'error'
type PasoDelAlta = { id: string; texto: string; estado: EstadoDelPaso; detalle?: string; avance?: number }
type Resumen = {
  org: string | null; cuentasNuevas: number; cuentasYaTenian: number
  propiedades: number; propiedadesYaEstaban: number; filasConError: { row_number: number; error: string }[]
  fotos: number; fotosFallidas: { row_number: number; error: string }[]
  leadsDePrueba: ResultadoDeLeadsDePrueba | null
}

const ROL = { admin: 'Administrador', agent: 'Agente' } as const
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Algo falló')
const celdaATexto = (c: Celda) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))
const vacia = (fila: string[]) => fila.every(c => !c.trim())
const slug = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const selectCls = 'h-8 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

/** Errores conocidos de la base, en castellano. */
function traducir(msg: string) {
  if (msg.includes('crm_onboarding_org_de_otro_lead')) return 'Esa organización ya está vinculada a otro lead'
  if (msg.includes('crm_onboarding_equipo_ya_importado')) return 'El equipo ya se importó'
  return msg
}

export function DarDeAltaDialog({ datos, modo, abierto, onCerrar }: {
  datos: DatosDelAlta; modo: 'alta' | 'cartera'; abierto: boolean; onCerrar: () => void
}) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !ocupado) onCerrar() }}>
      <DialogContent showCloseButton={false} onInteractOutside={e => e.preventDefault()} onEscapeKeyDown={e => { if (ocupado) e.preventDefault() }}
        className="ui-scale dialog-fullscreen-mobile flex max-h-[90vh] w-[min(1060px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{modo === 'cartera' ? 'Importar cartera' : 'Dar de alta'}</DialogTitle>
        <DialogDescription className="sr-only">Organización, equipo y cartera del cliente en Propelia.</DialogDescription>
        {abierto && <Cuerpo datos={datos} modo={modo} ocupado={ocupado} onOcupado={setOcupado} onCerrar={onCerrar} />}
      </DialogContent>
    </Dialog>
  )
}

function Cuerpo({ datos, modo, ocupado, onOcupado, onCerrar }: {
  datos: DatosDelAlta; modo: 'alta' | 'cartera'; ocupado: boolean; onOcupado: (v: boolean) => void; onCerrar: () => void
}) {
  const qc = useQueryClient()
  const soloCartera = modo === 'cartera'
  const onboardingId = datos.o.id
  const [etapa, setEtapa] = useState<Etapa>('datos')
  const [nombre, setNombre] = useState(datos.o.company_name?.trim() || datos.o.lead.client?.company_name?.trim() || '')
  const [web, setWeb] = useState(datos.o.website ?? '')
  const [idealista, setIdealista] = useState(datos.o.idealista_url ?? '')
  const [orgModo, setOrgModo] = useState<'nueva' | 'existente'>('nueva')
  const [orgElegida, setOrgElegida] = useState<OrgEnLista | null>(null)
  const [equipo, setEquipo] = useState(() => equipoInicial(datos.o.miembros, datos.o.lead.client))
  const [intento, setIntento] = useState(false)
  const [cartera, setCartera] = useState<Cartera | null>(null)
  const [conFotos, setConFotos] = useState(true)
  // Apagada de entrada: en la org de un cliente real quedarían leads inventados en su cartera.
  const [conLeadsDePrueba, setConLeadsDePrueba] = useState(false)
  const [leyendo, setLeyendo] = useState(false)
  const [bajandoPlantilla, setBajandoPlantilla] = useState(false)
  const [revCuentas, setRevCuentas] = useState<RevisionDeCuentas | null>(null)
  const [revCartera, setRevCartera] = useState<RevisionDeCartera | 'cargando' | null>(null)
  const [pasos, setPasos] = useState<PasoDelAlta[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [fallo, setFallo] = useState(false)
  // La org que creó esta ventana: un reintento suma a esa y no crea otra.
  const [orgCreada, setOrgCreada] = useState<string | null>(null)
  // Las cuentas que creó esta ventana: al reintentar vuelven como «ya existía», pero tienen que recibir sus accesos.
  const creadasAca = useRef(new Set<string>())
  const equipoListo = useRef(datos.equipoImportado)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const orgFija = orgCreada ?? datos.orgId
  const infoDeLaFija = useOrganizacion(orgFija)
  const orgId = orgFija ?? (orgModo === 'existente' ? orgElegida?.id ?? null : null)
  const nombreDeLaOrg = orgFija ? infoDeLaFija.data?.name ?? 'la org vinculada' : orgElegida?.name ?? nombre.trim()
  const webNormalizada = normalizarWeb(web)
  const fotosAUsar = conFotos ? cartera?.fotos ?? null : null

  const erroresFila = soloCartera ? new Map<string, string[]>() : erroresDelEquipo(equipo)
  const faltas: string[] = soloCartera
    ? (cartera ? [] : ['Subí el Excel de propiedades'])
    : [
        ...(!nombre.trim() ? ['Falta el nombre de la inmobiliaria'] : []),
        ...(webNormalizada === undefined ? ['La web no es válida (ej. fincasribera.es)'] : []),
        ...(!orgFija && orgModo === 'existente' && !orgElegida ? ['Elegí la organización'] : []),
        ...erroresGenerales(equipo),
        ...(erroresFila.size ? [`${plural(erroresFila.size, 'persona tiene', 'personas tienen')} datos para corregir`] : []),
      ]

  const cambiar = (clave: string, cambio: Partial<PersonaDelAlta>) =>
    setEquipo(eq => eq.map(p => (p.clave === clave ? { ...p, ...cambio } : p)))
  const hacerResponsable = (clave: string) =>
    setEquipo(eq => eq.map(p => (p.clave === clave ? { ...p, responsable: true, rol: 'admin' } : { ...p, responsable: false })))

  const leerArchivo = async (f: File) => {
    setLeyendo(true)
    try {
      const { primera, otra } = await leerHojaYOtra(f, HOJA_DE_FOTOS)
      setCartera({ archivo: f.name, hoja: primera.map(fila => fila.map(celdaATexto)), fotos: otra ? otra.map(fila => fila.map(celdaATexto)) : null })
      setConFotos(!!otra)
    } catch (e) {
      setCartera(null)
      setRevCartera({ ok: false, error: `No se pudo leer ${f.name}: ${mensajeDe(e)}` })
    } finally {
      setLeyendo(false)
    }
  }

  const bajarPlantilla = async () => {
    setBajandoPlantilla(true)
    try {
      const cols = await getColumnasDeCartera()
      await descargarExcel(`cartera-${slug(nombre) || 'inmobiliaria'}.xlsx`, [cols.map(c => c.header), cols.map(c => String(c.example))])
    } catch (e) {
      setRevCartera({ ok: false, error: `No se pudo bajar la plantilla: ${mensajeDe(e)}` })
    } finally {
      setBajandoPlantilla(false)
    }
  }

  /* El simulacro. Se rehace cada vez que se entra a «Revisar»: lo de «Datos» pudo cambiar. */
  const irARevisar = () => {
    setIntento(true)
    if (faltas.length) return
    setEtapa('revisar')
    if (!soloCartera && orgId) {
      setRevCuentas({ estado: 'cargando' })
      sumarUsuariosAOrg(orgId, equipo.map(p => cuentaDe(p)), true)
        .then(r => setRevCuentas({ estado: 'lista', porEmail: new Map(r.results.map(x => [x.email.toLowerCase(), x])) }))
        .catch(e => setRevCuentas({ estado: 'error', error: mensajeDe(e) }))
    } else setRevCuentas(null)
    if (cartera && orgId) {
      setRevCartera('cargando')
      revisarCartera(orgId, cartera.hoja, fotosAUsar)
        .then(r => setRevCartera(r.ok ? { ok: true, orgId, filas: r.rows, fotos: r.photos ?? null } : r))
        .catch(e => setRevCartera({ ok: false, error: mensajeDe(e) }))
    } else setRevCartera(null)
  }

  const cuentasConError = revCuentas?.estado === 'lista' ? [...revCuentas.porEmail.values()].filter(r => r.status === 'failed') : []
  const cuentasRevisadas = soloCartera || !orgId || revCuentas?.estado === 'lista'
  const carteraRevisada = revCartera !== 'cargando' && !(revCartera && !revCartera.ok)
  const algoParaImportar = !soloCartera || (revCartera && revCartera !== 'cargando' && revCartera.ok
    && (revCartera.filas.some(f => f.valid && !f.existing_property_id) || (revCartera.fotos?.ok && revCartera.fotos.new > 0)))
  const puedeConfirmar = cuentasRevisadas && cuentasConError.length === 0 && carteraRevisada && !!algoParaImportar

  const actualizar = (id: string, cambio: Partial<PasoDelAlta>) =>
    setPasos(ps => ps.map(p => (p.id === id ? { ...p, ...cambio } : p)))

  const correr = async () => {
    onOcupado(true)
    setFallo(false)
    setEtapa('corriendo')
    const cuentas = equipo.map(p => cuentaDe(p))
    const hacerEquipo = !soloCartera && !equipoListo.current
    const revisadaAntes = revCartera && revCartera !== 'cargando' && revCartera.ok && revCartera.orgId === orgId ? revCartera : null
    const lista: PasoDelAlta[] = []
    if (hacerEquipo) {
      lista.push({ id: 'datos', texto: 'Guardar el nombre, la web y el link de Idealista', estado: 'pendiente' })
      lista.push({ id: 'org', texto: orgId ? `Sumar al equipo a ${nombreDeLaOrg}` : `Crear ${nombre.trim()} con ${plural(cuentas.length, 'cuenta', 'cuentas')}`, estado: 'pendiente' })
      lista.push({ id: 'equipo', texto: 'Guardar el equipo en el CRM y tildar la tarea', estado: 'pendiente' })
    }
    if (cartera) {
      if (!revisadaAntes) lista.push({ id: 'revisar', texto: 'Revisar el Excel de la cartera', estado: 'pendiente' })
      lista.push({ id: 'propiedades', texto: 'Importar las propiedades', estado: 'pendiente' })
      if (fotosAUsar) lista.push({ id: 'fotos', texto: 'Copiar las fotos', estado: 'pendiente' })
      if (conLeadsDePrueba) lista.push({ id: 'leads', texto: 'Crear los leads de prueba y calcular sus cruces', estado: 'pendiente' })
    } else {
      lista.push({ id: 'propiedades', texto: 'Cartera', estado: 'salteado', detalle: 'Sin Excel: se importa después con «Importar cartera»' })
    }
    setPasos(lista)

    const r: Resumen = { org: null, cuentasNuevas: 0, cuentasYaTenian: 0, propiedades: 0, propiedadesYaEstaban: 0, filasConError: [], fotos: 0, fotosFallidas: [], leadsDePrueba: null }
    let actual = ''
    const empezar = (id: string) => { actual = id; actualizar(id, { estado: 'corriendo', detalle: undefined }) }
    try {
      let org = orgId
      if (hacerEquipo) {
        empezar('datos')
        await guardarDatosDeLaInmobiliaria({ onboardingId, nombre: nombre.trim(), web: webNormalizada ?? null, idealista: idealista.trim() || null })
        actualizar('datos', { estado: 'ok' })

        empezar('org')
        let yaTenian = new Set<string>()
        if (!org) {
          const { organization } = await crearOrgConUsuarios(nombre.trim(), cuentas, webNormalizada ?? null)
          org = organization.id
          for (const c of cuentas) creadasAca.current.add(c.email)
          setOrgCreada(org)
          // Atada ya al lead: si lo que sigue falla, «Reintentar» suma a esta org y no crea otra.
          await vincularOrg({ onboardingId, organizationId: org })
          const sinWeb = webNormalizada && !organization.website ? ' · la web no se guardó: cargala en Ajustes › Marca de Propelia' : ''
          actualizar('org', { estado: 'ok', detalle: `${organization.name}: ${plural(cuentas.length, 'cuenta creada', 'cuentas creadas')}${sinWeb}` })
        } else {
          const { results } = await sumarUsuariosAOrg(org, cuentas)
          for (const x of results) if (x.status === 'created') creadasAca.current.add(x.email.toLowerCase())
          const fallaron = results.filter((x): x is Extract<ResultadoDeUsuario, { status: 'failed' }> => x.status === 'failed')
          if (fallaron.length) throw new Error(`No se pudieron crear ${fallaron.length} de ${results.length} cuentas: ${fallaron.map(f => `${f.email}: ${f.error}`).join(' · ')}`)
          yaTenian = new Set(results.filter(x => x.status === 'skipped_existing' && !creadasAca.current.has(x.email.toLowerCase())).map(x => x.email.toLowerCase()))
          actualizar('org', { estado: 'ok', detalle: `${plural(cuentas.length - yaTenian.size, 'cuenta nueva', 'cuentas nuevas')}, ${yaTenian.size} ya ${yaTenian.size === 1 ? 'tenía' : 'tenían'} cuenta` })
        }
        r.cuentasNuevas = cuentas.length - yaTenian.size
        r.cuentasYaTenian = yaTenian.size

        empezar('equipo')
        await importarEquipo({
          onboardingId, organizationId: org,
          miembros: cuentas.map(c => ({
            first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone, role: c.role, is_owner: c.is_owner,
            existing_account: yaTenian.has(c.email),
          })),
        })
        equipoListo.current = true
        actualizar('equipo', { estado: 'ok' })
      }
      r.org = org

      if (cartera && org) {
        let rev = revisadaAntes
        if (!rev) {
          empezar('revisar')
          const x = await revisarCartera(org, cartera.hoja, fotosAUsar)
          if (!x.ok) throw new Error(x.error)
          rev = { ok: true, orgId: org, filas: x.rows, fotos: x.photos ?? null }
          actualizar('revisar', { estado: 'ok', detalle: `${plural(x.rows.length, 'fila', 'filas')}` })
        }
        const validas = rev.filas.filter(f => f.valid && !f.existing_property_id)
        r.propiedadesYaEstaban = rev.filas.filter(f => f.existing_property_id).length
        r.filasConError = rev.filas.filter(f => !f.valid).map(f => ({ row_number: f.row_number, error: f.errors.join(' · ') }))

        empezar('propiedades')
        const [cabecera, ...filas] = cartera.hoja
        const porNumero = new Map(filas.map((f, i) => [i + 2, f]))
        for (let i = 0; i < validas.length; i += FILAS_POR_LOTE) {
          const lote = validas.slice(i, i + FILAS_POR_LOTE).map(f => ({ row_number: f.row_number, cells: porNumero.get(f.row_number) ?? [] }))
          const res = await importarLoteDeCartera(org, cabecera, lote)
          r.propiedades += res.filter(x => x.status === 'created').length
          const hechas = Math.min(i + FILAS_POR_LOTE, validas.length)
          actualizar('propiedades', { detalle: `${hechas} de ${validas.length}`, avance: hechas / validas.length })
        }
        actualizar('propiedades', {
          estado: 'ok', avance: undefined,
          detalle: [
            validas.length ? plural(r.propiedades, 'nueva', 'nuevas') : 'Nada nuevo para importar',
            r.propiedadesYaEstaban && `${r.propiedadesYaEstaban} ya estaban`,
            r.filasConError.length && `${r.filasConError.length} con error (no entraron)`,
          ].filter(Boolean).join(' · '),
        })

        if (fotosAUsar) {
          empezar('fotos')
          const nuevas = rev.fotos?.ok ? rev.fotos.rows.filter(f => f.status === 'new') : []
          if (rev.fotos && !rev.fotos.ok) throw new Error(`Hoja «${HOJA_DE_FOTOS}»: ${rev.fotos.error}`)
          // Mismos números de fila que la revisión: la cabecera es la primera fila no vacía.
          const inicio = fotosAUsar.findIndex(f => !vacia(f))
          const porFila = new Map(fotosAUsar.map((f, i) => [i + 1, f]))
          for (let i = 0; i < nuevas.length; i += FOTOS_POR_LOTE) {
            const lote = nuevas.slice(i, i + FOTOS_POR_LOTE).map(f => ({ row_number: f.row_number, cells: porFila.get(f.row_number) ?? [] }))
            const res = await importarLoteDeFotos(org, fotosAUsar[inicio], lote)
            r.fotos += res.filter(x => x.status === 'created').length
            for (const x of res) if (x.status === 'failed' || x.status === 'invalid') r.fotosFallidas.push({ row_number: x.row_number, error: x.errors?.join(' · ') ?? '' })
            const hechas = Math.min(i + FOTOS_POR_LOTE, nuevas.length)
            actualizar('fotos', { detalle: `${hechas} de ${nuevas.length}`, avance: hechas / nuevas.length })
          }
          const yaEstaban = rev.fotos?.ok ? rev.fotos.existing : 0
          actualizar('fotos', {
            estado: 'ok', avance: undefined,
            detalle: [nuevas.length ? `${r.fotos} copiadas` : 'Ninguna nueva', yaEstaban && `${yaEstaban} ya estaban`, r.fotosFallidas.length && `${r.fotosFallidas.length} no entraron`].filter(Boolean).join(' · '),
          })
        }
        await marcarTarea({ onboardingId, taskId: TAREA_CARTERA_RECIBIDA, hecha: true })
        await marcarTarea({ onboardingId, taskId: TAREA_CARTERA_IMPORTADA, hecha: true })

        // Después de la cartera: los compradores se arman contra los pisos que acaban de entrar.
        // Un reintento los rehace: el puente da de baja los anteriores antes de crear.
        if (conLeadsDePrueba) {
          empezar('leads')
          r.leadsDePrueba = await crearLeadsDePrueba(org)
          actualizar('leads', { estado: 'ok', detalle: resumenDeLeadsDePrueba(r.leadsDePrueba) })
        }
      }
      setResumen(r)
      setEtapa('listo')
    } catch (e) {
      if (actual) actualizar(actual, { estado: 'error', detalle: traducir(mensajeDe(e)), avance: undefined })
      setFallo(true)
    } finally {
      onOcupado(false)
      void qc.invalidateQueries({ queryKey: CLIENTES_KEYS.onboardings })
      if (orgId) void qc.invalidateQueries({ queryKey: CLIENTES_KEYS.org(orgId) })
    }
  }

  const titulo = soloCartera ? (datos.o.tareas.some(t => t.task_id === TAREA_CARTERA_IMPORTADA) ? 'Importar cartera de nuevo' : 'Importar cartera') : 'Dar de alta'
  const etapas: [Etapa, string][] = [['datos', soloCartera ? 'Excel' : 'Datos'], ['revisar', 'Revisar'], ['corriendo', soloCartera ? 'Importar' : 'Dar de alta']]
  const indice = etapa === 'listo' ? etapas.length : etapas.findIndex(([e]) => e === etapa)

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-(--line) px-5 py-3.5">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-[16px] font-semibold">{titulo} · {nombre.trim() || datos.inmobiliaria}</h2>
          {PUENTE_SIMULADO && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold">Puente simulado</span>}
          <Button size="icon" variant="ghost" className="size-8" aria-label="Cerrar" disabled={ocupado} onClick={onCerrar}><X className="size-4" /></Button>
        </div>
        <ol className="flex flex-wrap items-center gap-2 text-[12.5px] text-(--fg-muted)">
          {etapas.map(([e, rotulo], i) => (
            <li key={e} className={cn('flex items-center gap-1.5', i === indice && 'font-semibold text-foreground')}>
              {i > 0 && <span className="mr-1 text-(--fg-faint)">›</span>}
              <span className={cn('grid size-5 place-items-center rounded-full border text-[10.5px] tabular-nums',
                i < indice ? 'border-success bg-success text-white' : i === indice ? 'border-primary bg-primary text-primary-foreground' : 'border-(--line-strong)')}>
                {i < indice ? <Check className="size-3" /> : i + 1}
              </span>
              {rotulo}
            </li>
          ))}
        </ol>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4 text-[13px]">
        {etapa === 'datos' && (<>
          {!soloCartera && (<>
            <Bloque titulo="Inmobiliaria">
              <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                <Campo rotulo="Nombre">
                  <Input value={nombre} onChange={e => setNombre(e.target.value)} aria-invalid={intento && !nombre.trim()} className="h-8 bg-card" />
                </Campo>
                <Campo rotulo="Web" ayuda="Queda en la configuración de la org en Propelia">
                  <Input value={web} onChange={e => setWeb(e.target.value)} placeholder="Opcional" aria-invalid={webNormalizada === undefined} className="h-8 bg-card" />
                </Campo>
                <Campo rotulo="Link de Idealista" ayuda="Para tenerlo a mano: no viaja a Propelia">
                  <Input value={idealista} onChange={e => setIdealista(e.target.value)} placeholder="Opcional" className="h-8 bg-card" />
                </Campo>
              </div>
            </Bloque>
            <Bloque titulo="Organización en Propelia">
              {orgFija
                ? <p className="text-(--fg-2)">El equipo se suma a <b className="text-foreground">{nombreDeLaOrg}</b>, ya vinculada al lead.</p>
                : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-md border border-(--line) bg-card p-0.5" role="radiogroup" aria-label="Organización en Propelia">
                      {([['nueva', 'Crear una nueva'], ['existente', 'Usar una que ya existe']] as const).map(([valor, rotulo]) => (
                        <button key={valor} type="button" role="radio" aria-checked={orgModo === valor} onClick={() => setOrgModo(valor)}
                          className={cn('rounded px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                            orgModo === valor ? 'bg-primary text-primary-foreground' : 'text-(--fg-2) hover:bg-(--surface-2)')}>
                          {rotulo}
                        </button>
                      ))}
                    </div>
                    {orgModo === 'existente' && <SelectorDeOrg valor={orgElegida} onElegir={setOrgElegida} deshabilitado={false} />}
                  </div>
                )}
            </Bloque>
            <Bloque titulo="Equipo" nota={`${plural(equipo.length, 'persona', 'personas')} · la contraseña sale sola: nombre.apellido`}>
              <div className="overflow-x-auto rounded-md border border-(--line)">
                <table className="w-full min-w-[820px] text-[12.5px]">
                  <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
                    <tr>{['Nombre', 'Apellido', 'Email', 'Teléfono', 'Rol', 'Responsable', ''].map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {equipo.map(p => {
                      const err = intento ? erroresFila.get(p.clave) ?? [] : []
                      const tiene = (t: string) => err.some(e => e.includes(t))
                      return (
                        <tr key={p.clave} className="border-t border-(--line)">
                          <td className="px-1.5 py-1.5"><Input value={p.nombre} onChange={e => cambiar(p.clave, { nombre: e.target.value })} aria-invalid={tiene('nombre')} placeholder="Nombre" className="h-8 bg-card" /></td>
                          <td className="px-1.5 py-1.5"><Input value={p.apellido} onChange={e => cambiar(p.clave, { apellido: e.target.value })} aria-invalid={tiene('apellido')} placeholder="Apellido" className="h-8 bg-card" /></td>
                          <td className="px-1.5 py-1.5"><Input type="email" value={p.email} onChange={e => cambiar(p.clave, { email: e.target.value })} aria-invalid={tiene('Email')} placeholder="email@inmobiliaria.es" className="h-8 min-w-48 bg-card" /></td>
                          <td className="px-1.5 py-1.5">
                            <div className="flex gap-1">
                              <select value={p.prefijo} onChange={e => cambiar(p.clave, { prefijo: e.target.value })} aria-label="Prefijo" className={selectCls}>
                                {PREFIJOS_DE_PAIS.map(x => <option key={x.codigo} value={x.prefijo}>{x.codigo} {x.prefijo}</option>)}
                              </select>
                              <Input value={p.telefono} onChange={e => cambiar(p.clave, { telefono: e.target.value })} aria-invalid={tiene('Teléfono')} placeholder="Opcional" className="h-8 w-32 bg-card" />
                            </div>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <select value={p.rol} onChange={e => cambiar(p.clave, { rol: e.target.value as PersonaDelAlta['rol'] })} aria-label="Rol"
                              aria-invalid={tiene('Administrador')} className={cn(selectCls, tiene('Administrador') && 'border-destructive')}>
                              {(['admin', 'agent'] as const).map(r => <option key={r} value={r}>{ROL[r]}</option>)}
                            </select>
                          </td>
                          <td className="px-1.5 py-1.5 text-center">
                            <input type="radio" name="responsable" checked={p.responsable} onChange={() => hacerResponsable(p.clave)} aria-label={`${p.nombre || 'Esta persona'} es el responsable`} className="size-4 accent-(--primary)" />
                          </td>
                          <td className="px-1 py-1.5">
                            <Button size="icon" variant="ghost" className="size-8 text-(--fg-muted)" aria-label="Quitar" disabled={equipo.length === 1}
                              onClick={() => setEquipo(eq => eq.filter(x => x.clave !== p.clave))}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Button size="sm" variant="outline" className="self-start" onClick={() => setEquipo(eq => [...eq, personaVacia()])}>
                <Plus className="size-4" /> Agregar persona
              </Button>
              {intento && erroresFila.size > 0 && (
                <ul className="flex flex-col gap-0.5 text-[12.5px] text-destructive">
                  {equipo.map((p, i) => erroresFila.has(p.clave) && (
                    <li key={p.clave}>Fila {i + 1}{p.nombre ? ` (${p.nombre})` : ''}: {erroresFila.get(p.clave)!.join(' · ')}</li>
                  ))}
                </ul>
              )}
            </Bloque>
          </>)}
          <Bloque titulo={soloCartera ? 'Excel de propiedades' : 'Cartera'} nota={soloCartera ? 'Entran solo las propiedades y fotos que no estén' : 'Opcional: se puede importar después'}>
            {cartera ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--line) px-3 py-2.5">
                <FileSpreadsheet className="size-5 text-success" />
                <span className="min-w-48 flex-1">
                  <b className="font-medium">{cartera.archivo}</b>
                  <span className="block text-[12px] text-(--fg-muted)">
                    {plural(cartera.hoja.slice(1).filter(f => !vacia(f)).length, 'fila', 'filas')} de propiedades
                    {cartera.fotos ? ` · ${plural(Math.max(0, cartera.fotos.filter(f => !vacia(f)).length - 1), 'foto', 'fotos')} en «${HOJA_DE_FOTOS}»` : ` · sin hoja «${HOJA_DE_FOTOS}»`}
                  </span>
                </span>
                <label className={cn('flex items-center gap-2', cartera.fotos ? 'cursor-pointer' : 'opacity-50')}>
                  <Checkbox checked={conFotos && !!cartera.fotos} disabled={!cartera.fotos} onCheckedChange={v => setConFotos(v === true)} /> Importar fotos
                </label>
                <label className="flex cursor-pointer items-center gap-2" title={QUE_SE_CREA}>
                  <Checkbox checked={conLeadsDePrueba} onCheckedChange={v => setConLeadsDePrueba(v === true)} /> Crear leads de prueba
                </label>
                <Button size="sm" variant="outline" onClick={() => setCartera(null)}>Quitar</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border-[1.5px] border-dashed border-(--line-strong) bg-(--surface-2) px-4 py-3.5"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void leerArchivo(f) }}>
                <Upload className="size-5 text-(--fg-muted)" />
                <span className="min-w-56 flex-1">
                  Soltá acá el Excel de propiedades
                  <span className="block text-[12px] text-(--fg-muted)">El de la plantilla: una fila por propiedad, con los agentes opcionales y la hoja «{HOJA_DE_FOTOS}».</span>
                </span>
                <Button size="sm" variant="outline" disabled={leyendo} onClick={() => inputArchivo.current?.click()}>
                  {leyendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Elegir archivo
                </Button>
                <Button size="sm" variant="outline" disabled={bajandoPlantilla} onClick={() => void bajarPlantilla()}>
                  {bajandoPlantilla ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Plantilla
                </Button>
              </div>
            )}
            {revCartera && revCartera !== 'cargando' && !revCartera.ok && <p className="text-[12.5px] text-destructive">{revCartera.error}</p>}
            <input ref={inputArchivo} type="file" accept=".xlsx" hidden
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setRevCartera(null); void leerArchivo(f) } }} />
          </Bloque>
        </>)}

        {etapa === 'revisar' && (<>
          {!soloCartera && (<>
            <Bloque titulo="Organización">
              <p className="text-(--fg-2)">
                {orgFija ? <>Se suma a <b className="text-foreground">{nombreDeLaOrg}</b>, ya vinculada al lead.</>
                  : orgId ? <>Se vincula <b className="text-foreground">{nombreDeLaOrg}</b> al lead y se le suma el equipo.</>
                  : <>Se crea <b className="text-foreground">{nombre.trim()}</b>{webNormalizada ? <> con la web <b className="text-foreground">{webNormalizada}</b></> : ' sin web'}.</>}
              </p>
            </Bloque>
            <Bloque titulo="Equipo" nota={revCuentas?.estado === 'cargando' ? 'Revisando quién ya tiene cuenta…' : undefined}>
              {revCuentas?.estado === 'error' && <p className="text-destructive">No se pudo revisar: {revCuentas.error}</p>}
              <div className="overflow-x-auto rounded-md border border-(--line)">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <tbody>
                    {equipo.map(p => {
                      const c = cuentaDe(p)
                      const res = revCuentas?.estado === 'lista' ? revCuentas.porEmail.get(c.email) : undefined
                      return (
                        <tr key={p.clave} className="border-t border-(--line) first:border-t-0">
                          <td className="px-2.5 py-2">
                            {c.first_name} {c.last_name}
                            {p.responsable && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Responsable</span>}
                          </td>
                          <td className="px-2.5 py-2 text-(--fg-2)">{c.email}</td>
                          <td className="px-2.5 py-2 tabular-nums text-(--fg-2)">{c.phone || '—'}</td>
                          <td className="px-2.5 py-2">{ROL[c.role]}</td>
                          <td className="px-2.5 py-2 font-mono text-[12px]">{res?.status === 'skipped_existing' ? <span className="font-sans text-(--fg-muted)">la suya</span> : c.password}</td>
                          <td className="px-2.5 py-2 text-right">
                            {!orgId ? <Pastilla tono="ok">Se crea</Pastilla>
                              : revCuentas?.estado === 'cargando' ? <Loader2 className="ml-auto size-3.5 animate-spin" />
                              : !res ? <span className="text-(--fg-muted)">—</span>
                              : res.status === 'failed' ? <Pastilla tono="mal">{res.error}</Pastilla>
                              : res.status === 'skipped_existing' ? <Pastilla>Ya tiene cuenta</Pastilla>
                              : <Pastilla tono="ok">Se crea</Pastilla>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Bloque>
          </>)}
          <Bloque titulo={cartera ? `Cartera · ${cartera.archivo}` : 'Cartera'}>
            {!cartera ? <p className="text-(--fg-muted)">No se sube ahora: se importa después con «Importar cartera».</p>
              : !orgId ? <p className="text-(--fg-2)">Se revisa apenas exista la organización (los agentes del Excel se buscan entre sus cuentas). Las filas con error no entran y quedan listadas al final; corregidas, se vuelve a importar y entra solo lo que falta.</p>
              : revCartera === 'cargando' ? <p className="flex items-center gap-2 text-(--fg-muted)"><Loader2 className="size-4 animate-spin" /> Revisando el Excel…</p>
              : revCartera && !revCartera.ok ? <p className="text-destructive">{revCartera.error}</p>
              : revCartera && <RevisionDeLaCartera rev={revCartera} />}
          </Bloque>
        </>)}

        {(etapa === 'corriendo' || etapa === 'listo') && (<>
          {etapa === 'listo' && resumen && (
            <div className="flex flex-wrap gap-2">
              {!soloCartera && <Cifra n={resumen.cuentasNuevas + resumen.cuentasYaTenian} rotulo={resumen.cuentasYaTenian ? `cuentas (${resumen.cuentasYaTenian} ya existían)` : 'cuentas creadas'} tono="ok" />}
              {cartera && <Cifra n={resumen.propiedades} rotulo={resumen.propiedadesYaEstaban ? `propiedades nuevas · ${resumen.propiedadesYaEstaban} ya estaban` : 'propiedades nuevas'} tono="ok" />}
              {cartera && fotosAUsar && <Cifra n={resumen.fotos} rotulo="fotos copiadas" />}
              {resumen.filasConError.length > 0 && <Cifra n={resumen.filasConError.length} rotulo="filas con error" tono="mal" />}
            </div>
          )}
          <ol className="flex flex-col gap-3">
            {pasos.map(p => (
              <li key={p.id} className={cn('flex items-start gap-3', p.estado === 'salteado' && 'text-(--fg-muted)')}>
                <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]',
                  p.estado === 'ok' ? 'border-success bg-success text-white'
                    : p.estado === 'error' ? 'border-destructive bg-destructive text-white'
                    : p.estado === 'corriendo' ? 'border-primary' : 'border-(--line-strong)')}>
                  {p.estado === 'ok' ? <Check className="size-3" /> : p.estado === 'error' ? <X className="size-3" />
                    : p.estado === 'corriendo' ? <Loader2 className="size-3 animate-spin text-primary" /> : p.estado === 'salteado' ? <Minus className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px]">{p.texto}</span>
                  {p.detalle && <span className={cn('block text-[12.5px]', p.estado === 'error' ? 'text-destructive' : 'text-(--fg-muted)')}>{p.detalle}</span>}
                  {p.avance !== undefined && (
                    <span className="mt-1.5 block h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-(--surface-2)">
                      <span className="block h-full bg-primary transition-[width]" style={{ width: `${Math.round(p.avance * 100)}%` }} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {etapa === 'listo' && resumen && (resumen.filasConError.length > 0 || resumen.fotosFallidas.length > 0) && (
            <Bloque titulo="Lo que no entró" nota="Corregí el Excel y volvé a importarlo: entra solo lo que falta">
              <ul className="max-h-48 overflow-y-auto rounded-md border border-(--line) text-[12.5px]">
                {resumen.filasConError.map(f => <li key={`p${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 last:border-0"><span className="tabular-nums text-(--fg-muted)">Fila {f.row_number}</span> · {f.error}</li>)}
                {resumen.fotosFallidas.map(f => <li key={`f${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 last:border-0"><span className="tabular-nums text-(--fg-muted)">Fotos, fila {f.row_number}</span> · {f.error}</li>)}
              </ul>
            </Bloque>
          )}
          {etapa === 'listo' && resumen?.leadsDePrueba && (
            <Bloque titulo="Leads de prueba" nota="El porcentaje es el que dio el motor de cruces con su piso">
              <TablaDeLeadsDePrueba resultado={resumen.leadsDePrueba} />
            </Bloque>
          )}
          {etapa === 'listo' && !soloCartera && <p className="text-(--fg-muted)">Lo que sigue: probar las cuentas y mandar los mails de accesos.</p>}
        </>)}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-(--line) px-5 py-3">
        {etapa === 'datos' && (<>
          <span className={cn('min-w-0 flex-1 text-[12.5px]', intento && faltas.length ? 'text-destructive' : 'text-(--fg-muted)')}>
            {intento && faltas.length ? faltas.join(' · ')
              : soloCartera ? 'Se revisa antes de importar nada.'
              : cartera ? 'Se revisa todo antes de crear nada.' : 'Sin Excel: se da de alta solo el equipo.'}
          </span>
          <Button size="sm" variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button size="sm" disabled={leyendo} onClick={irARevisar}>Revisar →</Button>
        </>)}
        {etapa === 'revisar' && (<>
          <span className={cn('min-w-0 flex-1 text-[12.5px]', !puedeConfirmar && cuentasRevisadas && carteraRevisada ? 'text-destructive' : 'text-(--fg-muted)')}>
            {cuentasConError.length ? 'Hay cuentas que no se pueden crear: corregí los emails.'
              : !algoParaImportar ? 'No hay nada nuevo para importar.'
              : 'Todavía no se creó nada.'}
          </span>
          <Button size="sm" variant="outline" onClick={() => setEtapa('datos')}>← Corregir</Button>
          <Button size="sm" disabled={!puedeConfirmar} onClick={() => void correr()}>
            {soloCartera ? 'Importar' : 'Confirmar y dar de alta'}
          </Button>
        </>)}
        {etapa === 'corriendo' && (
          ocupado
            ? <span className="text-[12.5px] text-(--fg-muted)">No cierres la ventana. Si se corta, «Reintentar» sigue desde donde quedó.</span>
            : fallo && (<>
              <span className="min-w-0 flex-1 text-[12.5px] text-destructive">Se cortó. Lo hecho quedó: reintentar saltea lo que ya está.</span>
              <Button size="sm" variant="outline" onClick={onCerrar}>Cerrar</Button>
              <Button size="sm" onClick={() => void correr()}>Reintentar</Button>
            </>)
        )}
        {etapa === 'listo' && <Button size="sm" className="ml-auto" onClick={onCerrar}>Listo</Button>}
      </footer>
    </>
  )
}

function Bloque({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13.5px] font-semibold">{titulo}</h3>
        {nota && <span className="text-[12px] text-(--fg-muted)">{nota}</span>}
      </div>
      {children}
    </section>
  )
}

function Campo({ rotulo, ayuda, children }: { rotulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-(--fg-2)" title={ayuda}>
      {rotulo}
      {children}
    </label>
  )
}

function Pastilla({ tono, children }: { tono?: 'ok' | 'mal'; children: ReactNode }) {
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11.5px] font-medium',
      tono === 'ok' ? 'bg-success/10 text-success' : tono === 'mal' ? 'bg-destructive/10 text-destructive' : 'bg-(--surface-2) text-(--fg-muted)')}>
      {children}
    </span>
  )
}

function Cifra({ n, rotulo, tono }: { n: number; rotulo: string; tono?: 'ok' | 'mal' }) {
  return (
    <div className="min-w-32 rounded-lg border border-(--line) px-3 py-2">
      <b className={cn('block text-[20px] leading-tight tabular-nums', tono === 'ok' && 'text-success', tono === 'mal' && 'text-destructive')}>{n}</b>
      <span className="text-[12px] text-(--fg-muted)">{rotulo}</span>
    </div>
  )
}

function RevisionDeLaCartera({ rev }: { rev: Extract<RevisionDeCartera, { ok: true }> }) {
  const nuevas = rev.filas.filter(f => f.valid && !f.existing_property_id).length
  const yaEstaban = rev.filas.filter(f => f.existing_property_id).length
  const conAviso = rev.filas.filter(f => f.valid && !f.existing_property_id && f.warnings.length)
  const conError = rev.filas.filter(f => !f.valid)
  const rf = rev.fotos
  const fotosConError = rf?.ok ? rf.rows.filter(f => f.status === 'invalid') : []
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        <Cifra n={nuevas} rotulo="propiedades nuevas" tono="ok" />
        {yaEstaban > 0 && <Cifra n={yaEstaban} rotulo="ya estaban: no se tocan" />}
        {conAviso.length > 0 && <Cifra n={conAviso.length} rotulo="entran con aviso" />}
        {conError.length > 0 && <Cifra n={conError.length} rotulo="con error: no entran" tono="mal" />}
        {rf?.ok && <Cifra n={rf.new} rotulo={rf.existing ? `fotos nuevas · ${rf.existing} ya estaban` : 'fotos nuevas'} />}
      </div>
      {rf && !rf.ok && <p className="text-destructive">Hoja «{HOJA_DE_FOTOS}»: {rf.error}</p>}
      {(conError.length > 0 || conAviso.length > 0 || fotosConError.length > 0) && (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-(--line) text-[12.5px]">
          {conError.map(f => <li key={`e${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 text-destructive last:border-0"><span className="tabular-nums">Fila {f.row_number}</span> · {f.errors.join(' · ')}</li>)}
          {fotosConError.map(f => <li key={`f${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 text-destructive last:border-0"><span className="tabular-nums">Fotos, fila {f.row_number}</span> · {f.errors.join(' · ')}</li>)}
          {conAviso.map(f => <li key={`a${f.row_number}`} className="border-b border-(--line) px-2.5 py-1.5 text-(--fg-2) last:border-0"><span className="tabular-nums text-(--fg-muted)">Fila {f.row_number}</span> · {f.warnings.join(' · ')}</li>)}
        </ul>
      )}
    </div>
  )
}
