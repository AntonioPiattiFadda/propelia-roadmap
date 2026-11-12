import { describe, expect, it } from 'vitest'
import {
  alternarVisto,
  borrarModulo,
  borrarVideo,
  type Capacitaciones,
  claveDeVideo,
  codigoDeVideo,
  contarVistos,
  escribirCapacitaciones,
  escribirVistos,
  filtrarPorBusqueda,
  fuenteDeVideo,
  guardarVideo,
  idDeVistos,
  leerCapacitaciones,
  leerVistos,
  moverModulo,
  moverVideo,
  nuevoModulo,
  siguienteSinVer,
  tieneFuente,
  todosLosVideos,
  actualizarModulo,
  type VideoCapacitacion,
} from './capacitaciones'

const video = (id: string, extra: Partial<VideoCapacitacion> = {}): VideoCapacitacion => ({
  id, titulo: `Video ${id}`, descripcion: '', duracion: '', url: `https://x.com/${id}.mp4`, ...extra,
})

const base = (): Capacitaciones => ({
  modulos: [
    { id: 'm1', titulo: 'Intro', guia: 'Paso 1\nPaso 2', videos: [video('a'), video('b', { descripcion: 'Cómo llamar a un decisor' })] },
    { id: 'm2', titulo: 'Demo', guia: '', videos: [video('c', { titulo: 'Agendar la demo' })] },
  ],
})

describe('leerCapacitaciones', () => {
  it('vacío o roto es sin módulos', () => {
    expect(leerCapacitaciones('')).toEqual({ modulos: [] })
    expect(leerCapacitaciones('{no es json')).toEqual({ modulos: [] })
    expect(leerCapacitaciones('[]')).toEqual({ modulos: [] })
    expect(leerCapacitaciones('{"modulos":"x"}')).toEqual({ modulos: [] })
    expect(leerCapacitaciones('null')).toEqual({ modulos: [] })
  })

  it('ida y vuelta conserva todo', () => {
    const c = base()
    c.modulos[0].videos[0] = { ...video('a'), url: undefined, archivo: { path: 'capacitaciones/x.mp4', b: 'roadmap-adjuntos', n: 'x.mp4', size: 10 } }
    expect(leerCapacitaciones(escribirCapacitaciones(c))).toEqual(c)
  })

  it('descarta lo que no tiene id y completa los textos que faltan', () => {
    const texto = JSON.stringify({
      modulos: [
        { titulo: 'sin id' },
        { id: 'm1', titulo: 3, videos: [{ id: 'v1', titulo: 'Uno' }, { titulo: 'sin id' }, 'basura'] },
      ],
    })
    expect(leerCapacitaciones(texto)).toEqual({
      modulos: [{ id: 'm1', titulo: '', guia: '', videos: [{ id: 'v1', titulo: 'Uno', descripcion: '', duracion: '' }] }],
    })
  })

  it('ignora un archivo sin path y una url vacía', () => {
    const texto = JSON.stringify({ modulos: [{ id: 'm', videos: [{ id: 'v', archivo: { n: 'x' }, url: '  ' }] }] })
    const v = leerCapacitaciones(texto).modulos[0].videos[0]
    expect(v.archivo).toBeUndefined()
    expect(v.url).toBeUndefined()
  })
})

describe('vistos', () => {
  it('id de la fila por persona', () => {
    expect(idDeVistos('u1')).toBe('crm-capacitaciones-vistos-u1')
  })

  it('lee a la defensiva', () => {
    expect(leerVistos('')).toEqual({})
    expect(leerVistos('roto')).toEqual({})
    expect(leerVistos('["a"]')).toEqual({})
    expect(leerVistos('{"a":"2026-11-05T10:00:00.000Z","b":3}')).toEqual({ a: '2026-11-05T10:00:00.000Z' })
  })

  it('alterna sin tocar el original', () => {
    const ahora = new Date('2026-11-05T10:00:00.000Z')
    const v0 = {}
    const v1 = alternarVisto(v0, 'a', ahora)
    expect(v1).toEqual({ a: '2026-11-05T10:00:00.000Z' })
    expect(v0).toEqual({})
    expect(alternarVisto(v1, 'a', ahora)).toEqual({})
    expect(leerVistos(escribirVistos(v1))).toEqual(v1)
  })
})

describe('contarVistos', () => {
  it('cuenta solo los videos de la lista', () => {
    const c = base()
    expect(contarVistos(c.modulos[0].videos, { a: 'x', c: 'x', fantasma: 'x' })).toEqual({ vistos: 1, total: 2 })
    expect(contarVistos(todosLosVideos(c.modulos), { a: 'x', c: 'x', fantasma: 'x' })).toEqual({ vistos: 2, total: 3 })
  })
})

describe('siguienteSinVer', () => {
  it('es el primero sin ver en orden de módulos', () => {
    expect(siguienteSinVer(base().modulos, { a: 'x' })?.video.id).toBe('b')
    expect(siguienteSinVer(base().modulos, { a: 'x', b: 'x' })?.modulo.id).toBe('m2')
  })

  it('saltea los que no tienen video cargado', () => {
    const c = base()
    c.modulos[0].videos[0] = video('a', { url: undefined })
    expect(siguienteSinVer(c.modulos, {})?.video.id).toBe('b')
  })

  it('null si vio todo', () => {
    expect(siguienteSinVer(base().modulos, { a: 'x', b: 'x', c: 'x' })).toBeNull()
  })
})

describe('tieneFuente', () => {
  it('archivo o url', () => {
    expect(tieneFuente(video('a'))).toBe(true)
    expect(tieneFuente(video('a', { url: undefined }))).toBe(false)
    expect(tieneFuente(video('a', { url: undefined, archivo: { path: 'p', b: 'b', n: 'n', size: 1 } }))).toBe(true)
  })
})

describe('filtrarPorBusqueda', () => {
  it('sin búsqueda devuelve todo igual', () => {
    const c = base()
    expect(filtrarPorBusqueda(c.modulos, '  ')).toBe(c.modulos)
  })

  it('busca en título y descripción, sin tildes ni mayúsculas, y deja solo módulos con algo', () => {
    const r = filtrarPorBusqueda(base().modulos, 'DECISOR')
    expect(r.map(m => m.id)).toEqual(['m1'])
    expect(r[0].videos.map(v => v.id)).toEqual(['b'])
    expect(filtrarPorBusqueda(base().modulos, 'agendar')[0].videos.map(v => v.id)).toEqual(['c'])
    expect(filtrarPorBusqueda(base().modulos, 'como llamar')[0].videos.map(v => v.id)).toEqual(['b'])
    expect(filtrarPorBusqueda(base().modulos, 'nada que ver')).toEqual([])
  })
})

describe('edición', () => {
  it('mueve un módulo y no se pasa de los bordes', () => {
    const c = base()
    expect(moverModulo(c, 'm2', -1).modulos.map(m => m.id)).toEqual(['m2', 'm1'])
    expect(moverModulo(c, 'm1', -1)).toBe(c)
    expect(moverModulo(c, 'm2', 1)).toBe(c)
    expect(c.modulos.map(m => m.id)).toEqual(['m1', 'm2'])
  })

  it('mueve un video dentro de su módulo', () => {
    const c = base()
    expect(moverVideo(c, 'm1', 'a', 1).modulos[0].videos.map(v => v.id)).toEqual(['b', 'a'])
    expect(moverVideo(c, 'm1', 'b', 1)).toBe(c)
  })

  it('agrega, renombra y borra módulos', () => {
    const c = base()
    const m = nuevoModulo('m3', 'Cierre')
    const con = { modulos: [...c.modulos, m] }
    expect(con.modulos[2]).toEqual({ id: 'm3', titulo: 'Cierre', guia: '', videos: [] })
    expect(actualizarModulo(con, 'm3', { guia: 'texto' }).modulos[2].guia).toBe('texto')
    const r = borrarModulo(con, 'm1')
    expect(r.capacitaciones.modulos.map(x => x.id)).toEqual(['m2', 'm3'])
    expect(r.archivos).toEqual([])
  })

  it('borrar un módulo devuelve los archivos de sus videos', () => {
    const c = base()
    const archivo = { path: 'capacitaciones/a.mp4', b: 'roadmap-adjuntos', n: 'a.mp4', size: 1 }
    c.modulos[0].videos[0] = { ...video('a'), archivo }
    expect(borrarModulo(c, 'm1').archivos).toEqual([archivo])
  })

  it('guardar un video lo agrega al final o lo reemplaza', () => {
    const c = base()
    const nuevo = guardarVideo(c, 'm2', video('d'))
    expect(nuevo.modulos[1].videos.map(v => v.id)).toEqual(['c', 'd'])
    const editado = guardarVideo(nuevo, 'm2', video('c', { titulo: 'Otro' }))
    expect(editado.modulos[1].videos.map(v => v.titulo)).toEqual(['Otro', 'Video d'])
  })

  it('borrar un video devuelve su archivo', () => {
    const c = base()
    const archivo = { path: 'capacitaciones/b.mp4', b: 'roadmap-adjuntos', n: 'b.mp4', size: 1 }
    c.modulos[0].videos[1] = { ...video('b'), archivo }
    const r = borrarVideo(c, 'b')
    expect(r.capacitaciones.modulos[0].videos.map(v => v.id)).toEqual(['a'])
    expect(r.archivo).toEqual(archivo)
    expect(borrarVideo(c, 'a').archivo).toBeNull()
  })
})

describe('codigoDeVideo', () => {
  it('módulo.video empezando en 1', () => {
    expect(codigoDeVideo(base().modulos, 'c')).toBe('2.1')
    expect(codigoDeVideo(base().modulos, 'b')).toBe('1.2')
    expect(codigoDeVideo(base().modulos, 'no')).toBe('')
  })
})

describe('claveDeVideo', () => {
  it('limpia el nombre y lo pone bajo capacitaciones/', () => {
    expect(claveDeVideo('Llamada en frío ñ.mp4', 'abc')).toBe('capacitaciones/abc-Llamada_en_frio_n.mp4')
  })
})

describe('fuenteDeVideo', () => {
  it('archivo subido', () => {
    const archivo = { path: 'capacitaciones/a.mp4', b: 'roadmap-adjuntos', n: 'a.mp4', size: 1 }
    expect(fuenteDeVideo(video('a', { archivo, url: undefined }))).toEqual({ tipo: 'archivo', archivo })
  })

  it('mp4 o webm directo', () => {
    expect(fuenteDeVideo(video('a', { url: 'https://cdn.x/v.MP4?t=1' }))).toEqual({ tipo: 'directo', url: 'https://cdn.x/v.MP4?t=1' })
    expect(fuenteDeVideo(video('a', { url: 'https://cdn.x/v.webm' })).tipo).toBe('directo')
  })

  it('YouTube en sus formas', () => {
    const embed = { tipo: 'embed', url: 'https://www.youtube.com/embed/abc123' }
    expect(fuenteDeVideo(video('a', { url: 'https://www.youtube.com/watch?v=abc123&t=3' }))).toEqual(embed)
    expect(fuenteDeVideo(video('a', { url: 'https://youtu.be/abc123' }))).toEqual(embed)
    expect(fuenteDeVideo(video('a', { url: 'https://youtube.com/shorts/abc123' }))).toEqual(embed)
  })

  it('Loom y Drive', () => {
    expect(fuenteDeVideo(video('a', { url: 'https://www.loom.com/share/f00d?sid=1' })))
      .toEqual({ tipo: 'embed', url: 'https://www.loom.com/embed/f00d' })
    expect(fuenteDeVideo(video('a', { url: 'https://drive.google.com/file/d/XyZ/view?usp=sharing' })))
      .toEqual({ tipo: 'embed', url: 'https://drive.google.com/file/d/XyZ/preview' })
  })

  it('otro enlace http se abre afuera; lo que no es http no vale', () => {
    expect(fuenteDeVideo(video('a', { url: 'https://vimeo.com/1' }))).toEqual({ tipo: 'enlace', url: 'https://vimeo.com/1' })
    expect(fuenteDeVideo(video('a', { url: 'javascript:alert(1)' }))).toEqual({ tipo: 'ninguna' })
    expect(fuenteDeVideo(video('a', { url: undefined }))).toEqual({ tipo: 'ninguna' })
  })
})
