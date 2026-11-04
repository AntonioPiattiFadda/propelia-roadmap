import { describe, expect, it } from 'vitest'
import { remitenteDe, renderEmailDeAccesoAlEquipo, URL_DEL_EQUIPO } from '../../../../supabase/functions/_shared/plantillasEmail.ts'

/* El mail que manda `crear-miembro` al dar de alta a alguien en /equipo (4/11/2026). */
const TONI = remitenteDe({ nombre: 'Antonio', email: 'antonio@propelia.es', firma_cargo: 'Cofundador', phone: '+34 600 00 00 00' })

describe('renderEmailDeAccesoAlEquipo', () => {
  const datos = { nombre: 'Juan <b>Pérez</b>', email: ' juan@propelia.es ', contrasena: 'a&b<c>12' }

  it('lleva usuario y contraseña, escapados, y saluda por el nombre de pila', () => {
    const { html, text, subject } = renderEmailDeAccesoAlEquipo(datos, TONI)
    expect(subject).toBe('Tu acceso al equipo de Propelia')
    expect(html).toContain('>juan@propelia.es</span>')
    expect(html).toContain('a&amp;b&lt;c&gt;12')
    expect(html).not.toContain('<b>Pérez')
    expect(html).toContain('Hola Juan,')
    expect(text).toContain('Usuario (email): juan@propelia.es\nContraseña temporal: a&b<c>12')
  })

  it('el botón va a esta app, o a la que se le pase', () => {
    expect(renderEmailDeAccesoAlEquipo(datos, TONI).html).toContain(`href="${URL_DEL_EQUIPO}"`)
    const otra = renderEmailDeAccesoAlEquipo(datos, TONI, { url: 'https://equipo.ejemplo.es' })
    expect(otra.html).toContain('href="https://equipo.ejemplo.es"')
    expect(otra.text).toContain('Entrar: https://equipo.ejemplo.es')
  })

  it('firma quien da el alta y no ofrece «Darse de baja»', () => {
    const { html } = renderEmailDeAccesoAlEquipo(datos, TONI)
    expect(html).toContain('Cofundador')
    expect(html).not.toContain('Darse de baja')
  })
})
