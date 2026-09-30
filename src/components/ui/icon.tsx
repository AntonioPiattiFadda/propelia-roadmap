import type { LucideIcon, LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZES = {
  xs: { size: 12, strokeWidth: 2.25 },
  sm: { size: 14, strokeWidth: 2 },
  md: { size: 16, strokeWidth: 1.8 },
  lg: { size: 20, strokeWidth: 1.6 },
  xl: { size: 24, strokeWidth: 1.5 },
  '2xl': { size: 32, strokeWidth: 1.5 },
} as const

export type IconSize = keyof typeof SIZES

type IconProps = Omit<LucideProps, 'size'> & {
  icon: LucideIcon
  size?: IconSize
}

export function Icon({ icon: IconComponent, size = 'md', strokeWidth, className, ...props }: IconProps) {
  const s = SIZES[size]
  return (
    <IconComponent
      size={s.size}
      strokeWidth={strokeWidth ?? s.strokeWidth}
      className={cn('shrink-0', className)}
      {...props}
    />
  )
}
