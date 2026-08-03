// Focused matching-rule + authorization tests for Smart Matching V1
// (docs/SMART_MATCHING_V1_2026-08-02.md).
//
// SCOPE NOTE: same constraint as tests/binder-card-ownership.test.js —
// api_server_v16.js calls app.listen(...) at import time and needs a full
// production-shaped env, so it can't be safely `require`d into a lightweight
// test process, and there is no test framework installed in this repo. This
// file is plain Node + the built-in `assert` module:
//   node tests/smart-matching.test.js
//
// What this file DOES cover (pure/structural, no live DB needed):
//   - smartMatchIdentityKey()/smartMatchNormalize() — exact mirrors of the
//     functions in api_server_v16.js, kept in sync by hand.
//   - The mutual/one-way/no-match join logic from computeSmartMatches(),
//     run against the three QA scenarios from the mission brief (A/B/C) plus
//     the edge cases it explicitly lists: self-match, duplicate suppression,
//     exact-vs-partial identity, status add/remove flipping a match on/off,
//     "duplicate" counting as tradeable, and casing normalization.
//   - A structural audit of api_server_v16.js's actual source: both new
//     routes require auth, the requester's id always comes from req.userId
//     (never req.params/req.body), the :userId route validates its param,
//     and blocked/non-discoverable users are excluded before being returned.
//
// What this file does NOT cover (needs a live database):
//   - RLS enforcement at the Postgres level (Smart Matching makes no RLS
//     changes — see docs/SMART_MATCHING_V1_2026-08-02.md "Architecture").
//   - Real HTTP round-trips against requireAuth/express — covered instead by
//     the three-account live QA pass recorded in that same doc.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { fail++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ─── Section A: identity key — exact mirror of api_server_v16.js ───────────
const SMART_MATCH_TRADEABLE_STATUSES = ['for_trade', 'duplicate'];

function smartMatchNormalize(v) {
  return String(v || '').trim().toLowerCase();
}
function smartMatchIdentityKey(card) {
  const g = smartMatchNormalize(card.group_name);
  const m = smartMatchNormalize(card.member);
  const a = smartMatchNormalize(card.album);
  const v = smartMatchNormalize(card.version);
  if (!g || !m || !a || !v) return null;
  return `${g}|||${m}|||${a}|||${v}`;
}

// Mirrors computeSmartMatches' in-memory join for a single (me, otherUser)
// pair — the exact same set logic the route runs per candidate.
function joinOneCandidate(myCards, theirCards) {
  const myIso = [], myTradeable = [];
  for (const c of myCards) {
    const key = smartMatchIdentityKey(c);
    if (!key) continue;
    if (c.status === 'iso') myIso.push({ ...c, key });
    if (SMART_MATCH_TRADEABLE_STATUSES.includes(c.status)) myTradeable.push({ ...c, key });
  }
  const myIsoKeys = new Set(myIso.map(c => c.key));
  const myTradeableKeys = new Set(myTradeable.map(c => c.key));

  const theirIso = [], theirTradeable = [];
  for (const c of theirCards) {
    const key = smartMatchIdentityKey(c);
    if (!key) continue;
    if (c.status === 'iso') theirIso.push({ ...c, key });
    if (SMART_MATCH_TRADEABLE_STATUSES.includes(c.status)) theirTradeable.push({ ...c, key });
  }

  const theyGiveIWant = theirTradeable.filter(c => myIsoKeys.has(c.key));
  const iGiveTheyWant = theirIso.filter(c => myTradeableKeys.has(c.key));
  if (!theyGiveIWant.length) return null;
  return { match_type: iGiveTheyWant.length ? 'mutual' : 'one_way', theyGiveIWant, iGiveTheyWant };
}

const card = (group_name, member, album, version, status) => ({ group_name, member, album, version, status });

// ─── Section B: mission QA scenarios A/B/C ──────────────────────────────────
test('Scenario A — mutual exact match (A wants X, B trades X; B wants Y, A trades Y)', () => {
  const aCards = [card('aespa','Winter','Drama','Giant Ver.','iso'), card('aespa','Karina','MY WORLD','Concept A','for_trade')];
  const bCards = [card('aespa','Winter','Drama','Giant Ver.','for_trade'), card('aespa','Karina','MY WORLD','Concept A','iso')];
  const result = joinOneCandidate(aCards, bCards);
  assert.strictEqual(result.match_type, 'mutual');
  assert.strictEqual(result.theyGiveIWant.length, 1);
  assert.strictEqual(result.iGiveTheyWant.length, 1);
});

test('Scenario B — one-way opportunity (C can give A what A wants, A has nothing C wants)', () => {
  const aCards = [card('ATEEZ','Yunho','THE WORLD EP.FIN','Poca','iso')];
  const cCards = [card('ATEEZ','Yunho','THE WORLD EP.FIN','Poca','for_trade'), card('BLACKPINK','Jisoo','Born Pink','Standard Ver.','iso')];
  const result = joinOneCandidate(aCards, cCards);
  assert.strictEqual(result.match_type, 'one_way');
  assert.strictEqual(result.theyGiveIWant.length, 1);
  assert.strictEqual(result.iGiveTheyWant.length, 0, 'C wanting a Jisoo card A does not have must never fabricate a reciprocal match');
});

test('Scenario C — no match on unrelated/incomplete identities', () => {
  const aCards = [card('Stray Kids','Felix','5-STAR','A Ver.','iso')];
  const cCards = [card('Stray Kids','Felix','5-STAR', null /* no version */, 'for_trade'), card('BLACKPINK','Lisa','Born Pink','Standard Ver.','for_trade')];
  const result = joinOneCandidate(aCards, cCards);
  assert.strictEqual(result, null, 'group+member alone (no version) must never count as a match');
});

// ─── Section C: identity rules ──────────────────────────────────────────────
test('exact identity requires group+member+album+version all present and equal', () => {
  assert.strictEqual(smartMatchIdentityKey(card('aespa','Karina','Drama','Giant Ver.')), 'aespa|||karina|||drama|||giant ver.');
});

test('identity normalization is case/whitespace-insensitive ("ateez" vs "ATEEZ" — real prod data drift)', () => {
  const a = smartMatchIdentityKey(card(' ateez ', 'Yunho', 'into the light', 'Standard'));
  const b = smartMatchIdentityKey(card('ATEEZ', ' yunho ', 'INTO THE LIGHT', 'standard'));
  assert.strictEqual(a, b);
});

test('missing version -> null identity key (excluded from matching, never guessed)', () => {
  assert.strictEqual(smartMatchIdentityKey(card('aespa','Karina','MY WORLD', null)), null);
});
test('missing album -> null identity key', () => {
  assert.strictEqual(smartMatchIdentityKey(card('aespa','Karina', '', 'Concept A')), null);
});
test('missing group_name -> null identity key', () => {
  assert.strictEqual(smartMatchIdentityKey(card('', 'Karina', 'MY WORLD', 'Concept A')), null);
});

test('era and card_type are NOT part of identity — two cards differing only in those still match', () => {
  const a = { ...card('aespa','Karina','Drama','Giant Ver.','iso'), era:'Drama', card_type:'album' };
  const b = { ...card('aespa','Karina','Drama','Giant Ver.','for_trade'), era:'', card_type:'Album PC' };
  assert.strictEqual(smartMatchIdentityKey(a), smartMatchIdentityKey(b));
});

// ─── Section D: status semantics ────────────────────────────────────────────
test('status "duplicate" counts as tradeable (confirmed product definition — cardTradeableCount in src/App.jsx)', () => {
  const aCards = [card('BLACKPINK','Rosé','Born Pink','Standard Ver.','iso')];
  const bCards = [card('BLACKPINK','Rosé','Born Pink','Standard Ver.','duplicate')];
  const result = joinOneCandidate(aCards, bCards);
  assert.ok(result, 'duplicate must be treated as tradeable, matching the product\'s own canonical selector');
  assert.strictEqual(result.match_type, 'one_way');
});

test('status "owned" (not iso/for_trade/duplicate) never participates in matching', () => {
  const aCards = [card('BLACKPINK','Jennie','Born Pink','Standard Ver.','owned')];
  const bCards = [card('BLACKPINK','Jennie','Born Pink','Standard Ver.','owned')];
  assert.strictEqual(joinOneCandidate(aCards, bCards), null);
});

test('status "missing" never participates in matching', () => {
  const aCards = [card('aespa','Winter','MY WORLD','Concept A','iso')];
  const bCards = [card('aespa','Winter','MY WORLD','Concept A','missing')];
  assert.strictEqual(joinOneCandidate(aCards, bCards), null);
});

// ─── Section E: state-transition edge cases (mission QA items 4-7) ─────────
test('status removed -> match disappears', () => {
  const aCards = [card('aespa','Winter','MY WORLD','Concept A','iso')];
  const bCards = [card('aespa','Winter','MY WORLD','Concept A','for_trade')];
  assert.ok(joinOneCandidate(aCards, bCards), 'sanity: match exists before removal');
  const bCardsAfterRemoval = [card('aespa','Winter','MY WORLD','Concept A','owned')]; // status changed away from for_trade
  assert.strictEqual(joinOneCandidate(aCards, bCardsAfterRemoval), null);
});

test('status added -> match appears', () => {
  const aCards = [card('aespa','Winter','MY WORLD','Concept A','iso')];
  const bCardsBefore = [card('aespa','Winter','MY WORLD','Concept A','owned')];
  assert.strictEqual(joinOneCandidate(aCards, bCardsBefore), null);
  const bCardsAfter = [card('aespa','Winter','MY WORLD','Concept A','for_trade')];
  assert.ok(joinOneCandidate(aCards, bCardsAfter));
});

test('Tradeable removed on the candidate side -> one-way match disappears', () => {
  const aCards = [card('aespa','Karina','Drama','Giant Ver.','iso')];
  const bCards = [card('aespa','Karina','Drama','Giant Ver.','for_trade')];
  assert.ok(joinOneCandidate(aCards, bCards));
  const bCardsGone = [];
  assert.strictEqual(joinOneCandidate(aCards, bCardsGone), null);
});

test('ISO removed on my side -> match disappears', () => {
  const aCardsBefore = [card('aespa','Karina','Drama','Giant Ver.','iso')];
  const bCards = [card('aespa','Karina','Drama','Giant Ver.','for_trade')];
  assert.ok(joinOneCandidate(aCardsBefore, bCards));
  const aCardsAfter = [];
  assert.strictEqual(joinOneCandidate(aCardsAfter, bCards), null);
});

test('duplicate result suppression: two identical tradeable rows on their side only ever produce one compatible-card entry per row, no inflation', () => {
  const aCards = [card('aespa','Karina','Drama','Giant Ver.','iso')];
  const bCards = [
    { ...card('aespa','Karina','Drama','Giant Ver.','for_trade'), id: 'card-1' },
    { ...card('aespa','Karina','Drama','Giant Ver.','for_trade'), id: 'card-2' },
  ];
  const result = joinOneCandidate(aCards, bCards);
  assert.strictEqual(result.theyGiveIWant.length, 2, 'two real distinct rows should show as two real cards, not deduped away or fabricated into more');
});

// ─── Section F: structural authorization audit of api_server_v16.js ────────
const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');

function routeBlock(routePath) {
  const idx = serverSrc.indexOf(`app.get('${routePath}'`);
  assert.ok(idx >= 0, `route ${routePath} not found in api_server_v16.js`);
  return serverSrc.slice(idx, idx + 1200);
}

test('GET /api/smart-matches requires auth', () => {
  assert.ok(routeBlock('/api/smart-matches').includes('requireAuth'));
});
test('GET /api/smart-matches/:userId requires auth', () => {
  assert.ok(routeBlock('/api/smart-matches/:userId').includes('requireAuth'));
});
test('computeSmartMatches reads the requester id from req.userId, never req.body/req.query/req.params', () => {
  const idx = serverSrc.indexOf('async function computeSmartMatches(req');
  const block = serverSrc.slice(idx, idx + 900);
  assert.ok(block.includes("eq('user_id', req.userId)"), 'the "my cards" query must be scoped by the JWT-verified req.userId');
  assert.ok(!block.includes('req.body.userId') && !block.includes('req.query.userId'), 'requester id must never be accepted from the client');
});
test('GET /api/smart-matches/:userId validates the param against a UUID shape before querying', () => {
  const block = routeBlock('/api/smart-matches/:userId');
  assert.ok(block.includes('SMART_MATCH_UUID_RE.test(targetUserId)'));
});
test('GET /api/smart-matches/:userId rejects matching yourself', () => {
  const block = routeBlock('/api/smart-matches/:userId');
  assert.ok(block.includes("targetUserId === req.userId"));
});
test('computeSmartMatches excludes blocked users via the existing getBlockedUserIdSet helper', () => {
  const idx = serverSrc.indexOf('async function computeSmartMatches(req');
  const block = serverSrc.slice(idx, idx + 3000);
  assert.ok(block.includes('getBlockedUserIdSet(req.userId)'));
});
test('computeSmartMatches only returns discoverable=true profiles (reuses the existing privacy control)', () => {
  const idx = serverSrc.indexOf('async function computeSmartMatches(req');
  const block = serverSrc.slice(idx, idx + 3000);
  assert.ok(block.includes("eq('discoverable', true)"));
});
test('smartMatchCardSummary never returns notes/description (private fields)', () => {
  const idx = serverSrc.indexOf('function smartMatchCardSummary(card)');
  const block = serverSrc.slice(idx, idx + 400);
  assert.ok(!block.includes('notes'));
  assert.ok(!block.includes('description'));
});
test('no new RLS/SQL/migration statements were added alongside Smart Matching (V1 architecture decision)', () => {
  const idx = serverSrc.indexOf('SMART MATCHING (V1)');
  const block = serverSrc.slice(idx, idx + 2000);
  assert.ok(!/CREATE (TABLE|POLICY|FUNCTION)|ALTER TABLE|DROP (TABLE|POLICY)/i.test(block));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
