# Guía de validación: Avisos push del repaso diario

## 1. Pruebas automáticas (CI)

```bash
cd saas
npm run lint && npm run typecheck && npm test && npm run build
```

Deben pasar, además de las pruebas actuales:

- **`tests/db.test.ts › avisos push`** (PGlite con un *stub* que añade el rol `reminder_sender`):
  - `register_push_subscription` registra; el mismo endpoint en otra cuenta pasa a la última
    (FR-006); el límite de 10 → `limit_exceeded`; un endpoint con host no permitido o claves mal
    formadas se rechaza; `anon` no puede ejecutarla.
  - Activar después de la hora fija `last_reminder_day` = hoy (research D4).
  - `claim_due_reminders` con `now()` fijado mediante una variable de prueba o un parámetro:
    - devuelve el usuario cuando toca;
    - no lo devuelve si el repaso del día está completado, el repaso está desactivado, no tiene
      hábitos activos o ya se le avisó hoy;
    - con la hora a las 02:00 aplica la regla de las 04:00;
    - dos llamadas seguidas no devuelven al mismo usuario.
  - `report_reminder_results`: `gone` borra el dispositivo; si todo es `retry`, se puede volver a
    reclamar; si hay un `sent` y un `retry`, no.
  - `reminder_sender` no puede leer `habits`, `profiles` ni `push_subscriptions` directamente;
    `authenticated` no puede ejecutar `claim_due_reminders` ni `report_reminder_results`.
  - Borrar la cuenta borra sus dispositivos.
- **`tests/web-push.test.ts`**:
  - `encryptPayload` → se descifra con la clave privada de una suscripción generada en la prueba
    (RFC 8291);
  - el JWT de `vapidAuthorization` se verifica con la clave pública, con `aud`, `exp` y `sub`
    correctos;
  - `isAllowedPushEndpoint` y `classifyPushStatus`.
- **`tests/validation.test.ts`**: `pushSubscription` acepta un `toJSON()` real y rechaza hosts y
  claves no válidos.

Para que la función se pueda probar, `claim_due_reminders` acepta `p_now timestamptz default
now()`. Ese parámetro solo lo puede usar `reminder_sender`, y en las pruebas se pasa explícitamente.

## 2. Puesta en marcha en Supabase y Vercel

1. **Claves VAPID**: generar el par de claves con el fragmento de Web Crypto de
   `saas/README.md › Avisos push`. Salen una JWK privada y una clave pública en base64url.
2. **Migración**: `npx supabase db push`. Comprobar en el panel que existe el trabajo `cron`
   `review-reminders`.
3. **Rol de envío** (en *SQL Editor*):
   `alter role reminder_sender with login password '<contraseña larga aleatoria>';`
4. **Secrets de las funciones**:
   ```bash
   npx supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY='{"kty":"EC",…}' \
     VAPID_SUBJECT=mailto:… REMINDERS_CRON_SECRET=<aleatorio> \
     REMINDER_SENDER_DB_URL='postgresql://reminder_sender.<ref>:<contraseña>@<pooler>:6543/postgres'
   npx supabase functions deploy review-reminders --no-verify-jwt
   npx supabase functions deploy push-test
   ```
5. **Vault** (en *SQL Editor*):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/review-reminders', 'reminders_function_url');
   select vault.create_secret('<el mismo REMINDERS_CRON_SECRET>', 'reminders_cron_secret');
   ```
6. **Vercel**: añadir `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y volver a desplegar.
7. **Comprobaciones**:
   - `curl -X POST …/functions/v1/review-reminders` sin cabecera → `401`; con la cabecera → `202`.
   - En `cron.job_run_details`, las ejecuciones aparecen con estado `succeeded`.

## 3. Pruebas a mano (vista previa de Vercel, ancho de móvil)

Hay que usar un usuario con al menos un hábito.

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | Android o escritorio (Chrome): *Ajustes › Activar avisos* › permitir | «Avisos activados en este dispositivo ✓». Con la hora futura: «El primero llegará a las HH:MM». |
| 2 | «Enviar aviso de prueba» | En menos de 30 s llega «Los avisos funcionan ✓» solo a ese dispositivo (US4). |
| 3 | Pulsar la prueba 6 veces seguidas | La sexta muestra «Espera un momento antes de enviar otra prueba.» |
| 4 | Poner la hora del repaso 2 min después de ahora, cerrar la app y esperar | Llega «¿Qué tal hoy? Haz el repaso de tus hábitos» en ≤ 2 min (SC-001). Solo uno. |
| 5 | Tocar el aviso | Se abre `/review` en el primer hábito sin responder (US2). |
| 6 | Completar el repaso, poner la hora 2 min después y esperar | No llega nada (escenario 1.2). |
| 7 | Con el repaso completado, enviar la prueba y tocar el aviso | Se ve «El repaso de hoy ya está hecho» y el resumen. |
| 8 | iPhone en Safari sin instalar › Ajustes | Se ve el texto de añadir a la pantalla de inicio, sin botón. |
| 9 | iPhone con la app instalada: repetir 1, 2, 4 y 5 | Igual que en Android (es la prueba pendiente de T042 de la spec 001). |
| 10 | Activar en dos dispositivos y desactivar en uno | Solo el otro recibe el aviso al día siguiente (US3). |
| 11 | Cerrar sesión en un dispositivo con avisos | Ese dispositivo deja de recibirlos. |
| 12 | Bloquear el permiso en el sistema y volver a Ajustes | «Has bloqueado los avisos…». |
| 13 | Desactivar «Repaso diario» | No llega el aviso; al reactivarlo vuelve sin pedir permiso. |
| 14 | Modo oscuro, 360 px y 430 px | Sin desplazamiento horizontal; botones ≥ 44 px. |
