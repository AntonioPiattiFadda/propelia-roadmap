import type { CrmEmail } from '../types'
import { noLlego } from './emails'

/* «Emails enviados» (16/11/2026, por pedido): el historial de `crm_emails` en Herramientas.
   Todo lo que la RLS deja leer: lo que mandé yo y lo de los leads que veo. */

export type EmailDelHistorial = CrmEmail & { lead: { client: { company_name: string | null } | null } | null }

export type GrupoDeEstado = 'entregados' | 'no-llegaron' | 'en-camino'

export function grupoDelEstado(status: string): GrupoDeEstado {
  if (status === 'delivered') return 'entregados'
  return noLlego({ status }) ? 'no-llegaron' : 'en-camino'
}

const PLANTILLAS: Record<string, string> = {
  'presentacion-video': 'Presentación con vídeo',
  puntual: 'Mail puntual',
  acceso: 'Accesos del cliente',
  'acceso-equipo': 'Accesos del equipo',
}

/** Sin plantilla es el «Email de prueba» de la cabecera: texto libre. */
export const rotuloDePlantilla = (plantilla: string | null) =>
  plantilla ? PLANTILLAS[plantilla] ?? plantilla : 'Texto libre'

const plano = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export type FiltroDelHistorial = { texto?: string; estado?: GrupoDeEstado | null; quien?: string | null }

/** Busca en destinatario, asunto e inmobiliaria; el más nuevo primero. */
export function filtrarHistorial<T extends EmailDelHistorial>(emails: readonly T[], f: FiltroDelHistorial): T[] {
  const texto = plano(f.texto?.trim() ?? '')
  return emails
    .filter(e => !f.estado || grupoDelEstado(e.status) === f.estado)
    .filter(e => !f.quien || e.sent_by === f.quien)
    .filter(e => !texto || plano([e.to_email, e.subject, e.lead?.client?.company_name ?? ''].join(' ')).includes(texto))
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at))
}
