/**
 * Pasos del onboarding de un cliente nuevo. Cada paso se documenta en
 * docs/soporteYOnboarding/ONBOARDING_CLIENTES.md y se agrega acá cuando está cerrado.
 *
 * Lo que hizo soporte con cada cliente está en la base (`client_onboarding_tasks`, por
 * `taskKey`). Cambiar el id de una tarea la deja pendiente para todos: las filas viejas
 * quedan huérfanas y se ignoran.
 */

export type OnboardingTaskExtra =
  /** Mensaje de WhatsApp al responsable, con su plantilla en `onboarding_message_templates`. */
  | { kind: 'message'; templateId: OnboardingTemplateId }
  /** Vincular la organización que creó el alta del responsable. */
  | { kind: 'organization' }
  /** El equipo que pasó el cliente, con su contraseña inicial. */
  | { kind: 'team' }
  /** Elegir a la persona de contacto del cliente. */
  | { kind: 'contact' }
  /** Importar la cartera desde un Excel a la organización vinculada. */
  | { kind: 'properties' }

export type OnboardingTask = {
  id: string
  title: string
  description: string
  extra?: OnboardingTaskExtra
  /** Hoy no se puede hacer desde la app: se muestra el aviso. */
  blocked?: string
}

export type OnboardingStep = {
  id: string
  title: string
  summary: string
  tasks: OnboardingTask[]
}

export type OnboardingTemplateId = 'contacto_inicial' | 'configurar_organizacion' | 'integrar_portales'

// Orden: las cuentas van antes de configurar y conectar portales, porque para entrar a
// Ajustes la persona de contacto necesita la suya.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'contacto',
    title: 'Contacto inicial',
    summary: 'Presentarse y pedir contacto y equipo',
    tasks: [
      {
        id: 'enviar',
        title: 'Enviar el mensaje de presentación',
        description:
          'Un solo WhatsApp al responsable: saludo, que nombren a una persona de contacto y los datos de cada persona del equipo.',
        extra: { kind: 'message', templateId: 'contacto_inicial' },
      },
      {
        id: 'respuesta',
        title: 'Confirmar que respondió',
        description: 'Su respuesta confirma que el número es el correcto y que el canal funciona.',
      },
      {
        id: 'persona-contacto',
        title: 'Definir la persona de contacto',
        description:
          'Una sola persona habla con nosotros y con su equipo, configura la organización y conecta los portales. Desde acá, los mensajes le salen a ella.',
        extra: { kind: 'contact' },
      },
      {
        id: 'cargar-equipo',
        title: 'Cargar el equipo que pasaron',
        description: 'Por persona: nombre, apellido, email, teléfono (+34) y rol. Con esto se crean las cuentas en el paso 2.',
        extra: { kind: 'team' },
      },
    ],
  },
  {
    id: 'usuarios',
    title: 'Usuarios y cuentas',
    summary: 'Crear las cuentas',
    tasks: [
      {
        id: 'responsable',
        title: 'Crear la cuenta del responsable',
        description: 'Desde /sign-up con la contraseña nombre.apellido. Eso crea la organización: vinculala acá.',
        extra: { kind: 'organization' },
      },
      {
        id: 'equipo',
        title: 'Crear al resto del equipo',
        description: 'Equipo → Crear usuario, dentro de la organización del cliente.',
        extra: { kind: 'team' },
        blocked:
          'Desde la app, el responsable no puede crear usuarios y soporte los crearía en la organización de Propelia. Hoy necesita a un programador.',
      },
      {
        id: 'verificar',
        title: 'Verificar accesos y enviar credenciales',
        description: 'Entrar con el responsable y un agente, revisar Equipo y avisarles que cambien la contraseña.',
      },
    ],
  },
  {
    id: 'organizacion',
    title: 'Configurar la organización',
    summary: 'Datos, logo y colores',
    tasks: [
      {
        id: 'avisar',
        title: 'Decirles qué configurar',
        description: 'Ajustes → Organización (nombre y web) y Ajustes → Marca (logo y colores).',
        extra: { kind: 'message', templateId: 'configurar_organizacion' },
      },
      {
        id: 'datos',
        title: 'Nombre y web cargados',
        description: 'Ajustes → Organización: el nombre como quieren que aparezca y la web de la inmobiliaria.',
      },
      {
        id: 'logo',
        title: 'Logo cargado',
        description: 'Ajustes → Marca.',
      },
      {
        id: 'colores',
        title: 'Colores de marca cargados',
        description: 'Ajustes → Marca.',
      },
    ],
  },
  {
    id: 'portales',
    title: 'Integrar los portales',
    summary: 'Idealista y Fotocasa',
    tasks: [
      {
        id: 'avisar',
        title: 'Pedirles que conecten los portales',
        description: 'Lo hace la persona de contacto, en Ajustes → Integraciones.',
        extra: { kind: 'message', templateId: 'integrar_portales' },
      },
      {
        id: 'idealista',
        title: 'Idealista conectado',
        description: 'Ajustes → Integraciones → Idealista.',
      },
      {
        id: 'fotocasa',
        title: 'Fotocasa conectado',
        description: 'Ajustes → Integraciones → Fotocasa.',
      },
    ],
  },
  {
    id: 'cartera',
    title: 'Cargar la cartera',
    summary: 'Propiedades desde un Excel',
    tasks: [
      {
        id: 'importar',
        title: 'Importar las propiedades',
        description:
          'Con el código del anuncio de Idealista, los leads que lleguen por mail se vinculan solos. Se crean sin captador ni comercializador.',
        extra: { kind: 'properties' },
      },
    ],
  },
]

/** Clave de la tarea en `client_onboarding_tasks.task_id`. */
export const taskKey = (stepId: string, taskId: string) => `${stepId}.${taskId}`

export type StepStatus = 'done' | 'doing' | 'todo'

export function stepStatus(step: OnboardingStep, done: ReadonlySet<string>): StepStatus {
  const n = step.tasks.filter((t) => done.has(taskKey(step.id, t.id))).length
  if (n === step.tasks.length) return 'done'
  return n > 0 ? 'doing' : 'todo'
}

/** El paso en el que está el cliente: el primero sin terminar, o el último si terminó todo. */
export function currentStep(done: ReadonlySet<string>): OnboardingStep {
  return ONBOARDING_STEPS.find((s) => stepStatus(s, done) !== 'done') ?? ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]
}

export const TOTAL_TASKS = ONBOARDING_STEPS.reduce((n, s) => n + s.tasks.length, 0)

/** Variables de las plantillas: {nombre} (persona de contacto), {soporte} (quien envía), {inmobiliaria}. */
export function fillTemplate(body: string, vars: { nombre: string; soporte: string; inmobiliaria: string }): string {
  return body
    .replaceAll('{nombre}', vars.nombre)
    .replaceAll('{soporte}', vars.soporte)
    .replaceAll('{inmobiliaria}', vars.inmobiliaria)
}

/** Contraseña inicial: nombre.apellido en minúsculas, sin tildes ni espacios. */
export function initialPassword(firstName: string, lastName: string): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
  return `${clean(firstName)}.${clean(lastName)}`
}

/** La app pide mínimo 6 caracteres: con nombres cortos se agrega el año. */
export const MIN_PASSWORD_LENGTH = 6
