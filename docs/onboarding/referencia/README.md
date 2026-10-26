# Referencia: el onboarding tal como está en `propelia-frontend`

Copia del código del producto al commit `216a69ce` (26/10/2026). **Es para leer, no compila acá**:
los imports con `@/` apuntan al árbol de `propelia-frontend`, y esta carpeta queda afuera de
`tsconfig.app.json` y de vitest.

| Archivo | Qué mirar |
|---|---|
| `src/pages/onboarding-admin/OnboardingAdmin.tsx` | La pantalla entera: lista, pasos, tareas, equipo, mensajes, contraseñas iniciales |
| `src/pages/onboarding-admin/OnboardingDialogs.tsx` | Diálogos de alta nueva y de miembro |
| `src/pages/onboarding-admin/onboardingCatalog.ts` | Catálogo de 5 pasos (el vigente es de 7, ver `../README.md`), `initialPassword`, `stepStatus` |
| `src/service/clientOnboardings.service.ts` | Las lecturas y escrituras de las cuatro tablas. Se porta casi igual |
| `src/pages/onboarding-admin/PropertyImport.tsx` | UI del import. En el Roadmap llama a `check_properties` / `import_properties` del puente |
| `src/pages/onboarding-admin/importRows.ts`, `src/pages/propiedades/*` | Parseo y validación del Excel. **No se porta**: lo hace el producto detrás del puente |
| `src/service/propertyImport.service.ts` | Completado con Google + RPC por lotes. **Queda en el producto** |
| `src/pages/onboarding-admin/InboundSimulator.tsx` | UI del simulador. En el Roadmap llama a `send_simulated_inbound` |
| `src/pages/onboarding-admin/inboundSimulationEmails.ts`, `src/service/inboundSimulation.service.ts` | Los mails simulados y el envío. **Quedan en el producto** |
| `supabase/migrations/20261023125410_client_onboardings.sql` | La migración de origen de `../MODELO_DATOS.md` |
| `supabase/migrations/20261023183618_superadmin_import_properties.sql` | El RPC del import. **Queda en el producto** |
| `src/tests/db-client-onboardings.test.ts` | Qué se probó de RLS y RPCs: sirve de lista para los tests del Roadmap |
