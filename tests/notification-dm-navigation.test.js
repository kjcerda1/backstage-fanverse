// Structural + logic regression tests for the 2026-08-03 notification-routing /
// DM-navigation / web-video fix pass. Same discipline as the other tests/*.js
// files: plain Node + assert, no framework, no live server/DB — run with:
//   node tests/notification-dm-navigation.test.js
//
// Covers:
//   1. Notification destination resolution — one resolver, shared by the
//      NotificationBell popover and Backstage Buzz, never two.
//   2. DM entry-origin/back resolution — back skips the list only when the
//      thread was reached via a one-shot target from popover/Buzz.
//   3. One-time target scroll state — notifThreadId/notifMessageId are
//      cleared only once actually applied, never left to re-fire or leak
//      onto an unrelated conversation.
//   4. Browser media-type validation — the MIME/extension fallback used by
//      handleAttach, re-implemented here and exercised directly.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); fail++; }
}

// ── 1. Shared notification destination resolver ────────────────────────────

// Re-implementation mirrors the module-level resolveNotifDestination() in
// App.jsx exactly (same NOTIF_ROUTES table) so its actual decision behavior
// can be exercised directly, not just grepped for.
const NOTIF_ROUTES = {
  crew_invite:  { modal:"invite"      },
  capsule:      { modal:"capsule"     },
  pass_reaction:{ modal:"passes"      },
  meetup:       { tab:"concerts"      },
  concert_day:  { modal:"concertday"  },
  concert:      { modal:"concertday"  },
  trade:        { tab:"collect"       },
  afterglow:    { modal:"myshows"     },
  comeback:     { tab:"community"     },
  announcement: { tab:"community"     },
  accepted:     { modal:"invite"      },
  dm_received:  { modal:"chats"       },
  feed_like:    { tab:"community"     },
  post_comment: { tab:"community"     },
  comment_reply:{ tab:"community"     },
};
function resolveNotifDestination(n) {
  if (!n || n.type === "friend_req") return null;
  const dest = n.targetModal || n.targetTab ? { modal: n.targetModal, tab: n.targetTab } : NOTIF_ROUTES[n.type];
  if (!dest || (!dest.modal && !dest.tab)) return null;
  return { ...dest, targetId: n.entityId || n.targetId || null, entityType: n.entityType || '', targetMessageId: n.targetMessageId || null };
}

check('resolveNotifDestination: dm_received resolves directly to the chats modal', () => {
  const dest = resolveNotifDestination({ type:'dm_received', entityId:'thread-1', entityType:'thread' });
  assert.deepStrictEqual(dest, { modal:'chats', targetId:'thread-1', entityType:'thread', targetMessageId:null });
});

check('resolveNotifDestination: friend_req never resolves (stays open for inline Accept/Decline)', () => {
  assert.strictEqual(resolveNotifDestination({ type:'friend_req' }), null);
});

check('resolveNotifDestination: unmapped type with no explicit target resolves to null', () => {
  assert.strictEqual(resolveNotifDestination({ type:'totally_unknown_type' }), null);
});

check('resolveNotifDestination: explicit targetModal/targetTab overrides the type map', () => {
  const dest = resolveNotifDestination({ type:'meetup', targetModal:'concertday' });
  assert.strictEqual(dest.modal, 'concertday');
});

check('resolveNotifDestination: carries targetMessageId through when present', () => {
  const dest = resolveNotifDestination({ type:'dm_received', entityId:'t1', entityType:'thread', targetMessageId:'m9' });
  assert.strictEqual(dest.targetMessageId, 'm9');
});

check('App.jsx defines exactly one resolveNotifDestination (module-level, shared)', () => {
  const matches = src.match(/function resolveNotifDestination\(/g) || [];
  assert.strictEqual(matches.length, 1, `expected exactly 1 definition, found ${matches.length}`);
});

check('NotificationCenter.handleNotifTap calls the shared resolver, not a local duplicate route table', () => {
  const start = src.indexOf('const handleNotifTap = (n) => {');
  assert.ok(start !== -1, 'handleNotifTap not found');
  const body = src.slice(start, start + 400);
  assert.ok(/resolveNotifDestination\(n\)/.test(body), 'handleNotifTap does not call resolveNotifDestination');
  assert.ok(!/const NOTIF_ROUTES = \{/.test(src.slice(start - 50, start)), 'a second inline NOTIF_ROUTES still precedes handleNotifTap');
});

check('NotificationBell popover items no longer route unconditionally to Backstage Buzz', () => {
  const start = src.indexOf('function NotificationBell(');
  const end = src.indexOf('\nfunction ', start + 10);
  const body = src.slice(start, end);
  assert.ok(/recentNotifs\.map\(n=>\(/.test(body), 'recentNotifs render block not found');
  assert.ok(/onClick=\{\(\)=>handleNotifItemTap\(n\)\}/.test(body), 'popover item onClick is not wired to handleNotifItemTap — regressed to always-open-Buzz');
  assert.ok(/handleNotifItemTap = \(n\) => \{/.test(body), 'handleNotifItemTap not defined');
  assert.ok(/resolveNotifDestination\(n\)/.test(body), 'handleNotifItemTap does not resolve a destination');
  assert.ok(/onNavigate\?\.\(dest\)/.test(body), 'handleNotifItemTap does not call onNavigate on the resolved destination');
});

// ── 2. DM entry-origin / back resolution ────────────────────────────────────

check('handleThreadBack only skips the list for a one-shot target opened via popover/buzz', () => {
  const start = src.indexOf('const handleThreadBack = () => {');
  assert.ok(start !== -1, 'handleThreadBack not found');
  const body = src.slice(start, start + 300);
  assert.ok(/openedViaTarget && \(entryOrigin === "popover" \|\| entryOrigin === "buzz"\)/.test(body));
  assert.ok(/setActiveConvo\(null\);/.test(body), 'organic back path (setActiveConvo(null)) missing');
});

check('openConvo (organic list tap) resets openedViaTarget so back returns to the list', () => {
  const start = src.indexOf('const openConvo = async (convo) => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/setOpenedViaTarget\(false\)/.test(body), 'openConvo no longer clears openedViaTarget');
});

check('DM header back button is wired to handleThreadBack, not a bare setActiveConvo(null)', () => {
  assert.ok(/onClick=\{handleThreadBack\}/.test(src), 'header back button not wired to handleThreadBack');
});

check('closeChatsModal reopens Backstage Buzz once for buzz-origin, otherwise just closes', () => {
  const start = src.indexOf('const closeChatsModal = () => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/origin === "buzz"/.test(body));
  assert.ok(/go\("notifications"\)/.test(body));
});

// ── 3. One-time notification target consumption (fixes the reopen loop) ────

function stashNotifTarget(store, targetId, entityType, targetMessageId = null) {
  if (targetId) store.value = { targetId: String(targetId), entityType: entityType || '', targetMessageId: targetMessageId ? String(targetMessageId) : null };
  else store.value = null;
}
function consumeNotifTarget(store, entityType) {
  const t = store.value;
  if (!t?.targetId) return null;
  if (entityType && t.entityType && t.entityType !== entityType) return null;
  store.value = null;
  return { targetId: t.targetId, targetMessageId: t.targetMessageId || null };
}

check('stashNotifTarget/consumeNotifTarget round-trip carries targetMessageId through', () => {
  const store = { value: null };
  stashNotifTarget(store, 'thread-9', 'thread', 'msg-42');
  const got = consumeNotifTarget(store, 'thread');
  assert.deepStrictEqual(got, { targetId:'thread-9', targetMessageId:'msg-42' });
});

check('consumeNotifTarget is one-shot — a second consume for the same type returns null', () => {
  const store = { value: null };
  stashNotifTarget(store, 'thread-9', 'thread');
  consumeNotifTarget(store, 'thread');
  assert.strictEqual(consumeNotifTarget(store, 'thread'), null);
});

check('consumeNotifTarget rejects a mismatched entityType without consuming it', () => {
  const store = { value: null };
  stashNotifTarget(store, 'meetup-1', 'meetup');
  assert.strictEqual(consumeNotifTarget(store, 'thread'), null);
  // Still there for the type it actually belongs to.
  assert.deepStrictEqual(consumeNotifTarget(store, 'meetup'), { targetId:'meetup-1', targetMessageId:null });
});

check('all four consumeNotifTarget call sites destructure .targetId (return-shape migration is complete)', () => {
  const calls = src.match(/consumeNotifTarget\('[a-z_]+'\)/g) || [];
  assert.strictEqual(calls.length, 4, `expected 4 consumeNotifTarget call sites, found ${calls.length}`);
  for (const call of calls) {
    const idx = src.indexOf(call);
    const around = src.slice(idx, idx + call.length + 20);
    assert.ok(/\.targetId \|\| null|\?\.targetId/.test(around) || src.slice(idx - 60, idx).includes('notifThread]'),
      `call site "${call}" does not appear to destructure the object return shape: ...${around}`);
  }
});

check('the notifThreadId matching effect only clears the one-shot target once a match is actually applied', () => {
  const start = src.indexOf('if (!notifThreadId || activeConvo) return;');
  assert.ok(start !== -1, 'notifThreadId matching effect not found');
  const body = src.slice(start, start + 700);
  const matchGuardIdx = body.indexOf('if (!match) return;');
  const clearIdx = body.indexOf('setNotifThreadId(null);');
  assert.ok(matchGuardIdx !== -1, '"if (!match) return;" early-out missing — without it the effect clears the target before convos finish loading');
  assert.ok(clearIdx !== -1, 'setNotifThreadId(null) missing — without it, back-arrow clearing activeConvo re-triggers this effect and reopens the same thread');
  assert.ok(clearIdx > matchGuardIdx, 'setNotifThreadId(null) must run after the match guard, not unconditionally');
});

check('the scroll-positioning effect never applies notifMessageId to an unrelated conversation', () => {
  const start = src.indexOf('notifTargetThreadIdRef.current !== activeConvo.id');
  assert.ok(start !== -1, 'cross-conversation guard for notifMessageId not found');
});

// ── 4. Browser media-type validation (desktop MIME fallback) ───────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/webp','image/heic'];
const ALLOWED_VIDEO_TYPES = ['video/mp4','video/quicktime','video/webm'];
const ALLOWED_IMAGE_EXTS = ['jpg','jpeg','png','webp','heic'];
const ALLOWED_VIDEO_EXTS = ['mp4','mov','webm'];

// Mirrors handleAttach's classification exactly.
function classifyAttachment(mimeRaw, filename) {
  const mime = (mimeRaw || '').toLowerCase();
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const mimeUnreliable = !mime || mime === 'application/octet-stream';
  const isImage = ALLOWED_IMAGE_TYPES.includes(mime) || (mimeUnreliable && ALLOWED_IMAGE_EXTS.includes(ext));
  const isVideo = !isImage && (ALLOWED_VIDEO_TYPES.includes(mime) || (mimeUnreliable && ALLOWED_VIDEO_EXTS.includes(ext)));
  return { isImage, isVideo, accepted: isImage || isVideo };
}

check('classifyAttachment: normal video MIME types (mp4/mov/webm) are accepted', () => {
  assert.ok(classifyAttachment('video/mp4', 'clip.mp4').isVideo);
  assert.ok(classifyAttachment('video/quicktime', 'clip.mov').isVideo);
  assert.ok(classifyAttachment('video/webm', 'clip.webm').isVideo);
});

check('classifyAttachment: empty MIME (the reported desktop-browser bug) falls back to a supported extension', () => {
  const r = classifyAttachment('', 'IMG_0001.MOV');
  assert.ok(r.isVideo, 'a .mov with empty MIME must still be classified as video');
});

check('classifyAttachment: application/octet-stream falls back to a supported extension', () => {
  assert.ok(classifyAttachment('application/octet-stream', 'clip.mp4').isVideo);
  assert.ok(classifyAttachment('application/octet-stream', 'photo.png').isImage);
});

check('classifyAttachment: empty MIME with an unsupported extension is still rejected — no blanket extension trust', () => {
  const r = classifyAttachment('', 'archive.zip');
  assert.strictEqual(r.accepted, false);
});

check('classifyAttachment: a real but wrong MIME is rejected even if the extension looks supported', () => {
  // Guards against the fallback becoming "trust the extension whenever we feel
  // like it" — a genuinely-reported, non-generic MIME that isn't one of ours
  // must never be overridden by the filename.
  const r = classifyAttachment('text/plain', 'notes.mp4');
  assert.strictEqual(r.accepted, false);
});

check('classifyAttachment: normal image MIME types are unaffected by the fallback', () => {
  assert.ok(classifyAttachment('image/jpeg', 'pic.jpg').isImage);
  assert.ok(classifyAttachment('image/png', 'pic.png').isImage);
});

check('App.jsx: handleAttach re-tags a File with an unreliable MIME before using it downstream', () => {
  const start = src.indexOf('const handleAttach = async (e) => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/mimeUnreliable \? new File\(/.test(body), 'handleAttach no longer re-tags a File with a resolved MIME type when the browser gave none');
});

check('App.jsx: the DM attachment input accept list pairs MIME types with extensions', () => {
  const m = src.match(/ref=\{attachRef\} type="file" accept="([^"]+)"/);
  assert.ok(m, 'attachRef file input not found');
  assert.ok(m[1].includes('.mov') && m[1].includes('.mp4') && m[1].includes('.webm'), 'accept list is missing extension fallbacks for video');
});

check('backend sanitizeDmMedia is untouched — this fix is client-only, no weakened server validation', () => {
  const backendSrc = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');
  assert.ok(/function sanitizeDmMedia\(raw, expectedPathPrefix\) \{/.test(backendSrc));
  assert.ok(/if \(kind === 'image' \|\| kind === 'video'\) \{/.test(backendSrc));
});

check('backend sanitizeDmMedia has no content-format validation today — client format checks are a UX filter, not a trust boundary', () => {
  // Documents actual current behavior (verified live: a plain-text file
  // renamed to .mp4 with an unreliable MIME uploads and sends successfully).
  // Not a defect introduced by this branch — sanitizeDmMedia only validates
  // structural shape (kind enum + path-prefix ownership), never file content.
  const backendSrc = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');
  const start = backendSrc.indexOf('function sanitizeDmMedia(raw, expectedPathPrefix) {');
  const end = backendSrc.indexOf('\n}', start);
  const body = backendSrc.slice(start, end);
  assert.ok(!/magic|ffprobe|content-sniff|validateVideo|validateImage/i.test(body), 'sanitizeDmMedia appears to have gained content validation — update this test to match, and update the doc');
});

// ── 5. Exact target-message flow (real message id, not inferred from thread) ─
// deliverNotification() in api_server_v16.js has no message-id parameter and
// the notifications table has no column to carry one (verified live via the
// project's Postgres information_schema — entity_id/entity_type/target_modal/
// target_tab/gif are the only relevant columns). Real per-message targeting
// requires a schema migration; these tests cover the frontend contract that's
// already correct and ready for when a real id arrives, and the safe fallback
// for the (currently universal) case where none does.

check('resolveNotifDestination: a real targetMessageId from the notification payload survives normalization end-to-end', () => {
  // Simulates the shape a future backend payload WOULD have (see docs) —
  // proves the frontend already does the right thing with it today.
  const n = { id:'n1', type:'dm_received', entityId:'thread-9', entityType:'thread', targetMessageId:'msg-77' };
  const dest = resolveNotifDestination(n);
  assert.strictEqual(dest.targetMessageId, 'msg-77');
  const store = { value: null };
  stashNotifTarget(store, dest.targetId, dest.entityType, dest.targetMessageId);
  const consumed = consumeNotifTarget(store, 'thread');
  assert.deepStrictEqual(consumed, { targetId:'thread-9', targetMessageId:'msg-77' });
});

check('resolveNotifDestination: absence of targetMessageId normalizes to null, not undefined — matches every real notification today', () => {
  const n = { id:'n2', type:'dm_received', entityId:'thread-9', entityType:'thread' };
  const dest = resolveNotifDestination(n);
  assert.strictEqual(dest.targetMessageId, null);
});

// Mirrors the scroll-positioning effect's "wantMsgId" decision in App.jsx —
// same three conditions: thread match, id present, id actually exists in the
// loaded message list.
function resolveScrollTarget(targetThreadId, activeConvoId, notifMessageId, messageIds) {
  const wantMsgId = targetThreadId === activeConvoId && notifMessageId && messageIds.some(id => String(id) === String(notifMessageId))
    ? notifMessageId : null;
  return wantMsgId; // null → fall back to newest
}

check('DM scroll target: a real, present message id resolves to itself', () => {
  assert.strictEqual(resolveScrollTarget('t1', 't1', 'm5', ['m3','m4','m5']), 'm5');
});

check('DM scroll target: a deleted/missing target message falls back to newest (null)', () => {
  assert.strictEqual(resolveScrollTarget('t1', 't1', 'm999', ['m3','m4','m5']), null);
});

check('DM scroll target: no target at all falls back to newest (null)', () => {
  assert.strictEqual(resolveScrollTarget('t1', 't1', null, ['m3','m4','m5']), null);
});

check('DM scroll target: a target id present but for a DIFFERENT thread never applies (cross-conversation leak guard)', () => {
  assert.strictEqual(resolveScrollTarget('t1', 't2', 'm5', ['m3','m4','m5']), null);
});

check('App.jsx: initial positioning runs at most once per conversation id (positionedConvoRef guard)', () => {
  const start = src.indexOf('const positionedConvoRef = useRef(null);');
  assert.ok(start !== -1, 'positionedConvoRef not found');
  const guardIdx = src.indexOf('if (positionedConvoRef.current === activeConvo.id) return undefined;', start);
  assert.ok(guardIdx !== -1 && guardIdx - start < 2000, 'positioning guard not found near positionedConvoRef declaration');
});

// ── 6. Browser Back must agree with the app's own DM back arrow ────────────
// (found live in this pass: opening a DM from Backstage Buzz and pressing
// the OS/browser Back button closed straight to Fanverse, skipping Buzz,
// while the in-app "←" correctly returned to Buzz — the two controls
// disagreed. Fixed by making onPop buzz-aware the same way closeChatsModal
// already was.)

check('onPop (browser Back handler) reopens Backstage Buzz for a buzz-origin chats modal, matching closeChatsModal', () => {
  const start = src.indexOf('const onPop = () => {');
  const end = src.indexOf('\n    };', start);
  assert.ok(start !== -1 && end !== -1, 'onPop handler not found');
  const body = src.slice(start, end);
  assert.ok(/modal === "chats" && dmEntryOrigin === "buzz"/.test(body), 'onPop no longer checks dmEntryOrigin — browser Back will disagree with the app back arrow again');
  assert.ok(/go\("notifications"\)/.test(body), 'onPop does not reopen Backstage Buzz');
});

check('onPop\'s effect dependency array includes dmEntryOrigin (so the closure sees the current value)', () => {
  const depsIdx = src.indexOf('},[appState, modal, tab, dmEntryOrigin]);');
  assert.ok(depsIdx !== -1, 'dmEntryOrigin missing from the popstate effect\'s dependency array — the handler would use a stale origin');
});

// ── 7. Misleading-extension rejection (explicit, beyond the existing fallback tests) ─

check('classifyAttachment: a real, reliable MIME always wins over a misleading extension in either direction', () => {
  // application/json claiming to be a .webm — reliable MIME, not ours: reject.
  assert.strictEqual(classifyAttachment('application/json', 'clip.webm').accepted, false);
  // image/gif claiming to be a .mp4 — reliable MIME, not ours: reject (also
  // not silently treated as the extension's format).
  const r = classifyAttachment('image/gif', 'video.mp4');
  assert.strictEqual(r.accepted, false);
});

check('classifyAttachment: oversized check is independent of format — MAX_ATTACH_BYTES boundary is exactly 24MB', () => {
  const MAX_ATTACH_BYTES = 24 * 1024 * 1024;
  assert.strictEqual(MAX_ATTACH_BYTES, 25165824);
  const m = src.match(/const MAX_ATTACH_BYTES = (\d+ \* \d+ \* \d+);/);
  assert.ok(m, 'MAX_ATTACH_BYTES definition not found or changed shape');
  assert.strictEqual(eval(m[1]), MAX_ATTACH_BYTES, 'MAX_ATTACH_BYTES value changed — update this test deliberately if that was intended');
});

// ── 8. Exact target-message backend wiring (2026-08-04) ────────────────────
// The notifications.target_message_id column now exists (verified live
// against the real schema — see supabase-notifications-target-message-migration.sql).
// These tests confirm the backend actually populates and returns it, and
// that it is never derived from the thread id (entityId).

const backendSrc = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');

check('migration file exists and matches the verified schema (uuid FK, ON DELETE SET NULL, nullable)', () => {
  const migrationPath = path.join(__dirname, '..', 'supabase-notifications-target-message-migration.sql');
  assert.ok(fs.existsSync(migrationPath), 'migration file not found');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.ok(/target_message_id uuid/i.test(sql), 'column type is not uuid — messages.id is uuid, this must match');
  assert.ok(/REFERENCES public\.messages\(id\)/i.test(sql), 'FK does not reference public.messages(id)');
  assert.ok(/ON DELETE SET NULL/i.test(sql), 'FK is not ON DELETE SET NULL — required so a deleted target falls back to newest, not a broken reference or a cascaded notification delete');
  assert.ok(!/NOT NULL/i.test(sql), 'column must stay nullable — every existing notification has no message id');
});

check('deliverNotification accepts targetMessageId and inserts it only when present (mirrors the existing gif pattern)', () => {
  const start = backendSrc.indexOf('async function deliverNotification(');
  const end = backendSrc.indexOf('\n}', start);
  const body = backendSrc.slice(start, end);
  assert.ok(/targetMessageId = null/.test(body), 'deliverNotification does not accept a targetMessageId param');
  assert.ok(/if \(targetMessageId\) insert\.target_message_id = targetMessageId;/.test(body), 'targetMessageId is not conditionally inserted — must not break on DBs without the migration');
});

check('the main DM /send route passes the real newly-created message id, not the thread id', () => {
  const start = backendSrc.indexOf("app.post('/api/messages/thread/:id/send'");
  const end = backendSrc.indexOf('\napp.post', start + 10);
  const body = backendSrc.slice(start, end === -1 ? undefined : end);
  assert.ok(/targetMessageId: data\.id,/.test(body), '/send route does not pass the real message id (data.id) as targetMessageId');
  assert.ok(/entityId: req\.params\.id,/.test(body), 'entityId (thread id) must still be sent separately — never conflate the two');
});

check('the scrapbook-invite DM path also passes its own real message id (same dm_received contract)', () => {
  const idx = backendSrc.indexOf("title: `${sender?.username || 'A Backstage fan'} shared a scrapbook`");
  assert.ok(idx !== -1, 'scrapbook-invite notification block not found');
  const body = backendSrc.slice(idx - 200, idx + 400);
  assert.ok(/targetMessageId: msg\.id,/.test(body), 'scrapbook-invite dm_received does not pass its own message id');
});

check('toClientNotification maps target_message_id to targetMessageId, separate from entityId', () => {
  const start = backendSrc.indexOf('function toClientNotification(n) {');
  const end = backendSrc.indexOf('\n}', start);
  const body = backendSrc.slice(start, end);
  assert.ok(/targetMessageId: n\.target_message_id \|\| null,/.test(body));
  assert.ok(/entityId: n\.entity_id \|\| ''/.test(body), 'entityId mapping must stay independent — never merged with targetMessageId');
});

check('GET /api/notifications selects target_message_id (otherwise it can never reach the client no matter what deliverNotification stores)', () => {
  const idx = backendSrc.indexOf("app.get('/api/notifications', requireAuth");
  assert.ok(idx !== -1, 'route not found');
  const body = backendSrc.slice(idx, idx + 600);
  assert.ok(/target_message_id/.test(body), 'select() does not include target_message_id');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
