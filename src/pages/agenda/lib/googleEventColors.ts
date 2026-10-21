// Paleta fija de colorId de Google Calendar (1-11). No se puede leer dinámicamente vía
// la API (colors.get) porque ese endpoint requiere un scope OAuth más amplio (calendar o
// calendar.readonly) que el que Propelia pide al conectar (calendar.events, calendar.freebusy,
// ver supabase/functions/_shared/googleOAuth.ts) — Google devuelve permisos insuficientes y
// queda como {} silenciosamente. Escribir colorId en un evento SÍ funciona con el scope actual
// (calendar.events cubre events.insert/patch). Nombres y valores confirmados contra el enum
// oficial EventColor de Apps Script (Lavender..Tomato, en ese orden) — estables desde hace años.
export interface GoogleEventColor {
  name: string
  background: string
}

export const GOOGLE_EVENT_COLORS: Record<string, GoogleEventColor> = {
  '1': { name: 'Lavanda', background: '#a4bdfc' },
  '2': { name: 'Salvia', background: '#7ae7bf' },
  '3': { name: 'Uva', background: '#dbadff' },
  '4': { name: 'Flamenco', background: '#ff887c' },
  '5': { name: 'Banana', background: '#fbd75b' },
  '6': { name: 'Mandarina', background: '#ffb878' },
  '7': { name: 'Pavo real', background: '#46d6db' },
  '8': { name: 'Grafito', background: '#e1e1e1' },
  '9': { name: 'Arándano', background: '#5484ed' },
  '10': { name: 'Albahaca', background: '#51b749' },
  '11': { name: 'Tomate', background: '#dc2127' },
}
