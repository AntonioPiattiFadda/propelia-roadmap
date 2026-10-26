/* El Excel de usuarios del paso 1 (docs/onboarding/EXCEL_IMPORT_USUARIOS.md): una fila por
   persona del equipo del cliente. Acá vive todo lo que se decide mirando el archivo solo; lo que
   depende del producto (si el email ya está registrado en Propelia) lo dice el puente.

   Todo o nada: con una fila con error no se crea ninguna cuenta. La contraseña NO va en el Excel:
   se arma sola (`contrasenaInicial`) y una columna «Contraseña» de más se ignora. */
import { toE164 } from '@/lib/phone'

/** Lo que devuelve read-excel-file por celda. */
export type Celda = string | number | boolean | Date | null | undefined

/** Las 6 columnas, en el orden de la plantilla. Se buscan por nombre: el orden del archivo da igual. */
export const COLUMNAS_USUARIOS = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Rol', 'Responsable'] as const

export type RolDelMiembro = 'admin' | 'agent'

export type FilaDeUsuario = {
  /** El renglón del Excel (el encabezado es el 1). */
  fila: number
  nombre: string
  apellido: string
  email: string
  /** En E.164 si es válido; si no, lo escrito (y la fila lleva el error). */
  telefono: string
  rol: RolDelMiembro
  responsable: boolean
  contrasena: string
  errores: string[]
}

export type ExcelDeUsuarios =
  | { ok: false; error: string }
  | { ok: true; filas: FilaDeUsuario[]; errorGeneral: string | null }

/** La app pide mínimo 6 caracteres. */
export const LARGO_MINIMO_DE_CONTRASENA = 6

/** `nombre.apellido` en minúsculas, sin tildes, espacios ni signos. Si no llega a 6, se le suma el año. */
export function contrasenaInicial(nombre: string, apellido: string, anio = new Date().getFullYear()): string {
  const limpio = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]/g, '')
  const base = `${limpio(nombre)}.${limpio(apellido)}`
  return base.length < LARGO_MINIMO_DE_CONTRASENA ? `${base}${anio}` : base
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
const texto = (c: Celda) => (c == null ? '' : c instanceof Date ? c.toISOString() : String(c)).trim()
const SI = new Set(['si', 's', 'x', '1', 'true', 'yes'])
const ROLES: Record<string, RolDelMiembro> = { administrador: 'admin', admin: 'admin', agente: 'agent', agent: 'agent' }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Con prefijo de país o nada: sin él no se adivina el país. `0034…` vale como `+34…`. */
function telefonoE164(crudo: string): string | null {
  const t = crudo.replace(/\s+/g, '')
  if (!t.startsWith('+') && !t.startsWith('00')) return null
  return toE164(t.startsWith('00') ? `+${t.slice(2)}` : t)
}

export function leerExcelDeUsuarios(hoja: Celda[][], anio?: number): ExcelDeUsuarios {
  const [cabecera, ...resto] = hoja
  if (!cabecera) return { ok: false, error: 'El archivo está vacío.' }
  const indice = new Map(cabecera.map((c, i) => [normalizar(texto(c)), i]))
  const faltan = COLUMNAS_USUARIOS.filter(c => !indice.has(normalizar(c)))
  if (faltan.length) return { ok: false, error: `Faltan columnas: ${faltan.map(c => `«${c}»`).join(', ')}.` }
  const celda = (fila: Celda[], col: (typeof COLUMNAS_USUARIOS)[number]) => texto(fila[indice.get(normalizar(col))!])

  const filas: FilaDeUsuario[] = []
  resto.forEach((r, i) => {
    if (r.every(c => texto(c) === '')) return
    const errores: string[] = []
    const nombre = celda(r, 'Nombre'), apellido = celda(r, 'Apellido')
    const email = celda(r, 'Email').toLowerCase().replace(/\s+/g, '')
    const telCrudo = celda(r, 'Teléfono'), rolCrudo = normalizar(celda(r, 'Rol'))
    if (!nombre) errores.push('Falta el nombre')
    if (!apellido) errores.push('Falta el apellido')
    if (!email) errores.push('Falta el email')
    else if (!EMAIL.test(email)) errores.push('El email no es válido')
    const e164 = telCrudo ? telefonoE164(telCrudo) : null
    if (!telCrudo) errores.push('Falta el teléfono')
    else if (!e164) errores.push('El teléfono tiene que ir con prefijo (+34 …)')
    const rol = rolCrudo ? ROLES[rolCrudo] : 'agent'
    if (!rol) errores.push(`Rol desconocido: «${celda(r, 'Rol')}» (Administrador o Agente)`)
    filas.push({
      fila: i + 2, nombre, apellido, email, telefono: e164 ?? telCrudo, rol: rol ?? 'agent',
      responsable: SI.has(normalizar(celda(r, 'Responsable'))),
      contrasena: contrasenaInicial(nombre, apellido, anio), errores,
    })
  })
  if (!filas.length) return { ok: false, error: 'El Excel no tiene ninguna persona cargada.' }

  // Lo que se cruza entre filas.
  const repetidos = (clave: (f: FilaDeUsuario) => string, que: string) => {
    const vistos = new Map<string, number>()
    for (const f of filas) {
      const k = clave(f)
      if (!k) continue
      const antes = vistos.get(k)
      if (antes) f.errores.push(`${que} repetido en la fila ${antes}`)
      else vistos.set(k, f.fila)
    }
  }
  repetidos(f => f.email, 'Email')
  repetidos(f => (f.telefono.startsWith('+') ? f.telefono : ''), 'Teléfono')
  for (const f of filas) if (f.responsable && f.rol !== 'admin') f.errores.push('El responsable tiene que ser Administrador')

  const responsables = filas.filter(f => f.responsable).length
  const errorGeneral = responsables === 0 ? 'Falta marcar al responsable: «Sí» en la columna Responsable de una fila.'
    : responsables > 1 ? `Hay ${responsables} responsables: tiene que ser uno solo.`
    : null
  return { ok: true, filas, errorGeneral }
}

/** Se puede importar: sin errores en ninguna fila ni en el archivo. */
export const sePuedeImportar = (e: ExcelDeUsuarios) =>
  e.ok && !e.errorGeneral && e.filas.every(f => f.errores.length === 0)

/** La plantilla que se le manda al cliente: la cabecera y, si se sabe, la fila del responsable. */
export function filasDeLaPlantilla(responsable?: { nombre: string; apellido: string; email: string | null; telefono: string | null }): string[][] {
  const filas: string[][] = [[...COLUMNAS_USUARIOS]]
  if (responsable) {
    filas.push([responsable.nombre, responsable.apellido, responsable.email ?? '', responsable.telefono ?? '', 'Administrador', 'Sí'])
  }
  return filas
}
