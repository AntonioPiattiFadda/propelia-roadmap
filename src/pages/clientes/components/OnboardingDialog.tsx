import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, MessageCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { enlaceAlCrm } from '@/pages/crm/lib/leadFilterParams'
import { enlaceDeWhatsapp, esMovil } from '@/pages/crm/lib/whatsapp'
import type { Usuario } from '@/pages/crm/types'
import { useAsignarOnboarding, useCompletarOnboarding } from '../hooks/useClientes'
import { listoParaCompletar, PASOS, pasoActual, pasoHecho } from '../lib/pasos'
import { PUENTE_SIMULADO } from '../service/puente'
import type { DatosDelAlta } from './datosDelAlta'
import { ComentariosDelLead } from './ComentariosDelLead'
import { TareaDelOnboarding } from './TareaDelOnboarding'

const fmtFecha = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

/* El onboarding de un cliente, en un dialog encima de la lista (`/clientes?lead=<id>`), como el
   detalle del producto y el `?lead=` del CRM. Los 7 pasos a la izquierda; los de «Próximamente»
   se ven pero no se abren. Arranca en el paso actual. A la derecha, los comentarios del lead
   (`ComentariosDelLead`); en pantallas angostas bajan debajo de las tareas. */
export function OnboardingDialog({ datos, lleva, yo, onCerrar }: {
  datos: DatosDelAlta | null; lleva: Usuario | undefined; yo: Usuario; onCerrar: () => void
}) {
  return (
    <Dialog open={datos != null} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent showCloseButton={false} onInteractOutside={e => e.preventDefault()}
        className="ui-scale dialog-fullscreen-mobile flex h-[88vh] max-h-none w-[min(1320px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{datos ? `Onboarding de ${datos.inmobiliaria}` : 'Onboarding'}</DialogTitle>
        <DialogDescription className="sr-only">Los pasos del alta del cliente, con sus tareas.</DialogDescription>
        {datos && <Cuerpo key={datos.o.id} datos={datos} lleva={lleva} yo={yo} onCerrar={onCerrar} />}
      </DialogContent>
    </Dialog>
  )
}

function Cuerpo({ datos, lleva, yo, onCerrar }: { datos: DatosDelAlta; lleva: Usuario | undefined; yo: Usuario; onCerrar: () => void }) {
  const hechas = new Set(datos.o.tareas.map(t => t.task_id))
  const actual = pasoActual(hechas)
  const [abierto, setAbierto] = useState(actual ?? 0)
  const asignar = useAsignarOnboarding()
  const completar = useCompletarOnboarding()
  const paso = PASOS[abierto]
  // El chat vacío con el responsable; sin número válido no hay botón.
  const whatsapp = datos.telefono ? enlaceDeWhatsapp(datos.telefono, '', { web: !esMovil() }) : null

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-(--line) bg-(--surface-2) px-5 py-3">
        <h2 className="text-[17px] font-semibold">{datos.inmobiliaria}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-(--fg-2)">
          <span>Responsable <b className="text-foreground">{datos.nombreResponsable || '—'}</b>{datos.telefono && ` · ${datos.telefono}`}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" title="Abrir WhatsApp" aria-label="Abrir WhatsApp"
                className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full align-middle text-success hover:bg-success/15">
                <MessageCircle className="size-3.5" />
              </a>
            )}
          </span>
          <span>Org <b className="text-foreground">{datos.orgId ? 'vinculada' : 'sin crear'}</b></span>
          <span>Firmó <b className="text-foreground">{fmtFecha.format(new Date(datos.o.created_at))}</b></span>
          <span>Lleva <b className="text-foreground">{lleva?.nombre ?? 'nadie'}</b>
            {lleva?.id !== yo.id && (
              <button type="button" className="ml-1.5 cursor-pointer text-primary underline-offset-2 hover:underline"
                onClick={() => asignar.mutate({ onboardingId: datos.o.id, userId: yo.id })}>Tomar</button>
            )}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {PUENTE_SIMULADO && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-(--fg-2)" title="El puente con Propelia todavía no está deployado: nada se crea allá.">Puente simulado</span>}
          <Button size="sm" variant="outline" asChild>
            <Link to={enlaceAlCrm({ lead: datos.o.lead.id })} target="_blank"><ExternalLink className="size-4" /> Lead en el CRM</Link>
          </Button>
          {listoParaCompletar(hechas) && (
            <Button size="sm" disabled={completar.isPending} onClick={() => completar.mutate(datos.o.id, { onSuccess: onCerrar })}>
              <Check className="size-4" /> Marcar completo
            </Button>
          )}
          <Button size="icon" variant="ghost" className="size-8" aria-label="Cerrar" onClick={onCerrar}><X className="size-4" /></Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_320px] max-lg:grid-cols-[240px_minmax(0,1fr)] max-lg:grid-rows-[minmax(0,1fr)_260px] max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)_240px]">
        <ol className="flex flex-col gap-0.5 overflow-y-auto border-r border-(--line) p-2 max-md:flex-row max-md:overflow-x-auto max-md:border-r-0 max-md:border-b">
          {PASOS.map((p, i) => {
            const hecho = !p.proximamente && pasoHecho(p, hechas)
            return (
              <li key={p.id}>
                <button type="button" disabled={p.proximamente} aria-current={i === abierto ? 'step' : undefined} onClick={() => setAbierto(i)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] max-md:w-max',
                    i === abierto ? 'bg-primary/10 font-semibold' : 'hover:bg-(--surface-2)', p.proximamente ? 'cursor-default opacity-55' : 'cursor-pointer')}>
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-[11px] font-semibold tabular-nums',
                    hecho ? 'border-success bg-success text-white' : i === actual ? 'border-primary text-primary' : 'border-(--line-strong) text-(--fg-muted)')}>
                    {hecho ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{p.titulo}</span>
                    {p.proximamente && <span className="block text-[11px] font-normal text-(--fg-muted)">Próximamente</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto p-5">
          <h3 className="mb-1 text-[15px] font-semibold">{abierto + 1} · {paso.titulo}</h3>
          {paso.tareas.map(t => <TareaDelOnboarding key={t.id} datos={datos} paso={paso} tarea={t} />)}
          {paso.id === 'contacto' && (
            <p className="mt-2 text-[12px] text-(--fg-muted)">
              El cliente carga su equipo en la página de alta (el enlace va en el WhatsApp y se copia con 🔗). Lo que envía se ve en «Importar».
            </p>
          )}
        </section>
        <div className="flex min-h-0 flex-col max-lg:col-span-2 max-md:col-span-1">
          <ComentariosDelLead leadId={datos.o.lead.id} />
        </div>
      </div>
    </>
  )
}
