/* Supabase contesta en inglés y con su vocabulario («Invalid login credentials»). Se traduce
   lo que se sabe que llega; lo demás se muestra tal cual, que un texto raro dice más que un
   «error» genérico. */
export function mensajeDeLogin(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'La cuenta todavía no está confirmada.'
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) return 'No hay conexión con el servidor. Probá de nuevo.'
  return msg || 'No se pudo iniciar sesión.'
}
