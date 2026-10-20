import { assertEquals } from 'jsr:@std/assert@1'
import type { EmailMessage } from '../_shared/email.ts'
import { handleSendEmail, MAX_ATTACHMENTS_BYTES, parseAttachments, type SendEmailDeps, type SendEmailInput } from './handler.ts'

const VALID: SendEmailInput = { to: ' prueba@example.com ', subject: 'Prueba', text: 'Hola\nmundo', attachments: undefined }

function fakeDeps(over: Partial<SendEmailDeps> = {}) {
  const sent: EmailMessage[] = []
  const deps: SendEmailDeps = {
    getCaller: async () => ({ rol: 'SUPERADMIN', activo: true }),
    send: async msg => { sent.push(msg); return { id: 'email_1' } },
    ...over,
  }
  return { deps, sent }
}

Deno.test('un SUPERADMIN activo manda, con la casilla recortada', async () => {
  const { deps, sent } = fakeDeps()
  assertEquals(await handleSendEmail('me', VALID, deps), { ok: true, id: 'email_1' })
  assertEquals(sent, [{ to: 'prueba@example.com', subject: 'Prueba', text: 'Hola\nmundo' }])
})

for (const [label, caller] of [
  ['un SDR', { rol: 'SDR', activo: true }],
  ['un SUPERADMIN dado de baja', { rol: 'SUPERADMIN', activo: false }],
  ['alguien sin fila en users', null],
] as const) {
  Deno.test(`${label} no manda nada (403)`, async () => {
    const { deps, sent } = fakeDeps({ getCaller: async () => caller })
    assertEquals(await handleSendEmail('me', VALID, deps), { ok: false, status: 403, error: 'No autorizado' })
    assertEquals(sent.length, 0)
  })
}

Deno.test('casilla inválida, asunto o mensaje vacíos → 400 sin mandar', async () => {
  const { deps, sent } = fakeDeps()
  assertEquals((await handleSendEmail('me', { ...VALID, to: 'no-es-mail' }, deps)).ok, false)
  assertEquals((await handleSendEmail('me', { ...VALID, subject: '  ' }, deps)).ok, false)
  assertEquals((await handleSendEmail('me', { ...VALID, text: '\n ' }, deps)).ok, false)
  assertEquals(sent.length, 0)
})

Deno.test('los adjuntos llegan a Resend con el nombre recortado', async () => {
  const { deps, sent } = fakeDeps()
  const attachments = [{ filename: ' hola.txt ', content: 'aG9sYQ==' }]
  assertEquals((await handleSendEmail('me', { ...VALID, attachments }, deps)).ok, true)
  assertEquals(sent[0].attachments, [{ filename: 'hola.txt', content: 'aG9sYQ==' }])
})

Deno.test('sin adjuntos no se manda la clave', async () => {
  const { deps, sent } = fakeDeps()
  await handleSendEmail('me', { ...VALID, attachments: [] }, deps)
  assertEquals('attachments' in sent[0], false)
})

Deno.test('parseAttachments: rechaza lo que no es una lista de { filename, content base64 }', () => {
  assertEquals(parseAttachments(undefined), [])
  assertEquals(parseAttachments('x'), null)
  assertEquals(parseAttachments([{ filename: '', content: 'aG9sYQ==' }]), null)
  assertEquals(parseAttachments([{ filename: 'a.txt', content: 'no es base64!' }]), null)
  assertEquals(parseAttachments([{ filename: 'a.txt' }]), null)
})

Deno.test('adjuntos inválidos → 400 y de más de 10MB → 413, sin mandar', async () => {
  const { deps, sent } = fakeDeps()
  assertEquals(await handleSendEmail('me', { ...VALID, attachments: 'x' }, deps), { ok: false, status: 400, error: 'Adjuntos inválidos' })
  const big = [{ filename: 'big.bin', content: 'A'.repeat(MAX_ATTACHMENTS_BYTES + 4) }]
  assertEquals((await handleSendEmail('me', { ...VALID, attachments: big }, deps)) as unknown, { ok: false, status: 413, error: 'Los adjuntos pasan los 10MB' })
  assertEquals(sent.length, 0)
})

const CAMPOS_VIDEO = { asunto: 'Propelia', cuerpo: 'Hola <b>', urlVideo: 'https://youtu.be/x', nombre: 'Ana' }
const PLANTILLA: SendEmailInput = { to: 'ana@example.com', subject: '', text: '', attachments: undefined, plantilla: 'presentacion-video', campos: CAMPOS_VIDEO }

Deno.test('plantilla: un SDR activo la manda, en HTML escapado, firmada y respondiendo a su email', async () => {
  const { deps, sent } = fakeDeps({ getCaller: async () => ({ rol: 'SDR', activo: true, nombre: 'Lore', email: 'lorenzo@propelia.es', firma_nombre: 'Lorenzo Piatti Fadda' }) })
  assertEquals(await handleSendEmail('me', PLANTILLA, deps), { ok: true, id: 'email_1' })
  assertEquals(sent[0].subject, 'Propelia')
  assertEquals(sent[0].replyTo, 'lorenzo@propelia.es')
  assertEquals(sent[0].html?.includes('Hola &lt;b&gt;'), true)
  assertEquals(sent[0].html?.includes('Hola <b>'), false)
  assertEquals(sent[0].html?.includes('Lorenzo Piatti Fadda'), true)
  assertEquals(sent[0].fromName, 'Lorenzo de Propelia')
})

Deno.test('plantilla: sin firma cargada firma con el nombre corto y no lleva reply_to', async () => {
  const { deps, sent } = fakeDeps({ getCaller: async () => ({ rol: 'SDR', activo: true, nombre: 'Ana', email: 'ana@gmail.com' }) })
  await handleSendEmail('me', PLANTILLA, deps)
  assertEquals('replyTo' in sent[0], false)
  assertEquals(sent[0].html?.includes('info@propelia.es'), true)
})

Deno.test('plantilla: un inactivo o sin fila no manda (403)', async () => {
  for (const caller of [{ rol: 'SUPERADMIN', activo: false }, null]) {
    const { deps, sent } = fakeDeps({ getCaller: async () => caller })
    assertEquals((await handleSendEmail('me', PLANTILLA, deps)).ok, false)
    assertEquals(sent.length, 0)
  }
})

Deno.test('plantilla: desconocida, sin vídeo o con un enlace raro → 400 sin mandar', async () => {
  const { deps, sent } = fakeDeps()
  assertEquals((await handleSendEmail('me', { ...PLANTILLA, plantilla: 'otra' }, deps)).ok, false)
  assertEquals((await handleSendEmail('me', { ...PLANTILLA, campos: { ...CAMPOS_VIDEO, urlVideo: '' } }, deps)).ok, false)
  assertEquals((await handleSendEmail('me', { ...PLANTILLA, campos: { ...CAMPOS_VIDEO, urlBoton: 'javascript:alert(1)' } }, deps)).ok, false)
  assertEquals((await handleSendEmail('me', { ...PLANTILLA, campos: 'x' }, deps)).ok, false)
  assertEquals(sent.length, 0)
})

const PUNTUAL: SendEmailInput = { ...PLANTILLA, plantilla: 'puntual', campos: { asunto: 'Propelia', cuerpo: 'Hola', nombre: 'Ana' } }

Deno.test('plantilla: el mail puntual lleva los adjuntos, un SDR incluido', async () => {
  const { deps, sent } = fakeDeps({ getCaller: async () => ({ rol: 'SDR', activo: true, nombre: 'Ana' }) })
  const attachments = [{ filename: ' dossier.pdf ', content: 'aG9sYQ==' }]
  assertEquals((await handleSendEmail('me', { ...PUNTUAL, attachments }, deps)).ok, true)
  assertEquals(sent[0].attachments, [{ filename: 'dossier.pdf', content: 'aG9sYQ==' }])
})

Deno.test('plantilla: sin adjuntos no se manda la clave', async () => {
  const { deps, sent } = fakeDeps()
  await handleSendEmail('me', { ...PUNTUAL, attachments: [] }, deps)
  assertEquals('attachments' in sent[0], false)
})

Deno.test('plantilla: adjuntos en la que no los lleva, inválidos o de más de 10MB → sin mandar', async () => {
  const { deps, sent } = fakeDeps()
  const uno = [{ filename: 'a.txt', content: 'aG9sYQ==' }]
  assertEquals(await handleSendEmail('me', { ...PLANTILLA, attachments: uno }, deps), { ok: false, status: 400, error: 'Esta plantilla no lleva adjuntos' })
  assertEquals((await handleSendEmail('me', { ...PUNTUAL, attachments: 'x' }, deps)).ok, false)
  const big = [{ filename: 'big.bin', content: 'A'.repeat(MAX_ATTACHMENTS_BYTES + 4) }]
  assertEquals((await handleSendEmail('me', { ...PUNTUAL, attachments: big }, deps)) as unknown, { ok: false, status: 413, error: 'Los adjuntos pasan los 10MB' })
  assertEquals(sent.length, 0)
})
