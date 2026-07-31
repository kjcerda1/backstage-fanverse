# Backstage Fanverse — Project Map

*A navigation index for Claude sessions. Its whole job is to keep you **out** of a blind full-file scan of `src/App.jsx` (26k+ lines). Find the feature below, jump to the line anchor, read only that slice.*

**Line anchors are approximate** and drift as the file grows. Treat them as "start reading near here." If an anchor looks stale, re-find it: `grep -n "function ComponentName" src/App.jsx`.

---

## ⭐ Read this first (every session)

1. **PROJECT_MAP.md** ← you are here (where things live)
2. **CURRENT_STATE.md** (what's actually shipped — the freshest inventory)
3. **PROJECT_OVERVIEW.md** (durable architecture that rarely changes)

That's enough to orient. Do **not** open App.jsx just to "get a feel for it."

## 🚫 Do NOT read all of App.jsx

`src/App.jsx` remains a large single-file monolith — a full read is roughly half a million tokens and will blow your context for no benefit. Exact current size/component counts drift every session; if you need a number, see `docs/AGENT_CONTEXT_EFFICIENCY_AUDIT.md` rather than trusting a figure here. Instead:

1. Find the feature in the map below → get the line anchor.
2. `grep -n "function TheComponent" src/App.jsx` to confirm the current line.
3. Read a bounded slice (e.g. `offset`/`limit` around the anchor), not the file.
4. Shared helpers already live in `src/lib`, `src/data`, `src/components` — read those small files directly instead of hunting inside App.jsx.

Only read App.jsx end-to-end if the user **explicitly** asks for a whole-file pass.

---

## `src/App.jsx` — feature → line anchor

One monolith, many top-level components (exact count drifts — see `docs/AGENT_CONTEXT_EFFICIENCY_AUDIT.md` for a dated snapshot). Grouped by feature area.

**Anchors verified 2026-07-31** via `grep -n "^function "` (whole-file declaration scan, no ranges opened) — treat these as accurate as of that date, re-grep the component name if it's been a while since.

| Lines (verified 2026-07-31) | Area | Key components / contents |
|---|---|---|
| 1–407 | **App config / env** | `API_URL`, Supabase env inspection, `MOCK_AUTH` flag, `AuthCtx` |
| 408–1115 | Auth provider + username/world rules + customization catalogs | `AuthProvider` (session, token, password recovery), `syncMyWorldToServer`, `clearAuthStorage`, `RESERVED_USERNAMES`, `IMPERSONATION_AFFIXES`, `MY_WORLD_KEYS`, `SKIN_GRADIENTS`, `SKIN_CATEGORIES`, `STAGE_DECO/FONTS/EFFECTS`, `SHRINE_LAYOUTS`, `CARD_STYLES` |
| 1116–1427 | **GIF system** | `GifPreviewBubble`, `GifImg`, `ReactionButton`, `GifPicker` |
| 1428–2637 | **VIP / Founder / Upgrade** + inline mock data | `FounderPrestigeCard`, `VipGate`, `UpgradeModal`, `VipCelebrationScreen`, `VipTutorialModal`; `MOCK_CONCERTS`/`MOCK_CARDS`/etc. (audit vs `src/data/` — some may be redundant) |
| 2638–3296 | Invite / referral | `InvitePage` |
| 3297–3552 | Small AI/util cards | `ContentGenerator`, `ConcertDayCard`, `IdentityCard`, `MapSnapshot` |
| 3553–4033 | **App chrome / floating UI** | `FanverseHeatMap`, `ViralTicker`, `InstallPromptCard`, `NotificationBell`, `FloatingMessagesButton`, `AskBackstageButton`, `FanverseFloatingDock` |
| 4034–4821 | **Onboarding / auth screens** | `Onboarding`, `SetNewPasswordScreen` |
| 4822–5759 | **Concerts / shows** | `ConcertsPage`, `AiItinerary`, `ShowDetail` |
| 5760–7809 | **Photocards — Library/Sets** | `CardDetailSheet`, `PhotocardSetsView`, `PhotocardGrid`, `SavedPostsSection`, `AchievementsModal`, `LibraryTab` |
| 7810–10406 | **Photocards — Binders + Trade** | `GroupBinderHome`, `BinderCreate`, `CustomBinderForm`, `AddCardForm`, `TradeListingForm`, `BinderDetail`, `TradeListingDetail`, `MakeOfferForm`, `OfferThread`, `TradePassportCard`, `TradeHub` |
| 10407–10862 | Collect / inventory | `CollectTab`, `InventoryTab` |
| 10863–12756 | **Fanverse social** | `MemeSystem`, `FanBuddyMatcher`, `BudgetTracker`, `FanverseLeaders`, `FanDiscoverySection`, `FanversePulse`, `CityHubDetail`, `FanverseTab`, `CommunityTab`, `BuildMyDay` |
| 12757–13558 | **Era Room** | `EraRoom` |
| 13559–14580 | Explore / Tools tabs | `ExploreTab`, `ToolsTab`, `ComebacksEraWatch` |
| 14581–15406 | Chants / era board / stories | `ChantVault`, `EraBoard`, `FanStories`, `apiPostToFeed`, `topReactions` (small feed-mapping helpers) |
| 15407–16260 | **Live feed** | `LiveFeedTab` |
| 16261–16614 | Fanverse map | `FanverseMap` (see also `src/MapboxMap.jsx`) |
| 16615–17118 | Friends / rooms / QR | `FriendsPage`, `ChatHub`, `ChatRoom`, `QRPage` |
| 17119–17510 | **Safety / moderation** | `ReportSheet`, `SafetyCenter`, `ModerationReportCard`, `ModerationQueue` |
| 17511–18053 | **Concert day mode** | `EventDiscovery`, `VenueCrowdTips`, `ConcertDayBanner(Active)`, `ConcertDayMode` |
| 18054–19261 | Misc fan tools (small) | `ValueTracker`, `FanProjects`, `CreatorMode`, `BackupExport`, `FanIdentity`, `SmartNotifs`, `AIAssistant`, `TicketWallet`, `MiniGames`, `ConcertPrep`, `KWorldHub`, `KDramaTracker`, `AfterglowPage` |
| 19262–21034 | **Profiles (public) + DMs** | `PublicProfilePreview`, `PublicProfileFull`, `PublicFanPassport`, `ProfilePreview`, `DirectMessages` |
| 21035–22612 | **Profile tab + settings** | `FanAnniversaryWidget`, `TopBiasesSection`, `MyCircleSection`, `AccountSettings`, `Top5Section`, `ProfileTab` |
| 22613–23102 | **Music connect** | `NpSourceBadge`, `NowPlayingCard`, `MusicConnect` |
| 23103–24305 | **Concert Capsule + Passes** | `ConcertCapsule`, `PassPreviewCard`, `PassTextLayer`, `BackstagePasses` |
| 24306–25385 | **Profile Studio / skins / notifs** | `SkinThemeTab`, `ProfileStudio`, `PrivacySettings`, `StandaloneNotifCenter`, `NotificationCenter` |
| 25386–26026 | Shows / scrapbook | `MyShowsPage`, `ScrapbookTab`, `ScrapbookDetail` |
| 26027–26178 | Search / capsule landing | `FandomSearch`, `CapsuleLandingPage` |
| 26179–26627 | **Legal + public pages** | `LegalNav`, `DeleteAccountPage`, `PrivacyPage`, `TermsPage`, `SupportPage`, `ProfilePublicPage` |
| 26628–EOF | **App shell (root)** | `ModalWrapper`, `AppInner` — nav, modal stack, `go()` routing, top-level state |

> **2026-07-31 extraction note:** `Avatar` (+ its `resolveAvatarUrl`/`avatarInitial`/`feedAvatarColor` helpers) moved out of `App.jsx` into `src/components/Avatar.jsx`, removing 92 lines. Every row from **Live feed** onward is shifted by exactly −92 vs. any App.jsx line number you may have seen cited before this date. **Line numbers in this table are snapshot hints, not durable identifiers** — the durable anchor is always the function/component name; `grep -n "^function ComponentName"` before trusting a number, especially after any future extraction.

> **Navigation note:** bottom nav is 5 tabs, but internal `tab` ids do **not** match their labels — **"My World" = tab id `collect` = `LibraryTab`** (rows above: Library/Sets, Binders+Trade, Collect/inventory, Era Room); **"My Stage" = tab id `profile` = `ProfileTab`** (Profile tab + settings row); **"Tools" = tab id `fanverse` = `ToolsTab`**. Full tab-id ↔ label table lives in CURRENT_STATE.md §0 — check it before reasoning about routing or searching for a product name that isn't a literal component name above.

---

## `src/` support files (read these directly — they're small)

| File | Purpose |
|---|---|
| `src/main.jsx` | Vite entry — mounts `AppInner` |
| `src/MapboxMap.jsx` (~48 KB) | Map rendering + `CITY_DENSITY_GEOJSON`; imported by `FanverseMap` |
| `src/components/primitives.jsx` | Shared UI primitives |
| `src/components/Avatar.jsx` | `Avatar` component (search anchor: `export function Avatar(`) + its `resolveAvatarUrl`/`avatarInitial`/`feedAvatarColor` helpers — used everywhere (nav, DMs, feed, profiles, friends). Extracted from `App.jsx` 2026-07-31; first module-boundary extraction, template for future ones. |
| `src/lib/theme.js` | `DARK_THEME`, `LIGHT_THEME`, `C`, `applyThemeMode`, `ThemeContext` |
| `src/lib/visualSystem.js` | `VS`, tone/pill/badge/glass-card style helpers |
| `src/lib/storage.js` | `ls` localStorage wrapper |
| `src/lib/dateHelpers.js` | `formatRelativeOrDate`, `computeDaysLeft`, `getConcertStatus` |
| `src/lib/profileHelpers.js` | Profile-shape helpers |
| `src/lib/telemetry.js` | `track`, `trackScreen`, `identifyUser`, `captureError`, `EV` (PostHog/Sentry) |
| `src/data/mockGroups.js` | `ALL_GROUPS`, `KPOP_BIAS_CATALOG`, `searchBiasCatalog` |
| `src/data/cityList.js` | `CITY_LIST`, city key/display helpers |
| `src/data/mockConcerts.js` | `MOCK_SETLISTS` |
| `src/data/mockVenues.js` | `MOCK_VENUE_TIPS_DEFAULT` |
| `src/data/mockBadges.js` | `MOCK_BADGES` |
| `src/data/mockCollections.js` | `MOCK_INVENTORY` |

*App.jsx currently imports from all of the above (16 import lines at the top). New extractions should follow this same pattern.*

---

## Backend — `api_server_v16.js` (high level only)

Express 5, single file, a large route surface (see `docs/AGENT_CONTEXT_EFFICIENCY_AUDIT.md` for a dated size snapshot). Same rule: **don't read it whole** — jump to a section, read the slice. Route handlers cluster by domain (ranges below spot-checked 2026-07-31 against `/api/meetups` and `/api/binders` — held within a few lines of listed range, not fully re-verified end to end):

| Lines (approx) | Domain |
|---|---|
| 279–755 | AI routes `/api/ai/*` (⚠️ Outfit AI + Trip Planner blocks are **dormant** — no frontend caller) |
| 757–1277 | Subscriptions / VIP `/api/subscriptions/*` |
| 1278–1781 | Music Connect `/api/music/*` |
| 1782–1836 | Outfit inspo `/api/outfits/*` |
| 1837–2174 | Events + Ticketmaster pipeline `/api/events/*` |
| 2175–2437 | Scrapbook `/api/memories/*`, `/api/scrapbooks/*` |
| 2438–2823 | Feed comments + engagement (reposts/saves/reactions) |
| 2824–3046 | Meetups `/api/meetups/*` |
| 3047–3378 | Profile `/api/profile/*` |
| 3379–3475 | Moderation / blocks `/api/moderation/*` |
| 3476–5182 | Admin moderation, users, friends, messages, notifications setup |
| 5183–5359 | Notifications (Firebase FCM v1) |
| 5360–5629 | Marketplace, fan projects, capsule entries |
| 5630–5941 | Collection `/api/collection`, Photocards `/api/binders\|cards\|trade-listings` |
| 5942–6132 | Card templates `/api/card-templates` |
| 6133–6398 | Trade flow v2 (`listing_offers` / `listing_messages` / `listing_reports`) |
| 6399+ | Error handling + 404 catch-all (must stay last) |

Route groups by prefix (top): `/api/users` (9), `/api/friends` (9), `/api/music` (8), `/api/meetups` (8), `/api/ai` (7), `/api/messages` (6). Full inventory lives in CURRENT_STATE.md.

DB schema changes live in the root `supabase-*-migration.sql` files (one per feature).

---

## Root files — quick reference

| File | Read when |
|---|---|
| `CURRENT_STATE.md` | Always (shipped-state inventory) |
| `PROJECT_OVERVIEW.md` | Architecture background |
| `NEXT_PHASE_HANDOFF.md` | ⚠️ Older single-session diff — may be stale; don't treat as current |
| `APP_STORE_READINESS.md` / `LAUNCH_READINESS.md` | Launch/compliance tasks only |
| `DEPLOYMENT.md` | Deploy/env questions |
| `supabase-*-migration.sql` | The specific feature's schema |
| `package.json` | Scripts/deps — **not** `package-lock.json` |
| `vite.config.js`, `vercel.json`, `index.html` | Build/host config |

**Skip entirely unless explicitly needed:** `package-lock.json`, any `*.png`, `backstage pics/`, `public/*.png`, `dist/`, `node_modules/`, `.claude/`.
