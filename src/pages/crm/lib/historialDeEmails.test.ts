import { describe, expect, it } from 'vitest'
import { filtrarHistorial, grupoDelEstado, rotuloDePlantilla, type EmailDelHistorial } from './historialDeEmails'

const email = (over: Partial<EmailDelHistorial>): EmailDelHistorial => ({
  id: 'e', resend_id: 'r', lead_id: 'L', sent_by: 'yo', to_email: 'ana@agencia.com', subject: 'Hola', plantilla: null,
  status: 'delivered', status_detail: null, status_at: null, sent_at: '2026-11-10T10:00:00Z', seen_at: null, seen_by: null,
  lead: { client: { company_name: 'Inmobiliaria Sol' } }, ...over,
})

describe('grupoDelEstado', () => {
  it('entregado, no llegó o en camino', () => {
    expect(grupoDelEstado('delivered')).toBe('entregados')
    expect(['bounced', 'failed', 'suppressed', 'complained'].map(grupoDelEstado)).toEqual(Array(4).fill('no-llegaron'))
    expect(['sent', 'delivery_delayed'].map(grupoDelEstado)).toEqual(['en-camino', 'en-camino'])
  })
})

describe('rotuloDePlantilla', () => {
  it('nombra las conocidas, deja pasar una nueva y sin plantilla es texto libre', () => {
    expect(rotuloDePlantilla('presentacion-video')).toBe('Presentación con vídeo')
    expect(rotuloDePlantilla('puntual')).toBe('Mail puntual')
    expect(rotuloDePlantilla('acceso')).toBe('Accesos del cliente')
    expect(rotuloDePlantilla('acceso-equipo')).toBe('Accesos del equipo')
    expect(rotuloDePlantilla('otra')).toBe('otra')
    expect(rotuloDePlantilla(null)).toBe('Texto libre')
  })
})

describe('filtrarHistorial', () => {
  const lista = [
    email({ id: '1', sent_at: '2026-11-10T09:00:00Z' }),
    email({ id: '2', sent_at: '2026-11-12T09:00:00Z', status: 'bounced', to_email: 'mal@x.com', sent_by: 'otro' }),
    email({ id: '3', sent_at: '2026-11-11T09:00:00Z', subject: 'Tus accesos', lead: null }),
  ]

  it('sin filtros trae todo, el más nuevo primero', () => {
    expect(filtrarHistorial(lista, {}).map(e => e.id)).toEqual(['2', '3', '1'])
  })

  it('busca en destinatario, asunto e inmobiliaria, sin mayúsculas ni tildes', () => {
    expect(filtrarHistorial(lista, { texto: 'MAL@' }).map(e => e.id)).toEqual(['2'])
    expect(filtrarHistorial(lista, { texto: 'accesos' }).map(e => e.id)).toEqual(['3'])
    expect(filtrarHistorial(lista, { texto: 'inmobiliaria sól' }).map(e => e.id)).toEqual(['2', '1'])
  })

  it('filtra por estado y por quién lo mandó', () => {
    expect(filtrarHistorial(lista, { estado: 'no-llegaron' }).map(e => e.id)).toEqual(['2'])
    expect(filtrarHistorial(lista, { estado: 'entregados', quien: 'yo' }).map(e => e.id)).toEqual(['3', '1'])
  })
})
