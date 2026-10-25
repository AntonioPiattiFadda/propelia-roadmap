import { Lock } from 'lucide-react'
import type { RegistroDeDemo } from '../hooks/useRegistroDeDemo'
import type { CampoDecisor } from '../lib/clientData'
import {
  CajaDeEtapa, CampoDecisorApuntado, claseDelTexto, FilaDePersonas, FilaEsDecisor, NotaDeDecisorSabido,
} from './FilasDelRegistro'

/* La columna izquierda del formulario de la reunión cuando se agenda una demo de un lead (22/10/2026,
   por pedido; a la izquierda desde el 23/10/2026). Mismo orden y mismos renglones que el registro de
   la llamada (`FilasDelRegistro`), para no marear: con quién (acá «Quién asiste»), «¿Es decisor?», el
   texto, el decisor apuntado y la etapa. Sin «Teléfono contacto»: en una demo no se marcó ningún
   número. El estado vive en `useRegistroDeDemo`, que también lo guarda; esto solo lo pinta. */
export function RegistroDeDemoPanel({ r, onAbrirContacto }: { r: RegistroDeDemo; onAbrirContacto?: (campo: CampoDecisor) => void }) {
  const enRojo = (k: keyof RegistroDeDemo['falta']) => r.intento && r.falta[k]

  return (
    <section aria-label="Registro de actividad" className="flex flex-col gap-4">
      <div>
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">Registro de actividad</h3>
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-(--fg-2)">
          <Lock size={12} aria-hidden className="shrink-0" />
          Queda en el CRM. No le llega al cliente.
        </p>
      </div>

      <FilaDePersonas rotulo="Quién asiste" contactos={r.contactos} nuevos={r.nuevos} con={r.con}
        onAlternar={r.alternar} onSacar={r.sacar} onAgregar={r.agregar}
        campoDe={c => r.conDecisor.find(p => p.nombre === c)?.campoDecisor}
        onAbrirContacto={onAbrirContacto} rojo={enRojo('con')}
        tituloNuevo="Se carga como contacto al agendar"
        ariaEscribir="Escribir quién asiste, si no está entre los contactos" />

      {r.pideEsDecisor && (
        <FilaEsDecisor valor={r.esDecisor} onCambiar={r.setEsDecisor} rojo={enRojo('decisor')}
          title="Quien asiste decide en la inmobiliaria" />
      )}
      {r.sabido !== null && <NotaDeDecisorSabido sabido={r.sabido} />}

      <textarea rows={6} value={r.texto} onChange={e => r.setTexto(e.target.value)}
        aria-label="Registro de actividad de la demo"
        placeholder="Qué quiere ver en la demo, dudas… (opcional)"
        className={claseDelTexto(false)} />

      {r.pideDecisor && (
        <CampoDecisorApuntado id="demo-decisor" valor={r.decisor} onCambiar={r.setDecisor}
          title="Se carga en el perfil como decisor al agendar" />
      )}

      <CajaDeEtapa valor={r.etapa ?? ''} onCambiar={r.setEtapa} opciones={r.opcionesEtapa} actual={r.actual}
        rojo={enRojo('etapa')} aviso="Elegí en qué etapa queda" />
    </section>
  )
}
