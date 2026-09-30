#!/usr/bin/env python3
"""Anonymize the API fixtures captured from a real server, IN PLACE.

    python3 _anonymize.py [fixtures_dir] [--map-out /tmp/somewhere/map.json]

Run it on RAW captures only (it is not idempotent for ids: hashing an already
hashed id gives yet another id). What it does, consistently across every file
(same input -> same output, so relations between fixtures stay valid):

  - handles  -> qa_founder (the account in me.json), qa_persona_01, _02, ...
                (numbered by first appearance; handles already `qa_*` are kept)
  - person names -> "Persona Fundadora", "Persona Uno", "Persona Dos", ...
  - user / collection / review / party / session / feed-event UUIDs
             -> deterministic v4-shaped UUIDs (sha256), never the real ones
  - avatar keys, Apple Music library playlist ids, invite and bearer tokens,
    emails, device names -> synthetic values with the same shape
  - user-written text (collection names, vibes, party names, reviews, bios)
             -> neutral text of about the same length

Catalog ids (titles), work titles, creators, cover URLs, palettes and dates are
NOT touched: they are not personal data and the tests depend on them.

Fails closed (exit 1) when a UUID can't be classified as catalog-or-private, or
when a captured handle/name still appears in the output. `--map-out` writes the
real -> fake mapping (to update test literals); NEVER commit that file.
"""
import hashlib
import json
import pathlib
import re
import sys

SALT = "kura-fixtures-anon-v1"
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
UUID_RE = re.compile(UUID)
UUID_FULL = re.compile(f"^{UUID}$")
AVATAR_RE = re.compile(r"/api/avatar/([0-9a-f]{32})")
PEOPLE_FILE_RE = re.compile(r"^people_(.+)_(followers|following)$")
NUMS = ["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete", "Ocho", "Nueve", "Diez",
        "Once", "Doce", "Trece", "Catorce", "Quince", "Dieciséis", "Diecisiete", "Dieciocho",
        "Diecinueve", "Veinte"]
TITLE_ID_KEYS = {"titleId", "titleIds", "fanTitleIds", "coverTitleId", "chosenCoverTitleId",
                 "featuredTitleId", "obsessions", "seedTitleId", "catalogItemId"}
USER_ID_KEYS = {"userId", "authorId", "followerId", "followeeId", "hostId", "ownerId"}
FREE_TEXT_KEYS = {"bio": "Bio de prueba", "comment": "Comentario de prueba", "note": "Nota de prueba"}


def h(*parts, n=64):
    return hashlib.sha256("|".join((SALT,) + parts).encode()).hexdigest()[:n]


def fake_uuid(orig):
    x = h("uuid", orig, n=32)
    x = x[:12] + "4" + x[13:16] + "89ab"[int(x[16], 16) % 4] + x[17:]
    return f"{x[:8]}-{x[8:12]}-{x[12:16]}-{x[16:20]}-{x[20:]}"


def fake_alnum(orig, n, kind):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    digest = hashlib.sha256(f"{SALT}|{kind}|{orig}".encode()).digest()
    return "".join(alphabet[b % len(alphabet)] for b in digest)[:n]


def pad_text(prefix, n, target_len):
    s = f"{prefix} número {n}."
    while len(s) + 14 <= target_len:
        s += " Texto neutro."
    return s


def is_collection(d):
    return "id" in d and any(k in d for k in ("titleIds", "fanTitleIds", "covers"))


def is_party(d):
    return "perGuestLimit" in d


def is_session(d):
    return "deviceName" in d or ("platform" in d and "appVersion" in d)


def is_review(d):
    return "authorHandle" in d or ("body" in d and "hasSpoiler" in d)


def is_event(d):
    return isinstance(d.get("id"), str) and "kind" in d and "author" in d


class Anon:
    def __init__(self, founder):
        self.founder = founder
        self.handles = {}        # real -> fake
        self.names = {}          # real handle -> fake name
        self.private = {}        # real uuid -> (fake, category)
        self.collections = []    # real collection ids, first-appearance order
        self.texts = {}          # (kind, real) -> fake
        self.counters = {}
        self.catalog = set()     # uuids seen in catalog contexts
        self.real_names = set()  # person names seen (for the leak check)
        self.devices = {}

    # ---- mapping helpers ----
    def handle(self, real):
        if real is None:
            return None
        key = real.lower()
        if key not in self.handles:
            if key == self.founder:
                self.handles[key] = "qa_founder"
            elif key.startswith("qa_"):
                self.handles[key] = key
            else:
                n = sum(1 for v in self.handles.values() if v.startswith("qa_persona_")) + 1
                self.handles[key] = f"qa_persona_{n:02d}"
        return self.handles[key]

    def person_name(self, handle_real):
        fake = self.handle(handle_real)
        if fake == "qa_founder":
            return "Persona Fundadora"
        m = re.match(r"qa_persona_(\d+)$", fake)
        if m:
            i = int(m.group(1))
            return f"Persona {NUMS[i - 1]}" if i <= len(NUMS) else f"Persona {i}"
        return "Persona QA"

    def email(self, handle_real):
        fake = self.handle(handle_real) if handle_real else "qa_founder"
        return fake.replace("qa_", "qa.").replace("_", "") + "@example.invalid"

    def uuid(self, real, cat):
        if real not in self.private:
            self.private[real] = (fake_uuid(real), cat)
            if cat == "collection":
                self.collections.append(real)
        return self.private[real][0]

    def text(self, kind, real, prefix):
        if real is None:
            return None
        k = (kind, real)
        if k not in self.texts:
            n = self.counters[kind] = self.counters.get(kind, 0) + 1
            self.texts[k] = pad_text(prefix, n, len(real)) if kind in ("review", "free") else f"{prefix} {n}"
        return self.texts[k]

    def secret(self, kind, real):
        """Invite tokens (16 chars `[A-Za-z0-9_-]`) and Apple Music library playlist ids (`p.` + id)."""
        k = (kind, real)
        if k not in self.texts:
            if kind == "invite":
                first = not any(t[0] == "invite" for t in self.texts)
                self.texts[k] = "AbCdEfGhIjKlMnOp" if first else fake_alnum(real, 16, "invite")
            else:
                self.texts[k] = "p." + fake_alnum(real, max(len(real) - 2, 8), "playlist")
        return self.texts[k]

    def collection_name(self, cid):
        parts = cid.split("+")
        for p in parts:
            self.uuid(p, "collection")
        return " y ".join(f"Colección de prueba {self.collections.index(p) + 1}" for p in parts)

    def sub_strings(self, s):
        s = UUID_RE.sub(lambda m: self.private[m.group(0)][0] if m.group(0) in self.private else m.group(0), s)
        s = AVATAR_RE.sub(lambda m: "/api/avatar/" + h("avatar", m.group(1), n=32), s)
        return s

    # ---- pass 1: classify ids / register handles in first-appearance order ----
    def collect(self, o, parent=None):
        if isinstance(o, dict):
            if "handle" in o and isinstance(o["handle"], str):
                self.handle(o["handle"])
                if isinstance(o.get("name"), str) and "owner" not in o and not is_collection(o):
                    self.real_names.add(o["name"])
                if "id" in o and isinstance(o["id"], str) and UUID_FULL.match(o["id"]) and not is_collection(o):
                    self.uuid(o["id"], "user")
            if isinstance(o.get("owner"), str):
                self.real_names.add(o["owner"])
            if isinstance(o.get("authorHandle"), str):
                self.handle(o["authorHandle"])
            ident = o.get("id")
            if isinstance(ident, str):
                if is_collection(o):
                    self.uuid(ident, "collection")
                elif is_party(o):
                    self.uuid(ident, "party")
                elif is_session(o):
                    self.uuid(ident, "session")
                elif is_review(o):
                    self.uuid(ident, "review")
                elif is_event(o) and ":" in ident:
                    rest = ident.split(":", 1)[1]
                    if UUID_FULL.match(rest):
                        self.uuid(rest, "event")
                    else:
                        self.handle(rest)
                elif UUID_FULL.match(ident) and ("format" in o or "palette" in o or "coverUrl" in o):
                    self.catalog.add(ident)
            for k, v in o.items():
                if UUID_FULL.match(k) and parent in ("addedAt", "states"):
                    self.catalog.add(k)
                if k in TITLE_ID_KEYS:
                    for x in (v if isinstance(v, list) else [v]):
                        if isinstance(x, str) and UUID_FULL.match(x):
                            self.catalog.add(x)
                if k == "reviewId" and isinstance(v, str):
                    self.uuid(v, "review")
                if k in USER_ID_KEYS and isinstance(v, str):
                    self.uuid(v, "user")
                if k == "collectionId" and isinstance(v, str):
                    for p in v.split("+"):
                        self.uuid(p, "collection")
                if k == "collections" and isinstance(v, list):
                    for x in v:
                        if isinstance(x, str):
                            self.uuid(x, "collection")
                if k == "people" and isinstance(v, list):
                    for x in v:
                        if isinstance(x, str):
                            self.handle(x)
                if k == "token" and isinstance(v, str) and "user" not in o:
                    self.secret("invite", v)
                if k == "id" and isinstance(v, str) and parent == "playlist":
                    self.secret("playlist", v)
                if isinstance(v, str) and k == "url":
                    for m in re.finditer(r"catalogItemId=(" + UUID + ")", v):
                        self.catalog.add(m.group(1))
                self.collect(v, k)
        elif isinstance(o, list):
            for x in o:
                self.collect(x, parent)

    # ---- pass 2: rewrite ----
    def rewrite(self, o, parent=None):
        if isinstance(o, dict):
            out = {}
            person_handle = o.get("handle") if isinstance(o.get("handle"), str) else None
            for k, v in o.items():
                nk = self.sub_strings(k) if UUID_FULL.match(k) else k
                if k == "handle" and isinstance(v, str):
                    nv = self.handle(v)
                elif k == "authorHandle" and isinstance(v, str):
                    nv = self.handle(v)
                elif k == "name" and isinstance(v, str) and is_party(o):
                    nv = self.text("party", v, "Fiesta de prueba")
                elif k == "name" and isinstance(v, str) and is_collection(o):
                    nv = self.collection_name(o["id"])
                elif k == "name" and isinstance(v, str) and person_handle:
                    nv = self.person_name(person_handle)
                elif k == "owner" and isinstance(v, str):
                    nv = self.person_name(person_handle) if person_handle else "Persona QA"
                elif k == "collectionName" and isinstance(v, str):
                    nv = self.collection_name(o["collectionId"]) if isinstance(o.get("collectionId"), str) \
                        else self.text("collection-name", v, "Colección de prueba sin id")
                elif k == "vibe" and isinstance(v, str):
                    nv = self.text("vibe", v, "Vibra de prueba")
                elif k == "playlistName" and isinstance(v, str):
                    nv = self.text("party", v, "Fiesta de prueba")
                elif k in ("body", "reviewBody") and isinstance(v, str):
                    nv = self.text("review", v, "Reseña de prueba")
                elif k in FREE_TEXT_KEYS and isinstance(v, str):
                    nv = self.text("free", v, FREE_TEXT_KEYS[k])
                elif k == "email" and isinstance(v, str):
                    nv = self.email(person_handle)
                elif k == "deviceName" and isinstance(v, str):
                    nv = self.devices.setdefault(v, f"Teléfono {len(self.devices) + 1}")
                elif k in ("token", "accessToken", "refreshToken") and isinstance(v, str):
                    nv = "FAKE.TOKEN.REDACTED" if ("user" in o or k != "token") else self.secret("invite", v)
                elif k == "id" and isinstance(v, str) and parent == "playlist":
                    nv = self.secret("playlist", v)
                elif k == "id" and isinstance(v, str) and is_event(o) and ":" in v:
                    kind, rest = v.split(":", 1)
                    nv = f"{kind}:{self.private[rest][0]}" if rest in self.private else f"{kind}:{self.handle(rest)}"
                elif k == "people" and isinstance(v, list):
                    nv = [self.handle(x) if isinstance(x, str) else x for x in v]
                else:
                    nv = self.rewrite(v, k)
                out[nk] = nv
            return out
        if isinstance(o, list):
            return [self.rewrite(x, parent) for x in o]
        if isinstance(o, str):
            s = self.sub_strings(o)
            for real, fake in self.texts.items():
                if real[0] == "invite" and real[1] in s:
                    s = s.replace("/f/" + real[1], "/f/" + fake)
                if real[0] == "playlist" and real[1] in s:
                    s = s.replace(real[1], fake)
            # @mentions of known people inside server-written sentences.
            def mention(m):
                raw = m.group(1).rstrip(".")
                tail = m.group(1)[len(raw):]
                return "@" + self.handles[raw.lower()] + tail if raw.lower() in self.handles else m.group(0)
            s = re.sub(r"@([A-Za-z0-9_.]{2,30})", mention, s)
            return s
        return o


def main():
    args = sys.argv[1:]
    map_out = None
    if "--map-out" in args:
        i = args.index("--map-out")
        map_out = args[i + 1]
        del args[i:i + 2]
    root = pathlib.Path(args[0] if args else pathlib.Path(__file__).parent)
    files = sorted(p for p in root.glob("*.json"))
    docs = {p: json.loads(p.read_text(encoding="utf-8")) for p in files}
    me = root / "me.json"
    founder = json.loads(me.read_text(encoding="utf-8"))["handle"].lower() if me.exists() else None
    a = Anon(founder)
    for p in files:
        a.collect(docs[p])
    for p in files:  # handles that only show up in a file name (people_<handle>_followers.json)
        m = PEOPLE_FILE_RE.match(p.stem)
        if m:
            a.handle(m.group(1))

    clash = set(a.private) & a.catalog
    if clash:
        sys.exit(f"ids que son catálogo Y privados a la vez (revisa las reglas): {sorted(clash)}")

    real_handles = {k for k, v in a.handles.items() if k != v}
    outputs = {}
    for p in files:
        original = p.read_text(encoding="utf-8")
        new = a.rewrite(docs[p])
        pretty = "\n " in original
        text = json.dumps(new, ensure_ascii=False, indent=1 if pretty else None,
                          separators=None if pretty else (",", ":"))
        if original.endswith("\n"):
            text += "\n"
        m = PEOPLE_FILE_RE.match(p.stem)
        target = p.with_name(f"people_{a.handle(m.group(1))}_{m.group(2)}.json") if m else p
        outputs[p] = (target, text)

    # Fail closed: nothing unclassified, nothing real left.
    problems = []
    fakes = {v[0] for v in a.private.values()}
    for p, (target, text) in outputs.items():
        # Whole values/keys and the ids embedded in event ids, cursors and `a+b` collection ids (not the
        # uuid-shaped path segments of cover URLs, which are the CDN's).
        for u in set(re.findall(rf'(?<=["+:]){UUID}(?=["+])', text)):
            if u not in a.catalog and u not in fakes:
                problems.append(f"{target.name}: UUID sin clasificar {u}")
        for r in real_handles:
            if re.search(rf'"{re.escape(r)}"|@{re.escape(r)}(?![A-Za-z0-9_])|:{re.escape(r)}"', text, re.IGNORECASE):
                problems.append(f"{target.name}: queda un handle real")
        for kind_real in a.texts:
            if kind_real[0] in ("playlist",) and kind_real[1] in text:
                problems.append(f"{target.name}: queda un id de playlist real")
        for n in a.real_names:
            if f'"{n}"' in text:
                problems.append(f"{target.name}: queda un nombre real")
    if problems:
        sys.exit("NO se escribió nada:\n" + "\n".join(sorted(set(problems))))

    for p, (target, text) in outputs.items():
        target.write_text(text, encoding="utf-8")
        if target != p:
            p.unlink()

    counts = {}
    for _, cat in a.private.values():
        counts[cat] = counts.get(cat, 0) + 1
    print(f"handles: {len(real_handles)} · nombres: {len(a.real_names)} · uuids: {counts} · "
          f"textos: { {k: v for k, v in a.counters.items()} } · archivos: {len(files)}")
    if map_out:
        pathlib.Path(map_out).write_text(json.dumps({
            "handles": a.handles,
            "uuids": {k: v[0] for k, v in a.private.items()},
            "texts": {f"{k[0]}::{k[1]}": v for k, v in a.texts.items()},
        }, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
