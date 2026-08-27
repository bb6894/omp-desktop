---
purpose: Git spatial awareness injected into all agent prompts
updated: 2026-04-01
---

# Git Context

## Auto-Context (start of every task)

Before starting work, establish your position in the repo. Run once per session and cache results:

```bash
git branch --show-current        # What branch am I on?
git status --short               # What's modified/staged? (cap at 20 lines)
git log --oneline -5             # What happened recently?
```

## When to Refresh

Re-run git context after:

- Any commit you make
- Switching branches
- Pulling, merging, or rebasing
- Stashing or unstashing

## How to Use

- **Commit messages**: Use branch name for scope (e.g., `feat(auth):` if on `feature/auth`)
- **Branch decisions**: Check if you're on main before creating a feature branch
- **Conflict awareness**: `git status` shows modified files — avoid editing files with uncommitted changes from another task
- **Recent history**: `git log` shows what was just done — prevents duplicate work
