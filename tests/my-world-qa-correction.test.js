// Structural regression tests for the My World QA-correction pass (2026-07).
// Same discipline as tests/binder-card-ownership.test.js: plain Node + assert,
// no framework, source-text audits rather than a live server/DB — run with:
//   node tests/my-world-qa-correction.test.js
//
// Covers:
//   1. The unscoped "So close! N cards away" claim (finding E — a raw global
//      wishlist count with no verified catalog scope or user checklist behind
//      it) cannot quietly come back without a corresponding scoped rewrite.
//   2. The decommissioned Era Room entry points (finding D) stay closed —
//      the My World cross-link, the Tools "Eras Explorer" tool card, and the
//      BinderDetail "linked Era Room" banner.
//   3. AddCardForm's duplicate-folder normalization strips punctuation, not
//      just casing/whitespace — caught live against real Supabase data: typing
//      "aespa my world" failed to suggest the existing folder "aespa — MY
//      WORLD" because a plain .trim().toLowerCase() left the em dash in place.
// (The new DELETE /api/binders/:id?mode=with_cards destructive path is
// already covered generically by tests/binder-card-ownership.test.js's
// "no route runs a raw UPDATE/DELETE ... without a user_id scope" check.)

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); fail++; }
}

// ── "So Close" stays removed until re-grounded ──────────────────────────────
check('unscoped "So close!" claim is not present in the frontend', () => {
  assert.ok(!/So close!/.test(frontendSrc), 'found "So close!" — re-check it is grounded in a verified scope before re-adding');
});

// ── Era Room surfaces stay decommissioned ───────────────────────────────────
check('My World "You have N Era Rooms" cross-link is gone', () => {
  assert.ok(!/You have \{eraBoards\.length\} Era Room/.test(frontendSrc));
});

check('Tools tab "Eras Explorer" launcher card is gone from TOOL_CARDS', () => {
  const m = frontendSrc.match(/const TOOL_CARDS = \[[\s\S]*?\];/);
  assert.ok(m, 'TOOL_CARDS array not found');
  assert.ok(!/id:"eras"/.test(m[0]), 'Eras Explorer entry still present in TOOL_CARDS');
});

check('BinderDetail no longer renders a "linked Era Room" banner', () => {
  const start = frontendSrc.indexOf('function BinderDetail(');
  const end = frontendSrc.indexOf('\nfunction ', start + 10);
  const body = frontendSrc.slice(start, end === -1 ? undefined : end);
  assert.ok(!/linkedEraBoard/.test(body), 'linkedEraBoard still referenced inside BinderDetail');
});

// ── Add Card duplicate-folder normalization strips punctuation ─────────────
check('AddCardForm norm() strips punctuation (em dash, etc.), not just casing/whitespace', () => {
  const start = frontendSrc.indexOf('function AddCardForm(');
  const end = frontendSrc.indexOf('\nfunction ', start + 10);
  const body = frontendSrc.slice(start, end === -1 ? undefined : end);
  const m = body.match(/const norm = s => \(([\s\S]*?)\);/);
  assert.ok(m, 'norm() definition not found in AddCardForm');
  assert.ok(/replace\(\/\[\^a-z0-9\]\+\/g/.test(m[0]), 'norm() no longer strips non-alphanumeric characters');
  // Mirror the exact expression and prove it on the real case that broke live:
  // "aespa — MY WORLD" (existing folder name) vs "aespa my world" (typed text)
  // must normalize identically despite the em dash.
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  assert.strictEqual(norm('aespa — MY WORLD'), norm('aespa my world'));
});

// ── Collision-reservation: CardDetailSheet / FolderManageSheet clear the
// bottom nav's stacking-context trap ────────────────────────────────────────
// Confirmed live via Preview + elementFromPoint: .bs-bottom-nav sits at
// z-index:100 in its own ancestor's stacking context, and CardDetailSheet's
// z-index:420 is capped by an ancestor with z-index:1 — so bumping the
// sheet's own z-index cannot win. The only reliable fix is enough bottom
// padding that no actionable content ever renders in the nav's screen band.
check('CardDetailSheet reserves bottom-nav clearance (not just the original 36px)', () => {
  const start = frontendSrc.indexOf('function CardDetailSheet(');
  const end = frontendSrc.indexOf('\nfunction ', start + 10);
  const body = frontendSrc.slice(start, end === -1 ? undefined : end);
  assert.ok(/padding:"22px 20px calc\(100px \+ env\(safe-area-inset-bottom\)\)"/.test(body));
});

check('FolderManageSheet reserves bottom-nav clearance (not just the original 28px)', () => {
  const start = frontendSrc.indexOf('function FolderManageSheet(');
  const end = frontendSrc.indexOf('\nfunction ', start + 10);
  const body = frontendSrc.slice(start, end === -1 ? undefined : end);
  assert.ok(/padding:"18px 20px calc\(100px \+ env\(safe-area-inset-bottom\)\)"/.test(body));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
