import { BellRing, Check } from 'lucide-react'
import { useCarteras } from '../hooks/useCarteras'
import { useAvisosPendientes, useMarcarAvisoListo } from '../hooks/useAvisosDelLead'
import { avisosPendientesDelLead, puedeMarcarAviso } from '../lib/avisosDelLead'
import { cuandoSeMando } from '../lib/emails'

/* Los avisos para la SDR (19/11/2026, por pedido): «te olvidaste de cargar el decisor». Los deja
   el conector MCP (`add_crm_lead_notice`) y van en rojo arriba del lead, a todo lo ancho, hasta
   que alguien los marca «Listo»: quien escribe el lead o a quien van dirigidos (la policy). Lo
   ve cualquiera que abra el lead; a quién le suena (campana y toast) lo dice `para`. */
export function AvisosDelLead({ leadId, escribeElLead }: { leadId: string; escribeElLead: boolean }) {
  const { myId, usuarios } = useCarteras()
  const avisos = useAvisosPendientes()
  const { listo } = useMarcarAvisoListo()
  const pendientes = avisosPendientesDelLead(avisos.data ?? [], leadId)
  if (pendientes.length === 0) return null
  const nombre = (id: string) => usuarios.find(u => u.id === id)?.nombre ?? 'alguien que ya no está'

  return (
    <div role="alert"
      className="ui-scale max-md:[zoom:1] flex shrink-0 flex-col gap-1.5 border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-800 [border-bottom:1px_solid] max-md:px-2">
      {pendientes.map(a => (
        <div key={a.id} className="flex items-start gap-2">
          <BellRing size={14} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap font-semibold leading-snug">{a.texto}</p>
            <p className="text-[12px] text-red-700/80">
              {a.para === myId ? 'Para vos' : `Para ${nombre(a.para)}`} · de {nombre(a.created_by)} · {cuandoSeMando(a.created_at)}
            </p>
          </div>
          {puedeMarcarAviso(a, myId, escribeElLead) && (
            <button type="button" onClick={() => listo(a.id)} title="Ya lo resolví: sacar el aviso"
              className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-red-300 bg-white px-2 text-[12.5px] font-semibold text-red-700 hover:bg-red-100">
              <Check size={13} />Listo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
