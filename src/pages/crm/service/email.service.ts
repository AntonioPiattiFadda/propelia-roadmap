import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { CamposEmail, PlantillaEmailId } from '../../../../supabase/functions/_shared/plantillasEmail.ts'
import { ESTADOS_QUE_NO_LLEGARON } from '../lib/emails'
import type { CrmEmail } from '../types'

export type EmailAttachment = { filename: string; content: string }
export type OutgoingEmail = { to: string; subject: string; text: string; attachments?: EmailAttachment[] }

/* El mismo tope que `MAX_ATTACHMENTS_BYTES` de la edge function, medido igual: sobre el base64.
   Acá es para decirlo antes de mandar; la función lo rechaza igual. */
export const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024

/** Lo que ocupa un archivo de `bytes` una vez en base64. */
export const base64Size = (bytes: number) => Math.ceil(bytes / 3) * 4

/** El archivo en base64 pelado, sin el `data:...;base64,` que antepone el FileReader. */
export function fileToAttachment(file: File): Promise<EmailAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ filename: file.name, content: url.slice(url.indexOf(',') + 1) })
    }
    reader.onerror = () => reject(reader.error ?? new Error(`No se pudo leer ${file.name}`))
    reader.readAsDataURL(file)
  })
}

/** `leadId`: a qué lead se le cuelga el envío en `crm_emails` (la función lo pega solo si lo podés leer). */
export type OutgoingTemplateEmail = {
  to: string; plantilla: PlantillaEmailId; campos: CamposEmail; attachments?: EmailAttachment[]; leadId?: string
}

/* Va por la edge function `send-email`: la API key de Resend no puede ir al navegador, y el
   remitente (`info@propelia.es`) lo pone el servidor, no quien llama. Con una plantilla manda solo
   los campos: el HTML lo arma la función, con el mismo `renderEmail` que pinta la vista previa. */
export async function sendEmail(payload: OutgoingEmail | OutgoingTemplateEmail): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke<{ id: string }>('send-email', { body: payload })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'No se pudo enviar el email')
    }
    throw error
  }
  if (!data) throw new Error('No se pudo enviar el email')
  return data
}

/** Un envío que no llegó, con la inmobiliaria del lead para el aviso de la campana. */
export type EmailQueNoLlego = CrmEmail & { lead: { client: { company_name: string | null } | null } | null }

/* Los que no llegaron, de todo lo que la RLS me deja ver (los míos y los de los leads que leo).
   Son pocos: rebota uno de cada tanto. El tope es por si un día rebota un lote entero. */
export async function getEmailsQueNoLlegaron(): Promise<EmailQueNoLlego[]> {
  const { data, error } = await supabase
    .from('crm_emails')
    .select('*, lead:crm_leads(client:crm_clients(company_name))')
    .in('status', [...ESTADOS_QUE_NO_LLEGARON])
    .order('sent_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as unknown as EmailQueNoLlego[]
}

/** «Listo» (o deshacerlo, con `visto: false`): apaga la campana de quien lo mandó y pone gris la
 *  línea del cartel del lead. Lo puede quien lo mandó o quien escribe el lead (`crm_email_visto`). */
export async function marcarEmailVisto({ id, visto = true }: { id: string; visto?: boolean }): Promise<void> {
  const { error } = await supabase.rpc('crm_email_visto', { p_id: id, p_visto: visto })
  if (error) throw error
}

export type EstadoDeEnvio = Pick<CrmEmail, 'status' | 'status_detail'>

/** El estado de un envío por el id de Resend. `null` si la fila no está (o la RLS no la deja ver). */
export async function getEstadoDeEnvio(resendId: string): Promise<EstadoDeEnvio | null> {
  const { data, error } = await supabase.from('crm_emails').select('status, status_detail')
    .eq('resend_id', resendId).maybeSingle()
  if (error) throw error
  return data
}

/* Lo último enviado de cada plantilla (`crm_email_plantillas`, la escribe `send-email`). Sin la
   migración corrida, o si falla, el diálogo arranca con el texto de fábrica: no se avisa nada. */
export async function getPlantillasGuardadas(): Promise<Partial<Record<PlantillaEmailId, unknown>>> {
  const { data, error } = await supabase.from('crm_email_plantillas').select('plantilla, campos')
  if (error) return {}
  return Object.fromEntries((data ?? []).map(f => [f.plantilla, f.campos]))
}
