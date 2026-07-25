# CLAUDE.md — Backstage / Fanverse operating guide

Repo-local rules for any Claude session working in this repo. Follow them exactly; they exist to keep sessions cheap, safe, and behavior-preserving.

## Project identity

**Backstage** (also **Fanverse**) — a mobile-first, single-page **React + Vite PWA** for K-pop concert-goers and fandom. Frontend is a client-rendered SPA (custom `go()` / modal-stack navigation, no router library). Backend is a single Express server (`api_server_v16.js`). Data + auth via Supabase; payments via Stripe; push via Firebase; maps via Mapbox.

## Mandatory session preflight

Before starting **any** coding, editing, merge, QA, or deployment task, Claude must do this **automatically, without being reminded**:

1. **Confirm current branch and worktree:**
   - `git branch --show-current`
   - `git status --short`
   - `git worktree list` if multiple worktrees may be involved

2. **Fetch latest remote state:**
   - `git fetch origin`

3. **Confirm whether local `main` is behind `origin/main`:**
   - Compare local `main` to `origin/main`.
   - If local `main` is behind and can be safely fast-forwarded, sync it before creating new branches or starting work.
   - If `main` is checked out in another worktree or cannot be safely updated, **stop and report** instead of guessing.

4. **Before creating any new feature branch:**
   - Start from latest `origin/main` or a verified up-to-date local `main`.
   - Confirm the base commit.

5. **Never start coding from a stale branch** unless the user explicitly approves it.

6. **Never overwrite, reset, clean, or delete untracked user files** without explicit approval.

7. **If there are uncommitted changes or untracked folders, report them clearly and ask** before touching anything.

### Start-of-task checklist

- [ ] Read PROJECT_MAP.md
- [ ] Read CURRENT_STATE.md
- [ ] Check branch / status
- [ ] Fetch origin
- [ ] Confirm latest `main`
- [ ] Then start the requested task

## Read first, in this order

1. **PROJECT_MAP.md** — where every feature lives + line anchors into App.jsx
2. **CURRENT_STATE.md** — what is actually shipped right now
3. **PROJECT_OVERVIEW.md** — durable architecture

Read those before opening source. They are usually enough to plan a change.

## Context discipline (this is the point of this file)

- **Never read all of `src/App.jsx`.** It is ~26,000+ lines / ~2 MB. A full read wastes ~½ million tokens. Read it whole *only* if the user explicitly asks.
- **Use PROJECT_MAP.md line anchors.** Find the feature → confirm with `grep -n "function TheComponent" src/App.jsx` → read only that bounded slice.
- **Prefer the small support files.** Shared logic already lives in `src/lib/`, `src/data/`, `src/components/`. Read those directly instead of digging through App.jsx.
- **`api_server_v16.js` too** (~6,400 lines): jump to the relevant section per PROJECT_MAP, don't read it end-to-end.
- **Do not read unless a task truly needs it:** `package-lock.json`, images (`*.png`, `backstage pics/`, `public/*.png`), `dist/`, `node_modules/`, `.claude/` scratch apps (e.g. `.claude/backstage-app/`), and any `.env*` file.

## Secrets

- **Never read, print, echo, or paste the contents of `.env` or any secret/key.** `.env` is gitignored and stays that way.
- Never expose API keys, tokens, or credentials in code, output, commits, or docs. Reference env var **names** only (e.g. `VITE_SUPABASE_URL`), never values.

## Guardrails — never touch

- `src/App_backup_*.jsx` (backups — use git history instead)
- `dist/` (build output)
- `.env` (secrets)
- **Backend port is 3001**, never 3000.

## Workflow

- **Branch for every code change.** Create a feature branch off `main`; never commit code changes straight to `main`.
- **One focused task per branch.** Don't bundle unrelated changes.
- **`npm run build` must pass before you report a task done.** Report the result honestly; if it fails, say so with the output.
- **UI changes: browser-check both themes** — verify in **Pearl Mode** (light) *and* **Concert / Dark Mode**. A change that only works in one theme is not done.
- **Small commits.** Prefer small, reviewable commits and **stop and report at meaningful checkpoints** rather than running long unattended.
- **Do not commit or push unless asked.** Wait for an explicit "ready to push" before pushing.

## Requires explicit approval first

- **Backend or database/schema changes** (`api_server_v16.js`, `supabase-*-migration.sql`, any migration or table change) — get explicit approval before writing.
- **New dependencies** — never add a package without asking first; justify why an existing tool won't do.

## Scope

- **Do not overbuild.** Implement the smallest correct change for the task at hand.
- **Preserve current behavior** unless the task explicitly asks to change it. No opportunistic rewrites, no "while I'm here" refactors, no rebuilds from scratch — fix in place.
- If you spot a real issue outside the task, name it once; don't silently fix it.
