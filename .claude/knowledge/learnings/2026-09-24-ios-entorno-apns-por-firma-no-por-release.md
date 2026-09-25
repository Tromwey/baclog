---
id: 2026-09-24-ios-entorno-apns-por-firma-no-por-release
domain: infra
guardrail: none (depende de cómo se firma cada instalación; se verifica con `codesign -d --entitlements :-` sobre el .app)
status: resolved
---

# Push no llega a un iPhone con un build Release instalado por cable

## Síntoma
La app registra su token (`PUT /me/devices/{token}` responde 204), pero ningún push llega; en el
log del servidor el envío a APNs responde `BadDeviceToken` y el token se borra solo.

## Causa raíz
`PushRegistration.environment` decidía `sandbox`/`production` con `#if DEBUG`. Un build **Release**
instalado por cable (`xcodebuild -configuration Release` + `devicectl device install`) se firma con
el perfil de **desarrollo**: su `aps-environment` es `development` y APNs le da un token de
**sandbox**. La app lo declaraba `production`, el servidor lo mandaba a `api.push.apple.com`, APNs lo
rechazaba y la poda lo borraba. Solo TestFlight / App Store (firmados para distribución) son
`production`.

## Prevención
- El fix: `environment` se lee del `embedded.mobileprovision` del propio binario
  (`Entitlements.aps-environment`); sin perfil incluido (TestFlight, App Store) = `production`.
- Para verificar una instalación: `codesign -d --entitlements :- Kura.app | plutil -p - | grep aps`
  y `security cms -D -i Kura.app/embedded.mobileprovision | plutil -extract Entitlements.aps-environment raw -`.
- Callejón sin salida: ligar el entorno a la configuración (Debug/Release) o a `#if DEBUG`. Lo que
  manda es la firma, y el mismo Release puede ir firmado de las dos formas.
