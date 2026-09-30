import { cn } from "@/lib/utils"

// Desfase entre punto y punto: con la misma animación corrida, los tres hacen la onda.
const DOT_DELAYS_MS = [0, 150, 300]

/**
 * Tres puntitos en onda, como el "escribiendo" de WhatsApp. El texto lo lee el lector de
 * pantalla (`label`); los puntos son sólo decoración y quedan fuera del árbol accesible.
 * Con "reducir movimiento" quedan quietos: la pausa la hace `index.css`.
 */
function TypingDots({
  label,
  className,
  ...props
}: React.ComponentProps<"span"> & { label: string }) {
  return (
    <span
      data-slot="typing-dots"
      role="status"
      className={cn("inline-flex h-4 items-center gap-1", className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {DOT_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="animate-typing-wave size-1.5 rounded-full bg-muted-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

export { TypingDots }
