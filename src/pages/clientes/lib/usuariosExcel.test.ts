import { describe, expect, it } from 'vitest'
import { contrasenaInicial, filasDeLaPlantilla, leerExcelDeUsuarios, sePuedeImportar, type Celda } from './usuariosExcel'

const CAB: Celda[] = ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Rol', 'Responsable']
const leer = (...filas: Celda[][]) => leerExcelDeUsuarios([CAB, ...filas], 2026)

describe('contrasenaInicial', () => {
  it('nombre.apellido sin tildes ni espacios', () =>
    expect(contrasenaInicial('María José', 'Fernández')).toBe('mariajose.fernandez'))
  it('si no llega a 6 se le suma el año', () => expect(contrasenaInicial('Li', 'Wu', 2026)).toBe('li.wu2026'))
  it('la ñ pierde la virgulilla', () => expect(contrasenaInicial('Íñigo', 'Peña')).toBe('inigo.pena'))
})

describe('leerExcelDeUsuarios', () => {
  it('lee una fila completa y normaliza email y teléfono', () => {
    const r = leer(['Marta', 'Gil', ' Marta@Fincas.es ', '+34 600 111 222', 'Administrador', 'Sí'])
    expect(r.ok && r.filas[0]).toMatchObject({
      fila: 2, nombre: 'Marta', email: 'marta@fincas.es', telefono: '+34600111222', rol: 'admin', responsable: true,
      contrasena: 'marta.gil', errores: [],
    })
    expect(sePuedeImportar(r)).toBe(true)
  })
  it('las columnas se buscan por nombre, sin importar acentos, mayúsculas ni orden', () => {
    const r = leerExcelDeUsuarios([
      ['RESPONSABLE', 'telefono', 'email', 'rol', 'apellido', 'nombre', 'Contraseña'],
      ['x', '0034600111222', 'a@b.es', 'admin', 'Gil', 'Marta', 'ignorada'],
    ])
    expect(r.ok && r.filas[0]).toMatchObject({ telefono: '+34600111222', rol: 'admin', responsable: true, contrasena: 'marta.gil' })
  })
  it('falta una columna: el archivo entero no sirve', () => {
    const r = leerExcelDeUsuarios([['Nombre', 'Apellido', 'Email', 'Teléfono', 'Rol']])
    expect(r).toEqual({ ok: false, error: 'Faltan columnas: «Responsable».' })
  })
  it('sin personas no sirve', () => expect(leer(['', '', '', '', '', '']).ok).toBe(false))
  it('rol vacío es Agente; uno desconocido es error', () => {
    const r = leer(['Ana', 'Ruiz', 'ana@b.es', '+34600333444', '', ''], ['Pablo', 'Mas', 'p@b.es', '+34600555666', 'Jefe', ''])
    expect(r.ok && r.filas[0].rol).toBe('agent')
    expect(r.ok && r.filas[1].errores).toEqual(['Rol desconocido: «Jefe» (Administrador o Agente)'])
  })
  it('el teléfono sin prefijo es error: no se adivina el país', () => {
    const r = leer(['Ana', 'Ruiz', 'ana@b.es', 600333444, 'Agente', 'Sí'])
    expect(r.ok && r.filas[0].errores).toContain('El teléfono tiene que ir con prefijo (+34 …)')
  })
  it('email y teléfono no se repiten', () => {
    const r = leer(
      ['Ana', 'Ruiz', 'ana@b.es', '+34600333444', 'Administrador', 'Sí'],
      ['Eva', 'Mas', 'ANA@b.es', '+34 600 333 444', 'Agente', ''],
    )
    expect(r.ok && r.filas[1].errores).toEqual(['Email repetido en la fila 2', 'Teléfono repetido en la fila 2'])
  })
  it('un responsable y solo uno, y Administrador', () => {
    expect(leer(['Ana', 'Ruiz', 'a@b.es', '+34600333444', 'Agente', '']))
      .toMatchObject({ errorGeneral: 'Falta marcar al responsable: «Sí» en la columna Responsable de una fila.' })
    const dos = leer(['Ana', 'Ruiz', 'a@b.es', '+34600333444', 'Administrador', 'Sí'], ['Eva', 'Mas', 'e@b.es', '+34600555666', 'Administrador', 'si'])
    expect(dos.ok && dos.errorGeneral).toBe('Hay 2 responsables: tiene que ser uno solo.')
    const agente = leer(['Ana', 'Ruiz', 'a@b.es', '+34600333444', 'Agente', 'Sí'])
    expect(agente.ok && agente.filas[0].errores).toEqual(['El responsable tiene que ser Administrador'])
    expect(sePuedeImportar(agente)).toBe(false)
  })
  it('las filas vacías se saltean y el número de fila es el del Excel', () => {
    const r = leer(['', null, '', '', '', ''], ['Ana', 'Ruiz', 'a@b.es', '+34600333444', 'Administrador', 'Sí'])
    expect(r.ok && r.filas.map(f => f.fila)).toEqual([3])
  })
})

describe('filasDeLaPlantilla', () => {
  it('la cabecera y la fila del responsable', () =>
    expect(filasDeLaPlantilla({ nombre: 'Marta', apellido: 'Gil', email: null, telefono: '+34600111222' })).toEqual([
      ['Nombre', 'Apellido', 'Email', 'Teléfono', 'Rol', 'Responsable'],
      ['Marta', 'Gil', '', '+34600111222', 'Administrador', 'Sí'],
    ]))
  it('sin responsable, solo la cabecera', () => expect(filasDeLaPlantilla()).toHaveLength(1))
})
