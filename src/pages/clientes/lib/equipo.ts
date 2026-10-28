/* El equipo del cliente (paso 1). Desde el 27/10/2026 no llega por Excel: lo carga el propio
   cliente en la página pública de alta (crm.propelia.es/alta/<token>, en propelia-frontend) y
   queda en `client_onboarding_members`. Las reglas de lo que se envía viven en la base
   (`onboarding_alta_enviar`); acá queda lo que /clientes necesita para importarlo. */

/** La página pública de alta, en propelia-frontend. */
export const URL_DE_ALTA = 'https://crm.propelia.es/alta'

/** El enlace que va en el WhatsApp del primer contacto. */
export const linkDeAlta = (token: string) => `${URL_DE_ALTA}/${token}`

/** La app pide mínimo 6 caracteres. */
export const LARGO_MINIMO_DE_CONTRASENA = 6

/** `nombre.apellido` en minúsculas, sin tildes, espacios ni signos. Si no llega a 6, se le suma el
 *  año. No se guarda en ningún lado: se arma igual al importar y al mandar los accesos, con el año
 *  de cuando se cargó el miembro. */
export function contrasenaInicial(nombre: string, apellido: string, anio = new Date().getFullYear()): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]/g, '')
  const base = `${limpio(nombre)}.${limpio(apellido)}`
  return base.length < LARGO_MINIMO_DE_CONTRASENA ? `${base}${anio}` : base
}

/** El estado del enlace de alta, para el renglón «Recibir el equipo». */
export type EstadoDelAlta = { enviado: false } | { enviado: true; el: string; personas: number }

export function estadoDelAlta(o: { submitted_at: string | null }, miembros: readonly unknown[]): EstadoDelAlta {
  return o.submitted_at ? { enviado: true, el: o.submitted_at, personas: miembros.length } : { enviado: false }
}

const CON_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i

/** La web como la guarda Propelia (Ajustes › Marca, `normalizeWebsite`; espejo en `roadmap-bridge`):
 *  vacía es `null`, sin esquema va `https://`, solo http(s) y con un punto en el dominio. `undefined`
 *  = no vale: el puente la rechazaría y no crearía la org. */
export function normalizarWeb(texto: string): string | null | undefined {
  const t = texto.trim()
  if (!t) return null
  const candidata = CON_ESQUEMA.test(t) ? t : `https://${t}`
  let url: URL
  try { url = new URL(candidata) } catch { return undefined }
  const http = url.protocol === 'http:' || url.protocol === 'https:'
  return http && url.hostname.includes('.') && !/\s/.test(candidata) ? candidata : undefined
}
