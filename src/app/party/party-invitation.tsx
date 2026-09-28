"use client";

import { Component, createElement, createRef, type FormEvent } from "react";
import { checkPartyCostumeAction, submitPartyRsvpAction } from "@/app/actions/party-actions";
import { PARTY_DIETS, PARTY_EVENT } from "@/modules/party/event";
import { PartyScene } from "./party-scene";

/*
 * The /party invitation — a port of the Claude Design file "Invitacion
 * Cementerio Iso.dc.html" (project 3cd00900…). Structure kept on purpose:
 * this class is the design's `Component extends DCLogic` (state + renderVals)
 * and ./party-scene.tsx is its template, converted 1:1 to JSX. Re-importing a
 * new version of the design = regenerate the scene, diff this logic.
 *
 * Deviations from the design:
 * - The RSVP goes to the DB (submitPartyRsvpAction) instead of only
 *   localStorage — the host actually receives it (Torre › /admin/party).
 *   localStorage still keeps the guest's own copy + their anonymous token.
 * - "Alguien ya va de X" asks the server (exact normalized match) instead of
 *   a hard-coded list, and never reveals another guest's costume.
 * - Rendered client-only (ssr:false in ./party-client.tsx): the scene reads
 *   window size and Date.now() on every render.
 */

type SecretKey = "host" | "date" | "place" | "bring" | "theme";
type AnchorKey = SecretKey | "start" | "rsvp";
type Form = {
  name: string;
  attending: boolean;
  plusOne: boolean;
  plusName: string;
  diets: string[];
  drink: string;
  costume: string;
};
type State = {
  entered: boolean;
  opening?: boolean;
  revealed?: boolean;
  lx: number | null;
  ly: number | null;
  lampX?: number;
  lampY?: number;
  now: number;
  audio: boolean;
  px: number;
  py: number;
  dragging: boolean;
  open: AnchorKey | null;
  seen: Partial<Record<AnchorKey, boolean>>;
  submitted: boolean;
  sending: boolean;
  error: string;
  msg: string;
  dupTaken: boolean;
  f: Form;
};

const STORAGE_KEY = "party_rsvp";
const TOKEN_KEY = "party_guest";
const SECRETS: SecretKey[] = ["host", "date", "place", "bring", "theme"];
const S = 0.9;
const ANCHORS: Record<AnchorKey, [number, number, number]> = {
  start: [1420, 1420, 40],
  date: [1075, 1241, 120],
  host: [392, 1141, 110],
  theme: [1306, 410, 150],
  place: [782, 701, 100],
  bring: [998, 665, 60],
  rsvp: [200, 165, 130],
};

function focus(k: AnchorKey, sheet: boolean) {
  const [x, y, z] = ANCHORS[k];
  const dx = x - 800,
    dy = y - 800;
  const sx = (dx - dy) * 0.7071 * S,
    sy = ((dx + dy) * 0.3536 - z * 0.866) * S;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  return { px: -sx, py: -sy + (sheet ? -H * 0.26 : 40) };
}

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

function guestToken(): string {
  try {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      t = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
  } catch {
    return crypto.randomUUID();
  }
}

export default class PartyInvitation extends Component<object, State> {
  state: State = {
    entered: false,
    lx: null,
    ly: null,
    now: Date.now(),
    audio: false,
    dragging: false,
    open: null,
    seen: {},
    submitted: false,
    sending: false,
    error: "",
    msg: "",
    dupTaken: false,
    f: { name: "", attending: true, plusOne: false, plusName: "", diets: [], drink: "", costume: "" },
    ...focus("start", false),
  };

  lampRef = createRef<HTMLDivElement>();
  ctx: AudioContext | null = null;
  drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  wasDrag = false;
  mt: ReturnType<typeof setTimeout> | undefined;
  dupT: ReturnType<typeof setTimeout> | undefined;
  t: ReturnType<typeof setInterval> | undefined;
  token = "";

  measureLamp = () => {
    const el = this.lampRef.current;
    const sec = el?.closest("section");
    if (!el || !sec) return;
    const r = el.getBoundingClientRect(),
      p = sec.getBoundingClientRect();
    this.setState({
      lampX: Math.round(r.left + r.width / 2 - p.left),
      lampY: Math.round(r.top + r.height / 2 - p.top),
    });
  };

  mv = (e: PointerEvent | TouchEvent) => {
    const t = "touches" in e ? e.touches[0] : e;
    if (t) this.setState({ lx: t.clientX, ly: t.clientY });
  };

  componentDidMount() {
    this.token = guestToken();
    this.measureLamp();
    setTimeout(this.measureLamp, 400);
    window.addEventListener("resize", this.measureLamp);
    window.addEventListener("pointermove", this.mv);
    window.addEventListener("touchstart", this.mv, { passive: true });
    window.addEventListener("touchmove", this.mv, { passive: true });
    this.t = setInterval(() => this.setState({ now: Date.now() }), 1000);
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (s) this.setState({ f: s, submitted: true });
    } catch {}
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.measureLamp);
    window.removeEventListener("pointermove", this.mv);
    window.removeEventListener("touchstart", this.mv);
    window.removeEventListener("touchmove", this.mv);
    clearInterval(this.t);
    clearTimeout(this.mt);
    clearTimeout(this.dupT);
    this.ctx?.close();
  }

  startAudio() {
    if (!this.ctx) {
      const C =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new C();
      this.ctx = ctx;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      [55, 55.6, 82.4, 110.3].forEach((f, k) => {
        const o = ctx.createOscillator();
        o.type = k % 2 ? "sawtooth" : "triangle";
        o.frequency.value = f;
        o.connect(lp);
        o.start();
      });
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lg = ctx.createGain();
      lg.gain.value = 220;
      lfo.connect(lg);
      lg.connect(lp.frequency);
      lfo.start();
      lp.connect(g);
      g.connect(ctx.destination);
    } else this.ctx.resume();
  }

  setF(p: Partial<Form>) {
    this.setState((s) => ({ f: { ...s.f, ...p } }));
  }

  flash(msg: string, ms: number) {
    clearTimeout(this.mt);
    this.setState({ msg });
    this.mt = setTimeout(() => this.setState({ msg: "" }), ms);
  }

  openKey(k: AnchorKey) {
    if (this.wasDrag) {
      this.wasDrag = false;
      return;
    }
    if (k === "rsvp" && !SECRETS.every((x) => this.state.seen[x])) {
      this.flash("Sellada. Descubre los 5 secretos primero.", 2600);
      return;
    }
    this.setState((s) => ({ open: k, seen: { ...s.seen, [k]: true }, ...focus(k, true) }));
  }

  setCostume(costume: string) {
    this.setF({ costume });
    clearTimeout(this.dupT);
    if (costume.trim().length < 3) {
      this.setState({ dupTaken: false });
      return;
    }
    this.dupT = setTimeout(async () => {
      const taken = await checkPartyCostumeAction(costume, this.token).catch(() => false);
      if (this.state.f.costume === costume) this.setState({ dupTaken: taken });
    }, 450);
  }

  async submit(e: FormEvent) {
    e.preventDefault();
    const { f } = this.state;
    this.setState({ sending: true, error: "" });
    const res = await submitPartyRsvpAction({ guestToken: this.token, ...f }).catch(() => null);
    if (!res || "error" in res) {
      this.setState({
        sending: false,
        error:
          res?.error === "full"
            ? "La cripta está llena. Escríbele al anfitrión."
            : "No se pudo enviar. Revisa tu conexión e inténtalo otra vez.",
      });
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
    } catch {}
    this.setState({ submitted: true, sending: false });
  }

  renderVals() {
    const { f, now, open, seen } = this.state;
    const W = window;
    const lx = this.state.lx ?? W.innerWidth / 2,
      ly = this.state.ly ?? W.innerHeight * 0.6;
    const { title, venue, address } = PARTY_EVENT;
    const d = new Date(PARTY_EVENT.dateISO);
    let diff = Math.max(0, d.getTime() - now);
    const pad = (n: number) => String(n).padStart(2, "0");
    const days = Math.floor(diff / 864e5);
    diff -= days * 864e5;
    const h = Math.floor(diff / 36e5);
    diff -= h * 36e5;
    const m = Math.floor(diff / 6e4);
    const s = Math.floor((diff - m * 6e4) / 1000);
    const q = encodeURIComponent(address || venue);
    const on = { border: "#d9573b", bg: "rgba(217,87,59,.15)", color: "#ece6dc" },
      off = { border: "rgba(236,230,220,.18)", bg: "#0d0b0a", color: "#bdb3a8" };
    const foundCount = SECRETS.filter((k) => seen[k]).length;
    const nextKey = SECRETS.find((k) => !seen[k] && k !== open);
    const sw = Math.min(W.innerWidth, 440);
    const project = (k: AnchorKey) => {
      const [x, y, z] = ANCHORS[k];
      const dx = x - 800,
        dy = y - 800;
      return {
        x: this.state.px + (dx - dy) * 0.7071 * S,
        y: this.state.py + ((dx + dy) * 0.3536 - z * 0.6) * S,
      };
    };

    const edge = (() => {
      if (foundCount !== 5 || seen.rsvp || open) return { edgeOn: false, edgeX: "0px", edgeY: "0px" };
      const sh = W.innerHeight;
      const p = project("rsvp");
      const cx = sw / 2 + p.x,
        cy = sh / 2 + p.y;
      const mg = 30;
      const offScreen = cx < mg || cx > sw - mg || cy < mg || cy > sh - mg;
      return {
        edgeOn: offScreen,
        edgeX: Math.round(Math.max(0, Math.min(sw, cx))) + "px",
        edgeY: Math.round(Math.max(0, Math.min(sh, cy))) + "px",
      };
    })();

    const cal = (() => {
      const fmt = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const end = new Date(d.getTime() + 5 * 36e5);
      const loc = [venue, address].filter(Boolean).join(", ");
      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        `UID:${d.getTime()}@invitacion`,
        `DTSTART:${fmt(d)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${title}`,
        `LOCATION:${loc}`,
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
      return {
        gcalUrl: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(d)}/${fmt(end)}&location=${encodeURIComponent(loc)}`,
        icsUrl: "data:text/calendar;charset=utf-8," + encodeURIComponent(ics),
      };
    })();

    return {
      deathText: this.state.now % 2 ? "ERROR" : "▒▒ de ▒▒▒▒ de 20▒▒",
      notEntered: !this.state.entered,
      entered: this.state.entered,
      revealScale: this.state.revealed ? "scale(1)" : "scale(1.18)",
      revealOp: this.state.revealed ? 0 : 1,
      revealCore: this.state.revealed ? 0 : 1,
      revealR: this.state.revealed ? "70%" : "0%",
      enter: () => {
        if (this.state.opening) return;
        this.setState({ opening: true });
        this.startAudio();
        this.setState({ audio: true });
        setTimeout(() => {
          this.setState({ entered: true });
          setTimeout(() => this.setState({ revealed: true }), 60);
        }, 1500);
      },
      doorL: this.state.opening ? "rotateY(-105deg)" : "rotateY(0deg)",
      doorR: this.state.opening ? "rotateY(105deg)" : "rotateY(0deg)",
      lampX: this.state.lampX ?? 330,
      lampY: this.state.lampY ?? 300,
      gateZoom: this.state.opening ? "scale(1.6)" : "scale(1)",
      glowOp: this.state.opening ? 1 : 0.7,
      copyOp: this.state.opening ? 0 : 1,
      fadeOp: this.state.opening ? 1 : 0,
      toggleAudio: () => {
        if (this.state.audio) this.ctx?.suspend();
        else this.startAudio();
        this.setState({ audio: !this.state.audio });
      },
      audioLabel: this.state.audio ? "SONIDO ON" : "SONIDO OFF",
      audioInk: "#b3140f",
      darkOn: true,
      ...edge,
      darkMask: [
        `radial-gradient(circle 125px at ${lx}px ${ly}px, rgba(0,0,0,0) 0%, rgba(0,0,0,.21) 40%, rgba(0,0,0,.85) 75%, #000 100%)`,
      ]
        .concat(
          (SECRETS.filter((k) => seen[k]) as AnchorKey[])
            .concat(foundCount === 5 ? ["rsvp"] : [])
            .map((k) => {
              const p = project(k);
              const cx = (W.innerWidth - sw) / 2 + sw / 2 + p.x;
              const cy = W.innerHeight / 2 + p.y;
              return `radial-gradient(circle ${k === "rsvp" ? 150 : 115}px at ${Math.round(cx)}px ${Math.round(cy)}px, rgba(0,0,0,0) 0%, rgba(0,0,0,.21) 40%, rgba(0,0,0,.85) 75%, #000 100%)`;
            }),
        )
        .join(", "),
      fog: createElement(
        "div",
        { style: { position: "absolute", inset: "-20%", pointerEvents: "none", filter: "blur(60px)" } },
        createElement("div", { style: { position: "absolute", left: "0", top: "55%", width: "80%", height: "30%", borderRadius: "50%", background: "rgba(160,150,140,.16)", animation: "pt-fogA 22s ease-in-out infinite" } }),
        createElement("div", { style: { position: "absolute", right: "0", top: "62%", width: "70%", height: "30%", borderRadius: "50%", background: "rgba(120,110,105,.18)", animation: "pt-fogB 28s ease-in-out infinite" } }),
        createElement("div", { style: { position: "absolute", left: "30%", top: "15%", width: "40%", height: "25%", borderRadius: "50%", background: "rgba(217,87,59,.1)", animation: "pt-fogB 18s ease-in-out infinite" } }),
      ),
      onPD: (e: React.PointerEvent) => {
        this.drag = { x: e.clientX, y: e.clientY, px: this.state.px, py: this.state.py, moved: false };
        this.setState({ dragging: true });
      },
      onPM: (e: React.PointerEvent) => {
        const g = this.drag;
        if (!g) return;
        const dx = e.clientX - g.x,
          dy = e.clientY - g.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) g.moved = true;
        if (g.moved) this.setState({ px: clamp(g.px + dx, 1080), py: clamp(g.py + dy, 640) });
      },
      onPU: () => {
        if (this.drag) {
          this.wasDrag = this.drag.moved;
          this.drag = null;
          this.setState({ dragging: false });
          setTimeout(() => {
            this.wasDrag = false;
          }, 50);
        }
      },
      camTransform: `translate(${this.state.px}px, ${this.state.py}px) scale(${S})`,
      camTrans: this.state.dragging ? "none" : "transform .7s cubic-bezier(.2,.8,.2,1)",
      moonX: Math.round(sw * 0.66 + this.state.px * 0.04),
      showHint: foundCount === 0 || (foundCount === 5 && !seen.rsvp && !open),
      hintKey: foundCount === 5 ? "h5" : "h0",
      hasMsg: !!this.state.msg,
      msg: this.state.msg,
      decoy: () => {
        if (this.wasDrag) {
          this.wasDrag = false;
          return;
        }
        const msgs = [
          "Aquí solo hay huesos.",
          "Esta tumba no guarda secretos.",
          "Frío… sigue buscando.",
          "Alguien descansa aquí. No lo despiertes.",
          "Nada. Solo polvo y silencio.",
          "Esa lápida no es para ti.",
        ];
        this.flash(msgs[Math.floor(Math.random() * msgs.length)], 2200);
      },
      cDate: seen.date ? 1 : 0,
      cHost: seen.host ? 1 : 0,
      cTheme: seen.theme ? 1 : 0,
      cPlace: seen.place ? 1 : 0,
      cBring: seen.bring ? 1 : 0,
      cRsvp: foundCount === 5 ? 1 : 0,
      rsvpDoor:
        foundCount === 5
          ? "radial-gradient(ellipse at 50% 100%,rgba(255,120,80,.95),rgba(217,87,59,.6) 45%,rgba(40,16,10,.95) 80%)"
          : "radial-gradient(ellipse at 50% 100%,rgba(30,26,22,.9),rgba(8,7,6,.98) 70%)",
      rsvpShadow: foundCount === 5 ? "0 0 50px 10px rgba(217,87,59,.6)" : "none",
      rsvpInk: foundCount === 5 ? "#fff1e8" : "#4a433c",
      openBring: () => this.openKey("bring"),
      hintText: foundCount === 5 ? "La cripta se ha abierto" : "Busca los 5 secretos escondidos entre las tumbas",
      isBring: open === "bring",
      dateBig: d.toLocaleDateString("es", { day: "numeric", month: "long" }),
      glow: createElement("div", {
        style: {
          position: "absolute",
          inset: -50,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,170,90,.45), rgba(255,140,60,.12) 45%, transparent 70%)",
          animation: "pt-candle 1.4s ease-in-out infinite",
        },
      }),
      cdDays: String(days),
      cdClock: `${pad(h)}:${pad(m)}:${pad(s)}`,
      host: PARTY_EVENT.host,
      venue,
      address,
      openDate: () => this.openKey("date"),
      openHost: () => this.openKey("host"),
      openTheme: () => this.openKey("theme"),
      openPlace: () => this.openKey("place"),
      openRsvp: () => this.openKey("rsvp"),
      foundCount,
      dots: SECRETS.map((k) => ({ c: seen[k] ? "#e8785d" : "rgba(236,230,220,.18)" })),
      sheetOpen: !!open,
      isDate: open === "date",
      isHost: open === "host",
      isTheme: open === "theme",
      isPlace: open === "place",
      isRsvp: open === "rsvp",
      close: () => {
        this.setState({ open: null, py: this.state.py + window.innerHeight * 0.26 - 40 });
      },
      closeLabel: foundCount === 5 ? "Volver al cementerio" : nextKey ? "Seguir explorando" : "Volver al cementerio",
      dateLabel:
        d.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }) +
        " · " +
        d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) +
        " h",
      ...cal,
      countdown: [
        { v: pad(days), l: "Días" },
        { v: pad(h), l: "Horas" },
        { v: pad(m), l: "Min" },
        { v: pad(s), l: "Seg" },
      ],
      hasAddress: !!address,
      gmapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}`,
      wazeUrl: `https://waze.com/ul?q=${q}&navigate=yes`,
      f,
      notSubmitted: !this.state.submitted,
      submitted: this.state.submitted,
      setName: (e: React.ChangeEvent<HTMLInputElement>) => this.setF({ name: e.target.value }),
      setPlusName: (e: React.ChangeEvent<HTMLInputElement>) => this.setF({ plusName: e.target.value }),
      setDrink: (e: React.ChangeEvent<HTMLSelectElement>) => this.setF({ drink: e.target.value }),
      setCostume: (e: React.ChangeEvent<HTMLInputElement>) => this.setCostume(e.target.value),
      togglePlus: () => this.setF({ plusOne: !f.plusOne }),
      plusTrack: f.plusOne ? "#d9573b" : "rgba(236,230,220,.18)",
      plusJustify: f.plusOne ? "flex-end" : "flex-start",
      attendOpts: ([["Sí, ahí estaré", true], ["No podré", false]] as const).map(([label, val]) => ({
        label,
        ...(f.attending === val ? on : off),
        pick: () => this.setF({ attending: val }),
      })),
      diets: PARTY_DIETS.map((label) => {
        const sel = f.diets.includes(label);
        return {
          label,
          ...(sel ? on : off),
          toggle: () => this.setF({ diets: sel ? f.diets.filter((x) => x !== label) : [...f.diets, label] }),
        };
      }),
      dupWarning: this.state.dupTaken && f.costume.trim().length > 2,
      dupName: f.costume.trim(),
      submit: (e: FormEvent) => void this.submit(e),
      sending: this.state.sending,
      submitLabel: this.state.sending ? "Enviando…" : "Enviar confirmación",
      hasError: !!this.state.error,
      error: this.state.error,
      editRsvp: () => this.setState({ submitted: false }),
      thanksTitle: f.attending ? `Te esperamos, ${f.name.split(" ")[0] || "invitado"}.` : "Te extrañaremos.",
      thanksBody: f.attending
        ? `Confirmado${f.plusOne ? " con +1" + (f.plusName ? " (" + f.plusName + ")" : "") : ""}.${f.costume ? " Tu secreto está a salvo: " + f.costume + "." : ""} Te avisaremos el lugar antes de la fiesta.`
        : "Gracias por avisar. Si cambias de planes, puedes editar tu respuesta.",
    };
  }

  render() {
    return <PartyScene v={this.renderVals()} lampRef={this.lampRef} />;
  }
}

export type SceneVals = ReturnType<PartyInvitation["renderVals"]>;
