# Caja: gastos fijos y variables — plan de implementación

11/10/2026. Mock aprobado: `docs/mocks/caja-gastos.html` (abrirlo en el navegador; su `<script>` es
la referencia de comportamiento). Modelo copiado y podado de ms-frontend (Pediclick).

## Base de datos (hecho)

- `20261011164718_expenses.sql` (aplicada): tira `roadmap_caja`, crea `expense_presets` (las
  «etiquetas») y `expenses`. RLS `es_usuario()`.
- `20261011173909_expenses_reglas.sql` (**sin aplicar**, la aplica Antonio): nombre de etiqueta
  único (`lower(name)`, vivas), `expenses_fixed_paid_check` (un fijo cargado está `PAID`) y el
  índice `(preset_id, period)` restringido a fijos.

## Reglas (las decide el mock; no reinterpretar)

1. **Etiqueta = preset.** Todo gasto lleva etiqueta, también los variables. `expense_name` se copia
   de la etiqueta al crear el gasto.
2. **Fijo pendiente = mes sin fila.** Para cada etiqueta FIXED viva y cada mes que toca el rango,
   si no hay gasto vivo `(preset_id, period)`, se dibuja una fila virtual «Pendiente» con
   `default_amount`. Una etiqueta aparece desde el mes de su `created_at`. Las borradas no generan
   pendientes.
3. **Fijos cargados salen de `expenses`, no de la etiqueta**: sobreviven a que la borren o le cambien
   el tipo. Muestran su `expense_name`.
4. **En qué fecha cae una fila**: variable → `date`; fijo cargado → `date ?? dueDate(period, due_day)`;
   fijo pendiente → `dueDate(period, due_day)`. `dueDate` recorta al último día del mes (31 en
   febrero → 28/29); sin `due_day`, el 1.
5. **Cargar un fijo es pagarlo**: el alta de un fijo no tiene estado, siempre `PAID` con fecha de
   pago. `PENDING` es solo de variables.
6. **«Pagar»**: en un fijo pendiente abre el alta con etiqueta, monto habitual y período cargados;
   en un variable pendiente abre «Confirmar pago — X» (monto + fecha de pago).
7. **Switch «+ Pendientes»**: prendido de fábrica; en la URL solo apagado (`?withPending=0`). Apagado,
   lista y totales son solo `PAID`; la tarjeta «Por pagar» muestra «—» / «Pendientes ocultos».
8. **Editar etiqueta**: si cambia el nombre **y** tiene gastos, pregunta: `forward`
   (gastos con `period >= mes actual`), `all`, `none`. Solo se propaga `expense_name`. El tipo NO
   (enmienda 11/10): un gasto ya pagado como variable fue variable, y reescribirlo violaría
   `expenses_fixed_paid_check` (variables pendientes) y `expenses_preset_period_key` (varios
   variables en un mes). Cambiar solo el tipo no pregunta nada. Monto y vencimiento no se propagan.
9. **Borrar** (gasto o etiqueta) es soft delete (`deleted_at`).
10. Moneda: **EUR**, formato `es-ES`.

## Convenciones del repo (para todos los que tocan código)

- TS sin `;`, comillas simples, 2 espacios. Comentarios en español rioplatense que explican el
  porqué. Identificadores de dominio en español (como el CRM).
- `src/components/ui/` e `index.css` son copias del producto: **no tocarlos**.
- Tests co-ubicados `*.test.ts`, vitest, solo lógica pura (no hay testing-library ni jsdom).
  `types.ts` solo `import type` para que `lib/` y sus tests nunca carguen `@/lib/supabase`.
- **Correr tests** desde WSL con el node de Windows (nunca `npm`/`npx` de WSL):
  `cmd.exe /c "cd /d C:\Users\anton\Documents\programacion\propelia\propelia-roadmap && npx vitest run <ruta>"`
- **Typecheck** desde WSL: `node node_modules/typescript/bin/tsc -b`.
- Nunca `npm install` ni build. Nunca aplicar migraciones.
- Strict TDD en `lib/`: test en rojo primero, después la implementación.

## Archivos

```
src/lib/dates.ts                                   (hecho) CalendarDay, todayLocal, addDays…
src/components/datesSelectorV2/
  types.ts presets.ts urlState.ts useDatesValueParams.ts DatesSelectorV2.tsx
  presets.test.ts urlState.test.ts
src/pages/caja/
  Caja.tsx
  types.ts                 tipos de dominio con uniones literales (los generados son `string`)
  lib/periodos.ts          periodOf, dueDate, mesesDelRango, tituloDePeriodo
  lib/filas.ts             filasDelRango(gastos, etiquetas, rango, conPendientes)
  lib/resumen.ts           resumenDeFilas, subtotales por mes
  lib/monto.ts             parseMonto ('1.234,50' → 1234.5), eur(n)
  lib/etiquetas.ts         nombreRepetido, metaDeEtiqueta, cambiosDeEtiqueta, gastosAPropagar
  lib/cajaParams.ts        conPendientes + tipo desde/hacia la URL
  lib/errores.ts           mensajeDeError (23505 → textos)
  (+ un .test.ts por cada lib)
  service/caja.service.ts
  hooks/keys.ts useGastos.ts useEtiquetas.ts useCajaMutaciones.ts
  components/ ResumenCaja ListaGastos FilaGasto NuevoGastoDialog EtiquetaCombobox
              NuevaEtiquetaDialog GestionarEtiquetasDialog EditarEtiquetaDialog
              PropagarCambioDialog ConfirmarPagoDialog
```

## Tareas

### T0 — Tipos generados
Regenerar `src/types/database.types.ts` desde el proyecto `itqwxnmuxuiiydsueazb` (MCP
`generate_typescript_types`, solo lectura). El diff tiene que ser: entran `expenses` y
`expense_presets`, sale `roadmap_caja`. Typecheck verde.

### T1 — DatesSelectorV2
Copiar de `ms-frontend/src/components/admin/datesSelectorV2/` a `src/components/datesSelectorV2/`,
con el estilo del repo. Imports de fechas → `@/lib/dates`. Colores fijos de Pediclick → tokens:
`#1e3a8a` → `--brand-700`/`primary`, `#e9eefb` → `--brand-soft`, `#bfceef` → `--brand-200`; el
naranja del paso 2 queda. Traer `datesSelectorV2Presets.test.ts` y `datesSelectorV2UrlState.test.ts`
de `ms-frontend/src/tests/unit/` como `presets.test.ts` / `urlState.test.ts` (los de componente y
hook usan testing-library: no se traen).

### T2 — Lógica pura de la Caja (TDD)
`types.ts` + todo `lib/` con sus tests, siguiendo las reglas 1–10. `filasDelRango` es la pieza
central: casos mínimos — pendiente virtual, fijo pagado que sobrevive a etiqueta borrada, etiqueta
creada después del mes, `dueDate` 31 de febrero, rango de un día, varios meses, `conPendientes`
apagado, orden (fecha desc, nombre asc).

### T3 — Servicio y hooks
Servicio: traer gastos vivos con `period` entre el mes anterior al `from` y el posterior al `to`
(un fijo puede pagarse en otro mes que su período) y filtrar con `filasDelRango`; traer todas las
etiquetas (también borradas: un gasto viejo lee su vencimiento). Mutaciones: crear gasto, confirmar
pago, borrar gasto, crear/editar/borrar etiqueta, propagar. Errores con `throw`, sin try/catch,
como `crm.service.ts`. Hooks con `CAJA_KEYS` bajo el prefijo `['caja']`, toasts con sonner,
invalidación por prefijo.

### T4 — Pantalla
`Caja.tsx` con cabecera (título, «Etiquetas», «+ Nuevo gasto»), selector (modos Día y Rango,
arranca en «Este mes entero» vía `useDatesValueParams`), resumen, barra (Todos/Fijos/Variables,
switch, rango), lista y los dialogs. Componentes shadcn de `src/components/ui/`. Teléfono incluido.
