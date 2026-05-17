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
import 'dotenv/config';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── ENV FLAGS ─────────────────────────────────────────────────────────────────
const MOCK_MODE    = process.env.MOCK_MODE === 'true' || !process.env.SUPABASE_URL;
const HAS_STRIPE   = !!process.env.STRIPE_SECRET_KEY;
const HAS_AI       = !!process.env.ANTHROPIC_API_KEY;
const HAS_FIREBASE = !!process.env.FIREBASE_PROJECT_ID;
const HAS_SPOTIFY  = !!process.env.SPOTIFY_CLIENT_ID && !!process.env.SPOTIFY_CLIENT_SECRET;
const HAS_MAPBOX   = !!process.env.MAPBOX_ACCESS_TOKEN;

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
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
    status:       'ok',
    version:      '1.16.0',
    app:          'Backstage × Fanverse',
    mock_mode:    MOCK_MODE,
    has_ai:       HAS_AI,
    has_stripe:   HAS_STRIPE,
    has_firebase: HAS_FIREBASE,
    has_spotify:  HAS_SPOTIFY,
    has_mapbox:   HAS_MAPBOX,
    timestamp:    new Date().toISOString(),
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

  const MOCK_OUTFIT = {
    title:      `${group || 'Fandom'} ${vibe === 'dark' ? 'Dark Era' : vibe === 'soft' ? 'Soft Glam' : 'Concert'} Fit`,
    subtitle:   'Built for your concert night ✦',
    confidence: 94,
    items: [
      vibe === 'dark'  ? 'Cropped black oversized hoodie' :
      vibe === 'soft'  ? 'Lavender satin halter top' :
      vibe === 'cozy'  ? 'Warm cream knit sweater' :
      vibe === 'bold'  ? 'Structured colorblock jacket' : 'Satin mini dress',
      vibe === 'dark'  ? 'Pleated micro-mini skirt (black)' :
      vibe === 'soft'  ? 'Wide-leg cream trousers' :
      vibe === 'cozy'  ? 'Ribbed jogger pants' : 'High-waist flare jeans',
      vibe === 'dark'  ? 'Chunky platform combat boots' :
      vibe === 'soft'  ? 'Strappy heeled sandals' :
      vibe === 'cozy'  ? 'Platform sneakers' : 'Clear heeled mules',
      vibe === 'dark'  ? 'Silver chains + black rings stack' :
      vibe === 'soft'  ? 'Pearl hair clips + layered necklaces' :
      vibe === 'cozy'  ? 'Fuzzy bag + scrunchie set' : 'Bold cuff + earrings',
      `${group || 'Group'} lightstick or mini merch keychain`,
    ],
    colors: [
      vibe === 'dark'  ? 'Midnight Black' :
      vibe === 'soft'  ? 'Soft Lavender' :
      vibe === 'cozy'  ? 'Warm Cream' : 'Pearl White',
      vibe === 'dark'  ? 'Accent: Deep Violet' : 'Accent: Blush Pink',
    ],
    tags: [
      vibe === 'dark'  ? '🌙 Night Show' : '✨ Soft Glam',
      season === 'summer' ? '☀️ Weather Ready' :
      season === 'winter' ? '🧥 Layer Up' : '🌸 Seasonal',
      '💜 Fan-coded',
    ],
    tip: vibe === 'dark'
      ? `Pro tip: Add a sheer overlay for the encore — keeps the fit clean without losing drama.`
      : `Pro tip: Pack a mini mirror in your fan bag. You will want to fix your lip gloss after the lightstick wave.`,
    accessories: [
      'Mini fan cross-body bag',
      `${group || 'Fandom'}-coded button pins`,
      'Portable charger holder strap',
    ],
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
// CRITICAL RULE: Never return invented chant text. Verified or nothing.
app.post('/api/ai/chant-helper', aiLimiter, requireAuth, async (req, res) => {
  const { query, song, group } = req.body;
  const songName  = song  || query || 'Miroh';
  const groupName = group || 'Stray Kids';

  if (!HAS_AI) {
    return res.json({
      result: `Verified fan chant for "${songName}" by ${groupName}:\n\nChant data requires the AI key to be active. In mock mode, practice by following fan chant PDFs on r/${groupName.replace(/\s+/g,'')} or fandom wikis.\n\nTip: YouTube "[song name] fanchant guide" for audio references.`,
      mock: true,
    });
  }

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 700,
      system: `You are a K-pop fan chant guide assistant.
CRITICAL RULES:
1. ONLY provide fanchants that are widely documented and verified in the fandom community.
2. If you are NOT CERTAIN a specific fanchant is real and accurate, say so explicitly.
3. NEVER invent, approximate, or guess fanchant text. Wrong chants embarrass fans at concerts.
4. If uncertain, say "I don't have verified chant data" and provide resources instead.
5. Return plain text — not JSON.`,
      messages: [{
        role: 'user',
        content: `Provide the verified fanchant guide for "${songName}" by ${groupName}. If you're not certain, say so and list where fans can find it.`,
      }],
    });

    res.json({ result: response.content[0].text });
  } catch (err) {
    console.error('[AI Chant] Error:', err.message);
    res.status(500).json({ result: 'Chant helper temporarily unavailable. Please try again.' });
  }
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
app.get('/api/subscriptions/status', requireAuth, async (req, res) => {
  if (MOCK_MODE) return res.json({ is_vip: false, mock: true });
  try {
    const { data, error } = await supabase
      .from('users')
      .select('is_vip, vip_since, stripe_customer_id')
      .eq('id', req.userId)
      .single();
    if (error) throw error;
    res.json({ is_vip: data?.is_vip || false, vip_since: data?.vip_since });
  } catch (err) {
    console.error('[Subscription Status] Error:', err.message);
    res.json({ is_vip: false });
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
app.post('/api/subscriptions/checkout', requireAuth, async (req, res) => {
  const { plan, priceId } = req.body;

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

  try {
    const session = await stripe.checkout.sessions.create({
      mode:       plan === 'founder' ? 'payment' : 'subscription',
      line_items: [{ price: PRICE_MAP[plan] || priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}?payment=success&plan=${plan}`,
      cancel_url:  `${process.env.FRONTEND_URL}?payment=cancelled`,
      metadata:    { userId: req.userId, plan },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[Subscriptions Checkout] Error:', err.message);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// Legacy alias — keep this so any old references still work
app.post('/api/stripe/checkout', requireAuth, async (req, res) => {
  req.url = '/api/subscriptions/checkout';
  // Forward to subscriptions handler
  const { plan, priceId } = req.body;
  if (!HAS_STRIPE) {
    return res.json({ mock: true, url: null, message: 'Stripe not configured.' });
  }
  try {
    const session = await stripe.checkout.sessions.create({
      mode:       plan === 'founder' ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}?payment=success&plan=${plan}`,
      cancel_url:  `${process.env.FRONTEND_URL}?payment=cancelled`,
      metadata:    { userId: req.userId, plan },
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: 'Could not create checkout session' });
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
      const { userId, plan } = session.metadata;
      if (userId && supabase) {
        await supabase.from('users').update({
          is_vip: true,
          vip_since: new Date().toISOString(),
          stripe_customer_id: session.customer,
        }).eq('id', userId);
        console.log(`[Stripe] VIP activated: user=${userId} plan=${plan}`);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      if (supabase) {
        await supabase.from('users').update({ is_vip: false })
          .eq('stripe_customer_id', sub.customer);
        console.log(`[Stripe] VIP revoked: customer=${sub.customer}`);
      }
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
    redirect_uri:  `${process.env.FRONTEND_URL}/api/music/spotify/callback`,
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
        redirect_uri: `${process.env.FRONTEND_URL}/api/music/spotify/callback`,
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
// EVENTS (Ticketmaster-ready)
// ═════════════════════════════════════════════════════════════════════════════

const MOCK_EVENTS = [
  { id: 'e1', title: 'Stray Kids DOMINATEE World Tour', date: '2025-05-30', city: 'Dallas', venue: 'Moody Center', group: 'Stray Kids', fandom: 'STAY', going: 2341, image: null },
  { id: 'e2', title: 'ATEEZ THE FELLOWSHIP: BREAK THE WALL', date: '2025-06-15', city: 'Los Angeles', venue: 'Kia Forum', group: 'ATEEZ', fandom: 'ATINY', going: 1892, image: null },
  { id: 'e3', title: 'TWICE 5TH WORLD TOUR: READY TO BE', date: '2025-06-28', city: 'New York', venue: 'Prudential Center', group: 'TWICE', fandom: 'ONCE', going: 3102, image: null },
  { id: 'e4', title: 'aespa MY WORLD TOUR', date: '2025-07-12', city: 'Chicago', venue: 'United Center', group: 'aespa', fandom: 'MY', going: 2780, image: null },
];

app.get('/api/events', optionalAuth, async (req, res) => {
  const { city, group, fandom } = req.query;

  if (MOCK_MODE) {
    let events = MOCK_EVENTS;
    if (city)   events = events.filter(e => e.city.toLowerCase().includes(city.toLowerCase()));
    if (group)  events = events.filter(e => e.group.toLowerCase().includes(group.toLowerCase()));
    if (fandom) events = events.filter(e => e.fandom.toLowerCase().includes(fandom.toLowerCase()));
    return res.json({ events, mock: true });
  }

  try {
    // TODO: Ticketmaster API
    // const TM_KEY = process.env.TICKETMASTER_API_KEY;
    // const tmRes = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?keyword=${group}&classificationName=K-Pop&apikey=${TM_KEY}`);
    // const tmData = await tmRes.json();
    const { data, error } = await supabase.from('events').select('*').order('date', { ascending: true }).limit(50);
    if (error) throw error;
    res.json({ events: data });
  } catch (err) {
    console.error('[Events] Error:', err.message);
    res.json({ events: MOCK_EVENTS, mock: true });
  }
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
  const { data, error } = await supabase.from('users').select('*').eq('id', req.userId).single();
  if (error) return res.status(404).json({ error: 'User not found' });
  res.json(data);
});

app.post('/api/profile/update', requireAuth, async (req, res) => {
  const { username, bio, city, fandoms, bias, nowPlaying, profileStyle, discoverable } = req.body;
  if (MOCK_MODE) return res.json({ success: true, mock: true });
  const updates = {};
  if (username      !== undefined) updates.username       = username;
  if (bio           !== undefined) updates.bio            = bio;
  if (city          !== undefined) updates.city           = city;
  if (fandoms       !== undefined) updates.fandoms        = fandoms;
  if (bias          !== undefined) updates.bias           = bias;
  if (nowPlaying    !== undefined) updates.now_playing    = nowPlaying;
  if (profileStyle  !== undefined) updates.profile_style  = profileStyle;
  if (discoverable  !== undefined) updates.discoverable   = discoverable;
  const { error } = await supabase.from('users').update(updates).eq('id', req.userId);
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
  // TODO: Wire Firebase Admin SDK
  // import admin from 'firebase-admin';
  // const { data: tokens } = await supabase.from('fcm_tokens').select('token').eq('user_id', userId);
  // for (const { token } of tokens) { await admin.messaging().send({ token, notification: { title, body }, data }); }
  res.json({ success: true, note: 'Wire FIREBASE_SERVICE_ACCOUNT_JSON to enable push' });
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
// START
// ═════════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`\n🎫 Backstage API v1.16.0 running on port ${PORT}`);
  console.log(`🗺️  Health: http://localhost:${PORT}/api/health\n`);
});

export default app;
