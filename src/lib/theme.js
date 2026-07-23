import { createContext } from "react";
import { ls } from "./storage.js";

// ─── PALETTE ──────────────────────────────────────────────────────────────────
export const DARK_THEME = {
  mode: "dark",
  // ── Base / cosmic backgrounds ──────────────────────────────────────────────
  bg:       "#07050f",   // deep black-plum
  cosmic:   "#0a0618",   // even deeper for hero surfaces
  surface:  "#0e0b1e",   // plum-tinted surface
  surfaceHi:"#160e2c",   // elevated card surface
  surfaceMid:"#1c1236",  // mid surface
  border:   "#241848",   // plum border
  borderHi: "#32205e",   // highlighted border
  navBg:    "rgba(10,10,22,0.98)",
  // ── Primary brand ──────────────────────────────────────────────────────────
  accent:   "#b8a2ff",   // lavender purple
  accentDim:"#6e52cc",   // dim purple
  accentGlow:"rgba(184,162,255,0.12)",
  lavender: "#c4b5fd",   // soft lavender (new)
  iris:     "#818cf8",   // blue-violet (new)
  // ── Pinks / roses ──────────────────────────────────────────────────────────
  pink:     "#f0a8cc",   // soft pink
  pinkDim:  "#a0607a",
  blush:    "#fda4af",   // warm blush (new)
  berry:    "#e879a0",   // deep berry/magenta (new)
  rose:     "#ff8fa3",
  coral:    "#ff9f7f",
  // ── Cool accents ───────────────────────────────────────────────────────────
  mint:     "#A8DDF2",   // opal lavender-blue — replaces green/mint app-wide (was "#8eefd4")
  mintDim:  "#4E7F99",   // dimmed opal blue (was "#4aab8e")
  teal:     "#2dd4bf",   // vivid teal (new)
  sky:      "#88c8f0",
  // ── Neutral / metallic ─────────────────────────────────────────────────────
  silver:   "#ccc8f0",
  silverDim:"#6a68a0",
  gold:     "#f0cc88",
  goldDim:  "#9a7a30",
  holo:     "#e8d5ff",   // holographic white-lavender (new)
  // ── Text ───────────────────────────────────────────────────────────────────
  text:     "#ede8ff",   // slightly warmer white
  textMid:  "#a090cc",   // plum-toned mid — readable secondary
  textDim:  "#7a6aaa",   // muted lavender — readable tertiary (was near-invisible #2e1e52)
  white:    "#ffffff",
  // ── Era-inspired accents ───────────────────────────────────────────────────
  plum:     "#3b0764",   // deep plum (new)
  grape:    "#6d28d9",   // saturated violet (new)
  midnight: "#1e1b4b",   // midnight navy (new)
  // ── Inverted modal/sheet tokens — pale lavender-pink iridescent glass ──────
  modalBg:      "linear-gradient(150deg, rgba(255,241,250,0.96) 0%, rgba(230,210,255,0.9) 48%, rgba(255,246,252,0.95) 100%)",
  modalText:    "#2a1550",
  modalTextMid: "rgba(42,21,80,0.68)",
  modalTextDim: "rgba(42,21,80,0.44)",
  modalBorder:  "rgba(255,255,255,0.65)",
  modalBorderHi:"rgba(255,255,255,0.85)",
  modalShadow:  "0 -18px 70px rgba(224,185,255,0.38)",
  modalSurface: "rgba(255,255,255,0.5)",
  modalAccent:  "#8E68E8",
  // ── General-purpose "glass on page bg" tokens — replaces the many spots that
  // hardcoded rgba(255,255,255,0.0x) "white glass on dark" assuming dark mode ──
  glassBg:      "rgba(255,255,255,0.045)",
  glassBgHi:    "rgba(255,255,255,0.08)",
  glassBorder:  "rgba(255,255,255,0.12)",
  inputBg:      "rgba(8,5,18,0.55)",
  overlayBg:    "rgba(6,6,15,0.75)",
  chipInactiveBg:"rgba(255,255,255,0.05)",
  feedCard:       "linear-gradient(160deg,rgba(20,12,38,0.64),rgba(10,7,20,0.58))",
  feedCardBorder: "rgba(214,189,255,0.14)",
  feedCardShadow: "0 10px 26px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05)",
};

export const LIGHT_THEME = {
  mode: "light",
  // ── Base / cosmic backgrounds — pale lavender/pearl, never plain white ─────
  bg:       "#f8f2ff",
  cosmic:   "#efe3ff",
  surface:  "#fdfaff",
  surfaceHi:"#ffffff",
  surfaceMid:"#f2e8ff",
  border:   "#ddd0f5",
  borderHi: "#c9b4f0",
  // Pale lavender, not white: the nav's safe-area padding paints a band behind
  // the home indicator, and at rgba(255,250,255,.9) that band read as a white
  // slab against the lavender app once the shell reached the true screen bottom.
  navBg:    "rgba(246,238,255,0.92)",
  // ── Primary brand — deepened for contrast against pale surfaces ────────────
  accent:   "#8e68e8",
  accentDim:"#6b46c1",
  accentGlow:"rgba(142,104,232,0.14)",
  lavender: "#9f7fe0",
  iris:     "#5b5fc7",
  // ── Pinks / roses ────────────────────────────────────────────────────────
  pink:     "#c94f8f",
  pinkDim:  "#7a3a56",
  blush:    "#d97a8a",
  berry:    "#b8447a",
  rose:     "#d63d68",
  coral:    "#d96a4a",
  // ── Cool accents ───────────────────────────────────────────────────────────
  mint:     "#3f8fae",
  mintDim:  "#2c5e70",
  teal:     "#0f9488",
  sky:      "#3f7bb0",
  // ── Neutral / metallic ─────────────────────────────────────────────────────
  silver:   "#7a72a8",
  silverDim:"#4a4570",
  gold:     "#a97e1f",
  goldDim:  "#7a5a10",
  holo:     "#a880d9",
  // ── Text — deep purple/ink, never pure black ────────────────────────────────
  text:     "#211134",
  textMid:  "rgba(33,17,52,0.68)",
  textDim:  "rgba(33,17,52,0.42)",
  white:    "#ffffff",
  // ── Era-inspired accents — already dark, read fine on pale bg unchanged ─────
  plum:     "#3b0764",
  grape:    "#6d28d9",
  midnight: "#1e1b4b",
  // ── Inverted modal/sheet tokens — deep plum/purple iridescent glass ────────
  modalBg:      "linear-gradient(150deg, rgba(24,10,45,0.96) 0%, rgba(54,30,88,0.92) 50%, rgba(18,8,34,0.97) 100%)",
  modalText:    "#f7f0ff",
  modalTextMid: "rgba(247,240,255,0.7)",
  modalTextDim: "rgba(247,240,255,0.44)",
  modalBorder:  "rgba(198,166,255,0.32)",
  modalBorderHi:"rgba(198,166,255,0.5)",
  modalShadow:  "0 -18px 70px rgba(42,20,80,0.5)",
  modalSurface: "rgba(255,255,255,0.08)",
  modalAccent:  "#c9b6ff",
  // ── General-purpose "glass on page bg" tokens — ink-tinted glass on pale bg ─
  glassBg:      "rgba(33,17,52,0.035)",
  glassBgHi:    "rgba(33,17,52,0.07)",
  glassBorder:  "rgba(33,17,52,0.14)",
  inputBg:      "rgba(255,255,255,0.75)",
  overlayBg:    "rgba(60,40,95,0.32)",
  chipInactiveBg:"rgba(33,17,52,0.045)",
  feedCard:       "linear-gradient(160deg,rgba(255,255,255,0.9),rgba(255,250,255,0.72))",
  feedCardBorder: "rgba(33,17,52,0.12)",
  feedCardShadow: "0 10px 26px rgba(120,90,180,0.14), inset 0 1px 0 rgba(255,255,255,0.6)",
};

// `C` is a single mutable object every component reads live as `C.xxx` during
// its own render. `applyThemeMode` mutates it in place — this is intentional
// (see AppInner in App.jsx) so a theme switch takes effect across the whole
// tree without prop drilling. Every module that needs live theme colors must
// import this exact `C` reference, never construct its own copy.
export const C = Object.assign({}, DARK_THEME);

export function applyThemeMode(mode) {
  Object.assign(C, mode === "light" ? LIGHT_THEME : DARK_THEME);
}

// Apply the persisted theme preference immediately at module load so the very
// first render (and getCSS()) already reflects it — no flash of the wrong theme.
applyThemeMode(ls.get("backstage_light_mode", true) ? "light" : "dark");

export const ThemeContext = createContext({ themeMode: "light", setThemeMode: () => {} });

// CSS is a function (not a static const) so the handful of theme-colored rules
// inside it (html/body bg+text, scrollbar thumb) re-read the current, possibly
// just-toggled, C values instead of the ones frozen at module load.
export function getCSS() {
// Stardust Pulse dot/glow colors — deep purple/pink specks on light mode's pale
// bg, pale lavender/pink specks on dark mode's cosmic bg — so the ambient
// twinkle stays visible (and premium, not muddy) against either background.
const _dot1 = C.mode==="light" ? "rgba(110,70,190,0.34)" : "rgba(255,255,255,0.55)";
const _dot2 = C.mode==="light" ? "rgba(150,80,200,0.3)"  : "rgba(196,181,253,0.4)";
const _dot3 = C.mode==="light" ? "rgba(200,80,150,0.28)" : "rgba(240,168,204,0.35)";
return `
@import url('https://fonts.googleapis.com/css2?family=Epilogue:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300;1,400;1,700;1,800&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:${C.bg}}
body{color:${C.text};font-family:'Instrument Sans',sans-serif;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;overscroll-behavior:none}
/* ── Editorial italic accent class ──────────────────────────────────────── */
.bs-title{font-family:'Epilogue',sans-serif;font-style:italic;font-weight:700;letter-spacing:-0.02em}
/* ── Cosmic sparkle dots ─────────────────────────────────────────────────── */
.cosmic-bg::before{content:'';position:fixed;inset:0;background-image:radial-gradient(circle,rgba(255,255,255,0.55) 1px,transparent 1px),radial-gradient(circle,rgba(196,181,253,0.4) 1px,transparent 1px),radial-gradient(circle,rgba(240,168,204,0.35) 1px,transparent 1px);background-size:180px 180px,240px 240px,320px 320px;background-position:0 0,90px 90px,160px 40px;pointer-events:none;z-index:0;opacity:0.18;animation:starTwinkle 8s ease-in-out infinite alternate}
.cosmic-bg::after{content:'';position:fixed;inset:0;background:radial-gradient(ellipse at 15% 85%,rgba(107,33,168,0.08),transparent 55%),radial-gradient(ellipse at 85% 10%,rgba(236,72,153,0.07),transparent 55%),radial-gradient(ellipse at 50% 50%,rgba(99,102,241,0.04),transparent 60%);pointer-events:none;z-index:0}
/* ── Stardust Pulse — ambient twinkling starfield mounted per main-nav page ── */
.stardust-pulse{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.stardust-pulse::before{content:'';position:absolute;inset:-10%;background-image:radial-gradient(circle,${_dot1} 1px,transparent 1px),radial-gradient(circle,${_dot2} 1px,transparent 1px),radial-gradient(circle,${_dot3} 1px,transparent 1px);background-size:180px 180px,240px 240px,320px 320px;background-position:0 0,90px 90px,160px 40px;opacity:0.32;animation:starTwinkle 9s ease-in-out infinite alternate}
.stardust-pulse::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 15%,${C.accent}0f,transparent 45%),radial-gradient(ellipse at 85% 80%,${C.pink}0c,transparent 50%);opacity:0.7}
@media (prefers-reduced-motion: reduce){.stardust-pulse::before{animation:none!important}}
::-webkit-scrollbar{width:2px;height:2px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${C.border};border-radius:99px}
textarea,input,select{outline:none;font-family:'Instrument Sans',sans-serif;-webkit-appearance:none}
button{cursor:pointer;-webkit-tap-highlight-color:transparent}
@keyframes up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes dn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
@keyframes in{from{opacity:0}to{opacity:1}}
@keyframes pop{0%{transform:scale(.82);opacity:0}65%{transform:scale(1.05);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes glow{0%,100%{box-shadow:0 0 10px rgba(184,162,255,.18)}50%{box-shadow:0 0 28px rgba(184,162,255,.55)}}
@keyframes hb{0%,100%{transform:scale(1)}15%{transform:scale(1.28)}30%{transform:scale(1)}45%{transform:scale(1.12)}60%{transform:scale(1)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes mapPulse{0%{transform:scale(1);opacity:0.85}65%{transform:scale(2.6);opacity:0.06}100%{transform:scale(1);opacity:0.85}}
@keyframes rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}
@keyframes burst{0%{transform:scale(0);opacity:0}70%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes noteFloat{0%{transform:translateY(0) rotate(-3deg);opacity:.9}50%{transform:translateY(-8px) rotate(3deg);opacity:.6}100%{transform:translateY(0) rotate(-3deg);opacity:.9}}
@keyframes eqBar{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}
@keyframes vipShimmer{0%{background-position:200% center}100%{background-position:-200% center}}
@keyframes heatBeat{0%,100%{transform:scale(1);opacity:0.55}50%{transform:scale(1.5);opacity:0.9}}
@keyframes inviteRing{0%{transform:scale(0.8);opacity:0.7}100%{transform:scale(2.4);opacity:0}}
@keyframes confetti{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(55px) rotate(360deg);opacity:0}}
@keyframes reveal{from{opacity:0;transform:translateY(18px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes cardFlip{0%{transform:rotateY(0deg)}50%{transform:rotateY(90deg)}100%{transform:rotateY(0deg)}}
@keyframes shareGlow{0%,100%{box-shadow:0 0 14px rgba(184,162,255,.22)}50%{box-shadow:0 0 36px rgba(184,162,255,.65)}}
@keyframes viralPop{0%{transform:scale(0.7);opacity:0}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}
@keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes ambientGlow{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
@keyframes cityPulse{0%{transform:scale(1);opacity:0.7}40%{transform:scale(2.4);opacity:0}100%{transform:scale(1);opacity:0.7}}
@keyframes gradientShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes sparkleFloat{0%,100%{opacity:0.3;transform:translateY(0) rotate(0deg) scale(1)}33%{opacity:0.8;transform:translateY(-4px) rotate(12deg) scale(1.15)}66%{opacity:0.5;transform:translateY(2px) rotate(-8deg) scale(0.9)}}
@keyframes pinkGlow{0%,100%{box-shadow:0 0 10px rgba(240,168,204,.18)}50%{box-shadow:0 0 28px rgba(240,168,204,.55)}}
@keyframes concertPulse{0%,100%{transform:scale(1);opacity:0.8}50%{transform:scale(1.06);opacity:1}}
@keyframes countdownFlash{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slideInLeft{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes notifDrop{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes checkBounce{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes starTwinkle{0%{opacity:0.12}50%{opacity:0.22}100%{opacity:0.15}}
@keyframes bellPulse{0%,100%{transform:scale(1);box-shadow:0 0 10px rgba(184,162,255,.3)}50%{transform:scale(1.12);box-shadow:0 0 24px rgba(184,162,255,.7)}}
@keyframes notifBadgePop{0%{transform:scale(0)}70%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes holoBorder{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes crewOrbit{0%{transform:rotate(0deg) translateX(28px) rotate(0deg)}100%{transform:rotate(360deg) translateX(28px) rotate(-360deg)}}
@keyframes searchSlideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@keyframes orbitSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes orbitPulse{0%,100%{transform:scale(1);opacity:0.7}50%{transform:scale(1.12);opacity:1}}
@keyframes cardShimmer{0%{background-position:200% center}100%{background-position:-200% center}}
@keyframes polaroidIn{from{transform:rotate(var(--rot)) scale(0.9);opacity:0}to{transform:rotate(var(--rot)) scale(1);opacity:1}}
@keyframes holoShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes cosmicDrift{0%{transform:translateY(0) translateX(0)}33%{transform:translateY(-3px) translateX(2px)}66%{transform:translateY(2px) translateX(-2px)}100%{transform:translateY(0) translateX(0)}}
@keyframes auraDrift{0%{transform:translate(0,0) rotate(0deg)}33%{transform:translate(10px,-7px) rotate(4deg)}66%{transform:translate(-6px,9px) rotate(-3deg)}100%{transform:translate(0,0) rotate(0deg)}}
@keyframes concertLight{0%,100%{opacity:0.14;transform:scaleX(1)}50%{opacity:0.30;transform:scaleX(1.1)}}
@keyframes softFloat{0%,100%{transform:translateY(0) rotate(-0.5deg)}50%{transform:translateY(-9px) rotate(0.5deg)}}
@keyframes iridescent{0%{filter:hue-rotate(0deg) brightness(1)}50%{filter:hue-rotate(15deg) brightness(1.06)}100%{filter:hue-rotate(0deg) brightness(1)}}
@keyframes memoryFade{from{opacity:0;transform:translateY(10px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
/* ── Mobile-safe app shell height ───────────────────────────────────────── */
/* 100dvh = dynamic viewport height (excludes browser chrome on mobile)    */
/* -webkit-fill-available fills the visible viewport on older iOS Safari    */
#root{width:100%;height:100%;height:-webkit-fill-available;overflow:hidden}
/* Full-bleed on real devices/PWA — pinned to the visual viewport edges via
   position:fixed+inset:0 so it is immune to iOS standalone-PWA quirks where
   100vh/100dvh under-report the true visible height and leave a black gap
   above the home-indicator area. Only frame to a phone width + relative
   positioning when the browser viewport is wide enough to be a desktop
   preview (not an actual phone). */
.app-shell{position:fixed;left:0;right:0;top:0;bottom:var(--app-kb,0px);width:100%;box-sizing:border-box;padding-top:calc(env(safe-area-inset-top,0px) + 12px)}
/* iOS standalone PWA only: the layout viewport is SHORTER than the physical
   screen by the top safe-area inset, so position:fixed;bottom:0 stops short and
   the body background shows through under the nav. Measured on device:
   screen 956, innerHeight 894, safe-top 62 (956-894=62 exactly).
   Unit probes on that same device:
     100vh 956 / 100lvh 956  <- span the true screen
     100dvh 894 / 100svh 894 / -webkit-fill-available 894 / fixed inset:0 894
   So 100vh is the only thing that reaches the bottom. Scoped to standalone
   because in Safari 100vh is the LARGE viewport and would run the nav behind
   the browser toolbar; the default rule above already works there.
   Keyboard lift still applies via --app-kb. */
@media (max-width:500px){html[data-standalone="1"] .app-shell{height:calc(100vh - var(--app-kb,0px));bottom:auto}}
@media (min-width:501px){.app-shell{position:relative;inset:auto;width:430px;max-width:430px;height:100dvh;margin:0 auto}}
.tap{transition:transform .12s,opacity .12s}
.tap:active{transform:scale(.94);opacity:.8}
/* ── Collectible card hover lift ─────────────────────────────────────────── */
.card-lift{transition:transform .2s ease,box-shadow .2s ease}
.card-lift:active{transform:scale(0.97) translateY(1px)}
/* ── Bottom nav hidden while any bottom sheet is open ───────────────────── */
body.bs-sheet-open .bs-bottom-nav{display:none!important}
/* ── City Activity ticker fade (slow, calm — never a fast marquee) ──────── */
@keyframes tickerFade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
.ticker-fade{animation:tickerFade .5s ease}
@media (prefers-reduced-motion: reduce){.ticker-fade{animation:none!important}}
`;
}
