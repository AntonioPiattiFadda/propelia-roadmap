/** Opciones de tiempo de gestión de un estado del funnel (ManagementToleranceSelect). */
export const DAY_OPTIONS = Array.from({ length: 6 }, (_, i) => ({
  hours: (i + 1) * 24,
  label: i === 0 ? '1 día' : `${i + 1} días`,
}))

export const WEEK_OPTIONS = Array.from({ length: 4 }, (_, i) => ({
  hours: (i + 1) * 168,
  label: i === 0 ? '1 semana' : `${i + 1} semanas`,
}))

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  hours: (i + 1) * 720,
  label: i === 0 ? '1 mes' : `${i + 1} meses`,
}))

/** El mismo texto que muestra el select, para mensajes fuera de él (toasts). */
export function formatToleranceHours(hours: number | null): string {
  if (hours == null) return 'Nunca'
  const option = [...DAY_OPTIONS, ...WEEK_OPTIONS, ...MONTH_OPTIONS].find((opt) => opt.hours === hours)
  return option?.label ?? `${hours} h`
}
