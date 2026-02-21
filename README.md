# BOTS — Bolt-On Taskmaster System

Worker team orchestration for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Describe what you want done, and BOTS assembles a team of specialized workers to execute it — routing tasks to the right roles, coordinating handoffs between phases, and gating progress with checkpoints. Install into any project with a single command.

## Install

```bash
git clone git@github.com:Civicognita/nexus-bots.git ~/.nexus-bots
cd my-project
bash ~/.nexus-bots/install.sh
```

**Windows (PowerShell):**
```powershell
git clone git@github.com:Civicognita/nexus-bots.git $env:USERPROFILE\.nexus-bots
cd my-project
pwsh $env:USERPROFILE\.nexus-bots\install.ps1
```

## Upgrade

Update an existing installation to the latest source without losing active jobs or custom routing rules:

```bash
npm run tm upgrade ~/.nexus-bots
```

Use `--check` for a dry run that shows what would change without modifying anything:

```bash
npm run tm upgrade ~/.nexus-bots --check
```

The upgrade copies lib modules, workers, schemas, and hooks from the source repo, migrates `taskmaster.json` state (preserving `wip`, `routing`, `enforced_chains`, and `dispatch_rules`), registers any missing hooks in `settings.local.json`, and appends the BOTS section to `CLAUDE.md` if not already present.

## Shortcodes

Shortcodes are prefixes you type in Claude Code to trigger BOTS. A hook intercepts your message, parses the shortcode, and routes it to the right worker — all before Claude even sees the prompt.

| Shortcode | Name | What it does |
|-----------|------|--------------|
| `w:>` | **Work** | Queue a task for background execution. BOTS creates an isolated worktree, picks the right worker, and runs the job in parallel while you keep working. |
| `n:>` | **Next** | Set a topic to work on after the current task completes. Think of it as bookmarking your next focus area. |

### Examples

**Queue a single job:**
```
w:> Add a logout button to the dashboard header
```

BOTS automatically:
1. Parses the shortcode and extracts the task description
2. Routes to the right entry worker based on keywords (e.g., "Add button" routes to `code.engineer`)
3. Assembles a worker team — entry worker plus any enforced chain followers (e.g., `hacker` always brings `tester`)
4. Creates a WORK{JOB} with its own isolated git worktree
5. Orchestrates the team through phases, gating progress with checkpoints for your review

**Queue multiple jobs at once** — each `w:>` becomes a separate parallel job:
```
w:> Fix the login bug in auth.ts
w:> Add dark mode toggle to settings
```

**Set what to work on next** — `n:>` doesn't execute immediately, it queues a topic:
```
w:> Fix the login bug in auth.ts
n:> Review the API rate limiting proposal
```

### CLI

```bash
npm run tm status              # Show active jobs
npm run tm jobs                # List all jobs (including completed)
npm run tm approve job-001     # Approve checkpoint, continue to next phase
npm run tm reject job-001      # Reject and stop
npm run tm -- job job-001      # Show job details
npm run tm orchestrate         # Process all pending work
npm run tm monitor             # Check worker completion status
npm run tm mode                # Show current execution mode
npm run tm team-status         # Show team mode status
npm run tm detect              # Show detected integration
npm run tm upgrade ~/.nexus-bots          # Upgrade from source
npm run tm upgrade ~/.nexus-bots --check  # Dry-run (show what would change)
```

## How It Works

Each job gets a **worker team** assembled from the catalog. The router picks an entry worker based on task keywords, enforced chains add required followers, and the orchestrator coordinates the team through phased execution.

```
User types "w:> Fix login bug"
    │
    ▼
Hook detects w:> shortcode
    │
    ▼
Router selects entry worker → $W.code.hacker
    │
    ▼
Team assembled: hacker + tester (enforced chain)
    │
    ▼
WORK{JOB} created with isolated git worktree
    │
    ▼
Phase 1: hacker executes fix in worktree
    │  (auto gate)
    ▼
Phase 2: tester validates the fix
    │  (checkpoint gate)
    ▼
User reviews changes → approve or reject
    │
    ▼
Merge to main, cleanup worktree
```

The two **execution modes** control how the team is dispatched — as Task tool subagents (default) or as Claude Code agent teammates. See [Execution Modes](#execution-modes).

## Worker Catalog

BOTS draws from a catalog of specialized workers to assemble teams. The router picks an entry worker, and enforced chains pull in required teammates automatically.

### Root Workers (7)

| Worker | Role |
|--------|------|
| analyst | Pattern recognition, research |
| reporter | Diagnostic reports |
| researcher | Information gathering |
| reviewer | Code review, quality |
| scribe | Documentation, summaries |
| strategist | Architecture, planning |
| tester | Validation, testing |

### Domain Workers (22)

| Domain | Workers | Description |
|--------|---------|-------------|
| **code** | engineer, hacker, reviewer, tester | Implementation pipeline |
| **k** | analyst, cryptologist, librarian, linguist | Knowledge management |
| **ux** | designer.web, designer.cli | User experience |
| **strat** | planner, prioritizer | Strategic planning |
| **comm** | writer.tech, writer.policy, editor | Communications |
| **ops** | deployer, custodian, syncer | Operations |
| **gov** | auditor, archivist | Governance |
| **data** | modeler, migrator | Data management |

### Enforced Chains

Some workers always bring a teammate — the chain target is added to the team automatically:

| Trigger Worker | Followed By |
|----------------|-------------|
| code.hacker | code.tester |
| comm.writer.* | comm.editor |
| data.modeler | k.linguist |
| gov.auditor | gov.archivist |

## Gate Types

| Gate | Behavior |
|------|----------|
| `auto` | Automatically proceed to next phase |
| `checkpoint` | Pause for user review |
| `terminal` | Job complete, offer merge |

## Execution Modes

Once a worker team is assembled, BOTS needs to dispatch each worker. The **execution mode** controls how that happens.

```bash
npm run tm mode subagent   # Default — Task tool subagents
npm run tm mode team       # Claude Code agent teammates
npm run tm mode            # Show current mode
```

### Subagent Mode (default)

Each worker in the team is spawned via the `Task` tool as an isolated subagent. The orchestrator manages the full lifecycle: dispatching workers, collecting handoffs, evaluating gates, and advancing phases.

### Team Mode

Workers are dispatched as **teammates** using Claude Code's agent teams feature. BOTS translates the team's phases into a shared task list with dependency wiring, then a team lead coordinates execution.

**Flow:**
1. Orchestrator builds an execution plan — one task per worker, with `blockedBy` dependencies reflecting phase order and enforced chains
2. Tasks are created in the shared task list; teammates pick them up
3. Each teammate executes its worker role in the shared worktree and writes handoff JSON on completion
4. `TaskCompleted` hook reconciles BOTS state when a teammate finishes
5. `TeammateIdle` hook checks for pending BOTS work to assign

**Team CLI:**
```bash
npm run tm team-status                                         # Active team jobs
npm run tm orchestrate --tasks                                 # Show task payloads
npm run tm orchestrate --instructions                          # Team lead instructions
npm run tm -- team-reconcile <jobId> <phaseId> <worker> [tid]  # Reconcile completion
npm run tm -- team-pending <name>                              # Pending tasks for teammate
```

**Configuration** in `taskmaster.json`:

| Field | Default | Description |
|-------|---------|-------------|
| `team_name` | `bots-team` | Name for the agent team |
| `teammate_mode` | `in-process` | How teammates are spawned |
| `max_teammates` | `4` | Maximum concurrent teammates |
| `require_plan_approval` | `false` | Whether teammates need plan approval |

## Integrations

BOTS auto-detects your project environment and activates the right integration at startup. No manual setup required.

### Auto-Detection

| Priority | Integration | Detection Signal | What it does |
|----------|-------------|------------------|--------------|
| 1 | **Nexus** | `.nexus/core/GOSPEL.md` + `.ai/.nexus/` dir | Tynn sync + COA tracking, BAIF state gating, `.ai/.nexus/` paths |
| 2 | **Tynn** | `"tynn"` in `.claude/settings.local.json` MCP config | Syncs job status to Tynn tasks, parses `#T123`/`@task:ULID` references |
| 3 | **NoOp** | Neither detected | Standalone mode, no PM sync |

Check which integration is active:
```bash
npm run tm detect
```

### Tynn Integration

When Tynn MCP is detected, BOTS automatically:
- Parses task references from queue text (`#T42`, `@task:01HXYZ`, `#S5`, `@story:ULID`)
- Syncs job lifecycle to Tynn task status:
  - `running` -> `mcp__tynn__starting`
  - `checkpoint` -> `mcp__tynn__testing`
  - `complete` -> `mcp__tynn__finished`
  - `failed` -> `mcp__tynn__block`
- Posts phase completion comments to bound Tynn tasks

### Nexus Integration

Extends Tynn with Nexus-specific features:
- **Path override** — State files at `.ai/.nexus/` instead of `.bots/state/`
- **COA chain tracking** — Worker COA extension metadata on bindings
- **BAIF state gating** — Remote sync operations skipped when STATE != ONLINE

### Manual Override

To use a custom integration, call `setIntegration()` before any BOTS operations:

```typescript
import { setIntegration, ProjectIntegration } from '.bots/lib/project-integration.js';

class MyPMIntegration implements ProjectIntegration {
  isBound(jobId) { /* ... */ }
  bindJob(jobId, refs) { /* ... */ }
  getSyncOperation(jobId) { /* ... */ }
  // ...
}

setIntegration(new MyPMIntegration());
```

## What Gets Installed

```
your-project/
├── .bots/
│   ├── lib/            # Core TS modules (12 files)
│   ├── state/          # Runtime state (gitignored)
│   └── schemas/        # JSON schemas
├── .claude/
│   ├── agents/workers/ # Worker definitions (30 files)
│   ├── prompts/        # Worker base template
│   └── settings.local.json  # Hook registration
├── .ai/
│   ├── handoff/        # Worker handoff files (gitignored)
│   └── checkpoints/    # Worker progress (gitignored)
├── scripts/
│   └── taskmaster-hook.sh
└── CLAUDE.md           # BOTS section appended
```

## License

MIT
