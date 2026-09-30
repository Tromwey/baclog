/*
 * GENERATED from the Claude Design template "Invitacion Cementerio Iso.dc.html"
 * (project 3cd00900…) by a one-off DC→JSX converter: inline styles, sc-if →
 * ternaries, sc-for → map. Values come from PartyInvitation.renderVals()
 * (./party-invitation.tsx); the lamp ref travels as its own prop. Edits by hand:
 * the submit button's sending state and the error line above it; the host
 * sheet's dates on two lines; candles instead of the progress bars; and the
 * cauldron (+ its candies and candle) moved -296,-483, away from the map tomb;
 * the landing's path behind the gate is <PartyPath /> (./party-path.tsx); the
 * secret tombs show <SealedFace/> until found; decor from ./party-decor.tsx;
 * teaser mode (PARTY_EVENT.locked) chains the gate and swaps the sign to MUY PRONTO;
 * the secrets bar spans the full screen (no 440 cap), inset by the safe areas. Keyframes are prefixed "pt-" (./party.css).
 */
import { Fragment, type RefObject } from "react";
import type { SceneVals } from "./party-invitation";
import { GateChains, LandingSky, LandingTree, SealedFace, WorldDecor } from "./party-decor";
import { PartyPath } from "./party-path";
import { PartyPlaylistCard } from "./party-playlist-card";

export function PartyScene({ v, lampRef }: { v: SceneVals; lampRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#050404", color: "#ece6dc", fontFamily: "var(--pt-sans)", position: "relative", overflow: "hidden" }}>
      <button onClick={v.toggleAudio} aria-label="Audio" style={{ position: "fixed", top: "calc(16px + env(safe-area-inset-top))", right: "calc(16px + env(safe-area-inset-right))", zIndex: "50", display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 16px", borderRadius: "999px", border: "none", background: "none", color: "#ece6dc", fontFamily: "var(--pt-mono)", fontSize: "12px", letterSpacing: ".08em", cursor: "pointer" }}>
        <span style={{ color: v.audioInk }}>
          {v.audioLabel}
        </span>
      </button>
      {v.notEntered ? (
          <section data-screen-label="01 Portada" onClick={v.enter} style={{ cursor: "pointer", WebkitTapHighlightColor: "transparent", position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "28px", padding: "88px 24px 40px", overflow: "hidden", textAlign: "center", background: "radial-gradient(ellipse at 70% 12%,#15161c,#0a090b 55%,#050404)" }}>
            <LandingSky />
            <div style={{ position: "absolute", top: "70px", right: "14%", width: "64px", height: "64px", borderRadius: "50%", background: "#d8d2c4", boxShadow: "0 0 50px 16px rgba(233,226,210,.1),0 0 160px 60px rgba(233,226,210,.04)" }} />
            <div style={{ position: "absolute", left: "-40%", right: "-40%", top: "-40px", height: "280px", pointerEvents: "none", zIndex: "1" }}>
              <div style={{ position: "absolute", left: "10%", top: "10px", width: "55%", height: "120px", borderRadius: "50%", background: "#0b0b10", filter: "blur(18px)", boxShadow: "0 18px 30px -10px rgba(90,90,105,.25)", animation: "pt-cloudA 40s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", right: "8%", top: "40px", width: "50%", height: "110px", borderRadius: "50%", background: "#0e0e13", filter: "blur(16px)", boxShadow: "0 16px 26px -10px rgba(110,108,120,.28)", animation: "pt-cloudA 32s ease-in-out infinite alternate-reverse" }} />
              <div style={{ position: "absolute", left: "30%", top: "110px", width: "45%", height: "80px", borderRadius: "50%", background: "#09090c", filter: "blur(20px)", animation: "pt-cloudA 26s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", left: "58%", top: "96px", width: "26%", height: "52px", borderRadius: "50%", background: "rgba(20,20,26,.9)", filter: "blur(12px)", animation: "pt-cloudA 22s ease-in-out infinite alternate-reverse" }} />
            </div>
            <div style={{ position: "relative", width: "300px", height: "372px", flexShrink: "0", transform: v.gateZoom, transformOrigin: "50% 70%", transition: "transform 1.5s cubic-bezier(.6,0,.3,1)" }}>
              <LandingTree />
              <div style={{ position: "absolute", left: "-260px", right: "-260px", bottom: "0", height: "58px", zIndex: "1", background: "repeating-linear-gradient(90deg,rgba(0,0,0,.35) 0 2px,transparent 2px 46px),repeating-linear-gradient(0deg,rgba(0,0,0,.4) 0 2px,transparent 2px 20px),linear-gradient(180deg,#39332d,#1e1a17)", borderTop: "6px solid #4a433c" }}>
                <div style={{ position: "absolute", inset: "-6px 0 0 0", background: "radial-gradient(ellipse 40px 10px at 12% 0,rgba(40,54,32,.9),transparent),radial-gradient(ellipse 30px 8px at 88% 0,rgba(40,54,32,.9),transparent),radial-gradient(ellipse 60px 30px at 20% 100%,rgba(0,0,0,.5),transparent),radial-gradient(ellipse 50px 24px at 80% 60%,rgba(0,0,0,.45),transparent)" }} />
                <div style={{ position: "absolute", left: "8%", top: "-6px", width: "30px", height: "16px", background: "#0a090b", clipPath: "polygon(0 0,100% 0,70% 100%,20% 60%)" }} />
                <div style={{ position: "absolute", right: "10%", top: "-6px", width: "24px", height: "12px", background: "#0a090b", clipPath: "polygon(0 0,100% 0,40% 100%)" }} />
                <div style={{ position: "absolute", left: "26%", top: "10px", width: "2px", height: "34px", background: "#0c0a09", transform: "rotate(35deg)" }} />
                <div style={{ position: "absolute", right: "28%", top: "6px", width: "2px", height: "40px", background: "#0c0a09", transform: "rotate(-28deg)" }} />
              </div>
              <div style={{ position: "absolute", left: "-260px", right: "-260px", bottom: "64px", height: "74px", zIndex: "1", background: "linear-gradient(#120f0d,#120f0d) 0 18px/100% 4px no-repeat,repeating-linear-gradient(90deg,#120f0d 0 4px,transparent 4px 18px)" }} />
              <div style={{ position: "absolute", left: "-250px", bottom: "64px", width: "120px", height: "210px", zIndex: "0" }}>
                <div style={{ position: "absolute", left: "58px", bottom: "0", width: "7px", height: "150px", background: "#100d0c" }} />
                <div style={{ position: "absolute", left: "60px", bottom: "110px", width: "5px", height: "70px", background: "#100d0c", transformOrigin: "50% 100%", transform: "rotate(-38deg)" }} />
                <div style={{ position: "absolute", left: "60px", bottom: "90px", width: "4px", height: "60px", background: "#100d0c", transformOrigin: "50% 100%", transform: "rotate(44deg)" }} />
                <div style={{ position: "absolute", left: "61px", bottom: "140px", width: "3px", height: "50px", background: "#100d0c", transformOrigin: "50% 100%", transform: "rotate(18deg)" }} />
                <div style={{ position: "absolute", left: "30px", bottom: "150px", width: "3px", height: "30px", background: "#100d0c", transformOrigin: "50% 100%", transform: "rotate(-70deg)" }} />
              </div>
              <div style={{ position: "absolute", left: "-205px", bottom: "64px", width: "86px", height: "128px", zIndex: "0" }}>
                <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "34px", background: "#1d1a18", clipPath: "polygon(50% 0,100% 100%,0 100%)" }} />
                <div style={{ position: "absolute", left: "40px", top: "-22px", width: "6px", height: "24px", background: "#1d1a18" }} />
                <div style={{ position: "absolute", left: "34px", top: "-15px", width: "18px", height: "5px", background: "#1d1a18" }} />
                <div style={{ position: "absolute", left: "4px", right: "4px", top: "34px", bottom: "0", background: "repeating-linear-gradient(0deg,rgba(0,0,0,.35) 0 1px,transparent 1px 14px),#1d1a18" }} />
                <div style={{ position: "absolute", left: "10px", top: "40px", width: "6px", bottom: "0", background: "#26221f" }} />
                <div style={{ position: "absolute", right: "10px", top: "40px", width: "6px", bottom: "0", background: "#26221f" }} />
                <div style={{ position: "absolute", left: "28px", right: "28px", top: "56px", bottom: "0", borderRadius: "15px 15px 0 0", background: "#050404" }}>
                  <div style={{ position: "absolute", left: "7px", top: "22px", display: "flex", gap: "6px", animation: "pt-eyes 9s linear infinite" }}>
                    <div style={{ width: "4px", height: "3px", borderRadius: "50%", background: "#ff5a3a", boxShadow: "0 0 6px 2px rgba(255,80,50,.7)" }} />
                    <div style={{ width: "4px", height: "3px", borderRadius: "50%", background: "#ff5a3a", boxShadow: "0 0 6px 2px rgba(255,80,50,.7)" }} />
                  </div>
                </div>
              </div>
              <div style={{ position: "absolute", left: "-108px", bottom: "64px", width: "30px", height: "74px", zIndex: "0", animation: "pt-shade 11s ease-in-out infinite" }}>
                <div style={{ position: "absolute", left: "5px", top: "0", width: "20px", height: "24px", borderRadius: "50% 50% 30% 30%", background: "#070606" }} />
                <div style={{ position: "absolute", left: "0", top: "16px", right: "0", bottom: "0", background: "#070606", clipPath: "polygon(30% 0,70% 0,100% 100%,0 100%)" }} />
                <div style={{ position: "absolute", left: "8px", top: "10px", display: "flex", gap: "4px", animation: "pt-eyes 7s linear infinite 2s" }}>
                  <div style={{ width: "3px", height: "2px", background: "#e9e2d2", boxShadow: "0 0 4px 1px rgba(233,226,210,.7)" }} />
                  <div style={{ width: "3px", height: "2px", background: "#e9e2d2", boxShadow: "0 0 4px 1px rgba(233,226,210,.7)" }} />
                </div>
              </div>
              <div style={{ position: "absolute", left: "-150px", bottom: "64px", width: "10px", height: "88px", zIndex: "0", background: "#1a1715" }} />
              <div style={{ position: "absolute", left: "-166px", bottom: "124px", width: "42px", height: "10px", zIndex: "0", background: "#1a1715" }} />
              <div style={{ position: "absolute", left: "-66px", bottom: "64px", width: "30px", height: "40px", zIndex: "0", borderRadius: "15px 15px 0 0", background: "#1d1a18", transform: "rotate(-6deg)" }} />
              <div style={{ position: "absolute", left: "-40px", bottom: "64px", width: "40px", height: "30px", zIndex: "0", borderRadius: "50% 50% 0 0", background: "#141a13" }}>
                <div style={{ position: "absolute", left: "10px", top: "12px", display: "flex", gap: "5px", animation: "pt-eyes 8s linear infinite 4s" }}>
                  <div style={{ width: "4px", height: "3px", borderRadius: "50%", background: "#c6e25a", boxShadow: "0 0 6px 2px rgba(198,226,90,.6)" }} />
                  <div style={{ width: "4px", height: "3px", borderRadius: "50%", background: "#c6e25a", boxShadow: "0 0 6px 2px rgba(198,226,90,.6)" }} />
                </div>
              </div>
              <div style={{ position: "absolute", right: "-250px", bottom: "64px", width: "100px", height: "150px", zIndex: "0" }}>
                <div style={{ position: "absolute", left: "-6px", right: "-6px", top: "0", height: "16px", background: "#221e1b" }} />
                <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "40px", background: "#1d1a18", clipPath: "polygon(10% 0,90% 0,100% 100%,0 100%)" }} />
                <div style={{ position: "absolute", left: "36px", right: "36px", top: "-30px", height: "32px", borderRadius: "14px 14px 0 0", background: "#1d1a18" }} />
                <div style={{ position: "absolute", left: "0", right: "0", top: "40px", bottom: "0", background: "linear-gradient(90deg,#26221f 0 10px,#1a1715 10px 18px,#26221f 18px 26px,transparent 26px calc(100% - 26px),#26221f calc(100% - 26px) calc(100% - 18px),#1a1715 calc(100% - 18px) calc(100% - 10px),#26221f calc(100% - 10px)),#1a1715" }} />
                <div style={{ position: "absolute", left: "32px", right: "32px", top: "62px", bottom: "0", background: "#050404", borderRadius: "18px 18px 0 0" }}>
                  <div style={{ position: "absolute", left: "9px", top: "30px", display: "flex", gap: "7px", animation: "pt-eyes 10s linear infinite 5s" }}>
                    <div style={{ width: "5px", height: "3px", borderRadius: "50%", background: "#ffd35a", boxShadow: "0 0 6px 2px rgba(255,210,90,.7)" }} />
                    <div style={{ width: "5px", height: "3px", borderRadius: "50%", background: "#ffd35a", boxShadow: "0 0 6px 2px rgba(255,210,90,.7)" }} />
                  </div>
                </div>
              </div>
              <div style={{ position: "absolute", right: "-138px", bottom: "64px", width: "22px", height: "120px", zIndex: "0", background: "linear-gradient(90deg,#26221f,#171412)", clipPath: "polygon(35% 0,65% 0,100% 88%,100% 100%,0 100%,0 88%)" }} />
              <div style={{ position: "absolute", right: "-110px", bottom: "64px", width: "36px", height: "46px", zIndex: "0", borderRadius: "18px 18px 0 0", background: "#1a1715" }} />
              <div style={{ position: "absolute", right: "-70px", bottom: "64px", width: "28px", height: "56px", zIndex: "0", background: "#1d1a18" }}>
                <div style={{ position: "absolute", left: "-8px", right: "-8px", top: "12px", height: "7px", background: "#1d1a18" }} />
              </div>
              <div style={{ position: "absolute", right: "-30px", bottom: "64px", width: "44px", height: "26px", zIndex: "0", borderRadius: "50% 50% 0 0", background: "#141a13" }} />
              <div style={{ position: "absolute", left: "44px", right: "44px", bottom: "0", height: "238px", zIndex: "2", overflow: "hidden", background: "linear-gradient(180deg,#1a1214,#0f0c0b 60%,#17120f)" }}>
                <div style={{ position: "absolute", left: "50%", top: "30%", width: "220px", height: "160px", transform: "translate(-50%,-50%)", borderRadius: "50%", background: "radial-gradient(circle,rgba(232,120,93,.55),rgba(217,87,59,.18) 45%,transparent 70%)", opacity: v.glowOp, transition: "opacity 1.2s" }} />
                <div style={{ position: "absolute", left: "50%", top: "70px", width: "34px", height: "26px", marginLeft: "-17px", background: "#0a0808" }}>
                  <div style={{ position: "absolute", left: "-3px", right: "-3px", top: "-10px", height: "10px", background: "#0a0808", clipPath: "polygon(50% 0,100% 100%,0 100%)" }} />
                  <div style={{ position: "absolute", left: "12px", right: "12px", bottom: "0", height: "14px", background: "rgba(232,120,93,.5)" }} />
                </div>
                <PartyPath />
                <div style={{ position: "absolute", left: "14px", top: "112px", width: "18px", height: "24px", borderRadius: "9px 9px 0 0", background: "#0a0808", transform: "rotate(-5deg)" }} />
                <div style={{ position: "absolute", left: "44px", top: "100px", width: "12px", height: "16px", borderRadius: "6px 6px 0 0", background: "#0a0808" }} />
                <div style={{ position: "absolute", left: "60px", top: "92px", width: "9px", height: "12px", borderRadius: "5px 5px 0 0", background: "#0a0808" }} />
                <div style={{ position: "absolute", right: "22px", top: "104px", width: "14px", height: "32px", background: "#0a0808" }} />
                <div style={{ position: "absolute", right: "16px", top: "112px", width: "26px", height: "5px", background: "#0a0808" }} />
                <div style={{ position: "absolute", right: "52px", top: "96px", width: "11px", height: "14px", borderRadius: "5px 5px 0 0", background: "#0a0808" }} />
                <div style={{ position: "absolute", left: "20px", top: "128px", width: "3px", height: "6px", background: "#ffcf8a", borderRadius: "1px", boxShadow: "0 -3px 6px 2px rgba(255,190,110,.6)", animation: "pt-lampFlick 3s linear infinite" }} />
                <div style={{ position: "absolute", right: "27px", top: "128px", width: "3px", height: "6px", background: "#ffcf8a", borderRadius: "1px", boxShadow: "0 -3px 6px 2px rgba(255,190,110,.6)", animation: "pt-lampFlick 4s linear infinite 1s" }} />
                <div style={{ position: "absolute", left: "0", top: "150px", width: "40px", height: "40px", borderRadius: "50% 50% 0 0", background: "#10150e" }}>
                  <div style={{ position: "absolute", left: "12px", top: "14px", display: "flex", gap: "5px", animation: "pt-eyes 6s linear infinite 1s" }}>
                    <div style={{ width: "4px", height: "3px", borderRadius: "50%", background: "#c6e25a", boxShadow: "0 0 6px 2px rgba(198,226,90,.6)" }} />
                    <div style={{ width: "4px", height: "3px", borderRadius: "50%", background: "#c6e25a", boxShadow: "0 0 6px 2px rgba(198,226,90,.6)" }} />
                  </div>
                </div>
                <div style={{ position: "absolute", right: "0", top: "160px", width: "44px", height: "36px", borderRadius: "50% 50% 0 0", background: "#10150e" }} />
              </div>
              <div style={{ position: "absolute", left: "44px", right: "44px", bottom: "0", height: "238px", zIndex: "3", display: "flex", perspective: "700px" }}>
                <div style={{ position: "relative", flex: "1", transformOrigin: "left center", transform: v.doorL, transition: "transform 1.3s cubic-bezier(.5,0,.3,1)", border: "5px solid #120f0d", borderRightWidth: "3px", background: "linear-gradient(#120f0d,#120f0d) 0 26%/100% 5px no-repeat,linear-gradient(#120f0d,#120f0d) 0 78%/100% 5px no-repeat,repeating-linear-gradient(90deg,#120f0d 0 4px,transparent 4px 17px)" }}>
                  <div style={{ position: "absolute", left: "2px", right: "2px", top: "-12px", display: "flex", justifyContent: "space-between" }}>
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                  </div>
                  <div style={{ position: "absolute", right: "4px", top: "52%", width: "12px", height: "12px", borderRadius: "50%", border: "3px solid #120f0d", borderTopColor: "transparent", transform: "rotate(-30deg)" }} />
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", background: "radial-gradient(ellipse 10px 40px at 30% 30%,rgba(120,50,20,.55),transparent),radial-gradient(ellipse 8px 30px at 70% 70%,rgba(110,45,18,.5),transparent),radial-gradient(ellipse 18px 10px at 50% 26%,rgba(130,58,24,.5),transparent)" }} />
                  <div style={{ position: "absolute", left: "40%", top: "78%", width: "18px", height: "12px", background: "#0f0c0b", clipPath: "polygon(0 0,100% 30%,70% 100%,20% 70%)" }} />
                </div>
                <div style={{ position: "relative", flex: "1", transformOrigin: "right center", transform: v.doorR, transition: "transform 1.3s cubic-bezier(.5,0,.3,1)", border: "5px solid #120f0d", borderLeftWidth: "3px", background: "linear-gradient(#120f0d,#120f0d) 0 26%/100% 5px no-repeat,linear-gradient(#120f0d,#120f0d) 0 78%/100% 5px no-repeat,repeating-linear-gradient(90deg,transparent 0 13px,#120f0d 13px 17px)" }}>
                  <div style={{ position: "absolute", left: "2px", right: "2px", top: "-12px", display: "flex", justifyContent: "space-between" }}>
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                    <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", background: "#120f0d" }} />
                  </div>
                  <div style={{ position: "absolute", left: "4px", top: "60%", width: "12px", height: "12px", borderRadius: "50%", border: "3px solid #120f0d" }} />
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", background: "radial-gradient(ellipse 10px 40px at 30% 30%,rgba(120,50,20,.55),transparent),radial-gradient(ellipse 8px 30px at 70% 70%,rgba(110,45,18,.5),transparent),radial-gradient(ellipse 18px 10px at 50% 26%,rgba(130,58,24,.5),transparent)" }} />
                </div>
              </div>
              {v.locked ? <GateChains rattle={v.rattleKey} /> : null}
              <div style={{ position: "absolute", left: "44px", right: "44px", bottom: "250px", height: "118px", zIndex: "3", border: "6px solid #120f0d", borderBottom: "none", borderRadius: "106px 106px 0 0", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 8px 6px", borderTopColor: "#1c1310", transform: "rotate(-1.5deg)" }}>
                <div style={{ position: "absolute", left: "58%", top: "-8px", width: "22px", height: "12px", background: "#15161c" }} />
                <div style={{ position: "absolute", left: "18%", top: "10px", width: "14px", height: "18px", borderRadius: "50%", background: "radial-gradient(rgba(120,50,20,.6),transparent 70%)" }} />
                <div style={{ position: "absolute", right: "14%", top: "16px", width: "3px", height: "40px", background: "#120f0d", transform: "rotate(22deg)", transformOrigin: "top" }} />
                <div style={{ position: "absolute", left: "-6px", right: "-6px", bottom: "0", height: "6px", background: "#120f0d" }} />
              </div>
              <div style={{ position: "absolute", left: "0", bottom: "0", width: "44px", height: "300px", zIndex: "4", background: "repeating-linear-gradient(0deg,rgba(0,0,0,.38) 0 2px,transparent 2px 36px),linear-gradient(90deg,#4d463f,#2a2521)" }}>
                <div style={{ position: "absolute", left: "-6px", right: "-6px", top: "-14px", height: "14px", background: "linear-gradient(90deg,#5a524a,#332d28)" }} />
                <div style={{ position: "absolute", left: "10px", top: "-30px", width: "18px", height: "16px", borderRadius: "50% 50% 30% 60%", background: "radial-gradient(circle at 60% 35%,#5e564e,#241f1c)", clipPath: "polygon(0 30%,40% 0,100% 20%,85% 60%,100% 100%,0 100%)" }} />
                <div style={{ position: "absolute", left: "-6px", top: "-14px", width: "20px", height: "14px", background: "#0d0c0e", clipPath: "polygon(0 0,100% 0,60% 100%,0 70%)" }} />
                <div style={{ position: "absolute", inset: "0", background: "radial-gradient(ellipse 14px 30px at 30% 18%,rgba(0,0,0,.45),transparent),radial-gradient(ellipse 10px 22px at 75% 62%,rgba(0,0,0,.4),transparent),linear-gradient(180deg,transparent 0 40%,rgba(38,50,30,.55) 70%,rgba(30,42,24,.8))" }} />
                <div style={{ position: "absolute", left: "8px", top: "40px", width: "2px", height: "70px", background: "#0c0a09", transform: "rotate(14deg)", boxShadow: "6px 26px 0 -0.5px #0c0a09" }} />
                <div style={{ position: "absolute", left: "18px", top: "130px", width: "2px", height: "44px", background: "#0c0a09", transform: "rotate(-22deg)" }} />
                <div style={{ position: "absolute", right: "0", top: "96px", width: "14px", height: "30px", background: "#171412", clipPath: "polygon(100% 0,0 35%,30% 70%,100% 100%)" }} />
                <div style={{ position: "absolute", left: "0", top: "210px", width: "12px", height: "22px", background: "#171412", clipPath: "polygon(0 0,100% 40%,60% 100%,0 80%)" }} />
              </div>
              <div style={{ position: "absolute", right: "0", bottom: "0", width: "44px", height: "300px", zIndex: "4", background: "repeating-linear-gradient(0deg,rgba(0,0,0,.38) 0 2px,transparent 2px 36px),linear-gradient(90deg,#4d463f,#2a2521)" }}>
                <div style={{ position: "absolute", left: "-6px", right: "-6px", top: "-14px", height: "14px", background: "linear-gradient(90deg,#5a524a,#332d28)" }} />
                <div style={{ position: "absolute", left: "12px", top: "-34px", width: "20px", height: "20px", borderRadius: "50%", background: "radial-gradient(circle at 65% 35%,#6a625a,#2a2521)", clipPath: "polygon(0 0,70% 0,55% 45%,100% 55%,100% 100%,0 100%)" }} />
                <div style={{ position: "absolute", right: "-6px", top: "-14px", width: "16px", height: "10px", background: "#0d0c0e", clipPath: "polygon(100% 0,0 0,100% 100%)" }} />
                <div style={{ position: "absolute", inset: "0", background: "radial-gradient(ellipse 12px 26px at 65% 30%,rgba(0,0,0,.45),transparent),radial-gradient(ellipse 12px 20px at 25% 75%,rgba(0,0,0,.4),transparent),linear-gradient(180deg,transparent 0 50%,rgba(38,50,30,.5) 75%,rgba(30,42,24,.85))" }} />
                <div style={{ position: "absolute", left: "26px", top: "20px", width: "2px", height: "90px", background: "#0c0a09", transform: "rotate(-10deg)", boxShadow: "-8px 30px 0 -0.5px #0c0a09" }} />
                <div style={{ position: "absolute", left: "0", top: "150px", width: "13px", height: "34px", background: "#171412", clipPath: "polygon(0 0,100% 45%,40% 100%,0 100%)" }} />
                <div style={{ position: "absolute", left: "14px", top: "250px", width: "2px", height: "40px", background: "#0c0a09", transform: "rotate(30deg)" }} />
              </div>
              <div style={{ position: "absolute", left: "-40px", right: "-40px", bottom: "-14px", height: "14px", zIndex: "4", background: "linear-gradient(180deg,#2a2521,#141110)" }} />
              <div style={{ position: "absolute", left: "-6px", top: "90px", width: "18px", height: "200px", zIndex: "4", background: "radial-gradient(circle at 30% 20%,#25301f 0 5px,transparent 6px) 0 0/14px 18px,radial-gradient(circle at 70% 60%,#1c2419 0 4px,transparent 5px) 0 0/12px 15px", WebkitMask: "linear-gradient(180deg,transparent,#000 30%)" }} />
              <div style={{ position: "absolute", right: "-6px", top: "150px", width: "16px", height: "150px", zIndex: "4", background: "radial-gradient(circle at 60% 30%,#25301f 0 5px,transparent 6px) 0 0/13px 17px,radial-gradient(circle at 20% 70%,#1c2419 0 4px,transparent 5px) 0 0/11px 14px", WebkitMask: "linear-gradient(180deg,transparent,#000 30%)" }} />
              <div style={{ position: "absolute", left: "-260px", right: "-260px", bottom: "-14px", height: "50px", zIndex: "4", pointerEvents: "none", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ width: "70px", height: "46px", background: "#141a12", clipPath: "polygon(0 100%,8% 30%,16% 90%,26% 0,34% 80%,46% 20%,54% 85%,66% 10%,76% 90%,88% 35%,100% 100%)", transformOrigin: "50% 100%", animation: "pt-sway 5s ease-in-out infinite" }} />
                <div style={{ width: "50px", height: "34px", background: "#1a2216", clipPath: "polygon(0 100%,12% 20%,24% 80%,40% 0,52% 75%,68% 15%,82% 80%,100% 100%)", transformOrigin: "50% 100%", animation: "pt-sway 6s ease-in-out infinite 1s" }} />
                <div style={{ width: "60px", height: "40px", background: "#141a12", clipPath: "polygon(0 100%,10% 35%,22% 90%,36% 5%,48% 85%,62% 25%,78% 85%,90% 30%,100% 100%)", transformOrigin: "50% 100%", animation: "pt-sway 5.5s ease-in-out infinite .5s" }} />
                <div style={{ width: "220px" }} />
                <div style={{ width: "60px", height: "40px", background: "#1a2216", clipPath: "polygon(0 100%,10% 35%,22% 90%,36% 5%,48% 85%,62% 25%,78% 85%,90% 30%,100% 100%)", transformOrigin: "50% 100%", animation: "pt-sway 6.5s ease-in-out infinite" }} />
                <div style={{ width: "50px", height: "30px", background: "#141a12", clipPath: "polygon(0 100%,12% 20%,24% 80%,40% 0,52% 75%,68% 15%,82% 80%,100% 100%)", transformOrigin: "50% 100%", animation: "pt-sway 5s ease-in-out infinite 2s" }} />
                <div style={{ width: "74px", height: "48px", background: "#141a12", clipPath: "polygon(0 100%,8% 30%,16% 90%,26% 0,34% 80%,46% 20%,54% 85%,66% 10%,76% 90%,88% 35%,100% 100%)", transformOrigin: "50% 100%", animation: "pt-sway 6s ease-in-out infinite 1.5s" }} />
              </div>
              <div style={{ position: "absolute", right: "-34px", top: "96px", width: "36px", height: "4px", zIndex: "5", background: "#120f0d" }} />
              <div style={{ position: "absolute", right: "-40px", top: "100px", width: "24px", zIndex: "5", display: "flex", flexDirection: "column", alignItems: "center", transformOrigin: "50% 0", animation: "pt-swing 4s ease-in-out infinite" }}>
                <div style={{ width: "2px", height: "14px", background: "#120f0d" }} />
                <div style={{ width: "22px", height: "8px", background: "#120f0d", clipPath: "polygon(25% 0,75% 0,100% 100%,0 100%)" }} />
                <div ref={lampRef} style={{ position: "relative", width: "18px", height: "26px", border: "3px solid #120f0d", background: "#ffcf8a", boxShadow: "0 0 14px 4px rgba(255,190,110,.7)", animation: "pt-lampFlick 7s linear infinite" }}>
                  <div style={{ position: "absolute", left: "50%", top: "50%", width: "420px", height: "420px", margin: "-210px 0 0 -210px", borderRadius: "50%", background: "radial-gradient(circle,rgba(255,190,110,.38),rgba(255,150,70,.12) 40%,transparent 70%)", pointerEvents: "none" }} />
                </div>
                <div style={{ width: "24px", height: "5px", background: "#120f0d" }} />
              </div>
            </div>
            <div style={{ position: "relative", zIndex: "9", marginTop: "-6px", perspective: "240px", perspectiveOrigin: "50% -40%", opacity: v.copyOp, transition: "opacity .5s" }}>
              <button style={{ position: "relative", background: "none", border: "none", padding: "6px 10px 18px", cursor: "pointer", WebkitTapHighlightColor: "transparent", WebkitFontSmoothing: "antialiased", textRendering: "geometricPrecision", backfaceVisibility: "hidden", transform: "rotateX(46deg) scaleX(.84)", animation: "pt-lampFlick 7s linear infinite", transformOrigin: "50% 0", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "var(--pt-creep)", fontSize: "68px", letterSpacing: ".04em", lineHeight: ".9", color: "#7a0a0a", textShadow: "0 1px 0 #b3140f,0 2px 0 #2a0303" }}>
                {v.locked ? (
                  <>
                    <span style={{ fontSize: "54px", letterSpacing: ".01em" }}>
                      MUY
                    </span>
                    <span style={{ fontSize: "74px", letterSpacing: ".02em" }}>
                      PRONTO
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: "40px", letterSpacing: "0" }}>
                      ENTRA
                    </span>
                    <span style={{ fontSize: "54px", letterSpacing: ".01em" }}>
                      SI TE
                    </span>
                    <span style={{ fontSize: "74px", letterSpacing: ".02em" }}>
                      ATREVES
                    </span>
                  </>
                )}
                <div style={{ position: "absolute", left: "12%", bottom: "2px", width: "26px", height: "9px", borderRadius: "50%", background: "#6a0808", boxShadow: "0 0 4px #3a0404" }} />
                <div style={{ position: "absolute", left: "40%", bottom: "6px", width: "10px", height: "6px", borderRadius: "50%", background: "#7a0a0a" }} />
                <div style={{ position: "absolute", left: "56%", bottom: "-2px", width: "40px", height: "12px", borderRadius: "50%", background: "#5e0707", boxShadow: "0 0 5px #3a0404" }} />
                <div style={{ position: "absolute", right: "8%", bottom: "8px", width: "7px", height: "5px", borderRadius: "50%", background: "#7a0a0a" }} />
                <div style={{ position: "absolute", right: "20%", bottom: "0", width: "14px", height: "6px", borderRadius: "50%", background: "#6a0808" }} />
              </button>
            </div>
            <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "45%", pointerEvents: "none", zIndex: "5" }}>
              {v.fog}
            </div>
            <div style={{ position: "absolute", inset: "0", zIndex: "20", pointerEvents: "none", background: "#050404", opacity: v.fadeOp, transition: "opacity 1.1s ease-in .35s" }} />
            <div style={{ position: "absolute", left: "-60%", right: "-60%", top: "8%", height: "40%", pointerEvents: "none", zIndex: "3", filter: "blur(40px)" }}>
              <div style={{ position: "absolute", left: "5%", right: "30%", top: "10%", height: "45%", borderRadius: "50%", background: "rgba(170,165,160,.14)", animation: "pt-fogDrift 28s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", left: "35%", right: "0", top: "45%", height: "40%", borderRadius: "50%", background: "rgba(150,145,140,.16)", animation: "pt-fogDrift2 34s ease-in-out infinite alternate" }} />
            </div>
            <div style={{ position: "absolute", left: "-60%", right: "-60%", top: "55%", height: "30%", pointerEvents: "none", zIndex: "8", filter: "blur(30px)" }}>
              <div style={{ position: "absolute", left: "10%", right: "20%", top: "20%", height: "60%", borderRadius: "50%", background: "rgba(200,194,186,.16)", animation: "pt-fogDrift2 14s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", left: "30%", right: "5%", top: "40%", height: "50%", borderRadius: "50%", background: "rgba(180,174,166,.14)", animation: "pt-fogDrift 19s ease-in-out infinite alternate" }} />
            </div>
            <div style={{ position: "absolute", left: "-60%", right: "-60%", bottom: "-6%", height: "24%", pointerEvents: "none", zIndex: "10", filter: "blur(26px)" }}>
              <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "75%", borderRadius: "50%", background: "rgba(205,198,190,.2)", animation: "pt-fogDrift 12s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", left: "20%", right: "20%", bottom: "25%", height: "55%", borderRadius: "50%", background: "rgba(220,214,206,.14)", animation: "pt-fogDrift2 16s ease-in-out infinite alternate" }} />
            </div>
            <div style={{ position: "absolute", left: "-50%", right: "-50%", top: "38%", height: "34%", pointerEvents: "none", zIndex: "5", filter: "blur(28px)" }}>
              <div style={{ position: "absolute", left: "0", right: "0", top: "20%", height: "50%", borderRadius: "50%", background: "rgba(190,182,172,.2)", animation: "pt-fogDrift 16s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", left: "10%", right: "10%", top: "50%", height: "45%", borderRadius: "50%", background: "rgba(150,142,135,.24)", animation: "pt-fogDrift2 21s ease-in-out infinite alternate" }} />
            </div>
            <div style={{ position: "absolute", left: "-50%", right: "-50%", bottom: "0", height: "30%", pointerEvents: "none", zIndex: "7", filter: "blur(34px)" }}>
              <div style={{ position: "absolute", left: "0", right: "0", bottom: "0", height: "70%", borderRadius: "50%", background: "rgba(170,162,154,.18)", animation: "pt-fogDrift2 18s ease-in-out infinite alternate" }} />
              <div style={{ position: "absolute", left: "15%", right: "15%", bottom: "30%", height: "50%", borderRadius: "50%", background: "rgba(200,192,182,.12)", animation: "pt-fogDrift 24s ease-in-out infinite alternate" }} />
            </div>
            <div style={{ position: "absolute", inset: "0", zIndex: "6", pointerEvents: "none", opacity: v.copyOp, transition: "opacity .6s", background: `radial-gradient(circle at ${v.lampX}px ${v.lampY}px,rgba(4,3,5,0) 0,rgba(4,3,5,.25) 170px,rgba(4,3,5,.7) 360px,rgba(4,3,5,.94) 560px)` }} />
            <div style={{ position: "absolute", inset: "0", zIndex: "8", pointerEvents: "none", opacity: v.copyOp, transition: "opacity .6s" }}>
              <div style={{ position: "absolute", inset: "0", background: "#040305", animation: "pt-lampDark 7s linear infinite" }} />
            </div>
          </section>
      ) : null}
      {v.entered ? (
        <>
          <div style={{ position: "fixed", inset: "0", zIndex: "60", pointerEvents: "none", background: `radial-gradient(circle at 50% 55%,rgba(5,4,4,${v.revealCore}) 0,#050404 ${v.revealR})`, opacity: v.revealOp, transition: "opacity 1.8s ease-out .2s" }} />
          <section data-screen-label="02 Cementerio" style={{ transform: v.revealScale, transition: "transform 2.4s cubic-bezier(.15,.7,.2,1)", position: "fixed", top: "0", bottom: "0", left: "0", right: "0", overflow: "hidden", background: "radial-gradient(ellipse at 50% 20%,#15161c,#0a0a0c 70%)", animation: "pt-rise 1.2s ease both" }}>
            <div style={{ position: "absolute", top: "9%", left: `${v.moonX}px`, width: "80px", height: "80px", borderRadius: "50%", background: "#e9e2d2", boxShadow: "0 0 60px 20px rgba(233,226,210,.16),0 0 180px 60px rgba(233,226,210,.07)" }} />
            <div onPointerDown={v.onPD} onPointerMove={v.onPM} onPointerUp={v.onPU} onPointerLeave={v.onPU} style={{ position: "absolute", inset: "0", touchAction: "none", cursor: "grab", userSelect: "none" }}>
              <div style={{ position: "absolute", left: "50%", top: "50%", width: "0", height: "0", transform: v.camTransform, transition: v.camTrans }}>
                <div style={{ position: "absolute", left: "-800px", top: "-800px", width: "1600px", height: "1600px", transform: "rotateX(60deg) rotateZ(45deg)", transformStyle: "preserve-3d", background: "radial-gradient(circle at 30% 70%,#1f1b16,transparent 30%),radial-gradient(circle at 75% 30%,#1c1915,transparent 30%),radial-gradient(circle at 50% 50%,#1a1713,transparent 40%),repeating-linear-gradient(0deg,rgba(236,230,220,.022) 0 1px,transparent 1px 110px),repeating-linear-gradient(90deg,rgba(236,230,220,.022) 0 1px,transparent 1px 110px),#14110e" }}>
                  <WorldDecor onCat={v.scareCat} />
                  <div style={{ position: "absolute", left: "0", top: "1600px", width: "1600px", height: "60px", transformOrigin: "top", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#221d18,#0a0908)" }} />
                  <div style={{ position: "absolute", left: "1600px", top: "0", width: "60px", height: "1600px", transformOrigin: "left", transform: "rotateY(90deg)", background: "linear-gradient(90deg,#17130f,#070605)" }} />
                  <div style={{ position: "absolute", left: "1524px", top: "1524px", width: "32px", height: "32px", borderRadius: "6px", background: "#221e1a", transform: "rotate(8deg)" }} />
                  <div style={{ position: "absolute", left: "1479px", top: "1479px", width: "42px", height: "42px", borderRadius: "6px", background: "#221e1a", transform: "rotate(-12deg)" }} />
                  <div style={{ position: "absolute", left: "1442px", top: "1442px", width: "37px", height: "37px", borderRadius: "6px", background: "#221e1a", transform: "rotate(-6deg)" }} />
                  <div style={{ position: "absolute", left: "1401px", top: "1401px", width: "37px", height: "37px", borderRadius: "6px", background: "#221e1a", transform: "rotate(8deg)" }} />
                  <div style={{ position: "absolute", left: "1344px", top: "1369px", width: "31px", height: "31px", borderRadius: "6px", background: "#221e1a", transform: "rotate(3deg)" }} />
                  <div style={{ position: "absolute", left: "1279px", top: "1329px", width: "41px", height: "41px", borderRadius: "6px", background: "#221e1a", transform: "rotate(-1deg)" }} />
                  <div style={{ position: "absolute", left: "1220px", top: "1315px", width: "41px", height: "41px", borderRadius: "6px", background: "#221e1a", transform: "rotate(-14deg)" }} />
                  <div style={{ position: "absolute", left: "1158px", top: "1298px", width: "43px", height: "43px", borderRadius: "6px", background: "#221e1a", transform: "rotate(0deg)" }} />
                  <div style={{ position: "absolute", left: "1149px", top: "1244px", width: "33px", height: "33px", borderRadius: "6px", background: "#221e1a", transform: "rotate(16deg)" }} />
                  <div style={{ position: "absolute", left: "0px", top: "0px", width: "1600px", height: "8px", transformStyle: "preserve-3d" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(56px)", background: "#2a2622" }} />
                    <div style={{ position: "absolute", left: "0", top: "-48px", width: "1600px", height: "56px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "repeating-linear-gradient(90deg,#2a2622 0 5px,transparent 5px 26px),linear-gradient(#2a2622,#2a2622) top/100% 6px no-repeat" }} />
                    <div style={{ position: "absolute", left: "1544px", top: "0", width: "56px", height: "8px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815" }} />
                  </div>
                  <div style={{ position: "absolute", left: "0px", top: "0px", width: "8px", height: "1600px", transformStyle: "preserve-3d" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(56px)", background: "#2a2622" }} />
                    <div style={{ position: "absolute", left: "0", top: "1544px", width: "8px", height: "56px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2a2622" }} />
                    <div style={{ position: "absolute", left: "-48px", top: "0", width: "56px", height: "1600px", transformOrigin: "right", transform: "rotateY(90deg)", background: "repeating-linear-gradient(180deg,#1d1a17 0 5px,transparent 5px 26px),linear-gradient(90deg,transparent calc(100% - 6px),#1d1a17 0)" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "449px", top: "228px", width: "108px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-96px", width: "108px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "54px 54px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-93px", width: "108px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54px 54px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-90px", width: "108px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54px 54px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-86px", width: "108px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54px 54px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-83px", width: "108px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54px 54px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-80px", width: "108px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "54px 54px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "36px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "17px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Don Anselmo
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "52px", top: "0", width: "56px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "1163px", top: "561px", width: "112px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(156px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-140px", width: "112px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "17px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Sin nombre
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-44px", top: "0", width: "156px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "871px", top: "445px", width: "76px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-142px", width: "76px", height: "142px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "38px 38px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-139px", width: "76px", height: "142px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "38px 38px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-136px", width: "76px", height: "142px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "38px 38px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-132px", width: "76px", height: "142px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "38px 38px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-129px", width: "76px", height: "142px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "38px 38px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-126px", width: "76px", height: "142px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "38px 38px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "25px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "12px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        La viuda
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-38px", top: "0", width: "114px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "478px", top: "706px", width: "100px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(132px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-116px", width: "100px", height: "132px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "15px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        1887 – 1923
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-32px", top: "0", width: "132px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "1144px", top: "985px", width: "89px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(141px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-125px", width: "89px", height: "141px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "14px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Aquí no es
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-52px", top: "0", width: "141px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "1287px", top: "1171px", width: "102px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(118px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-102px", width: "102px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Descansa
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-16px", top: "0", width: "118px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "327px", top: "792px", width: "89px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(121px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-105px", width: "89px", height: "121px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "14px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Hermanos Ruiz
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-32px", top: "0", width: "121px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "289px", top: "587px", width: "87px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(85px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-69px", width: "87px", height: "85px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "13px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Nadie
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "2px", top: "0", width: "85px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "1407px", top: "767px", width: "104px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-118px", width: "104px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-115px", width: "104px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-112px", width: "104px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-108px", width: "104px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-105px", width: "104px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-102px", width: "104px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "52px 52px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "35px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Siga buscando
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "25px", top: "0", width: "79px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "1434px", top: "215px", width: "109px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-131px", width: "109px", height: "131px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "54.5px 54.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-128px", width: "109px", height: "131px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54.5px 54.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-125px", width: "109px", height: "131px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54.5px 54.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-121px", width: "109px", height: "131px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54.5px 54.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-118px", width: "109px", height: "131px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "54.5px 54.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-115px", width: "109px", height: "131px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "54.5px 54.5px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "36px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "17px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        El que llegó tarde
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "19px", top: "0", width: "90px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "829px", top: "1007px", width: "105px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(127px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-111px", width: "105px", height: "127px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        1901
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-22px", top: "0", width: "127px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "963px", top: "852px", width: "84px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(111px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-95px", width: "84px", height: "111px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "13px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Perdido
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-27px", top: "0", width: "111px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "617px", top: "589px", width: "101px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(121px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-105px", width: "101px", height: "121px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Hermanos Ruiz
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-20px", top: "0", width: "121px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "571px", top: "981px", width: "106px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-107px", width: "106px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "53px 53px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-104px", width: "106px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "53px 53px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-101px", width: "106px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "53px 53px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-97px", width: "106px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "53px 53px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-94px", width: "106px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "53px 53px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-91px", width: "106px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "53px 53px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "35px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Tía Rosa
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "39px", top: "0", width: "67px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "130px", top: "929px", width: "104px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-143px", width: "104px", height: "143px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-140px", width: "104px", height: "143px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-137px", width: "104px", height: "143px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-133px", width: "104px", height: "143px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-130px", width: "104px", height: "143px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-127px", width: "104px", height: "143px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "52px 52px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "35px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        R.I.P.
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "0px", top: "0", width: "104px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "600px", top: "1357px", width: "102px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-107px", width: "102px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "51px 51px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-104px", width: "102px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "51px 51px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-101px", width: "102px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "51px 51px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-97px", width: "102px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "51px 51px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-94px", width: "102px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "51px 51px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-91px", width: "102px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "51px 51px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "34px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Don Anselmo
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "33px", top: "0", width: "69px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "949px", top: "255px", width: "95px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(121px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-105px", width: "95px", height: "121px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "8px 8px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "15px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Descansa
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-26px", top: "0", width: "121px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.openBring} role="button" aria-label="Caldero" style={{ position: "absolute", left: "650px", top: "150px", width: "104px", height: "64px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(72px)", borderRadius: "50%", background: "#0c0b0a", boxShadow: "inset 0 0 0 6px #242120" }}>
                      <div style={{ position: "absolute", inset: "8px", borderRadius: "50%", background: "radial-gradient(ellipse at 50% 45%,#c6f27a,#5fbf3a 45%,#1f5a1a 90%)", animation: "pt-brew 3s ease-in-out infinite" }}>
                        <div style={{ position: "absolute", left: "22%", top: "30%", width: "12px", height: "12px", borderRadius: "50%", border: "2px solid #d9ff9e", animation: "pt-bubble 1.8s ease-out infinite" }} />
                        <div style={{ position: "absolute", left: "58%", top: "48%", width: "9px", height: "9px", borderRadius: "50%", border: "2px solid #d9ff9e", animation: "pt-bubble 2.3s ease-out infinite .7s" }} />
                        <div style={{ position: "absolute", left: "44%", top: "18%", width: "7px", height: "7px", borderRadius: "50%", border: "2px solid #d9ff9e", animation: "pt-bubble 1.5s ease-out infinite 1.2s" }} />
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "0", top: "-8px", width: "104px", height: "72px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "radial-gradient(ellipse at 50% 0,rgba(120,220,90,.25),transparent 60%),linear-gradient(180deg,#2a2725,#0f0e0d)", borderRadius: "4px 4px 52px 52px / 4px 4px 40px 40px", borderTop: "7px solid #3a3633", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "6px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "inherit", gap: "inherit", width: "100%", opacity: v.cBring ? 1 : 0, filter: v.cBring ? "none" : "blur(5px)", transition: "opacity 1.3s ease .9s, filter 1.3s ease .9s" }}>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "9px", letterSpacing: ".3em", color: "#9fd77a" }}>
                          BREBAJES
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "9px", letterSpacing: ".3em", color: "#9fd77a", marginTop: "2px" }}>
                          Y GOLOSINAS
                        </div>
                      </div>
                      <SealedFace kind="bring" size={30} label={false} broken={!!v.cBring} />
                    </div>
                    <div style={{ position: "absolute", left: "32px", top: "0", width: "72px", height: "64px", transformOrigin: "right", transform: "rotateY(90deg)", background: "linear-gradient(180deg,#1a1817,#0a0908)", borderRadius: "0 0 30px 30px" }} />
                  </div>
                  <div style={{ position: "absolute", left: "630px", top: "229px", width: "14px", height: "9px", borderRadius: "50%", background: "#e8785d", boxShadow: "-5px 0 0 -2px #f2b44a,5px 0 0 -2px #f2b44a", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", left: "770px", top: "157px", width: "12px", height: "12px", borderRadius: "50%", background: "radial-gradient(circle,#fff 0 2px,#b25adf 3px)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", left: "704px", top: "239px", width: "16px", height: "8px", borderRadius: "4px", background: "#f2b44a", boxShadow: "-5px 0 0 -2px #e8785d,5px 0 0 -2px #e8785d", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", left: "776px", top: "207px", width: "10px", height: "10px", borderRadius: "50%", background: "#7fd35a", pointerEvents: "none" }} />
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "70px", top: "754px", width: "71px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-81px", width: "71px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-78px", width: "71px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-75px", width: "71px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-71px", width: "71px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-68px", width: "71px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-65px", width: "71px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "35.5px 35.5px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "24px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "12px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Doña Clara
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "17px", top: "0", width: "54px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "37px", top: "1364px", width: "104px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-150px", width: "104px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-147px", width: "104px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-144px", width: "104px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-140px", width: "104px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-137px", width: "104px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "52px 52px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-134px", width: "104px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "52px 52px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "35px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Siga buscando
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-7px", top: "0", width: "111px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "495px", top: "378px", width: "118px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(98px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-82px", width: "118px", height: "98px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "18px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        El que llegó tarde
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "20px", top: "0", width: "98px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "101px", top: "1161px", width: "94px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(81px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-65px", width: "94px", height: "81px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "14px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        1901
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "13px", top: "0", width: "81px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "699px", top: "876px", width: "72px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(154px)", background: "#3e3934" }} />
                    <div style={{ position: "absolute", left: "0", top: "-138px", width: "72px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "12px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Perdido
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-82px", top: "0", width: "154px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412" }} />
                  </div>
                  <div onClick={v.decoy} role="button" aria-label="Lápida" style={{ position: "absolute", left: "548px", top: "1180px", width: "71px", height: "16px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-154px", width: "71px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-151px", width: "71px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-148px", width: "71px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-144px", width: "71px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-141px", width: "71px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "35.5px 35.5px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-138px", width: "71px", height: "154px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#35312c,#201d1a)", borderRadius: "35.5px 35.5px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "24px" }}>
                      <div style={{ fontFamily: "var(--pt-serif)", fontSize: "12px", fontWeight: "600", lineHeight: "1.1", color: "#9d9387" }}>
                        Sólo huesos
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "-56px", top: "0", width: "127px", height: "16px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#161412", borderRadius: "8px 0 0 8px" }} />
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "1262px", top: "134px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(96px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-84px", width: "14px", height: "96px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-82px", top: "0", width: "96px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "1239px", top: "134px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(56px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "1092px", top: "1399px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(109px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-97px", width: "14px", height: "109px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-95px", top: "0", width: "109px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "1069px", top: "1399px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(69px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "894px", top: "131px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(92px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-80px", width: "14px", height: "92px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-78px", top: "0", width: "92px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "871px", top: "131px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(52px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "1258px", top: "824px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(95px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-83px", width: "14px", height: "95px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-81px", top: "0", width: "95px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "1235px", top: "824px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(55px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "427px", top: "1404px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(107px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-95px", width: "14px", height: "107px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-93px", top: "0", width: "107px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "404px", top: "1404px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(67px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "922px", top: "1381px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(87px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-75px", width: "14px", height: "87px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-73px", top: "0", width: "87px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "899px", top: "1381px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(47px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "132px", top: "422px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(119px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-107px", width: "14px", height: "119px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-105px", top: "0", width: "119px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "109px", top: "422px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(79px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "489px", top: "529px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(117px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-105px", width: "14px", height: "117px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-103px", top: "0", width: "117px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "466px", top: "529px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(77px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "647px", top: "89px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(82px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-70px", width: "14px", height: "82px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-68px", top: "0", width: "82px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "624px", top: "89px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(42px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.decoy} style={{ position: "absolute", left: "0", top: "0", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "1406px", top: "975px", width: "14px", height: "12px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(118px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-106px", width: "14px", height: "118px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "-104px", top: "0", width: "118px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                    <div style={{ position: "absolute", left: "1383px", top: "975px", width: "60px", height: "12px", transformStyle: "preserve-3d", transform: "translateZ(78px)" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(14px)", background: "#34302b" }} />
                      <div style={{ position: "absolute", left: "0", top: "-2px", width: "60px", height: "14px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#2c2824" }} />
                      <div style={{ position: "absolute", left: "46px", top: "0", width: "14px", height: "12px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#141210" }} />
                    </div>
                  </div>
                  <div onClick={v.openRsvp} role="button" aria-label="Mausoleo" style={{ position: "absolute", left: "90px", top: "80px", width: "220px", height: "170px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-150px", width: "220px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "36px 36px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-116px", width: "220px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "36px 36px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-82px", width: "220px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "36px 36px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-48px", width: "220px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "36px 36px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-14px", width: "220px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "36px 36px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "20px", width: "220px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", display: "flex", alignItems: "flex-end", justifyContent: "center", background: "linear-gradient(90deg,#2a2622 0 18px,transparent 18px calc(100% - 18px),#2a2622 0),linear-gradient(180deg,#3a352f,#211e1b)" }}>
                      <div style={{ width: "72px", height: "104px", borderRadius: "36px 36px 0 0", background: v.rsvpDoor, boxShadow: v.rsvpShadow, transition: "background 1.2s,box-shadow 1.2s", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--pt-serif)", fontSize: "12px", letterSpacing: ".2em", color: v.rsvpInk }}>
                        RSVP
                      </div>
                    </div>
                    <div style={{ position: "absolute", left: "97px", top: "0", width: "123px", height: "170px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815", borderRadius: "85px 0 0 85px" }} />
                  </div>
                  <div onClick={v.openRsvp} role="button" aria-label="Mausoleo" style={{ position: "absolute", left: "74px", top: "64px", width: "252px", height: "202px", transformStyle: "preserve-3d", transform: "translateZ(150px)", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(30px)", background: "#4a443d" }} />
                    <div style={{ position: "absolute", left: "0", top: "172px", width: "252px", height: "30px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--pt-serif)", fontSize: "13px", letterSpacing: ".4em", color: "#aa9f93" }}>
                      CONFIRMA AQUÍ
                    </div>
                    <div style={{ position: "absolute", left: "222px", top: "0", width: "30px", height: "202px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815" }} />
                  </div>
                  <div style={{ position: "absolute", left: "130px", top: "110px", width: "140px", height: "120px", transformStyle: "preserve-3d", transform: "translateZ(180px)" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(40px)", background: "#403a34" }} />
                    <div style={{ position: "absolute", left: "0", top: "80px", width: "140px", height: "40px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)" }} />
                    <div style={{ position: "absolute", left: "100px", top: "0", width: "40px", height: "120px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815" }} />
                  </div>
                  <div onClick={v.openPlace} role="button" aria-label="Lápida" style={{ position: "absolute", left: "720px", top: "690px", width: "124px", height: "22px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-150px", width: "124px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-146px", width: "124px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-141px", width: "124px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-137px", width: "124px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-132px", width: "124px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-128px", width: "124px", height: "150px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)", borderRadius: "62px 62px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", paddingTop: "30px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "inherit", gap: "inherit", width: "100%", opacity: v.cPlace ? 1 : 0, filter: v.cPlace ? "none" : "blur(5px)", transition: "opacity 1.3s ease .9s, filter 1.3s ease .9s" }}>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "11px", letterSpacing: ".3em" }}>
                          ¿DÓNDE?
                        </div>
                        <div style={{ position: "relative", width: "78px", height: "46px", margin: "6px 0", border: "1px solid #6a6158", borderRadius: "3px", background: "#2c2824" }}>
                          <div style={{ position: "absolute", left: "8px", top: "32px", width: "44px", height: "1px", borderTop: "2px dashed #8a7f73", transform: "rotate(-24deg)", transformOrigin: "left" }} />
                          <div style={{ position: "absolute", left: "50px", top: "8px", width: "14px", height: "14px", fontFamily: "var(--pt-serif)", fontSize: "18px", lineHeight: "14px", fontWeight: "700", color: "#d9573b" }}>
                            ✕
                          </div>
                          <div style={{ position: "absolute", right: "4px", bottom: "2px", fontFamily: "var(--pt-serif)", fontSize: "9px", color: "#8a7f73" }}>
                            N↑
                          </div>
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "18px", fontWeight: "600", lineHeight: "1.05", color: "#d2c7ba" }}>
                          {v.venue}
                        </div>
                      </div>
                      <SealedFace kind="place" size={58} broken={!!v.cPlace} />
                    </div>
                    <div style={{ position: "absolute", left: "20px", top: "0", width: "104px", height: "22px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815", borderRadius: "11px 0 0 11px" }} />
                  </div>
                  <div onClick={v.openTheme} role="button" aria-label="Obelisco" style={{ position: "absolute", left: "1284px", top: "348px", width: "44px", height: "44px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(240px)", background: "#4d463f" }} />
                    <div style={{ position: "absolute", left: "0", top: "-196px", width: "44px", height: "240px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "26px", gap: "40px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "inherit", gap: "inherit", width: "100%", opacity: v.cTheme ? 1 : 0, filter: v.cTheme ? "none" : "blur(5px)", transition: "opacity 1.3s ease .9s, filter 1.3s ease .9s" }}>
                        <svg width="40" height="18" viewBox="0 0 56 22">
                          <path d="M2 6 Q14 0 28 6 Q42 0 54 6 Q54 18 40 18 Q32 18 28 12 Q24 18 16 18 Q2 18 2 6Z" fill="#b8ad9f" />
                          <ellipse cx="16" cy="10" rx="6" ry="3.5" fill="#1d1a17" />
                          <ellipse cx="40" cy="10" rx="6" ry="3.5" fill="#1d1a17" />
                        </svg>
                        <div style={{ width: "26px", height: "34px", borderRadius: "50% 50% 45% 45%", border: "2px solid #8a7f73", display: "flex", justifyContent: "center", gap: "5px", paddingTop: "9px" }}>
                          <div style={{ width: "6px", height: "5px", borderRadius: "50%", background: "#8a7f73" }} />
                          <div style={{ width: "6px", height: "5px", borderRadius: "50%", background: "#8a7f73" }} />
                        </div>
                      </div>
                      <SealedFace kind="theme" size={30} label={false} broken={!!v.cTheme} />
                    </div>
                    <div style={{ position: "absolute", left: "-196px", top: "0", width: "240px", height: "44px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815" }} />
                  </div>
                  <div onClick={v.openTheme} role="button" aria-label="Obelisco" style={{ position: "absolute", left: "1240px", top: "400px", width: "134px", height: "20px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(64px)", background: "#48423b" }} />
                    <div style={{ position: "absolute", left: "0", top: "-44px", width: "134px", height: "64px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "4px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "inherit", gap: "inherit", width: "100%", opacity: v.cTheme ? 1 : 0, filter: v.cTheme ? "none" : "blur(5px)", transition: "opacity 1.3s ease .9s, filter 1.3s ease .9s" }}>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "16px", fontWeight: "600", color: "#d2c7ba" }}>
                          Disfrazado
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "9px", letterSpacing: ".15em" }}>
                          NO SEAS AGUAFIESTAS
                        </div>
                      </div>
                      <SealedFace kind="theme" size={30} label={false} broken={!!v.cTheme} />
                    </div>
                    <div style={{ position: "absolute", left: "70px", top: "0", width: "64px", height: "20px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815" }} />
                  </div>
                  <div onClick={v.openHost} role="button" aria-label="Lápida" style={{ position: "absolute", left: "330px", top: "1130px", width: "124px", height: "22px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", left: "0", top: "-156px", width: "124px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#141210", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-152px", width: "124px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-147px", width: "124px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-143px", width: "124px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-138px", width: "124px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#1b1815", borderRadius: "62px 62px 0 0", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", left: "0", top: "-134px", width: "124px", height: "156px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", padding: "10px", borderRadius: "62px 62px 0 0", borderTop: "4px solid #5a524a" }}>
                      <div style={{ width: "34px", height: "42px", borderRadius: "50%", border: "2px solid #9a8f82", marginBottom: "8px", background: "radial-gradient(circle at 50% 36%,#7a7066 0 7px,transparent 8px),radial-gradient(ellipse 15px 11px at 50% 100%,#7a7066 0 99%,transparent),#1d1a17", boxShadow: "0 0 0 3px #2c2824" }} />
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "inherit", gap: "inherit", width: "100%", opacity: v.cHost ? 1 : 0, filter: v.cHost ? "none" : "blur(5px)", transition: "opacity 1.3s ease .9s, filter 1.3s ease .9s" }}>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "10px", letterSpacing: ".3em" }}>
                          AQUÍ YACE
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "25px", fontWeight: "600", lineHeight: "1.05", color: "#d2c7ba", margin: "4px 0" }}>
                          {v.host}
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontStyle: "italic", fontSize: "12px" }}>
                          anfitrión
                        </div>
                        <div style={{ display: "flex", gap: "3px", alignItems: "center", marginTop: "4px", fontFamily: "var(--pt-mono)", fontSize: "7px", color: "#aa9f93" }}>
                          <span>
                            20·XI·1994 —
                          </span>
                          <span style={{ position: "relative", color: "#8a7f73", animation: "pt-deathGlitch 3.5s steps(1) infinite" }}>
                            20·XI·??
                            <span style={{ position: "absolute", left: "-1px", right: "-1px", top: "50%", height: "1px", background: "#b3140f" }} />
                          </span>
                        </div>
                      </div>
                      <SealedFace kind="host" size={50} broken={!!v.cHost} />
                    </div>
                    <div style={{ position: "absolute", left: "14px", top: "0", width: "110px", height: "22px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815", borderRadius: "11px 0 0 11px" }} />
                  </div>
                  <div onClick={v.openDate} role="button" aria-label="Lápida" style={{ position: "absolute", left: "1010px", top: "1230px", width: "130px", height: "22px", transformStyle: "preserve-3d", cursor: "pointer" }}>
                    <div style={{ position: "absolute", inset: "0", transform: "translateZ(176px)", background: "#48423b" }} />
                    <div style={{ position: "absolute", left: "0", top: "-154px", width: "130px", height: "176px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "linear-gradient(180deg,#3e3934,#25221e)", borderRadius: "6px 6px 0 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", color: "#aa9f93", textShadow: "0 1px 0 rgba(0,0,0,.7)", justifyContent: "flex-start", padding: "0 0 10px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "inherit", gap: "inherit", width: "100%", opacity: v.cDate ? 1 : 0, filter: v.cDate ? "none" : "blur(5px)", transition: "opacity 1.3s ease .9s, filter 1.3s ease .9s" }}>
                        <div style={{ position: "relative", alignSelf: "stretch", height: "30px", background: "#6e1e14", borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--pt-serif)", fontSize: "13px", fontWeight: "700", letterSpacing: ".3em", color: "#f0d9cc" }}>
                          <div style={{ position: "absolute", left: "24px", top: "-8px", width: "8px", height: "16px", borderRadius: "4px", background: "#1b1815" }} />
                          <div style={{ position: "absolute", right: "24px", top: "-8px", width: "8px", height: "16px", borderRadius: "4px", background: "#1b1815" }} />
                          OCTUBRE
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "72px", fontWeight: "700", lineHeight: "1", color: "#d2c7ba", margin: "10px 0 2px" }}>
                          31
                        </div>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "11px", letterSpacing: ".2em" }}>
                          FALTAN {v.cdDays} NOCHES
                        </div>
                        <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", marginTop: "4px" }}>
                          {v.cdClock}
                        </div>
                      </div>
                      <SealedFace kind="date" size={64} broken={!!v.cDate} />
                    </div>
                    <div style={{ position: "absolute", left: "-46px", top: "0", width: "176px", height: "22px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#1b1815" }} />
                  </div>
                  <div style={{ position: "absolute", left: "1055px", top: "1266px", width: "40px", height: "40px", transformStyle: "preserve-3d", opacity: v.cDate, transition: "opacity .6s", pointerEvents: "none" }}>
                    {v.glow} 
                    <div style={{ position: "absolute", left: "15px", top: "15px", width: "10px", height: "10px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(22px)", background: "#ffd79a" }} />
                      <div style={{ position: "absolute", left: "0", top: "-12px", width: "10px", height: "22px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#d9d0c0" }} />
                      <div style={{ position: "absolute", left: "-12px", top: "0", width: "22px", height: "10px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#a89f90" }} />
                    </div>
                  </div>
                  <div style={{ position: "absolute", left: "372px", top: "1166px", width: "40px", height: "40px", transformStyle: "preserve-3d", opacity: v.cHost, transition: "opacity .6s", pointerEvents: "none" }}>
                    {v.glow} 
                    <div style={{ position: "absolute", left: "15px", top: "15px", width: "10px", height: "10px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(22px)", background: "#ffd79a" }} />
                      <div style={{ position: "absolute", left: "0", top: "-12px", width: "10px", height: "22px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#d9d0c0" }} />
                      <div style={{ position: "absolute", left: "-12px", top: "0", width: "22px", height: "10px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#a89f90" }} />
                    </div>
                  </div>
                  <div style={{ position: "absolute", left: "1287px", top: "434px", width: "40px", height: "40px", transformStyle: "preserve-3d", opacity: v.cTheme, transition: "opacity .6s", pointerEvents: "none" }}>
                    {v.glow} 
                    <div style={{ position: "absolute", left: "15px", top: "15px", width: "10px", height: "10px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(22px)", background: "#ffd79a" }} />
                      <div style={{ position: "absolute", left: "0", top: "-12px", width: "10px", height: "22px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#d9d0c0" }} />
                      <div style={{ position: "absolute", left: "-12px", top: "0", width: "22px", height: "10px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#a89f90" }} />
                    </div>
                  </div>
                  <div style={{ position: "absolute", left: "762px", top: "726px", width: "40px", height: "40px", transformStyle: "preserve-3d", opacity: v.cPlace, transition: "opacity .6s", pointerEvents: "none" }}>
                    {v.glow} 
                    <div style={{ position: "absolute", left: "15px", top: "15px", width: "10px", height: "10px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(22px)", background: "#ffd79a" }} />
                      <div style={{ position: "absolute", left: "0", top: "-12px", width: "10px", height: "22px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#d9d0c0" }} />
                      <div style={{ position: "absolute", left: "-12px", top: "0", width: "22px", height: "10px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#a89f90" }} />
                    </div>
                  </div>
                  <div style={{ position: "absolute", left: "772px", top: "117px", width: "40px", height: "40px", transformStyle: "preserve-3d", opacity: v.cBring, transition: "opacity .6s", pointerEvents: "none" }}>
                    {v.glow} 
                    <div style={{ position: "absolute", left: "15px", top: "15px", width: "10px", height: "10px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(22px)", background: "#ffd79a" }} />
                      <div style={{ position: "absolute", left: "0", top: "-12px", width: "10px", height: "22px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#d9d0c0" }} />
                      <div style={{ position: "absolute", left: "-12px", top: "0", width: "22px", height: "10px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#a89f90" }} />
                    </div>
                  </div>
                  <div style={{ position: "absolute", left: "180px", top: "264px", width: "40px", height: "40px", transformStyle: "preserve-3d", opacity: v.cRsvp, transition: "opacity .6s", pointerEvents: "none" }}>
                    {v.glow} 
                    <div style={{ position: "absolute", left: "15px", top: "15px", width: "10px", height: "10px", transformStyle: "preserve-3d" }}>
                      <div style={{ position: "absolute", inset: "0", transform: "translateZ(22px)", background: "#ffd79a" }} />
                      <div style={{ position: "absolute", left: "0", top: "-12px", width: "10px", height: "22px", transformOrigin: "bottom", transform: "rotateX(-90deg)", background: "#d9d0c0" }} />
                      <div style={{ position: "absolute", left: "-12px", top: "0", width: "22px", height: "10px", transformOrigin: "right", transform: "rotateY(90deg)", background: "#a89f90" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: "0", pointerEvents: "none", opacity: ".7" }}>
              {v.fog}
            </div>
          </section>
          {v.showHint ? (
              <div key={v.hintKey} style={{ position: "fixed", top: "0", bottom: "0", left: "0", right: "0", zIndex: "55", pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px", opacity: "0", animation: "pt-hintInOut 6s ease-in-out 1.8s forwards" }}>
                <div style={{ fontFamily: "var(--pt-creep)", fontSize: "44px", lineHeight: "1.05", letterSpacing: ".03em", textAlign: "center", textWrap: "balance", color: "#b3140f", textShadow: "0 2px 0 #2a0303,0 0 24px rgba(179,20,15,.45)" }}>
                  {v.hintText}
                </div>
              </div>
          ) : null}
          {v.edgeOn ? (
              <div style={{ position: "fixed", top: "0", bottom: "0", left: "0", right: "0", zIndex: "45", pointerEvents: "none", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: "0", background: `radial-gradient(circle 190px at ${v.edgeX} ${v.edgeY},rgba(255,110,70,.55),rgba(217,87,59,.22) 45%,transparent 75%)`, animation: "pt-edgePulse 2.2s ease-in-out infinite" }} />
              </div>
          ) : null}
          {v.darkOn ? (
              <div style={{ position: "fixed", inset: "0", zIndex: "40", pointerEvents: "none", background: "rgba(6,5,4,.96)", WebkitMaskImage: v.darkMask, maskImage: v.darkMask, WebkitMaskComposite: "source-in", maskComposite: "intersect" }} />
          ) : null}
          <div style={{ position: "fixed", left: "0", right: "0", bottom: "0", zIndex: "50", padding: "16px max(clamp(20px, 4vw, 48px), env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) max(clamp(20px, 4vw, 48px), env(safe-area-inset-left))", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "linear-gradient(180deg,transparent,rgba(7,6,5,.85) 40%)", pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".2em", textTransform: "uppercase", color: "#a79d92" }}>
                Secretos {v.foundCount}/5
              </div>
              {/* One candle per secret (replaces the design's progress bars):
                  unlit wax until found, then the flame catches and flickers. */}
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", height: "34px" }}>
                {v.candles.map((c, i) => (
                  <div key={i} style={{ position: "relative", width: "12px", height: "34px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                    <div style={{ position: "absolute", left: "50%", top: "2px", width: "34px", height: "34px", marginLeft: "-17px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,170,90,.4), rgba(255,140,60,.1) 45%, transparent 70%)", opacity: c.lit ? 1 : 0, transition: "opacity .8s ease .15s", pointerEvents: "none" }} />
                    <div style={{ width: "7px", height: "12px", transformOrigin: "50% 100%", transform: c.lit ? "scale(1)" : "scale(0)", opacity: c.lit ? 1 : 0, transition: "transform .45s cubic-bezier(.3,1.7,.5,1), opacity .2s" }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "50% 50% 40% 40%", background: "radial-gradient(ellipse at 50% 70%, #fff4d6 0 25%, #ffcf8a 50%, #e8785d 100%)", boxShadow: "0 0 10px 3px rgba(255,170,90,.55)", transformOrigin: "50% 100%", animation: "pt-candle 1.4s ease-in-out infinite", animationDelay: `${i * 0.23}s` }} />
                    </div>
                    <div style={{ width: "1.5px", height: "4px", background: c.lit ? "#2a1a10" : "#3a332d" }} />
                    <div style={{ width: "10px", height: "16px", borderRadius: "2px 2px 1px 1px", background: c.lit ? "linear-gradient(180deg,#fff1dc,#d9d0c0 35%,#b8ad9f)" : "linear-gradient(180deg,#4a433c,#2e2925)", transition: "background .6s" }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
      {v.hasMsg ? (
          <div style={{ position: "fixed", left: "50%", bottom: "96px", transform: "translateX(-50%)", zIndex: "52", maxWidth: "320px", padding: "12px 20px", borderRadius: "999px", background: "rgba(21,18,15,.92)", border: "1px solid rgba(236,230,220,.14)", fontFamily: "var(--pt-serif)", fontStyle: "italic", fontSize: "18px", color: "#d6cec4", textAlign: "center", pointerEvents: "none", animation: "pt-rise .3s ease both" }}>
            {v.msg}
          </div>
      ) : null}
      {v.sheetOpen ? (
        <>
          <div onClick={v.close} style={{ position: "fixed", inset: "0", zIndex: "55", background: "rgba(0,0,0,.45)" }} />
          <div data-screen-label="03 Lápida abierta" style={{ position: "fixed", left: "0", right: "0", bottom: "0", maxWidth: "440px", margin: "0 auto", zIndex: "60", maxHeight: "86vh", overflowY: "auto", background: "#15120f", borderTop: "1px solid rgba(236,230,220,.12)", borderRadius: "24px 24px 0 0", padding: "12px 24px calc(28px + env(safe-area-inset-bottom))", animation: "pt-sheetUp .35s cubic-bezier(.2,.8,.2,1) both", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ alignSelf: "center", width: "40px", height: "4px", borderRadius: "2px", background: "rgba(236,230,220,.2)" }} />
            {v.isDate ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: "#e8785d" }}>
                    Aquí yace la espera
                  </div>
                  <div style={{ fontFamily: "var(--pt-serif)", fontSize: "44px", lineHeight: "1" }}>
                    {v.dateBig}
                  </div>
                  <div style={{ fontSize: "15px", color: "#bdb3a8", textTransform: "capitalize" }}>
                    {v.dateLabel}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "8px" }}>
                    {v.countdown.map((c, i) => (
                      <Fragment key={i}>
                        <div style={{ border: "1px solid rgba(236,230,220,.14)", borderRadius: "14px", padding: "14px 4px 12px", display: "flex", flexDirection: "column", gap: "4px", alignItems: "center" }}>
                          <div style={{ fontFamily: "var(--pt-mono)", fontSize: "28px", fontWeight: "500", fontVariantNumeric: "tabular-nums" }}>
                            {c.v}
                          </div>
                          <div style={{ fontSize: "10px", letterSpacing: ".2em", textTransform: "uppercase", color: "#a79d92" }}>
                            {c.l}
                          </div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ fontSize: "14px", color: "#bdb3a8" }}>
                      No dejes que se te olvide. Márcalo en tu calendario.
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "8px" }}>
                      <a href={v.gcalUrl} target="_blank" rel="noopener" style={{ height: "48px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "#d9573b", color: "#140e0c", fontWeight: "700", fontSize: "13px", letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>
                        Google Calendar
                      </a>
                      <a href={v.icsUrl} download="fiesta.ics" style={{ height: "48px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", border: "1px solid rgba(236,230,220,.25)", color: "#ece6dc", fontWeight: "600", fontSize: "13px", letterSpacing: ".06em", textTransform: "uppercase", textDecoration: "none" }}>
                        Apple / Outlook
                      </a>
                    </div>
                  </div>
                </div>
            ) : null}
            {v.isHost ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: "#e8785d" }}>
                    Host
                  </div>
                  <div style={{ fontFamily: "var(--pt-serif)", fontSize: "44px", lineHeight: "1" }}>
                    Aquí yace {v.host}
                  </div>
                  {/* Two fixed lines (deviation from the design): the death text
                      alternates "ERROR" / "▒▒ de ▒▒▒▒ de 20▒▒", and on one wrapping
                      row it jumped lines and resized the sheet every second. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontFamily: "var(--pt-serif)", fontSize: "20px", color: "#bdb3a8" }}>
                    <span>
                      20 de noviembre de 1994 —
                    </span>
                    <span style={{ height: "24px", display: "flex", alignItems: "center" }}>
                      <span style={{ position: "relative", whiteSpace: "nowrap", fontFamily: "var(--pt-mono)", fontSize: "15px", color: "#8a7f73", textDecoration: "line-through", textDecorationColor: "#b3140f", textDecorationThickness: "2px", animation: "pt-deathGlitch 3.5s steps(1) infinite" }}>
                        {v.deathText}
                      </span>
                    </span>
                  </div>
                </div>
            ) : null}
            {v.isTheme ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: "#e8785d" }}>
                    Vestimenta
                  </div>
                  <div style={{ fontFamily: "var(--pt-serif)", fontSize: "44px", lineHeight: "1" }}>
                    Disfrazado
                  </div>
                  <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.6", color: "#bdb3a8", textWrap: "pretty" }}>
                    No seas un aburrido aguafiestas.
                  </p>
                </div>
            ) : null}
            {v.isBring ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: "#e8785d" }}>
                    Qué llevar
                  </div>
                  <div style={{ fontFamily: "var(--pt-serif)", fontSize: "44px", lineHeight: "1" }}>
                    Brebajes y golosinas
                  </div>
                  <div style={{ fontSize: "15px", color: "#bdb3a8" }}>
                    De tu preferencia.
                  </div>
                </div>
            ) : null}
            {v.isPlace ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: "#e8785d" }}>
                    ¿Dónde?
                  </div>
                  <div style={{ fontFamily: "var(--pt-serif)", fontSize: "40px", lineHeight: "1" }}>
                    {v.venue}
                  </div>
                  {v.hasAddress ? (
                      <div style={{ fontSize: "15px", color: "#bdb3a8" }}>
                        {v.address}
                      </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <a href={v.gmapsUrl} target="_blank" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "52px", borderRadius: "999px", background: "#ece6dc", color: "#140e0c", fontWeight: "600", fontSize: "15px" }}>
                      Google Maps
                    </a>
                    <a href={v.wazeUrl} target="_blank" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "52px", borderRadius: "999px", border: "1px solid rgba(236,230,220,.3)", color: "#ece6dc", fontWeight: "600", fontSize: "15px" }}>
                      Waze
                    </a>
                  </div>
                </div>
            ) : null}
            {v.isRsvp ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ fontFamily: "var(--pt-mono)", fontSize: "11px", letterSpacing: ".3em", textTransform: "uppercase", color: "#e8785d" }}>
                    Confirmación
                  </div>
                  <div style={{ fontFamily: "var(--pt-serif)", fontSize: "40px", lineHeight: "1" }}>
                    ¿Cruzarás la puerta?
                  </div>
                  {v.notSubmitted ? (
                      <form onSubmit={v.submit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#a79d92" }}>
                          Tu nombre 
                          <input value={v.f.name} onChange={v.setName} required placeholder="Nombre y apellido" style={{ height: "52px", padding: "0 16px", borderRadius: "14px", border: "1px solid rgba(236,230,220,.18)", background: "#0d0b0a", color: "#ece6dc", fontSize: "16px", outline: "none" }} />
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                          {v.attendOpts.map((o, i) => (
                            <Fragment key={i}>
                              <button type="button" onClick={o.pick} style={{ height: "52px", borderRadius: "14px", border: `1px solid ${o.border}`, background: o.bg, color: o.color, fontWeight: "600", fontSize: "15px", cursor: "pointer" }}>
                                {o.label}
                              </button>
                            </Fragment>
                          ))}
                        </div>
                        {v.f.attending ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                              <button type="button" onClick={v.togglePlus} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "52px", padding: "0 16px", borderRadius: "14px", border: "1px solid rgba(236,230,220,.18)", background: "#0d0b0a", color: "#ece6dc", fontSize: "15px", cursor: "pointer" }}>
                                <span>
                                  Voy con acompañante (+1)
                                </span>
                                <span style={{ width: "44px", height: "26px", borderRadius: "999px", background: v.plusTrack, display: "flex", alignItems: "center", padding: "3px", justifyContent: v.plusJustify }}>
                                  <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#ece6dc" }} />
                                </span>
                              </button>
                              {v.f.plusOne ? (
                                  <input value={v.f.plusName} onChange={v.setPlusName} placeholder="Nombre de tu acompañante" style={{ height: "52px", padding: "0 16px", borderRadius: "14px", border: "1px solid rgba(236,230,220,.18)", background: "#0d0b0a", color: "#ece6dc", fontSize: "16px", outline: "none" }} />
                              ) : null}
                              <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#a79d92" }}>
                                Bebida preferida 
                                <select value={v.f.drink} onChange={v.setDrink} style={{ height: "52px", padding: "0 16px", borderRadius: "14px", border: "1px solid rgba(236,230,220,.18)", background: "#0d0b0a", color: "#ece6dc", fontSize: "16px" }}>
                                  <option value="">
                                    Elige una
                                  </option>
                                  <option value="Vino tinto">
                                    Vino tinto
                                  </option>
                                  <option value="Cerveza">
                                    Cerveza
                                  </option>
                                  <option value="Cócteles">
                                    Cócteles
                                  </option>
                                  <option value="Destilados">
                                    Destilados
                                  </option>
                                  <option value="Sin alcohol">
                                    Sin alcohol
                                  </option>
                                </select>
                              </label>
                              <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", color: "#a79d92" }}>
                                Spoiler de disfraz (opcional, solo lo ve el anfitrión) 
                                <input value={v.f.costume} onChange={v.setCostume} placeholder="¿De qué piensas ir?" style={{ height: "52px", padding: "0 16px", borderRadius: "14px", border: "1px solid rgba(236,230,220,.18)", background: "#0d0b0a", color: "#ece6dc", fontSize: "16px", outline: "none" }} />
                              </label>
                              {v.dupWarning ? (
                                  <div style={{ fontSize: "14px", lineHeight: "1.5", color: "#e8785d" }}>
                                    Alguien ya va de {v.dupName}. Puedes repetirlo, pero no habrá sorpresa.
                                  </div>
                              ) : null}
                            </div>
                        ) : null}
                        {v.hasError ? (
                          <div role="alert" style={{ fontSize: "14px", lineHeight: "1.5", color: "#e8785d" }}>
                            {v.error}
                          </div>
                        ) : null}
                        <button type="submit" disabled={v.sending} style={{ opacity: v.sending ? 0.6 : 1,  height: "56px", borderRadius: "999px", border: "none", background: "#d9573b", color: "#140e0c", fontWeight: "700", fontSize: "15px", letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer" }}>
                          {v.submitLabel}
                        </button>
                      </form>
                  ) : null}
                  {v.submitted ? (
                      <div style={{ border: "1px solid rgba(236,230,220,.14)", borderRadius: "18px", padding: "22px", display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ fontFamily: "var(--pt-serif)", fontSize: "30px", lineHeight: "1.1" }}>
                          {v.thanksTitle}
                        </div>
                        <div style={{ fontSize: "15px", lineHeight: "1.6", color: "#bdb3a8" }}>
                          {v.thanksBody}
                        </div>
                        <button onClick={v.editRsvp} style={{ alignSelf: "start", background: "none", border: "none", padding: "0", color: "#e8785d", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }}>
                          Editar respuesta
                        </button>
                      </div>
                  ) : null}
                  {v.showPlaylist ? <PartyPlaylistCard className="mt-3" /> : null}
                </div>
            ) : null}
            <button onClick={v.close} style={{ height: "52px", borderRadius: "999px", border: "1px solid rgba(236,230,220,.25)", background: "transparent", color: "#ece6dc", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}>
              {v.closeLabel}
            </button>
          </div>
        </>
      ) : null}
      <div style={{ position: "fixed", inset: "0", zIndex: "90", pointerEvents: "none", animation: "pt-glitchA 9s steps(1) infinite 3s", opacity: "0", backdropFilter: "invert(1) hue-rotate(160deg) contrast(1.6)", WebkitBackdropFilter: "invert(1) hue-rotate(160deg) contrast(1.6)" }} />
      <div style={{ position: "fixed", inset: "0", zIndex: "91", pointerEvents: "none", animation: "pt-glitchB 13s steps(1) infinite 5s", opacity: "0", background: "repeating-linear-gradient(0deg,rgba(0,0,0,.35) 0 2px,transparent 2px 4px),linear-gradient(180deg,transparent 30%,rgba(255,0,60,.25) 30% 34%,transparent 34% 61%,rgba(0,255,230,.22) 61% 64%,transparent 64%)", mixBlendMode: "screen" }} />
    </div>
  );
}
