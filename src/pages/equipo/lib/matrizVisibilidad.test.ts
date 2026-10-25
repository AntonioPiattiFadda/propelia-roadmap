import { describe, expect, it } from 'vitest'
import type { Usuario } from '@/pages/crm/types'
import { claveDeCelda, conAcceso, matrizVisibilidad, nivelDeCelda } from './matrizVisibilidad'

const u = (id: string, over: Partial<Usuario> = {}): Usuario =>
  ({ id, email: `${id}@x`, nombre: id, iniciales: id.slice(0, 2).toUpperCase(), color: '#000', rol: 'SDR', activo: true, phone: null, last_name: null, ...over })

describe('matrizVisibilidad', () => {
  const USUARIOS = [
    u('zoe'), u('Lorenzo', { rol: 'SUPERADMIN' }), u('ana'), u('beto', { activo: false }), u('Antonio', { rol: 'SUPERADMIN' }),
  ]
  const m = matrizVisibilidad(USUARIOS)

  it('las filas son los activos que no son SUPERADMIN, por nombre', () =>
    expect(m.filas.map(x => x.id)).toEqual(['ana', 'zoe']))
  it('las columnas son todos los activos por nombre: la cartera de un SUPERADMIN también se concede', () =>
    expect(m.columnas.map(x => x.id)).toEqual(['ana', 'Antonio', 'Lorenzo', 'zoe']))
  it('los SUPERADMIN activos van aparte, por nombre', () =>
    expect(m.superadmins.map(x => x.id)).toEqual(['Antonio', 'Lorenzo']))
  it('un inactivo no aparece en ningún lado', () => {
    const todos = [...m.filas, ...m.columnas, ...m.superadmins].map(x => x.id)
    expect(todos).not.toContain('beto')
  })
})

describe('nivelDeCelda y conAcceso (el cambio optimista)', () => {
  const acc = [{ viewer_id: 'a', subject_id: 'b', access: 'read' as const }]
  it('sin fila es null', () => expect(nivelDeCelda(acc, 'b', 'a')).toBeNull())
  it('lee la fila', () => expect(nivelDeCelda(acc, 'a', 'b')).toBe('read'))
  it('cambia la fila existente sin tocar el resto', () => {
    const otra = { viewer_id: 'c', subject_id: 'b', access: 'write' as const }
    const r = conAcceso([...acc, otra], 'a', 'b', 'write')
    expect(nivelDeCelda(r, 'a', 'b')).toBe('write')
    expect(r).toContainEqual(otra)
    expect(r).toHaveLength(2)
  })
  it('agrega la que no estaba', () => expect(nivelDeCelda(conAcceso(acc, 'b', 'a', 'write'), 'b', 'a')).toBe('write'))
  it('null la saca', () => expect(conAcceso(acc, 'a', 'b', null)).toEqual([]))
  it('no muta la lista de entrada', () => {
    conAcceso(acc, 'a', 'b', null)
    expect(acc).toHaveLength(1)
  })
  it('la clave distingue el sentido', () => expect(claveDeCelda('a', 'b')).not.toBe(claveDeCelda('b', 'a')))
})
