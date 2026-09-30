import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { mensajeDeLogin } from '@/lib/mensajeDeLogin'

/* Solo email y contraseña: no hay registro ni «olvidé mi contraseña», las altas van por el
   MCP. Acá NO se navega al entrar: Supabase avisa `SIGNED_IN` antes de resolver la promesa
   y `PublicRoutesAuthCheck` ya nos lleva a /roadmap; navegar acá llegaría tarde. */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)

  const login = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={e => { e.preventDefault(); login.mutate() }}
    >
      {login.isError && (
        <div role="alert" className="rounded-md border border-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {mensajeDeLogin(login.error)}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" type="email" required autoComplete="email" className="pl-10"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="password" type={verPassword ? 'text' : 'password'} required autoComplete="current-password"
            className="pl-10 pr-10" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" onClick={() => setVerPassword(v => !v)}
            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando…</> : 'Entrar'}
      </Button>
    </form>
  )
}
