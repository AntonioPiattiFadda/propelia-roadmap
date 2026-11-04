import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Copy, ExternalLink, FolderOpen, NotebookPen, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { CRM_KEYS } from '../hooks/keys'
import { useGuardarNotasDeDemo, useNotasDeDemo } from '../hooks/useGuionDeDemo'
import { armarMetaDeActividad } from '../lib/actividad'
import { mensajeDeError } from '../lib/errores'
import { CUENTA_DEMO, ETAPAS_DEL_GUION, MATERIAL_DE_DEMO, TELEFONO_DEL_BOT, textoDeLasNotasDeDemo, type EtapaDelGuion } from '../lib/guionDeDemo'
import { crearComentario } from '../service/crm.service'

/* La pestaña «Demo» del lead (4/11/2026, por pedido). Tres piezas, de arriba abajo:
   - «Material para la demo»: un botón que abre el material solo cuando se lo va a usar, y se
     cierra al tocar afuera.
   - La guía: los cinco pasos en fila; los que tienen detalle lo muestran al pasar el cursor.
   - Un solo cuadro de notas, fijo, para anotar todo lo de la demo. Se guarda solo, 700 ms después
     de la última tecla y al salir, como la nota del backlog. */
const ESPERA_AL_GUARDAR = 700

const ROTULO = 'text-[10.5px] font-bold uppercase leading-none tracking-[0.08em] text-(--fg-muted)'
const BOTON_DE_MATERIAL = 'flex h-9 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium text-foreground hover:bg-(--surface-2)'

function Copiable({ rotulo, valor }: { rotulo: string; valor: string }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor)
      toast.success(`${rotulo} copiado`)
    } catch { toast.error('No se pudo copiar') }
  }
  return (
    <button type="button" onClick={copiar} title={`Copiar ${rotulo.toLowerCase()}`}
      className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-(--surface-2)">
      <span className="w-12 shrink-0 text-[11.5px] text-(--fg-muted)">{rotulo}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">{valor}</span>
      <Icon icon={Copy} size="xs" className="text-(--fg-faint)" />
    </button>
  )
}

function MaterialDeDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Icon icon={FolderOpen} size="sm" />Material para la demo</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        {([
          [MATERIAL_DE_DEMO.web, 'Propelia (CRM)'],
          [MATERIAL_DE_DEMO.planes, 'Planes y precios'],
          [MATERIAL_DE_DEMO.onboarding, 'Plan de onboarding'],
        ] as const).map(([href, label]) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={BOTON_DE_MATERIAL}>
            <Icon icon={ExternalLink} size="sm" className="text-(--fg-muted)" />{label}
          </a>
        ))}
        <a href={`tel:${TELEFONO_DEL_BOT.tel}`} className={BOTON_DE_MATERIAL}>
          <Icon icon={Phone} size="sm" className="text-(--fg-muted)" />Bot de llamadas · {TELEFONO_DEL_BOT.visible}
        </a>
        <div className="mt-1 pt-2 [border-top:1px_solid_var(--line)]">
          <p className={cn(ROTULO, 'px-2.5 pb-1')}>Usuario demo de propelia.es</p>
          <Copiable rotulo="Usuario" valor={CUENTA_DEMO.usuario} />
          <Copiable rotulo="Clave" valor={CUENTA_DEMO.clave} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PasoDeLaGuia({ etapa, numero }: { etapa: EtapaDelGuion; numero: number }) {
  const paso = (
    <div tabIndex={etapa.detalle ? 0 : undefined}
      className={cn('flex h-full min-w-0 items-center gap-2 rounded-lg bg-card px-3 py-2.5 [border:1px_solid_var(--line)]',
        etapa.detalle && 'cursor-help outline-none hover:[border-color:var(--line-strong)] focus-visible:ring-2 focus-visible:ring-ring')}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--surface-2) text-[11px] font-bold tabular-nums text-(--fg-muted)">
        {numero}
      </span>
      <span className="text-[13px] font-semibold leading-tight text-foreground">{etapa.titulo}</span>
    </div>
  )
  if (!etapa.detalle) return paso
  return (
    <Tooltip>
      <TooltipTrigger asChild>{paso}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6} className="max-w-sm px-3.5 py-3 text-left text-[12.5px] leading-snug">
        <div className="flex flex-col gap-2.5">
          {etapa.detalle.map((g, i) => (
            <div key={g.titulo ?? i}>
              {g.titulo && <p className="pb-1 text-[11px] font-bold uppercase tracking-[0.06em] opacity-80">{g.titulo}</p>}
              <ul className="flex flex-col gap-0.5">
                {g.items.map(item => <li key={item} className="list-inside list-disc">{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function NotasDeDemo({ leadId, puedeEscribir }: { leadId: string; puedeEscribir: boolean }) {
  const notasQ = useNotasDeDemo(leadId)
  const guardar = useGuardarNotasDeDemo(leadId)
  // Lo que se ve es lo local: lo que vuelve de la base no pisa lo que se está escribiendo.
  const [texto, setTexto] = useState<string | null>(null)
  const pendiente = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const guardarRef = useRef(guardar.mutate)
  guardarRef.current = guardar.mutate

  useEffect(() => {
    if (texto === null && notasQ.data !== undefined) setTexto(notasQ.data)
  }, [notasQ.data, texto])

  const enviar = () => {
    clearTimeout(timer.current)
    const t = pendiente.current
    if (t === null) return
    pendiente.current = null
    guardarRef.current(t, { onError: () => toast.error('No se pudieron guardar las notas de la demo') })
  }
  // Al salir de la pestaña o del lead, se manda lo que quedó esperando.
  useEffect(() => () => enviar(), [])

  const cambiar = (t: string) => {
    setTexto(t)
    pendiente.current = t
    clearTimeout(timer.current)
    timer.current = setTimeout(enviar, ESPERA_AL_GUARDAR)
  }

  // «Registrar» (4/11/2026, por pedido): lo anotado pasa a la actividad del lead como «Demo
  // realizada», resaltada, y el cuadro queda vacío, para que un segundo clic no la repita. Si falla, lo escrito sigue ahí.
  const qc = useQueryClient()
  const registrar = useMutation({
    mutationFn: (descripcion: string) => crearComentario({
      lead_id: leadId, description: descripcion, long_description: armarMetaDeActividad({ tipo: 'demoHecha', con: [] }),
    }),
    onSuccess: () => {
      toast.success('Demo registrada en la actividad')
      void qc.invalidateQueries({ queryKey: CRM_KEYS.detalle(leadId) })
      cambiar('')
      enviar()
    },
    onError: error => { toast.error(`No se registraron las notas: ${mensajeDeError(error)}`) },
  })
  const paraRegistrar = textoDeLasNotasDeDemo(texto ?? '')

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className={ROTULO}>Notas de la demo</h3>
        {puedeEscribir && (
          <Button size="sm" disabled={!paraRegistrar || registrar.isPending}
            title={paraRegistrar ? 'Pasar lo anotado a la actividad del lead como «Demo realizada»' : 'Anotá algo para poder registrarlo'}
            onClick={() => { if (paraRegistrar) registrar.mutate(paraRegistrar) }}>
            <Icon icon={NotebookPen} size="sm" />{registrar.isPending ? 'Registrando…' : 'Registrar'}
          </Button>
        )}
      </div>
      {notasQ.isError
        ? <p className="text-[13px] text-destructive">No se pudieron leer las notas de esta demo.</p>
        : (
          <Textarea value={texto ?? ''} readOnly={!puedeEscribir} disabled={texto === null} onBlur={enviar}
            onChange={e => cambiar(e.target.value)}
            placeholder={texto === null ? 'Cargando…' : 'Anotá lo que vaya saliendo en cada etapa: quiénes están, cómo trabajan, qué les duele, qué les gustó, qué plan encaja, próximo paso…'}
            className="min-h-48 flex-1 resize-none text-[13px] leading-relaxed md:text-[13px]" />
        )}
    </section>
  )
}

export function GuionDeDemo({ leadId, puedeEscribir }: { leadId: string; puedeEscribir: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 max-md:px-3">
      <div><MaterialDeDemo /></div>

      <section className="flex flex-col gap-1.5">
        <h3 className={ROTULO}>Guía de la demo</h3>
        <ol className="flex flex-wrap items-stretch gap-1.5">
          {ETAPAS_DEL_GUION.map((e, i) => (
            <li key={e.id} className="flex items-center gap-1.5">
              <PasoDeLaGuia etapa={e} numero={i + 1} />
              {i < ETAPAS_DEL_GUION.length - 1 && <Icon icon={ChevronRight} size="sm" className="text-(--fg-faint)" />}
            </li>
          ))}
        </ol>
      </section>

      <NotasDeDemo leadId={leadId} puedeEscribir={puedeEscribir} />
    </div>
  )
}
