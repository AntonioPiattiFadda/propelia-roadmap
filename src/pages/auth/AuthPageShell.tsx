import { Outlet } from 'react-router-dom'
import propeliaIcon from '@/assets/propelia-icon.png'

/* El marco de las pantallas sin sesión: una tarjeta centrada. Más simple que el del
   producto (sin hero ni enlaces legales): esto es una herramienta interna de dos personas. */
export function AuthPageShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <img src={propeliaIcon} alt="Propelia" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Propelia</h1>
            <p className="text-[13px] text-muted-foreground">Tablero interno</p>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
