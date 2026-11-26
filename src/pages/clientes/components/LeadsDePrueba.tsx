import { useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { crearLeadsDePrueba, PUENTE_SIMULADO, type LeadDePrueba, type ResultadoDeLeadsDePrueba } from '../service/puente'

/* Leads de prueba en la org de Propelia (26/11/2026, por pedido): el set que se cargó a mano en
   Inmuga Homes, armado contra la cartera que la org ya tiene (`create_test_leads` del puente,
   PUENTE.md). 6 compradores con porcentajes de matching escalonados (100, 90, 80, 65, 50 y uno que
   no cruza), 3 consultas por un piso y 3 vendedores, con sus tareas y repartidos entre el equipo.
   Sin marca de prueba: se reconocen por el nombre («Test Matching»…), los teléfonos +346000001xx
   y la nota «[TEST]». Dos puertas: la casilla de «Dar de alta» / «Importar cartera» y el botón de
   la tarea del alta ya hecha (`LeadsDePruebaDialog`). Repetirlo no duplica. */

export const QUE_SE_CREA = '6 compradores para probar el matching (al 100, 90, 80, 65 y 50 % con un piso de la cartera, y uno que no cruza), 3 consultas por un piso y 3 vendedores, con sus tareas y repartidos entre el equipo.'

const TIPO: Record<LeadDePrueba['kind'], string> = { matching: 'Matching', consulta: 'Consulta', vendedor: 'Vendedor' }

/** Una línea para el paso del alta: «12 creados · 2 ya estaban». */
export function resumenDeLeadsDePrueba(r: ResultadoDeLeadsDePrueba) {
  return [
    r.created && `${r.created} ${r.created === 1 ? 'creado' : 'creados'}`,
    r.skipped_existing && `${r.skipped_existing} ya ${r.skipped_existing === 1 ? 'estaba' : 'estaban'}`,
    r.failed && `${r.failed} ${r.failed === 1 ? 'falló' : 'fallaron'}`,
  ].filter(Boolean).join(' · ') || 'Nada que crear'
}

function Matching({ l }: { l: LeadDePrueba }) {
  if (l.lead_type === 'SELLER') return <span className="text-(--fg-muted)">—</span>
  if (l.matches == null) return <span className="text-(--fg-muted)">{l.status === 'failed' ? '—' : 'En la cola'}</span>
  if (l.expected) {
    const real = l.anchor_score == null ? null : Math.round(l.anchor_score)
    const esperado = Math.round(l.expected.score)
    return (
      <span title={`Esperado ${esperado} % con ${l.expected.property_label}`}>
        <b className={cn('tabular-nums', real == null ? 'text-destructive' : Math.abs(real - esperado) > 5 ? 'text-warning' : 'text-success')}>
          {real == null ? 'no cruzó' : `${real} %`}
        </b>
        <span className="text-(--fg-muted)"> con {l.expected.property_label} · {l.matches} {l.matches === 1 ? 'cruce' : 'cruces'}</span>
      </span>
    )
  }
  return <span className="tabular-nums text-(--fg-2)">{l.matches} {l.matches === 1 ? 'cruce' : 'cruces'}</span>
}

export function TablaDeLeadsDePrueba({ resultado }: { resultado: ResultadoDeLeadsDePrueba }) {
  return (
    <div className="overflow-x-auto rounded-md border border-(--line)">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead className="bg-(--surface-2) text-left text-[11.5px] text-(--fg-muted)">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Lead</th>
            <th className="px-2.5 py-1.5 font-medium">Tipo</th>
            <th className="px-2.5 py-1.5 font-medium">Asignado a</th>
            <th className="px-2.5 py-1.5 font-medium">Matching</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Tareas</th>
          </tr>
        </thead>
        <tbody>
          {resultado.leads.map(l => (
            <tr key={l.key} className="border-t border-(--line)">
              <td className="px-2.5 py-1.5">
                {l.name}
                {l.status === 'skipped_existing' && <span className="ml-1.5 text-[11px] text-(--fg-muted)">ya estaba</span>}
                {l.status === 'failed' && <span className="block text-[11.5px] text-destructive">{l.error}</span>}
              </td>
              <td className="px-2.5 py-1.5 text-(--fg-2)">{TIPO[l.kind]}</td>
              <td className="px-2.5 py-1.5 text-(--fg-2)">{l.assigned_to.name ?? '—'}</td>
              <td className="px-2.5 py-1.5"><Matching l={l} /></td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-(--fg-2)">{l.status === 'created' ? l.tasks : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** «Crear leads de prueba» para una org que ya tiene la cartera, sin pasar por el import. */
export function LeadsDePruebaDialog({ orgId, nombre, abierto, onCerrar }: {
  orgId: string; nombre: string; abierto: boolean; onCerrar: () => void
}) {
  const [estado, setEstado] = useState<{ tipo: 'listo'; r: ResultadoDeLeadsDePrueba } | { tipo: 'error'; error: string } | { tipo: 'corriendo' } | null>(null)
  const corriendo = estado?.tipo === 'corriendo'
  const crear = async () => {
    setEstado({ tipo: 'corriendo' })
    try {
      setEstado({ tipo: 'listo', r: await crearLeadsDePrueba(orgId) })
    } catch (e) {
      setEstado({ tipo: 'error', error: e instanceof Error ? e.message : 'Algo falló' })
    }
  }
  const cerrar = () => { if (!corriendo) { setEstado(null); onCerrar() } }
  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) cerrar() }}>
      <DialogContent className="ui-scale dialog-fullscreen-mobile flex max-h-[90vh] w-[min(860px,96vw)] max-w-none flex-col gap-3 overflow-hidden">
        <DialogTitle className="flex items-center gap-2 text-[16px]"><FlaskConical className="size-4" /> Leads de prueba · {nombre}</DialogTitle>
        <DialogDescription className="text-[13px]">
          {QUE_SE_CREA} Se arman con los pisos activos que la org ya tiene en Propelia. Se reconocen por el nombre («Test Matching»…) y la nota «[TEST]»; correrlo de nuevo no los duplica.
        </DialogDescription>
        {PUENTE_SIMULADO && <p className="text-[12px] text-warning">Puente simulado: no se crea nada en Propelia.</p>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {estado?.tipo === 'error' && <p className="text-[13px] text-destructive">{estado.error}</p>}
          {estado?.tipo === 'listo' && (<>
            <p className="mb-2 text-[13px] font-medium text-success">{resumenDeLeadsDePrueba(estado.r)}</p>
            <TablaDeLeadsDePrueba resultado={estado.r} />
          </>)}
        </div>
        <footer className="flex justify-end gap-2">
          {estado?.tipo === 'listo'
            ? <Button size="sm" onClick={cerrar}>Listo</Button>
            : (<>
              <Button size="sm" variant="outline" disabled={corriendo} onClick={cerrar}>Cancelar</Button>
              <Button size="sm" disabled={corriendo} onClick={() => void crear()}>
                {corriendo ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                {estado?.tipo === 'error' ? 'Reintentar' : 'Crear leads de prueba'}
              </Button>
            </>)}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
