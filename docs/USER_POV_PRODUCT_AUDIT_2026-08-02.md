# Backstage — User-POV Product Audit

**Date:** 2026-08-02
**origin/main tested:** `12e76cc` (local `main` fast-forwarded from `5db8fb2` to match before testing began)
**Production tested:** `https://backstagefanverse.com` (Vercel project `backstage-fanverse-01`)
**Method:** Live browser walkthrough (Claude Browser pane) against production, as a real user would use it — clicking, typing, resizing, switching accounts and themes, reading console/network. Not a code review.

This is a product-experience audit only. No application code, database, configuration, or deployment was changed. No fixes were implemented. One disposable test signup was created (`pip.audit.disposable.0802@gmail.com`, clearly not a real person) to test the signup flow; no personal data was entered anywhere.

---

## Resolution Status (added 2026-08-02, branch `fix/launch-blockers-signup-account-isolation`)

A follow-up pass fixed the five launch-blocker/launch-trust findings called out as priorities. All fixes are frontend-only (no SQL, schema, or config changes). Original findings below are preserved unedited; this section records what changed and the live verification evidence.

| Finding | Status | Root cause | Fix | Verified |
|---|---|---|---|---|
| **F01** — Signup succeeds silently, zero feedback | **RESOLVED** | `@supabase/auth-js` v2.106.0's `_sessionResponse()` transform (shared by `signUp`/`signInWithPassword`) reads `data.user` from a nested key that doesn't exist in GoTrue's "confirmation required" response (a flat user object) — so `signUp()` returns `{user:null, session:null, error:null}` even on genuine success. `handleSignUp` only acted on `if (d.user)`, silently doing nothing. | `handleSignUp` (App.jsx) now branches on `d.session` for the immediate-session path and treats any no-error result as success otherwise, routing to a new `signup_confirm_pending` screen ("Check your email to confirm your account", shows the submitted email, resend + back-to-sign-in). Also added inline email-format validation and cleared the stale cooldown banner on expiry. | Live on local dev against the real Supabase project: real disposable signup now lands on the confirmation screen instead of a frozen form. |
| **F14** — Previous account's collection data bleeds into a new account | **RESOLVED** | `useUserCards`/`useBinders`/`ScrapbookTab`/`SavedPostsSection` each fetch independently, gated only on the `tokenReady` boolean, with no reset tied to the actual user id — so a previous account's in-memory state could still be rendered momentarily (or longer) after switching accounts in the same tab. | All four now key a reset effect to the authenticated user id (`useAuth().user?.id`): the moment the id changes — including to/from signed-out — cached data clears to a real empty/loading state before any fetch for the new identity can resolve. Also fixed a related bug where a genuinely empty `/api/cards` result was ignored (`.length` truthy check) and could leave old data on screen. | Live on local dev: signed in as `pip_qa` (real data), signed out, signed into `pip_qa2` in the same tab with no reload — My World immediately showed a clean reset (not `pip_qa`'s numbers), then loaded `pip_qa2`'s own real data. Repeated the reverse direction (`pip_qa2` → `pip_qa`) with the same result. Reload/session-restore re-verified working normally afterward. |
| **F12** — Footer says "Prototype" | **RESOLVED** | Literal string in the My Stage footer. | Removed; footer now reads "Backstage v1.16.0". | Verified live in both themes. |
| **F08** — Smart Matching shows fabricated trader matches | **RESOLVED (as an honest preview, not real matching)** | Hardcoded array (`@trademaster`/`@kpopswap`, fixed 94%/87%) in the Smart Match bottom sheet — never a real backend call. | Replaced with an honest "PREVIEW" panel: explains what Smart Matching will do once Trade Hub V2 ships, no fabricated users/percentages, still shows the user's real ISO count. Building the actual real-matching backend (with reciprocal-trade detection, secure endpoints, etc.) is a separate, much larger initiative requiring new backend routes and a DB-approval checkpoint per this repo's rules — deferred, not done in this pass. | Verified live in both themes at 375px. |
| **F10** — Trade Hub header contradicts body | **RESOLVED (header/body agreement only)** | Header count read from `trades`, a `MOCK_ACTIVE_TRADES_DEFAULT` fallback explicitly commented "pre-real-data" legacy code; body correctly read the real `myOffers` state. Two disconnected data sources. | Header now derives its count from the same real `myOffers` state (excluding completed/declined/cancelled), so it always agrees with the body. Trade Passport's own stats (37 Trades/4.9★) were out of scope for this pass and are unchanged — flagged as a separate P3 follow-up. | Verified live: header and body both read "0" / "No active offers" consistently for the test account. |

**Deferred, not part of this pass** (both require backend/architecture work gated by this repo's "get explicit approval before writing backend/schema changes" rule, and were flagged back to the requester rather than started unilaterally):
- Building real, production-backed Smart Matching (reciprocal-trade detection, secure endpoints, scoring).
- The production load-performance investigation and optimization pass.
- Trade Passport's own possibly-decorative stats (F10 remainder).
- Remaining P3 items from the original audit (F02/F03 already partially addressed as a side effect of the F01 fix; F05, F07, F09, F11, F15 untouched).

---

## A. Executive user-experience verdict

| Area | Score (1-10) |
|---|---|
| Overall product polish | 6.5 |
| Onboarding (signup → first use) | **3** — critical silent-failure bug found |
| Core navigation (5-tab structure) | 8 |
| My World (collector) | 6 |
| Social (Fanverse/Explore feed) | 7.5 |
| Messaging (DMs) | 7.5 |
| Events/concerts | 7 |
| VIP/monetization | 7.5 |
| Trust/settings | 6 |
| Mobile (375-430px) | 8 |
| Desktop (wide viewport) | 3 — no responsive layout at all |

**One-paragraph honest verdict:** Backstage is a real, mostly-working product with a genuinely premium visual identity — the "cosmic editorial" dark mode in particular looks and feels like a finished, paid app, and the DM composer, Fanverse map, and VIP paywall are all built with real care. But this session found a **critical, fully-reproduced bug in the single most important flow in the entire product**: creating a new account via email/password silently does nothing from the user's point of view, even though Supabase is actually creating the account behind the scenes. Combined with a second confirmed bug where a previous account's private collection data visibly bleeds into a freshly-signed-in different account until the page is hard-reloaded, this audit's verdict is more cautious than the founder's own 2026-08-02 readiness doc, which reported zero confirmed P0/P1s — this session found two. Everything else — My World, messaging, VIP, legal pages — ranges from solid to very good, with a handful of honesty/polish issues (a fake-looking "Smart Matching" panel, a stray "Prototype" label) that are easy to fix but real.

---

## B. First-time-user walkthrough (chronological narrative)

1. **Landing** (signed out, 375px, light mode): clean, on-brand, value prop is immediately clear ("Your fandom. Your people. Your memories." / "Build My Stage, find your circle, and keep every concert era."). Two CTAs: "Get started →" and "I already have an account." No console errors, no stale beta language visible here.
2. **Sign up**: a two-field form (email, password, "at least 6 characters"). No username, no profile fields yet — appropriately minimal for step one.
3. **Validation testing:**
   - Malformed email ("not-an-email"): no HTML5 constraints on the inputs at all (verified via JS: no `required`/`pattern`/`minlength`), and no visible error appears — it silently does nothing.
   - Password under 6 characters: **this one works well** — a clear pink banner reads "Password must be at least 6 characters," readable in light mode.
   - Rapid repeated attempts trigger a real, well-implemented rate limit: "Backstage is cooling down signup emails. Wait 60 seconds and try once." with a live countdown and a disabled button. Good implementation — but its trigger condition (see below) is itself a symptom of the real bug.
4. **The actual account creation** (the critical finding — see §D, F01): filling in a syntactically valid, disposable email and a valid password and clicking "Create Account →" sends a real request to Supabase (`POST /auth/v1/signup` → **200**, confirmed via direct network inspection, with a genuine new user id and `confirmation_sent_at` timestamp in the response). **The screen does not change in any way.** No success message, no "check your email," no redirect, no loading spinner, nothing in the console. Waited 8+ seconds — nothing. A brand-new user at this exact moment, having just done everything asked of them correctly, is left staring at an unresponsive-looking form with no idea an account now exists and a confirmation email is waiting in their inbox.
5. Because there is no feedback, the natural next move is to click again — which is exactly what produces the "cooling down" rate-limit message a few attempts later. So the one piece of error-handling that *does* work well is only reachable because the primary success path is silently broken.
6. **Never got to see onboarding, username creation, profile photo, fandom selection, or the first post-onboarding screen** in this session, because the email-confirmation gate stands between signup and everything downstream, and this is a live production database — an audit shouldn't be receiving confirmation emails and clicking through them just to keep testing. This alone should be treated as the top action item: it's plausible the rest of onboarding is well-built and simply unreachable for most self-serve signups today.

---

## C. Returning-user walkthrough

Signed in as the persistent QA account (`pip.qa@backstage.test`, VIP). Session persisted correctly across a hard reload (no re-login required). Tab tour:

- **Fanverse** (landing tab after sign-in): real feed content, real reactions/comments/save affordances, story rail of (intentionally mock, per docs) fan bubbles plus one real post from a real account. Sub-tabs Feed / Map / Hubs / Circles. Map is honestly labeled `PREVIEW` and renders real Mapbox tiles with a real Seoul activity dot and city-activity stat line.
- **Explore**: For You / Concerts / Announcements / Passes / Fans. Cards are honestly labeled "Preview" where appropriate. Content overlaps noticeably with the Fanverse feed (same Fit Check / Merch Line posts appear in both) — the boundary between "Fanverse" and "Explore" is not obviously distinct to a new user (see §I).
- **My World**: see the dedicated deep-dive in §D/§E — this is where the most findings live.
- **Tools**: Build My Day, Chant Finder, Concert Prep, Comebacks & Drops, K-Dramas — a clean, purposeful grid, no dead entries found.
- **My Stage**: rich, well-designed profile hub (see F12/F13 below for two issues found here). Multi-fandom is clearly supported and shown (Stray Kids, BTS, aespa, NewJeans, BLACKPINK groups on one profile) — good evidence this is one flexible Fanverse, not siloed per-fandom accounts.
- **Sign out → sign back in as a different account**: this is where the most serious bug in the whole session was found (F14) — the previous account's private collection data visibly persisted into the new account's My World view until a hard page reload.
- **Legal/support pages** (`/privacy`, `/terms`, `/support`): all load cleanly, no login required, content is specific and honest (names every third-party processor, explains data retention, gives a real support email).

---

## D. Screen-by-screen issue inventory

| ID | Screen | Persona | Issue | Type | Severity | Evidence | Launch impact | Recommendation |
|---|---|---|---|---|---|---|---|---|
| F01 | Create Account (signup) | 1 | Successful signup (real Supabase 200, account created, confirmation email presumably sent) produces **zero** visible feedback — no message, no redirect, no loading state | Correctness / broken core journey | **P1** | Direct network capture: `POST .../auth/v1/signup` → 200, real user id + `confirmation_sent_at`; UI unchanged after 8+s; no console/Sentry entry | **Blocks organic/self-serve launch** and any beta wave that isn't 100% comped/pre-created accounts | Add a branch for "signed up, confirmation pending" → show "Check your email to confirm your account," disable the form, and/or auto-route to a "waiting for confirmation" screen |
| F14 | My World (Binder Progress + Wishlist) | 2/9 | Previous account's private collection stats and Wishlist cards render under a newly-signed-in different account until a hard reload | Data isolation / privacy | **P1/P2** | Reproduced twice: pip_qa's 22/6/1/2 stats + 6 wishlist cards appeared under pip_qa2 immediately after switching accounts in the same tab; corrected only after `location.reload()` | Real privacy exposure on shared/public devices; should block any messaging that leans on this being "production-grade" | Invalidate/refetch the shared `useUserCards()`-style cache on every auth state change (sign-in AND sign-out), not just on reload |
| F08 | My World → Wishlist → Smart Matching (VIP) | 4/8 | "Potential Matches" panel shows fabricated trader handles (@trademaster, @kpopswap) with precise-looking match percentages (94%/87%) for a feature the small print admits "launches with Trade Hub V2" | Trust/honesty (fake data presented as real) | **P2** | Screenshot + full modal text captured live | Undermines trust in a paid (VIP) feature specifically | Either label the whole panel "Preview," like the Map does, or hide it until Trade Hub V2 ships |
| F12 | My Stage (footer) | 2/9 | Footer literally reads "Backstage v1.16.0 · **Prototype**" | Stale/misleading copy | **P2** | Visible on every signed-in user's own profile, both themes | Directly undercuts "ready for organic/paid launch" positioning | One-line copy fix — remove "Prototype" |
| F13 | My Stage → My Circle | 5/9 | "Your circle is empty" shown despite this account having a known, working, reciprocal friend (DMs with that friend work in the same session) | Data sync (plausible) | P2 (unconfirmed root cause) | Get_page_text capture; cross-checked against persistent QA-account memory of an accepted friendship | Confusing/untrustworthy social proof on a user's own profile | Verify the `friends` query behind this specific widget; compare against what powers DM Circle-gating |
| F09 | My World → Collection → group binder detail | 4 | All 17 slots in the aespa binder use only 4 generic member names, every one subtitled identically "aespa · MY WORLD" — no era, version, or photocard number to tell slots apart | Product/architecture gap | P2 | Full card-by-card text capture | Undermines the core value of a photocard tracker once a group has more than a handful of cards | Needs the "formal My World relational schema" already flagged as a gap in `CURRENT_STATE.md` §3 |
| F15 | Whole app, desktop viewport | 2/9 | At 1440×900 the app renders as a small fixed-width mobile column pinned top-left, with a large empty void filling the rest of the window — no responsive desktop layout | Visual/mobile-web | P2 (desktop visitors) / P3 (effort) | Screenshot at 1440×900 | Anyone opening a shared link on a laptop sees what looks like a broken page | At minimum, center the mobile column against a themed background on wide viewports |
| F10 | My World → Trade Hub | 4 | Header chip says "2 active trades" while the body directly below says "No active offers"; Trade Passport shows "37 Trades / 4.9★" for an account with only 1 tradeable card visible elsewhere | Internal contradiction / possibly-decorative stat | P3 | Full screen text capture | Minor trust ding | Verify whether Trade Passport stats are live-computed or seeded placeholders |
| F11 | DM thread → Shared Scrapbook invite card | 6 | Icon slot renders literal text "??" instead of an emoji/icon | Visual bug | P3 | DOM inspection confirms literal `??` text, not a rendering artifact | Cosmetic, but visible on a real, currently-shipping feature | Fix the icon fallback/default value |
| F02/F03 | Create Account | 1 | No loading/disabled state for 1-4s after clicking submit (invites double-clicks → triggers the rate limit); the "cooling down" banner doesn't clear once the timer expires and the button re-enables | Missing loading state / stale UI state | P3 | Reproduced | Compounds F01's damage | Disable + show a spinner immediately on submit; clear the banner when the countdown hits 0 |
| F04 | Create Account | 1 | No inline error for a malformed email — silently no-ops | Missing validation feedback | P3 | Reproduced (no HTML5 constraints present, no error rendered) | Minor, but inconsistent with the password-length case which does show an error | Add the same inline-error pattern used for password length |
| F05 | My World landing | 2/4 | Binder Progress card briefly flashes "0 Binders" before correcting to the real count ~2s later | Loading-state polish | P3 | Reproduced twice | Minor trust flicker | Skeleton/shimmer instead of a wrong number, or don't render the stat until it resolves |
| F07 | My World → Collection card | 4 | "Stray Kids — 5-STAR" binder title truncates to "Stray Kids – 5-..." at 375px | Truncation | P3 | Screenshot | Cosmetic | Wrap or shorten the title pattern |

Findings F06 (group-tap routing, "Saved" as 5th pill) were explicitly **verified correct** — noted in §E as confirmed-good, not issues.

---

## E. Dead, stale, or misleading elements

**Confirmed dead/broken:**
- None found that are literally inert buttons with no handler at all — every apparent "dead button" investigated (My World card taps, DM thread rows, the VIP "Upgrade" pill) turned out to use `<div onclick>` instead of `<button>`, which works fine for real users clicking with a mouse/finger; it only looked dead to scripted testing until the right element was targeted. Worth a note to engineering only because it's an unusual pattern, not because it's broken for real users.

**Confirmed stale/misleading copy:**
- **"Backstage v1.16.0 · Prototype"** footer text on every signed-in user's My Stage screen (F12).
- **"Smart Matching"** VIP panel presents fabricated trader matches (specific handles, specific percentages) as if live, with the "not real yet" disclaimer only in small print at the bottom (F08).
- **Trade Hub "2 active trades"** header contradicting "No active offers" body copy in the same view (F10).

**Confirmed misleading/broken data:**
- Cross-account data bleed in My World stats/Wishlist after switching accounts without a reload (F14) — the most serious "misleading" finding, since it shows one identity's real private data under another identity's name.
- Generic, indistinguishable card slots in group binders (F09) — not exactly "fake," but functionally unable to represent the real catalog it claims to track.

**Explicitly and honestly labeled (good — not findings):**
- Fanverse Map activity numbers: labeled `PREVIEW`.
- Explore feed cards: labeled "Preview" where content is sample.
- Concert cards: labeled "Official · Ticketmaster."

---

## F. Visual inconsistencies

- **Global design system:** genuinely strong. Deep purple/black, lavender/pink glow, glassmorphism, and restrained gold accents are consistently applied across Fanverse, My World, My Stage, and the VIP modal. This is the product's strongest asset.
- **Light mode ("Pearl Mode"):** clean, high-contrast, no readability issues found.
- **Dark mode ("Concert Mode"):** excellent — arguably the more polished of the two themes; glowing avatar rings and neon accents read as premium, not garish.
- **Auth screens (signed-out landing/signup/sign-in) do not respond to system dark-mode preference** — they always render in the light/Pearl palette regardless of OS `prefers-color-scheme`. This may be intentional (many apps only theme the signed-in experience) but is worth a deliberate decision rather than an assumption.
- **Mobile (375-390px):** solid. One truncation found (F07); no horizontal-overflow bugs found (verified via `scrollWidth`/`innerWidth` equality, not just visual inspection).
- **Desktop (1440×900):** no responsive layout at all (F15) — the single biggest visual gap found.
- **Modals (VIP paywall):** well-built — close (×) button always visible and reachable, Founding Fan Pass card confirmed via computed-style comparison to visually match the Monthly card's border/background/padding (no second-class treatment), Annual correctly gets the accent-highlighted "Most fans choose this" treatment.
- **Icons:** one broken icon found (F11, the "??" scrapbook-invite icon); everything else sampled rendered correctly.

---

## G. Missing states

- **Signup success state**: does not exist (F01) — this is the most important missing state in the product today.
- **Loading state for Binder Progress stats**: currently a wrong-then-corrected flash rather than a skeleton (F05).
- **Submit-in-flight state for Create Account**: button stays fully interactive-looking for 1-4s after click with no spinner/disabled state (F02).
- Empty states that **are** done well and worth preserving as-is: My World → Saved ("Nothing saved yet. Tap the bookmark on any Fanverse or Explore post to keep it here. Go to the Feed"), My World → Wishlist for a fresh account ("Add your first ISO card"), a freshly-created empty binder ("No cards yet. Tap + Add to start tracking your collection.").

---

## H. Feature gaps

**Genuine missing/incomplete core functionality:**
- Working post-signup confirmation UX (F01) — this is a gap in the shipped experience, not a "future idea."
- Account-switch cache invalidation (F14).

**Incomplete existing functionality:**
- Smart Matching / Trade Hub V2 (openly described in-product as forthcoming, but currently dressed up as if functional — F08).
- Per-group catalog granularity in My World (F09) — matches the already-documented "no formal relational schema" gap.

**Recommended upgrades (not launch-blocking):**
- Skeleton loading states instead of flash-then-correct stat cards.
- A themed desktop container even without a full desktop redesign.

**Future ideas that should not delay launch:**
- Full desktop-native layout, real-time (non-polling) DMs, formal photocard relational schema — all already tracked in `CURRENT_STATE.md`/`NEXT_PHASE_HANDOFF.md` and correctly scoped as post-launch.

---

## I. Top 10 user complaints likely during week one

1. "I signed up and nothing happened — is this thing broken?" (F01 — will likely be the #1 complaint if self-serve signup is used for beta invites)
2. "Why does it say 'Prototype' at the bottom of my profile — is this even a real app?" (F12)
3. "I switched accounts on my friend's phone and saw their card collection for a second — that's creepy." (F14, on any shared-device use)
4. "The 'Smart Matching' thing showed me two trader names but neither of them actually exist when I look for them." (F08)
5. "I can't tell the difference between the Fanverse feed and Explore — they show me the same posts."
6. "My Circle says I have no friends but I can message my friend just fine."
7. "I opened the link on my laptop and it's a tiny box in the corner of the screen."
8. "The wishlist has three 'Winter' cards and I have no idea which one I actually need."
9. "It said I have 2 active trades but then told me I have no active offers."
10. "There's a weird '??' icon in one of my messages."

---

## J. Top 15 changes, ranked

| Rank | Change | Founder value | Launch risk reduced | User impact | Effort |
|---|---|---|---|---|---|
| 1 | Fix signup success feedback (F01) | Very high | Very high | Very high | Low |
| 2 | Fix cross-account cache bleed on sign-in (F14) | Very high | High | High | Low-medium |
| 3 | Remove "Prototype" from footer (F12) | High | Medium | Medium | Trivial |
| 4 | Label/hide fake Smart Matching data (F08) | High | Medium | Medium | Low |
| 5 | Investigate My Circle empty-state bug (F13) | Medium | Medium | Medium | Low (investigation) |
| 6 | Add submit-in-flight loading state to signup (F02) | High (compounds #1) | Medium | Medium | Low |
| 7 | Fix Trade Hub header/body contradiction (F10) | Medium | Low | Medium | Low |
| 8 | Fix "??" scrapbook icon (F11) | Low | Low | Low | Trivial |
| 9 | Clear stale cooldown banner on expiry (F03) | Low | Low | Low | Trivial |
| 10 | Add inline email-format validation error (F04) | Medium | Low | Medium | Low |
| 11 | Fix Binder Progress 0-flash (F05) | Low | Low | Low | Low |
| 12 | Center mobile layout on desktop viewports (F15) | Medium | Low | Medium (desktop visitors) | Low-medium |
| 13 | Reconcile Explore vs. Fanverse feed overlap (product decision, §I item 5) | Medium | Low | Medium | Medium (product design work) |
| 14 | Truncated binder title fix (F07) | Low | Low | Low | Trivial |
| 15 | Per-group catalog granularity (F09, era/version distinction) | Medium | Low | High (collector persona specifically) | High (schema work, already tracked) |

---

## K. Launch recommendation

| Stage | Verdict | Why |
|---|---|---|
| Invite-only beta | **GO, conditional on how invites are provisioned** | If beta users get comped/pre-created accounts (as QA accounts are), F01 never surfaces. If beta invites rely on self-serve email/password signup, **fix F01 first** — it will silently lose a meaningful fraction of invitees at the very first step. |
| Organic early-access launch | **NO-GO until F01 is fixed** | Self-serve signup is the entire mechanism of organic growth; a silently-broken signup button is disqualifying by itself, regardless of how good everything downstream is. |
| Small paid campaign | **NO-GO until F01 and F14 are both fixed** | Paid traffic is unforgiving of a broken first step, and F14 is a real privacy exposure that shouldn't be running while spending money to bring in new accounts. |
| Broad paid campaign | **NO-GO** | Same reasons as above, plus the already-documented (founder doc) load-testing and native-app gaps still apply. |

This is a materially more cautious recommendation than the founder's own 2026-08-02 readiness doc, which reported zero confirmed P0/P1 issues. The difference is explained by scope: that assessment verified an already-signed-in DM thread rendering correctly; this audit specifically walked the brand-new, signed-out-to-first-use path that the founder doc's own testing checklist (`LAUNCH_READINESS.md`: "[ ] Sign up → onboarding → app") had left unchecked.

---

## L. Recommended next implementation pass

A single, tightly-scoped pass containing only the highest-value confirmed fixes:

1. **Fix F01** — add a real "signed up, check your email to confirm" UI state (and ideally a "resend confirmation" affordance) so the signup form never again produces zero feedback on a successful signup.
2. **Fix F14** — invalidate/refetch the shared photocard/wishlist cache on every Supabase auth state change, not only on full reload.
3. **Fix F12** — delete the word "Prototype" from the footer version string.
4. **Fix F08** — either add a "Preview" label to the top of the Smart Matching panel (matching the Map's existing pattern) or hard-gate it behind a feature flag until Trade Hub V2 ships.
5. **Investigate F13** — a 15-minute DB check of the `friends` row for a known-good pair against what powers the My Circle widget; fix or reclassify.

Everything else in this report (F02/F03/F04/F05/F07/F09/F10/F11/F15) is real but lower-stakes, and can follow in a normal polish cadence without blocking a beta.

---

## Methodology notes / limitations

- Tested via the Claude Browser pane against live production, not local preview — matches the audit's instruction to prioritize production truth.
- Viewports covered: 375px, ~390px (device pixel ratio 2), 1440×900 desktop. A true mid-size tablet width (768-1024px) was not separately tested in this pass due to time; given the 375px→1440px jump revealed no intermediate breakpoint at all (F15), a tablet check would very likely show the same fixed-width behavior, but this is inferred, not directly observed.
- Both themes (Pearl/light and Concert/dark) were tested on the core Fanverse/My World/My Stage screens; not every single screen in the app was checked in both themes given the scope of the app.
- Personas 3 (multi-fandom), 7 (concert/event), and 8 (VIP) were tested at a lighter depth than 1/2/4/5/6/9 given the size of this audit; the VIP paywall modal, My Stage multi-group display, and Explore's Ticketmaster-sourced concert cards were all directly verified, but full Meetup/After-Party/Concert Day Mode flows and a completed Stripe checkout were not exercised in this session (Stripe checkout was intentionally not completed, per instructions not to complete an irreversible real-money purchase).
- No SQL, backend, or config changes were made. One disposable signup was created for testing purposes and is clearly labeled here; it should be safe to leave (it cannot log in without confirming its email) or deleted at Kacy's discretion.
