# DM Notification Routing, Scroll, Back-Nav & Web Video Fix — 2026-08-03

Branch: `claude/notification-dm-routing-web-video-010a20` (task requested
`fix/notification-dm-routing-web-video`; the worktree was already on a
dedicated task branch cut from `origin/main` at `3b67b17` with no drift, so
work continued there rather than creating a redundant second branch).

Starting `origin/main`: `3b67b17` (verified via `git fetch origin` — no drift
at any point during either pass on this branch).

This is a focused production bug-fix pass, done in two rounds. No SQL or
schema changes were made in either round — everything is `src/App.jsx`
only. `api_server_v16.js` is unmodified (verified by test: "backend
sanitizeDmMedia is untouched"). Round 2 (this update) closed acceptance gaps
the first round's report had left unverified: it traced the exact-message-id
data path to a concrete (unapplied) schema requirement, found and fixed a
real browser-Back inconsistency, and re-ran video QA with real playable
media files instead of only synthetic ones.

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

### 2.1 Exact target-message flow — traced end-to-end, and why it's dormant

Full path, traced through the actual code (not assumed):

1. **DM send** — `POST /api/messages/thread/:id/send` inserts the row into
   `messages` and gets back a real `data.id` (the new message's own uuid) —
   see `api_server_v16.js` around the `supabase.from('messages').insert(...)`
   call.
2. **Notification creation** — the same route immediately calls
   `deliverNotification({ userId, type:'dm_received', ..., entityId:
   req.params.id, entityType:'thread', ... })`. **`data.id` (the message's own
   id) is never passed in.** Only the thread id.
3. **Stored fields** — `deliverNotification` inserts into `notifications`
   with columns `entity_id` (uuid), `entity_type` (text), plus
   `target_modal`/`target_tab`/`gif`. Confirmed the *live* schema (not just
   the code) via `information_schema.columns` on the real Supabase project
   (`wshqjxsbwqijodlskrbx`): the `notifications` table has exactly
   `id, user_id, type, title, body, actor_id, entity_id, entity_type,
   target_modal, target_tab, read, created_at, read_at, gif` — **no column
   exists to carry a second id (a message id) alongside `entity_id`.**
4. **Notifications API response** — `GET /api/notifications` selects that
   same column list; `toClientNotification()` maps `entity_id` →
   `entityId`. There is no `targetMessageId` anywhere in this response
   because there is nowhere in the row for the backend to have put one.
5. **Normalization / resolver / DM entry state / scroll** — all already
   correctly built to carry and consume a `targetMessageId` end-to-end (see
   §2.2–§3) — this half of the pipe is real and tested. It is just never fed
   anything today, because step 3 has nowhere to store it.

**Conclusion: a real message id is not currently available anywhere in the
notification payload, and cannot be added without a schema change.**
`entity_id` cannot simply be repurposed to hold the message id instead of
the thread id — the client needs the **thread id** to know which
conversation to open at all (`consumeNotifTarget('thread')` matches
`convos.find(c => c.id === notifThreadId)`); overwriting it with a message id
would break opening the correct thread entirely, trading one bug for a worse
one.

**Exact requirement to make this real** (not applied — stopping here per
instruction; needs approval per this repo's backend/schema-change rule):

```sql
-- supabase-notifications-target-message-migration.sql (proposed, NOT applied)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_message_id uuid;
```

Plus three small backend edits, all in `api_server_v16.js`:
- `deliverNotification({..., targetMessageId = null})` — accept the new
  param, insert it as `target_message_id` in the `notifications` insert.
- The `POST /api/messages/thread/:id/send` route — pass
  `targetMessageId: data.id` (the message row just inserted) in its
  `deliverNotification(...)` call.
- `toClientNotification()` — add `targetMessageId: n.target_message_id ||
  null` to the mapped response, and optionally include it in the FCM
  `data:` payload in `deliverNotification`'s push branch.

No other files need to change — `resolveNotifDestination()`,
`stashNotifTarget`/`consumeNotifTarget`, and the DM scroll contract (§3)
already read `n.targetMessageId` and would light up correctly the moment the
backend starts sending it. This is confirmed by test:
`resolveNotifDestination: a real targetMessageId from the notification
payload survives normalization end-to-end` in
`tests/notification-dm-navigation.test.js`, which simulates exactly this
future payload shape and proves the frontend handles it correctly today.

### 2.2 What's built and verified now

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

Today every real DM notification's `targetMessageId` is `null` (per §2.1),
so the DM scroll contract (§3) always exercises its "fall back to newest"
path — which is itself the explicitly required, verified behavior, not a
placeholder.

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

`AppInner`'s `closeChatsModal` (the `chats` modal's `onBack`, i.e. the
in-app "←") closes the modal and, only for `entryOrigin === "buzz"`, reopens
Backstage Buzz (`go("notifications")`) after a 60ms beat — so popover-origin
lands back on whatever tab was underneath (normally Fanverse, since nothing
else changed), and Buzz-origin returns to Buzz in one tap, not two.

### 4.1 Browser Back/Forward — mechanism and a real bug found in round 2

The app tracks browser history with a 2-level stack (`AppInner`'s
`popstate` effect): `{bsLevel:0}` is the back-stop (root), `{bsLevel:1}` is
"somewhere in the app." `go(dest)` pushes a fresh `{bsLevel:1, modal:dest}`
entry for anything in `FULL_MODALS` (which includes `"chats"` and
`"notifications"`); the `onPop` handler closes whatever's open on a
browser-Back press and immediately re-pushes `{bsLevel:1}` to reseal the
back-stop for the next press.

**Confirmed live** (production build, real browser Back/Forward via the
tool's `navigate({url:"back"})`, not just the in-app arrow):
- The bell's `onOpen` (`setModal("notifications")`) and its `onNavigate`
  (direct `setModal`/`setTab`) never call `go()`, so opening Buzz or a DM
  from the popover/Buzz **never pushes a history entry** for that specific
  transition — `history.length` and `history.state` were byte-identical
  before and after (verified via `history.length`/`history.state`
  inspection at each step).
- Despite that, browser Back from a **popover**-opened DM correctly closed
  back to Fanverse — the generic `onPop` fallback (`if(modal){
  setModal(null); ...}`) already handled it, since it just closes whatever
  modal is open regardless of how it got there.
- **Browser Back from a Buzz-opened DM did NOT match the in-app arrow**: it
  closed straight to Fanverse, skipping Backstage Buzz entirely — a real,
  reproducible disagreement between the app's own back control (which
  correctly reopens Buzz via `closeChatsModal`) and the OS/browser Back
  button (which didn't know about `dmEntryOrigin` at all). **Fixed**: `onPop`
  now checks `modal === "chats" && dmEntryOrigin === "buzz"` the same way
  `closeChatsModal` does, and reopens Buzz on that path too. Re-verified
  live after the fix: Back → Buzz (once), Back again → Fanverse, no loop.
  `dmEntryOrigin` was added to the effect's dependency array so the closure
  always sees the current value.
- Repeated open/(browser-)back cycles for both popover and Buzz origins
  stayed stable across multiple round trips — no drift, no accumulating
  duplicate screens.
- Browser **Forward** is a no-op (`no forward history`) after any of these
  transitions — expected, not a bug: every `onPop` immediately re-pushes a
  fresh `{bsLevel:1}` entry, which truncates whatever would have been the
  forward entry. There is nothing for Forward to reveal in this
  reseal-immediately model.
- Opening the `chats` modal from the DM inbox (the floating dock's
  `go("chats")`) **does** push a proper history entry — that path already
  went through `go()` before this fix and was unaffected.
- After all of the above, opening DMs organically (dock button) still lands
  on the DM **list**, never auto-jumps into a conversation — confirmed no
  stale one-shot target survives across these transitions.

**Scope note — what was deliberately NOT changed:** the popover and Buzz
destination-opens still use direct `setModal`/`setTab` rather than routing
through `go()` (so they still don't push their own history entry — only the
buzz-reopen-on-Back gap was closed, not the underlying "these two entry
points bypass go()" pattern). Also unchanged: browser Back does not drill
into `DirectMessages`' *internal* list↔thread state — pressing Back while
looking at an **organically-opened** conversation (DM-inbox origin) closes
the whole `chats` modal directly, rather than first returning to the DM list
the way the in-app arrow does. This is **pre-existing behavior** (confirmed
by diffing `onPop` against the pre-branch version — untouched except for the
one dmEntryOrigin check added above) and is not specific to DMs: no modal in
this app tracks nested internal view state in browser history, only
open/closed. Fully solving that would mean giving every modal's internal
navigation its own history entries — a real architectural change well beyond
this bug-fix pass's scope, and explicitly against this round's "do not
restart or redesign the implementation" instruction. Reported here precisely
so it isn't mistaken for "fixed."

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

### 5.1 Client picker compatibility vs. backend trust — inspected, not changed

Explicitly inspected `sanitizeDmMedia` (`api_server_v16.js`) for this round:
it validates *structural shape only* — `kind` must be one of
`image`/`video`/`voice`/`scrapbook_invite`, and `path` must start with the
authenticated user's own `{userId}/{threadId}/` prefix (ownership check).
**It does not validate file content, format, or MIME type at all** — a
`kind:'video'` media object is accepted with any `mimeType` string, real or
not. Confirmed live: a plain-text file renamed to `.mp4` (empty MIME,
accepted client-side via the extension fallback) uploaded and sent
successfully — the backend stored it with `mimeType:"video/mp4"` and no
error, `width`/`height`/`durationSec` all `null` since the browser's
`<video>` element correctly couldn't decode it, but the send itself was not
blocked by anything server-side.

This is **pre-existing backend behavior, unchanged by this branch** — the
client's format allowlist (§5) is a UX filter that stops obviously-wrong
files early with a helpful message; it was never the security boundary, and
still isn't one now. The backend's only real trust boundary here is
ownership (the path-prefix check), which this branch did not touch. Adding
real server-side content validation (magic-byte sniffing, a video-decode
probe, etc.) would be a genuine backend feature addition requiring its own
design and approval — out of scope for this pass, flagged here rather than
silently left unmentioned.

---

## 6. QA matrix — reported per environment, not combined

All QA was run against a **production build** (`npm run build` +
`vite preview`), not the Vite dev server. Reason: React 18 StrictMode
(dev-only) double-invokes lazy `useState` initializers, and
`consumeNotifTarget`'s initializer has a real side effect (deleting the
stashed target from `localStorage`). Under StrictMode this consumes the
target twice and the second (kept) mount sees nothing, so a notification tap
would appear to land on the list instead of the thread — a dev-only
artifact, not a real bug (the same pre-existing pattern already exists for
`dmTarget`, `notifMeetupId`, `notifOfferId`, and `notifRequestId`;
production mounts components exactly once, so this never manifests for real
users). This was empirically confirmed both ways in round 2: the exact same
tap failed to auto-open the thread on the Vite dev server and succeeded on a
production build. Not fixed — pre-existing across 5 call sites, out of scope
for a routing/scroll/back-nav/video bug-fix pass.

All functional QA used the two persistent QA accounts (`pip_qa` / `pip_qa2`,
real Circle friends) against the real Supabase project — messages sent via a
direct authenticated call to `POST /api/messages/thread/:id/send` as
`pip_qa2`, consumed as `pip_qa` in the real browser UI. Video/image test
files were **real, playable media** generated locally (Pillow for
JPG/PNG; OpenCV/ffmpeg for WebM — see §6.3), not only synthetic `Blob`
objects.

### 6.1 Environment actually available in this pass

| Requested | What was actually used | Genuinely equivalent? |
|---|---|---|
| Desktop Chrome | Chromium 148 (Electron-embedded "Claude Browser" pane — confirmed via `navigator.userAgent`) | Same Blink/V8 engine family as real Chrome; **not** a standalone Chrome install. Reported as its own row below, not relabeled "Chrome." |
| Desktop Edge | *(not available — no standalone Edge automation tool in this environment)* | No — genuine environment limitation, not run |
| Installed PWA | *(not available — no OS-level PWA install capability in this environment)* | No — genuine environment limitation, not run |
| 375px | Same Chromium pane, `resize_window` to 375×812 | Yes |
| 390px | Same Chromium pane, `resize_window` to 390×844 | Yes |
| Pearl (light) mode | `backstage_light_mode` toggled, verified live | Yes |
| Concert (dark) mode | `backstage_light_mode` toggled, verified live | Yes |

### 6.2 Results — Chromium 148 (Electron pane), 375px, Pearl mode (baseline)

| Check | Result |
|---|---|
| Popover: tap a DM notification | Opens the exact thread in one tap, no intermediate Buzz screen |
| Popover: only the tapped notification marked read, reload persists it | Confirmed twice (rounds 1 and 2) — unrelated unread notifications stayed unread, badge decremented by exactly 1, `read:true` survived a full page reload both times |
| Buzz: "View all updates" opens Buzz | Confirmed |
| Buzz: tap a DM notification, only it marked read, reload persists it | Confirmed — same precision as popover, verified separately |
| Scroll: thread opens at newest message | Confirmed (both popover- and Buzz-origin opens) |
| Back (app arrow): popover-origin DM → Fanverse | Confirmed, single tap |
| Back (app arrow): Buzz-origin DM → Buzz | Confirmed, single tap, repeated cycles stable |
| Back (app arrow): DM-inbox-origin (organic list tap) → DM list | Confirmed — default behavior correctly unaffected |
| Browser Back: popover-origin DM → Fanverse | Confirmed (generic `onPop` fallback already handled this correctly) |
| Browser Back: Buzz-origin DM → Buzz | **Found broken, fixed, re-verified** — see §4.1 |
| Browser Back: DM-inbox-origin (organic) → closes whole modal, not list first | Confirmed as pre-existing, unchanged behavior (see §4.1 scope note) — not a regression |
| Browser Forward | No-op (`no forward history`) after any transition — expected per the reseal-on-pop model, not a bug |
| No duplicate history entries across repeated open/back cycles | Confirmed — `history.length` inspected at each step, stable |
| Image picker: valid JPG, normal MIME | Accepted, previewed, sent (200 OK), no duplicate |
| Video picker: valid WebM (real VP8/VP9, genuinely decodable), normal MIME | Accepted, previewed as a real playable `<video>`, sent (200 OK) |
| Video picker: same real WebM, **empty** `File.type` (the reported bug) | Accepted, previewed, uploaded, sent; server response showed correctly re-tagged `mimeType:"video/webm"` and real extracted metadata (`width:64,height:64,durationSec:3`) |
| Video picker: same real WebM, `application/octet-stream` | Accepted, previewed |
| Video picker: real `.mov` (mp4v codec), empty MIME | Accepted (no error), uploaded, sent; server response shows `mimeType:"video/quicktime"`. Playback: `MEDIA_ERR_SRC_NOT_SUPPORTED` in this Chromium build — expected, Chrome does not support `.mov`/mp4v-codec playback regardless of this fix; see §6.4 |
| Video picker: unsupported extension (`.zip`), empty MIME | Rejected with the truthful "Can't send that file" error (confirmed via synchronous in-page check — the toast auto-dismisses quickly, so an async check after a real round-trip can miss it; this is a test-harness timing note, not an app bug) |
| Video picker: supported extension (`.mp4`) with non-video/fake content, empty MIME | Accepted client-side (by design — the extension fallback is a format filter, not a content validator; see §5.1); preview `<video>` present but real playback fails (`videoWidth/Height:0`, matching the null dims stored server-side) |
| Video picker: oversized (25MB, over the 24MB limit) | Rejected immediately, before any network call, with the truthful "File too large" size error |
| Video picker: misleading MIME (`text/plain`/`application/json`/`image/gif` on a `.mp4`/`.webm`) | Rejected — a real, non-generic MIME always wins over the extension in either direction (unit-tested, not just live-checked) |
| Cancel (✕) | Confirmed — clears the pending attachment and preview cleanly, composer returns to idle state |
| Upload failure → truthful error → retry with no duplicate | Reproduced live via a real dev-backend rate limit (429) hit during testing: "Upload failed — check your connection and try again." shown, retry succeeded, exactly one message sent |
| Reload restores video through the signed-media flow | Confirmed — real Supabase signed storage URLs, `<video src>` pointed at `.supabase.co/storage/.../sign/...` after reload |
| No duplicate message on any send | Confirmed on every send in this pass (network log shows exactly one `/send` POST per Send tap, one per retry) |
| Existing image upload path | Unchanged and confirmed still working (JPG test case above) |
| Console errors across the whole session | None |

### 6.3 Real test media used (not only synthetic Blobs)

Generated locally with Pillow 12.2.0 and `opencv-python-headless` 5.0.0
(bundled FFmpeg backend, no system ffmpeg install available in this
environment):

| File | Real format | Chromium-decodable? |
|---|---|---|
| `test_valid.jpg` / `.png` | Genuine JPEG/PNG | Yes |
| `test_valid_VP80.webm` / `test_valid_VP90.webm` | Genuine WebM, VP8/VP9 codec | **Yes** — real `loadedmetadata`, real duration/dimensions |
| `test_valid_mp4v.mp4` | Genuine MP4 container, MPEG-4 Part 2 ("mp4v") codec | No — `MEDIA_ERR_SRC_NOT_SUPPORTED` (Chrome only decodes H.264/H.265/VP8/VP9/AV1; real H.264 encoding wasn't available — see §6.4) |
| `test_valid_mp4v.mov` | Genuine MOV container, mp4v codec | No — Chrome does not support `.mov` playback at all, independent of codec |
| `test_fake_content.mp4` | Plain text renamed `.mp4` | No (expected — not real video data) |
| `test_unsupported.zip` | Plain text renamed `.zip` | N/A — rejected before any decode attempt |
| 25MB zero-padded `.webm` | Real WebM header + padding, for the size check only | N/A — rejected before any decode attempt (by design) |

Served to the browser via a local static file server
(`http-server --cors`) and `fetch()` + `File`/`DataTransfer` construction —
real bytes, with the `File.type` explicitly overridden per test case to
reproduce the exact empty/`octet-stream`/normal-MIME conditions described in
the bug report, since this sandboxed Chromium correctly detects MIME for
standard extensions on its own (the empty-MIME condition is a genuine
real-world Windows Chrome/Edge quirk this environment doesn't reproduce
natively — it was faithfully reproduced via the `File` API instead, which
exercises the exact same code path `handleAttach` would run against a real
affected file).

### 6.4 Environment limitations (D) — not implemented/verified, and why

- **Desktop Edge**: no standalone Edge automation tool available. Not run.
  The underlying fix (MIME/extension classification in `handleAttach`) is
  pure JS with no browser-specific API usage, so there's no code-level
  reason to expect Edge-specific divergence, but this is an inference, not a
  verification.
- **Installed PWA**: no OS-level PWA install capability available. Not run.
  Round 1 already established the underlying reported defect (video works in
  PWA, not desktop web) stems from *desktop* MIME-detection unreliability;
  PWA behavior was not expected to change and wasn't re-tested here.
- **Real H.264/AVC encoding**: `opencv-python-headless`'s bundled FFmpeg
  needs Cisco's OpenH264 binary DLL for H.264, which was not obtainable in
  this environment (download attempts returned 404). The MP4 test file above
  uses the MPEG-4 Part 2 ("mp4v") codec instead — a real, structurally valid
  MP4, but not H.264, so it doesn't prove Chrome can *decode* a typical
  real-world phone-recorded MP4. The WebM (VP8/VP9) test **does** provide
  full genuine decode/playback proof for that format.
- **`.mov` real playback**: Chrome (and this Chromium build) does not
  support `.mov` container playback at all, by design, independent of this
  fix — verified as expected/environment behavior, not a defect to chase.
- **375px vs 390px pixel-level layout diffing**: the app is a single fixed
  mobile-width column with no breakpoint between those two sizes (a
  pre-existing, separately-tracked condition — see
  `docs/USER_POV_PRODUCT_AUDIT_2026-08-02.md` finding F15). Both sizes were
  exercised functionally (notification routing + video accept, confirmed
  working identically at both), not pixel-diffed.
- **Physical Android/PWA hardware back button**: no physical device in this
  environment. Browser Back/Forward via the automation tool (§4.1, §6.2) is
  the closest available proxy and was fully exercised; true hardware-back
  event semantics on a real device were not.

---

## 7. Known limitations

- `targetMessageId` end-to-end (backend → exact message scroll) is fully
  built and unit-tested client-side but dormant in production — the exact
  schema migration and three backend edits needed are specified in §2.1, not
  applied. Requires approval per this repo's backend/schema-change rule.
- Backend `sanitizeDmMedia` has no content/format validation (§5.1) —
  pre-existing, not introduced or changed by this pass. The client's format
  allowlist is a UX filter, not a security boundary; only path-prefix
  ownership is actually enforced server-side today.
- The global browser-history push/pop stack (`go()`'s `FULL_MODALS`
  mechanism) was not fully unified — popover/Buzz-opened DMs still don't
  push their own history entry (only the buzz-reopen-on-Back gap was closed,
  see §4.1).
- Browser Back does not drill into `DirectMessages`' internal list↔thread
  state for organically-opened conversations — pre-existing across every
  modal in the app, confirmed unchanged by diffing `onPop` against the
  pre-branch version (§4.1).
- React StrictMode dev-only double-invoke affects the one-shot
  `consumeNotifTarget` pattern (§6) — pre-existing across 5 call sites, not
  introduced or fixed by this pass. QA must use a production build.
- Desktop Edge, installed-PWA, and real H.264-encoded video were not
  verified in this environment (§6.4).
