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

export const GUIA_DE_DEMO: readonly SeccionDeGuia[] = [
  {
    pasos: [
      { titulo: 'Confirma que asista quien decide', pista: 'Sin el decisor, la demo se repite.' },
      { titulo: 'Avisa que le llega la invitación por mail', pista: 'Confirma el mail en voz alta y pídele que la acepte.' },
      { titulo: 'Pregunta qué quiere ver en la demo', pista: 'Anótalo abajo: es lo que se prepara.' },
    ],
  },
]
