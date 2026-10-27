import { linkDeAlta } from '../lib/equipo'
import { llenarPlantilla, nombreDePila } from '../lib/mensajes'
import type { PlantillaId } from '../lib/pasos'
import type { MiembroDelOnboarding, Onboarding, PlantillaDeMensaje } from '../types'

/** Lo que todas las tareas de un alta necesitan saber, armado una vez en el dialog. */
export type DatosDelAlta = {
  o: Onboarding
  /** El nombre que confirmó el cliente en la página de alta; antes de eso, el del CRM. */
  inmobiliaria: string
  responsable: MiembroDelOnboarding | null
  /** Nombre y apellido del responsable. */
  nombreResponsable: string
  telefono: string | null
  email: string | null
  /** Quien firma los WhatsApp y los mails: quien lleva el alta o, si nadie, yo. */
  soporte: string
  /** La org del cliente en Propelia: la deja el import de usuarios. */
  orgId: string | null
  /** La página pública donde el cliente carga a su equipo. */
  linkAlta: string
  /** El WhatsApp de esa plantilla ya completado; null si la plantilla no está en la base. */
  mensaje: (id: PlantillaId, extra?: { link?: string }) => string | null
}

export function datosDelAlta(o: Onboarding, plantillas: PlantillaDeMensaje[], soporte: string): DatosDelAlta {
  const responsable = o.miembros.find(m => m.is_contact) ?? o.miembros.find(m => m.is_owner) ?? null
  const c = o.lead.client
  const inmobiliaria = o.company_name?.trim() || c?.company_name?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || 'la inmobiliaria'
  const nombreResponsable = responsable
    ? `${responsable.first_name} ${responsable.last_name}`.trim()
    : [c?.first_name, c?.last_name].filter(Boolean).join(' ')
  const porId = new Map(plantillas.map(p => [p.id, p.body]))
  const linkAlta = linkDeAlta(o.public_token)
  return {
    o, inmobiliaria, responsable, nombreResponsable, soporte,
    telefono: responsable?.phone ?? c?.phone ?? null,
    email: responsable?.email ?? c?.email ?? null,
    orgId: o.lead.propelia_organization_id,
    linkAlta,
    mensaje: (id, extra) => {
      const cuerpo = porId.get(id)
      // {link} es el de pago en `link_de_pago` y el de la página de alta en el primer contacto.
      const link = extra?.link ?? (id === 'contacto_inicial' ? linkAlta : undefined)
      return cuerpo ? llenarPlantilla(cuerpo, { nombre: nombreDePila(nombreResponsable), soporte, inmobiliaria, link }) : null
    },
  }
}
