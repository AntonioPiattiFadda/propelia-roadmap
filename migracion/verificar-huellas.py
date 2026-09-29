"""Comprueba que lo que llegó a la base es byte a byte lo de los 02-datos-*.

Por qué existe: los datos pasan por el MCP transcriptos, y el texto tiene 111 espacios duros
(U+00A0) que en la transcripción se vuelven espacios comunes SIN ningún error. La fila queda
casi igual, que es peor que rota. Pasó el 29/9/2026 con 7 tareas del lote 2.

Uso:
  1. En la base, por el MCP:
       select string_agg(id||':'||md5(to_jsonb(x)::text), ' ' order by id collate "C")
       from roadmap_tareas x;
     (lo mismo con roadmap_caja y roadmap_notas)
  2. Guardar el resultado (el texto `T01:abc… T02:def…`) en un archivo.
  3. python3 migracion/verificar-huellas.py roadmap_tareas <archivo>

Sin archivo imprime la cantidad de filas y la huella global del disco, para comparar con:
  select count(*), md5(string_agg(id||':'||md5(to_jsonb(x)::text), E'\\n' order by id collate "C"))
  from roadmap_tareas x;

La huella replica el texto de `to_jsonb(fila)::text` de Postgres: claves ordenadas por largo y
después por bytes, separadores `, ` y `: `, números tal cual vinieron.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).parent


class Num(str):
    """Un número tal como vino en el JSON, sin pasar por float."""


def esc(s):
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"': out.append('\\"')
        elif ch == '\\': out.append('\\\\')
        elif ch == '\b': out.append('\\b')
        elif ch == '\f': out.append('\\f')
        elif ch == '\n': out.append('\\n')
        elif ch == '\r': out.append('\\r')
        elif ch == '\t': out.append('\\t')
        elif o < 0x20: out.append('\\u%04x' % o)
        else: out.append(ch)
    out.append('"')
    return ''.join(out)


def pg(v):
    if v is None: return 'null'
    if v is True: return 'true'
    if v is False: return 'false'
    if isinstance(v, Num): return str(v)
    if isinstance(v, str): return esc(v)
    if isinstance(v, list): return '[' + ', '.join(pg(x) for x in v) + ']'
    if isinstance(v, dict):
        ks = sorted(v, key=lambda k: (len(k.encode()), k.encode()))
        return '{' + ', '.join(esc(k) + ': ' + pg(v[k]) for k in ks) + '}'
    raise TypeError(type(v))


def filas(tabla):
    res = []
    pat = re.compile(r'insert into public\.' + tabla + r'\n.*?\$migra\$(.*?)\$migra\$', re.S)
    for f in sorted(AQUI.glob('02-datos-*.sql')):
        for m in pat.finditer(f.read_text()):
            res += json.loads(m.group(1), parse_int=Num, parse_float=Num)
    return res


def main():
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    tabla = sys.argv[1]
    locales = {r['id']: hashlib.md5(pg(r).encode()).hexdigest() for r in filas(tabla)}

    if len(sys.argv) == 2:
        lineas = [f'{i}:{locales[i]}' for i in sorted(locales, key=str.encode)]
        print(len(lineas), hashlib.md5('\n'.join(lineas).encode()).hexdigest())
        return

    base = dict(x.split(':') for x in Path(sys.argv[2]).read_text().split())
    distintas = sorted(k for k in base if locales.get(k) != base[k])
    faltan = sorted(set(locales) - set(base))
    print(f'en base {len(base)} · en disco {len(locales)} · distintas {distintas} · faltan {len(faltan)}')
    if distintas:
        sys.exit(1)


if __name__ == '__main__':
    main()
