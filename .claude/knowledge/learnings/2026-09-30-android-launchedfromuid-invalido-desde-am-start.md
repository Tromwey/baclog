---
id: 2026-09-30-android-launchedfromuid-invalido-desde-am-start
domain: security
guardrail: none (necesita un Activity real; no hay Robolectric en los tests JVM — se verifica lanzando con `adb shell am start … --es kuraScreen collections` y mirando `adb logcat -s KuraDebugLaunch`)
status: resolved
---

# Android: `Activity.getLaunchedFromUid()` devuelve -1 para `adb shell am start` y los extras de depuración se ignoran

## Síntoma
Tras cerrar el agujero de `DebugLaunch` (MainActivity es exportada: cualquier app podía mandarle `kuraBearer`
y meter el teléfono en otra cuenta, o pedirle `kuraPrintBearer`), `am start … --es kuraScreen …` dejó de
funcionar en API 36: logcat decía "extras de depuración ignorados: el lanzamiento no vino de adb shell",
con y sin `-S`.

## Causa raíz
`getLaunchedFromUid()` (API 34+) solo devuelve el uid real si quien lanza optó por compartir su identidad
(`ActivityOptions.setShareIdentityEnabled(true)`). `am start` no lo hace → `Process.INVALID_UID` (-1), que
nunca es `SHELL_UID` (2000).

## Prevención
- `DebugLaunch.fromShell`: usa el uid solo si es válido; si no, `Activity.getReferrer()` debe ser
  `android-app://com.android.shell` y el intent NO debe traer `EXTRA_REFERRER`/`EXTRA_REFERRER_NAME` (con
  ellos, el referrer lo pone el llamador y es falsificable). Sin esos extras es el `launchedFromPackage` que
  registró el sistema. Solo en debug: release ignora todos los extras.
- Callejón sin salida: `Binder.getCallingUid()` en `onCreate` no sirve (es el propio proceso), y
  `getLaunchedFromPackage()` tiene la misma restricción que el uid.
