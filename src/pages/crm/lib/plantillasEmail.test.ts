import { describe, expect, it } from 'vitest'
import {
  camposDesde, parrafos, partirPunto, PLANTILLAS_EMAIL, problemaDeCampos, remitenteDe, renderEmail as render, replyToDe, type CamposEmail, type PlantillaEmailId,
} from '../../../../supabase/functions/_shared/plantillasEmail.ts'

const video = PLANTILLAS_EMAIL.find(p => p.id === 'presentacion-video')!
const puntual = PLANTILLAS_EMAIL.find(p => p.id === 'puntual')!
const LORE = remitenteDe({ nombre: 'Lorenzo', firma_nombre: 'Lorenzo Piatti Fadda', firma_cargo: 'Cofundador · Propelia', firma_email: 'lorenzo@propelia.es', firma_telefono: '+34 931 70 60 54' })
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
    const r = remitenteDe({ nombre: 'Ana', firma_nombre: null })
    expect(r).toEqual({ nombre: 'Ana', cargo: '', email: 'info@propelia.es', telefono: '' })
    expect(replyToDe(r)).toBeUndefined()
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
    const { predeterminadosPara, whatsappDe } = await import('../../../../supabase/functions/_shared/plantillasEmail.ts')
    const r = remitenteDe({ nombre: 'Lorenzo', firma_nombre: 'Lorenzo Piatti', firma_telefono: '+34 600 11 22 33' })
    expect(whatsappDe(r)).toBe(`https://wa.me/34600112233?text=${encodeURIComponent('Hola Lorenzo, te escribo por tu correo de Propelia.')}`)
    const c = predeterminadosPara('puntual', r)
    expect(c.textoBoton).toBe('Contáctame')
    expect(c.urlBoton).toBe(whatsappDe(r))
    expect(problemaDeCampos('puntual', c)).toBeNull()
    // Sin teléfono el enlace queda vacío y el botón no se dibuja.
    expect(predeterminadosPara('puntual', remitenteDe({ nombre: 'Ana' })).urlBoton).toBe('')
    // El del vídeo no cambia.
    expect(predeterminadosPara('presentacion-video', r).urlBoton).toBe('')
  })
})
