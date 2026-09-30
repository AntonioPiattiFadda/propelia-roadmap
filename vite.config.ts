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
