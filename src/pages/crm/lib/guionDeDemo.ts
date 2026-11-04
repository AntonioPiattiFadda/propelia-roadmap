/* El guion de la demo (4/11/2026, por pedido): la pestaña «Demo» del lead. Cinco pasos en el orden
   en que se hace la llamada; los tres primeros muestran su detalle al pasar el cursor, planes y
   prueba gratis son solo el recordatorio del paso. No es la `GUIA_DE_DEMO` de `guiaDeLlamada.ts`,
   que es la de AGENDAR la demo.

   Lo que se anota es un solo texto por lead, en una fila de `roadmap_notas` (`demo-guion-<lead>`),
   como el planning diario: sin migración. */

export const PREFIJO_DEL_GUION = 'demo-guion-'
export const idDeLaFilaDelGuion = (leadId: string) => `${PREFIJO_DEL_GUION}${leadId}`

/** Lo que queda en la actividad del lead al tocar «Registrar» (4/11/2026, por pedido): el texto de
 *  una actividad «Demo realizada» (meta `tipo: 'demoHecha'`), que se pinta resaltada y lleva su
 *  propio título. Se edita y se borra como una nota. Vacío = null. */
export function textoDeLasNotasDeDemo(notas: string): string | null {
  return notas.trim() || null
}

/** Material que se abre en otra pestaña para mostrárselo al cliente. */
export const MATERIAL_DE_DEMO = {
  planes: '/demo/planes.html',
  onboarding: '/demo/onboarding.html',
  web: 'https://www.propelia.es/',
} as const

/** El usuario demo del producto, para entrar a propelia.es durante la demo. Es una cuenta de
    demostración: va en el bundle a propósito, por pedido. */
export const CUENTA_DEMO = { usuario: 'demo.admin@propelia.es', clave: '123456' } as const

/** El bot de llamadas: el cliente llama acá para probarlo. */
export const TELEFONO_DEL_BOT = { visible: '930 34 95 34', tel: '+34930349534' } as const

export interface GrupoDeDetalle {
  titulo?: string
  items: readonly string[]
}

export interface EtapaDelGuion {
  id: 'encuadre' | 'diagnostico' | 'demo' | 'planes' | 'prueba'
  titulo: string
  /** Lo que se ve al pasar el cursor. Sin detalle, el paso es solo guía. */
  detalle?: readonly GrupoDeDetalle[]
}

export const ETAPAS_DEL_GUION: readonly EtapaDelGuion[] = [
  {
    id: 'encuadre',
    titulo: 'Encuadre y storytelling',
    detalle: [
      {
        titulo: 'Encuadre',
        items: [
          '«Son 20 minutos: vemos si lo que tenemos te sirve y, después, vemos si tiene sentido avanzar.»',
          'Confirmá quién está en la llamada y quién decide.',
          'Pedí permiso para hacerle unas preguntas antes de mostrar nada.',
        ],
      },
      {
        titulo: 'Storytelling',
        items: [
          'De dónde sale Propelia: los leads repartidos entre portales, Excel y WhatsApp.',
          'Un caso de una agencia parecida a la suya: qué le pasaba y qué cambió.',
          'La idea: todo en un lugar, con la IA trabajando sobre sus datos.',
        ],
      },
    ],
  },
  {
    id: 'diagnostico',
    titulo: 'Diagnóstico',
    detalle: [
      {
        titulo: 'Contexto',
        items: [
          '¿Por qué están aquí? ¿Qué los trajo a la llamada?',
          '¿Cuántos son en el equipo y cuántas oficinas tienen?',
          '¿Quién decide y para cuándo quieren tenerlo resuelto?',
        ],
      },
      {
        titulo: 'Qué usan hoy',
        items: [
          '¿Qué usan hoy para gestionar y cómo les va?',
          '¿Usan ChatGPT, Claude o alguna IA? ¿Para qué?',
          '¿En qué portales publican? Idealista, Fotocasa, otros. ¿Cuántos leads les entran?',
          '¿Usan Better Place, Stay Fox o alguna plataforma parecida?',
        ],
      },
      {
        titulo: 'Cómo trabajan',
        items: [
          '¿Cómo reciben, reparten y siguen los leads?',
          '¿Cómo están valorando los pisos actualmente?',
          '¿Cómo captan propiedades?',
          '¿Cómo agendan las visitas y registran el feedback?',
          '¿Cómo controla el responsable lo que hace cada agente?',
          '¿Qué es lo que más tiempo les hace perder?',
        ],
      },
      { items: ['Anotá los puntos de dolor: la demo va a apuntar ahí.'] },
    ],
  },
  {
    id: 'demo',
    titulo: 'Demo',
    detalle: [
      { items: ['Apuntá cada cosa a un punto de dolor del diagnóstico.'] },
      {
        titulo: 'CRM',
        items: [
          'Portales nucleados: todos los pisos y leads en un lugar',
          'Panel de leads',
          'Cruces: qué pisos encajan con cada comprador',
          'Mensajes predeterminados',
          'Seguimiento, control y reportes al responsable',
        ],
      },
      {
        titulo: 'IA (MCP en ChatGPT / Claude)',
        items: [
          'Generar un informe de valoración',
          'Consultar el catastro',
          'Estimar la dirección de un piso de particular',
          'Hacer una historia de Instagram de un piso',
          'Asentar el feedback de una visita desde ChatGPT',
        ],
      },
      { titulo: 'Bot de llamadas', items: [`Que llame al ${TELEFONO_DEL_BOT.visible} y hable con el bot.`] },
    ],
  },
  { id: 'planes', titulo: 'Planes y precios' },
  { id: 'prueba', titulo: 'Prueba gratis 15 días' },
]
