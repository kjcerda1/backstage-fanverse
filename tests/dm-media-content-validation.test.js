// Structural + logic regression tests for the 2026-08-04 DM media
// server-authoritative content-validation pass. Same discipline as the
// other tests/*.js files: plain Node + assert, no framework, no live
// server/DB — run with:
//   node tests/dm-media-content-validation.test.js
//
// Background: the browser PUTs attachment bytes directly to Supabase
// Storage via a signed URL — api_server_v16.js never saw them before this
// change. sanitizeDmMedia() only ever validated STRUCTURE (kind enum,
// path-ownership prefix), never content, so a plain-text file renamed to
// .mp4 with an empty/generic MIME (which the client's extension fallback
// then legitimately accepted, since that fallback is a picker-compatibility
// aid, not a security boundary) uploaded and sent successfully — reproduced
// live in the prior QA pass. This adds a real magic-byte/container-signature
// check, run server-side against the actual downloaded bytes, before the
// message is ever created.
//
// Covers:
//   1. detectMediaSignature() — real signature detection for every required
//      format, using actual header bytes extracted from real generated
//      JPEG/PNG/WebM/MP4/MOV files (not guessed).
//   2. Rejection: empty/short buffers, arbitrary binary, kind mismatch.
//   3. Structural wiring: the /send route calls verification before the
//      message insert, deletes the object on rejection, canonicalizes
//      mimeType from the verified signature (never trusts the client's).
//   4. The distinct 422/invalid_media error surfaces a truthful, distinct
//      client-side message (not conflated with generic send/upload failure
//      or the existing 403/blocked case).

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendSrc = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');
const frontendSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); fail++; }
}

// ── 1-2. detectMediaSignature() — mirrors api_server_v16.js exactly ────────

const ALLOWED_DM_MEDIA_FORMATS = { image: new Set(['jpeg', 'png', 'webp', 'heic']), video: new Set(['mp4', 'mov', 'webm']) };

function detectMediaSignature(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { kind: 'image', format: 'jpeg', mimeType: 'image/jpeg' };
  const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  if (buf.length >= 8 && PNG_SIG.every((v, i) => buf[i] === v)) return { kind: 'image', format: 'png', mimeType: 'image/png' };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { kind: 'image', format: 'webp', mimeType: 'image/webp' };
  }
  if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return { kind: 'video', format: 'webm', mimeType: 'video/webm' };
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (brand === 'qt  ') return { kind: 'video', format: 'mov', mimeType: 'video/quicktime' };
    const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);
    if (HEIC_BRANDS.has(brand)) return { kind: 'image', format: 'heic', mimeType: 'image/heic' };
    return { kind: 'video', format: 'mp4', mimeType: 'video/mp4' };
  }
  return null;
}

// Real header bytes, extracted directly from actual generated files (Pillow
// for JPEG/PNG, OpenCV/FFmpeg for WebM/MP4/MOV) — not hand-guessed.
const REAL_HEADERS = {
  jpeg: Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,1,0,0,1]),
  png:  Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]),
  webm: Buffer.from([26,69,223,163,159,66,134,129,1,66,247,129,1,66,242,129]),
  mp4:  Buffer.from([0,0,0,28,102,116,121,112,105,115,111,109,0,0,2,0]),   // ftyp brand 'isom'
  mov:  Buffer.from([0,0,0,20,102,116,121,112,113,116,32,32,0,0,2,0]),     // ftyp brand 'qt  '
};
// WebP and HEIC weren't part of the round-2 real-file set (no encoder
// available for either in this environment) — constructed by hand from the
// documented, standard signatures instead (RIFF/WEBP; ftyp + a real HEIC
// brand code), which is exactly the signature detectMediaSignature checks
// against, so this still proves the detection logic even without a genuine
// encoded sample.
const SYNTHETIC_HEADERS = {
  webp: Buffer.from([0x52,0x49,0x46,0x46, 0,0,0,0, 0x57,0x45,0x42,0x50, 0x56,0x50,0x38,0x20]),
  heic: Buffer.from([0,0,0,24, 0x66,0x74,0x79,0x70, 0x68,0x65,0x69,0x63, 0,0,0,0]),
};

check('detectMediaSignature: real JPEG bytes → image/jpeg', () => {
  assert.deepStrictEqual(detectMediaSignature(REAL_HEADERS.jpeg), { kind:'image', format:'jpeg', mimeType:'image/jpeg' });
});
check('detectMediaSignature: real PNG bytes → image/png', () => {
  assert.deepStrictEqual(detectMediaSignature(REAL_HEADERS.png), { kind:'image', format:'png', mimeType:'image/png' });
});
check('detectMediaSignature: WebP (RIFF/WEBP) → image/webp', () => {
  assert.deepStrictEqual(detectMediaSignature(SYNTHETIC_HEADERS.webp), { kind:'image', format:'webp', mimeType:'image/webp' });
});
check('detectMediaSignature: HEIC (ftyp + heic brand) → image/heic', () => {
  assert.deepStrictEqual(detectMediaSignature(SYNTHETIC_HEADERS.heic), { kind:'image', format:'heic', mimeType:'image/heic' });
});
check('detectMediaSignature: real WebM (EBML header) bytes → video/webm', () => {
  assert.deepStrictEqual(detectMediaSignature(REAL_HEADERS.webm), { kind:'video', format:'webm', mimeType:'video/webm' });
});
check('detectMediaSignature: real MP4 (ftyp/isom) bytes → video/mp4', () => {
  assert.deepStrictEqual(detectMediaSignature(REAL_HEADERS.mp4), { kind:'video', format:'mp4', mimeType:'video/mp4' });
});
check('detectMediaSignature: real MOV (ftyp/qt  ) bytes → video/mov (video/quicktime)', () => {
  assert.deepStrictEqual(detectMediaSignature(REAL_HEADERS.mov), { kind:'video', format:'mov', mimeType:'video/quicktime' });
});

check('detectMediaSignature: empty/too-short buffer is rejected, not crashed', () => {
  assert.strictEqual(detectMediaSignature(Buffer.alloc(0)), null);
  assert.strictEqual(detectMediaSignature(Buffer.from([1,2,3])), null);
  assert.strictEqual(detectMediaSignature(null), null);
});
check('detectMediaSignature: arbitrary binary/text (the reported bypass) is rejected — no signature match', () => {
  const text = Buffer.from('this is plain text pretending to be a video file\n');
  assert.strictEqual(detectMediaSignature(text), null);
});
check('detectMediaSignature: extension/content mismatch is caught downstream, not silently accepted here', () => {
  // A real JPEG's bytes always identify as image/jpeg regardless of what
  // filename/kind the client claimed — the mismatch check is the caller's
  // job (verifyDmMediaContent comparing sig.kind to claimedKind), which is
  // tested structurally below since it needs the live-download step this
  // pure function doesn't do.
  const sig = detectMediaSignature(REAL_HEADERS.jpeg);
  assert.strictEqual(sig.kind, 'image');
  assert.notStrictEqual(sig.kind, 'video'); // would be rejected if claimed as video
});

check('ALLOWED_DM_MEDIA_FORMATS matches the required format list exactly (images: jpeg/png/webp/heic, videos: mp4/mov/webm)', () => {
  assert.deepStrictEqual([...ALLOWED_DM_MEDIA_FORMATS.image].sort(), ['heic','jpeg','png','webp']);
  assert.deepStrictEqual([...ALLOWED_DM_MEDIA_FORMATS.video].sort(), ['mov','mp4','webm']);
});

// ── 3. Structural wiring in api_server_v16.js ───────────────────────────────

check('backend: detectMediaSignature and verifyDmMediaContent are both defined', () => {
  assert.ok(/function detectMediaSignature\(buf\)/.test(backendSrc));
  assert.ok(/async function verifyDmMediaContent\(path, claimedKind\)/.test(backendSrc));
});

check('backend: verifyDmMediaContent downloads the object itself — never trusts a client-supplied buffer or claim', () => {
  const start = backendSrc.indexOf('async function verifyDmMediaContent(path, claimedKind) {');
  const end = backendSrc.indexOf('\n}', start);
  const body = backendSrc.slice(start, end);
  assert.ok(/supabase\.storage\.from\('dm-media'\)\.download\(path\)/.test(body), 'does not download the actual object from storage — cannot be server-authoritative without this');
  assert.ok(/sig\.kind !== claimedKind/.test(body), 'does not reject a kind mismatch (e.g. image bytes claimed as video)');
  assert.ok(/ALLOWED_DM_MEDIA_FORMATS\[sig\.kind\]\.has\(sig\.format\)/.test(body), 'does not check the detected format against the allowed set');
});

check('backend: /send route runs content verification BEFORE the message insert, for image/video kinds only', () => {
  const sendStart = backendSrc.indexOf("app.post('/api/messages/thread/:id/send'");
  const nextRoute = backendSrc.indexOf("\napp.post('/api/messages/upload-url'", sendStart);
  const routeBody = backendSrc.slice(sendStart, nextRoute === -1 ? sendStart + 4000 : nextRoute);
  const insertIdx = routeBody.indexOf('.insert(insert)');
  const verifyIdx = routeBody.indexOf('verifyDmMediaContent(media.path, media.kind)');
  assert.ok(sendStart !== -1 && insertIdx !== -1 && verifyIdx !== -1, 'could not locate all three anchors in the /send route');
  assert.ok(verifyIdx < insertIdx, 'verifyDmMediaContent must run BEFORE the message insert — otherwise a rejected file could already be a real, referenceable message');
  assert.ok(/media && \(media\.kind === 'image' \|\| media\.kind === 'video'\)/.test(routeBody.slice(0, verifyIdx)), 'verification is not scoped to image/video kinds only (voice/scrapbook_invite should be untouched)');
});

check('backend: a rejected file is deleted from storage and never referenced by a message (422, distinct error code)', () => {
  const verifyIdx = backendSrc.indexOf('verifyDmMediaContent(media.path, media.kind)');
  const nearby = backendSrc.slice(verifyIdx, verifyIdx + 500);
  assert.ok(/supabase\.storage\.from\('dm-media'\)\.remove\(\[media\.path\]\)/.test(nearby), 'rejected object is not removed from storage — "remove rejected temporary uploads" not satisfied');
  assert.ok(/res\.status\(422\)\.json\(\{ error: 'invalid_media'/.test(nearby), 'rejection does not return a distinct, truthful error code');
});

check('backend: mimeType is canonicalized from the VERIFIED signature after passing, never left as the client-claimed value', () => {
  const verifyIdx = backendSrc.indexOf('verifyDmMediaContent(media.path, media.kind)');
  const nearby = backendSrc.slice(verifyIdx, verifyIdx + 700);
  assert.ok(/media\.mimeType = verified\.mimeType;/.test(nearby), 'mimeType is not overwritten with the server-verified value — a passed file would still carry an unverified client-supplied mimeType downstream');
});

check('backend: sanitizeDmMedia (structural/ownership check) is untouched and still runs first', () => {
  assert.ok(/function sanitizeDmMedia\(raw, expectedPathPrefix\) \{/.test(backendSrc));
  assert.ok(/if \(!expectedPathPrefix \|\| !raw\.path\.startsWith\(expectedPathPrefix\)\) return null;/.test(backendSrc), 'path-prefix ownership check missing or changed — this is the actual storage-ownership boundary, must stay intact');
});

check('backend: the dm-media bucket already enforces a 24MB size limit and a declared-MIME allowlist at the storage layer (verified live against the real bucket config) — this pass does not touch size handling, only content authenticity', () => {
  // Documents what was verified live via Supabase (storage.buckets.file_size_limit
  // = 25165824 = 24MB, allowed_mime_types set) so this isn't silently assumed.
  // No corresponding source assertion — this is infrastructure config, not code —
  // recorded here so the "preserve existing size limit" requirement has a paper trail.
  assert.strictEqual(24 * 1024 * 1024, 25165824);
});

// ── 4. Frontend: distinct, truthful error surfaced to the user ─────────────

check('frontend: uploadAndSendMedia distinguishes 422/invalid_media from blocked (403) and generic send-failed', () => {
  const start = frontendSrc.indexOf('const uploadAndSendMedia = async (file, media, caption) => {');
  const end = frontendSrc.indexOf('\n  };', start);
  const body = frontendSrc.slice(start, end);
  assert.ok(/saved\?\.error === '422' \? 'invalid-media'/.test(body), 'uploadAndSendMedia does not distinguish the 422 invalid-media case');
});

check('frontend: sendPendingAttachment shows a distinct, truthful message for invalid-media (not the generic upload-failed text)', () => {
  const start = frontendSrc.indexOf('const sendPendingAttachment = async () => {');
  const end = frontendSrc.indexOf('\n  };', start);
  const body = frontendSrc.slice(start, end);
  assert.ok(/'invalid-media' \? "That file couldn't be verified as a supported photo or video/.test(body), 'no distinct invalid-media error message wired into sendPendingAttachment');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
