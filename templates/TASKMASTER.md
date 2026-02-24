## BOTS -- Bolt-On Taskmaster System

> **IMPORTANT:** Read `.bots/AGENTS.md` before dispatching workers or processing shortcodes. It contains worker domains, enforced chains, gate types, team mode instructions, and output directory rules.

**Shortcodes** (queue work from any prompt):
```
w:> <task description>    Queue background work
n:> <frame topic>         Set next frame after current work
```

**Quick CLI:**
```
npm run tm status          Active jobs
npm run tm jobs            All jobs
npm run tm approve <id>    Approve checkpoint
```

Full reference: `.bots/AGENTS.md`
