import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { Textarea } from '@/components/ui/textarea'
import { MISSING_CONTACT_ERROR, type ClientData, type ClientDataErrors } from '../lib/clientData'

/* Copiado de propelia-frontend (src/pages/leads/components/ClientFields.tsx) + empresa. En modo
   `extendido` (el dialog del lead) suma los teléfonos alternativos y las notas. Con `onCommit` el
   campo guarda AL SALIR, no tecla por tecla: cada tecla sería un update, un eco de realtime y un
   repintado encima de lo que se está escribiendo. */

export type ClienteExtra = {
  alternative_phone_1: string
  alternative_phone_1_note: string
  alternative_phone_2: string
  alternative_phone_2_note: string
  notes: string
}
type Campo = keyof ClientData | keyof ClienteExtra

/** 48px y esquinas de 12px debajo de 768px: el objetivo táctil del alta en móvil. */
const MOBILE_FIELD = 'max-md:h-12 max-md:rounded-xl'

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[12.5px] font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {error && <span className="text-[12px] font-medium text-danger">{error}</span>}
    </div>
  )
}

export function ClientFields({ data, onChange, errors, onCommit, extendido = false, description, disabled = false }: {
  data: ClientData & Partial<ClienteExtra>
  onChange: (patch: Partial<ClientData & ClienteExtra>) => void
  errors: ClientDataErrors
  /** Guardar un campo al salir de él. Sin esto el formulario es de alta (se guarda con un botón). */
  onCommit?: (campo: Campo) => void
  extendido?: boolean
  description?: string
  /** Solo lectura (sin permiso de escritura sobre la cartera). */
  disabled?: boolean
}) {
  const texto = (campo: Campo, label: string, placeholder: string, type = 'text') => (
    <Field label={label} error={errors[campo as keyof ClientData]}>
      <Input
        className={MOBILE_FIELD}
        type={type}
        placeholder={placeholder}
        value={data[campo] ?? ''}
        disabled={disabled}
        onChange={e => onChange({ [campo]: e.target.value })}
        onBlur={() => onCommit?.(campo)}
        aria-invalid={!!errors[campo as keyof ClientData]}
      />
    </Field>
  )
  const telefono = (campo: 'phone' | 'alternative_phone_1' | 'alternative_phone_2', label: string) => (
    <Field label={label} error={errors[campo as keyof ClientData]}>
      {/* PhoneInput no tiene onBlur propio: se escucha en el contenedor (el blur burbujea como focusout). */}
      <div onBlur={() => onCommit?.(campo)}>
        <PhoneInput value={data[campo] ?? ''} onChange={v => onChange({ [campo]: v })} aria-invalid={!!errors[campo as keyof ClientData]} />
      </div>
    </Field>
  )

  return (
    /* PhoneInput no tiene `disabled`: el fieldset deshabilita de una todos los controles de
       adentro (teléfonos incluidos) sin tocar el diseño. `min-w-0 border-0 p-0` anula los
       estilos de fábrica del fieldset. */
    <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
      <div className="flex flex-col gap-3">
        {description && <p className="mb-1 text-xs text-muted-foreground">{description}</p>}
        {texto('company_name', 'Empresa', 'Inmobiliaria Sur')}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {texto('first_name', 'Nombre', 'Ana')}
          {texto('last_name', 'Apellido', 'Torres')}
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          {telefono('phone', 'Teléfono')}
          {texto('email', 'Email', 'ana@mail.com', 'email')}
        </div>
        {errors.phone === MISSING_CONTACT_ERROR && (
          <p className="rounded-md bg-warning-soft px-2.5 py-[7px] text-[11px] text-warning">
            Ingresá al menos teléfono o email para poder contactar al cliente.
          </p>
        )}
        {extendido && (
          <>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              {telefono('alternative_phone_1', 'Teléfono alternativo')}
              {texto('alternative_phone_1_note', 'De quién es', 'Recepción')}
            </div>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              {telefono('alternative_phone_2', 'Otro teléfono')}
              {texto('alternative_phone_2_note', 'De quién es', 'Dueño')}
            </div>
            <Field label="Notas">
              <Textarea
                rows={4}
                value={data.notes ?? ''}
                disabled={disabled}
                onChange={e => onChange({ notes: e.target.value })}
                onBlur={() => onCommit?.('notes')}
              />
            </Field>
          </>
        )}
      </div>
    </fieldset>
  )
}
