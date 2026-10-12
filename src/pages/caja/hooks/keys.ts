/* Todas las keys de la Caja bajo ['caja', …]: las mutaciones invalidan por el prefijo `todo`. */
export const CAJA_KEYS = {
  todo: ['caja'] as const,
  gastos: (from: string, to: string) => ['caja', 'gastos', from, to] as const,
  etiquetas: ['caja', 'etiquetas'] as const,
  uso: ['caja', 'uso'] as const,
}
