---
id: 2026-09-24-firma-en-la-nube-ñ
domain: infra
guardrail: ios/scripts/archive.sh (paso "Verificando la firma del .ipa": codesign --verify --strict tiene que decir "satisfies its Designated Requirement" o el script falla antes de subir)
status: resolved
---

# App Store Connect rechaza el .ipa con "Invalid Signature. Code failed to satisfy specified code requirement(s)" aunque esté firmado con Apple Distribution

## Síntoma
`xcodebuild -exportArchive` con `destination = upload` (o Transporter/altool) termina con:

```
Invalid Signature. Code failed to satisfy specified code requirement(s). The file at path "Kura.app/Kura" is not properly signed.
Make sure you have signed your application with a distribution certificate, not an ad hoc certificate or a development certificate…
```

Todo lo que el mensaje sugiere revisar está bien: `codesign -dvv` muestra `Authority=Apple Distribution: … (F975J7TBHP)`,
`get-task-allow` = false, arm64, perfil "iOS Team Store Provisioning Profile", Release. Y sin embargo, en local:

```
codesign --verify --deep --strict -vv Payload/Kura.app
  valid on disk
  does not satisfy its designated Requirement
```

## Causa raíz
El nombre del team es "ERIC YAIR BRISEÑO AGUILERA". Con **firma en la nube** (`KURA_CLOUD_SIGNING=1`, es decir sin
certificado Apple Distribution en el llavero), Xcode escribe en el *designated requirement* del binario
`certificate leaf[subject.CN] = "Apple Distribution: ERIC YAIR BRISEÑO AGUILERA (F975J7TBHP)"` con la Ñ
**descompuesta** (NFD: `4e cc 83`, N + tilde combinante), mientras que el certificado que Apple emite lleva la Ñ
**compuesta** (NFC: `c3 91`). Se ven idénticas, no coinciden byte a byte: la firma es válida pero no cumple su
propio requisito, y App Store Connect la rechaza. Con un certificado Apple Distribution **local** (llave privada en
el llavero), `codesign` construye el requisito leyendo el certificado y coincide (`satisfies its Designated
Requirement`); build 203 subió a la primera.

## Prevención
- Para este team **siempre** certificado Apple Distribution local: Xcode 27 › Settings › Apple Accounts › clic en el
  team › Manage Certificates… › + › Apple Distribution. Sin `KURA_CLOUD_SIGNING`. (Xcode Cloud caería en lo mismo.)
- Guardrail ejecutable: `archive.sh` descomprime el `.ipa` exportado y exige `satisfies its Designated Requirement`
  antes de dar el export por bueno; si falla, explica la causa y el arreglo.
- Callejones sin salida: (1) el mensaje de Apple apunta a "certificado de desarrollo / target de simulador /
  Clean" y nada de eso es; (2) los foros de Apple no documentan el caso (hilos 727919 y 734011 quedan sin respuesta);
  (3) la primera vez que `codesign` usa la llave local nueva, macOS pide permiso en un diálogo del llavero y el
  export se queda esperando en silencio (9 min en nuestro caso) hasta que alguien pulsa **Always Allow** — no es un
  cuelgue del build.
