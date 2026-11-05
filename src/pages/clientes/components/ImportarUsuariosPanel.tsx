import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { crearOrgConUsuarios, PUENTE_SIMULADO, sumarUsuariosAOrg, type OrgEnLista, type ResultadoDeUsuario, type UsuarioParaCrear } from '../service/puente'
import { useImportarEquipo, useOrganizacionesDePropelia } from '../hooks/useClientes'
import { contrasenaInicial, normalizarWeb } from '../lib/equipo'
import type { DatosDelAlta } from './datosDelAlta'

const ROL = { admin: 'Administrador', agent: 'Agente' } as const

type Modo = 'nueva' | 'existente'

/* La vista previa del equipo que envió el cliente desde la página de alta, y el import (paso 1).
   Lo enviado ya pasó las reglas de la base (`onboarding_alta_enviar`): un responsable que es
   Administrador, emails válidos y sin repetir, teléfono en E.164. Importar es dos llamadas en
   orden: el puente crea la org y las cuentas en Propelia y después `client_onboarding_importar_equipo`
   vuelve a guardar el equipo, vincula la org al lead y tilda las dos tareas. Si la segunda falla,
   la org ya existe: el error lo dice con su id. La web que cargó el cliente (editable acá) va con la
   org y queda en su configuración en Propelia (28/10/2026, por pedido).

   «Usar una que ya existe» (5/11/2026, por pedido): el cliente ya estaba en Propelia. Se elige la
   org y el puente suma al equipo con `add_users_to_org`, como las propiedades: crea las cuentas que
   faltan y saltea sin tocar las que ya son de esa org. Antes de confirmar corre un simulacro
   (`dry_run`) que dice persona por persona qué va a pasar; alguien con cuenta en otra org frena el
   import. Las que ya tenían cuenta quedan con `existing_account` y no reciben mail de accesos. */
export function ImportarUsuariosPanel({ datos, onCerrar }: { datos: DatosDelAlta; onCerrar: () => void }) {
  const [modo, setModo] = useState<Modo>('nueva')
  const [nombreOrg, setNombreOrg] = useState(datos.inmobiliaria)
  const [web, setWeb] = useState(datos.o.website ?? '')
  const webNormalizada = normalizarWeb(web)
  const [orgElegida, setOrgElegida] = useState<OrgEnLista | null>(null)
  const [revision, setRevision] = useState<{ orgId: string; porEmail: Map<string, ResultadoDeUsuario> } | null>(null)
  const [fallaDeRevision, setFallaDeRevision] = useState<{ orgId: string; mensaje: string } | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  // Las cuentas que creó un intento anterior que falló a medias: al reintentar vuelven como «ya
  // existía», pero las creamos nosotros y tienen que recibir sus accesos.
  const creadasAca = useRef(new Set<string>())
  const importar = useImportarEquipo()
  // El responsable primero, como en la página.
  const miembros = [...datos.o.miembros]
    .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.created_at.localeCompare(b.created_at))
    .map(m => ({ ...m, rol: m.role as keyof typeof ROL, contrasena: contrasenaInicial(m.first_name, m.last_name, new Date(m.created_at).getFullYear()) }))
  const usuarios: UsuarioParaCrear[] = miembros.map(m => ({
    first_name: m.first_name, last_name: m.last_name, email: m.email ?? '', phone: m.phone ?? '', role: m.rol, is_owner: m.is_owner, password: m.contrasena,
  }))

  // El simulacro: qué le pasaría a cada uno en la org elegida.
  const orgId = modo === 'existente' ? orgElegida?.id ?? null : null
  useEffect(() => {
    if (!orgId) return
    let vigente = true
    sumarUsuariosAOrg(orgId, usuarios, true)
      .then(r => { if (vigente) setRevision({ orgId, porEmail: new Map(r.results.map(x => [x.email.toLowerCase(), x])) }) })
      .catch(e => { if (vigente) setFallaDeRevision({ orgId, mensaje: e instanceof Error ? e.message : 'Error desconocido' }) })
    return () => { vigente = false }
    // `usuarios` se rearma en cada render; lo que cambia de verdad es la org.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  const revisionVigente = revision && revision.orgId === orgId ? revision : null
  const errorDeRevision = fallaDeRevision && fallaDeRevision.orgId === orgId ? fallaDeRevision.mensaje : null
  const resultadoDe = (email: string | null) => (email ? revisionVigente?.porEmail.get(email.toLowerCase()) : undefined)
  const conError = revisionVigente ? [...revisionVigente.porEmail.values()].filter(r => r.status === 'failed') : []
  const nuevas = revisionVigente ? [...revisionVigente.porEmail.values()].filter(r => r.status === 'new').length : 0
  const yaEstaban = revisionVigente ? [...revisionVigente.porEmail.values()].filter(r => r.status === 'skipped_existing').length : 0

  const listo = miembros.length > 0 && (modo === 'nueva'
    ? nombreOrg.trim() !== '' && webNormalizada !== undefined
    : !!revisionVigente && conError.length === 0)

  const crearNueva = async () => {
    let creada: string | null = null
    try {
      const { organization } = await crearOrgConUsuarios(nombreOrg.trim(), usuarios, webNormalizada ?? null)
      creada = organization.id
      await importar.mutateAsync({
        onboardingId: datos.o.id, organizationId: organization.id,
        miembros: miembros.map(m => ({ first_name: m.first_name, last_name: m.last_name, email: m.email ?? '', phone: m.phone ?? '', role: m.rol, is_owner: m.is_owner })),
      })
      // La web no frena el alta: si no se guardó, se avisa y se carga en Ajustes › Marca de Propelia.
      const sinWeb = webNormalizada && !organization.website
      toast.success(`${organization.name}: organización y ${miembros.length} cuentas creadas`, {
        description: PUENTE_SIMULADO ? 'Puente simulado: en Propelia no se creó nada todavía.'
          : sinWeb ? 'La web no se guardó: cargala en Ajustes › Marca de Propelia.' : undefined,
      })
      onCerrar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      toast.error(creada ? 'La org se creó en Propelia pero no quedó guardada acá' : 'No se pudo importar', {
        description: creada ? `${msg} · org ${creada}` : msg, duration: Infinity, closeButton: true,
      })
    }
  }

  const sumarAExistente = async (org: OrgEnLista) => {
    let sumadas = false
    try {
      const { results } = await sumarUsuariosAOrg(org.id, usuarios)
      sumadas = true
      for (const r of results) if (r.status === 'created') creadasAca.current.add(r.email.toLowerCase())
      const fallaron = results.filter((r): r is Extract<ResultadoDeUsuario, { status: 'failed' }> => r.status === 'failed')
      if (fallaron.length) {
        // No se vincula: lo creado queda en Propelia y reintentar lo saltea.
        toast.error(`No se pudieron crear ${fallaron.length} de ${results.length} cuentas`, {
          description: fallaron.map(f => `${f.email}: ${f.error}`).join(' · '), duration: Infinity, closeButton: true,
        })
        return
      }
      const yaTenia = (email: string | null) => {
        const r = results.find(x => x.email.toLowerCase() === (email ?? '').toLowerCase())
        return r?.status === 'skipped_existing' && !creadasAca.current.has(r.email.toLowerCase())
      }
      await importar.mutateAsync({
        onboardingId: datos.o.id, organizationId: org.id,
        miembros: miembros.map(m => ({
          first_name: m.first_name, last_name: m.last_name, email: m.email ?? '', phone: m.phone ?? '', role: m.rol, is_owner: m.is_owner,
          existing_account: yaTenia(m.email),
        })),
      })
      const creadas = miembros.filter(m => !yaTenia(m.email)).length
      toast.success(`${org.name} vinculada al lead`, {
        description: `${creadas} ${creadas === 1 ? 'cuenta nueva' : 'cuentas nuevas'}, ${miembros.length - creadas} ya ${miembros.length - creadas === 1 ? 'tenía' : 'tenían'} cuenta.`
          + (PUENTE_SIMULADO ? ' Puente simulado: en Propelia no se creó nada todavía.' : ''),
      })
      onCerrar()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      const otroLead = msg.includes('crm_onboarding_org_de_otro_lead')
      toast.error(otroLead ? 'Esa organización ya está vinculada a otro lead' : sumadas ? 'Las cuentas quedaron en Propelia pero la org no se vinculó acá' : 'No se pudo importar', {
        description: otroLead ? 'Elegí otra o desvinculá la del otro lead.' : sumadas ? `${msg} · org ${org.id}` : msg, duration: Infinity, closeButton: true,
      })
    }
  }

  const confirmar = async () => {
    setEnCurso(true)
    try {
      if (modo === 'nueva') await crearNueva()
      else if (orgElegida) await sumarAExistente(orgElegida)
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-(--line) bg-(--surface-2) p-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <div className="inline-flex rounded-md border border-(--line) bg-card p-0.5" role="radiogroup" aria-label="Organización en Propelia">
          {([['nueva', 'Crear organización nueva'], ['existente', 'Usar una que ya existe']] as const).map(([valor, rotulo]) => (
            <button key={valor} type="button" role="radio" aria-checked={modo === valor} disabled={enCurso}
              onClick={() => setModo(valor)}
              className={cn('rounded px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                modo === valor ? 'bg-primary text-primary-foreground' : 'text-(--fg-2) hover:bg-(--surface-2)')}>
              {rotulo}
            </button>
          ))}
        </div>
        {/* El link de Idealista que dejó el cliente en la página de alta: para mirarlo, no viaja a Propelia. */}
        {datos.o.idealista_url && (
          <a href={/^https?:\/\//i.test(datos.o.idealista_url) ? datos.o.idealista_url : `https://${datos.o.idealista_url}`}
            target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-primary hover:underline">
            Idealista <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
        <b>Vista previa</b>
        <span className="text-(--fg-muted)">{miembros.length} {miembros.length === 1 ? 'persona' : 'personas'}</span>
        {modo === 'nueva' ? (
          <>
            <label className="ml-auto flex items-center gap-2 text-(--fg-2)">
              Nombre de la inmobiliaria
              <Input value={nombreOrg} onChange={e => setNombreOrg(e.target.value)} className="h-8 w-56 bg-card" />
            </label>
            <label className="flex items-center gap-2 text-(--fg-2)">
              Web
              <Input value={web} onChange={e => setWeb(e.target.value)} placeholder="Opcional" aria-invalid={webNormalizada === undefined}
                title={webNormalizada === undefined ? 'No es una web válida (ej. fincasribera.es)' : 'Queda en la configuración de la org en Propelia'}
                className="h-8 w-52 bg-card" />
            </label>
          </>
        ) : (
          <label className="ml-auto flex items-center gap-2 text-(--fg-2)">
            Organización
            <SelectorDeOrg valor={orgElegida} onElegir={setOrgElegida} deshabilitado={enCurso} />
          </label>
        )}
      </div>
      {modo === 'existente' && orgElegida && (
        <p className="text-[12px] text-(--fg-muted)">
          {errorDeRevision ? <span className="text-destructive">No se pudo revisar: {errorDeRevision}</span>
            : !revisionVigente ? <span className="inline-flex items-center gap-1.5"><Loader2 className="size-3.5 animate-spin" />Revisando quién ya tiene cuenta…</span>
            : <>{nuevas} {nuevas === 1 ? 'cuenta nueva' : 'cuentas nuevas'} · {yaEstaban} ya {yaEstaban === 1 ? 'está' : 'están'} en la org (no se {yaEstaban === 1 ? 'toca' : 'tocan'}, sin mail de accesos)
              {conError.length > 0 && <span className="text-destructive"> · {conError.length} con error: corregí el email en la página de alta</span>}</>}
        </p>
      )}
      <div className="overflow-x-auto rounded-md border border-(--line) bg-card">
        <table className="w-full min-w-[600px] text-[12.5px]">
          <thead className="bg-(--surface-2) text-left text-[11px] uppercase tracking-wide text-(--fg-muted)">
            <tr>{['Nombre', 'Email', 'Teléfono', 'Rol', 'Contraseña', ...(modo === 'existente' ? ['En Propelia'] : [])].map(h => <th key={h} className="px-2.5 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {miembros.map(m => {
              const r = modo === 'existente' ? resultadoDe(m.email) : undefined
              return (
                <tr key={m.id} className="border-t border-(--line) align-top">
                  <td className="px-2.5 py-2">
                    {m.first_name} {m.last_name}
                    {m.is_owner && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Responsable</span>}
                  </td>
                  <td className="px-2.5 py-2">{m.email}</td>
                  <td className="px-2.5 py-2 tabular-nums">{m.phone}</td>
                  <td className="px-2.5 py-2">{ROL[m.rol]}</td>
                  <td className="px-2.5 py-2 font-mono text-[12px]">
                    {r?.status === 'skipped_existing' ? <span className="font-sans text-(--fg-muted)">la suya</span> : m.contrasena}
                  </td>
                  {modo === 'existente' && (
                    <td className="px-2.5 py-2">
                      {!r ? <span className="text-(--fg-muted)">—</span>
                        : r.status === 'failed' ? <span className="text-destructive">{r.error}</span>
                        : r.status === 'skipped_existing' ? <span className="text-(--fg-muted)">Ya tiene cuenta</span>
                        : <span className="text-success">Se crea</span>}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!listo || enCurso} onClick={() => void confirmar()}>
          {enCurso && <Loader2 className="size-4 animate-spin" />}
          {modo === 'nueva'
            ? `Crear organización y ${miembros.length} ${miembros.length === 1 ? 'cuenta' : 'cuentas'}`
            : `Vincular${nuevas ? ` y crear ${nuevas} ${nuevas === 1 ? 'cuenta' : 'cuentas'}` : ''}`}
        </Button>
        <Button size="sm" variant="outline" disabled={enCurso} onClick={onCerrar}>Cancelar</Button>
        <span className="text-[12px] text-(--fg-muted)">
          {modo === 'nueva' ? 'La contraseña es automática: nombre.apellido.'
            : 'Las cuentas nuevas van con nombre.apellido; las que ya existían no se tocan.'}
        </span>
      </div>
    </div>
  )
}

/** Las orgs de Propelia (`list_organizations`), con búsqueda por nombre o slug. */
function SelectorDeOrg({ valor, onElegir, deshabilitado }: { valor: OrgEnLista | null; onElegir: (o: OrgEnLista) => void; deshabilitado: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const orgs = useOrganizacionesDePropelia(true)
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={abierto} disabled={deshabilitado} className="h-8 w-64 justify-between bg-card font-normal">
          <span className="truncate">{valor ? valor.name : 'Elegí la organización…'}</span>
          <ChevronsUpDown className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Buscar por nombre…" />
          <CommandList>
            <CommandEmpty>
              {orgs.isLoading ? 'Cargando…' : orgs.isError ? `No se pudieron traer: ${orgs.error instanceof Error ? orgs.error.message : 'error'}` : 'Ninguna coincide.'}
            </CommandEmpty>
            <CommandGroup>
              {(orgs.data ?? []).map(o => (
                <CommandItem key={o.id} value={`${o.name} ${o.slug}`} onSelect={() => { onElegir(o); setAbierto(false) }}>
                  <Check className={cn('size-3.5', valor?.id === o.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.name}</span>
                  <span className="ml-auto truncate text-[11px] text-(--fg-muted)">{o.slug}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
