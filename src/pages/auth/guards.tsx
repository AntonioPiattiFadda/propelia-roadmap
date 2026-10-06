import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { accesoDe } from '@/lib/acceso'
import { inicioDe, puedeEntrar } from '@/components/nav'
import { PantallaAcceso } from './PantallaAcceso'

/** Sin sesión → al login. */
export function RequireAuth() {
  const { lookingForSession, userSession } = useUserSession()
  if (lookingForSession) return null
  return userSession ? <Outlet /> : <Navigate to="/sign-in" replace />
}

/** Con sesión → adentro. Es lo que saca del login después de `signInWithPassword`. */
export function PublicRoutesAuthCheck() {
  const { lookingForSession, userSession } = useUserSession()
  if (lookingForSession) return null
  return userSession ? <Navigate to="/roadmap" replace /> : <Outlet />
}

/** Con sesión pero sin fila activa en `users` → no se pasa. Va debajo de `RequireAuth`. */
export function RequireAcceso() {
  const { userSession } = useUserSession()
  const yo = useYo(userSession?.user.id)
  const acceso = accesoDe({ cargando: yo.isPending, error: yo.error, fila: yo.data })

  if (acceso === 'cargando') return null
  if (acceso === 'error') {
    return (
      <PantallaAcceso
        titulo="No pudimos cargar tu cuenta"
        texto="Puede ser la conexión. Probá de nuevo en un momento."
        onReintentar={() => yo.refetch()}
        reintentando={yo.isFetching}
      />
    )
  }
  if (acceso === 'sin-acceso') {
    return (
      <PantallaAcceso
        titulo="Tu cuenta no tiene acceso"
        texto="Entraste bien, pero tu cuenta no está habilitada en el tablero. Pedile a Antonio o a Lorenzo que te den de alta."
      />
    )
  }
  return <Outlet />
}

/** Una página que no es de tu rol te devuelve a la primera que sí (`NAV`). Va debajo de
    `RequireAcceso`, que ya garantizó la fila: acá `yo` sale de la caché, sin otro viaje. */
export function RequireRol() {
  const { pathname } = useLocation()
  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)
  if (!yo) return null
  return puedeEntrar(yo.rol, pathname) ? <Outlet /> : <Navigate to={inicioDe(yo.rol)} replace />
}
