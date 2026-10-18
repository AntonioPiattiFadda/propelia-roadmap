import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { EmailAlreadySentError, EmailConfigError, EmailProviderError, SENDER, sendEmail } from './email.ts'

const env = (values: Record<string, string>) => (key: string) => values[key]
const okEnv = env({ RESEND_API_KEY: 're_test' })

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as unknown as typeof fetch
  return { fn, calls }
}

Deno.test('manda a Resend desde info@propelia.es, con reply_to', async () => {
  const f = fakeFetch(200, { id: 'email_123' })
  const result = await sendEmail(
    { to: 'lead@example.com', subject: 'Hola', text: 'x', replyTo: 'antonio@propelia.es' },
    { env: okEnv, fetch: f.fn },
  )
  assertEquals(result, { id: 'email_123' })
  assertEquals(f.calls[0].url, 'https://api.resend.com/emails')
  assertEquals((f.calls[0].init.headers as Record<string, string>).Authorization, 'Bearer re_test')
  const body = JSON.parse(f.calls[0].init.body as string)
  assertEquals(body.from, `"Propelia" <${SENDER}>`)
  assertEquals(SENDER, 'info@propelia.es')
  assertEquals(body.to, ['lead@example.com'])
  assertEquals(body.reply_to, 'antonio@propelia.es')
})

Deno.test('sin RESEND_API_KEY → EmailConfigError, sin llamar a Resend', async () => {
  const f = fakeFetch(200, { id: 'x' })
  await assertRejects(
    () => sendEmail({ to: 'a@b.co', subject: 's', text: 't' }, { env: env({}), fetch: f.fn }),
    EmailConfigError,
  )
  assertEquals(f.calls.length, 0)
})

Deno.test('Resend responde error → EmailProviderError con su mensaje', async () => {
  const f = fakeFetch(422, { message: 'Invalid `to` field' })
  await assertRejects(
    () => sendEmail({ to: 'a@b.co', subject: 's', text: 't' }, { env: okEnv, fetch: f.fn }),
    EmailProviderError,
    'Invalid `to` field',
  )
})

Deno.test('respuesta no JSON → EmailProviderError genérico', async () => {
  const fn = (() => Promise.resolve(new Response('<html>502</html>', { status: 502 }))) as unknown as typeof fetch
  await assertRejects(
    () => sendEmail({ to: 'a@b.co', subject: 's', text: 't' }, { env: okEnv, fetch: fn }),
    EmailProviderError,
    'Email provider error (502)',
  )
})

Deno.test('con idempotencyKey manda el header Idempotency-Key; sin key no lo manda', async () => {
  const f = fakeFetch(200, { id: 'email_1' })
  await sendEmail({ to: 'a@b.co', subject: 's', text: 't', idempotencyKey: 'crm:lead1:aviso' }, { env: okEnv, fetch: f.fn })
  assertEquals((f.calls[0].init.headers as Record<string, string>)['Idempotency-Key'], 'crm:lead1:aviso')
  const g = fakeFetch(200, { id: 'email_2' })
  await sendEmail({ to: 'a@b.co', subject: 's', text: 't' }, { env: okEnv, fetch: g.fn })
  assertEquals('Idempotency-Key' in (g.calls[0].init.headers as Record<string, string>), false)
})

Deno.test('409 invalid_idempotent_request → EmailAlreadySentError', async () => {
  const f = fakeFetch(409, { name: 'invalid_idempotent_request', message: 'Same key, different payload' })
  await assertRejects(
    () => sendEmail({ to: 'a@b.co', subject: 's', text: 't', idempotencyKey: 'k' }, { env: okEnv, fetch: f.fn }),
    EmailAlreadySentError,
  )
})

Deno.test('adjuntos van como attachments; lista vacía no se manda', async () => {
  const f = fakeFetch(200, { id: 'email_1' })
  await sendEmail({ to: 'a@b.co', subject: 's', text: 't', attachments: [{ filename: 'a.txt', content: 'YQ==' }] }, { env: okEnv, fetch: f.fn })
  assertEquals(JSON.parse(f.calls[0].init.body as string).attachments, [{ filename: 'a.txt', content: 'YQ==' }])
  const g = fakeFetch(200, { id: 'email_2' })
  await sendEmail({ to: 'a@b.co', subject: 's', text: 't', attachments: [] }, { env: okEnv, fetch: g.fn })
  assertEquals('attachments' in JSON.parse(g.calls[0].init.body as string), false)
})
