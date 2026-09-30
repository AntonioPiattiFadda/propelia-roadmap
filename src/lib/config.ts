type EnvSupabase = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }

/* Sin esto, un `.env` que falta no se nota hasta el primer fetch: la app arranca, el cliente
   se crea contra `undefined` y lo único que se ve es una pantalla en blanco. Acá se corta al
   arrancar y el error dice cuál falta. Una de espacios cuenta como faltante: copiar mal la
   key deja justamente eso. */
export function configDeSupabase(env: EnvSupabase): { url: string; key: string } {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    const faltan = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean)
    throw new Error(`Faltan variables de entorno: ${faltan.join(', ')}. Copiá .env.example a .env y completalo.`)
  }
  return { url, key }
}
