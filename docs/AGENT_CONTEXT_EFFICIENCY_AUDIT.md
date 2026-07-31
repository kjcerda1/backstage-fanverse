# Agent Context-Efficiency Audit

*One-time diagnostic, not routine reading. Explains **why** Backstage sessions burn context/plan usage, category by category. For **where things live**, use `PROJECT_MAP.md`. For **what's shipped**, use `CURRENT_STATE.md`. This doc does not duplicate either.*

**Snapshot date:** 2026-07-31. **Base:** `main` @ `471f515` (clean, matches `origin/main`).

Method: file statistics, targeted `grep` counts, and doc header peeks only. Neither `src/App.jsx` (27,671 lines) nor `api_server_v16.js` (6,662 lines) was read beyond `grep -c` counts — **0 targeted ranges opened**, only declaration/occurrence counts.

---

## 1. Startup tax — MEDIUM (context window)

**Evidence:** Every session auto-loads two global `CLAUDE.md` files (user-private "Pip" persona + `Projects/CLAUDE.md`) plus this repo's `CLAUDE.md` (91 lines) plus the auto-memory `MEMORY.md` index (~25 pointer lines). The user's global file also names `pip-context.md` as *"the single source of truth"* for git state/stack/phase — a claim that overlaps with this repo's own `CURRENT_STATE.md`/`PROJECT_OVERVIEW.md`, which make the same "source of truth" claim for the same information. Neither file defers to the other explicitly.
**Impact:** context window (fixed per-session cost, paid before any work starts).
**Immediate mitigation:** none needed for this repo — global files are outside its scope.
**Structural mitigation:** if `pip-context.md` and `CURRENT_STATE.md` genuinely both track live project state, pick one authority and have the other link to it, out of scope for this branch (`pip-context.md` lives outside this repo).
**Measurement:** line count of auto-loaded files (already fixed and small; not the dominant cost here).

## 2. Monolith tax — HIGH (context window)

**Evidence:** `src/App.jsx` = 27,671 lines / 2.09 MB, **171 top-level `function` declarations**, **725 `useState(` calls**, single `AppInner` root owning nav/modal-stack state referenced 10x across the file. No `components/` dir, no router. Three separate docs disagree on the component count (`PROJECT_MAP.md`: "~238", `PROJECT_OVERVIEW.md`: "~150", `CURRENT_STATE.md`: "146") — none match the actual 171, i.e. all three are stale in different directions.
**Impact:** both context window (any full/broad read is ~½M tokens) and plan usage (every narrow fix risks touching a 27k-line file).
**Immediate mitigation:** already largely in place — `PROJECT_MAP.md` line-anchor table + explicit "don't read whole file" instruction in `CLAUDE.md`.
**Structural mitigation:** extract dependency-light, single-responsibility slices (candidates identified, not yet extracted — see future extraction plan). Do not attempt in this phase.
**Measurement:** `wc -l src/App.jsx` before/after each extraction; component-count drift between docs and `grep -c "^function " src/App.jsx`.

## 3. Discovery tax — MEDIUM (context window + plan usage)

**Evidence:** `localStorage`/storage-helper usage appears at **69 call sites** in `App.jsx` rather than behind one module boundary, meaning "what localStorage keys exist" is a recurring grep rather than a one-file lookup. Positive counter-evidence: My World specifically already has a disciplined 3-doc research trail (`MY_WORLD_AUDIT.md`, `MY_WORLD_CATALOG_RESEARCH.md`, `MY_WORLD_CATALOG_COVERAGE_SPEC.md`) that cross-links via `[[name]]` refs and status labels instead of re-deriving from scratch each time.
**Impact:** mostly plan usage (repeated search cycles per session).
**Immediate mitigation:** none required — pattern already used for My World should be the template for other features.
**Structural mitigation:** a single `src/lib/storage.js` key registry (already exists per `PROJECT_MAP.md` — verify all 69 call sites route through it rather than raw `localStorage.*`) would collapse discovery to one file.
**Measurement:** ratio of raw `localStorage` calls vs. calls through `src/lib/storage.js`.

## 4. Git tax — HIGH (plan usage)

**Evidence:** `git worktree list` = **13 active worktrees**; `git branch -a` = **52 branches**. Several worktrees sit on branches already merged to `main` at the same HEAD (`471f515`) as this one, and worktree directory names don't always match their checked-out branch (e.g. this session's worktree `thread-scroll-keyboard-877177` → branch `claude/backstage-context-efficiency-5aebc8`).
**Impact:** plan usage (every session preflight has more state to disambiguate) and occasional context window (if an agent lists branches/worktrees verbosely instead of with counts).
**Immediate mitigation:** none taken this phase per instructions (no worktree/branch deletion without approval).
**Structural mitigation:** a periodic (user-approved) sweep to remove worktrees whose branch is already merged and idle; naming convention so worktree dir name = branch slug.
**Measurement:** `git worktree list | wc -l` and `git branch -a --merged main | wc -l` over time.

## 5. Tool-output tax — MEDIUM (context window)

**Evidence:** structural risk rather than an observed incident this session — an unbounded `grep` or `cat` over `App.jsx` (2.09 MB) or a full `npm run build` log would each be large enough to dominate a turn. This session avoided both (counts/heads only).
**Impact:** context window, spiky rather than constant.
**Immediate mitigation:** already-standing practice (this session): redirect/summarize instead of pasting.
**Structural mitigation:** none needed beyond continued discipline; could add a repo note in `CLAUDE.md` reminding agents to pipe large command output to a file (not yet present, low priority since the practice is already followed here).
**Measurement:** none numeric — track only via spot-check of session transcripts.

## 6. Validation tax — LOW-MEDIUM (plan usage)

**Evidence:** `package.json` scripts are `dev`, `build`, `preview`, `start` — **no `test` script**, despite two files existing under `tests/` (`binder-card-ownership.test.js`, `my-world-qa-correction.test.js`). Without a scripted entry point, running those narrow tests requires an agent to first rediscover how to invoke them.
**Impact:** plan usage (rediscovery cost) more than context window.
**Immediate mitigation:** none this phase (no source/config changes).
**Structural mitigation:** add a `test` script pointing at the existing two files, so narrow validation doesn't default to a full `npm run build`.
**Measurement:** whether future narrow-fix sessions run `npm run build` when a targeted test would have sufficed.

## 7. Reporting tax — LOW (context window)

**Evidence:** `NEXT_PHASE_HANDOFF.md` is dated 2026-05-21 at commit `81e5c17`, ~2 months and ~100+ commits behind current `main` — but `PROJECT_MAP.md` and `CURRENT_STATE.md` both already flag it explicitly as stale/"don't treat as current." The three My World docs (§3) are the counter-example of doing this well: dated, status-labeled, cross-linked, not re-summarizing each other.
**Impact:** context window, low — the stale doc is already quarantined by working docs pointing away from it.
**Immediate mitigation:** none needed — self-aware staleness flag already exists.
**Structural mitigation:** none required this phase; if `NEXT_PHASE_HANDOFF.md` is never going to be current again, retiring it is a future low-risk cleanup candidate, not part of this phase's scope.
**Measurement:** count of docs with an explicit "may be stale" flag vs. without one.

## 8. Parallel-session tax — HIGH (plan usage)

**Evidence:** 13 worktrees (see §4) plus an existing memory record (`feedback-parallel-sessions.md`) already documents that the user runs 2+ Claude/Codex sessions concurrently and that `main` can move mid-session. This session confirmed local `main` == `origin/main` == this worktree's HEAD at start, so no drift was hit this run — but the structural exposure (many concurrent worktrees) is real and already known.
**Impact:** plan usage — every session must re-verify base state rather than trusting it.
**Immediate mitigation:** already-standing practice: this session fetched origin and diffed HEADs before starting (per repo's mandatory preflight).
**Structural mitigation:** none new; existing preflight checklist in `CLAUDE.md` already covers this correctly.
**Measurement:** frequency of sessions that discover `main` moved since their worktree was created.

## 9. Instruction-conflict tax — LOW (context window)

**Evidence:** scanned all 11 root `.md` files for legacy phrases ("read the complete/entire/whole/full App", "generate a new full versioned", "deliver complete source files", "do not restructure") — **zero matches**. `.claude/` has no scattered instruction `.md` files outside the disposable `backstage-app/` scratch app and other worktrees. The one live tension is the `pip-context.md` vs. `CURRENT_STATE.md` "source of truth" overlap noted in §1.
**Impact:** context window, low — no active conflicting instructions found in this repo.
**Immediate mitigation:** none needed.
**Structural mitigation:** none needed this phase.
**Measurement:** re-run the same phrase grep periodically as new docs are added.

---

## Summary table

| # | Category | Severity | Primary impact |
|---|---|---|---|
| 1 | Startup tax | Medium | context window |
| 2 | Monolith tax | High | context window + plan usage |
| 3 | Discovery tax | Medium | context window + plan usage |
| 4 | Git tax | High | plan usage |
| 5 | Tool-output tax | Medium | context window |
| 6 | Validation tax | Low-Medium | plan usage |
| 7 | Reporting tax | Low | context window |
| 8 | Parallel-session tax | High | plan usage |
| 9 | Instruction-conflict tax | Low | context window |

**Top structural takeaway:** the navigation infrastructure this brief asked for (`PROJECT_MAP.md`, `CURRENT_STATE.md`, `PROJECT_OVERVIEW.md`, the `CLAUDE.md` rule against full-file reads) **already exists and is not the bottleneck**. The two highest-severity categories — monolith tax and git/parallel-session tax — are architectural (one 27k-line file; 13 live worktrees) and require actual extraction/cleanup work, not more documentation, to move.
