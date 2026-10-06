import { Outlet } from 'react-router-dom'
import propeliaIcon from '@/assets/propelia-icon.png'
import { AuthHero } from './AuthHero'

/* El marco de las pantallas sin sesión: el hero del producto a la izquierda y la tarjeta a la
   derecha (el `AuthShellChrome` del producto, sin enlaces legales). Abajo de `lg` el hero se
   esconde y queda la tarjeta centrada. */
export function AuthPageShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full grid lg:grid-cols-2" style={{ maxWidth: 1200 }}>
        <AuthHero />

        <div className="flex items-center justify-center">
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
      </div>
    </div>
  )
}
