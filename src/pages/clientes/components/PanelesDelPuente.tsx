import { useState } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CLIENTES_KEYS, useLinksDePago, useOrganizacion, usePlanes } from '../hooks/useClientes'
import { crearLinkDePago, type LinkDePago } from '../service/puente'
import { copiarTexto, EnviarPorWhatsapp } from './EnviarPorWhatsapp'
import type { DatosDelAlta } from './datosDelAlta'

/* Los paneles que cuelgan de una tarea y leen del producto por el puente: el link de pago y su
   estado (paso 2) y las direcciones de Idealista de cada agente (paso 3). Todos piden la org del
   cliente, que deja el import de usuarios del paso 1. */

const euros = (cents: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
const ESTADO_DEL_LINK: Record<LinkDePago['status'], string> = { open: 'Sin pagar', paid: 'Pagado', linked: 'Pagado y vinculado' }
const caja = 'flex flex-col gap-2.5 rounded-lg border border-(--line) bg-(--surface-2) p-3 text-[13px]'
const Cargando = () => <div className={caja}><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Preguntándole a Propelia…</span></div>
const Fallo = ({ error }: { error: unknown }) => <div className={caja}><span className="text-destructive">{error instanceof Error ? error.message : 'Propelia no contestó'}</span></div>

export function LinkDePagoPanel({ datos }: { datos: DatosDelAlta }) {
  const planes = usePlanes(datos.orgId)
  const qc = useQueryClient()
  const [plan, setPlan] = useState<string>('')
  const [link, setLink] = useState<LinkDePago | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  if (planes.isLoading) return <Cargando />
  if (planes.error) return <Fallo error={planes.error} />
  const elegido = plan || planes.data?.[0]?.id || ''

  const generar = async () => {
    setEnCurso(true)
    try {
      setLink(await crearLinkDePago({ plan_id: elegido, org_id: datos.orgId!, customer_email: datos.email, note: `Onboarding ${datos.inmobiliaria}` }))
      void qc.invalidateQueries({ queryKey: CLIENTES_KEYS.links(datos.orgId!) })
    } catch (e) {
      toast.error('No se pudo generar el link', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <div className={caja}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={elegido} onValueChange={setPlan}>
          <SelectTrigger className="h-8 w-56 bg-card"><SelectValue placeholder="Plan" /></SelectTrigger>
          <SelectContent>
            {planes.data?.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {euros(p.amount_cents)}/{p.interval === 'year' ? 'año' : 'mes'}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!elegido || enCurso} onClick={() => void generar()}>
          {enCurso && <Loader2 className="size-4 animate-spin" />}
          Generar link
        </Button>
        <span className="text-[12px] text-(--fg-muted)">Vence a los 7 días. Con IVA.</span>
      </div>
      {link && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-(--line) bg-card px-2 py-1.5 text-[12px]" title={link.url}>{link.url}</code>
          <EnviarPorWhatsapp texto={datos.mensaje('link_de_pago', { link: link.url })} telefono={datos.telefono} />
        </div>
      )}
    </div>
  )
}

export function PagoPanel({ datos }: { datos: DatosDelAlta }) {
  const links = useLinksDePago(datos.orgId)
  if (links.isLoading) return <Cargando />
  if (links.error) return <Fallo error={links.error} />
  if (!links.data?.length) return <div className={caja}>Todavía no se generó ningún link de pago para esta organización.</div>
  return (
    <ul className={caja}>
      {links.data.map(l => (
        <li key={l.id} className="flex flex-wrap items-center gap-x-3">
          <span className={l.status === 'open' ? 'font-semibold text-(--fg-2)' : 'font-semibold text-success'}>{ESTADO_DEL_LINK[l.status]}</span>
          {l.amount_cents != null && <span>{euros(l.amount_cents)}</span>}
          {l.status === 'open' && l.expires_at && new Date(l.expires_at) < new Date() && <span className="text-destructive">Vencido</span>}
          <span className="truncate text-[12px] text-(--fg-muted)">{l.url}</span>
        </li>
      ))}
      <li className="text-[12px] text-(--fg-muted)">Pagado, tildá «Confirmar que pagó».</li>
    </ul>
  )
}

/** Las direcciones a las que Idealista tiene que reenviar los leads de cada agente. */
export function DireccionesPanel({ datos }: { datos: DatosDelAlta }) {
  const org = useOrganizacion(datos.orgId)
  if (org.isLoading) return <Cargando />
  if (org.error) return <Fallo error={org.error} />
  const filas = (org.data?.agents ?? []).filter(a => a.inbound_address)
  const todas = filas.map(a => `${a.name}: ${a.inbound_address}`).join('\n')
  return (
    <div className={caja}>
      {filas.length === 0 ? <span>Ningún agente tiene dirección todavía.</span> : (
        <>
          <ul className="flex flex-col gap-1">
            {filas.map(a => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate font-medium">{a.name}</span>
                <code className="min-w-0 flex-1 truncate text-[12px]">{a.inbound_address}</code>
                <Button size="icon" variant="ghost" className="size-7" aria-label={`Copiar la dirección de ${a.name}`}
                  onClick={() => void copiarTexto(a.inbound_address!, 'Dirección copiada')}>
                  <Copy className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="outline" className="self-start" onClick={() => void copiarTexto(todas, 'Direcciones copiadas')}>
            <Copy className="size-4" /> Copiar todas
          </Button>
        </>
      )}
    </div>
  )
}
