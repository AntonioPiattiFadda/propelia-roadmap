/* El alta de un miembro, sin Supabase adentro: quien llama, validar, crear la cuenta y su fila
   en `users`. Copiada de `create-org-user` del producto y adaptada a nuestra `users` (nombre,
   iniciales, color, rol SUPERADMIN/SDR, caja). La I/O entra por `CrearMiembroDb` para testearla. */

export type Rol = 'SUPERADMIN' | 'SDR'
const ROLES: readonly string[] = ['SUPERADMIN', 'SDR']

export type CrearMiembroInput = { email: string; password: string; nombre: string; rol: string }

export type CrearMiembroDb = {
  quienLlama(id: string): Promise<{ rol: string; activo: boolean } | null>
  coloresUsados(): Promise<string[]>
  crearCuenta(input: { email: string; password: string }): Promise<{ id: string } | { error: string }>
  crearFila(fila: {
    id: string; email: string; nombre: string; iniciales: string; color: string
    rol: Rol; caja: false; activo: true
  }): Promise<{ error?: string }>
  borrarCuenta(id: string): Promise<void>
}

export type CrearMiembroResult =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; status: number; error: string }

// Tonos apagados como los de las cuentas que ya existen (#6E6BA0, #4F7F79): con blanco encima.
export const PALETA = ['#6E6BA0', '#4F7F79', '#A0716B', '#5B7FA6', '#8A7A4F', '#9A6B8F', '#6B8F5B', '#A6875B']

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean)
  const ini = partes.length >= 2 ? partes[0][0] + partes[1][0] : (partes[0] ?? '').slice(0, 2)
  return ini.toUpperCase()
}

/** El primero de la paleta que nadie usa; con todos tomados, da la vuelta según cuántos hay. */
export function colorLibre(usados: string[]): string {
  const tomados = new Set(usados.map(c => c.toUpperCase()))
  return PALETA.find(c => !tomados.has(c.toUpperCase())) ?? PALETA[usados.length % PALETA.length]
}

const falla = (status: number, error: string): CrearMiembroResult => ({ ok: false, status, error })

export async function crearMiembro(callerId: string, input: CrearMiembroInput, db: CrearMiembroDb): Promise<CrearMiembroResult> {
  // La misma regla que `es_superadmin()`: rol y fila activa.
  const yo = await db.quienLlama(callerId)
  if (!yo || !yo.activo || yo.rol !== 'SUPERADMIN') return falla(403, 'No autorizado')

  const email = input.email.trim().toLowerCase()
  const nombre = input.nombre.trim()
  // Antes que la forma: GoTrue rechaza lo que no es ASCII («invalid format», en inglés), y un
  // apellido con ñ o tilde es justo el error que se comete al tipear el mail de alguien.
  if (/[^\x00-\x7F]/.test(email)) return falla(400, 'El email no puede llevar tildes ni ñ')
  if (!EMAIL.test(email)) return falla(400, 'El email no es válido')
  if (input.password.length < 6) return falla(400, 'La contraseña tiene que tener al menos 6 caracteres')
  if (!nombre) return falla(400, 'Falta el nombre')
  if (!ROLES.includes(input.rol)) return falla(400, 'Rol inválido')

  const cuenta = await db.crearCuenta({ email, password: input.password })
  if ('error' in cuenta) {
    return falla(400, /already been registered|already registered/i.test(cuenta.error) ? 'Ese email ya está registrado' : cuenta.error)
  }

  // `caja` siempre en false: entrar al reparto de la caja mueve los saldos de todos, eso se
  // decide a mano. Sin trigger sobre auth.users, la fila la escribe esto y nadie más.
  const fila = await db.crearFila({
    id: cuenta.id, email, nombre, iniciales: inicialesDe(nombre),
    color: colorLibre(await db.coloresUsados()), rol: input.rol as Rol, caja: false, activo: true,
  })
  if (fila.error) {
    // Una cuenta sin fila entra al login y rebota en «sin acceso»: mejor que no exista.
    await db.borrarCuenta(cuenta.id)
    return falla(500, `No se pudo crear el miembro: ${fila.error}`)
  }
  return { ok: true, user: { id: cuenta.id, email } }
}
