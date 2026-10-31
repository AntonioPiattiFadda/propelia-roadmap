import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, Check, ListChecks, Loader2, ShieldCheck, UserRound, Wallet, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { redirectTrust } from '@/lib/oauthRedirectTrust'

/* Pantalla de consentimiento del servidor OAuth de Supabase Auth (copiada de propelia-frontend).
   Llega acá quien conecta el tablero como conector en Claude o en ChatGPT (servidor MCP:
   supabase/functions/mcp, docs/mcp/README.md).

   Supabase Auth redirige a `/oauth/consent?authorization_id=…` (la ruta se configura en
   Authentication → OAuth Server y en config.toml). Va detrás de `RequireAuthReturning`: si no
   hay sesión, pasa por /sign-in y vuelve con el mismo `authorization_id`.

   Aprobar o rechazar redirige solo (supabase-js navega a `redirect_url`). Sólo se puede aprobar
   si vuelve a Claude o ChatGPT (`redirectTrust`); el nombre que registró la app no prueba nada.
   Lo que promete «Va a poder» tiene que seguir a las tools (`_shared/mcp/tools.ts`). */
export function OAuthConsent() {
  const [searchParams] = useSearchParams()
  const authorizationId = searchParams.get('authorization_id')
  const navigate = useNavigate()

  const details = useQuery({
    queryKey: ['oauth-authorization', authorizationId],
    enabled: !!authorizationId,
    retry: false,
    // El authorization_id es de un solo uso: refetchear al volver a la pestaña después de
    // aprobar daría error y mostraría una falla que no pasó.
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId!)
      if (error) throw error
      return data
    },
  })

  // Ya lo había aprobado antes: Supabase devuelve directamente a dónde volver.
  const yaAprobadoUrl = details.data && !('authorization_id' in details.data) ? details.data.redirect_url : null
  useEffect(() => {
    if (yaAprobadoUrl) window.location.assign(yaAprobadoUrl)
  }, [yaAprobadoUrl])

  const decidir = useMutation({
    mutationFn: async (aprobar: boolean) => {
      const { error } = aprobar
        ? await supabase.auth.oauth.approveAuthorization(authorizationId!)
        : await supabase.auth.oauth.denyAuthorization(authorizationId!)
      if (error) throw error
    },
  })

  const otraCuenta = async () => {
    await supabase.auth.signOut()
    navigate(`/sign-in?next=${encodeURIComponent(`/oauth/consent?${searchParams.toString()}`)}`, { replace: true })
  }

  const pendiente = details.data && 'authorization_id' in details.data ? details.data : null
  const nombreDeLaApp = pendiente?.client.name || 'Una aplicación'
  const hostDeVuelta = pendiente ? hostDe(pendiente.redirect_uri) : null
  const confianza = pendiente ? redirectTrust(pendiente.redirect_uri) : null
  // A dónde vuelve el código de verdad (Claude, Claude Code o ChatGPT): es lo que se le dice al
  // usuario, no el nombre que la app eligió al registrarse.
  const app = confianza?.client ?? nombreDeLaApp

  let cuerpo: React.ReactNode
  if (!authorizationId) {
    cuerpo = <Aviso texto="Falta el pedido de autorización. Volvé a conectar el tablero desde la aplicación." />
  } else if (details.isError) {
    cuerpo = <Aviso texto="Este pedido de autorización no es válido o ya venció. Volvé a conectar el tablero desde la aplicación." />
  } else if (!pendiente || !confianza) {
    cuerpo = (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  } else if (confianza.level === 'blocked') {
    cuerpo = (
      <div className="space-y-5">
        <Aviso
          texto={`Por seguridad, el tablero sólo se puede conectar con Claude o ChatGPT. «${nombreDeLaApp}» no es una aplicación autorizada${
            hostDeVuelta ? ` (quiere volver a ${hostDeVuelta})` : ''
          }. Si no fuiste vos quien inició esto, no sigas.`}
        />
        <Button variant="outline" className="w-full" disabled={decidir.isPending} onClick={() => decidir.mutate(false)}>
          Cancelar
        </Button>
      </div>
    )
  } else {
    cuerpo = (
      <div className="space-y-5">
        <p className="text-sm text-foreground">
          <strong>{nombreDeLaApp}</strong> quiere acceder a tu cuenta del tablero de Propelia
          {confianza.level === 'trusted' && confianza.client !== nombreDeLaApp && <> desde {confianza.client}</>}.
        </p>

        <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-muted-foreground">Va a poder:</p>
          <Permiso icono={ListChecks} texto="Ver el roadmap: tareas, backlog, explicaciones, checklist, avisos y conversaciones." />
          <Permiso icono={Building2} texto="Ver el CRM como lo ves vos: leads de tus carteras, contactos (nombre, rol y notas), tareas, demos, actividad y el asunto de los correos enviados." />
          {/* Lo que sólo un SUPERADMIN ve en la app: a otro rol las vistas le devuelven vacío. */}
          <Permiso icono={Wallet} texto="Si sos SUPERADMIN, también las altas de clientes y la caja." />
          <Permiso icono={UserRound} texto="Ver los nombres y roles del equipo." />
          <p className="pt-1 text-xs font-medium text-muted-foreground">No va a poder:</p>
          <Permiso icono={X} texto="Crear, modificar ni borrar nada." apagado />
          <Permiso icono={X} texto="Ver teléfonos ni emails, ni los archivos adjuntos." apagado />
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Entrás como <strong className="text-foreground">{pendiente.user.email}</strong>.
            {hostDeVuelta && <> Al terminar volvés a <strong className="text-foreground">{hostDeVuelta}</strong>.</>}{' '}
            Podés quitar el acceso cuando quieras desde {app}.
          </span>
        </div>

        {confianza.level === 'loopback' && (
          <Aviso texto="Esta conexión vuelve a un programa de esta computadora (por ejemplo, Claude Code). Permitila sólo si la iniciaste vos recién." />
        )}

        {decidir.isError && <Aviso texto="No se pudo completar. Probá de nuevo." />}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" disabled={decidir.isPending} onClick={() => decidir.mutate(false)}>
            Rechazar
          </Button>
          <Button className="flex-1" disabled={decidir.isPending} onClick={() => decidir.mutate(true)}>
            {decidir.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Permitir
          </Button>
        </div>

        <div className="text-center">
          <button type="button" onClick={otraCuenta} className="text-xs font-medium text-primary hover:text-primary/80">
            Usar otra cuenta
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Conectar el tablero</h2>
        <p className="text-[13px] text-muted-foreground">Autorizá el acceso a tu cuenta</p>
      </div>
      {cuerpo}
    </div>
  )
}

function hostDe(uri: string): string | null {
  try {
    return new URL(uri).host
  } catch {
    return null
  }
}

function Permiso({ icono: Icono, texto, apagado = false }: { icono: typeof Check; texto: string; apagado?: boolean }) {
  return (
    <div className={`flex items-start gap-2 text-sm ${apagado ? 'text-muted-foreground' : 'text-foreground'}`}>
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{texto}</span>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div role="alert" className="rounded-md border border-border bg-danger-soft px-4 py-3 text-sm text-danger">
      {texto}
    </div>
  )
}
