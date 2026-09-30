import { UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { useVisibleAgents } from '../hooks/useVisibleAgents'

/**
 * Selector de cartera. Copiado de propelia-frontend (src/pages/leads/components/AgentFilterButton.tsx).
 * Solo aparece si podés ver a alguien más: un desplegable de una sola opción es ruido que además
 * sugiere un permiso que no existe (un SDR sin accesos no lo ve).
 */
export function AgentFilterButton() {
  const { myId, visibles, selectedIds, setSelectedIds, canSeeOthers } = useVisibleAgents()
  // selectedIds null = la sesión todavía no llegó: no hay nada que elegir.
  if (!myId || !canSeeOthers || !selectedIds) return null

  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(s => s !== id) : [...selectedIds, id]
    // Nunca cero: la lista quedaría vacía y el filtro que la vació está escondido acá adentro.
    if (next.length === 0) return
    setSelectedIds(next)
  }

  const label = selectedIds.length === 1
    ? (visibles.find(u => u.id === selectedIds[0])?.nombre ?? 'Mis leads')
    : `${selectedIds.length} carteras`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <Icon icon={UsersIcon} size="xs" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Ver leads de</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visibles.map(u => (
          <DropdownMenuCheckboxItem
            key={u.id}
            className="text-xs"
            checked={selectedIds.includes(u.id)}
            // Sin esto el menú se cierra en cada clic y marcar dos carteras obliga a abrirlo dos veces.
            onSelect={e => e.preventDefault()}
            onCheckedChange={() => toggle(u.id)}
          >
            <AvatarUsuario usuario={u} className="mr-1" />
            {u.nombre}
            {u.id === myId && <span className="ml-1 text-(--fg-muted)">(vos)</span>}
            {!u.activo && <span className="ml-1 text-(--fg-muted)">(inactivo)</span>}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
