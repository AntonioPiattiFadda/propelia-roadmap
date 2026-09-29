"""Valida la sintaxis de los .sql que se le pasan, con el parser real de Postgres (pglast).

No hay Postgres local (sin Docker en WSL) y la base nueva todavía no existe: esto es lo más
cerca de correrlos que se puede estar antes de la inyección. Parsea también el cuerpo de las
funciones plpgsql. No valida que las tablas existan: eso lo dice la inyección.

    python3 -m venv /tmp/venv-sql && /tmp/venv-sql/bin/pip install -q pglast
    /tmp/venv-sql/bin/python migracion/validar-sql.py supabase/schema.sql migracion/04-*.sql
"""
import sys
from pathlib import Path

import pglast
from pglast import parse_sql
from pglast.parser import parse_plpgsql_json

errores = 0
for ruta in sys.argv[1:]:
    sql = Path(ruta).read_text()
    try:
        sentencias = parse_sql(sql)
    except pglast.parser.ParseError as e:
        errores += 1
        print(f'✗ {ruta}: {e}')
        continue
    antes = errores
    # Los cuerpos plpgsql (funciones y DO) parse_sql los ve como un string: se parsean aparte,
    # de a una sentencia, recortando el texto original por su posición.
    # Ojo: pglast da las posiciones en caracteres, no en bytes (con tildes, no es lo mismo).
    for s in sentencias:
        nodo = type(s.stmt).__name__
        texto = sql[s.stmt_location:s.stmt_location + (s.stmt_len or len(sql))]
        es_plpgsql = nodo == 'DoStmt' or (nodo == 'CreateFunctionStmt' and 'plpgsql' in texto.lower())
        if not es_plpgsql:
            continue
        # parse_plpgsql_json y no parse_plpgsql: el veredicto lo da el parser de Postgres, y
        # pglast después arma un JSON que a veces sale inválido (con `foreach … in array`, por
        # ejemplo). Ese JSON no se necesita para validar.
        try:
            parse_plpgsql_json(texto + ';')
        except pglast.parser.ParseError as e:
            errores += 1
            print(f'✗ {ruta} (plpgsql, cerca de «{texto.strip()[:60]}…»): {e}')
    if errores == antes:
        print(f'✓ {ruta}: {len(sentencias)} sentencias')
sys.exit(1 if errores else 0)
