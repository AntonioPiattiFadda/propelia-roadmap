import { toast, Toaster as Sonner, type ToasterProps } from "sonner"
import { createPortal } from "react-dom"

const _originalError = toast.error.bind(toast)
toast.error = (message, options) => {
  const duration = options?.duration ?? 16000
  return _originalError(message, {
    ...options,
    duration,
    // La barra de progreso (index.css) lee esta var para durar lo mismo que el toast
    style: { "--toast-duration": `${duration}ms`, ...options?.style } as React.CSSProperties,
  })
}

const Toaster = ({ ...props }: ToasterProps) => {
  return typeof document !== "undefined"
    ? createPortal(
      <Sonner
        theme="system"
        closeButton
        className="no-print toaster group fixed z-[999999] pointer-events-auto"
        style={{
          "--normal-bg": "var(--color-card)",
          "--normal-text": "var(--color-card-foreground)",
          "--normal-border": "var(--color-border)",
          zIndex: 100000,
        } as React.CSSProperties}
        toastOptions={{
          style: {
            // capa 1: barra de progreso (su tamaño lo anima @keyframes
            // toast-progress en index.css); capa 2: fondo de la card
            background:
              "linear-gradient(var(--toast-bar-color, var(--brand)), var(--toast-bar-color, var(--brand))) left bottom / 0% 3px no-repeat, var(--color-card)",
            color: "var(--color-card-foreground)",
            border: "1px solid var(--color-border)",
          } as React.CSSProperties,
          classNames: {
            closeButton:
              "left-auto! right-1.5! top-1.5! transform-none! border-none! bg-transparent! shadow-none! text-muted-foreground! hover:text-foreground! hover:bg-muted!",
          },
        }}
        {...props}
      />,
      document.body
    )
    : null
}

export { Toaster }
