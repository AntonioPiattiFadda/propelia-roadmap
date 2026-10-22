import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { armarMetaDeActividad, TEXTO_DE_DEMO, type MetaDeActividad } from '../lib/actividad'
import { conDecisorApuntado, contactosConDecisor, patchDeContactosNuevos, tieneDecisor } from '../lib/clientData'
import { mensajeDeError } from '../lib/errores'
import { esEmailValido } from '../lib/reuniones'
import { crearComentario } from '../service/crm.service'
import { CRM_KEYS } from './keys'
import { useCrmCatalogos } from './useCrmCatalogos'
import { useLead } from './useCrmLeads'
import { useActualizarCliente, useActualizarLead } from './useLeadMutaciones'

/* El registro de actividad de una demo (22/10/2026, por pedido). La demo se agenda en la Agenda
   (`/agenda?leadId=…&demo=1`, en otra pestaña) y al lado de la reunión va lo que es para el equipo:
   el decisor, quién asiste, lo escrito y en qué etapa queda el lead. Nada de eso llega al cliente
   ni va al evento de Google. Con la reunión guardada, `registrar()`:
   - deja en el lead una actividad «Demo» (`crm_comments`, meta `tipo: 'demo'` con el id de la
     reunión: la actividad la pinta junto a la reunión, ver `lineaDeTiempo`);
   - carga al perfil a los escritos a mano y al decisor apuntado, como la llamada;
   - le guarda a la inmobiliaria el email de la invitación si no tenía;
   - mueve la etapa.
   La pestaña del CRM se entera sola: `useCrmRealtime` invalida el detalle con cada `crm_comments`.
   Sin `leadId` el hook no hace nada (la Agenda sin demo). */
export function useRegistroDeDemo(leadId: string | undefined, open: boolean) {
  const { data: lead } = useLead(leadId)
  const { etapasPorId, etapasActivas, descartada } = useCrmCatalogos()
  const qc = useQueryClient()
  const actualizarCliente = useActualizarCliente()
  const actualizarLead = useActualizarLead()

  const [con, setCon] = useState<string[]>([])
  // Los escritos a mano: entran como pastilla elegida y al registrar se cargan al perfil.
  const [nuevos, setNuevos] = useState<string[]>([])
  const [decisor, setDecisor] = useState('')
  const [texto, setTexto] = useState('')
  // Arranca vacía y es obligatoria, como al registrar una actividad en el lead.
  const [etapa, setEtapa] = useState<string | null>(null)
  const [intento, setIntento] = useState(false)

  // Mismo patrón que el formulario de la reunión: se vacía cada vez que se abre.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCon([]); setNuevos([]); setDecisor(''); setTexto(''); setEtapa(null); setIntento(false)
  }, [open])

  const contactos = contactosConDecisor(lead?.client).map(c => c.nombre)
  const elegibles = [...contactos, ...nuevos]
  const eligioConQuien = elegibles.length === 0 || con.some(c => elegibles.includes(c))
  // El decisor se pide mientras el perfil no tenga a nadie marcado, como en la llamada.
  const pideDecisor = !!lead && !tieneDecisor(lead.client)

  /* Descartado no se ofrece: agendar una demo y descartar el lead no van juntos, y el descarte pide
     motivo en su propio diálogo, que vive en el CRM. */
  const opcionesEtapa = etapasActivas.filter(e => !e.is_out_of_funnel && e.id !== descartada?.id)
  const actual = lead?.funnel_stage_id ? etapasPorId.get(lead.funnel_stage_id) : undefined
  if (actual && actual.id !== descartada?.id && !opcionesEtapa.some(e => e.id === actual.id)) opcionesEtapa.push(actual)

  const falta = { con: !eligioConQuien, etapa: !etapa }

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
    return !falta.con && !falta.etapa
  }

  const registrar = async ({ reunionId, email }: { reunionId: string; email: string }) => {
    if (!lead) return
    const elegidos = con.filter(c => elegibles.includes(c))
    const apuntado = pideDecisor ? decisor.trim().replace(/\s+/g, ' ') : ''
    const meta: MetaDeActividad = { tipo: 'demo', con: elegidos, reunion: reunionId, ...(apuntado ? { decisorApuntado: apuntado } : {}) }
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
      const { patch, sinLugar } = nuevosElegidos.length > 0
        ? patchDeContactosNuevos(client, nuevosElegidos, null) : { patch: {}, sinLugar: [] }
      const conApuntado = apuntado ? conDecisorApuntado(client, patch, apuntado) : { patch, sinLugar: false }
      if (Object.keys(conApuntado.patch).length > 0) actualizarCliente.mutate({ clientId: client.id, patch: conApuntado.patch })
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
    contactos, nuevos, con, alternar, agregar, sacar,
    pideDecisor, decisor, setDecisor,
    texto, setTexto,
    opcionesEtapa, etapa, setEtapa,
    falta, intento, validar, registrar,
  }
}

export type RegistroDeDemo = ReturnType<typeof useRegistroDeDemo>
