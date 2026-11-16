import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MailIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useCarteras } from '../hooks/useCarteras'
import { useHistorialDeEmails } from '../hooks/useEmails'
import { cuandoSeMando, estadoDelEnvio, motivoLegible, type TonoDelEnvio } from '../lib/emails'
import { filtrarHistorial, rotuloDePlantilla, type GrupoDeEstado } from '../lib/historialDeEmails'
import { escribirLeadAbierto } from '../lib/leadFilterParams'
import { nombreDe } from '../lib/permisos'

const TONOS: Record<TonoDelEnvio, string> = {
  pendiente: 'bg-slate-100 text-slate-600',
  ok: 'bg-emerald-50 text-emerald-700',
  aviso: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700',
}

const selectClase = 'h-9 rounded-md border border-input bg-background px-2 text-[13px]'

/* Herramientas › «Emails enviados» (16/11/2026, por pedido): todo `crm_emails` que la RLS deja leer
   (lo mío y lo de los leads que veo), con su estado de Resend. Tocar la inmobiliaria abre el lead.
   El cuerpo del mail no se guarda: acá no hay «Ver email». */
export function EmailsEnviadosDialog() {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<GrupoDeEstado | ''>('')
  const [quien, setQuien] = useState('')
  const { usuarios } = useCarteras()
  const historial = useHistorialDeEmails(abierto)
  const [, setSearchParams] = useSearchParams()

  const lista = useMemo(
    () => filtrarHistorial(historial.data ?? [], { texto, estado: estado || null, quien: quien || null }),
    [historial.data, texto, estado, quien],
  )
  // Solo quienes mandaron algo: el resto del equipo no tiene nada que filtrar.
  const remitentes = useMemo(
    () => [...new Set((historial.data ?? []).map(e => e.sent_by))]
      .map(id => ({ id, nombre: nombreDe(usuarios, id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [historial.data, usuarios],
  )

  const abrirLead = (leadId: string) => {
    setAbierto(false)
    setSearchParams(prev => escribirLeadAbierto(prev, leadId), { replace: true })
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <Icon icon={MailIcon} size="xs" />
          <span className="max-md:hidden">Emails enviados</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>Emails enviados</DialogTitle>
          <DialogDescription>Los tuyos y los de los leads que ves, con lo que dijo Resend de cada uno.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Buscar por destinatario, asunto o inmobiliaria"
            className="min-w-56 flex-1"
          />
          <select aria-label="Estado" value={estado} onChange={e => setEstado(e.target.value as GrupoDeEstado | '')} className={selectClase}>
            <option value="">Todos los estados</option>
            <option value="entregados">Entregados</option>
            <option value="en-camino">En camino</option>
            <option value="no-llegaron">No llegaron</option>
          </select>
          {remitentes.length > 1 && (
            <select aria-label="Enviado por" value={quien} onChange={e => setQuien(e.target.value)} className={selectClase}>
              <option value="">Todos</option>
              {remitentes.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          )}
          <span className="text-[12.5px] tabular-nums text-(--fg-muted)">{lista.length} emails</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
          {historial.isLoading && <p className="px-3 py-3 text-[13px] text-(--fg-muted)">Cargando…</p>}
          {historial.isError && <p className="px-3 py-3 text-[13px] text-red-600">No se pudo leer el historial.</p>}
          {historial.data && lista.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-(--fg-muted)">No hay emails con esos filtros.</p>
          )}
          {lista.length > 0 && (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-slate-50 text-left text-[12px] text-(--fg-muted)">
                <tr>
                  <th className="px-3 py-2 font-medium">Cuándo</th>
                  <th className="px-3 py-2 font-medium">Para</th>
                  <th className="px-3 py-2 font-medium">Asunto</th>
                  <th className="px-3 py-2 font-medium">Inmobiliaria</th>
                  <th className="px-3 py-2 font-medium">Envió</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map(e => {
                  const est = estadoDelEnvio(e.status)
                  const empresa = e.lead?.client?.company_name
                  return (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-(--fg-muted)" title={new Date(e.sent_at).toLocaleString()}>
                        {cuandoSeMando(e.sent_at)}
                      </td>
                      <td className="max-w-52 truncate px-3 py-2" title={e.to_email}>{e.to_email}</td>
                      <td className="max-w-64 px-3 py-2">
                        <div className="truncate" title={e.subject}>{e.subject || '(sin asunto)'}</div>
                        <div className="text-[11.5px] text-(--fg-muted)">{rotuloDePlantilla(e.plantilla)}</div>
                      </td>
                      <td className="max-w-48 px-3 py-2">
                        {e.lead_id && empresa ? (
                          <button type="button" onClick={() => abrirLead(e.lead_id!)} className="truncate text-left font-medium text-primary hover:underline" title="Abrir lead">
                            {empresa}
                          </button>
                        ) : <span className="text-(--fg-muted)">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{nombreDe(usuarios, e.sent_by)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium', TONOS[est.tono])}
                          title={motivoLegible(e) ?? e.status_detail ?? undefined}
                        >
                          {e.status === 'sent' ? 'Enviado' : est.texto}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
