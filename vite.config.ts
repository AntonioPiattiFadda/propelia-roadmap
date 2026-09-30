import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'
import type { Plugin } from 'vite'

/* El tablero vanilla se mete adentro de la app (src/pages/roadmap/TableroLegacy.tsx) sin
   moverlo de `legacy/`: Netlify lo sigue publicando desde ahí mientras el port no esté hecho.
   En dev se sirve esa carpeta bajo `/legacy/`; en el build se copia a `dist/legacy/`.
   Lo que no es del tablero no se publica: sus tests de node y el package.json de commonjs. */
const LEGACY = path.resolve(__dirname, 'legacy')
const NO_PUBLICAR = new Set(['scripts', 'package.json'])
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
}

function servirLegacy(): Plugin {
  let salida = 'dist'
  return {
    name: 'servir-legacy',
    configResolved(c) { salida = path.resolve(c.root, c.build.outDir) },
    configureServer(server) {
      server.middlewares.use('/legacy', (req, res, next) => {
        const ruta = decodeURIComponent((req.url || '/').split('?')[0])
        const archivo = path.join(LEGACY, ruta === '/' ? 'index.html' : ruta)
        // Nada que se salga de la carpeta ni que no se publica en el build.
        const primero = path.relative(LEGACY, archivo).split(path.sep)[0]
        if (!archivo.startsWith(LEGACY + path.sep) || NO_PUBLICAR.has(primero)) return next()
        if (!fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return next()
        res.setHeader('Content-Type', TIPOS[path.extname(archivo)] || 'application/octet-stream')
        fs.createReadStream(archivo).pipe(res)
      })
    },
    closeBundle() {
      fs.cpSync(LEGACY, path.join(salida, 'legacy'), {
        recursive: true,
        filter: src => !NO_PUBLICAR.has(path.relative(LEGACY, src).split(path.sep)[0]),
      })
    },
  }
}

// Copiado del producto (propelia-frontend). El puerto es otro para poder correr los dos a la vez.
export default defineConfig({
  server: {
    port: 4100,
  },
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    servirLegacy(),
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
