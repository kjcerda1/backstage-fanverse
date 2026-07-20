// ─── api/server.js ────────────────────────────────────────────────────────────
// Backstage × Fanverse — Express API Server
// Version: 1.16.0
//
// WHAT CHANGED IN V16:
//   + Added /api/subscriptions/* routes (checkout, mock-activate, status)
//   + Fixed /api/ai/outfit to return { outfit: {...} } matching frontend
//   + Added /api/ai/fan-day for AI-powered fan day itinerary
//   + Added /api/music/connect/spotify + /apple + /now-playing
//   + Added /api/outfits/inspo (Pinterest-ready with mock fallback)
//   + Kept /api/stripe/checkout as legacy alias
//   + /api/map/activity now returns lat/lng for Mapbox integration
//   + All new routes have full mock fallback
//
// ROUTES:
//   GET  /api/health
//   POST /api/ai/outfit              ← FIXED: returns { outfit: {...} }
//   POST /api/ai/chant-helper
//   POST /api/ai/trip-planner        ← called from frontend (NOT Anthropic directly)
//   POST /api/ai/assistant
//   POST /api/ai/fan-day             ← NEW
//   GET  /api/events
//   POST /api/events/attendance
//   GET  /api/feed
//   POST /api/feed/post
//   POST /api/feed/like
//   POST /api/meetups/create
//   POST /api/meetups/:id/rsvp
//   GET  /api/meetups
//   GET  /api/map/activity           ← IMPROVED: includes lat/lng
//   GET  /api/recommendations
//   GET  /api/users/badges
//   GET  /api/users/trust
//   POST /api/users/solo-mode
//   POST /api/profile/update
//   POST /api/profile/top-groups
//   GET  /api/profile/:id
//   GET  /api/users/me               ← NEW: returns current user profile
//   POST /api/concerts/memory
//   GET  /api/concerts/memory
//   POST /api/memories/upload-image   ← Phase 2A: Supabase Storage upload
//   POST /api/scrapbooks/memory       ← Phase 2A: save scrapbook memory
//   GET  /api/scrapbooks/memories     ← Phase 2A: load scrapbook memories
//   GET  /api/trades
//   POST /api/trades/offer
//   POST /api/trades/review
//   POST /api/marketplace/listing
//   GET  /api/marketplace
//   POST /api/projects/create
//   POST /api/save-token
//   POST /api/send-notification
//   POST /api/subscriptions/checkout ← NEW (was /api/stripe/checkout)
//   POST /api/subscriptions/mock-activate ← NEW
//   GET  /api/subscriptions/status   ← NEW
//   POST /api/stripe/checkout        ← KEPT as legacy alias
//   POST /api/webhooks/stripe
//   POST /api/music/connect/spotify  ← NEW (OAuth initiation)
//   POST /api/music/connect/apple    ← NEW (OAuth initiation)
//   GET  /api/music/now-playing      ← NEW
//   GET  /api/outfits/inspo          ← NEW (Pinterest-ready)
//   POST /api/outfits/save-inspo     ← NEW
// ─────────────────────────────────────────────────────────────────────────────

import express     from 'express';
import cors        from 'cors';
import helmet      from 'helmet';
import rateLimit   from 'express-rate-limit';
import Stripe      from 'stripe';
import Anthropic   from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import admin        from 'firebase-admin';
import jwt          from 'jsonwebtoken';
import 'dotenv/config';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── ENV FLAGS ─────────────────────────────────────────────────────────────────
const MOCK_MODE          = process.env.MOCK_MODE === 'true' || !process.env.SUPABASE_URL;
const HAS_STRIPE         = !!process.env.STRIPE_SECRET_KEY;
const HAS_AI             = !!process.env.ANTHROPIC_API_KEY;
const HAS_FIREBASE       = !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_PROJECT_ID);
const HAS_SPOTIFY        = !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;
const HAS_APPLE_MUSIC    = !!process.env.APPLE_MUSIC_TEAM_ID && !!process.env.APPLE_MUSIC_KEY_ID && !!process.env.APPLE_MUSIC_PRIVATE_KEY;
const HAS_MAPBOX         = !!process.env.MAPBOX_ACCESS_TOKEN;
const HAS_TICKETMASTER   = !!process.env.TICKETMASTER_API_KEY;
const HAS_EMAIL          = !!process.env.RESEND_API_KEY;
const EMAIL_FROM         = process.env.EMAIL_FROM || 'Backstage <notifications@backstagefanverse.com>';
// Render sets RENDER_EXTERNAL_URL automatically; fallback to explicit BACKEND_URL env var
const BACKEND_URL        = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3001}`;

// Firebase Admin SDK — initialized once on startup if credentials are present
if (HAS_FIREBASE && !admin.apps.length) {
  try {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
    } else {
      credential = admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      });
    }
    admin.initializeApp({ credential });
    console.log('[Firebase Admin] Initialized ✓');
  } catch (err) {
    console.warn('[Firebase Admin] Init failed — push notifications disabled:', err.message);
  }
}

console.log(`[Backstage API v1.16.0] Starting in ${MOCK_MODE ? 'MOCK' : 'PRODUCTION'} mode`);
console.log(`[Backstage API] AI: ${HAS_AI ? '✓' : '✗'} | Stripe: ${HAS_STRIPE ? '✓' : '✗'} | Spotify: ${HAS_SPOTIFY ? '✓' : '✗'} | Apple Music: ${HAS_APPLE_MUSIC ? '✓' : '✗'} | Mapbox: ${HAS_MAPBOX ? '✓' : '✗'}`);

// ── SERVICE CLIENTS ───────────────────────────────────────────────────────────
const supabase = MOCK_MODE
  ? null
  : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const stripe = HAS_STRIPE ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const anthropic = HAS_AI
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
  'http://127.0.0.1:5176',
  'http://127.0.0.1:5177',
  'http://192.168.1.177:5173',
  'http://192.168.1.177:5174',
  'http://192.168.1.177:5175',
  'http://192.168.1.177:5176',
  'http://192.168.1.177:5177',
  'https://backstagefanverse.com',
  'https://www.backstagefanverse.com',
  'https://backstage-fanverse-01.vercel.app',
]);
if (process.env.FRONTEND_URL) allowedOrigins.add(process.env.FRONTEND_URL);

console.log('[Backstage API] Allowed CORS origins:', [...allowedOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, origin);
    return callback(new Error(`CORS: origin not allowed - ${origin}`));
  },
  credentials: true,
}));

// Raw body for Stripe webhooks — MUST be before express.json
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '6mb' }));

// Global rate limit
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// AI-specific rate limit
const aiLimiter = rateLimit({
  windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60000,
  max:      parseInt(process.env.AI_RATE_LIMIT_MAX)        || 20,
  standardHeaders: true,
  message: { error: 'Too many AI requests. Please wait a moment.' },
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  if (MOCK_MODE) {
    req.userId    = 'mock_user_1';
    req.userEmail = 'fan@backstage.app';
    req.userToken = null;
    return next();
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { console.warn(`[requireAuth] ${req.method} ${req.path} — missing auth token`); return res.status(401).json({ error: 'Missing auth token' }); }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) { console.warn(`[requireAuth] ${req.method} ${req.path} — invalid/expired session:`, error?.message); return res.status(401).json({ error: 'Invalid or expired session' }); }
  req.userId    = user.id;
  req.userEmail = user.email;
  req.userToken = token;
  next();
}

// Creates a per-request Supabase client that forwards the user's JWT.
// Works correctly whether SUPABASE_SERVICE_KEY is the service role key
// (bypasses RLS entirely) or the anon key (queries run as authenticated role,
// which RLS grants allow after the fix_table_grants_all_roles migration).
function makeUserClient(req) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${req.userToken}` } },
  });
}

async function optionalAuth(req, res, next) {
  if (MOCK_MODE) { req.userId = null; req.userToken = null; return next(); }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    req.userId = user?.id || null;
    req.userToken = user?.id ? token : null;
    req.authError = error || null;
  } catch (err) {
    req.userId = null;
    req.userToken = null;
    req.authError = err;
  }
  next();
}

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:              'ok',
    version:             '1.16.0',
    app:                 'Backstage × Fanverse',
    mock_mode:           MOCK_MODE,
    has_ai:              HAS_AI,
    has_stripe:          HAS_STRIPE,
    has_stripe_webhook:  !!process.env.STRIPE_WEBHOOK_SECRET,
    has_firebase:        HAS_FIREBASE,
    firebase_initialized: HAS_FIREBASE && admin.apps.length > 0,
    has_email:           HAS_EMAIL,
    has_spotify:         HAS_SPOTIFY,
    has_mapbox:          HAS_MAPBOX,
    has_ticketmaster:    HAS_TICKETMASTER,
    timestamp:           new Date().toISOString(),
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// AI ROUTES — /api/ai/*
// All AI calls proxied here. API keys NEVER reach the browser.
// ═════════════════════════════════════════════════════════════════════════════

// ── AI: OUTFIT GENERATOR ──────────────────────────────────────────────────────
// Returns { outfit: { title, subtitle, confidence, items[], colors[], tags[], tip, accessories[] } }
// V16 FIX: Changed from { looks: [] } to { outfit: {} } to match frontend expectation
app.post('/api/ai/outfit', aiLimiter, requireAuth, async (req, res) => {
  const { group, era, bias, vibe, season, venue, comfort } = req.body;

  // Varied mock pool — deterministic by group+season so same inputs always give same outfit
  const OUTFIT_POOLS = {
    dark: [
      { title:'Noir Cinematic Fit', items:['Oversized leather moto jacket + black crop tee','Slim black wide-leg trousers','Chunky platform lug-sole boots','Silver chain layering set + black ring stack',`${group||'Fandom'} lightstick holster keychain`], colors:['Noir Black','Gunmetal Silver','Violet Shadow'], tags:['🌙 Night Show','🖤 Dark Core','💜 Fan-coded'], tip:'Wear the jacket open for the fan-cam moment — tuck the crop tee underneath for shape.', accessories:['Black mini crossbody','Silver studded belt','Fandom pins on jacket'], palette:['#0a0a14','#1a1428','#8880d0','#404060'], textures:['Faux leather','Brushed silver hardware','Stretch twill'], why:"Channels the group's current cinematic era — moody, intentional, and visually striking under arena lights.", comfort:'4-hour concert ready. Jacket adds warmth; remove for the floor section.', bag:['Mini crossbody (lightstick + phone)','Portable charger','Lip gloss + mirror','Fan towel','Extra layer for the walk back'] },
      { title:'Shadow Glam Fit', items:['Black mesh long-sleeve under cropped black blazer','High-waist vinyl mini skirt','Platform pointed-toe boots','Crystal drop earrings + silver cuff','Holographic mini tote'], colors:['Matte Black','Ice Chrome','Deep Plum'], tags:['🌙 Night Show','💎 Editorial','💜 Fan-coded'], tip:'The blazer over mesh is the move — instant editorial without losing the edge.', accessories:['Holographic tote','Crystal earrings','Silver hair barrette'], palette:['#06060f','#2a1848','#c0b8f0','#806090'], textures:['Mesh','Vinyl','Crystal hardware'], why:'This layering combo photographs perfectly under stage lights — dark base with bright metallic flash.', comfort:'Mesh breathes well for standing sections. Blazer handles the cold walk in.', bag:['Holographic mini bag','Portable fan','Touch-up kit','Lightstick','Merch lanyard'] },
      { title:'Chrome Noir Fit', items:['Chrome-detail corset top','Black cargo trousers with chain hardware','Lug-sole platform sneakers','Silver choker + chrome ring set','Mini chrome crossbody'], colors:['Matte Black','Chrome Silver','Electric Violet'], tags:['🌙 Night Show','🔩 Hardware Core','💜 Fan-coded'], tip:'Chrome hardware catches every light cue in the venue — especially during the lightstick ocean.', accessories:['Chrome crossbody','Chain hardware belt','Silver ring set'], palette:['#08080f','#1c1c30','#c8c8f8','#5040a8'], textures:['Chrome hardware','Matte cargo','Corset boning'], why:"Hardware and chrome sync perfectly with the group's futuristic-dark production design.", comfort:'Cargo trousers give you all the room you need for a full three-hour set.', bag:['Chrome mini bag','Portable charger','Lightstick','Backup battery','Fandom pin'] },
      { title:'Gothic Soft Power', items:['Sheer black blouse with lace detail over black bralette','Black satin bias-cut midi skirt','Platform Mary Janes','Silver cross pendants + ear cuffs','Black lace headband'], colors:['Onyx Black','Silver Lace','Muted Mauve'], tags:['🌙 Night Show','🕸️ Gothic Soft','💜 Fan-coded'], tip:'Midi skirt is more practical for floor sections than a mini — comfort and drama in one.', accessories:['Lace headband','Cross pendant stack','Ear cuffs'], palette:['#0e0818','#24183c','#a898d0','#703888'], textures:['Sheer georgette','Silk satin bias','Antique silver lace'], why:"Gothic soft pairs the group's romantic edge with concert-practical layering.", comfort:'Midi length means you can sit, stand, and jump freely without worry.', bag:['Small crossbody','Portable charger','Touch-up mirror','Fandom button','Extra scrunchie'] },
      { title:'Midnight Punk Glam', items:['Black band-tee (knotted/cropped)','Plaid mini skirt with safety-pin details','Platform creeper boots','Studded choker + pearl drop earrings','Fishnet knee socks'], colors:['Faded Black','Plaid Accent','Pearl White'], tags:['🌙 Night Show','🎸 Punk Glam','💜 Fan-coded'], tip:"Knotted tee shapes the silhouette without losing the punk energy — knot it on the side.", accessories:['Studded choker','Pearl earrings','Belt chain'], palette:['#0e0a18','#2c1020','#e0a0a0','#806070'], textures:['Vintage cotton','Plaid wool blend','Patent leather'], why:"Punk energy matches the group's rebellious concert aesthetic — you'll fit the room perfectly.", comfort:'Fishnets add warmth and style. Creepers are stable for long standing sets.', bag:['Studded mini bag','Mirror compact','Lightstick','Touch-up kit','Fan merch'] },
      { title:'Dark Avant-Garde Fit', items:['Structured black crop jacket with shoulder detail','Pleated black micro-mini skirt','Knee-high platform boots','Layered silver chains + black pearl choker','Mesh gloves (optional drama layer)'], colors:['Pure Black','Silver Frost','Dusty Violet'], tags:['🌙 Night Show','⚡ Avant-Garde','💜 Fan-coded'], tip:"The shoulder detail reads across an arena — wear it like armor.", accessories:['Mini structured bag','Black pearl choker','Statement ring stack'], palette:['#06060f','#161428','#d0cce8','#6050a0'], textures:['Structured weave','Micro-pleated','Sterling silver tone'], why:"Avant-garde silhouettes are a staple of the group's performance concept — you'll belong in the front row.", comfort:'Micro-mini means full mobility — great for standing and dancing in the pit.', bag:['Structured clutch','Portable charger','Mirror compact','Fan glow stick','Backup lip'] },
    ],
    soft: [
      { title:'Soft Glam Cloud Fit', items:['Lavender satin slip top with lace trim','Wide-leg ivory linen trousers','White strappy heeled sandals','Pearl layered necklaces + stud earrings',`${group||'Fandom'} ribbon hair clip set`], colors:['Soft Lavender','Ivory White','Blush Pink'], tags:['✨ Soft Glam','🌸 Feminine','💜 Fan-coded'], tip:"Ribbon hair clips are the fandom tell — wear them throughout and they'll photograph beautifully.", accessories:['Pearl mini bag','Ribbon clips','Layered pearl necklaces'], palette:['#d8d0f8','#f8f0f8','#f0c8d8','#a898d0'], textures:['Satin','Linen blend','Pearl finish'], why:'Soft glam reads elegant in arena lighting — delicate details pop without fighting the stage for attention.', comfort:'Wide-leg trousers mean you can stand for hours without fatigue. Heels are low enough for the floor.', bag:['Pearl mini bag','Compact mirror','Lightstick','Touch-up kit','Fan ribbon'] },
      { title:'Romantic Idol Fit', items:['Floral chiffon babydoll blouse','Cream pleated midi skirt','Platform white Mary Janes','Gold hoop earrings + delicate chain necklace','White mini tote with ribbon handle'], colors:['Floral Cream','Butter Yellow','Dusty Rose'], tags:['✨ Soft Glam','🌹 Romantic','💜 Fan-coded'], tip:"Midi skirt with the babydoll top is the '2024 idol airport look' translated to fandom fashion.", accessories:['White ribbon tote','Gold hoops','Chain necklace'], palette:['#f8f0e0','#e8d8c0','#f0c8c8','#c0a888'], textures:['Chiffon','Pleated cotton','Gold-toned metal'], why:"The romantic silhouette mirrors the group's soft concept era — you'll blend into the mood perfectly.", comfort:'Babydoll blouse is breathable for summer concerts. Midi length means low worry.', bag:['White ribbon tote','Portable fan','Touch-up kit','Lightstick','Backup lip gloss'] },
      { title:'Dreamy Pastel Fit', items:['Pale pink knit crop cardigan + matching crop top','Pastel lilac wide-leg pants','White lug-sole sneakers','Pastel pearl choker + silver star earrings','Satin bow headband'], colors:['Pastel Pink','Lilac Dream','Soft White'], tags:['✨ Soft Glam','🎀 Dreamy','💜 Fan-coded'], tip:'The matching cardigan + top set trick is the easiest way to look put-together without trying.', accessories:['Satin bow headband','Pearl choker','Star earrings'], palette:['#f8d8e8','#e8d8f8','#ffffff','#c0b0e0'], textures:['Soft knit','Satin ribbon','Pearl shell'], why:"Pastel aesthetics match the group's lighthearted concept and fan community visual language.", comfort:'Knit cardigan provides warmth for the AC blast in the arena. Sneakers = full concert comfort.', bag:['Satin bow bag','Compact mirror','Lightstick','Portable charger','Candy for the wait'] },
      { title:'Ethereal White Fit', items:['White lace eyelet blouse','White high-waist flare trousers','Silver strappy block-heel sandals','Crystal ear cuffs + white pearl bracelet','Sheer white overlay skirt (optional layer)'], colors:['Pure White','Crystal Clear','Silver Mist'], tags:['✨ Soft Glam','🤍 Ethereal','💜 Fan-coded'], tip:'All-white reads like a legend in the crowd — especially during ballads with the lightstick ocean.', accessories:['Crystal ear cuffs','Pearl bracelet','Silver hair pin'], palette:['#ffffff','#f0f0f8','#e0d8f0','#c8c0e8'], textures:['Lace eyelet','Flare twill','Crystal hardware'], why:'White creates a striking crowd presence and photographs beautifully with stage lighting.', comfort:'Flare trousers and block heels are the most comfortable elegant combo for arenas.', bag:['White satin bag','Portable mirror','Lightstick','Touch-up kit','Face wipes'] },
      { title:'Blush Idol Moment', items:['Blush pink corset top','Baby blue high-waist mini skirt','Nude heeled mules with ankle strap','Rose gold chain necklace + matching cuff','Pastel ribbon bow in hair'], colors:['Blush Rose','Baby Blue','Rose Gold'], tags:['✨ Soft Glam','🌷 Feminine Core','💜 Fan-coded'], tip:'Blush + baby blue is the iconic idol fashion show color combo — own it completely.', accessories:['Rose gold jewelry set','Ribbon bow','Nude mules'], palette:['#f8c8c8','#c8e8f8','#e8b0a0','#d0a8b8'], textures:['Satin corset','Cotton blend','Rose gold tone'], why:"This color palette is directly inspired by the group's merchandise and concept mood board.", comfort:'Corset top provides structure without being too tight. Mules are stable for long waits.', bag:['Pastel mini bag','Compact mirror','Lightstick','Touch-up kit','Hair pins'] },
      { title:'Cherry Blossom Fit', items:['Cherry blossom print wrap blouse','Light pink A-line skirt','Blush platform wedge sandals','Daisy hair clips + gold ring stack','Woven mini tote in cream'], colors:['Cherry Pink','Fresh Cream','Warm Gold'], tags:['✨ Soft Glam','🌸 Seasonal','💜 Fan-coded'], tip:'Floral print + solid color pairing keeps the look cohesive — let the print lead.', accessories:['Daisy clips','Gold ring stack','Woven tote'], palette:['#f8b8c8','#fff8e8','#e8d0a8','#d0a0b0'], textures:['Printed chiffon','Cotton A-line','Woven natural'], why:"Cherry blossom prints resonate with the group's K-pop spring aesthetic and fan color palette.", comfort:'A-line skirt and wedges are perfect for outdoor or warm venue concerts with lots of walking.', bag:['Woven tote','Portable fan','Lightstick','Touch-up kit','Mini sunscreen'] },
    ],
    cozy: [
      { title:'Fan Den Cozy Fit', items:['Cream oversized ribbed knit sweater','Dark wash straight-leg jeans, cuffed once','White platform chunky sneakers','Cozy fandom beanie + layered necklaces',`${group||'Fandom'} tote as your statement bag`], colors:['Warm Cream','Dark Denim','Soft White'], tags:['☕ Cozy Core','🧶 Knit Season','💜 Fan-coded'], tip:"Cuff the jeans once to show the sneakers fully — the small detail that makes the whole fit land.", accessories:['Fandom beanie','Layered necklaces','Tote bag'], palette:['#f0e8d0','#2a2030','#ffffff','#b8b0a0'], textures:['Ribbed knit','Denim twill','Chunky canvas'], why:'Cozy fits work perfectly for long queues and standing sections — comfort without sacrificing personality.', comfort:'Ribbed knit breathes well and layers easily. Add a jacket for outdoor queuing.', bag:['Fandom tote','Portable charger','Snacks for the queue','Lightstick','Cozy socks backup'] },
      { title:'Campus Fan Fit', items:['Graphic crewneck sweatshirt (fan merch or aesthetic)','Plaid flannel shirt tied at waist','Straight-leg khaki trousers','Clean white lace-up sneakers','Canvas tote with enamel pin cluster'], colors:['Vintage Grey','Plaid Brown','Classic White'], tags:['☕ Cozy Core','📚 Campus Cute','💜 Fan-coded'], tip:'The flannel tied at the waist adds visual interest. Remove it inside when it gets warm.', accessories:['Wrist scrunchie stack','Canvas tote','Enamel pins'], palette:['#c8c0b8','#a08060','#f0ece8','#806050'], textures:['Fleece cotton','Flannel plaid','Canvas'], why:"The effortless campus aesthetic aligns with the group's off-duty idol street style.", comfort:'Maximum concert comfort — you can sit, jump, and queue for 6 hours without issue.', bag:['Canvas tote','Portable charger','Merch pins','Lightstick','Snacks'] },
      { title:'Autumn Concert Fit', items:['Rust orange oversized fleece pullover','Brown wide-leg corduroy trousers','Tan lug-sole boots','Wooden bead necklace + stud earrings','Brown tote with merch pin cluster'], colors:['Rust Orange','Warm Brown','Tan Leather'], tags:['☕ Cozy Core','🍂 Autumn Mood','💜 Fan-coded'], tip:'Rust and brown are the concert crowd colors of fall — you will look cohesive with every autumn fan around you.', accessories:['Merch pin cluster on tote','Wooden beads','Lug-sole boots'], palette:['#c05020','#604020','#c0a060','#e8c080'], textures:['Fleece','Corduroy ribbed','Suede tone'], why:"Autumn palette matches the group's concept album art and seasonal fan-cam aesthetic.", comfort:'Corduroy trousers are warm, comfortable, and handle a full-night standing section.', bag:['Brown tote','Hand warmers','Portable charger','Lightstick','Extra jacket'] },
      { title:'Soft Merch Fit', items:['Pastel fandom sweatshirt','High-waist jogger trousers in matching shade','Foam-sole platform sneakers','Pom pom beanie + charm bracelet stack','Puffer crossbody (hands-free)'], colors:['Pastel Fandom Color','Soft White','Warm Grey'], tags:['☕ Cozy Core','🎪 Fan Spirit','💜 Fan-coded'], tip:'Matching sweatshirt + jogger is the ultimate lazy-cozy elevated look. Just add cute shoes.', accessories:['Pom pom beanie','Charm bracelet','Puffer crossbody'], palette:['#d8d0f0','#f0ece8','#c0b8c8','#a09898'], textures:['French terry','Foam sole','Quilted nylon'], why:"Matching set energy mirrors the group's color-coded photoshoot aesthetic — cohesive and recognizable.", comfort:'Ultimate comfort fit. You could wear this for a 4-hour queue and still feel great.', bag:['Puffer crossbody','Portable charger','Snack pouch','Lightstick','Mini fan'] },
      { title:'Bookish Fan Fit', items:['Oversized cable-knit cardigan (oatmeal)','Striped ribbed turtleneck underneath','Straight-leg cropped trousers (dark)','Chunky low-profile sneakers','Leather satchel with enamel pin cluster'], colors:['Oatmeal Knit','Navy Stripe','Dark Charcoal'], tags:['☕ Cozy Core','📖 Soft Intellectual','💜 Fan-coded'], tip:'Layer the cardigan open over the turtleneck — the collar peeking through is the whole aesthetic.', accessories:['Leather satchel','Enamel pin cluster','Knit hair clip'], palette:['#e8e0d0','#1a1e2e','#c8c0b8','#404858'], textures:['Cable-knit wool','Ribbed cotton','Smooth leather'], why:"Intellectual-cozy aesthetics resonate with the group's artsy fan community — thoughtful and warm.", comfort:'Cable-knit and turtleneck mean you are ready for the AC blast. Removable layers are key.', bag:['Leather satchel','Portable charger','Fandom pins','Lightstick','Journal for the queue'] },
      { title:'Winter Hug Fit', items:['Cream teddy fleece zip-up jacket','Mocha ribbed long-sleeve top','Dark brown straight jeans','Platform chelsea boots','Knit beanie + sherpa mini bag'], colors:['Teddy Cream','Mocha Brown','Dark Chocolate'], tags:['☕ Cozy Core','🤎 Warm Tones','💜 Fan-coded'], tip:'Teddy fleece photographs warm and inviting — you will be the one everyone wants to stand next to.', accessories:['Knit beanie','Sherpa mini bag','Stacking rings'], palette:['#f0e8d8','#7a5040','#2a1810','#c0a080'], textures:['Teddy fleece','Rib knit','Smooth leather chelsea'], why:"Winter warmth aesthetics sync with the group's cozy holiday content and winter comeback visuals.", comfort:'Teddy jacket is your heating system. Layers keep you warm in the queue, cool once inside.', bag:['Sherpa mini bag','Hand warmers','Portable charger','Lightstick','Snacks'] },
    ],
    bold: [
      { title:'Power Move Fit', items:['Red power blazer (structured, cropped)','Black bodysuit underneath','Wide-leg black trousers with sharp crease','Strappy black heeled sandals','Statement gold cuff + bold accessories'], colors:['Power Red','Matte Black','Gold Accent'], tags:['⚡ Power Fit','🔥 Statement','💜 Fan-coded'], tip:'The blazer is your whole look — keep everything else minimal to let it lead.', accessories:['Statement gold cuff','Bold ring','Red lip'], palette:['#c02020','#06060f','#d0a040','#802020'], textures:['Structured wool blend','Jersey bodysuit','Satin lining'], why:"Power colors and structured silhouettes mirror the group's commanding stage presence — you will own the room.", comfort:'Wide-leg trousers mean you can stand for hours. Blazer handles the temperature swings.', bag:['Structured mini bag','Backup lip color','Lightstick','Portable charger','Mirror compact'] },
      { title:'Y2K Bold Fit', items:['Rhinestone-studded baby tee','Low-rise flared jeans with crystal hem detail','Platform chunky sneakers','Butterfly clips + hoop earrings + arm candy stack','Mini rhinestone shoulder bag'], colors:['Crystal Clear','Washed Denim','Chrome Silver'], tags:['⚡ Power Fit','💎 Y2K Revival','💜 Fan-coded'], tip:'Rhinestone + denim is the Y2K formula — pick one sparkle piece to lead, keep the rest minimal.', accessories:['Butterfly clips','Hoop earrings','Arm candy stack'], palette:['#f0f0f8','#80a0c8','#c0c0e0','#e0d0f0'], textures:['Jersey + crystal','Denim','Chrome hardware'], why:"Y2K revival energy matches the group's retro-future era concept and visual tone.", comfort:'Low-rise + flare is comfortable for dancing. Platform adds height without stiletto pain.', bag:['Rhinestone mini bag','Compact mirror','Lightstick','Touch-up kit','Sparkly hair pins'] },
      { title:'Colorblock Statement', items:['Electric blue structured jacket','Contrasting orange bodysuit','Black wide-leg trousers','Black pointed-toe boots','Geometric statement earrings'], colors:['Electric Blue','Vibrant Orange','Clean Black'], tags:['⚡ Power Fit','🎨 Colorblock','💜 Fan-coded'], tip:'Wear the jacket open to show the orange underneath — close it for the photo, open it for movement.', accessories:['Geometric earrings','Minimal gold ring','Structured mini bag'], palette:['#2040c0','#e06020','#06060f','#c0a040'], textures:['Structured gabardine','Jersey','Matte leather'], why:"Bold colorblocking is a K-pop stylist signature move — you will look like you belong on the stage side.", comfort:'Open jacket ventilates the look for warm venue floors. Structured enough for a long set.', bag:['Structured mini tote','Portable charger','Lightstick','Touch-up kit','Bold lip backup'] },
      { title:'Stage Presence Fit', items:['Black sequin crop top','High-waist leather shorts','Thigh-high platform boots','Crystal earrings + rhinestone hair pins','Mini sequin crossbody'], colors:['Jet Black Sequin','Patent Black','Crystal Flash'], tags:['⚡ Power Fit','✨ Sequin Night','💜 Fan-coded'], tip:'Sequin catches every stage light — you will shine in the fan cam coverage.', accessories:['Rhinestone hair pins','Crystal earrings','Sequin crossbody'], palette:['#08080f','#1a1a28','#e8e0f8','#6060c0'], textures:['Sequin','Patent leather','Crystal embellishment'], why:'Sequin and leather is the ultimate concert power combo — editorial but functional.', comfort:'Platform thigh-highs take practice — bring the boots and change at the venue if needed.', bag:['Mini sequin bag','Blister plasters','Lightstick','Portable charger','Touch-up kit'] },
      { title:'Electric Neon Fit', items:['Neon lime crop jacket','Black mesh bodysuit','Black vinyl mini skirt','Platform chunky sneakers with neon detail','LED hair accessories + black sunglasses'], colors:['Neon Lime','Pure Black','Electric White'], tags:['⚡ Power Fit','⚡ Electric','💜 Fan-coded'], tip:'LED hair accessories are transformative — check if your venue allows them before committing.', accessories:['LED hair clip','Black shades','Neon wrist cuff'], palette:['#c0f020','#06060f','#e8f8c0','#808020'], textures:['Nylon mesh','Vinyl','Rubber platform sole'], why:"Neon energy matches the group's electric production design — you'll photograph like part of the show.", comfort:'Mesh bodysuit breathes well but pack hand warmers for the queue. Sneakers = arena comfort.', bag:['Mini neon bag','Portable charger','Lightstick','LED accessories backup','Sunglasses'] },
      { title:'Fierce Editorial Fit', items:['Black structured vest (tailored)','Fishnet turtleneck underneath','Wide-leg tailored trousers (charcoal)','Block-heel ankle boots','Architectural cuff + statement sunglasses'], colors:['Charcoal Steel','Fishnet Black','Chrome'], tags:['⚡ Power Fit','🗞️ Editorial','💜 Fan-coded'], tip:'The architectural accessories do the heavy lifting — keep the clothing clean and structured.', accessories:['Architectural cuff','Statement sunglasses','Minimal ring'], palette:['#2a2a2a','#0e0e18','#c8c8d8','#484860'], textures:['Structured suiting','Fishnet cotton','Brushed silver hardware'], why:"Editorial tailoring is the group's stylist house signature — wearing it in the crowd is the tribute.", comfort:'Wide-leg trousers and block heels are the most comfortable dressed-up combo for a full concert night.', bag:['Structured mini clutch','Compact mirror','Lightstick','Portable charger','Blister plasters'] },
    ],
    cute: [
      { title:'K-Pop Cafe Outfit', items:['Strawberry pink oversized knit sweater','High-waist denim micro skirt with heart pockets','Platform Mary Jane shoes','Cherry earrings + heart charm necklace',`${group||'Fandom'} pink cloud mini tote bag`], colors:['Strawberry Pink','Denim Blue','Cherry Red'], tags:['🍓 Cute Core','🎀 K-Cafe','💜 Fan-coded'], tip:'Heart pocket detail is cute but subtle — pair with cherry earrings for a theme without being too matchy.', accessories:['Cherry earrings','Heart necklace','Pink cloud bag'], palette:['#f8b0c0','#80a0d8','#f03040','#f8d8e0'], textures:['Soft knit','Stretch denim','Patent leather'], why:"Cute-core aesthetics match the group's bubbly concept and fan-community visual identity.", comfort:'Oversized knit is warm and comfortable. Mary Janes with platform are the most wearable cute shoe option.', bag:['Pink cloud bag','Compact mirror','Lightstick','Touch-up kit','Cute fan stickers to swap'] },
      { title:'Bunny Aesthetic Fit', items:['White cropped hoodie with ear/bow detail','Pastel blue pleated skirt','White chunky sneakers','Bunny hairpin set + pearl ring stack','White puffer mini backpack'], colors:['Cloud White','Pastel Blue','Soft Pink'], tags:['🍓 Cute Core','🐰 Bunny Aesthetic','💜 Fan-coded'], tip:'Bunny aesthetic is peak fandom energy — wear it confidently, the crowd will adore it.', accessories:['Bunny hairpins','Pearl ring stack','White puffer backpack'], palette:['#ffffff','#c8ddf8','#f8d8e8','#e8d8f0'], textures:['Fleece cotton','Pleated chiffon','Chunky rubber sole'], why:"The bunny aesthetic is a direct nod to the group's mascot and fandom culture.", comfort:'Hoodie + pleated skirt is the comfort + cute combination that works for any weather.', bag:['White puffer backpack','Portable charger','Lightstick','Touch-up kit','Fan candy'] },
      { title:'Magical Girl Fit', items:['Pink ruffled chiffon top','Gradient pastel flare skirt (pink to mint)','Clear platform sandals with glitter','Star hairclips + crystal wand keychain','Iridescent mini bag'], colors:['Magical Pink','Mint Gradient','Crystal Clear'], tags:['🍓 Cute Core','✨ Magical','💜 Fan-coded'], tip:'Gradient skirt photographs beautifully — stand in the light during slow songs for full magical effect.', accessories:['Star hairclips','Crystal keychain','Iridescent bag'], palette:['#f8c0d8','#a8f0e0','#f8f0ff','#d8a0c8'], textures:['Chiffon ruffles','Gradient organza','Iridescent vinyl'], why:"Magical girl aesthetics are rooted in the group's fantasy concept era and fan art community.", comfort:'Flare skirt is the most comfortable dressed-up silhouette for a long concert night.', bag:['Iridescent mini bag','Portable mirror','Lightstick','Star wand keychain','Touch-up kit'] },
      { title:'Doll Aesthetic Fit', items:['Pink gingham babydoll dress','White lace collar detail','White ankle socks with lace trim + white Mary Janes','Ribbon headband + charm bracelet','Pink wicker mini bag'], colors:['Gingham Pink','Pure White','Baby Rose'], tags:['🍓 Cute Core','🎀 Doll Aesthetic','💜 Fan-coded'], tip:"Lace collar is the detail that elevates the babydoll from cute to editorial cute — don't skip it.", accessories:['Ribbon headband','Charm bracelet','Wicker bag'], palette:['#f8c8d8','#ffffff','#f8e0e8','#e0b0c0'], textures:['Gingham cotton','Eyelet lace','Natural wicker'], why:"Doll aesthetic mirrors the group's kawaii idol concept and merchandise visual style.", comfort:'Babydoll dress is the most comfortable summer concert dress — no waistband pressure for hours.', bag:['Pink wicker bag','Compact mirror','Lightstick','Touch-up kit','Fan ribbon'] },
      { title:'Sweet Nostalgia Fit', items:['Yellow checkered crop top','Light blue high-waist shorts','Retro stripe knee socks + white retro sneakers','Daisy hairclips + colorful bead necklace','Canvas tote with patches'], colors:['Sunny Yellow','Sky Blue','Fresh White'], tags:['🍓 Cute Core','🌻 Sweet Retro','💜 Fan-coded'], tip:'The bead necklace and daisy clips are the Y2K throwback detail that pulls the whole summer look together.', accessories:['Daisy hairclips','Bead necklace','Patched canvas tote'], palette:['#f8d840','#88c8f0','#ffffff','#e8c040'], textures:['Cotton check','Stripe rib knit','Canvas'], why:"Sweet retro aesthetics connect with the group's summer comeback visuals and playful energy.", comfort:'Shorts + sneakers is the optimal comfort level for outdoor or warm venue summer concerts.', bag:['Canvas tote','Mini sunscreen','Portable fan','Lightstick','Snacks'] },
      { title:'Candy Pop Fit', items:['Colorful stripe knit crop top','Hot pink mini skirt with ruffle hem','White platform sneakers','Jelly bag + acrylic charm earrings','Pastel scrunchie collection on wrist'], colors:['Candy Stripe','Hot Pink','Jelly Clear'], tags:['🍓 Cute Core','🍬 Candy Pop','💜 Fan-coded'], tip:'Acrylic charms read better in person than photos — wear them for you, the vibe will translate.', accessories:['Acrylic charm earrings','Jelly bag','Scrunchie stack'], palette:['#f85898','#f8d0e8','#f8f8c8','#88d8f8'], textures:['Stripe knit','Ruffle cotton','Jelly PVC'], why:"Candy pop color energy matches the group's bright, high-energy performance style perfectly.", comfort:'Stripe crop + mini is breathable for warm venues. Platform sneakers keep you comfortable for hours.', bag:['Jelly bag','Compact mirror','Lightstick','Touch-up kit','Fan candy to share'] },
    ],
  };

  const pool = OUTFIT_POOLS[vibe] || OUTFIT_POOLS.dark;
  const seed = [...`${group||''}${season||''}`].reduce((a,c)=>a+c.charCodeAt(0),0);
  const template = pool[seed % pool.length];
  const MOCK_OUTFIT = {
    ...template,
    title:      `${group||'Fandom'} ${template.title}`,
    subtitle:   'Built for your concert night ✦',
    confidence: 85 + (seed % 13),
    mock: true,
  };

  if (!HAS_AI) return res.json({ outfit: MOCK_OUTFIT });

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `You are a K-pop concert fashion stylist. You know every era, group aesthetic, and fandom fashion deeply.
Return ONLY valid JSON — no markdown fences, no explanation.
Output shape: { "outfit": { "title": string, "subtitle": string, "confidence": number (85-99), "items": string[], "colors": string[], "tags": string[], "tip": string, "accessories": string[] } }`,
      messages: [{
        role: 'user',
        content: `Create one perfect K-pop concert outfit for:
Group: ${group || 'any K-pop group'}
Era/Album: ${era || 'latest'}
Bias: ${bias || 'all members'}
Vibe: ${vibe || 'any'}
Season: ${season || 'spring'}
Venue: ${venue || 'arena'}
Comfort level: ${comfort || 'balanced'}

Return the single JSON object described in your instructions.`,
      }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);
    res.json(data); // { outfit: { ... } }
  } catch (err) {
    console.error('[AI Outfit] Error:', err.message);
    res.json({ outfit: MOCK_OUTFIT });
  }
});


// ── AI: CHANT HELPER ──────────────────────────────────────────────────────────
// SAFETY RULE: NEVER call Anthropic (or any model) to generate chant text.
// AI cannot reliably produce accurate fanchants — a wrong chant embarrasses fans
// at a live show. This route is 100% deterministic: it only ever returns chant
// lines that exist in VERIFIED_CHANT_LIBRARY below, or text the user pasted
// themselves. Everything else gets safe, resource-only guidance.
//
// optionalAuth (not requireAuth): this is a free, local-only lookup with zero
// AI cost, so it should work for guests browsing Tools & Culture too.

// Groups the lookup can recognize, with a short list of REAL released song
// titles (not chant text) used only for "which song do you mean?" suggestions.
const GROUP_LIBRARY = {
  'stray kids': { display: 'Stray Kids', aliases: ['stray kids', 'skz'],   popularSongs: ['Rock', "God's Menu", 'S-Class', 'Thunderous'] },
  'bts':        { display: 'BTS',        aliases: ['bts', 'bangtan'],      popularSongs: ['Dynamite', 'Butter', 'Permission to Dance', 'Boy With Luv'] },
  'aespa':      { display: 'aespa',      aliases: ['aespa'],               popularSongs: ['Drama', 'Next Level', 'Savage', 'Spicy'] },
  'newjeans':   { display: 'NewJeans',   aliases: ['newjeans'],            popularSongs: ['Ditto', 'Hype Boy', 'OMG', 'Super Shy'] },
  'ateez':      { display: 'ATEEZ',      aliases: ['ateez'],               popularSongs: ['Bouncy', 'Wonderland', 'Halazia'] },
};

// The ONLY chant text this route will ever return. Mirrors the existing
// MOCK_CHANTS entries in src/App.jsx line-for-line — do not let these two
// drift apart; if you add/edit one, update the other.
const VERIFIED_CHANT_LIBRARY = [
  {
    localId: 1, groupKey: 'stray kids', song: 'Rock', songAliases: ['rock'],
    lines: [
      { id: 'l1', text: 'ROCK!' }, { id: 'l2', text: 'Lee Know!' }, { id: 'l3', text: 'Minho!' },
      { id: 'l4', text: 'ROCK!' }, { id: 'l5', text: 'Changbin!' }, { id: 'l6', text: 'Hyunjin!' },
      { id: 'l7', text: 'ROCK!' }, { id: 'l8', text: 'Han!' }, { id: 'l9', text: 'Seungmin!' }, { id: 'l10', text: 'I.N!' },
    ],
    practiceTips: ['Member call-outs land right after each "ROCK!" — listen for the cue before each name.'],
  },
  {
    localId: 2, groupKey: 'newjeans', song: 'Ditto', songAliases: ['ditto'],
    lines: [
      { id: 'l1', text: 'Ditto!' }, { id: 'l2', text: 'Minji!' }, { id: 'l3', text: 'Hanni!' },
      { id: 'l4', text: 'Ditto!' }, { id: 'l5', text: 'Danielle!' }, { id: 'l6', text: 'Haerin!' }, { id: 'l7', text: 'Hyein!' },
    ],
    practiceTips: ['"Ditto!" repeats between each name call-out — easy to pick up after one listen.'],
  },
  {
    localId: 3, groupKey: 'aespa', song: 'Drama', songAliases: ['drama'],
    lines: [
      { id: 'l1', text: 'Drama!' }, { id: 'l2', text: 'Karina!' }, { id: 'l3', text: 'Giselle!' },
      { id: 'l4', text: 'Drama!' }, { id: 'l5', text: 'Winter!' }, { id: 'l6', text: 'Ningning!' },
    ],
    practiceTips: ['"Drama!" call-outs land right before each member\'s name.'],
  },
  {
    localId: 4, groupKey: 'bts', song: 'Dynamite', songAliases: ['dynamite'],
    lines: [
      { id: 'l1', text: 'BTS!' }, { id: 'l2', text: 'Jin!' }, { id: 'l3', text: 'Suga!' }, { id: 'l4', text: 'BTS!' },
      { id: 'l5', text: 'J-Hope!' }, { id: 'l6', text: 'RM!' }, { id: 'l7', text: 'Jimin!' }, { id: 'l8', text: 'V!' }, { id: 'l9', text: 'Jungkook!' },
    ],
    practiceTips: ['Full member roll call — pace yourself, this one moves fast live.'],
  },
];

function normalizeChantQuery(q) {
  return (q || '').toLowerCase().trim().replace(/[^\w\s&']/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCaseChant(s) {
  return s.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function detectChantGroup(normalized) {
  for (const [key, g] of Object.entries(GROUP_LIBRARY)) {
    for (const alias of g.aliases) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(normalized)) return key;
    }
  }
  return null;
}

function stripChantGroupTokens(normalized, groupKey) {
  if (!groupKey) return normalized;
  let out = normalized;
  for (const alias of GROUP_LIBRARY[groupKey].aliases) {
    out = out.replace(new RegExp(`\\b${alias}\\b`, 'gi'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

app.post('/api/ai/chant-helper', aiLimiter, optionalAuth, (req, res) => {
  const { query, group: groupInput, song: songInput } = req.body || {};
  const rawQuery = (query || `${groupInput || ''} ${songInput || ''}`).trim();
  const normalized = normalizeChantQuery(rawQuery);

  if (!normalized) {
    return res.json({
      ok: true, verified: false, status: 'error', group: null, song: null,
      title: 'Enter a chant to search',
      message: 'Type a group and song — like "BTS Dynamite" or "Stray Kids Rock".',
    });
  }

  const groupKey = detectChantGroup(normalized) || (groupInput ? detectChantGroup(normalizeChantQuery(groupInput)) : null);
  const remainder = stripChantGroupTokens(normalized, groupKey);
  const groupMeta = groupKey ? GROUP_LIBRARY[groupKey] : null;
  const searchText = remainder || normalized;

  let match = VERIFIED_CHANT_LIBRARY.find(c => {
    if (groupKey && c.groupKey !== groupKey) return false;
    return c.songAliases.some(alias => searchText.includes(alias));
  });
  if (!match && !groupKey) {
    match = VERIFIED_CHANT_LIBRARY.find(c => c.songAliases.some(alias => normalized.includes(alias)));
  }

  // 1. Found in the verified library — the only path that returns chant lines.
  if (match) {
    const g = GROUP_LIBRARY[match.groupKey];
    return res.json({
      ok: true, verified: true, status: 'found',
      group: g.display, song: match.song, title: `${match.song} (${g.display})`,
      message: 'Verified practice mode ready. No guessing — this chant comes from the Backstage verified library.',
      chant: {
        sourceType: 'local_verified', localId: match.localId,
        lines: match.lines, practiceTips: match.practiceTips, searchSuggestions: [],
      },
    });
  }

  // 2. Group recognized, no song given — ask for a song instead of failing.
  if (groupKey && !remainder) {
    const suggestions = groupMeta.popularSongs.map(s => `${groupMeta.display} ${s}`);
    return res.json({
      ok: true, verified: false, status: 'needs_song',
      group: groupMeta.display, song: null, title: `Which ${groupMeta.display} song?`,
      message: `Which ${groupMeta.display} song do you want to practice? Try: ${suggestions.join(', ')}.`,
      chant: {
        sourceType: 'unverified_reference_only', lines: [],
        practiceTips: ['Add a song title so we can check the verified chant library.'],
        searchSuggestions: suggestions,
      },
    });
  }

  // 3. Recognized enough to search, but not in the verified library.
  const displayGroup = groupMeta ? groupMeta.display : (groupInput ? titleCaseChant(normalizeChantQuery(groupInput)) : null);
  const displaySong = remainder ? titleCaseChant(remainder) : (songInput ? titleCaseChant(normalizeChantQuery(songInput)) : null);
  return res.json({
    ok: true, verified: false, status: 'not_found',
    group: displayGroup, song: displaySong,
    title: displaySong ? `${displaySong}${displayGroup ? ` (${displayGroup})` : ''}` : 'No verified chant yet',
    message: "We don't have a verified chant for this song yet. Backstage won't guess chant lines, but you can paste an official chant guide below and practice it here.",
    chant: {
      sourceType: 'unverified_reference_only', lines: [],
      practiceTips: [
        'Search YouTube for "[song name] fanchant guide"',
        "Check the group's official fan wiki or fan cafe",
        'Look for trusted fansite chant PDFs',
      ],
      searchSuggestions: [
        displaySong ? `${displaySong} fanchant guide` : `${rawQuery} fanchant guide`,
        displayGroup ? `${displayGroup} fanchant wiki` : 'K-pop fanchant wiki',
      ],
    },
  });
});


// ── AI: TRIP PLANNER ──────────────────────────────────────────────────────────
// Called from frontend TripPlanner component — NOT direct from browser to Anthropic
app.post('/api/ai/trip-planner', aiLimiter, requireAuth, async (req, res) => {
  const { city, concertTime, concertDate, duration, groupSize, budget, interests, group } = req.body;

  const MOCK_ITINERARY = [
    { time: '8:30 AM',  emoji: '☕', activity: 'Morning fuel',               place: 'Café near venue',             category: 'food',    tip: 'Grab a big breakfast — it will be a long day' },
    { time: '11:00 AM', emoji: '🥩', activity: 'KBBQ pre-show lunch',        place: 'Korean BBQ spot nearby',      category: 'food',    tip: 'Make a reservation — it fills up fast on show days' },
    { time: '1:30 PM',  emoji: '🛍️', activity: 'Merch & lightstick run',     place: 'Venue merch area',            category: 'concert', tip: 'Arrive at merch at least 2hrs early' },
    { time: '3:00 PM',  emoji: '🎁', activity: 'Freebie exchange meetup',    place: 'Fan meetup point (Fanverse)', category: 'social',  tip: 'Check Fanverse for the exact spot' },
    { time: '5:00 PM',  emoji: '🚪', activity: 'Queue at venue gates',       place: 'Main entrance',               category: 'concert', tip: 'Have your ticket QR saved offline' },
    { time: concertTime || '7:30 PM', emoji: '🎤', activity: '✦ SHOWTIME',  place: 'Main venue floor',            category: 'concert', tip: 'Lightstick charged? Phone charged? Chants ready?' },
    { time: '11:30 PM', emoji: '🌙', activity: 'After-show dessert run',     place: 'Late-night café nearby',      category: 'food',    tip: 'Check Backstage for after-party listings' },
  ];

  if (!HAS_AI) return res.json({ day: MOCK_ITINERARY, mock: true });

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `You are a K-pop concert trip planning expert. You know fan culture deeply — freebie exchanges, merch strategy, Koreatown dining, fan meetups, and the emotional rhythm of concert weekends.
Return ONLY valid JSON. No markdown, no fences.
Output: { "day": [{ "time": string, "emoji": string, "activity": string, "place": string, "category": string, "tip": string }] }`,
      messages: [{
        role: 'user',
        content: `Build a full concert day itinerary for a K-pop fan.
City: ${city || 'Dallas'}
Concert time: ${concertTime || '7:30 PM'}
Concert date: ${concertDate || 'upcoming'}
Duration: ${duration || '1 day'}
Group size: ${groupSize || 'solo'}
Budget: ${budget || 'moderate'}
Interests: ${interests || 'food, shopping, fan meetups'}
Artist: ${group || 'K-pop'}

Return 6-8 time-ordered activities including: morning, merch, fan meetup, gates, showtime, after.`,
      }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);
    res.json(data); // { day: [...] }
  } catch (err) {
    console.error('[AI Trip] Error:', err.message);
    res.json({ day: MOCK_ITINERARY, mock: true });
  }
});


// ── AI: FAN DAY BUILDER ───────────────────────────────────────────────────────
// NEW in V16 — powers BuildMyFanDayPanel
app.post('/api/ai/fan-day', aiLimiter, requireAuth, async (req, res) => {
  const { city, concertDate, hotelArea, budget, breakfast, kpopStops, attractions, lunch, mustVisit, concertVenue } = req.body;

  const MOCK_FANDAY = [
    { time: '9:00 AM',  icon: '🍳', title: `Breakfast — ${breakfast || 'Hotel café'}` },
    { time: '10:30 AM', icon: '🛍️', title: `K-pop stop — ${kpopStops || 'Korean district'}` },
    { time: '12:00 PM', icon: '🏙️', title: `Sightseeing — ${attractions || 'City center'}` },
    { time: '1:30 PM',  icon: '🍱', title: `Lunch — ${lunch || 'Korean BBQ'}` },
    { time: '3:00 PM',  icon: '📍', title: `Must-visit — ${mustVisit || 'Venue area'}` },
    { time: '5:00 PM',  icon: '🎪', title: 'Venue merch + freebie exchange' },
    { time: '7:30 PM',  icon: '🎤', title: `Concert at ${concertVenue || 'main venue'}` },
  ];

  if (!HAS_AI) return res.json({ itinerary: MOCK_FANDAY, mock: true });

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 900,
      system: `You are a K-pop fan day planner. Build personalized, fan-authentic day plans. Return ONLY valid JSON: { "itinerary": [{ "time": string, "icon": string, "title": string }] }`,
      messages: [{
        role: 'user',
        content: `Build a full fan day plan for ${city || 'unknown city'} on ${concertDate || 'concert day'}.
Hotel area: ${hotelArea || 'Downtown'}
Budget: ${budget || 'moderate'}
Breakfast spot: ${breakfast || 'not specified'}
K-pop stops: ${kpopStops || 'any Korean district'}
Attractions: ${attractions || 'city highlights'}
Lunch: ${lunch || 'Korean food'}
Must-visit: ${mustVisit || 'venue area'}
Concert venue: ${concertVenue || 'main venue'}
Include: morning, K-pop shopping, sightseeing, lunch, pre-show, showtime.`,
      }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch (err) {
    console.error('[AI Fan Day] Error:', err.message);
    res.json({ itinerary: MOCK_FANDAY, mock: true });
  }
});


// ── AI: GENERAL ASSISTANT ─────────────────────────────────────────────────────
const ASK_BACKSTAGE_FREE_DAILY_LIMIT = Math.max(1, parseInt(process.env.ASK_BACKSTAGE_FREE_DAILY_LIMIT) || 5);

async function getAskBackstageAccess(userId) {
  if (MOCK_MODE) return { isVip: false, used: 0, limit: ASK_BACKSTAGE_FREE_DAILY_LIMIT, remaining: ASK_BACKSTAGE_FREE_DAILY_LIMIT };
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: profile, error: profileError }, { data: usage, error: usageError }] = await Promise.all([
    supabase.from('users').select('is_vip, vip_source, vip_expires_at').eq('id', userId).single(),
    supabase.from('ask_backstage_usage').select('request_count').eq('user_id', userId).eq('usage_date', today).maybeSingle(),
  ]);
  if (profileError) throw profileError;
  // A missing-table error means the production migration has not been applied.
  // Fail closed for free users so a deployment mistake cannot create unlimited AI spend.
  if (usageError) throw usageError;
  const isVip = computeVipStatus(profile).active;
  const used = Math.max(0, usage?.request_count || 0);
  return { isVip, used, limit: isVip ? null : ASK_BACKSTAGE_FREE_DAILY_LIMIT, remaining: isVip ? null : Math.max(0, ASK_BACKSTAGE_FREE_DAILY_LIMIT - used), today };
}

async function recordAskBackstageUsage(userId, access) {
  if (MOCK_MODE || access.isVip) return access;
  const nextCount = access.used + 1;
  const { error } = await supabase.from('ask_backstage_usage').upsert({
    user_id: userId,
    usage_date: access.today,
    request_count: nextCount,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,usage_date' });
  if (error) throw error;
  return { ...access, used: nextCount, remaining: Math.max(0, ASK_BACKSTAGE_FREE_DAILY_LIMIT - nextCount) };
}

app.get('/api/ai/assistant/status', requireAuth, async (req, res) => {
  try {
    const access = await getAskBackstageAccess(req.userId);
    res.json({ is_vip: access.isVip, used: access.used, limit: access.limit, remaining: access.remaining });
  } catch (err) {
    console.error('[Ask Backstage Status] Error:', err.message);
    res.status(503).json({ error: 'Ask Backstage access is temporarily unavailable.' });
  }
});

app.post('/api/ai/assistant', aiLimiter, requireAuth, async (req, res) => {
  const { message, context = {}, history = [] } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Please enter a question.' });
  }
  if (message.trim().length > 2000) {
    return res.status(400).json({ error: 'Please keep your question under 2,000 characters.' });
  }

  if (!HAS_AI) {
    return res.status(503).json({ error: 'Ask Backstage is not configured yet.' });
  }

  try {
    const access = await getAskBackstageAccess(req.userId);
    if (!access.isVip && access.remaining <= 0) {
      return res.status(429).json({
        error: 'daily_limit_reached',
        message: `You have used today's ${ASK_BACKSTAGE_FREE_DAILY_LIMIT} free questions. Your questions reset tomorrow.`,
        used: access.used, limit: access.limit, remaining: 0,
      });
    }

    const safeHistory = Array.isArray(history) ? history.slice(-10)
      .filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string')
      .map(item => ({ role: item.role, content: item.text.slice(0, 2000) })) : [];
    const safeContext = {
      fandoms: Array.isArray(context.fandoms) ? context.fandoms.slice(0, 12).map(v => String(v).slice(0, 80)) : [],
      bias: typeof context.bias === 'string' ? context.bias.slice(0, 80) : '',
      city: typeof context.city === 'string' ? context.city.slice(0, 100) : '',
      upcomingShow: context.upcomingShow && typeof context.upcomingShow === 'object' ? {
        artist: String(context.upcomingShow.artist || context.upcomingShow.name || '').slice(0, 100),
        date: String(context.upcomingShow.date || '').slice(0, 40),
        city: String(context.upcomingShow.city || '').slice(0, 100),
      } : null,
    };
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 900,
      system: `You are Ask Backstage, the practical in-app fandom and concert assistant for Backstage × Fanverse.
Help with concert-day planning, packing, venue preparation, accessibility, solo-concert safety, travel planning, fan meetups, outfits, verified fanchant resources, photocards, trading, collections, scrapbooks, and using Backstage.

Rules:
- Answer the user's actual question directly. Never fall back to a generic checklist unless it is relevant.
- Use supplied context only to personalize. Never claim to know information that is not present.
- Never invent venue rules, dates, prices, ticket policies, transit details, official fanchants, or real-time facts. Clearly identify anything the fan must verify with an official artist, venue, ticketing, or transit source.
- Never reveal private account data or infer a precise location.
- Be warm, capable, and fan-aware without excessive emoji.
- Use short paragraphs or bullets when they improve readability.
- When an existing Backstage tool is useful, end with one tag on its own line: [[ACTION:route|Button label]]. Allowed routes: concertday, fanmap, tools, concertprep, scrapbook, collect, trip, outfits. Otherwise omit the tag.

User context: ${JSON.stringify(safeContext)}`,
      messages: [...safeHistory, { role: 'user', content: message.trim() }],
    });
    const reply = response.content?.find(block => block.type === 'text')?.text?.trim();
    if (!reply) throw new Error('AI provider returned an empty response');
    const updatedAccess = await recordAskBackstageUsage(req.userId, access);
    res.json({
      reply,
      usage: { is_vip: updatedAccess.isVip, used: updatedAccess.used, limit: updatedAccess.limit, remaining: updatedAccess.remaining },
    });
  } catch (err) {
    console.error('[AI Assistant] Error:', err.message);
    res.status(503).json({ error: 'Ask Backstage is temporarily unavailable. Please try again.' });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS / VIP — /api/subscriptions/*
// V16: These routes now exist. Frontend was calling them but they were missing.
// ═════════════════════════════════════════════════════════════════════════════

// GET VIP status for current user
// Response includes vip_source and vip_expires_at when present so the
// frontend isVipActive() helper can handle both paid and comped VIP.
function computeVipStatus(data = {}) {
  const source = data?.vip_source || null;
  const sourceActive = source === 'founder' || source === 'stripe' ||
    (source === 'comped' && (!data?.vip_expires_at || new Date(data.vip_expires_at) > new Date()));
  const active = data?.is_vip === true || sourceActive;
  return {
    active,
    plan: active ? (source === 'founder' ? 'founder' : 'vip') : null,
    status: active ? 'active' : 'free',
  };
}
//
// ── COMP VIP PLAN ────────────────────────────────────────────────────────────
// To support admin-granted free VIP (founders, testers, family, influencers)
// without going through Stripe, add these columns to the Supabase users table:
//
//   vip_source      text    -- 'stripe' | 'comped' | null
//   vip_expires_at  timestamptz -- null = permanent; ISO date = time-limited
//
// Migration (run in Supabase SQL editor):
//   ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_source text;
//   ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_expires_at timestamptz;
//
// Admin grant (run directly in Supabase or via a future /admin/comp-vip route
// protected by service-role key — NEVER expose this as a public endpoint):
//   UPDATE users SET vip_source='comped', vip_expires_at=null    -- permanent
//   UPDATE users SET vip_source='comped', vip_expires_at='2026-12-31' -- 1 year
//   WHERE id = '<user-id>';
//
// Use cases: Founder/Internal → null (permanent); Beta Tester → +6 months;
// Friend & Family → +1 year; Influencer/Promo → campaign end date.
//
// Stripe promo codes vs Comp VIP:
//   Promo codes = public discounts, still require payment info, generate revenue.
//   Comp VIP    = no checkout, no payment info, better for internal/trusted users.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/subscriptions/status', optionalAuth, async (req, res) => {
  // Missing or invalid auth is not proof that a paid account was revoked.
  if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
  if (MOCK_MODE)   return res.json({ is_vip: false, plan: null, status: 'free', mock: true });
  try {
    const db = req.userToken ? makeUserClient(req) : supabase;
    const { data, error } = await db
      .from('users')
      .select('is_vip, vip_since, vip_source, vip_expires_at, stripe_customer_id, founder_number')
      .eq('id', req.userId)
      .single();
    if (error) throw error;
    const vip = computeVipStatus(data);
    res.json({
      is_vip:         vip.active,
      vip_active:     vip.active,
      plan:           vip.plan,
      status:         vip.status,
      vip_since:      data?.vip_since,
      vip_source:     data?.vip_source || null,
      vip_expires_at: data?.vip_expires_at || null,
      stripe_customer_id: data?.stripe_customer_id || null,
      founder_number: data?.founder_number || null,
    });
  } catch (err) {
    console.error('[Subscription Status] Error:', err.message);
    res.status(503).json({ error: 'Subscription status temporarily unavailable' });
  }
});

// ─── VIP RECONCILIATION ───────────────────────────────────────────────────────
// Catches the "paid before signup" edge case: webhook fires, 0 rows in DB,
// user creates account later. On next login this endpoint searches Stripe for
// a completed Founder Pass / subscription for their email and activates VIP.
//
// Called by the frontend after every boot if is_vip === false.
// Throttled on the client (once per hour per user) so Stripe API calls are minimal.
app.post('/api/subscriptions/reconcile', requireAuth, async (req, res) => {
  if (!HAS_STRIPE || !supabase) return res.json({ reconciled: false });

  const userEmail = req.userEmail;
  const userId    = req.userId;
  if (!userEmail) return res.json({ reconciled: false, reason: 'no_email' });

  try {
    // 1. Check if already VIP — nothing to do
    const { data: existing } = await supabase
      .from('users').select('is_vip, vip_source').eq('id', userId).single();
    if (existing?.is_vip) {
      return res.json({ reconciled: false, already_vip: true, vip_source: existing.vip_source });
    }

    // 2. Search Stripe checkout sessions completed for this email
    let sessions = [];
    try {
      const result = await stripe.checkout.sessions.list({
        customer_email: userEmail,
        limit: 10,
      });
      sessions = result.data || [];
    } catch (stripeErr) {
      console.error('[Reconcile] Stripe list error:', stripeErr.message);
      return res.json({ reconciled: false, reason: 'stripe_error' });
    }

    // Find a successfully paid session for any VIP plan
    const paid = sessions.find(s =>
      s.payment_status === 'paid' &&
      (s.metadata?.plan === 'founder' ||
       s.metadata?.plan === 'monthly' ||
       s.metadata?.plan === 'annual'  ||
       s.metadata?.product === 'founder_pass')
    );

    if (!paid) {
      console.log(`[Reconcile] No completed payment found for ${userEmail}`);
      return res.json({ reconciled: false, reason: 'no_payment_found' });
    }

    const isFounder = paid.metadata?.plan === 'founder' || paid.metadata?.product === 'founder_pass';
    const vipPayload = {
      is_vip:             true,
      vip_since:          new Date(paid.created * 1000).toISOString(),
      vip_source:         isFounder ? 'founder' : 'stripe',
      stripe_customer_id: paid.customer || null,
    };

    const { data: updated, error: updateErr } = await supabase
      .from('users').update(vipPayload).eq('id', userId).select('id');

    if (updateErr || !updated?.length) {
      console.error(`[Reconcile] DB update failed for ${userId}:`, updateErr?.message);
      return res.status(500).json({ reconciled: false, reason: 'db_error' });
    }

    // Founder Pass only: assign the next sequential founder_number.
    // Never runs for monthly/annual reconciliation — only isFounder.
    let founderNumber = null;
    if (isFounder) {
      try {
        const { data: assignedNumber, error: founderErr } = await supabase
          .rpc('assign_next_founder_number', { target_user_id: userId });
        if (founderErr) {
          console.error(`[Reconcile] Founder number assignment failed: userId=${userId} error=${founderErr.message}`);
        } else {
          founderNumber = assignedNumber;
          console.log(`[Reconcile] Founder number assigned: userId=${userId} founder_number=${founderNumber} plan=founder`);
        }
      } catch (err) {
        console.error(`[Reconcile] Founder number assignment exception: userId=${userId} error=${err.message}`);
      }
    }

    console.log(`[Reconcile] ✓ VIP activated for ${userId} (${userEmail}) via Stripe reconciliation. plan=${paid.metadata?.plan} session=${paid.id}`);
    res.json({ reconciled: true, vip_source: vipPayload.vip_source, vip_since: vipPayload.vip_since, founder_number: founderNumber });

  } catch (err) {
    console.error('[Reconcile] Unexpected error:', err.message);
    res.json({ reconciled: false, reason: 'error' });
  }
});

// Mock-activate VIP (dev/demo mode)
app.post('/api/subscriptions/mock-activate', requireAuth, async (req, res) => {
  if (!MOCK_MODE && !process.env.ALLOW_MOCK_ACTIVATE) {
    return res.status(403).json({ error: 'Mock activation disabled in production' });
  }
  if (supabase && req.userId !== 'mock_user_1') {
    await supabase.from('users').update({
      is_vip: true,
      vip_since: new Date().toISOString(),
    }).eq('id', req.userId);
  }
  res.json({ is_vip: true, activated: true, mock: true });
});

// Real Stripe checkout — used by frontend handleUpgrade
const FOUNDER_PASS_CAP = 500;

async function countCompletedFounderPasses() {
  let total = 0;
  let page;
  do {
    const result = await stripe.paymentIntents.search({
      query: "metadata['product']:'founder_pass' AND status:'succeeded'",
      limit: 100,
      ...(page ? { page } : {}),
    });
    total += result.data.length;
    if (total >= FOUNDER_PASS_CAP) return total;
    page = result.has_more ? result.next_page : null;
  } while (page);
  return total;
}

app.post('/api/subscriptions/checkout', optionalAuth, async (req, res) => {
  const { plan, priceId, successUrl, cancelUrl, email, userId } = req.body;

  if (!HAS_STRIPE) {
    return res.json({
      mock: true,
      url: null,
      message: 'Stripe not configured. Add STRIPE_SECRET_KEY to enable payments.',
    });
  }

  const PRICE_MAP = {
    monthly:  process.env.STRIPE_PRICE_MONTHLY  || priceId,
    annual:   process.env.STRIPE_PRICE_ANNUAL   || priceId,
    founder:  process.env.STRIPE_PRICE_FOUNDER  || priceId,
  };

  // Guard: price ID must resolve before calling Stripe
  const resolvedPrice = PRICE_MAP[plan] || priceId;
  if (!resolvedPrice) {
    const missing = `STRIPE_PRICE_${(plan||'').toUpperCase()}`;
    console.error(`[Subscriptions Checkout] Missing price ID for plan="${plan}". Set ${missing} in env.`);
    return res.status(500).json({
      error: 'checkout_config',
      detail: `No price ID configured for plan "${plan}". Add ${missing} to Render env vars.`,
    });
  }

  // Guard: already-VIP users should not open another checkout session
  if (req.userId && supabase) {
    try {
      const { data: existing } = await supabase
        .from('users').select('is_vip').eq('id', req.userId).single();
      if (existing?.is_vip) {
        return res.status(409).json({ error: 'already_vip', message: 'You already have an active VIP subscription.' });
      }
    } catch { /* non-fatal — proceed to checkout if check fails */ }
  }

  // Resolve the best available userId and email from JWT > request body > empty
  const resolvedUserId = req.userId    || userId || '';
  const resolvedEmail  = req.userEmail || email  || '';

  const metadata = {
    userId: String(resolvedUserId),
    email:  String(resolvedEmail),
    plan,
    ...(plan === 'founder' ? { product: 'founder_pass', founder_cap: String(FOUNDER_PASS_CAP) } : {}),
  };

  // ── Upsert public.users BEFORE creating the Stripe session ────────────────
  // This ensures the webhook can always find the user by userId even if the
  // user is mid-onboarding (auth account exists but profile row was never
  // written by the onboarding trigger). Without this, the webhook fires after
  // payment, looks up the userId, finds 0 rows, and VIP is never activated.
  if (resolvedUserId && resolvedEmail && supabase) {
    try {
      await supabase.from('users').upsert(
        { id: resolvedUserId, email: resolvedEmail },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    } catch (upsertErr) {
      // Non-fatal — log and continue. The reconcile endpoint covers the fallback.
      console.warn('[Checkout] Pre-session user upsert failed (non-fatal):', upsertErr.message);
    }
  }

  try {
    if (plan === 'founder') {
      let founderCount;
      try {
        founderCount = await countCompletedFounderPasses();
      } catch (countErr) {
        console.error('[Founder Pass Count] Error:', countErr.message);
        return res.status(503).json({ error: 'Founder Pass count unavailable', founderCountUnavailable: true });
      }
      if (founderCount >= FOUNDER_PASS_CAP) {
        return res.status(409).json({ error: 'Founder Pass sold out', soldOut: true });
      }
    }
    const sessionConfig = {
      mode:       plan === 'founder' ? 'payment' : 'subscription',
      line_items: [{ price: resolvedPrice, quantity: 1 }],
      success_url: successUrl || `${process.env.FRONTEND_URL}?payment=success&plan=${plan}`,
      cancel_url:  cancelUrl  || `${process.env.FRONTEND_URL}?payment=cancelled`,
      metadata,
      // Pass customer_email explicitly so session.customer_email is always set
      // in the webhook — even if the user pays via Apple Pay / saved card
      // without re-entering their email at the Stripe form.
      ...(resolvedEmail ? { customer_email: resolvedEmail } : {}),
    };
    if (plan === 'founder') sessionConfig.payment_intent_data = { metadata };
    else sessionConfig.subscription_data = { metadata };
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });
  } catch (err) {
    // Stripe SDK errors are safe to surface — they contain no secrets,
    // only Stripe error codes and descriptions.
    console.error('[Subscriptions Checkout] Stripe error:', err.message);
    res.status(500).json({
      error: 'stripe_error',
      detail: err.message,
    });
  }
});

// Legacy alias — kept so any old bookmarks or pre-update builds still work.
// Contains the same two hardening fixes as the primary route:
//   1. Upsert public.users before creating the session
//   2. Pass customer_email explicitly to Stripe
app.post('/api/stripe/checkout', optionalAuth, async (req, res) => {
  const { plan, priceId, successUrl, cancelUrl, email, userId } = req.body;
  if (!HAS_STRIPE) return res.json({ mock: true, url: null, message: 'Stripe not configured.' });

  const PRICE_MAP = {
    monthly: process.env.STRIPE_PRICE_MONTHLY || priceId,
    annual:  process.env.STRIPE_PRICE_ANNUAL  || priceId,
    founder: process.env.STRIPE_PRICE_FOUNDER || priceId,
  };
  const resolvedUserId = req.userId    || userId || '';
  const resolvedEmail  = req.userEmail || email  || '';
  const resolvedPrice  = PRICE_MAP[plan] || priceId;
  if (!resolvedPrice) return res.status(500).json({ error: 'No price ID for plan', plan });

  const metadata = {
    userId: String(resolvedUserId),
    email:  String(resolvedEmail),
    plan,
    ...(plan === 'founder' ? { product: 'founder_pass', founder_cap: String(FOUNDER_PASS_CAP) } : {}),
  };

  // Upsert profile row so webhook can always find the user
  if (resolvedUserId && resolvedEmail && supabase) {
    try {
      await supabase.from('users').upsert(
        { id: resolvedUserId, email: resolvedEmail },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    } catch (e) { console.warn('[Legacy Checkout] User upsert non-fatal:', e.message); }
  }

  try {
    if (plan === 'founder') {
      const count = await countCompletedFounderPasses().catch(() => 0);
      if (count >= FOUNDER_PASS_CAP) return res.status(409).json({ error: 'Founder Pass sold out', soldOut: true });
    }
    const sessionConfig = {
      mode:       plan === 'founder' ? 'payment' : 'subscription',
      line_items: [{ price: resolvedPrice, quantity: 1 }],
      success_url: successUrl || `${process.env.FRONTEND_URL}?payment=success&plan=${plan}`,
      cancel_url:  cancelUrl  || `${process.env.FRONTEND_URL}?payment=cancelled`,
      metadata,
      ...(resolvedEmail ? { customer_email: resolvedEmail } : {}),
    };
    if (plan === 'founder') sessionConfig.payment_intent_data = { metadata };
    else sessionConfig.subscription_data = { metadata };
    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'stripe_error', detail: err.message });
  }
});

// Stripe webhook
app.post('/api/webhooks/stripe', async (req, res) => {
  if (!HAS_STRIPE) return res.status(200).json({ received: true });

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('[Stripe Webhook] Verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId, plan } = session.metadata || {};
      const eventId = event.id;
      console.log(`[Stripe Webhook] checkout.session.completed: event=${eventId} userId=${userId||'(none)'} email=${session.customer_email||'(none)'} customer=${session.customer||'(none)'} plan=${plan||'(none)'}`);

      if (!supabase) {
        console.error(`[Stripe Webhook] Supabase not initialized — cannot activate VIP. event=${eventId}`);
        break;
      }

      // Distinguish Founder Pass (one-time payment) from monthly/annual subscriptions
      // so the frontend can render the Founder badge and era-specific UI.
      const vipPayload = {
        is_vip:             true,
        vip_since:          new Date().toISOString(),
        vip_source:         plan === 'founder' ? 'founder' : 'stripe',
        stripe_customer_id: session.customer || null,
      };

      let activated = false;
      let activatedUserId = null;

      // Primary path: update by userId from checkout metadata
      if (userId) {
        try {
          const { data, error } = await supabase
            .from('users').update(vipPayload).eq('id', userId).select('id');
          if (error) {
            console.error(`[Stripe Webhook] VIP update by userId failed: event=${eventId} userId=${userId} error=${error.message}`);
          } else if (data?.length) {
            console.log(`[Stripe] VIP activated: userId=${userId} plan=${plan} event=${eventId}`);
            activated = true;
            activatedUserId = data[0].id;
          } else {
            console.warn(`[Stripe Webhook] VIP update by userId: 0 rows affected. event=${eventId} userId=${userId}`);
          }
        } catch (err) {
          console.error(`[Stripe Webhook] VIP update exception: event=${eventId} userId=${userId} error=${err.message}`);
        }
      }

      // Email fallback: if userId was missing or matched 0 rows
      if (!activated && session.customer_email) {
        try {
          const { data, error } = await supabase
            .from('users').update(vipPayload).eq('email', session.customer_email).select('id');
          if (error) {
            console.error(`[Stripe Webhook] VIP email-fallback failed: event=${eventId} email=${session.customer_email} error=${error.message}`);
          } else if (data?.length) {
            console.log(`[Stripe] VIP activated via email fallback: email=${session.customer_email} plan=${plan} event=${eventId}`);
            activated = true;
            activatedUserId = data[0].id;
          } else {
            console.warn(`[Stripe Webhook] VIP email-fallback: 0 rows matched. event=${eventId} email=${session.customer_email}`);
          }
        } catch (err) {
          console.error(`[Stripe Webhook] VIP email-fallback exception: event=${eventId} error=${err.message}`);
        }
      }

      // Founder Pass only: assign the next sequential founder_number.
      // Concurrency-safe via DB advisory lock inside assign_next_founder_number.
      // Never runs for monthly/annual/comp — only plan === 'founder'.
      if (activated && activatedUserId && plan === 'founder') {
        try {
          const { data: founderNumber, error: founderErr } = await supabase
            .rpc('assign_next_founder_number', { target_user_id: activatedUserId });
          if (founderErr) {
            console.error(`[Stripe Webhook] Founder number assignment failed: event=${eventId} userId=${activatedUserId} error=${founderErr.message}`);
          } else {
            console.log(`[Stripe Webhook] Founder number assigned: userId=${activatedUserId} founder_number=${founderNumber} plan=founder event=${eventId}`);
          }
        } catch (err) {
          console.error(`[Stripe Webhook] Founder number assignment exception: event=${eventId} userId=${activatedUserId} error=${err.message}`);
        }
      }

      if (!activated) {
        // This happens when the user paid before creating a Backstage account,
        // or used a different email at Stripe vs signup. The reconcile endpoint
        // (/api/subscriptions/reconcile) handles this automatically on next login.
        console.error(
          `[Stripe Webhook] ⚠ VIP NOT activated — user not in DB yet.` +
          ` event=${eventId} userId=${userId||'(none)'} email=${session.customer_email||'(none)'}` +
          ` plan=${plan||'(none)'} customer=${session.customer||'(none)'}` +
          ` ACTION: user must log in; /api/subscriptions/reconcile will auto-activate on next boot.`
        );
      }
      break;
    }
    case 'customer.subscription.deleted': {
      // Subscription cancelled — revoke VIP
      const sub = event.data.object;
      if (supabase && sub.customer) {
        try {
          const { data, error } = await supabase
            .from('users').update({ is_vip: false, vip_source: null })
            .eq('stripe_customer_id', sub.customer).select('id');
          if (error) console.error(`[Stripe Webhook] VIP revoke failed: customer=${sub.customer} error=${error.message}`);
          else if (data?.length) console.log(`[Stripe] VIP revoked: customer=${sub.customer}`);
          else console.warn(`[Stripe Webhook] VIP revoke: 0 rows matched. customer=${sub.customer}`);
        } catch (err) {
          console.error(`[Stripe Webhook] VIP revoke exception: customer=${sub.customer} error=${err.message}`);
        }
      }
      break;
    }
    case 'invoice.paid': {
      // Subscription renewal — keep VIP active and refresh vip_since
      const inv = event.data.object;
      if (supabase && inv.customer) {
        try {
          const { data, error } = await supabase
            .from('users').update({
              is_vip:     true,
              vip_since:  new Date().toISOString(),
              vip_source: 'stripe',
            }).eq('stripe_customer_id', inv.customer).select('id');
          if (error) console.error(`[Stripe Webhook] VIP renewal failed: customer=${inv.customer} error=${error.message}`);
          else if (data?.length) console.log(`[Stripe] VIP renewed via invoice: customer=${inv.customer}`);
          else console.warn(`[Stripe Webhook] VIP renewal: 0 rows matched. customer=${inv.customer}`);
        } catch (err) {
          console.error(`[Stripe Webhook] VIP renewal exception: customer=${inv.customer} error=${err.message}`);
        }
      }
      break;
    }
    case 'invoice.payment_failed': {
      // Renewal payment failed — log only, do not revoke yet
      // Stripe will retry and fire customer.subscription.deleted if all retries fail
      const inv = event.data.object;
      console.warn(`[Stripe] Invoice payment failed: customer=${inv.customer} attempt=${inv.attempt_count}`);
      break;
    }
    default:
      console.log(`[Stripe Webhook] Unhandled: ${event.type}`);
  }
  res.json({ received: true });
});


// ═════════════════════════════════════════════════════════════════════════════
// MUSIC CONNECT — /api/music/*
// NEW in V16. Spotify OAuth + Apple Music + manual Now Playing.
// ═════════════════════════════════════════════════════════════════════════════

// Initiate Spotify OAuth — returns auth URL
app.post('/api/music/connect/spotify', requireAuth, (req, res) => {
  if (!HAS_SPOTIFY) {
    return res.json({
      mock: true,
      connected: false,
      message: 'Spotify integration coming soon. Add SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET to enable.',
      auth_url: null,
    });
  }

  const scopes = [
    'user-read-currently-playing',
    'user-read-recently-played',
    'user-top-read',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    scope:         scopes,
    redirect_uri:  `${BACKEND_URL}/api/music/spotify/callback`,
    state:         req.userId,
  });

  res.json({ auth_url: `https://accounts.spotify.com/authorize?${params}` });
});

// Spotify OAuth callback — swap code for token and save
app.get('/api/music/spotify/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.redirect(`${process.env.FRONTEND_URL}?music=error`);

  if (!HAS_SPOTIFY) return res.redirect(`${process.env.FRONTEND_URL}?music=mock`);

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: `${BACKEND_URL}/api/music/spotify/callback`,
      }),
    });
    const tokens = await tokenRes.json();

    if (supabase) {
      await supabase.from('users').update({
        spotify_access_token:  tokens.access_token,
        spotify_refresh_token: tokens.refresh_token,
        spotify_token_expires: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      }).eq('id', userId);
    }

    res.redirect(`${process.env.FRONTEND_URL}?music=spotify_connected`);
  } catch (err) {
    console.error('[Spotify OAuth] Error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}?music=error`);
  }
});

// Apple Music developer token — cached in memory, regenerated every ~149 days
let _appleDeveloperToken = null;
let _appleDeveloperTokenExpiry = 0;

function getAppleDeveloperToken() {
  if (_appleDeveloperToken && Date.now() < _appleDeveloperTokenExpiry) return _appleDeveloperToken;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY.replace(/\\n/g, '\n');
  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '150d',
    issuer: process.env.APPLE_MUSIC_TEAM_ID,
    keyid: process.env.APPLE_MUSIC_KEY_ID,
  });
  _appleDeveloperToken = token;
  _appleDeveloperTokenExpiry = Date.now() + 149 * 24 * 60 * 60 * 1000;
  return _appleDeveloperToken;
}

// Apple Music — returns MusicKit developer token for frontend MusicKit.configure()
app.post('/api/music/connect/apple', requireAuth, (req, res) => {
  if (!HAS_APPLE_MUSIC) {
    return res.json({
      mock: true,
      connected: false,
      provider: 'apple',
      message: 'Apple Music credentials are not configured yet.',
      developer_token: null,
    });
  }
  try {
    const developer_token = getAppleDeveloperToken();
    res.json({ connected: false, provider: 'apple', developer_token, app: { name: 'Backstage', build: 'v16-apple-music' } });
  } catch (err) {
    console.error('[Apple Music] Token generation failed:', err.message);
    res.status(500).json({ error: 'Failed to generate Apple Music developer token' });
  }
});

// Save Apple Music user token after MusicKit.authorize() on the frontend
app.post('/api/music/apple/save-token', requireAuth, async (req, res) => {
  const { musicUserToken, storefrontId } = req.body || {};
  if (!musicUserToken) return res.status(400).json({ error: 'musicUserToken required' });

  if (!supabase) return res.json({ success: true, mock: true });

  try {
    await supabase.from('users').update({
      apple_music_user_token:    musicUserToken,
      apple_music_storefront:    storefrontId || 'us',
      apple_music_connected_at:  new Date().toISOString(),
      music_provider:            'apple',
    }).eq('id', req.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Apple Music] save-token error:', err.message);
    res.status(500).json({ error: 'Failed to save Apple Music token' });
  }
});

// Mock recently played for Apple fallback
const MOCK_APPLE_RECENT = [
  { id:'am-mock-1', song:'Whiplash',   artist:'aespa',      album:'Whiplash',  albumArt:null, url:null, source:'apple', isrc:null, previewUrl:null },
  { id:'am-mock-2', song:'Dynamite',   artist:'BTS',        album:'Dynamite',  albumArt:null, url:null, source:'apple', isrc:null, previewUrl:null },
  { id:'am-mock-3', song:'Pink Venom', artist:'BLACKPINK',  album:'BORN PINK', albumArt:null, url:null, source:'apple', isrc:null, previewUrl:null },
  { id:'am-mock-4', song:'How Sweet',  artist:'NewJeans',   album:'How Sweet', albumArt:null, url:null, source:'apple', isrc:null, previewUrl:null },
  { id:'am-mock-5', song:'MIROH',      artist:'Stray Kids', album:'Clé 1',     albumArt:null, url:null, source:'apple', isrc:null, previewUrl:null },
];

// Fetch Apple Music recently played tracks for the authenticated user
app.get('/api/music/apple/recent', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ songs: MOCK_APPLE_RECENT, provider: 'apple', mock: true });

  try {
    const { data: user } = await supabase.from('users')
      .select('apple_music_user_token, apple_music_storefront')
      .eq('id', req.userId).single();

    if (!user?.apple_music_user_token || !HAS_APPLE_MUSIC) {
      return res.json({ songs: MOCK_APPLE_RECENT, provider: 'apple', mock: true });
    }

    const devToken    = getAppleDeveloperToken();
    const appleRes    = await fetch('https://api.music.apple.com/v1/me/recent/played/tracks?limit=10', {
      headers: {
        Authorization:     `Bearer ${devToken}`,
        'Music-User-Token': user.apple_music_user_token,
      },
    });

    if (!appleRes.ok) {
      console.warn('[Apple Recent] API returned', appleRes.status);
      return res.json({ songs: MOCK_APPLE_RECENT, provider: 'apple', mock: true });
    }

    const appleData = await appleRes.json();
    const songs = (appleData?.data || []).map(item => ({
      id:         item.id,
      song:       item.attributes?.name,
      artist:     item.attributes?.artistName,
      album:      item.attributes?.albumName,
      albumArt:   item.attributes?.artwork
                    ? item.attributes.artwork.url.replace('{w}', '300').replace('{h}', '300')
                    : null,
      url:        item.attributes?.url || null,
      source:     'apple',
      isrc:       item.attributes?.isrc || null,
      previewUrl: item.attributes?.previews?.[0]?.url || null,
    }));

    res.json({ songs: songs.length ? songs : MOCK_APPLE_RECENT, provider: 'apple', mock: !songs.length });
  } catch (err) {
    console.error('[Apple Recent] Error:', err.message);
    res.json({ songs: MOCK_APPLE_RECENT, provider: 'apple', mock: true });
  }
});

// Save profile song from any source (manual, Spotify, Apple)
app.post('/api/music/profile-song', requireAuth, async (req, res) => {
  const { song, artist, album, albumArt, source, providerTrackId, url } = req.body || {};
  if (!song && !artist) return res.status(400).json({ error: 'song or artist required' });

  const nowPlaying = {
    title:           song || null,
    artist:          artist || null,
    album:           album  || null,
    albumArt:        albumArt || null,
    source:          source || 'manual',
    providerTrackId: providerTrackId || null,
    appleMusicUrl:   source === 'apple'   ? (url || null) : null,
    spotifyUrl:      source === 'spotify' ? (url || null) : null,
    savedAt:         new Date().toISOString(),
  };

  if (!supabase) return res.json({ success: true, nowPlaying, mock: true });

  try {
    await supabase.from('users').update({ now_playing: nowPlaying }).eq('id', req.userId);
    res.json({ success: true, nowPlaying });
  } catch (err) {
    console.error('[Profile Song] Error:', err.message);
    res.status(500).json({ error: 'Failed to save profile song' });
  }
});

// Get current Now Playing (Spotify or manual)
app.get('/api/music/now-playing', requireAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({
      song: 'Whiplash', artist: 'aespa', album: 'Armageddon',
      source: 'manual', is_playing: true, mock: true,
    });
  }

  try {
    if (!supabase) throw new Error('No DB');
    const { data: user } = await supabase.from('users')
      .select('now_playing, spotify_access_token, apple_music_user_token')
      .eq('id', req.userId).single();

    // Spotify live playback takes priority if token exists
    if (user?.spotify_access_token) {
      const npRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${user.spotify_access_token}` },
      });
      if (npRes.status === 200) {
        const np = await npRes.json();
        if (np?.item) {
          return res.json({
            song:       np.item.name,
            artist:     np.item.artists.map(a => a.name).join(', '),
            album:      np.item.album.name,
            albumArt:   np.item.album.images?.[0]?.url,
            source:     'spotify',
            is_playing: np.is_playing,
          });
        }
      }
    }

    // Fallback: return saved now_playing (may be Apple Music or manual)
    if (user?.now_playing) {
      return res.json({ ...user.now_playing, source: user.now_playing.source || 'manual' });
    }
    res.json({ source: 'manual' });
  } catch (err) {
    res.json({ song: 'Whiplash', artist: 'aespa', source: 'manual', mock: true });
  }
});

// ─── MUSIC CATALOG SEARCH ────────────────────────────────────────────────────
// GET /api/music/search?q= — No VIP required. Uses Spotify client credentials
// (not user OAuth) for catalog search. Falls back to Apple Music or mock K-pop.

let _spotifyClientToken = null;
let _spotifyClientTokenExpiry = 0;

async function getSpotifyClientToken() {
  if (_spotifyClientToken && Date.now() < _spotifyClientTokenExpiry) return _spotifyClientToken;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Spotify token error: ${data.error}`);
  _spotifyClientToken = data.access_token;
  _spotifyClientTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _spotifyClientToken;
}

const MOCK_KPOP_CATALOG = [
  { id:'mock-1',  title:'Whiplash',   artist:'aespa',      album:'Whiplash',     albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-2',  title:'Dynamite',   artist:'BTS',        album:'Dynamite',     albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-3',  title:'Supernova',  artist:'aespa',      album:'Armageddon',   albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-4',  title:'How Sweet',  artist:'NewJeans',   album:'How Sweet',    albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-5',  title:'Miroh',      artist:'Stray Kids', album:'CLE 1: MIROH', albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-6',  title:'Pink Venom', artist:'BLACKPINK',  album:'BORN PINK',    albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-7',  title:'Ditto',      artist:'NewJeans',   album:'OMG',          albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-8',  title:'After Like', artist:'IVE',        album:'After Like',   albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-9',  title:'Spicy',      artist:'aespa',      album:'MY WORLD',     albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
  { id:'mock-10', title:'Love Dive',  artist:'IVE',        album:'LOVE DIVE',    albumArt:null, spotifyUrl:null, appleMusicUrl:null, previewUrl:null, source:'mock' },
];

app.get('/api/music/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ results: [], mock: false });

  if (HAS_SPOTIFY) {
    try {
      const token = await getSpotifyClientToken();
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10&market=US`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await searchRes.json();
      const results = (data.tracks?.items || []).map(track => ({
        id:            track.id,
        title:         track.name,
        artist:        track.artists.map(a => a.name).join(', '),
        album:         track.album.name,
        albumArt:      track.album.images?.[0]?.url || null,
        spotifyUrl:    track.external_urls?.spotify || null,
        appleMusicUrl: null,
        previewUrl:    track.preview_url || null,
        source:        'spotify',
      }));
      return res.json({ results, mock: false });
    } catch (err) {
      console.error('[Music Search] Spotify error:', err.message);
    }
  }

  const appleDeveloperToken = process.env.APPLE_MUSIC_DEVELOPER_TOKEN;
  if (appleDeveloperToken) {
    try {
      const searchRes = await fetch(
        `https://api.music.apple.com/v1/catalog/us/search?term=${encodeURIComponent(q)}&types=songs&limit=10`,
        { headers: { Authorization: `Bearer ${appleDeveloperToken}` } }
      );
      const data = await searchRes.json();
      const songs = data.results?.songs?.data || [];
      const results = songs.map(song => ({
        id:            song.id,
        title:         song.attributes.name,
        artist:        song.attributes.artistName,
        album:         song.attributes.albumName,
        albumArt:      song.attributes.artwork
          ? song.attributes.artwork.url.replace('{w}', '300').replace('{h}', '300')
          : null,
        spotifyUrl:    null,
        appleMusicUrl: song.attributes.url || null,
        previewUrl:    song.attributes.previews?.[0]?.url || null,
        source:        'apple',
      }));
      return res.json({ results, mock: false });
    } catch (err) {
      console.error('[Music Search] Apple Music error:', err.message);
    }
  }

  const lower = q.toLowerCase();
  const results = MOCK_KPOP_CATALOG.filter(
    s => s.title.toLowerCase().includes(lower) || s.artist.toLowerCase().includes(lower)
  );
  res.json({ results: results.length ? results : MOCK_KPOP_CATALOG.slice(0, 5), mock: true });
});


// ═════════════════════════════════════════════════════════════════════════════
// GIFS / REACTIONS — /api/gifs/* (provider-agnostic: tenor | giphy | mock)
// Keys never reach the frontend. Normalized shape:
// { id, title, previewUrl, fullUrl, source, mediaType, width?, height? }
// type param: "gif" (default) | "sticker"
// ═════════════════════════════════════════════════════════════════════════════

const GIF_PROVIDER  = (process.env.GIF_PROVIDER || 'mock').toLowerCase();
const TENOR_API_KEY = process.env.TENOR_API_KEY || '';
const GIPHY_API_KEY = process.env.GIPHY_API_KEY || '';

const MOCK_GIF_MOODS = ['excited', 'crying', 'cheering', 'dancing', 'heart', 'lightstick'];
const MOCK_GIF_GRADIENTS = [
  ['#7c4dff', '#f0a8cc'], ['#5b3df6', '#8eefd4'], ['#b8a2ff', '#ff7ab8'],
  ['#3d1060', '#b8a2ff'], ['#f0a8cc', '#7c4dff'], ['#8eefd4', '#5b3df6'],
];

function buildMockGifs(seed = 'vibe', limit = 24, mediaType = 'gif') {
  const out = [];
  for (let i = 0; i < limit; i++) {
    const mood = MOCK_GIF_MOODS[i % MOCK_GIF_MOODS.length];
    const [a, b] = MOCK_GIF_GRADIENTS[i % MOCK_GIF_GRADIENTS.length];
    out.push({
      id:         `mock-${mediaType}-${seed}-${i}`,
      title:      `${mood} ${mediaType === 'sticker' ? 'sticker' : 'concert mood'}`,
      previewUrl: null,
      fullUrl:    null,
      source:     'mock',
      mediaType,
      width:      320,
      height:     320,
      mood,
      gradient:   [a, b],
    });
  }
  return out;
}

function normalizeGiphy(g, q, mediaType) {
  return {
    id:         g.id,
    title:      g.title || q,
    previewUrl: g.images?.fixed_width_small?.url || g.images?.preview_gif?.url || null,
    fullUrl:    g.images?.original?.url || null,
    source:     'giphy',
    mediaType,
    width:      g.images?.original?.width  ? Number(g.images.original.width)  : null,
    height:     g.images?.original?.height ? Number(g.images.original.height) : null,
  };
}

async function searchGifs(q, limit, mediaType = 'gif') {
  if (GIF_PROVIDER === 'tenor' && TENOR_API_KEY) {
    // Tenor does not have a separate sticker endpoint — treat sticker as gif search
    const r = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&limit=${limit}&contentfilter=high&media_filter=gif,tinygif`);
    const data = await r.json();
    return (data.results || []).map(g => ({
      id:         g.id,
      title:      g.content_description || g.title || q,
      previewUrl: g.media_formats?.tinygif?.url || g.media_formats?.gif?.url || null,
      fullUrl:    g.media_formats?.gif?.url || null,
      source:     'tenor',
      mediaType,
      width:      g.media_formats?.gif?.dims?.[0] || null,
      height:     g.media_formats?.gif?.dims?.[1] || null,
    }));
  }
  if (GIF_PROVIDER === 'giphy' && GIPHY_API_KEY) {
    const endpoint = mediaType === 'sticker' ? 'stickers' : 'gifs';
    const r = await fetch(`https://api.giphy.com/v1/${endpoint}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg`);
    const data = await r.json();
    return (data.data || []).map(g => normalizeGiphy(g, q, mediaType));
  }
  return buildMockGifs(q || 'search', limit, mediaType);
}

async function trendingGifs(limit, mediaType = 'gif') {
  if (GIF_PROVIDER === 'tenor' && TENOR_API_KEY) {
    const r = await fetch(`https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=${limit}&contentfilter=high&media_filter=gif,tinygif`);
    const data = await r.json();
    return (data.results || []).map(g => ({
      id:         g.id,
      title:      g.content_description || g.title || 'trending',
      previewUrl: g.media_formats?.tinygif?.url || g.media_formats?.gif?.url || null,
      fullUrl:    g.media_formats?.gif?.url || null,
      source:     'tenor',
      mediaType,
      width:      g.media_formats?.gif?.dims?.[0] || null,
      height:     g.media_formats?.gif?.dims?.[1] || null,
    }));
  }
  if (GIF_PROVIDER === 'giphy' && GIPHY_API_KEY) {
    const endpoint = mediaType === 'sticker' ? 'stickers' : 'gifs';
    const r = await fetch(`https://api.giphy.com/v1/${endpoint}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=pg`);
    const data = await r.json();
    return (data.data || []).map(g => normalizeGiphy(g, 'trending', mediaType));
  }
  return buildMockGifs('trending', limit, mediaType);
}

app.get('/api/gifs/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 24, 50);
  const mediaType = req.query.type === 'sticker' ? 'sticker' : 'gif';
  if (!q) return res.json({ results: buildMockGifs('trending', limit, mediaType), provider: GIF_PROVIDER, mock: true });
  try {
    const results = await searchGifs(q, limit, mediaType);
    res.json({ results, provider: GIF_PROVIDER, mock: GIF_PROVIDER === 'mock' });
  } catch (err) {
    console.error('[GIF Search] Error:', err.message);
    res.json({ results: buildMockGifs(q, limit, mediaType), provider: GIF_PROVIDER, mock: true });
  }
});

app.get('/api/gifs/trending', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 24, 50);
  const mediaType = req.query.type === 'sticker' ? 'sticker' : 'gif';
  try {
    const results = await trendingGifs(limit, mediaType);
    res.json({ results, provider: GIF_PROVIDER, mock: GIF_PROVIDER === 'mock' });
  } catch (err) {
    console.error('[GIF Trending] Error:', err.message);
    res.json({ results: buildMockGifs('trending', limit, mediaType), provider: GIF_PROVIDER, mock: true });
  }
});

// Tenor/GIPHY both ask clients to ping a "share registered" endpoint so the
// GIF can rank correctly in their own trending — purely best-effort, never blocks the UI.
app.post('/api/gifs/register-share', requireAuth, async (req, res) => {
  const { id, q } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    if (GIF_PROVIDER === 'tenor' && TENOR_API_KEY) {
      await fetch(`https://tenor.googleapis.com/v2/registershare?id=${encodeURIComponent(id)}&key=${TENOR_API_KEY}&q=${encodeURIComponent(q || '')}`);
    }
    // GIPHY has no public registershare endpoint for search API keys — no-op.
    res.json({ success: true });
  } catch (err) {
    res.json({ success: true }); // best-effort; never fail the send flow over analytics
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// OUTFIT INSPO — /api/outfits/* (Pinterest-ready)
// NEW in V16. Returns curated inspo pins. Pinterest API wires in here.
// ═════════════════════════════════════════════════════════════════════════════

const MOCK_INSPO_PINS = [
  { id: 'p1', group: 'Stray Kids', vibe: 'Dark Era', gradientA: '#1a0028', gradientB: '#3d1060', title: 'Maxident Concert Look', tags: ['dark', 'edgy', 'concert'] },
  { id: 'p2', group: 'aespa', vibe: 'Cyber Glam', gradientA: '#001a2e', gradientB: '#004080', title: 'Kwangya Aesthetic', tags: ['futuristic', 'silver', 'cyber'] },
  { id: 'p3', group: 'NewJeans', vibe: 'Y2K Soft', gradientA: '#2e1a3a', gradientB: '#703090', title: 'Hype Boy Fan Fit', tags: ['y2k', 'soft', 'pastel'] },
  { id: 'p4', group: 'BLACKPINK', vibe: 'Power Luxe', gradientA: '#1a0014', gradientB: '#800040', title: 'Born Pink Era', tags: ['luxe', 'pink', 'bold'] },
  { id: 'p5', group: 'BTS', vibe: 'Butter Soft', gradientA: '#1a1400', gradientB: '#806000', title: 'Golden Hour Fan', tags: ['butter', 'gold', 'soft'] },
  { id: 'p6', group: 'TWICE', vibe: 'Sweet Pop', gradientA: '#1a0018', gradientB: '#800066', title: 'Feel Special Look', tags: ['sweet', 'pink', 'pop'] },
  { id: 'p7', group: 'ATEEZ', vibe: 'Dark Fantasy', gradientA: '#0d001a', gradientB: '#400066', title: 'World Tour Fit', tags: ['fantasy', 'dark', 'dramatic'] },
  { id: 'p8', group: 'NCT 127', vibe: 'Urban Cool', gradientA: '#001a1a', gradientB: '#006666', title: 'Neo City Style', tags: ['urban', 'cool', 'minimal'] },
];

app.get('/api/outfits/inspo', optionalAuth, async (req, res) => {
  const { group, vibe } = req.query;

  // Pinterest API hook — wire PINTEREST_ACCESS_TOKEN here
  const hasPinterest = !!process.env.PINTEREST_ACCESS_TOKEN;

  if (!hasPinterest) {
    let pins = MOCK_INSPO_PINS;
    if (group) pins = pins.filter(p => p.group.toLowerCase().includes(group.toLowerCase()));
    if (vibe)  pins = pins.filter(p => p.vibe.toLowerCase().includes(vibe.toLowerCase()));
    return res.json({ pins, source: 'mock', total: pins.length });
  }

  // TODO: Wire real Pinterest API
  // const pRes = await fetch(`https://api.pinterest.com/v5/pins?query=kpop+concert+outfit+${group || ''}`, {
  //   headers: { Authorization: `Bearer ${process.env.PINTEREST_ACCESS_TOKEN}` },
  // });
  // const pData = await pRes.json();
  // const pins = pData.items.map(pin => ({ id: pin.id, title: pin.title, imageUrl: pin.media?.images?.['600x']?.url, link: pin.link }));
  // return res.json({ pins, source: 'pinterest', total: pins.length });

  res.json({ pins: MOCK_INSPO_PINS, source: 'mock', total: MOCK_INSPO_PINS.length });
});

app.post('/api/outfits/save-inspo', requireAuth, async (req, res) => {
  const { pinId, pinData } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });

  // Save to user's saved inspo in Supabase
  const { data: user } = await supabase.from('users').select('profile_style').eq('id', req.userId).single();
  const current = user?.profile_style?.savedInspo || [];
  const updated = current.find(p => p.id === pinId) ? current : [...current, { id: pinId, ...pinData }];

  await supabase.from('users').update({ profile_style: { ...user?.profile_style, savedInspo: updated } })
    .eq('id', req.userId);
  res.json({ success: true });
});


// ═════════════════════════════════════════════════════════════════════════════
// EVENTS + TICKETMASTER PIPELINE
// ═════════════════════════════════════════════════════════════════════════════
//
// PIPELINE (active):
//   1. GET /api/events — frontend hook reads events, respects mock flag
//   2. POST /api/events/sync-ticketmaster — admin trigger; upserts TM events
//      into Supabase events table and creates announcements for new ones
//   3. GET /api/announcements — returns active non-expired announcements
//
// DATA FLOW:
//   Ticketmaster API (backend only — key never in frontend bundle)
//     → fetchTicketmasterEvents() → normalizeTicketmasterEvent()
//     → supabase events table (upsert on external_id)
//     → supabase announcements table
//     → GET /api/events + GET /api/announcements
//     → Frontend useEvents() + useAnnouncements() hooks
//
// DATA STATES (mirrors frontend badge logic):
//   mock: true  → frontend shows "Preview"
//   source=ticketmaster → real, no badge
//   source=manual → real, no badge
//   empty real response → honest empty state on frontend
//
// ENV: TICKETMASTER_API_KEY — server-side only, Render environment.
//      Never reaches the browser. HAS_TICKETMASTER flag guards all TM calls.
// ═════════════════════════════════════════════════════════════════════════════

// Mock fallback — used when MOCK_MODE=true or all live sources fail.
// Dates kept one year out from latest session so they don't look stale.
const MOCK_EVENTS = [
  { id: 'e1', title: 'Stray Kids DOMINATEE World Tour', date: '2026-08-15', city: 'Dallas, TX', venue: 'Moody Center', group: 'Stray Kids', fandom: 'STAY', going: 2341, image: null },
  { id: 'e2', title: 'ATEEZ THE FELLOWSHIP: BREAK THE WALL', date: '2026-09-05', city: 'Los Angeles, CA', venue: 'Kia Forum', group: 'ATEEZ', fandom: 'ATINY', going: 1892, image: null },
  { id: 'e3', title: 'TWICE 5TH WORLD TOUR: READY TO BE', date: '2026-09-20', city: 'New York, NY', venue: 'Prudential Center', group: 'TWICE', fandom: 'ONCE', going: 3102, image: null },
  { id: 'e4', title: 'aespa MY WORLD TOUR', date: '2026-10-08', city: 'Chicago, IL', venue: 'United Center', group: 'aespa', fandom: 'MY', going: 2780, image: null },
];

// ─── TICKETMASTER HELPERS ─────────────────────────────────────────────────────
// Normalise a raw Ticketmaster event object into the shape expected by
// both the /api/events response and the Supabase events table.
function normalizeTicketmasterEvent(e) {
  const venue      = e._embedded?.venues?.[0];
  const attraction = e._embedded?.attractions?.[0];
  const cityName   = venue?.city?.name  || '';
  const stateCode  = venue?.state?.stateCode || '';
  return {
    id:          e.id,
    name:        e.name,
    group_name:  attraction?.name || e.classifications?.[0]?.genre?.name || 'K-Pop',
    // Keep legacy `group` field for frontend compatibility
    group:       attraction?.name || e.classifications?.[0]?.genre?.name || 'K-Pop',
    city:        cityName && stateCode ? `${cityName}, ${stateCode}` : cityName,
    state:       stateCode,
    venue:       venue?.name || '',
    // `date` for legacy shape; `starts_at` stored in DB column
    date:        e.dates?.start?.localDate || null,
    ticket_url:  e.url || null,
    image_url:   e.images?.find(i => i.ratio === '16_9' && i.width >= 640)?.url
              || e.images?.[0]?.url || null,
    external_id: e.id,
    source:      'ticketmaster',
    updated_at:  new Date().toISOString(),
    raw:         e,
    // legacy fields
    verificationStatus: 'confirmed',
    sourceType:         'ticketmaster',
    url:                e.url || null,
  };
}

// Fetch events from Ticketmaster Discovery v2 for one or more keywords.
// Returns [] when TICKETMASTER_API_KEY is not set (safe no-op).
async function fetchTicketmasterEvents({ keywords = ['K-Pop'], city, size = 20 } = {}) {
  if (!HAS_TICKETMASTER) return [];
  const TM_KEY = process.env.TICKETMASTER_API_KEY;
  try {
    const results = await Promise.all(
      keywords.map(kw => {
        const params = new URLSearchParams({
          apikey:             TM_KEY,
          keyword:            kw,
          classificationName: 'Music',
          locale:             'en-us',
          size:               String(size),
          sort:               'date,asc',
        });
        if (city) params.set('city', city);
        return fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null);
      })
    );
    const seen = new Set();
    const events = [];
    for (const data of results) {
      for (const e of (data?._embedded?.events || [])) {
        if (!seen.has(e.id)) { seen.add(e.id); events.push(normalizeTicketmasterEvent(e)); }
      }
    }
    return events;
  } catch (err) {
    console.error('[TM] fetchTicketmasterEvents error:', err.message);
    return [];
  }
}

// Returns true when an event title/group_name matches any of the user's fandoms.
function eventMatchesUser(event, user) {
  const groups = user?.fandoms || user?.top_groups || user?.favorite_groups || [];
  if (!groups.length) return false;
  const haystack = `${event.name || ''} ${event.group_name || ''} ${event.group || ''} ${event.fandom || ''}`.toLowerCase();
  return groups.some(g => haystack.includes(g.toLowerCase()));
}

// Confirmed events always surfaced regardless of Ticketmaster or Supabase state
const CONFIRMED_EVENTS = [
  {
    id: 'bts-lv-2026', title: "BTS WORLD TOUR 'ARIRANG'", group: 'BTS',
    city: 'Las Vegas, NV', venue: 'Allegiant Stadium', date: '2026-05-23',
    verificationStatus: 'confirmed', sourceType: 'official',
    url: 'https://www.ticketmaster.com',
  },
];

app.get('/api/events', optionalAuth, async (req, res) => {
  const { city, group, fandom, groups } = req.query;
  const requestedGroups = groups ? groups.split(',').map(g => g.trim()).filter(Boolean) : [];

  if (MOCK_MODE) {
    let events = MOCK_EVENTS;
    if (city)   events = events.filter(e => e.city.toLowerCase().includes(city.toLowerCase()));
    if (group)  events = events.filter(e => e.group.toLowerCase().includes(group.toLowerCase()));
    if (fandom) events = events.filter(e => e.fandom.toLowerCase().includes(fandom.toLowerCase()));
    return res.json({ events, mock: true });
  }

  const collected = [];

  // 1 — Ticketmaster Discovery API (when key is present)
  if (HAS_TICKETMASTER) {
    const keywords = requestedGroups.length ? requestedGroups : (group ? [group] : ['K-Pop']);
    const tmEvents = await fetchTicketmasterEvents({ keywords, city, size: 20 });
    collected.push(...tmEvents);
  }

  // 2 — Supabase events table (manually curated or cached from TM nightly sync)
  try {
    let q = supabase.from('events').select('*').order('date', { ascending: true }).limit(50);
    if (city)  q = q.ilike('city', `%${city}%`);
    if (group) q = q.ilike('group', `%${group}%`);
    const { data, error } = await q;
    if (!error && data?.length) {
      const existingIds = new Set(collected.map(e => e.id));
      for (const row of data) {
        if (!existingIds.has(row.id)) collected.push(row);
      }
    }
  } catch (err) {
    console.error('[Events Supabase] Error:', err.message);
  }

  // 3 — Always merge confirmed events at the top; deduplicate by id
  const allIds = new Set(collected.map(e => e.id));
  const pinned = CONFIRMED_EVENTS.filter(e => !allIds.has(e.id));
  const merged = [...pinned, ...collected];

  if (!merged.length) {
    return res.json({ events: MOCK_EVENTS, mock: true });
  }

  res.json({ events: merged });
});

app.post('/api/events/attendance', requireAuth, async (req, res) => {
  const { eventId, status, travelStatus, soloMode } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, message: "You're going! Check Fanverse for fans near you." });

  try {
    const { error } = await supabase.from('event_attendance').upsert({
      user_id: req.userId, event_id: eventId,
      status: status || 'going', travel_status: travelStatus || 'local',
      solo_mode: soloMode || false, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    res.json({ success: true, message: "You're going! 🎉" });
  } catch (err) {
    res.status(500).json({ error: 'Could not update attendance' });
  }
});

// ─── POST /api/events/sync-ticketmaster ──────────────────────────────────────
// Fetches events from Ticketmaster, upserts into Supabase events table, and
// creates an announcement for each brand-new event (not previously in DB).
// Requires auth. Ticketmaster key never reaches the browser.
// Body: { keyword?: string, city?: string, size?: number }
app.post('/api/events/sync-ticketmaster', async (req, res, next) => {
  // Allow admin secret bypass (for cron jobs / manual triggers without a user session).
  // If the header is missing or wrong, fall through to normal requireAuth.
  const adminSecret = process.env.SYNC_ADMIN_SECRET;
  if (adminSecret && req.headers['x-admin-secret'] === adminSecret) return next();
  return requireAuth(req, res, next);
}, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({ success: true, mock: true, synced: 0, message: 'Mock mode — Ticketmaster sync skipped.' });
  }
  if (!HAS_TICKETMASTER) {
    return res.status(503).json({ error: 'TICKETMASTER_API_KEY not configured on this server.' });
  }

  const { keyword, city, size = 50 } = req.body || {};
  const keywords = keyword ? [keyword] : ['K-Pop', 'BTS', 'aespa', 'Stray Kids', 'NewJeans', 'ATEEZ'];

  try {
    const fetched = await fetchTicketmasterEvents({ keywords, city, size });
    if (!fetched.length) return res.json({ success: true, synced: 0, events: [] });

    // Map to events table shape (uses existing columns + new external_id columns)
    const rows = fetched.map(e => ({
      id:          e.id,
      name:        e.name,
      group_name:  e.group_name,
      city:        e.city,
      state:       e.state,
      venue:       e.venue,
      date:        e.date ? new Date(e.date).toISOString() : null,
      image_url:   e.image_url,
      ticket_url:  e.ticket_url,
      external_id: e.external_id,
      source:      'ticketmaster',
      raw:         e.raw,
      updated_at:  new Date().toISOString(),
    }));

    // Upsert on PK (id = TM event ID). existing rows get updated_at refreshed.
    const { data: upserted, error: upsertErr } = await supabase
      .from('events')
      .upsert(rows, { onConflict: 'id' })
      .select('id, name, group_name, city, date, external_id');

    if (upsertErr) throw upsertErr;

    // For each newly upserted event create an announcement if one doesn't exist
    const announcementRows = (upserted || []).map(e => ({
      type:         'tour_announcement',
      title:        e.name,
      body:         `${e.group_name || 'K-pop artist'} announced a show${e.city ? ` in ${e.city}` : ''}.`,
      event_id:     e.id,
      group_name:   e.group_name,
      city:         e.city,
      source:       'ticketmaster',
      data_state:   'real',
      priority:     2,
      action_route: 'concerts',
      // Expire 24h after the event date so stale announcements disappear
      expires_at:   e.date ? new Date(new Date(e.date).getTime() + 86_400_000).toISOString() : null,
      status:       'active',
    }));

    if (announcementRows.length) {
      // insert ignore — non-fatal. Supabase v2 builder is PromiseLike not Promise,
      // so use try/catch instead of .catch() which doesn't exist on the builder.
      try {
        await supabase.from('announcements').upsert(announcementRows, {
          onConflict: 'event_id,type',
          ignoreDuplicates: true,
        });
      } catch (_) { /* non-fatal — conflict index may not exist yet */ }
    }

    res.json({ success: true, synced: upserted?.length || 0, events: upserted });
  } catch (err) {
    console.error('[Sync TM] Error:', err.message);
    res.status(500).json({ error: 'Ticketmaster sync failed', detail: err.message });
  }
});

// ─── GET /api/announcements ───────────────────────────────────────────────────
// Returns active, non-expired announcements ordered by priority desc.
// Optional filters: ?fandom=BTS&city=Dallas&group_name=BTS&limit=20
// data_state field: 'real' | 'preview' | 'stale' — frontend uses for badge logic.
// Falls back to [] (no mock announcements — they are always real or absent).
app.get('/api/announcements', optionalAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ announcements: [], mock: true });

  const { fandom, city, group_name, limit = 20 } = req.query;
  try {
    let q = supabase
      .from('announcements')
      .select('*')
      .eq('status', 'active')
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(Number(limit));

    if (fandom)     q = q.ilike('fandom', `%${fandom}%`);
    if (city)       q = q.ilike('city', `%${city}%`);
    if (group_name) q = q.ilike('group_name', `%${group_name}%`);

    const { data, error } = await q;
    if (error) throw error;

    res.json({ announcements: data || [] });
  } catch (err) {
    console.error('[Announcements] Error:', err.message);
    res.status(500).json({ error: 'Could not load announcements' });
  }
});

app.post('/api/concerts/memory', requireAuth, async (req, res) => {
  const { eventId, photos, notes, outfit, peopleMet, meetupsAttended, afterParties } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `mem_${Date.now()}` });

  try {
    const { data, error } = await supabase.from('concert_memories').insert({
      user_id: req.userId, event_id: eventId, photos: photos || [],
      notes: notes || '', outfit: outfit || '', people_met: peopleMet || [],
      meetups_attended: meetupsAttended || [], after_parties: afterParties || [],
    }).select().single();
    if (error) throw error;
    res.json({ success: true, memory: data });
  } catch (err) {
    res.status(500).json({ error: 'Could not save memory' });
  }
});

app.get('/api/concerts/memory', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ memories: [
    { id: 'mem_001', event: MOCK_EVENTS[0], notes: 'Best night of my life 💜', created_at: '2024-03-15' },
  ], mock: true });

  const { data, error } = await supabase.from('concert_memories')
    .select('*, events(*)').eq('user_id', req.userId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ memories: data });
});


// ═════════════════════════════════════════════════════════════════════════════
// SCRAPBOOK — /api/memories/* and /api/scrapbooks/*
// Phase 2A: Supabase Storage for concert memory images
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/memories/upload-image
// Accepts base64-encoded image, uploads to Supabase Storage memories bucket.
// Returns { url, path } — public URL (prototype); switch to signed URLs for production.
app.post('/api/memories/upload-image', requireAuth, async (req, res) => {
  const { imageBase64, filename, mimeType, scrapbookId, memoryId } = req.body;

  if (MOCK_MODE) return res.json({ success: true, mock: true, url: null, path: null });

  try {
    if (!imageBase64 || !filename || !mimeType) {
      return res.status(400).json({ error: 'Missing imageBase64, filename, or mimeType' });
    }
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType.toLowerCase())) {
      return res.status(400).json({ error: 'Only JPG, PNG, and WebP images are allowed' });
    }
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.byteLength > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image must be under 5MB' });
    }
    const ts = Date.now();
    const safeFilename = (filename || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
    const bookId = (scrapbookId || memoryId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
    const storagePath = `${req.userId}/concert-memories/${bookId}/${ts}-${safeFilename}`;

    const { error: uploadError } = await supabase.storage
      .from('memories')
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;

    // Private bucket: return the storage path. Caller generates signed URLs as needed.
    // Also return a short-lived signed URL (1 h) for immediate display after upload.
    const { data: signedData, error: signErr } = await supabase.storage
      .from('memories')
      .createSignedUrl(storagePath, 3600);
    if (signErr) throw signErr;
    res.json({ success: true, url: signedData.signedUrl, path: storagePath });
  } catch (err) {
    console.error('[upload-image]', err.message);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// POST /api/scrapbooks/memory
// Saves a scrapbook memory to concert_memories.
// imageUrl should be a storage PATH (not a signed URL) — callers re-sign on read.
// Extra fields (title, type, venue, etc.) are packed into the notes column as JSON.
app.post('/api/scrapbooks/memory', requireAuth, async (req, res) => {
  const { scrapbookId, type, title, text, imageUrl, date, event, venue, city, friends, tags, linkedSong, favorite } = req.body;

  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `mem_${Date.now()}` });

  try {
    const notes = JSON.stringify({
      title: title || '', text: text || '', type: type || 'photo',
      date: date || '', event: event || '', venue: venue || '',
      city: city || '', tags: tags || [], linkedSong: linkedSong || '',
      favorite: !!favorite,
    });
    const { data, error } = await supabase.from('concert_memories').insert({
      user_id: req.userId,
      event_id: scrapbookId || null,
      photos: imageUrl ? [imageUrl] : [],
      notes,
      people_met: friends ? [friends] : [],
      meetups_attended: [],
      after_parties: [],
    }).select('id').single();
    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error('[scrapbooks/memory]', err.message);
    res.status(500).json({ error: err.message || 'Could not save memory' });
  }
});

// GET /api/scrapbooks/memories?scrapbookId=
// Loads memories for a scrapbook from concert_memories.
// Returns memories in the same shape the frontend expects.
app.get('/api/scrapbooks/memories', requireAuth, async (req, res) => {
  const { scrapbookId } = req.query;

  if (MOCK_MODE) return res.json({ memories: [], mock: true });

  try {
    let q = supabase.from('concert_memories')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (scrapbookId) q = q.eq('event_id', scrapbookId);
    const { data, error } = await q;
    if (error) throw error;

    const memories = (data || []).map(row => {
      let meta = {};
      try { meta = JSON.parse(row.notes || '{}'); } catch {}
      return {
        id: row.id,
        scrapbookId: row.event_id,
        type: meta.type || 'photo',
        title: meta.title || '',
        text: meta.text || '',
        imageData: row.photos?.[0] || null,
        date: meta.date || '',
        event: meta.event || '',
        venue: meta.venue || '',
        city: meta.city || '',
        friends: row.people_met?.[0] || '',
        tags: meta.tags || [],
        linkedSong: meta.linkedSong || '',
        favorite: meta.favorite || false,
        created_at: row.created_at,
        _synced: true,
      };
    });
    res.json({ memories });
  } catch (err) {
    console.error('[scrapbooks/memories]', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// FEED
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/feed', optionalAuth, async (req, res) => {
  const { page = 1, limit = 20, type, fandom } = req.query;

  if (MOCK_MODE) {
    return res.json({ posts: [
      { id: 'p1', user: { username: 'jennie.stays', avatar: null }, content: 'Finally got the Felix SSP!! 😭💜', type: 'haul', tag: 'STAY', likes: 847, created_at: new Date(Date.now()-3600000).toISOString() },
      { id: 'p2', user: { username: 'army.forever', avatar: null }, content: 'Concert recap thread 🧵 Last night was UNREAL', type: 'concert', tag: 'BTS', likes: 2341, created_at: new Date(Date.now()-7200000).toISOString() },
      { id: 'p3', user: { username: 'onceupon.a.momo', avatar: null }, content: 'My concert outfit for tonight! What do you think? 🌸', type: 'outfit', tag: 'TWICE', likes: 512, created_at: new Date(Date.now()-900000).toISOString() },
      { id: 'p4', user: { username: 'atiny.hj', avatar: null }, content: 'The fanchant during Fireworks was UNREAL tonight 🔥', type: 'concert', tag: 'ATEEZ', likes: 1203, created_at: new Date(Date.now()-1800000).toISOString() },
    ], mock: true, page: 1, hasMore: true });
  }

  const pageNum  = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit) || 20));
  const offset   = (pageNum - 1) * pageSize;
  // users!posts_user_id_fkey — posts↔users is reachable both directly (posts.user_id)
  // and via the post_likes junction, so PostgREST needs the explicit FK or it 500s
  // with "more than one relationship was found". Same trap as GET /api/meetups.
  let query = supabase.from('posts').select('*, users!posts_user_id_fkey(username, avatar_url)').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
  if (type)   query = query.eq('type', type);
  if (fandom) query = query.eq('tag', fandom);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  // Hide posts to/from blocked relationships in either direction
  let posts = data;
  if (req.userId) {
    const blocked = await getBlockedUserIdSet(req.userId);
    if (blocked.size) posts = posts.filter(p => !blocked.has(p.user_id));

    // Attach this viewer's own like state so the heart renders correctly on load
    // (without this the client can only guess, and likes appear to reset on refresh).
    const ids = posts.map(p => p.id);
    if (ids.length) {
      const { data: myLikes } = await supabase
        .from('post_likes').select('post_id').eq('user_id', req.userId).in('post_id', ids);
      const likedSet = new Set((myLikes || []).map(l => l.post_id));
      posts = posts.map(p => ({ ...p, liked: likedSet.has(p.id) }));
    }
  }
  res.json({ posts, page: pageNum, hasMore: data.length === pageSize });
});

app.post('/api/feed/post', requireAuth, async (req, res) => {
  const { content, type, tag, imageUrl, metadata } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  if (content.length > 2000) return res.status(400).json({ error: 'Post is too long' });
  if (MOCK_MODE) return res.json({ success: true, mock: true, post: { id: `p_${Date.now()}`, content, type, tag } });

  // Whitelist metadata — never persist arbitrary client-supplied JSON into the row.
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  const safeMeta = {
    tags:      Array.isArray(m.tags) ? m.tags.filter(t => typeof t === 'string').slice(0, 5).map(t => t.slice(0, 40)) : [],
    venue:     typeof m.venue === 'string' ? m.venue.slice(0, 120) : null,
    city:      typeof m.city  === 'string' ? m.city.slice(0, 120)  : null,
    checkedIn: !!m.checkedIn,
  };

  const { data, error } = await supabase.from('posts')
    .insert({ user_id: req.userId, content: content.trim(), type: type || 'general', tag, image_url: imageUrl, metadata: safeMeta })
    .select('*, users!posts_user_id_fkey(username, avatar_url)').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, post: { ...data, liked: false } });
});

app.post('/api/feed/like', requireAuth, async (req, res) => {
  const { postId } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const { data: existing } = await supabase.from('post_likes').select('post_id').eq('post_id', postId).eq('user_id', req.userId).single();
  if (existing) {
    await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', req.userId);
    await supabase.rpc('decrement_post_likes', { post_id: postId });
    return res.json({ success: true, liked: false });
  }
  await supabase.from('post_likes').insert({ post_id: postId, user_id: req.userId });
  await supabase.rpc('increment_post_likes', { post_id: postId });
  res.json({ success: true, liked: true });

  // Notify the post owner (fire-and-forget, never self-notify). Liking/unliking/reliking
  // just re-fires this on the next like — acceptable, matches how most feeds behave.
  (async () => {
    try {
      const { data: post } = await supabase.from('posts').select('user_id').eq('id', postId).single();
      if (!post?.user_id || post.user_id === req.userId) return;
      const actor = await getPublicUser(req.userId);
      await deliverNotification({
        userId: post.user_id,
        type: 'feed_like',
        title: `@${actor?.username || 'a fan'} liked your post`,
        body: 'Tap to see your Fanverse post.',
        actorId: req.userId,
        entityId: postId,
        entityType: 'post',
        targetTab: 'community',
        channels: ['in_app', 'push'],
      });
    } catch (err) {
      console.warn('[feed/like] notify failed:', err.message);
    }
  })();
});


// ═════════════════════════════════════════════════════════════════════════════
// FEED COMMENTS  (one level of replies — see supabase-post-comments-migration.sql)
// ═════════════════════════════════════════════════════════════════════════════
// posts.comments and post_comments.likes are maintained by DB triggers, NOT by
// these routes — do not hand-increment them here or they'll double-count.
//
// users!post_comments_user_id_fkey: post_comments↔users is reachable directly AND
// via the comment_likes junction, so the embed needs the explicit FK or PostgREST
// 500s. Same trap as /api/feed and /api/meetups.

const COMMENT_MAX_LEN = 1000;
const COMMENT_FETCH_CAP = 300;

// Shapes a raw comment row for the client. Author is flattened; `liked` is the
// requesting viewer's own state.
function toPublicComment(row, likedSet) {
  return {
    id:        row.id,
    postId:    row.post_id,
    parentId:  row.parent_id,
    body:      row.body,
    likes:     row.likes || 0,
    createdAt: row.created_at,
    userId:    row.user_id,
    username:  row.users?.username || null,
    avatarUrl: row.users?.avatar_url || null,
    liked:     likedSet ? likedSet.has(row.id) : false,
  };
}

app.get('/api/posts/:postId/comments', optionalAuth, async (req, res) => {
  const { postId } = req.params;
  if (MOCK_MODE) return res.json({ comments: [], mock: true });

  const { data, error } = await supabase
    .from('post_comments')
    .select('*, users!post_comments_user_id_fkey(username, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(COMMENT_FETCH_CAP);
  if (error) return res.status(500).json({ error: error.message });

  let rows = data || [];

  // Hide comments from blocked relationships in either direction. A hidden parent
  // takes its replies with it, otherwise orphaned replies render under nothing.
  if (req.userId) {
    const blocked = await getBlockedUserIdSet(req.userId);
    if (blocked.size) {
      rows = rows.filter(r => !blocked.has(r.user_id));
      const alive = new Set(rows.filter(r => !r.parent_id).map(r => r.id));
      rows = rows.filter(r => !r.parent_id || alive.has(r.parent_id));
    }
  }

  // Viewer's own like state, one query for every comment on the post
  let likedSet = new Set();
  if (req.userId && rows.length) {
    const { data: myLikes } = await supabase
      .from('comment_likes').select('comment_id')
      .eq('user_id', req.userId).in('comment_id', rows.map(r => r.id));
    likedSet = new Set((myLikes || []).map(l => l.comment_id));
  }

  // Flat rows -> one level of nesting. Replies stay in created_at order.
  const byId = new Map();
  const top = [];
  for (const r of rows) {
    if (r.parent_id) continue;
    const c = toPublicComment(r, likedSet);
    c.replies = [];
    byId.set(r.id, c);
    top.push(c);
  }
  for (const r of rows) {
    if (!r.parent_id) continue;
    byId.get(r.parent_id)?.replies.push(toPublicComment(r, likedSet));
  }

  res.json({ comments: top, total: rows.length });
});

app.post('/api/posts/:postId/comments', requireAuth, async (req, res) => {
  const { postId } = req.params;
  const { body, parentId } = req.body || {};
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (text.length > COMMENT_MAX_LEN) return res.status(400).json({ error: 'Comment is too long' });
  if (MOCK_MODE) return res.json({ success: true, mock: true });

  const { data: post } = await supabase.from('posts').select('id, user_id').eq('id', postId).single();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Resolve the reply target before inserting so we can 400 cleanly instead of
  // surfacing the depth trigger's raw exception as a 500.
  let parent = null;
  if (parentId) {
    const { data: p } = await supabase
      .from('post_comments').select('id, user_id, parent_id, post_id').eq('id', parentId).single();
    if (!p || p.post_id !== postId) return res.status(400).json({ error: 'Invalid parent comment' });
    if (p.parent_id) return res.status(400).json({ error: 'You can only reply to a top-level comment' });
    parent = p;
  }

  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: req.userId, parent_id: parentId || null, body: text })
    .select('*, users!post_comments_user_id_fkey(username, avatar_url)')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const comment = toPublicComment(data, new Set());
  comment.replies = [];
  res.json({ success: true, comment });

  // Notify after responding (fire-and-forget). A reply notifies the parent's
  // author; a top-level comment notifies the post owner. Never self-notify, and
  // never send both to the same person for one action.
  (async () => {
    try {
      const actor = await getPublicUser(req.userId);
      const handle = actor?.username || 'a fan';
      const notified = new Set([req.userId]);

      if (parent && !notified.has(parent.user_id)) {
        notified.add(parent.user_id);
        await deliverNotification({
          userId: parent.user_id,
          type: 'comment_reply',
          title: `@${handle} replied to your comment`,
          body: text.slice(0, 120),
          actorId: req.userId,
          entityId: postId,
          entityType: 'post',
          targetTab: 'community',
          channels: ['in_app', 'push'],
        });
      }
      if (!notified.has(post.user_id)) {
        await deliverNotification({
          userId: post.user_id,
          type: 'post_comment',
          title: `@${handle} commented on your post`,
          body: text.slice(0, 120),
          actorId: req.userId,
          entityId: postId,
          entityType: 'post',
          targetTab: 'community',
          channels: ['in_app', 'push'],
        });
      }
    } catch (err) {
      console.warn('[comments] notify failed:', err.message);
    }
  })();
});

// Author can delete their own comment; the post owner can moderate any comment on
// their post. Deleting a top-level comment cascades its replies (DB-level).
app.delete('/api/comments/:commentId', requireAuth, async (req, res) => {
  const { commentId } = req.params;
  if (MOCK_MODE) return res.json({ success: true, mock: true });

  const { data: comment } = await supabase
    .from('post_comments').select('id, user_id, post_id').eq('id', commentId).single();
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  let allowed = comment.user_id === req.userId;
  if (!allowed) {
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', comment.post_id).single();
    allowed = post?.user_id === req.userId;
  }
  if (!allowed) return res.status(403).json({ error: 'Not allowed' });

  const { error } = await supabase.from('post_comments').delete().eq('id', commentId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/comments/:commentId/like', requireAuth, async (req, res) => {
  const { commentId } = req.params;
  if (MOCK_MODE) return res.json({ success: true, mock: true });

  const { data: comment } = await supabase
    .from('post_comments').select('id').eq('id', commentId).single();
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const { data: existing } = await supabase
    .from('comment_likes').select('comment_id')
    .eq('comment_id', commentId).eq('user_id', req.userId).maybeSingle();

  if (existing) {
    await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', req.userId);
  } else {
    await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: req.userId });
  }

  // Re-read the trigger-maintained count rather than guessing it client-side
  const { data: fresh } = await supabase.from('post_comments').select('likes').eq('id', commentId).single();
  res.json({ success: true, liked: !existing, likes: fresh?.likes || 0 });
});


// ═════════════════════════════════════════════════════════════════════════════
// MEETUPS
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/meetups/create', requireAuth, async (req, res) => {
  const { eventId, type, title, location, city, time, capacity, vibe, ageRestriction, entryType, notes } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `mt_${Date.now()}`, title });
  const { data, error } = await supabase.from('meetups').insert({
    event_id: eventId, host_id: req.userId, type: type || 'general',
    title, location, city, time, capacity: capacity || 50, vibe,
    age_restriction: ageRestriction, entry_type: entryType, notes,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, meetup: data });
});

app.post('/api/meetups/:id/rsvp', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (MOCK_MODE) return res.json({ success: true, mock: true, going: true });
  const { error } = await supabase.from('meetup_rsvps').upsert({ meetup_id: id, user_id: req.userId });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, going: true });
});

// Un-RSVP — RLS already scopes deletes to the requester's own row (user_id = auth.uid()).
app.delete('/api/meetups/:id/rsvp', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (MOCK_MODE) return res.json({ success: true, mock: true, going: false });
  const { error } = await supabase.from('meetup_rsvps').delete().eq('meetup_id', id).eq('user_id', req.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, going: false });
});

// Public response intentionally omits attendee identities — only an aggregate count
// (meetup_rsvps(count)) plus whether the requesting user has RSVP'd. Full attendee
// lists are host-only and land in a later phase.
app.get('/api/meetups', optionalAuth, async (req, res) => {
  const { eventId, city, type } = req.query;
  if (MOCK_MODE) {
    return res.json({ meetups: [
      { id: 'mt1', type: 'freebie', title: 'ATINY Freebie Exchange', location: 'Parking Lot B', time: '5:00 PM', going: 47, capacity: 100, host: 'atinyworld_official' },
      { id: 'mt2', type: 'afterparty', title: 'STAY After Party 🪩', location: 'Sound Nightclub', time: '11:30 PM', going: 203, capacity: 300, vibe: 'club', ageRestriction: '21+' },
    ], mock: true });
  }
  // FK hint required: meetups<->users is reachable both directly (host_id) and via
  // the meetup_rsvps junction, so PostgREST can't auto-resolve which relationship to embed.
  let query = supabase.from('meetups').select('*, users!meetups_host_id_fkey(username, avatar_url), meetup_rsvps(count)');
  if (eventId) query = query.eq('event_id', eventId);
  if (city)    query = query.eq('city', city);
  if (type)    query = query.eq('type', type);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  let myRsvpIds = new Set();
  if (req.userId && data.length) {
    const { data: mine } = await supabase.from('meetup_rsvps').select('meetup_id').eq('user_id', req.userId);
    myRsvpIds = new Set((mine || []).map(r => r.meetup_id));
  }
  const meetups = data.map(m => ({ ...m, rsvped: myRsvpIds.has(m.id) }));
  res.json({ meetups });
});

// Host dashboard list — meetups the requester hosts. Count only, never attendee identities.
app.get('/api/meetups/mine', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ meetups: [], mock: true });
  const { data, error } = await supabase
    .from('meetups')
    .select('*, meetup_rsvps(count)')
    .eq('host_id', req.userId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const meetups = data.map(m => ({ ...m, rsvp_count: m.meetup_rsvps?.[0]?.count || 0 }));
  res.json({ meetups });
});

// Host-only (or admin) attendee list. 403 for anyone else — full RSVP identities
// must never be exposed outside this check. Safe fields only: no email, no private profile data.
app.get('/api/meetups/:id/attendees', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (MOCK_MODE) return res.json({ attendees: [], mock: true });
  const { data: meetup, error: meetupErr } = await supabase.from('meetups').select('id, host_id').eq('id', id).single();
  if (meetupErr || !meetup) return res.status(404).json({ error: 'Meetup not found' });
  if (meetup.host_id !== req.userId && !isAdminEmail(req.userEmail)) {
    return res.status(403).json({ error: 'Only the host can view the attendee list' });
  }
  const { data: rsvps, error: rsvpErr } = await supabase
    .from('meetup_rsvps')
    .select('user_id, created_at, users(username, display_name, avatar_url)')
    .eq('meetup_id', id)
    .order('created_at', { ascending: true });
  if (rsvpErr) return res.status(500).json({ error: rsvpErr.message });
  const attendees = (rsvps || []).map(r => ({
    id: r.user_id,
    username: r.users?.username || null,
    display_name: r.users?.display_name || r.users?.username || 'Backstage fan',
    avatar_url: r.users?.avatar_url || null,
    rsvped_at: r.created_at,
  }));
  res.json({ attendees, count: attendees.length });
});

// Friends-going preview — intersects this meetup's RSVPs with the requester's own
// accepted `friends` rows (same model /api/circle uses). Never returns non-friend
// attendee identities. Small, safe response only: a count and a short preview list.
app.get('/api/meetups/:id/friends-going', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (MOCK_MODE) return res.json({ count: 0, friends: [], mock: true });
  try {
    const { data: friendRows, error: friendErr } = await supabase
      .from('friends').select('friend_id').eq('user_id', req.userId).eq('status', 'accepted');
    if (friendErr) throw friendErr;
    const friendIds = (friendRows || []).map(r => r.friend_id).filter(Boolean);
    if (!friendIds.length) return res.json({ count: 0, friends: [] });

    const { data: rsvps, error: rsvpErr } = await supabase
      .from('meetup_rsvps').select('user_id').eq('meetup_id', id).in('user_id', friendIds);
    if (rsvpErr) throw rsvpErr;
    const goingIds = (rsvps || []).map(r => r.user_id);
    if (!goingIds.length) return res.json({ count: 0, friends: [] });

    const { data: users, error: userErr } = await supabase
      .from('users').select('id, username, display_name, avatar_url').in('id', goingIds.slice(0, 6));
    if (userErr) throw userErr;
    const friends = (users || []).map(u => ({
      id: u.id, username: u.username, display_name: u.display_name || u.username || 'Backstage fan', avatar_url: u.avatar_url || null,
    }));
    res.json({ count: goingIds.length, friends });
  } catch (err) {
    console.error('[GET /api/meetups/:id/friends-going] Error:', err.message);
    res.json({ count: 0, friends: [] }); // graceful fallback — never block the fan-facing detail sheet
  }
});

// Invite from Circle — host-only. Fire-and-forget notification delivery, not a
// persisted invite/RSVP record (attendance is already tracked via meetup_rsvps).
app.post('/api/meetups/:id/invite', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.filter(Boolean) : [];
  if (!userIds.length) return res.status(400).json({ error: 'userIds required' });
  if (MOCK_MODE) return res.json({ success: true, invited: userIds.length, mock: true });
  try {
    const { data: meetup, error: meetupErr } = await supabase.from('meetups').select('id, host_id, title').eq('id', id).single();
    if (meetupErr || !meetup) return res.status(404).json({ error: 'Meetup not found' });
    if (meetup.host_id !== req.userId && !isAdminEmail(req.userEmail)) {
      return res.status(403).json({ error: 'Only the host can invite fans to this meetup' });
    }
    // Only invite the host's own accepted Circle friends — never arbitrary user IDs.
    const { data: friendRows } = await supabase.from('friends').select('friend_id').eq('user_id', req.userId).eq('status', 'accepted');
    const circleIdSet = new Set((friendRows || []).map(r => r.friend_id));
    const targets = userIds.filter(uid => circleIdSet.has(uid));
    if (!targets.length) return res.json({ success: true, invited: 0 });

    const host = await getPublicUser(req.userId);
    const hostName = host?.username || 'A Backstage fan';
    await Promise.all(targets.map(userId => deliverNotification({
      userId,
      type: 'meetup_invite',
      title: `@${hostName} invited you to a meetup`,
      body: meetup.title,
      actorId: req.userId,
      entityId: meetup.id,
      entityType: 'meetup',
      // targetModal must be explicitly nulled — deliverNotification defaults it to
      // 'friends', and modal takes priority over tab in the frontend's onNavigate.
      targetModal: null,
      targetTab: 'concerts',
      channels: ['in_app', 'push', 'email'],
    })));
    res.json({ success: true, invited: targets.length });
  } catch (err) {
    console.error('[POST /api/meetups/:id/invite] Error:', err.message);
    res.status(500).json({ error: 'Could not send invites' });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// MAP — /api/map/activity
// Improved in V16: includes lat/lng for Mapbox integration
// Privacy: aggregate data only — no individual tracking
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/map/activity', optionalAuth, (req, res) => {
  res.json({
    hotspots: [
      { city: 'Seoul',         country: 'KR', lat: 37.5665,   lng: 126.9780,  fans: 3241,  fandom_spike: 'BTS',       pulse: 'spike', concerts: 3 },
      { city: 'Los Angeles',   country: 'US', lat: 34.0522,   lng: -118.2437, fans: 1847,  fandom_spike: 'ATEEZ',     pulse: 'high',  concerts: 2 },
      { city: 'Tokyo',         country: 'JP', lat: 35.6762,   lng: 139.6503,  fans: 2103,  fandom_spike: 'TWICE',     pulse: 'spike', concerts: 2 },
      { city: 'London',        country: 'GB', lat: 51.5074,   lng: -0.1278,   fans: 1203,  fandom_spike: 'BLACKPINK', pulse: 'high',  concerts: 1 },
      { city: 'São Paulo',     country: 'BR', lat: -23.5505,  lng: -46.6333,  fans: 743,   fandom_spike: 'Stray Kids',pulse: 'medium',concerts: 1 },
      { city: 'Sydney',        country: 'AU', lat: -33.8688,  lng: 151.2093,  fans: 621,   fandom_spike: 'SEVENTEEN', pulse: 'medium',concerts: 0 },
      { city: 'Manila',        country: 'PH', lat: 14.5995,   lng: 120.9842,  fans: 891,   fandom_spike: 'NCT',       pulse: 'high',  concerts: 1 },
      { city: 'Toronto',       country: 'CA', lat: 43.6532,   lng: -79.3832,  fans: 567,   fandom_spike: 'TXT',       pulse: 'medium',concerts: 1 },
      { city: 'Paris',         country: 'FR', lat: 48.8566,   lng: 2.3522,    fans: 445,   fandom_spike: 'LOONA',     pulse: 'quiet', concerts: 0 },
      { city: 'Jakarta',       country: 'ID', lat: -6.2088,   lng: 106.8456,  fans: 1205,  fandom_spike: 'ENHYPEN',   pulse: 'spike', concerts: 2 },
      { city: 'New York',      country: 'US', lat: 40.7128,   lng: -74.0060,  fans: 2100,  fandom_spike: 'aespa',     pulse: 'spike', concerts: 2 },
      { city: 'Chicago',       country: 'US', lat: 41.8781,   lng: -87.6298,  fans: 890,   fandom_spike: 'TWICE',     pulse: 'high',  concerts: 1 },
      { city: 'Dallas',        country: 'US', lat: 32.7767,   lng: -96.7970,  fans: 1240,  fandom_spike: 'Stray Kids',pulse: 'spike', concerts: 1 },
      { city: 'Mexico City',   country: 'MX', lat: 19.4326,   lng: -99.1332,  fans: 678,   fandom_spike: 'BTS',       pulse: 'high',  concerts: 0 },
      { city: 'Bangkok',       country: 'TH', lat: 13.7563,   lng: 100.5018,  fans: 1102,  fandom_spike: 'BLACKPINK', pulse: 'high',  concerts: 1 },
    ],
    total_active:    14421,
    active_meetups:  847,
    cities_covered:  312,
    privacy_note:    'All data is aggregate and anonymized. No individual fan tracking.',
    mapbox_ready:    HAS_MAPBOX,
    updated_at:      new Date().toISOString(),
  });
});

app.get('/api/recommendations', requireAuth, (req, res) => {
  res.json({
    mock: true,
    nearby_fans: 12,
    recommendations: [
      { type: 'fan',     message: '3 STAY fans going solo to the same show',       action: 'find_fans' },
      { type: 'meetup',  message: 'Freebie exchange meetup near your venue',        action: 'view_meetup' },
      { type: 'concert', message: 'ENHYPEN just announced your city',               action: 'view_concert' },
    ],
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═════════════════════════════════════════════════════════════════════════════

// NEW in V16 — used by AuthProvider on session restore
app.get('/api/users/me', requireAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({
      id: 'mock_user_1', email: 'fan@backstage.app', username: 'kacy.stays',
      bio: 'STAY since 2018 💜', city: 'Dallas', fandoms: ['Stray Kids', 'aespa'],
      bias: 'Felix', is_vip: false, proof_score: 4.8, show_city: true, showCity: true, mock: true,
    });
  }
  try {
    const { data, error } = await makeUserClient(req).from('users').select('*').eq('id', req.userId).single();

    // Row exists — return it
    if (data && !error) {
      touchLastActive(req.userId); // fire-and-forget, throttled 15 min
      return res.json(decorateCurrentUserProfile(data));
    }

    // Row missing (new user / trigger didn't fire) — create it from Supabase Auth data
    if (!data || error?.code === 'PGRST116') {
      const usernameBase = (req.userEmail || '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'fan';
      // Attempt insert with base username; on unique-constraint collision fall back to
      // a short UUID suffix so duplicate email-prefixes (e.g. same handle on gmail + outlook)
      // never block account creation.
      const tryInsert = async (username) => {
        const newUser = {
          id:           req.userId,
          email:        req.userEmail || '',
          username,
          display_name: usernameBase,
          bio:          '',
          city:         '',
          fandoms:      [],
          bias:         '',
          is_vip:       false,
          proof_score:  0,
        };
        return makeUserClient(req).from('users').upsert(newUser).select('*').single();
      };
      let { data: created, error: insertErr } = await tryInsert(usernameBase);
      if (insertErr && insertErr.code === '23505') {
        // Unique constraint on username — append short id suffix and retry once
        const suffix = req.userId.slice(0, 6);
        ({ data: created, error: insertErr } = await tryInsert(`${usernameBase}_${suffix}`));
      }
      if (insertErr) {
        console.error('[GET /api/users/me] Auto-create failed:', insertErr.message);
        return res.status(500).json({ error: 'Could not create user profile', detail: insertErr.message });
      }
      return res.json(decorateCurrentUserProfile(created));
    }

    // Any other DB error
    console.error('[GET /api/users/me] DB error:', error?.message);
    return res.status(500).json({ error: error?.message || 'Unknown error' });
  } catch (err) {
    console.error('[GET /api/users/me] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── RESERVED USERNAME PROTECTION (server-side mirror of frontend list) ───────
// Applied in PATCH /api/users/me and POST /api/profile/update.
// Future: sync to Supabase reserved_usernames table for admin management.
const BACKEND_RESERVED_USERNAMES = new Set([
  "bts","bangtan","rm","namjoon","jin","seokjin","suga","yoongi","agust_d",
  "jhope","hoseok","jimin","taehyung","v","jungkook",
  "ateez","hongjoong","hongjoon","seonghwa","yunho","yeosang","san","mingi","wooyoung","jongho",
  "straykids","stray_kids","skz","bang_chan","bangchan","leeknoow","leeknow","changbin",
  "hyunjin","han","felix","seungmin","i_n","i.n",
  "blackpink","jennie","jisoo","rose","lisa",
  "newjeans","minji","hanni","danielle","haerin","hyein",
  "aespa","karina","giselle","winter","ningning",
  "ive","yujin","gaeul","rei","wonyoung","liz","leeseo",
  "lesserafim","le_sserafim","sakura","chaewon","yunjin","kazuha","eunchae",
  "itzy","yeji","lia","ryujin","chaeryeong","yuna",
  "twice","nayeon","jeongyeon","momo","sana","jihyo","mina","dahyun","chaeyoung","tzuyu",
  "seventeen","enhypen","txt","tomorrow_by_together","nct","exo","shinee","got7",
  "redvelvet","gidle","mamamoo","vixx","infinite","kep1er","nmixx","riize","zerobaseone",
  "bighit","hybe","sm","smtown","jyp","jypentertainment","yg","ygentertainment",
  "starship","pledis","cube","woollim","mnet","weverse",
  "backstage","backstagefanverse","fanverse","admin","support","official",
  "help","moderator","mod","staff","team","bot","system","root",
]);
const BACKEND_IMPERSONATION_AFFIXES = new Set([
  "official","real","verified","staff","mod","admin","hq","team",
  "support","help","thereal","irl","iam","iamthe","im","vip",
]);
const isBackendReservedUsername = (name) => {
  if (!name || typeof name !== 'string') return false;
  const n = name.toLowerCase().replace(/[^a-z0-9_]/g,'');
  if (BACKEND_RESERVED_USERNAMES.has(n)) return true;
  for (const affix of BACKEND_IMPERSONATION_AFFIXES) {
    if (n.startsWith(affix)) {
      const rest = n.slice(affix.length).replace(/^_+/, '');
      if (rest && BACKEND_RESERVED_USERNAMES.has(rest)) return true;
    }
    if (n.endsWith(affix)) {
      const rest = n.slice(0, n.length - affix.length).replace(/_+$/, '');
      if (rest && BACKEND_RESERVED_USERNAMES.has(rest)) return true;
    }
  }
  return false;
};

function decorateCurrentUserProfile(profile = {}) {
  const vip = computeVipStatus(profile);
  return {
    ...profile,
    handle: profile.username,
    backstage_name: profile.display_name,
    favorite_groups: profile.fandoms || [],
    is_vip: vip.active,
    vip_active: vip.active,
    plan: vip.plan,
    showCity: profile.show_city ?? true,
  };
}

// ─── ACTIVITY TOUCH — throttled last_active_at update ────────────────────────
// Writes at most once per 15 minutes per user (conditional WHERE in SQL).
// Fire-and-forget — never awaited in the response path; errors are swallowed.
// Purpose: city hub scoring (active_7d, active_30d). NEVER exposed as an exact
// "last seen" / "online now" timestamp in any public-facing UI.
const LAST_ACTIVE_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes
function touchLastActive(userId) {
  if (!supabase || !userId) return;
  const fifteenMinsAgo = new Date(Date.now() - LAST_ACTIVE_THROTTLE_MS).toISOString();
  supabase
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', userId)
    .or(`last_active_at.is.null,last_active_at.lt.${fifteenMinsAgo}`)
    .then(({ error }) => {
      if (error) console.warn('[touchLastActive] update failed:', error.message);
    });
}

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────
// Updates user profile fields — fandoms is the canonical selected-groups field.
// Called by: Onboarding (handleProfileDone), future Profile edit UI.
//
// PHASE 2 NOTE: user.fandoms will be used to filter/personalize
//   GET /api/events when Ticketmaster Discovery API is wired in.
//   e.g. GET /api/events?groups=BTS,aespa will return matching events.
//   Do not rename this field — fandoms is the stable contract.
// ─────────────────────────────────────────────────────────────────────────────
app.patch('/api/users/me', requireAuth, async (req, res) => {
  const {
    username, handle, displayName, display_name, backstage_name,
    favorite_groups, fandoms, bias, city, bio,
    // fan identity fields (onboarding + My Stage editor)
    ult_group, bias_wrecker, fan_dna, concert_count, discovery_prefs,
    // normalized location fields
    city_display, city_key, region, region_code,
    country, country_code, continent, city_lat, city_lng, timezone,
  } = req.body;
  const usernameValue = username ?? handle;
  const displayNameValue = displayName ?? display_name ?? backstage_name ?? usernameValue;
  const groupsInput = Array.isArray(favorite_groups) ? favorite_groups : fandoms;
  const fanDnaClean = Array.isArray(fan_dna) ? fan_dna.filter(f => typeof f === 'string' && f.trim()) : undefined;
  const discoveryPrefsClean = Array.isArray(discovery_prefs) ? discovery_prefs.filter(f => typeof f === 'string' && f.trim()) : undefined;

  // Reserved username check — reject before touching DB
  if (usernameValue !== undefined && isBackendReservedUsername(usernameValue)) {
    return res.status(400).json({
      error: 'reserved_username',
      message: "That name is reserved for official use. Try adding your own twist, like a number, era, or fan tag.",
    });
  }

  // Validate fandoms is an array if provided
  const fandomsClean = Array.isArray(groupsInput) ? groupsInput.filter(f => typeof f === 'string' && f.trim()) : undefined;

  // MOCK_MODE — return updated profile without touching DB
  if (MOCK_MODE) {
    const updated = {
      id:           'mock_user_1',
      email:        'fan@backstage.app',
      username:     usernameValue     ?? 'kacy.stays',
      display_name: displayNameValue  ?? 'kacy.stays',
      fandoms:      fandomsClean ?? ['Stray Kids', 'aespa'],
      bias:         bias         ?? 'Felix',
      city:         city         ?? 'Dallas, TX',
      city_display: city_display ?? 'Dallas, TX, USA',
      city_key:     city_key     ?? 'dallas_tx_us',
      country_code: country_code ?? 'US',
      continent:    continent    ?? 'North America',
      bio:          bio          ?? 'STAY since 2018 💜',
      is_vip:       false,
      mock:         true,
    };
    console.log('[PATCH /api/users/me] MOCK — fandoms:', updated.fandoms);
    return res.json(updated);
  }

  try {
    // Build sparse update — only include defined fields
    const updates = { id: req.userId, email: req.userEmail || '' };
    if (usernameValue    !== undefined) updates.username      = usernameValue;
    if (displayNameValue !== undefined) updates.display_name  = displayNameValue;
    if (fandomsClean     !== undefined) updates.fandoms       = fandomsClean;
    if (bias             !== undefined) updates.bias          = bias;
    if (bio              !== undefined) updates.bio           = bio;
    // fan identity fields — all optional, sparse update only
    if (ult_group           !== undefined) updates.ult_group       = ult_group;
    if (bias_wrecker        !== undefined) updates.bias_wrecker    = bias_wrecker;
    if (fanDnaClean         !== undefined) updates.fan_dna         = fanDnaClean;
    if (concert_count       !== undefined) updates.concert_count   = concert_count;
    if (discoveryPrefsClean !== undefined) updates.discovery_prefs = discoveryPrefsClean;
    // location fields — all optional, sparse update only
    if (city         !== undefined) updates.city         = city;
    if (city_display !== undefined) updates.city_display = city_display;
    if (city_key     !== undefined) updates.city_key     = city_key;
    if (region       !== undefined) updates.region       = region;
    if (region_code  !== undefined) updates.region_code  = region_code;
    if (country      !== undefined) updates.country      = country;
    if (country_code !== undefined) updates.country_code = country_code;
    if (continent    !== undefined) updates.continent    = continent;
    if (city_lat     !== undefined) updates.city_lat     = city_lat;
    if (city_lng     !== undefined) updates.city_lng     = city_lng;
    if (timezone     !== undefined) updates.timezone     = timezone;

    const { data, error } = await supabase
      .from('users')
      .upsert(updates, { onConflict: 'id' })
      .select('id, username, display_name, fandoms, bias, ult_group, bias_wrecker, fan_dna, concert_count, discovery_prefs, city, city_display, city_key, region, region_code, country, country_code, continent, city_lat, city_lng, timezone, bio, is_vip, vip_source, vip_since, vip_expires_at, stripe_customer_id, show_city')
      .single();

    if (error) {
      console.error('[PATCH /api/users/me] DB error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    await convertPendingReferralForUser(req.userId);
    touchLastActive(req.userId); // fire-and-forget, throttled 15 min
    console.log('[PATCH /api/users/me] updated for', req.userId, '— fandoms:', data.fandoms, 'city_key:', data.city_key);
    res.json({ ...decorateCurrentUserProfile(data), onboarding_complete:true, profile_complete:true });
  } catch (err) {
    console.error('[PATCH /api/users/me] Exception:', err.message);
    // Never crash the frontend — return a safe partial response so
    // localStorage fallback can still proceed with the onboarding profile.
    res.json({ id: req.userId, fandoms: fandomsClean, favorite_groups:fandomsClean, bias, city, city_key, country_code, continent, username:usernameValue, handle:usernameValue, display_name:displayNameValue, backstage_name:displayNameValue, onboarding_complete:true, profile_complete:true, patched: true });
  }
});

// ─── DELETE /api/users/me ─────────────────────────────────────────────────────
// Permanently deletes all user data. Required for App Store compliance.
// Deletes from all tables in dependency order, then removes the auth user.
// Mock mode returns success without touching the database.
app.delete('/api/users/me', requireAuth, async (req, res) => {
  const userId = req.userId;
  if (MOCK_MODE) {
    console.log(`[Delete Account] MOCK — would delete user ${userId}`);
    return res.json({ deleted: true, mock: true });
  }
  if (!supabase) return res.status(503).json({ error: 'Database not available' });
  try {
    // 1. Remove tokens, reactions, and participation records
    await supabase.from('fcm_tokens').delete().eq('user_id', userId);
    await supabase.from('post_likes').delete().eq('user_id', userId);
    await supabase.from('event_rsvps').delete().eq('user_id', userId);
    await supabase.from('meetup_rsvps').delete().eq('user_id', userId);
    await supabase.from('event_attendance').delete().eq('user_id', userId);
    await supabase.from('meetups').delete().eq('host_id', userId);
    // Friends / requests / blocks — remove both directions
    await supabase.from('friends').delete().eq('user_id', userId);
    await supabase.from('friends').delete().eq('friend_id', userId);
    await supabase.from('friend_requests').delete().eq('sender_id', userId);
    await supabase.from('friend_requests').delete().eq('receiver_id', userId);
    await supabase.from('user_blocks').delete().eq('user_id', userId);
    await supabase.from('user_blocks').delete().eq('blocked_user_id', userId);
    // Notifications, referrals, rewards
    await supabase.from('notifications').delete().eq('user_id', userId);
    await supabase.from('referral_codes').delete().eq('user_id', userId);
    await supabase.from('referrals').delete().eq('referrer_user_id', userId);
    await supabase.from('referrals').delete().eq('referred_user_id', userId);
    await supabase.from('user_rewards').delete().eq('user_id', userId);
    // 2. Direct Messages — remove membership + authored messages
    await supabase.from('messages').delete().eq('sender_user_id', userId);
    await supabase.from('message_thread_members').delete().eq('user_id', userId);
    // 3. Remove user-created content
    await supabase.from('concert_memories').delete().eq('user_id', userId);
    await supabase.from('scrapbooks').delete().eq('user_id', userId);
    await supabase.from('collections').delete().eq('user_id', userId);
    await supabase.from('posts').delete().eq('user_id', userId);
    // 4. Photocard system — binders, cards, trade listings/offers/messages
    await supabase.from('listing_messages').delete().eq('sender_id', userId);
    await supabase.from('listing_offers').delete().eq('sender_id', userId);
    await supabase.from('trade_listings').delete().eq('user_id', userId);
    await supabase.from('user_cards').delete().eq('user_id', userId);
    await supabase.from('binders').delete().eq('user_id', userId);
    // 5. Trades (legacy) — delete offers and reviews; trades themselves may be retained
    //    for platform integrity (anonymized — no user ID reference after user row gone)
    await supabase.from('trade_offers').delete().eq('user_id', userId);
    await supabase.from('trade_reviews').delete().eq('reviewer_id', userId);
    await supabase.from('trade_reviews').delete().eq('reviewee_id', userId);
    // 6. Remove uploaded files from Storage (avatars, banners, feed media,
    //    trade proof, concert memories, photocards — all stored under {userId}/ prefix)
    for (const bucket of ['avatars', 'banners', 'feed-media', 'trade-proof', 'memories', 'card-images']) {
      try {
        const { data: files } = await supabase.storage.from(bucket).list(userId);
        if (files?.length) {
          await supabase.storage.from(bucket).remove(files.map(f => `${userId}/${f.name}`));
        }
      } catch (storageErr) {
        console.warn(`[Delete Account] Storage cleanup non-fatal for bucket=${bucket}: ${storageErr.message}`);
      }
    }
    // 7. Delete the main user record
    await supabase.from('users').delete().eq('id', userId);
    // 8. Delete the Supabase auth user (requires service role key)
    //    Non-fatal if it fails — the user row is already gone so login is impossible.
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (authErr) {
      console.warn(`[Delete Account] Auth user deletion non-fatal: ${authErr.message}`);
    }
    console.log(`[Delete Account] Completed for user ${userId}`);
    res.json({ deleted: true });
  } catch (err) {
    console.error('[Delete Account] Error:', err.message);
    res.status(500).json({ error: 'Could not delete account. Please contact support@backstagefanverse.com' });
  }
});

// ─── MODERATION ROUTES ────────────────────────────────────────────────────────
// POST /api/moderation/report — report a user, post, or trade
// POST /api/moderation/block  — block another user
// DELETE /api/moderation/block/:targetId — unblock
// GET  /api/moderation/blocks — list blocked users

app.post('/api/moderation/report', requireAuth, async (req, res) => {
  const { type, targetId, targetHandle, reason, detail } = req.body || {};
  if (!type || !reason) return res.status(400).json({ error: 'type and reason are required' });
  const entry = {
    reporter_id: req.userId,
    type: String(type).slice(0, 20),
    target_id: targetId ? String(targetId).slice(0, 64) : null,
    target_handle: targetHandle ? String(targetHandle).slice(0, 80) : null,
    reason: String(reason).slice(0, 120),
    detail: detail ? String(detail).slice(0, 500) : null,
    created_at: new Date().toISOString(),
    status: 'pending',
  };
  if (MOCK_MODE) {
    console.log('[Moderation] MOCK report:', entry);
    return res.json({ reported: true, mock: true });
  }
  try {
    const { error } = await supabase.from('moderation_reports').insert(entry);
    if (error) throw error;
    res.json({ reported: true });
  } catch (err) {
    console.error('[Moderation] Report error:', err.message);
    res.json({ reported: true, queued: true }); // non-fatal — report queued client-side
  }
});

app.post('/api/moderation/block', requireAuth, async (req, res) => {
  const { blockedUserId } = req.body || {};
  if (!blockedUserId) return res.status(400).json({ error: 'blockedUserId required' });
  if (blockedUserId === req.userId) return res.status(400).json({ error: 'Cannot block yourself' });
  if (MOCK_MODE) return res.json({ blocked: true, mock: true });
  try {
    await supabase.from('user_blocks').upsert(
      { user_id: req.userId, blocked_user_id: String(blockedUserId).slice(0, 64), created_at: new Date().toISOString() },
      { onConflict: 'user_id,blocked_user_id', ignoreDuplicates: true }
    );
    res.json({ blocked: true });
  } catch (err) {
    console.error('[Moderation] Block error:', err.message);
    res.json({ blocked: true, queued: true });
  }
});

app.delete('/api/moderation/block/:targetId', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ unblocked: true, mock: true });
  try {
    await supabase.from('user_blocks').delete()
      .eq('user_id', req.userId)
      .eq('blocked_user_id', req.params.targetId);
    res.json({ unblocked: true });
  } catch (err) {
    console.error('[Moderation] Unblock error:', err.message);
    res.status(500).json({ error: 'Could not unblock' });
  }
});

app.get('/api/moderation/blocks', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ blocks: [] });
  try {
    const { data, error } = await supabase.from('user_blocks')
      .select('blocked_user_id, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ blocks: data || [] });
  } catch (err) {
    console.error('[Moderation] Get blocks error:', err.message);
    res.json({ blocks: [] });
  }
});

// ─── ADMIN ACCESS CONTROL ────────────────────────────────────────────────────
// Admins are identified by email allowlist (ADMIN_EMAILS env var, comma-separated).
// This is intentionally simple and explicit — no role column to misconfigure,
// no privilege to accidentally grant via a stray DB update.
//   ADMIN_EMAILS=kjcerda1@gmail.com,kjcerda1@outlook.com
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());
}

function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.userEmail)) {
    return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
  }
  next();
}

// ─── ADMIN MODERATION QUEUE ──────────────────────────────────────────────────
// GET    /api/admin/moderation/reports          — list reports (pending first)
// PATCH  /api/admin/moderation/reports/:id      — update status / resolution_notes
// POST   /api/admin/moderation/reports/:id/action — log a moderation action
//
// IMPORTANT: warn/suspend/ban/remove-content are PLACEHOLDER actions only.
// They write an audit-log row to moderation_actions and (for user-targeted
// actions) set moderation_reports.action_taken — they do NOT yet enforce
// anything (no account suspension, no content deletion). Building real
// enforcement requires careful design (appeals, reversibility, notifications)
// and is intentionally deferred. Logging the *decision* now is what matters
// for App Store review — reviewers want to see that reports are triaged.
const MODERATION_ACTION_TYPES = ['dismiss', 'mark_reviewed', 'warn_user', 'suspend_user', 'ban_user', 'remove_content'];

// Lets the frontend conditionally show admin-only UI without ever shipping
// the admin email allowlist to the client bundle.
app.get('/api/admin/check', requireAuth, async (req, res) => {
  res.json({ isAdmin: isAdminEmail(req.userEmail) });
});

app.get('/api/admin/moderation/reports', requireAuth, requireAdmin, async (req, res) => {
  if (MOCK_MODE) return res.json({ reports: [], mock: true });
  try {
    const { status } = req.query;
    let query = supabase
      .from('moderation_reports')
      .select('id, reporter_id, type, target_id, target_handle, reason, detail, status, created_at, reviewed_at, reviewed_by, resolution_notes, action_taken')
      .order('status', { ascending: true })   // 'pending' sorts before 'reviewed'/'dismissed'/'actioned' alphabetically — good enough for a minimal queue
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;

    // Hydrate reporter + reviewer identities (best-effort — never block the queue on this)
    const ids = [...new Set((data || []).flatMap(r => [r.reporter_id, r.reviewed_by].filter(Boolean)))];
    let usersById = {};
    if (ids.length) {
      const { data: users } = await supabase.from('users').select('id, username, email').in('id', ids);
      usersById = Object.fromEntries((users || []).map(u => [u.id, u]));
    }

    const reports = (data || []).map(r => ({
      ...r,
      reporter: usersById[r.reporter_id] ? { id: r.reporter_id, username: usersById[r.reporter_id].username, email: usersById[r.reporter_id].email } : null,
      reviewer: usersById[r.reviewed_by] ? { id: r.reviewed_by, username: usersById[r.reviewed_by].username, email: usersById[r.reviewed_by].email } : null,
    }));
    res.json({ reports });
  } catch (err) {
    console.error('[Admin Moderation] List error:', err.message);
    res.status(503).json({ error: 'Could not load reports' });
  }
});

app.patch('/api/admin/moderation/reports/:id', requireAuth, requireAdmin, async (req, res) => {
  const { status, resolution_notes } = req.body || {};
  const VALID_STATUSES = ['pending', 'reviewed', 'dismissed', 'action_taken'];
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'invalid_status', valid: VALID_STATUSES });
  }
  if (MOCK_MODE) return res.json({ updated: true, mock: true });
  try {
    const patch = { reviewed_at: new Date().toISOString(), reviewed_by: req.userId };
    if (status !== undefined) patch.status = status;
    if (resolution_notes !== undefined) patch.resolution_notes = String(resolution_notes).slice(0, 1000);

    const { data, error } = await supabase
      .from('moderation_reports')
      .update(patch)
      .eq('id', req.params.id)
      .select('id, status, resolution_notes, reviewed_at, reviewed_by')
      .single();
    if (error) throw error;
    res.json({ updated: true, report: data });
  } catch (err) {
    console.error('[Admin Moderation] Update error:', err.message);
    res.status(503).json({ error: 'Could not update report' });
  }
});

app.post('/api/admin/moderation/reports/:id/action', requireAuth, requireAdmin, async (req, res) => {
  const { action_type, notes } = req.body || {};
  if (!MODERATION_ACTION_TYPES.includes(action_type)) {
    return res.status(400).json({ error: 'invalid_action_type', valid: MODERATION_ACTION_TYPES });
  }
  if (MOCK_MODE) return res.json({ logged: true, mock: true });
  try {
    const { data: report, error: reportErr } = await supabase
      .from('moderation_reports')
      .select('id, type, target_id, target_handle')
      .eq('id', req.params.id)
      .single();
    if (reportErr || !report) return res.status(404).json({ error: 'Report not found' });

    // Only user-type reports have a meaningful target_user_id; posts/trades log target_id as-is.
    const targetUserId = report.type === 'user' ? report.target_id : null;

    const actionRow = {
      report_id: report.id,
      action_type,
      target_user_id: targetUserId,
      target_type: report.type,
      target_id: report.target_id,
      notes: notes ? String(notes).slice(0, 1000) : null,
      created_by: req.userId,
      created_at: new Date().toISOString(),
    };
    const { data: logged, error: logErr } = await supabase
      .from('moderation_actions')
      .insert(actionRow)
      .select()
      .single();
    if (logErr) throw logErr;

    // Reflect the decision on the report itself — status + action_taken summary.
    // NOTE: warn/suspend/ban/remove are PLACEHOLDERS — this updates records only,
    // it does not suspend accounts, ban users, or delete content.
    const STATUS_BY_ACTION = {
      dismiss: 'dismissed',
      mark_reviewed: 'reviewed',
      warn_user: 'action_taken',
      suspend_user: 'action_taken',
      ban_user: 'action_taken',
      remove_content: 'action_taken',
    };
    await supabase.from('moderation_reports').update({
      status: STATUS_BY_ACTION[action_type],
      action_taken: action_type,
      reviewed_at: new Date().toISOString(),
      reviewed_by: req.userId,
    }).eq('id', report.id);

    console.log(`[Admin Moderation] action=${action_type} report=${report.id} by=${req.userId} (placeholder — no enforcement executed)`);
    res.json({ logged: true, action: logged });
  } catch (err) {
    console.error('[Admin Moderation] Action error:', err.message);
    res.status(503).json({ error: 'Could not log action' });
  }
});

// ─── BLOCK ENFORCEMENT HELPER ────────────────────────────────────────────────
// Returns true if either user has blocked the other. Used to gate DMs, friend
// requests, profile views, and feed visibility — blocking must actually prevent
// interaction, not just appear in a list (App Store / Play Store requirement).
async function isBlockedEitherWay(userIdA, userIdB) {
  if (!supabase || !userIdA || !userIdB || userIdA === userIdB) return false;
  try {
    const { data } = await supabase
      .from('user_blocks')
      .select('user_id, blocked_user_id')
      .or(`and(user_id.eq.${userIdA},blocked_user_id.eq.${userIdB}),and(user_id.eq.${userIdB},blocked_user_id.eq.${userIdA})`)
      .limit(1);
    return !!(data && data.length);
  } catch (err) {
    console.warn('[Moderation] Block check failed (non-fatal, allowing):', err.message);
    return false;
  }
}

// Used to decide whether a new DM thread's recipient starts pre-accepted (Circle
// friends land straight in the Inbox) or pending (shows under Message Requests).
async function areCircleFriends(userIdA, userIdB) {
  if (!supabase || !userIdA || !userIdB || userIdA === userIdB) return false;
  try {
    const { data } = await supabase
      .from('friends')
      .select('user_id')
      .eq('user_id', userIdA)
      .eq('friend_id', userIdB)
      .eq('status', 'accepted')
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.warn('[Circle] Friendship check failed (non-fatal, treating as not-friends):', err.message);
    return false;
  }
}

// Returns the set of user IDs blocked by — or who have blocked — the given user.
// Used to filter feeds/lists in bulk without an N+1 query per item.
async function getBlockedUserIdSet(userId) {
  if (!supabase || !userId) return new Set();
  try {
    const { data } = await supabase
      .from('user_blocks')
      .select('user_id, blocked_user_id')
      .or(`user_id.eq.${userId},blocked_user_id.eq.${userId}`);
    const set = new Set();
    for (const row of data || []) {
      set.add(row.user_id === userId ? row.blocked_user_id : row.user_id);
    }
    return set;
  } catch (err) {
    console.warn('[Moderation] Blocked-set lookup failed (non-fatal):', err.message);
    return new Set();
  }
}

// ─── PUBLIC CARD HELPER ──────────────────────────────────────────────────────
// Returns only safe public fields — never exposes email or phone.
function toPublicCard(u) {
  const groups = Array.isArray(u.fandoms) ? u.fandoms : [];
  const handle = u.username || '';
  const displayName = u.display_name || handle || 'Backstage fan';
  // Safe now_playing subset — strip tokens, embed URLs, private fields
  const np = u.now_playing && typeof u.now_playing === 'object'
    ? { title: u.now_playing.title || '', artist: u.now_playing.artist || '', source: u.now_playing.source || '' }
    : null;
  return {
    id: u.id,
    handle,
    username: handle,
    display_name: displayName,
    backstage_name: displayName,
    favorite_groups: groups,
    fandoms: groups,
    avatar: String(displayName || handle || 'B').trim().slice(0, 1).toUpperCase(),
    city: u.show_city === false ? '' : (u.city || ''),
    bio: u.bio || '',
    bias: u.bias || '',
    now_playing: np,
    proof_score: u.proof_score || null,
    is_vip: u.is_vip || false,
  };
}

async function getPublicUser(userId) {
  if (!userId || MOCK_MODE) return null;
  const { data } = await supabase
    .from('users')
    .select('id, username, display_name, fandoms, city, bio, avatar_url, proof_score, is_vip')
    .eq('id', userId)
    .single();
  return data ? toPublicCard(data) : null;
}

async function getPublicUsersByIds(ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || MOCK_MODE) return new Map();
  const { data } = await supabase
    .from('users')
    .select('id, username, display_name, fandoms, city, bio, avatar_url, proof_score, is_vip')
    .in('id', unique);
  return new Map((data || []).map(u => [u.id, toPublicCard(u)]));
}

function toClientNotification(n) {
  const actor = n.actor || {};
  return {
    id: n.id,
    type: n.type,
    icon: n.type === 'friend_request_accepted' ? 'star' : 'friend',
    title: n.title,
    body: n.body,
    read: !!n.read,
    time: n.created_at ? new Date(n.created_at).toLocaleString() : 'Just now',
    createdAt: n.created_at,
    fromUserId: n.actor_id || '',
    fromUsername: actor.username || actor.handle || '',
    fromDisplayName: actor.display_name || actor.backstage_name || '',
    fromAvatar: actor.avatar || String(actor.display_name || actor.username || 'B').slice(0, 1).toUpperCase(),
    fromColor: '#b993ff',
    entityId: n.entity_id || '',
    entityType: n.entity_type || '',
    targetModal: n.target_modal || '',
    targetTab: n.target_tab || '',
    gif: n.gif || null, // { id, title, previewUrl, fullUrl, source } — rendered as a small thumbnail
  };
}

// Maps each real notification type to the user preference key (in
// users.notification_settings) that gates its PUSH delivery. In-app delivery is
// never gated — users always see it in their inbox. A type with no entry here, or
// a pref that's unset/true, pushes normally; only an explicit `false` suppresses.
const TYPE_TO_PREF = {
  dm_received:             'dmAlerts',
  feed_like:               'likeAlerts',
  post_comment:            'commentAlerts',
  comment_reply:           'commentAlerts',
  friend_request_received: 'friendRequestAlerts',
  friend_request_accepted: 'friendRequestAlerts',
  meetup_invite:           'meetupAlerts',
  capsule:                 'capsuleAlerts',
  trade:                   'tradeOffers',
};

// Returns false only when the recipient has explicitly turned off push for this
// notification type. Defaults to true (push allowed) on any missing pref or error.
async function pushAllowedForType(userId, type) {
  const prefKey = TYPE_TO_PREF[type];
  if (!prefKey) return true;
  const { data: row } = await supabase.from('users').select('notification_settings').eq('id', userId).single();
  return row?.notification_settings?.[prefKey] !== false;
}

// FCM error codes that mean a token is permanently dead (app uninstalled, push
// unregistered, or the token is malformed) — safe to delete on sight so it stops
// getting retried on every future send.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

// Push a message to every device a user has registered, pruning any token FCM
// reports as dead. Without this, stale tokens accumulate in fcm_tokens forever
// and each send keeps failing against them. Returns {delivered, failed}.
async function pushToUserTokens(userId, message) {
  if (!HAS_FIREBASE || !admin.apps.length) return { delivered: 0, failed: 0 };
  const { data: rows } = await supabase.from('fcm_tokens').select('token').eq('user_id', userId);
  if (!rows?.length) return { delivered: 0, failed: 0 };

  const results = await Promise.allSettled(
    rows.map(({ token }) => admin.messaging().send({ ...message, token }))
  );

  const dead = [];
  let delivered = 0, failed = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') { delivered++; return; }
    failed++;
    const code = r.reason?.errorInfo?.code || r.reason?.code;
    if (DEAD_TOKEN_CODES.has(code)) dead.push(rows[i].token);
  });

  if (dead.length) {
    await supabase.from('fcm_tokens').delete().eq('user_id', userId).in('token', dead);
    console.log(`[push] pruned ${dead.length} dead token(s) for user ${userId}`);
  }
  return { delivered, failed };
}

async function deliverNotification({ userId, type, title, body, actorId = null, entityId = null, entityType = null, targetModal = 'friends', targetTab = null, channels = ['in_app', 'push'], gif = null }) {
  if (!userId) return { ok: false, reason: 'no_user' };
  if (MOCK_MODE) return { ok: true, mock: true };

  const insert = {
    user_id: userId,
    type,
    title,
    body,
    actor_id: actorId,
    entity_id: entityId,
    entity_type: entityType,
    target_modal: targetModal,
    target_tab: targetTab,
    read: false,
  };
  // Only attach gif when present — keeps inserts working on DBs that haven't run
  // the notifications.gif migration yet (supabase-notifications-gif-migration.sql)
  if (gif) insert.gif = gif;
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    console.warn('[deliverNotification] persistent insert failed:', error.message);
  }

  if (channels.includes('push') && await pushAllowedForType(userId, type)) {
    try {
      await pushToUserTokens(userId, {
        notification: { title, body },
        data: {
          targetModal: targetModal || '',
          targetTab: targetTab || '',
          targetId: entityId || '',
          entityType: entityType || '',
        },
        webpush: { fcmOptions: { link: process.env.FRONTEND_URL || '/' } },
      });
    } catch (err) {
      console.warn('[deliverNotification] push failed:', err.message);
    }
  }

  if (channels.includes('email')) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      await sendBackstageEmail({
        to: authUser?.user?.email,
        subject: title,
        text: body,
        html: `<p>${body}</p><p><a href="${process.env.FRONTEND_URL || 'https://backstagefanverse.com'}">Open Backstage</a></p>`,
      });
    } catch (err) {
      console.warn('[deliverNotification] email failed:', err.message);
    }
  }

  return { ok: true, notification };
}

app.get('/api/users/check-username', requireAuth, async (req, res) => {
  const username = String(req.query.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!username || username.length < 2) return res.json({ available: false, reason: 'too_short' });
  if (isBackendReservedUsername(username)) return res.json({ available: false, reason: 'reserved' });
  if (MOCK_MODE) return res.json({ available: true });
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .ilike('username', username)
      .limit(1);
    if (error) return res.status(500).json({ available: false, reason: 'error' });
    return res.json({ available: !data || data.length === 0 });
  } catch(e) {
    return res.status(500).json({ available: false, reason: 'error' });
  }
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  const raw = String(req.query.q || '').trim();
  // Normalize: strip leading @, lowercase, collapse whitespace
  const q = raw.replace(/^@/, '').toLowerCase().replace(/\s+/g, ' ');
  console.log(`[GET /api/users/search] hit — q.length=${q.length} userId=${req.userId}`);
  if (q.length < 2) return res.json({ users: [] });

  // Detect phone input: strip all non-digits and check length
  const phoneDigits = q.replace(/[\s\-().+]/g, '');
  const looksLikePhone = /^\d{7,15}$/.test(phoneDigits);

  if (MOCK_MODE) {
    const mockUsers = [
      { id:'mock_merci',  username:'mercilicious21', display_name:'Merci',       fandoms:['BTS'],        city:'San Antonio', bio:'ARMY since 2020' },
      { id:'mock_army',   username:'army.bestie',   display_name:'ARMY Bestie', fandoms:['BTS'],        city:'Dallas',      bio:'7 is my bias' },
      { id:'mock_stay2',  username:'stay.mia',      display_name:'Mia',         fandoms:['Stray Kids'], city:'Houston',     bio:'Felix wrecker' },
    ];
    const needle = q;
    return res.json({ users: mockUsers.filter(u =>
      u.username.includes(needle) || u.display_name.toLowerCase().includes(needle)
    ).map(toPublicCard) });
  }

  try {
    const safe = q.replace(/[%_,]/g, '');
    const contains = `%${safe}%`;
    const prefix = `${safe}%`;

    // Build OR clause — search username, display_name, email prefix, and phone if applicable
    let orClause = `username.ilike.${contains},display_name.ilike.${contains},email.ilike.${prefix}`;
    if (looksLikePhone) orClause += `,phone_normalized.eq.${phoneDigits}`;

    let { data, error } = await makeUserClient(req)
      .from('users')
      .select('id, username, display_name, fandoms, avatar_url, city, show_city, bio, proof_score, is_vip, discoverable')
      .or(orClause)
      .limit(15);

    // Defensive fallback — if show_city/discoverable don't exist on this environment's
    // schema (undefined_column, e.g. a not-yet-migrated deploy), retry with the
    // original minimal column set rather than hard-failing the whole search.
    if (error && (error.code === '42703' || /column .* does not exist/i.test(error.message || ''))) {
      console.warn('[GET /api/users/search] column missing, retrying with minimal select:', error.message);
      ({ data, error } = await makeUserClient(req)
        .from('users')
        .select('id, username, display_name, fandoms, avatar_url, city, bio, proof_score, is_vip')
        .or(orClause)
        .limit(15));
    }

    if (error) {
      console.error('[GET /api/users/search] DB error:', error.code, error.message);
      return res.status(500).json({ error: 'Search unavailable' });
    }

    // Filter out non-discoverable users in JS (null-safe — treats missing/null
    // discoverable as discoverable, matching the column's default of true).
    const visible = (data || []).filter(u => u.discoverable !== false);
    res.json({ users: visible.filter(u => u.id !== req.userId).map(toPublicCard) });
  } catch (err) {
    console.error('[GET /api/users/search] Exception:', err.message);
    res.status(500).json({ error: 'Search unavailable' });
  }
});

const REFERRAL_REWARDS = [
  { key: 'vip_7_day_trial', count: 1, label: 'VIP 7-day Trial', note: 'VIP trial pending activation' },
  { key: 'founding_fan_badge', count: 3, label: 'Founding Fan Badge', note: 'Perk unlocked in app' },
  { key: 'vip_30_day_glow', count: 5, label: 'VIP 30-day + Glow', note: 'VIP glow pending activation' },
  { key: 'fanverse_pioneer', count: 10, label: 'Fanverse Pioneer', note: 'Perk unlocked in app' },
];

function normalizeReferralBase(value) {
  return String(value || 'fan').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) || 'FAN';
}

async function getOrCreateReferralCodeForUser(userId) {
  const { data: existing, error: existingErr } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.code) return existing.code;

  const { data: profile } = await supabase
    .from('users')
    .select('username, display_name, email')
    .eq('id', userId)
    .maybeSingle();
  const base = normalizeReferralBase(profile?.username || profile?.display_name || profile?.email);

  for (let i = 0; i < 5; i++) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `BACKSTAGE-${base}-${suffix}`;
    const { data, error } = await supabase
      .from('referral_codes')
      .insert({ user_id: userId, code })
      .select('code')
      .single();
    if (!error && data?.code) return data.code;
    if (error?.code !== '23505') throw error;
  }
  throw new Error('Could not create unique referral code');
}

async function syncReferralRewards(userId) {
  const { count, error: countErr } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', userId)
    .eq('status', 'converted');
  if (countErr) throw countErr;
  const converted = count || 0;
  for (const reward of REFERRAL_REWARDS.filter(r => converted >= r.count)) {
    await supabase
      .from('user_rewards')
      .upsert({ user_id: userId, reward_key: reward.key, source: 'referral' }, { onConflict: 'user_id,reward_key' });
  }
  return converted;
}

async function convertPendingReferralForUser(userId) {
  if (MOCK_MODE || !supabase) return;
  const { data: rows, error } = await supabase
    .from('referrals')
    .update({ status: 'converted', converted_at: new Date().toISOString() })
    .eq('referred_user_id', userId)
    .eq('status', 'pending')
    .select('referrer_user_id');
  if (error) {
    console.warn('[Referrals] convert skipped:', error.message);
    return;
  }
  const referrers = [...new Set((rows || []).map(r => r.referrer_user_id).filter(Boolean))];
  await Promise.all(referrers.map(syncReferralRewards));
}

app.get('/api/referrals/code', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ code: 'BACKSTAGE-MOCK-2026', invite_url: 'https://backstagefanverse.com/?ref=BACKSTAGE-MOCK-2026', mock: true });
  try {
    const code = await getOrCreateReferralCodeForUser(req.userId);
    res.json({ code, invite_url: `https://backstagefanverse.com/?ref=${encodeURIComponent(code)}` });
  } catch (err) {
    console.error('[GET /api/referrals/code] Error:', err.message);
    res.status(503).json({ error: 'Referral code unavailable', setup_required: true });
  }
});

app.get('/api/referrals/stats', requireAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({ converted_count: 0, pending_count: 0, rewards: [], milestones: REFERRAL_REWARDS.map(r => ({ ...r, unlocked: false })), mock: true });
  }
  try {
    const [{ count: converted }, { count: pending }, rewardsRes] = await Promise.all([
      supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', req.userId).eq('status', 'converted'),
      supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', req.userId).eq('status', 'pending'),
      supabase.from('user_rewards').select('reward_key, unlocked_at, source').eq('user_id', req.userId),
    ]);
    if (rewardsRes.error) throw rewardsRes.error;
    const convertedCount = converted || 0;
    res.json({
      converted_count: convertedCount,
      pending_count: pending || 0,
      rewards: rewardsRes.data || [],
      milestones: REFERRAL_REWARDS.map(r => ({ ...r, unlocked: convertedCount >= r.count })),
    });
  } catch (err) {
    console.error('[GET /api/referrals/stats] Error:', err.message);
    res.status(503).json({ error: 'Referral stats unavailable', setup_required: true });
  }
});

app.post('/api/referrals/claim', requireAuth, async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  if (MOCK_MODE) return res.json({ success: true, status: 'pending', mock: true });
  try {
    const { data: refCode, error: codeErr } = await supabase
      .from('referral_codes')
      .select('user_id, code')
      .eq('code', code)
      .single();
    if (codeErr || !refCode) return res.status(404).json({ error: 'Referral code not found' });
    if (refCode.user_id === req.userId) return res.status(400).json({ error: 'Self-referrals are not allowed' });

    const { error } = await supabase.from('referrals').upsert({
      referrer_user_id: refCode.user_id,
      referred_user_id: req.userId,
      referral_code: refCode.code,
      status: 'pending',
    }, { onConflict: 'referred_user_id', ignoreDuplicates: true });
    if (error) throw error;
    res.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('[POST /api/referrals/claim] Error:', err.message);
    res.status(503).json({ error: 'Referral claim unavailable', setup_required: true });
  }
});

app.get('/api/circle', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ friends: [], circle: [], mock: true });
  try {
    const db = makeUserClient(req);
    const { data: rows, error } = await db
      .from('friends')
      .select('friend_id, status, created_at')
      .eq('user_id', req.userId)
      .eq('status', 'accepted');
    if (error) throw error;
    const ids = (rows || []).map(r => r.friend_id).filter(Boolean);
    if (!ids.length) return res.json({ friends: [], circle: [], members: [] });
    const acceptedAtById = Object.fromEntries((rows || []).map(r => [r.friend_id, r.created_at]));
    const { data: users, error: userErr } = await db
      .from('users')
      .select('id, username, display_name, fandoms, city, bio, avatar_url, is_vip')
      .in('id', ids);
    if (userErr) throw userErr;
    const friends = (users || []).map(u => ({ ...toPublicCard(u), accepted_at: acceptedAtById[u.id] || null }));
    // `members` is an alias of the same list — the frontend's InvitePage circle
    // fetch reads d.members, which this endpoint never actually populated before.
    res.json({ friends, circle: friends, members: friends });
  } catch (err) {
    console.error('[GET /api/circle] Error:', err.message);
    res.status(503).json({ error: 'Circle unavailable' });
  }
});

app.post('/api/circle/request', requireAuth, async (req, res) => {
  req.body.targetUserId = req.body.targetUserId || req.body.userId || req.body.circleUserId;
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  if (targetUserId === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });
  if (MOCK_MODE) return res.json({ success: true, status: 'pending', mock: true });
  try {
    const { error } = await makeUserClient(req).from('friend_requests').upsert({
      sender_id: req.userId,
      receiver_id: targetUserId,
      status: 'pending',
    }, { onConflict: 'sender_id,receiver_id' });
    if (error) throw error;
    res.json({ success: true, status: 'pending' });
  } catch (err) {
    console.error('[POST /api/circle/request] Error:', err.message);
    res.status(503).json({ error: 'Could not send circle request' });
  }
});

async function getThreadForUsers(userId, targetUserId) {
  const { data: mine, error: mineErr } = await supabase
    .from('message_thread_members')
    .select('thread_id')
    .eq('user_id', userId);
  if (mineErr) throw mineErr;
  const myThreadIds = (mine || []).map(r => r.thread_id);
  if (!myThreadIds.length) return null;
  const { data: theirs, error: theirsErr } = await supabase
    .from('message_thread_members')
    .select('thread_id')
    .eq('user_id', targetUserId)
    .in('thread_id', myThreadIds);
  if (theirsErr) throw theirsErr;
  return theirs?.[0]?.thread_id || null;
}

app.get('/api/messages/threads', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ threads: [], mock: true });
  try {
    const { data: memberRows, error } = await supabase
      .from('message_thread_members')
      .select('thread_id, accepted, deleted_at')
      .eq('user_id', req.userId);
    if (error) throw error;
    const myRows = (memberRows || []).filter(r => !r.deleted_at);
    const threadIds = [...new Set(myRows.map(r => r.thread_id))];
    if (!threadIds.length) return res.json({ threads: [] });
    const acceptedByThread = Object.fromEntries(myRows.map(r => [r.thread_id, !!r.accepted]));

    const [{ data: allMembers }, { data: messages }, { data: threadRows }] = await Promise.all([
      supabase.from('message_thread_members').select('thread_id, user_id').in('thread_id', threadIds),
      supabase.from('messages').select('id, thread_id, sender_user_id, body, gif, created_at').in('thread_id', threadIds).order('created_at', { ascending: true }),
      supabase.from('message_threads').select('id, created_by').in('id', threadIds),
    ]);
    const otherIds = [...new Set((allMembers || []).map(m => m.user_id).filter(id => id !== req.userId))];
    const [{ data: profiles }, { data: circleRows }] = await Promise.all([
      otherIds.length
        ? supabase.from('users').select('id, username, display_name, fandoms, city, bio, avatar_url, is_vip').in('id', otherIds)
        : Promise.resolve({ data: [] }),
      otherIds.length
        ? supabase.from('friends').select('friend_id').eq('user_id', req.userId).eq('status', 'accepted').in('friend_id', otherIds)
        : Promise.resolve({ data: [] }),
    ]);
    const profileById = Object.fromEntries((profiles || []).map(p => [p.id, toPublicCard(p)]));
    const circleIdSet = new Set((circleRows || []).map(r => r.friend_id));
    const createdByThread = Object.fromEntries((threadRows || []).map(t => [t.id, t.created_by]));
    const messagesByThread = {};
    (messages || []).forEach(m => {
      if (!messagesByThread[m.thread_id]) messagesByThread[m.thread_id] = [];
      messagesByThread[m.thread_id].push(m);
    });

    const threads = threadIds.map(id => {
      const other = (allMembers || []).find(m => m.thread_id === id && m.user_id !== req.userId);
      const safeProfile = profileById[other?.user_id] || { id: other?.user_id, username: 'fan', display_name: 'Backstage fan', avatar: 'B' };
      const threadMessages = messagesByThread[id] || [];
      return {
        id,
        fan: safeProfile,
        messages: threadMessages,
        last_message: threadMessages[threadMessages.length - 1] || null,
        unread: 0,
        // isCircle/accepted/initiatedByMe let the frontend split Inbox vs Message Requests
        // without trusting stale localStorage — this is the authoritative source.
        isCircle: circleIdSet.has(other?.user_id),
        accepted: acceptedByThread[id] || false,
        initiatedByMe: createdByThread[id] === req.userId,
      };
    });
    res.json({ threads });
  } catch (err) {
    console.error('[GET /api/messages/threads] Error:', err.message);
    res.status(503).json({ error: 'Messages unavailable' });
  }
});

app.post('/api/messages/thread', requireAuth, async (req, res) => {
  const targetUserId = req.body?.targetUserId || req.body?.userId;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  if (targetUserId === req.userId) return res.status(400).json({ error: 'Cannot message yourself' });
  if (MOCK_MODE) return res.json({ thread: { id: `mock-thread-${targetUserId}`, messages: [] }, mock: true });
  if (await isBlockedEitherWay(req.userId, targetUserId)) {
    return res.status(403).json({ error: 'blocked', message: 'You cannot message this user.' });
  }
  try {
    let threadId = await getThreadForUsers(req.userId, targetUserId);
    if (!threadId) {
      const { data: thread, error: threadErr } = await supabase
        .from('message_threads')
        .insert({ created_by: req.userId })
        .select('id')
        .single();
      if (threadErr) throw threadErr;
      threadId = thread.id;
      // Circle friends land straight in each other's Inbox. Otherwise the recipient's
      // membership starts unaccepted, and the thread shows under Message Requests
      // until they Accept, Reply, or Block/Delete it.
      const alreadyCircle = await areCircleFriends(req.userId, targetUserId);
      const { error: memberErr } = await supabase.from('message_thread_members').insert([
        { thread_id: threadId, user_id: req.userId, accepted: true },
        { thread_id: threadId, user_id: targetUserId, accepted: alreadyCircle },
      ]);
      if (memberErr) throw memberErr;
    }
    const { data: profile } = await supabase
      .from('users')
      .select('id, username, display_name, fandoms, city, bio, avatar_url, is_vip')
      .eq('id', targetUserId)
      .single();
    res.json({ thread: { id: threadId, fan: profile ? toPublicCard(profile) : null, messages: [] } });
  } catch (err) {
    console.error('[POST /api/messages/thread] Error:', err.message);
    res.status(503).json({ error: 'Could not create message thread' });
  }
});

app.get('/api/messages/thread/:id', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ thread: { id: req.params.id, messages: [] }, mock: true });
  try {
    const { data: membership } = await supabase
      .from('message_thread_members')
      .select('thread_id')
      .eq('thread_id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (!membership) return res.status(403).json({ error: 'Forbidden' });
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, thread_id, sender_user_id, body, gif, created_at')
      .eq('thread_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ thread: { id: req.params.id, messages: messages || [] } });
  } catch (err) {
    console.error('[GET /api/messages/thread] Error:', err.message);
    res.status(503).json({ error: 'Could not load message thread' });
  }
});

app.post('/api/messages/thread/:id/send', requireAuth, async (req, res) => {
  const body = String(req.body?.body || '').trim() || null;
  const gif  = req.body?.gif && typeof req.body.gif === 'object' ? req.body.gif : null;
  if (!body && !gif) return res.status(400).json({ error: 'body or gif required' });
  if (MOCK_MODE) return res.json({ message: { id: `mock-msg-${Date.now()}`, body, gif, sender_user_id: req.userId, created_at: new Date().toISOString() }, mock: true });
  try {
    const { data: membership } = await supabase
      .from('message_thread_members')
      .select('thread_id, accepted')
      .eq('thread_id', req.params.id)
      .eq('user_id', req.userId)
      .single();
    if (!membership) return res.status(403).json({ error: 'Forbidden' });
    const { data: otherMembers } = await supabase
      .from('message_thread_members')
      .select('user_id')
      .eq('thread_id', req.params.id)
      .neq('user_id', req.userId);
    for (const m of otherMembers || []) {
      if (await isBlockedEitherWay(req.userId, m.user_id)) {
        return res.status(403).json({ error: 'blocked', message: 'You cannot message this user.' });
      }
    }
    // Replying to a pending Message Request implicitly accepts it.
    if (!membership.accepted) {
      await supabase.from('message_thread_members').update({ accepted: true }).eq('thread_id', req.params.id).eq('user_id', req.userId);
    }
    const insert = { thread_id: req.params.id, sender_user_id: req.userId, body };
    if (gif) insert.gif = gif;
    const { data, error } = await supabase
      .from('messages')
      .insert(insert)
      .select('id, thread_id, sender_user_id, body, gif, created_at')
      .single();
    if (error) throw error;
    await supabase.from('message_threads').update({ updated_at: new Date().toISOString() }).eq('id', req.params.id);

    const otherId = otherMembers?.[0]?.user_id;
    if (otherId) {
      const sender = await getPublicUser(req.userId);
      const senderName = sender?.username || 'A Backstage fan';
      await deliverNotification({
        userId: otherId,
        type: 'dm_received',
        title: `New message from ${senderName}`,
        body: gif ? 'Sent you a GIF' : (body || '').slice(0, 120),
        actorId: req.userId,
        entityId: req.params.id,
        entityType: 'thread',
        targetModal: 'chats',
        channels: ['in_app', 'push'],
      });
    }

    res.json({ message: data });
  } catch (err) {
    console.error('[POST /api/messages/thread/send] Error:', err.message);
    res.status(503).json({ error: 'Could not send message' });
  }
});

// Accept a pending Message Request — moves the thread into the recipient's Inbox.
app.patch('/api/messages/thread/:id/accept', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    const { error } = await supabase
      .from('message_thread_members')
      .update({ accepted: true })
      .eq('thread_id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/messages/thread/accept] Error:', err.message);
    res.status(500).json({ error: 'Could not accept message request' });
  }
});

// Per-user soft delete/hide — never removes the thread for the other participant.
app.delete('/api/messages/thread/:id', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    const { error } = await supabase
      .from('message_thread_members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('thread_id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/messages/thread] Error:', err.message);
    res.status(500).json({ error: 'Could not delete conversation' });
  }
});

app.post('/api/profile/update', requireAuth, async (req, res) => {
  const {
    username, bio, city, showCity, fandoms, bias, nowPlaying, profileStyle, discoverable,
    // fan identity fields (My Stage editor)
    ult_group, bias_wrecker, fan_dna, concert_count, discovery_prefs,
    // era boards blob (EraRoom syncToEraBoard — whole backstage_era_boards_v2 object)
    eraBoards,
    // my world collection blob (photocard sets, tracked/custom sets, era saves,
    // wishlist, world theme, featured shelf, saved capsules, saved shop outfits)
    myWorld,
    // notification preferences blob (per-type push toggles) → users.notification_settings.
    // deliverNotification() reads this to gate the push channel per notification type.
    notificationSettings,
    // normalized location fields (sent by saveCity when user picks from autocomplete)
    city_display, city_key, region, region_code,
    country, country_code, continent, city_lat, city_lng, timezone,
  } = req.body;
  // Reserved username check
  if (username !== undefined && isBackendReservedUsername(username)) {
    return res.status(400).json({
      error: 'reserved_username',
      message: "That name is reserved for official use. Try adding your own twist, like a number, era, or fan tag.",
    });
  }
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  // Seed id + email so upsert creates the row for users who signed up but
  // whose public.users row was never inserted by the DB trigger.
  const updates = { id: req.userId, email: req.userEmail || '' };
  if (username      !== undefined) updates.username       = username;
  if (bio           !== undefined) updates.bio            = bio;
  if (showCity      !== undefined) updates.show_city      = showCity;
  if (fandoms       !== undefined) updates.fandoms        = fandoms;
  if (bias          !== undefined) updates.bias           = bias;
  if (nowPlaying    !== undefined) updates.now_playing    = nowPlaying;
  if (profileStyle  !== undefined) updates.profile_style  = profileStyle;
  if (discoverable  !== undefined) updates.discoverable   = discoverable;
  // fan identity — sparse, all optional; arrays filtered to non-empty strings
  if (ult_group     !== undefined) updates.ult_group     = ult_group;
  if (bias_wrecker  !== undefined) updates.bias_wrecker  = bias_wrecker;
  if (Array.isArray(fan_dna))         updates.fan_dna         = fan_dna.filter(f => typeof f === 'string' && f.trim());
  if (concert_count !== undefined) updates.concert_count = concert_count;
  if (Array.isArray(discovery_prefs)) updates.discovery_prefs = discovery_prefs.filter(f => typeof f === 'string' && f.trim());
  // era boards — whole-object jsonb, plain object only (never arrays/strings)
  if (eraBoards !== undefined && eraBoards !== null && typeof eraBoards === 'object' && !Array.isArray(eraBoards)) updates.era_boards = eraBoards;
  // my world — whole-object jsonb, plain object only
  if (myWorld !== undefined && myWorld !== null && typeof myWorld === 'object' && !Array.isArray(myWorld)) updates.my_world = myWorld;
  // notification settings — whole-object jsonb, plain object only
  if (notificationSettings !== undefined && notificationSettings !== null && typeof notificationSettings === 'object' && !Array.isArray(notificationSettings)) updates.notification_settings = notificationSettings;
  // location — sparse, all optional
  if (city         !== undefined) updates.city         = city;
  if (city_display !== undefined) updates.city_display = city_display;
  if (city_key     !== undefined) updates.city_key     = city_key;
  if (region       !== undefined) updates.region       = region;
  if (region_code  !== undefined) updates.region_code  = region_code;
  if (country      !== undefined) updates.country      = country;
  if (country_code !== undefined) updates.country_code = country_code;
  if (continent    !== undefined) updates.continent    = continent;
  if (city_lat     !== undefined) updates.city_lat     = city_lat;
  if (city_lng     !== undefined) updates.city_lng     = city_lng;
  if (timezone     !== undefined) updates.timezone     = timezone;
  const { error } = await supabase.from('users').upsert(updates, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  touchLastActive(req.userId); // fire-and-forget, throttled 15 min
  res.json({ success: true });
});

app.post('/api/profile/top-groups', requireAuth, async (req, res) => {
  const { topGroups } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const { error } = await supabase.from('users').update({ profile_style: { topGroups } }).eq('id', req.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── CITY PRIVACY — show_city column ─────────────────────────────────────────
// Migration shipped: ALTER TABLE public.users ADD COLUMN IF NOT EXISTS show_city boolean DEFAULT true;
// ✅ POST /api/profile/update  — accepts showCity (camelCase), persists as show_city
// ✅ GET  /api/profile/:id     — strips city from public response when show_city=false
// ⚠️  GET  /api/profile/by-username/:username — city privacy not yet enforced (future)
// City is always city-level only (e.g. "Dallas, TX") — never coordinates or street address.
// ─────────────────────────────────────────────────────────────────────────────────
app.get('/api/profile/:id', optionalAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({
      id: req.params.id, username: 'jennie.stays',
      bio: 'STAY since 2018 · Felix wrecker · Photocard addict',
      city: 'Los Angeles', fandoms: ['Stray Kids', 'ATEEZ', 'TWICE'],
      bias: 'Felix', avatar_url: null, proof_score: 4.8, is_vip: true, mock: true,
    });
  }
  if (req.userId && req.userId !== req.params.id && await isBlockedEitherWay(req.userId, req.params.id)) {
    return res.status(404).json({ error: 'User not found' });
  }
  const fields = req.userId === req.params.id
    ? '*'
    : 'id, username, display_name, bio, fandoms, bias, city, show_city, avatar_url, proof_score, is_vip, profile_style, now_playing';
  const { data, error } = await supabase.from('users').select(fields).eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  // Enforce city privacy — strip city if user opted out, never expose show_city
  const result = { ...data };
  if (req.userId !== req.params.id && result.show_city === false) delete result.city;
  delete result.show_city;

  // Relationship — computed fresh from friends/friend_requests, never trust client-cached
  // state. This is the single source of truth the frontend's Add-to-Circle button should
  // read from, instead of the localStorage cache that can drift after acceptance/decline.
  if (!req.userId) {
    result.relationship = 'unknown';
  } else if (req.userId === req.params.id) {
    result.relationship = 'self';
  } else {
    const { data: friendRow } = await supabase
      .from('friends').select('friend_id').eq('user_id', req.userId).eq('friend_id', req.params.id).eq('status', 'accepted').maybeSingle();
    if (friendRow) {
      result.relationship = 'friends';
    } else {
      const { data: reqRow } = await supabase
        .from('friend_requests').select('id, sender_id, receiver_id')
        .or(`and(sender_id.eq.${req.userId},receiver_id.eq.${req.params.id}),and(sender_id.eq.${req.params.id},receiver_id.eq.${req.userId})`)
        .eq('status', 'pending').maybeSingle();
      if (reqRow) {
        result.relationship = reqRow.sender_id === req.userId ? 'outgoing_request' : 'incoming_request';
        result.requestId = reqRow.id;
      } else {
        result.relationship = 'none';
      }
    }
  }

  // Collector signal — only show the Cards module on profiles that actually have
  // photocard data. A fan who's never touched the photocard system shouldn't get an
  // empty "Cards" placeholder forced onto their public profile.
  const [{ count: cardCount }, { count: binderCount }, { count: listingCount }] = await Promise.all([
    supabase.from('user_cards').select('id', { count: 'exact', head: true }).eq('user_id', req.params.id),
    supabase.from('binders').select('id', { count: 'exact', head: true }).eq('user_id', req.params.id),
    supabase.from('trade_listings').select('id', { count: 'exact', head: true }).eq('user_id', req.params.id),
  ]);
  result.card_count = cardCount || 0;
  result.is_collector = (cardCount || 0) > 0 || (binderCount || 0) > 0 || (listingCount || 0) > 0;

  res.json(result);
});

// ─── PUBLIC PROFILE BY USERNAME ──────────────────────────────────────────────
// Used by /u/:username shareable profile links. Returns safe public fields only.
app.get('/api/profile/by-username/:username', optionalAuth, async (req, res) => {
  const username = req.params.username.replace(/^@/, '').toLowerCase();
  if (MOCK_MODE) {
    return res.json({
      id: 'mock_user', username, display_name: username,
      bio: 'ARMY since 2018 · Concert addict',
      city: 'San Antonio', fandoms: ['BTS'],
      bias: 'Yoongi', avatar_url: null, proof_score: 4.5, is_vip: false, mock: true,
    });
  }
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, bio, fandoms, bias, avatar_url, proof_score, is_vip, city, profile_style')
    .ilike('username', username)
    .single();
  if (error || !data) return res.status(404).json({ error: 'User not found' });
  res.json(data);
});

// ─── CITY HUBS ────────────────────────────────────────────────────────────────
// GET /api/hubs/cities
//
// Returns city hub cards scored by fan energy (not just head count).
// Only counts users with show_city=true AND discoverable=true — privacy-safe.
// last_active_at is used for active_7d/active_30d counts, never exposed directly.
//
// Hub tiers:
//   Seed     ≥ 1  discoverable fans with city_key
//   Forming  ≥ 5  fans
//   Official ≥ 10 fans  AND  ≥ 3  active in last 30d
//   Featured ≥ 25 fans  AND  ≥ 10 active in last 30d
//
// Hub Score (MVP — expands as posts/events/rsvps come online):
//   active_7d * 5  +  active_30d * 2  +  new_fans_7d * 4  +  trades_open * 2
//
// Query params:
//   ?continent=   filter to continent name (e.g. "North America")
//   ?country_code= filter by ISO-2 (e.g. "US")
//   ?sort=         hub_score (default) | total_fans | active_7d
//   ?limit=        max cities returned (default 20, max 50)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/hubs/cities', optionalAuth, async (req, res) => {
  const { continent, country_code, sort = 'hub_score', limit: lim = 20 } = req.query;
  const maxLimit = Math.min(Number(lim) || 20, 50);

  if (MOCK_MODE) {
    return res.json({
      cities: [
        { city_key:'seoul_kr', city_display:'Seoul, South Korea', country_code:'KR', continent:'Asia',
          hub_status:'featured', total_fans:42, active_7d:18, active_30d:31, new_fans_7d:5, trades_open:12, hub_score:248, next_milestone:null },
        { city_key:'los_angeles_ca_us', city_display:'Los Angeles, CA, USA', country_code:'US', continent:'North America',
          hub_status:'official', total_fans:16, active_7d:7, active_30d:11, new_fans_7d:3, trades_open:4, hub_score:107, next_milestone:'9 more fans to unlock Featured Hub' },
        { city_key:'san_antonio_tx_us', city_display:'San Antonio, TX, USA', country_code:'US', continent:'North America',
          hub_status:'forming', total_fans:7, active_7d:3, active_30d:5, new_fans_7d:2, trades_open:1, hub_score:41, next_milestone:'3 more fans to unlock Official Hub' },
      ],
      generated_at: new Date().toISOString(),
      mock: true,
    });
  }

  if (!supabase) return res.status(503).json({ error: 'Database not available' });

  try {
    // 1. Fetch all hub-eligible users (city known + privacy opts satisfied)
    let userQuery = supabase
      .from('users')
      .select('id, city_key, city_display, country_code, continent, last_active_at, created_at')
      .eq('show_city', true)
      .eq('discoverable', true)
      .not('city_key', 'is', null);
    if (continent)    userQuery = userQuery.eq('continent', continent);
    if (country_code) userQuery = userQuery.eq('country_code', country_code);

    // 2. Fetch active trade listing user_ids (for trades_open per city)
    const tradeQuery = supabase
      .from('trade_listings')
      .select('user_id')
      .eq('status', 'active');

    const [{ data: users, error: userErr }, { data: trades, error: tradeErr }] = await Promise.all([userQuery, tradeQuery]);

    if (userErr) throw userErr;
    if (tradeErr) console.warn('[GET /api/hubs/cities] trades query failed:', tradeErr.message);

    const now = Date.now();
    const ms7d  = 7  * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    // Map userId → city_key for trade aggregation
    const userCityMap = {};
    for (const u of (users || [])) userCityMap[u.id] = u.city_key;

    // Aggregate trades_open per city_key
    const tradesPerCity = {};
    for (const t of (trades || [])) {
      const ck = userCityMap[t.user_id];
      if (ck) tradesPerCity[ck] = (tradesPerCity[ck] || 0) + 1;
    }

    // Aggregate user signals per city_key
    const cityMap = {};
    for (const u of (users || [])) {
      const ck = u.city_key;
      if (!ck) continue;
      if (!cityMap[ck]) {
        cityMap[ck] = {
          city_key:     ck,
          city_display: u.city_display || ck,
          country_code: u.country_code || '',
          continent:    u.continent    || '',
          total_fans:   0,
          active_7d:    0,
          active_30d:   0,
          new_fans_7d:  0,
        };
      }
      const c = cityMap[ck];
      c.total_fans++;
      if (u.last_active_at) {
        const age = now - new Date(u.last_active_at).getTime();
        if (age <= ms7d)  c.active_7d++;
        if (age <= ms30d) c.active_30d++;
      }
      if (u.created_at && (now - new Date(u.created_at).getTime()) <= ms7d) {
        c.new_fans_7d++;
      }
    }

    // Score, classify, and build response
    const cities = Object.values(cityMap).map(c => {
      const trades_open = tradesPerCity[c.city_key] || 0;

      // Hub tier
      let hub_status;
      if      (c.total_fans >= 25 && c.active_30d >= 10) hub_status = 'featured';
      else if (c.total_fans >= 10 && c.active_30d >= 3)  hub_status = 'official';
      else if (c.total_fans >= 5)                         hub_status = 'forming';
      else                                                hub_status = 'seed';

      // Next milestone message
      let next_milestone = null;
      if (hub_status === 'seed') {
        const need = 5 - c.total_fans;
        next_milestone = `${need} more fan${need===1?'':'s'} to unlock Forming Hub`;
      } else if (hub_status === 'forming') {
        const needFans    = Math.max(0, 10 - c.total_fans);
        const needActive  = Math.max(0, 3  - c.active_30d);
        if (needFans > 0 && needActive > 0)
          next_milestone = `${needFans} more fan${needFans===1?'':'s'} + ${needActive} more active this month to unlock Official Hub`;
        else if (needFans > 0)
          next_milestone = `${needFans} more fan${needFans===1?'':'s'} to unlock Official Hub`;
        else
          next_milestone = `${needActive} more active fan${needActive===1?'':'s'} this month to unlock Official Hub`;
      } else if (hub_status === 'official') {
        const needFans   = Math.max(0, 25 - c.total_fans);
        const needActive = Math.max(0, 10 - c.active_30d);
        if (needFans > 0 && needActive > 0)
          next_milestone = `${needFans} more fan${needFans===1?'':'s'} + ${needActive} more active this month to unlock Featured Hub`;
        else if (needFans > 0)
          next_milestone = `${needFans} more fan${needFans===1?'':'s'} to unlock Featured Hub`;
        else
          next_milestone = `${needActive} more active fan${needActive===1?'':'s'} this month to unlock Featured Hub`;
      }

      // Hub Score (MVP formula — posts_7d / event_rsvps / upcoming_events = 0 until those ship)
      const hub_score = c.active_7d * 5 + c.active_30d * 2 + c.new_fans_7d * 4 + trades_open * 2;

      return { ...c, trades_open, hub_status, hub_score, next_milestone };
    });

    // Sort
    const sortKey = ['hub_score','total_fans','active_7d'].includes(sort) ? sort : 'hub_score';
    cities.sort((a, b) => b[sortKey] - a[sortKey]);

    res.json({
      cities: cities.slice(0, maxLimit),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GET /api/hubs/cities] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── FRIEND SUGGESTIONS ───────────────────────────────────────────────────────
// Returns up to 10 users who share fandoms, city, or joined recently.
// Never returns users already in the requester's circle.
app.get('/api/friends/suggested', requireAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({ users: [
      { id:'mock_merci',  username:'mercilicious21', display_name:'Merci', fandoms:['BTS'],        city:'San Antonio', bio:'ARMY since 2020', bias:'Jimin',  show_city:true },
      { id:'mock_stay2',  username:'stay.mia',      display_name:'Mia',   fandoms:['Stray Kids'], city:'Houston',     bio:'Felix wrecker',   bias:'Felix',  show_city:true },
      { id:'mock_twice1', username:'oncejisoo',      display_name:'Ji',    fandoms:['TWICE'],      city:'Austin',      bio:'Nayeon bias',     bias:'Nayeon', show_city:true },
    ].map(toPublicCard) });
  }
  try {
    // Fetch caller's profile signals for scoring
    const { data: me } = await supabase
      .from('users').select('fandoms, city, bias, now_playing').eq('id', req.userId).single();
    const myFandoms  = me?.fandoms || [];
    const myCity     = (me?.city || '').toLowerCase();
    const myBias     = me?.bias || '';
    const myNpArtist = me?.now_playing?.artist || '';

    // Fetch IDs already in circle (accepted)
    const { data: circleRows } = await supabase
      .from('friends').select('friend_id').eq('user_id', req.userId).eq('status', 'accepted');
    const circleIds = new Set((circleRows || []).map(r => r.friend_id));

    // Fetch IDs with existing friend requests in either direction (pending or declined)
    const { data: reqRows } = await supabase
      .from('friend_requests')
      .select('sender_id, receiver_id')
      .or(`sender_id.eq.${req.userId},receiver_id.eq.${req.userId}`)
      .in('status', ['pending', 'declined']);
    const pendingIds = new Set();
    (reqRows || []).forEach(r => {
      if (r.sender_id !== req.userId) pendingIds.add(r.sender_id);
      if (r.receiver_id !== req.userId) pendingIds.add(r.receiver_id);
    });

    // Query candidates — only discoverable users (discoverable != false)
    let { data: candidates } = await supabase
      .from('users')
      .select('id, username, display_name, fandoms, city, show_city, bio, bias, now_playing, proof_score, is_vip')
      .neq('id', req.userId)
      .neq('discoverable', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!candidates) candidates = [];

    // Score each candidate (higher = more relevant)
    const scored = candidates
      .filter(u => !circleIds.has(u.id) && !pendingIds.has(u.id))
      .map(u => {
        let score = 0;
        const uFandoms = Array.isArray(u.fandoms) ? u.fandoms : [];
        score += uFandoms.filter(f => myFandoms.includes(f)).length * 3;
        if (myCity && (u.city || '').toLowerCase().includes(myCity.split(',')[0].trim())) score += 2;
        if (myBias && u.bias && u.bias === myBias) score += 2;
        if (myNpArtist && u.now_playing?.artist === myNpArtist) score += 1;
        return { u, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ u }) => toPublicCard(u));

    res.json({ users: scored });
  } catch (err) {
    console.error('[GET /api/friends/suggested] Error:', err.message);
    res.json({ users: [] });
  }
});

// ─── FAN DISCOVERY ───────────────────────────────────────────────────────────
// Returns up to 20 discoverable users, excluding existing friends + pending requests.
// Optional query params: ?fandom=BTS&city=Dallas&city_key=san_antonio_tx_us
// city_key takes precedence over city when both are provided (exact normalized match).
app.get('/api/users/discover', requireAuth, async (req, res) => {
  const fandom   = (req.query.fandom    || '').trim();
  const city     = (req.query.city      || '').trim();
  const city_key = (req.query.city_key  || '').trim();

  if (MOCK_MODE) {
    const mocks = [
      { id:'mock_disc1', username:'armyjoon',    display_name:'Joon',  fandoms:['BTS'],                bias:['RM'],        city:'Las Vegas, NV',   bio:'Looking for concert buddies 💜', now_playing:{ artist:'BTS', title:'Spring Day' } },
      { id:'mock_disc2', username:'staymia',     display_name:'Mia',   fandoms:['Stray Kids'],         bias:['Felix'],     city:'Chicago, IL',     bio:'Solo concert mode 🖤', now_playing:{ artist:'Stray Kids', title:'S-Class' } },
      { id:'mock_disc3', username:'biaswrecker', display_name:'Seo',   fandoms:['Stray Kids','aespa'], bias:['Karina'],    city:'Los Angeles, CA', bio:'Bias wrecker every era 🫠', now_playing:{ artist:'aespa', title:'Whiplash' } },
      { id:'mock_disc4', username:'purplehour',  display_name:'Hana',  fandoms:['BTS','ENHYPEN'],      bias:['Jungkook'],  city:'New York, NY',    bio:'Making freebies 💜', now_playing:{ artist:'ENHYPEN', title:'Future Perfect' } },
    ];
    let filtered = mocks;
    if (fandom)   filtered = filtered.filter(u => u.fandoms.includes(fandom));
    if (city)     filtered = filtered.filter(u => (u.city || '').toLowerCase().includes(city.toLowerCase()));
    // city_key not filterable in mock (no city_key field) — return all mock fans
    return res.json({ users: filtered.map(u => ({ ...toPublicCard(u), bias: u.bias, now_playing: u.now_playing })) });
  }

  try {
    const { data: me } = await supabase
      .from('users').select('fandoms, city').eq('id', req.userId).single();
    const myFandoms = me?.fandoms || [];
    const myCity    = (me?.city || '').toLowerCase().split(',')[0].trim();

    // Exclude accepted friends (both directions) and pending outgoing requests
    const [{ data: friendsOut }, { data: reqRows }] = await Promise.all([
      supabase.from('friends').select('friend_id').eq('user_id', req.userId).eq('status', 'accepted'),
      supabase.from('friend_requests').select('receiver_id').eq('sender_id', req.userId).eq('status', 'pending'),
    ]);
    const excludeIds = new Set([
      req.userId,
      ...(friendsOut || []).map(r => r.friend_id),
      ...(reqRows    || []).map(r => r.receiver_id),
    ]);

    let query = supabase
      .from('users')
      .select('id, username, display_name, fandoms, bias, city, bio, avatar_url, proof_score, is_vip, now_playing')
      .eq('discoverable', true)
      .neq('id', req.userId)
      .limit(80);

    if (city_key) query = query.eq('city_key', city_key);  // exact normalized match (Hub detail)
    else if (city) query = query.ilike('city', `%${city}%`);
    if (fandom) query = query.contains('fandoms', [fandom]);

    const { data: candidates } = await query;

    const scored = (candidates || [])
      .filter(u => !excludeIds.has(u.id))
      .map(u => {
        let score = 0;
        const uFandoms = Array.isArray(u.fandoms) ? u.fandoms : [];
        score += uFandoms.filter(f => myFandoms.includes(f)).length * 3;
        if (myCity && (u.city || '').toLowerCase().includes(myCity)) score += 2;
        return { u, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ u }) => ({
        ...toPublicCard(u),
        bias: Array.isArray(u.bias) ? u.bias : (u.bias ? [u.bias] : []),
        now_playing: u.now_playing || null,
      }));

    res.json({ users: scored });
  } catch (err) {
    console.error('[GET /api/users/discover] Error:', err.message);
    res.json({ users: [] });
  }
});

// ─── MY CIRCLE (FRIENDS) ─────────────────────────────────────────────────────
// Two-step: no FK constraints on friends table, so we can't use PostgREST joins.
app.get('/api/friends', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ friends: [] });
  try {
    // Step 1: get accepted friend IDs
    const { data: rows, error: rowErr } = await supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', req.userId)
      .eq('status', 'accepted');
    if (rowErr) return res.status(500).json({ error: rowErr.message });

    const ids = (rows || []).map(r => r.friend_id).filter(Boolean);
    if (ids.length === 0) return res.json({ friends: [] });

    // Step 2: fetch public profile data for those IDs
    const { data: users, error: userErr } = await supabase
      .from('users')
      .select('id, username, display_name, fandoms, city, bio, avatar_url')
      .in('id', ids);
    if (userErr) return res.status(500).json({ error: userErr.message });

    res.json({ friends: (users || []).map(toPublicCard) });
  } catch (err) {
    console.error('[GET /api/friends] Error:', err.message);
    res.json({ friends: [] });
  }
});

// ─── FRIEND REQUESTS ──────────────────────────────────────────────────────────
function mapFriendRequest(row, profile, direction) {
  return {
    id: row.id,
    status: row.status,
    direction,
    created_at: row.created_at,
    responded_at: row.responded_at || null,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    user: profile || null,
  };
}

// Send a friend request
app.post('/api/friends/request', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  if (targetUserId === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  if (await isBlockedEitherWay(req.userId, targetUserId)) {
    return res.status(403).json({ error: 'blocked', message: 'You cannot send a request to this user.' });
  }
  try {
    const { data: existingFriend } = await supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', req.userId)
      .eq('friend_id', targetUserId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (existingFriend) return res.status(409).json({ error: 'Already friends', relationship: 'friends' });

    const { data: existingReq } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`and(sender_id.eq.${req.userId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${req.userId})`)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingReq) {
      const outgoing = existingReq.sender_id === req.userId;
      return res.json({ success: true, duplicate: true, relationship: outgoing ? 'requested' : 'incoming_request', request: existingReq });
    }

    // friend_requests has a UNIQUE(sender_id, receiver_id) constraint — a plain insert()
    // fails with a 23505 unique-violation the moment ANY row has ever existed for this
    // exact sender→receiver direction (cancelled, declined, even a long-since-removed
    // accepted one), silently blocking every future re-request forever. Upsert onto that
    // same constraint instead, explicitly resetting status/responded_at so a resend
    // after cancel/decline behaves like a fresh request.
    const { data: requestRow, error } = await supabase
      .from('friend_requests')
      .upsert(
        { sender_id: req.userId, receiver_id: targetUserId, status: 'pending', responded_at: null },
        { onConflict: 'sender_id,receiver_id' }
      )
      .select('*')
      .single();
    if (error) throw error;

    const actor = await getPublicUser(req.userId);
    const actorName = actor?.username || 'A Backstage fan';
    await deliverNotification({
      userId: targetUserId,
      type: 'friend_request_received',
      title: `${actorName} sent you a friend request`,
      body: 'Tap to review it in My Circle.',
      actorId: req.userId,
      entityId: requestRow.id,
      entityType: 'friend_request',
      targetModal: 'friends',
      channels: ['in_app', 'push', 'email'],
    });

    res.json({ success: true, relationship: 'requested', request: requestRow });
  } catch (err) {
    console.error('[POST /api/friends/request] Exception:', err.message);
    res.status(500).json({ error: 'Could not send request' });
  }
});

// Get incoming and outgoing friend requests
app.get('/api/friends/requests', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ incoming: [], outgoing: [], requests: [] });
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, sender_id, receiver_id, status, created_at, responded_at')
      .or(`sender_id.eq.${req.userId},receiver_id.eq.${req.userId}`)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const rows = data || [];
    const profiles = await getPublicUsersByIds(rows.map(r => r.sender_id === req.userId ? r.receiver_id : r.sender_id));
    const incoming = rows
      .filter(r => r.receiver_id === req.userId)
      .map(r => mapFriendRequest(r, profiles.get(r.sender_id), 'incoming'));
    const outgoing = rows
      .filter(r => r.sender_id === req.userId)
      .map(r => mapFriendRequest(r, profiles.get(r.receiver_id), 'outgoing'));
    res.json({ incoming, outgoing, requests: incoming });
  } catch (err) {
    console.error('[GET /api/friends/requests] Error:', err.message);
    res.json({ incoming: [], outgoing: [], requests: [] });
  }
});

// Accept or decline a friend request
app.patch('/api/friends/request/:requestId', requireAuth, async (req, res) => {
  const { action } = req.body; // 'accept' | 'decline' | 'cancel'
  if (!['accept', 'decline', 'cancel'].includes(action)) {
    return res.status(400).json({ error: "action must be 'accept', 'decline', or 'cancel'" });
  }
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    const { data: reqRow, error: fetchErr } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('id', req.params.requestId)
      .single();
    if (fetchErr || !reqRow) return res.status(404).json({ error: 'Request not found' });

    // Only the receiver can accept/decline; only the sender can cancel
    if (action === 'cancel'  && reqRow.sender_id   !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (action !== 'cancel'  && reqRow.receiver_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    if (action === 'accept') {
      // Write both directions into friends table.
      // The friends table has status='pending' as default — must explicitly set 'accepted'.
      // onConflict targets the unique(user_id, friend_id) constraint.
      await supabase.from('friends').upsert(
        { user_id: req.userId,        friend_id: reqRow.sender_id, status: 'accepted' },
        { onConflict: 'user_id,friend_id' }
      );
      await supabase.from('friends').upsert(
        { user_id: reqRow.sender_id, friend_id: req.userId,        status: 'accepted' },
        { onConflict: 'user_id,friend_id' }
      );
      const actor = await getPublicUser(req.userId);
      const actorName = actor?.username || 'A Backstage fan';
      await deliverNotification({
        userId: reqRow.sender_id,
        type: 'friend_request_accepted',
        title: `${actorName} accepted your friend request`,
        body: 'You are now connected in My Circle.',
        actorId: req.userId,
        entityId: reqRow.id,
        entityType: 'friend_request',
        targetModal: 'friends',
        channels: ['in_app', 'push', 'email'],
      });
    }

    await supabase
      .from('friend_requests')
      .update({ status: action === 'accept' ? 'accepted' : action === 'cancel' ? 'cancelled' : 'declined', responded_at: new Date().toISOString() })
      .eq('id', req.params.requestId);

    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/friends/request] Error:', err.message);
    res.status(500).json({ error: 'Could not update request' });
  }
});

async function handleFriendRequestAction(req, res, requestId, action, gif = null) {
  if (!requestId) return res.status(400).json({ error: 'requestId required' });
  if (!['accept', 'decline', 'cancel'].includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    const { data: reqRow, error: fetchErr } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('id', requestId)
      .single();
    if (fetchErr || !reqRow) return res.status(404).json({ error: 'Request not found' });
    if (action === 'cancel' && reqRow.sender_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (action !== 'cancel' && reqRow.receiver_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    if (action === 'accept') {
      await supabase.from('friends').upsert(
        { user_id: req.userId, friend_id: reqRow.sender_id, status: 'accepted' },
        { onConflict: 'user_id,friend_id' }
      );
      await supabase.from('friends').upsert(
        { user_id: reqRow.sender_id, friend_id: req.userId, status: 'accepted' },
        { onConflict: 'user_id,friend_id' }
      );
      const actor = await getPublicUser(req.userId);
      const actorName = actor?.username || 'A Backstage fan';
      await deliverNotification({
        userId: reqRow.sender_id,
        type: 'friend_request_accepted',
        title: `${actorName} accepted your friend request ✨`,
        body: 'You are now connected in My Circle.',
        actorId: req.userId,
        entityId: reqRow.id,
        entityType: 'friend_request',
        targetModal: 'friends',
        channels: ['in_app', 'push', 'email'],
        gif,
      });
    }

    await supabase
      .from('friend_requests')
      .update({ status: action === 'accept' ? 'accepted' : action === 'cancel' ? 'cancelled' : 'declined', responded_at: new Date().toISOString() })
      .eq('id', requestId);
    res.json({ success: true });
  } catch (err) {
    console.error(`[POST /api/friends/${action}] Error:`, err.message);
    res.status(500).json({ error: 'Could not update request' });
  }
}

app.post('/api/friends/accept', requireAuth, async (req, res) => handleFriendRequestAction(req, res, req.body?.requestId, 'accept', req.body?.gif || null));
app.post('/api/friends/decline', requireAuth, async (req, res) => handleFriendRequestAction(req, res, req.body?.requestId, 'decline'));
app.post('/api/friends/cancel', requireAuth, async (req, res) => handleFriendRequestAction(req, res, req.body?.requestId, 'cancel'));

// Remove someone from My Circle (bidirectional)
app.delete('/api/friends/:friendId', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    await supabase.from('friends').delete().eq('user_id', req.userId).eq('friend_id', req.params.friendId);
    await supabase.from('friends').delete().eq('user_id', req.params.friendId).eq('friend_id', req.userId);
    // Also clean up any open requests between the two
    await supabase.from('friend_requests')
      .delete()
      .or(`and(sender_id.eq.${req.userId},receiver_id.eq.${req.params.friendId}),and(sender_id.eq.${req.params.friendId},receiver_id.eq.${req.userId})`);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/friends] Error:', err.message);
    res.status(500).json({ error: 'Could not remove friend' });
  }
});

app.get('/api/users/badges', requireAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({ badges: [
      { id: 'concert_veteran', label: 'Concert Veteran', emoji: '🎤', earned: true,  count: 5 },
      { id: 'collector',       label: 'Collector',       emoji: '📸', earned: true,  count: 147 },
      { id: 'trader',          label: 'Trusted Trader',  emoji: '🔄', earned: true,  count: 23 },
      { id: 'traveling_fan',   label: 'Traveling Fan',   emoji: '✈️', earned: true,  count: 3 },
      { id: 'freebie_maker',   label: 'Freebie Maker',   emoji: '🎁', earned: false },
      { id: 'chant_master',    label: 'Chant Master',    emoji: '🎵', earned: false },
    ]});
  }
  const { data } = await supabase.from('users').select('trade_count, proof_score').eq('id', req.userId).single();
  res.json({ badges: [], user: data });
});

app.get('/api/users/trust', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ score: 4.8, reviews: 23, level: 'Trusted Trader', mock: true });
  const { data } = await supabase.from('users').select('proof_score, trade_count').eq('id', req.userId).single();
  res.json({ score: data?.proof_score || 0, reviews: data?.trade_count || 0, level: 'New Fan' });
});

app.post('/api/users/solo-mode', requireAuth, async (req, res) => {
  const { enabled } = req.body;
  if (MOCK_MODE) return res.json({ success: true, solo_mode: enabled, mock: true });
  const { error } = await supabase.from('users').update({ profile_style: { soloMode: enabled } }).eq('id', req.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, solo_mode: enabled });
});


// ═════════════════════════════════════════════════════════════════════════════
// TRADES
// ═════════════════════════════════════════════════════════════════════════════

app.get('/api/trades', optionalAuth, async (req, res) => {
  const { group, member, status } = req.query;
  if (MOCK_MODE) {
    return res.json({ trades: [
      { id: 't1', card: { group: 'Stray Kids', member: 'Felix', era: 'Maxident', type: 'SSP' }, user: 'helix.collector', wants: 'Han Miroh Season Greetings', condition: 'mint' },
      { id: 't2', card: { group: 'ATEEZ', member: 'Hongjoong', era: 'THE WORLD EP.FIN', type: 'holo' }, user: 'atiny.hj', wants: 'Any holo Yunho', condition: 'nm' },
    ], mock: true });
  }
  let query = supabase.from('trades').select('*, users(username, avatar_url, proof_score)').eq('status', status || 'available');
  if (group)  query = query.contains('card_data', { group });
  if (member) query = query.contains('card_data', { member });
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ trades: data });
});

app.post('/api/trades/offer', requireAuth, async (req, res) => {
  const { tradeId, offerCardData, message } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `offer_${Date.now()}` });
  const { data, error } = await supabase.from('trade_offers').insert({ trade_id: tradeId, sender_id: req.userId, offer_card_data: offerCardData, message }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, offer: data });
});

app.post('/api/trades/review', requireAuth, async (req, res) => {
  const { traderId, rating, comment } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const { error } = await supabase.from('trade_reviews').insert({ reviewer_id: req.userId, trader_id: traderId, rating, comment });
  if (error) return res.status(500).json({ error: error.message });
  await supabase.rpc('recalculate_proof_score', { user_id: traderId });
  res.json({ success: true });
});


// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS (Firebase FCM HTTP v1 — real push, not the deprecated legacy server key)
// ═════════════════════════════════════════════════════════════════════════════
//
// LIVE: admin.initializeApp() runs at startup when FIREBASE_SERVICE_ACCOUNT_JSON or
// FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY are set (see top of
// file). /api/save-token stores tokens in fcm_tokens. Both /api/send-notification
// below and the shared deliverNotification() helper call admin.messaging().send()
// for real device push, with data.{targetModal,targetTab,targetId} so the frontend's
// notificationclick handler can deep-link. If Firebase env vars are missing on Render,
// both gracefully report delivered:0 instead of throwing — see HAS_FIREBASE guards.
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/save-token', requireAuth, async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const { error } = await supabase.from('fcm_tokens').upsert({ user_id: req.userId, token, platform: platform || 'web', updated_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error: error.message });
  // A real Firebase token means push notifications are actually configured for this
  // device — drop any leftover mock-fcm-* rows for this user so send attempts don't
  // keep silently failing against tokens that were never real in the first place.
  if (!token.startsWith('mock-fcm-')) {
    await supabase.from('fcm_tokens').delete().eq('user_id', req.userId).like('token', 'mock-fcm-%');
  }
  res.json({ success: true });
});

// Deactivate push for a device: removes the caller's FCM token so deliverNotification()
// stops sending real device push. Called when a user turns off Push Notifications in
// Settings. Scoped to the authenticated caller's own rows — a token is only ever
// deleted for req.userId, never for anyone else, even if the body token belonged to
// another user. With a token, deletes just that device; without one, clears all the
// caller's tokens (belt-and-suspenders for a full opt-out).
app.delete('/api/save-token', requireAuth, async (req, res) => {
  const token = req.query.token || req.body?.token;
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  let q = supabase.from('fcm_tokens').delete().eq('user_id', req.userId);
  if (token) q = q.eq('token', token);
  const { error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/send-notification', requireAuth, async (req, res) => {
  // The frontend only ever calls this to push a notification to the currently
  // signed-in device (see deliverNotification() in App.jsx) — it never sends a
  // userId. Use the authenticated caller's id, not an absent req.body.userId,
  // otherwise the fcm_tokens lookup below always matches zero rows.
  const userId = req.userId;
  const { title, body, data } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });

  if (!HAS_FIREBASE || !admin.apps.length) {
    return res.json({ success: true, delivered: 0, note: 'Add FIREBASE_SERVICE_ACCOUNT_JSON to enable real push' });
  }

  try {
    const { delivered, failed } = await pushToUserTokens(userId, {
      notification: { title, body },
      data: {
        targetModal: data?.targetModal || '',
        targetTab:   data?.targetTab   || '',
        targetId:    data?.targetId    || '',
      },
      webpush: {
        fcmOptions: { link: process.env.FRONTEND_URL || '/' },
      },
    });
    if (failed) console.warn(`[send-notification] ${failed} token(s) failed delivery`);
    res.json({ success: true, delivered, failed });
  } catch (err) {
    console.error('[send-notification] Error:', err.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});


// ─── EMAIL HELPER ─────────────────────────────────────────────────────────────
// Uses Resend REST API (no new dependency — native fetch).
// Set RESEND_API_KEY + optional EMAIL_FROM on Render to enable real delivery.
// Without the key, every call is logged as a mock and returns ok:true.
app.get('/api/notifications', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ notifications: [], unread: 0, mock: true });
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, actor_id, entity_id, entity_type, read, target_modal, target_tab, created_at')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const actors = await getPublicUsersByIds((data || []).map(n => n.actor_id));
    const notifications = (data || []).map(n => toClientNotification({ ...n, actor: actors.get(n.actor_id) }));
    res.json({ notifications, unread: notifications.filter(n => !n.read).length });
  } catch (err) {
    console.error('[GET /api/notifications] Error:', err.message);
    res.status(500).json({ error: 'Could not load notifications', notifications: [] });
  }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/notifications/read] Error:', err.message);
    res.status(500).json({ error: 'Could not mark notification read' });
  }
});

async function sendBackstageEmail({ to, subject, html, text }) {
  if (!to) return { ok: false, reason: 'no_email' };
  if (!HAS_EMAIL) {
    console.log(`[Email Mock] To: ${to} | Subject: ${subject} | ${text || ''}`);
    return { ok: true, mock: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.warn('[Email] Resend error:', err);
      return { ok: false, reason: err };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[Email] Send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ─── EMAIL BACKUP FOR HIGH-PRIORITY NOTIFICATIONS ─────────────────────────────
// Called by the frontend when push is unavailable/disabled and the notification
// is high or critical priority. Sends a simple transactional email to the
// authenticated user's address.
app.post('/api/notifications/email-backup', requireAuth, async (req, res) => {
  const { title, body, priority } = req.body;
  const userEmail = req.userEmail;
  if (!userEmail) return res.json({ ok: false, reason: 'no_email' });
  if (priority !== 'high' && priority !== 'critical') return res.json({ ok: false, reason: 'low_priority' });

  const subject = title || 'You have a new notification from Backstage';
  const text    = body  || '';
  const appUrl  = process.env.FRONTEND_URL || 'https://backstagefanverse.com';
  const html = `
<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0d0d1a;color:#f0eaff;border-radius:12px">
  <div style="text-align:center;margin-bottom:20px">
    <span style="font-size:28px">🔔</span>
    <h2 style="color:#b993ff;margin:8px 0 4px;font-size:18px">${subject}</h2>
  </div>
  <p style="color:#c0b8d4;font-size:14px;line-height:1.6;text-align:center">${text}</p>
  <div style="text-align:center;margin-top:24px">
    <a href="${appUrl}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:12px 28px;border-radius:24px;font-size:14px;font-weight:600">Open Backstage</a>
  </div>
  <p style="text-align:center;margin-top:20px;font-size:11px;color:#6e6a7c">
    You're receiving this because push notifications are off on your device.<br>
    <a href="${appUrl}?settings=notifications" style="color:#b993ff">Manage notification settings</a>
  </p>
</div>`;

  const result = await sendBackstageEmail({ to: userEmail, subject, html, text });
  res.json(result);
});

// ═════════════════════════════════════════════════════════════════════════════
// MARKETPLACE & FAN PROJECTS
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/marketplace/listing', requireAuth, async (req, res) => {
  const { type, title, description, price, cardData, imageUrl } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `listing_${Date.now()}` });
  res.json({ success: true, note: 'Marketplace coming soon' });
});

app.get('/api/marketplace', optionalAuth, (req, res) => {
  res.json({ listings: [], note: 'Marketplace launching soon 🛍️', mock: true });
});

app.post('/api/projects/create', requireAuth, async (req, res) => {
  const { title, type, eventId, description, deliveryMethod } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `proj_${Date.now()}` });
  res.json({ success: true });
});

// ── Concert Capsule ─────────────────────────────────────────────────────────
// GET /api/capsule/:concertId/entries — public, returns recent 50.
// optionalAuth so a signed-in fan also gets liked_by_me; works signed-out too.
app.get('/api/capsule/:concertId/entries', optionalAuth, async (req, res) => {
  if (!supabase) return res.json({ entries: [], mock: true });
  try {
    const { data, error } = await supabase
      .from('capsule_entries')
      .select('id, concert_id, user_id, category, caption, username, created_at')
      .eq('concert_id', req.params.concertId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const entries = data || [];
    // Attach persisted like_count + liked_by_me (Phase 2 — likes were local-only before)
    const ids = entries.map(e => e.id);
    const countById = new Map();
    const mineSet = new Set();
    if (ids.length) {
      const { data: likeRows } = await supabase
        .from('capsule_entry_likes')
        .select('entry_id, user_id')
        .in('entry_id', ids);
      for (const r of (likeRows || [])) {
        countById.set(r.entry_id, (countById.get(r.entry_id) || 0) + 1);
        if (req.userId && r.user_id === req.userId) mineSet.add(r.entry_id);
      }
    }
    res.json({ entries: entries.map(e => ({ ...e, like_count: countById.get(e.id) || 0, liked_by_me: mineSet.has(e.id) })) });
  } catch (err) {
    console.error('[Capsule GET]', err.message);
    res.json({ entries: [], error: err.message });
  }
});

// POST /api/capsule/entries/:entryId/like — auth; idempotent like
app.post('/api/capsule/entries/:entryId/like', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const entryId = req.params.entryId;
  try {
    await supabase.from('capsule_entry_likes').upsert(
      { entry_id: entryId, user_id: req.userId },
      { onConflict: 'entry_id,user_id' }
    );
    const { count } = await supabase.from('capsule_entry_likes')
      .select('entry_id', { count: 'exact', head: true }).eq('entry_id', entryId);
    res.json({ ok: true, like_count: count || 0, liked_by_me: true });
  } catch (err) {
    console.error('[Capsule like]', err.message);
    res.status(500).json({ error: 'Failed to like' });
  }
});

// DELETE /api/capsule/entries/:entryId/like — auth; remove like
app.delete('/api/capsule/entries/:entryId/like', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const entryId = req.params.entryId;
  try {
    await supabase.from('capsule_entry_likes').delete()
      .eq('entry_id', entryId).eq('user_id', req.userId);
    const { count } = await supabase.from('capsule_entry_likes')
      .select('entry_id', { count: 'exact', head: true }).eq('entry_id', entryId);
    res.json({ ok: true, like_count: count || 0, liked_by_me: false });
  } catch (err) {
    console.error('[Capsule unlike]', err.message);
    res.status(500).json({ error: 'Failed to unlike' });
  }
});

// POST /api/capsule/:concertId/entries — auth required, free cap: 3/concert
app.post('/api/capsule/:concertId/entries', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ entry: null, mock: true });
  const { category, caption } = req.body;
  if (!caption?.trim()) return res.status(400).json({ error: 'caption required' });
  const concertId = req.params.concertId;
  try {
    // NB: select real columns only — a stale 'name' column here returned null for
    // the whole row, which (a) fell back to @stan and (b) treated VIPs as non-VIP,
    // wrongly capping paid users at the free 3-entry limit. Use display_name.
    const { data: usr } = await supabase
      .from('users')
      .select('is_vip, vip_source, vip_expires_at, username, display_name')
      .eq('id', req.userId)
      .single();

    if (!computeVipStatus(usr || {}).active) {
      const { count } = await supabase
        .from('capsule_entries')
        .select('id', { count: 'exact', head: true })
        .eq('concert_id', concertId)
        .eq('user_id', req.userId);
      if ((count || 0) >= 3) {
        return res.status(403).json({ error: 'free_limit', limit: 3 });
      }
    }

    const username = `@${usr?.username || usr?.display_name || 'stan'}`;
    const { data, error } = await supabase
      .from('capsule_entries')
      .insert({ concert_id: concertId, user_id: req.userId, category: category || 'fit', caption: caption.trim(), username })
      .select()
      .single();
    if (error) throw error;

    // Phase 2: notify prior contributors to this concert's capsule (fire-and-forget,
    // in-app only, capped) — "New moment shared in your concert capsule".
    (async () => {
      try {
        const { data: contributors } = await supabase
          .from('capsule_entries')
          .select('user_id')
          .eq('concert_id', concertId)
          .neq('user_id', req.userId)
          .limit(200);
        const uniq = [...new Set((contributors || []).map(c => c.user_id).filter(Boolean))].slice(0, 50);
        await Promise.allSettled(uniq.map(uid => deliverNotification({
          userId: uid,
          type: 'capsule',
          title: 'New moment in the capsule ✨',
          body: `${username} just shared a ${category || 'moment'}.`,
          actorId: req.userId,
          entityId: data.id,
          entityType: 'capsule_entry',
          targetModal: 'capsule',
          channels: ['in_app'],
        })));
      } catch (e) { console.warn('[Capsule notify]', e.message); }
    })();

    res.json({ entry: data });
  } catch (err) {
    console.error('[Capsule POST]', err.message);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// ── Group room chat (meetup group chats) — persisted ──────────────────────────
// Keyed by ChatRoom room.id (e.g. "meetup-<id>"). Any signed-in fan who can open
// the meetup can read/post — same openness as the previous mock chat. RSVP-gating
// is a future hardening if these rooms need to be private to attendees.
app.get('/api/rooms/:roomId/messages', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ messages: [], mock: true });
  try {
    const { data, error } = await supabase
      .from('room_messages')
      .select('id, room_id, user_id, username, body, created_at')
      .eq('room_id', req.params.roomId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) throw error;
    res.json({ messages: (data || []).map(m => ({ ...m, mine: m.user_id === req.userId })) });
  } catch (err) {
    console.error('[Rooms GET]', err.message);
    res.json({ messages: [], error: err.message });
  }
});

app.post('/api/rooms/:roomId/messages', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ message: null, mock: true });
  const body = (req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'body required' });
  if (body.length > 1000) return res.status(400).json({ error: 'too_long' });
  try {
    const { data: usr } = await supabase.from('users').select('username, display_name').eq('id', req.userId).single();
    const username = `@${usr?.username || usr?.display_name || 'fan'}`;
    const { data, error } = await supabase
      .from('room_messages')
      .insert({ room_id: req.params.roomId, user_id: req.userId, username, body })
      .select('id, room_id, user_id, username, body, created_at')
      .single();
    if (error) throw error;
    res.json({ message: { ...data, mine: true } });
  } catch (err) {
    console.error('[Rooms POST]', err.message);
    res.status(500).json({ error: 'Failed to send' });
  }
});

// ── Trade Reviews ─────────────────────────────────────────────────────────────
app.get('/api/trader-stats/:userId', async (req, res) => {
  if (!supabase) return res.json({ completed_trades: 0, positive: 0, negative: 0, is_trusted: false, mock: true });
  try {
    const uid = req.params.userId;
    const { data: user } = await supabase.from('users').select('trade_count, proof_score').eq('id', uid).single();
    const { data: reviews } = await supabase.from('trade_reviews').select('rating').eq('trader_id', uid);
    const pos = (reviews||[]).filter(r=>r.rating>0).length;
    const neg = (reviews||[]).filter(r=>r.rating<0).length;
    const completed = user?.trade_count || 0;
    res.json({ completed_trades: completed, positive: pos, negative: neg, is_trusted: completed >= 3 && neg === 0 });
  } catch (err) {
    console.error('[TraderStats]', err.message);
    res.json({ completed_trades:0, positive:0, negative:0, is_trusted:false });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// AI: ITINERARY — /api/ai/itinerary
// Called from TripPlanner AI View with rich preference fields.
// ═════════════════════════════════════════════════════════════════════════════
app.post('/api/ai/itinerary', aiLimiter, requireAuth, async (req, res) => {
  const { city, time, arrival, transport, budget, vibe, food } = req.body;

  const vibeLabel   = { solo:'solo fan', group:'with crew', couple:'date night', family:'family' }[vibe] || vibe || 'with crew';
  const arrivalNote = { 'early-morning':'arriving early morning', morning:'arriving morning', afternoon:'arriving afternoon', 'day-of':'arriving day-of' }[arrival] || arrival || 'morning';
  const foodPref    = { korean:'Korean food', local:'local eats', vegan:'vegan options', quick:'quick bites' }[food] || food || 'Korean food';

  const MOCK_ITINERARY = [
    { time:'8:30 AM',  emoji:'☀️', activity:'Morning fuel',              place:'Café near venue',          category:'Food',       tip:'Hydrate — it\'s a long day' },
    { time:'11:00 AM', emoji:'🍜', activity:'Pre-show lunch',            place:`${foodPref} spot nearby`,  category:'Food',       tip:'Go early — lines fill up fast on show days' },
    { time:'1:30 PM',  emoji:'🛍️', activity:'Merch & lightstick run',    place:'Venue merch area',          category:'Concert Day',tip:'Arrive 2+ hrs early for merch' },
    { time:'3:00 PM',  emoji:'🎁', activity:'Freebie exchange meetup',   place:'Fan meetup point',          category:'Concert Day',tip:'Check Fanverse for the exact spot' },
    { time:'5:00 PM',  emoji:'🚪', activity:'Queue at venue gates',      place:'Main entrance',             category:'Concert Day',tip:'Have your ticket QR saved offline' },
    { time: time || '8:00 PM', emoji:'🌟', activity:'✦ SHOWTIME 💜',    place:'Main venue floor',          category:'Concert Day',tip:'Lightstick charged? Chants ready?' },
    { time:'11:30 PM', emoji:'✨', activity:'After-show dessert run',    place:'Late-night café nearby',    category:'Food',       tip:'You deserve it 💜' },
  ];

  if (!HAS_AI) return res.json({ day: MOCK_ITINERARY, mock: true });

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1400,
      system: `You are a K-pop concert day planner expert. You know fan culture deeply — freebie exchanges, merch lines, KBBQ, fan meetups, and the emotional rhythm of a concert day.
Return ONLY valid JSON. No markdown, no code fences.
Output: { "day": [{ "time": string, "emoji": string, "activity": string, "place": string, "category": string, "tip": string }] }`,
      messages: [{
        role: 'user',
        content: `Build a full concert day itinerary for a K-pop fan.
City: ${city || 'Las Vegas'}
Concert time: ${time || '8:00 PM'}
Arrival: ${arrivalNote}
Transport: ${transport || 'rideshare'}
Budget: ${budget || 'moderate'}
Vibe: ${vibeLabel}
Food preference: ${foodPref}

Return 6-8 time-ordered stops: morning fuel, pre-show food, merch, fan meetup, gates, showtime, after-show. Make the tips fan-authentic and specific.`,
      }],
    });

    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(text);
    res.json(data);
  } catch (err) {
    console.error('[AI Itinerary] Error:', err.message);
    res.json({ day: MOCK_ITINERARY, mock: true });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// COLLECTION — /api/collection
// Stores user photocards, wishlist, binders as JSONB blobs in collections table.
// type = 'cards' | 'wishlist' | 'binders' | 'trackers'
// ═════════════════════════════════════════════════════════════════════════════
app.get('/api/collection', requireAuth, async (req, res) => {
  const { type = 'cards' } = req.query;

  if (!supabase) return res.json({ items: [], mock: true });

  try {
    const { data } = await supabase
      .from('collections')
      .select('items')
      .eq('user_id', req.userId)
      .eq('type', type)
      .maybeSingle();

    res.json({ items: data?.items || [], type });
  } catch (err) {
    console.error('[Collection GET] Error:', err.message);
    res.json({ items: [], mock: true });
  }
});

app.put('/api/collection', requireAuth, async (req, res) => {
  const { type = 'cards', items = [] } = req.body;

  if (!supabase) return res.json({ ok: true, mock: true });

  try {
    await supabase
      .from('collections')
      .upsert(
        { user_id: req.userId, type, items, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,type' }
      );
    res.json({ ok: true });
  } catch (err) {
    console.error('[Collection PUT] Error:', err.message);
    res.status(500).json({ error: 'Failed to save collection' });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// PHOTOCARD SYSTEM — /api/binders | /api/cards | /api/trade-listings
// ═════════════════════════════════════════════════════════════════════════════

// ── Binders ──────────────────────────────────────────────────────────────────
app.get('/api/binders', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ binders: [], mock: true });
  try {
    const { data, error } = await supabase
      .from('binders')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ binders: data || [] });
  } catch (err) {
    console.error('[Binders GET]', err.message);
    res.json({ binders: [], mock: true });
  }
});

app.post('/api/binders', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ binder: null, mock: true });
  const { name, group_name, cover_color, emoji } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { data, error } = await supabase
      .from('binders')
      .insert({ user_id: req.userId, name, group_name, cover_color, emoji })
      .select()
      .single();
    if (error) throw error;
    res.json({ binder: data });
  } catch (err) {
    console.error('[Binders POST]', err.message);
    res.status(500).json({ error: 'Failed to create binder' });
  }
});

app.delete('/api/binders/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  try {
    const { error } = await supabase
      .from('binders')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Binders DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete binder' });
  }
});

// ── User Cards ────────────────────────────────────────────────────────────────
app.get('/api/cards', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ cards: [], mock: true });
  const { binder_id, status } = req.query;
  try {
    let q = supabase
      .from('user_cards')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (binder_id) q = q.eq('binder_id', binder_id);
    if (status)    q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ cards: data || [] });
  } catch (err) {
    console.error('[Cards GET]', err.message);
    res.json({ cards: [], mock: true });
  }
});

app.post('/api/cards', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ card: null, mock: true });
  const { binder_id, group_name, album, era, member, version, card_type, description, status, quantity, condition, image_url, notes } = req.body;
  if (!group_name || !member) return res.status(400).json({ error: 'group_name and member required' });
  try {
    const { data, error } = await supabase
      .from('user_cards')
      .insert({ user_id: req.userId, binder_id, group_name, album, era, member, version, card_type, description, status: status || 'owned', quantity: quantity || 1, condition: condition || 'mint', image_url, notes })
      .select()
      .single();
    if (error) throw error;
    res.json({ card: data });
  } catch (err) {
    console.error('[Cards POST]', err.message);
    res.status(500).json({ error: 'Failed to add card' });
  }
});

app.patch('/api/cards/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const allowed = ['status','condition','image_url','notes','quantity','binder_id','member','album','era','version','description'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  updates.updated_at = new Date().toISOString();
  try {
    const { error } = await supabase
      .from('user_cards')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Cards PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

app.delete('/api/cards/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  try {
    const { error } = await supabase
      .from('user_cards')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Cards DELETE]', err.message);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

// ── Trade Listings ────────────────────────────────────────────────────────────
// Public feed — active listings from anyone
// Optional query params: ?group_name=BTS&trade_type=&city_key=san_antonio_tx_us&limit=50
// city_key: filters to listings from users in that normalized city (Hub detail use).
app.get('/api/trade-listings', async (req, res) => {
  if (!supabase) return res.json({ listings: [], mock: true });
  const { group_name, trade_type, city_key, limit: lim = 50 } = req.query;
  try {
    // When city_key provided: first resolve user IDs in that city (discoverable only)
    let cityUserIds = null;
    if (city_key) {
      const { data: cityUsers } = await supabase
        .from('users').select('id').eq('city_key', city_key).eq('discoverable', true);
      cityUserIds = (cityUsers || []).map(u => u.id);
      if (!cityUserIds.length) return res.json({ listings: [] });
    }

    let q = supabase
      .from('trade_listings')
      .select(`
        *,
        user_cards ( group_name, album, era, member, version, card_type, condition, image_url ),
        users:user_id ( username, display_name, avatar_url )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(lim), 100));
    if (trade_type)   q = q.eq('trade_type', trade_type);
    if (group_name)   q = q.eq('user_cards.group_name', group_name);
    if (cityUserIds)  q = q.in('user_id', cityUserIds);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ listings: data || [] });
  } catch (err) {
    console.error('[TradeListings GET]', err.message);
    res.json({ listings: [], mock: true });
  }
});

// My own listings
app.get('/api/trade-listings/mine', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ listings: [], mock: true });
  try {
    const { data, error } = await supabase
      .from('trade_listings')
      .select('*, user_cards ( group_name, album, era, member, version, condition, image_url )')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ listings: data || [] });
  } catch (err) {
    console.error('[TradeListings Mine GET]', err.message);
    res.json({ listings: [], mock: true });
  }
});

app.post('/api/trade-listings', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ listing: null, mock: true });
  const { card_id, proof_image_url, wants_description, trade_type, location, notes } = req.body;
  if (!card_id || !proof_image_url) return res.status(400).json({ error: 'card_id and proof_image_url required' });
  try {
    // Verify the card belongs to this user
    const { data: card } = await supabase.from('user_cards').select('id').eq('id', card_id).eq('user_id', req.userId).maybeSingle();
    if (!card) return res.status(403).json({ error: 'Card not found' });

    // Mark card as for_trade
    await supabase.from('user_cards').update({ status: 'for_trade', updated_at: new Date().toISOString() }).eq('id', card_id);

    const { data, error } = await supabase
      .from('trade_listings')
      .insert({ user_id: req.userId, card_id, proof_image_url, wants_description, trade_type: trade_type || 'any', location, notes })
      .select()
      .single();
    if (error) throw error;
    res.json({ listing: data });
  } catch (err) {
    console.error('[TradeListings POST]', err.message);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

app.patch('/api/trade-listings/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const allowed = ['status','wants_description','trade_type','location','notes'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  updates.updated_at = new Date().toISOString();
  try {
    const { error } = await supabase
      .from('trade_listings')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.userId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[TradeListings PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// ── Trade Reviews ─────────────────────────────────────────────────────────────
app.post('/api/trade-reviews', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const { listing_id, ratee_id, rating, notes } = req.body;
  if (!listing_id || !ratee_id || ![-1,1].includes(rating)) return res.status(400).json({ error: 'listing_id, ratee_id, and rating (1 or -1) required' });
  try {
    const { error } = await supabase
      .from('trade_reviews')
      .insert({ reviewer_id: req.userId, trader_id: ratee_id, rating, comment: notes });
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[TradeReviews POST]', err.message);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// ── Image Upload (presigned URL via Supabase Storage) ─────────────────────────
app.post('/api/cards/upload-url', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ url: null, mock: true });
  const { filename, content_type } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });
  const ext = filename.split('.').pop() || 'jpg';
  const path = `${req.userId}/${Date.now()}.${ext}`;
  try {
    const { data, error } = await supabase.storage
      .from('card-images')
      .createSignedUploadUrl(path);
    if (error) throw error;
    res.json({ signed_url: data.signedUrl, path, public_url: supabase.storage.from('card-images').getPublicUrl(path).data.publicUrl });
  } catch (err) {
    console.error('[Upload URL]', err.message);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CARD TEMPLATES — /api/card-templates | /api/binders/from-template
// ═════════════════════════════════════════════════════════════════════════════

const TEMPLATE_STATUS_LABELS = {
  backstage:     'Backstage Template',
  fan_submitted: 'Fan-Submitted · Needs review',
  verified:      'Verified Template',
  in_progress:   'In Progress',
  archived:      'Archived',
};

const TEMPLATE_COMPLETENESS_LABELS = {
  complete:          'Complete',
  may_include_gaps:  'May include gaps',
  partial:           'Partial',
  unknown:           'Unknown completeness',
};

// GET /api/card-templates — search/list templates (public, no auth required)
app.get('/api/card-templates', async (req, res) => {
  if (!supabase) return res.json({ templates: [], mock: true });
  const { group, album, status, q } = req.query;
  try {
    let query = supabase
      .from('card_templates')
      .select('*')
      .neq('status', 'archived')
      .order('group_name')
      .order('album_name');

    if (group)  query = query.ilike('group_name', `%${group}%`);
    if (album)  query = query.ilike('album_name', `%${album}%`);
    if (status) query = query.eq('status', status);
    if (q)      query = query.or(`group_name.ilike.%${q}%,album_name.ilike.%${q}%,era.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    const templates = (data || []).map(t => ({
      ...t,
      status_label:       TEMPLATE_STATUS_LABELS[t.status]      || t.status,
      completeness_label: TEMPLATE_COMPLETENESS_LABELS[t.completeness] || t.completeness,
      last_updated_fmt:   t.last_updated ? new Date(t.last_updated).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : null,
    }));
    res.json({ templates });
  } catch (err) {
    console.error('[CardTemplates GET]', err.message);
    res.json({ templates: [], mock: true });
  }
});

// GET /api/card-templates/:id — template + its cards
app.get('/api/card-templates/:id', async (req, res) => {
  if (!supabase) return res.json({ template: null, cards: [], mock: true });
  try {
    const [{ data: tmpl, error: te }, { data: cards, error: ce }] = await Promise.all([
      supabase.from('card_templates').select('*').eq('id', req.params.id).single(),
      supabase.from('template_cards').select('*').eq('template_id', req.params.id).order('sort_order'),
    ]);
    if (te) throw te;
    const template = {
      ...tmpl,
      status_label:       TEMPLATE_STATUS_LABELS[tmpl.status]      || tmpl.status,
      completeness_label: TEMPLATE_COMPLETENESS_LABELS[tmpl.completeness] || tmpl.completeness,
      last_updated_fmt:   tmpl.last_updated ? new Date(tmpl.last_updated).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : null,
    };
    res.json({ template, cards: cards || [] });
  } catch (err) {
    console.error('[CardTemplates/:id GET]', err.message);
    res.status(404).json({ error: 'Template not found' });
  }
});

// POST /api/card-templates — fan-submitted template
app.post('/api/card-templates', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ template: null, mock: true });
  const { group_name, album_name, era, release_year, cover_emoji, cover_color, notes } = req.body;
  if (!group_name || !album_name) return res.status(400).json({ error: 'group_name and album_name required' });
  try {
    const { data, error } = await supabase
      .from('card_templates')
      .insert({
        group_name, album_name, era, release_year,
        cover_emoji: cover_emoji || '🃏',
        cover_color,
        notes,
        status:       'fan_submitted',
        completeness: 'unknown',
        source_label: 'Fan-Submitted · Needs review',
        created_by:   req.userId,
        last_updated: new Date().toISOString(),
      })
      .select().single();
    if (error) throw error;
    res.json({ template: data });
  } catch (err) {
    console.error('[CardTemplates POST]', err.message);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// POST /api/card-templates/:id/cards — add card to a template
app.post('/api/card-templates/:id/cards', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ card: null, mock: true });
  const { member_name, card_name, card_type, version, store_source, notes } = req.body;
  if (!member_name && !card_name) return res.status(400).json({ error: 'member_name or card_name required' });
  try {
    const { data: tmpl } = await supabase.from('card_templates').select('group_name, album_name, era').eq('id', req.params.id).single();
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });

    const { data, error } = await supabase.from('template_cards')
      .insert({ template_id: req.params.id, group_name: tmpl.group_name, member_name, album_name: tmpl.album_name, era: tmpl.era, card_name, card_type: card_type || 'album', version, store_source, notes })
      .select().single();
    if (error) throw error;

    // Increment card_count
    await supabase.rpc('increment_card_count', { template_id_input: req.params.id }).catch(() => {
      supabase.from('card_templates').update({ card_count: supabase.raw('card_count + 1'), last_updated: new Date().toISOString() }).eq('id', req.params.id);
    });

    res.json({ card: data });
  } catch (err) {
    console.error('[TemplateCards POST]', err.message);
    res.status(500).json({ error: 'Failed to add card to template' });
  }
});

// POST /api/binders/from-template — create binder + user_cards from template
app.post('/api/binders/from-template', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ binder: null, mock: true });
  const { template_id } = req.body;
  if (!template_id) return res.status(400).json({ error: 'template_id required' });

  try {
    // Fetch template + cards
    const [{ data: tmpl }, { data: cards }] = await Promise.all([
      supabase.from('card_templates').select('*').eq('id', template_id).single(),
      supabase.from('template_cards').select('*').eq('template_id', template_id).order('sort_order'),
    ]);
    if (!tmpl) return res.status(404).json({ error: 'Template not found' });

    // Check for existing binder from same template to prevent accidental duplicates
    const { data: existing } = await supabase
      .from('binders')
      .select('id, name')
      .eq('user_id', req.userId)
      .ilike('name', `${tmpl.group_name}%${tmpl.album_name}%`)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({ error: `You already have a binder for ${tmpl.group_name} — ${tmpl.album_name}`, existing_binder_id: existing.id });
    }

    // Create binder
    const { data: binder, error: binderErr } = await supabase
      .from('binders')
      .insert({
        user_id:    req.userId,
        name:       `${tmpl.group_name} — ${tmpl.album_name}`,
        group_name: tmpl.group_name,
        cover_color: tmpl.cover_color,
        emoji:       tmpl.cover_emoji || '🃏',
      })
      .select().single();
    if (binderErr) throw binderErr;

    // Create user_cards from template_cards, all status = missing
    if (cards?.length) {
      const userCards = cards.map(tc => ({
        user_id:    req.userId,
        binder_id:  binder.id,
        group_name: tc.group_name,
        album:      tc.album_name,
        era:        tc.era,
        member:     tc.member_name || tc.card_name,
        version:    tc.version,
        card_type:  tc.card_type || 'album',
        description: tc.card_name,
        status:     'missing',
      }));
      const { error: cardsErr } = await supabase.from('user_cards').insert(userCards);
      if (cardsErr) throw cardsErr;
    }

    res.json({ binder, card_count: cards?.length || 0 });
  } catch (err) {
    console.error('[BinderFromTemplate POST]', err.message);
    res.status(500).json({ error: 'Failed to create binder from template' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TRADE FLOW V2 — listing_offers | listing_messages | listing_reports
// ═════════════════════════════════════════════════════════════════════════════

// Helper: verify current user is a party to this offer (sender or lister)
async function getOfferAndVerifyParty(offerId, userId) {
  const { data: offer } = await supabase
    .from('listing_offers')
    .select('*, trade_listings!listing_id(user_id)')
    .eq('id', offerId)
    .single();
  if (!offer) return null;
  const isParty = offer.sender_id === userId || offer.trade_listings?.user_id === userId;
  return isParty ? { ...offer, listerId: offer.trade_listings?.user_id } : null;
}

// ── Get my offers (received on my listings + sent by me) ──────────────────────
app.get('/api/listing-offers', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ offers: [], mock: true });
  try {
    // Offers sent by me
    const { data: sent } = await supabase
      .from('listing_offers')
      .select(`*, trade_listings!listing_id(id, user_id, card_id, wants_description, proof_image_url, trade_type, location, user_cards!card_id(group_name, member, album, era, condition, image_url)), sender_card:sender_card_id(group_name, member, album, era, condition)`)
      .eq('sender_id', req.userId)
      .neq('status', 'declined')
      .order('created_at', { ascending: false });

    // Offers received on my listings
    const { data: received } = await supabase
      .from('listing_offers')
      .select(`*, trade_listings!listing_id(id, user_id, card_id, wants_description, proof_image_url, trade_type, location, user_cards!card_id(group_name, member, album, era, condition, image_url)), sender_card:sender_card_id(group_name, member, album, era, condition), sender:sender_id(id, username, display_name, proof_score, trade_count)`)
      .in('listing_id',
        (await supabase.from('trade_listings').select('id').eq('user_id', req.userId)).data?.map(l=>l.id) || []
      )
      .neq('status', 'declined')
      .order('created_at', { ascending: false });

    const sentTagged    = (sent    || []).map(o => ({ ...o, role: 'sender' }));
    const receivedTagged = (received || []).map(o => ({ ...o, role: 'lister' }));
    const all = [...sentTagged, ...receivedTagged].sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
    res.json({ offers: all });
  } catch (err) {
    console.error('[ListingOffers GET]', err.message);
    res.json({ offers: [], mock: true });
  }
});

// ── Make offer on a listing ───────────────────────────────────────────────────
app.post('/api/listing-offers', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ offer: null, mock: true });
  const { listing_id, sender_card_id, message } = req.body;
  if (!listing_id) return res.status(400).json({ error: 'listing_id required' });

  try {
    // Can't offer on own listing
    const { data: listing } = await supabase.from('trade_listings').select('user_id').eq('id', listing_id).single();
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.user_id === req.userId) return res.status(400).json({ error: 'Cannot offer on your own listing' });

    // Check for existing pending/accepted offer from same user
    const { data: existing } = await supabase.from('listing_offers').select('id,status').eq('listing_id', listing_id).eq('sender_id', req.userId).in('status',['pending','accepted','in_progress']).maybeSingle();
    if (existing) return res.status(409).json({ error: 'You already have an active offer on this listing' });

    const { data, error } = await supabase.from('listing_offers')
      .insert({ listing_id, sender_id: req.userId, sender_card_id, message })
      .select().single();
    if (error) throw error;

    // Move listing to pending
    await supabase.from('trade_listings').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', listing_id);

    // Notify the lister that they received an offer (fire-and-forget). The UI has
    // always promised "the other fan gets notified" but no notification was emitted.
    // Routes to the collect tab (Trade Hub) where incoming offers are reviewed.
    (async () => {
      try {
        const { data: me } = await supabase.from('users').select('username, display_name').eq('id', req.userId).single();
        const who = `@${me?.username || me?.display_name || 'a fan'}`;
        await deliverNotification({
          userId: listing.user_id,
          type: 'trade',
          title: 'New trade offer 🃏',
          body: `${who} made an offer on your listing.`,
          actorId: req.userId,
          entityId: data.id,
          entityType: 'listing_offer',
          targetModal: null,
          targetTab: 'collect',
          channels: ['in_app', 'push'],
        });
      } catch (e) { console.warn('[ListingOffers notify]', e.message); }
    })();

    res.json({ offer: data });
  } catch (err) {
    console.error('[ListingOffers POST]', err.message);
    res.status(500).json({ error: 'Failed to create offer' });
  }
});

// ── Update offer state (accept/decline/cancel/proof/tracking/confirm) ─────────
app.patch('/api/listing-offers/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const offer = await getOfferAndVerifyParty(req.params.id, req.userId);
  if (!offer) return res.status(403).json({ error: 'Not found or not a party' });

  const { action, value } = req.body;
  const isLister = req.userId === offer.listerId;
  const isSender = req.userId === offer.sender_id;
  const updates = { updated_at: new Date().toISOString() };

  try {
    switch (action) {
      case 'accept':
        if (!isLister) return res.status(403).json({ error: 'Only the lister can accept' });
        if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer is not pending' });
        updates.status = 'accepted';
        break;

      case 'decline':
        if (!isLister) return res.status(403).json({ error: 'Only the lister can decline' });
        updates.status = 'declined';
        // Restore listing to active if no other active offers exist
        await restoreListingIfEmpty(offer.listing_id, req.params.id);
        break;

      case 'cancel':
        if (!['pending','accepted','in_progress'].includes(offer.status)) return res.status(400).json({ error: 'Cannot cancel in current state' });
        updates.status = 'cancelled';
        await restoreListingIfEmpty(offer.listing_id, req.params.id);
        break;

      case 'sender_proof':
        if (!isSender) return res.status(403).json({ error: 'Only sender can set sender proof' });
        if (!value) return res.status(400).json({ error: 'value (url) required' });
        updates.sender_proof_url = value;
        if (offer.status === 'accepted') updates.status = 'in_progress';
        break;

      case 'lister_proof':
        if (!isLister) return res.status(403).json({ error: 'Only lister can set lister proof' });
        if (!value) return res.status(400).json({ error: 'value (url) required' });
        updates.lister_proof_url = value;
        if (offer.status === 'accepted') updates.status = 'in_progress';
        break;

      case 'sender_tracking':
        if (!isSender) return res.status(403).json({ error: 'Only sender can set sender tracking' });
        updates.sender_tracking = value;
        break;

      case 'lister_tracking':
        if (!isLister) return res.status(403).json({ error: 'Only lister can set lister tracking' });
        updates.lister_tracking = value;
        break;

      case 'confirm': {
        const confirmField = isSender ? 'sender_confirmed' : 'lister_confirmed';
        updates[confirmField] = true;
        // Check if both now confirmed
        const otherConfirmed = isSender ? offer.lister_confirmed : offer.sender_confirmed;
        if (otherConfirmed) {
          updates.status = 'completed';
          // Mark listing completed
          await supabase.from('trade_listings').update({ status:'completed', updated_at:new Date().toISOString() }).eq('id', offer.listing_id);
          // Mark both cards as no longer for_trade
          if (offer.sender_card_id) await supabase.from('user_cards').update({ status:'owned', updated_at:new Date().toISOString() }).eq('id', offer.sender_card_id);
          const { data: listing } = await supabase.from('trade_listings').select('card_id').eq('id', offer.listing_id).single();
          if (listing?.card_id) await supabase.from('user_cards').update({ status:'owned', updated_at:new Date().toISOString() }).eq('id', listing.card_id);
          // Increment trade counts (atomic RPC — supabase-js v2 has no .raw())
          await supabase.rpc('increment_trade_count', { target_user_id: req.userId });
          await supabase.rpc('increment_trade_count', { target_user_id: isSender ? offer.listerId : offer.sender_id });
        }
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    const { error } = await supabase.from('listing_offers').update(updates).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[ListingOffers PATCH]', err.message);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

async function restoreListingIfEmpty(listingId, excludeOfferId) {
  if (!supabase) return;
  const { data } = await supabase.from('listing_offers').select('id').eq('listing_id', listingId).in('status',['pending','accepted','in_progress']).neq('id', excludeOfferId);
  if (!data?.length) await supabase.from('trade_listings').update({ status:'active', updated_at:new Date().toISOString() }).eq('id', listingId);
}

// ── Messages ──────────────────────────────────────────────────────────────────
app.get('/api/listing-offers/:id/messages', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ messages: [], mock: true });
  const offer = await getOfferAndVerifyParty(req.params.id, req.userId);
  if (!offer) return res.status(403).json({ error: 'Not found or not a party' });
  try {
    const { data } = await supabase.from('listing_messages')
      .select('*, sender:sender_id(id, username, display_name)')
      .eq('offer_id', req.params.id)
      .order('created_at', { ascending: true });
    res.json({ messages: data || [] });
  } catch (err) {
    console.error('[Messages GET]', err.message);
    res.json({ messages: [], mock: true });
  }
});

app.post('/api/listing-offers/:id/messages', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ message: null, mock: true });
  const offer = await getOfferAndVerifyParty(req.params.id, req.userId);
  if (!offer) return res.status(403).json({ error: 'Not found or not a party' });
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'body required' });
  try {
    const { data, error } = await supabase.from('listing_messages')
      .insert({ offer_id: req.params.id, sender_id: req.userId, body: body.trim() })
      .select('*, sender:sender_id(id, username, display_name)').single();
    if (error) throw error;
    res.json({ message: data });
  } catch (err) {
    console.error('[Messages POST]', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────────
// Compatibility alias — Trade Hub UI still posts here. Internally routed into
// moderation_reports (type:'trade') so trade reports surface in the admin
// Moderation Queue alongside user/post reports instead of a separate, invisible table.
app.post('/api/listing-reports', requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true, mock: true });
  const { listing_id, offer_id, reported_user_id, reason, notes } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'reason required' });
  try {
    let targetHandle = null;
    if (listing_id) {
      const { data: listing } = await supabase.from('trade_listings')
        .select('user_id, users(username)').eq('id', listing_id).maybeSingle();
      targetHandle = listing?.users?.username ? `@${listing.users.username}` : null;
    }
    const entry = {
      reporter_id: req.userId,
      type: 'trade',
      target_id: listing_id ? String(listing_id).slice(0, 64) : (offer_id ? String(offer_id).slice(0, 64) : null),
      target_handle: targetHandle,
      reason: String(reason).slice(0, 120),
      detail: notes ? String(notes).slice(0, 500) : null,
      created_at: new Date().toISOString(),
      status: 'pending',
    };
    const { error } = await supabase.from('moderation_reports').insert(entry);
    if (error) throw error;
    res.json({ ok: true, reported: true });
  } catch (err) {
    console.error('[Reports POST]', err.message);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING — must be registered AFTER every route. When this 404 catch-all
// sat mid-file it silently shadowed every route defined below it (cards, binders,
// collection, card-image upload, trade-listings, card-templates, listing-offers,
// AI itinerary), forcing those features to fall back to localStorage.
// ═════════════════════════════════════════════════════════════════════════════

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// START
// ═════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n🎫 Backstage API v1.16.0 running on port ${PORT}`);
  console.log(`🗺️  Health: http://localhost:${PORT}/api/health\n`);
});

export default app;
