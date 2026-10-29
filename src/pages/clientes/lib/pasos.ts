/* El catálogo del onboarding de un cliente (26/10/2026). Vive en el código, como en el producto
   (`onboardingCatalog.ts`): en la base solo van las tareas hechas, por `task_id` = `<paso>.<tarea>`.
   Cambiar un id deja esa tarea pendiente para todos. Diseño en docs/onboarding/clientes.html.

   Los pasos 5 a 8 están escritos pero en «Próximamente»: se iteran después. No cuentan para el
   avance ni para «Marcar completo» hasta que se abran. */

/** Lo que va al lado de cada tarea. `wa:<plantilla>` es copiar + enviar por WhatsApp Web. */
export type Accion =
  | `wa:${PlantillaId}`
  | 'link-alta' | 'equipo-recibido' | 'importar-usuarios' | 'mails'
  | 'plantilla-cartera' | 'importar-cartera' | 'link-pago' | 'ver-pago'
  | 'direcciones' | 'simular-lead'

export const PLANTILLAS = ['contacto_inicial', 'accesos_enviados', 'corregir_mails', 'tutorial_leads', 'link_de_pago', 'asignar_y_mails', 'integrar_portales'] as const
export type PlantillaId = (typeof PLANTILLAS)[number]

export type Tarea = { id: string; texto: string; acciones?: Accion[] }
export type Paso = { id: string; titulo: string; tareas: Tarea[]; proximamente?: boolean }

export const PASOS: Paso[] = [
  {
    id: 'contacto', titulo: 'Contacto y cuentas',
    tareas: [
      // Los ids son de cuando el equipo llegaba por Excel: cambiarlos destildaría lo hecho.
      { id: 'enviar', texto: 'Enviar el saludo con el enlace para que carguen su equipo', acciones: ['wa:contacto_inicial', 'link-alta'] },
      { id: 'excel-recibido', texto: 'Recibir el equipo y el nombre de la inmobiliaria', acciones: ['equipo-recibido'] },
      { id: 'importar-usuarios', texto: 'Importar el equipo: crea la organización y todas las cuentas', acciones: ['importar-usuarios'] },
      { id: 'credenciales', texto: 'Verificar accesos y enviar a cada uno su usuario y clave por mail', acciones: ['mails', 'wa:accesos_enviados', 'plantilla-cartera'] },
    ],
  },
  /* 29/10/2026, por pedido: el paso 2 junta la cartera con lo de los leads (tutorial, asignar, mails de
     Idealista, lead de prueba), el 3 es el MCP y el pago va aparte. Nadie tenía tildado nada de
     `cartera-org-pago` ni de `asignar-mails`, así que los ids de paso cambiaron sin perder nada. */
  {
    id: 'cartera-leads', titulo: 'Cartera y leads',
    tareas: [
      { id: 'excel', texto: 'Recibir el Excel de propiedades del cliente (va adjunto al WhatsApp de los accesos)', acciones: ['plantilla-cartera'] },
      { id: 'importar', texto: 'Importar la cartera a su organización', acciones: ['importar-cartera'] },
      // Fue «Configurar la organización con ellos» (`llamada-org`): desde el 29/10/2026 la org la configuran solos con la guía de Propelia.
      { id: 'tutorial-leads', texto: 'Enviar el tutorial de cómo funciona el sistema de leads', acciones: ['wa:tutorial_leads'] },
      { id: 'asignar', texto: 'Que asignen las propiedades importadas a cada agente', acciones: ['wa:asignar_y_mails'] },
      { id: 'mails-idealista', texto: 'Que configuren en Idealista los mails de cada agente', acciones: ['direcciones'] },
      { id: 'lead-prueba', texto: 'Probar que un lead llega', acciones: ['simular-lead'] },
    ],
  },
  {
    // Los pasos y el mensaje con los tutoriales se definen después: por ahora, una tarea a mano.
    id: 'mcp', titulo: 'Configuración del MCP',
    tareas: [
      { id: 'tutoriales', texto: 'Enviar el mensaje con los tutoriales del MCP' },
    ],
  },
  {
    id: 'pago', titulo: 'Pago',
    tareas: [
      { id: 'link-pago', texto: 'Generar y enviar el link de pago', acciones: ['link-pago'] },
      { id: 'pago', texto: 'Confirmar que pagó', acciones: ['ver-pago'] },
    ],
  },
  {
    id: 'portales', titulo: 'Integrar los portales', proximamente: true,
    tareas: [
      { id: 'avisar', texto: 'Pedirles que conecten Idealista y Fotocasa', acciones: ['wa:integrar_portales'] },
      { id: 'idealista', texto: 'Idealista conectado' },
      { id: 'fotocasa', texto: 'Fotocasa conectado' },
    ],
  },
  {
    id: 'sincronizar', titulo: 'Sincronizar las keys', proximamente: true,
    tareas: [
      { id: 'idealista', texto: 'Keys de Idealista sincronizadas' },
      { id: 'revisar-fotocasa', texto: 'Revisar el flow de Fotocasa antes de sincronizar: Fotocasa borra todo' },
      { id: 'fotocasa', texto: 'Keys de Fotocasa sincronizadas' },
    ],
  },
  {
    id: 'funnel', titulo: 'Capacitación: funnel', proximamente: true,
    tareas: [
      { id: 'explicar', texto: 'Explicar el funnel de leads, paso por paso' },
      { id: 'highlight', texto: 'Crear el highlight flow' },
    ],
  },
  {
    id: 'visitas-mails', titulo: 'Capacitación: visitas y mails', proximamente: true,
    tareas: [
      { id: 'visitas', texto: 'Explicar cómo agendar visitas' },
      { id: 'mails', texto: 'Explicar el sistema de mails' },
    ],
  },
]

/** Clave de la tarea en `client_onboarding_tasks.task_id`. */
export const claveDeTarea = (pasoId: string, tareaId: string) => `${pasoId}.${tareaId}`

/** La tilda la base cuando el cliente envía la página de alta (`onboarding_alta_enviar`). */
export const TAREA_EQUIPO_RECIBIDO = claveDeTarea('contacto', 'excel-recibido')

/** La tarea que no se tilda a mano: manda mails, pasa por `ConfirmarAccesosDialog`. */
export const TAREA_CREDENCIALES = claveDeTarea('contacto', 'credenciales')

/** Aparece debajo de `TAREA_CREDENCIALES` solo si algún mail de accesos no llegó (27/10/2026, por
 *  pedido). No está en `PASOS`: no cuenta para el avance ni para «Marcar completo». Se tilda a mano;
 *  al lado lleva el WhatsApp `corregir_mails` con los mails que no llegaron (28/10/2026). */
export const TAREA_CORREGIR_MAILS = claveDeTarea('contacto', 'corregir-mails')

/** «Probé que entra» de cada cuenta creada, en la tabla de «Ver cuentas y contraseñas» (28/10/2026,
 *  por pedido). Una fila de `client_onboarding_tasks` por miembro, sin migración: no está en `PASOS`
 *  y no cuenta para el avance. */
export const tareaCuentaProbada = (miembroId: string) => claveDeTarea('contacto', `probada.${miembroId}`)

/** El ✕ de «Entró» en las cuentas creadas (29/10/2026, por pedido): probar una cuenta es entrar con
 *  ella. Su `done_at` es desde cuándo cuentan los logins de ese miembro. Sin migración, como el de arriba. */
export const tareaIngresoBorrado = (miembroId: string) => claveDeTarea('contacto', `entro-borrado.${miembroId}`)

/** Los pasos que hoy se trabajan: los de «Próximamente» no cuentan. */
export const PASOS_ABIERTOS = PASOS.filter(p => !p.proximamente)

export const pasoHecho = (paso: Paso, hechas: ReadonlySet<string>) =>
  paso.tareas.every(t => hechas.has(claveDeTarea(paso.id, t.id)))

/** Cuántos de los pasos abiertos están hechos. */
export const pasosHechos = (hechas: ReadonlySet<string>) => PASOS_ABIERTOS.filter(p => pasoHecho(p, hechas)).length

/** El índice (en `PASOS`) del primer paso abierto con algo sin hacer. Con todo hecho, `null`. Se
 *  puede tildar fuera de orden: esto guía, no bloquea. */
export function pasoActual(hechas: ReadonlySet<string>): number | null {
  const i = PASOS.findIndex(p => !p.proximamente && !pasoHecho(p, hechas))
  return i < 0 ? null : i
}

/** Se ofrece «Marcar completo» con todos los pasos abiertos hechos. */
export const listoParaCompletar = (hechas: ReadonlySet<string>) => pasoActual(hechas) === null
