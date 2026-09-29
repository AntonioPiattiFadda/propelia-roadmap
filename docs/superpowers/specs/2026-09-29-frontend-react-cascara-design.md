# Frontend nuevo en React — sub-proyecto 1: la cáscara

Escrito el 29/9/2026. Rama `frontend-react` (sale de `mudanza-base`), worktree
`.claude/worktrees/frontend-react`.

## 0. Hasta dónde llegamos (para retomar en frío)

- **Estado**: diseño cerrado y aprobado por secciones en el brainstorming (las 1 y 2
  explícitamente; las 3 y 4 con el «mandale mecha»). **Falta**: que el usuario revise este
  archivo → `superpowers:writing-plans` → ejecución. **No hay código escrito todavía.**
- Esta spec **reemplaza el supuesto** de `2026-09-29-crm-pantalla-contexto.md`, que daba por
  hecho JS plano sin build. Lo que ese archivo dice del CRM (modelo de datos, qué copiar de
  `/leads`, las preguntas de su sección 8) sigue valiendo para el sub-proyecto 2; lo que dice
  de *dónde vive el código* no.

### Decisiones tomadas con el usuario (no reabrir sin motivo)

1. **Frontend nuevo en React**, con el stack y el design system de `propelia-frontend`
   (React 19, Vite, TS, Tailwind v4, shadcn/Radix, TanStack Query, sonner, lucide). Se eligió
   sobre «React solo para el CRM» y sobre «seguir en JS plano copiando los tokens».
2. **Tres páginas en la barra lateral**: Roadmap (igual al de hoy), CRM (copiado de `/leads`
   del producto y adaptado a las `crm_*`) y Caja (placeholder: todavía no se usa).
3. **Tres sub-proyectos, en este orden, cada uno con su spec → plan → ejecución**:
   1. **la cáscara** (este archivo): scaffold, login, layout, barra lateral, placeholders;
   2. **el CRM**;
   3. **el Roadmap**, port «igual igual» del tablero vanilla — el más grande (~5300 líneas de
      `app.js` y todas las decisiones de `CLAUDE.md`).
4. **La base nueva todavía no existe y se construye como si existiera**, contra
   `supabase/schema.sql`. La prueba de punta a punta queda para después de la inyección
   (`migracion/PASOS.md`).
5. **Reemplazo total**: la raíz del repo pasa a ser el proyecto Vite y se publica en
   **Vercel**. Netlify (`main`) sigue sirviendo el tablero viejo hasta el merge.
6. **El vanilla se mueve a `legacy/`** y se borra cuando termine el port del Roadmap: es la
   referencia viva para portarlo «igual igual».
7. **Se copia entero `src/components/ui` del producto** («le copiamos todo»), salvo
   `google-address-autocomplete.tsx` (depende de Google Places, es inmobiliario).

## 1. Estructura y stack

```
/                      proyecto Vite (package.json, vite.config.ts, tsconfig*, components.json)
├─ index.html          el de Vite (fuentes de Google iguales al producto)
├─ vercel.json         rewrite de la SPA
├─ .env.example        VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├─ src/
│  ├─ main.tsx, App.tsx, index.css   (index.css copiado del producto: tokens)
│  ├─ components/ui/                 (copiado entero, menos google-address-autocomplete)
│  ├─ components/Sidebar.tsx, MobileTabBar.tsx
│  ├─ layouts/AppLayout.tsx
│  ├─ lib/supabase.ts, lib/utils.ts, lib/acceso.ts (+ los lib/ que pidan los ui copiados)
│  ├─ hooks/useUserSession.tsx, hooks/useYo.ts
│  ├─ types/db.ts                    tipos escritos a mano desde supabase/schema.sql
│  └─ pages/auth/, pages/roadmap/, pages/crm/, pages/caja/
├─ legacy/             el tablero vanilla entero (index.html, app.js, app.css,
│                      supabase-sync.js, equipo.js, order-math.js, stubs .html, scripts/)
├─ supabase/, migracion/, docs/     sin cambios
```

- **Versiones y configuración copiadas del producto**: `vite.config.ts` (alias `@`, plugin de
  Tailwind, React Compiler vía babel), `tsconfig.app.json`, `components.json` (`new-york`,
  `neutral`, lucide). Puerto de dev distinto al del producto (**4100**) para poder correr los
  dos a la vez.
- **Dependencias**: las que usen los `components/ui` copiados más router, Query, supabase-js,
  sonner, lucide, zod. Nada inmobiliario (leaflet, mediabunny, confetti…).
- **`npm install` lo corre el usuario desde Windows.** Nunca desde WSL (rompe los binarios
  nativos de rollup/lightningcss). El plan tiene que decir en qué paso pedirlo.
- **`legacy/`**: se mueve con `git mv` para conservar la historia. `supabase-sync.js` es CRLF:
  mover no cambia los finales de línea. `.claude/static-server.mjs` pasa a servir `legacy/`
  para comparar lado a lado. `_redirects` (Netlify) se va a `legacy/` también.
- **`CLAUDE.md`**: se le agrega arriba una sección «El frontend nuevo» con esta estructura, y
  una línea que diga que todo lo que sigue describe `legacy/` y es la especificación del port.
  No se reescribe: es la documentación del Roadmap que el sub-proyecto 3 tiene que respetar.

## 2. Login e identidad

- **Solo email y contraseña** (`signInWithPassword`). Sin registro ni «olvidé mi contraseña»:
  las altas van por el MCP o el service role, como hoy.
- **Mismo patrón que el producto**: `useUserSession` (sesión de Supabase Auth),
  `RequireAuth` (sin sesión → `/sign-in`), `PublicRoutesAuthCheck` (con sesión → `/roadmap`),
  `SignIn` dentro de `AuthPageShell`.
- **Al entrar se lee la fila de `users`** (`useYo()`, TanStack Query, por `id = auth.uid()`).
  **Sin fila activa no se pasa**: se muestra «Tu cuenta no tiene acceso» con un botón de
  cerrar sesión. Es la misma regla que `es_usuario()` en la base, así pantalla y RLS dicen lo
  mismo; sin esto el usuario vería un tablero vacío sin saber por qué.
- La decisión vive en una función pura, `accesoDe(fila)` en `lib/acceso.ts`
  (`'cargando' | 'sin-acceso' | 'ok'`), con test. Es la pieza con lógica real de la cáscara.
- **Tipos de la base escritos a mano** en `src/types/db.ts`, espejando `supabase/schema.sql`
  (`users`, `roadmap_*`, `crm_*`). Cuando exista la base nueva se reemplazan por los generados
  (`supabase gen types`) y el diff muestra si algo quedó mal copiado.
- **URL y key por variables de entorno** (`import.meta.env.VITE_SUPABASE_*`), no escritas en
  el código como hoy en `supabase-sync.js`. `.env` ya está en `.gitignore`.

## 3. Layout, barra lateral y rutas

- **`AppLayout`** = `SidebarProvider` + `Sidebar` + `SidebarInset` con `<Outlet/>` +
  `MobileTabBar`, igual que el producto, sin `PropeliaFab`, `PropeliaBubble`, `SuggestionTray`
  ni saludos.
- **`Sidebar.tsx`** se copia del producto y se recorta: un solo grupo de navegación con tres
  entradas —**Roadmap** (`/roadmap`), **CRM** (`/crm`), **Caja** (`/caja`)—, y al pie quién
  sos (avatar con `iniciales` y `color` de `users`, `nombre`) y cerrar sesión. Sin badges de
  superadmin ni tutorial: `rol` todavía no restringe nada.
- **`MobileTabBar`** con las mismas tres entradas. La lista de entradas se escribe una vez
  (`NAV` en un módulo propio) y la leen las dos: dos copias se desincronizan.
- **Rutas**: `/sign-in`; dentro de `RequireAuth` + chequeo de acceso + `AppLayout`:
  `/roadmap`, `/crm`, `/caja`; `/` → `/roadmap`; `*` → `NotFound`.
- **Las tres páginas son placeholders en este sub-proyecto**: título y una línea. Roadmap y
  CRM los llenan los sub-proyectos 3 y 2. Caja queda así hasta que se use: «Todavía no está
  en uso».

## 4. Tests y deploy

- **Vitest** con la configuración del producto recortada: `environment: 'node'`, sin
  `globalSetup` de base local (no hay base). `include` restringido a `src/**/*.test.ts(x)`
  y excluyendo `.claude/worktrees/**` y `legacy/**` — el producto documenta por qué sin eso
  vitest barre los worktrees y corre la suite N veces.
- **TDD estricto** sobre la lógica pura: `accesoDe()` primero. Los tests del vanilla
  (`legacy/scripts/test-*.cjs`) siguen corriendo con `node` y se van con `legacy/`.
- **No se corre build** (regla del usuario). La verificación es `vitest run` y `tsc --noEmit`,
  los dos corridos por el usuario desde Windows mientras `node_modules` sea de Windows.
- **Vercel**: `vercel.json` con `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`.
  Framework Vite, build `npm run build`, salida `dist`, variables `VITE_SUPABASE_*` en el
  panel. Los enlaces viejos (`toniylorete.html`, `captalia.html`) mueren con Netlify; se
  acepta. El proyecto de Vercel lo crea el usuario.
- **Login desde el dominio nuevo**: hay que sumar la URL de Vercel a las *redirect URLs* de
  Supabase Auth de la base nueva. Anotarlo en `migracion/PASOS.md`.

## 5. Fuera de alcance (YAGNI)

Registro, recuperación de contraseña, roles, tema oscuro propio (el que traiga `index.css`
del producto viene gratis), cualquier dato real en las tres páginas, i18n, PWA.

## 6. Criterio de terminado

- Con `.env` apuntando a la base nueva (cuando exista): entrás con tu cuenta, ves la barra
  lateral con las tres entradas y tu avatar, navegás entre los placeholders, cerrás sesión.
- Una cuenta sin fila activa en `users` ve «Tu cuenta no tiene acceso».
- `vitest run` y `tsc --noEmit` pasan. El tablero viejo se sirve desde `legacy/` sin cambios.
