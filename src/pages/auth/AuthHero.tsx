const FONT_DISPLAY = "'Schibsted Grotesk', system-ui, sans-serif"
const FONT_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace"

/* La columna izquierda del login, copiada de `AuthHero` del producto (mismo bot, mismas
   fuentes y degradé) con el texto del tablero interno. Solo desde `lg`: en el teléfono
   queda la tarjeta sola. */
export function AuthHero() {
  return (
    <div className="hidden lg:flex flex-col justify-center relative z-10 px-12 py-10">
      <div className="max-w-md">
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#0147FE',
            fontWeight: 500,
          }}
        >
          Tablero interno
        </div>

        <p
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 40,
            letterSpacing: '-0.038em',
            lineHeight: 1.05,
            marginTop: 16,
            color: '#010C44',
          }}
        >
          Propelia{' '}
          <span
            style={{
              backgroundImage:
                'linear-gradient(118deg,#0147FE 0%,#0F79FF 26%,#019EFE 52%,#0FC5FE 76%,#1DE1FE 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            por dentro
          </span>
        </p>

        <p
          style={{
            color: '#55607E',
            fontSize: 16,
            lineHeight: 1.65,
            marginTop: 18,
            maxWidth: '38ch',
          }}
        >
          El roadmap y los leads del equipo. Todo en un solo lugar.
        </p>
      </div>

      <div className="relative flex items-center justify-center mt-10">
        <div
          aria-hidden="true"
          className="absolute"
          style={{
            inset: '2% 10% 22% 10%',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(29,225,254,.44), rgba(1,71,254,.2) 48%, transparent 70%)',
            filter: 'blur(22px)',
          }}
        />
        <img
          src="/propelia-bot.webp"
          alt="Propelia, el agente de IA"
          width={520}
          height={599}
          decoding="async"
          className="animate-hero-float relative"
          style={{
            width: 'min(260px, 70%)',
            height: 'auto',
            filter: 'drop-shadow(0 26px 44px rgba(1,12,68,.34))',
          }}
        />
      </div>
    </div>
  )
}
