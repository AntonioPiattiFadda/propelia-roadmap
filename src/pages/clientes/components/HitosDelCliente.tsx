import { Check } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  calendarioListo, hechoPorTareas, HITOS, tareaDeHito, type Hito,
} from '../../../../supabase/functions/_shared/hitosDeOnboarding.ts'
import { useMarcarTarea, useOrganizacion } from '../hooks/useClientes'
import type { DatosDelAlta } from './datosDelAlta'

const BLOQUES = [
  { id: 'prueba', titulo: '15 días de prueba gratis' },
  { id: 'despues', titulo: 'Tras la prueba' },
] as const

/* Lo que ve el cliente en crm.propelia.es/onboarding (6/11/2026, por pedido): los siete hitos de la
   página, con el mismo cálculo que `onboarding-progreso` (`_shared/hitosDeOnboarding.ts`). Cada uno se
   da por hecho solo (por las tareas del alta, o el calendario de todo el equipo en «Google») o con el
   tilde a mano de acá, que es la única forma para los que no tienen tareas. */
export function HitosDelCliente({ datos }: { datos: DatosDelAlta }) {
  const hechas = new Set(datos.o.tareas.map(t => t.task_id))
  const org = useOrganizacion(datos.orgId)
  const equipo = org.data?.agents ?? []
  const marcar = useMarcarTarea()

  const porSolo = (h: Hito) => hechoPorTareas(h, hechas) || ('calendario' in h && h.calendario && calendarioListo(equipo))
  const hechos = HITOS.filter(h => hechas.has(tareaDeHito(h.id)) || porSolo(h)).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-(--fg-2)">
        El cliente ve estos hitos en <b className="text-foreground">crm.propelia.es/onboarding</b>, solo mirando:
        {' '}<b className="text-foreground">{hechos} de {HITOS.length}</b> hechos.
        {!datos.orgId && ' Sin org vinculada todavía no lo puede abrir.'}
      </p>
      {BLOQUES.map(b => (
        <section key={b.id}>
          <h4 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-(--fg-muted)">{b.titulo}</h4>
          <ul className="flex flex-col gap-1">
            {HITOS.filter(h => h.bloque === b.id).map(h => {
              const aMano = hechas.has(tareaDeHito(h.id))
              const solo = porSolo(h)
              const conectados = equipo.filter(a => a.calendar_connected).length
              return (
                <li key={h.id} className={cn('flex items-start gap-2.5 rounded-lg border border-(--line) px-3 py-2.5', (aMano || solo) && 'border-success/40 bg-success/5')}>
                  <Checkbox className="mt-0.5" checked={aMano} aria-label={`Marcar «${h.titulo}» a mano`}
                    onCheckedChange={v => marcar.mutate({ onboardingId: datos.o.id, taskId: tareaDeHito(h.id), hecha: v === true })} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium">{h.titulo}</div>
                    <div className="text-[12px] text-(--fg-muted)">
                      {h.tareas.length > 0 && (solo ? 'Hecho por las tareas del alta' : 'Se da por hecho al completar sus tareas del alta')}
                      {'calendario' in h && (!datos.orgId ? 'Se da por hecho cuando todo el equipo conecte Google Calendar'
                        : org.isLoading ? 'Mirando el calendario del equipo…'
                        : `Calendario: ${conectados} de ${equipo.length} conectados${solo ? ' · hecho' : ''}`)}
                      {h.tareas.length === 0 && !('calendario' in h) && 'Solo a mano'}
                    </div>
                  </div>
                  {solo && <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Hecho solo" />}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
