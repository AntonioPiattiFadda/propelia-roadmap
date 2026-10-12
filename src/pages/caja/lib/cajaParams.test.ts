import { describe, expect, it } from 'vitest'
import { escribirConPendientes, escribirTipo, leerConPendientes, leerTipo } from './cajaParams'

const p = (q: string) => new URLSearchParams(q)

describe('conPendientes', () => {
  it('ausente es prendido', () => {
    expect(leerConPendientes(p(''))).toBe(true)
  })
  it('solo "0" lo apaga', () => {
    expect(leerConPendientes(p('withPending=0'))).toBe(false)
    expect(leerConPendientes(p('withPending=1'))).toBe(true)
    expect(leerConPendientes(p('withPending=false'))).toBe(true)
  })
  it('apagar escribe 0; prender borra la clave', () => {
    expect(escribirConPendientes(p('x=1'), false).toString()).toBe('x=1&withPending=0')
    expect(escribirConPendientes(p('withPending=0&x=1'), true).toString()).toBe('x=1')
  })
  it('no muta lo que recibe', () => {
    const orig = p('x=1')
    escribirConPendientes(orig, false)
    expect(orig.toString()).toBe('x=1')
  })
})

describe('tipo', () => {
  it('ausente o inválido es all', () => {
    expect(leerTipo(p(''))).toBe('all')
    expect(leerTipo(p('tipo=otro'))).toBe('all')
    expect(leerTipo(p('tipo=fixed'))).toBe('all')
  })
  it('FIXED y VARIABLE', () => {
    expect(leerTipo(p('tipo=FIXED'))).toBe('FIXED')
    expect(leerTipo(p('tipo=VARIABLE'))).toBe('VARIABLE')
  })
  it('escribir all borra la clave', () => {
    expect(escribirTipo(p('tipo=FIXED&x=1'), 'all').toString()).toBe('x=1')
    expect(escribirTipo(p('x=1'), 'VARIABLE').toString()).toBe('x=1&tipo=VARIABLE')
  })
  it('no muta lo que recibe', () => {
    const orig = p('tipo=FIXED')
    escribirTipo(orig, 'all')
    expect(orig.toString()).toBe('tipo=FIXED')
  })
})
