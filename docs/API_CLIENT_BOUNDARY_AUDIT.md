# API Client Boundary Audit

Audit-only pass over the stateful `api` singleton in `src/App.jsx`. No code was moved, no behavior was changed. Base commit: `bab016e` (origin/main, confirmed at HEAD of this audit).

## 1. The `api` singleton

Defined at [src/App.jsx:58-125](src/App.jsx:58). Plain object literal, not a class/factory — a true module-level singleton, one instance for the whole app.

```
const api = {
  _token: null,
  _refreshing: null,
  _setToken(t) { ... },
  _headers() { ... },
  async _refreshToken() { ... },   // uses module-scope _supabase
  async post(path, body) { ... },
  async get(path) { ... },
  async patch(path, body) { ... },
  async del(path, body) { ... },
};
```

Shape:
- **Mutable state**: `_token` (current access token, set via `_setToken`), `_refreshing` (in-flight refresh promise, dedupes concurrent 401s).
- **Every verb method** builds `${API_URL}${path}`, attaches `_headers()` (Bearer token if present), and on a `401` calls `_refreshToken()` once and retries exactly once before giving up.
- **Response parsing** goes through the module-level `parseApiResponse()` helper ([src/App.jsx:47](src/App.jsx:47)), which never throws — non-OK / non-JSON bodies resolve to `{ error }` (or `{ mock:true, error }` for `post`) instead of rejecting. This is deliberate: a dev/preview host with no `/api` proxy can 200 the Vite HTML shell, and `.json()` on that would otherwise reject outside the caller's try/catch.

## 2. Module-scope dependencies (what an extraction has to carry or inject)

`api` is not self-contained. It closes over three things declared earlier in the same module scope:

| Dependency | Declared at | Used for |
|---|---|---|
| `API_URL` | [src/App.jsx:36](src/App.jsx:36) — `import.meta.env.VITE_API_URL \|\| ""` | Base URL for every request |
| `_supabase` | [src/App.jsx:402](src/App.jsx:402) — `createClient(...)`, `null` if `MOCK_AUTH` | `_refreshToken()` calls `_supabase.auth.refreshSession()` |
| `parseApiResponse` | [src/App.jsx:47](src/App.jsx:47) | Response normalization for all 4 verbs |

`MOCK_AUTH` ([src/App.jsx:399](src/App.jsx:399)) itself is derived from `SUPABASE_URL`/`SUPABASE_ANON`/`SUPABASE_CONFIG_ERROR`, computed a few lines above `_supabase`. `api` doesn't read `MOCK_AUTH` directly, but `_supabase` is `null` under `MOCK_AUTH`, and `_refreshToken()` guards on `if (!_supabase) return false` — so `api` behaves correctly in mock mode without knowing about the flag.

**Token lifecycle is owned entirely outside `api`.** `api` only stores whatever token it's handed via `_setToken`/reads via `_token`. The write side lives in `AuthProvider` ([src/App.jsx:411](src/App.jsx:411)) and a couple of one-off auth flows:

| Call site | Context |
|---|---|
| [src/App.jsx:447](src/App.jsx:447) | `AuthProvider` boot — `getSession()` resolves with existing session |
| [src/App.jsx:475](src/App.jsx:475) | `AuthProvider` — `onAuthStateChange` handler, session present |
| [src/App.jsx:514](src/App.jsx:514) | `onAuthStateChange` — `SIGNED_OUT` → `_setToken(null)` |
| [src/App.jsx:521](src/App.jsx:521) | `onAuthStateChange` — `TOKEN_REFRESH_FAILED` → `_setToken(null)` + full local sign-out |
| [src/App.jsx:3569](src/App.jsx:3569) | Sign-in screen `handleSignIn` — sets token immediately post sign-in so the very next `api.get('/api/users/me')` in the same function is authenticated ahead of the async `onAuthStateChange` listener |

There's also a **passive recovery path**: [src/App.jsx:324-330](src/App.jsx:324) (inside the fan-search helper) checks `if (!api._token && _supabase)`, pulls `_supabase.auth.getSession()` directly, and calls `api._setToken(...)` inline if a session turns up — a defensive patch for a token that should be set but transiently isn't (cold boot / race), independent of `AuthProvider`'s own effect.

Net: any extraction of `api` into its own module must either (a) also own `_supabase`/`API_URL`, or (b) accept them as constructor/init params and have `AuthProvider` (and the two other call sites above) call into the extracted module's `setToken`/token-recovery entry points instead of touching internal fields directly.

## 3. Call-site inventory

**169** call sites of `api.get/post/patch/del(...)` across `src/App.jsx`, touching essentially every feature area in PROJECT_MAP.md — auth/profile, meetups, photocards/binders/trade, feed/social, friends/circle, DMs, moderation admin, music connect, subscriptions/VIP, referrals, notifications, GIF search, capsule/memories. This is not a narrow or peripheral dependency — it is the app's only sanctioned path to the backend, called from nearly every top-level component in the file.

No other frontend file (`src/components/*.jsx`, `src/lib/*.js`, `src/data/*.js`, `src/MapboxMap.jsx`) references `api` — confirmed by grep; the three already-extracted modules (`Avatar.jsx`, `GifSystem.jsx`, `VipSystem.jsx`) were deliberately chosen in prior extractions specifically because they *don't* need it (PROJECT_MAP.md's extraction log notes `GifPicker` stayed in `App.jsx` for exactly this reason — it needs `api`, the rest of the GIF system didn't).

## 4. Direct-fetch bypasses (calls that skip the `api` wrapper)

Seven call sites construct `fetch(`${API_URL}...`)` directly instead of going through `api.get/post/patch/del`:

| Line | What | Why it bypasses `api` |
|---|---|---|
| [483](src/App.jsx:483) | `AuthProvider` — replay pending onboarding PATCH on `onAuthStateChange` | Needs the token from the just-received `session` object directly, not whatever `api._token` currently holds — avoids a race where `_setToken` hasn't been called yet in this tick |
| [3575](src/App.jsx:3575) | `handleSignIn` — same pending-patch replay, sign-in path | Same reason: uses `d.session.access_token` straight from the just-completed `signInWithPassword` call |
| [3731](src/App.jsx:3731) | (auth screen, near line 3729) — reads `_supabase.auth.getSession()` then raw `fetch` | Same pattern — freshly-fetched token, avoids relying on `api._token` timing |
| [16541](src/App.jsx:16541) | `useModeration().submitReport` | Uses `api._headers()` for the headers but calls `fetch` directly — likely just an oversight rather than a deliberate need, since `api.post` would work identically here |
| [16557](src/App.jsx:16557) | `useModeration().blockUser` | Same — `api._headers()` used, but raw `fetch` instead of `api.post` |
| [16570](src/App.jsx:16570) | `useModeration().unblockUser` | Same — raw `fetch` with `api._headers()`, `DELETE` |
| [26438](src/App.jsx:26438) | `handleUpgrade` (VIP checkout) | Manually reads `api._token` to build the `Authorization` header rather than calling `api.post` — no 401-retry/refresh behavior on this one call |

The three `useModeration` sites ([16541](src/App.jsx:16541), [16557](src/App.jsx:16557), [16570](src/App.jsx:16570)) are the cleanest candidates to fold into `api` unchanged — they already use `api._headers()`, just not the verb methods, so `api.post`/`api.del` would be a drop-in behavioral no-op (same headers, same URL construction) plus a free 401-retry they currently lack. The three auth-flow ones ([483](src/App.jsx:483), [3575](src/App.jsx:3575), [3731](src/App.jsx:3731)) are intentionally bypassing the stored `_token` in favor of a token that's fresher in that instant — any extraction should preserve that behavior rather than "fixing" it to use `api.patch`. The VIP checkout call ([26438](src/App.jsx:26438)) is a minor inconsistency (no retry-on-401) worth noting but out of scope to touch here.

## 5. A second, parallel client: direct `_supabase` access

Separately from `api` (which talks to `api_server_v16.js`), the frontend also calls the Supabase JS client **directly**, bypassing the Express backend entirely. This is a distinct dependency surface that any "extract the api client" effort needs to scope around, since it's a different boundary with different auth semantics (Supabase RLS instead of backend-checked Bearer tokens).

Two categories:

**a) Auth operations (expected, `_supabase.auth.*`)** — sign in/up/out, password reset/update, resend confirmation, `getSession`/`getUser`, `onAuthStateChange`. ~20 call sites, concentrated in `AuthProvider` ([src/App.jsx:411](src/App.jsx:411)) and the sign-in/account-settings screens (~lines 3552-4254, ~21010-21058). This is the expected shape — Supabase Auth is the auth provider, `_supabase.auth` is its SDK surface, and none of this goes through `api`.

**b) Direct table/storage/realtime access (not auth)** — bypasses `api_server_v16.js` for actual app data:

| Line | What |
|---|---|
| [25184](src/App.jsx:25184) | `_supabase.from('concert_memories').select(...)` — `ScrapbookDetail` loads memories straight from the table on mount |
| [25198](src/App.jsx:25198) | `_supabase.storage.from('memories').createSignedUrl(...)` — signs a display URL for a stored photo directly |
| [25310](src/App.jsx:25310) | `_supabase.from('concert_memories').insert(row)` — `saveMemory` inserts straight into the table |
| [26272](src/App.jsx:26272) | `_supabase.channel('social-${userId}')` + `.on('postgres_changes', ...)` — realtime subscription on `friend_requests`/`friends`/`notifications` tables, used to trigger `refreshSocial()` |

This means `ScrapbookDetail`'s memories feature has **two write paths for the same feature**: image bytes go through the backend (`api.post('/api/memories/upload-image', ...)`, line 25261) which returns a storage path, but the memory *row* itself is written directly to Postgres via the Supabase client, skipping `api_server_v16.js` and any server-side validation it might otherwise apply to that table. This is worth flagging as a real inconsistency (not something to fix in this audit), since it means RLS policies on `concert_memories` are the *only* enforcement for that table's writes — there's no backend route guarding it.

**c) Storage PUT bypasses (separate from `_supabase` and from `api`)** — six call sites do a raw `fetch(presign.signed_url, { method:'PUT', ... })` straight to a Supabase Storage signed URL obtained via `api.post(...upload-url, ...)`: [236](src/App.jsx:236), [5259](src/App.jsx:5259), [5764](src/App.jsx:5764), [8047](src/App.jsx:8047), [8350](src/App.jsx:8350), [8490](src/App.jsx:8490), [9217](src/App.jsx:9217). These aren't bypasses of `api` in a problematic sense — `api.post` can't carry binary body/`FormData` cleanly since every verb method does `JSON.stringify(body)` unconditionally, so the presign-then-PUT split is the correct shape given `api`'s current signature. Any extraction should preserve this two-step pattern rather than trying to fold the PUT into the client.

## 6. Recommended extraction architecture

Given the shape above, the safest path is a **thin module with injected dependencies**, not a static import of `_supabase`/`API_URL` into a new file:

1. **New file** `src/lib/apiClient.js` exporting a factory or a pre-built singleton that takes `API_URL` and a `getSupabaseClient()` accessor (or the `_supabase` instance itself) as constructor inputs, plus the existing `parseApiResponse` helper (move it alongside — it has no other dependents worth checking, but confirm before moving).
2. **Keep the object shape identical** (`_token`, `_refreshing`, `_setToken`, `_headers`, `_refreshToken`, `get`/`post`/`patch`/`del`) — this is a pure move, not a rewrite. 169 call sites means any signature change is 169 places to get right; don't take that risk in the same pass as the extraction.
3. **`App.jsx` imports the singleton instance** (`import { api } from "./lib/apiClient.js"`) exactly like it imports `ls` from `storage.js` today — same pattern as the three prior extractions, so `AuthProvider` and the sign-in flow keep calling `api._setToken(...)` on the same object, unchanged.
4. **Do not fold in the direct-fetch bypasses or the `_supabase` table/storage/realtime calls in the same commit.** They're separate concerns:
   - The 3 `useModeration` bypasses ([16541](src/App.jsx:16541)/[16557](src/App.jsx:16557)/[16570](src/App.jsx:16570)) are safe, small, separate follow-ups (swap to `api.post`/`api.del`) — but that's a behavior change (adds 401-retry), so it should be its own reviewed diff, not bundled into a pure-extraction PR.
   - The `concert_memories` direct-Postgres writes and the realtime channel are a different architectural layer (Supabase-direct vs backend-proxied) and moving them is a bigger, riskier conversation than this audit's scope.
5. **Verify after the move**: `npm run build`, then smoke-test both a `MOCK_AUTH` (no Supabase env) boot and a real-auth boot, since `_refreshToken()`'s `if (!_supabase) return false` guard is the one branch that's easy to break silently if `_supabase` isn't threaded through correctly.

This keeps the extraction itself to "cut 68 lines (47-125) + move 4 dependent lines (36, 402-408 need to stay in `App.jsx` since other code reads `API_URL`/`_supabase` directly too — see §2 and §5b) into a new file, update one import line" — the same low-risk template as `Avatar.jsx`/`GifSystem.jsx`/`VipSystem.jsx`, just gated on doing the dependency-injection wiring correctly since, unlike those three, `api` isn't standalone.

## 7. Explicitly out of scope for this audit (not touched, not evaluated further)

Avatar component, GIF-reaction presentational components, VIP/Founder/Upgrade UI, and the PROJECT_MAP.md/CURRENT_STATE.md doc refresh — all already extracted and live on `main` as of commits `e5d6e80`, `e3b8392`, `8026be6`, `bab016e`. Not re-audited.
