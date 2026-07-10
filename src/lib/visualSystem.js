import { C } from "./theme.js";

// ─── VISUAL SYSTEM (VS) ───────────────────────────────────────────────────────
export const VS = {
  heroSurface: (color1="#1c0545", color2="#2e0960", color3="#07050f") =>
    `linear-gradient(145deg,${color1} 0%,${color2} 30%,${color3} 100%)`,
  elevatedCard: (color) => ({
    background: `linear-gradient(150deg,${color}12,${color}04,${C.surface})`,
    border: `1.5px solid ${color}2e`,
    borderRadius: 22,
    boxShadow: `0 8px 28px ${color}10, 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 ${color}14`,
    position: "relative", overflow: "hidden",
  }),
  glowCard: (color) => ({
    background: `linear-gradient(150deg,${color}16,${color}06,${C.surface})`,
    border: `1.5px solid ${color}40`,
    borderRadius: 22,
    boxShadow: `0 10px 36px ${color}16, 0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px ${color}12`,
    position: "relative", overflow: "hidden",
  }),
  collectibleCard: (color) => ({
    background: `linear-gradient(135deg,${color}40 0%,${color}20 50%,${C.cosmic} 100%)`,
    border: `1.5px solid ${color}60`,
    borderRadius: 16,
    boxShadow: `0 12px 40px ${color}28, 0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)`,
    position: "relative", overflow: "hidden",
  }),
  // NOTE: these two must stay functions (not plain objects) — a plain object's
  // `color: C.textMid` is resolved once at module load and frozen forever, so it
  // goes stale the moment the theme toggles. A function re-reads C on every call.
  softSectionHeader: () => ({
    fontSize: 9.5, color: C.textMid,
    fontFamily: "'Epilogue',sans-serif", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.14em",
    marginBottom: 12,
  }),
  activePill: (color) => ({
    display: "inline-flex", alignItems: "center",
    padding: "5px 12px", borderRadius: 99,
    background: `${color}18`, border: `1px solid ${color}38`,
    color: color, fontSize: 10,
    fontFamily: "'Epilogue',sans-serif", fontWeight: 700,
    letterSpacing: "0.04em",
  }),
  mutedPill: () => ({
    display: "inline-flex", alignItems: "center",
    padding: "5px 12px", borderRadius: 99,
    background: "transparent", border: `1px solid ${C.border}`,
    color: C.textMid, fontSize: 10,
    fontFamily: "'Epilogue',sans-serif", fontWeight: 600,
  }),
  pageGlowBackground: (color) => ({
    background: C.bg,
    position: "relative",
  }),
  innerGlow: (color) => ({
    position: "absolute", top: -20, right: -20,
    width: 100, height: 100, borderRadius: "50%",
    background: `radial-gradient(circle,${color}22,transparent 65%)`,
    pointerEvents: "none",
  }),
  shimmerLine: (color) => ({
    position: "absolute", top: 0, left: 0, right: 0, height: 1,
    background: `linear-gradient(90deg,transparent,${color}44,transparent)`,
  }),

  // ── Phase 1 additions: premium glass/glow primitives ──────────────────────
  // Deep cosmic page backdrop w/ soft nebula glow — for screen-level wrappers.
  cosmicPageBg: (color=C.accent) => ({
    background: `radial-gradient(ellipse at 50% -10%,${color}14,transparent 55%),${C.bg}`,
    position: "relative",
  }),
  // Stronger glassmorphism card: blur + inset highlight + top shimmer + corner glow.
  // Use for structural/dashboard cards that currently sit flat (Collection Overview, hero banners).
  neonGlassCard: (color=C.accent) => ({
    background: `linear-gradient(155deg,${color}1c,${C.surfaceHi}f0 45%,${C.surfaceMid}f0)`,
    border: `1.5px solid ${color}3c`,
    borderRadius: 24,
    boxShadow: `0 14px 40px ${color}22, 0 4px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 24px ${color}0c`,
    backdropFilter: "blur(14px)",
    position: "relative", overflow: "hidden",
  }),
  // Big "hero moment" card — for headline dashboard/CTA banners (Collection Overview,
  // Continue Building, My Stage profile hero). Heavier glow + deeper gradient than neonGlassCard.
  premiumHeroCard: (color=C.accent, color2=C.pink) => ({
    background: `linear-gradient(150deg,${color}2a 0%,${C.plum}cc 45%,${C.cosmic}f5 100%)`,
    border: `1.5px solid ${color}48`,
    borderRadius: 26,
    boxShadow: `0 18px 48px ${color}28, 0 6px 18px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 32px ${color2}10`,
    backdropFilter: "blur(10px)",
    position: "relative", overflow: "hidden",
  }),
  // Gradient glow CTA button — pairs with <button className="tap">.
  glowButton: (color=C.accent, color2=C.pink) => ({
    background: `linear-gradient(135deg,${color},${color2})`,
    border: `1px solid rgba(255,255,255,0.22)`,
    borderRadius: 14,
    color: "#0a0612",
    fontFamily: "'Epilogue',sans-serif", fontWeight: 800,
    boxShadow: `0 8px 24px ${color}44, 0 3px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.35)`,
    cursor: "pointer",
  }),
  // Pill badge with a glow halo — for feature/status callouts that need more weight than mutedPill.
  featurePill: (color) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 12px", borderRadius: 99,
    background: `linear-gradient(135deg,${color}28,${color}10)`,
    border: `1px solid ${color}50`,
    color: color, fontSize: 10,
    fontFamily: "'Epilogue',sans-serif", fontWeight: 700,
    letterSpacing: "0.04em",
    boxShadow: `0 0 16px ${color}28`,
  }),
  // Compact glass stat tile (matches HomeLiveStats pattern) — reusable for any stat row/grid.
  statGlassTile: (color) => ({
    position: "relative", overflow: "hidden",
    background: "linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))",
    border: `1px solid ${color}2c`,
    borderRadius: 20,
    boxShadow: `0 4px 16px rgba(0,0,0,0.32), 0 0 0 1px ${color}10`,
    backdropFilter: "blur(12px)",
  }),
  // Decorative orbit ring/glow — absolutely-positioned accent for hero/collectible cards.
  orbitAccent: (color, size=120) => ({
    position: "absolute", top: -size*0.3, right: -size*0.3,
    width: size, height: size, borderRadius: "50%",
    border: `1px solid ${color}30`,
    background: `radial-gradient(circle,${color}1c,transparent 70%)`,
    pointerEvents: "none",
  }),
  // Section label with a small glowing accent dot — richer variant of softSectionHeader.
  sectionEyebrow: (color=C.textMid) => ({
    fontSize: 9.5, color: color,
    fontFamily: "'Epilogue',sans-serif", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.14em",
    marginBottom: 12,
  }),
  // Glassy active-tab treatment for the bottom nav (glow underline + soft elevated backdrop).
  bottomNavGlow: (color) => ({
    boxShadow: `0 0 0 1px ${color}22, 0 -2px 18px ${color}26`,
    background: `linear-gradient(180deg,${color}10,transparent 70%)`,
  }),
};

// ─── UNIFIED PILL / BADGE / GLASS-CARD SYSTEM ─────────────────────────────────
// One shared design language for every tab control, chip, and status badge in
// the app — Fanverse, Explore, My World, Tools, Passes, Collection Tracker —
// so switching pages doesn't feel like switching color systems. All tones map
// onto the existing theme tokens (already muted/premium-tuned per mode) rather
// than a second parallel palette, so they stay correct through every toggle.
export const BS_TONE = {
  primary: () => C.accent,   // lavender/violet — default
  premium: () => C.gold,     // champagne — reserve for "special/featured" only
  soft:    () => C.lavender, // soft lavender — quiet secondary accent
  danger:  () => C.rose,     // muted rose — real warnings/destructive only
  info:    () => C.sky,      // muted lavender-blue — informational only
};
export function bsToneColor(tone) { return (BS_TONE[tone] || BS_TONE.primary)(); }

// Tab / segmented-control / filter pill. One active look, one inactive look,
// used identically everywhere instead of every page inventing its own.
export function getPillStyle({ active=false, tone="primary" } = {}) {
  if (active) {
    return {
      background:`linear-gradient(135deg,${C.accent},${C.pink})`,
      color: C.mode==="light" ? "#ffffff" : "#1a1228",
      border:"1px solid rgba(255,255,255,0.28)",
      boxShadow:`0 0 12px ${C.accent}33`,
      borderRadius:99, fontFamily:"'Epilogue',sans-serif", fontWeight:700,
      cursor:"pointer", transition:"all .18s ease", whiteSpace:"nowrap",
    };
  }
  const c = bsToneColor(tone);
  return {
    background: C.chipInactiveBg,
    color: tone==="primary" ? C.textMid : c,
    border:`1px solid ${C.glassBorder}`,
    borderRadius:99, fontFamily:"'Epilogue',sans-serif", fontWeight:700,
    cursor:"pointer", transition:"all .18s ease", whiteSpace:"nowrap",
  };
}

// Small status/category badge (LIVE POV, Preview, Upcoming Show, Fan Creator…).
// tone picks the hue; everything else — glass density, border weight — stays
// identical across tones so a page never looks like five different widgets.
export function getBadgeStyle({ tone="primary" } = {}) {
  const c = bsToneColor(tone);
  return {
    display:"inline-flex", alignItems:"center", gap:4,
    padding:"3px 9px", borderRadius:99,
    background: tone==="premium" ? `linear-gradient(135deg,${c}28,${C.accent}14)` : `${c}18`,
    border:`1px solid ${c}40`,
    color:c, fontSize:9, fontFamily:"'Epilogue',sans-serif", fontWeight:700,
    letterSpacing:"0.03em", whiteSpace:"nowrap",
  };
}

// Shared glass-card surface — replaces the many one-off translucent panels.
export function getGlassCardStyle({ emphasis="normal" } = {}) {
  return emphasis==="hi"
    ? { background:C.glassBgHi, border:`1px solid ${C.glassBorder}`, borderRadius:18, backdropFilter:"blur(14px)" }
    : { background:C.glassBg,   border:`1px solid ${C.glassBorder}`, borderRadius:16, backdropFilter:"blur(10px)" };
}
