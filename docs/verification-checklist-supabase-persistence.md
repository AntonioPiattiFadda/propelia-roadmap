# Checklist de verificación manual — Persistencia Supabase (Task 8)

## Contexto para quien ejecute esto

`index.html` (raíz del repo) es un plan de trabajo tipo CRM ("Loro & Toni"). Se migró de `localStorage` + export/import manual a una base de datos Supabase compartida (proyecto `propelia`, ref `gvkdyxhxsnpumxlhvhsm`), con Auth real (email + password), sincronización en tiempo real, y adjuntos en Supabase Storage. El código ya está mergeado a `main`.

Este documento es el checklist de verificación manual en navegador que falta correr antes de dar la migración por terminada. **Requiere un navegador real** — no se puede automatizar sin herramientas de browser (Playwright, etc.). Si el agente que ejecuta esto no tiene acceso a un navegador, debe decírselo al usuario y pedirle que lo corra él mismo, en vez de simular o asumir resultados.

**Archivo a abrir:** `index.html` en la raíz del repo (doble clic para abrirlo directo, o serví la carpeta con un servidor local — `python3 -m http.server 8080` desde la raíz del repo y abrir `http://localhost:8080/index.html` — si el navegador bloquea las llamadas a Supabase por CORS al abrirlo como `file://`).

**Prerrequisito:** una cuenta real de usuario en el proyecto Supabase `propelia` (las mismas credenciales que se usan para entrar a `propelia-frontend`) para poder loguearse. Sin esa cuenta no se puede pasar del paso 1.

**Referencia de diseño:** `docs/superpowers/specs/2026-07-28-supabase-persistence-design.md` y `docs/superpowers/plans/2026-07-28-supabase-persistence.md` si hace falta más contexto técnico.

## Checklist

### 1. Login bloquea la app

- [ ] Abrir `index.html` en una ventana de incógnito (sin sesión previa).
- [ ] Esperado: un modal tapa TODA la app — clickear en cualquier tarea o botón de atrás del modal no debe responder.
- [ ] Probar un email/password incorrecto → esperado: mensaje de error visible, el modal sigue ahí.
- [ ] Probar con una cuenta real → esperado: el modal desaparece y carga el tablero completo (4 bloques, 48 tareas, contador "Loro 40 / 8 Toni" en el header).

### 2. Sync en tiempo real entre pestañas

- [ ] Con la sesión ya iniciada, abrir una SEGUNDA pestaña con la misma URL.
- [ ] Esperado: la segunda pestaña NO pide login de nuevo (sesión persistida vía Supabase Auth).
- [ ] En la pestaña A: cambiar el estado de una tarea, el responsable, o escribir en la explicación.
- [ ] Esperado: el cambio aparece SOLO en la pestaña B, sin recargar, en pocos segundos.
- [ ] Repetir con: mover una tarea de bloque (drag&drop), crear una tarea nueva, borrar una tarea, crear/borrar un bloque.
- [ ] Chequeo de foco: dejar el cursor escribiendo dentro de un campo de texto en la pestaña B mientras en la pestaña A se cambia otra cosa. Esperado: la pestaña B NO pierde el foco/cursor mientras se está escribiendo — el refresco se aplica recién al salir del campo (blur).

### 3. Persistencia real (no local)

- [ ] Con datos ya cargados y algún cambio hecho, borrar el almacenamiento del sitio (DevTools → Application → Clear site data) o abrir en una ventana de incógnito nueva.
- [ ] Volver a loguearse.
- [ ] Esperado: los datos siguen ahí — vienen de Supabase, no del navegador.

### 4. Adjuntos

- [ ] Abrir una tarea, subir una imagen y un PDF.
- [ ] Esperado: aparecen como miniatura (imagen) o ícono de documento (PDF), sin errores.
- [ ] Abrir la MISMA tarea desde otra pestaña/sesión.
- [ ] Esperado: los archivos se ven y se pueden abrir/descargar ahí también.
- [ ] Borrar un archivo adjunto.
- [ ] Esperado: desaparece de la lista y no vuelve a aparecer tras recargar.

### 5. Orden persistente

- [ ] Arrastrar una tarea a otra posición dentro del mismo bloque.
- [ ] Arrastrar un bloque completo a otra posición.
- [ ] Recargar la página.
- [ ] Esperado: el orden nuevo se mantiene igual tras recargar.

### 6. Cerrar sesión

- [ ] Click en "Cerrar sesión" (al lado del link de Trello, en el header).
- [ ] Esperado: vuelve a aparecer el modal de login tapando la app; los datos ya no se ven detrás.

### 7. Exportar (funciones que se mantuvieron sin cambios)

- [ ] Probar "Guardar archivo" → esperado: descarga un `.html` con los datos actuales embebidos.
- [ ] Probar "Exportar a CSV" → esperado: descarga un `.csv` que abre bien en Excel/Sheets con las 48 tareas.

### 8. Consola sin errores

- [ ] Con DevTools abierto (pestaña Console), repetir los pasos de arriba.
- [ ] Esperado: sin errores en rojo durante el uso normal. Advertencias no críticas son aceptables, pero reportarlas igual si aparecen.

### 9. Estados de carga y optimistic update

- [ ] Recargar la página con DevTools → Network → throttling "Slow 3G". Esperado: se ve un skeleton con shimmer (bloques y filas grises pulsando) mientras carga, reemplazado por el tablero real al terminar.
- [ ] Con red normal, cambiar el estado de una tarea. Esperado: aparece `● guardando` junto al buscador (franja de filtros) y después `✓ guardado`, que desaparece solo.
- [ ] Scrollear la lista de tareas mientras se ve `● guardando`/`✓ guardado`. Esperado: el indicador sigue visible (la franja de filtros es sticky).
- [ ] Cortar la red (DevTools → Network → Offline) y repetir, uno por uno: cambiar estado de tarea, cambiar responsable, escribir en explicación/comentario, mover una tarea de bloque con el select, arrastrar una tarea o un bloque, agregar tarea nueva, agregar bloque nuevo, borrar tarea, borrar bloque, subir un adjunto, borrar un adjunto. Esperado en TODOS: tras ~3.5s (2 reintentos de 1.5s) el cambio vuelve a como estaba antes y aparece el toast "No se pudo completar la acción. Revisa tu conexión." — nada queda "colgado" a mitad de camino.
- [ ] Reconectar la red y repetir la lista anterior. Esperado: todo persiste normalmente, sin reverts, y recargando la página los cambios siguen ahí.
- [ ] Intentar loguearse con credenciales incorrectas. Esperado: el botón de submit dice "Entrando..." mientras verifica, y vuelve a su texto normal al mostrar el error.
- [ ] Cerrar sesión. Esperado: el botón dice "Saliendo..." brevemente antes de que aparezca el modal de login.

### 10. Fixes de reverts y adjuntos huérfanos (post-mortem del optimistic update)

- [ ] Con red normal, adjuntar un archivo a una tarea y después borrarlo (doble click en la ✕). Esperado: desaparece la miniatura y no queda "colgado" nada raro. Confirmar en el dashboard de Supabase Storage (bucket `roadmap-adjuntos`) que el archivo ya no está.
- [ ] Cortar la red (DevTools → Network → Offline). Borrar un adjunto existente (doble click en la ✕) → esperar los ~3.5s de reintentos → esperado: la miniatura REAPARECE (revert) Y el archivo sigue existiendo en el bucket de Storage (verificar en el dashboard de Supabase o reconectando la red y recargando la página — el link no debe estar roto).
- [ ] Con red normal: abrir una tarea, escribir en "Explicación", esperar ~1s a que guarde (`✓ guardado`), sin soltar el foco del campo seguir escribiendo más texto, esperar otro segundo a que guarde de nuevo. Esperado: ambos cambios quedan guardados, sin parpadeos ni pérdida de texto.
- [ ] Cortar la red. Escribir en "Explicación", esperar el toast de error (~3.5s) SIN sacar el foco del campo, y seguir escribiendo apenas aparece el toast. Esperado: el campo no se "pisa" ni pierde el texto que se sigue tipeando mientras se tiene el foco ahí — el revert visual se aplica recién cuando se sale del campo (blur/tab a otro campo).
- [ ] Con la red aún cortada: abrir un bloque (⋯ → "Subir bloque" o "Bajar bloque"). Esperado: tras ~3.5s el bloque vuelve a su posición original y aparece el toast de error (antes de este fix, el bloque quedaba reordenado en pantalla sin avisar que no se guardó).
- [ ] Reconectar la red y repetir "Subir bloque"/"Bajar bloque". Esperado: el reorden persiste tras recargar la página.

### 11. Foco no se pierde en selects + no hay re-render fantasma de tu propio guardado

- [ ] Abrir una tarea, hacer click en el `<select>` de "Estado" (dejarlo con foco, sin todavía elegir otra opción) y esperar unos segundos sin tocar nada más. Esperado: el select sigue teniendo el foco, no se cierra ni se redibuja solo.
- [ ] Elegir una opción distinta en el `<select>` de "Estado" (dispara guardado). Esperado: no hay ningún parpadeo/reconstrucción visible de la fila ni de la lista completa apenas después de elegir — antes de este fix, el eco de realtime del propio guardado disparaba un re-render completo a los pocos cientos de ms.
- [ ] Repetir lo mismo con el `<select>` de "mover a otro bloque".
- [ ] Con DOS pestañas abiertas (caso del punto 2 del checklist): en la pestaña A, dejar el foco en el `<select>` de "Estado" de una tarea. En la pestaña B, cambiar el estado de OTRA tarea distinta. Esperado en la pestaña A: el select sigue con el foco (esto sí debe verse afectado — es un cambio ajeno real — pero no debe tirar al usuario del control si estaba interactuando en ese momento con el mouse/teclado sobre el select).
- [ ] Con dos pestañas: en la pestaña A cambiar el estado de una tarea. Esperado en la pestaña B: el cambio SÍ aparece (el eco ajeno no se suprime, solo se suprime el eco de tus propios guardados).

## Cómo reportar resultados

Por cada ítem: marcar ✅ si pasó tal cual se espera, o ❌ con una descripción corta de qué pasó distinto (mensaje de error exacto, en qué paso, captura de pantalla si es posible). Si algo falla, indicar también: navegador y versión, si fue abierto como `file://` o servido con un server local, y si había extensiones de navegador que pudieran bloquear requests (ad blockers, etc.).
