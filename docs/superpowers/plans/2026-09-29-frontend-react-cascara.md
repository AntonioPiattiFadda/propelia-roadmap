# La cáscara del frontend React — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un proyecto Vite + React en la raíz del repo con login, control de acceso por la
tabla `users`, barra lateral con Roadmap / CRM / Caja (placeholders) y el tablero vanilla
movido intacto a `legacy/`.

**Architecture:** Se copia la base del producto (`propelia-frontend`): configuración, tokens
(`index.css`), `components/ui` entero y el patrón de auth (`useUserSession`, `RequireAuth`,
`PublicRoutesAuthCheck`). Lo propio es chico y está aislado en funciones puras con test:
`configDeSupabase()` (variables de entorno), `accesoDe()` (quién pasa), `mensajeDeLogin()`
(errores en castellano) y `estaActivo()` (qué entrada de la navegación se marca). La lista de
navegación se escribe una vez (`NAV`) y la leen la barra lateral y la de pestañas.

**Tech Stack:** React 19, Vite 8, TypeScript ~6.0, Tailwind v4, shadcn/Radix, TanStack Query 5,
react-router-dom 7, supabase-js 2, sonner, lucide-react, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-29-frontend-react-cascara-design.md`

## Global Constraints

- Rama `frontend-react`, worktree `.claude/worktrees/frontend-react`. Todo comando corre desde ahí.
- Repo del producto, solo lectura: `PRODUCTO=/mnt/c/Users/anton/Documents/programacion/propelia/propelia-frontend`.
- Versiones de dependencias: **las mismas que `$PRODUCTO/package.json`**, copiadas tal cual (abajo, en la Task 2).
- Puerto de dev: **4100** (el producto usa 4000; los dos corren a la vez).
- Variables de entorno: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Proyecto: `itqwxnmuxuiiydsueazb`.
- **`npm install`, `npx vitest run` y `npm run dev` los corre el USUARIO desde PowerShell**, en
  `C:\Users\anton\Documents\programacion\propelia\propelia-roadmap\.claude\worktrees\frontend-react`.
  Nunca desde WSL: escribe binarios nativos de Linux en un `node_modules` que usa Windows.
- **El typecheck sí se puede correr desde WSL**: `node node_modules/typescript/bin/tsc -b`
  (TypeScript es JS puro, no toca binarios nativos).
- **Nunca correr un build** (`npm run build`, `vite build`).
- Herramientas de shell: `rg`, `fd`, `bat`, `eza`, `sd`. Nada de grep/find/cat/ls/sed.
- Commits convencionales, **sin** `Co-Authored-By` ni atribución a IA.
- Código y comentarios en castellano rioplatense; los comentarios explican el **porqué**.
- No se copia `google-address-autocomplete.tsx` ni ninguna dependencia inmobiliaria (leaflet, mediabunny, confetti, dnd-kit, idb-keyval, browser-image-compression).
- `legacy/supabase-sync.js` es CRLF: se mueve con `git mv` y no se reescribe.
- TDD estricto sobre la lógica pura: test primero, verlo fallar, implementar.

## Review Focus

1. **La consulta de `users` falla por red justo al entrar** → hay que ver «No pudimos cargar tu cuenta» con «Reintentar», NUNCA «Tu cuenta no tiene acceso» (sería mentirle a alguien que sí tiene acceso). Test en la Task 5.
2. **Estando adentro, un refresco de `users` en segundo plano falla** → te quedás adentro; no se te cierra la pantalla por un corte de red (la misma corrección #9 que tuvo el tablero vanilla). Test en la Task 5.
3. **Contraseña equivocada** → «Email o contraseña incorrectos.» en castellano, no el `Invalid login credentials` crudo de Supabase. Test en la Task 5.
4. **Falta el `.env` o una de sus variables** → un error que nombra la variable que falta y dice qué hacer, no una pantalla en blanco con un `fetch` a `undefined`. Test en la Task 4.
5. **Una ruta que empieza igual que otra** (`/crm-algo` contra `/crm`) → no se marca activa la entrada equivocada; y **recargar en `/crm` en Vercel** no da 404 (lo cubre `vercel.json`). Test de `estaActivo()` en la Task 7; el 404 se prueba a mano en la Task 8.

---

## Mapa de archivos

```
legacy/                                  Task 1 — el tablero vanilla, movido con git mv
CLAUDE.md                                Task 1 — sección nueva arriba
package.json, vite.config.ts,
tsconfig.json, tsconfig.app.json,
tsconfig.node.json, components.json,
index.html, vercel.json, .env.example,
public/favicon.png, .gitignore           Task 2
src/main.tsx, src/index.css,
src/vite-env.d.ts                        Task 2
src/App.tsx                              Task 2 (provisorio) → Task 7 (rutas)
src/components/ui/*  src/lib/utils.ts
src/lib/phone.ts  src/lib/time.ts
src/hooks/use-mobile.ts
src/assets/propelia-icon.png             Task 3 — copiados del producto
src/types/database.types.ts              Task 4 — generado desde la base
src/lib/config.ts (+ .test.ts)           Task 4
src/lib/supabase.ts                      Task 4
src/lib/acceso.ts (+ .test.ts)           Task 5
src/lib/mensajeDeLogin.ts (+ .test.ts)   Task 5
src/hooks/useUserSession.tsx
src/hooks/useYo.ts
src/hooks/useCerrarSesion.ts
src/pages/auth/AuthPageShell.tsx
src/pages/auth/SignIn.tsx
src/pages/auth/PantallaAcceso.tsx
src/pages/auth/guards.tsx                Task 6
src/components/nav.ts (+ .test.ts)
src/components/Sidebar.tsx
src/components/MobileTabBar.tsx
src/components/Placeholder.tsx
src/layouts/AppLayout.tsx
src/pages/roadmap/Roadmap.tsx
src/pages/crm/Crm.tsx
src/pages/caja/Caja.tsx
src/pages/NotFound.tsx                   Task 7
```

---

### Task 1: El tablero vanilla se muda a `legacy/`

**Files:**
- Move: `index.html app.js app.css supabase-sync.js equipo.js order-math.js 404.html captalia.html toniylorete.html _redirects scripts/` → `legacy/`
- Modify: `CLAUDE.md` (sección nueva arriba de todo)
- Test: `legacy/scripts/test-equipo.cjs`, `legacy/scripts/test-calcular-orden.cjs` (existentes)

**Interfaces:**
- Consumes: nada.
- Produces: la raíz del repo libre para el proyecto Vite. El tablero viejo se sirve desde `legacy/`.

- [ ] **Step 1: Correr los tests del vanilla antes de mover (línea de base)**

```bash
node scripts/test-equipo.cjs && node scripts/test-calcular-orden.cjs && echo OK
```
Expected: `OK`.

- [ ] **Step 2: Mover con `git mv`** (conserva la historia y los finales de línea)

```bash
mkdir legacy
git mv index.html app.js app.css supabase-sync.js equipo.js order-math.js 404.html captalia.html toniylorete.html _redirects scripts legacy/
```

- [ ] **Step 3: Correr los tests desde el lugar nuevo**

```bash
node legacy/scripts/test-equipo.cjs && node legacy/scripts/test-calcular-orden.cjs && echo OK
```
Expected: `OK` (los `require('../equipo.js')` siguen resolviendo porque se movieron juntos).

- [ ] **Step 4: Verificar que `supabase-sync.js` sigue siendo CRLF**

```bash
git diff --cached --stat -M | rg supabase-sync
```
Expected: una línea `{ => legacy}/supabase-sync.js | 0` (rename puro, sin cambios de contenido).

- [ ] **Step 5: Agregar la sección nueva arriba de `CLAUDE.md`**

Insertar justo después de la primera línea (`# Convenciones del proyecto`) y antes de `## Arquitectura`:

```markdown
## El frontend nuevo (React) — leer primero

**Desde el 29/9/2026 la raíz del repo es un proyecto Vite + React** (rama `frontend-react`
hasta que se mergee). Tres páginas en la barra lateral: Roadmap, CRM y Caja. Diseño en
`docs/superpowers/specs/2026-09-29-frontend-react-cascara-design.md`.

- **Stack y design system copiados de `propelia-frontend`**: React 19, Vite, TS, Tailwind v4,
  shadcn/Radix, TanStack Query, sonner, lucide. `src/components/ui` y `src/index.css` son
  copias del producto: si hay que cambiarlos, primero preguntarse si el cambio va en el producto.
- **`npm install`, `vitest` y `npm run dev` se corren desde Windows**, nunca desde WSL. El
  typecheck sí anda desde WSL: `node node_modules/typescript/bin/tsc -b`.
- **Acceso**: `accesoDe()` en `src/lib/acceso.ts` es la misma regla que `es_usuario()` en la
  base — fila activa en `users` o no pasás. Un error de red NO es «sin acceso».
- **Variables**: `.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (ver `.env.example`).
- **Deploy**: Vercel. **Netlify publica `legacy/`** (Publish directory) mientras el Roadmap
  nuevo no esté portado.

**El tablero vanilla vive en `legacy/`** y todo lo que sigue en este archivo lo describe. Es
la **especificación del port** del Roadmap (sub-proyecto 3): las rutas de archivo que nombra
(`app.js`, `index.html`, `scripts/…`) ahora están adentro de `legacy/`. Se borra cuando el
port termine. Para verlo en local: `cd legacy && node ../.claude/static-server.mjs` desde el
checkout principal (el servidor sirve la carpeta en la que se lo corre).
```

- [ ] **Step 6: Commit**

```bash
git add -A legacy CLAUDE.md
git commit -m "chore: el tablero vanilla se muda a legacy/"
```

---

### Task 2: El proyecto Vite, vacío pero andando

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `components.json`, `index.html`, `vercel.json`, `.env.example`, `.env` (ignorado), `public/favicon.png`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: la raíz libre (Task 1).
- Produces: alias `@` → `src/`; `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` tipadas como `string | undefined`; vitest configurado para `src/**/*.test.ts(x)`.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "propelia-roadmap",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@radix-ui/react-accordion": "^1.2.13",
    "@radix-ui/react-alert-dialog": "^1.1.16",
    "@radix-ui/react-avatar": "^1.1.12",
    "@radix-ui/react-checkbox": "^1.3.4",
    "@radix-ui/react-collapsible": "^1.1.13",
    "@radix-ui/react-dialog": "^1.1.16",
    "@radix-ui/react-dropdown-menu": "^2.1.17",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-popover": "^1.1.16",
    "@radix-ui/react-radio-group": "^1.4.0",
    "@radix-ui/react-select": "^2.3.0",
    "@radix-ui/react-separator": "^1.1.9",
    "@radix-ui/react-slider": "^1.4.0",
    "@radix-ui/react-slot": "^1.2.4",
    "@radix-ui/react-switch": "^1.3.0",
    "@radix-ui/react-tabs": "^1.1.14",
    "@radix-ui/react-tooltip": "^1.2.9",
    "@supabase/supabase-js": "^2.106.2",
    "@tailwindcss/vite": "^4.3.0",
    "@tanstack/react-query": "^5.100.14",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "libphonenumber-js": "^1.13.8",
    "lucide-react": "^1.17.0",
    "react": "^19.2.6",
    "react-day-picker": "^10.0.1",
    "react-dom": "^19.2.6",
    "react-router-dom": "^7.16.0",
    "recharts": "^3.8.1",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0",
    "tailwindcss": "^4.3.0",
    "tw-animate-css": "^1.4.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@babel/core": "^7.29.0",
    "@rolldown/plugin-babel": "^0.2.3",
    "@types/babel__core": "^7.20.5",
    "@types/node": "^24.12.3",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "babel-plugin-react-compiler": "^1.0.0",
    "typescript": "~6.0.2",
    "vite": "^8.0.12",
    "vitest": "4.1.8"
  }
}
```

(`recharts`, `cmdk`, `react-day-picker` y `libphonenumber-js` están porque los piden los
`components/ui` que se copian enteros en la Task 3.)

- [ ] **Step 2: `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Copiado del producto (propelia-frontend). El puerto es otro para poder correr los dos a la vez.
export default defineConfig({
  server: {
    port: 4100,
  },
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Sin `include` vitest barre todo el disco desde la raíz: los worktrees de
    // .claude/worktrees traen su propia copia de src/ y la suite correría N veces.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/worktrees/**', 'legacy/**'],
  },
})
```

- [ ] **Step 3: los tres `tsconfig` y `components.json`**

```bash
PRODUCTO=/mnt/c/Users/anton/Documents/programacion/propelia/propelia-frontend
cp $PRODUCTO/tsconfig.json $PRODUCTO/tsconfig.app.json $PRODUCTO/tsconfig.node.json $PRODUCTO/components.json .
```

Se copian sin tocar: `tsconfig.app.json` ya tiene `"paths": {"@/*": ["./src/*"]}`, `"types": ["vite/client"]` e `"include": ["src"]`; `components.json` es `new-york` / `neutral` / lucide con los alias `@/…`.

- [ ] **Step 4: `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

// Opcionales a propósito: pueden faltar en el `.env`, y quien las lee (`configDeSupabase()`)
// tiene que poder decir cuál falta en vez de confiar en un tipo que promete que están.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
```

- [ ] **Step 5: `index.html` y favicon**

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Las mismas fuentes que el producto: index.css las nombra en sus tokens. -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Schibsted+Grotesk:wght@800&display=swap" rel="stylesheet">
    <title>Propelia · Tablero</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```bash
mkdir -p public && cp $PRODUCTO/public/favicon.png public/
```

- [ ] **Step 6: `src/index.css`, `src/main.tsx` y un `src/App.tsx` provisorio**

```bash
mkdir -p src && cp $PRODUCTO/src/index.css src/
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

`src/App.tsx` (provisorio; la Task 7 lo reemplaza entero):
```tsx
// Provisorio: alcanza para ver que Vite, Tailwind y los tokens del producto andan.
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Cáscara en construcción</p>
    </div>
  )
}
```

- [ ] **Step 7: `vercel.json`, `.env.example`, `.env` y `.gitignore`**

`vercel.json` (sin esto, recargar en `/crm` da 404: Vercel busca un archivo `crm`):
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

`.env.example`:
```
# Proyecto Supabase del tablero (itqwxnmuxuiiydsueazb). La anon key es pública: la RLS es la que protege.
VITE_SUPABASE_URL=https://itqwxnmuxuiiydsueazb.supabase.co
VITE_SUPABASE_ANON_KEY=
```

`.env` (ya está en `.gitignore`): igual que `.env.example` con la key completa, la misma
`SUPABASE_ANON_KEY` que está en `legacy/supabase-sync.js:6`.

`.gitignore`: agregar al final
```
node_modules/
dist/
```

- [ ] **Step 8: PEDIRLE AL USUARIO que instale y levante el dev**

Decirle, textual, que corra en PowerShell:
```powershell
cd C:\Users\anton\Documents\programacion\propelia\propelia-roadmap\.claude\worktrees\frontend-react
npm install
npm run dev
```
Esperar su respuesta. Expected: `npm install` sin errores; en `http://localhost:4100` se ve
«Cáscara en construcción» centrado, en la tipografía del producto.

- [ ] **Step 9: Typecheck desde WSL**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 10: Commit** (`package-lock.json` incluido: lo generó el `npm install` del usuario)

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json components.json index.html vercel.json .env.example .gitignore public src
git commit -m "feat: proyecto Vite con la configuración y los tokens del producto"
```

---

### Task 3: El design system del producto, entero

**Files:**
- Create: `src/components/ui/*.tsx` (46 archivos), `src/lib/utils.ts`, `src/lib/phone.ts`, `src/lib/time.ts`, `src/hooks/use-mobile.ts`, `src/assets/propelia-icon.png`

**Interfaces:**
- Consumes: alias `@` (Task 2).
- Produces: `cn()` en `@/lib/utils`; `Button`, `Input`, `Label` en `@/components/ui/*`; `Sidebar`, `SidebarProvider`, `SidebarInset`, `SidebarContent`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `useSidebar` en `@/components/ui/sidebar`; `Icon` en `@/components/ui/icon`; `Toaster` en `@/components/ui/sonner`; la imagen `@/assets/propelia-icon.png`.

- [ ] **Step 1: Copiar**

```bash
PRODUCTO=/mnt/c/Users/anton/Documents/programacion/propelia/propelia-frontend
mkdir -p src/components/ui src/lib src/hooks src/assets
cp $PRODUCTO/src/components/ui/*.tsx src/components/ui/
rm src/components/ui/google-address-autocomplete.tsx
cp $PRODUCTO/src/lib/utils.ts $PRODUCTO/src/lib/phone.ts $PRODUCTO/src/lib/time.ts src/lib/
cp $PRODUCTO/src/hooks/use-mobile.ts src/hooks/
cp $PRODUCTO/src/assets/propelia-icon.png src/assets/
```

- [ ] **Step 2: Verificar que no quedó ningún import colgando**

```bash
rg -N --no-filename -o "from ['\"]@/[^'\"]+['\"]" src | sort -u
```
Expected: solo `@/components/ui/…`, `@/hooks/use-mobile`, `@/lib/utils`, `@/lib/phone`, `@/lib/time`. Si aparece `@/service/…` es que un archivo depende del autocompletado de Google: sacarlo también y anotarlo en el commit.

- [ ] **Step 3: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`. Si falta una dependencia, agregarla a `package.json` con la versión exacta del producto y pedirle al usuario otro `npm install` desde PowerShell.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui src/lib src/hooks src/assets
git commit -m "feat: components/ui y helpers copiados del producto"
```

---

### Task 4: Tipos de la base y cliente de Supabase

**Files:**
- Create: `src/types/database.types.ts` (generado), `src/lib/config.ts`, `src/lib/config.test.ts`, `src/lib/supabase.ts`

**Interfaces:**
- Consumes: `ImportMetaEnv` (Task 2).
- Produces:
  - `configDeSupabase(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }): { url: string; key: string }` — tira `Error` si falta alguna.
  - `supabase` (`SupabaseClient<Database>`) en `@/lib/supabase`.
  - `Database`, `Tables<'users'>` en `@/types/database.types`.

- [ ] **Step 1: Generar los tipos**

Con el MCP de Supabase: `generate_typescript_types` sobre el proyecto `itqwxnmuxuiiydsueazb`.
Escribir el resultado tal cual en `src/types/database.types.ts`, con esta línea arriba:
```ts
// GENERADO desde la base (MCP generate_typescript_types, proyecto itqwxnmuxuiiydsueazb). No editar a mano:
// si cambia supabase/schema.sql, se vuelve a generar.
```
Verificar:
```bash
rg -n "users: \{" src/types/database.types.ts && rg -n "export type Tables<" src/types/database.types.ts
```
Expected: las dos aparecen.

- [ ] **Step 2: Test que falla — `src/lib/config.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { configDeSupabase } from './config'

describe('configDeSupabase', () => {
  it('devuelve url y key recortadas', () => {
    expect(configDeSupabase({
      VITE_SUPABASE_URL: ' https://x.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' abc ',
    })).toEqual({ url: 'https://x.supabase.co', key: 'abc' })
  })

  it('sin ninguna, nombra las dos y dice qué hacer', () => {
    expect(() => configDeSupabase({})).toThrow(
      'Faltan variables de entorno: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env y completalo.',
    )
  })

  it('una vacía o de espacios cuenta como faltante', () => {
    expect(() => configDeSupabase({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: '   ' }))
      .toThrow('Faltan variables de entorno: VITE_SUPABASE_ANON_KEY.')
  })
})
```

- [ ] **Step 3: PEDIRLE AL USUARIO que corra los tests** (`npx vitest run` en PowerShell, en el worktree)

Expected: FAIL — `Failed to resolve import "./config"`.

- [ ] **Step 4: Implementar `src/lib/config.ts`**

```ts
type EnvSupabase = { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }

/* Sin esto, un `.env` que falta no se nota hasta el primer fetch: la app arranca, el cliente
   se crea contra `undefined` y lo único que se ve es una pantalla en blanco. Acá se corta al
   arrancar y el error dice cuál falta. Una de espacios cuenta como faltante: copiar mal la
   key deja justamente eso. */
export function configDeSupabase(env: EnvSupabase): { url: string; key: string } {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) {
    const faltan = [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_ANON_KEY'].filter(Boolean)
    throw new Error(`Faltan variables de entorno: ${faltan.join(', ')}. Copiá .env.example a .env y completalo.`)
  }
  return { url, key }
}
```

- [ ] **Step 5: PEDIRLE AL USUARIO que corra los tests**

Expected: PASS, 3 tests.

- [ ] **Step 6: `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { configDeSupabase } from '@/lib/config'

// Único cliente de la app. Vive aparte de `config.ts` para que los tests de lógica pura no
// lo importen: crearlo exige un `.env`, y vitest corre sin él.
const { url, key } = configDeSupabase(import.meta.env)

export const supabase = createClient<Database>(url, key)
```

- [ ] **Step 7: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 8: Commit**

```bash
git add src/types src/lib/config.ts src/lib/config.test.ts src/lib/supabase.ts
git commit -m "feat: cliente de Supabase con tipos generados y variables validadas"
```

---

### Task 5: Quién pasa y qué se le dice

**Files:**
- Create: `src/lib/acceso.ts`, `src/lib/acceso.test.ts`, `src/lib/mensajeDeLogin.ts`, `src/lib/mensajeDeLogin.test.ts`

**Interfaces:**
- Consumes: `Tables<'users'>` (Task 4).
- Produces:
  - `type Acceso = 'cargando' | 'error' | 'sin-acceso' | 'ok'`
  - `accesoDe(estado: { cargando: boolean; error: unknown; fila: { activo: boolean } | null | undefined }): Acceso`
  - `mensajeDeLogin(err: unknown): string`

> **Desvío de la spec, a propósito**: la spec dice `'cargando' | 'sin-acceso' | 'ok'`. Se suma
> `'error'` porque sin él un corte de red al leer `users` caería en «sin acceso» — ver el
> punto 1 del Review Focus.

- [ ] **Step 1: Test que falla — `src/lib/acceso.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { accesoDe } from './acceso'

const activa = { activo: true }
const inactiva = { activo: false }

describe('accesoDe', () => {
  it('mientras carga y no hay nada, espera', () => {
    expect(accesoDe({ cargando: true, error: null, fila: undefined })).toBe('cargando')
  })

  it('sin fila (la RLS no devolvió nada) no pasa', () => {
    expect(accesoDe({ cargando: false, error: null, fila: null })).toBe('sin-acceso')
  })

  it('con la fila dada de baja no pasa', () => {
    expect(accesoDe({ cargando: false, error: null, fila: inactiva })).toBe('sin-acceso')
  })

  it('con la fila activa pasa', () => {
    expect(accesoDe({ cargando: false, error: null, fila: activa })).toBe('ok')
  })

  it('un error sin fila es un error, NO «sin acceso»', () => {
    expect(accesoDe({ cargando: false, error: new Error('Failed to fetch'), fila: undefined })).toBe('error')
  })

  it('estando adentro, un refresco que falla no te saca', () => {
    expect(accesoDe({ cargando: false, error: new Error('Failed to fetch'), fila: activa })).toBe('ok')
  })

  it('estando adentro, un refresco en curso no te saca', () => {
    expect(accesoDe({ cargando: true, error: null, fila: activa })).toBe('ok')
  })
})
```

- [ ] **Step 2: Test que falla — `src/lib/mensajeDeLogin.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { mensajeDeLogin } from './mensajeDeLogin'

describe('mensajeDeLogin', () => {
  it('credenciales malas', () => {
    expect(mensajeDeLogin(new Error('Invalid login credentials'))).toBe('Email o contraseña incorrectos.')
  })

  it('cuenta sin confirmar', () => {
    expect(mensajeDeLogin(new Error('Email not confirmed'))).toBe('La cuenta todavía no está confirmada.')
  })

  it('sin red', () => {
    expect(mensajeDeLogin(new TypeError('Failed to fetch'))).toBe('No hay conexión con el servidor. Probá de nuevo.')
  })

  it('cualquier otro error muestra su texto', () => {
    expect(mensajeDeLogin(new Error('Algo raro'))).toBe('Algo raro')
  })

  it('algo que no es un error', () => {
    expect(mensajeDeLogin(undefined)).toBe('No se pudo iniciar sesión.')
  })
})
```

- [ ] **Step 3: PEDIRLE AL USUARIO que corra los tests**

Expected: FAIL — los dos archivos sin resolver (`./acceso`, `./mensajeDeLogin`).

- [ ] **Step 4: Implementar `src/lib/acceso.ts`**

```ts
export type Acceso = 'cargando' | 'error' | 'sin-acceso' | 'ok'

type EstadoYo = {
  cargando: boolean
  error: unknown
  fila: { activo: boolean } | null | undefined
}

/* La misma regla que `es_usuario()` en la base: fila activa en `users` o no pasás. Así la
   pantalla y la RLS dicen lo mismo; sin esto, alguien sin fila vería un tablero vacío sin
   saber por qué.

   El orden importa. Primero la fila: si ya la tenemos, un refresco que falla o que está en
   curso no te saca — un corte de red no puede taparte la pantalla con «sin acceso» (el
   tablero vanilla tuvo ese bug). Después, cargando y error, y recién con la consulta
   terminada sin fila es «sin acceso» de verdad: la RLS no devuelve la fila de un inactivo
   ni la de quien no tiene fila. */
export function accesoDe({ cargando, error, fila }: EstadoYo): Acceso {
  if (fila) return fila.activo ? 'ok' : 'sin-acceso'
  if (cargando) return 'cargando'
  if (error) return 'error'
  return 'sin-acceso'
}
```

- [ ] **Step 5: Implementar `src/lib/mensajeDeLogin.ts`**

```ts
/* Supabase contesta en inglés y con su vocabulario («Invalid login credentials»). Se traduce
   lo que se sabe que llega; lo demás se muestra tal cual, que un texto raro dice más que un
   «error» genérico. */
export function mensajeDeLogin(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'La cuenta todavía no está confirmada.'
  if (/failed to fetch|networkerror|network request failed/i.test(msg)) return 'No hay conexión con el servidor. Probá de nuevo.'
  return msg || 'No se pudo iniciar sesión.'
}
```

- [ ] **Step 6: PEDIRLE AL USUARIO que corra los tests**

Expected: PASS — 15 tests en total (3 + 7 + 5).

- [ ] **Step 7: Commit**

```bash
git add src/lib/acceso.ts src/lib/acceso.test.ts src/lib/mensajeDeLogin.ts src/lib/mensajeDeLogin.test.ts
git commit -m "feat: accesoDe y mensajeDeLogin con sus tests"
```

---

### Task 6: Sesión, login y las guardas

**Files:**
- Create: `src/hooks/useUserSession.tsx`, `src/hooks/useYo.ts`, `src/hooks/useCerrarSesion.ts`, `src/pages/auth/AuthPageShell.tsx`, `src/pages/auth/SignIn.tsx`, `src/pages/auth/PantallaAcceso.tsx`, `src/pages/auth/guards.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 4), `accesoDe`, `mensajeDeLogin` (Task 5), `Button`, `Input`, `Label` (Task 3).
- Produces:
  - `useUserSession(): { lookingForSession: boolean; userSession: Session | null }`
  - `useYo(uid: string | undefined): UseQueryResult<Tables<'users'> | null>` con `queryKey: ['yo', uid]`
  - `useCerrarSesion(): () => Promise<void>`
  - `RequireAuth`, `PublicRoutesAuthCheck`, `RequireAcceso` (componentes de ruta con `<Outlet/>`), exportados de `@/pages/auth/guards`
  - `AuthPageShell` (con `<Outlet/>`), `SignIn`

- [ ] **Step 1: `src/hooks/useUserSession.tsx`**

Copiar `$PRODUCTO/src/hooks/useUserSession.tsx` y cambiar una sola línea:
```ts
import { supabase } from '@/service'
```
por
```ts
import { supabase } from '@/lib/supabase'
```
(Se conserva la demora de 3 s del `SIGNED_OUT`: con varias pestañas, Supabase manda
`SIGNED_OUT` antes que `TOKEN_REFRESHED` y sin la demora se cierra la sesión de gusto.)

- [ ] **Step 2: `src/hooks/useYo.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/* La fila de `users` de quien entró: dice si tiene acceso y quién es (nombre, iniciales,
   color). `maybeSingle` y no `single`: sin fila no es un error — es exactamente el caso
   «sin acceso», y lo decide `accesoDe()`, no un throw. */
export function useYo(uid: string | undefined) {
  return useQuery({
    queryKey: ['yo', uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').eq('id', uid ?? '').maybeSingle()
      if (error) throw error
      return data
    },
  })
}
```

- [ ] **Step 3: `src/hooks/useCerrarSesion.ts`**

```ts
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

/* El cache se limpia al SALIR y no al entrar: si el próximo que entra es otro, la app no
   recarga, y sin esto la fila `yo` del anterior seguiría viva. Lo usan la barra lateral y
   la pantalla de «sin acceso». */
export function useCerrarSesion() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async () => {
    await supabase.auth.signOut()
    queryClient.clear()
    navigate('/sign-in', { replace: true })
  }
}
```

- [ ] **Step 4: `src/pages/auth/AuthPageShell.tsx`**

```tsx
import { Outlet } from 'react-router-dom'
import propeliaIcon from '@/assets/propelia-icon.png'

/* El marco de las pantallas sin sesión: una tarjeta centrada. Más simple que el del
   producto (sin hero ni enlaces legales): esto es una herramienta interna de dos personas. */
export function AuthPageShell() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <img src={propeliaIcon} alt="Propelia" className="h-10 w-10 rounded-lg object-contain" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Propelia</h1>
            <p className="text-[13px] text-muted-foreground">Tablero interno</p>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: `src/pages/auth/SignIn.tsx`**

```tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { mensajeDeLogin } from '@/lib/mensajeDeLogin'

/* Solo email y contraseña: no hay registro ni «olvidé mi contraseña», las altas van por el
   MCP. Acá NO se navega al entrar: Supabase avisa `SIGNED_IN` antes de resolver la promesa
   y `PublicRoutesAuthCheck` ya nos lleva a /roadmap; navegar acá llegaría tarde. */
export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)

  const login = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
  })

  return (
    <form
      className="space-y-4"
      onSubmit={e => { e.preventDefault(); login.mutate() }}
    >
      {login.isError && (
        <div role="alert" className="rounded-md border border-border bg-danger-soft px-4 py-3 text-sm text-danger">
          {mensajeDeLogin(login.error)}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="email" type="email" required autoComplete="email" className="pl-10"
            value={email} onChange={e => setEmail(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="password" type={verPassword ? 'text' : 'password'} required autoComplete="current-password"
            className="pl-10 pr-10" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" onClick={() => setVerPassword(v => !v)}
            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={login.isPending}>
        {login.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando…</> : 'Entrar'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 6: `src/pages/auth/PantallaAcceso.tsx`**

```tsx
import { Button } from '@/components/ui/button'
import { useCerrarSesion } from '@/hooks/useCerrarSesion'

type Props = { titulo: string; texto: string; onReintentar?: () => void }

/* Las dos pantallas en las que la sesión existe pero no se puede entrar: sin fila activa en
   `users`, o sin poder leerla. Son distintas a propósito — a alguien con acceso que se quedó
   sin red no se le puede decir que no tiene acceso. Cerrar sesión va siempre: es la única
   salida si entraste con la cuenta equivocada. */
export function PantallaAcceso({ titulo, texto, onReintentar }: Props) {
  const cerrarSesion = useCerrarSesion()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-8 text-center shadow-lg">
        <h1 className="text-lg font-semibold text-foreground">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{texto}</p>
        <div className="flex justify-center gap-2">
          {onReintentar && <Button onClick={onReintentar}>Reintentar</Button>}
          <Button variant="outline" onClick={cerrarSesion}>Cerrar sesión</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: `src/pages/auth/guards.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { accesoDe } from '@/lib/acceso'
import { PantallaAcceso } from './PantallaAcceso'

/** Sin sesión → al login. */
export function RequireAuth() {
  const { lookingForSession, userSession } = useUserSession()
  if (lookingForSession) return null
  return userSession ? <Outlet /> : <Navigate to="/sign-in" replace />
}

/** Con sesión → adentro. Es lo que saca del login después de `signInWithPassword`. */
export function PublicRoutesAuthCheck() {
  const { lookingForSession, userSession } = useUserSession()
  if (lookingForSession) return null
  return userSession ? <Navigate to="/roadmap" replace /> : <Outlet />
}

/** Con sesión pero sin fila activa en `users` → no se pasa. Va debajo de `RequireAuth`. */
export function RequireAcceso() {
  const { userSession } = useUserSession()
  const yo = useYo(userSession?.user.id)
  const acceso = accesoDe({ cargando: yo.isPending, error: yo.error, fila: yo.data })

  if (acceso === 'cargando') return null
  if (acceso === 'error') {
    return (
      <PantallaAcceso
        titulo="No pudimos cargar tu cuenta"
        texto="Puede ser la conexión. Probá de nuevo en un momento."
        onReintentar={() => yo.refetch()}
      />
    )
  }
  if (acceso === 'sin-acceso') {
    return (
      <PantallaAcceso
        titulo="Tu cuenta no tiene acceso"
        texto="Entraste bien, pero tu cuenta no está habilitada en el tablero. Pedile a Antonio o a Lorenzo que te den de alta."
      />
    )
  }
  return <Outlet />
}
```

- [ ] **Step 8: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`. (`bg-danger-soft` y `text-danger` existen: los define `src/index.css` en su `@theme`.)

- [ ] **Step 9: Commit**

```bash
git add src/hooks src/pages/auth
git commit -m "feat: login, sesión y guardas de acceso por la tabla users"
```

---

### Task 7: Barra lateral, pestañas, páginas y rutas

**Files:**
- Create: `src/components/nav.ts`, `src/components/nav.test.ts`, `src/components/Sidebar.tsx`, `src/components/MobileTabBar.tsx`, `src/components/Placeholder.tsx`, `src/layouts/AppLayout.tsx`, `src/pages/roadmap/Roadmap.tsx`, `src/pages/crm/Crm.tsx`, `src/pages/caja/Caja.tsx`, `src/pages/NotFound.tsx`
- Modify: `src/App.tsx` (reemplazo entero)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `NAV: NavItem[]`, `estaActivo(pathname: string, path: string): boolean` en `@/components/nav`; las rutas `/sign-in`, `/roadmap`, `/crm`, `/caja`, `/` → `/roadmap`, `*` → NotFound.

- [ ] **Step 1: Test que falla — `src/components/nav.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { NAV, estaActivo } from './nav'

describe('estaActivo', () => {
  it('la ruta exacta', () => expect(estaActivo('/crm', '/crm')).toBe(true))
  it('una subruta', () => expect(estaActivo('/crm/lead/3', '/crm')).toBe(true))
  it('una ruta que solo empieza igual NO', () => expect(estaActivo('/crm-viejo', '/crm')).toBe(false))
  it('otra ruta', () => expect(estaActivo('/caja', '/crm')).toBe(false))
})

describe('NAV', () => {
  it('son las tres páginas, en este orden', () => {
    expect(NAV.map(n => n.path)).toEqual(['/roadmap', '/crm', '/caja'])
  })
})
```

- [ ] **Step 2: PEDIRLE AL USUARIO que corra los tests**

Expected: FAIL — `./nav` sin resolver.

- [ ] **Step 3: `src/components/nav.ts`**

```ts
import { ListChecks, Users, Wallet, type LucideIcon } from 'lucide-react'

export type NavItem = { id: string; icon: LucideIcon; label: string; path: string }

/* Se escribe una vez y la leen la barra lateral y la de pestañas del teléfono: con dos
   copias, la página que se agrega en una no llega nunca a la otra. */
export const NAV: NavItem[] = [
  { id: 'roadmap', icon: ListChecks, label: 'Roadmap', path: '/roadmap' },
  { id: 'crm', icon: Users, label: 'CRM', path: '/crm' },
  { id: 'caja', icon: Wallet, label: 'Caja', path: '/caja' },
]

// Con la barra y no un `startsWith` pelado: si no, `/crm-viejo` marcaría activa la entrada del CRM.
export const estaActivo = (pathname: string, path: string) =>
  pathname === path || pathname.startsWith(path + '/')
```

- [ ] **Step 4: PEDIRLE AL USUARIO que corra los tests**

Expected: PASS — 20 tests en total.

- [ ] **Step 5: `src/components/Sidebar.tsx`**

```tsx
import { useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import propeliaIcon from '@/assets/propelia-icon.png'
import { NAV, estaActivo } from '@/components/nav'
import { useUserSession } from '@/hooks/useUserSession'
import { useYo } from '@/hooks/useYo'
import { useCerrarSesion } from '@/hooks/useCerrarSesion'
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

/* La del producto, recortada: un solo grupo de navegación, quién sos y cerrar sesión. Sin
   badges de superadmin ni tutorial — `rol` todavía no restringe nada. Se abre al pasar el
   cursor, como la del tablero vanilla y la del producto. */
export function Sidebar() {
  const { pathname } = useLocation()
  const { userSession } = useUserSession()
  const { data: yo } = useYo(userSession?.user.id)
  const cerrarSesion = useCerrarSesion()
  const { setOpen, isMobile, setOpenMobile } = useSidebar()

  const abrir = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cerrar = useRef<ReturnType<typeof setTimeout> | null>(null)

  // En el teléfono un toque emite mouseenter: sin este corte, tocar el panel dispararía
  // también el desplegado de escritorio.
  const alEntrar = () => {
    if (isMobile) return
    if (cerrar.current) { clearTimeout(cerrar.current); cerrar.current = null }
    abrir.current = setTimeout(() => setOpen(true), 200)
  }
  const alSalir = () => {
    if (isMobile) return
    if (abrir.current) { clearTimeout(abrir.current); abrir.current = null }
    cerrar.current = setTimeout(() => setOpen(false), 200)
  }
  // En el teléfono el panel tapa la pantalla: si no se cierra al elegir, llegás a la página sin verla.
  const cerrarEnTelefono = () => { if (isMobile) setOpenMobile(false) }

  return (
    <SidebarRoot collapsible="icon" onMouseEnter={alEntrar} onMouseLeave={alSalir}>
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
              <img
                src={propeliaIcon}
                alt="Propelia"
                className="h-[42px] w-[42px] shrink-0 rounded-lg object-contain group-data-[collapsible=icon]:h-[28px] group-data-[collapsible=icon]:w-[28px] group-data-[collapsible=icon]:translate-x-[2px] group-data-[collapsible=icon]:translate-y-[5px]"
              />
              <h2 className="truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                Propelia
              </h2>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarMenu>
            {NAV.map(item => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton asChild isActive={estaActivo(pathname, item.path)} tooltip={item.label}>
                  <Link to={item.path} onClick={cerrarEnTelefono}>
                    <item.icon />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* `mt-auto` la empuja al fondo: el hueco queda entre la navegación y la cuenta. */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupLabel>Cuenta</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="flex h-8 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                {/* El color y las iniciales salen de `users`: son los mismos que pinta el tablero. */}
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: yo?.color ?? 'var(--muted-foreground)' }}
                >
                  {yo?.iniciales ?? '·'}
                </div>
                <div className="overflow-hidden leading-tight group-data-[collapsible=icon]:hidden">
                  <div className="truncate text-[13px] font-medium text-sidebar-foreground">{yo?.nombre ?? '…'}</div>
                  <div className="truncate text-[11px] text-sidebar-foreground/60">{yo?.email ?? ''}</div>
                </div>
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={cerrarSesion} tooltip="Cerrar sesión">
                <LogOut />
                <span>Cerrar sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </SidebarRoot>
  )
}
```

- [ ] **Step 6: `src/components/MobileTabBar.tsx`**

```tsx
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { NAV, estaActivo } from '@/components/nav'

/* Navegación fija abajo, solo bajo 768px. Va en el layout y no en cada página. Su alto se
   publica en `--tabbar-h` (index.css, copiado del producto), y de ahí lo lee el padding
   inferior del `main`: se toca en un solo lugar. */
export function MobileTabBar() {
  const { pathname } = useLocation()
  return (
    <nav
      aria-label="Navegación principal"
      className="no-print fixed inset-x-0 bottom-0 z-40 flex h-(--tabbar-h) items-stretch border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      {NAV.map(item => {
        const activo = estaActivo(pathname, item.path)
        return (
          <Link
            key={item.id}
            to={item.path}
            aria-current={activo ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium leading-none',
              activo ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon icon={item.icon} size="lg" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 7: `src/layouts/AppLayout.tsx` y `src/components/Placeholder.tsx`**

`src/layouts/AppLayout.tsx`:
```tsx
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/Sidebar'
import { MobileTabBar } from '@/components/MobileTabBar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

// El del producto sin el asistente, las sugerencias ni el saludo al entrar.
export function AppLayout() {
  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <MobileTabBar />
    </SidebarProvider>
  )
}
```

`src/components/Placeholder.tsx`:
```tsx
type Props = { titulo: string; texto: string }

// Lo que muestran las tres páginas hasta que los sub-proyectos 2 y 3 las llenen.
export function Placeholder({ titulo, texto }: Props) {
  return (
    <div className="p-6 md:p-10">
      <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
    </div>
  )
}
```

- [ ] **Step 8: Las cuatro páginas**

`src/pages/roadmap/Roadmap.tsx`:
```tsx
import { Placeholder } from '@/components/Placeholder'

export function Roadmap() {
  return <Placeholder titulo="Roadmap" texto="Acá va el tablero. Mientras tanto sigue en su dirección de siempre." />
}
```

`src/pages/crm/Crm.tsx`:
```tsx
import { Placeholder } from '@/components/Placeholder'

export function Crm() {
  return <Placeholder titulo="CRM" texto="Acá van las inmobiliarias y su seguimiento." />
}
```

`src/pages/caja/Caja.tsx`:
```tsx
import { Placeholder } from '@/components/Placeholder'

export function Caja() {
  return <Placeholder titulo="Caja" texto="Todavía no está en uso." />
}
```

`src/pages/NotFound.tsx`:
```tsx
import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-background">
      <h1 className="text-lg font-semibold text-foreground">Esta página no existe</h1>
      <Link to="/roadmap" className="text-sm text-primary hover:underline">Volver al tablero</Link>
    </div>
  )
}
```

- [ ] **Step 9: `src/App.tsx` (reemplazo entero)**

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AppLayout } from '@/layouts/AppLayout'
import { AuthPageShell } from '@/pages/auth/AuthPageShell'
import { SignIn } from '@/pages/auth/SignIn'
import { PublicRoutesAuthCheck, RequireAcceso, RequireAuth } from '@/pages/auth/guards'
import { Roadmap } from '@/pages/roadmap/Roadmap'
import { Crm } from '@/pages/crm/Crm'
import { Caja } from '@/pages/caja/Caja'
import { NotFound } from '@/pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Una sesión vencida no se arregla reintentando; un corte de red sí.
      retry: (intentos, error) => {
        if (error instanceof Error && /JWT|No active session/i.test(error.message)) return false
        return intentos < 3
      },
    },
  },
})

const App = () => (
  <QueryClientProvider client={queryClient}>
    {/* Sin TooltipProvider acá: lo pone `SidebarProvider` (components/ui/sidebar), igual que en el producto. */}
    <Toaster />
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoutesAuthCheck />}>
          <Route element={<AuthPageShell />}>
            <Route path="/sign-in" element={<SignIn />} />
          </Route>
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<RequireAcceso />}>
            <Route element={<AppLayout />}>
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/crm" element={<Crm />} />
              <Route path="/caja" element={<Caja />} />
            </Route>
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/roadmap" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
)

export default App
```

- [ ] **Step 10: Typecheck**

```bash
node node_modules/typescript/bin/tsc -b && echo TSC OK
```
Expected: `TSC OK`.

- [ ] **Step 11: PEDIRLE AL USUARIO que corra tests y dev** (PowerShell, en el worktree)

```powershell
npx vitest run
npm run dev
```
Expected: 20 tests pasan. En `http://localhost:4100`: te manda a `/sign-in`; entrás con tu
cuenta; caés en `/roadmap` con la barra lateral (se abre al pasar el cursor), tu avatar con tu
color e iniciales abajo; navegás a CRM y Caja; «Cerrar sesión» te devuelve al login.

- [ ] **Step 12: Commit**

```bash
git add src
git commit -m "feat: barra lateral, pestañas del teléfono y las tres páginas"
```

---

### Task 8: Verificación de punta a punta y publicación

**Files:**
- Modify: `migracion/PASOS.md` (nota al final sobre el frontend nuevo)

**Interfaces:**
- Consumes: la app entera.
- Produces: el criterio de terminado de la spec, comprobado; el proyecto de Vercel.

- [ ] **Step 1: Checklist manual con el usuario** (en `npm run dev`, desde Windows)

- [ ] Contraseña mala → «Email o contraseña incorrectos.»
- [ ] Entrar con Antonio → `/roadmap`, avatar AN en su color.
- [ ] Entrar con Lorenzo (otra ventana privada) → avatar LO.
- [ ] Recargar en `/crm` → sigue en `/crm` (en dev lo hace Vite; en Vercel, `vercel.json`).
- [ ] Ir a `/cualquiercosa` → «Esta página no existe».
- [ ] Achicar a 390px → aparece la barra de pestañas abajo con las tres páginas; la lateral es un panel.
- [ ] DevTools → Network → Offline, recargar adentro → «No pudimos cargar tu cuenta» con «Reintentar» (no «sin acceso»); volver a Online y «Reintentar» → entra.
- [ ] Cerrar sesión → login.

- [ ] **Step 2: Vercel (lo hace el usuario)**

1. vercel.com → Add New → Project → importar `AntonioPiattiFadda/propelia-roadmap`.
2. Framework: Vite. Build: `npm run build`. Output: `dist`. Branch de producción: `main`
   (hasta el merge se puede publicar el preview de `frontend-react`).
3. Environment Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, los mismos del `.env`.
4. En el preview: repetir «recargar en `/crm`» — tiene que seguir en `/crm`.

- [ ] **Step 3: Anotar en `migracion/PASOS.md`**, al final:

```markdown
## Después de la mudanza: el frontend nuevo (29/9/2026)

La raíz del repo pasa a ser un proyecto Vite + React (rama `frontend-react`, plan en
`docs/superpowers/plans/2026-09-29-frontend-react-cascara.md`). El tablero vanilla se mudó a
`legacy/`. **Antes de mergear `frontend-react` a `main`, Netlify tiene que publicar `legacy/`**
(Site settings → Build & deploy → Publish directory = `legacy`): si no, al mergear publica el
código fuente de Vite y el tablero de todos los días se cae. El frontend nuevo se publica en
Vercel.
```

- [ ] **Step 4: Commit**

```bash
git add migracion/PASOS.md
git commit -m "docs(migracion): el frontend nuevo y el cambio de carpeta de Netlify"
```

- [ ] **Step 5: NO mergear.** Avisarle al usuario que la rama está lista y que el merge a
  `main` va recién después de cambiar la carpeta de Netlify a `legacy`.
