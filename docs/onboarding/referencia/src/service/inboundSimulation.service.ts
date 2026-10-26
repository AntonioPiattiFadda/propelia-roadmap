import { supabase } from './index'
import { INBOUND_EMAIL_DOMAIN } from '@/constants/marketingProviders'

/** Única org en la que se permite simular leads: en una org de cliente quedarían como reales. */
export const DEMO_ORG_SLUG = 'propelia-demo'

export type InboundTarget = { slug: string; name: string }

export type OrgInboundTargets = {
  orgSlug: string
  users: InboundTarget[]
}

/** Dirección a la que Idealista le manda los leads de un agente (ver `resolveRouting`). */
export const idealistaInboundAddress = (orgSlug: string, userSlug: string | null) =>
  `leads.${orgSlug}${userSlug ? `.${userSlug}` : ''}@${INBOUND_EMAIL_DOMAIN}`

export const getOrgInboundTargets = async (organizationId: string): Promise<OrgInboundTargets> => {
  const [org, users] = await Promise.all([
    supabase.from('organizations').select('slug').eq('id', organizationId).single(),
    supabase
      .from('users')
      .select('slug, first_name, last_name')
      .eq('organization_id', organizationId)
      .not('slug', 'is', null)
      .order('first_name'),
  ])
  if (org.error) throw org.error
  if (users.error) throw users.error
  return {
    orgSlug: org.data.slug,
    users: users.data.map(u => ({
      slug: u.slug as string,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.slug as string),
    })),
  }
}

/**
 * Manda el mail de verdad (Resend) a la dirección de inbound: recorre el mismo camino que un
 * mail de Idealista — webhook, ruteo, parser, ingesta — y queda en `email_inbound_events`.
 */
export const sendSimulatedInboundEmail = async (to: string, email: { subject: string; text: string }) => {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { to, subject: email.subject, text: email.text, fromName: 'idealista (simulado)' },
  })
  if (error) throw error
  return data as { id: string }
}
