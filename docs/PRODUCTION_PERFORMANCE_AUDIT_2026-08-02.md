# Backstage — Production Startup Performance Audit

**Date:** 2026-08-02
**origin/main tested against:** `171ebc3`
**Branch:** `perf/production-startup-quick-wins`
**Production tested:** `https://backstagefanverse.com` (Vercel project `backstage-fanverse-01`)
**Method:** Live browser measurement (Claude Browser pane, Resource/Navigation/Paint Timing APIs, direct network inspection) against production, plus static code/bundle analysis. Not a synthetic Lighthouse run — see Methodology limitations below for exactly what that means for these numbers.

This is a performance-only pass. No SQL, RLS, auth architecture, payment flow, or native-app packaging was touched. No broad `App.jsx` refactor was performed — the two code changes are both small, isolated, and justified below by direct measurement.

---

## Methodology & limitations (read this before the numbers)

The tooling available in this session is a browser-automation pane with Resource/Navigation/Paint Timing APIs, network-request inspection, and viewport resize — **not** Lighthouse, not WebPageTest, and it has **no network/CPU throttling control**. That materially shapes what could and couldn't be honestly measured:

- **TTFB, DOMContentLoaded, Load, resource counts, and decoded/transfer byte sizes** are real, measured, reproducible numbers — these are used throughout this doc with confidence.
- **First Contentful Paint / Largest Contentful Paint** could not be reliably captured — `performance.getEntriesByType('paint'/'largest-contentful-paint')` returned empty/zero in this automation context even after content was visibly rendered (confirmed via `read_page` showing real interactive content). Rather than fabricate FCP/LCP numbers, this doc uses **Load event completion** as the "usable time" proxy throughout, and says so explicitly wherever it appears.
- **Throttled-mobile and throttled-CPU profiles were not directly reproducible** — there is no throttling control in the available tooling, and simulating it by hand (e.g. artificial delays) would not produce trustworthy numbers. Where mobile/throttled behavior is discussed below, it is stated as a **reasoned estimate from measured payload sizes**, explicitly labeled as such, not a direct measurement.
- **True cold-cache (never-visited-before) loads were also not fully reproducible.** The browser profile used for testing had visited the site earlier in this session, and Vite's hashed, `immutable`-cache-controlled assets (`max-age=31536000, immutable`) meant even a forced reload mostly served from disk cache (`transferSize: 0`). Decoded/uncompressed byte sizes (fetched with `cache: 'no-store'`) are used instead as the primary "how much does a real client have to receive at least once" evidence.
- **Compressed (Brotli) wire size** for the main JS bundle could not be read directly — `fetch()` auto-decompresses Brotli before JS can inspect it, and cached `transferSize` entries read `0`. The production response headers confirm `content-encoding: br` is active. Compressed-size figures below are cross-checked against the local `vite build` gzip report (`435.22 KB` gzip for the same ~1.84 MB bundle) as a same-ballpark proxy, explicitly labeled as an estimate, not a direct wire measurement.
- **Authenticated-screen production measurement used the persistent QA account** (`pip_qa`, documented internally as a reusable, disposable test login — not a real user). Per this session's operating rules, credentials were never typed into any login field; the account's **already-authenticated session** (left over from earlier QA in this browser profile) was used for authenticated screens, then **deliberately signed out** (by clearing local session state, not by entering a password) specifically to capture the true signed-out landing-page numbers below. That trade-off was confirmed with the requester before doing it. As a result, per-tab authenticated **production** timing (Explore/My World/DM inbox/thread individually) is backed by a mix of production measurements taken before the sign-out and local-dev-server confirmation afterward (see each row's Network/Device column) — every row states exactly which it is.

None of this changes the two concrete fixes below — those are backed by exact, reproducible byte counts and live network-request evidence, not paint timing.

---

## Was the historical ~4-second concern reproduced?

**Not on desktop/unthrottled broadband — that profile loads in well under 1 second.** Measured against production, signed out, forced reload: TTFB 684 ms, Load event complete at 761 ms, 7 requests total. That is nowhere near 4 seconds.

**On throttled mobile, it's plausible but not directly confirmed**, for a reasoned combination of factors that *were* directly measured:
- The main JS bundle is ~1.86 MB decoded (~435 KB gzip-equivalent, estimated). On a "Slow 4G"-class connection (commonly modeled around 400 Kbps–1.6 Mbps down, 300–400 ms+ RTT), that alone is multiple seconds before the bundle finishes downloading and can execute.
- Before this pass, the favicon (`logo-orb.png`, fetched by the browser on essentially every page load) was **1.25 MB** — on a throttled connection that competes directly with the JS bundle for early bandwidth.
- Before this pass, font CSS was discovered only after JS parsed, executed, and injected a `<style>` tag containing a further `@import` — a request that couldn't even *start* until after the JS bundle had already downloaded and run, adding a fully sequential extra round-trip chain instead of a parallel one.

None of that proves 4 seconds specifically — it just makes 4 seconds on throttled mobile a credible historical number given what was actually shipping, rather than an unfounded guess. The fixes below directly address the second and third bullets (measured, byte-exact) and reduce (though don't eliminate — no code was removed) the first.

---

## Root-cause findings (each backed by evidence, not assumption)

| # | Candidate cause | Verdict | Evidence |
|---|---|---|---|
| 1 | **`/api/cards` fetched at app-mount regardless of active tab** | **Confirmed real, fixed** | `AppInner` called `useUserCards()` unconditionally (`src/App.jsx:26618`, pre-fix) — fires the instant `tokenReady && userId` are true, independent of `tab`. Live network capture on the unmodified build: `/api/cards` fires immediately on landing at the default Fanverse tab, which never reads `cards`. Verified via code that `cards` is only consumed by My World (`collect`), Tools (`fanverse`), My Stage (`profile`), and one deep-link modal (`collectmodal`) — never by Fanverse or Explore, the two most-trafficked tabs. |
| 2 | **Favicon/manifest icon shipped at full original resolution** | **Confirmed real, fixed** | `index.html`'s `<link rel="icon">`/`<link rel="apple-touch-icon">` and `manifest.json`'s 192×192 icon both pointed at `public/logo-orb.png` — measured 1254×1254 px, 1,254,709 bytes, despite only ever being rendered at 192×192 or smaller. The manifest's 512×512 icon pointed at `public/fanverse-logo.png` — also 1254×1254 px, 2,160,538 bytes. Both fetched by the browser during normal page load / PWA-install checks, not lazily. |
| 3 | **Font CSS loaded via `@import` inside a React-injected `<style>` tag** | **Confirmed real, fixed** | `src/lib/theme.js`'s `getCSS()` returned a string containing `@import url('https://fonts.googleapis.com/css2?...')`, rendered via `<style>{getCSS()}</style>` in `App.jsx` (3 call sites). This means: HTML parses → JS bundle downloads → JS executes → React renders `<style>` → browser parses that CSS → **only then** does it discover the font URL → fetches font CSS → discovers font file URLs → fetches those. A `<link>` in the raw HTML is discovered by the browser's preload scanner immediately, in parallel with the JS bundle, cutting a fully sequential dependency chain down to a parallel one. |
| 4 | Mapbox GL loaded eagerly on startup | **Investigated, not confirmed — already handled correctly** | `mapbox-gl` is not an npm-bundled dependency at all; `src/MapboxMap.jsx` loads it via a dynamically-injected `<script src="https://api.mapbox.com/mapbox-gl-js/...">` tag, and every render call site (`FanverseTab`'s embedded map, the dedicated `FanverseMap` page) is gated behind non-default view state (`view==="map"`, `mode==="fanmap"`). Live DOM check on the authenticated Fanverse landing tab (default `view==="feed"`) confirmed **zero** Mapbox script/CSS tags present. No fix needed; not a startup cost today. |
| 5 | GIF/media tools loaded eagerly | **Investigated, not confirmed — low priority** | `src/components/GifSystem.jsx` (`GifPicker`, `GifImg`, `GifPreviewBubble`, `ReactionButton`) is statically imported into `App.jsx`, but every render call site is inside DMs, Chat Rooms, Concert Capsule, or Notification Center — none of which are the default landing tab. The module is only ~301 lines of app code (no bundled third-party library), so the realistic byte saving from lazy-loading it is small (single-digit KB gzip) relative to the implementation risk of adding `Suspense` boundaries at 4 separate call sites across features under active regression protection (DMs). Not pursued this pass — see Remaining opportunities. |
| 6 | Firebase loaded eagerly | **Investigated, not confirmed — already handled correctly** | Both `firebase/app` and `firebase/messaging` are already behind `await import(...)` (`src/App.jsx:1707-1709`, `1743-1746`), only invoked when push notifications are actually requested. Already optimal. |
| 7 | Stripe loaded eagerly on the frontend | **Investigated, not confirmed — not applicable** | No `@stripe/stripe-js` or any Stripe import exists in frontend code. The `stripe` npm package is the Node SDK, used only in `api_server_v16.js` (backend). VIP checkout redirects to Stripe-hosted Checkout — zero Stripe JS ships to the browser. |
| 8 | PostHog/Sentry blocking startup | **Investigated, not confirmed — already handled correctly** | `src/lib/telemetry.js` already statically imports only Sentry (justified inline: it has to be live before first paint to catch boot errors) and dynamically imports PostHog via `requestIdleCallback` (documented: "~75KB gzip and nothing about analytics needs to block the first render"). This was already a deliberate, well-reasoned prior optimization — left untouched. |
| 9 | Duplicate/sequential Supabase session-restore calls | **Investigated, not confirmed — already handled correctly** | `AuthProvider` has an explicit, commented guard against StrictMode double-mount firing two concurrent `/api/users/me` calls (`src/App.jsx:392-397`) — a deliberate prior fix. Only one profile fetch happens per session-resolution path. Left untouched; changing auth flow is out of scope for this pass regardless. |
| 10 | Service-worker caching absent | **Investigated, not confirmed — no general PWA service worker exists** | The only service worker in the codebase is `public/firebase-messaging-sw.js`, registered only when a user opts into push notifications — not a general asset-caching SW (confirmed: no `vite-plugin-pwa` or equivalent in `package.json`). `swRegistered: false` / `swControlled: false` measured on a normal page load, which is expected given this. Hashed JS/CSS assets already carry `Cache-Control: public, max-age=31536000, immutable`, so warm repeat visits are served from standard HTTP disk cache without needing a SW layer. Adding a full PWA caching service worker would be a real feature addition (likely a new dependency) — out of scope for a "safe quick win" pass; noted as a future infrastructure option, not implemented. |
| 11 | Render (backend) cold starts | **Not independently measurable this session** | No Render dashboard/metrics access was available in this session's toolset. `/api/health` and API calls resolved without any request timing out or showing symptoms of a cold-start stall during testing, but this isn't a substitute for real cold-start telemetry. Flagged as unverified, not ruled out — see Remaining bottlenecks. |
| 12 | Inactive-tab data fetching beyond `/api/cards` | **Checked, none found** | All five bottom-nav tab components are conditionally rendered (`{tab==="x"&&<Component/>}`), so React never mounts (and therefore never runs the data-fetching effects of) an inactive tab's component — except for the one `useUserCards()` call lifted to `AppInner`, which is finding #1 above. No other shared-state-at-mount pattern found. |

---

## Changes implemented

### 1. Defer `/api/cards` fetch until actually needed
**File:** `src/App.jsx` (`AppInner`, ~12 lines)
`useUserCards()` already supported an `enabled` option (built but unused). `AppInner` now computes `cardsNeeded` — true once the user visits My World, Tools, My Stage, or opens the "My Collection" modal — and passes it as `enabled`. Sticky once true (never re-hides or refetches already-loaded data just because the user navigates back to Fanverse). Fanverse and Explore — the two tabs that never read `cards` — no longer trigger this request at all during their own load.

### 2. Resize oversized favicon/manifest icons to their declared dimensions
**Files:** `public/logo-orb.png`, `public/fanverse-logo.png` (binary, in place, no reference changes needed)
Both were shipped at their full original 1254×1254 px resolution despite being declared/used at 192×192 (favicon, apple-touch-icon, manifest small icon) and 512×512 (manifest large icon) respectively. Resized losslessly-for-purpose to those exact dimensions using .NET `System.Drawing` (high-quality bicubic, alpha-preserving) — no new dependency added. Visually verified after resize (both still render crisp and correctly).

### 3. Load fonts via `<link>` + `preconnect` instead of a JS-injected `@import`
**Files:** `index.html`, `src/lib/theme.js`
Added `<link rel="preconnect">` for `fonts.googleapis.com`/`fonts.gstatic.com` and a `<link rel="stylesheet">` for the exact same font CSS URL directly in `index.html`'s `<head>`, discoverable by the browser's HTML preload scanner before JS even downloads. Removed the now-redundant `@import` from `theme.js`'s `getCSS()`. Same fonts, same weights, same `display=swap` — only the discovery timing changed.

### Not implemented (evaluated, evidence didn't justify the risk/payoff)
- **Lazy-loading `MapboxMap.jsx` via `React.lazy()`** — considered, since it's already a separate ~783-line module statically imported into `App.jsx`. Not pursued: the actually-heavy part (`mapbox-gl` itself) already loads via an on-demand CDN `<script>` tag regardless (confirmed absent from the DOM on the default tab), so the remaining win would only be the wrapper component's own ~15-25 KB decoded — and its `CITY_DENSITY_GEOJSON` data export is used independently at 3 other call sites in `App.jsx`, which would require extracting that data into its own file to code-split cleanly. Modest, uncertain payoff for real structural risk — not a clear "safe quick win" by the evidence.
- **Lazy-loading `GifSystem.jsx`** — see finding #5 above. Small (301 lines), 4 scattered call sites including DMs, which is under active regression protection. Deprioritized.
- **General PWA service worker** — see finding #10. Real feature work, likely a new dependency; out of scope.

---

## Before/after

### Bundle size (local production build, `npm run build`, same `origin/main` baseline commit `171ebc3`)

| | Before | After | Change |
|---|---|---|---|
| Main JS chunk (decoded) | 1,844.26 KB | 1,844.12 KB | −0.14 KB (noise) |
| Main JS chunk (gzip, Vite-reported) | 435.23 KB | 435.22 KB | −0.01 KB (noise) |
| `index.html` (gzip) | 0.86 KB | 1.22 KB | +0.36 KB (added `<link>` tags; this file is `max-age=0, must-revalidate` — never long-cached, always fetched fresh, still tiny in absolute terms) |

**Honest read:** none of the three fixes change JS *code size* — they change *when* things are requested and *how large the non-JS assets are*, not what code ships. A bundle-size table alone would misleadingly suggest nothing happened. The real deltas are below.

### Payload-weight fixes (exact, measured, deterministic — not network-dependent)

| Asset | Before | After | Reduction |
|---|---|---|---|
| Favicon / apple-touch-icon / manifest 192×192 icon (`logo-orb.png`) | 1,254,709 bytes (1254×1254 px) | 41,489 bytes (192×192 px) | **96.7%** |
| Manifest 512×512 icon (`fanverse-logo.png`) | 2,160,538 bytes (1254×1254 px) | 605,841 bytes (512×512 px) | **71.9%** |

### Request-timing fix (exact, measured via live network capture)

| | Before | After |
|---|---|---|
| `/api/cards` fired on default Fanverse-tab landing | **Yes** (unconditional, confirmed in code + would fire per the pre-fix `useUserCards()` call with no `enabled` gate) | **No** — confirmed via live network capture on the modified build: zero `/api/cards` requests on Fanverse landing; the request fires for the first time only after navigating to My World, and not again on subsequent tab switches |

### Screen-level timing (production, signed out landing — the one screen with a clean apples-to-apples before/after since it needed no auth)

| Screen | Cold/Warm | Profile | TTFB | DOMContentLoaded | Load (usable-time proxy — see Methodology re: FCP/LCP) | Resource count | JS decoded |
|---|---|---|---|---|---|---|---|
| Signed-out landing | Forced reload (mostly-warm HTTP cache; true cold-cache not reproducible — see Methodology) | Desktop, unthrottled broadband | 684 ms | 761 ms | 761 ms | 7 | 2,126 KB |

This is the **pre-deployment production baseline** — the code changes in this PR haven't shipped yet, so there is no separate "after" production measurement for this screen; the after-effects (smaller favicon fetch, earlier font discovery) apply to this exact screen once deployed, but re-measuring an already-fast desktop-broadband load (761 ms) was not expected to show a dramatic delta on this specific profile — the fixes matter most on throttled/mobile profiles, which this tooling could not measure (see Methodology). No fabricated "after" number is given here for that reason.

### Authenticated screens (local dev server, `pip_qa` account — see Methodology re: why local, not production)

| Screen | Result |
|---|---|
| Fanverse (landing tab) | Loads clean, zero `/api/cards` requests, no console errors beyond a pre-existing unrelated `[VIP sync]` retry warning (present identically before and after this change — local-dev-only, caused by the local backend lacking live Stripe config, not something this pass touched) |
| Explore | Loads clean, same pre-existing warning only |
| My World | Loads clean; `/api/cards` fires exactly once, on first visit; real account data rendered (`@pip_qa`, VIP, groups, binder progress) |
| Tools | Loads clean |
| My Stage | Loads clean; real profile data rendered |
| DM inbox | Loads clean (empty-state — no message history on this local test DB, not a regression) |

---

## Regression QA

| Check | Result |
|---|---|
| `npm run build` | ✅ Pass, 448 modules, no errors |
| `node --check api_server_v16.js` | ✅ Pass (no backend files were touched; run per instructions regardless) |
| `node tests/binder-card-ownership.test.js` | ✅ 19/19 passed |
| `node tests/my-world-qa-correction.test.js` | ✅ 7/7 passed |
| Signup confirmation flow | Not touched by this diff (confirmed via `git diff` scope) — not re-exercised live, since doing so would require creating a new account, which this session cannot do (see this session's operating constraints) |
| Account switching / cross-account isolation | Not touched — `useUserCards`'s own `userId`-keyed reset effect (the F14 fix) is untouched; only the `enabled` gate composing around it changed. Verified by reading the unmodified reset-effect code path |
| Session restoration | ✅ Verified live — authenticated session persisted correctly across reload on local dev |
| All 5 bottom-nav tabs open | ✅ Verified live — Fanverse, Explore, My World, Tools, My Stage all render without console errors |
| My World loads correct account data | ✅ Verified live — real `@pip_qa` data (VIP badge, groups, binder progress) rendered correctly, `/api/cards` fired exactly once on first visit |
| DM inbox loads | ✅ Verified live |
| Service-worker registration | ✅ Unaffected — untouched code path, behavior identical before/after (`swRegistered:false` on a normal load, matching finding #10) |
| Analytics/error monitoring init | ✅ Unaffected — `src/lib/telemetry.js` untouched |
| Pearl Mode (light) | ✅ Verified live — `document.body` computed background `rgb(248,242,255)` (`#f8f2ff`, matches the light theme-color meta tag), font still resolves to `"Instrument Sans"` after the `@import`→`<link>` change |
| Concert Mode (dark) | ✅ Verified live (default state, tested throughout the rest of the QA pass) |
| 375px | ✅ Verified — no horizontal overflow (`scrollWidth === innerWidth`), no console errors |
| 390px | Not separately tested this pass; 375px (the tighter constraint) passed cleanly and no responsive-layout code was touched |
| No new console errors | ✅ Confirmed — the only console output across every screen tested was a single pre-existing `[VIP sync] gave up after all retries` warning, present identically regardless of this diff (local-dev Stripe-config artifact, unrelated to any file this PR touches) |

---

## Remaining frontend bottlenecks

1. **The ~1.86 MB JS bundle itself is untouched.** `App.jsx` is a 26,000+ line monolith with no route-level code-splitting — every tab's component code ships in the same chunk regardless of which tab a user ever opens. Actually splitting this would require extracting each tab's component into its own module first (a genuine architectural project, explicitly out of scope for "no broad App.jsx refactor unless a measured bottleneck requires a small isolated extraction" — the bottleneck is real, but the fix isn't small).
2. **`fanverse-logo.png` at 605,841 bytes (512×512) is still fairly heavy** for a lossless PNG at that resolution — .NET's built-in PNG encoder (used here to avoid adding a new dependency) doesn't quantize/palette-optimize the way a dedicated tool (pngquant, oxipng, Squoosh) would. A follow-up pass with an approved image-optimization dependency could likely cut this further.
3. **224 resources on the authenticated Fanverse landing tab** (vs. 7 for signed-out) — mostly legitimate feed/avatar content, not a bug, but the single biggest measured difference between the signed-out and signed-in experience. Not addressed this pass since reducing it would mean showing less real content, which is explicitly out of scope ("do not hide loading behind fabricated data").
4. **No genuine cold-cache or throttled-network/CPU measurement was possible with the available tooling.** The 4-second historical concern remains a reasoned inference from payload sizes, not a directly reproduced number. A real Lighthouse/WebPageTest run against production (throttled "Slow 4G" + mid-tier mobile CPU profile) would close this gap and should be the next step before declaring the startup problem solved.
5. **GifSystem.jsx and VipSystem.jsx remain statically bundled** — evaluated, not pursued this pass (see "Not implemented" above). Real but modest opportunity.

## Remaining backend/infrastructure bottlenecks

1. **Render cold-start impact is unverified**, not ruled out — no Render metrics/dashboard access in this session's toolset (see finding #11).
2. **No PWA-level caching service worker exists** — repeat visits rely entirely on HTTP cache headers (already well-configured with `immutable` long-cache on hashed assets), not a SW cache layer. Would be a real feature addition, not a quick win.
3. **~105 `auth_rls_initplan` + 72 `multiple_permissive_policies` + unindexed-FK/unused-index performance lints** were already flagged in `docs/FOUNDER_LAUNCH_READINESS_2026-08-02.md` (§E item 9) as adding query overhead under real concurrent load — unrelated to this pass's frontend focus, but relevant to overall perceived speed under load. Not touched (SQL/RLS changes are explicitly out of scope for this pass).
4. **No load/concurrency testing has ever been run** against the Express backend or Supabase connection pool (also previously flagged, §E item 4 of the same doc) — still outstanding, still not a blocker for current beta-scale traffic.

---

## Does the product now feel materially closer to 1–2 seconds?

**For the one screen with a clean before/after (signed-out landing, desktop/broadband): it already was** — 761 ms measured pre-deployment, comfortably under the 1-2s target on this profile. The fixes in this PR (favicon/icon byte reduction, font-loading waterfall shortening, one fewer startup API call on the two most-visited tabs) are real, measured, and should help most precisely where the historical "~4 second" complaint most plausibly came from — throttled mobile — but that specific claim could not be directly verified with the tooling available this session. The honest summary: **three concrete, evidence-backed, low-risk fixes shipped; the highest-value next step to actually close the loop on the 1-2s target is a real throttled Lighthouse/WebPageTest run against the deployed result**, not something this session's toolset could produce.
