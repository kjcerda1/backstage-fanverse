import React from "react";
import { C } from "../lib/theme.js";

// StatusChip — reusable trust label: COMING SOON | PREVIEW | LIVE | OFFICIAL
// A function, not a frozen object — its C.xxx values must re-read on every
// render or the chip keeps whatever theme was active at module load forever.
const getStatusChipStyles = () => ({
  "COMING SOON": { bg:`${C.berry}1a`, border:`1px solid ${C.berry}44`,  color:C.lavender },
  "PREVIEW":     { bg:`${C.accent}10`, border:`1px solid ${C.accent}30`, color:C.accent  },
  "LIVE":        { bg:`${C.mint}14`,   border:`1px solid ${C.mint}38`,   color:C.mint    },
  "OFFICIAL":    { bg:`${C.gold}14`,   border:`1px solid ${C.gold}38`,   color:C.gold    },
});
export const StatusChip = ({ label, style:s }) => {
  const STATUS_CHIP_STYLES = getStatusChipStyles();
  const st = STATUS_CHIP_STYLES[label] || STATUS_CHIP_STYLES["PREVIEW"];
  return (
    <div style={{ display:"inline-flex",alignItems:"center",padding:"2px 7px",borderRadius:99,fontFamily:"'Epilogue',sans-serif",fontWeight:700,fontSize:7.5,letterSpacing:"0.09em",whiteSpace:"nowrap",...st,...s }}>
      {label}
    </div>
  );
};

export const Pill = ({ children, color = C.accent, active, onClick, small, xs, style: s }) => (
  <span onClick={onClick} style={{
    display:"inline-flex", alignItems:"center",
    padding: xs ? "1px 6px" : small ? "3px 9px" : "5px 13px",
    borderRadius:99, fontSize: xs ? 8 : small ? 9.5 : 11,
    fontWeight:700, letterSpacing:"0.05em",
    fontFamily:"'Epilogue',sans-serif",
    background: active ? color : "transparent",
    border:`1.5px solid ${color}`,
    color: active ? C.bg : color,
    cursor: onClick ? "pointer" : "default",
    transition:"all .18s", whiteSpace:"nowrap",
    textTransform:"uppercase", flexShrink:0, ...s,
  }}>{children}</span>
);

// Reusable venue/city tag — user-entered only, no GPS, no live tracking.
// glass=true renders a frosted gold/fuchsia/purple gradient badge for premium surfaces (Feed, Passes).
export const LocationTag = ({ venue, city, color=C.accent, checkedIn, glass, style:s }) => {
  if(!venue && !city) return null;
  if(glass) {
    return (
      <div style={{ display:"inline-flex", alignItems:"center", gap:7, flexWrap:"wrap", padding:"6px 12px", borderRadius:99, background:"rgba(255,255,255,0.06)", backdropFilter:"blur(14px)", WebkitBackdropFilter:"blur(14px)", border:"1px solid rgba(255,255,255,0.16)", boxShadow:`0 0 20px ${C.berry}1f, inset 0 1px 0 rgba(255,255,255,0.1)`, ...s }}>
        <span style={{ fontSize:12 }}>📍</span>
        <span style={{ fontSize:11, fontFamily:"'Epilogue',sans-serif", fontWeight:800, background:`linear-gradient(110deg,${C.gold},${C.pink},${C.berry})`, WebkitBackgroundClip:"text", backgroundClip:"text", color:"transparent" }}>
          {checkedIn ? "Checked in at " : ""}{venue || city}
        </span>
        {venue && city && <span style={{ fontSize:9.5, color:"rgba(255,255,255,0.55)" }}>· Near {city}</span>}
      </div>
    );
  }
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", ...s }}>
      <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:99, background:`${color}14`, border:`1px solid ${color}38`, fontSize:10.5, fontFamily:"'Epilogue',sans-serif", fontWeight:700, color }}>
        📍 {checkedIn ? "Checked in at " : ""}{venue || city}
      </span>
      {venue && city && <span style={{ fontSize:10.5, color:C.textDim }}>Near {city}</span>}
    </div>
  );
};

export const Btn = ({ children, color=C.accent, onClick, ghost, style:s, disabled, small, icon }) => (
  <button onClick={disabled?undefined:onClick} className="tap" style={{
    width:"100%", padding:small?"10px 14px":"13px 16px", borderRadius:13,
    background:ghost?"transparent":disabled?`${color}25`:`linear-gradient(140deg,${color}ee,${color}88)`,
    border:ghost?`1.5px solid ${color}44`:"none",
    color:ghost?color:disabled?`${color}66`:C.bg,
    fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:small?11.5:13,
    letterSpacing:"0.025em",
    boxShadow:ghost||disabled?"none":`0 4px 18px ${color}30`,
    transition:"opacity .18s", opacity:disabled?.6:1,
    cursor:disabled?"not-allowed":"pointer",
    display:"flex", alignItems:"center", justifyContent:"center", gap:6, ...s,
  }}>{icon && <span>{icon}</span>}{children}</button>
);

export const Input = ({ style:s, label, ...p }) => (
  <div style={{ width:"100%" }}>
    {label && <p style={{ fontSize:10, color:C.textMid, marginBottom:5, fontFamily:"'Epilogue',sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</p>}
    <input style={{ width:"100%", padding:"11px 14px", borderRadius:11, background:C.surfaceHi, border:`1.5px solid ${C.border}`, color:C.text, fontSize:13, ...s }} {...p} />
  </div>
);

export const Textarea = ({ style:s, label, ...p }) => (
  <div style={{ width:"100%" }}>
    {label && <p style={{ fontSize:10, color:C.textMid, marginBottom:5, fontFamily:"'Epilogue',sans-serif", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.07em" }}>{label}</p>}
    <textarea style={{ width:"100%", padding:"11px 14px", borderRadius:11, background:C.surfaceHi, border:`1.5px solid ${C.border}`, color:C.text, fontSize:13, resize:"none", ...s }} {...p} />
  </div>
);

// Stardust Pulse — ambient twinkling starfield. Mount as the first child of a
// `position:relative` page root; negative z-index keeps it behind normal-flow
// content without requiring every sibling to opt in with its own z-index.
export const AmbientStarfield = () => <div className="stardust-pulse" aria-hidden="true" />;

export const Card = ({ children, style:s, onClick, glow, color, accent }) => (
  <div onClick={onClick} className={onClick?"tap":""} style={{
    background:C.surface, border:`1.5px solid ${color?`${color}28`:C.border}`,
    borderRadius:18, padding:16,
    boxShadow:glow&&color?`0 0 24px ${color}1a`:"none",
    cursor:onClick?"pointer":"default", transition:"border-color .2s", ...s,
  }}>{children}</div>
);

export const Screen = React.forwardRef(({ children, pad=true, style:s, onScroll, ...rest }, ref) => (
  <div ref={ref} onScroll={onScroll} style={{ flex:1, overflowY:"auto", overflowX:"hidden", padding:pad?"0 20px calc(120px + env(safe-area-inset-bottom))":0, position:"relative", ...s }} {...rest}>
    {/* Subtle ambient glow layer on every scroll pane */}
    <div style={{ position:"sticky",top:0,left:0,right:0,height:0,overflow:"visible",pointerEvents:"none",zIndex:0 }}>
      <div style={{ position:"absolute",top:-30,right:-20,width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle,${C.accent}05,transparent 70%)`,pointerEvents:"none" }} />
    </div>
    {children}
  </div>
));

// ─── GLOBAL CARD STYLE HELPERS ────────────────────────────────────────────────
export const cosmicCard = (color=C.accent) => ({
  background:`linear-gradient(150deg,${color}14,${color}06,${C.surface})`,
  border:`1.5px solid ${color}30`,
  borderRadius:20,
  boxShadow:`0 8px 28px ${color}12, 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 ${color}10`,
  position:"relative", overflow:"hidden",
});

export const vipCard = () => ({
  background:`linear-gradient(140deg,#221200,#140c00,${C.cosmic})`,
  border:`1.5px solid ${C.gold}44`,
  borderRadius:18,
  boxShadow:`0 8px 28px ${C.gold}14`,
  position:"relative", overflow:"hidden",
});

export const emptyStateStyle = {
  textAlign:"center",
  padding:"40px 20px",
  background:`linear-gradient(160deg,${C.surface},${C.cosmic})`,
  borderRadius:20,
  border:`1px solid ${C.border}`,
};

export const SectionHeader = ({ title, action, onAction }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
    <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:700, fontSize:10.5, color:C.textMid, textTransform:"uppercase", letterSpacing:"0.12em" }}>{title}</p>
    {action && <span onClick={onAction} style={{ fontSize:11, color:C.accentDim, cursor:"pointer", fontWeight:600 }}>{action}</span>}
  </div>
);

export const ProgressBar = ({ value, color=C.accent, style:s }) => (
  <div style={{ background:C.surfaceHi, borderRadius:99, height:5, overflow:"hidden", boxShadow:"inset 0 1px 2px rgba(0,0,0,0.3)", ...s }}>
    <div style={{ height:"100%", width:`${Math.min(100,Math.max(0,value))}%`, background:`linear-gradient(90deg,${color},${color}66)`, borderRadius:99, transition:"width .5s ease", boxShadow:`0 0 10px ${color}99, 0 0 2px ${color}cc` }} />
  </div>
);

// Circular completion ring — conic-gradient progress with a dark inner well for a centered label.
// Used as the dominant metric moment on collector status panels (e.g. My World).
export const RingProgress = ({ value, size=78, thickness=8, color=C.accent, color2=C.pink, children }) => {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <div style={{ position:"absolute", inset:0, borderRadius:"50%", background:`conic-gradient(${color2} 0%,${color} ${pct}%,rgba(255,255,255,0.06) ${pct}%)`, boxShadow:`0 0 22px ${color}38` }} />
      <div style={{ position:"absolute", inset:thickness, borderRadius:"50%", background:`linear-gradient(160deg,${C.cosmic},${C.bg})`, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column" }}>
        {children}
      </div>
    </div>
  );
};

export const Toggle = ({ on, onChange, color=C.accent }) => (
  <div onClick={()=>onChange(!on)} className="tap" style={{ width:46, height:26, borderRadius:99, background:on?color:C.surfaceMid, border:`1.5px solid ${on?color:C.border}`, position:"relative", cursor:"pointer", transition:"all .22s", flexShrink:0 }}>
    <div style={{ position:"absolute", top:3, left:on?21:3, width:18, height:18, borderRadius:"50%", background:on?C.bg:C.textMid, transition:"left .22s", boxShadow:"0 1px 4px rgba(0,0,0,.4)" }} />
  </div>
);

// Backstage "B" brand mark — used in place of a generic icon for the My World bottom-nav tab.
// Visual/brand-only: rounded-square B logo, muted lavender outline when inactive,
// pink→purple neon gradient + glow + small glowing dot when active.
export const BackstageBIcon = ({ active }) => (
  <div style={{
    width: 22, height: 22, borderRadius: 7,
    display: "flex", alignItems: "center", justifyContent: "center",
    position: "relative",
    background: active ? `linear-gradient(135deg,${C.pink},${C.accent})` : "transparent",
    border: `1.5px solid ${active ? "transparent" : C.lavender + "55"}`,
    boxShadow: active ? `0 0 12px ${C.pink}66, 0 2px 8px ${C.accent}44` : "none",
    transition: "all .2s",
  }}>
    <span style={{
      fontFamily: "'Epilogue',sans-serif", fontWeight: 900, fontSize: 12,
      color: active ? "#0a0612" : C.lavender,
      lineHeight: 1,
    }}>B</span>
    {active && (
      <div style={{
        position: "absolute", bottom: -2, right: -2, width: 5, height: 5, borderRadius: "50%",
        background: C.pink, boxShadow: `0 0 6px ${C.pink}cc`,
      }} />
    )}
  </div>
);

// Backstage "B" nav icon — the official brand glyph (open rounded B, purple→pink
// gradient stroke), cropped straight from the same source as the app's full
// logo lockup (public/logo-orb.png) so the nav mark actually matches the brand,
// not a generic circle/badge. Transparent background — sits directly on the
// nav bar in both Pearl and Concert/Dark Mode without its own frame.
// Active: bright/glowing via filters. Inactive: dimmed via brightness/opacity.
// Native aspect ratio of public/backstage-b-glyph.png (362x454, cropped tight
// to the glyph's own bounding box including its full tail swoop — the prior
// crop clipped the tail by a few px because its source window ended right at
// the edge of the tail's true extent). Used to compute explicit pixel
// dimensions below instead of relying on % / auto sizing inside a
// placeItems:"center" grid span — that combination disables grid "stretch",
// so a percentage-sized child has no definite size to resolve against and
// silently falls back to the image's tiny intrinsic size. Explicit px
// dimensions sidestep that entirely.
// Illuminated glowing-B nav mark (public/backstage-b-illuminated-nav.png),
// luminance-keyed to transparent from the cosmic illuminated logo, then recolored
// to the vivid purple->pink brand gradient so it reads on the light nav bar.
// Tight-cropped intrinsic size 131x182.
const B_GLYPH_ASPECT = 131 / 182;

export function BackstageBNavIcon({ active }) {
  // Active grows a bit (24 -> 30) for presence; the nav's icon-slot wrapper
  // (App.jsx) reserves the extra height only for this tab when active, so
  // the "My World" label shifts down to make room instead of the icon
  // overflowing on top of it (confirmed via measured bounding rects — a
  // fixed-slot version at 42/34 and 30/28 both visually collided with the
  // label; this only works because the wrapper now grows in step with it).
  const h = active ? 30 : 24;
  const w = Math.round(h * B_GLYPH_ASPECT);
  return (
    <span style={{
      width: w,
      height: h,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      filter: active
        ? "drop-shadow(0 0 6px rgba(247,37,133,0.44)) drop-shadow(0 0 10px rgba(155,93,229,0.30))"
        : "drop-shadow(0 0 3px rgba(155,93,229,0.16))",
      transition: "all 160ms ease",
    }}>
      <img
        src="/backstage-b-illuminated-nav.png"
        alt=""
        aria-hidden="true"
        width={w}
        height={h}
        style={{
          display: "block",
          // Inactive dimming softened slightly so the real logo still reads as
          // a glowing badge at rest, not a flat dark blob.
          filter: active
            ? "saturate(1.08) brightness(1.08)"
            : "brightness(0.8) saturate(0.85) opacity(0.9)",
        }}
      />
    </span>
  );
}

export const Empty = ({ emoji, title, sub, action, onAction }) => (
  <div style={{ textAlign:"center", padding:"52px 24px", animation:"up .4s ease" }}>
    <div style={{ fontSize:44, marginBottom:16, animation:"float 3s ease infinite", display:"inline-block" }}>{emoji}</div>
    <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:17, marginBottom:8 }}>{title}</p>
    <p style={{ fontSize:12.5, color:C.textMid, lineHeight:1.65, marginBottom:action?22:0 }}>{sub}</p>
    {action && <Btn onClick={onAction} style={{ maxWidth:180, margin:"0 auto" }} small>{action}</Btn>}
  </div>
);

export const NotifBanner = ({ notif, onDismiss }) => (
  <div style={{ position:"absolute", top:60, left:16, right:16, zIndex:900, animation:"dn .3s ease" }}>
    <div style={{ background:"rgba(20,20,40,0.97)", border:`1.5px solid ${notif.color||C.borderHi}`, borderRadius:16, padding:"12px 14px", backdropFilter:"blur(20px)", display:"flex", gap:12, alignItems:"flex-start", boxShadow:`0 8px 32px rgba(0,0,0,.5), 0 0 0 1px ${notif.color||C.accent}18` }}>
      <div style={{ fontSize:22, flexShrink:0 }}>{notif.icon||"🔔"}</div>
      <div style={{ flex:1 }}>
        <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:700, fontSize:13, marginBottom:3, color:C.text }}>{notif.title}</p>
        <p style={{ fontSize:11.5, color:C.silver, lineHeight:1.5 }}>{notif.body}</p>
      </div>
      <button onClick={onDismiss} style={{ background:"none", border:"none", color:C.textMid, fontSize:16, cursor:"pointer", paddingLeft:4 }}>✕</button>
    </div>
  </div>
);

export const WeatherChip = ({ weather }) => (
  weather ? (
    <div style={{ display:"flex", gap:6, alignItems:"center", background:C.surfaceHi, border:`1px solid ${C.border}`, borderRadius:99, padding:"5px 12px" }}>
      <span style={{ fontSize:14 }}>{weather.condition?.includes("sun")||weather.condition?.includes("clear")?"☀️":weather.condition?.includes("rain")?"🌧️":weather.condition?.includes("cloud")?"⛅":"🌤️"}</span>
      <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:700, fontSize:12 }}>{weather.temp_f}°F</p>
      <p style={{ fontSize:10, color:C.textMid }}>{weather.condition}</p>
    </div>
  ) : null
);
