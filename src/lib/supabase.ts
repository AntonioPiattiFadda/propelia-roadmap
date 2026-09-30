import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { configDeSupabase } from '@/lib/config'

// Único cliente de la app. Vive aparte de `config.ts` para que los tests de lógica pura no
// lo importen: crearlo exige un `.env`, y vitest corre sin él.
const { url, key } = configDeSupabase(import.meta.env)

export const supabase = createClient<Database>(url, key)
