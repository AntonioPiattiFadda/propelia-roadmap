import { ShieldUser } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Minibadge que marca lo que sólo existe para un superadmin.
 *
 * Es puramente informativo: quien lo ve YA pasó el gate, así que no controla
 * ningún acceso — avisa que ese link/tab no está en la pantalla del resto del
 * equipo, para no reportar como bug algo que el otro directamente no tiene.
 *
 * Convención de iconos: escudo + "SA" = sólo superadmin (esto). El frasco de
 * laboratorio quedó reservado para lo que sólo existe corriendo en local — ver
 * DevBadge.
 *
 * "SA" solo no se entiende fuera de contexto, así que el título lo expande para
 * el tooltip nativo y el sr-only lo dice completo para lectores de pantalla; el
 * ícono va aria-hidden porque no aporta nada que el texto no diga ya.
 *
 * `nativeTitle={false}` es para cuando el badge vive adentro de un Tooltip de
 * Radix: sin eso el navegador superpone su tooltip nativo al del componente.
 *
 * Usa el par -soft/-fg de warning y no el tono base: el base sobre su propio
 * relleno queda por debajo de 4.5:1 (ver la nota de los tokens de estado en
 * index.css).
 */
export function SuperadminBadge({ className, nativeTitle = true }: { className?: string; nativeTitle?: boolean }) {
  return (
    <span
      title={nativeTitle ? 'Sólo visible para superadmin' : undefined}
      className={cn(
        'shrink-0 inline-flex items-center gap-0.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-(--warning-fg)',
        className,
      )}
    >
      <ShieldUser aria-hidden className="size-2.5" />
      SA
      <span className="sr-only">— sólo visible para superadmin</span>
    </span>
  )
}
