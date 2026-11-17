import { ChevronDown, UsersIcon } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icon } from '@/components/ui/icon'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { useVisibleAgents } from '../hooks/useVisibleAgents'
import { alternarTodas, rotuloDeCarteras, sonTodas } from '../lib/selectorDeCarteras'

/**
 * Selector de cartera. Copiado de propelia-frontend (src/pages/leads/components/AgentFilterButton.tsx).
 * Solo aparece si podés ver a alguien más: un desplegable de una sola opción es ruido que además
 * sugiere un permiso que no existe (un SDR sin accesos no lo ve).
 * Desde el 17/11/2026 (por pedido) vive en la fila de filtros, con forma de chip (`className`), y
 * tiene «Todos» arriba de las personas.
 */
export function AgentFilterButton({ className }: { className?: string }) {
  const { myId, perspectivaId, visibles, selectedIds, setSelectedIds, canSeeOthers } = useVisibleAgents()
  // selectedIds null = la sesión todavía no llegó: no hay nada que elegir.
  if (!myId || !canSeeOthers || !selectedIds) return null

  const toggle = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter(s => s !== id) : [...selectedIds, id]
    // Nunca cero: la lista quedaría vacía.
    if (next.length === 0) return
    setSelectedIds(next)
  }

  // Un inactivo no se ofrece (23/10/2026, por pedido), salvo que ya esté marcado: así se lo puede sacar.
  const opciones = visibles.filter(u => u.activo || selectedIds.includes(u.id))
  const todas = sonTodas(selectedIds, opciones)
  const propia = perspectivaId ?? myId

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={className}>
          <Icon icon={UsersIcon} size="xs" />
          {rotuloDeCarteras(selectedIds, opciones)}
          <Icon icon={ChevronDown} size="xs" className="transition-transform duration-150 [[data-state=open]_&]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">Ver leads de</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          className="text-xs font-semibold"
          checked={todas}
          onSelect={e => e.preventDefault()}
          onCheckedChange={() => setSelectedIds(alternarTodas(selectedIds, opciones, propia))}
        >
          Todos
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {opciones.map(u => (
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
