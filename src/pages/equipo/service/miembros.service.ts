import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

export type Rol = Database['public']['Enums']['user_role']
export type NuevoMiembro = { email: string; password: string; nombre: string; rol: Rol }

/* El alta va por la edge function `crear-miembro` y no contra `users`: crear la cuenta de auth
   pide el service_role, y el front no tiene policies de escritura sobre `users`. */
export async function crearMiembro(payload: NuevoMiembro): Promise<{ id: string; email: string }> {
  const { data, error } = await supabase.functions.invoke<{ user: { id: string; email: string } }>('crear-miembro', { body: payload })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new Error(body?.error ?? 'No se pudo crear el miembro')
    }
    throw error
  }
  if (!data) throw new Error('No se pudo crear el miembro')
  return data.user
}
