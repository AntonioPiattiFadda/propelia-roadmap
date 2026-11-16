/** «Buscar contacto» se reconoce por value y no por nombre: el nombre se puede cambiar, el value no. */
export const VALUE_BUSCAR_CONTACTO = 'FIND_CONTACT'

export function esBuscarContacto(etapa: { value: string } | null | undefined): boolean {
  return etapa?.value.toUpperCase() === VALUE_BUSCAR_CONTACTO
}
