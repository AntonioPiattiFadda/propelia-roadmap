import { useRef, useState, type ReactNode } from 'react'
import { ChevronRight, CreditCard, Download, FlaskConical, Inbox, Link, Link2, Loader2, Mail, RotateCcw, Upload, Users } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { leerPrimeraHoja } from '@/pages/crm/service/excel'
import { useEmailsQueNoLlegaron } from '@/pages/crm/hooks/useEmails'
import { motivoLegible, noLlegaronDelLead, rotuloDelEstado } from '@/pages/crm/lib/emails'
import type { Celda } from '@/pages/crm/lib/importarLote'
import { useMarcarTarea, useReabrirAlta } from '../hooks/useClientes'
import { estadoDelAlta } from '../lib/equipo'
import { listaDeMailsQueNoLlegaron } from '../lib/mensajes'
import { claveDeTarea, TAREA_CORREGIR_MAILS, TAREA_CREDENCIALES, type Accion, type Paso, type PlantillaId, type Tarea } from '../lib/pasos'
import { descargarExcel } from '../service/excel'
import { enviarLeadDePrueba, getColumnasDeCartera, PUENTE_SIMULADO } from '../service/puente'
import { ConfirmarAccesosDialog } from './ConfirmarAccesosDialog'
import { CuentasCreadas } from './CuentasCreadas'
import { copiarTexto, EnviarPorWhatsapp } from './EnviarPorWhatsapp'
import { ImportarCarteraPanel } from './ImportarCarteraPanel'
import { ImportarUsuariosPanel } from './ImportarUsuariosPanel'
import { DireccionesPanel, LinkDePagoPanel, PagoPanel } from './PanelesDelPuente'
import type { DatosDelAlta } from './datosDelAlta'

/** Lo que cuelga debajo de la tarea mientras se usa una acción. */
type Panel =
  | { tipo: 'usuarios' }
  | { tipo: 'cartera'; archivo: string; hoja: string[][] }
  | { tipo: 'link' } | { tipo: 'pago' } | { tipo: 'direcciones' }

const SIN_ORG = 'Primero importá el equipo: crea la organización en Propelia'
const SIN_ENVIAR = 'Todavía no lo envió: el cliente carga su equipo en la página de alta'
const fecha = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const celdaATexto = (c: Celda) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))
const slug = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/* Un renglón del paso: el tilde y el texto a la izquierda, sus acciones a la derecha y, debajo, el
   mensaje plegado (si es un WhatsApp) o el panel de la acción que se está usando. Las acciones
   hacen el trabajo; tildar sigue siendo a mano, salvo «Recibir el equipo» (lo tilda la base cuando
   el cliente envía la página de alta), los dos imports y el envío de accesos, que tildan solos (y
   este último no se tilda a mano: abre la confirmación). */
export function TareaDelOnboarding({ datos, paso, tarea }: { datos: DatosDelAlta; paso: Paso; tarea: Tarea }) {
  const clave = claveDeTarea(paso.id, tarea.id)
  const hecha = datos.o.tareas.some(t => t.task_id === clave)
  const marcar = useMarcarTarea()
  const reabrir = useReabrirAlta()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState<Accion | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const alElegir = useRef<(f: File) => void>(() => {})
  const wa = tarea.acciones?.find(a => a.startsWith('wa:'))
  /* Los mails de accesos que no llegaron: los trae el webhook de Resend a `crm_emails` (la misma
     query de la campana, que `useAvisosDeEmails` refresca cada 30 s). La tarea del CRM la crea la base. */
  const emails = useEmailsQueNoLlegaron({ enabled: clave === TAREA_CREDENCIALES })
  const accesosQueNoLlegaron = clave === TAREA_CREDENCIALES
    ? noLlegaronDelLead(emails.data ?? [], datos.o.lead.id).filter(e => e.plantilla === 'acceso')
    : []
  /* El WhatsApp de los accesos es UNO (28/10/2026, por pedido): «ya tenéis los accesos» y, si algún
     mail no llegó, debajo el pedido de los emails bien escritos (`corregir_mails`). */
  const texto = wa ? datos.mensaje(wa.slice(3) as PlantillaId) : null
  const pedidoDeMails = accesosQueNoLlegaron.length
    ? datos.mensaje('corregir_mails', { mails: listaDeMailsQueNoLlegaron(accesosQueNoLlegaron.map(e => e.to_email), datos.o.miembros) })
    : null
  const mensaje = texto && pedidoDeMails ? `${texto}\n\n${pedidoDeMails}` : texto

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
      case 'link-alta':
        return (
          <Button key={a} size="icon" variant="outline" className="size-8" title={`Copiar el enlace: ${datos.linkAlta}`}
            aria-label="Copiar el enlace de la página de alta" onClick={() => void copiarTexto(datos.linkAlta, 'Enlace copiado')}>
            <Link className="size-4" />
          </Button>
        )
      case 'equipo-recibido': {
        const e = estadoDelAlta(datos.o, datos.o.miembros)
        if (!e.enviado) return <span key={a} className="text-[12px] text-(--fg-muted)">Esperando que lo envíe</span>
        return (
          <span key={a} className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium text-success">Enviado el {fecha(e.el)} · {e.personas} {e.personas === 1 ? 'persona' : 'personas'}</span>
            {/* Una vez importado, el equipo ya son cuentas en Propelia: corregirlo ahí, no acá. */}
            {!datos.orgId && (
              <Button size="icon" variant="ghost" className="size-7" title="Reabrir el enlace para que lo corrijan" aria-label="Reabrir el enlace"
                disabled={reabrir.isPending} onClick={() => reabrir.mutate(datos.o.id)}>
                {reabrir.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              </Button>
            )}
          </span>
        )
      }
      case 'importar-usuarios': {
        if (datos.orgId) return <span key={a} className="text-[12px] font-medium text-success">{datos.o.miembros.length} cuentas · org vinculada</span>
        const enviado = !!datos.o.submitted_at
        return (
          <Button key={a} size="sm" variant={panel?.tipo === 'usuarios' ? 'secondary' : 'outline'} className="h-8"
            disabled={!enviado} title={enviado ? undefined : SIN_ENVIAR} onClick={() => alternar({ tipo: 'usuarios' })}>
            <Users className="size-4" /> Importar
          </Button>
        )
      }
      case 'mails':
        return boton(<Mail className="size-4" />, 'Enviar mails', () => setConfirmando(true), { requiereOrg: true })
      case 'plantilla-cartera':
        return (
          <Button key={a} size="icon" variant="outline" className="size-8" title="Descargar la plantilla de la cartera" aria-label="Descargar la plantilla de la cartera"
            disabled={ocupado === a} onClick={() => void ocupar(a, async () => {
              const cols = await getColumnasDeCartera()
              await descargarExcel(`cartera-${slug(datos.inmobiliaria) || 'inmobiliaria'}.xlsx`, [cols.map(c => c.header), cols.map(c => String(c.example))])
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
            {wa && <EnviarPorWhatsapp texto={mensaje} telefono={datos.telefono} />}
            {tarea.acciones.filter(a => !a.startsWith('wa:')).map(accion)}
          </div>
        )}
      </div>
      {wa && mensaje && <VerMensaje texto={mensaje} />}
      {tarea.acciones?.includes('importar-usuarios') && datos.orgId && datos.o.miembros.length > 0 && (
        <CuentasCreadas datos={datos} />
      )}
      {accesosQueNoLlegaron.length > 0 && (
        <ul className="ml-6.5 flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px]">
          {accesosQueNoLlegaron.map(e => (
            <li key={e.id} title={e.status_detail ?? undefined}>
              <b className="text-destructive">{rotuloDelEstado(e.status)}</b> el mail a <b>{e.to_email}</b>
              {motivoLegible(e) && <span className="text-(--fg-muted)"> · {motivoLegible(e)}</span>}
            </li>
          ))}
          <li className="text-(--fg-muted)">Quedó una tarea «Revisar el mail de acceso…» en el lead.</li>
        </ul>
      )}
      {accesosQueNoLlegaron.length > 0 && (() => {
        const corregido = datos.o.tareas.some(t => t.task_id === TAREA_CORREGIR_MAILS)
        return (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px]">
            <Checkbox className="mt-0.5" checked={corregido}
              onCheckedChange={v => marcar.mutate({ onboardingId: datos.o.id, taskId: TAREA_CORREGIR_MAILS, hecha: v === true })} />
            <span className={cn(corregido && 'text-(--fg-muted) line-through')}>
              Pedirle al cliente los mails que están mal <span className="text-(--fg-muted)">(va en el mismo WhatsApp de arriba)</span>
            </span>
          </label>
        )
      })()}
      {panel && (
        <div className="ml-6.5">
          {panel.tipo === 'usuarios' && <ImportarUsuariosPanel datos={datos} onCerrar={() => setPanel(null)} />}
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

/** El WhatsApp completo, plegado debajo de la tarea. */
function VerMensaje({ texto }: { texto: string }) {
  return (
    <details className="group ml-6.5 text-[12.5px]">
      <summary className="flex w-max cursor-pointer list-none items-center gap-1 text-(--fg-muted) hover:text-foreground">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Ver mensaje
      </summary>
      <p className="mt-1.5 whitespace-pre-line rounded-md border border-(--line) bg-(--surface-2) p-3 text-(--fg-2)">{texto}</p>
    </details>
  )
}
