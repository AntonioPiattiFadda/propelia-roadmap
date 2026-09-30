import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'

export function useUserSession() {
  const [lookingForSession, setLookingForSession] = useState(true)
  const [userSession, setUserSession] = useState<Session | null>(null)
  const queryClient = useQueryClient()

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

        if (event === 'TOKEN_REFRESHED' && session) {
          queryClient.invalidateQueries()
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      if (signOutTimer) clearTimeout(signOutTimer)
    }
  }, [queryClient])

  return { lookingForSession, userSession }
}
