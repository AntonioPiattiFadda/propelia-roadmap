import { useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import {
  parsePhone,
  getCountryOptions,
  findCountryByDialCode,
  digitsBeforePosition,
  positionAfterDigits,
  type CountryCode,
} from '@/lib/phone'

const COUNTRY_OPTIONS = getCountryOptions()

function Flag({ code, className }: { code: CountryCode; className?: string }) {
  return (
    <img
      src={`https://flagcdn.com/w20/${code.toLowerCase()}.png`}
      alt={code}
      loading="lazy"
      width={18}
      height={12}
      className={cn('h-3 w-[18px] rounded-[2px] object-cover', className)}
    />
  )
}

function dialCodeDigitsFor(code: CountryCode): string {
  return (COUNTRY_OPTIONS.find(c => c.code === code)?.dialCode ?? '').replace('+', '')
}

// El "+" se renderiza fijo afuera del input — si el usuario pega un número que ya
// trae su propio "+" (portapapeles), lo sacamos para no terminar con "++54...".
function stripLeadingPlus(raw: string): string {
  return raw.replace(/^\++/, '')
}

// Prefijos como +1/+7/+44/+39 son ambiguos y libphonenumber-js tarda en resolverlos
// mientras se tipea (a veces hasta tener el número completo) — probamos matchear
// solo por los dígitos de prefijo ya tipeados para que la bandera reaccione antes.
function guessCountryFromLeadingDigits(digitsOnly: string): CountryCode | undefined {
  for (const len of [3, 2, 1]) {
    if (digitsOnly.length < len) continue
    const match = findCountryByDialCode(COUNTRY_OPTIONS, digitsOnly.slice(0, len))
    if (match) return match.code
  }
  return undefined
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry = 'ES',
  id,
  placeholder = '661 28 68 71',
  'aria-invalid': ariaInvalid,
}: {
  value: string
  onChange: (value: string) => void
  defaultCountry?: CountryCode
  id?: string
  placeholder?: string
  'aria-invalid'?: boolean
}) {
  const initialParsed = parsePhone(value, defaultCountry)
  const initialCountry = initialParsed.country ?? defaultCountry
  const [country, setCountry] = useState<CountryCode>(initialCountry)
  const [display, setDisplay] = useState(() => initialParsed.international || `${dialCodeDigitsFor(initialCountry)} `)
  const [open, setOpen] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaretRef = useRef<number | null>(null)

  // Reponer el cursor después de reformatear en vivo — recién acá el DOM ya tiene
  // el valor nuevo, por eso no alcanza con setSelectionRange dentro del handler.
  useLayoutEffect(() => {
    if (pendingCaretRef.current !== null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current)
      pendingCaretRef.current = null
    }
  })

  // El parent puede resetear el value (ej: form limpio tras guardar) —
  // ajuste de estado durante render, sin useEffect (regla de lint del repo)
  if (value !== lastValue) {
    setLastValue(value)
    const parsed = parsePhone(value, defaultCountry)
    const nextCountry = parsed.country ?? defaultCountry
    setCountry(nextCountry)
    setDisplay(parsed.international || `${dialCodeDigitsFor(nextCountry)} `)
  }

  const emit = (next: string) => {
    setLastValue(next)
    onChange(next)
  }

  const handleTextChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const caretPos = e.target.selectionStart ?? raw.length
    const withoutExtraPlus = stripLeadingPlus(raw)
    const plusCharsStripped = raw.length - withoutExtraPlus.length
    const digitsOnly = withoutExtraPlus.replace(/\D/g, '')
    const parsed = digitsOnly ? parsePhone(`+${withoutExtraPlus}`, country) : parsePhone('', country)
    const guessed = guessCountryFromLeadingDigits(digitsOnly)
    const nextCountry = parsed.country ?? guessed ?? country
    if (nextCountry !== country) setCountry(nextCountry)

    const formatted = digitsOnly ? parsed.international : ''
    const digitsBeforeCaret = digitsBeforePosition(withoutExtraPlus, Math.max(0, caretPos - plusCharsStripped))
    pendingCaretRef.current = positionAfterDigits(formatted, digitsBeforeCaret)

    setDisplay(formatted)
    emit(parsed.e164 ?? (digitsOnly ? `+${withoutExtraPlus}`.trim() : ''))
  }

  const handleBlur = () => {
    const parsed = parsePhone(`+${stripLeadingPlus(display)}`, country)
    if (parsed.isValid) setDisplay(parsed.international)
  }

  const handleCountrySelect = (code: CountryCode) => {
    setCountry(code)
    setOpen(false)
    const prefill = `${dialCodeDigitsFor(code)} `
    setDisplay(prefill)
    emit(`+${dialCodeDigitsFor(code)}`)
  }

  return (
    <div className="flex">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-7 rounded-l-md rounded-r-none border-r-0 bg-transparent px-0 shadow-xs max-md:h-12"
            aria-label="Buscar país"
          >
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar país o prefijo..." />
            <CommandList>
              <CommandEmpty>Sin resultados</CommandEmpty>
              <CommandGroup>
                {COUNTRY_OPTIONS.map(option => (
                  <CommandItem
                    key={option.code}
                    value={`${option.name} ${option.dialCode}`}
                    onSelect={() => handleCountrySelect(option.code)}
                  >
                    <Flag code={option.code} />
                    <span className="flex-1 truncate">{option.name}</span>
                    <span className="text-xs text-muted-foreground">{option.dialCode}</span>
                    {option.code === country && <Check className="h-3.5 w-3.5" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div
        className={cn(
          // 48px con el pulgar: 36px es el mínimo absoluto de un objetivo táctil, y el
          // teléfono es el campo que más se escribe en el alta.
          'flex h-9 flex-1 items-center gap-1.5 rounded-l-none border border-input bg-transparent px-2.5 shadow-xs max-md:h-12',
          'transition-[color,box-shadow] has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-[3px]',
          'has-[input[aria-invalid=true]]:ring-destructive/20 dark:has-[input[aria-invalid=true]]:ring-destructive/40 has-[input[aria-invalid=true]]:border-destructive'
        )}
      >
        <Flag code={country} />
        <span className="text-sm text-muted-foreground">+</span>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          value={display}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-invalid={ariaInvalid}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
    </div>
  )
}
