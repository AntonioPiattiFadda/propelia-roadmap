import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { armarMetaDeActividad, TEXTO_DE_DEMO, type MetaDeActividad } from '../lib/actividad'
import {
  campoDelNuevoDecisor, conDecisorApuntado, contactosConDecisor, decisorSabido, patchDeContactosNuevos, tieneDecisor,
} from '../lib/clientData'
import { mensajeDeError } from '../lib/errores'
import { esEmailValido, type RegistroInicialDeDemo } from '../lib/reuniones'
import { crearComentario } from '../service/crm.service'
import { CRM_KEYS } from './keys'
import { useCrmCatalogos } from './useCrmCatalogos'
import { useLead } from './useCrmLeads'
import { useActualizarCliente, useActualizarLead } from './useLeadMutaciones'

/* El registro de actividad de una demo (22/10/2026, por pedido). La demo se agenda en la ventana de
   «Registrar actividad» del lead (desde el 23/10/2026; antes en la Agenda, en otra pestaña) y al
   lado de la reunión va lo que es para el equipo:
   quién asiste, si es decisor, lo escrito, el decisor apuntado y en qué etapa queda el lead (desde
   el 23/10/2026 en el orden y con las reglas del registro de la llamada). Nada de eso llega al cliente
   ni va al evento de Google. Con la reunión guardada, `registrar()`:
   - deja en el lead una actividad «Demo» (`crm_comments`, meta `tipo: 'demo'` con el id de la
     reunión: la actividad la pinta junto a la reunión, ver `lineaDeTiempo`);
   - carga al perfil a los escritos a mano y al decisor apuntado, y marca como decisor al que
     contestó «Sí» (`campoDelNuevoDecisor`), como la llamada;
   - le guarda a la inmobiliaria el email de la invitación si no tenía;
   - mueve la etapa.
   Sin `leadId` el hook no hace nada (la Agenda sin demo). */
export function useRegistroDeDemo(leadId: string | undefined, open: boolean, inicial?: RegistroInicialDeDemo) {
  const { data: lead } = useLead(leadId)
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const qc = useQueryClient()
  const actualizarCliente = useActualizarCliente()
  const actualizarLead = useActualizarLead()

  const [con, setCon] = useState<string[]>([])
  // Los escritos a mano: entran como pastilla elegida y al registrar se cargan al perfil.
  const [nuevos, setNuevos] = useState<string[]>([])
  const [decisor, setDecisor] = useState('')
  // El «¿Es decisor?» de la llamada: `null` es «todavía no contestó».
  const [esDecisor, setEsDecisor] = useState<boolean | null>(null)
  const [texto, setTexto] = useState('')
  // Arranca vacía y es obligatoria, como al registrar una actividad en el lead.
  const [etapa, setEtapa] = useState<string | null>(null)
  const [intento, setIntento] = useState(false)

  /* Mismo patrón que el formulario de la reunión: se rearma cada vez que se abre, desde `inicial` (lo
     que se venía escribiendo en otra actividad) o vacío. Se lee por closure: cambiarlo con el
     formulario abierto no pisa lo que se está escribiendo. */
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCon(inicial?.con ?? []); setNuevos(inicial?.nuevos ?? []); setDecisor(inicial?.decisor ?? '')
    setEsDecisor(inicial?.esDecisor ?? null)
    setTexto(inicial?.texto ?? ''); setEtapa(inicial?.etapa ?? null); setIntento(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const conDecisor = contactosConDecisor(lead?.client)
  const contactos = conDecisor.map(c => c.nombre)
  const elegibles = [...contactos, ...nuevos]
  const eligioConQuien = elegibles.length === 0 || con.some(c => elegibles.includes(c))
  // Como en la llamada: si el perfil ya dice si los elegidos deciden, no se pregunta.
  const sabido = decisorSabido(conDecisor, con)
  const pideEsDecisor = !!lead && eligioConQuien && sabido === null
  // El decisor se pide mientras el perfil no tenga a nadie marcado, como en la llamada.
  const pideDecisor = !!lead && !tieneDecisor(lead.client)

  /* Descartado no se ofrece: agendar una demo y descartar el lead no van juntos, y el descarte pide
     motivo en su propio diálogo, que vive en el CRM. */
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel && e.id !== descartada?.id)
  const actual = lead?.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  if (actual && actual.id !== descartada?.id && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)

  const falta = { con: !eligioConQuien, decisor: pideEsDecisor && esDecisor === null, etapa: !etapa }

  const alternar = (nombre: string) => setCon(xs => xs.includes(nombre) ? xs.filter(x => x !== nombre) : [...xs, nombre])
  const agregar = (escrito: string) => {
    const nombre = escrito.trim().replace(/\s+/g, ' ')
    if (!nombre) return
    const existente = elegibles.find(c => c.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))
    if (!existente) setNuevos(xs => [...xs, nombre])
    const elegido = existente ?? nombre
    setCon(xs => xs.includes(elegido) ? xs : [...xs, elegido])
  }
  const sacar = (nombre: string) => { setNuevos(xs => xs.filter(x => x !== nombre)); setCon(xs => xs.filter(x => x !== nombre)) }

  /** Marca en rojo lo que falta y dice si se puede agendar. */
  const validar = () => {
    setIntento(true)
    return !falta.con && !falta.decisor && !falta.etapa
  }

  const registrar = async ({ reunionId, email }: { reunionId: string; email: string }) => {
    if (!lead) return
    const elegidos = con.filter(c => elegibles.includes(c))
    const apuntado = pideDecisor ? decisor.trim().replace(/\s+/g, ' ') : ''
    const decide = sabido ?? esDecisor === true
    const meta: MetaDeActividad = {
      tipo: 'demo', con: elegidos, decisor: decide, reunion: reunionId, ...(apuntado ? { decisorApuntado: apuntado } : {}),
    }
    try {
      await crearComentario({ lead_id: lead.id, description: texto.trim() || TEXTO_DE_DEMO, long_description: armarMetaDeActividad(meta) })
    } catch (error) {
      toast.error(`La demo quedó agendada, pero no se registró la actividad: ${mensajeDeError(error)}`)
    }
    void qc.invalidateQueries({ queryKey: CRM_KEYS.detalle(lead.id) })
    void qc.invalidateQueries({ queryKey: CRM_KEYS.leads })

    const client = lead.client
    if (client) {
      const nuevosElegidos = nuevos.filter(c => elegidos.includes(c))
      // Las mismas dos reglas que la llamada: el único elegido escrito a mano que decide entra ya
      // como decisor, y el contacto que contestó «Sí» queda marcado para no volver a preguntarlo.
      const decisorEscrito = decide && elegidos.length === 1 && nuevos.includes(elegidos[0]) ? elegidos[0] : null
      const nuevoDecisor = sabido === null ? campoDelNuevoDecisor(conDecisor, elegidos, decide) : null
      const { patch, sinLugar } = nuevosElegidos.length > 0
        ? patchDeContactosNuevos(client, nuevosElegidos, decisorEscrito) : { patch: {}, sinLugar: [] }
      const conApuntado = apuntado ? conDecisorApuntado(client, patch, apuntado) : { patch, sinLugar: false }
      const todo = { ...conApuntado.patch, ...(nuevoDecisor ? { [nuevoDecisor]: true } : {}) }
      if (Object.keys(todo).length > 0) actualizarCliente.mutate({ clientId: client.id, patch: todo })
      if (sinLugar.length > 0) toast(`El perfil no tiene más lugar para contactos: ${sinLugar.join(', ')} quedó solo en la actividad`)
      if (conApuntado.sinLugar) toast(`El perfil no tiene más lugar para contactos: el decisor ${apuntado} no se cargó`)
      // Aparte: si falla (otro cliente ya tiene ese mail), lo demás se guarda igual y el hook avisa.
      const mail = email.trim().toLowerCase()
      if (!client.email?.trim() && esEmailValido(mail)) actualizarCliente.mutate({ clientId: client.id, patch: { email: mail } })
    }

    const destino = etapa ? etapasPorId.get(etapa) : undefined
    if (destino && destino.id !== lead.funnel_stage_id) {
      actualizarLead.mutate(
        { id: lead.id, patch: { funnel_stage_id: destino.id, discard_reason: null, recontact_at: null } },
        { onSuccess: () => toast.success(`Lead en «${destino.label}»`) })
    }
  }

  return {
    activo: !!leadId, lead, actual,
    conDecisor, contactos, nuevos, con, alternar, agregar, sacar,
    sabido, pideEsDecisor, esDecisor, setEsDecisor,
    pideDecisor, decisor, setDecisor,
    texto, setTexto,
    opcionesEtapa, etapa, setEtapa,
    falta, intento, validar, registrar,
  }
}

export type RegistroDeDemo = ReturnType<typeof useRegistroDeDemo>
