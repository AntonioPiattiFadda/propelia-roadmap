import {
  AsYouType,
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
} from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'

export type { CountryCode }

export interface ParsedPhone {
  country: CountryCode | undefined
  e164: string | undefined
  national: string
  /** Dial code + número nacional formateados, sin el "+" (ej. "34 661 28 68 71") */
  international: string
  isValid: boolean
}

export interface CountryOption {
  code: CountryCode
  dialCode: string
  name: string
}

export function parsePhone(raw: string, defaultCountry: CountryCode = 'ES'): ParsedPhone {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { country: defaultCountry, e164: undefined, national: '', international: '', isValid: false }
  }

  const phone = parsePhoneNumberFromString(trimmed, defaultCountry)
  if (phone?.isValid()) {
    return {
      country: phone.country ?? defaultCountry,
      e164: phone.number,
      national: phone.formatNational(),
      international: phone.formatInternational().replace(/^\+/, ''),
      isValid: true,
    }
  }

  const typer = new AsYouType(defaultCountry)
  const formatted = typer.input(trimmed)
  const international = trimmed.startsWith('+')
    ? (formatted || trimmed).replace(/^\+/, '')
    : `${getCountryCallingCode(defaultCountry)} ${formatted || trimmed}`.trim()
  return {
    country: trimmed.startsWith('+') ? typer.getCountry() : defaultCountry,
    e164: undefined,
    national: formatted || trimmed,
    international,
    isValid: false,
  }
}

/**
 * E.164 del teléfono, asumiendo `defaultCountry` (España) cuando no trae código
 * de país. Devuelve `null` si el número no es válido — así el que llama decide
 * si degrada al valor crudo (copiar) o si directamente no lo usa (wa.me, donde
 * un número inventado abre un chat con el país equivocado).
 */
export function toE164(raw: string | null | undefined, defaultCountry: CountryCode = 'ES'): string | null {
  if (!raw?.trim()) return null
  return parsePhone(raw, defaultCountry).e164 ?? null
}

/**
 * El teléfono como se LEE, no como se guarda: '+34637078816' -> '637 07 88 16'.
 *
 * Existe porque la normalización a E.164 se hizo sin backfill (decisión explícita), así
 * que en la base conviven '+34637078816' y '611 71 11 01'. Cualquier lugar que muestre el
 * teléfono crudo mezcla los dos formatos; esto los unifica en pantalla sin tocar el dato.
 *
 * NO reusa `parsePhone`: su rama de número inválido pasa por `AsYouType` y devuelve algo
 * distinto del crudo. La copia gemela en supabase/functions/_shared/phone.ts no tiene esa
 * rama, y las dos tienen que dar la MISMA cadena — si no, la sugerencia de "la visita ya
 * pasó" (que la escribe el barrido en Deno) nombraría al cliente distinto que las otras dos.
 *
 * No parsea => se devuelve crudo, mismo criterio que la gemela.
 */
export function formatPhoneNational(
  raw: string | null | undefined,
  defaultCountry: CountryCode = 'ES',
): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry)
  return parsed?.isValid() ? parsed.formatNational() : trimmed
}

const regionNames = new Intl.DisplayNames(['es'], { type: 'region' })

export function getCountryOptions(): CountryOption[] {
  return getCountries()
    .map(code => ({
      code,
      dialCode: `+${getCountryCallingCode(code)}`,
      name: regionNames.of(code) ?? code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

const DIAL_CODE_PRIORITY: Partial<Record<string, CountryCode>> = {
  '+1': 'US',
  '+7': 'RU',
  '+44': 'GB',
  '+39': 'IT',
}

export function findCountryByDialCode(options: CountryOption[], digits: string): CountryOption | undefined {
  if (!digits) return undefined
  const dialCode = `+${digits}`
  const matches = options.filter(option => option.dialCode === dialCode)
  if (matches.length === 0) return undefined
  if (matches.length === 1) return matches[0]

  const priority = DIAL_CODE_PRIORITY[dialCode]
  if (priority) {
    const found = matches.find(option => option.code === priority)
    if (found) return found
  }
  return matches[0] // ya viene alfabético porque options (getCountryOptions()) ordena así
}

/** Cuántos dígitos hay antes de `position` en `text` (ignora espacios/separadores). */
export function digitsBeforePosition(text: string, position: number): number {
  return text.slice(0, position).replace(/\D/g, '').length
}

/** Posición en `text` justo después de haber consumido `digitCount` dígitos. */
export function positionAfterDigits(text: string, digitCount: number): number {
  if (digitCount <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/\d/.test(text[i])) {
      seen++
      if (seen === digitCount) return i + 1
    }
  }
  return text.length
}
