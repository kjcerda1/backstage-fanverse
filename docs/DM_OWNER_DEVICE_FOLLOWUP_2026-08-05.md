# DM Owner-Device Follow-Up — 2026-08-05

Branch: `claude/notification-dm-routing-web-video-010a20` (resumed — the
worktree that received this task was on a different, empty sibling branch
`claude/notification-dm-routing-web-video-010a20-f5bf7e`; switched onto the
real branch, confirmed `HEAD` `d682b8a` in sync with
`origin/claude/notification-dm-routing-web-video-010a20`, 5 commits ahead of
`origin/main` @ `3b67b17`, before any editing).

This is round 4 on this branch: a focused fix pass against **real
owner-device QA** (installed iPhone PWA) that found 5 new/confirmed defects
after rounds 1–3's browser-only QA had passed. See
`docs/DM_NOTIFICATION_NAVIGATION_WEB_VIDEO_2026-08-03.md` for rounds 1–3's
root causes and contracts — this document only covers what changed in round 4.

**Migration check (per instruction — do not reapply without proof):**
queried the live Supabase project (`wshqjxsbwqijodlskrbx`) directly —
`public.notifications.target_message_id` already exists (`uuid`, nullable,
FK `notifications_target_message_id_fkey → messages`, `ON DELETE SET NULL`
confirmed via `pg_constraint.confdeltype = 'n'`). No SQL run this round.

---

## Owner-device QA results (as reported)

**Passed:** photos send and remain in DMs; videos send and remain in DMs;
previously-sent media remains visible on return to a conversation.

**Failed / newly confirmed:**
1. Push/notification tap didn't open the exact DM — opened the app generally.
2. DM inbox conversations weren't ordered by latest activity.
3. Voice recording starts, but sending fails ("Upload failed — check your
   connection and try again.") after ~4 seconds.
4. No live waveform/volume visualization during recording.
5. Composer/recording controls sit too close to the iPhone/PWA bottom edge.

---

## 1. Notification startup / deep-link contract

### 1.1 Root cause — the actual reason push opened the general app, not the DM

Traced the full push pipeline end to end. The routing *logic* (resolver,
one-shot stash/consume, SW `notificationclick` deep-link, cold-launch
`?notif=` handler) was already correct — verified again this round, unchanged.
The bug was one level below that: **`deliverNotification()` and
`/api/send-notification` in `api_server_v16.js` sent an FCM payload with a
top-level `notification: { title, body }` block on every push.**

That single field changes Firebase's client-SDK behavior on the receiving
device: a payload carrying a `notification` block is auto-displayed by the
Firebase Web SDK itself, and — critically — the SDK also registers its **own**
`notificationclick` handling in that case, driven by `webpush.fcmOptions.link`
(which was just `process.env.FRONTEND_URL || '/'`, the bare app root). That
default handler runs *alongside* this app's own `notificationclick` listener
in `firebase-messaging-sw.js` — both are listeners on the same event — and can
navigate to the bare root URL, discarding the `?notif=`/`nid`/`ntype`/`nmsg`
deep-link params this app's own handler was about to use. This exactly matches
the reported symptom: tap → app opens generally → user has to find the
notification again via the bell.

**Fix:** every FCM push this backend sends is now **data-only** — no
top-level `notification` key. `title`/`body` moved into `data`. This was
already the design the service worker's own code expected (`if
(payload.notification) return;` in `onBackgroundMessage`, with a comment
explaining "only data-only payloads need us to render") — the payload just
never actually satisfied that condition before. With no `notification` block,
Firebase never auto-displays and never auto-registers a competing click
handler; this app's own `onBackgroundMessage` (background) and `onMessage`
(foreground) are the sole renderers, and its own `notificationclick` listener
is the sole click handler, every time.

Changed in `api_server_v16.js`: `deliverNotification()`'s push branch and
`POST /api/send-notification`.

### 1.2 Foreground push was silently dropping targetMessageId

While tracing the above, found `attachForegroundMessageHandler`'s `onMessage`
handler (`src/App.jsx`) destructured `{ targetModal, targetTab, targetId,
entityType }` from `payload.data` — **`targetMessageId` was missing** — and
read `title`/`body` only from `payload.notification`, which is now correctly
absent on every real (data-only) push. Fixed: reads `title`/`body` from
`payload.data` first (falling back to `.notification` only for a
theoretical legacy/cached sender), and forwards `targetMessageId` through to
the notification it shows. Without this fix, a push received while the app
was in the foreground would have shown a notification titled "Backstage" with
no body, and tapping it would have fallen back to newest-message instead of
the exact target — a real, separate bug from 1.1, on the same code path.

### 1.3 StrictMode-safe one-shot target consumption

Round 2/3 had already documented (not fixed) that the one-shot
`consumeNotifTarget(entityType)` pattern — read-and-delete the stashed
localStorage target inside a `useState` initializer — is unsafe under React
18 StrictMode's dev-only double-invoke: the initializer runs twice, the first
call deletes the real target and returns it (discarded), the second call
finds nothing and returns `null` (kept as state). Production builds only
mount once, so this never manifested for real users — but the task explicitly
asked for it not to be left possible.

**Fixed** by splitting the function in two:
- `peekNotifTarget(entityType)` — pure read, no side effect, safe to call any
  number of times with the same result.
- `clearNotifTarget()` — the actual one-shot deletion, called once from a
  mount-only `useEffect(() => {...}, [])` *after* the peeked value has already
  been captured into state. A StrictMode double-fired effect just calls
  `ls.del` twice — a no-op the second time, not a data-loss risk.

All 4 real call sites (DM thread, meetup, trade offer, friend request)
migrated, plus `DirectMessages`' own `dmTarget` (Message-button entry point,
same pattern, same fix). `consumeNotifTarget` no longer exists anywhere in
`src/App.jsx`.

### 1.4 What was already correct (re-verified, unchanged)

- `resolveNotifDestination()` (shared resolver) — unchanged.
- `NotificationBell` popover → `handleNotifItemTap` → `stashNotifTarget` +
  `onNavigate(dest)` → `setDmEntryOrigin("popover")` + `setModal("chats")` —
  direct, no Buzz detour. Unchanged.
- `NotificationCenter` (Backstage Buzz) → `handleNotifTap` → same resolver,
  same stash, `onNavigate` → `setDmEntryOrigin("buzz")` + direct modal open.
  "View all updates" is the only path that opens Buzz itself. Unchanged.
- Service-worker `notificationclick` → `postMessage`/`clients.openWindow`
  with the full `?notif=&nid=&ntype=&nmsg=` params. Unchanged (the payload
  fix in 1.1 is what makes this actually win the race now).
- Cold-launch `?notif=` URL handler and the SW `postMessage` listener in
  `AppInner` both call `stashNotifTarget` then `go(dest)` directly — `go()`
  opens `"chats"` (or any `FULL_MODALS` entry) as a real modal immediately,
  never through Buzz. Unchanged.
- Back-navigation contract (`entryOrigin`/`dmEntryOrigin`, in-app arrow +
  browser Back agreement) from round 2 — unchanged, not touched this round.

### 1.5 Entry-path trace summary

| Path | Opens exact DM directly? | Target-message highlight? |
|---|---|---|
| Foreground bell popover | Yes (unchanged) | Yes (unchanged) |
| Backstage Buzz item tap | Yes (unchanged) | Yes (unchanged) |
| Service-worker `notificationclick` | Yes — **now**, once the payload fix (1.1) stops Firebase's competing handler | Yes (unchanged mechanism) |
| Cold PWA launch (`?notif=`) | Yes (unchanged) | Yes (unchanged) |
| Already-open PWA, backgrounded push | Yes — **now** (1.1) | Yes — **now** (1.2 fixes the drop) |
| App restored from background | Same as "already-open" above | Same |
| `postMessage` from SW | Yes (unchanged) | Yes (unchanged) |
| Local/session target persistence | Yes — **now** hardened (1.3) | n/a |
| Browser/app/hardware Back | Unchanged from round 2 — not touched this round | n/a |

---

## 2. DM thread-sorting contract

### 2.1 Root cause

`convos` (the DM inbox array) was **never sorted** — rendered in whatever
order the backend's `GET /api/messages/threads` happened to return (thread
row order, not activity order), and the only per-thread "latest time" value
that existed (`lastTime`) was already a **formatted display string**
(`"12:10 PM"`/`"Yesterday"`-style via `toLocaleTimeString`), never a raw
timestamp — there was nothing to sort by even if sorting had been attempted.

### 2.2 Fix

- `normalizeDmThread()` now also derives **`lastMessageAt`** — a real ISO
  timestamp, never a formatted string. Source: `thread.last_message.created_at`
  when present (the common case, from `GET /api/messages/threads`), or the
  last entry of the real message list otherwise (messages always arrive
  pre-sorted ascending by `created_at` from the backend — verified: both
  `GET /api/messages/threads` and `GET /api/messages/thread/:id` order
  `ascending: true`), or `null` for a genuinely message-less thread.
- `sortConvosByActivity(list)` — sorts descending by `lastMessageAt`
  (`-Infinity` for `null`, so an empty thread sorts last, not first or
  random), tie-breaking on a deterministic `id` comparison when timestamps
  are equal (never on insertion/source order).
- Applied at the point of **render**, not just at write time —
  `inboxConvos`/`requestConvos` are now `sortConvosByActivity(...)` — so the
  displayed order is correct regardless of which of the many `setConvos`
  call sites (send, receive, accept, delete, react) touched the array.
- All 4 real send paths (text/GIF, photo/video, voice note, scrapbook invite)
  now set a real `lastMessageAt` (the server's `created_at` when the send
  round-trips successfully, else `new Date().toISOString()`) alongside the
  existing `lastTime` display string — sending genuinely moves a conversation
  to the top now, not just visually via `"now"`.
- **New:** the DM thread list is now refreshed periodically (`refreshThreadList`,
  every 15s while `DirectMessages` is mounted and `tokenReady`), matching the
  poll-based DM architecture `CURRENT_STATE.md` already documents. Previously
  the thread list was fetched exactly once on mount and never again — an
  incoming message from another user could never reorder the inbox without
  closing and reopening the whole DM modal. The poll does a full merge (fresh
  server threads + any purely-local not-yet-round-tripped convo), then
  re-sorts — never silently drops a local-only thread.

### 2.3 In-thread (within-conversation) ordering

Verified, not changed: messages within a conversation are guaranteed
chronological **by construction**, not by any client-side sort — both
`GET /api/messages/threads` and `GET /api/messages/thread/:id` fetch messages
`order('created_at', { ascending: true })` server-side, and every optimistic
local append pushes onto the end of the array (`[...c.messages, msg]`), never
inserts. There is no code path that reorders messages by a formatted string,
so an invalid/missing timestamp cannot reorder anything — it simply can't
participate in a sort that doesn't exist. No client-side re-sort was added
here; adding one would be a real behavior change with no defect to justify it.

---

## 3. Voice-note media contract

### 3.1 Root cause — the actual reason sending failed after ~4 seconds

Traced the full path: `MediaRecorder` → chunks → `Blob` → preview →
`POST /api/messages/upload-url` (mints a signed Supabase Storage URL) →
`PUT` to that URL with `Content-Type: file.type` → `POST
/api/messages/thread/:id/send` → `messages.insert`.

Checked the live `dm-media` storage bucket config directly (Supabase MCP,
`storage.buckets` for `dm-media`): `allowed_mime_types` already includes
`audio/webm`, `audio/mp4`, `audio/m4a`, `audio/mpeg`, `audio/ogg`, `audio/wav`
— voice notes were never missing from the bucket allowlist. The mismatch was
narrower: **`recorder.mimeType` on some browsers (notably iOS Safari/PWA)
reports a codecs-qualified string, e.g. `"audio/mp4;codecs=mp4a.40.2"`, not
the bare `"audio/mp4"`.** That full string was used, unmodified, as the
uploaded `File`'s `type` — which becomes the `PUT`'s `Content-Type` header.
Supabase Storage's bucket-level `allowed_mime_types` check matches the
upload's Content-Type against a fixed list of exact strings; a
codecs-qualified Content-Type does not match the bare entry in that list, so
the storage `PUT` itself was rejected — surfacing through
`uploadAndSendMedia` as `Error('upload-failed')`, shown verbatim as "Upload
failed — check your connection and try again." — exactly the reported error,
at exactly the reported stage (after the ~4s of real recording, at send time).

**Fix:** `finishVoiceRecording` now normalizes the MIME type once, at the
source — `(recorder.mimeType || 'audio/webm').split(';')[0].trim()` — before
it's used for the `Blob`, the preview `<audio>`, the upload `File`'s
`type`/Content-Type header, and `media.mimeType` sent to the backend. Every
downstream consumer inherits the bare value. This does not relabel bytes as
another format — it only strips a codec *parameter* from an otherwise-correct
MIME type string; the underlying audio bytes and their real container/codec
are untouched.

### 3.2 Format detection and support

`VOICE_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4',
'audio/ogg']` (unchanged) — `MediaRecorder.isTypeSupported()` picks the
browser's real, actually-supported format; Chromium picks WebM/Opus, Safari
picks MP4/AAC. Nothing is relabeled — the recorder's genuine output format is
preserved, just with its MIME string normalized as above. Backend
`sanitizeDmMedia` for `kind:'voice'` does structural validation only (path
ownership, 60-char mimeType cap) — unchanged, and correctly does not attempt
byte-level content validation for voice (that's scoped to image/video only,
per round 3 — voice notes go through a different, already-narrower trust
surface: a private per-user/per-thread storage path plus the bucket's own
size/MIME enforcement, not a public asset).

### 3.3 Distinct, truthful errors

Previously `sendVoiceNote`'s catch block collapsed every failure except the
Circle-block case into the same generic "Upload failed" text, even though
`uploadAndSendMedia` already threw a distinct `Error` per stage. Now:

| Failure | Message |
|---|---|
| Microphone permission denied | "Microphone access was denied — allow it in your browser settings to send voice notes." |
| `MediaRecorder` unavailable/browser unsupported | "Voice recording isn't supported in this browser." |
| Mic granted but recording couldn't start (rare — e.g. a `MediaRecorder` construction failure) | "Recording isn't available on this device right now." (mic is released — see 3.4) |
| Empty recording (0-byte blob) | "That recording was empty — try again." (no message ever inserted) |
| Signed-upload-URL request failed | "Couldn't prepare the upload — check your connection and try again." |
| Storage `PUT` failed | "Upload failed — check your connection and try again." |
| Server rejected the content (`422 invalid_media` — image/video path only, included for completeness) | "That recording couldn't be verified — try recording again." |
| Circle block | "You can't message this fan right now." |
| Any other send failure | "Couldn't send the voice note — check your connection and try again." |

No empty voice message is ever inserted (`finishVoiceRecording`'s
`!blob.size` guard, unchanged). No duplicate on retry: a failed send leaves
`voicePreview` intact and `voiceMode` at `'preview'`, not `'idle'` — the user
retries the *same* recording, which re-runs the same upload+send path fresh;
nothing partial was ever persisted server-side on a failed attempt (rejection
happens before `messages.insert`).

**Known, pre-existing, out-of-scope limitation** (shared with photo/video
sends, not introduced or fixed here): if a send genuinely succeeds
server-side but the success response never reaches the client (e.g. the
network drops after the insert but before the response), a retry would
create a second message. No idempotency-key mechanism exists anywhere in the
DM send path today. Not attempted this round — a real architectural addition
well beyond a bug-fix pass.

---

## 4. Waveform lifecycle

No live waveform existed before this round — the recording bar showed a
pulsing dot and an elapsed timer only.

- `startVoiceAnalyser(stream)` — best-effort, wrapped in `try/catch`. Creates
  a real `AudioContext` + `AnalyserNode` (`fftSize: 64`) fed by the same
  `MediaStream` the `MediaRecorder` is recording from, downsamples
  `getByteFrequencyData` into 20 bars every animation frame via
  `requestAnimationFrame`, and calls `setVoiceLevelsLive(true)` **only** once
  the analyser is genuinely attached. If `AudioContext`/`AnalyserNode` isn't
  available, or construction throws for any reason, recording is completely
  unaffected — the UI falls back to a graceful animated idle pattern (reusing
  the app's existing `eqBar` keyframe, the same one already used for the
  Now-Playing equalizer elsewhere) and `voiceLevelsLive` stays `false`, so the
  fallback is never presented as reacting to real audio.
- Started only *after* `recorder.start()` succeeds — never before, never on a
  failed `MediaRecorder` construction.
- `stopVoiceAnalyser()` — cancels the animation frame, nulls the analyser
  ref, and `close()`s the `AudioContext` (a left-open context keeps the
  `MediaStreamSource` — and therefore the mic — referenced even after the
  `MediaRecorder`'s own tracks are stopped). Called from every exit path:
  `cancelVoiceRecording`, `finishVoiceRecording`, the recorder's own
  `onerror` handler, and the component's unmount cleanup effect.
- Draft text (`msgDraft`) is untouched by any voice-recording function —
  confirmed by inspection and a regression test — so text typed before
  starting a recording is exactly as the user left it once recording ends.

---

## 5. iPhone safe-area contract

All three composer states — the normal composer, the recording bar, and the
voice-preview bar — previously used a flat `padding:"10px 14px 14px"`, with
no `env(safe-area-inset-bottom)` at all, unlike every other bottom sheet in
this file (the attachment sheet and scrapbook picker already used
`calc(...+env(safe-area-inset-bottom))`). This is the confirmed root cause of
controls sitting too close to the iPhone home indicator in the installed PWA.

**Fixed:** all three now use
`padding:"10px 14px calc(14px + env(safe-area-inset-bottom))"`. `env(...)`
resolves to `0` on any device without a safe-area inset (older iPhones,
Android, desktop), so this adds no extra space anywhere it isn't needed —
verified by keeping the existing `14px` base untouched, only adding the env()
term on top.

Primary action buttons across all three states (cancel/finish/discard/send
in the recording and preview bars; attach/GIF/mic/send in the normal
composer) were `40×40` — bumped to **`44×44`**, the practical minimum
comfortable tap target, with matching `aria-label`s added. The secondary
inline play/pause toggle inside the voice-preview bubble (`26×26`, nested
inside a larger row, not a primary standalone control) was left as-is —
out of the reported scope and not named in the acceptance criteria.

The thread's own scroll container (`threadListRef`) and the composer are
already `flex:1`/`flexShrink:0` siblings in a column flex layout, not an
absolutely-positioned overlay — the newest message was not, and is not,
hidden behind the composer; this is pre-existing, unaffected by this round's
changes, and was spot-checked to still hold.

---

## Automated QA

All run this round, in this repo, this environment:

```
npm run build                                    # ✅ clean (448 modules)
node --check api_server_v16.js                   # ✅
node tests/binder-card-ownership.test.js         # ✅ 19 passed
node tests/my-world-qa-correction.test.js        # ✅ 7 passed
node tests/smart-matching.test.js                # ✅ 39 passed
node tests/notification-dm-navigation.test.js    # ✅ 50 passed (1 test updated for the peek/clear refactor; +8 new)
node tests/dm-media-content-validation.test.js   # ✅ 20 passed
node tests/dm-owner-device-followup.test.js      # ✅ 31 passed (new — this round)
```

166 tests total, 0 failures. The new/updated tests cover: the data-only FCM
payload (both push call sites), the foreground-handler targetMessageId fix,
the peek/clear StrictMode-safety split (all 4 call sites + `dmTarget`),
`sortConvosByActivity` (3-thread ordering, empty-thread placement,
deterministic tie-break, garbage-timestamp safety), `lastMessageAt`
propagation on every send path, the new poll + its local-convo preservation,
in-thread ascending-order structure, the voice MIME-normalization fix,
distinct voice error messages, mic-release-on-MediaRecorder-failure, the
waveform analyser lifecycle (start-after-record, cleanup on all 4 exit
paths), draft-text preservation, and the safe-area/tap-target regression
guards.

### Environment limitations (D) — genuinely not run here

- **No physical iPhone / installed PWA available in this environment.** Every
  fix in this document is reasoned from a live-verified root cause (the exact
  FCM payload shape checked against Firebase's documented client behavior;
  the exact storage bucket config queried live; the exact codecs-suffix
  MIME issue is a well-documented `MediaRecorder` behavior difference on iOS
  Safari) and covered by structural/logic tests, but **none of the 5 fixes
  were re-verified on the owner's actual device** in this pass — this
  environment has no OS-level PWA install, no physical iPhone, and no
  microphone hardware to record a real human voice sample through.
- Basic smoke test only: local dev server (`backstage-v16` + `-api`) boots
  cleanly, welcome screen renders, zero console errors. No authenticated
  live DM/notification/voice-note round trip was run in this pass — doing so
  needs a signed-in QA session and this conversation has no stored
  credentials for one (unlike rounds 1–3, which had direct API access to the
  `pip_qa`/`pip_qa2` accounts in that session).

---

## Owner verification still required

Per the task's own acceptance criteria — do not treat any of the following as
"safe to merge" until confirmed on the real device:

- [ ] Installed-PWA push notification tap opens the exact DM directly (not
      the general app) — this is the core fix in §1.1.
- [ ] Voice note: record → send → sender can play it → recipient can play it
      → reload preserves playback (§3).
- [ ] Live waveform visibly reacts to actual voice volume while recording,
      not just a static/fake animation (§4).
- [ ] DM inbox shows newest-activity-first ordering; sending a message (any
      type) and receiving one from another account both move that
      conversation to the top within ~15s (the poll interval) or on reopen
      (§2).
- [ ] Composer, recording bar, and voice-preview bar all sit comfortably
      above the home indicator on an installed iPhone PWA, in both Pearl and
      Concert mode (§5).
- [ ] Repeat the existing round-1–3 Desktop Edge / installed-PWA manual
      checklist in `docs/DM_NOTIFICATION_NAVIGATION_WEB_VIDEO_2026-08-03.md`
      §6.5 — still not run in any automated environment, now doubly relevant
      since this round's core fix (§1.1) specifically targets device/PWA
      push behavior that a browser-only pass cannot exercise.
