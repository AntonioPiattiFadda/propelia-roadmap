import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alVerse, cuandoEsteVisible } from './pestanas'

/** Un `document` de mentira: los tests corren en node. */
function documentoFalso(estado: 'visible' | 'hidden') {
  const oyentes = new Set<() => void>()
  const doc = {
    visibilityState: estado,
    addEventListener: (_: string, fn: () => void) => { oyentes.add(fn) },
    removeEventListener: (_: string, fn: () => void) => { oyentes.delete(fn) },
    cambiar(nuevo: 'visible' | 'hidden') { doc.visibilityState = nuevo; [...oyentes].forEach(f => f()) },
    oyentes,
  }
  return doc
}

let doc: ReturnType<typeof documentoFalso>
beforeEach(() => { doc = documentoFalso('visible'); vi.stubGlobal('document', doc) })
afterEach(() => { vi.unstubAllGlobals() })

describe('cuandoEsteVisible', () => {
  it('a la vista corre en el acto', () => {
    const fn = vi.fn()
    cuandoEsteVisible(fn)
    expect(fn).toHaveBeenCalledOnce()
    expect(doc.oyentes.size).toBe(0)
  })

  it('de fondo espera a volver, y corre una vez', () => {
    doc.visibilityState = 'hidden'
    const fn = vi.fn()
    cuandoEsteVisible(fn)
    expect(fn).not.toHaveBeenCalled()
    doc.cambiar('hidden')
    expect(fn).not.toHaveBeenCalled()
    doc.cambiar('visible')
    doc.cambiar('hidden')
    doc.cambiar('visible')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('cancelado no corre', () => {
    doc.visibilityState = 'hidden'
    const fn = vi.fn()
    cuandoEsteVisible(fn)()
    doc.cambiar('visible')
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('alVerse', () => {
  it('a la vista, cada aviso corre', () => {
    const fn = vi.fn()
    const r = alVerse(fn)
    r.avisar(); r.avisar()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('de fondo, muchos avisos son una sola vez al volver', () => {
    doc.visibilityState = 'hidden'
    const fn = vi.fn()
    const r = alVerse(fn)
    r.avisar(); r.avisar(); r.avisar()
    doc.cambiar('visible')
    expect(fn).toHaveBeenCalledOnce()
    r.avisar() // ya a la vista: corre de nuevo
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cerrar descarta lo pendiente', () => {
    doc.visibilityState = 'hidden'
    const fn = vi.fn()
    const r = alVerse(fn)
    r.avisar()
    r.cerrar()
    doc.cambiar('visible')
    expect(fn).not.toHaveBeenCalled()
  })
})
