# App Store Readiness Checklist — Backstage by Fanverse

Last updated: May 2026  
Stack: Vite React PWA + Express backend (Render) + Supabase + Stripe  
Wrapping path: Capacitor (iOS + Android) — future phase  

---

## 1. PWA / Web App Foundation

| Item | Status | Notes |
|------|--------|-------|
| `manifest.json` present | ✅ Done | `/public/manifest.json` |
| `id` field in manifest | ✅ Done | Required for installability scoring |
| `name` and `short_name` | ✅ Done | "Backstage by Fanverse" / "Backstage" |
| `start_url` and `scope` | ✅ Done | `"/"` |
| `display: standalone` | ✅ Done | Full-screen app feel |
| `theme_color` and `background_color` | ✅ Done | `#b8a2ff` / `#07050f` |
| `orientation: portrait` | ✅ Done | |
| App icons (192px, 512px) | ✅ Done | `logo-orb.png`, `fanverse-logo.png` |
| `purpose: maskable` icons | ✅ Done | Both sizes have maskable entry |
| Viewport meta tag | ✅ Done | `viewport-fit=cover` for notch support |
| `apple-mobile-web-app-capable` | ✅ Done | `index.html` |
| `apple-mobile-web-app-status-bar-style` | ✅ Done | `black-translucent` |
| `apple-touch-icon` | ✅ Done | `logo-orb.png` |
| HTTPS required | ✅ Vercel | Automatic |
| Service Worker / offline support | ⚠️ Partial | `firebase-messaging-sw.js` handles push. Add a full SW (Workbox) before Capacitor wrapping for full offline mode |
| PWA install prompt | ⚠️ Pending | Add `beforeinstallprompt` listener for Android Chrome install banner |

**Next steps before Capacitor wrap:**
- [ ] Add Workbox service worker (cache shell + assets)
- [ ] Test Lighthouse PWA score ≥ 90
- [ ] Generate proper maskable icon with safe zone (use https://maskable.app)
- [ ] Add 1024×1024 icon for iOS App Store

---

## 2. Apple App Store (iOS — Capacitor)

| Item | Status | Notes |
|------|--------|-------|
| Age rating | ⚠️ Pending | Likely 12+ (social, user-generated content, mild UGC risk) — confirm with Apple rating tool |
| App Store screenshots | ⚠️ Pending | Required: 6.7" (iPhone Pro Max), 6.1" (iPhone), optionally iPad |
| App Preview video | Optional | 15–30 sec screencast of key features |
| Privacy Nutrition Label | ⚠️ Pending | Required before submission. Declare: email, username, purchase history, usage data, device ID (push token) |
| Privacy Policy URL | ✅ Done | `https://backstagefanverse.com/privacy` |
| Support URL | ✅ Done | `https://backstagefanverse.com/support` |
| Account deletion flow | ✅ Done | In-app: Profile → Settings → Delete Account. Also at `/delete-account` |
| In-app payments (IAP) | 🔜 Future | Currently Stripe web-only. Native IAP (StoreKit 2) required for any in-app purchase of digital goods on iOS. **Do not ship paid VIP via Stripe web payment inside a native app wrapper** — Apple will reject. Plan: "Restore Purchase" + IAP before iOS submission |
| Sign in with Apple | 🔜 Future | Required if you offer any third-party social sign-in. Currently email-only via Supabase — this is fine |
| Push notifications | ⚠️ Pending | Requires APNs certificate + Capacitor Push Notifications plugin |
| Location permission string (NSLocationWhenInUseUsageDescription) | ⚠️ Pending | Required if Nearby Mode requests location. Current implementation: city-level only, opted-in by user. Add to `Info.plist` when wrapping |
| No exact GPS stored | ✅ Done | Privacy policy + code confirm city-level only |
| UGC moderation policy | ✅ Done | Terms of Service Section 3, Safety Center, report flow |
| COPPA / 13+ age gate | ✅ Done | Terms Section 1 + Privacy Section 6 |
| No CSAM | ✅ Done | Explicitly prohibited in Terms Section 3 |
| App Transport Security (ATS) | ⚠️ Pending | Verify all API calls are HTTPS in production |
| Entitlements file | ⚠️ Pending | Push notifications entitlement required |

**Required before iOS submission:**
- [ ] Implement StoreKit 2 IAP for VIP (or remove Stripe checkout from native binary entirely)
- [ ] Complete Privacy Nutrition Label in App Store Connect
- [ ] Add APNs certificate via Capacitor
- [ ] Generate all required screenshot sizes
- [ ] Test on physical iPhone (Safari WebView quirks)

---

## 3. Google Play (Android — Capacitor)

| Item | Status | Notes |
|------|--------|-------|
| Target SDK | ⚠️ Pending | Must target Android 14 (API 34) or later |
| App icons (adaptive) | ⚠️ Pending | Need adaptive icon (foreground + background layers) for Android 8+ |
| Screenshots | ⚠️ Pending | Phone screenshots (1080×1920 min), optionally tablet |
| Privacy Policy URL | ✅ Done | `https://backstagefanverse.com/privacy` |
| Data Safety section | ⚠️ Pending | Google Play requires declaring data collected: email, name, user IDs, purchase history, approximate location (if Nearby enabled) |
| Account deletion support | ✅ Done | In-app + `/delete-account` page — satisfies Google Play requirements |
| Payments (Google Play Billing) | 🔜 Future | Same as iOS — Stripe web checkout must not be the in-app purchase mechanism for digital goods in a native wrapper. Use Google Play Billing API instead |
| Permissions declared | ⚠️ Pending | `INTERNET`, `POST_NOTIFICATIONS`, `ACCESS_COARSE_LOCATION` (opt-in, for Nearby Mode) |
| No exact location | ✅ Done | Only coarse / city-level, opt-in only |
| Content rating questionnaire | ⚠️ Pending | Complete in Play Console — likely "Everyone 10+" or "Teen" |
| UGC policy compliance | ✅ Done | Report flow, block flow, moderation routes |
| SafetyNet / Play Integrity | ⚠️ Pending | Consider adding Play Integrity API check before Capacitor wrap |

**Required before Play submission:**
- [ ] Implement Google Play Billing for VIP subscriptions
- [ ] Complete Data Safety declaration in Play Console
- [ ] Generate adaptive icons
- [ ] Test on Android WebView (Chrome) — check CSS compatibility
- [ ] Add `ACCESS_COARSE_LOCATION` permission with clear opt-in dialog

---

## 4. Payments & Subscriptions

| Item | Status | Notes |
|------|--------|-------|
| Stripe web checkout | ✅ Done | POST `/api/subscriptions/checkout`, webhook handler |
| Stripe webhook (invoice.paid / invoice.failed) | ✅ Done | `api_server_v16.js` |
| VIP status from webhook | ✅ Done | `is_vip` written to Supabase `users` table |
| Comp VIP (admin grant) | ✅ Done | `vip_source: "comped"`, optional `vip_expires_at` |
| Cancel/refund path | ✅ Done | Via email support — documented in Terms + Support page |
| Apple IAP (StoreKit 2) | 🔜 Future Phase | Required for iOS native. Plan: separate `product_id` for monthly/annual, `vip_source: "apple_iap"` in Supabase |
| Google Play Billing | 🔜 Future Phase | Required for Android native. Plan: `vip_source: "google_play"` |
| Receipt validation | 🔜 Future Phase | Server-side Apple/Google receipt validation before granting VIP |
| Restore Purchase button | 🔜 Future Phase | Required by Apple (native apps) |

**Note:** For PWA-only launch (pre-Capacitor), Stripe web checkout is compliant. Stripe is **not** allowed inside a native iOS/Android binary for digital goods purchases.

---

## 5. Privacy & Data

| Item | Status | Notes |
|------|--------|-------|
| Privacy Policy | ✅ Done | `/privacy` — covers all data types |
| Location: opt-in only | ✅ Done | Default discovery mode is `"off"`. User must explicitly enable Nearby Mode |
| Location: city-level only | ✅ Done | No exact GPS stored. Code + privacy policy confirm |
| Camera/microphone | ✅ Done | Not used. Not declared |
| Push notifications: opt-in | ✅ Done | User prompted via in-app sheet, not auto-requested |
| Spotify: opt-in | ✅ Done | Only connected if user initiates |
| Data retention policy | ✅ Done | Privacy Policy Section 4 |
| GDPR / CCPA rights | ✅ Done | Privacy Policy Section 5, Support page |
| COPPA (13+) | ✅ Done | Terms Section 1, Privacy Section 6 |
| Data deletion endpoint | ✅ Done | DELETE `/api/users/me` — cascades all tables |
| No third-party ad tracking | ✅ Done | Stated in Privacy Policy |
| No sale of user data | ✅ Done | Stated in Privacy Policy |

---

## 6. UGC (User-Generated Content) Moderation

| Item | Status | Notes |
|------|--------|-------|
| Terms of Service (community rules) | ✅ Done | `/terms` Section 3 |
| Report user | ✅ Done | SafetyCenter + ReportSheet + POST `/api/moderation/report` |
| Report post | ✅ Done | SafetyCenter + ReportSheet |
| Report trade | ✅ Done | SafetyCenter + ReportSheet |
| Block user | ✅ Done | SafetyCenter + POST `/api/moderation/block` + localStorage |
| Unblock user | ✅ Done | SafetyCenter → Blocked Users list + DELETE `/api/moderation/block/:id` |
| Moderation database tables | ⚠️ Pending | Add `moderation_reports` and `user_blocks` tables to Supabase (see migration below) |
| Human review queue | 🔜 Future | Build admin dashboard for reviewing `moderation_reports` |
| Auto-moderation | 🔜 Future | Consider profanity filter or AI moderation (Perspective API) |
| DMCA / copyright process | ✅ Done | Terms Section 6, email flow |

**Supabase migration needed:**
```sql
-- Run in Supabase SQL editor
create table if not exists moderation_reports (
  id uuid default gen_random_uuid() primary key,
  reporter_id uuid references users(id) on delete set null,
  type text not null check (type in ('user','post','trade')),
  target_id text,
  target_handle text,
  reason text not null,
  detail text,
  status text default 'pending' check (status in ('pending','reviewed','actioned','dismissed')),
  created_at timestamptz default now()
);

create table if not exists user_blocks (
  user_id uuid references users(id) on delete cascade,
  blocked_user_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, blocked_user_id)
);

-- Indexes
create index if not exists idx_moderation_reports_status on moderation_reports(status);
create index if not exists idx_user_blocks_user on user_blocks(user_id);
```

---

## 7. Legal Pages (Public, No Login Required)

| Route | Status | Notes |
|-------|--------|-------|
| `/privacy` | ✅ Done | Full privacy policy |
| `/terms` | ✅ Done | Full terms of service |
| `/support` | ✅ Done | Support contact, account help, billing, delete info |
| `/delete-account` | ✅ Done | Step-by-step deletion instructions + email option |

All legal pages are accessible without login and without the app shell (pure HTML served via Vercel rewrites).

---

## 8. Screenshots & Store Assets

Screenshots are not yet generated. Use these specs:

| Platform | Required Sizes |
|----------|---------------|
| iOS App Store | 6.7" (1290×2796), 6.1" (1179×2556). Optionally 12.9" iPad Pro |
| Google Play | Phone: 1080×1920 min, max 7680×4320. Optionally 10" tablet |
| PWA / Chrome Web Store | 1280×800 or 640×400 |

**Suggested screenshot flows to capture:**
1. Welcome / landing screen (auth)
2. Home feed with posts and VIP banner
3. Concerts tab with event cards
4. Concert Capsule (collective fan memory)
5. Photocard collection / Library
6. Fanverse Map (with privacy note visible)
7. Profile page with VIP badge
8. Safety Center / Privacy & Discovery settings

---

## 9. Pre-Launch Testing Checklist

### Device testing
- [ ] iPhone Safari (PWA install flow, notch/safe area, dark mode)
- [ ] Android Chrome (PWA install prompt, Notifications API)
- [ ] iOS WebView via Capacitor (if wrapping)
- [ ] Android WebView via Capacitor (if wrapping)

### Auth flows
- [ ] Clean browser → lands on welcome screen (not onboarding) ✅ Fixed
- [ ] Sign up → onboarding → app
- [ ] Sign in returning user → skips onboarding → app
- [ ] Sign in with incomplete profile → resumes onboarding
- [ ] Sign out → returns to welcome screen ✅ Fixed
- [ ] Checkout success with no session → "Sign in to activate VIP" message ✅ Fixed

### Payments
- [ ] Stripe checkout (web) — test mode → production mode
- [ ] Webhook fires correctly on `checkout.session.completed`
- [ ] VIP banner appears after payment
- [ ] VIP status persists on reload
- [ ] Comp VIP (admin SQL) — verify `is_vip` and `vip_source` propagate

### Privacy
- [ ] New user: discovery mode defaults to "Off" ✅ Fixed
- [ ] Nearby Mode: user sees opt-in prompt before any location activity
- [ ] Map shows aggregated city dots only — no individual user pins
- [ ] Fanverse Map does not store or transmit exact GPS

### Moderation
- [ ] Report user flow — submits to `/api/moderation/report`
- [ ] Report post flow — submits correctly
- [ ] Block user — stored in localStorage + synced to API
- [ ] Unblock — removes from list
- [ ] Blocked users page shows correctly in SafetyCenter

### Account deletion
- [ ] In-app delete flow — confirms and calls DELETE `/api/users/me`
- [ ] User is signed out after deletion
- [ ] `/delete-account` page loads without login
- [ ] Email deletion request documented in Support page

### Build
- [ ] `npm run build` passes with no errors
- [ ] `vite preview` works correctly
- [ ] No console errors on production build

---

## 10. Capacitor Wrap — Future Phase Checklist

When ready to wrap with Capacitor:

- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
- [ ] `npx cap init`
- [ ] Build Vite first: `npm run build`
- [ ] `npx cap add ios` and `npx cap add android`
- [ ] Replace Stripe web checkout with StoreKit 2 (iOS) and Google Play Billing (Android)
- [ ] Add `@capacitor/push-notifications` for native push (replace Firebase web SDK)
- [ ] Add `@capacitor/geolocation` for Nearby Mode (coarse, opt-in only)
- [ ] Configure `capacitor.config.json` with `appId: com.fanverse.backstage`
- [ ] Set `server.url` to production Vite build (not localhost)
- [ ] Add Apple APNs certificate in Xcode
- [ ] Add `google-services.json` for Android Firebase
- [ ] Test on real device before TestFlight / internal track

---

## 11. Health Check Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Server + DB + Stripe + AI status |
| `GET /api/subscriptions/status` | VIP status for current user |
| `DELETE /api/users/me` | Account deletion (App Store requirement) |
| `POST /api/moderation/report` | UGC report submission |
| `POST /api/moderation/block` | User block |

---

*This document should be reviewed and updated before each store submission.*
