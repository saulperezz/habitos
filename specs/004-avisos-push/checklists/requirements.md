# Lista de calidad de la especificación: Avisos push del repaso diario

**Propósito**: validar que la especificación está completa y tiene calidad antes de planificar
**Creada**: 2026-11-23
**Funcionalidad**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, API)
- [x] Centrada en el valor para el usuario y las necesidades del negocio
- [x] Escrita para personas no técnicas
- [x] Todas las secciones obligatorias completadas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION]
- [x] Los requisitos son comprobables y no ambiguos
- [x] Los criterios de éxito son medibles
- [x] Los criterios de éxito no dependen de la tecnología
- [x] Todos los escenarios de aceptación están definidos
- [x] Se han identificado los casos límite
- [x] El alcance está claramente delimitado
- [x] Se han identificado dependencias y supuestos

## Preparación de la funcionalidad

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales
- [x] La funcionalidad cumple los resultados medibles de los criterios de éxito
- [x] No se filtran detalles de implementación en la especificación

## Notas

- Las tecnologías (Supabase, pg_cron, Edge Function, VAPID) solo aparecen en la cita literal de la
  entrada del usuario; se decidirán en `/speckit-plan`.
- Decisiones tomadas por defecto en lugar de preguntar (ver «Supuestos» y «Casos límite»): hora del
  repaso por cuenta y no por dispositivo; un aviso por día natural; reintentos solo dentro del
  mismo día; cerrar sesión da de baja el dispositivo; un dispositivo recibe avisos de una sola
  cuenta; aviso de prueba como historia P3.
- Para el plan: la constitución prohíbe usar la clave *service role*, pero el envío necesita leer
  los dispositivos de todos los usuarios; el plan debe resolverlo (p. ej. función de BD con
  permisos acotados) o justificarlo en «Seguimiento de complejidad».
- Todas las comprobaciones superadas; lista para `/speckit-clarify` o `/speckit-plan`.
