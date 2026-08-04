# DM Notification Routing, Scroll, Back-Nav & Web Video Fix — 2026-08-03

Branch: `claude/notification-dm-routing-web-video-010a20` (task requested
`fix/notification-dm-routing-web-video`; the worktree was already on a
dedicated task branch cut from `origin/main` at `3b67b17` with no drift, so
work continued there rather than creating a redundant second branch).

Starting `origin/main`: `3b67b17` (verified via `git fetch origin` — no drift
at any point during this pass).

This is a focused production bug-fix pass. No SQL, schema, or backend changes
were made — everything here is `src/App.jsx` only. `api_server_v16.js` is
unmodified (verified by test: "backend sanitizeDmMedia is untouched").

---

## 1. Root causes

### 1.1 Notification popover routes to Backstage Buzz instead of its destination
Every item in `NotificationBell`'s quick-view popover had `onClick={openFullCenter}`
unconditionally — there was no destination resolution in the popover at all,
just "always open Buzz." The real routing logic (`NOTIF_ROUTES` + `handleNotifTap`)
existed only inside `NotificationCenter` (Backstage Buzz), which is why tapping
the same notification a second time, inside Buzz, worked.

### 1.2 DM doesn't scroll to newest/target message
`useEffect(()=>{ msgEndRef.current?.scrollIntoView({behavior:"smooth"}); },
[activeConvo?.messages?.length])` fired immediately on mount, before any
image/video attachments in the thread had finished loading and expanding
their real layout height. The scroll landed at the (still-collapsed) bottom;
once media finished loading and pushed content down, nothing re-scrolled.
There was also no per-message target-scroll or highlight mechanism.

### 1.3 Back arrow loops / reopens the same DM
```js
useEffect(() => {
  if (!notifThreadId || activeConvo) return;
  const match = convos.find(c => c.id === notifThreadId);
  if (match) setActiveConvo(match);
}, [notifThreadId, convos, activeConvo]);
```
`notifThreadId` was consumed from storage once at mount but stayed in React
state forever. The header back button did `setActiveConvo(null)`, which
re-triggered this exact effect (it's in the dependency array), which
immediately found the same thread and reopened it — a same-tick loop.

### 1.4 Desktop web accepts photos but not videos
`handleAttach` did a strict `ALLOWED_VIDEO_TYPES.includes(raw.type)` check.
Desktop browsers — especially Windows Chrome/Edge — frequently report an
**empty string** or **`application/octet-stream`** for `File.type` on `.mov`
(and occasionally other video containers), since MIME resolution there
depends on OS file-association registries rather than real content sniffing.
Image MIME types are sniffed reliably everywhere, so photos never hit this;
videos silently failed the allowlist and were rejected. The installed PWA is
unaffected because mobile OS pickers (camera roll) always tag video files
with a correct system MIME.

Backend `sanitizeDmMedia` in `api_server_v16.js` already accepts any
`mimeType` string for `kind:'video'` — it does not validate MIME against an
allowlist — so this fix is entirely client-side.

---

## 2. Notification destination contract

`resolveNotifDestination(n)` (module-level, `src/App.jsx`) is the single
source of truth for "where does tapping this notification go." Both
`NotificationBell` (the popover) and `NotificationCenter` (Backstage Buzz)
call it — there is no second, diverging route table anymore.

Returns `null` for `friend_req` (kept open in-place for inline
Accept/Decline) and for any type with no mapped destination. Otherwise
returns `{ modal?, tab?, targetId, entityType, targetMessageId }`.

`stashNotifTarget(targetId, entityType, targetMessageId)` /
`consumeNotifTarget(entityType)` carry that payload through
`localStorage` as a one-shot handoff (same mechanism used by the
service-worker notification-click path and cold-launch `?notif=` URLs).
`consumeNotifTarget` now returns `{ targetId, targetMessageId }` instead of
a bare id — all four existing call sites (DM thread, meetup, trade offer,
friend request) were updated to destructure `.targetId`.

**`targetMessageId` is plumbed through end-to-end but not yet populated by
the backend** — `POST /api/messages/thread/:id/send`'s `deliverNotification`
call only ever sends `entityId: threadId, entityType: 'thread'`, no
message-level id. The DM scroll contract (§3) is written to use it when
present and falls back to "scroll to newest" when absent, per the stated
contract ("do not infer a message ID from a thread ID"). Today every real DM
notification exercises the fallback path. Wiring an exact per-message id
through is a backend change (a new field on `deliverNotification`) and is
out of scope for this pass — noted as a known limitation below.

---

## 3. DM scroll contract

Implemented in `DirectMessages`, scoped to `activeConvo` (group chat scroll
was left untouched — out of scope, not reported broken):

1. `positionedConvoRef` guards so positioning runs exactly once per opened
   conversation (keyed by convo id), not on every message-count change.
2. On open: resolve the target — a valid `notifMessageId` for *this specific*
   thread (checked against a stable `notifTargetThreadIdRef`, so a stale
   target never leaks onto an unrelated conversation the user opens next) if
   still present in the message list, otherwise "newest."
3. Waits for any `img`/`video` already in the DOM to report `load` /
   `loadedmetadata` / `error` before scrolling — not an arbitrary timeout as
   the only mechanism; a 1.5s timer exists only as a backstop in case a
   signed media URL hangs and never fires an event.
4. Scrolls once (`scrollIntoView({block:"center"})` for a found target
   message, `el.scrollTop = el.scrollHeight` for newest).
5. A target message gets a 1.8s highlight (soft accent-tinted background)
   via `highlightMsgId`, then clears.
6. `notifMessageId` and `notifThreadId` are cleared only *after* being
   successfully applied — never unconditionally — so the back button
   clearing `activeConvo` can't re-trigger a target that's already been used.
7. After initial positioning, new messages only auto-follow
   (`scrollTo({behavior:'smooth'})`) while the user is within 120px of the
   bottom (`isNearBottom`, tracked via a scroll listener) — browsing older
   history is never interrupted by an incoming/outgoing message.

## 4. Back-navigation contract

`openedViaTarget` (state) is `true` only while the active conversation was
reached via a one-shot target (`notifThreadId` match, or `dmTarget` from a
"Message" button elsewhere) rather than the user tapping a row in the DM
list. `openConvo` (the list-tap handler) explicitly resets it to `false`.

`entryOrigin` (prop, passed down from `AppInner`) is `"popover"` when the
`chats` modal was opened from the bell's quick-view, `"buzz"` when opened
from Backstage Buzz, and `null`/`undefined` for every other entry point
(dock, message buttons, the DM tab itself).

The header back button (`handleThreadBack`):
- If `openedViaTarget && (entryOrigin === "popover" || entryOrigin ===
  "buzz")` → calls `onBack()`, exiting the whole `chats` modal directly.
- Otherwise → `setActiveConvo(null)`, returning to the DM list (unchanged
  default behavior for every other entry point).

`AppInner`'s `closeChatsModal` (the `chats` modal's `onBack`) closes the
modal and, only for `entryOrigin === "buzz"`, reopens Backstage Buzz
(`go("notifications")`) after a 60ms beat — so popover-origin lands back on
whatever tab was underneath (normally Fanverse, since nothing else changed),
and Buzz-origin returns to Buzz in one tap, not two.

**Scope note:** this pass did not touch the app's existing browser-history
push/pop mechanism (`go()`'s `FULL_MODALS` `pushState`, the `popstate`
handler). The popover and Buzz destination-opens still use direct
`setModal`/`setTab` (mirroring how Buzz's `onNavigate` already worked before
this change) rather than routing through `go()`. Browser hardware/PWA back
at the top level of the `chats` modal keeps the same single-level-close
behavior every other modal in the app already has. The specific,
concretely-reproduced defect — the header back arrow reopening the same DM —
is fixed at its actual source (the stale `notifThreadId` effect); a deeper
rearchitecture of the global history stack was not attempted, per this
repo's "minimum change, no unrelated redesign" rule.

## 5. Browser video compatibility fix

`handleAttach` (`src/App.jsx`) now classifies a selected file as:

```
mimeUnreliable = !mime || mime === 'application/octet-stream'
isImage = ALLOWED_IMAGE_TYPES.includes(mime) || (mimeUnreliable && ALLOWED_IMAGE_EXTS.includes(ext))
isVideo = !isImage && (ALLOWED_VIDEO_TYPES.includes(mime) || (mimeUnreliable && ALLOWED_VIDEO_EXTS.includes(ext)))
```

The extension fallback (`jpg/jpeg/png/webp/heic`, `mp4/mov/webm`) only
engages when the browser's own MIME is missing or generic — a file that
reports a *real* MIME that simply isn't one of ours (e.g. `text/plain` on a
`.mp4`) is still rejected. This never widens acceptance beyond the exact
formats already supported; it only recovers the cases the previous code
false-negatived on.

When the fallback engages, the `File` is re-wrapped
(`new File([rawFile], name, { type: resolvedMime })`) so every downstream
consumer — the `<img>`/`<video>` preview, `resizeImageForUpload`, and the
signed-upload `PUT`'s `Content-Type` header — sees a real MIME type instead
of an empty one.

The hidden `<input type="file">`'s `accept` attribute now pairs MIME types
with extensions (`...,.jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.webm`) — some
desktop browsers filter the native picker off only the half of `accept` they
recognize, and `.mov` in particular can otherwise be hidden from the picker
entirely on browsers that can't map it to `video/quicktime`.

Upload size limit (24MB), backend validation (`sanitizeDmMedia`), and the
signed-URL upload path are all unchanged.

---

## 6. Browser/PWA QA matrix

All QA below was run against a **production build** (`npm run build` +
`vite preview`), not the Vite dev server — React 18 StrictMode (dev-only)
double-invokes lazy `useState` initializers, and `consumeNotifTarget`'s
initializer has a real side effect (deleting the stashed target from
`localStorage`). Under StrictMode this consumes the target twice and the
second (kept) mount sees nothing, so the notification would appear to route
to the list instead of the thread — a dev-only artifact, not a real bug (the
same pre-existing pattern already existed for `dmTarget`, `notifMeetupId`,
`notifOfferId`, and `notifRequestId`; production mounts components exactly
once, so this never manifests for real users). Not fixed in this pass —
out of scope; pointed out here for the next session's awareness.

Verified live against real Supabase data using the two persistent QA
accounts (`pip_qa` / `pip_qa2`, real Circle friends) — messages sent via a
direct authenticated call to `POST /api/messages/thread/:id/send` as
`pip_qa2`, consumed as `pip_qa` in the real browser UI:

| Check | Result |
|---|---|
| Popover: tap a DM notification | Opens the exact thread in one tap, no intermediate Buzz screen |
| Popover: only the tapped notification marked read | Confirmed — unrelated unread notifications stayed unread, badge count decremented by exactly 1 |
| Buzz: "View all updates" opens Buzz | Confirmed |
| Buzz: tap a DM notification | Opens the exact thread in one tap |
| Scroll: thread opens at newest message | Confirmed (both popover- and Buzz-origin opens) |
| Back: popover-origin DM → Fanverse | Confirmed, single tap |
| Back: Buzz-origin DM → Buzz | Confirmed, single tap, including a second full open/back cycle (no loop, no stuck state) |
| Back: DM-inbox-origin (organic list tap) → DM list | Confirmed — default behavior correctly unaffected |
| Web video: `.mov` with empty `File.type` | Accepted (no "Can't send that file" error), previewed, uploaded via real signed URL, sent via real `POST /send` (200 OK), rendered from a real Supabase signed storage URL after a full page reload |
| Console errors across the whole session | None |
| Pearl (light) / Concert (dark) mode | Both verified — DM thread, video message, and notification popover render cleanly in dark mode with no console errors |

**Not exercised in this pass** (environment limitations, not defects):
- A genuinely encodable/playable `.mov` file on real hardware — no video
  encoding tool was available in this environment; the test file above was a
  minimal MP4-container byte sequence with a `.MOV` extension and empty
  `type`, sufficient to prove the classification/upload/send/reload/signed-URL
  path but not full video *decode* playback. `git log` / the DM Phase 2 launch
  doc already flag physical-device video playback as previously unconfirmed;
  that gap is unchanged by this pass.
- Exact-target-message scroll-and-highlight — dormant until the backend
  supplies `targetMessageId` (see §2); covered by unit tests instead.
- 375px vs 390px pixel-level layout diffing — the app is a single fixed
  mobile-width column with no breakpoint between those two sizes (a
  pre-existing, separately-tracked condition — see
  `docs/USER_POV_PRODUCT_AUDIT_2026-08-02.md` finding F15), so this pass
  only verified at 375px.
- Android/PWA hardware-back specifically (no physical device in this
  environment) — the in-app header back arrow (verified) is the primary
  control surfaced in the bug report's own screenshots; browser/PWA hardware
  back continues to use the app's pre-existing single-level modal-close
  behavior, unchanged by this pass (see the back-navigation contract's scope
  note, §4).

---

## 7. Known limitations

- `targetMessageId` end-to-end (backend → exact message scroll) is plumbed
  client-side but dormant — needs a backend change to
  `deliverNotification`/the DM send route to supply a message id, which
  requires separate approval per this repo's backend-change rule.
- The global browser-history push/pop stack (`go()`'s `FULL_MODALS`
  mechanism) was not modified — popover/Buzz-opened DMs still bypass it the
  same way Buzz's destination-opening already did before this change.
- React StrictMode dev-only double-invoke affects the one-shot
  `consumeNotifTarget` pattern (see §6) — pre-existing across 5 call sites,
  not introduced or fixed by this pass.
