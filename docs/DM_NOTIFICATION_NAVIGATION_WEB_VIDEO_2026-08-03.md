# DM Notification Routing, Scroll, Back-Nav & Web Video Fix — 2026-08-03

Branch: `claude/notification-dm-routing-web-video-010a20` (task requested
`fix/notification-dm-routing-web-video`; the worktree was already on a
dedicated task branch cut from `origin/main` at `3b67b17` with no drift, so
work continued there rather than creating a redundant second branch).

Starting `origin/main`: `3b67b17` (verified via `git fetch origin` — no drift
at any point during either pass on this branch).

This is a focused production bug-fix pass, done in three rounds.

- **Round 1**: the four originally-reported defects (popover routing, DM
  scroll, back-loop, desktop web video). Client-only, no backend changes.
- **Round 2**: closed acceptance gaps round 1's report had left unverified —
  traced the exact-message-id data path to a concrete (then-unapplied)
  schema requirement, found and fixed a real browser-Back inconsistency, and
  re-ran video QA with real playable media files instead of only synthetic
  ones. Still no SQL/backend changes.
- **Round 3 (this update)**: applied the verified, approved schema migration
  and wired exact-message targeting end-to-end (backend → frontend, fully
  functional, not dormant); added real server-authoritative content
  validation for DM media (magic-byte/container-signature checking against
  the actual downloaded bytes), closing the trust-boundary gap round 2's QA
  had found and documented but not fixed. Both changes are approved, scoped
  backend changes — `api_server_v16.js` is modified starting this round; see
  §2 and §5 for the exact diffs and rationale.

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

### 2.1 Exact target-message flow — now live end-to-end

Round 2 traced the full path and found the `notifications` table had no
column to carry a message id, and stopped there per instruction. Round 3
verified the exact schema before touching it, then applied the migration and
wired every step of the path for real.

**Schema verified live** before writing any SQL (`information_schema` /
`pg_constraint` queries against the real project, `wshqjxsbwqijodlskrbx`):
- `public.messages.id` is the actual primary key (`messages_pkey`), type
  `uuid`.
- Existing FK convention in this exact table: `notifications.actor_id →
  auth.users(id) ON DELETE SET NULL` — a soft pointer that shouldn't destroy
  the notification if the referenced row disappears. `messages.thread_id`
  and `messages.sender_user_id` both use `ON DELETE CASCADE` instead (a
  thread/user disappearing really should take their messages with them) —
  confirming `SET NULL` specifically is the established pattern for
  "optional pointer on `notifications`," not a generic default.
- `dm-media` storage bucket already enforces `file_size_limit: 25165824`
  (exactly 24MB) and a declared-MIME `allowed_mime_types` list — relevant
  context for §5, not for this column.

**Migration applied** (`supabase-notifications-target-message-migration.sql`,
committed to the repo and applied live via Supabase's migration tool):

```sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_message_id uuid
  REFERENCES public.messages(id) ON DELETE SET NULL;
```

**Why this type/FK is correct**: `uuid` matches `messages.id`'s verified
actual type exactly. `REFERENCES public.messages(id)` points at the verified
real PK. `ON DELETE SET NULL` mirrors this same table's own `actor_id`
convention — a deleted target message doesn't delete the notification, it
goes `null`, which is exactly the "fall back to newest" behavior already
required (§3) and now verified live (§6.2). Nullable, no default — every
notification that predates this column, and every non-`dm_received`
notification going forward, is unaffected. Verified post-apply via
`information_schema.columns` (`target_message_id | uuid | nullable: YES`)
and `pg_constraint` (`confdeltype: 'n'` = SET NULL).

**Backend wiring** (`api_server_v16.js`):
- `deliverNotification({..., targetMessageId = null})` — accepts the param,
  inserts `target_message_id` only when present (mirrors the existing `gif`
  pattern, so inserts keep working on any DB that hasn't run this migration).
  Also included in the FCM push `data:` payload.
- `POST /api/messages/thread/:id/send` — passes `targetMessageId: data.id`
  (the real id of the message that route just inserted) in its
  `deliverNotification(...)` call. **Never derived from `entityId`** —
  `entityId: req.params.id` (the thread id) is sent separately, unchanged.
- The scrapbook-invite DM path (`POST /api/scrapbooks/:id/invite`, a second,
  separate route that also creates a `dm_received` notification) got the
  same treatment — `targetMessageId: msg.id` — so the contract is consistent
  across both places a DM notification can originate, not just the common
  one.
- `toClientNotification()` — maps `target_message_id` → `targetMessageId`,
  independent of the existing `entityId` mapping.
- `GET /api/notifications`'s `.select(...)` now includes
  `target_message_id` — without this the column could be populated forever
  and the client would never see it; this was the actual last-mile gap.
- Service worker (`public/firebase-messaging-sw.js`) and the cold-launch
  `?notif=` URL handler in `App.jsx` also carry `targetMessageId` through
  (`&nmsg=` query param / `NOTIF_CLICK` postMessage field) — the push and
  cold-launch entry points get the same exact-message targeting as an
  in-app tap, not a lesser version of it.

**Frontend** (`resolveNotifDestination()`, `stashNotifTarget`/
`consumeNotifTarget`, the DM scroll contract in §3) required **no changes**
in round 3 — it was already correctly built and unit-tested in round 2 for
exactly this payload shape, and just started receiving real data instead of
always `null`. Confirmed live end-to-end in §6.2: a real message id sent by
`pip_qa2`, captured directly from the `/send` response, verified present as
`notifications.target_message_id` in the database with the same value, and
correctly distinct from `entity_id` (the thread id) throughout.

### 2.2 Notification destination resolver (unchanged from round 1/2)

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
`consumeNotifTarget` returns `{ targetId, targetMessageId }` instead of a
bare id — all four existing call sites (DM thread, meetup, trade offer,
friend request) destructure `.targetId`.

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

### 5.1 Media trust boundary — client picker compatibility vs. server-authoritative content validation

**The gap (found in round 2, closed in round 3):** `sanitizeDmMedia`
(`api_server_v16.js`) only ever validated *structural shape* — `kind` one of
`image`/`video`/`voice`/`scrapbook_invite`, `path` under the caller's own
`{userId}/{threadId}/` prefix (ownership). It never validated file content,
so a plain-text file renamed to `.mp4` with an empty MIME (legitimately
accepted client-side by the §5 extension fallback — that fallback is a
picker-compatibility aid, not a security boundary, and was never meant to be
one) uploaded and sent successfully. Round 2 documented this as a known
limitation; round 3 fixes it.

**Upload architecture, traced first (before writing any validation code):**
1. **Signed upload creation** — `POST /api/messages/upload-url` validates
   thread membership, mints a path `{userId}/{threadId}/{timestamp}.{ext}`,
   calls `supabase.storage.from('dm-media').createSignedUploadUrl(path)`.
2. **Direct browser upload** — the client `PUT`s the file bytes straight to
   that signed URL, to Supabase Storage directly. **This server never sees
   those bytes at this step** — this is the actual reason the gap existed;
   there was no point in the whole flow where the backend had ever read the
   file's real content.
3. **Attachment metadata submission** — `POST
   /api/messages/thread/:id/send` with `{media:{kind,mimeType,width,height,
   durationSec,path}}` — entirely client-reported, including `mimeType`.
4. **`sanitizeDmMedia`** — structural whitelist + path-ownership check
   (unchanged, still runs first, still the actual storage-ownership
   boundary).
5. **Message creation** — `messages.insert(...)` — the moment a `path`
   becomes a real, referenceable DM attachment.
6. **Signed-media retrieval** — `signDmMedia()` mints a 1-hour signed read
   URL for any `media.path` found on a fetched message.

**The fix — server-authoritative validation between steps 4 and 5,** the
earliest point where rejecting is still cheap (before the message exists)
and the latest point where the server can act on a path it already knows
about and owns a reference to:

- `detectMediaSignature(buf)` — real magic-byte / container-signature
  detection against actual bytes. JPEG (`FF D8 FF`), PNG (8-byte PNG
  signature), WebP (`RIFF`…`WEBP`), WebM (`1A 45 DF A3` EBML header), and the
  MP4/MOV/HEIC family (`ftyp` box at offset 4, brand code at offset 8-11 —
  `qt  ` → MOV, `heic`/`heix`/`heim`/`heis`/`hevc`/`hevx`/`mif1`/`msf1` →
  HEIC, any other recognized brand → the generic MP4 family). Returns `null`
  for anything else, including arbitrary binary/text — never trusts a
  claimed MIME or extension.
- `verifyDmMediaContent(path, claimedKind)` — **downloads the object this
  server itself just referenced** (`supabase.storage.from('dm-media')
  .download(path)`, service-role access — never a client-supplied buffer),
  runs `detectMediaSignature` on the real bytes, and rejects if: the
  signature is unrecognized, the detected `kind` doesn't match what the
  client claimed (an image claimed as a video, or vice versa — this is the
  extension/content-mismatch check), or the detected format isn't in the
  allowed set (`image`: jpeg/png/webp/heic: `video`: mp4/mov/webm — the
  exact required list, no more).
- Wired into `POST /api/messages/thread/:id/send`, scoped to `kind ===
  'image' || kind === 'video'` only (voice notes and scrapbook invites go
  through a different flow and were out of scope): runs **before** the
  `messages.insert(...)` call. On rejection: the storage object is deleted
  (`supabase.storage.from('dm-media').remove([media.path])`) and the request
  fails with a distinct `422 { error:'invalid_media', message:'...' }` —
  never a generic 503/400 that would be indistinguishable from a network or
  validation-shape failure. Because rejection happens before the insert, a
  rejected file is **never** referenced by a message and therefore never
  reachable through `signDmMedia()` / the signed-URL delivery path.
- On success: `media.mimeType` is **overwritten** with the server-verified
  canonical value (`sig.mimeType`, e.g. `video/webm`) — the client-reported
  mimeType is discarded entirely once content is verified, not merely
  "also checked." A passed file's stored `mimeType` is provably real from
  this point on, not merely re-labeled.

**What was deliberately left alone:**
- Size limit (24MB) — already enforced at the **storage layer** by the
  `dm-media` bucket's own `file_size_limit: 25165824` config (verified live
  via `storage.buckets`), independent of any client claim. Not touched or
  duplicated in application code.
- `sanitizeDmMedia`'s ownership check — untouched, still the actual
  storage-ownership trust boundary, still runs first.
- Voice notes / scrapbook invites — untouched, out of the stated scope
  (images and videos only).

**Frontend**: `uploadAndSendMedia` now distinguishes the `422`/`invalid_media`
case from the existing `403`/`blocked` case and a generic send failure (the
shared `api` client's `parseApiResponse` discards the JSON error body on any
non-2xx response and returns only `{error: String(status)}` — matching the
codebase's existing pattern of branching on the numeric status rather than
widening that shared client's behavior for one call site).
`sendPendingAttachment` shows a distinct, truthful message: *"That file
couldn't be verified as a supported photo or video — try a different
file."*

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

### 6.3.1 Round 3 results — exact-message targeting and server media validation

All against the same production build, real QA accounts, real Supabase
project (`wshqjxsbwqijodlskrbx`).

| Check | Result |
|---|---|
| Send a real text DM, capture its exact message id | `POST /send` response `message.id` captured directly (`7a73ab3a-f061-40f8-8b7c-76fd58b2a9c3`) |
| Notification stores the SAME message id | Confirmed via direct `SELECT` on `public.notifications`: `target_message_id` exactly matches the captured id; `entity_id` (thread id) is a different, correct value — the two never conflated |
| Tap once from the popover → exact message highlighted | Confirmed with 3 newer messages sent AFTER the target (so "highlight the target" and "scroll to newest" are distinguishable, not accidentally the same result) — polled the target `[data-msg-id]` node's `background-color` every 150-200ms: ramps in ~450ms, holds at peak (`rgba(142,104,232,0.133)` in Pearl mode / `rgba(184,162,255,…)` in Concert mode — the theme-aware accent color), fades out by ~2.1s, matching the 1.8s-highlight + 0.6s-transition contract exactly. Target node's `getBoundingClientRect()` confirmed it was genuinely scrolled into the visible viewport, not just styled off-screen |
| Repeat from Backstage Buzz | Confirmed — same highlight behavior, different (non-newest) target message, verified via the same polling method |
| Delete/simulate a missing target → newest-message fallback | Deleted the target message row directly (`DELETE FROM messages WHERE id=...`) — `ON DELETE SET NULL` fired immediately (`target_message_id` → `null`, notification row itself untouched). Client correctly received `targetMessageId: null` after a fresh fetch. Tapping the notification opened the thread with no crash/error and landed on the genuinely newest message (`getBoundingClientRect()` on the last message node confirmed visible) |
| Only the selected notification marked read | Confirmed for both popover and Buzz taps — unrelated notifications (including ones for messages sent after the target) stayed unread |
| Reload persists it | Confirmed — `read:true` and (pre-deletion) the real `targetMessageId` both survived a full reload, read straight from `localStorage`/re-fetched from `GET /api/notifications` |
| Browser Back / app back, all origins | Unchanged mechanism from round 2 (§4.1) — spot-verified still correct with the round-3 longer message list; full matrix not re-run since nothing in the back-navigation code path changed this round |
| Send + play valid image (JPG) | `POST /send` → 200, no duplicate |
| Send + play valid MP4 (mp4v codec) | `POST /send` → 200 (server verification passed — real `ftyp`/`isom` signature); playback fails in this Chromium build for the same pre-existing codec-support reason as round 2 (§6.4), unrelated to the new validation |
| Send + play valid MOV | `POST /send` → 200 (`ftyp`/`qt  ` signature verified), `mimeType` canonicalized to `video/quicktime`; playback fails in this Chromium build (§6.4), unrelated to validation |
| Send + play valid WebM | `POST /send` → 200, genuinely decodable (`readyState:4`, real `videoWidth`/duration) both immediately and after a full page reload via the real signed URL |
| **Invalid file renamed `.mp4` (the exact round-2 bypass) → server rejects it** | **`POST /send` → `422 { error:'invalid_media', message:'That file could not be verified as a supported photo or video.' }`.** Client showed the distinct truthful message. Confirmed via direct storage query that the rejected object was deleted (not present in a listing of the thread's recent uploads) — never became a message, never reachable via any signed URL |
| No false positives on real content | All three real videos (WebM/MP4/MOV) and the real JPG passed the new server check — the signature detector doesn't reject genuine files |
| 390px + Concert (dark) mode | Both the exact-message highlight (correct theme-aware accent color) and the media-rejection error re-verified at this viewport/theme combination |
| Console errors | None attributable to round-3 changes (some pre-existing `[VIP sync] gave up after all retries` noise appeared from hitting the local dev server's rate limiter during heavy testing — a test-environment artifact, not a regression; the API server was restarted to clear it, consistent with this repo's own QA notes on that limiter) |

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

### 6.5 Owner verification required — Desktop Edge and installed PWA

These two were **not run** in this environment (no standalone Edge
automation, no OS-level PWA install capability) and are not claimed as
passing by inference from the Chromium pane. Exact manual steps:

**Desktop Microsoft Edge:**
1. Open Edge, navigate to the deployed app (or `npm run dev` / `vite
   preview` locally and open that URL in Edge).
2. Sign in, open a DM thread with an unread notification pending from a
   second account.
3. Tap the notification from the popover, then from Backstage Buzz — confirm
   each opens the exact thread in one tap (not a two-step Buzz detour).
4. In the DM composer, tap the attach button and select a real `.mov` file
   from disk (a phone-recorded clip works well) — confirm the picker offers
   it, a preview renders, and Send works.
5. Rename a `.txt` file to `.mp4` and attempt to attach/send it — confirm the
   server rejects it (a "couldn't be verified" error appears, not a
   successful send).
6. Press Edge's browser Back button from a Buzz-opened DM — confirm it
   returns to Backstage Buzz, not straight to Fanverse.

**Installed PWA** (Android or desktop PWA install):
1. Install Backstage as a PWA (browser's "Install app" / "Add to Home
   Screen").
2. Repeat steps 3-5 above inside the installed PWA window.
3. Specifically re-confirm video attachment still works (round 1 established
   PWA was already working before this fix; this round's server-side
   validation should not change that, but wasn't itself re-verified inside
   an installed PWA shell).
4. If on Android, use the hardware/gesture back control (not a page element)
   from a Buzz-opened DM and from a popover-opened DM — confirm each returns
   to the correct parent screen in one motion, matching §4.1's contract.

---

## 7. Known limitations

**Resolved in round 3** (kept here, struck through in spirit, for continuity
with earlier reports that flagged them):
- ~~`targetMessageId` end-to-end is dormant~~ — **now live**: migration
  applied, backend wired, verified with real data including the delete/
  `SET NULL`/fallback path (§2.1, §6.3.1).
- ~~Backend has no content/format validation for DM media~~ — **now
  server-authoritative**: real magic-byte/container-signature verification
  against the actual downloaded bytes, rejected files deleted and never
  referenced, verified live against the exact bypass round 2 found (§5.1,
  §6.3.1).

**Still open:**
- The global browser-history push/pop stack (`go()`'s `FULL_MODALS`
  mechanism) was not fully unified — popover/Buzz-opened DMs still don't
  push their own history entry (only the buzz-reopen-on-Back gap was closed
  in round 2, see §4.1). Unchanged in round 3.
- Browser Back does not drill into `DirectMessages`' internal list↔thread
  state for organically-opened conversations — pre-existing across every
  modal in the app, confirmed unchanged by diffing `onPop` against the
  pre-branch version (§4.1). Unchanged in round 3.
- React StrictMode dev-only double-invoke affects the one-shot
  `consumeNotifTarget` pattern (§6) — pre-existing across 5 call sites, not
  introduced or fixed by this pass. QA must use a production build.
- Desktop Edge, installed-PWA, and real H.264-encoded video were not
  verified in this environment (§6.4) — require owner device verification;
  see §6.4 for exact manual steps.
- `detectMediaSignature`'s MP4-family brand detection is practical, not
  exhaustive (§5.1) — any `ftyp` box with a brand that isn't specifically
  MOV (`qt  `) or a recognized HEIC brand is treated as generic MP4. This
  correctly covers every real MP4 variant tested, but a hypothetical exotic
  ISO-BMFF-family brand not in either set would also be classified as MP4
  rather than rejected — an acceptable, documented tradeoff for "where
  practical" signature detection rather than a full brand registry.
- No image-content signature test used a genuine HEIC file (no HEIC encoder
  available in this environment) — the HEIC branch of `detectMediaSignature`
  is verified against the correct, standard `ftyp`+brand byte pattern, not
  against a real photo. JPEG/PNG/WebM all have full genuine-file coverage.
