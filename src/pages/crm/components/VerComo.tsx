import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { EyeIcon, XIcon } from 'lucide-react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { useCarteras } from '../hooks/useCarteras'
import { useVerComo } from '../hooks/useVerComo'
import { enlaceAlCrm } from '../lib/leadFilterParams'
import { nivelSobre, puedeVerComo } from '../lib/permisos'

/* «Ver como» (23/10/2026, por pedido). Abre el CRM desde la perspectiva de otro en una ventana
   nueva, con `?como=`. No es un login: la sesión es la misma (el `localStorage` lo comparten todas
   las pestañas), lo que se escribe sale firmado por quien mira y la RLS recorta con sus permisos.
   Ver `useVerComo`. */

/** El botón de la cabecera: la lista de personas que puedo mirar. No aparece si no hay nadie, ni
 *  adentro de una ventana que ya mira como alguien (mirar como otro desde ahí sería otra ventana más). */
export function VerComoButton() {
  const { yo, usuarios, accesos } = useCarteras()
  const { como } = useVerComo()
  const personas = puedeVerComo(yo, usuarios, accesos)
  if (como || personas.length === 0) return null

  // Una ventana nueva y no esta: la propia queda como estaba, y se pueden tener las dos al lado.
  const abrir = (id: string) => window.open(enlaceAlCrm({ como: id }), '_blank', 'noopener')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" title="Abrir el CRM como lo ve otra persona, en una ventana nueva">
          <Icon icon={EyeIcon} size="xs" />
          <span className="hidden md:inline">Ver como</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Ver el CRM como</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {personas.map(u => (
          <DropdownMenuItem key={u.id} className="text-xs" onSelect={() => abrir(u.id)}>
            <AvatarUsuario usuario={u} className="mr-1" />
            <span className="truncate">{u.nombre}</span>
            {nivelSobre(yo, u.id, accesos) === 'read' && (
              <span className="ml-auto rounded px-1.5 py-0.5 text-[10.5px] text-(--fg-muted) [border:1px_solid_var(--line)]">solo ver</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** El cartel de arriba de todo mientras se mira como alguien. Tiene que ser imposible de pasar por
 *  alto: lo que se hace en esta ventana lo firma quien mira, no la persona del cartel. */
export function CartelVerComo() {
  const { como, nivel } = useVerComo()
  const navigate = useNavigate()

  // El título de la pestaña también lo dice: con dos ventanas del CRM abiertas, es lo que las distingue.
  useEffect(() => {
    if (!como) return
    const antes = document.title
    document.title = `Como ${como.nombre} · ${antes}`
    return () => { document.title = antes }
  }, [como])

  if (!como) return null

  const cerrar = () => {
    window.close()
    // Si la ventana no la abrió el script (un enlace pegado a mano), el navegador no la cierra:
    // entonces se vuelve al CRM propio en esta misma.
    setTimeout(() => { if (!window.closed) navigate('/crm', { replace: true }) }, 100)
  }

  return (
    <div role="status" className="mx-4 mt-3 flex items-center gap-2.5 rounded-lg bg-(--brand-soft) px-3 py-2 text-(--brand-soft-fg) [border:1px_solid_var(--brand)] max-md:mx-2">
      <Icon icon={EyeIcon} size="xs" />
      <AvatarUsuario usuario={como} />
      <p className="min-w-0 flex-1 text-[13px]">
        Viendo el CRM como <strong className="font-semibold">{como.nombre}</strong>
        <span className="text-(--fg-2)">
          {' · '}{nivel === 'write' ? 'Podés editar' : 'Solo lectura'}
          <span className="max-md:hidden"> · lo que hagas queda a tu nombre</span>
        </span>
      </p>
      <Button variant="outline" size="sm" onClick={cerrar}>
        <Icon icon={XIcon} size="xs" />
        Cerrar
      </Button>
    </div>
  )
}
