// Validación de un email escrito a mano en "Agregar invitados". No pretende ser RFC 5322:
// alcanza con frenar los typos que Google rechazaría (coma en vez de punto, sin dominio, dos
// emails pegados) antes de guardarlos y que el sync falle en silencio.
const GUEST_EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]{2,}$/

export const isValidGuestEmail = (value: string): boolean => GUEST_EMAIL_RE.test(value.trim())

/** Forma en la que se guarda y se compara: sin espacios y en minúscula. */
export const normalizeGuestEmail = (value: string): string => value.trim().toLowerCase()
