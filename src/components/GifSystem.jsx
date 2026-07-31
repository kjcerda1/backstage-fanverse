import { useState } from "react";
import { C } from "../lib/theme.js";

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
