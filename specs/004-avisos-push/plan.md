# Plan de implementación: Avisos push del repaso diario

**Rama**: `claude/mvp-architecture-build-hbua5y` (ver «Seguimiento de complejidad») | **Fecha**:
2026-11-23 | **Especificación**: [spec.md](spec.md)

**Entrada**: especificación de `specs/004-avisos-push/spec.md`

## Resumen

Cada usuario puede activar en Ajustes un aviso del sistema que le recuerda hacer el repaso a la
hora de su perfil. El aviso llega a todos los dispositivos donde lo activó y no se envía si ya hizo
el repaso.

**En el navegador**:

- un service worker nuevo, `saas/public/sw.js`, que muestra el aviso y abre `/review?desde=aviso`;
- un bloque cliente en Ajustes, `push-settings.tsx`, que pide permiso, se suscribe y llama a las
  Server Actions de `src/features/push/`;
- `PushSync`, que vuelve a registrar el dispositivo al abrir la app (FR-008);
- un botón de cerrar sesión que primero da de baja el dispositivo.

**En la BD** (una migración nueva):

- la RPC `register_push_subscription`, para que un dispositivo pase a la última cuenta que lo
  activa;
- dos funciones `security definer`, `claim_due_reminders` y `report_reminder_results`, que solo
  puede ejecutar un rol nuevo sin acceso a tablas (`reminder_sender`);
- la columna `profiles.last_reminder_day`, que garantiza un aviso al día;
- restricciones de host y de formato en `push_subscriptions`;
- un trabajo de `pg_cron` cada minuto, solo si la extensión está disponible.

**En Supabase Edge Functions**:

- `review-reminders`: la invoca el cron, reclama los avisos que tocan, los envía con Web Push
  (carga cifrada RFC 8291 y VAPID, reutilizando la firma de `notificaciones/worker.js`) e informa
  del resultado;
- `push-test`: envía el aviso de prueba con la sesión del usuario.

El cifrado y la firma van en `supabase/functions/_shared/web-push.ts`, sin dependencias, y se
prueban en Vitest.

## Contexto técnico

**Lenguaje/versión**:

- TypeScript 6 (estricto) y React 19 en `saas/src`;
- SQL/PLpgSQL (Postgres 17 de Supabase);
- TypeScript para Deno en las Edge Functions;
- JavaScript plano en `public/sw.js`.

**Dependencias principales**: Next.js 16, `@supabase/ssr`, `@supabase/supabase-js`, Zod 4 y
Tailwind 4. Hay **una dependencia nueva, solo en la Edge Function** `review-reminders`:
`npm:postgres@3.4.x` (import de Deno; no entra en `package.json`). La app Next no añade ninguna.

**Almacenamiento**: Supabase Postgres:

- columna nueva `profiles.last_reminder_day`;
- en `push_subscriptions`, la columna `updated_at` y dos `check`;
- tres funciones nuevas;
- el rol `reminder_sender`;
- un trabajo de `pg_cron`;
- dos secretos de Vault, que se crean a mano.

**Pruebas**: Vitest.

- `tests/db.test.ts`: el *stub* añade el rol `reminder_sender` y se cubren registro, reclamo,
  informe, permisos y la regla de las 04:00.
- `tests/web-push.test.ts` (nuevo): ida y vuelta de cifrado y verificación del JWT VAPID.
- `tests/validation.test.ts`.
- Pruebas a mano en Android, escritorio e iPhone instalado (`quickstart.md`).

**Plataforma objetivo**:

- Safari en iOS/iPadOS 16.4 o posterior, como app de pantalla de inicio;
- Chrome y Firefox en Android;
- navegadores de escritorio con Push API;
- despliegue en Vercel y Supabase (plan gratuito).

**Tipo de proyecto**: aplicación web (`saas/`) con funciones de servidor en Supabase.

**Objetivos de rendimiento**:

- aviso entregado al servicio push en ≤ 2 min desde la hora (FR-011);
- 10 000 avisos en el mismo minuto dentro de una ejecución (lotes de 500 con concurrencia 50, unos
  40 s; SC-005);
- prueba en menos de 30 s;
- activar en menos de 3 s.

**Restricciones**:

- ningún dato del usuario en la carga ni en los logs;
- sin clave *service role*;
- `TTL` de 1 h;
- como máximo un aviso por usuario y día;
- el servidor no hace peticiones a hosts fuera de la lista de servicios push;
- 360–430 px de ancho, modo oscuro y español.

**Escala/alcance**:

- hasta 10 dispositivos por usuario;
- 1 migración, 2 Edge Functions y 1 módulo compartido;
- 1 service worker, unos 4 componentes y acciones nuevos y unos 8 archivos tocados.

## Comprobación de Constitución

*Puerta: debe superarse antes de la fase 0 y volver a comprobarse tras la fase 1.*

| Principio / regla | Cumplimiento |
|---|---|
| **I. Arquitectura** | ✅ `settings/page.tsx` y `review/page.tsx` siguen siendo Server Components. Solo son cliente `push-settings.tsx`, `push-sync.tsx` y `sign-out-button.tsx`, que necesitan Notification, PushManager y service worker. Las escrituras desde la UI se hacen con Server Actions que llaman a `features/push/queries.ts`. No hay ruta `/api/v1` nueva (justificado en el contrato §1: solo un navegador puede crear suscripciones). TypeScript estricto. Las Edge Functions quedan fuera de `tsconfig` porque son Deno, pero su lógica (`_shared`) se comprueba a través de las pruebas. La única dependencia nueva (`npm:postgres`, solo en Deno) se justifica abajo. |
| **II. Datos privados y seguros** | ⚠️ **Excepción justificada** (ver «Seguimiento de complejidad»): el envío programado usa el rol `reminder_sender`, que no es ni la sesión del usuario ni la clave pública. No se usa nunca la *service role*. Por lo demás se cumple: RLS se mantiene en `push_subscriptions`; formatos, hosts y límite se comprueban en SQL; la carga es `{"t":"review"}` o `{"t":"test"}`, sin nombres ni historial (FR-016); la clave privada VAPID solo está en los *secrets* de Supabase (FR-022); los logs solo guardan contadores. |
| **III. Móvil primero** | ✅ Activar cuesta un toque más el permiso, y abrir el repaso desde el aviso, un toque. Botones de ≥ 44 px, textos con las variables CSS existentes y modo oscuro. Mensaje específico para iPhone sin instalar. |
| **IV. Integridad de datos** | ✅ Migración nueva `20261123000000_push_reminders.sql`, sin tocar las aplicadas. La columna nueva admite nulos. Los `check` se añaden `not valid` y luego se validan, tras borrar filas imposibles (la tabla no tenía interfaz, así que no hay datos legítimos que perder). Las fechas usan la zona del perfil, y la condición del repaso aplica la regla de las 04:00 (D3). Esta funcionalidad no añade campos de texto. |
| **V. Simplicidad** | ✅ Sin colas, sin `pgmq`, sin modo sin conexión, sin `pushsubscriptionchange`, sin librerías Web Push. El cifrado propio (unas 120 líneas de Web Crypto) sustituye a una dependencia grande, y es necesario para el aviso de prueba y para iOS (D5). Las dos Edge Functions y el rol se justifican abajo. |
| Restricciones (español, < 100 ms) | ✅ Textos en español (contrato §8). Los botones de avisos muestran «Activando…» o «Enviando…» al instante. Activar depende del permiso del sistema, así que no es optimista, pero no bloquea la app. |
| App antigua congelada | ✅ `index.html`, `sw.js` de la raíz y `notificaciones/` no se tocan. Su código VAPID se copia y adapta, no se importa. |
| Flujo de calidad | ⚠️ `lint`, `typecheck`, `test` y `build` en `saas/`; prueba en la vista previa de Vercel (`quickstart.md`); la migración lleva pruebas en `db.test.ts`. **Desviación**: no se usa una rama `004-avisos-push`, porque esta sesión solo puede publicar en `claude/mvp-architecture-build-hbua5y`. Se fusiona en `master` igualmente mediante un PR. |

**Resultado**: superada, con dos excepciones justificadas en «Seguimiento de complejidad».

**Revisión tras la fase 1**: sin cambios. `data-model.md` confirma que `reminder_sender` no tiene
permisos sobre tablas. `contracts/push-api.md` confirma que la carga y los logs no llevan datos
personales y que la app no puede ejecutar las funciones del rol.

## Estructura del proyecto

### Documentación (esta funcionalidad)

```text
specs/004-avisos-push/
├── plan.md              # Este archivo
├── research.md          # Fase 0: D1–D14
├── data-model.md        # Fase 1: columnas, rol, funciones, cron y estados
├── quickstart.md        # Fase 1: pruebas automáticas, puesta en marcha y pruebas a mano
├── contracts/
│   └── push-api.md      # Lógica compartida, acciones, SQL, Edge Functions, service worker y UI
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Código fuente (`saas/`)

```text
saas/
├── .env.example                              # + NEXT_PUBLIC_VAPID_PUBLIC_KEY
├── next.config.ts                            # cabeceras de /sw.js (no-cache)
├── tsconfig.json · eslint.config.mjs         # excluir supabase/functions/*/index.ts (Deno)
├── README.md                                 # sección «Avisos push»: claves VAPID, secrets, Vault y rol; fase 2 actualizada
├── public/
│   └── sw.js                                 # NUEVO: push + notificationclick
├── supabase/
│   ├── config.toml                           # [functions.review-reminders] verify_jwt = false
│   ├── migrations/
│   │   └── 20261123000000_push_reminders.sql # NUEVA: columna, checks, rol, 3 funciones, permisos, cron condicionado
│   └── functions/
│       ├── _shared/
│       │   ├── web-push.ts                   # NUEVO: VAPID, aes128gcm, sendWebPush
│       │   └── reminders.ts                  # NUEVO: PUSH_HOSTS, isAllowedPushEndpoint, classifyPushStatus
│       ├── review-reminders/index.ts         # NUEVO (Deno): cron → claim → enviar → report
│       └── push-test/index.ts                # NUEVO (Deno): aviso de prueba con la sesión del usuario
├── src/
│   ├── proxy.ts                              # excluir sw.js del matcher
│   ├── lib/
│   │   ├── validation.ts                     # + pushSubscription, pushEndpoint
│   │   └── db/types.ts                       # + last_reminder_day, updated_at, register_push_subscription
│   ├── features/push/
│   │   ├── queries.ts                        # NUEVO: listPushEndpoints, registerPush, unregisterPush, sendTestPush
│   │   └── actions.ts                        # NUEVO: registerPushAction, unregisterPushAction, sendTestPushAction
│   ├── components/
│   │   ├── push-sync.tsx                     # NUEVO (cliente): resincroniza al abrir
│   │   └── sign-out-button.tsx               # NUEVO (cliente): da de baja el dispositivo y cierra sesión
│   └── app/(app)/
│       ├── layout.tsx                        # + <PushSync />
│       ├── settings/page.tsx                 # endpoints del usuario → <PushSettings>; <SignOutButton>
│       ├── settings/push-settings.tsx        # NUEVO (cliente): estados y botones del contrato §8
│       ├── review/page.tsx                   # lee searchParams.desde
│       └── review/review-flow.tsx            # prop fromReminder: «El repaso de hoy ya está hecho»
└── tests/
    ├── db.test.ts                            # + describe('avisos push'); stub con rol reminder_sender
    ├── web-push.test.ts                      # NUEVO
    └── validation.test.ts                    # + pushSubscription
```

**Decisión de estructura**: se mantiene la organización de `saas/`:

- dominio nuevo `features/push`;
- piezas de UI de la pantalla en `app/(app)/settings`;
- componentes compartidos en `components/`.

Las Edge Functions siguen la convención de la CLI de Supabase (`supabase/functions/<nombre>`,
`_shared` para el código común).

## Seguimiento de complejidad

| Excepción | Por qué es necesaria | Alternativa más simple descartada porque |
|---|---|---|
| Rol de BD `reminder_sender` con contraseña (principio II: «todo acceso con la sesión del usuario o la clave pública») | El envío programado tiene que decidir a quién avisar entre **todos** los usuarios, y no hay sesión de usuario en un cron. El rol solo puede ejecutar dos funciones `security definer` acotadas. Ni siquiera puede leer tablas. | La *service role* da acceso total y está prohibida expresamente. Las RPC para `anon` con un secreto como argumento exponen funciones a visitantes anónimos. El circuito `pg_net` → respuestas asíncronas es más frágil y está repartido en dos ejecuciones (research D1). |
| Dos Edge Functions de Supabase (un servicio de ejecución más) | Hace falta un cron de un minuto, que el plan gratuito de Vercel no ofrece. La clave VAPID debe estar en un solo sitio. | Vercel Cron solo se ejecuta una vez al día en el plan gratuito. Hacer el envío dentro de Postgres es imposible (no hay ECDSA P-256). |
| Dependencia `npm:postgres` (solo en la Edge Function `review-reminders`) | Para conectarse como `reminder_sender` hace falta un cliente Postgres. PostgREST solo admite los roles `anon`, `authenticated` y `service_role`. | `supabase-js` va por PostgREST, que no puede usar el rol propio. Escribir el protocolo de Postgres a mano no es razonable. |
| Cifrado RFC 8291 propio (unas 120 líneas) | Hace falta distinguir el aviso de prueba, y el push vacío está sin verificar en iOS (T042 de la spec 001). | El paquete `web-push` depende de `crypto` de Node y es más grande que el código que reemplaza. El push vacío no distingue la prueba. |
| Rama `claude/mvp-architecture-build-hbua5y` en vez de `004-avisos-push` (flujo de calidad) | Esta sesión solo puede publicar en esa rama. | — (si se prefiere, se puede renombrar la rama antes del PR). |
