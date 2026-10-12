import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Icon } from '@/components/ui/icon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Pagador } from '../types'

/**
 * «Pagó», como el selector de miembros de Trello: una lista de avatares con su nombre y un tilde
 * en el elegido. Es una persona sola, así que elegir cierra. Se ofrecen los activos; un inactivo
 * aparece solo si ya está elegido (un gasto viejo sigue diciendo quién lo pagó).
 * `campo` es el del formulario (avatar + nombre); `fila`, el avatar solo de la lista de gastos.
 */
export function PagadorPicker({ id, pagadores, valor, onChange, variante = 'campo', disabled = false }: {
  id?: string
  pagadores: Pagador[]
  valor: string | null
  onChange: (id: string) => void
  variante?: 'campo' | 'fila'
  disabled?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const elegido = pagadores.find(p => p.id === valor) ?? null
  const opciones = pagadores.filter(p => p.activo || p.id === valor)
  const titulo = elegido ? `Pagó: ${elegido.nombre}` : 'Elegí quién lo pagó'

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild disabled={disabled}>
        {variante === 'fila' ? (
          <button
            type="button" id={id} title={titulo} aria-label={titulo}
            className="grid cursor-pointer place-items-center rounded-full outline-offset-2 hover:opacity-85 disabled:cursor-default"
          >
            {elegido
              ? <AvatarUsuario usuario={elegido} titulo={titulo} />
              : <span className="size-7 rounded-full border border-dashed border-(--fg-faint)" />}
          </button>
        ) : (
          <button
            type="button" id={id}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-2.5 text-left text-sm shadow-xs hover:bg-(--surface-2) disabled:cursor-default disabled:opacity-50"
          >
            {elegido
              ? <><AvatarUsuario usuario={elegido} titulo={titulo} className="size-6 text-[10px]" /><span className="flex-1 truncate">{elegido.nombre}</span></>
              : <span className="flex-1 text-muted-foreground">Elegí quién lo pagó</span>}
            <Icon icon={ChevronDownIcon} size="sm" className="text-(--fg-muted)" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-center text-xs font-semibold text-(--fg-2)">Quién lo pagó</p>
        <ul role="listbox" aria-label="Quién lo pagó" className="flex flex-col">
          {opciones.map(p => {
            const activo = p.id === valor
            return (
              <li key={p.id}>
                <button
                  type="button" role="option" aria-selected={activo}
                  onClick={() => { onChange(p.id); setAbierto(false) }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-(--surface-2)',
                    activo && 'bg-(--brand-soft)',
                  )}
                >
                  <AvatarUsuario usuario={p} titulo={p.nombre} />
                  <span className="flex-1 truncate">{p.nombre}</span>
                  {activo && <Icon icon={CheckIcon} size="sm" className="text-(--brand-700)" />}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
