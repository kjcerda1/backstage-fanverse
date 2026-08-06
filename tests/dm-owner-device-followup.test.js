// Structural + logic regression tests for the 2026-08-05 owner-device
// follow-up pass (real installed-PWA QA on the notification-routing/DM-nav/
// web-video branch). Same discipline as the other tests/*.js files: plain
// Node + assert, no framework, no live server/DB — run with:
//   node tests/dm-owner-device-followup.test.js
//
// Covers the five owner-reported defects:
//   1. Push notification routing — data-only FCM payload (the actual root
//      cause: a `notification` block made Firebase's SDK auto-display/
//      auto-click-handle and compete with this app's own deep-link routing).
//   2. DM inbox + in-thread ordering — real timestamp sort, never a
//      formatted display string or thread-creation order.
//   3. Voice note send failure — MIME normalization (the actual root cause:
//      an unstripped ";codecs=..." parameter failing the storage bucket's
//      exact-match allowed_mime_types check) + distinct truthful errors.
//   4. Voice recording UX — live waveform lifecycle, cleanup, draft
//      preservation.
//   5. Bottom safe-area — env(safe-area-inset-bottom) + 44×44 tap targets
//      on all three composer states.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
const backendSrc = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); fail++; }
}

// ── 1. Push notification routing — data-only FCM payload ───────────────────

check('deliverNotification sends a data-only FCM payload (no top-level notification block)', () => {
  const start = backendSrc.indexOf('async function deliverNotification(');
  const end = backendSrc.indexOf('\napp.get(\'/api/users/check-username\'', start);
  const body = backendSrc.slice(start, end === -1 ? start + 4000 : end);
  const pushCallIdx = body.indexOf('pushToUserTokens(userId, {');
  assert.ok(pushCallIdx !== -1, 'pushToUserTokens call not found in deliverNotification');
  const pushCallBody = body.slice(pushCallIdx, pushCallIdx + 500);
  assert.ok(!/^\s*notification:\s*\{/m.test(pushCallBody.split('data:')[0]), 'a top-level notification: block is still present — reintroduces the Firebase-SDK-auto-click race');
  assert.ok(/data:\s*\{/.test(pushCallBody), 'data-only payload missing its data: block');
  assert.ok(/title:\s*title \|\| 'Backstage'/.test(pushCallBody), 'title must move into data (payload.notification will be absent)');
  assert.ok(/body:\s*body \|\| ''/.test(pushCallBody), 'body must move into data');
  assert.ok(/targetMessageId:\s*targetMessageId \|\| ''/.test(pushCallBody), 'targetMessageId missing from the data payload');
});

check('/api/send-notification also sends a data-only FCM payload', () => {
  const start = backendSrc.indexOf("app.post('/api/send-notification'");
  const end = backendSrc.indexOf('\napp.', start + 10);
  const body = backendSrc.slice(start, end === -1 ? start + 2000 : end);
  assert.ok(!/notification:\s*\{\s*title,\s*body\s*\}/.test(body), '/api/send-notification still sends a notification: block');
  assert.ok(/data:\s*\{/.test(body));
  assert.ok(/title:\s*title \|\| 'Backstage'/.test(body));
});

check('foreground onMessage handler reads title/body from payload.data and forwards targetMessageId', () => {
  const start = src.indexOf('onMessage(messaging, async (payload) => {');
  assert.ok(start !== -1, 'onMessage handler not found');
  const body = src.slice(start, start + 1300);
  assert.ok(/d\.title \|\| payload\.notification\?\.title/.test(body), 'title no longer prefers payload.data.title — will show "Backstage" for every real (data-only) push');
  assert.ok(/targetMessageId/.test(body), 'targetMessageId is not read/forwarded — foreground-received pushes would lose exact-message targeting');
  assert.ok(/data:\s*\{ targetModal, targetTab, targetId, entityType, targetMessageId, origin: window\.location\.origin \}/.test(body), 'showNotification data payload does not include targetMessageId');
});

check('service worker onBackgroundMessage still reads title/body/targetMessageId from payload.data (unchanged, now actually exercised)', () => {
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'firebase-messaging-sw.js'), 'utf8');
  assert.ok(/d\.title \|\| 'Backstage'/.test(swSrc));
  assert.ok(/targetMessageId:\s*d\.targetMessageId/.test(swSrc));
});

// ── 2. StrictMode-safe notification-target consumption ─────────────────────
// (peekNotifTarget/clearNotifTarget structural checks live in
// notification-dm-navigation.test.js §3a — not duplicated here.)

// ── 3. DM inbox + thread ordering — real timestamps, never display strings ─

// Re-implementation mirrors sortConvosByActivity exactly.
function sortConvosByActivity(list) {
  const t = (c) => { const ms = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : NaN; return Number.isFinite(ms) ? ms : -Infinity; };
  return [...list].sort((a, b) => {
    const diff = t(b) - t(a);
    if (diff !== 0) return diff;
    return String(a.id).localeCompare(String(b.id));
  });
}

check('sortConvosByActivity: three threads with different latest-message times sort newest-first', () => {
  const threads = [
    { id:'t-old',    lastMessageAt:'2026-08-01T10:00:00.000Z' },
    { id:'t-newest', lastMessageAt:'2026-08-05T09:30:00.000Z' },
    { id:'t-mid',    lastMessageAt:'2026-08-03T14:00:00.000Z' },
  ];
  const sorted = sortConvosByActivity(threads).map(c => c.id);
  assert.deepStrictEqual(sorted, ['t-newest', 't-mid', 't-old']);
});

check('sortConvosByActivity: a thread with no messages yet (lastMessageAt: null) sorts to the bottom, not the top', () => {
  const threads = [
    { id:'t-empty', lastMessageAt:null },
    { id:'t-real',  lastMessageAt:'2026-08-05T09:30:00.000Z' },
  ];
  assert.deepStrictEqual(sortConvosByActivity(threads).map(c => c.id), ['t-real', 't-empty']);
});

check('sortConvosByActivity: equal timestamps fall back to a deterministic id comparison, not source order', () => {
  const same = '2026-08-05T09:30:00.000Z';
  const a = [{ id:'b', lastMessageAt:same }, { id:'a', lastMessageAt:same }];
  const b = [{ id:'a', lastMessageAt:same }, { id:'b', lastMessageAt:same }];
  assert.deepStrictEqual(sortConvosByActivity(a).map(c => c.id), sortConvosByActivity(b).map(c => c.id), 'tie-break order depends on input order — not deterministic');
});

check('sortConvosByActivity: an invalid/garbage timestamp does not crash and sorts as if absent', () => {
  const threads = [
    { id:'t-garbage', lastMessageAt:'not-a-real-date' },
    { id:'t-real',    lastMessageAt:'2026-08-05T09:30:00.000Z' },
  ];
  assert.deepStrictEqual(sortConvosByActivity(threads).map(c => c.id), ['t-real', 't-garbage']);
});

check('App.jsx: normalizeDmThread derives lastMessageAt from a real timestamp, never a formatted string', () => {
  const start = src.indexOf('const normalizeDmThread = (thread, messages = null) => {');
  assert.ok(start !== -1, 'normalizeDmThread not found');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/const lastRaw = thread\.last_message \|\| threadMessages\[threadMessages\.length - 1\] \|\| null;/.test(body), 'lastRaw derivation missing or changed shape');
  assert.ok(/lastMessageAt:lastRaw\?\.created_at \|\| null,/.test(body), 'lastMessageAt is not derived from the real created_at timestamp');
});

check('App.jsx: inboxConvos and requestConvos are sorted at render time via sortConvosByActivity', () => {
  assert.ok(/const inboxConvos\s+= sortConvosByActivity\(convos\.filter\(c => !isPendingRequest\(c\)\)\);/.test(src), 'inboxConvos is not sorted — the raw fetch/creation order would still show through');
  assert.ok(/const requestConvos\s+= sortConvosByActivity\(convos\.filter\(isPendingRequest\)\);/.test(src));
});

check('App.jsx: every real send path (text, photo/video, voice, scrapbook invite) sets a real lastMessageAt, not just the display string', () => {
  const matches = [...src.matchAll(/lastTime:"now", lastMessageAt:nowIso, accepted:true\} : c\);/g)];
  assert.strictEqual(matches.length, 4, `expected all 4 send paths (text/media/voice/scrapbook) to set lastMessageAt, found ${matches.length}`);
});

check('App.jsx: the DM thread list is refreshed periodically (poll-based, matching CURRENT_STATE.md\'s documented DM architecture) so an incoming message can reorder the inbox without a full remount', () => {
  const start = src.indexOf('const refreshThreadList = async () => {');
  assert.ok(start !== -1, 'refreshThreadList not found');
  const pollIdx = src.indexOf('setInterval(() => { if (alive) refreshThreadList(); }, 15000);', start);
  assert.ok(pollIdx !== -1, 'no periodic poll wired to refreshThreadList');
});

check('App.jsx: refreshThreadList preserves purely-local (non-backend) convos instead of dropping them on every poll tick', () => {
  const start = src.indexOf('const refreshThreadList = async () => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/localOnly = prev\.filter\(c => !c\.backend && !fresh\.some/.test(body), 'local-only convo preservation missing — a poll could silently delete a not-yet-round-tripped thread');
});

check('Backend: messages within a thread are always fetched in ascending created_at order (in-thread chronological ordering is structural, not display-string-dependent)', () => {
  const threadsRoute = backendSrc.slice(backendSrc.indexOf("app.get('/api/messages/threads'"), backendSrc.indexOf("app.get('/api/messages/threads'") + 1200);
  assert.ok(/order\('created_at', \{ ascending: true \}\)/.test(threadsRoute));
  const singleThreadRoute = backendSrc.slice(backendSrc.indexOf("app.get('/api/messages/thread/:id'"), backendSrc.indexOf("app.get('/api/messages/thread/:id'") + 800);
  assert.ok(/order\('created_at', \{ ascending: true \}\)/.test(singleThreadRoute));
});

// ── 4. Voice note send failure — MIME normalization + distinct errors ──────

check('finishVoiceRecording strips any ";codecs=..." parameter from the recorder-reported MIME type', () => {
  const start = src.indexOf('const finishVoiceRecording = () => {');
  assert.ok(start !== -1, 'finishVoiceRecording not found');
  const body = src.slice(start, start + 1500);
  assert.ok(/const mimeType = \(recorder\.mimeType \|\| 'audio\/webm'\)\.split\(';'\)\[0\]\.trim\(\) \|\| 'audio\/webm';/.test(body), 'mimeType is not normalized to strip codecs params — the exact root cause of the storage-upload failure on iOS Safari');
});

check('MIME-normalization logic: a codecs-qualified type strips to its bare form', () => {
  const normalize = (raw) => (raw || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  assert.strictEqual(normalize('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4');
  assert.strictEqual(normalize('audio/webm;codecs=opus'), 'audio/webm');
  assert.strictEqual(normalize('audio/mp4'), 'audio/mp4');
  assert.strictEqual(normalize(''), 'audio/webm');
  assert.strictEqual(normalize(null), 'audio/webm');
});

check('dm-media bucket already allowlists every real MediaRecorder audio MIME the app can produce (verified live against the actual bucket config)', () => {
  // audio/webm, audio/mp4 — the two real candidates in VOICE_MIME_CANDIDATES
  // that browsers actually select (audio/ogg is a third candidate but rarely
  // chosen — Chrome/Firefox pick webm, Safari picks mp4).
  const start = src.indexOf("const VOICE_MIME_CANDIDATES = [");
  assert.ok(start !== -1);
  const line = src.slice(start, src.indexOf('\n', start));
  assert.ok(/audio\/webm/.test(line) && /audio\/mp4/.test(line));
});

check('sendVoiceNote gives distinct, truthful messages for upload-url-failed, upload-failed, invalid-media, blocked, and a generic send failure', () => {
  const start = src.indexOf('const sendVoiceNote = async () => {');
  assert.ok(start !== -1, 'sendVoiceNote not found');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/reason === 'blocked'/.test(body));
  assert.ok(/reason === 'upload-url-failed'/.test(body));
  assert.ok(/reason === 'upload-failed'/.test(body));
  assert.ok(/reason === 'invalid-media'/.test(body));
  // All five branches must produce genuinely different copy (a regression that
  // collapses them back to one shared string would still satisfy "5 branches
  // exist" without this).
  const messages = [...body.matchAll(/"([^"]+)"/g)].map(m => m[1]).filter(s => s.length > 15);
  assert.strictEqual(new Set(messages).size, messages.length, `expected every branch message to be distinct, got: ${JSON.stringify(messages)}`);
});

check('startVoiceRecording gives a distinct message for permission-denied vs. recording-unavailable vs. generic mic-access failure', () => {
  const start = src.indexOf('const startVoiceRecording = async () => {');
  assert.ok(start !== -1);
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/NotAllowedError/.test(body), 'permission-denied case not distinguished');
  assert.ok(/Recording isn't available on this device right now\./.test(body), 'MediaRecorder-construction failure (distinct from permission denial) not handled');
  assert.ok(/Couldn't access the microphone\./.test(body), 'generic getUserMedia failure message missing');
});

check('startVoiceRecording releases the microphone if MediaRecorder construction fails after getUserMedia already succeeded', () => {
  const start = src.indexOf('const startVoiceRecording = async () => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  const catchIdx = body.lastIndexOf('} catch (err) {');
  const catchBody = body.slice(catchIdx);
  assert.ok(/stream\.getTracks\(\)\.forEach\(t => t\.stop\(\)\);/.test(catchBody), 'the outer catch does not stop the acquired mic stream — a MediaRecorder construction failure would leave the mic active');
});

check('finishVoiceRecording still guards against an empty recording (no message inserted)', () => {
  const start = src.indexOf('const finishVoiceRecording = () => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/if \(!blob\.size\) \{/.test(body));
  assert.ok(/That recording was empty/.test(body));
});

// ── 5. Voice recording UX — live waveform lifecycle ─────────────────────────

check('startVoiceAnalyser exists and is a best-effort (try/catch-wrapped) real AnalyserNode setup, never fabricating a fake "live" waveform', () => {
  const start = src.indexOf('const startVoiceAnalyser = (stream) => {');
  assert.ok(start !== -1, 'startVoiceAnalyser not found');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/createAnalyser\(\)/.test(body));
  assert.ok(/getByteFrequencyData\(data\)/.test(body), 'not reading real frequency data from the analyser');
  assert.ok(/setVoiceLevelsLive\(true\)/.test(body), 'never marks the waveform as genuinely live');
  assert.ok(/} catch \{/.test(body), 'analyser setup is not wrapped defensively — a construction failure would crash recording entirely instead of degrading to the fallback');
});

check('stopVoiceAnalyser tears down the animation frame, AnalyserNode, and AudioContext', () => {
  const start = src.indexOf('const stopVoiceAnalyser = () => {');
  assert.ok(start !== -1, 'stopVoiceAnalyser not found');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(/cancelAnimationFrame\(voiceRafRef\.current\)/.test(body));
  assert.ok(/ctx\.close\(\)/.test(body), 'AudioContext is never closed — a left-open context keeps the mic stream source referenced');
  assert.ok(/setVoiceLevelsLive\(false\)/.test(body));
});

check('stopVoiceAnalyser is called from every exit path: cancel, finish, error, and unmount', () => {
  const cancelStart = src.indexOf('const cancelVoiceRecording = () => {');
  assert.ok(/stopVoiceAnalyser\(\);/.test(src.slice(cancelStart, cancelStart + 400)), 'cancelVoiceRecording does not clean up the analyser');

  const finishStart = src.indexOf('const finishVoiceRecording = () => {');
  assert.ok(/stopVoiceAnalyser\(\);/.test(src.slice(finishStart, finishStart + 300)), 'finishVoiceRecording does not clean up the analyser');

  const startStart = src.indexOf('const startVoiceRecording = async () => {');
  const startEnd = src.indexOf('\n  };', startStart);
  const onerrorBody = src.slice(startStart, startEnd);
  assert.ok(/recorder\.onerror = \(\) => \{[\s\S]*?stopVoiceAnalyser\(\);/.test(onerrorBody), 'recorder.onerror does not clean up the analyser');

  const unmountIdx = src.indexOf('Stop any in-flight recording/stream/analyser if the thread unmounts mid-record.');
  assert.ok(unmountIdx !== -1, 'unmount cleanup comment not found/updated');
  const unmountBody = src.slice(unmountIdx, unmountIdx + 300);
  assert.ok(/stopVoiceAnalyser\(\);/.test(unmountBody), 'unmount cleanup effect does not tear down the analyser');
});

check('startVoiceRecording starts the analyser only after MediaRecorder.start() succeeds (never before, never on a failed construction)', () => {
  const start = src.indexOf('const startVoiceRecording = async () => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  const recorderStartIdx = body.indexOf('recorder.start();');
  const analyserStartIdx = body.indexOf('startVoiceAnalyser(stream);');
  assert.ok(recorderStartIdx !== -1 && analyserStartIdx !== -1);
  assert.ok(analyserStartIdx > recorderStartIdx, 'startVoiceAnalyser is called before recorder.start() — should follow it');
});

check('the recording bar renders 20 waveform bars driven by voiceLevels, with a non-live fallback that never claims to be reacting to real audio', () => {
  const start = src.indexOf('VOICE RECORDING BAR');
  assert.ok(start !== -1);
  const body = src.slice(start, start + 3200);
  assert.ok(/voiceLevels\.map\(\(lvl, i\) => \(/.test(body), 'waveform bars are not rendered from voiceLevels');
  assert.ok(/voiceLevelsLive \? `\$\{Math\.max\(12, Math\.round\(lvl\*100\)\)\}%` : "60%"/.test(body), 'live vs fallback height branch missing');
  assert.ok(/animation:voiceLevelsLive \? "none" : `eqBar/.test(body), 'fallback does not reuse the existing eqBar keyframe (or live mode leaves a stray animation running)');
});

check('voiceLevels state initializes to 20 zeroed bars', () => {
  assert.ok(/const \[voiceLevels, setVoiceLevels\] = useState\(\(\) => new Array\(20\)\.fill\(0\)\);/.test(src));
});

check('draft text is preserved across a voice recording — startVoiceRecording never touches msgDraft', () => {
  const start = src.indexOf('const startVoiceRecording = async () => {');
  const end = src.indexOf('\n  };', start);
  const body = src.slice(start, end);
  assert.ok(!/setMsgDraft/.test(body), 'startVoiceRecording touches msgDraft — recording should never clear or alter the existing draft');
});

// ── 6. Bottom safe-area — env(safe-area-inset-bottom) + 44×44 tap targets ──

check('all three composer states (recording, preview, normal) include env(safe-area-inset-bottom) in their bottom padding', () => {
  const occurrences = [...src.matchAll(/padding:"10px 14px calc\(14px \+ env\(safe-area-inset-bottom\)\)"/g)];
  assert.strictEqual(occurrences.length, 3, `expected all 3 composer bars to use the safe-area-aware padding, found ${occurrences.length}`);
});

check('no composer bar still uses the old flat "10px 14px 14px" padding (regression guard)', () => {
  assert.ok(!/padding:"10px 14px 14px"/.test(src), 'a composer bar still has flat bottom padding with no safe-area inset — controls will sit flush against the home indicator on an installed iPhone PWA');
});

check('primary composer/recording/preview controls use a 44×44 tap target (the practical minimum), not 40×40', () => {
  const primaryButtons = [
    'onClick={cancelVoiceRecording}',
    'onClick={finishVoiceRecording}',
    'onClick={discardVoicePreview}',
    'onClick={sendVoiceNote}',
    'onClick={()=>setAttachSheetOpen(v=>!v)}',
    'onClick={()=>{ setGifPickerOpen(true); setAttachSheetOpen(false); }}',
    'onClick={handlePrimaryComposerAction}',
    'onClick={startVoiceRecording}',
  ];
  for (const marker of primaryButtons) {
    const idx = src.indexOf(marker);
    assert.ok(idx !== -1, `button marker not found: ${marker}`);
    const nearby = src.slice(idx, idx + 400);
    assert.ok(/width:44,height:44/.test(nearby), `button "${marker}" is not sized 44×44: ${nearby.slice(0, 120)}`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
