/* La guía que acompaña al SDR en el compositor (16/10/2026, por pedido): qué no olvidarse en una
   llamada y al agendar una demo. Es texto fijo y no se guarda nada: los tildes no existen a
   propósito, es un recordatorio y no un formulario. Para cambiarla, se cambia acá.
   La de la llamada va en tres partes, una por cada desenlace posible: quién atendió y qué salió. */

export type PasoDeGuia = { titulo: string; pista?: string }
export type SeccionDeGuia = { titulo?: string; pasos: readonly PasoDeGuia[] }

export const GUIA_DE_LLAMADA: readonly SeccionDeGuia[] = [
  {
    titulo: 'Si contesta el doorkeeper',
    pasos: [
      { titulo: 'Su nombre', pista: 'Para no llamar en frío la próxima vez.' },
      { titulo: 'El nombre del decisor' },
      { titulo: 'El teléfono del decisor', pista: 'O el día y la hora en que se lo puede encontrar.' },
    ],
  },
  {
    titulo: 'Si hablas con el decisor y no agenda',
    pasos: [
      { titulo: 'No te vayas con el primer «no»', pista: 'Repregunta antes de cerrar.' },
      { titulo: 'Busca la demo', pista: 'El objetivo de la llamada sigue siendo agendarla.' },
      { titulo: 'Encuentra los puntos de dolor', pista: 'Haz discovery: qué les cuesta hoy y cómo lo resuelven.' },
    ],
  },
  {
    titulo: 'Si hablas con el decisor y agenda',
    pasos: [
      { titulo: 'Día y hora de la demo' },
      { titulo: 'Su mail', pista: 'Confírmalo en voz alta.' },
      { titulo: 'Envía la invitación', pista: 'Y confirma que la recibió.' },
      { titulo: 'Agenda una tarea con hora', pista: 'Para llamarlo a confirmar antes de la demo y evitar el no show.' },
      {
        titulo: 'Afina el discovery',
        pista: 'Explícale que las preguntas son para personalizar la demo y aportarle más valor.',
      },
    ],
  },
]

/* Discovery (20/11/2026, por pedido): el campo de texto de la llamada y de las notas lo muestra
   como sombreado antes de escribir (`PLACEHOLDER_DE_DISCOVERY`) y, en cuanto se empieza a escribir,
   la guía entera asoma sutil a la izquierda de la ventana (`muestraDiscovery`). Son las preguntas
   de discovery que se usan hoy con las inmobiliarias: situación, dolor, impacto y decisión. */
export const PLACEHOLDER_DE_DISCOVERY = [
  'Discovery — qué se habló…',
  '· ¿Cómo les llegan hoy los leads de Idealista y quién los atiende?',
  '· ¿Qué CRM o herramienta usan? ¿Qué les falta?',
  '· ¿Cuántos agentes son y cuántos inmuebles llevan?',
  '· ¿Qué es lo que más tiempo les quita en el día a día?',
  '· ¿Quién decide y cuándo lo podrían ver?',
].join('\n')

export const GUIA_DE_DISCOVERY: readonly SeccionDeGuia[] = [
  {
    titulo: 'Situación',
    pasos: [
      { titulo: '¿Cuántos agentes y cuántos inmuebles?', pista: 'Tamaño de la agencia y de la cartera.' },
      { titulo: '¿Qué CRM usan hoy?', pista: 'Inmovilla, Witei, Excel… y desde cuándo.' },
      { titulo: '¿De dónde les llegan los leads?', pista: 'Idealista, Fotocasa, web, captación propia.' },
    ],
  },
  {
    titulo: 'Dolor',
    pasos: [
      { titulo: '¿Qué pasa con un lead que entra fuera de hora?', pista: 'Tiempo de respuesta real.' },
      { titulo: '¿Qué les quita más tiempo?', pista: 'Agendar visitas, responder, hacer seguimiento.' },
      { titulo: '¿Qué le cambiarían a su CRM actual?' },
    ],
  },
  {
    titulo: 'Impacto',
    pasos: [
      { titulo: '¿Cuántos leads se les enfrían al mes?', pista: 'Que lo cuantifiquen ellos.' },
      { titulo: '¿Cuánto vale una operación para ellos?', pista: 'Para dimensionar lo que se pierde.' },
    ],
  },
  {
    titulo: 'Decisión',
    pasos: [
      { titulo: '¿Quién más decide?', pista: 'Socio, gerente, quien paga.' },
      { titulo: '¿Qué tendría que ver para cambiar?', pista: 'Lo que hay que mostrar en la demo.' },
      { titulo: '¿Cuándo lo podrían ver juntos?', pista: 'Cierra con día y hora.' },
    ],
  },
]

/** El panel de discovery asoma solo en llamada y notas, y recién cuando hay algo escrito. */
export const muestraDiscovery = (tipo: string, texto: string): boolean =>
  (tipo === 'llamada' || tipo === 'nota') && texto.trim() !== ''

export const GUIA_DE_DEMO: readonly SeccionDeGuia[] = [
  {
    pasos: [
      { titulo: 'Confirma que asista quien decide', pista: 'Sin el decisor, la demo se repite.' },
      { titulo: 'Avisa que le llega la invitación por mail', pista: 'Confirma el mail en voz alta y pídele que la acepte.' },
      { titulo: 'Pregunta qué quiere ver en la demo', pista: 'Anótalo abajo: es lo que se prepara.' },
    ],
  },
]
