import { describe, expect, it } from 'vitest'
import {
  camposDesde, parrafos, partirPunto, PLANTILLAS_EMAIL, problemaDeCampos, remitenteDe, renderEmail as render, replyToDe, type CamposEmail, type PlantillaEmailId,
} from '../../../../supabase/functions/_shared/plantillasEmail.ts'

const video = PLANTILLAS_EMAIL.find(p => p.id === 'presentacion-video')!
const puntual = PLANTILLAS_EMAIL.find(p => p.id === 'puntual')!
const LORE = remitenteDe({ nombre: 'Lorenzo', firma_nombre: 'Lorenzo Piatti Fadda', firma_cargo: 'Cofundador · Propelia', email: 'Lorenzo@Propelia.es', phone: '+34 931 70 60 54' })
const renderEmail = (id: PlantillaEmailId, c: CamposEmail) => render(id, c, LORE)
const con = (base: CamposEmail, over: Partial<CamposEmail>) => ({ ...base, ...over })

describe('plantillasEmail', () => {
  it('escapa todo lo que se escribe', () => {
    const { html } = renderEmail('puntual', con(puntual.predeterminados, { titular: '<script>x</script>', nombre: 'A"na' }))
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(html).toContain('Hola A&quot;na,')
  })

  it('el cuerpo se parte en párrafos por línea en blanco y el salto simple es <br>', () => {
    expect(parrafos('uno\ndos\n\n tres \n\n\n')).toEqual(['uno\ndos', 'tres'])
    const { html } = renderEmail('puntual', con(puntual.predeterminados, { cuerpo: 'uno\ndos\n\ntres' }))
    expect(html).toContain('>uno<br>dos</p>')
    expect(html).toContain('>tres</p>')
  })

  it('sin texto o sin enlace el botón no se dibuja', () => {
    const sin = renderEmail('puntual', con(puntual.predeterminados, { urlBoton: '' })).html
    expect(sin).not.toContain('bgcolor="#0147FE"')
    const conBoton = renderEmail('puntual', con(puntual.predeterminados, { urlBoton: 'https://cal.com/x' })).html
    expect(conBoton).toContain('href="https://cal.com/x"')
  })

  it('sin titular la fila no se dibuja', () => {
    expect(renderEmail('puntual', con(puntual.predeterminados, { titular: '' })).html).not.toContain('<h1')
  })

  it('las tarjetas del vídeo: negrita hasta el primer punto', () => {
    expect(partirPunto('Título. Resto. Más')).toEqual({ negrita: 'Título.', resto: 'Resto. Más' })
    expect(partirPunto('Sin punto')).toEqual({ negrita: '', resto: 'Sin punto' })
    const { html } = renderEmail('presentacion-video', con(video.predeterminados, { urlVideo: 'https://v.com', puntos: 'Uno. Dos' }))
    expect(html).toContain('<strong style="color:#07123A;">Uno.</strong> Dos')
    expect(html).toContain('href="https://v.com"')
    expect(html).toContain('mail-video.png')
  })

  it('el del vídeo no sale sin enlace, y ningún enlace que no sea http(s)', () => {
    expect(problemaDeCampos('presentacion-video', con(video.predeterminados, { urlVideo: '' }))).toBe('Falta el enlace del vídeo')
    expect(problemaDeCampos('presentacion-video', con(video.predeterminados, { urlVideo: 'javascript:x' }))).not.toBeNull()
    expect(problemaDeCampos('puntual', con(puntual.predeterminados, { urlBoton: 'javascript:x' }))).not.toBeNull()
    expect(problemaDeCampos('puntual', puntual.predeterminados)).toBeNull()
  })

  it('camposDesde se queda solo con los campos conocidos y como texto', () => {
    expect(camposDesde('x')).toBeNull()
    expect(camposDesde({ asunto: 'a', otro: 'b', cuerpo: 3 })).toMatchObject({ asunto: 'a', cuerpo: '' })
    expect(camposDesde({})).not.toHaveProperty('otro')
  })

  it('la versión de texto lleva el enlace del vídeo y la firma', () => {
    const { text, subject } = renderEmail('presentacion-video', con(video.predeterminados, { urlVideo: 'https://v.com', nombre: 'Ana' }))
    expect(subject).toBe('Propelia en dos minutos')
    expect(text).toContain('Hola Ana,')
    expect(text).toContain('Ver el vídeo: https://v.com')
    expect(text).toContain('Lorenzo Piatti Fadda')
  })

  it('la firma y el contacto salen del remitente', () => {
    const { html } = renderEmail('puntual', puntual.predeterminados)
    expect(html).toContain('Lorenzo Piatti Fadda')
    expect(html).toContain('href="tel:+34931706054"')
    expect(html).toContain('mailto:lorenzo@propelia.es?subject=Baja')
    expect(replyToDe(LORE)).toBe('lorenzo@propelia.es')
  })

  it('sin firma cargada: nombre corto, info@ y sin cargo ni teléfono', () => {
    const r = remitenteDe({ nombre: 'Ana', email: 'ana@propelia.es', firma_nombre: null })
    expect(r).toEqual({ nombre: 'Ana', cargo: '', email: 'ana@propelia.es', telefono: '' })
    expect(replyToDe(r)).toBe('ana@propelia.es')
    const { html } = render('puntual', puntual.predeterminados, r)
    expect(html).not.toContain('tel:')
    expect(html).not.toContain('Lorenzo')
  })

  it('la vista previa puede sacar las imágenes de otro lado', () => {
    const { html } = render('puntual', puntual.predeterminados, LORE, { assets: 'http://localhost/email' })
    expect(html).toContain('http://localhost/email/mail-header.png')
    expect(html).not.toContain('propelia.es/assets')
  })
})

describe('Contáctame por WhatsApp', () => {
  it('el mail puntual arranca con «Contáctame» al WhatsApp de quien manda', async () => {
    const { mensajeDeWhatsapp, predeterminadosPara, whatsappDe } = await import('../../../../supabase/functions/_shared/plantillasEmail.ts')
    const r = remitenteDe({ nombre: 'Lorenzo', firma_nombre: 'Lorenzo Piatti', phone: '+34 600 11 22 33' })
    const ana = { nombre: 'Ana', empresa: 'Inmobiliaria Sol' }
    expect(mensajeDeWhatsapp(ana)).toBe('¡Hola Propelia! Soy Ana, de Inmobiliaria Sol. Me interesa saber más sobre cómo podéis ayudar a mi inmobiliaria.')
    expect(mensajeDeWhatsapp({ nombre: 'Ana' })).toContain('Soy Ana. Me interesa')
    expect(mensajeDeWhatsapp({ empresa: 'Sol' })).toContain('Os escribo desde Sol.')
    expect(mensajeDeWhatsapp()).toBe('¡Hola Propelia! Me interesa saber más sobre cómo podéis ayudar a mi inmobiliaria.')
    expect(whatsappDe(r, ana)).toBe(`https://wa.me/34600112233?text=${encodeURIComponent(mensajeDeWhatsapp(ana))}`)
    const c = predeterminadosPara('puntual', r, ana)
    expect(c.textoBoton).toBe('Contáctame')
    expect(c.urlBoton).toBe(whatsappDe(r, ana))
    expect(problemaDeCampos('puntual', c)).toBeNull()
    // Sin teléfono, un mail a quien manda; y el mailto pasa la validación.
    const sinTel = predeterminadosPara('puntual', remitenteDe({ nombre: 'Ana', email: 'ana@propelia.es' }))
    expect(sinTel.urlBoton).toBe('mailto:ana@propelia.es')
    expect(problemaDeCampos('puntual', sinTel)).toBeNull()
    expect(problemaDeCampos('puntual', { ...sinTel, urlBoton: 'mailto:no es mail' })).not.toBeNull()
    // El del vídeo también va al WhatsApp, pidiendo la demo.
    const v = predeterminadosPara('presentacion-video', r, ana)
    expect(v.textoBoton).toBe('Reservar 20 minutos')
    expect(decodeURIComponent(v.urlBoton)).toContain('Me gustaría reservar 20 minutos para ver una demo de Propelia.')
  })
})

describe('remitente: email del dominio propio o info@', () => {
  it('un email que no es de propelia.es firma y responde como info@', () => {
    const r = remitenteDe({ nombre: 'Lorenzo', email: 'lorenzopiattifadda@gmail.com', phone: '+34 600 11 22 33' })
    expect(r.email).toBe('info@propelia.es')
    expect(replyToDe(r)).toBeUndefined()
    expect(r.telefono).toBe('+34 600 11 22 33')
  })

  it('el teléfono es users.phone y, si falta, firma_telefono', () => {
    expect(remitenteDe({ phone: '+34 600', firma_telefono: '+34 931' }).telefono).toBe('+34 600')
    expect(remitenteDe({ phone: null, firma_telefono: '+34 931' }).telefono).toBe('+34 931')
  })

  it('firma_email ya no cuenta', () => {
    const fila = { nombre: 'Lore', email: 'x@gmail.com', firma_email: 'lorenzo@propelia.es' }
    expect(remitenteDe(fila).email).toBe('info@propelia.es')
  })
})

describe('nombre en la bandeja', () => {
  it('es el nombre de pila «de Propelia»', async () => {
    const { nombreEnBandeja } = await import('../../../../supabase/functions/_shared/plantillasEmail.ts')
    expect(nombreEnBandeja(remitenteDe({ nombre: 'Lore', firma_nombre: 'Lorenzo Piatti Fadda' }))).toBe('Lorenzo de Propelia')
    expect(nombreEnBandeja(remitenteDe({ nombre: 'Antonio' }))).toBe('Antonio de Propelia')
    expect(nombreEnBandeja(remitenteDe(null))).toBe('Propelia')
  })
})

describe('el último enviado es la plantilla', () => {
  it('guarda el texto, pero no el nombre del lead ni el botón armado solo', async () => {
    const { conGuardada, plantillaGuardable, predeterminadosPara } = await import('../../../../supabase/functions/_shared/plantillasEmail.ts')
    const r = remitenteDe({ nombre: 'Lorenzo', phone: '+34 600 11 22 33' })
    const enviado = { ...predeterminadosPara('presentacion-video', r, { nombre: 'Ana' }), nombre: 'Ana', asunto: 'Nuevo asunto' }
    const g = plantillaGuardable('presentacion-video', enviado)
    expect(g.asunto).toBe('Nuevo asunto')
    expect(g).not.toHaveProperty('nombre')
    expect(g).not.toHaveProperty('urlBoton')
    // Un enlace escrito a mano sí queda.
    expect(plantillaGuardable('puntual', { ...enviado, urlBoton: 'https://calendly.com/x' }).urlBoton).toBe('https://calendly.com/x')
    // Al abrir: lo guardado sobre lo de fábrica, solo los campos que la plantilla edita.
    const base = predeterminadosPara('puntual', r, { nombre: 'Luis' })
    const c = conGuardada('puntual', base, { asunto: 'Otro', nombre: 'Ana', puntos: 'x', cuerpo: 3 })
    expect(c.asunto).toBe('Otro')
    expect(c.nombre).toBe(base.nombre)
    expect(c.puntos).toBe(base.puntos)
    expect(c.cuerpo).toBe(base.cuerpo)
    expect(c.urlBoton).toBe(base.urlBoton)
    expect(conGuardada('puntual', base, null)).toEqual(base)
  })
})
