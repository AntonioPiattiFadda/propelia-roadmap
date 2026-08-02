# Convenciones del proyecto

## Arquitectura (código compartido entre proyectos)

La app es una SPA que se sirve estática. Hay **dos páginas** que comparten el mismo código y solo cambian su configuración:

- `index.html` → **Propelia** (Loro & Toni)
- `captalia.html` → **Captalia** (Loro, Toni & Diego)

Cada HTML define `window.APP_CONFIG` (título, `tablas`, `bucket`, `canal`, `responsables`, `usuarios` email→identidad, textos de `caja`) y luego carga, en orden: `order-math.js`, `supabase-sync.js`, `app.js`. Todo el CSS vive en `app.css`. **Regla de oro: la lógica y los estilos van una sola vez en `app.js`/`app.css`; nunca duplicar en los HTML** (así las dos páginas no divergen).

- `supabase-sync.js` expone `RoadmapSync`, config-driven vía `APP_CONFIG.tablas/bucket/canal`. Ojo: sus `const` top-level son globales de script; no repetir nombres en `app.js` (ej.: usa `_CFG`, no `CFG`).
- Identidad: `RoadmapSync.emailActual()` → se mapea con `APP_CONFIG.usuarios` para saber si el usuario logueado es Loro/Toni/Diego. Eso pinta el chat (verde/azul/morado) y marca "Lo mío".

### Modelo de datos
- `tareas`: además de los campos previos, `chat` (jsonb `[{autor,ts,texto}]`) y `subtareas` (jsonb `[{id,titulo,resp,estado,expl,chat,files}]`). El viejo `com` se conserva.
- `<proyecto>_caja`: libro de movimientos (`fecha, concepto, categoria, monto, cuenta, notas, orden`).

### Supabase / permisos
- `supabase/schema-v2.sql` (idempotente) agrega columnas, cajas, tablas de Captalia, realtime y **aislamiento por membresía**: tabla `app_miembros(email, proyecto)` + helper `es_miembro(proyecto)`; las policies exigen membresía. Diego solo es miembro de `captalia`. Los emails de `app_miembros` deben coincidir con Supabase Auth (en minúscula) y con los `usuarios` de cada HTML.

### Preview local
`.claude/static-server.mjs` sirve la carpeta (respeta `PORT`). La app siempre pega contra el Supabase real; sin sesión válida la base no devuelve datos.

## Loading states & optimistic updates (index.html)

Patrón acordado para toda acción que persiste contra Supabase (`RoadmapSync.*`). Arquitectura: un helper genérico `conEstadoDeCarga(accion, {revertir, intentos, onEstado})` que centraliza reintento (2 por defecto) + revert + aviso, desacoplado del DOM — cada call site decide cómo se ve mediante su propio `onEstado(estado)`.

- **Optimistic update por defecto**: el cambio se aplica al estado en memoria y se pinta al toque; la persistencia contra Supabase corre en paralelo, sin bloquear la UI.
- **Falla tras agotar los 2 reintentos → revertir, no dejar colgado**: el valor vuelve al que tenía antes del cambio (no se deja "sin guardar" en pantalla) y se muestra el aviso de error existente (`aviso('No se pudo guardar...')`). `conEstadoDeCarga` llama al `revertir` que le pasa el call site.
- **Indicador global único, en la franja de filtros (`.bar`, la que ya es `position:sticky`)** — NO en el `<header>` de arriba (ese no es sticky, se va al scrollear). Un solo `● guardando` / `✓ guardado` con contador (`enVuelo++/--`) que refleja si HAY algo sincronizando en ese momento, sin importar cuál. Nada de un indicador por campo — sería ruido repartido por toda la pantalla.
- **Acciones discretas** (borrar/agregar tarea o bloque, subir/borrar adjunto, login, logout): además del indicador global, feedback local en el propio control (texto del botón cambia a "Borrando...", "Agregando...", etc., vía `onEstadoBoton(el, texto)`) — combinado con el global usando `combinar(...fns)`.
- **Campos con autoguardado debounced y drag&drop de reordenar**: solo alimentan el indicador global (no hay un control puntual al que asociarle feedback local).
- **Carga inicial** (`RoadmapSync.cargarEstado()` antes de pintar el tablero): skeleton con shimmer estático en el HTML dentro de `#lista`, sin JS para mostrarlo/ocultarlo — `render()` ya hace `lista.innerHTML=''` la primera vez que corre y lo pisa solo.
- Import: **algunas acciones ya revertían "a mano"** (borrar tarea/bloque) pero con un solo intento — se migran al helper para que todas compartan el mismo criterio de reintentos.

Spec completa: `docs/superpowers/specs/2026-07-28-loading-optimistic-updates-design.md`.
