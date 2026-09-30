import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import {
  carterasConEscritura, carterasVisibles, esSuperadmin, nivelSobre, nombreDe, puedeEscribir, puedeLeer, type Acceso,
} from './permisos'

const u = (id: string, over: Partial<Usuario> = {}): Usuario =>
  ({ id, email: `${id}@x`, nombre: id, iniciales: id.slice(0, 2).toUpperCase(), color: '#000', rol: 'SDR', activo: true, ...over })
const ADMIN = u('admin', { rol: 'SUPERADMIN' })
const SDR = u('sdr')
const ANA = u('ana')
const BETO = u('beto', { activo: false })
const USUARIOS = [ADMIN, SDR, ANA, BETO]

describe('nivelSobre (espejo de crm_puede)', () => {
  it('la propia cartera es write', () => expect(nivelSobre(SDR, 'sdr', [])).toBe('write'))
  it('un SUPERADMIN escribe en todas', () => expect(nivelSobre(ADMIN, 'ana', [])).toBe('write'))
  it('sin fila no hay nada', () => expect(nivelSobre(SDR, 'ana', [])).toBeNull())
  it('read y write según la fila', () => {
    const read: Acceso[] = [{ viewer_id: 'sdr', subject_id: 'ana', access: 'read' }]
    expect(puedeLeer(SDR, 'ana', read)).toBe(true)
    expect(puedeEscribir(SDR, 'ana', read)).toBe(false)
    expect(puedeEscribir(SDR, 'ana', [{ viewer_id: 'sdr', subject_id: 'ana', access: 'write' }])).toBe(true)
  })
  it('una fila de OTRO viewer no me da nada', () =>
    expect(nivelSobre(SDR, 'ana', [{ viewer_id: 'admin', subject_id: 'ana', access: 'write' }])).toBeNull())
  it('un inactivo no puede nada, ni lo suyo', () => {
    expect(nivelSobre(u('sdr', { activo: false }), 'sdr', [])).toBeNull()
    expect(esSuperadmin(u('x', { rol: 'SUPERADMIN', activo: false }))).toBe(false)
  })
  it('sin yo (cargando) no hay nada', () => expect(puedeLeer(null, 'ana', [])).toBe(false))
})

describe('carterasVisibles (Review Focus 3)', () => {
  it('un SDR sin accesos ve solo la suya', () =>
    expect(carterasVisibles(SDR, USUARIOS, []).map(x => x.id)).toEqual(['sdr']))
  it('yo primero y el resto por nombre', () => {
    const acc: Acceso[] = [{ viewer_id: 'sdr', subject_id: 'ana', access: 'read' }, { viewer_id: 'sdr', subject_id: 'admin', access: 'read' }]
    expect(carterasVisibles(SDR, USUARIOS, acc).map(x => x.id)).toEqual(['sdr', 'admin', 'ana'])
  })
  it('un SUPERADMIN ve todas, también la de un inactivo (sus leads siguen ahí)', () =>
    expect(carterasVisibles(ADMIN, USUARIOS, []).map(x => x.id)).toEqual(['admin', 'ana', 'beto', 'sdr']))
  it('inactivo: ninguna', () => expect(carterasVisibles(u('sdr', { activo: false }), USUARIOS, [])).toEqual([]))
})

describe('carterasConEscritura', () => {
  it('un SDR sin accesos solo puede cargar en la suya', () =>
    expect(carterasConEscritura(SDR, USUARIOS, []).map(x => x.id)).toEqual(['sdr']))
  it('read no alcanza; y a un inactivo no se le asigna nada', () => {
    expect(carterasConEscritura(SDR, USUARIOS, [{ viewer_id: 'sdr', subject_id: 'ana', access: 'read' }]).map(x => x.id)).toEqual(['sdr'])
    expect(carterasConEscritura(ADMIN, USUARIOS, []).map(x => x.id)).toEqual(['admin', 'ana', 'sdr'])
  })
})

describe('nombreDe', () => {
  it('nombre o el hueco', () => {
    expect(nombreDe(USUARIOS, 'ana')).toBe('ana')
    expect(nombreDe(USUARIOS, 'nadie')).toBe('Sin responsable')
    expect(nombreDe(USUARIOS, null)).toBe('Sin responsable')
  })
})
