import { describe, it, expect } from 'vitest'
import { isValidGuestEmail } from './guestEmail'

describe('isValidGuestEmail', () => {
  it('acepta un email común', () => {
    expect(isValidGuestEmail('lorenzopiattifadda@gmail.com')).toBe(true)
  })

  it('tolera espacios alrededor', () => {
    expect(isValidGuestEmail('  ana@org.es ')).toBe(true)
  })

  it('rechaza una coma en vez de punto (el typo típico)', () => {
    expect(isValidGuestEmail('lorenzopiattifadda@gmail,com')).toBe(false)
  })

  it('rechaza sin dominio o sin arroba', () => {
    expect(isValidGuestEmail('ana@org')).toBe(false)
    expect(isValidGuestEmail('ana.org.es')).toBe(false)
    expect(isValidGuestEmail('')).toBe(false)
  })

  it('rechaza dos emails pegados', () => {
    expect(isValidGuestEmail('ana@org.es jordi@org.es')).toBe(false)
  })
})
