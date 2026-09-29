"""Genera migracion/02-datos-NN.sql a partir del volcado del roadmap.

El volcado sale de correr en el proyecto VIEJO (propelia), por el MCP, la consulta de
`migracion/PASOS.md` → «Re-extraer los datos». El MCP guarda el resultado en un .txt
porque no entra en la respuesta; ese archivo es el argumento de este script:

    python3 migracion/generar-datos.py <ruta-al-txt-del-mcp>

Por qué un script y no copiar a mano: son ~220 KB de JSON con explicaciones enteras
adentro. Transcribirlo es la forma segura de corromper una tarea sin que nadie se entere.

Los datos van como `jsonb_populate_recordset` con dollar-quoting, así el contenido no se
escapa a mano, y en lotes de ~30 KB para que cada uno entre en una llamada `execute_sql`.
Todos son `on conflict do nothing`: correrlos dos veces no duplica nada.
"""
import json
import re
import sys
from pathlib import Path

TAG = '$migra$'
LOTE = 30000
AQUI = Path(__file__).parent


def leer_volcado(ruta):
    crudo = json.loads(Path(ruta).read_text())
    texto = crudo['result'] if isinstance(crudo, dict) else crudo[0]['text']
    m = re.search(r'<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data', texto, re.S)
    if not m:
        sys.exit('No encontré el resultado de la consulta adentro del archivo.')
    return json.loads(json.loads(m.group(1))[0]['dump'])


def insert(tabla, filas):
    # ASCII puro: lo no-ASCII viaja como  , ñ... y jsonb lo decodifica igual. Con el
    # carácter crudo, los 111 espacios duros del texto se vuelven espacios comunes al pasar
    # por el MCP, sin ningún error (29/9/2026). Ver verificar-huellas.py.
    cuerpo = json.dumps(filas, ensure_ascii=True)
    if TAG in cuerpo:
        sys.exit(f'El texto {TAG} aparece en los datos de {tabla}: cambiá TAG.')
    return (f'insert into public.{tabla}\n'
            f'select * from jsonb_populate_recordset(null::public.{tabla}, {TAG}{cuerpo}{TAG}::jsonb)\n'
            f'on conflict (id) do nothing;\n')


def a_ascii():
    """Reescribe en ASCII los 02-datos-* que ya están en disco, sin re-extraer. Mismos lotes,
    mismos datos: solo cambia cómo viaja lo no-ASCII."""
    pat = re.compile(r'\$migra\$(.*?)\$migra\$', re.S)
    for f in sorted(AQUI.glob('02-datos-*.sql')):
        nuevo = pat.sub(lambda m: TAG + json.dumps(json.loads(m.group(1)), ensure_ascii=True) + TAG,
                        f.read_text())
        # La cabecera (comentarios) puede tener tildes; lo que va al MCP es lo de abajo.
        cuerpo = '\n'.join(l for l in nuevo.split('\n') if not l.startswith('--'))
        if not cuerpo.isascii():
            sys.exit(f'{f.name}: quedó algo no-ASCII fuera de los datos.')
        f.write_text(nuevo)
        print(f.name, 'en ASCII')


def main():
    if sys.argv[1:] == ['--ascii']:
        return a_ascii()
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    d = leer_volcado(sys.argv[1])

    partes = ['-- Chicas: caja y notas.\n'
              + insert('roadmap_caja', d['roadmap_caja'] or [])
              + insert('roadmap_notas', d['roadmap_notas'] or [])]
    lote, tam = [], 0
    for t in d['roadmap_tareas']:
        s = len(json.dumps(t, ensure_ascii=True))
        if lote and tam + s > LOTE:
            partes.append(insert('roadmap_tareas', lote))
            lote, tam = [], 0
        lote.append(t)
        tam += s
    if lote:
        partes.append(insert('roadmap_tareas', lote))

    for viejo in AQUI.glob('02-datos-*.sql'):
        viejo.unlink()
    for i, p in enumerate(partes, 1):
        (AQUI / f'02-datos-{i:02d}.sql').write_text(
            f'-- Roadmap — datos, parte {i} de {len(partes)}. Extraído de propelia el {d["extraido"]}.\n'
            f'-- NO COMMITEAR: tiene la caja. Idempotente (on conflict do nothing).\n' + p)

    print(f'extraído: {d["extraido"]}')
    print(f'tareas {len(d["roadmap_tareas"])} · caja {len(d["roadmap_caja"] or [])} · '
          f'notas {len(d["roadmap_notas"] or [])} · {len(partes)} archivos')


if __name__ == '__main__':
    main()
