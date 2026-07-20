// ─── TELEMETRY — PostHog (product analytics) + Sentry (error monitoring) ──────
//
// One module wrapping both so the rest of the app never imports either SDK
// directly. Every export is a no-op when the corresponding env var is missing,
// so local dev and any environment without keys behaves exactly as before.
//
// PRIVACY RULES (deliberate — do not loosen without a real reason):
//  1. NEVER send post text, comment text, DM content, or any user-authored copy.
//     Events carry ids, counts, and enum-ish labels only.
//  2. Users are identified by their Supabase user id. Never email, never username.
//  3. PostHog session recording is OFF. This app renders private DMs and a
//     fan's real location — recording would capture both.
//  4. PostHog autocapture is OFF. Autocapture scrapes clicked element text,
//     which on this app means post and message content. Explicit events only.
//  5. Sentry sendDefaultPii is false, and request bodies/headers are scrubbed
//     before send.

// Sentry is imported statically: it has to be live before first paint to catch
// boot-time errors. PostHog is loaded DYNAMICALLY after the app is interactive —
// it's ~75KB gzip and nothing about analytics needs to block the first render.
// Events fired before it finishes loading are queued, not dropped.
import * as Sentry from '@sentry/react';

let posthog = null;
const preloadQueue = [];

const PH_KEY  = import.meta.env.VITE_POSTHOG_KEY;
const PH_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const APP_ENV = import.meta.env.VITE_APP_ENV || (import.meta.env.DEV ? 'development' : 'production');
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

let phReady = false;
let sentryReady = false;

// Query strings on this app can carry a Stripe session id and Supabase auth
// fragments. Strip anything sensitive before it reaches either service.
const SENSITIVE_PARAMS = ['access_token','refresh_token','token','code','session_id','apikey'];
function scrubUrl(raw) {
  try {
    const u = new URL(raw);
    let touched = false;
    for (const p of SENSITIVE_PARAMS) if (u.searchParams.has(p)) { u.searchParams.set(p, 'REDACTED'); touched = true; }
    if (u.hash && /(access_token|refresh_token)=/.test(u.hash)) { u.hash = '#REDACTED'; touched = true; }
    return touched ? u.toString() : raw;
  } catch { return raw; }
}

// Pulls posthog-js in as its own chunk once the main thread is free, then drains
// anything that was queued while it loaded.
function loadPostHogWhenIdle() {
  const start = async () => {
    try {
      const mod = await import('posthog-js');
      const ph = mod.default || mod;
      ph.init(PH_KEY, {
        api_host: PH_HOST,
        // See PRIVACY RULES above — both of these are off on purpose.
        autocapture: false,
        disable_session_recording: true,
        capture_pageview: false,   // SPA: we send screen events ourselves
        capture_pageleave: true,
        persistence: 'localStorage',
        mask_all_element_attributes: true,
        mask_all_text: true,
        sanitize_properties: (props) => {
          if (props.$current_url) props.$current_url = scrubUrl(props.$current_url);
          if (props.$referrer)    props.$referrer    = scrubUrl(props.$referrer);
          return props;
        },
      });
      posthog = ph;
      phReady = true;
      // Replay whatever happened during load (identify first, so the queued
      // events attach to the right person rather than an anonymous id).
      preloadQueue.sort((a) => (a.kind === 'identify' ? -1 : 0));
      for (const item of preloadQueue.splice(0)) {
        try {
          if (item.kind === 'identify') ph.identify(item.userId, item.traits);
          else if (item.kind === 'capture') ph.capture(item.event, item.props);
          else if (item.kind === 'reset') ph.reset();
        } catch {}
      }
    } catch (err) {
      console.warn('[telemetry] PostHog load failed:', err?.message);
      preloadQueue.length = 0;   // don't grow unbounded if it never loads
    }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 4000 });
  else setTimeout(start, 1500);
}

export function initTelemetry() {
  if (SENTRY_DSN && !sentryReady) {
    try {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: APP_ENV,
        release: APP_VERSION,
        sendDefaultPii: false,
        // Performance tracing off by default — it multiplies event volume and the
        // free tier is small. Flip to a low sample rate if you ever need it.
        tracesSampleRate: 0,
        // Noise that isn't actionable: extensions, cancelled fetches, and the
        // benign ResizeObserver warning browsers emit during layout thrash.
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          'AbortError',
          'Non-Error promise rejection captured',
        ],
        denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
        beforeSend(event) {
          // Strip anything that could carry a token or user content
          if (event.request) {
            delete event.request.cookies;
            delete event.request.data;
            if (event.request.headers) delete event.request.headers.Authorization;
            if (event.request.url) event.request.url = scrubUrl(event.request.url);
          }
          if (event.user) event.user = { id: event.user.id };
          return event;
        },
      });
      sentryReady = true;
    } catch (err) {
      console.warn('[telemetry] Sentry init failed:', err?.message);
    }
  }

  if (PH_KEY && !phReady) loadPostHogWhenIdle();

  if (!SENTRY_DSN && !PH_KEY && import.meta.env.DEV) {
    console.info('[telemetry] no VITE_SENTRY_DSN / VITE_POSTHOG_KEY set — telemetry disabled (this is fine locally)');
  }
}

// ─── Identity ────────────────────────────────────────────────────────────────
// Supabase user id only. `traits` must stay non-identifying: plan tier, city
// key, fandom counts — never email, username, display name, or free text.
export function identifyUser(userId, traits = {}) {
  if (!userId) return;
  if (phReady) { try { posthog.identify(userId, traits); } catch {} }
  else if (PH_KEY) preloadQueue.push({ kind: 'identify', userId, traits });
  if (sentryReady) { try { Sentry.setUser({ id: userId }); } catch {} }
}

export function resetIdentity() {
  if (phReady) { try { posthog.reset(); } catch {} }
  else if (PH_KEY) preloadQueue.push({ kind: 'reset' });
  if (sentryReady) { try { Sentry.setUser(null); } catch {} }
}

// ─── Events ──────────────────────────────────────────────────────────────────
// `props` must contain ids/counts/enums only — never user-authored text.
export function track(event, props = {}) {
  const payload = { ...props, app_version: APP_VERSION, app_env: APP_ENV };
  if (phReady) { try { posthog.capture(event, payload); } catch {} return; }
  // Queue events fired before the SDK finishes loading — signup and the first
  // screen view both happen in that window, and they're the funnel's start.
  // Bounded so a never-loading SDK can't leak memory.
  if (PH_KEY && preloadQueue.length < 50) preloadQueue.push({ kind: 'capture', event, props: payload });
}

// SPA screen change. `name` is our own tab/modal name, not the raw URL.
export function trackScreen(name, props = {}) {
  if (!name) return;
  track('screen_viewed', { screen: name, ...props });
  if (sentryReady) {
    try { Sentry.addBreadcrumb({ category: 'navigation', message: name, level: 'info' }); } catch {}
  }
}

// ─── Errors ──────────────────────────────────────────────────────────────────
export function captureError(error, context = {}) {
  if (import.meta.env.DEV) console.error('[telemetry] captured:', error?.message || error, context);
  if (!sentryReady) return;
  try { Sentry.captureException(error, { extra: context }); } catch {}
}

// A handled problem worth knowing about that isn't a thrown Error — e.g. an API
// call that came back {error} and was recovered from.
export function captureMessage(message, context = {}) {
  if (!sentryReady) return;
  try { Sentry.captureMessage(message, { level: 'warning', extra: context }); } catch {}
}

// Canonical event names. Use these constants rather than raw strings so the
// PostHog event list doesn't fill up with typo'd variants.
export const EV = {
  SIGNUP_STARTED:     'signup_started',
  SIGNUP_COMPLETED:   'signup_completed',
  LOGIN:              'login',
  LOGOUT:             'logout',
  ONBOARDING_STEP:    'onboarding_step',
  ONBOARDING_DONE:    'onboarding_completed',
  POST_CREATED:       'post_created',
  POST_LIKED:         'post_liked',
  POST_REPOSTED:      'post_reposted',
  POST_SAVED:         'post_saved',
  POST_REACTED:       'post_reacted',
  COMMENT_CREATED:    'comment_created',
  COMMENT_LIKED:      'comment_liked',
  FEED_VIEWED:        'feed_viewed',
  FRIEND_REQUESTED:   'friend_requested',
  DM_SENT:            'dm_sent',
  VIP_UPSELL_SHOWN:   'vip_upsell_shown',
  VIP_CHECKOUT_START: 'vip_checkout_started',
  MEETUP_CREATED:     'meetup_created',
  MEETUP_RSVP:        'meetup_rsvp',
};

export { Sentry };
