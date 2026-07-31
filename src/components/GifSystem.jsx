import { useState, useEffect } from "react";
import { C } from "../lib/theme.js";
import { ls } from "../lib/storage.js";
import { api } from "../lib/apiClient.js";

// Gradient fallback used whenever a GIF result has no previewUrl (mock provider, or load failure)
const GIF_MOOD_GRADIENTS = {
  excited:   [C.accent, C.pink],
  crying:    [C.lavender, C.berry],
  cheering:  [C.mint, C.accent],
  dancing:   [C.pink, C.accentDim],
  heart:     [C.pink, C.lavender],
  lightstick:[C.mint, C.lavender],
};
const GIF_MOOD_EMOJI = { excited:"✨", crying:"😭", cheering:"📣", dancing:"💃", heart:"💖", lightstick:"🔦" };

export function GifPreviewBubble({ gif, size = 120, rounded = 14, onClick }) {
  if (!gif) return null;
  const grad = gif.gradient || GIF_MOOD_GRADIENTS[gif.mood] || [C.accent, C.lavender];
  return (
    <div
      onClick={onClick}
      className={onClick ? "tap" : ""}
      style={{
        width:size, height:size, borderRadius:rounded, overflow:"hidden", position:"relative",
        background: gif.previewUrl ? C.surfaceHi : `linear-gradient(135deg,${grad[0]},${grad[1]})`,
        border:`1px solid ${C.borderHi}`, cursor:onClick?"pointer":"default", flexShrink:0,
      }}>
      {gif.previewUrl ? (
        <img src={gif.previewUrl} alt={gif.title || "GIF reaction"} style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }} />
      ) : (
        <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4 }}>
          <span style={{ fontSize:size*0.28 }}>{GIF_MOOD_EMOJI[gif.mood] || "✦"}</span>
          <span style={{ fontSize:9.5,color:"rgba(255,255,255,0.85)",fontFamily:"'Epilogue',sans-serif",fontWeight:700,textTransform:"capitalize" }}>{gif.mood || "vibe"}</span>
        </div>
      )}
      <div style={{ position:"absolute",bottom:5,left:5,background:"rgba(6,6,15,0.55)",borderRadius:6,padding:"1.5px 6px",fontSize:8,fontFamily:"'Epilogue',sans-serif",fontWeight:800,letterSpacing:0.5,color:C.text }}>GIF</div>
    </div>
  );
}

// GifImg — renders a GIF or sticker preview with onError fallback
export function GifImg({ gif, gifOnly, hasText }) {
  const [errored, setErrored] = useState(false);
  if (!gif) return null;
  const isSticker = gif.mediaType === "sticker";
  const radius = gifOnly ? 16 : (hasText ? "8px 8px 0 0" : 10);
  if (!gif.previewUrl || errored) return <GifPreviewBubble gif={gif} size="100%" rounded={gifOnly ? 16 : 10} />;
  return (
    <img
      src={gif.previewUrl}
      alt={gif.title || (isSticker ? "sticker" : "GIF reaction")}
      onError={() => setErrored(true)}
      style={{ width:"100%", maxHeight: gifOnly ? 180 : 200, objectFit: isSticker ? "contain" : "cover", borderRadius:radius, display:"block" }}
    />
  );
}

// Small chip/button that opens the GIF picker — drop into any composer or action row
export function ReactionButton({ onClick, active, label = "GIF", compact }) {
  return (
    <button
      onClick={onClick}
      title="Send a reaction"
      className="tap"
      style={{
        height:compact?32:40, padding:compact?"0 12px":"0 14px", borderRadius:compact?10:12,
        background:active?`linear-gradient(135deg,${C.accent}33,${C.berry}22)`:C.surfaceHi,
        border:`1.5px solid ${active?C.accent:C.borderHi}`, color:active?C.accent:C.silver,
        display:"flex",alignItems:"center",justifyContent:"center",gap:5,cursor:"pointer",flexShrink:0,
        fontSize:compact?11:12.5, fontFamily:"'Epilogue',sans-serif",fontWeight:800,
        boxShadow:active?`0 0 14px ${C.accent}28`:"none", transition:"all .2s",
      }}>
      <span style={{ fontSize:compact?12:14 }}>🎬</span>{label}
    </button>
  );
}

// ─── GifPicker (moved from App.jsx 2026-07-31) ────────────────────────────────
const GIF_LS_RECENT_SEARCHES  = "backstage_gif_recent_searches";
const GIF_LS_RECENT_REACTIONS = "backstage_gif_recent_reactions";
const GIF_LS_MEDIA_TYPE       = "backstage_reaction_media_type";

// Mood chips — queries for GIF mode, stickerQueries for Stickers mode (tried in order)
const GIF_MOOD_CHIPS = [
  { label:"Excited",  emoji:"✨",
    queries:       ["excited reaction","happy reaction","excited gif","celebration reaction"],
    stickerQueries:["excited sticker","happy sticker","yay sticker","celebration sticker"] },
  { label:"Crying",   emoji:"😭",
    queries:       ["crying reaction","crying gif","sad crying reaction","happy tears","emotional reaction"],
    stickerQueries:["crying sticker","sad sticker","tears sticker","emotional sticker","happy tears sticker"] },
  { label:"Cheering", emoji:"📣",
    queries:       ["cheering reaction","applause reaction","clapping reaction","crowd cheering"],
    stickerQueries:["cheering sticker","applause sticker","clapping sticker","yay sticker"] },
  { label:"Dancing",  emoji:"💃",
    queries:       ["dancing reaction","happy dance","dancing gif","dance reaction"],
    stickerQueries:["dancing sticker","dance sticker","happy dance sticker","party sticker"] },
  { label:"Heart",    emoji:"💖",
    queries:       ["heart reaction","love reaction","hearts gif","sending love reaction","cute heart"],
    stickerQueries:["heart sticker","love sticker","hearts sticker","sending love sticker","cute heart sticker"] },
  { label:"Concert",  emoji:"🎤",
    queries:       ["concert crowd","concert reaction","fans cheering","music concert"],
    stickerQueries:["music sticker","concert sticker","microphone sticker","crowd sticker","lightstick sticker"] },
  { label:"Cute",     emoji:"🐱",
    queries:       ["cute reaction","cute gif","kawaii reaction","adorable reaction"],
    stickerQueries:["cute sticker","kawaii sticker","adorable sticker","cat sticker"] },
  { label:"Shocked",  emoji:"😱",
    queries:       ["shocked reaction","surprised reaction","omg reaction","gasp reaction"],
    stickerQueries:["shocked sticker","surprised sticker","omg sticker","gasp sticker"] },
];
const GIF_DEFAULT_Q = "kpop reaction";

// GifPicker — mobile bottom sheet: GIFs + Stickers toggle, mood chips, search.
// defaultMediaType prop: "gif" | "sticker" — overrides localStorage for this open only.
export function GifPicker({ onSelect, onClose, title = "Send the vibe", subtitle = "Find the perfect concert mood", defaultMediaType }) {
  const [mediaType, setMediaType] = useState(()=> defaultMediaType || ls.get(GIF_LS_MEDIA_TYPE, "gif"));
  const [query, setQuery]         = useState("");
  const [activeChip, setActiveChip] = useState(null);
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [recentSearches, setRecentSearches] = useState(()=>ls.get(GIF_LS_RECENT_SEARCHES, []));
  const cols = typeof window !== "undefined" && window.innerWidth < 380 ? 2 : 3;
  const isSticker = mediaType === "sticker";

  const typeParam = isSticker ? "&type=sticker" : "&type=gif";

  const loadDefault = (mt) => {
    setLoading(true);
    api.get(`/api/gifs/search?q=${encodeURIComponent(GIF_DEFAULT_Q)}&limit=24&type=${mt}`).then(d=>{
      setResults(Array.isArray(d?.results) ? d.results : []);
      setLoading(false);
    }).catch(()=>{ setResults([]); setLoading(false); });
  };

  // On open: fandom-curated default
  useEffect(()=>{ loadDefault(mediaType); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search when user types
  useEffect(()=>{
    const q = query.trim();
    if(!q) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(()=>{
      api.get(`/api/gifs/search?q=${encodeURIComponent(q)}&limit=24${typeParam}`).then(d=>{
        if(!alive) return;
        setResults(Array.isArray(d?.results) ? d.results : []);
        setLoading(false);
      }).catch(()=>{ if(alive){ setResults([]); setLoading(false); } });
    }, 300);
    return ()=>{ alive = false; clearTimeout(t); };
  },[query, mediaType]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (mt) => {
    if (mt === mediaType) return;
    ls.set(GIF_LS_MEDIA_TYPE, mt);
    setMediaType(mt);
    setQuery("");
    setActiveChip(null);
    loadDefault(mt);
  };

  const searchChip = async (chip, mt) => {
    const mode = mt || mediaType;
    setActiveChip(chip.label);
    setQuery("");
    setLoading(true);
    const list = mode === "sticker" ? (chip.stickerQueries || chip.queries) : chip.queries;
    for (const q of list) {
      try {
        const d = await api.get(`/api/gifs/search?q=${encodeURIComponent(q)}&limit=24&type=${mode}`);
        const res = Array.isArray(d?.results) ? d.results : [];
        if (res.length > 0) { setResults(res); setLoading(false); return; }
      } catch {}
    }
    setResults([]);
    setLoading(false);
  };

  const commitSearch = (q) => {
    const trimmed = q.trim();
    if(!trimmed) return;
    const next = [trimmed, ...recentSearches.filter(s=>s.toLowerCase()!==trimmed.toLowerCase())].slice(0,8);
    setRecentSearches(next);
    ls.set(GIF_LS_RECENT_SEARCHES, next);
  };

  const pick = (gif) => {
    commitSearch(query || (activeChip ? (GIF_MOOD_CHIPS.find(c=>c.label===activeChip)?.queries[0] || activeChip) : GIF_DEFAULT_Q) || "");
    const recentReactions = ls.get(GIF_LS_RECENT_REACTIONS, []);
    ls.set(GIF_LS_RECENT_REACTIONS, [gif, ...recentReactions.filter(g=>g.id!==gif.id)].slice(0,16));
    api.post('/api/gifs/register-share', { id:gif.id, q:query.trim()||activeChip||GIF_DEFAULT_Q }).catch(()=>{});
    onSelect?.(gif);
    onClose?.();
  };

  const clearSearch = () => {
    setQuery(""); setActiveChip(null);
    loadDefault(mediaType);
  };

  const tileBg = isSticker ? `${C.surfaceMid}` : "transparent";

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:900,background:"rgba(6,6,15,0.92)",display:"flex",alignItems:"flex-end",animation:"in .2s ease" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%",maxHeight:"82vh",display:"flex",flexDirection:"column",background:`linear-gradient(170deg,${C.surfaceMid},${C.cosmic})`,borderRadius:"24px 24px 0 0",border:`1.5px solid ${C.borderHi}`,borderBottom:"none",animation:"slideUp .26s ease",position:"relative",overflow:"hidden",boxShadow:`0 -10px 50px ${C.accent}22` }}>
        <div style={{ position:"absolute",top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${C.lavender}55,transparent)` }} />
        <div style={{ width:36,height:4,borderRadius:99,background:C.border,margin:"14px auto 10px",flexShrink:0 }} />

        <div style={{ padding:"0 18px 10px",flexShrink:0 }}>
          {/* Header row: title + GIFs|Stickers toggle */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
            <div>
              <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:900,fontSize:17,marginBottom:1,background:`linear-gradient(135deg,${C.lavender},${C.blush})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>{title}</p>
              <p style={{ fontSize:11,color:C.textMid }}>{subtitle}</p>
            </div>
            {/* GIFs | Stickers segmented toggle */}
            <div style={{ display:"flex",background:C.surfaceHi,borderRadius:12,padding:3,border:`1.5px solid ${C.borderHi}`,flexShrink:0 }}>
              {[["gif","GIFs"],["sticker","Stickers"]].map(([mt,label])=>(
                <button key={mt} onClick={()=>switchMode(mt)} className="tap" style={{ padding:"6px 12px",borderRadius:9,background:mediaType===mt?C.accent:"transparent",border:"none",color:mediaType===mt?C.bg:C.textMid,fontFamily:"'Epilogue',sans-serif",fontWeight:800,fontSize:10.5,cursor:"pointer",transition:"all .18s",letterSpacing:"0.02em" }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Search input */}
          <div style={{ position:"relative" }}>
            <span style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.textMid }}>🔍</span>
            <input
              value={query}
              onChange={e=>{ setQuery(e.target.value); setActiveChip(null); }}
              onKeyDown={e=>{ if(e.key==="Enter") commitSearch(query); }}
              placeholder={isSticker ? "Search stickers…" : "Search reactions…"}
              style={{ width:"100%",padding:"10px 36px 10px 36px",borderRadius:13,background:C.surfaceHi,border:`1.5px solid ${C.borderHi}`,color:C.text,fontSize:12.5,outline:"none",fontFamily:"'Instrument Sans',sans-serif",boxSizing:"border-box" }}
            />
            {(query||activeChip)&&(
              <button onClick={clearSearch} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.textMid,fontSize:14,cursor:"pointer",padding:2 }}>✕</button>
            )}
          </div>

          {/* Mood chips */}
          <div style={{ display:"flex",gap:6,overflowX:"auto",marginTop:9,paddingBottom:2,scrollbarWidth:"none" }}>
            {GIF_MOOD_CHIPS.map(chip=>{
              const isActive = activeChip === chip.label;
              return (
                <button key={chip.label} onClick={()=>searchChip(chip)} className="tap" style={{ display:"flex",alignItems:"center",gap:4,padding:"5px 11px",borderRadius:99,flexShrink:0,background:isActive?`linear-gradient(135deg,${C.accent}33,${C.berry}22)`:C.surfaceHi,border:`1.5px solid ${isActive?C.accent:C.borderHi}`,color:isActive?C.accent:C.textMid,fontSize:10.5,fontFamily:"'Epilogue',sans-serif",fontWeight:700,cursor:"pointer",transition:"all .18s",boxShadow:isActive?`0 0 10px ${C.accent}28`:"none" }}>
                  <span style={{ fontSize:11 }}>{chip.emoji}</span>{chip.label}
                </button>
              );
            })}
          </div>

          {/* Recent searches */}
          {!query.trim() && !activeChip && recentSearches.length > 0 && (
            <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:7 }}>
              {recentSearches.slice(0,5).map(s=>(
                <button key={s} onClick={()=>{ setQuery(s); setActiveChip(null); }} className="tap" style={{ padding:"4px 10px",borderRadius:99,background:"transparent",border:`1px solid ${C.border}`,color:C.textDim,fontSize:9.5,fontFamily:"'Epilogue',sans-serif",fontWeight:600,cursor:"pointer" }}>{s}</button>
              ))}
            </div>
          )}
        </div>

        {/* Result grid */}
        <div style={{ flex:1,overflowY:"auto",padding:"4px 14px 4px" }}>
          {loading ? (
            <div style={{ display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:7 }}>
              {Array.from({length:cols*4}).map((_,i)=>(
                <div key={i} style={{ aspectRatio:"1",borderRadius:12,background:C.surfaceHi,border:`1px solid ${C.border}`,animation:"shimmer 1.4s ease-in-out infinite",opacity:0.5 }} />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign:"center",padding:"40px 20px" }}>
              <p style={{ fontSize:28,marginBottom:8 }}>{isSticker ? "🐱" : "🪐"}</p>
              <p style={{ fontFamily:"'Epilogue',sans-serif",fontWeight:800,fontSize:14,marginBottom:4 }}>{isSticker ? "No stickers found" : "No GIFs found"}</p>
              <p style={{ fontSize:11.5,color:C.textMid }}>{activeChip ? "Try a different mood above" : (isSticker ? "Try another mood — heart, cute, dancing…" : "Try another vibe — dancing, cute, shocked…")}</p>
            </div>
          ) : (
            <div style={{ display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:7 }}>
              {results.map(gif=>{
                const isS = gif.mediaType === "sticker";
                return (
                  <div key={gif.id} onClick={()=>pick(gif)} className="tap" style={{ aspectRatio:"1",cursor:"pointer",borderRadius:12,overflow:"hidden",position:"relative",background:isS?tileBg:"transparent",border:`1px solid ${C.borderHi}` }}>
                    {gif.previewUrl
                      ? <img src={gif.previewUrl} alt={gif.title||""} style={{ width:"100%",height:"100%",objectFit:isS?"contain":"cover",display:"block",borderRadius:12 }} />
                      : <GifPreviewBubble gif={gif} size="100%" rounded={12} />
                    }
                    <div style={{ position:"absolute",bottom:4,left:4,background:"rgba(6,6,15,0.65)",borderRadius:5,padding:"1px 5px",fontSize:7.5,fontFamily:"'Epilogue',sans-serif",fontWeight:800,letterSpacing:0.5,color:"rgba(255,255,255,0.9)",textTransform:"uppercase" }}>{isS?"Sticker":"GIF"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* GIPHY attribution — required by GIPHY TOS */}
        <div style={{ padding:"7px 18px 18px",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"flex-end" }}>
          <span style={{ fontSize:9,color:C.textDim,fontFamily:"'Epilogue',sans-serif",letterSpacing:"0.04em" }}>Powered by GIPHY</span>
        </div>
      </div>
    </div>
  );
}
