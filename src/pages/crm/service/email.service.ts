import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { CamposEmail, PlantillaEmailId } from '../../../../supabase/functions/_shared/plantillasEmail.ts'

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

export type OutgoingTemplateEmail = { to: string; plantilla: PlantillaEmailId; campos: CamposEmail; attachments?: EmailAttachment[] }

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
