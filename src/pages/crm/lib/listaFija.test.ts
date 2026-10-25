import { describe, expect, it } from 'vitest'
import { claveDeFiltros, fijarLista } from './listaFija'

const l = (id: string) => ({ id })
const ids = (xs: { id: string }[]) => xs.map(x => x.id)

describe('claveDeFiltros', () => {
  it('no cuenta el lead abierto: abrir o pasar de lead no cambia la lista', () => {
    expect(claveDeFiltros(new URLSearchParams('stages=a&lead=1')))
      .toBe(claveDeFiltros(new URLSearchParams('stages=a&lead=2')))
    expect(claveDeFiltros(new URLSearchParams('stages=a&lead=1'))).toBe(claveDeFiltros(new URLSearchParams('stages=a')))
  })
  it('no depende del orden de los parámetros', () => {
    expect(claveDeFiltros(new URLSearchParams('q=x&stages=a'))).toBe(claveDeFiltros(new URLSearchParams('stages=a&q=x')))
  })
  it('cualquier otro parámetro sí la cambia', () => {
    const base = claveDeFiltros(new URLSearchParams('stages=a'))
    expect(claveDeFiltros(new URLSearchParams('stages=b'))).not.toBe(base)
    expect(claveDeFiltros(new URLSearchParams('stages=a&q=x'))).not.toBe(base)
    expect(claveDeFiltros(new URLSearchParams('stages=a&owners=u1'))).not.toBe(base)
  })
})

describe('fijarLista', () => {
  const todos = [l('a'), l('b'), l('c'), l('d')]

  it('sin foto: lo que coincide con los filtros, y eso queda en la foto', () => {
    const r = fijarLista(null, 'k', todos, [l('b'), l('d')])
    expect(ids(r.leads)).toEqual(['b', 'd'])
    expect(r.foto).toEqual({ clave: 'k', ids: new Set(['b', 'd']) })
  })
  it('con la misma clave, el que dejó de coincidir se queda, con los datos de ahora', () => {
    const foto = fijarLista(null, 'k', todos, [l('b'), l('d')]).foto
    const bNuevo = { id: 'b', etapa: 'descartado' }
    const r = fijarLista(foto, 'k', [l('a'), bNuevo, l('c'), l('d')], [l('d')])
    expect(r.leads).toEqual([bNuevo, l('d')])
    expect(r.foto.ids).toEqual(new Set(['b', 'd']))
  })
  it('el que empieza a coincidir aparece', () => {
    const foto = fijarLista(null, 'k', todos, [l('b')]).foto
    expect(ids(fijarLista(foto, 'k', todos, [l('b'), l('c')]).leads)).toEqual(['b', 'c'])
  })
  it('el que ya no está en los datos se va (borrado, o la RLS dejó de devolverlo)', () => {
    const foto = fijarLista(null, 'k', todos, [l('b'), l('d')]).foto
    const r = fijarLista(foto, 'k', [l('a'), l('c'), l('d')], [l('d')])
    expect(ids(r.leads)).toEqual(['d'])
    expect(r.foto.ids).toEqual(new Set(['d']))
  })
  it('respeta el orden de los datos, no el de llegada a la foto', () => {
    const foto = fijarLista(null, 'k', todos, [l('c')]).foto
    expect(ids(fijarLista(foto, 'k', todos, [l('a'), l('d')]).leads)).toEqual(['a', 'c', 'd'])
  })
  it('con otra clave (cambiaron los filtros) la foto vuelve a empezar', () => {
    const foto = fijarLista(null, 'k', todos, [l('b'), l('d')]).foto
    const r = fijarLista(foto, 'otra', todos, [l('a')])
    expect(ids(r.leads)).toEqual(['a'])
    expect(r.foto).toEqual({ clave: 'otra', ids: new Set(['a']) })
  })
})
