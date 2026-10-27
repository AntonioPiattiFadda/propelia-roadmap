import { describe, expect, it } from 'vitest'
import { llenarPlantilla, nombreDePila } from './mensajes'

describe('llenarPlantilla', () => {
  const v = { nombre: 'Marta', soporte: 'Antonio', inmobiliaria: 'Fincas Ribera' }
  it('reemplaza todas las apariciones', () =>
    expect(llenarPlantilla('¡Hola {nombre}! Soy {soporte}. {inmobiliaria} y {inmobiliaria}', v))
      .toBe('¡Hola Marta! Soy Antonio. Fincas Ribera y Fincas Ribera'))
  it('una variable sin valor queda escrita, para verla en la vista previa', () =>
    expect(llenarPlantilla('Pagad acá: {link}', v)).toBe('Pagad acá: {link}'))
  it('el link, cuando lo hay', () =>
    expect(llenarPlantilla('{link}', { ...v, link: 'https://pago' })).toBe('https://pago'))
  it('lo que no es variable no se toca', () => expect(llenarPlantilla('{otra}', v)).toBe('{otra}'))
})

describe('nombreDePila', () => {
  it('la primera palabra', () => expect(nombreDePila(' María José Fernández')).toBe('María'))
})
