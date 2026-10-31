import { assert } from 'jsr:@std/assert@1'

// Toda edge function salvo `mcp` tiene que rechazar el token de un conector (oauthClientGuard.ts).
// Sin esto, el token que recibe Claude podría crear miembros, mandar emails o tocar el
// calendario de alguien con los permisos del usuario. Una función nueva sin el guard rompe acá.
Deno.test('todas las edge functions salvo mcp envuelven Deno.serve con withoutOAuthClients', async () => {
  const raiz = new URL('../../', import.meta.url)
  const faltan: string[] = []
  for await (const entrada of Deno.readDir(raiz)) {
    if (!entrada.isDirectory || entrada.name.startsWith('_') || entrada.name === 'mcp') continue
    let codigo: string
    try {
      codigo = await Deno.readTextFile(new URL(`${entrada.name}/index.ts`, raiz))
    } catch {
      continue
    }
    if (!codigo.includes('Deno.serve(withoutOAuthClients(')) faltan.push(entrada.name)
  }
  assert(faltan.length === 0, `Sin el guard de conectores: ${faltan.join(', ')}`)
})
