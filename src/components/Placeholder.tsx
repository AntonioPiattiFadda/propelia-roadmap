type Props = { titulo: string; texto: string }

// Lo que muestran las tres páginas hasta que los sub-proyectos 2 y 3 las llenen.
export function Placeholder({ titulo, texto }: Props) {
  return (
    <div className="p-6 md:p-10">
      <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
    </div>
  )
}
