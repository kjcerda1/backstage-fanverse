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

`src/App.jsx` is **~26,250 lines / ~2 MB** — a full read is ~½ million tokens and will blow your context for no benefit. Instead:

1. Find the feature in the map below → get the line anchor.
2. `grep -n "function TheComponent" src/App.jsx` to confirm the current line.
3. Read a bounded slice (e.g. `offset`/`limit` around the anchor), not the file.
4. Shared helpers already live in `src/lib`, `src/data`, `src/components` — read those small files directly instead of hunting inside App.jsx.

Only read App.jsx end-to-end if the user **explicitly** asks for a whole-file pass.

---

## `src/App.jsx` — feature → line anchor

One monolith, ~238 top-level components. Grouped by feature area:

| Lines (approx) | Area | Key components / contents |
|---|---|---|
| 33–300 | **App config / env** | `API_URL`, Supabase env inspection, `MOCK_AUTH` flag |
| 105 | Auth context | `AuthCtx` |
| 309–450 | Auth provider | `AuthProvider` (session, token, password recovery) |
| 454–700 | Username / world rules | `RESERVED_USERNAMES`, `IMPERSONATION_AFFIXES`, `MY_WORLD_KEYS` |
| 705–978 | **Customization catalogs** | `SKIN_GRADIENTS`, `SKIN_CATEGORIES`, `STAGE_DECO/FONTS/EFFECTS`, `SHRINE_LAYOUTS`, `CARD_STYLES`, `SECTION_EFFECTS` |
| 979–1277 | **GIF system** | `GifPicker`, `GifImg`, `GifPreviewBubble`, `ReactionButton`, GIF mood constants |
| 1278–1765 | **VIP / Founder / Upgrade** | `VipBadge`, `FounderBadge`, `FounderPrestigeCard`, `VipGate`, `UpgradeModal`, `VipCelebrationScreen`, `VipTutorialModal` |
| 1766–2402 | **Inline mock data** | `MOCK_CONCERTS`, `MOCK_CARDS`, `MOCK_FEED`, `MOCK_CHANTS`, etc. (audit vs `src/data/` — some may be redundant) |
| 2403–3057 | Invite / referral | `InvitePage` |
| 3058–3313 | Small AI/util cards | `ContentGenerator`, `ConcertDayCard`, `IdentityCard`, `MapSnapshot` |
| 3314–3794 | **App chrome / floating UI** | `FanverseHeatMap`, `ViralTicker`, `InstallPromptCard`, `NotificationBell`, `FloatingMessagesButton`, `AskBackstageButton`, `FanverseFloatingDock` |
| 3795–4582 | **Onboarding / auth screens** | `Onboarding`, `SetNewPasswordScreen` |
| 4583–5520 | **Concerts / shows** | `ConcertsPage`, `AiItinerary`, `ShowDetail` |
| 5521–7439 | **Photocards — Library/Sets** | `CardDetailSheet`, `PhotocardSetsView`, `PhotocardGrid`, `SavedPostsSection`, `LibraryTab` (LibraryTab alone ~1,230 lines) |
| 7440–9193 | **Photocards — Binders + Trade** | `BinderCreate`, `CustomBinderForm`, `AddCardForm`, `TradeListingForm`, `BinderDetail`, `TradeListingDetail`, `MakeOfferForm`, `OfferThread`, `TradePassportCard`, `TradeHub` |
| 9194–9626 | Collect / inventory | `CollectTab`, `InventoryTab` |
| 9627–11555 | **Fanverse social** | `MemeSystem`, `FanBuddyMatcher`, `BudgetTracker`, `FanverseLeaders`, `FanDiscoverySection`, `FanversePulse`, `CityHubDetail`, `FanverseTab`, `CommunityTab`, `BuildMyDay` |
| 11556–12300 | **Era Room** | `EraRoom` |
| 12301–13323 | Explore / Tools tabs | `ExploreTab`, `ToolsTab`, `ComebacksEraWatch` |
| 13324–14159 | Chants / era board / stories | `ChantVault`, `EraBoard`, `FanStories` |
| 14160–14241 | **Avatar (shared)** | `Avatar` — used everywhere; prime extraction candidate |
| 14242–15095 | **Live feed** | `LiveFeedTab` |
| 15096–15449 | Fanverse map | `FanverseMap` (see also `src/MapboxMap.jsx`) |
| 15450–15953 | Friends / rooms / QR | `FriendsPage`, `ChatHub`, `ChatRoom`, `QRPage` |
| 15954–16345 | **Safety / moderation** | `ReportSheet`, `SafetyCenter`, `ModerationReportCard`, `ModerationQueue` |
| 16346–16888 | **Concert day mode** | `EventDiscovery`, `VenueCrowdTips`, `ConcertDayBanner(Active)`, `ConcertDayMode` |
| 16889–17884 | Misc fan tools (small) | `ValueTracker`, `FanProjects`, `CreatorMode`, `BackupExport`, `FanIdentity`, `SmartNotifs`, `AIAssistant`, `TicketWallet`, `MiniGames`, `ConcertPrep`, `KWorldHub`, `KDramaTracker`, `AfterglowPage` |
| 17885–19811 | **Profiles (public) + DMs** | `PublicProfilePreview`, `PublicProfileFull`, `PublicFanPassport`, `ProfilePreview`, `DirectMessages` (DMs alone ~1,010 lines) |
| 19812–21311 | **Profile tab + settings** | `FanAnniversaryWidget`, `TopBiasesSection`, `MyCircleSection`, `AccountSettings`, `Top5Section`, `ProfileTab` |
| 21312–21801 | **Music connect** | `NpSourceBadge`, `NowPlayingCard`, `MusicConnect` |
| 21802–23004 | **Concert Capsule + Passes** | `ConcertCapsule`, `PassPreviewCard`, `PassTextLayer`, `BackstagePasses` |
| 23005–24080 | **Profile Studio / skins / notifs** | `SkinThemeTab`, `ProfileStudio`, `PrivacySettings`, `StandaloneNotifCenter`, `NotificationCenter` |
| 24081–24721 | Shows / scrapbook | `MyShowsPage`, `ScrapbookTab`, `ScrapbookDetail` |
| 24722–24873 | Search / capsule landing | `FandomSearch`, `CapsuleLandingPage` |
| 24874–25313 | **Legal + public pages** | `LegalNav`, `DeleteAccountPage`, `PrivacyPage`, `TermsPage`, `SupportPage`, `ProfilePublicPage` |
| 25314–26246 | **App shell (root)** | `ModalWrapper`, `AppInner` — nav, modal stack, `go()` routing, top-level state |

> **Navigation note:** bottom nav is 5 tabs, but internal `tab` ids do **not** match their labels. See CURRENT_STATE.md §0 before reasoning about routing.

---

## `src/` support files (read these directly — they're small)

| File | Purpose |
|---|---|
| `src/main.jsx` | Vite entry — mounts `AppInner` |
| `src/MapboxMap.jsx` (~48 KB) | Map rendering + `CITY_DENSITY_GEOJSON`; imported by `FanverseMap` |
| `src/components/primitives.jsx` | Shared UI primitives |
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

Express 5, single file, **~6,440 lines / 145 routes**. Same rule: **don't read it whole** — jump to a section, read the slice. Route handlers cluster by domain:

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
