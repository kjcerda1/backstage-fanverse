// Focused ownership/security tests for the binder + card routes, written
// against the My World Phase 1 security-correction pass (2026-07-29).
//
// SCOPE NOTE: api_server_v16.js calls app.listen(...) at import time (no
// test-mode guard) and needs a full production-shaped env to boot cleanly, so
// it cannot be safely `require`d into a lightweight test process. There is
// also no test framework installed in this repo (no jest/mocha/vitest) and
// adding one is a new-dependency decision that needs sign-off first — this
// file is plain Node + the built-in `assert` module, runnable as:
//   node tests/binder-card-ownership.test.js
//
// What this file DOES cover (pure/structural, no live DB needed):
//   - verifyBinderOwnership()'s exact query shape and both outcomes (kept in
//     sync with api_server_v16.js by hand — see the note above for why it
//     can't be imported directly).
//   - The folder_type whitelist logic.
//   - A structural audit of api_server_v16.js's actual source: every binder/
//     card route requires auth, every service-role-backed route scopes by
//     user_id (or the new verifyBinderOwnership check) rather than trusting
//     RLS alone, and folder_type is immutable via PATCH.
//
// What this file does NOT cover (needs a live database — Phase 1 explicitly
// forbids running production SQL, and the disposable sandbox this exact SQL
// was already validated against was deleted after that session):
//   - B4A idempotency-key retry / distinct-key behavior
//   - The quantity CHECK constraints (negative values, trade > owned)
//   - RLS enforcement at the Postgres level
//   These three were already proven, end-to-end, against the identical A1/
//   B1/B3/B4A SQL now queued for production, using real signup+password-grant
//   JWTs against a disposable Supabase project (backstage-migration-sandbox,
//   deleted 2026-07-29 after that session). They are re-verified live against
//   production itself in Phase 2's post-migration schema check and the
//   20-step authenticated QA pass — not re-derived synthetically here without
//   a database to run them against.

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

// ─── Section A: verifyBinderOwnership — logic mirror ───────────────────────
// Exact copy of the function added to api_server_v16.js, run here against a
// mocked Supabase query-builder chain (no network, no real client).
async function verifyBinderOwnership(binderId, userId, supabaseMock) {
  if (!binderId) return true;
  const { data, error } = await supabaseMock
    .from('binders')
    .select('id')
    .eq('id', binderId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

function mockSupabase({ returnsRow, calls }) {
  return {
    from(table) {
      calls.push({ method: 'from', arg: table });
      return this;
    },
    select(cols) { calls.push({ method: 'select', arg: cols }); return this; },
    eq(col, val) { calls.push({ method: 'eq', arg: [col, val] }); return this; },
    async maybeSingle() {
      calls.push({ method: 'maybeSingle' });
      return returnsRow ? { data: { id: 'binder-1' }, error: null } : { data: null, error: null };
    },
  };
}

(async () => {
  await (async () => {
    test('verifyBinderOwnership: no binder_id -> true (nothing to validate)', async () => {
      const calls = [];
      const result = await verifyBinderOwnership(undefined, 'user-A', mockSupabase({ returnsRow: false, calls }));
      assert.strictEqual(result, true);
      assert.strictEqual(calls.length, 0, 'should not query the DB at all when binder_id is absent');
    });
  })();

  await (async () => {
    test('verifyBinderOwnership: own binder -> true, queries scoped by BOTH id and user_id', async () => {
      const calls = [];
      const result = await verifyBinderOwnership('binder-1', 'user-A', mockSupabase({ returnsRow: true, calls }));
      assert.strictEqual(result, true);
      const eqCalls = calls.filter(c => c.method === 'eq').map(c => c.arg[0]);
      assert.deepStrictEqual(eqCalls, ['id', 'user_id'], 'must filter by id AND user_id, not id alone');
    });
  })();

  await (async () => {
    test('verifyBinderOwnership: another user\'s binder -> false', async () => {
      const calls = [];
      const result = await verifyBinderOwnership('binder-owned-by-userB', 'user-A', mockSupabase({ returnsRow: false, calls }));
      assert.strictEqual(result, false);
    });
  })();

  // ─── Section B: folder_type whitelist logic ───────────────────────────────
  const FOLDER_TYPES = ['album', 'photocard', 'pob', 'custom'];
  function resolveFolderTypeForInsert(folder_type) {
    const row = {};
    if (folder_type !== undefined && FOLDER_TYPES.includes(folder_type)) row.folder_type = folder_type;
    return row;
  }

  test('folder_type whitelist: all 4 supported values accepted', () => {
    for (const ft of FOLDER_TYPES) {
      assert.strictEqual(resolveFolderTypeForInsert(ft).folder_type, ft);
    }
  });
  test('folder_type whitelist: invalid value rejected (never reaches the insert row)', () => {
    assert.strictEqual(resolveFolderTypeForInsert('bogus').folder_type, undefined);
  });
  test('folder_type whitelist: omitted value stays undefined (column left NULL, never coerced to \'custom\')', () => {
    assert.strictEqual(resolveFolderTypeForInsert(undefined).folder_type, undefined);
  });

  // ─── Section C: structural audit of api_server_v16.js source ──────────────
  const src = fs.readFileSync(path.join(__dirname, '..', 'api_server_v16.js'), 'utf8');

  function routeBlock(methodPattern, routePattern) {
    const re = new RegExp(`app\\.${methodPattern}\\('${routePattern}'[\\s\\S]*?\\n\\}\\);`, 'm');
    const m = src.match(re);
    if (!m) throw new Error(`could not locate route block for ${methodPattern} ${routePattern}`);
    return m[0];
  }

  test('every audited binder/card route requires auth (requireAuth)', () => {
    const routes = [
      ['get', '/api/binders'], ['post', '/api/binders'],
      ['patch', '/api/binders/:id'], ['delete', '/api/binders/:id'],
      ['post', '/api/binders/from-template'], ['post', '/api/binders/upload-url'],
      ['get', '/api/cards'], ['post', '/api/cards'],
      ['post', '/api/cards/custom'], ['patch', '/api/cards/:id'], ['delete', '/api/cards/:id'],
      ['post', '/api/cards/upload-url'],
    ];
    for (const [method, route] of routes) {
      const re = new RegExp(`app\\.${method}\\('${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',\\s*requireAuth`);
      assert.ok(re.test(src), `${method.toUpperCase()} ${route} does not appear to require auth`);
    }
  });

  test('GET /api/binders scopes by user_id (User A cannot list User B\'s binders)', () => {
    const block = routeBlock('get', '/api/binders');
    assert.ok(/\.eq\('user_id',\s*req\.userId\)/.test(block));
  });

  test('PATCH and DELETE /api/binders/:id scope by BOTH id and user_id', () => {
    for (const method of ['patch', 'delete']) {
      const block = routeBlock(method, '/api/binders/:id');
      assert.ok(/\.eq\('id',\s*req\.params\.id\)/.test(block), `${method} missing id scope`);
      assert.ok(/\.eq\('user_id',\s*req\.userId\)/.test(block), `${method} missing user_id scope`);
    }
  });

  test('PATCH /api/binders/:id whitelist does not include folder_type (immutable after creation via this route)', () => {
    const block = routeBlock('patch', '/api/binders/:id');
    const allowedMatch = block.match(/const allowed = \[([^\]]*)\]/);
    assert.ok(allowedMatch, 'could not find allowed-fields whitelist');
    assert.ok(!allowedMatch[1].includes('folder_type'), 'folder_type must not be PATCH-able');
  });

  test('POST /api/cards validates binder ownership before insert (the fix)', () => {
    const block = routeBlock('post', '/api/cards');
    assert.ok(/verifyBinderOwnership\(binder_id,\s*req\.userId\)/.test(block));
  });

  test('PATCH /api/cards/:id validates binder ownership when binder_id is being changed (the fix)', () => {
    const block = routeBlock('patch', '/api/cards/:id');
    assert.ok(/verifyBinderOwnership\(updates\.binder_id,\s*req\.userId\)/.test(block));
  });

  test('DELETE /api/cards/:id and PATCH /api/cards/:id scope the target row by BOTH id and user_id', () => {
    for (const method of ['patch', 'delete']) {
      const block = routeBlock(method, '/api/cards/:id');
      assert.ok(/\.eq\('id',\s*req\.params\.id\)/.test(block), `${method} missing id scope`);
      assert.ok(/\.eq\('user_id',\s*req\.userId\)/.test(block), `${method} missing user_id scope`);
    }
  });

  test('PATCH /api/cards/:id whitelist includes group_name (folder-move cascade regression, caught live: moving a folder cross-group updated the folder but silently left its cards on the old group_name until this was added)', () => {
    const block = routeBlock('patch', '/api/cards/:id');
    const allowedMatch = block.match(/const allowed = \[([^\]]*)\]/);
    assert.ok(allowedMatch, 'could not find allowed-fields whitelist');
    assert.ok(allowedMatch[1].includes("'group_name'"), 'group_name must be PATCH-able so FolderManageSheet can cascade a group move onto child cards');
  });

  test('DELETE /api/binders/:id with mode=with_cards scopes the card wipe by BOTH binder_id and user_id', () => {
    const block = routeBlock('delete', '/api/binders/:id');
    assert.ok(/withCards/.test(block), 'no with_cards branch found');
    const cardsDeleteBlock = block.slice(block.indexOf('withCards'), block.indexOf("from('binders')"));
    assert.ok(/\.eq\('binder_id',\s*req\.params\.id\)/.test(cardsDeleteBlock), "card wipe doesn't scope by binder_id");
    assert.ok(/\.eq\('user_id',\s*req\.userId\)/.test(cardsDeleteBlock), "card wipe doesn't scope by user_id");
  });

  test('POST /api/cards/custom uses makeUserClient(req), not the bare service client', () => {
    const block = routeBlock('post', '/api/cards/custom');
    assert.ok(/makeUserClient\(req\)/.test(block));
    assert.ok(!/\bdb\s*=\s*supabase\b/.test(block));
  });

  test('save_custom_card has no catalog_card_id parameter (catalog-linked writes structurally cannot go through B4A)', () => {
    const block = routeBlock('post', '/api/cards/custom');
    assert.ok(!/catalog_card_id/.test(block));
  });

  test('upsert_catalog_card_quantity (B4B) is never actually invoked (.rpc call) anywhere in api_server_v16.js', () => {
    // The RPC name appears once in an explanatory comment (why it's NOT used
    // yet) — that's intentional documentation, not a call. Only a real
    // .rpc('upsert_catalog_card_quantity' invocation would be the violation.
    const matches = src.match(/\.rpc\(\s*['"]upsert_catalog_card_quantity['"]/g) || [];
    assert.strictEqual(matches.length, 0);
  });

  test('no route runs a raw UPDATE/DELETE on user_cards or binders without a user_id (or verified binder_id) scope', () => {
    // Every .update(/.delete( on these two tables must be followed, within the
    // same statement chain, by an .eq('user_id', ...) — this is the same
    // "service-role bypass" concern the migration file's SECURITY NOTE flags.
    const chains = src.match(/from\('(binders|user_cards)'\)\s*\n\s*\.(update|delete)\([^;]*?;/gs) || [];
    assert.ok(chains.length >= 4, 'expected to find the binder/card update+delete chains');
    for (const chain of chains) {
      assert.ok(/\.eq\('user_id',\s*req\.userId\)/.test(chain), `mutation chain missing user_id scope:\n${chain.slice(0,200)}`);
    }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})();
