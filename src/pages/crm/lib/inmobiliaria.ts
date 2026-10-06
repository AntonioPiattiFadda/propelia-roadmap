/* NUEVO. Los datos de la inmobiliaria que se cargan a mano en la pestaña de su nombre: la web se
   escribe como venga («inmo.com», «https://www.inmo.com/») y se abre y se muestra normalizada. */

const ESQUEMA = /^[a-z][a-z\d+.-]*:\/\//i

/** A dónde lleva el enlace: sin esquema se asume https. Vacío no es un enlace. */
export function enlaceDeWeb(web: string | null | undefined): string | null {
  const limpia = (web ?? '').trim()
  if (!limpia) return null
  return ESQUEMA.test(limpia) ? limpia : `https://${limpia}`
}

/** Cómo se lee: sin esquema, sin «www.» y sin la barra del final. */
export function webALaVista(web: string): string {
  return web.trim().replace(ESQUEMA, '').replace(/^www\./i, '').replace(/\/+$/, '')
}

/* Vacío es «no se sabe» (null) y no cero. Lo que no es un entero no negativo no se guarda: el
   campo vuelve a lo que había, en vez de mandarle a la base algo que su check va a rechazar. */
export function parsearAgentes(texto: string): { ok: true; valor: number | null } | { ok: false } {
  const limpio = texto.trim()
  if (!limpio) return { ok: true, valor: null }
  if (!/^\d+$/.test(limpio)) return { ok: false }
  return { ok: true, valor: Number(limpio) }
}

/* Las opciones de los dos selects que vienen con la importación. El valor es lo que guarda la base
   (en inglés, como el resto de las columnas) y tiene que ser uno de los de su `check` en
   supabase/schema.sql: si se agrega uno, se agrega en los dos lados. */
export type Opcion<T extends string> = { readonly valor: T; readonly rotulo: string }

/** Por qué se eligió la inmobiliaria: con qué ángulo abre la llamada el SDR. */
export const MOTIVOS_DE_SELECCION = [
  { valor: 'inmovilla', rotulo: 'Inmovilla' },
  { valor: 'new', rotulo: 'Nueva' },
  { valor: 'small', rotulo: 'Pequeña' },
] as const satisfies readonly Opcion<string>[]
export type MotivoDeSeleccion = (typeof MOTIVOS_DE_SELECCION)[number]['valor']

/** De dónde salió cada teléfono. */
export const ORIGENES_DE_TELEFONO = [
  { valor: 'agency_web', rotulo: 'Web de la agencia' },
  { valor: 'legal_notice', rotulo: 'Aviso legal' },
  { valor: 'google_maps', rotulo: 'Google Maps' },
  { valor: 'company_registry', rotulo: 'Registro mercantil' },
] as const satisfies readonly Opcion<string>[]
export type OrigenDeTelefono = (typeof ORIGENES_DE_TELEFONO)[number]['valor']

/* Lo que se guarda: un valor de la lista o null. Vacío es «no se sabe», y lo que no está en la
   lista tampoco se manda, que el `check` de la base lo rechazaría entero. */
export function valorDeOpcion<T extends string>(opciones: readonly Opcion<T>[], valor: string | null | undefined): T | null {
  return opciones.find(o => o.valor === valor)?.valor ?? null
}

/** Cómo se lee el valor guardado. Sin valor, o con uno que el front no conoce, no hay rótulo. */
export function rotuloDeOpcion(opciones: readonly Opcion<string>[], valor: string | null | undefined): string | null {
  return opciones.find(o => o.valor === valor)?.rotulo ?? null
}

/* Una columna `date`: se escribe y se guarda como AAAA-MM-DD, que es lo que da el
   `<input type="date">` y lo que entiende Postgres. Vacío es null; un día que no existe no se
   guarda. Se arma en UTC para que la zona de quien mira no corra el día. */
export function parsearFecha(texto: string): { ok: true; valor: string | null } | { ok: false } {
  const limpio = texto.trim()
  if (!limpio) return { ok: true, valor: null }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio)
  if (!m) return { ok: false }
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const f = new Date(Date.UTC(a, mes - 1, dia))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return { ok: false }
  return { ok: true, valor: limpio }
}

/** Cómo se lee una fecha AAAA-MM-DD: DD/MM/AAAA, cortando el texto y sin pasar por `Date`. */
export function fechaALaVista(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}
