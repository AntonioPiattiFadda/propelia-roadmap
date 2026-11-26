import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function useUserSession() {
  const [lookingForSession, setLookingForSession] = useState(true)
  const [userSession, setUserSession] = useState<Session | null>(null)

  useEffect(() => {
    let signOutTimer: ReturnType<typeof setTimeout> | null = null

    supabase.auth.getSession()
      .then(({ data }) => {
        setUserSession(data.session)
        setLookingForSession(false)
      })
      .catch(() => {
        setLookingForSession(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          // During multi-tab token rotation, SIGNED_OUT fires before TOKEN_REFRESHED.
          // Delay the actual sign-out so TOKEN_REFRESHED can cancel it if it arrives.
          // Also clear any existing timer to avoid stacking multiple SIGNED_OUT events.
          if (signOutTimer) clearTimeout(signOutTimer)
          signOutTimer = setTimeout(() => {
            setUserSession(null)
            setLookingForSession(false)
          }, 3000)
          return
        }

        if (signOutTimer) {
          clearTimeout(signOutTimer)
          signOutTimer = null
        }

        setUserSession(session)
        setLookingForSession(false)

        /* Renovar el token NO re-trae nada (26/11/2026): los pedidos que siguen ya salen con el
           token nuevo. Hasta ese día hacía `invalidateQueries()` y, como el token es uno para
           todas las pestañas, cada hora todas re-traían la app entera a la vez: con una SDR con
           ~170 pestañas eran más de 4.000 pedidos en un minuto y la base se saturaba. */
      }
    )

    return () => {
      subscription.unsubscribe()
      if (signOutTimer) clearTimeout(signOutTimer)
    }
  }, [])

  return { lookingForSession, userSession }
}
