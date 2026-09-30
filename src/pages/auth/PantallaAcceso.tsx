import { Button } from '@/components/ui/button'
import { useCerrarSesion } from '@/hooks/useCerrarSesion'

type Props = { titulo: string; texto: string; onReintentar?: () => void; reintentando?: boolean }

/* Las dos pantallas en las que la sesión existe pero no se puede entrar: sin fila activa en
   `users`, o sin poder leerla. Son distintas a propósito — a alguien con acceso que se quedó
   sin red no se le puede decir que no tiene acceso. Cerrar sesión va siempre: es la única
   salida si entraste con la cuenta equivocada. */
export function PantallaAcceso({ titulo, texto, onReintentar, reintentando }: Props) {
  const cerrarSesion = useCerrarSesion()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{texto}</p>
        <div className="flex justify-center gap-2">
          {onReintentar && (
            <Button onClick={onReintentar} disabled={reintentando}>
              {reintentando ? 'Reintentando…' : 'Reintentar'}
            </Button>
          )}
          <Button variant="outline" onClick={cerrarSesion}>Cerrar sesión</Button>
        </div>
      </div>
    </div>
  )
}
