/// <reference types="vite/client" />

// Opcionales a propósito: pueden faltar en el `.env`, y quien las lee (`configDeSupabase()`)
// tiene que poder decir cuál falta en vez de confiar en un tipo que promete que están.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
