# Pendientes de back-end — tablero unificado

Todo lo de esta lista es trabajo contra Supabase. El tablero (HTML/CSS/JS) ya está hecho
y no hay nada más que tocar del lado del front salvo el punto 3, que son tres líneas.

**Contexto en una frase:** los dos tableros que había (Propelia y Captalia) se unificaron
en uno solo, con tres personas: Lorenzo, Antonio y Luis. Diego queda fuera del sistema.

---

## 1. Correr `supabase/schema-v3.sql` — BLOQUEANTE

SQL Editor del proyecto `propelia` (`gvkdyxhxsnpumxlhvhsm`) → pegar el archivo entero →
Run. Es idempotente: se puede correr más de una vez sin romper nada.

**Hasta que esto no corra**, el tablero abre y muestra las tareas, pero al guardar falla
en todo lo nuevo. El propio tablero avisa arriba, en una franja amarilla, qué falta.

Lo que hace, en orden:

| Paso | Qué toca |
|---|---|
| 1 | Agrega a las tareas: `prioridad`, `tipo`, `hoy`, `pend` (varios responsables), `creada`. Hace `sec_id` opcional para permitir «Sin temática». Agrega `color` a las secciones. |
| 2 | Crea `roadmap_notas` (las dos hojas de la vista Visión) con su RLS y realtime. |
| 3 | Copia secciones y tareas de Captalia a las tablas `roadmap_*` con el prefijo `c-` en el id. **Nada se borra**: `captalia_*` queda intacta como respaldo. |
| 4 | Borra las membresías de `captalia` de `app_miembros` — eso también saca a Diego, que era miembro solo de ahí. Deja el bucket viejo de Captalia en solo lectura, para que los adjuntos copiados se sigan viendo. |

### Decisiones que tomé y podés revertir

- **La caja de Captalia NO se mezcla.** Son movimientos de otra plata y mezclarlos ensucia
  justo lo que se quiere tener limpio. Si igual la querés unir, hay un bloque comentado
  en el paso 3.c del SQL: descomentalo y volvé a correr el archivo.
- **Los adjuntos de Captalia no se mueven de bucket.** A cada archivo copiado se le anota
  de qué bucket sale, en la clave `b` del JSON. El tablero lee esa clave y, si no está,
  usa el bucket principal. Cero transferencia de archivos, cero enlaces rotos.

---

## 1 bis. Correr `supabase/schema-v4.sql` — BLOQUEANTE para la caja

Mismo procedimiento, después del anterior. Agrega dos columnas a `roadmap_caja`
(`repite` y `origen`) para los gastos fijos: los que se repiten todos los meses y ahora
el tablero vuelve a cargar solo.

Hasta que no corra, la caja se ve pero **no guarda ningún movimiento**, porque el
tablero manda esas dos columnas en cada alta. El triangulito del encabezado lo avisa.

---

## 2. Crear las cuentas en Supabase Auth

`Authentication → Users → Add user`, una por persona, con su email real.

Ya existen las de Lorenzo y Antonio. **Falta la de Luis.**

---

## 3. Dar acceso: `app_miembros` + `personas` del HTML

Son **dos** cosas separadas y hacen falta las dos. Es el error más fácil de cometer acá.

**a) El acceso** lo da una fila en `app_miembros`. Sin esta fila la persona entra, ve
«Sin acceso» y no lee un solo dato — la RLS se lo impide en la base, no en la pantalla.

```sql
insert into public.app_miembros (email, proyecto) values
  ('lorenzopiattifadda@gmail.com',  'propelia'),
  ('antonio.piattifadda@gmail.com', 'propelia'),
  ('luis@ejemplo.com',              'propelia')
on conflict do nothing;
```

Está al final de `schema-v3.sql`, comentado. Descomentalo con los emails reales.
Los emails van **en minúscula** y tienen que coincidir exactos con los de Auth.

**b) El nombre y el color** salen del bloque `personas` en `index.html`. Ahí hay que
completar el campo `email` de cada uno:

```js
personas: [
  { id: 'Loro', nombre: 'Lorenzo', ini: 'LO', color: '#6E6BA0', email: 'lorenzopiattifadda@gmail.com', caja: true },
  { id: 'Toni', nombre: 'Antonio', ini: 'AN', color: '#4F7F79', email: '', caja: true },  // ← falta el email
  { id: 'Luis', nombre: 'Luis',    ini: 'LU', color: '#A87A3F', email: '' },               // ← falta el email
],
```

`caja: true` marca quién participa de la caja. Solo Lorenzo y Antonio ponen plata, así
que la planilla muestra a esos dos y el saldo se reparte entre ellos. Luis usa el
tablero igual que siempre, pero no aparece en la caja.

Con el email en blanco la persona igual entra (si tiene su fila en `app_miembros`), pero
el tablero no la reconoce: no puede firmar sus mensajes en el chat ni marcarle «Lo mío».
El tablero avisa con un mensaje cuando le pasa eso a la cuenta que entró.

> **No cambiar el campo `id`.** `'Loro'` y `'Toni'` son los valores que ya están escritos
> dentro de las tareas viejas (responsable, autor de cada mensaje). Si se tocan, esas
> asignaciones y esos mensajes quedan huérfanos.

---

## 4. Opcional: limpiar Captalia una vez verificado

Después de correr el paso 1 y comprobar en el tablero que las tareas de Captalia
llegaron bien, se pueden borrar las tablas viejas. **No corras esto el mismo día** — es
lo único de toda la lista que no tiene vuelta atrás.

```sql
drop table if exists public.captalia_tareas;
drop table if exists public.captalia_secciones;
drop table if exists public.captalia_caja;
```

El bucket `captalia-adjuntos` **no se borra nunca**: ahí siguen viviendo los archivos de
las tareas copiadas.

---

## Lo que quedó afuera del tablero nuevo

Cosas que existían antes y que el diseño nuevo no tiene. Ninguna rompe nada: los datos
siguen guardados, simplemente no hay pantalla que los muestre.

- **Explicación, chat y archivos por subtarea.** Antes cada subtarea se desplegaba y tenía
  lo suyo. Ahora la subtarea es una línea: tilde, título y a quién. Lo que ya estaba
  cargado sigue en la base y no se pisa, pero no se ve ni se edita.
- **Los campos `modulo`, `img` y `com`** de las tareas. Ya casi no se usaban y el diseño
  nuevo no los contempla. Quedan guardados.

Si alguna de las dos hace falta, se agrega — decilo y lo hago.
