# Onboarding de clientes nuevos — guía de soporte

Paso a paso de lo que soporte le pide a una inmobiliaria nueva y lo que hace con eso.
Se va completando paso por paso; cada uno dice **qué pedir**, **qué hacer** y **cómo
verificar** que quedó bien.

| # | Paso | Estado |
|---|------|--------|
| 1 | [Contacto inicial](#paso-1--contacto-inicial) | ✏️ en definición |
| 2 | [Usuarios y cuentas](#paso-2--usuarios-y-cuentas) | ✏️ en definición (ver [bloqueo](#️-bloqueo-actual-quién-crea-los-usuarios-del-equipo)) |
| 3 | [Configurar la organización](#paso-3--configurar-la-organización) | ✏️ en definición |
| 4 | [Integrar los portales](#paso-4--integrar-los-portales) | ✏️ en definición |
| 5 | [Cargar la cartera](#paso-5--cargar-la-cartera) | ✏️ en definición |

Las cuentas (paso 2) van antes de configurar y de conectar portales: para entrar a Ajustes,
la persona de contacto necesita la suya.

## La persona de contacto

Lo ideal es que **del lado del cliente haya una sola persona** que hable con nosotros y con
el resto de su equipo: así todo pasa por un único canal y no repetimos lo mismo con cada uno.
Esa persona además **configura la organización** (paso 3) y **conecta los portales** (paso 4).

- Arranca siendo el **responsable** de la cuenta, que es a quien se le escribe primero.
- El primer mensaje les pide que la nombren. Si es otra persona, se cambia en el paso 1
  (**Es otra persona**) y desde ahí **todos los mensajes le salen a ella**.
- Conviene que tenga rol **Administrador**, porque va a tocar Ajustes.

## Dónde se sigue

Pantalla **Onboarding** (`/onboarding-admin`, sólo superadmin). Arriba se elige la
inmobiliaria y se ve en qué paso está. Cada cliente es un *onboarding* que se crea con
**Nuevo onboarding** (inmobiliaria + responsable + su WhatsApp) **antes** de que exista su
cuenta; la organización se vincula cuando se crea.

- Los pasos y tareas están en el código: `src/pages/onboarding-admin/onboardingCatalog.ts`.
- Lo hecho, el equipo y los mensajes están en la base (`client_onboardings`,
  `client_onboarding_members`, `client_onboarding_tasks`, `onboarding_message_templates`).
- Los mensajes se editan desde la pantalla (**Editar mensaje**) y valen para todos los
  clientes. Variables: `{nombre}` (persona de contacto), `{soporte}` (quien envía, sale
  precargado con el nombre del usuario logueado) e `{inmobiliaria}`.
- `onboarding.html` es una réplica de la pantalla con datos de ejemplo, para mostrarla sin
  levantar la app. Si cambian los pasos o los mensajes, hay que actualizarla a mano.

---

## Paso 1 — Contacto inicial

**Un solo WhatsApp** al responsable que hace tres cosas a la vez: saluda y presenta a
soporte, pide que nombren a la **persona de contacto** y pide los **datos del equipo**. Así
con una sola respuesta tenemos todo lo necesario para crear las cuentas.

### Qué necesitamos para mandarlo

- Nombre y **teléfono del responsable** (con prefijo `+34`), y el nombre de la inmobiliaria.
  Salen de la venta o de la demo, y se cargan en **Nuevo onboarding**.

### Mensaje

Texto inicial (el vigente es el de la base, `contacto_inicial`):

```
¡Hola {nombre}! Soy {soporte}, del equipo de Propelia 👋

Bienvenidos. A partir de ahora voy a ser vuestra persona de contacto para poner en marcha la cuenta de {inmobiliaria}, y os voy a ir guiando paso a paso por aquí.

Para empezar necesito dos cosas:

1. Una persona de contacto de vuestro lado, que hable con nosotros y con el resto del equipo, para que todo vaya por un solo canal. Se encargará también de configurar la organización y de conectar los portales. Si eres tú, perfecto; si no, pásame su nombre y su teléfono.

2. Las personas del equipo que van a usar Propelia. Por cada una:
- Nombre y apellido:
- Email:
- Teléfono (con +34):
- Rol (Administrador / Agente):

Con eso os creo los accesos y os paso a cada uno su usuario y contraseña. Cualquier duda, escribidme por aquí.
```

En la pantalla el mensaje sale ya completado y **Abrir en WhatsApp** abre el chat con el
texto escrito (`wa.me`), listo para enviar.

### Datos de cada persona

| Dato | Obligatorio | Notas |
|------|-------------|-------|
| Nombre | Sí | |
| Apellido | Sí | |
| Email | Sí | Es el usuario de acceso. No puede estar ya registrado en Propelia. |
| Teléfono | Sí | Con prefijo de país (`+34 …`). **No se puede repetir** dentro de la misma inmobiliaria. Es el que se usa como contacto en Idealista. |
| Rol | Sí | `Administrador` (ve y gestiona todo) o `Agente`. Por defecto, Agente. |

En la pantalla se pueden cargar de a poco: sólo el nombre es obligatorio, y lo que falta
aparece marcado.

### Cómo verificar

- [ ] El mensaje se envió al número del responsable.
- [ ] El cliente respondió: confirma que el número es el correcto y que el canal funciona.
- [ ] Quedó definida la **persona de contacto**, con su teléfono.
- [ ] El equipo que pasaron está cargado, con email, teléfono y rol de cada uno.

---

## Paso 2 — Usuarios y cuentas

### Contraseña inicial

Soporte crea todas las cuentas con la contraseña **`nombre.apellido`**, en minúsculas y
sin tildes ni espacios. La pantalla ya la muestra armada para cada persona. Ejemplos:

| Persona | Contraseña |
|---------|------------|
| María José Fernández | `mariajose.fernandez` |
| Íñigo Peña | `inigo.pena` |

- **Mínimo 6 caracteres** (lo exige la app). Si nombre + apellido no llegan (ej. *Li Wu* →
  `li.wu`, 5), se agrega el segundo apellido o el año: `li.wu2026`.
- Es una contraseña **adivinable**: se le avisa a cada persona que la cambie en el primer
  ingreso. Hoy no hay pantalla de "cambiar contraseña" dentro de la app; se hace desde
  **"¿Olvidaste tu contraseña?"** en la pantalla de acceso, que manda un email.

### Qué hace soporte

**1. Cuenta del responsable (crea la organización).**
Entrar a `/sign-up` y completar con los datos del responsable: nombre de la inmobiliaria,
nombre, apellido, teléfono, email y la contraseña `nombre.apellido`. Aceptar términos.

Esto crea la **organización** de la inmobiliaria y deja al responsable dentro de ella.
La organización arranca **sin plan** (sólo lectura) hasta que paguen desde `/planes`.
En la pantalla de Onboarding, **vincular** esa organización al onboarding.

**2. El resto del equipo.**
Se crean desde **Equipo → Crear usuario** (o Ajustes → Usuarios), estando logueado
**dentro de la organización del cliente**. El formulario pide email, teléfono, contraseña
temporal (dos veces), nombre, apellido y rol.

Si la inmobiliaria ya tiene **Idealista conectado**, aparece un segundo paso: elegir
**"Crear en el CRM y en Idealista"** (recomendado: se le crea su contacto en Idealista con
su teléfono y los leads de sus anuncios le llegan a esa persona) o **"Crear solo en el
CRM"**. Como los portales se conectan después (paso 4), lo normal es que este paso no
aparezca y el contacto se cree más tarde desde Equipo con *«Crear contacto en Idealista»*.

### ⚠️ Bloqueo actual: quién crea los usuarios del equipo

Hoy el punto 2 **no se puede hacer desde la app sin intervención técnica**:

- **Crear usuario** sólo funciona para alguien con rol `superadmin` **y** crea a la persona
  **en la organización de quien lo está creando**
  (`supabase/functions/_shared/createOrgUser.ts`).
- El responsable que se registra en `/sign-up` queda con rol **`agent`**: nada lo promueve
  a superadmin (`handle_new_user`, `supabase/migrations/20261012153918_agent_phone_sync_users.sql`).
  Así que él tampoco puede crear a su equipo.
- Y soporte, aunque sea superadmin, está en la organización de Propelia: lo que cree
  quedaría en la de Propelia, no en la del cliente.
- Registrar a cada persona por `/sign-up` **no sirve**: cada registro crea una
  organización nueva.

Hasta que se resuelva, hace falta un programador para darle al responsable el rol que le
permita crear usuarios (o crearlos a mano en la base). **Pendiente decidir** cómo debería
funcionar — por ejemplo, que soporte pueda crear usuarios eligiendo la organización
destino, o que el responsable de la cuenta pueda dar de alta a su equipo.

### Cómo verificar

- [ ] Iniciar sesión con el email del responsable y `nombre.apellido`: entra y ve el
      nombre de la inmobiliaria.
- [ ] En **Equipo** aparecen todas las personas, con el rol y teléfono correctos.
- [ ] Probar el acceso de al menos un agente con su `nombre.apellido`.
- [ ] Mandarle a cada persona su usuario, la contraseña inicial y el aviso de cambiarla.

### Errores comunes

| Mensaje | Qué pasa | Qué hacer |
|---------|----------|-----------|
| *Ese email ya está registrado* | La persona ya tiene cuenta en Propelia | Revisar si es de otra inmobiliaria o de una prueba anterior |
| *Este teléfono ya lo usa …* | Otro miembro de la misma inmobiliaria tiene ese teléfono | Pedir el teléfono correcto |
| *Teléfono inválido* | Falta el prefijo o está mal escrito | Escribirlo como `+34 600 000 000` |
| *Email y contraseña (mínimo 6 caracteres)…* | `nombre.apellido` quedó corto | Ver regla de 6 caracteres arriba |
| *No autorizado* | Quien crea no es superadmin de esa organización | Ver el bloqueo de arriba |

---

## Paso 3 — Configurar la organización

La persona de contacto deja lista la organización desde **Ajustes**, en dos pestañas:

| Qué | Dónde |
|-----|-------|
| Nombre de la inmobiliaria y web | **Ajustes → Organización** (`/ajustes?tab=organizacion`) |
| Logo y colores de marca | **Ajustes → Marca** (`/ajustes?tab=marca`) — ahí también están los documentos y el manual de marca |

Soporte le manda el mensaje `configurar_organizacion` (dónde entrar y qué cargar) y marca
cada punto cuando lo confirman.

### Cómo verificar

- [ ] Nombre y web cargados.
- [ ] Logo cargado.
- [ ] Colores de marca cargados.

---

## Paso 4 — Integrar los portales

La persona de contacto conecta los portales en **Ajustes → Integraciones**
(`/ajustes?tab=integraciones`): **Idealista** y **Fotocasa**. Soporte le manda el mensaje
`integrar_portales` y marca cada portal cuando queda conectado.

### Cómo verificar

- [ ] Idealista conectado.
- [ ] Fotocasa conectado.

---

## Paso 5 — Cargar la cartera

Soporte importa las propiedades de la inmobiliaria desde un Excel, en el mismo onboarding
(tarea «Importar las propiedades»). Se crean en la organización vinculada en el paso 2, así que
ese vínculo tiene que estar hecho.

### Qué pedir

La cartera en Excel con las columnas de la plantilla (botón **Descargar plantilla**): los campos
de la carga rápida — tipo, calle, número, código postal, ciudad, operación, precios,
habitaciones, baños, ascensor, m² construidos y balcón — más el **código del anuncio de
Idealista**. Los nombres de las columnas se reconocen sin importar mayúsculas, acentos ni orden.

### Qué hace soporte

1. Sube el `.xlsx`. La vista previa marca cada fila: las que tienen errores (falta un dato
   obligatorio, un valor que no se entiende, un código repetido) **no se importan**.
2. Importa. Las direcciones se completan con Google (distrito, barrio, coordenadas, zona).

Las propiedades nacen **sin captador ni comercializador**: se asignan después, con el equipo
cargado. Un código de Idealista que ya está en la organización se saltea, no se pisa.

### Por qué importa el código de Idealista

Es lo que vincula los leads: cuando llega un mail de Idealista, la ingesta busca la propiedad
con ese código (`properties.idealista_property_id`), aunque la API de Idealista no esté
conectada. Sin código, el lead entra igual pero sin propiedad («Pendiente de matching»). Los
leads que llegaron **antes** del import esperando ese código se vinculan al importar.

### Cómo verificar

- [ ] Propiedades importadas: la cantidad coincide con la del Excel, menos las filas con error.
