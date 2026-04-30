# tynn-lite — agent harness for the tynn workflow

**Purpose:** capture the operating model used by Claude Code in this workspace so it can be installed into other projects as a deployable agent harness. Distilled from the `temp_core` workspace's iterative-work mode, the standing-loop prompt patterns, the per-cycle file conventions, and the statusline signals that make session state visible.

> **Tynn vs tynn-lite:** **tynn** is the MCP service backed by a database (project state, stories, tasks, versions, VIP queue). **Tynn-lite** is the file-based fallback that uses Markdown frontmatter to track the same state when no MCP service is available. The *workflow shape* is canonical (story → task, status: backlog → starting → doing → testing → finished); the *storage* is pluggable. tynn-lite is what makes the workflow portable to any project's filesystem.

## When to use tynn-lite

- Any project where you want an agentic loop driving work to done without owner-attended attention
- Any project that doesn't (yet) have the tynn MCP service connected
- Any project that wants the *discipline* (slicing, per-commit learnings, indicator counts) without the database overhead
- As a fallback when tynn MCP is unreachable (network issues, owner offline)

The workflow stays the same regardless. Tynn-lite is the floor.

---

## The components (what gets installed by `--with-tynn`)

A complete tynn-lite installation provisions these primitives:

| Layer | Artifact | Purpose |
|-------|----------|---------|
| Standing prompt | `_plans/_next/loop-prompt.mdc` | Canonical text fired by `/loop` cron + `/next` slash; single source of truth for what the agent does each cycle |
| Slash command | `~/.claude/commands/next.md` | One-shot manual cycle advance (independent of cron) |
| State markers | `_plans/_next/checkpoint.mdc` | Last shipped, in-flight task, progress count, focus version, cycle log |
| State markers | `_plans/_next/pending-questions.mdc` | Owner-blocking questions with frontmatter-counted indicator types |
| State markers | `_plans/_next/answered-questions-log.mdc` | Append-only history of resolved questions |
| Agent learnings | `_discovery/learnings/{short-hash}.md` | Per-commit insights captured at each cycle close |
| Plan files | `_plans/<feature>/<doc>.md` | Multi-slice plans for big features (mockups, sliced delivery, owner answers) |
| Bash hook | `~/.claude/hooks/agi-bash-router.sh` | Optional: routes Bash tool calls through `agi bash` for richer audit logging (only when AGI gateway exists in the environment) |
| Statusline | (rendered from frontmatter) | ⏱ loop badge, 📊 progress bar, 🛑/⚠️/❓ indicators, 🧪 qa count |
| Skills | `loop`, `next`, `schedule`, `remember:remember` | Built-in slash commands the harness leans on |

---

## The state files in detail

### `_plans/_next/checkpoint.mdc`

The cycle-close ledger. Each completed cycle appends a block; the frontmatter captures running totals.

```markdown
---
lastShipped:
  version: "v0.4.380"           # The most recently committed version
  commit: "ccf3a72"              # Short SHA
inFlightTask: "s130 t515 B1 — schema autoRun field shipped. Slices B2-B8 ahead."
inFlightTaskState: "doing-multi-slice-multi-container-feature"
activeFocus: "next-pickups: B2 (Caddy 7-day TLS), B3 (per-project podman network), ..."
pendingQuestions: 0
focusVersion: "v0.4.0"
progress:
  done: 263                      # Tasks finished
  qa: 0                          # Tasks awaiting verification
  total: 290                     # Total tracked tasks
  asOf: "2026-04-29T19:40:00Z"
schemaVersion: 2
lastUpdated: "2026-04-29T19:40:00Z"
---

cycle123:
  ship: "Caddy offline-page Content-Type fix + multi-repo runtime schema (s130 t515)"
  commits: ["b3ebe1c (v0.4.378 hosting Content-Type)", "eda427c (v0.4.379 schema runtime fields)"]
  unitTests: "+9 schema cases"
  notes: "..."

cycle122:
  ship: "..."
  commits: [...]
  notes: "..."
```

**Why `.mdc`:** the file is read+written by the agent and the statusline. The `.mdc` extension marks "Markdown with critical frontmatter" — surfaces that depend on the frontmatter (statusline) MUST parse it, vs `.md` files that may only be human-readable.

**Update cadence:**
- Frontmatter bumped on EVERY cycle close (lastShipped, progress, lastUpdated)
- Cycle block added on cycle close
- `inFlightTask` updates at task transitions (starting → doing, doing → testing, testing → finished)

### `_plans/_next/pending-questions.mdc`

Owner-blocking questions that the agent surfaces but does NOT self-resolve. Counted by indicator type for the statusline.

```markdown
---
indicators:
  showStoppers: 0   # Tagged "show-stopper": blocks a story
  drift: 0          # Tagged "drift": doc/code divergence
  clarity: 0        # Tagged "clarity": term/workflow not understood
  qaVerification: 0 # Owner test plan filed when task moved to qa
lastUpdated: "2026-04-28T19:30:00Z"
totalPending: 0     # = showStoppers + drift + clarity (sanity check)
totalAnswered: 8    # Cumulative
qaPending: 0        # = qaVerification
schemaVersion: 1
---

# Pending questions log

This file tracks questions that arose during /loop or cron-driven cycles when the owner was away.

The frontmatter `indicators` block is read by the Claude terminal statusline + similar surfaces to render a count badge (analogous to "pending PRs"). Always update the frontmatter counts when adding/resolving entries.

When the owner returns, surface accumulated questions via `AskUserQuestion` (bundle up to 5 per call), then move resolved entries to `answered-questions-log.mdc`.
```

**Discipline:**
- The agent NEVER self-answers or self-resolves these. Owner-only territory.
- When the owner returns, agent surfaces questions via AskUserQuestion (bundle up to 5).
- Resolved questions move to `answered-questions-log.mdc` (append-only history).
- Pending questions do NOT stop the loop — they accumulate as async messages while the loop continues with non-blocked work.

### `_plans/_next/loop-prompt.mdc`

The canonical standing prompt. Single source of truth that propagates to:
- The body fired by `CronCreate` when `/loop 30m ...` schedules a recurring cycle
- The body of `~/.claude/commands/next.md` (the `/next` slash command)
- The body of any cloud schedule fired by `/schedule`

```markdown
---
purpose: Canonical standing prompt for /loop and /next iterative-work cycles
projectScope: <project-name>
schemaVersion: 3
lastUpdated: "<ISO-8601>"
loop:
  running: false                 # ← statusline reads this for the ⏱ badge
  cron: null                     # e.g. "13,43 * * * *" when running
  jobId: null                    # CronCreate-issued ID
  cadence: "Loop offline — ..."  # human-readable status
mode: drive-to-done              # drive-to-done | exploratory | maintenance
---

# Standing loop prompt

## BODY (copy verbatim into CronCreate / `/next` command)

[iterative-work mode — DRIVE VIP TO DONE]

Active project: <project-name>. Active version: v<X.Y.Z>. Goal: <one-line>.

First action — consume prior markers:
- Read _plans/_next/checkpoint.mdc (latest cycle close summary)
- Read _plans/_next/pending-questions.mdc (statusline shows the count)
- Query tynn (mcp__tynn__vip — VIP queue) OR fall back to checkpoint's "next pickups"

Pick highest-priority READY task per the dependency graph...

Slice each task vertically. End-to-end small slices > one big horizontal sweep.
Per cycle:
- Bump version + 3 same-commit guards (route/docs/staged) at every commit
- <repo-specific> CLI only; push to <fork> dev only, never upstream
- Per-commit learning to _discovery/learnings/{short-hash}.md
- Update _plans/_next/checkpoint.mdc at cycle close
- End-of-cycle indicator counts (🛑/⚠️/❓)

Stop conditions:
- All VIP backlog items finished → flip loop-prompt.mdc loop.running to false + CronDelete the job
- Fundamental env block → file pending-question + flip running to false + CronDelete the job
- 3-cycle per-task budget acts as inner protection against fix-test-fix infinite loops
```

**Why one canonical file:** the cron prompt (CronCreate, session-only memory) and the `/next` slash command body (user-scope) drift apart silently if maintained separately. This file is the canonical text; both surfaces are derived.

**Update protocol:** any time the standing prompt changes, update this file FIRST, then propagate to `~/.claude/commands/next.md` AND re-fire CronCreate with the new body if a loop is currently running.

---

## The cycle structure

Every cycle (whether fired by cron or `/next`) follows this shape:

### 1. Consume markers (don't re-derive)

```
- Read _plans/_next/checkpoint.mdc → know last shipped, in-flight task, next pickups
- Read _plans/_next/pending-questions.mdc → know if owner has open questions
- Query tynn MCP (mcp__tynn__vip) OR checkpoint's "next pickups" if no MCP
```

This is "ship-first" discipline: don't open the cycle with a tynn triage walk; start with a known target.

### 2. Pick the highest-priority READY task

From the active focus's dependency graph. If a task isn't ready, scope down to its prerequisite slice.

### 3. Slice vertically — schema → infra → behavior → wiring → UI

Each slice is shippable independently. End-to-end small slices > one big horizontal sweep.

### 4. Ship the slice

Per cycle:
- Implement the change
- Bump version (`package.json` patch)
- Run the **3 same-commit guards** before staging:
  - `pnpm typecheck` (or equivalent type-check)
  - `pnpm route-check:strict` (route-collision detection — prevents conflicting endpoints)
  - `pnpm docs-check:strict` (CLI help vs docs drift detection)
- Stage specific files (NEVER `git add -A` or `.`)
- Run `pnpm staged-check:strict` (typecheck against the now-staged tree)
- Commit with a structured message (subject + bullets + Co-Authored-By footer)
- Push to fork's dev branch (never upstream/main)

### 5. Verify in the test environment

For UI work: Playwright (`agi test --e2e <pattern>` against test VM, OR `--headed` for visual debugging).
For backend: vitest (`agi test <pattern>`).

The "DONE" signal is Playwright passing in the test environment, not "code-complete + tests pass on host" — that ducks the real work.

### 6. Mark task progress in tynn (if MCP available) OR checkpoint frontmatter

```
mcp__tynn__starting → mcp__tynn__doing → mcp__tynn__testing → mcp__tynn__finished
```

Updates happen LIVE during the cycle, not batched at end. The `inFlightTaskState` frontmatter mirrors the current task state.

### 7. Per-commit learning

After every shipping cycle, write to `_discovery/learnings/{short-hash}.md`:

```markdown
---
commit: <short-hash>
agi_version: <X.Y.Z>
story: <s###>
task: <t###>
date: <YYYY-MM-DD>
---

# v<X.Y.Z> — <one-line summary>

## What shipped
<bullets>

## Insights
1. <load-bearing insight from this slice>
2. <pattern that emerged>
3. <trap avoided>

## Test verification
<command + result>

## Follow-ups (for future slices)
- <slice X>
- <slice Y>
```

The insights are the durable artifact. Code can be re-read; insights about *why* a pattern worked or *what trap was avoided* survive future refactors.

### 8. Update checkpoint at cycle close

- Bump `lastShipped.version` and `lastShipped.commit`
- Update `inFlightTask` and `inFlightTaskState`
- Update `progress.done` (and `qa` if applicable)
- Update `lastUpdated`
- Append a `cycleN:` block at the top of the cycle log

### 9. End-of-cycle indicator counts

```
🛑 Show-Stoppers: 0  ⚠️ Drift: 0  ❓ Clarity: 0
```

These mirror the `pending-questions.mdc` frontmatter `indicators` block. Reporting them at cycle close keeps them in the agent's context for the next cycle.

---

## Statusline signals (rendered from frontmatter)

The Claude Code statusline reads these files at session start (or on demand) and renders compact badges:

| Badge | Source | Format | Example |
|-------|--------|--------|---------|
| ⏱ loop | `loop-prompt.mdc` `loop.running` + `loop.cadence` | "loop OFF" or "loop ON · every 30m" | `⏱ loop ON · :13,:43` |
| 📊 progress | `checkpoint.mdc` `progress.{done,qa,total}` | Two-tone bar (no numbers) | `📊 ▰▰▰▰▰▰▰▱▱▱` |
| 🛑 show-stoppers | `pending-questions.mdc` `indicators.showStoppers` | count, hidden if 0 | `🛑 2` |
| ⚠️ drift | `pending-questions.mdc` `indicators.drift` | count, hidden if 0 | `⚠️ 1` |
| ❓ clarity | `pending-questions.mdc` `indicators.clarity` | count, hidden if 0 | `❓ 3` |
| 🧪 qa-verification | `pending-questions.mdc` `qaPending` | count, hidden if 0 | `🧪 1` |

**Implementation note:** these signals are designed for the Claude Code (or compatible) statusline harness. The data lives in YAML frontmatter at the top of each `.mdc` file; ANY tool that reads YAML can render these signals. Tynn-lite is statusline-agnostic — install it anywhere, render however you want.

---

## Hooks

### `agi-bash-router.sh` (PreToolUse)

This hook is **optional and AGI-specific** — it routes Bash tool calls through the `agi bash` wrapper for richer audit logging. Tynn-lite installs it only when the target environment has the AGI gateway present.

```bash
#!/usr/bin/env bash
# Transparently rewrites every Bash tool call to `agi bash '<cmd>'`
# so invocations land in the JSONL log substrate at
# ~/.agi/logs/agi-bash-YYYY-MM-DD.jsonl with caller attribution.
# Already-wrapped commands and `agi <subcmd>` calls pass through unchanged.
# Bypass with AGI_ROUTER_BYPASS=1.
```

For projects WITHOUT AGI: the hook is omitted; Bash calls go through directly. The discipline (audit-everything-richly) is preserved through git history and per-commit learnings instead.

---

## Skills the harness leans on

These ship in Claude Code already — tynn-lite doesn't install them, just relies on them:

- **`loop`** — schedule a recurring or self-paced prompt. `/loop 30m <prompt>` fires every 30 minutes; `/loop <prompt>` self-paces via ScheduleWakeup.
- **`next`** — manually advance one cycle independent of cron. Body in `~/.claude/commands/next.md`.
- **`schedule`** — create cloud routines that survive session close. For overnight or multi-day cadences.
- **`remember:remember`** — save session state for clean continuation next session.

These are user-level skills (not project-level), so tynn-lite documents that the harness *expects* them but doesn't ship them.

---

## Memory persistence

Tynn-lite leverages the existing Claude Code memory system at `~/.claude/projects/<dir>/memory/`. Project-relevant feedback gets saved there as `feedback_<topic>.md`, indexed in `MEMORY.md`.

**Relevant memory pattern types** (from this workspace):
- `feedback_*.md` — guidance the user has given (don't do X, prefer Y)
- `project_*.md` — context about ongoing work
- `reference_*.md` — pointers to external systems
- `user_*.md` — user role/preferences

The `--with-tynn` install does NOT seed memory — that's session-specific. But it documents the pattern in the project's CLAUDE.md so future sessions know to use it.

---

## Story-task workflow (with or without tynn MCP)

Whether tynn MCP is available or not, work is organized as:

**Story** = a Need / Problem with one cohesive resolution (multiple cycles)
**Task** = a specific Work step within a story (one or more cycles)

Status state machine:
```
backlog → starting → doing → testing → finished
                              ↓
                         (qa) → finished (after owner verification, if needed)
                              ↓
                         (blocked) → starting (when unblocked)
```

**With tynn MCP:** state is in the database, queried via `mcp__tynn__*`.

**With tynn-lite:** state lives in checkpoint.mdc cycle blocks + the in-flight task description. The `inFlightTaskState` frontmatter field carries one of: `backlog`, `starting`, `doing`, `testing`, `qa`, `finished`, `blocked`.

For multi-task stories without MCP, a `_plans/<story>/tasks.md` file can list each task with its current state — same shape as MCP, just file-backed.

---

## Stop conditions (autonomous loop self-disables)

The loop self-disables (sets `loop.running: false` + calls `CronDelete`) on:

1. **All VIP backlog items finished** — declared completion; loop unfires + announces.
2. **Fundamental env block** — test VM dies + can't recover, build broken across migrations, gateway boot loop. Files a pending-question + unfires.
3. **3-cycle per-task budget exhausted** — inner protection against fix-test-fix infinite loops. After 3 cycles on one task without progress, file a pending-question with concrete state + move on.

The harness should NOT self-disable on:
- Pending questions filed (those are async messages, not stop signals)
- Single-cycle test failures (retry once, escalate to question on second failure)
- Owner offline (the loop's purpose is to drive work while owner is away)

---

## Anti-patterns (what NOT to do)

These are guardrails distilled from the workspace's actual mistakes:

1. **Don't open a cycle with a tynn triage walk.** Ship-first; walk through priorities at cycle close to set up the next pick.
2. **Don't manually upgrade after every commit.** Owner triggers upgrades; only run `agi upgrade` when the cycle's verification path requires hitting production.
3. **Don't push to upstream.** Push to fork's dev branch only. Cross-repo PRs are the only path upstream.
4. **Don't bundle multi-fix work into one big commit.** Each fix is a slice; each slice gets its own commit + learning file.
5. **Don't self-answer pending questions.** Owner-only territory.
6. **Don't add `agi upgrade`-style production-mutating commands to per-cycle automation** unless the verification path requires it.
7. **Don't over-test in plan-mode.** Three same-commit guards (typecheck/route/docs/staged) are the per-commit floor; test runs are part of the verification phase, not the gate.
8. **Don't write `pnpm lint` warnings as errors.** Lint runs are separate from the same-commit guards; warnings accumulate, errors block.

---

## Installation via `--with-tynn` (target spec for bots)

When `bots install <project> --with-tynn` runs, it should:

1. **Scaffold the file structure** in the target project:
   ```
   <project>/
     _plans/_next/
       loop-prompt.mdc       (templated with project name + initial scope)
       checkpoint.mdc         (initial frontmatter, empty cycle log)
       pending-questions.mdc  (empty)
       answered-questions-log.mdc (empty)
       checklist.md           (project-specific TODO if owner wants it)
     _discovery/
       learnings/             (empty, .gitkeep so dir survives)
       tynn-lite.md           (this doc, copied)
   ```

2. **Append to or create the project's CLAUDE.md** with a section pointing at:
   - `_plans/_next/loop-prompt.mdc` as the standing prompt source
   - `_discovery/learnings/` as the per-commit learning destination
   - The cycle structure summary
   - The 3 same-commit guards (templated to the project's package manager)
   - The stop conditions

3. **Optionally install the agi-bash-router hook** if the target project uses AGI gateway (detect via existence of `~/.agi/gateway.json` or env var):
   - Copy `~/.claude/hooks/agi-bash-router.sh`
   - Add the PreToolUse entry to `~/.claude/settings.json`

4. **Verify the bots-side `tynn-lite-template/` dir** ships these files as templates (parameterized by project name, version, focus version).

5. **Print a 3-step "now what" guide** at the end:
   - "Open `_plans/_next/loop-prompt.mdc` and update the standing prompt body for your project's specifics"
   - "Run `/loop 30m <your prompt>` to start an autonomous cycle"
   - "Or run `/next` to manually advance one cycle"

The flag is idempotent: re-running it on a project that already has tynn-lite installed should be a no-op (or refresh the docs without overwriting state files).

---

## Why this matters

The discipline encoded here is the single most leveraged thing the agent has. Three same-commit guards prevent half of all CI failures. Per-commit learnings prevent re-derivation. Indicator counts surface owner-blocking work without spam. Cycle structure prevents both rabbit-holing and shallow-work.

By making it a deployable harness, every project the agent touches gets the same floor — and every owner gets the same predictable agent operating model.

---

## Related concepts in the broader project

- **Tynn-and-related concepts** at `agi/docs/agents/tynn-and-related-concepts.md` — disambiguates AGI's parallel concepts (Taskmaster, Worker state, Plans, tynnContext, MCP tool) that look tynn-shaped but aren't.
- **iterative-work.md** at `agi/prompts/iterative-work.md` — the canonical agent prompt that the standing-loop prompt body extends.
- **CLAUDE.md § 10 Guardrails** — hard rules the agent applies regardless of harness.

These three documents together form the complete agentic operating model. Tynn-lite is the *deployable shape* of that model.
