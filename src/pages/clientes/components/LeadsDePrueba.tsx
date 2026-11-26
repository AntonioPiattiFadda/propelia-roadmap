import { useEffect, useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { crearLeadsDePrueba, PUENTE_SIMULADO, type LeadDePrueba, type ResultadoDeLeadsDePrueba } from '../service/puente'

/* Leads de prueba en la org de Propelia (26/11/2026, por pedido): el set que se cargó a mano en
   Inmuga Homes, armado contra la cartera que la org ya tiene (`create_test_leads` del puente,
   PUENTE.md). 6 compradores que cruzan siempre, a porcentajes escalonados (100, 90, 80, 70, 60 y
   50 %), 3 consultas por un piso y 3 vendedores, con sus tareas y repartidos entre el equipo.
   Sin marca de prueba: se reconocen por el nombre («Test Cruce»…), los teléfonos +346000001xx
   y la nota «[TEST]». Dos puertas: la casilla de «Dar de alta» / «Importar cartera» y el botón de
   la tarea del alta ya hecha (`LeadsDePruebaDialog`), que primero corre el simulacro (`dry_run`):
   el plan con los cruces que daría cada uno, sin crear nada. **Repetirlo los reemplaza**
   (26/11/2026, por pedido): el puente da de baja los anteriores (por sus teléfonos) y crea el set
   entero de nuevo contra la cartera de hoy. */

export const QUE_SE_CREA = '6 compradores que cruzan con pisos de la cartera (al 100, 90, 80, 70, 60 y 50 % con uno de ellos), 3 consultas por un piso y 3 vendedores, con sus tareas y repartidos entre el equipo.'

const TIPO: Record<LeadDePrueba['kind'], string> = { matching: 'Cruce', consulta: 'Consulta', vendedor: 'Vendedor' }
const cruces = (n: number) => `${n} ${n === 1 ? 'cruce' : 'cruces'}`

/** Una línea para el paso del alta: «12 creados · 12 anteriores dados de baja». */
export function resumenDeLeadsDePrueba(r: ResultadoDeLeadsDePrueba) {
  const anteriores = r.replaced ?? 0
  return [
    r.planned && `${r.planned} ${r.planned === 1 ? 'se crearía' : 'se crearían'}`,
    r.dry_run && anteriores > 0 && `reemplazando ${anteriores} ${anteriores === 1 ? 'anterior' : 'anteriores'}`,
    r.created && `${r.created} ${r.created === 1 ? 'creado' : 'creados'}`,
    r.skipped_existing && `${r.skipped_existing} ya ${r.skipped_existing === 1 ? 'estaba' : 'estaban'}`,
    r.failed && `${r.failed} ${r.failed === 1 ? 'falló' : 'fallaron'}`,
    !r.dry_run && anteriores > 0 && `${anteriores} ${anteriores === 1 ? 'anterior dado' : 'anteriores dados'} de baja`,
  ].filter(Boolean).join(' · ') || 'Nada que crear'
}

/** Compradores que no cruzarían con ningún piso: no debería pasar, y si pasa se avisa antes de crear. */
export const sinCruces = (r: ResultadoDeLeadsDePrueba) => r.leads.filter(l => l.lead_type === 'BUYER' && l.matches === 0)

function Cruce({ l, simulacro }: { l: LeadDePrueba; simulacro: boolean }) {
  if (l.lead_type === 'SELLER') return <span className="text-(--fg-muted)">—</span>
  if (l.matches == null) return <span className="text-(--fg-muted)">{l.status === 'failed' ? '—' : 'En la cola'}</span>
  if (l.matches === 0) return <b className="text-destructive">Sin cruces</b>
  if (l.expected) {
    const real = l.anchor_score == null ? null : Math.round(l.anchor_score)
    const esperado = Math.round(l.expected.score)
    return (
      <span title={simulacro ? `Daría ${esperado} % con ${l.expected.property_label}` : `Esperado ${esperado} % con ${l.expected.property_label}`}>
        <b className={cn('tabular-nums', real == null ? 'text-destructive' : Math.abs(real - esperado) > 5 ? 'text-warning' : 'text-success')}>
          {real == null ? 'no cruzó' : `${real} %`}
        </b>
        <span className="text-(--fg-muted)"> con {l.expected.property_label} · {cruces(l.matches)}</span>
      </span>
    )
  }
  return <span className="tabular-nums text-(--fg-2)">{cruces(l.matches)}</span>
}

export function TablaDeLeadsDePrueba({ resultado }: { resultado: ResultadoDeLeadsDePrueba }) {
  const simulacro = !!resultado.dry_run
  return (
    <div className="overflow-x-auto rounded-md border border-(--line)">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead className="bg-(--surface-2) text-left text-[11.5px] text-(--fg-muted)">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Lead</th>
            <th className="px-2.5 py-1.5 font-medium">Tipo</th>
            <th className="px-2.5 py-1.5 font-medium">Asignado a</th>
            <th className="px-2.5 py-1.5 font-medium">{simulacro ? 'Cruce que daría' : 'Cruce'}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Tareas</th>
          </tr>
        </thead>
        <tbody>
          {resultado.leads.map(l => (
            <tr key={l.key} className="border-t border-(--line)">
              <td className="px-2.5 py-1.5">
                {l.name}
                {l.status === 'skipped_existing' && <span className="ml-1.5 text-[11px] text-(--fg-muted)">ya está</span>}
                {l.status === 'failed' && <span className="block text-[11.5px] text-destructive">{l.error}</span>}
              </td>
              <td className="px-2.5 py-1.5 text-(--fg-2)">{TIPO[l.kind]}</td>
              <td className="px-2.5 py-1.5 text-(--fg-2)">{l.assigned_to.name ?? '—'}</td>
              <td className="px-2.5 py-1.5"><Cruce l={l} simulacro={simulacro} /></td>
              <td className="px-2.5 py-1.5 text-right tabular-nums text-(--fg-2)">{l.status === 'skipped_existing' || l.status === 'failed' ? '—' : l.tasks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Estado =
  | { tipo: 'revisando' }
  | { tipo: 'plan'; r: ResultadoDeLeadsDePrueba }
  | { tipo: 'creando'; plan: ResultadoDeLeadsDePrueba }
  | { tipo: 'listo'; r: ResultadoDeLeadsDePrueba }
  | { tipo: 'error'; error: string; plan: ResultadoDeLeadsDePrueba | null }

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'Algo falló')

/** «Leads de prueba» para una org que ya tiene la cartera: primero el simulacro, después crear. */
export function LeadsDePruebaDialog({ orgId, nombre, abierto, onCerrar }: {
  orgId: string; nombre: string; abierto: boolean; onCerrar: () => void
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'revisando' })
  const ocupado = estado.tipo === 'revisando' || estado.tipo === 'creando'

  const revisar = () => {
    setEstado({ tipo: 'revisando' })
    crearLeadsDePrueba(orgId, true)
      .then(r => setEstado({ tipo: 'plan', r }))
      .catch(e => setEstado({ tipo: 'error', error: mensajeDe(e), plan: null }))
  }
  // El simulacro corre solo al abrir: es lo primero que se quiere ver.
  useEffect(() => { if (abierto) revisar() }, [abierto, orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  const crear = async (plan: ResultadoDeLeadsDePrueba) => {
    setEstado({ tipo: 'creando', plan })
    try {
      setEstado({ tipo: 'listo', r: await crearLeadsDePrueba(orgId) })
    } catch (e) {
      setEstado({ tipo: 'error', error: mensajeDe(e), plan })
    }
  }
  const cerrar = () => { if (!ocupado) onCerrar() }

  const plan = estado.tipo === 'plan' ? estado.r : estado.tipo === 'creando' ? estado.plan : estado.tipo === 'error' ? estado.plan : null
  const mostrado = estado.tipo === 'listo' ? estado.r : plan
  const faltan = plan ? plan.planned ?? 0 : 0
  const reemplaza = (plan?.replaced ?? 0) > 0
  const avisos = mostrado ? sinCruces(mostrado) : []

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o) cerrar() }}>
      <DialogContent className="ui-scale dialog-fullscreen-mobile flex max-h-[90vh] w-[min(860px,96vw)] max-w-none flex-col gap-3 overflow-hidden">
        <DialogTitle className="flex items-center gap-2 text-[16px]"><FlaskConical className="size-4" /> Leads de prueba · {nombre}</DialogTitle>
        <DialogDescription className="text-[13px]">
          {QUE_SE_CREA} Se arman con los pisos activos que la org ya tiene en Propelia. Se reconocen por el nombre («Test Cruce»…) y la nota «[TEST]»; correrlo de nuevo da de baja los anteriores y los crea otra vez.
        </DialogDescription>
        {PUENTE_SIMULADO && <p className="text-[12px] text-warning">Puente simulado: no se crea nada en Propelia.</p>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {estado.tipo === 'revisando' && <p className="flex items-center gap-2 text-[13px] text-(--fg-muted)"><Loader2 className="size-4 animate-spin" /> Armando el plan contra la cartera…</p>}
          {estado.tipo === 'error' && <p className="mb-2 text-[13px] text-destructive">{estado.error}</p>}
          {mostrado && (<>
            <p className={cn('mb-2 text-[13px] font-medium', estado.tipo === 'listo' ? 'text-success' : 'text-(--fg-2)')}>
              {estado.tipo === 'listo' ? resumenDeLeadsDePrueba(mostrado) : `Simulacro, todavía no se creó nada: ${resumenDeLeadsDePrueba(mostrado)}`}
            </p>
            {avisos.length > 0 && (
              <p className="mb-2 text-[12.5px] text-destructive">
                {avisos.map(l => l.name).join(', ')} no {avisos.length === 1 ? 'cruzaría' : 'cruzarían'} con ningún piso.
              </p>
            )}
            <TablaDeLeadsDePrueba resultado={mostrado} />
          </>)}
        </div>
        <footer className="flex justify-end gap-2">
          {estado.tipo === 'listo'
            ? <Button size="sm" onClick={cerrar}>Listo</Button>
            : (<>
              <Button size="sm" variant="outline" disabled={ocupado} onClick={cerrar}>Cancelar</Button>
              {estado.tipo === 'error' && !plan && <Button size="sm" onClick={revisar}>Reintentar</Button>}
              {plan && (
                <Button size="sm" disabled={ocupado || faltan === 0} title={reemplaza ? `Da de baja los ${plan.replaced} leads de prueba que hay y crea estos` : undefined} onClick={() => void crear(plan)}>
                  {estado.tipo === 'creando' ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
                  {faltan === 0 ? 'Nada que crear' : `${reemplaza ? 'Reemplazar y crear' : 'Crear'} ${faltan} ${faltan === 1 ? 'lead' : 'leads'}`}
                </Button>
              )}
            </>)}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
