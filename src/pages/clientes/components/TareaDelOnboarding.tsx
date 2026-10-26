import { useRef, useState, type ReactNode } from 'react'
import { ChevronRight, CreditCard, Download, FlaskConical, Inbox, Link2, Loader2, Mail, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { leerPrimeraHoja } from '@/pages/crm/service/excel'
import { useMarcarTarea } from '../hooks/useClientes'
import { nombreDelExcelDeUsuarios } from '../lib/mensajes'
import { claveDeTarea, TAREA_CREDENCIALES, type Accion, type Paso, type PlantillaId, type Tarea } from '../lib/pasos'
import { filasDeLaPlantilla, leerExcelDeUsuarios, type Celda, type ExcelDeUsuarios } from '../lib/usuariosExcel'
import { descargarExcel } from '../service/excel'
import { enviarLeadDePrueba, getColumnasDeCartera, PUENTE_SIMULADO } from '../service/puente'
import { ConfirmarAccesosDialog } from './ConfirmarAccesosDialog'
import { EnviarPorWhatsapp } from './EnviarPorWhatsapp'
import { ImportarCarteraPanel } from './ImportarCarteraPanel'
import { ImportarUsuariosPanel } from './ImportarUsuariosPanel'
import { DireccionesPanel, LinkDePagoPanel, PagoPanel } from './PanelesDelPuente'
import type { DatosDelAlta } from './datosDelAlta'

/** Lo que cuelga debajo de la tarea mientras se usa una acción. */
type Panel =
  | { tipo: 'usuarios'; archivo: string; excel: ExcelDeUsuarios }
  | { tipo: 'cartera'; archivo: string; hoja: string[][] }
  | { tipo: 'link' } | { tipo: 'pago' } | { tipo: 'direcciones' }

const SIN_ORG = 'Primero importá el Excel de usuarios: crea la organización en Propelia'
const celdaATexto = (c: Celda) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))
const slug = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/* Un renglón del paso: el tilde y el texto a la izquierda, sus acciones a la derecha y, debajo, el
   mensaje plegado (si es un WhatsApp) o el panel de la acción que se está usando. Las acciones
   hacen el trabajo; tildar sigue siendo a mano, salvo los dos imports y el envío de accesos, que
   tildan solos (y este último no se tilda a mano: abre la confirmación). */
export function TareaDelOnboarding({ datos, paso, tarea }: { datos: DatosDelAlta; paso: Paso; tarea: Tarea }) {
  const clave = claveDeTarea(paso.id, tarea.id)
  const hecha = datos.o.tareas.some(t => t.task_id === clave)
  const marcar = useMarcarTarea()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState<Accion | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const alElegir = useRef<(f: File) => void>(() => {})
  const wa = tarea.acciones?.find(a => a.startsWith('wa:'))
  const texto = wa ? datos.mensaje(wa.slice(3) as PlantillaId) : null

  const tildar = (v: boolean) => {
    if (clave === TAREA_CREDENCIALES && v) { setConfirmando(true); return }
    marcar.mutate({ onboardingId: datos.o.id, taskId: clave, hecha: v })
  }
  const elegirArchivo = (fn: (f: File) => void) => {
    alElegir.current = fn
    if (archivo.current) { archivo.current.value = ''; archivo.current.click() }
  }
  const ocupar = async (a: Accion, fn: () => Promise<void>) => {
    setOcupado(a)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : 'Algo falló') } finally { setOcupado(null) }
  }
  const alternar = (p: Panel) => setPanel(actual => (actual?.tipo === p.tipo ? null : p))

  const accion = (a: Accion): ReactNode => {
    const conOrg = !!datos.orgId
    const boton = (icono: ReactNode, rotulo: string, onClick: () => void, opts: { requiereOrg?: boolean; activo?: boolean } = {}) => (
      <Button key={a} size="sm" variant={opts.activo ? 'secondary' : 'outline'} className="h-8"
        disabled={(opts.requiereOrg && !conOrg) || ocupado === a} title={opts.requiereOrg && !conOrg ? SIN_ORG : undefined} onClick={onClick}>
        {ocupado === a ? <Loader2 className="size-4 animate-spin" /> : icono}
        {rotulo}
      </Button>
    )
    switch (a) {
      case 'excel-usuarios':
        return (
          <Button key={a} size="icon" variant="outline" className="size-8" title={`Descargar ${nombreDelExcelDeUsuarios(datos.inmobiliaria)}`}
            aria-label="Descargar el Excel de usuarios" disabled={ocupado === a}
            onClick={() => void ocupar(a, () => descargarExcel(nombreDelExcelDeUsuarios(datos.inmobiliaria), filasDeLaPlantilla(datos.responsable ? {
              nombre: datos.responsable.first_name, apellido: datos.responsable.last_name, email: datos.responsable.email, telefono: datos.responsable.phone,
            } : undefined)))}>
            {ocupado === a ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </Button>
        )
      case 'importar-usuarios':
        if (datos.orgId) return <span key={a} className="text-[12px] font-medium text-success">{datos.o.miembros.length} cuentas · org vinculada</span>
        return boton(<Upload className="size-4" />, 'Importar', () => elegirArchivo(f => void ocupar(a, async () => {
          setPanel({ tipo: 'usuarios', archivo: f.name, excel: leerExcelDeUsuarios(await leerPrimeraHoja(f)) })
        })))
      case 'mails':
        return boton(<Mail className="size-4" />, 'Enviar mails', () => setConfirmando(true), { requiereOrg: true })
      case 'plantilla-cartera':
        return (
          <Button key={a} size="icon" variant="outline" className="size-8" title="Descargar la plantilla de la cartera" aria-label="Descargar la plantilla de la cartera"
            disabled={ocupado === a} onClick={() => void ocupar(a, async () => {
              const cols = await getColumnasDeCartera()
              await descargarExcel(`cartera-${slug(datos.inmobiliaria) || 'inmobiliaria'}.xlsx`, [cols.map(c => c.header), cols.map(c => c.example)])
            })}>
            {ocupado === a ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </Button>
        )
      case 'importar-cartera':
        return boton(<Upload className="size-4" />, 'Importar', () => elegirArchivo(f => void ocupar(a, async () => {
          const hoja = (await leerPrimeraHoja(f)).map(fila => fila.map(celdaATexto))
          setPanel({ tipo: 'cartera', archivo: f.name, hoja })
        })), { requiereOrg: true })
      case 'link-pago': return boton(<Link2 className="size-4" />, 'Generar link', () => alternar({ tipo: 'link' }), { requiereOrg: true, activo: panel?.tipo === 'link' })
      case 'ver-pago': return boton(<CreditCard className="size-4" />, 'Ver pago', () => alternar({ tipo: 'pago' }), { requiereOrg: true, activo: panel?.tipo === 'pago' })
      case 'direcciones': return boton(<Inbox className="size-4" />, 'Direcciones', () => alternar({ tipo: 'direcciones' }), { requiereOrg: true, activo: panel?.tipo === 'direcciones' })
      case 'simular-lead':
        // El producto solo simula en la org demo (`not_demo_org`): en la de un cliente, el lead
        // quedaría como real en su cartera. Con el puente de verdad esto contesta ese error.
        return boton(<FlaskConical className="size-4" />, 'Lead de prueba', () => void ocupar(a, async () => {
          const r = await enviarLeadDePrueba(datos.orgId!)
          toast.success(`Lead de prueba enviado a ${r.to}`, PUENTE_SIMULADO ? { description: 'Puente simulado: no salió ningún mail.' } : undefined)
        }), { requiereOrg: true })
      default:
        return null
    }
  }

  return (
    <div className="-mx-2 flex flex-col gap-2 rounded-lg px-2 py-1.5 hover:bg-(--surface-2)">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-[13.5px]">
          <Checkbox className="mt-0.5" checked={hecha} onCheckedChange={v => tildar(v === true)} />
          <span className={cn(hecha && 'text-(--fg-muted) line-through')}>{tarea.texto}</span>
        </label>
        {!!tarea.acciones?.length && (
          <div className="flex flex-wrap items-center gap-1.5 max-md:ml-6.5">
            {wa && <EnviarPorWhatsapp texto={texto} telefono={datos.telefono} />}
            {tarea.acciones.filter(a => !a.startsWith('wa:')).map(accion)}
          </div>
        )}
      </div>
      {wa && texto && (
        <details className="group ml-6.5 text-[12.5px]">
          <summary className="flex w-max cursor-pointer list-none items-center gap-1 text-(--fg-muted) hover:text-foreground">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Ver mensaje
          </summary>
          <p className="mt-1.5 whitespace-pre-line rounded-md border border-(--line) bg-(--surface-2) p-3 text-(--fg-2)">{texto}</p>
        </details>
      )}
      {panel && (
        <div className="ml-6.5">
          {panel.tipo === 'usuarios' && <ImportarUsuariosPanel datos={datos} archivo={panel.archivo} excel={panel.excel} onCerrar={() => setPanel(null)} />}
          {panel.tipo === 'cartera' && <ImportarCarteraPanel datos={datos} archivo={panel.archivo} hoja={panel.hoja} onCerrar={() => setPanel(null)} />}
          {panel.tipo === 'link' && <LinkDePagoPanel datos={datos} />}
          {panel.tipo === 'pago' && <PagoPanel datos={datos} />}
          {panel.tipo === 'direcciones' && <DireccionesPanel datos={datos} />}
        </div>
      )}
      <input ref={archivo} type="file" accept=".xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) alElegir.current(f) }} />
      {clave === TAREA_CREDENCIALES && <ConfirmarAccesosDialog datos={datos} abierto={confirmando} onCerrar={() => setConfirmando(false)} />}
    </div>
  )
}
