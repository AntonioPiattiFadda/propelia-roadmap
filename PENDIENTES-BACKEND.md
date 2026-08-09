# Pendientes de back-end — tablero unificado

**Al 8/8/2026 no queda nada pendiente para que el tablero funcione.** Los puntos 1 a 3
están hechos y verificados contra la base; el 4 es opcional y conviene dejarlo reposar.
El archivo se conserva como registro de qué se tocó y por qué.

**Contexto en una frase:** los dos tableros que había (Propelia y Captalia) se unificaron
en uno solo, con tres personas: Lorenzo, Antonio y Luis. Diego queda fuera del sistema.

---

## 1. Correr `supabase/schema-v3.sql` — ✅ HECHO (8/8/2026)

Aplicado sobre `propelia` (`gvkdyxhxsnpumxlhvhsm`) como migración
`roadmap_schema_v3_unificacion`. Resultado verificado: las 10 tareas y la sección de
Captalia quedaron copiadas con prefijo `c-` (140 tareas y 6 temáticas en total), 117
tareas con `pend` cargado desde el viejo `resp`, y `app_miembros` quedó solo con Lorenzo
y Antonio en `propelia`. Es idempotente: se puede volver a correr sin romper nada.

Lo que hizo, en orden:

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

## 1 bis. Correr `supabase/schema-v4.sql` — ✅ HECHO (8/8/2026)

Aplicado después del anterior, como migración `roadmap_schema_v4_gastos_fijos`. Agregó a
`roadmap_caja` las columnas `repite` y `origen` para los gastos fijos: los que se repiten
todos los meses y el tablero vuelve a cargar solo.

Con esto el triangulito de aviso del encabezado ya no aparece: las tres comprobaciones
que hace `RoadmapSync.faltantesDeEsquema()` pasan.

---

## 2. Crear las cuentas en Supabase Auth — ✅ HECHO

`Authentication → Users → Add user`, una por persona, con su email real.

Las tres existen, confirmadas:

| Persona | Cuenta |
|---|---|
| Lorenzo | `lorenzopiattifadda@gmail.com` |
| Antonio | `antonio.piattifadda@gmail.com` |
| Luis | `rubioluis13@gmail.com` (programador; confirmado por Antonio el 8/8/2026) |

Ojo con esa última: en las tablas del producto figura como `agent` de «Organization
Antonio», el mismo perfil que tiene Diego, que **no** es del tablero. El perfil del
producto no dice nada sobre quién entra al roadmap — eso se confirma con una persona,
no se deduce de la base.

---

## 3. Dar acceso: `app_miembros` + `personas` del HTML — ✅ HECHO (8/8/2026)

Son **dos** cosas separadas y hacen falta las dos. Es el error más fácil de cometer acá.

**a) El acceso** lo da una fila en `app_miembros`. Sin esta fila la persona entra, ve
«Sin acceso» y no lee un solo dato — la RLS se lo impide en la base, no en la pantalla.

Las tres filas ya están cargadas (`propelia` las tres). Si algún día entra alguien más:

```sql
insert into public.app_miembros (email, proyecto)
values ('<email real, en minúscula>', 'propelia')
on conflict do nothing;
```

Los emails van **en minúscula** y tienen que coincidir exactos con los de Auth.

**b) El nombre y el color** salen del bloque `personas` en `index.html`. Ya está completo:

```js
personas: [
  { id: 'Loro', nombre: 'Lorenzo', ini: 'LO', color: '#6E6BA0', email: 'lorenzopiattifadda@gmail.com', caja: true },
  { id: 'Toni', nombre: 'Antonio', ini: 'AN', color: '#4F7F79', email: 'antonio.piattifadda@gmail.com', caja: true },
  { id: 'Luis', nombre: 'Luis',    ini: 'LU', color: '#A87A3F', email: 'rubioluis13@gmail.com' },
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
