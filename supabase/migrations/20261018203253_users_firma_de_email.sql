-- La firma de los mails que salen del CRM (plantillas de «Mensajes»): sale de quien manda y no
-- de un texto fijo. Columnas aparte y no `nombre`/`email`: `nombre` es el corto de los avatares
-- («Lorenzo») y `email` el de login, que puede ser un gmail que no se le da a un cliente.
-- Todas opcionales: sin firma_nombre va `nombre`, sin firma_email va info@propelia.es y sin
-- cargo o teléfono ese renglón no se dibuja. El front no escribe `users`: se cargan por SQL.
alter table public.users
  add column if not exists firma_nombre   text,
  add column if not exists firma_cargo    text,
  add column if not exists firma_email    text,
  add column if not exists firma_telefono text;

-- Lo que decían las plantillas de fábrica, que eran de Lorenzo.
update public.users
   set firma_nombre = 'Lorenzo Piatti Fadda',
       firma_cargo = 'Cofundador · Propelia',
       firma_email = 'lorenzo@propelia.es',
       firma_telefono = '+34 931 70 60 54'
 where email = 'lorenzopiattifadda@gmail.com' and firma_nombre is null;
