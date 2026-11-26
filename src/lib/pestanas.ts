import { useSyncExternalStore } from 'react'

/* Muchas pestañas abiertas no tienen que cargar la base (26/11/2026). Una SDR llegó a tener ~170
   pestañas del CRM: cada aviso de realtime y cada sondeo corrían 170 veces, y su propio «Registrar»
   quedaba en la cola de su navegador detrás de miles de pedidos. Dos reglas:

   - Lo que se re-trae por un aviso espera a que la pestaña esté a la vista (`cuandoEsteVisible`).
   - Los sondeos que tienen que andar de fondo (alarmas, emails, avisos) los hace UNA pestaña sola
     (`useSondeaDeFondo`); a la vista, cada una sondea como siempre. */

const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'

/** Corre `fn` ya si la pestaña está a la vista; si no, la primera vez que vuelva a estarlo.
 *  Devuelve con qué cancelarla. */
export function cuandoEsteVisible(fn: () => void): () => void {
  if (visible()) { fn(); return () => {} }
  const alCambiar = () => {
    if (!visible()) return
    document.removeEventListener('visibilitychange', alCambiar)
    fn()
  }
  document.addEventListener('visibilitychange', alCambiar)
  return () => document.removeEventListener('visibilitychange', alCambiar)
}

/** Para avisos de realtime: `avisar()` corre `fn` si la pestaña está a la vista y, si no, una
 *  sola vez al volver aunque hayan llegado varios avisos. `cerrar()` descarta lo pendiente. */
export function alVerse(fn: () => void) {
  let cancelar: (() => void) | undefined
  return {
    avisar() {
      if (cancelar) return
      let yaCorrio = false
      const c = cuandoEsteVisible(() => { yaCorrio = true; cancelar = undefined; fn() })
      if (!yaCorrio) cancelar = c
    },
    cerrar() { cancelar?.(); cancelar = undefined },
  }
}

/* Un solo lock por pestaña, pedido la primera vez que alguien pregunta y retenido mientras viva la
   pestaña: al cerrarse, el navegador lo suelta y lo hereda la que estaba esperando. Sin Web Locks
   (navegador viejo) todas sondean, como antes. */
const LOCK_DE_SONDEO = 'propelia-sondeo-de-fondo'
const conLocks = typeof navigator !== 'undefined' && 'locks' in navigator
let lider = !conLocks
let pedido = false
const oyentes = new Set<() => void>()

function suscribir(oyente: () => void) {
  oyentes.add(oyente)
  if (!pedido && conLocks) {
    pedido = true
    void navigator.locks.request(LOCK_DE_SONDEO, () => {
      lider = true
      oyentes.forEach(o => o())
      return new Promise<void>(() => {}) // no se suelta nunca: lo libera cerrar la pestaña
    }).catch(() => { pedido = false })
  }
  return () => { oyentes.delete(oyente) }
}

/** `true` en la única pestaña de este navegador que sondea con la pestaña de fondo. */
export function useSondeaDeFondo(): boolean {
  return useSyncExternalStore(suscribir, () => lider, () => lider)
}
