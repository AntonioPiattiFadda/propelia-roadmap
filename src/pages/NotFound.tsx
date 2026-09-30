import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-background">
      <h1 className="text-lg font-semibold text-foreground">Esta página no existe</h1>
      <Link to="/roadmap" className="text-sm text-primary hover:underline">Volver al tablero</Link>
    </div>
  )
}
