import { LockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type Props = {
  label: string
  className?: string
  style?: React.CSSProperties
}

export function LockedLabel({ label, className, style }: Props) {
  return (
    <span
      className={cn('flex w-full items-center justify-between gap-1 cursor-default', className)}
      onClick={() => toast('Este estado es fijo para que el sistema funcione correctamente y no se puede renombrar ni eliminar.')}
    >
      <span className="truncate" style={style}>{label}</span>
      <LockIcon className="size-3 text-(--fg-faint) shrink-0" />
    </span>
  )
}
