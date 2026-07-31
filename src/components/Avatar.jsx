import { useState } from "react";
import { C } from "../lib/theme.js";

// Feed avatar tint — seeded from the author's handle so a given fan keeps the same
// colour everywhere (same charCode-sum pattern the discovery strips use).
const FEED_AVATAR_COLORS = [C.accent, C.pink, C.mint, C.gold, C.rose, C.berry, C.lavender, C.iris];
export const feedAvatarColor = (seed="") =>
  FEED_AVATAR_COLORS[[...String(seed)].reduce((a,c)=>a+c.charCodeAt(0),0) % FEED_AVATAR_COLORS.length];

// ─── SHARED AVATAR RESOLVER ──────────────────────────────────────────────────
// One source of truth for "what represents this user / conversation." Backstage has
// no photo-avatar upload yet — every avatar is an initial today — but wiring the
// resolver to PREFER a real photo keeps every surface (nav, DMs, profiles) photo-
// ready the moment an avatar_url ever lands on a profile object. The fallback is a
// clean gradient initial, NEVER "@": a handle like "@davidzhang34" renders "D".
const _looksLikeImageUrl = (s) =>
  typeof s === "string" && /^(https?:\/\/|data:image\/|blob:|\/)/i.test(s.trim());

// Best profile-image URL for a user/conversation-like object, or null if none.
// `avatar` is checked last and only accepted when it actually looks like a URL —
// in this codebase `avatar` normally holds a single initial letter, not an image.
export const resolveAvatarUrl = (o) => {
  if (!o || typeof o !== "object") return null;
  const cands = [
    o.avatar_url, o.avatarUrl, o.photo_url, o.photoURL, o.image, o.imageUrl,
    o.profile?.avatar_url, o.profile?.avatar,
    o.user?.avatar_url, o.user?.photo_url, o.user?.image,
    o.fan?.avatar_url, o.conversation?.avatar, o.participant?.avatar,
    o.avatar,
  ];
  return cands.find(_looksLikeImageUrl) || null;
};

// First display letter for the gradient fallback — from the display name / username /
// handle, with any leading "@" stripped so it never renders as the avatar. Uppercase,
// defaulting to "B" (Backstage).
export const avatarInitial = (o) => {
  if (!o) return "B";
  const src = o.display_name || o.displayName || o.backstage_name ||
              o.name || o.username || o.handle || "";
  const letter = String(src).replace(/^@+/, "").trim().charAt(0);
  return (letter || "B").toUpperCase();
};

// Deterministic accent for a user's fallback gradient — honours an explicit `color`,
// otherwise stable per handle/name (same seed pattern as the feed strips).
const avatarColor = (o) =>
  o?.color || feedAvatarColor(o?.username || o?.handle || o?.name || o?.display_name || "B");

// <Avatar> — circular, theme-aware (Pearl + Concert). Renders the profile photo when
// one exists, otherwise a gradient-initial circle. Props:
//   size      outer px size (default 40)
//   ring      draw a lavender→pink gradient ring (active My Stage nav tab / stories)
//   ringColor override the ring gradient/color
//   glow      soft halo behind the circle
//   border    solid border colour when NOT ringed (e.g. muted nav inactive state)
//   onClick   wraps the avatar in a button (keeps tap targets consistent)
export function Avatar({ user, size = 40, fontSize, ring = false, ringColor, glow = false, border, onClick, style, className, alt = "" }) {
  const [broken, setBroken] = useState(false);
  const url = resolveAvatarUrl(user);
  const showImg = !!url && !broken;
  const initial = avatarInitial(user);
  const col = avatarColor(user);
  const fs = fontSize || Math.max(9, Math.round(size * 0.42));
  const ringPad = ring ? Math.max(2, Math.round(size * 0.085)) : 0;
  const inner = size - ringPad * 2;
  const img = showImg
    ? <img src={url} alt={alt} onError={()=>setBroken(true)} style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }} />
    : initial;
  const circle = (
    <div style={{
      width: inner, height: inner, borderRadius:"50%", overflow:"hidden", boxSizing:"border-box",
      background: showImg ? C.surfaceHi : `linear-gradient(135deg,${col},${col}66)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Epilogue',sans-serif", fontWeight:800, fontSize:fs, color:C.bg,
      border: (!ring && border) ? `1.5px solid ${border}` : "none",
    }}>{img}</div>
  );
  const node = ring
    ? (
      <div style={{
        width:size, height:size, borderRadius:"50%", padding:ringPad, boxSizing:"border-box",
        background: ringColor || `linear-gradient(135deg,${C.accent},${C.pink})`,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow: glow ? `0 0 9px ${C.accent}66` : "none",
      }}>{circle}</div>
    )
    : (glow
        ? <div style={{ borderRadius:"50%", boxShadow:`0 0 9px ${C.accent}55`, display:"flex" }}>{circle}</div>
        : circle);
  if (onClick) {
    return <button onClick={onClick} className={className} style={{ background:"none",border:"none",padding:0,cursor:"pointer",flexShrink:0,lineHeight:0,...style }}>{node}</button>;
  }
  return <div className={className} style={{ flexShrink:0,lineHeight:0,...style }}>{node}</div>;
}
