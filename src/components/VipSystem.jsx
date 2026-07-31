import { useState, useEffect } from "react";
import { C } from "../lib/theme.js";
import { ls } from "../lib/storage.js";

// Same env read App.jsx does — a build-time Vite constant, safe to read from either module.
const API_URL = import.meta.env.VITE_API_URL || "";

// GET /api/subscription/:userId | POST /api/subscription/start | POST /api/subscription/restore
export const VipBadge = ({ small }) => (
  <div style={{ display:"inline-flex", alignItems:"center", gap:3, padding: small?"2px 7px":"4px 10px", borderRadius:99, background:"linear-gradient(140deg,#f0cc88,#c8a830,#f0cc88)", backgroundSize:"200%", animation:"vipShimmer 3s linear infinite", fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:small?8:10, color:"#0a0a14", letterSpacing:"0.06em" }}>
    ✦ VIP
  </div>
);

export const FounderBadge = ({ inline, showAura }) => (
  <div style={{ position:"relative", display:"inline-flex", alignItems:"center" }}>
    {showAura && <div style={{ position:"absolute",inset:-12,borderRadius:"50%",background:"radial-gradient(circle,rgba(240,204,136,0.14),rgba(184,162,255,0.10),transparent 70%)",pointerEvents:"none",animation:"auraDrift 6s ease-in-out infinite" }} />}
    <div style={{
      display:"inline-flex", alignItems:"center", gap:5,
      padding: inline ? "3px 10px" : "7px 16px",
      borderRadius:99,
      background:"linear-gradient(140deg,#1a0840 0%,#2d0d60 40%,#1a0640 100%)",
      border:"1.5px solid rgba(240,204,136,0.55)",
      boxShadow:"0 0 18px rgba(240,204,136,0.18), 0 0 10px rgba(184,162,255,0.12), 0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(240,204,136,0.14)",
      position:"relative", overflow:"hidden",
    }}>
      <div style={{ position:"absolute",inset:0,background:"linear-gradient(90deg,transparent 0%,rgba(240,204,136,0.07) 50%,transparent 100%)",backgroundSize:"200% 100%",animation:"cardShimmer 3.5s linear infinite",pointerEvents:"none" }} />
      <div style={{ position:"absolute",top:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(240,204,136,0.5),rgba(184,162,255,0.4),rgba(240,168,204,0.3),transparent)",pointerEvents:"none" }} />
      <div style={{ fontSize:inline?8:10,color:"#f0cc88",animation:"sparkleFloat 2.2s ease-in-out infinite",flexShrink:0 }}>✦</div>
      <div style={{ display:"flex",flexDirection:"column",gap:0.5 }}>
        <span style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:800,fontSize:inline?8:10,color:"#e8d5ff",letterSpacing:"0.07em",lineHeight:1 }}>FOUNDING FAN</span>
        {!inline && <span style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:500,fontSize:7.5,color:"rgba(240,204,136,0.65)",letterSpacing:"0.12em",lineHeight:1 }}>BACKSTAGE FIRST ERA</span>}
      </div>
    </div>
  </div>
);

export function FounderPrestigeCard({ user }) {
  // founder_number comes from DB only — never generated on the client
  const founderNum = user?.founder_number || null;
  const joinedDate = user?.vip_since
    ? new Date(user.vip_since).toLocaleDateString('en-US', {month:'long', year:'numeric'})
    : "May 2026";
  const savedMsg = ls.get("backstage_founder_profile",{}).message;
  const [message, setMessage] = useState(savedMsg||"I was here before launch.");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message);
  const saveMessage = () => {
    ls.set("backstage_founder_profile", {...ls.get("backstage_founder_profile",{}), message:draft});
    setMessage(draft);
    setEditing(false);
  };
  return (
    <div style={{ position:"relative" }}>
      <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:8 }}>
        <FounderBadge inline />
        {founderNum
          ? <span style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:800,fontSize:12,color:C.gold }}>Founder #{founderNum}</span>
          : <span style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:800,fontSize:12,color:C.gold }}>Founding Fan</span>
        }
        <span style={{ fontSize:9,color:"rgba(240,204,136,0.5)",marginLeft:"auto" }}>Joined {joinedDate}</span>
      </div>
      {editing ? (
        <div style={{ marginBottom:6 }}>
          <textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={120} rows={3}
            style={{ width:"100%",background:"rgba(240,204,136,0.06)",border:"1.5px solid rgba(240,204,136,0.4)",borderRadius:10,color:"rgba(240,204,136,0.9)",fontFamily:"'Epilogue',sans-serif",fontSize:12,fontStyle:"italic",padding:"8px 10px",resize:"none",boxSizing:"border-box",outline:"none" }} />
          <div style={{ display:"flex",gap:8,marginTop:6 }}>
            <button onClick={saveMessage} style={{ flex:1,padding:"7px",borderRadius:9,background:"rgba(240,204,136,0.15)",border:"1px solid rgba(240,204,136,0.35)",color:C.gold,fontFamily:"'Epilogue',sans-serif",fontWeight:700,fontSize:11,cursor:"pointer" }}>Save Message</button>
            <button onClick={()=>{setDraft(message);setEditing(false);}} style={{ padding:"7px 12px",borderRadius:9,background:"transparent",border:"1px solid rgba(240,204,136,0.2)",color:"rgba(240,204,136,0.5)",fontFamily:"'Epilogue',sans-serif",fontSize:11,cursor:"pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontSize:12,color:"rgba(240,204,136,0.85)",fontStyle:"italic",lineHeight:1.55,marginBottom:6 }}>"{message}"</p>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <p style={{ fontSize:9.5,color:"rgba(240,204,136,0.5)" }}>Full VIP active · Early access to all new features</p>
            <button onClick={()=>setEditing(true)} style={{ background:"transparent",border:"1px solid rgba(240,204,136,0.28)",color:"rgba(240,204,136,0.6)",fontFamily:"'Epilogue',sans-serif",fontWeight:600,fontSize:9,padding:"3px 8px",borderRadius:8,cursor:"pointer",flexShrink:0,marginLeft:8,whiteSpace:"nowrap" }}>Edit Message</button>
          </div>
        </>
      )}
    </div>
  );
}

export function VipGate({ isVip, onUpgrade, children, feature="this feature" }) {
  if (isVip) return children;
  return (
    <div style={{ position:"relative", overflow:"hidden", borderRadius:18 }}>
      <div style={{ filter:"blur(4px)", pointerEvents:"none", userSelect:"none", opacity:0.45 }}>{children}</div>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"rgba(6,6,15,0.82)", borderRadius:18, padding:22, textAlign:"center", backdropFilter:"blur(3px)" }}>
        <div style={{ fontSize:28, marginBottom:8, animation:"float 3s ease infinite", display:"inline-block" }}>✦</div>
        <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:13.5, marginBottom:5, color:C.gold }}>This is a VIP feature ✨</p>
        <p style={{ fontSize:11.5, color:C.textMid, marginBottom:16, lineHeight:1.65 }}>Unlock your full fan experience</p>
        <button onClick={onUpgrade} className="tap" style={{ padding:"10px 24px", borderRadius:99, background:"linear-gradient(140deg,#f0cc88,#d4a820,#f0cc88)", backgroundSize:"200%", animation:"vipShimmer 3s linear infinite", border:"none", color:"#0a0a14", fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:12, cursor:"pointer", boxShadow:"0 4px 18px rgba(240,204,136,0.35)" }}>✨ Start My VIP Era</button>
      </div>
    </div>
  );
}

export function UpgradeModal({ onClose, onUpgrade }) {
  const [plan, setPlan] = useState("annual");

  useEffect(()=>{
    const handleEscape = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEscape);
    return ()=>window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const plans = [
    {
      id:"monthly",
      label:"Monthly",
      price:"$4.99",
      period:"/ month",
      tagline:"Just getting started 💜",
      sub:"Try VIP and feel the difference",
      badge:null,
      badgeColor:null,
      highlight:false,
    },
    {
      id:"annual",
      label:"Annual",
      price:"$39.99",
      period:"/ year",
      tagline:"Built for concert season",
      sub:"Stay ready all year",
      badge:"⭐ Most fans choose this",
      badgeColor:C.accent,
      highlight:true,
    },
    {
      id:"founder",
      label:"Founding Fan Pass",
      price:"$19.99",
      period:"first year only",
      tagline:"Here from the beginning",
      sub:"Unlock your permanent Founding Fan badge",
      badge:"✦ Limited first era",
      badgeColor:C.gold,
      highlight:false,
    },
  ];

  const FEATURES = [
    { text:"Unlimited concert memories — save every moment, every show",       emoji:"💜", vipOnly:true  },
    { text:"Full Stage Studio — all skins, fonts, effects, premium layouts",   emoji:"✦",  vipOnly:true  },
    { text:"Verified Trader Badge — priority matching + trusted status",       emoji:"🃏", vipOnly:true  },
    { text:"AI Concert Day Itinerary — your full fan day, planned for you",    emoji:"✨", vipOnly:true  },
    { text:"Advanced Fanverse — more fans nearby, filters, priority discovery",emoji:"🌐", vipOnly:true  },
    { text:"Holo, Glitter & Angel Aura Stage Effects (free = 3 basics)",       emoji:"💫", vipOnly:false },
    { text:"Premium Bias Shrine layouts — Trio, Orbit, Polaroid, Lightstick",  emoji:"🛕", vipOnly:false },
    { text:"Unlimited scrapbook memories — never lose a show memory again",    emoji:"📸", vipOnly:false },
  ];

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:800,background:"rgba(6,6,15,0.96)",display:"flex",alignItems:"flex-end",animation:"in .25s ease" }}>
      <button type="button" aria-label="Close VIP modal" onClick={e=>{ e.stopPropagation(); onClose(); }} style={{ position:"fixed",top:"max(16px, env(safe-area-inset-top))",right:"max(16px, env(safe-area-inset-right))",zIndex:802,width:44,height:44,borderRadius:"50%",background:C.mode==="light"?"rgba(255,255,255,0.96)":"rgba(18,16,34,0.96)",border:`1.5px solid ${C.borderHi}`,color:C.text,fontSize:26,lineHeight:1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:C.mode==="light"?"0 4px 18px rgba(80,60,140,0.22)":"0 4px 18px rgba(0,0,0,0.45)",backdropFilter:"blur(6px)" }}>×</button>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.surfaceMid, borderRadius:"26px 26px 0 0", width:"100%", animation:"slideUp .3s ease", maxHeight:"92dvh", display:"flex", flexDirection:"column", overflow:"hidden", border:`1.5px solid ${C.borderHi}`, boxShadow:"0 -12px 60px rgba(184,162,255,0.12)" }}>
      <div style={{ overflowY:"auto", flex:1, minHeight:0 }}>

        {/* Drag handle */}
        <div style={{ width:36,height:4,borderRadius:99,background:C.border,margin:"18px auto 0" }} />

        {/* Hero section */}
        <div style={{ textAlign:"center", padding:"22px 26px 20px" }}>
          {/* Glow orb behind icon */}
          <div style={{ position:"relative", display:"inline-block", marginBottom:14 }}>
            <div style={{ position:"absolute", inset:-20, borderRadius:"50%", background:"radial-gradient(circle,rgba(240,204,136,0.18),transparent 70%)" }} />
            <div style={{ fontSize:44, position:"relative", animation:"float 3.5s ease infinite", display:"inline-block" }}>✦</div>
          </div>

          {/* Title with gradient */}
          <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:900, fontSize:28, letterSpacing:"-0.03em", background:"linear-gradient(135deg,#f0cc88 20%,#b8a2ff 60%,#f0a8cc 100%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginBottom:6, lineHeight:1.1 }}>Backstage VIP</p>

          {/* Sub-heading */}
          <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:700, fontSize:14, color:C.silver, marginBottom:8 }}>The premium fan experience.<br/>Built for your concert era.</p>

          {/* Emotional anchor line */}
          <p style={{ fontSize:12.5, color:C.textMid, fontStyle:"italic", lineHeight:1.6 }}>Plan better. Connect deeper. Remember everything.</p>
        </div>

        {/* Divider */}
        <div style={{ height:1, background:`linear-gradient(90deg,transparent,${C.borderHi},transparent)`, margin:"0 26px 22px" }} />

        {/* Feature list */}
        <div style={{ padding:"0 26px 22px", display:"flex", flexDirection:"column", gap:11 }}>
          {FEATURES.map((f,i)=>(
            <div key={i} style={{ display:"flex", gap:12, alignItems:"center" }}>
              <div style={{ width:32, height:32, borderRadius:10, background:f.vipOnly?`linear-gradient(140deg,${C.gold}28,${C.accent}18)`:`${C.accent}14`, border:`1px solid ${f.vipOnly?C.gold:C.border}33`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0 }}>{f.emoji}</div>
              <p style={{ fontSize:12.5, color:C.text, lineHeight:1.45, flex:1 }}>{f.text}</p>
              {f.vipOnly&&<div style={{ background:`${C.gold}18`,border:`1px solid ${C.gold}33`,borderRadius:6,padding:"2px 7px",fontSize:8,color:C.gold,fontFamily:"'Epilogue',sans-serif",fontWeight:700,flexShrink:0 }}>VIP ONLY</div>}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height:1, background:`linear-gradient(90deg,transparent,${C.borderHi},transparent)`, margin:"0 26px 22px" }} />

        {/* Pricing cards */}
        <div style={{ padding:"0 26px", display:"flex", flexDirection:"column", gap:10, marginBottom:22 }}>
          {plans.map(p=>{
            const isActive = plan===p.id;
            const isFounder = p.id==="founder";
            const isAnnual = p.id==="annual";
            return (
              <div key={p.id} onClick={()=>setPlan(p.id)} className="tap" style={{ position:"relative", background: isActive ? (isFounder?`linear-gradient(140deg,${C.gold}22,${C.rose}12)`:isAnnual?`linear-gradient(140deg,${C.accent}18,${C.gold}08)`:`${C.gold}10`) : C.surface, border:`2px solid ${isActive?(isFounder?C.gold:isAnnual?C.accent:C.gold):C.border}`, borderRadius:16, padding:"14px 16px", cursor:"pointer", transition:"all .22s", overflow:"hidden", boxShadow:isActive&&isFounder?`0 0 16px ${C.gold}22`:"none" }}>

                {/* Recommended glow for annual */}
                {isAnnual&&isActive&&<div style={{ position:"absolute",inset:0,borderRadius:14,background:`radial-gradient(ellipse at top,${C.accent}10,transparent 70%)`,pointerEvents:"none" }} />}

                {/* Badge */}
                {p.badge&&(
                  <div style={{ marginBottom:8 }}>
                    {isFounder
                      ? <FounderBadge inline />
                      : <span style={{ fontSize:9.5, padding:"3px 9px", borderRadius:99, background:`${C.accent}22`, color:C.accent, fontFamily:"'Epilogue',sans-serif", fontWeight:800, letterSpacing:"0.04em" }}>{p.badge}</span>
                    }
                  </div>
                )}

                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  {/* Radio dot */}
                  <div style={{ width:22,height:22,borderRadius:"50%",border:`2px solid ${isActive?(isFounder?C.rose:isAnnual?C.accent:C.gold):C.border}`,background:isActive?(isFounder?C.rose:isAnnual?C.accent:C.gold):"transparent",transition:"all .22s",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
                    {isActive&&<div style={{ width:8,height:8,borderRadius:"50%",background:C.bg }} />}
                  </div>

                  {/* Label + tagline */}
                  <div style={{ flex:1 }}>
                    <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:14, marginBottom:2, color:isActive?(isFounder?C.gold:isAnnual?C.accent:C.gold):C.text }}>{p.label}</p>
                    <p style={{ fontSize:11.5, color:C.textMid, lineHeight:1.4 }}>{p.tagline}</p>
                    {isActive&&<p style={{ fontSize:10.5, color:C.textDim, marginTop:3, fontStyle:"italic" }}>{p.sub}</p>}
                  </div>

                  {/* Price */}
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    <p style={{ fontFamily:"'Epilogue',sans-serif", fontWeight:900, fontSize:18, color:isActive?(isFounder?C.rose:isAnnual?C.accent:C.gold):C.silver, lineHeight:1 }}>{p.price}</p>
                    <p style={{ fontSize:9.5, color:C.textDim, marginTop:3 }}>{p.period}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA — shows live checkout when backend is configured, coming-soon otherwise */}
        <div style={{ padding:"0 26px 10px" }}>
          {API_URL ? (
            <button onClick={()=>onUpgrade(plan)} className="tap" style={{ width:"100%", padding:"15px", borderRadius:15, background:"linear-gradient(140deg,#f0cc88,#d4a820,#c8a2ff,#f0a8cc)", backgroundSize:"300%", animation:"vipShimmer 4s linear infinite", border:"none", color:"#0a0a14", fontFamily:"'Epilogue',sans-serif", fontWeight:900, fontSize:15, cursor:"pointer", letterSpacing:"0.01em", boxShadow:"0 6px 28px rgba(240,204,136,0.3)", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              ✨ Start My VIP Era
            </button>
          ) : (
            <div style={{ textAlign:"center", padding:"4px 0 6px" }}>
              <p style={{ fontSize:12.5, color:C.silver, lineHeight:1.6, marginBottom:16, fontFamily:"'Instrument Sans',sans-serif", padding:"0 4px" }}>
                VIP checkout isn't available in this preview build. All plans and features shown here are fully explorable.
              </p>
              <button onClick={onClose} className="tap" style={{ width:"100%", padding:"14px", borderRadius:15, background:`linear-gradient(140deg,${C.gold}22,${C.accent}14)`, border:`1.5px solid ${C.gold}50`, color:C.gold, fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:14, cursor:"pointer", letterSpacing:"0.01em", boxShadow:`0 4px 18px ${C.gold}12` }}>
                Continue exploring
              </button>
            </div>
          )}
        </div>

        {/* Reassurance line */}
        {API_URL && <p style={{ textAlign:"center", fontSize:11, color:C.textDim, padding:"10px 26px 20px", fontStyle:"italic" }}>Cancel anytime. No pressure.</p>}
      </div>
        {/* Footer — a real flex child (not sticky-in-scroll), so it's always
            fully visible and cohesive with the modal panel, never a floating sliver. */}
        <div style={{ flexShrink:0, background:C.surfaceMid, borderTop:`1px solid rgba(255,255,255,0.06)`, display:"flex", justifyContent:"center", padding:"12px 26px calc(12px + env(safe-area-inset-bottom))" }}>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textDim,fontSize:13,cursor:"pointer",fontFamily:"'Instrument Sans',sans-serif",padding:"4px 12px" }}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}

export function VipCelebrationScreen({ onDone, vipSource }) {
  const isFounder = vipSource === 'founder';
  // Auto-advance after 9s so it doesn't block forever, but user can tap through early
  useEffect(() => {
    const t = setTimeout(onDone, 9000);
    return () => clearTimeout(t);
  }, []);

  const SPARKS = [
    { top:"12%", left:"18%", size:22, delay:"0s",   color:C.gold },
    { top:"8%",  left:"62%", size:16, delay:"0.2s",  color:C.accent },
    { top:"22%", left:"82%", size:20, delay:"0.4s",  color:C.pink },
    { top:"55%", left:"8%",  size:14, delay:"0.1s",  color:C.lavender },
    { top:"70%", left:"88%", size:18, delay:"0.3s",  color:C.gold },
    { top:"80%", left:"30%", size:12, delay:"0.5s",  color:C.rose },
    { top:"40%", left:"5%",  size:10, delay:"0.6s",  color:C.mint },
    { top:"30%", left:"92%", size:13, delay:"0.15s", color:C.accent },
    { top:"88%", left:"72%", size:16, delay:"0.35s", color:C.gold },
    { top:"65%", left:"50%", size:11, delay:"0.55s", color:C.pink },
  ];

  return (
    <div onClick={onDone} style={{ position:"fixed",inset:0,zIndex:950,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"in .3s ease",overflow:"hidden",cursor:"pointer" }}>
      {/* Radial gold glow */}
      <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 45%,rgba(240,204,136,0.22) 0%,transparent 68%)",pointerEvents:"none" }} />
      {/* Extra founder glow layer */}
      {isFounder && <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 80%,rgba(240,100,100,0.10) 0%,transparent 60%)",pointerEvents:"none" }} />}

      {/* Floating sparks */}
      {SPARKS.map((s,i)=>(
        <div key={i} style={{ position:"absolute",top:s.top,left:s.left,fontSize:s.size,color:s.color,animation:`sparkleFloat 2.2s ease-in-out infinite`,animationDelay:s.delay,opacity:0.85 }}>✦</div>
      ))}

      {/* Center content */}
      <div style={{ position:"relative",textAlign:"center",padding:"0 32px",animation:"up .5s ease" }}>
        {/* Gold ring pulse */}
        <div style={{ width:96,height:96,borderRadius:"50%",border:`2px solid ${C.gold}55`,margin:"0 auto 20px",animation:"vipShimmer 2s linear infinite",background:`radial-gradient(circle,${C.gold}14,transparent 70%)`,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ width:70,height:70,borderRadius:"50%",border:`1.5px solid ${C.gold}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30 }}>✦</div>
        </div>

        {isFounder ? (
          <>
            <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:13,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gold,marginBottom:6 }}>Founder Pass Activated</p>
            <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:30,letterSpacing:"-0.03em",background:"linear-gradient(135deg,#f0cc88 20%,#f0a8cc 70%,#b8a2ff 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:8,lineHeight:1.1 }}>
              You're a Founding<br/>Backstager. ✦
            </p>
            <p style={{ fontSize:13,color:C.silver,fontStyle:"italic",lineHeight:1.7,maxWidth:270,margin:"0 auto 6px" }}>
              You're part of the founding generation — the fans who were here first.
            </p>
            <p style={{ fontSize:11.5,color:C.textMid,lineHeight:1.6,maxWidth:260,margin:"0 auto" }}>
              Every feature. Every memory. Every concert — fully yours.
            </p>
          </>
        ) : (
          <>
            <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:13,letterSpacing:"0.14em",textTransform:"uppercase",color:C.gold,marginBottom:6 }}>Backstage VIP Activated</p>
            <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:32,letterSpacing:"-0.03em",background:"linear-gradient(135deg,#f0cc88 20%,#b8a2ff 60%,#f0a8cc 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:8,lineHeight:1.1 }}>
              You're VIP. ✦
            </p>
            <p style={{ fontSize:13,color:C.silver,fontStyle:"italic",lineHeight:1.7,maxWidth:270,margin:"0 auto" }}>
              Welcome to your full fan era. Every feature is now yours.
            </p>
          </>
        )}

        {/* Tap prompt */}
        <p style={{ fontSize:11,color:C.textDim,marginTop:28,letterSpacing:"0.04em" }}>Tap anywhere to continue →</p>
      </div>
    </div>
  );
}

export function VipTutorialModal({ onDone, onNavigate }) {
  const [step, setStep] = useState(0);

  const SLIDES = [
    {
      emoji: "✦",
      title: "Welcome to Your VIP Era",
      body: "You just unlocked the full Backstage experience. Here's a quick tour of everything that's now yours.",
      hint: "Swipe through to see what's new",
      accent: C.gold,
      where: null,
      navDest: null,
    },
    {
      emoji: "🔥",
      title: "Advanced Fan Heatmap",
      body: "See real-time crowd density, merch line waits, and GA fill rates for every section — before you even enter the venue.",
      hint: "Tap to open → Concert Day Mode",
      accent: "#ff6b6b",
      where: "Concert Day Mode",
      navDest: "concertday",
    },
    {
      emoji: "✨",
      title: "AI Concert Day Itinerary",
      body: "Tell us your show time and we'll build your entire day — arrival window, merch timing, setlist prep, and afterglow plans.",
      hint: "Tap to open → Concerts",
      accent: C.accent,
      where: "Concerts",
      navDest: "concerts",
    },
    {
      emoji: "✦",
      title: "Verified Trader Badge",
      body: "Your profile now shows a gold verified badge in the trading hub. Get priority match visibility and trusted status with other fans.",
      hint: "Tap to open → My Collection",
      accent: C.gold,
      where: "My Collection",
      navDest: "collect",
    },
    {
      emoji: "👑",
      title: "Priority Fan Buddy Matching",
      body: "You now appear first in Fan Buddy discovery. Find concert companions, meetup partners, and fandom friends faster.",
      hint: "Tap to open → Tools & Explore",
      accent: C.lavender,
      where: "Tools & Explore",
      navDest: "tools",
    },
    {
      emoji: "📸",
      title: "Unlimited Scrapbook",
      body: "No more 5-memory cap. Build full era-by-era scrapbooks with as many moments, photos, and notes as you want.",
      hint: "Tap to open → Scrapbook",
      accent: C.pink,
      where: "Scrapbook",
      navDest: "scrapbook",
    },
  ];

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div style={{ position:"fixed",inset:0,zIndex:900,background:"rgba(6,6,15,0.97)",display:"flex",alignItems:"center",justifyContent:"center",animation:"in .25s ease",padding:"24px" }}>
      {/* Glow orb */}
      <div style={{ position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:320,height:320,borderRadius:"50%",background:`radial-gradient(ellipse,${slide.accent}18,transparent 70%)`,pointerEvents:"none",transition:"background .5s" }} />

      <div style={{ width:"100%",maxWidth:400,position:"relative",animation:"up .35s ease" }}>
        {/* VIP badge header */}
        <div style={{ textAlign:"center",marginBottom:28 }}>
          <span style={{ fontSize:9,fontFamily:"'Epilogue',sans-serif",fontWeight:800,letterSpacing:"0.18em",color:C.gold,textTransform:"uppercase",padding:"3px 12px",borderRadius:99,background:`${C.gold}14`,border:`1px solid ${C.gold}33` }}>✦ Backstage VIP</span>
        </div>

        {/* Progress dots */}
        <div style={{ display:"flex",gap:6,justifyContent:"center",marginBottom:32 }}>
          {SLIDES.map((_,i)=>(
            <div key={i} style={{ width:i===step?22:6,height:6,borderRadius:99,background:i<=step?slide.accent:C.border,transition:"all .3s" }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ width:90,height:90,borderRadius:28,background:`${slide.accent}18`,border:`1.5px solid ${slide.accent}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,margin:"0 auto 24px",boxShadow:`0 0 48px ${slide.accent}28`,transition:"all .4s" }}>
          {slide.emoji}
        </div>

        {/* Title */}
        <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:26,letterSpacing:"-0.025em",marginBottom:12,lineHeight:1.2,textAlign:"center",color:C.text }}>
          {slide.title}
        </p>

        {/* Body */}
        <p style={{ color:C.textMid,fontSize:14,lineHeight:1.75,maxWidth:290,margin:"0 auto 18px",textAlign:"center" }}>
          {slide.body}
        </p>

        {/* Where to find it chip — tapping navigates directly there */}
        {slide.where && (
          <div
            onClick={()=>{ onDone(); if(slide.navDest && onNavigate) onNavigate(slide.navDest); }}
            className="tap"
            style={{ background:`${slide.accent}10`,border:`1px solid ${slide.accent}44`,borderRadius:10,padding:"9px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:32,cursor:"pointer",boxSizing:"border-box",width:"100%" }}
          >
            <p style={{ fontSize:10.5,color:slide.accent,fontFamily:"'Epilogue',sans-serif",fontWeight:700 }}>📍 {slide.hint}</p>
            <span style={{ fontSize:11,color:slide.accent,opacity:0.7 }}>↗</span>
          </div>
        )}
        {!slide.where && <div style={{ marginBottom:32 }} />}

        {/* Buttons */}
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          <button
            onClick={()=>{ if(isLast) onDone(); else setStep(s=>s+1); }}
            className="tap"
            style={{ width:"100%",padding:"15px",borderRadius:15,background:isLast?"linear-gradient(140deg,#f0cc88,#d4a820,#f0cc88)":"linear-gradient(140deg,#f0cc88,#d4a820,#c8a2ff,#f0a8cc)",backgroundSize:"300%",animation:"vipShimmer 4s linear infinite",border:"none",color:"#0a0a14",fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:15,cursor:"pointer",boxShadow:`0 6px 28px ${slide.accent}33`,transition:"box-shadow .3s" }}
          >
            {isLast ? "Let's Go! ✦" : "Next →"}
          </button>
          {!isLast && (
            <button onClick={onDone} style={{ background:"none",border:"none",color:C.textDim,fontSize:12,cursor:"pointer",padding:"8px",fontFamily:"'Instrument Sans',sans-serif" }}>
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
