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
import 'dotenv/config';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── ENV FLAGS ─────────────────────────────────────────────────────────────────
const MOCK_MODE          = process.env.MOCK_MODE === 'true' || !process.env.SUPABASE_URL;
const HAS_STRIPE         = !!process.env.STRIPE_SECRET_KEY;
const HAS_AI             = !!process.env.ANTHROPIC_API_KEY;
const HAS_FIREBASE       = !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_PROJECT_ID);
const HAS_SPOTIFY        = !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;
const HAS_MAPBOX         = !!process.env.MAPBOX_ACCESS_TOKEN;
const HAS_TICKETMASTER   = !!process.env.TICKETMASTER_API_KEY;
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
console.log(`[Backstage API] AI: ${HAS_AI ? '✓' : '✗'} | Stripe: ${HAS_STRIPE ? '✓' : '✗'} | Spotify: ${HAS_SPOTIFY ? '✓' : '✗'} | Mapbox: ${HAS_MAPBOX ? '✓' : '✗'}`);

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
    return next();
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session' });
  req.userId    = user.id;
  req.userEmail = user.email;
  next();
}

async function optionalAuth(req, res, next) {
  if (MOCK_MODE) { req.userId = null; return next(); }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  const { data: { user } } = await supabase.auth.getUser(token);
  req.userId = user?.id || null;
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
    has_spotify:         HAS_SPOTIFY,
    has_mapbox:          HAS_MAPBOX,
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
// SAFETY RULE: NEVER call Anthropic for chant text generation.
// AI cannot reliably produce accurate fanchants — wrong chants embarrass fans.
// Only serve text that exists in VERIFIED_CHANT_INDEX below.
// For all other queries return resource-only guidance.

// Add entries here ONLY after manually verifying against an official fanchant source.
// Format: 'normalized-song-name': { type:'verified', result:'...' }
const VERIFIED_CHANT_INDEX = {};

// Normalize common shorthand and aliases before lookup.
const CHANT_ALIASES = {
  'bwl':               'boy with luv',
  'boy w luv':         'boy with luv',
  'boy w/ luv':        'boy with luv',
  '작은것들을 위한 시': 'boy with luv',
  'ptd':               'permission to dance',
  'lgb':               'life goes on',
  'god\'s menu':       'gods menu',
  'gods menu':         'gods menu',
  'next lvl':          'next level',
};

// Songs we can recognize but have not yet verified chant text for.
// Used to give a more specific "not verified yet" message vs "never heard of it".
const KNOWN_SONGS = new Set([
  'boy with luv','dynamite','butter','permission to dance','life goes on',
  'on','black swan','mikrokosmos','dna','fake love','idol','spring day',
  'film out','telepathy','fly to my room','blue & grey','yet to come',
  'miroh','gods menu','back door','thunderous','maniac','circus','case 143',
  'victory song','s-class','lalalala',
  'savage','next level','drama','whiplash','spicy','supernova',
  'ditto','hype boy','attention','cookie','omg','super shy','new jeans','asap',
  'left & right','very nice','thanks','aju nice','clap','home',
  'pink venom','shut down','lovesick girls','ice cream','as if its your last',
  '2.0',
]);

function _chantSafeResult(rawQuery) {
  const normalized = CHANT_ALIASES[rawQuery] || rawQuery;

  // 1. Verified index match
  if (VERIFIED_CHANT_INDEX[normalized]) return VERIFIED_CHANT_INDEX[normalized];

  // 2. Recognized but not yet verified
  const display = normalized.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (KNOWN_SONGS.has(normalized)) {
    return {
      type: 'not_verified',
      result: `We don't have verified chant data for "${display}" yet.\n\nTo find the official fanchant:\n• YouTube — search "${display} fanchant guide"\n• The group's official fandom wiki or fan cafe\n• Reddit (r/bangtan, r/StrayKids, r/aespa, etc.)\n• Trusted fansites with chant PDFs`,
    };
  }

  // 3. Unrecognized — still safe resource guidance, no invented text
  if (!rawQuery) {
    return { type: 'not_verified', result: 'Please enter a song name to look up fanchant guidance.' };
  }
  return {
    type: 'not_verified',
    result: `We don't have verified chant data for "${display}" yet.\n\nTo find the official fanchant:\n• YouTube — search "${display} fanchant guide"\n• The group's official fandom wiki\n• Reddit fandom communities\n• Trusted fansites`,
  };
}

app.post('/api/ai/chant-helper', aiLimiter, requireAuth, async (req, res) => {
  const { query, song } = req.body;
  const rawQuery = (song || query || '').toLowerCase().trim();
  // No Anthropic call — AI must not generate fanchant text.
  res.json(_chantSafeResult(rawQuery));
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
app.post('/api/ai/assistant', aiLimiter, requireAuth, async (req, res) => {
  const { message, context } = req.body;

  if (!HAS_AI) {
    return res.json({
      response: `Hey! I'm Backstage AI 💜 I help with outfit ideas, fanchant guides, trip planning, and fan meetups. What do you need?`,
      mock: true,
    });
  }

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: `You are Backstage AI — the built-in assistant for the Backstage K-pop fandom app. You help fans with: outfit ideas, fanchant guides (only verified — never invent text), trip planning, photocard collecting, fan meetup advice, and general K-pop lifestyle questions. Speak warmly, like a fellow fan. Keep responses concise (2-4 sentences max unless asked for more). Context about this user: ${JSON.stringify(context || {})}`,
      messages: [{ role: 'user', content: message }],
    });
    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('[AI Assistant] Error:', err.message);
    res.status(500).json({ response: 'AI temporarily unavailable. Try again in a moment! 💜' });
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS / VIP — /api/subscriptions/*
// V16: These routes now exist. Frontend was calling them but they were missing.
// ═════════════════════════════════════════════════════════════════════════════

// GET VIP status for current user
// Response includes vip_source and vip_expires_at when present so the
// frontend isVipActive() helper can handle both paid and comped VIP.
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
  // No auth token (called before session loads) — return safe free-tier default
  if (!req.userId) return res.json({ is_vip: false, plan: null, status: 'free' });
  if (MOCK_MODE)   return res.json({ is_vip: false, plan: null, status: 'free', mock: true });
  try {
    const { data, error } = await supabase
      .from('users')
      .select('is_vip, vip_since, vip_source, vip_expires_at, stripe_customer_id')
      .eq('id', req.userId)
      .single();
    if (error) throw error;
    // Determine effective VIP: paid Stripe OR active comp grant
    const compActive = data?.vip_source === 'comped' &&
      (!data?.vip_expires_at || new Date(data.vip_expires_at) > new Date());
    const effectiveVip = data?.is_vip === true || compActive;
    res.json({
      is_vip:         effectiveVip,
      plan:           effectiveVip ? 'vip' : null,
      status:         effectiveVip ? 'active' : 'free',
      vip_since:      data?.vip_since,
      vip_source:     data?.vip_source || null,
      vip_expires_at: data?.vip_expires_at || null,
    });
  } catch (err) {
    console.error('[Subscription Status] Error:', err.message);
    res.json({ is_vip: false, plan: null, status: 'free' });
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

    console.log(`[Reconcile] ✓ VIP activated for ${userId} (${userEmail}) via Stripe reconciliation. plan=${paid.metadata?.plan} session=${paid.id}`);
    res.json({ reconciled: true, vip_source: vipPayload.vip_source, vip_since: vipPayload.vip_since });

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
          } else {
            console.warn(`[Stripe Webhook] VIP email-fallback: 0 rows matched. event=${eventId} email=${session.customer_email}`);
          }
        } catch (err) {
          console.error(`[Stripe Webhook] VIP email-fallback exception: event=${eventId} error=${err.message}`);
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

// Apple Music — returns MusicKit developer token
app.post('/api/music/connect/apple', requireAuth, (req, res) => {
  // Apple Music requires MusicKit JS on frontend + a signed developer token
  // Set APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, APPLE_MUSIC_PRIVATE_KEY in env
  const hasApple = !!process.env.APPLE_MUSIC_TEAM_ID;

  if (!hasApple) {
    return res.json({
      mock: true,
      connected: false,
      message: 'Apple Music integration coming soon. Add APPLE_MUSIC_TEAM_ID + APPLE_MUSIC_KEY_ID + APPLE_MUSIC_PRIVATE_KEY.',
      developer_token: null,
    });
  }

  // TODO: Sign JWT with Apple Music private key
  // import jwt from 'jsonwebtoken';
  // const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY.replace(/\\n/g, '\n');
  // const token = jwt.sign({}, privateKey, { algorithm: 'ES256', expiresIn: '180d',
  //   issuer: process.env.APPLE_MUSIC_TEAM_ID, header: { alg: 'ES256', kid: process.env.APPLE_MUSIC_KEY_ID } });
  // res.json({ developer_token: token });

  res.json({ message: 'Apple Music token generation: wire jwt + APPLE_MUSIC_PRIVATE_KEY' });
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
      .select('now_playing, spotify_access_token')
      .eq('id', req.userId).single();

    // If Spotify token exists, fetch live
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

    // Fallback to manual now_playing
    res.json({ ...user?.now_playing, source: 'manual' });
  } catch (err) {
    res.json({ song: 'Whiplash', artist: 'aespa', source: 'manual', mock: true });
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
// EVENTS
// ═════════════════════════════════════════════════════════════════════════════
//
// CURRENT STATE (Phase 1):
//   - Frontend ConcertsPage renders MOCK_CONCERTS directly (not this route).
//   - This route exists but is NOT called by the frontend yet.
//   - Mock fallback returns MOCK_EVENTS (outdated 2025 test data).
//
// PHASE 2 PLAN — wire frontend ConcertsPage to this route:
//   1. Frontend calls GET /api/events?groups=BTS,aespa (from user.fandoms)
//   2. Backend queries Supabase events table OR Ticketmaster Discovery API
//   3. Merge with manually-confirmed events (e.g. Vegas BTS ARIRANG)
//   4. Return ranked by user's fandoms
//
// PHASE 3 PLAN — Ticketmaster integration:
//   Required env: TICKETMASTER_API_KEY (server-side only, never frontend)
//   Endpoint: https://app.ticketmaster.com/discovery/v2/events.json
//     ?classificationName=K-Pop&keyword={group}&apikey={TICKETMASTER_API_KEY}
//   Sync strategy: nightly cron → populate supabase.from('events') table
//   Frontend never calls Ticketmaster directly — always through this proxy.
// ═════════════════════════════════════════════════════════════════════════════

const MOCK_EVENTS = [
  { id: 'e1', title: 'Stray Kids DOMINATEE World Tour', date: '2025-05-30', city: 'Dallas', venue: 'Moody Center', group: 'Stray Kids', fandom: 'STAY', going: 2341, image: null },
  { id: 'e2', title: 'ATEEZ THE FELLOWSHIP: BREAK THE WALL', date: '2025-06-15', city: 'Los Angeles', venue: 'Kia Forum', group: 'ATEEZ', fandom: 'ATINY', going: 1892, image: null },
  { id: 'e3', title: 'TWICE 5TH WORLD TOUR: READY TO BE', date: '2025-06-28', city: 'New York', venue: 'Prudential Center', group: 'TWICE', fandom: 'ONCE', going: 3102, image: null },
  { id: 'e4', title: 'aespa MY WORLD TOUR', date: '2025-07-12', city: 'Chicago', venue: 'United Center', group: 'aespa', fandom: 'MY', going: 2780, image: null },
];

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
    const TM_KEY   = process.env.TICKETMASTER_API_KEY;
    const keywords = requestedGroups.length ? requestedGroups : (group ? [group] : ['K-Pop']);
    try {
      const tmResults = await Promise.all(
        keywords.map(kw =>
          fetch(
            `https://app.ticketmaster.com/discovery/v2/events.json` +
            `?classificationName=K-Pop&keyword=${encodeURIComponent(kw)}` +
            `&apikey=${TM_KEY}&locale=en-us&size=20&sort=date,asc`
          ).then(r => r.ok ? r.json() : null).catch(() => null)
        )
      );
      for (const tmData of tmResults) {
        const items = tmData?._embedded?.events || [];
        for (const e of items) {
          const venue  = e._embedded?.venues?.[0];
          const date   = e.dates?.start?.localDate;
          collected.push({
            id:                 e.id,
            title:              e.name,
            group:              e.classifications?.[0]?.genre?.name || 'K-Pop',
            city:               venue ? `${venue.city?.name}, ${venue.state?.stateCode}` : '',
            venue:              venue?.name || '',
            date,
            verificationStatus: 'confirmed',
            sourceType:         'ticketmaster',
            url:                e.url,
          });
        }
      }
    } catch (err) {
      console.error('[Events TM] Error:', err.message);
    }
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

  const offset = (page - 1) * limit;
  let query = supabase.from('posts').select('*, users(username, avatar_url)').order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (type)   query = query.eq('type', type);
  if (fandom) query = query.eq('tag', fandom);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ posts: data, page: parseInt(page), hasMore: data.length === parseInt(limit) });
});

app.post('/api/feed/post', requireAuth, async (req, res) => {
  const { content, type, tag, imageUrl } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
  if (MOCK_MODE) return res.json({ success: true, mock: true, post: { id: `p_${Date.now()}`, content, type, tag } });
  const { data, error } = await supabase.from('posts').insert({ user_id: req.userId, content, type: type || 'general', tag, image_url: imageUrl }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, post: data });
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
});


// ═════════════════════════════════════════════════════════════════════════════
// MEETUPS
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/meetups/create', requireAuth, async (req, res) => {
  const { eventId, type, title, location, time, capacity, vibe, ageRestriction, entryType, notes } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true, id: `mt_${Date.now()}`, title });
  const { data, error } = await supabase.from('meetups').insert({
    event_id: eventId, host_id: req.userId, type: type || 'general',
    title, location, time, capacity: capacity || 50, vibe,
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

app.get('/api/meetups', optionalAuth, async (req, res) => {
  const { eventId, city, type } = req.query;
  if (MOCK_MODE) {
    return res.json({ meetups: [
      { id: 'mt1', type: 'freebie', title: 'ATINY Freebie Exchange', location: 'Parking Lot B', time: '5:00 PM', going: 47, capacity: 100, host: 'atinyworld_official' },
      { id: 'mt2', type: 'afterparty', title: 'STAY After Party 🪩', location: 'Sound Nightclub', time: '11:30 PM', going: 203, capacity: 300, vibe: 'club', ageRestriction: '21+' },
    ], mock: true });
  }
  let query = supabase.from('meetups').select('*, users(username, avatar_url), meetup_rsvps(count)');
  if (eventId) query = query.eq('event_id', eventId);
  if (type)    query = query.eq('type', type);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ meetups: data });
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
      bias: 'Felix', is_vip: false, proof_score: 4.8, mock: true,
    });
  }
  try {
    const { data, error } = await supabase.from('users').select('*').eq('id', req.userId).single();

    // Row exists — return it
    if (data && !error) return res.json(data);

    // Row missing (new user / trigger didn't fire) — create it from Supabase Auth data
    if (!data || error?.code === 'PGRST116') {
      const usernameBase = (req.userEmail || '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() || 'fan';
      const newUser = {
        id:           req.userId,
        email:        req.userEmail || '',
        username:     usernameBase,
        display_name: usernameBase,
        bio:          '',
        city:         '',
        fandoms:      [],
        bias:         '',
        is_vip:       false,
        proof_score:  0,
      };
      const { data: created, error: insertErr } = await supabase.from('users').upsert(newUser).select('*').single();
      if (insertErr) {
        console.error('[GET /api/users/me] Auto-create failed:', insertErr.message);
        return res.status(500).json({ error: 'Could not create user profile', detail: insertErr.message });
      }
      return res.json(created);
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
  "ateez","hongjoong","seonghwa","yunho","yeosang","san","mingi","wooyoung","jongho",
  "straykids","stray_kids","bang_chan","bangchan","leeknoow","leeknow","changbin",
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
const isBackendReservedUsername = (name) => {
  if (!name || typeof name !== 'string') return false;
  return BACKEND_RESERVED_USERNAMES.has(name.toLowerCase().replace(/[^a-z0-9_]/g,''));
};

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
  const { username, handle, displayName, display_name, backstage_name, favorite_groups, fandoms, bias, city, bio } = req.body;
  const usernameValue = username ?? handle;
  const displayNameValue = displayName ?? display_name ?? backstage_name ?? usernameValue;
  const groupsInput = Array.isArray(favorite_groups) ? favorite_groups : fandoms;

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
      city:         city         ?? 'Dallas',
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
    if (usernameValue     !== undefined) updates.username      = usernameValue;
    if (displayNameValue  !== undefined) updates.display_name  = displayNameValue;
    if (fandomsClean !== undefined) updates.fandoms        = fandomsClean;
    if (bias         !== undefined) updates.bias           = bias;
    if (city         !== undefined) updates.city           = city;
    if (bio          !== undefined) updates.bio            = bio;

    const { data, error } = await supabase
      .from('users')
      .upsert(updates, { onConflict: 'id' })
      .select('id, username, display_name, fandoms, bias, city, bio, is_vip')
      .single();

    if (error) {
      console.error('[PATCH /api/users/me] DB error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log('[PATCH /api/users/me] updated fandoms for', req.userId, ':', data.fandoms);
    res.json({ ...data, handle:data.username, backstage_name:data.display_name, favorite_groups:data.fandoms, onboarding_complete:true, profile_complete:true });
  } catch (err) {
    console.error('[PATCH /api/users/me] Exception:', err.message);
    // Never crash the frontend — return a safe partial response so
    // localStorage fallback can still proceed with the onboarding profile.
    res.json({ id: req.userId, fandoms: fandomsClean, favorite_groups:fandomsClean, bias, city, username:usernameValue, handle:usernameValue, display_name:displayNameValue, backstage_name:displayNameValue, onboarding_complete:true, profile_complete:true, patched: true });
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
    // Friends table — remove both directions (user_id and friend_id)
    await supabase.from('friends').delete().eq('user_id', userId);
    await supabase.from('friends').delete().eq('friend_id', userId);
    // 2. Remove user-created content
    await supabase.from('concert_memories').delete().eq('user_id', userId);
    await supabase.from('scrapbooks').delete().eq('user_id', userId);
    await supabase.from('collections').delete().eq('user_id', userId);
    await supabase.from('posts').delete().eq('user_id', userId);
    // 3. Trades — delete offers and reviews; trades themselves may be retained
    //    for platform integrity (anonymized — no user ID reference after user row gone)
    await supabase.from('trade_offers').delete().eq('user_id', userId);
    await supabase.from('trade_reviews').delete().eq('reviewer_id', userId);
    await supabase.from('trade_reviews').delete().eq('reviewee_id', userId);
    // 4. Delete the main user record
    await supabase.from('users').delete().eq('id', userId);
    // 5. Delete the Supabase auth user (requires service role key)
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

// ─── PUBLIC CARD HELPER ──────────────────────────────────────────────────────
// Returns only safe public fields — never exposes email or phone.
function toPublicCard(u) {
  const groups = Array.isArray(u.fandoms) ? u.fandoms : [];
  const handle = u.username || '';
  const displayName = u.display_name || handle || 'Backstage fan';
  return {
    id: u.id,
    handle,
    username: handle,
    display_name: displayName,
    backstage_name: displayName,
    favorite_groups: groups,
    fandoms: groups,
    avatar: String(displayName || handle || 'B').trim().slice(0, 1).toUpperCase(),
    city: u.city || '',
    bio: u.bio || '',
    proof_score: u.proof_score || null,
    is_vip: u.is_vip || false,
  };
}

app.get('/api/users/search', requireAuth, async (req, res) => {
  const raw = String(req.query.q || '').trim();
  // Normalize: strip leading @, lowercase, collapse whitespace
  const q = raw.replace(/^@/, '').toLowerCase().replace(/\s+/g, ' ');
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

    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, fandoms, avatar_url, city, bio, proof_score, is_vip')
      .or(orClause)
      .limit(10);

    if (error) {
      console.error('[GET /api/users/search] DB error:', error.message);
      return res.status(500).json({ error: 'Search unavailable' });
    }

    res.json({ users: (data || []).filter(u => u.id !== req.userId).map(toPublicCard) });
  } catch (err) {
    console.error('[GET /api/users/search] Exception:', err.message);
    res.status(500).json({ error: 'Search unavailable' });
  }
});

app.post('/api/profile/update', requireAuth, async (req, res) => {
  const { username, bio, city, fandoms, bias, nowPlaying, profileStyle, discoverable } = req.body;
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
  if (city          !== undefined) updates.city           = city;
  if (fandoms       !== undefined) updates.fandoms        = fandoms;
  if (bias          !== undefined) updates.bias           = bias;
  if (nowPlaying    !== undefined) updates.now_playing    = nowPlaying;
  if (profileStyle  !== undefined) updates.profile_style  = profileStyle;
  if (discoverable  !== undefined) updates.discoverable   = discoverable;
  const { error } = await supabase.from('users').upsert(updates, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/profile/top-groups', requireAuth, async (req, res) => {
  const { topGroups } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const { error } = await supabase.from('users').update({ profile_style: { topGroups } }).eq('id', req.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get('/api/profile/:id', optionalAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({
      id: req.params.id, username: 'jennie.stays',
      bio: 'STAY since 2018 · Felix wrecker · Photocard addict',
      city: 'Los Angeles', fandoms: ['Stray Kids', 'ATEEZ', 'TWICE'],
      bias: 'Felix', avatar_url: null, proof_score: 4.8, is_vip: true, mock: true,
    });
  }
  const fields = req.userId === req.params.id
    ? '*'
    : 'id, username, bio, fandoms, bias, avatar_url, proof_score, is_vip, profile_style';
  const { data, error } = await supabase.from('users').select(fields).eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  res.json(data);
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

// ─── FRIEND SUGGESTIONS ───────────────────────────────────────────────────────
// Returns up to 10 users who share fandoms, city, or joined recently.
// Never returns users already in the requester's circle.
app.get('/api/friends/suggested', requireAuth, async (req, res) => {
  if (MOCK_MODE) {
    return res.json({ users: [
      { id:'mock_merci',  username:'mercilicious21', display_name:'Merci',       fandoms:['BTS'],        city:'San Antonio', bio:'ARMY since 2020' },
      { id:'mock_stay2',  username:'stay.mia',      display_name:'Mia',         fandoms:['Stray Kids'], city:'Houston',     bio:'Felix wrecker' },
      { id:'mock_twice1', username:'oncejisoo',     display_name:'Ji',          fandoms:['TWICE'],      city:'Austin',      bio:'Nayeon bias' },
    ].map(toPublicCard) });
  }
  try {
    // Fetch caller's fandoms + city
    const { data: me } = await supabase
      .from('users').select('fandoms, city').eq('id', req.userId).single();
    const myFandoms = me?.fandoms || [];
    const myCity   = (me?.city || '').toLowerCase();

    // Fetch IDs already in circle so we can exclude them
    const { data: circleRows } = await supabase
      .from('friends').select('friend_id').eq('user_id', req.userId).eq('status', 'accepted');
    const circleIds = (circleRows || []).map(r => r.friend_id);

    // Query candidates — shared fandoms first, fall back to recent signups
    let { data: candidates } = await supabase
      .from('users')
      .select('id, username, display_name, fandoms, city, bio, proof_score, is_vip')
      .neq('id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!candidates) candidates = [];

    // Score each candidate (higher = more relevant)
    const scored = candidates
      .filter(u => !circleIds.includes(u.id))
      .map(u => {
        let score = 0;
        const uFandoms = Array.isArray(u.fandoms) ? u.fandoms : [];
        const sharedFandoms = uFandoms.filter(f => myFandoms.includes(f));
        score += sharedFandoms.length * 3;
        if (myCity && (u.city || '').toLowerCase().includes(myCity.split(',')[0].trim())) score += 2;
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
// Send a friend request
app.post('/api/friends/request', requireAuth, async (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  if (targetUserId === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  try {
    const { error } = await supabase.from('friend_requests').upsert({
      sender_id: req.userId,
      receiver_id: targetUserId,
      status: 'pending',
    }, { onConflict: 'sender_id,receiver_id', ignoreDuplicates: false });
    if (error) {
      console.error('[POST /api/friends/request] DB error:', error.message);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/friends/request] Exception:', err.message);
    res.status(500).json({ error: 'Could not send request' });
  }
});

// Get incoming friend requests
app.get('/api/friends/requests', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ requests: [] });
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, sender_id, status, created_at')
      .eq('receiver_id', req.userId)
      .eq('status', 'pending');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ requests: data || [] });
  } catch (err) {
    res.json({ requests: [] });
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
    }

    await supabase
      .from('friend_requests')
      .update({ status: action === 'accept' ? 'accepted' : action === 'cancel' ? 'cancelled' : 'declined' })
      .eq('id', req.params.requestId);

    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/friends/request] Error:', err.message);
    res.status(500).json({ error: 'Could not update request' });
  }
});

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
// NOTIFICATIONS (Firebase FCM)
// ═════════════════════════════════════════════════════════════════════════════
//
// CURRENT STATE:
//   In-app notifications work via localStorage (backstage_notif_inbox).
//   /api/save-token stores FCM tokens in Supabase fcm_tokens table.
//   /api/send-notification is a stub — Firebase Admin SDK not wired.
//   firebase-messaging-sw.js does NOT exist in public/ yet.
//
// TO ENABLE REAL PUSH (FCM HTTP v1 — NOT the deprecated legacy server key):
//   1. npm install firebase-admin on the backend.
//   2. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
//      from your Firebase service account JSON (never commit this file).
//   3. Initialize: admin.initializeApp({ credential: admin.credential.cert({ ... }) })
//   4. Wire /api/send-notification to admin.messaging().send({ token, notification, data })
//   5. Push `data` payload should include: { targetModal, targetTab, targetId }
//      so the frontend click handler can deep-link into the right screen.
//   6. Frontend needs firebase-messaging-sw.js in public/ and VAPID key in .env.
//
// WHY HTTP v1 (not legacy):
//   Legacy FCM server key approach is deprecated as of June 2024.
//   HTTP v1 uses OAuth2 service account credentials — more secure.
// ═════════════════════════════════════════════════════════════════════════════

app.post('/api/save-token', requireAuth, async (req, res) => {
  const { token, platform } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const { error } = await supabase.from('fcm_tokens').upsert({ user_id: req.userId, token, platform: platform || 'web', updated_at: new Date().toISOString() });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/send-notification', requireAuth, async (req, res) => {
  const { userId, title, body, data } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });

  if (!HAS_FIREBASE || !admin.apps.length) {
    return res.json({ success: true, delivered: 0, note: 'Add FIREBASE_SERVICE_ACCOUNT_JSON to enable real push' });
  }

  try {
    const { data: rows, error } = await supabase
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', userId);

    if (error) throw error;
    if (!rows?.length) return res.json({ success: true, delivered: 0 });

    const results = await Promise.allSettled(
      rows.map(({ token }) =>
        admin.messaging().send({
          token,
          notification: { title, body },
          data: {
            targetModal: data?.targetModal || '',
            targetTab:   data?.targetTab   || '',
            targetId:    data?.targetId    || '',
          },
          webpush: {
            fcmOptions: { link: process.env.FRONTEND_URL || '/' },
          },
        })
      )
    );

    const delivered = results.filter(r => r.status === 'fulfilled').length;
    const failed    = results.filter(r => r.status === 'rejected').length;
    if (failed) console.warn(`[send-notification] ${failed} token(s) failed delivery`);
    res.json({ success: true, delivered, failed });
  } catch (err) {
    console.error('[send-notification] Error:', err.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
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


// ═════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
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
// START
// ═════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n🎫 Backstage API v1.16.0 running on port ${PORT}`);
  console.log(`🗺️  Health: http://localhost:${PORT}/api/health\n`);
});

export default app;
