// Structural regression tests for the My World QA-correction pass (2026-07).
// Same discipline as tests/binder-card-ownership.test.js: plain Node + assert,
// no framework, source-text audits rather than a live server/DB — run with:
//   node tests/my-world-qa-correction.test.js
//
// Covers two things that must never silently regress:
//   1. The unscoped "So close! N cards away" claim (finding E — a raw global
//      wishlist count with no verified catalog scope or user checklist behind
//      it) cannot quietly come back without a corresponding scoped rewrite.
//   2. The decommissioned Era Room entry points (finding D) stay closed —
//      the My World cross-link, the Tools "Eras Explorer" tool card, and the
//      BinderDetail "linked Era Room" banner.
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
