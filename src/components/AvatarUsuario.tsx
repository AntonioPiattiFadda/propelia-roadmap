import { cn } from '@/lib/utils'
import type { Usuario } from '@/pages/crm/types'

const SIZES = { sm: 'size-7 text-[11px]', md: 'size-9 text-[13px]' } as const

/* Quién es dueño de algo, en un círculo con sus iniciales. El `OwnerAvatar` del producto es
   neutro a propósito; acá cada persona YA tiene su color en `users` y el tablero lo usa hace
   meses (barra lateral, avatares de la lista), así que el CRM lo respeta: es el mismo dato en
   todo el sistema. El nombre completo va en el `title` y el `aria-label`. */
export function AvatarUsuario({ usuario, size = 'sm', anillo = false, className }: {
  usuario: Pick<Usuario, 'nombre' | 'iniciales' | 'color'> | null | undefined
  size?: keyof typeof SIZES
  /** «Este es mío»: solo tiene algo que decir cuando hay más de una cartera en pantalla. */
  anillo?: boolean
  className?: string
}) {
  const label = usuario ? `Responsable: ${usuario.nombre}` : 'Sin responsable'
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white',
        SIZES[size],
        anillo && 'outline-2 outline-offset-[1.5px] outline-(--brand)',
        className,
      )}
      style={{ background: usuario?.color ?? 'var(--muted-foreground)' }}
    >
      <span aria-hidden>{usuario?.iniciales ?? '·'}</span>
    </span>
  )
}
