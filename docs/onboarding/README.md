# Onboarding de clientes — en el Roadmap

El seguimiento del alta de un cliente nuevo se muda de `propelia-frontend` (`/onboarding-admin`)
al Roadmap. Arranca desde el lead que firmó en el CRM, y el lead queda atado a su organización
en Propelia (el producto).

Este directorio junta **todo** lo del onboarding: el flow, el modelo de datos, el contrato con el
producto y una copia del código actual como referencia. Es lo que hace falta para construir la
parte del Roadmap.

| Archivo | Qué es |
|---|---|
| [`onboarding-roadmap-flow.html`](onboarding-roadmap-flow.html) | El flow vigente, para abrir en el navegador |
| [`MODELO_DATOS.md`](MODELO_DATOS.md) | Tablas, RPCs y RLS a crear en la base del Roadmap |
| [`PUENTE.md`](PUENTE.md) | Contrato de `propelia-bridge`: todo lo que se le pide al producto |
| [`EXCEL_IMPORT_PROPIEDADES.md`](EXCEL_IMPORT_PROPIEDADES.md) | Cómo se arma el Excel de la cartera (paso 2) |
| [`ONBOARDING_CLIENTES.md`](ONBOARDING_CLIENTES.md) | Guía de soporte de la versión vieja (5 pasos). Sirve para los textos y las razones; **el orden vigente es el de abajo** |
| [`onboarding.html`](onboarding.html) | Presentación de la versión vieja |
| [`referencia/`](referencia/) | Copia del código de `propelia-frontend` que hoy hace esto. No compila acá: es para leer |

## Quién hace qué

- **Puente** (`propelia-bridge` en este repo y `roadmap-bridge` en `propelia-frontend`): lo
  construye la sesión de `propelia-frontend`. Contrato en [`PUENTE.md`](PUENTE.md).
- **Todo lo demás del Roadmap** (migración, pantalla, ficha del lead): se construye acá a partir
  de estos docs. Mientras el puente no esté deployado, las llamadas a `propelia-bridge` se
  mockean con las respuestas de ejemplo de `PUENTE.md`.
- **Regla dura**: el front del Roadmap **nunca** le habla directo al producto (ni su URL, ni sus
  keys). Todo lo que sea del producto pasa por `propelia-bridge`.

## El flow: 7 pasos

Se inicia desde la ficha de un lead del CRM: **«Iniciar onboarding»**. La inmobiliaria y el
responsable salen de `crm_clients` (no se cargan a mano). Cuando arranca **todavía no hay
organización en Propelia**, y no hace falta.

Los pasos y sus tareas viven **en el código** (como hoy `onboardingCatalog.ts`); en la base sólo
van las tareas hechas. Los `id` de abajo son los `task_id` (`<paso>.<tarea>`): cambiar uno deja
la tarea pendiente para todos.

### 1 · Contacto y cuentas (`contacto`)
| id | Tarea | Extra |
|---|---|---|
| `enviar` | Enviar el saludo: pedir **nombre de la organización** y los usuarios (nombre, email, teléfono, rol) | WhatsApp `contacto_inicial` |
| `respuesta` | Confirmar que respondió | |
| `cargar-equipo` | Cargar el equipo que pasaron | lista de miembros |
| `cuenta-responsable` | Crear la cuenta del responsable (`/sign-up` en Propelia, clave `nombre.apellido`) | |
| `vincular-org` | Elegir la organización que creó esa alta | selector · `list_organizations` |
| `cuentas-equipo` | Crear al resto del equipo, clave `nombre.apellido` | hoy necesita un programador (ver pregunta abierta) |
| `credenciales` | Verificar accesos y enviar a cada uno su usuario y clave | |

La clave inicial es `nombre.apellido` en minúsculas y sin acentos (ver `initialPassword` y
`MIN_PASSWORD_LENGTH = 6` en `referencia/src/pages/onboarding-admin/onboardingCatalog.ts`).

### 2 · Cartera, organización y link de pago (`cartera-org-pago`)
| id | Tarea | Extra |
|---|---|---|
| `excel` | Armar el Excel de propiedades con lo que pase el cliente | plantilla · `import_template` |
| `importar` | Importar la cartera a su organización | `check_properties` + `import_properties` |
| `llamada-org` | Configurar la organización **junto con ellos** (nombre, web, logo, colores) | WhatsApp `configurar_organizacion` |
| `link-pago` | Generar y enviar el link de pago | `create_payment_link` · WhatsApp `link_de_pago` |
| `pago` | Confirmar que pagó | `list_payment_links` |

### 3 · Asignar propiedades y mails de Idealista (`asignar-mails`)
| id | Tarea | Extra |
|---|---|---|
| `asignar` | Que asignen las propiedades importadas a cada agente | WhatsApp `asignar_y_mails` |
| `mails-idealista` | Que configuren en Idealista los mails de cada agente | direcciones · `get_organization` |
| `lead-prueba` | Probar que un lead llega | simulador · `send_simulated_inbound` |

### 4 · Integrar los portales (`portales`)
| id | Tarea | Extra |
|---|---|---|
| `avisar` | Pedirles que conecten Idealista y Fotocasa (Ajustes › Integraciones) | WhatsApp `integrar_portales` |
| `idealista` | Idealista conectado | |
| `fotocasa` | Fotocasa conectado | |

### 5 · Sincronizar las keys (`sincronizar`)
| id | Tarea | Extra |
|---|---|---|
| `idealista` | Keys de Idealista sincronizadas | |
| `revisar-fotocasa` | Revisar el flow de Fotocasa **antes** de sincronizar: Fotocasa borra todo | aviso fijo, en ámbar |
| `fotocasa` | Keys de Fotocasa sincronizadas | |

### 6 · Capacitación: funnel (`funnel`)
| id | Tarea |
|---|---|
| `explicar` | Explicar el funnel de leads, paso por paso |
| `highlight` | Crear el highlight flow |

### 7 · Capacitación: visitas y mails (`visitas-mails`)
| id | Tarea |
|---|---|
| `visitas` | Explicar cómo agendar visitas |
| `mails` | Explicar el sistema de mails |

## La pantalla

- **`/onboarding`** (SOLO_SUPERADMIN en `src/components/nav.ts`): lista de altas en curso, cada
  una con la inmobiliaria, su avance (`n de 7` y barra por paso) y link a su lead.
- **`/onboarding/:leadId`**: los 7 pasos con sus tareas tildables, los mensajes con «Abrir
  WhatsApp» (al teléfono de la persona de contacto, `buildWhatsAppLink` en
  `referencia/`), el equipo, el selector de org, el import, el simulador y el link de pago.
- **Ficha del lead** (`/crm`): botón «Iniciar onboarding» si no tiene; si tiene, link a él y la org
  vinculada.
- Las plantillas de mensajes se editan en la misma pantalla, como hoy (`TemplateEditor` en
  `referencia/`). Variables: `{nombre}` (persona de contacto), `{soporte}` (quien envía),
  `{inmobiliaria}`.

## Preguntas abiertas

- **¿El vínculo lead ↔ org se elige a mano o se propone solo?** Por ahora, a mano en el paso 1.
- **¿Crear las cuentas del equipo desde el onboarding?** Sería una acción más del puente
  (`create_org_users`). Fuera de esta primera versión.
- **¿Qué hay que revisar antes de sincronizar Fotocasa?** Falta escribir ese flow.
- **¿Qué es el highlight flow y dónde se crea?** Si es un tour, ya existen en Capacitación del producto.
- **¿Sigue haciendo falta la persona de contacto?** El modelo la mantiene (`is_contact`); si se
  habla siempre con el responsable, la UI la puede esconder sin migración.

## Qué pasa con el producto

Cuando el Roadmap esté andando, en `propelia-frontend` se borran `/onboarding-admin`, su service,
su entrada del sidebar y las tablas `client_onboardings`, `client_onboarding_members`,
`client_onboarding_tasks` y `onboarding_message_templates` con sus RPCs. **No se migran datos**:
había un solo alta, de prueba. Lo que sí se queda en el producto, detrás del puente: el import
(`superadmin_import_properties` + completado de direcciones con Google), el envío de mails
simulados y los links de pago. El checklist y los coach marks que ve el cliente dentro de la app
son otra cosa y no se tocan.

Orden de deploy: puente en el producto → migración del Roadmap → `propelia-bridge` y la pantalla
→ limpieza del producto.
