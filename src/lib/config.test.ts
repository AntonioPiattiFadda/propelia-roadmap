import { describe, expect, it } from 'vitest'
import { configDeSupabase } from './config'

describe('configDeSupabase', () => {
  it('devuelve url y key recortadas', () => {
    expect(configDeSupabase({
      VITE_SUPABASE_URL: ' https://x.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' abc ',
    })).toEqual({ url: 'https://x.supabase.co', key: 'abc' })
  })

  it('sin ninguna, nombra las dos y dice qué hacer', () => {
    expect(() => configDeSupabase({})).toThrow(
      'Faltan variables de entorno: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env y completalo.',
    )
  })

  it('una vacía o de espacios cuenta como faltante', () => {
    expect(() => configDeSupabase({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: '   ' }))
      .toThrow('Faltan variables de entorno: VITE_SUPABASE_ANON_KEY.')
  })
})
