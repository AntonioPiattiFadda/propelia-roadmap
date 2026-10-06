import { describe, expect, it } from 'vitest'
import {
  enlaceDeWeb, fechaALaVista, MOTIVOS_DE_SELECCION, ORIGENES_DE_TELEFONO, parsearAgentes, parsearFecha,
  rotuloDeOpcion, valorDeOpcion, webALaVista,
} from './inmobiliaria'

describe('enlaceDeWeb', () => {
  it('sin esquema le pone https', () => expect(enlaceDeWeb('inmo.com')).toBe('https://inmo.com'))
  it('con esquema lo respeta', () => {
    expect(enlaceDeWeb('http://inmo.com/a')).toBe('http://inmo.com/a')
    expect(enlaceDeWeb('HTTPS://inmo.com')).toBe('HTTPS://inmo.com')
  })
  it('vacío no es un enlace', () => {
    expect(enlaceDeWeb('  ')).toBeNull()
    expect(enlaceDeWeb(null)).toBeNull()
  })
})

describe('webALaVista', () => {
  it('sin esquema, sin www y sin barra final', () => {
    expect(webALaVista('https://www.inmo.com/')).toBe('inmo.com')
    expect(webALaVista('http://inmo.com/equipo/')).toBe('inmo.com/equipo')
    expect(webALaVista('inmo.com')).toBe('inmo.com')
  })
})

describe('parsearAgentes', () => {
  it('vacío es null', () => expect(parsearAgentes(' ')).toEqual({ ok: true, valor: null }))
  it('un entero no negativo', () => {
    expect(parsearAgentes('12')).toEqual({ ok: true, valor: 12 })
    expect(parsearAgentes(' 0 ')).toEqual({ ok: true, valor: 0 })
  })
  it('negativos, decimales y texto no valen', () => {
    expect(parsearAgentes('-3').ok).toBe(false)
    expect(parsearAgentes('2.5').ok).toBe(false)
    expect(parsearAgentes('doce').ok).toBe(false)
    expect(parsearAgentes('1e3').ok).toBe(false)
  })
})

describe('opciones de los selects', () => {
  it('motivos de selección: los tres del check, en ese orden y con su rótulo', () => {
    expect(MOTIVOS_DE_SELECCION.map(o => [o.valor, o.rotulo])).toEqual([
      ['inmovilla', 'Inmovilla'], ['new', 'Nueva'], ['small', 'Pequeña'],
    ])
  })
  it('orígenes del teléfono: los cuatro del check, en ese orden y con su rótulo', () => {
    expect(ORIGENES_DE_TELEFONO.map(o => [o.valor, o.rotulo])).toEqual([
      ['agency_web', 'Web de la agencia'], ['legal_notice', 'Aviso legal'],
      ['google_maps', 'Google Maps'], ['company_registry', 'Registro mercantil'],
    ])
  })
})

describe('valorDeOpcion', () => {
  it('un valor de la lista se guarda tal cual', () => {
    expect(valorDeOpcion(MOTIVOS_DE_SELECCION, 'small')).toBe('small')
    expect(valorDeOpcion(ORIGENES_DE_TELEFONO, 'legal_notice')).toBe('legal_notice')
  })
  it('vacío, null o algo que el check rechazaría es null', () => {
    expect(valorDeOpcion(MOTIVOS_DE_SELECCION, '')).toBeNull()
    expect(valorDeOpcion(MOTIVOS_DE_SELECCION, null)).toBeNull()
    expect(valorDeOpcion(MOTIVOS_DE_SELECCION, 'Inmovilla')).toBeNull()
    expect(valorDeOpcion(ORIGENES_DE_TELEFONO, 'idealista')).toBeNull()
  })
})

describe('rotuloDeOpcion', () => {
  it('el rótulo del valor guardado', () => {
    expect(rotuloDeOpcion(MOTIVOS_DE_SELECCION, 'new')).toBe('Nueva')
    expect(rotuloDeOpcion(ORIGENES_DE_TELEFONO, 'company_registry')).toBe('Registro mercantil')
  })
  it('sin valor o con uno desconocido no hay rótulo', () => {
    expect(rotuloDeOpcion(ORIGENES_DE_TELEFONO, null)).toBeNull()
    expect(rotuloDeOpcion(ORIGENES_DE_TELEFONO, 'fax')).toBeNull()
  })
})

describe('parsearFecha', () => {
  it('vacío es null', () => expect(parsearFecha('  ')).toEqual({ ok: true, valor: null }))
  it('una fecha AAAA-MM-DD que existe', () => {
    expect(parsearFecha('2026-10-06')).toEqual({ ok: true, valor: '2026-10-06' })
    expect(parsearFecha(' 2028-02-29 ')).toEqual({ ok: true, valor: '2028-02-29' })
  })
  it('otra forma o un día que no existe no vale', () => {
    expect(parsearFecha('06/10/2026').ok).toBe(false)
    expect(parsearFecha('2026-02-30').ok).toBe(false)
    expect(parsearFecha('2026-13-01').ok).toBe(false)
    expect(parsearFecha('2026-10-06T10:00').ok).toBe(false)
  })
})

describe('fechaALaVista', () => {
  it('DD/MM/AAAA, sin pasar por la zona horaria', () => {
    expect(fechaALaVista('2026-10-06')).toBe('06/10/2026')
    expect(fechaALaVista('2026-01-01')).toBe('01/01/2026')
  })
  it('lo que no es una fecha se muestra como vino', () => expect(fechaALaVista('mañana')).toBe('mañana'))
})
