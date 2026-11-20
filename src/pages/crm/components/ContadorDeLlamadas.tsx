import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarCheckIcon, CalendarDaysIcon, ChartColumnIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CirclePauseIcon, ClockAlertIcon, ClockIcon,
  ContactIcon, HandshakeIcon, InfoIcon, MailIcon, PercentIcon, PhoneCallIcon, PhoneIcon, PhoneMissedIcon, SmartphoneIcon,
  SparklesIcon, SproutIcon, TargetIcon, UserCheckIcon, UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { localTodayIso, shiftIsoDate } from '@/lib/calendarDate'
import { cn } from '@/lib/utils'
import { AvatarUsuario } from '@/components/AvatarUsuario'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Explicacion, type Explicado } from './Explicacion'
import { useCarteras } from '../hooks/useCarteras'
import { useCommits, useGuardarCommit } from '../hooks/useCommits'
import { useCrmCatalogos } from '../hooks/useCrmCatalogos'
import { useCrmLeads, useTareasPendientes } from '../hooks/useCrmLeads'
import { useDiaDeObjetivos, useHaciaLaProximaDemo, useMinutosSinLlamar, useObjetivos, useObjetivosDeVarios, usePersonaDeObjetivos } from '../hooks/useObjetivos'
import { haceCuanto, horasYMinutos, tonoSinLlamar } from '../lib/minutosSinLlamar'
import { useVerComo } from '../hooks/useVerComo'
import { commitDelPeriodo, esDiaHabil, tonoDelCommit, type CampoDeCommit, type Commits } from '../lib/commits'
import { escribirFiltros, filtrosDesdeUrl } from '../lib/leadFilterParams'
import { hitoAlcanzado, mensajeDePropelin } from '../lib/propelin'
import { ConGloboDelRitmo, useRitmoDelDia } from './RitmoDelDia'
import {
  diasHaciaAtras, LLAMADAS_POR_DEMO, mesesHaciaAtras, NUTRICION_DE_LA_CUENTA, nutricionDeLaCuenta, pendientesDePersona,
  progresoHaciaDemo, semanasHaciaAtras, sumarResumenes, tasaDeDecisor, tituloDeObjetivos,
  type HaciaLaProximaDemo as DatosHaciaDemo, type Objetivo, type PeriodoDeObjetivos, type TonoDeProgreso,
} from '../lib/objetivos'
import { esSuperadmin, puedeVerComo } from '../lib/permisos'
import type { Usuario } from '../types'

/* Qué es cada número y de dónde sale (5/11/2026, por pedido): tocar el encabezado en el diálogo lo
   explica. Si cambia una consulta de `useObjetivos` / `crm.service`, cambia el texto acá. */

const LLAMADAS_DE_LA_PERSONA = 'Tabla crm_comments: las actividades escritas a mano (comment_type = MANUAL, sin borrar) que registró la persona (created_by) en el período (created_at), con la meta de la actividad (long_description que empieza con <!--act-->)'

type Columna = Explicado & { k: Objetivo; enGrupo?: true }

// «No respondidas» va primera, a la izquierda (17/10/2026, por pedido), en el contador y en el diálogo.
const COLUMNAS: Columna[] = [
  {
    k: 'noRespondidas', label: 'No respondidas', title: 'Llamadas que nadie atendió',
    explicacion: 'Cada «Contacto fallido» que registraste: llamaste y nadie atendió. Cuenta llamadas, no inmobiliarias: tres intentos al mismo lead son tres.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada y resultado no_respondida.`,
  },
  {
    k: 'contestadas', label: 'Contestadas', title: 'Llamadas en las que hablaste con alguien de la inmobiliaria',
    explicacion: 'Cada «Llamada» registrada: alguien de la inmobiliaria atendió, decida o no. Cuenta llamadas.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada y resultado contestada.`,
  },
  // «Nutrición de la cuenta» va a la izquierda de «Con decisor» (18/11/2026, por pedido): sus cuatro
  // columnas van seguidas y se ven solo con el grupo desplegado (`piezas`).
  {
    k: 'presentaciones', enGrupo: true, label: 'Mails de presentación', title: 'Mails «Presentación con vídeo» enviados',
    explicacion: 'Mails «Presentación con vídeo» que mandaste desde «Mensajes» del lead. No cuentan los que no salieron (falló el envío o la dirección estaba suprimida).',
    fuente: 'Tabla crm_emails: plantilla = presentacion-video, enviados por la persona (sent_by) en el período (sent_at), sin status failed ni suppressed.',
  },
  {
    k: 'nombresDecisor', enGrupo: true, label: 'Nombres de decisores conseguidos', title: 'Actividades en las que apuntaste el nombre del decisor',
    explicacion: 'Cada llamada o nota registrada con «Nombre del decisor conseguido» en Sí y el nombre escrito. Cuenta actividades, no inmobiliarias: dos en el mismo lead son dos.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada o nota y con decisorApuntado escrito en la meta.`,
  },
  {
    k: 'telefonosDecisor', enGrupo: true, label: 'Teléfonos de decisores conseguidos', title: 'Actividades en las que apuntaste el teléfono del decisor',
    explicacion: 'Cada llamada o nota registrada con «Teléfono del decisor conseguido» en Sí y el número escrito. Cuenta actividades, no inmobiliarias.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada o nota y con telefonoDecisor escrito en la meta.`,
  },
  // El horario en que se encuentra al decisor (18/11/2026, por pedido): la cuarta del grupo.
  {
    k: 'horariosDecisor', enGrupo: true, label: 'Horarios del decisor conseguidos', title: 'Actividades en las que apuntaste el horario en que se encuentra al decisor',
    explicacion: 'Cada llamada o nota registrada con «Horario del decisor conseguido» en Sí y el horario escrito (texto libre: «martes y jueves de 10 a 12»). Cuenta actividades, no inmobiliarias.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada o nota y con horarioDecisor escrito en la meta.`,
  },
  {
    k: 'decisores', label: 'Con decisor', title: 'De las contestadas, en cuántas hablaste con alguien que decide',
    explicacion: 'De las contestadas, las que se registraron con «¿Es decisor?» en Sí (o con alguien que el perfil ya marca como decisor). Cuenta llamadas.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, de tipo llamada, resultado contestada y decisor = true en la meta.`,
  },
  {
    k: 'decisoresNuevos', label: 'Decisores nuevos', title: 'Llamadas en las que hablaste por primera vez con un decisor: con quien ya había hablado alguien del equipo no cuenta',
    explicacion: 'De las llamadas con decisor, aquellas en las que se habló con un decisor con quien nadie del equipo había hablado antes en ese lead (se compara por nombre). Sin nombre, cuenta solo si el lead nunca había tenido una llamada con decisor.',
    fuente: `${LLAMADAS_DE_LA_PERSONA}, con decisor, comparadas contra todas las actividades anteriores de esos leads en crm_comments, de cualquier persona.`,
  },
  {
    k: 'demos', label: 'Demos agendadas', title: 'Demos que agendaste (cuenta el día en que se agendaron, no para cuándo son)',
    explicacion: 'Reuniones que agendaste en el período. Cuenta el día en que se agendaron, no el día de la demo.',
    fuente: 'Tabla crm_meetings: creadas por la persona (created_by) en el período (created_at), sin borrar.',
  },
]

const TASA: Explicado = {
  label: 'Decisor por contactado',
  title: 'De las inmobiliarias que contestaron, en cuántas se habló con un decisor',
  explicacion: 'De las inmobiliarias que contestaron una llamada en el período, qué parte terminó en una llamada con un decisor. Cuenta inmobiliarias y no llamadas: dos llamadas al mismo lead son una. Ejemplo: 10 inmobiliarias contestaron y en 4 se habló con un decisor = 40 %. Con varias personas, la misma inmobiliaria cuenta una vez.',
  fuente: `Las mismas llamadas de «Contestadas» y «Con decisor» (${LLAMADAS_DE_LA_PERSONA}), contando inmobiliarias distintas (lead_id): las de «Con decisor» dividido las de «Contestadas».`,
}

const NUTRICION: Explicado = {
  label: 'Nutrición de la cuenta',
  title: 'Mails de presentación, nombres, teléfonos y horarios de decisores conseguidos, sumados',
  explicacion: 'Lo que se consiguió de la cuenta además de hablar: la suma de «Mails de presentación», «Nombres de decisores conseguidos», «Teléfonos de decisores conseguidos» y «Horarios del decisor conseguidos». Tocalo para desplegar o plegar los cuatro; cada uno filtra la lista, el grupo no.',
  fuente: 'La suma de las cuatro columnas del grupo: crm_emails (presentacion-video) y la meta de las actividades en crm_comments (decisorApuntado, telefonoDecisor y horarioDecisor).',
}

/* «Minutos sin llamar» (19/11/2026, por pedido): primera tarjeta, solo en el contador del día. No
   filtra (no es un conjunto de leads): tocarla la explica, como la tasa. */
const SIN_LLAMAR: Explicado = {
  label: 'Minutos sin llamar',
  title: 'Tiempo en horario sin llamar, en baches de 15 minutos o más',
  explicacion: 'Los minutos en horario (10 a 14 y 15 a 19, hora de España) en que pasaron 15 minutos o más sin llamar, sumados (cada bache redondeado a minutos). Sale de Aircall: lo calcula un proceso que corre a las 19:05 de lunes a viernes, así que durante el día se ve «–». Se escribe en horas y minutos: 1:05 es una hora y cinco minutos. El círculo va en verde con menos de 30 minutos, en amarillo hasta una hora y en rojo con más.',
  fuente: 'Tabla crm_call_gaps (min_sin_llamar y baches) de la persona y el día de hoy en España. La carga el cron de Aircall por el conector MCP (save_call_gaps).',
}

/** El orden en que se dibujan las columnas: el grupo entra antes de su primera columna, y las
 *  suyas solo con el grupo desplegado. */
const GRUPO = 'nutricion'
/* Desplegado, el grupo se ve como tal (18/11/2026, por pedido): las cuatro suyas van teñidas de la
   marca y el grupo, el padre, lleva además el borde. Mismos tokens en claro y en oscuro. */
const TINTE_SUB = 'bg-(--brand-soft)/45'
const TINTE_GRUPO = 'bg-(--brand-soft) [box-shadow:inset_0_0_0_1px_var(--brand-200)]'
/** Las celdas de la tabla: el grupo abre con un riel a la izquierda y las suyas siguen teñidas. */
const celdaDeGrupo = (abierto: boolean) => cn(abierto && 'bg-(--brand-soft)/80 [border-left:2px_solid_var(--brand)]')
const celdaSub = (c: Columna) => cn(c.enGrupo && TINTE_SUB)
function piezas(desplegado: boolean): (Columna | typeof GRUPO)[] {
  return COLUMNAS.flatMap(c => [
    ...(c.k === NUTRICION_DE_LA_CUENTA[0] ? [GRUPO] as const : []),
    ...(c.enGrupo && !desplegado ? [] : [c]),
  ])
}

/** La tasa va pegada después de esta columna, en el contador y en el diálogo. */
const TRAS: Objetivo = 'decisores'

/* Los commits (16/11/2026, por pedido): solo en el diálogo, cada uno pegado después de la columna
   real con la que se compara. Verde si se alcanzó, rojo si no. Reglas en `lib/commits.ts`. */
const COMMIT_DE: Partial<Record<Objetivo, Explicado & { campo: CampoDeCommit }>> = {
  contestadas: {
    campo: 'contestadas', label: 'Commit contestadas', title: 'Las llamadas contestadas que se comprometió a hacer',
    explicacion: 'Cuántas llamadas contestadas se comprometió a hacer por día. Vale desde el día en que se pone hasta que se cambia, solo de lunes a viernes; en semanas y meses es la suma de cada día hábil hasta hoy. Verde si «Contestadas» lo alcanzó, rojo si no. Lo pone un SUPERADMIN tocando la celda en la escala «Días».',
    fuente: 'Tabla roadmap_notas, fila crm-commits (un JSON por persona y día), contra la columna «Contestadas».',
  },
  demos: {
    campo: 'demos', label: 'Commit demos', title: 'Las demos que se comprometió a agendar',
    explicacion: 'Cuántas demos se comprometió a agendar por día. Vale desde el día en que se pone hasta que se cambia, solo de lunes a viernes; en semanas y meses es la suma de cada día hábil hasta hoy. Verde si «Demos agendadas» lo alcanzó, rojo si no. Lo pone un SUPERADMIN tocando la celda en la escala «Días».',
    fuente: 'Tabla roadmap_notas, fila crm-commits (un JSON por persona y día), contra la columna «Demos agendadas».',
  },
}
/** Cuántas columnas suma el diálogo además de `COLUMNAS`: la tasa y los commits. */
const EXTRAS = 1 + Object.keys(COMMIT_DE).length

const porciento =(t: ReturnType<typeof tasaDeDecisor> | undefined) => (
  t ? <span className="tabular-nums" title={`${t.conDecisor} de ${t.contestadas} inmobiliarias`}>
    {t.tasa === null ? '–' : `${Math.round(t.tasa * 100)} %`}
    <span className="ml-1 text-[11px] font-normal text-(--fg-muted)">{t.conDecisor}/{t.contestadas}</span>
  </span> : numero(undefined)
)

/** El «4/10» de la tasa, debajo de su círculo en la tabla (adentro no entra). */
const fraccionDeTasa = (t: ReturnType<typeof tasaDeDecisor> | undefined) => (
  t ? <span className="text-[11px] leading-none text-(--fg-muted) tabular-nums">{t.conDecisor}/{t.contestadas}</span> : null
)

const numero = (n: number | undefined) => (
  <span className={cn('tabular-nums', n === undefined && 'text-(--fg-faint)')}>{n ?? '–'}</span>
)

const ICONOS: Record<Objetivo, LucideIcon> = {
  noRespondidas: PhoneMissedIcon,
  contestadas: PhoneCallIcon,
  decisores: UserCheckIcon,
  decisoresNuevos: SparklesIcon,
  presentaciones: MailIcon,
  nombresDecisor: ContactIcon,
  telefonosDecisor: SmartphoneIcon,
  horariosDecisor: ClockIcon,
  demos: CalendarCheckIcon,
}

const TONOS: Record<TonoDeProgreso, { caja: string; barra: string; texto: string }> = {
  rojo: { caja: 'bg-(--danger-soft) [border-color:color-mix(in_oklab,var(--danger)_30%,transparent)]', barra: 'bg-(--danger)', texto: 'text-(--danger-fg)' },
  amarillo: { caja: 'bg-(--warning-soft) [border-color:color-mix(in_oklab,var(--warning)_35%,transparent)]', barra: 'bg-(--warning)', texto: 'text-(--warning-fg)' },
  verde: { caja: 'bg-(--success-soft) [border-color:color-mix(in_oklab,var(--success)_35%,transparent)]', barra: 'bg-(--success)', texto: 'text-(--success-fg)' },
}

/* Lo que registré HOY: llamadas por resultado, decisores, mails de presentación y demos, en
   tarjetas. Fue «Objetivos hoy», del 17/10/2026 al 16/11/2026 «Objetivos semanales» (desde el
   lunes) y volvió a ser del día, más visual (16/11/2026, por pedido). Cada tarjeta es un botón:
   filtra la lista a esos leads (`?objetivo=`, también del día) y otro clic lo saca. «Comparar»
   abre el diálogo de semanas y personas. Al lado, la barra hacia la próxima demo estadística.
   Desde el 18/11/2026 (por pedido) las flechas del título van a días anteriores
   (`?objetivosDia=`, `useDiaDeObjetivos`): cambian las tarjetas y lo que filtra cada una, no la
   barra hacia la próxima demo, que no es del día. */
export function ContadorDeLlamadas() {
  const [abierto, setAbierto] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const elegido = filtrosDesdeUrl(searchParams).objetivo
  const { data, isError } = useObjetivos()
  const { dia, esHoy, hoy, irA } = useDiaDeObjetivos()
  const titulo = tituloDeObjetivos(dia, hoy)
  const { personaId, elegibles, elegir } = usePersonaDeObjetivos()
  const haciaDemo = useHaciaLaProximaDemo(personaId)
  // El ritmo del día (19/11/2026, por pedido): «Contestadas» va en verde, amarillo o rojo.
  const ritmo = useRitmoDelDia(data?.resumen.contestadas, dia, esHoy)
  const sinLlamar = useMinutosSinLlamar(personaId, esHoy ? undefined : dia)
  const calculado = haceCuanto(sinLlamar.data?.updated_at)
  // Nace plegado, salvo que la URL ya filtre por uno de los suyos (un enlace viejo a
  // `?objetivo=presentaciones`): si no, la tarjeta prendida quedaría escondida.
  const [nutricionAbierta, setNutricionAbierta] = useState(
    () => (NUTRICION_DE_LA_CUENTA as readonly Objetivo[]).includes(elegido ?? 'demos'),
  )
  if (isError) return null

  const alternar = (k: Objetivo) =>
    setSearchParams(prev => escribirFiltros(prev, { objetivo: elegido === k ? null : k }), { replace: true })

  return (
    <>
      <section aria-label={titulo}
        className="rounded-xl bg-card p-2.5 [border:1px_solid_var(--line)]">
        <div className="mb-2 flex flex-wrap items-center gap-2 px-0.5">
          <h2 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
            <TargetIcon className="size-3.5 text-(--brand)" aria-hidden />{titulo}
          </h2>
          {/* Las flechas del día (18/11/2026, por pedido): sutiles, para no competir con el título.
              No hay mañana: la de adelante se apaga en hoy. */}
          <div className="-ml-1 flex items-center">
            <button type="button" aria-label="Día anterior" title="Día anterior" onClick={() => irA(shiftIsoDate(dia, -1))}
              className="grid size-5 cursor-pointer place-items-center rounded-full text-(--fg-faint) transition-colors hover:bg-(--surface-2) hover:text-(--fg-2)">
              <ChevronLeftIcon className="size-3.5" aria-hidden />
            </button>
            <button type="button" aria-label="Día siguiente" title={esHoy ? 'Ya estás en hoy' : 'Día siguiente'}
              disabled={esHoy} onClick={() => irA(shiftIsoDate(dia, 1))}
              className="grid size-5 cursor-pointer place-items-center rounded-full text-(--fg-faint) transition-colors hover:bg-(--surface-2) hover:text-(--fg-2) disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--fg-faint)">
              <ChevronRightIcon className="size-3.5" aria-hidden />
            </button>
          </div>
          {/* De quién (17/11/2026, por pedido): solo si veo a alguien más. Cambia las tarjetas, la
              barra hacia la próxima demo y lo que filtra cada tarjeta. */}
          {elegibles.length > 1 && (
            <div role="radiogroup" aria-label="De quién" className="flex flex-wrap items-center gap-1">
              {elegibles.map(u => (
                <button key={u.id} type="button" role="radio" aria-checked={personaId === u.id}
                  onClick={() => elegir(u.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] transition-colors [border:1px_solid_var(--line)]',
                    personaId === u.id
                      ? 'bg-(--brand) font-semibold text-white [border-color:var(--brand)]'
                      : 'bg-card text-(--fg-2) hover:text-foreground hover:[border-color:var(--brand-200)]',
                  )}>
                  <AvatarUsuario usuario={u} />{u.nombre}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-[12px]" onClick={() => setAbierto(true)}
            title="Comparar días, semanas y personas">
            <ChartColumnIcon className="size-3.5" />Comparar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 lg:flex-nowrap">
          <div role="group" aria-label={esHoy ? 'Lo registrado hoy' : `Lo registrado el ${dia}`}
            className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(96px,1fr))] justify-items-center gap-2">
            <Explicacion c={SIN_LLAMAR} align="start" className={TARJETA}>
              {/* Debajo del nombre, hace cuánto lo calculó el cron (19/11/2026, por pedido). */}
              <ContenidoDeTarjeta icono={CirclePauseIcon} tono={tonoSinLlamar(sinLlamar.data?.min_sin_llamar)} label={<>
                {SIN_LLAMAR.label}
                {calculado && (
                  <span className="block text-[10.5px] text-(--fg-muted)"
                    title={`Último cálculo: ${new Date(sinLlamar.data!.updated_at).toLocaleString()}`}>
                    calculado {calculado}
                  </span>
                )}
              </>}>
                <span className={cn('tabular-nums', !sinLlamar.data && 'text-(--fg-faint)')}
                  title={sinLlamar.data
                    ? `${sinLlamar.data.min_sin_llamar} min en ${sinLlamar.data.baches} ${sinLlamar.data.baches === 1 ? 'bache' : 'baches'}`
                    : esHoy ? 'Todavía sin dato: se carga a las 19:05' : 'Sin dato para ese día'}>
                  {horasYMinutos(sinLlamar.data?.min_sin_llamar)}
                </span>
              </ContenidoDeTarjeta>
            </Explicacion>
            {piezas(nutricionAbierta).map(c => c === GRUPO ? (
              // El grupo no filtra (16 leads de cuatro orígenes no son una pregunta): despliega los suyos.
              <button key="nutricion" type="button" aria-expanded={nutricionAbierta}
                title={`${NUTRICION.title}. Tocá para ${nutricionAbierta ? 'plegar' : 'ver'} el detalle.`}
                onClick={() => setNutricionAbierta(a => !a)} className={cn(TARJETA, nutricionAbierta && TINTE_GRUPO)}>
                <ContenidoDeTarjeta icono={SproutIcon} label={<>
                  {NUTRICION.label}
                  <ChevronDownIcon aria-hidden className={cn('ml-0.5 inline size-3 transition-transform', !nutricionAbierta && '-rotate-90')} />
                </>}>
                  {numero(data ? nutricionDeLaCuenta(data.resumen) : undefined)}
                </ContenidoDeTarjeta>
              </button>
            ) : (
              <Fragment key={c.k}>
                {c.k === 'contestadas' ? (
                  // Propelin explica el color al pasar el cursor: sin `title`, que taparía el globo.
                  <ConGloboDelRitmo estado={ritmo} contestadas={data?.resumen.contestadas}>
                    <Tarjeta icono={ICONOS[c.k]} label={c.label} activo={elegido === c.k} className={celdaSub(c)}
                      tono={ritmo?.color} title={ritmo ? undefined : `${c.title}. Tocá para ver esos leads.`}
                      onClick={() => alternar(c.k)}>
                      {numero(data?.resumen[c.k])}
                    </Tarjeta>
                  </ConGloboDelRitmo>
                ) : (
                <Tarjeta icono={ICONOS[c.k]} label={c.label} activo={elegido === c.k} className={celdaSub(c)}
                  title={elegido === c.k ? 'Quitar el filtro' : `${c.title}. Tocá para ver esos leads.`}
                  onClick={() => alternar(c.k)}>
                  {numero(data?.resumen[c.k])}
                </Tarjeta>
                )}
                {/* La tasa no filtra (no es un conjunto de leads): tocarla la explica. */}
                {c.k === TRAS && (
                  <Explicacion c={TASA} align="start" className={TARJETA}>
                    <ContenidoDeTarjeta icono={PercentIcon} label={TASA.label}>
                      {porciento(data ? tasaDeDecisor([data]) : undefined)}
                    </ContenidoDeTarjeta>
                  </Explicacion>
                )}
              </Fragment>
            ))}
          </div>
          {/* Con `key`: cambiar de persona no festeja un hito que no se alcanzó. */}
          <HaciaLaProximaDemo key={personaId ?? ''} datos={haciaDemo.isError ? undefined : haciaDemo.data} />
        </div>
      </section>
      {abierto && <ObjetivosDialog onClose={() => setAbierto(false)} />}
    </>
  )
}

/* Cada objetivo es un círculo (16/11/2026, por pedido): el ícono y el número adentro y el nombre
   debajo. Elegido, el círculo se llena del color de la marca. */
const TARJETA = 'group flex cursor-pointer flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center'

/* El círculo de un objetivo, compartido por las tarjetas y el diálogo «Comparar» (18/11/2026, por
   pedido: la tabla lleva el mismo diseño). `compacto` es el de la tabla; `tono`, el verde o rojo de
   un commit o el semáforo de «Sin llamar»; `hover`, si reacciona al `group` de afuera (en la tabla el `group` es la fila). */
const TONOS_DEL_CIRCULO = {
  verde: 'bg-(--success-soft) text-(--success-fg) [border-color:color-mix(in_oklab,var(--success)_45%,transparent)]',
  amarillo: 'bg-(--warning-soft) text-(--warning-fg) [border-color:color-mix(in_oklab,var(--warning)_55%,transparent)]',
  rojo: 'bg-(--danger-soft) text-(--danger-fg) [border-color:color-mix(in_oklab,var(--danger)_40%,transparent)]',
} as const

function Circulo({ icono: Icono, activo = false, compacto = false, tono, hover = true, className, children }: {
  icono?: LucideIcon; activo?: boolean; compacto?: boolean; tono?: keyof typeof TONOS_DEL_CIRCULO; hover?: boolean
  className?: string; children: React.ReactNode
}) {
  return (
    <span className={cn(
      'grid shrink-0 place-items-center content-center gap-0.5 rounded-full transition-all [border:2px_solid]',
      compacto ? 'size-[46px]' : 'size-[72px]',
      activo
        ? 'bg-(--brand) text-white [border-color:var(--brand)] shadow-(--shadow-md)'
        : tono ? TONOS_DEL_CIRCULO[tono] : 'bg-(--surface-2) text-foreground [border-color:var(--brand-200)]',
      !activo && hover && 'group-hover:[border-color:var(--brand)] group-hover:shadow-(--shadow-sm)',
      className,
    )}>
      {Icono && <Icono className={cn(compacto ? 'size-3' : 'size-3.5', activo ? 'text-white/85' : 'text-(--brand)')} aria-hidden />}
      {/* En el círculo no entra el «4/10» de la tasa: queda en el title (en la tabla, debajo). */}
      <span className={cn('leading-none font-semibold tabular-nums [&_span]:text-inherit [&_span_span]:hidden',
        compacto ? 'text-[14px]' : 'text-[20px]')}>{children}</span>
    </span>
  )
}

function ContenidoDeTarjeta({ icono, label, activo = false, tono, children }: {
  icono: LucideIcon; label: React.ReactNode; activo?: boolean; tono?: keyof typeof TONOS_DEL_CIRCULO | null; children: React.ReactNode
}) {
  return (
    <>
      <Circulo icono={icono} activo={activo} tono={tono ?? undefined}>{children}</Circulo>
      <span className={cn('max-w-[96px] text-[11.5px] leading-tight', activo ? 'font-semibold text-(--brand)' : 'text-(--fg-2)')}>{label}</span>
    </>
  )
}

function Tarjeta({ icono, label, activo, title, tono, onClick, className, children }: {
  icono: LucideIcon; label: string; activo: boolean; title?: string; tono?: keyof typeof TONOS_DEL_CIRCULO
  onClick: () => void; className?: string; children: React.ReactNode
}) {
  return (
    <button type="button" aria-pressed={activo} title={title} onClick={onClick} className={cn(TARJETA, className)}>
      <ContenidoDeTarjeta icono={icono} label={label} activo={activo} tono={tono}>{children}</ContenidoDeTarjeta>
    </button>
  )
}

/* Cada `LLAMADAS_POR_DEMO` llamadas sale una demo (16/11/2026, por pedido): la barra muestra cuánto
   falta para la próxima, contando desde la última demo agendada. Desde el 17/11/2026 (por pedido)
   no se reinicia con el día: solo agendar una demo la vuelve a cero (`useHaciaLaProximaDemo`).
   Rojo sutil al arrancar, amarillo pasada la mitad y verde llegando. Desde el 17/11/2026 (por
   pedido) cuenta solo contestadas, son 70, y tocarla dice cuándo fue la última demo y de qué días
   son las llamadas acumuladas. */
function HaciaLaProximaDemo({ datos }: { datos: DatosHaciaDemo | undefined }) {
  const llamadas = datos?.contestadas
  const p = progresoHaciaDemo(llamadas ?? 0)
  const t = TONOS[p.tono]
  const cargando = llamadas === undefined
  const festejo = useFestejoDePropelin(llamadas)
  return (
    <div className="relative w-full lg:w-[260px] lg:shrink-0">
    {festejo.texto && <GloboDePropelin key={festejo.id} texto={festejo.texto} onCerrar={festejo.cerrar} />}
    <Popover>
    <PopoverTrigger asChild>
    <button type="button" aria-label="Hacia la próxima demo: ver el detalle"
      title="Tocá para ver cuándo fue la última demo y de qué días son las llamadas"
      className={cn('flex h-full w-full cursor-pointer flex-col justify-between gap-1.5 rounded-lg px-3 py-2 text-left transition-colors [border:1px_solid]', t.caja)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('flex items-center gap-1.5 text-[11.5px] font-semibold', t.texto)}>
          <PhoneIcon className="size-3.5" aria-hidden />Hacia la próxima demo
        </span>
        {p.deMas > 0 && (
          <span className={cn('rounded-full bg-card px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', t.texto)}
            title="Llamadas de más desde que la barra se llenó, todavía sin demo">
            +{p.deMas}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[22px] leading-none font-semibold tabular-nums text-foreground">{cargando ? '–' : p.enCiclo}</span>
        <span className="text-[13px] text-(--fg-muted) tabular-nums">/ {LLAMADAS_POR_DEMO} contestadas</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-card" role="progressbar"
        aria-valuemin={0} aria-valuemax={LLAMADAS_POR_DEMO} aria-valuenow={p.enCiclo}>
        <div className={cn('h-full rounded-full transition-[width,background-color] duration-500', t.barra)}
          style={{ width: `${Math.round(p.fraccion * 100)}%` }} />
      </div>
      <span className="text-[11.5px] text-(--fg-2)">
        {cargando ? ' ' : p.faltan === 0 ? '¡Demo a la vista! Seguí así.' : `Faltan ${p.faltan} ${p.faltan === 1 ? 'contestada' : 'contestadas'}`}
      </span>
    </button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-72 text-[13px]">
      <DetalleHaciaDemo datos={datos} />
    </PopoverContent>
    </Popover>
    </div>
  )
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
const DIA_CORTO = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

function DetalleHaciaDemo({ datos }: { datos: DatosHaciaDemo | undefined }) {
  if (!datos) return <p className="text-(--fg-muted)">Cargando…</p>
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-(--fg-2)">
        Estadísticamente, cada {LLAMADAS_POR_DEMO} llamadas contestadas se agenda una demo. Solo agendar una vuelve el contador a cero.
      </p>
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-(--fg-muted)">Demo anterior</p>
        <p className="font-medium first-letter:uppercase">
          {datos.desde ? FECHA_LARGA.format(new Date(datos.desde)) : 'Todavía no agendaste ninguna'}
        </p>
      </div>
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-(--fg-muted)">Contestadas acumuladas</p>
        {datos.porDia.length === 0
          ? <p className="text-(--fg-muted)">Ninguna desde entonces.</p>
          : (
            <ul className="mt-1 flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {datos.porDia.map(d => (
                <li key={d.dia} className="flex justify-between gap-2 tabular-nums">
                  <span className="first-letter:uppercase">{DIA_CORTO.format(new Date(`${d.dia}T12:00:00`))}</span>
                  <span className="font-semibold">{d.n}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  )
}

/** Cada 10 llamadas, un mensaje de Propelin (`hitoAlcanzado`). Se va solo a los 7 s. */
function useFestejoDePropelin(llamadas: number | undefined) {
  const vistas = useRef<number | undefined>(undefined)
  const [festejo, setFestejo] = useState<{ id: number; texto: string } | null>(null)
  useEffect(() => {
    const hito = hitoAlcanzado(vistas.current, llamadas)
    if (llamadas !== undefined) vistas.current = llamadas
    if (hito === null || llamadas === undefined) return
    const faltan = progresoHaciaDemo(llamadas).faltan
    // Sincroniza con un dato que llega de afuera (las llamadas registradas): por eso va en un efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFestejo(prev => ({ id: hito, texto: mensajeDePropelin(hito, faltan, Math.random, prev?.texto) }))
  }, [llamadas])
  useEffect(() => {
    if (!festejo) return
    const t = setTimeout(() => setFestejo(null), 7000)
    return () => clearTimeout(t)
  }, [festejo])
  return { id: festejo?.id ?? 0, texto: festejo?.texto ?? null, cerrar: () => setFestejo(null) }
}

/** El robot con su globo, colgado debajo de la barra «Hacia la próxima demo». */
function GloboDePropelin({ texto, onCerrar }: { texto: string; onCerrar: () => void }) {
  return (
    <div role="status" aria-live="polite"
      className="absolute top-full right-0 z-30 mt-2 flex w-[300px] items-end gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
      <img src="/propelia-bot.webp" alt="Propelin" className="size-14 shrink-0 animate-hero-float drop-shadow-md" />
      <div className="relative flex-1 rounded-2xl rounded-bl-sm bg-card px-3.5 py-2.5 text-[13px] leading-snug text-foreground shadow-(--shadow-md) [border:1px_solid_var(--brand-200)]">
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="absolute -top-2 -right-2 grid size-5 cursor-pointer place-items-center rounded-full bg-card text-[11px] text-(--fg-muted) shadow-(--shadow-sm) [border:1px_solid_var(--line)] hover:text-foreground">
          ✕
        </button>
        <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-(--brand)">Propelin</span>
        {texto}
      </div>
    </div>
  )
}

type Escala = 'dia' | 'semana' | 'mes'
/** Las escalas del diálogo: cuántos períodos se ven a la vez (las flechas saltan de a tantos). */
const ESCALAS: Record<Escala, { label: string; aLaVez: number; haciaAtras: (hoy: string, n: number, saltar?: number) => PeriodoDeObjetivos[] }> = {
  dia: { label: 'Días', aLaVez: 7, haciaAtras: diasHaciaAtras },
  semana: { label: 'Semanas', aLaVez: 6, haciaAtras: semanasHaciaAtras },
  mes: { label: 'Meses', aLaVez: 6, haciaAtras: mesesHaciaAtras },
}

const clave = (p: PeriodoDeObjetivos) => `${p.desde}_${p.hasta}`

/* El diálogo de Objetivos (4/11/2026, por pedido): grande, para comparar. Se eligen uno o varios
   períodos (hoy, el mes o cualquier semana, con flechas hacia atrás) y, quien ve otras carteras,
   una o varias personas. Con varias, cada período lleva una fila por persona y el total. Abajo, lo
   que cada una tiene pendiente ahora. Desde el 16/11/2026 (por pedido) se compara por escala —varios
   días, varias semanas o varios meses— y se monta al abrir en «Hoy» con todos los comerciales que
   veo. Los números de otro salen de lo que la RLS me deja leer, como «Ver como». */
function ObjetivosDialog({ onClose }: { onClose: () => void }) {
  const hoy = localTodayIso()
  const { yo, usuarios, accesos } = useCarteras()
  const { perspectivaId } = useVerComo()
  const commits = useCommits().data
  const guardarCommit = useGuardarCommit()
  const editaCommits = esSuperadmin(yo)

  const elegibles = useMemo(() => {
    const otros = puedeVerComo(yo, usuarios, accesos)
    return yo ? [yo as Usuario, ...otros] : otros
  }, [yo, usuarios, accesos])
  const [personasIds, setPersonasIds] = useState<string[] | null>(null)
  // De entrada, todos los comerciales que veo (16/11/2026, por pedido); sin cargar todavía, el «yo».
  const porDefecto = elegibles.length > 0 ? elegibles.map(u => u.id) : (perspectivaId ? [perspectivaId] : [])
  const personas = (personasIds ?? porDefecto)
    .map(id => usuarios.find(u => u.id === id)).filter((u): u is Usuario => !!u)

  // Se compara dentro de una escala (16/11/2026, por pedido): varios días, varias semanas o varios
  // meses. Cambiar de escala vuelve a elegir solo el más nuevo de la otra.
  const [escala, setEscala] = useState<Escala>('dia')
  const [saltar, setSaltar] = useState(0)
  const { aLaVez, haciaAtras } = ESCALAS[escala]
  const ventana = haciaAtras(hoy, aLaVez, saltar)
  // Arranca en «Hoy», como el contador (16/11/2026).
  const [elegidos, setElegidos] = useState<PeriodoDeObjetivos[]>(() => diasHaciaAtras(hoy, 1))
  const cambiarEscala = (e: Escala) => {
    if (e === escala) return
    setEscala(e)
    setSaltar(0)
    setElegidos(ESCALAS[e].haciaAtras(hoy, 1))
  }
  // El más nuevo primero.
  const periodos = [...elegidos].sort((a, b) => b.desde.localeCompare(a.desde))

  const alternarPeriodo = (p: PeriodoDeObjetivos) => setElegidos(prev =>
    prev.some(x => clave(x) === clave(p))
      ? (prev.length > 1 ? prev.filter(x => clave(x) !== clave(p)) : prev) // siempre queda uno
      : [...prev, p])
  const alternarPersona = (id: string) => {
    const actuales = personas.map(u => u.id)
    if (actuales.includes(id)) { if (actuales.length > 1) setPersonasIds(actuales.filter(x => x !== id)) }
    else setPersonasIds([...actuales, id])
  }

  const pedidos = periodos.flatMap(p => personas.map(u => ({ autor: u.id, desde: p.desde, hasta: p.hasta })))
  const resultados = useObjetivosDeVarios(pedidos, true)
  const resultadoDe = (p: PeriodoDeObjetivos, u: Usuario) =>
    resultados[pedidos.findIndex(x => x.autor === u.id && x.desde === p.desde && x.hasta === p.hasta)]
  const varias = personas.length > 1
  // El mayor de cada columna entre las filas a la vista (sin los totales): la barrita debajo de
  // cada número se mide contra él, y el que lo alcanza se resalta. Es lo que hace que se compare.
  const maximos = useMemo(() => {
    const datos = resultados.map(q => q?.data).filter(d => !!d)
    const m: Partial<Record<Objetivo | 'tasa' | typeof GRUPO, number>> = {}
    for (const c of COLUMNAS) m[c.k] = Math.max(0, ...datos.map(d => d.resumen[c.k]))
    m.tasa = Math.max(0, ...datos.map(d => tasaDeDecisor([d]).tasa ?? 0))
    m[GRUPO] = Math.max(0, ...datos.map(d => nutricionDeLaCuenta(d.resumen)))
    return m
  }, [resultados])
  const comparando = pedidos.length > 1
  const [nutricionAbierta, setNutricionAbierta] = useState(false)
  const columnas = piezas(nutricionAbierta)

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-h-[92vh] gap-5 overflow-y-auto sm:max-w-[min(1180px,96vw)]">
        <DialogHeader>
          {/* El botón «Dashboard SDR» salió de acá (16/11/2026, por pedido). */}
          <div className="flex items-center gap-3 pr-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--brand-soft) text-(--brand)">
              <TargetIcon className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <DialogTitle>Comparar objetivos</DialogTitle>
              <DialogDescription>
                Elegí uno o varios períodos{elegibles.length > 1 && ' y una o varias personas'}. Tocá un encabezado para ver de dónde sale.
                {editaCommits && ' Los commits se ponen tocando la celda en «Días».'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* La escala: un segmentado. Adentro de cada una se eligen varios. */}
            <div role="radiogroup" aria-label="Comparar por" className="flex rounded-full bg-(--surface-2) p-1">
              {(Object.keys(ESCALAS) as Escala[]).map(e => (
                <button key={e} type="button" role="radio" aria-checked={escala === e} onClick={() => cambiarEscala(e)}
                  className={cn('cursor-pointer rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition-colors',
                    escala === e ? 'bg-card text-foreground shadow-(--shadow-sm)' : 'text-(--fg-muted) hover:text-foreground')}>
                  {ESCALAS[e].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Anteriores" title="Anteriores"
                onClick={() => setSaltar(s => s + aLaVez)}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              {[...ventana].reverse().map(p => (
                <Chip key={clave(p)} activo={elegidos.some(x => clave(x) === clave(p))} onClick={() => alternarPeriodo(p)}>{p.label}</Chip>
              ))}
              <Button variant="ghost" size="icon" className="size-7 rounded-full" aria-label="Más nuevos" title="Más nuevos"
                disabled={saltar === 0} onClick={() => setSaltar(s => Math.max(0, s - aLaVez))}>
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          </div>
          {elegibles.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <UsersIcon className="mr-1 size-4 text-(--fg-muted)" aria-label="Personas" />
              {elegibles.map(u => (
                <Chip key={u.id} activo={personas.some(x => x.id === u.id)} onClick={() => alternarPersona(u.id)}>
                  <AvatarUsuario usuario={u} />{u.nombre}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl bg-card [border:1px_solid_var(--line)]">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-(--surface-2) text-[11.5px] text-(--fg-2)">
                  <th className="sticky left-0 z-10 min-w-[150px] bg-(--surface-2) px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
                    {varias ? 'Período · persona' : 'Período'}
                  </th>
                  {columnas.map(c => c === GRUPO ? (
                    <EncabezadoDeGrupo key={GRUPO} abierto={nutricionAbierta} onAlternar={() => setNutricionAbierta(a => !a)} />
                  ) : (
                    <Fragment key={c.k}>
                      <Encabezado c={c} icono={ICONOS[c.k]} className={celdaSub(c)} />
                      {c.k === TRAS && <Encabezado c={TASA} icono={PercentIcon} />}
                      {COMMIT_DE[c.k] && <Encabezado c={COMMIT_DE[c.k]!} icono={HandshakeIcon} />}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodos.map(p => {
                  const filas = personas.map(u => ({ u, q: resultadoDe(p, u) }))
                  const todos = filas.every(f => f.q?.data) ? filas.map(f => f.q!.data!) : undefined
                  const total = todos ? sumarResumenes(todos.map(d => d.resumen)) : undefined
                  const tasaTotal = todos ? tasaDeDecisor(todos) : undefined
                  return (
                    <Fragment key={clave(p)}>
                      {varias && (
                        <tr className="[border-top:1px_solid_var(--line)]">
                          <th colSpan={columnas.length + EXTRAS + 1} scope="rowgroup" className="px-4 pt-4 pb-1.5 text-left">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--brand-soft) px-2.5 py-0.5 text-[12px] font-semibold text-(--brand-soft-fg)">
                              <CalendarDaysIcon className="size-3.5" aria-hidden />{p.label}
                            </span>
                          </th>
                        </tr>
                      )}
                      {filas.map(({ u, q }) => (
                        <tr key={u.id} className="group [border-top:1px_solid_var(--line-soft)] hover:bg-(--surface-2)/60">
                          <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-3 text-left group-hover:bg-(--surface-2)">
                            {varias
                              ? <span className="flex items-center gap-2 font-normal text-(--fg-2)"><AvatarUsuario usuario={u} />{u.nombre}</span>
                              : <span className="font-semibold text-foreground">{p.label}</span>}
                          </th>
                          {columnas.map(c => c === GRUPO ? (
                            <Celda key={GRUPO} className={celdaDeGrupo(nutricionAbierta)}
                              error={q?.isError} valor={q?.data ? nutricionDeLaCuenta(q.data.resumen) : undefined}
                              max={comparando ? maximos[GRUPO] : undefined}>
                              {numero(q?.data ? nutricionDeLaCuenta(q.data.resumen) : undefined)}
                            </Celda>
                          ) : (
                            <Fragment key={c.k}>
                              <Celda className={celdaSub(c)} error={q?.isError} valor={q?.data?.resumen[c.k]} max={comparando ? maximos[c.k] : undefined}>
                                {numero(q?.data?.resumen[c.k])}
                              </Celda>
                              {c.k === TRAS && (
                                <Celda error={q?.isError} valor={q?.data ? tasaDeDecisor([q.data]).tasa ?? 0 : undefined}
                                  max={comparando ? maximos.tasa : undefined} pie={fraccionDeTasa(q?.data ? tasaDeDecisor([q.data]) : undefined)}>
                                  {porciento(q?.data ? tasaDeDecisor([q.data]) : undefined)}
                                </Celda>
                              )}
                              {COMMIT_DE[c.k] && (() => {
                                const campo = COMMIT_DE[c.k]!.campo
                                const commit = commitDe(commits, u.id, p, campo)
                                // Se edita en «Días» y de lunes a viernes: el commit es diario.
                                const editable = editaCommits && escala === 'dia' && esDiaHabil(p.desde)
                                return (
                                  <CeldaDeCommit real={q?.data?.resumen[c.k]} commit={commit}
                                    cargando={!commits} editable={editable}
                                    onGuardar={valor => guardarCommit.mutate({ persona: u.id, dia: p.desde, campo, valor })} />
                                )
                              })()}
                            </Fragment>
                          ))}
                        </tr>
                      ))}
                      {varias && (
                        <tr className="bg-(--brand-soft)/50 [border-top:1px_solid_var(--line-soft)]">
                          <th scope="row" className="sticky left-0 z-10 bg-(--brand-soft) px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--brand-soft-fg)">
                            Total
                          </th>
                          {columnas.map(c => c === GRUPO ? (
                            <CeldaTotal key={GRUPO} className={celdaDeGrupo(nutricionAbierta)}>
                              {numero(total ? nutricionDeLaCuenta(total) : undefined)}
                            </CeldaTotal>
                          ) : (
                            <Fragment key={c.k}>
                              <CeldaTotal className={celdaSub(c)}>{numero(total?.[c.k])}</CeldaTotal>
                              {c.k === TRAS && <CeldaTotal pie={fraccionDeTasa(tasaTotal)}>{porciento(tasaTotal)}</CeldaTotal>}
                              {COMMIT_DE[c.k] && (
                                <CeldaDeCommit real={total?.[c.k]} cargando={!commits} editable={false} total
                                  commit={sumarDefinidos(personas.map(u => commitDe(commits, u.id, p, COMMIT_DE[c.k]!.campo)))} />
                              )}
                            </Fragment>
                          ))}
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <PendientesAhora personas={personas} hoy={hoy} />
      </DialogContent>
    </Dialog>
  )
}

/** Encabezado de una columna: ícono arriba y el nombre, tocable para ver de dónde sale. */
function Encabezado({ c, icono: Icono, className }: { c: Explicado; icono: LucideIcon; className?: string }) {
  return (
    <th className={cn('px-3 py-3 text-center align-bottom font-semibold', className)}>
      <Explicacion c={c}>
        <span className="inline-flex max-w-[110px] flex-col items-center gap-1 leading-tight">
          <IconoDeEncabezado icono={Icono} />
          {c.label}
        </span>
      </Explicacion>
    </th>
  )
}

/** El ícono de la columna en un círculo chico, como el de las tarjetas (18/11/2026). */
function IconoDeEncabezado({ icono: Icono }: { icono: LucideIcon }) {
  return (
    <span className="grid size-7 place-items-center rounded-full bg-(--surface-2) text-(--brand) [border:1.5px_solid_var(--brand-200)]">
      <Icono className="size-3.5" aria-hidden />
    </span>
  )
}

/** El encabezado de «Nutrición de la cuenta»: tocarlo despliega o pliega sus cuatro columnas, y la
 *  «i» de al lado explica de dónde sale (no se puede anidar un botón en otro). */
function EncabezadoDeGrupo({ abierto, onAlternar }: { abierto: boolean; onAlternar: () => void }) {
  return (
    <th className={cn('px-3 py-3 text-center align-bottom font-semibold', celdaDeGrupo(abierto), abierto && 'text-(--brand-soft-fg)')}>
      <span className="inline-flex max-w-[120px] flex-col items-center gap-1 leading-tight">
        <span className="flex items-center gap-1">
          <Explicacion c={NUTRICION} className="cursor-pointer text-(--fg-muted) hover:text-foreground">
            <InfoIcon className="size-3.5" aria-label="Qué es y de dónde sale" />
          </Explicacion>
          <IconoDeEncabezado icono={SproutIcon} />
        </span>
        <button type="button" aria-expanded={abierto} onClick={onAlternar}
          title={`${NUTRICION.title}. Tocá para ${abierto ? 'plegar' : 'ver'} el detalle.`}
          className="inline-flex cursor-pointer items-center gap-0.5 uppercase underline decoration-dotted underline-offset-4 hover:text-foreground">
          {NUTRICION.label}
          <ChevronDownIcon aria-hidden className={cn('size-3 transition-transform', !abierto && '-rotate-90')} />
        </button>
      </span>
    </th>
  )
}

/** Un número de la tabla, en un círculo como el de las tarjetas (18/11/2026, por pedido).
 *  Comparando, lleva debajo una barrita contra el mayor de su columna, y el que lo alcanza lleva el
 *  círculo en el color de la marca. `pie` va debajo del círculo (el «4/10» de la tasa). */
function Celda({ error, valor, max, pie, className, children }: {
  error?: boolean; valor: number | undefined; max: number | undefined; pie?: React.ReactNode; className?: string; children: React.ReactNode
}) {
  if (error) {
    return (
      <td className={cn('px-3 py-2.5 text-center align-top', className)} title="No se pudo leer">
        <Circulo compacto hover={false} className="mx-auto text-(--fg-faint)">!</Circulo>
      </td>
    )
  }
  const conBarra = max !== undefined && max > 0 && valor !== undefined
  const lider = conBarra && valor === max
  return (
    <td className={cn('px-3 py-2.5 text-center align-top', className)}>
      <div className="inline-flex w-[52px] flex-col items-center gap-1.5">
        <Circulo compacto hover={false} className={cn(lider && 'text-(--brand) [border-color:var(--brand)]')}>{children}</Circulo>
        {pie}
        {conBarra && (
          <span className="h-1 w-full overflow-hidden rounded-full bg-(--surface-2)" aria-hidden>
            <span className={cn('block h-full rounded-full', lider ? 'bg-(--brand)' : 'bg-(--brand)/35')}
              style={{ width: `${Math.round((valor / max) * 100)}%` }} />
          </span>
        )}
      </div>
    </td>
  )
}

/** Un total: el mismo círculo, con el borde de la marca y el número en negrita. */
function CeldaTotal({ pie, className, children }: { pie?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <td className={cn('px-3 py-2.5 text-center align-top', className)}>
      <div className="inline-flex w-[52px] flex-col items-center gap-1.5">
        <Circulo compacto hover={false} className="bg-card [border-color:var(--brand)] [&>span]:font-bold">{children}</Circulo>
        {pie}
      </div>
    </td>
  )
}

const commitDe = (c: Commits | undefined, persona: string, p: PeriodoDeObjetivos, campo: CampoDeCommit) =>
  c ? commitDelPeriodo(c, persona, p.desde, p.hasta, campo) : undefined

/** La suma de los que tienen valor; si ninguno tiene, undefined. */
function sumarDefinidos(ns: (number | undefined)[]): number | undefined {
  const def = ns.filter((n): n is number => n !== undefined)
  return def.length ? def.reduce((a, b) => a + b, 0) : undefined
}

/** Un commit: verde si lo real lo alcanzó, rojo si no. En «Días», un SUPERADMIN lo toca y lo
 *  escribe; vale desde ese día. Vacío lo saca de ese día (vuelve el de antes, si había). */
function CeldaDeCommit({ real, commit, cargando, editable, total = false, onGuardar }: {
  real: number | undefined; commit: number | undefined; cargando: boolean; editable: boolean; total?: boolean
  onGuardar?: (valor: number | null) => void
}) {
  const [editando, setEditando] = useState(false)
  const tono = tonoDelCommit(real, commit)
  const titulo = commit === undefined ? 'Sin commit'
    : `Commit ${commit} · real ${real ?? '–'}${tono === 'verde' ? ' · alcanzado' : tono === 'rojo' ? ' · no alcanzado' : ''}`
  const guardar = (texto: string) => {
    setEditando(false)
    const t = texto.trim()
    if (t === '') { onGuardar?.(null); return }
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0 && n !== commit) onGuardar?.(Math.round(n))
  }
  // El círculo de la tabla, verde o rojo (18/11/2026, por pedido: antes era una cajita). Sin
  // commit, apagado y punteado: no hay con qué comparar.
  const circulo = (contenido: React.ReactNode, extra?: string) => (
    <Circulo compacto hover={false} tono={tono}
      className={cn(!tono && 'text-(--fg-faint) [border-style:dashed]', total && '[&>span]:font-bold', extra)}>
      {contenido}
    </Circulo>
  )

  return (
    <td className="px-3 py-2.5 text-center align-top">
      {editando ? (
        <input type="number" min={0} autoFocus defaultValue={commit ?? ''} aria-label="Commit del día"
          className="h-[46px] w-[64px] rounded-full bg-card px-2 text-center text-[15px] tabular-nums [border:2px_solid_var(--brand)]"
          onBlur={e => guardar(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { e.stopPropagation(); setEditando(false) }
          }} />
      ) : editable ? (
        <button type="button" title={`${titulo}. Tocá para cambiarlo desde este día.`} onClick={() => setEditando(true)}
          className="group/commit inline-flex cursor-pointer rounded-full">
          {circulo(cargando ? '–' : commit ?? '＋', 'group-hover/commit:[border-color:var(--brand)] group-hover/commit:[border-style:solid]')}
        </button>
      ) : (
        <span title={titulo} className="inline-flex">{circulo(cargando || commit === undefined ? '–' : commit)}</span>
      )}
    </td>
  )
}

const VENCIDAS: Explicado = {
  label: 'Tareas vencidas', title: 'Sus tareas pendientes con fecha anterior a hoy',
  explicacion: 'Tareas suyas sin completar cuyo día ya pasó. La de hoy no cuenta. No depende del período elegido: es lo que hay ahora.',
  fuente: 'Tabla crm_tasks: completed = false, sin borrar, asignadas a la persona (assigned_to) y con due_date anterior a hoy.',
}
const SIN_TAREA: Explicado = {
  label: 'Leads sin tarea', title: 'Leads de su cartera en una etapa de «Seguimiento» sin ninguna tarea suya pendiente',
  explicacion: 'Leads de su cartera que están en una etapa de «Seguimiento» y no tienen ninguna tarea suya pendiente (la de otro no cuenta). Es lo que filtra el chip «Pendiente agendar tarea».',
  fuente: 'Tabla crm_leads (responsable = la persona, assigned_to), cruzada con crm_funnel_stages (management_type = por_tarea y allows_tasks) y con crm_tasks pendientes de la persona en ese lead.',
}

/** Lo que cada persona tiene pendiente hoy: no depende del período elegido. */
function PendientesAhora({ personas, hoy }: { personas: Usuario[]; hoy: string }) {
  const leadsQ = useCrmLeads()
  const tareasQ = useTareasPendientes()
  const { etapasPorId } = useCrmCatalogos()
  const listo = !!leadsQ.data && !!tareasQ.data

  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-(--fg-muted)">
        <ClockAlertIcon className="size-3.5 text-(--brand)" aria-hidden />Pendiente ahora
        <span className="font-normal normal-case tracking-normal text-(--fg-faint)">· no depende del período</span>
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
        {personas.map(u => {
          const p = listo ? pendientesDePersona(u.id, leadsQ.data!, tareasQ.data!, etapasPorId, hoy) : undefined
          return (
            <div key={u.id} className="flex flex-col gap-2.5 rounded-xl bg-card p-3 [border:1px_solid_var(--line)]">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><AvatarUsuario usuario={u} />{u.nombre}</span>
              <div className="grid grid-cols-2 gap-2">
                <Pendiente c={VENCIDAS} valor={p?.vencidas} />
                <Pendiente c={SIN_TAREA} valor={p?.sinTarea} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Un pendiente: en rojo suave si hay alguno, neutro si está en cero. */
function Pendiente({ c, valor }: { c: Explicado; valor: number | undefined }) {
  const hay = !!valor
  return (
    <Explicacion c={c} align="start"
      className={cn('flex cursor-pointer flex-col gap-1 rounded-lg px-2.5 py-2 text-left [border:1px_solid_transparent]',
        hay ? 'bg-(--danger-soft) [border-color:color-mix(in_oklab,var(--danger)_30%,transparent)]' : 'bg-(--surface-2)')}>
      <span className={cn('text-[11.5px] leading-tight', hay ? 'text-(--danger-fg)' : 'text-(--fg-2)')}>{c.label}</span>
      <span className={cn('text-[20px] leading-none font-semibold', hay ? 'text-(--danger)' : 'text-foreground')}>{numero(valor)}</span>
    </Explicacion>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={activo} onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[12.5px] transition-colors [border:1px_solid_var(--line)]',
        activo
          ? 'bg-(--brand) font-semibold text-white [border-color:var(--brand)] shadow-(--shadow-sm)'
          : 'text-(--fg-2) hover:text-foreground hover:[border-color:var(--brand-200)]',
      )}>
      {children}
    </button>
  )
}
