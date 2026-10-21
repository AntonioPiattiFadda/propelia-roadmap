import { expect, it } from 'vitest'
// Portado de los Deno.test del producto: mismos asserts, sobre vitest (acá no hay Deno).
const assertEquals = (actual: unknown, expected: unknown) => expect(actual).toEqual(expected)
import { AVAILABLE_LEAD_NOTIFICATION_CHANNELS } from './leadNotifications'
import { AVAILABLE_CHANNELS, isAvailableChannel } from '../../../../supabase/functions/_shared/leadNotifications/channels'

it('sólo email está disponible: SMS está cableado pero apagado', () => {
  assertEquals([...AVAILABLE_CHANNELS], ['email'])
  assertEquals(isAvailableChannel('email'), true)
  assertEquals(isAvailableChannel('sms'), false)
  assertEquals(isAvailableChannel('whatsapp'), false)
  assertEquals(isAvailableChannel('fax'), false)
})

it('el front ofrece las mismas vías que despacha el servidor', () => {
  assertEquals([...AVAILABLE_LEAD_NOTIFICATION_CHANNELS], [...AVAILABLE_CHANNELS])
})
