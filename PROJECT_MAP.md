# Backstage Fanverse — Project Map

*A navigation index for Claude sessions. Its whole job is to keep you **out** of a blind full-file scan of `src/App.jsx` (26k+ lines). Find the feature below, jump to the line anchor, read only that slice.*

**Line numbers are temporary hints and may drift. Locate code using the mapped file path and stable search anchor** (the component/function name, found via `grep -n "function ComponentName" src/App.jsx` or the relevant `src/components/*.jsx` file). Treat any line number in this doc as "start reading near here," never as the ownership record — the file path + component name is the authoritative pair. Line numbers are not re-verified after every extraction; don't expect this doc to stay numerically exact going forward.

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

**Anchors verified 2026-07-31** via `grep -n "^function "` (whole-file declaration scan, no ranges opened) — treat these as accurate as of that date, re-grep the component name if it's been a while since. **Rows from "Profiles (public) + DMs" through "App shell (root)" re-verified 2026-08-02** after the 2026-08-01 DM Phase 2 merge (`5db8fb2`) added ~1,370 net lines to `App.jsx` (premium DM composer, real media/voice-notes, scrapbook collaboration) — everything at or below that point in the file shifted down; rows above it are unaffected.

| Lines (verified 2026-07-31; rows below "Profiles + DMs" re-verified 2026-08-02) | Area | Key components / contents |
|---|---|---|
| 1–410 | **App config / env** | `API_URL`, Supabase env inspection, `MOCK_AUTH` flag, `AuthCtx` |
| 411–1099 | Auth provider + username/world rules + customization catalogs | `AuthProvider` (session, token, password recovery), `syncMyWorldToServer`, `clearAuthStorage`, `RESERVED_USERNAMES`, `IMPERSONATION_AFFIXES`, `MY_WORLD_KEYS`, `SKIN_GRADIENTS`, `SKIN_CATEGORIES`, `STAGE_DECO/FONTS/EFFECTS`, `SHRINE_LAYOUTS`, `CARD_STYLES` |
| ~1020 | GIF system — App.jsx remnant | Only `GIF_LS_MESSAGE_GIFS` (search anchor: `const GIF_LS_MESSAGE_GIFS`) — read/written by the DM thread code, not by `GifPicker`. Everything else (`GifPreviewBubble`/`GifImg`/`ReactionButton`/`GifPicker` + all GIF constants) now lives in `src/components/GifSystem.jsx` — see support-files table |
| 1332–2101 | Inline mock data + notif/push helpers | `MOCK_CONCERTS`, `MOCK_ACTIVE_TRADES_DEFAULT` (audit vs `src/data/` — some may be redundant), `filterActiveNotifs`, `getFirebaseConfig`, `getDeliveryPrefs`. `VipBadge`/`FounderBadge`/`FounderPrestigeCard`/`VipGate`/`UpgradeModal`/`VipCelebrationScreen`/`VipTutorialModal` moved to `src/components/VipSystem.jsx` — see support-files table |
| 2102–2760 | Invite / referral | `InvitePage` |
| 2761–3016 | Small AI/util cards | `ContentGenerator`, `ConcertDayCard`, `IdentityCard`, `MapSnapshot` |
| 3017–3497 | **App chrome / floating UI** | `FanverseHeatMap`, `ViralTicker`, `InstallPromptCard`, `NotificationBell`, `FloatingMessagesButton`, `AskBackstageButton`, `FanverseFloatingDock` |
| 3498–4285 | **Onboarding / auth screens** | `Onboarding`, `SetNewPasswordScreen` |
| 4286–5223 | **Concerts / shows** | `ConcertsPage`, `AiItinerary`, `ShowDetail` |
| 5224–7273 | **Photocards — Library/Sets** | `CardDetailSheet`, `PhotocardSetsView`, `PhotocardGrid`, `SavedPostsSection`, `AchievementsModal`, `LibraryTab` |
| 7274–9870 | **Photocards — Binders + Trade** | `GroupBinderHome`, `BinderCreate`, `CustomBinderForm`, `AddCardForm`, `TradeListingForm`, `BinderDetail`, `TradeListingDetail`, `MakeOfferForm`, `OfferThread`, `TradePassportCard`, `TradeHub` |
| 9871–10326 | Collect / inventory | `CollectTab`, `InventoryTab` |
| 10327–12277 | **Fanverse social** | `MemeSystem`, `FanBuddyMatcher`, `BudgetTracker`, `FanverseLeaders`, `FanDiscoverySection`, `FanversePulse`, `CityHubDetail`, `FanverseTab`, `CommunityTab`, `BuildMyDay` |
| 12278–13022 | **Era Room** | `EraRoom` |
| 13023–14044 | Explore / Tools tabs | `ExploreTab`, `ToolsTab`, `ComebacksEraWatch` |
| 14045–14869 | Chants / era board / stories | `ChantVault`, `EraBoard`, `FanStories`, `apiPostToFeed`, `topReactions` (small feed-mapping helpers) |
| 14870–15723 | **Live feed** | `LiveFeedTab` |
| 15724–16077 | Fanverse map | `FanverseMap` (see also `src/MapboxMap.jsx`) |
| 16078–16581 | Friends / rooms / QR | `FriendsPage`, `ChatHub`, `ChatRoom`, `QRPage` |
| 16582–16973 | **Safety / moderation** | `ReportSheet`, `SafetyCenter`, `ModerationReportCard`, `ModerationQueue` |
| 16974–17516 | **Concert day mode** | `EventDiscovery`, `VenueCrowdTips`, `ConcertDayBanner(Active)`, `ConcertDayMode` |
| 17517–18493 | Misc fan tools (small) | `ValueTracker`, `FanProjects`, `CreatorMode`, `BackupExport`, `FanIdentity`, `SmartNotifs`, `AIAssistant`, `TicketWallet`, `MiniGames`, `ConcertPrep`, `KWorldHub`, `KDramaTracker`, `AfterglowPage` — *upper bound re-derived 2026-08-02 to abut the row below (was 18724 as of 2026-07-31); this row's own boundary wasn't independently re-verified, only backed into so the table stays contiguous* |
| 18494–20883 | **Profiles (public) + DMs** | `PublicProfilePreview`, `PublicProfileFull`, `PublicFanPassport`, `ProfilePreview`, `DirectMessages` (now includes the 2026-08-01 premium composer + real media/voice-notes + reactions — see CURRENT_STATE.md) |
| 20884–22461 | **Profile tab + settings** | `FanAnniversaryWidget`, `TopBiasesSection`, `MyCircleSection`, `AccountSettings`, `Top5Section`, `ProfileTab` |
| 22462–22951 | **Music connect** | `NpSourceBadge`, `NowPlayingCard`, `MusicConnect` |
| 22952–24154 | **Concert Capsule + Passes** | `ConcertCapsule`, `PassPreviewCard`, `PassTextLayer`, `BackstagePasses` |
| 24155–25238 | **Profile Studio / skins / notifs** | `SkinThemeTab`, `ProfileStudio`, `PrivacySettings`, `StandaloneNotifCenter`, `NotificationCenter` |
| 25239–25863 | Shows / scrapbook | `MyShowsPage`, `ScrapbookTab`, `ScrapbookDetail` (collaboration now backed by real `scrapbooks`/`scrapbook_collaborators` tables — see CURRENT_STATE.md) |
| 25864–26015 | Search / capsule landing | `FandomSearch`, `CapsuleLandingPage` |
| 26016–26464 | **Legal + public pages** | `LegalNav`, `DeleteAccountPage`, `PrivacyPage`, `TermsPage`, `SupportPage`, `ProfilePublicPage` |
| 26465–EOF | **App shell (root)** | `ModalWrapper`, `AppInner` — nav, modal stack, `go()` routing, top-level state |

> **Extraction log (2026-07-31):** `Avatar` (+ `resolveAvatarUrl`/`avatarInitial`/`feedAvatarColor`) → `src/components/Avatar.jsx`. `GifPreviewBubble`/`GifImg`/`ReactionButton` (+ mood-gradient constants) → `src/components/GifSystem.jsx`; `GifPicker` stayed in App.jsx (needs the still-monolithic `api` client). `VipBadge`/`FounderBadge`/`FounderPrestigeCard`/`VipGate`/`UpgradeModal`/`VipCelebrationScreen`/`VipTutorialModal` → `src/components/VipSystem.jsx` (only needs `C`, `ls`, and a duplicated one-line `API_URL` read — no `api` dependency, so all of it moved cleanly); the adjacent `MOCK_CONCERTS`/`MOCK_ACTIVE_TRADES_DEFAULT`/notif-helpers did not move.
>
> **Extraction log (2026-07-31, later same day):** the `api` singleton + `parseApiResponse` → `src/lib/apiClient.js` (configured singleton — `App.jsx` calls `configureApiClient({ apiUrl, getSupabase })` once after `_supabase` inits; see that file's row below). Pure move, same public shape, all 169 existing `api.get/post/patch/del` call sites in `App.jsx` untouched. `API_URL` and `_supabase` themselves stayed in `App.jsx` — both are still read directly by other App.jsx code outside `api`. Full rationale in `docs/API_CLIENT_BOUNDARY_AUDIT.md`. This unblocks a future `GifPicker` extraction (see the `apiClient.js` support-files row) — not done in this pass.
>
> **Extraction log (2026-07-31, third pass):** `GifPicker` + its exclusive constants (`GIF_MOOD_CHIPS`, `GIF_DEFAULT_Q`, `GIF_LS_RECENT_SEARCHES`, `GIF_LS_RECENT_REACTIONS`, `GIF_LS_MEDIA_TYPE`) → `src/components/GifSystem.jsx`, importing `api` from `src/lib/apiClient.js` and `ls` from `src/lib/storage.js`. Pure move, same props/markup/behavior. `GIF_LS_MESSAGE_GIFS` stayed in `App.jsx` (used by DM thread code, not `GifPicker`). `GifSystem.jsx` is now the sole home of the whole GIF/reaction feature.
>
> Table line numbers were last fully re-verified 2026-07-31, right after these three moves. **They will not be re-verified or reshifted after future extractions** — that's a full-table rebuild every time and isn't the point of this doc. Going forward, treat every row's line number as a stale hint the moment any extraction happens anywhere above it in the file. What stays authoritative: the **file path** (`src/App.jsx` unless the support-files table below says otherwise) and the **component/function name** — find its current line with `grep -n "function ComponentName" src/App.jsx` (or `export function`/`export const` in the relevant `src/components/*.jsx` file) before trusting any number in this doc.

> **Navigation note:** bottom nav is 5 tabs, but internal `tab` ids do **not** match their labels — **"My World" = tab id `collect` = `LibraryTab`** (rows above: Library/Sets, Binders+Trade, Collect/inventory, Era Room); **"My Stage" = tab id `profile` = `ProfileTab`** (Profile tab + settings row); **"Tools" = tab id `fanverse` = `ToolsTab`**. Full tab-id ↔ label table lives in CURRENT_STATE.md §0 — check it before reasoning about routing or searching for a product name that isn't a literal component name above.

---

## `src/` support files (read these directly — they're small)

| File | Purpose |
|---|---|
| `src/main.jsx` | Vite entry — mounts `AppInner` |
| `src/MapboxMap.jsx` (~48 KB) | Map rendering + `CITY_DENSITY_GEOJSON`; imported by `FanverseMap` |
| `src/components/primitives.jsx` | Shared UI primitives |
| `src/components/Avatar.jsx` | `Avatar` component (search anchor: `export function Avatar(`) + its `resolveAvatarUrl`/`avatarInitial`/`feedAvatarColor` helpers — used everywhere (nav, DMs, feed, profiles, friends). Extracted from `App.jsx` 2026-07-31; first module-boundary extraction, template for future ones. |
| `src/components/GifSystem.jsx` | `GifPreviewBubble`, `GifImg`, `ReactionButton` (search anchor: `export function GifPreviewBubble(` etc.) — pure/presentational GIF-reaction rendering, used in DMs and Notification Center. `GifPicker` (search anchor: `export function GifPicker(`) — the stateful GIF/sticker search bottom-sheet, + its exclusive constants (`GIF_MOOD_CHIPS`, `GIF_DEFAULT_Q`, `GIF_LS_RECENT_SEARCHES`, `GIF_LS_RECENT_REACTIONS`, `GIF_LS_MEDIA_TYPE`) — moved here 2026-07-31 now that `api` is importable from `src/lib/apiClient.js`. `GIF_LS_MESSAGE_GIFS` did **not** move — it's used by DM thread code in `App.jsx`, not by `GifPicker` itself. |
| `src/components/VipSystem.jsx` | `VipBadge`, `FounderBadge`, `FounderPrestigeCard`, `VipGate`, `UpgradeModal`, `VipCelebrationScreen`, `VipTutorialModal` (search anchor: `export function VipGate(` etc.) — the full VIP/Founder upgrade-and-celebration UI. Extracted 2026-07-31; only needs `C`, `ls`, and its own `API_URL` read, no `api` client dependency. |
| `src/lib/apiClient.js` | The `api` singleton (`get`/`post`/`patch`/`del`, `_setToken`/`_headers`/`_refreshToken`) + `parseApiResponse` (search anchor: `export const api = {`). Extracted 2026-07-31 — see `docs/API_CLIENT_BOUNDARY_AUDIT.md`. `App.jsx` calls `configureApiClient({ apiUrl, getSupabase })` once, right after `_supabase` is created, since `api._refreshToken()` needs live access to it. `GifPicker` (see `GifSystem.jsx` row above) now imports `api` from here directly. |
| `src/lib/theme.js` | `DARK_THEME`, `LIGHT_THEME`, `C`, `applyThemeMode`, `ThemeContext` |
| `src/lib/visualSystem.js` | `VS`, tone/pill/badge/glass-card style helpers |
| `src/lib/storage.js` | `ls` localStorage wrapper. Also owns the account-isolation boundary used on sign-out: `USER_SCOPED_STORAGE_KEYS`/`USER_SCOPED_STORAGE_PREFIXES` (reviewed account-specific keys, cleared unconditionally) and `clearUserScopedStorage({userId, userKey, username})` (also clears that user's id-/key-/username-scoped entries; skips+reports any missing identifier rather than sweeping other accounts). Called only from `App.jsx`'s explicit `signOut()` — see `docs/STORAGE_BOUNDARY_AUDIT.md`. |
| `src/lib/dateHelpers.js` | `formatRelativeOrDate`, `computeDaysLeft`, `getConcertStatus` |
| `src/lib/profileHelpers.js` | Profile-shape helpers |
| `src/lib/telemetry.js` | `track`, `trackScreen`, `identifyUser`, `captureError`, `EV` (PostHog/Sentry) |
| `src/data/mockGroups.js` | `ALL_GROUPS`, `KPOP_BIAS_CATALOG`, `searchBiasCatalog` |
| `src/data/cityList.js` | `CITY_LIST`, city key/display helpers |
| `src/data/mockConcerts.js` | `MOCK_SETLISTS` |
| `src/data/mockVenues.js` | `MOCK_VENUE_TIPS_DEFAULT` |
| `src/data/mockBadges.js` | `MOCK_BADGES` |
| `src/data/mockCollections.js` | `MOCK_INVENTORY` |

*App.jsx currently imports from all of the above (17 import lines at the top). New extractions should follow this same pattern.*

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
| 2175–2564 | Scrapbook `/api/memories/*`, `/api/scrapbooks/*` (range re-verified 2026-08-02 — the 2026-08-01 DM Phase 2 merge added collaborator invite/respond/remove/my-status routes here, ~+130 lines vs. the previous 2175–2437) |
| ~2565–7290 | Feed comments/engagement, Meetups, Profile, Moderation, Admin/users/friends/messages/notifications, FCM, Marketplace, Collection/Photocards, Card templates, Trade flow v2, Smart Matching (`/api/smart-matches`, `/api/smart-matches/:matchedUserId`, added 2026-08-02 just above the 404 catch-all — search anchor `SMART MATCHING (V1)`) — **all other rows in this span are stale line-number estimates carried over from 2026-07-31 and were not individually re-verified in this pass.** The file grew from ~6,400 to 7,101 lines in the 2026-08-01 DM Phase 2 merge and to ~7,332 lines in the 2026-08-02 Smart Matching V1 addition, so every boundary below "Scrapbook" has shifted. Domain order is unchanged; grep the route path you need rather than trusting an old number. |
| 7295+ | Error handling + 404 catch-all (must stay last) — re-verified 2026-08-02 (was 7064+) |

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
