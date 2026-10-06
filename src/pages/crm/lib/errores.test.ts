import { describe, expect, it } from 'vitest'
import { FALTA_MIGRACION, mensajeDeError, SIN_PERMISO } from './errores'

describe('mensajeDeError', () => {
  it('las claves de la RPC', () => {
    expect(mensajeDeError({ message: 'crm_lead_duplicado', code: 'P0001' })).toBe('Ese cliente ya tiene un lead con ese responsable.')
    expect(mensajeDeError({ message: 'crm_falta_contacto' })).toBe('Falta teléfono o email.')
    expect(mensajeDeError({ message: 'crm_sin_permiso_cartera', code: '42501' })).toBe(SIN_PERMISO)
  })
  it('un rechazo de RLS no se muestra crudo', () => {
    expect(mensajeDeError({ code: '42501', message: 'new row violates row-level security policy for table "crm_leads"' })).toBe(SIN_PERMISO)
  })
  it('un update que la RLS dejó en cero filas', () => {
    expect(mensajeDeError(new Error('crm_sin_fila'))).toBe(SIN_PERMISO)
  })
  it('el único cliente+responsable al reasignar', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "crm_leads_client_assignee_active_uidx"' }))
      .toBe('Ese responsable ya tiene un lead de ese cliente.')
  })
  it('email o teléfono repetido al editar un cliente', () => {
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "crm_clients_phone_active_uidx"' }))
      .toBe('Ya hay otro cliente con ese teléfono.')
    expect(mensajeDeError({ code: '23505', message: 'duplicate key value violates unique constraint "crm_clients_email_active_uidx"' }))
      .toBe('Ya hay otro cliente con ese email.')
  })
  it('una columna que la base todavía no tiene', () => {
    expect(mensajeDeError({ code: 'PGRST204', message: "Could not find the 'website' column of 'crm_clients' in the schema cache" }))
      .toBe(FALTA_MIGRACION)
    expect(mensajeDeError({ code: '42703', message: 'column "city" of relation "crm_clients" does not exist' }))
      .toBe(FALTA_MIGRACION)
  })
  it('sin red', () => expect(mensajeDeError(new TypeError('Failed to fetch'))).toBe('No hay conexión. Probá de nuevo.'))
  it('lo desconocido no se muestra crudo', () => {
    expect(mensajeDeError({ message: 'syntax error at or near' })).toBe('Algo salió mal. Probá de nuevo.')
    expect(mensajeDeError(undefined, 'No se pudo guardar.')).toBe('No se pudo guardar.')
  })
})
