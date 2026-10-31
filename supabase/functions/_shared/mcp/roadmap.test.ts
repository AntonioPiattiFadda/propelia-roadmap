import { assertEquals } from 'jsr:@std/assert@1'
import { avisosDeExpl, estadoLabel, explATexto, fechaISO, htmlATexto, prioridadLabel, responsablesDe } from './roadmap.ts'

Deno.test('explATexto: texto plano tal cual', () => {
  assertEquals(explATexto('LOOM: \nhacer el login'), 'LOOM: \nhacer el login')
  assertEquals(explATexto(null), '')
})

Deno.test('explATexto: HTML del editor viejo a texto, con saltos e imágenes', () => {
  assertEquals(explATexto('<!--h--><div>uno</div><div>dos &amp; tres<img src="x"></div>'), 'uno\ndos & tres [imagen]')
})

Deno.test('explATexto: bloques, con títulos, anidados, archivos y tildes desde subtareas; sin el cuadro de avisos', () => {
  const arbol = [
    { k: 'hdr', avisos: [{ texto: 'fijate el endpoint' }] },
    { k: 'h', txt: 'Contexto' },
    { k: 'text', txt: 'Hay que <b>migrar</b>' },
    { k: 'toggle', txt: 'Detalle', kids: [{ k: 'text', txt: 'adentro' }] },
    { k: 'file', f: { n: 'plano.pdf' } },
    { k: 'check', sid: 's1' },
    { k: 'check', sid: 'no-existe' },
  ]
  const pasos = [{ id: 's1', titulo: 'Probar', estado: 'Hecho' }]
  assertEquals(
    explATexto('<!--b-->' + JSON.stringify(arbol), pasos),
    '## Contexto\nHay que migrar\nDetalle\n  adentro\n[archivo: plano.pdf]\n[x] Probar',
  )
})

Deno.test('explATexto: bloques rotos caen a texto', () => {
  assertEquals(explATexto('<!--b-->no es json'), 'no es json')
})

Deno.test('avisosDeExpl: los del bloque hdr; sin página, ninguno', () => {
  const expl = '<!--b-->' + JSON.stringify([{ k: 'hdr', avisos: [{ texto: 'ojo', autor: 'u1', ts: 0, visto: false, para: ['u2'] }] }])
  assertEquals(avisosDeExpl(expl), [{ texto: 'ojo', autor: 'u1', ts: '1970-01-01T00:00:00.000Z', visto: false, para: ['u2'] }])
  assertEquals(avisosDeExpl('texto plano'), [])
})

Deno.test('rótulos: estados, prioridades (bisemanal = mensual) y responsables', () => {
  assertEquals(estadoLabel('Revision'), 'En revisión')
  assertEquals(prioridadLabel('bisemanal'), 'Mensual')
  assertEquals(prioridadLabel('cualquiera'), null)
  assertEquals(responsablesDe(['a', '', 3, 'b']), ['a', 'b'])
  assertEquals(fechaISO('no es fecha'), null)
  assertEquals(htmlATexto('a<br>b'), 'a\nb')
})
