import { useState, useEffect, useRef } from "react"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"

interface MoneyInputProps {
  label?: string
  value?: number | null
  placeholder?: string
  disabled?: boolean
  onChange: (value: number | null) => void
  id?: string
  resetKey?: string
}

export function MoneyInput({
  label,
  value,
  disabled,
  placeholder,
  onChange,
  id,
  resetKey,
}: MoneyInputProps) {
  const trunc2 = (n: number) => Math.floor(n * 100) / 100
  const toDisplay = (n: number | null | undefined) => (n == null ? "" : String(trunc2(n)))

  const [rawInput, setRawInput] = useState<string>(toDisplay(value))
  const rawInputRef = useRef(rawInput)
  rawInputRef.current = rawInput

  useEffect(() => {
    const parsed = rawInputRef.current === "" ? null : parseFloat(rawInputRef.current)
    const displayValue = value != null ? trunc2(value) : null
    const parsedMatches = parsed === displayValue || (value == null && rawInputRef.current === "")
    if (!parsedMatches) {
      setRawInput(toDisplay(value))
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRawInput(toDisplay(value))
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value

    if (raw !== "" && !/^\d*\.?\d{0,2}$/.test(raw)) return

    setRawInput(raw)

    if (raw === "" || raw === ".") {
      onChange(null)
      return
    }

    if (raw.endsWith(".")) return

    const parsed = parseFloat(raw)
    const rounded = Math.round(parsed * 100) / 100
    onChange(isNaN(rounded) ? null : rounded)
  }

  const handleBlur = () => {
    if (rawInput === "" || rawInput === ".") {
      setRawInput("")
      if (value != null && value !== 0) onChange(null)
      return
    }

    const parsed = parseFloat(rawInput)
    if (!isNaN(parsed)) {
      const rounded = Math.round(parsed * 100) / 100
      setRawInput(String(rounded))
      const currentDisplay = value != null ? trunc2(value) : null
      if (rounded !== currentDisplay) {
        onChange(rounded)
      }
    } else {
      setRawInput("")
      onChange(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <Label htmlFor={id}>{label}</Label>}

      <InputGroup className="relative focus-within:ring-1 focus-within:ring-ring">
        <span className="absolute z-10 top-[50%] left-2 translate-y-[-50%] text-muted-foreground select-none">
          €
        </span>
        <InputGroupInput
          id={id}
          disabled={disabled}
          value={rawInput}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          onChange={handleChange}
          onBlur={handleBlur}
          className="pl-6 text-black"
        />
      </InputGroup>
    </div>
  )
}
