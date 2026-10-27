/* La página pública de alta del cliente (crm.propelia.es/alta/<token>, en propelia-frontend),
   sin Supabase adentro. Reemplaza al Excel de usuarios del paso 1: el cliente confirma el nombre
   de la inmobiliaria y carga a su equipo. No hay sesión: el token del enlace es la llave, y las
   reglas viven en `onboarding_alta_leer` / `onboarding_alta_enviar` (las vuelve a correr la base).
   Acá solo se corta lo que no vale la pena mandar y se traducen los errores a un status.
   La I/O entra por `AltaPublicaDb` para testearla. */

export type MiembroDeAlta = {
  first_name: string
  last_name: string
  email: string
  /** E.164: `+34612345678`. */
  phone: string
  role: 'admin' | 'agent'
  /** El responsable: uno solo y Administrador. */
  is_owner: boolean
}

export type AltaPublica = {
  inmobiliaria: string | null
  web: string | null
  enviado: boolean
  miembros: MiembroDeAlta[]
}

export type AltaPublicaDb = {
  leer(token: string): Promise<{ data: AltaPublica | null; error?: string }>
  enviar(token: string, inmobiliaria: string, web: string, miembros: unknown[]): Promise<{ error?: string }>
  reabrir(token: string): Promise<{ error?: string }>
}

export type AltaPublicaResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const falla = (status: number, error: string): AltaPublicaResult => ({ ok: false, status, error })

/** Las claves que lanza la base (`raise exception 'alta_…'`). Lo que no es una de estas es un 500. */
const ERRORES_DE_LA_BASE = [
  'alta_no_existe', 'alta_ya_enviada', 'alta_falta_inmobiliaria', 'alta_sin_miembros', 'alta_demasiados_miembros',
  'alta_un_responsable', 'alta_responsable_admin', 'alta_miembro_invalido', 'alta_email_repetido',
  'alta_telefono_repetido',
  'alta_ya_importada',
] as const

function deLaBase(error: string): AltaPublicaResult {
  const clave = ERRORES_DE_LA_BASE.find(c => error.includes(c))
  if (!clave) return falla(500, 'alta_error')
  return falla(clave === 'alta_no_existe' ? 404 : clave === 'alta_ya_enviada' || clave === 'alta_ya_importada' ? 409 : 400, clave)
}

export async function altaPublica(body: Record<string, unknown>, db: AltaPublicaDb): Promise<AltaPublicaResult> {
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  // Un token mal formado es «no existe», no un error de cast de la base.
  if (!UUID.test(token)) return falla(404, 'alta_no_existe')

  if (body.accion === 'leer') {
    const r = await db.leer(token)
    if (r.error) return deLaBase(r.error)
    if (!r.data) return falla(404, 'alta_no_existe')
    return { ok: true, status: 200, body: { alta: r.data } }
  }

  if (body.accion === 'enviar') {
    const inmobiliaria = typeof body.inmobiliaria === 'string' ? body.inmobiliaria : ''
    const web = typeof body.web === 'string' ? body.web : ''
    if (!inmobiliaria.trim()) return falla(400, 'alta_falta_inmobiliaria')
    if (!Array.isArray(body.miembros) || body.miembros.length === 0) return falla(400, 'alta_sin_miembros')
    const r = await db.enviar(token, inmobiliaria, web, body.miembros)
    if (r.error) return deLaBase(r.error)
    return { ok: true, status: 200, body: { ok: true } }
  }

  // «Quiero editar»: vuelve a abrir lo enviado, salvo que Propelia ya haya importado el equipo.
  if (body.accion === 'reabrir') {
    const r = await db.reabrir(token)
    if (r.error) return deLaBase(r.error)
    return { ok: true, status: 200, body: { ok: true } }
  }

  return falla(400, 'alta_accion_invalida')
}
