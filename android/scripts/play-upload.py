#!/usr/bin/env python3
"""Sube un .aab a Google Play y lo publica en la pista de pruebas internas.

    android/scripts/play-upload.py --check                      # solo lectura: ¿la llave tiene acceso?
    android/scripts/play-upload.py dist/kura-1.0-release.aab "notas de la versión"

Llave: ~/.kura/play-publisher.json (cuenta de servicio `kura-play-publisher` del proyecto GCP
`kura-a1f94`, invitada en Play Console › Usuarios y permisos con "Ver información de la app" y
"Publicar en pistas de prueba" sobre Kura). Fuera del repo; NUNCA commitearla.

Sin dependencias: Python estándar + `openssl` para firmar el JWT de la cuenta de servicio.
A los verificadores de la pista interna la versión les llega como actualización de Play Store.
"""
import json
import os
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from base64 import urlsafe_b64encode

PACKAGE = "com.tromwey.kura"
TRACK = "internal"
KEY = os.path.expanduser("~/.kura/play-publisher.json")
API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}"
# python.org builds ship without CA roots; macOS keeps them in /etc/ssl/cert.pem.
SSL = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)
UPLOAD = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}"


def b64(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode()


def access_token() -> str:
    sa = json.load(open(KEY))
    now = int(time.time())
    header = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = b64(json.dumps({
        "iss": sa["client_email"],
        "scope": "https://www.googleapis.com/auth/androidpublisher",
        "aud": sa["token_uri"],
        "iat": now,
        "exp": now + 3600,
    }).encode())
    signing_input = f"{header}.{claims}".encode()
    # The private key only touches a 0600 temp file for the signature, then it's gone.
    fd, path = tempfile.mkstemp(suffix=".pem")
    try:
        os.write(fd, sa["private_key"].encode())
        os.close(fd)
        sig = subprocess.run(["openssl", "dgst", "-sha256", "-sign", path], input=signing_input,
                             capture_output=True, check=True).stdout
    finally:
        os.unlink(path)
    body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": f"{signing_input.decode()}.{b64(sig)}",
    }).encode()
    return call("POST", sa["token_uri"], body, {"Content-Type": "application/x-www-form-urlencoded"})["access_token"]


def call(method, url, data=None, headers=None, token=None):
    headers = dict(headers or {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if isinstance(data, (dict, list)):
        data = json.dumps(data).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=600, context=SSL) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            pass
        sys.exit(f"Play API {method} {url.split('/applications/')[-1]} → {e.code}: {detail}")


def main():
    if not os.path.exists(KEY):
        sys.exit(f"Falta {KEY} (llave de la cuenta de servicio kura-play-publisher)")
    args = sys.argv[1:]
    token = access_token()
    edit = call("POST", f"{API}/edits", {}, token=token)["id"]
    try:
        if args[:1] == ["--check"]:
            details = call("GET", f"{API}/edits/{edit}/details", token=token)
            track = call("GET", f"{API}/edits/{edit}/tracks/{TRACK}", token=token)
            for r in track.get("releases", []):
                print(f"{TRACK}: {r.get('name', '')} · códigos {r.get('versionCodes')} · {r.get('status')}")
            print(f"Acceso OK · idioma por defecto {details.get('defaultLanguage')}")
            return
        if len(args) < 1:
            sys.exit(__doc__)
        aab, notes = args[0], (args[1] if len(args) > 1 else "")
        lang = call("GET", f"{API}/edits/{edit}/details", token=token).get("defaultLanguage", "es-419")
        with open(aab, "rb") as f:
            bundle = call("POST", f"{UPLOAD}/edits/{edit}/bundles?uploadType=media", f.read(),
                          {"Content-Type": "application/octet-stream"}, token=token)
        code = bundle["versionCode"]
        release = {"versionCodes": [str(code)], "status": "completed"}
        if notes:
            release["releaseNotes"] = [{"language": lang, "text": notes[:500]}]
        call("PUT", f"{API}/edits/{edit}/tracks/{TRACK}", {"track": TRACK, "releases": [release]}, token=token)
        call("POST", f"{API}/edits/{edit}:commit", token=token)
        edit = None  # committed: nothing to discard
        print(f"Play: versión {code} publicada en la pista '{TRACK}' (notas en {lang})")
    finally:
        if edit:
            try:
                call("DELETE", f"{API}/edits/{edit}", token=token)
            except SystemExit:
                pass


if __name__ == "__main__":
    main()
