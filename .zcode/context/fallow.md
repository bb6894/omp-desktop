---
purpose: Fallow codebase intelligence commands for AI agents — dead code, duplication, complexity, and audit gating
updated: 2026-06-04
---

# Fallow — Codebase Intelligence Reference

## Overview

Fallow is a Rust-native, deterministic static analysis tool for TypeScript/JavaScript codebases.
**No AI inside the analyzer** — same input always produces the same output.
It builds a complete module graph to find issues no linter or type checker can see.

---

## Commands

### Full Analysis (single pass)

```bash
npx fallow                      # All analyses: dead code + duplication + health
npx fallow --format json        # Structured output for agent parsing
```

### Dead Code

```bash
npx fallow dead-code                                   # Full dead code report
npx fallow dead-code --format json --quiet              # JSON for agents
npx fallow dead-code --unused-exports                   # Only unused exports
npx fallow dead-code --unused-dependencies              # Only unused deps
npx fallow dead-code --circular                         # Only circular deps
npx fallow fix --dry-run                                # Preview safe auto-fixes
npx fallow fix --yes                                    # Apply auto-fixes
```

### Trace (investigate before deleting)

```bash
npx fallow dead-code --trace FILE:EXPORT_NAME           # Why is this export flagged?
npx fallow dead-code --trace-dependency PACKAGE_NAME    # Where is this dep imported?
```

### Duplication

```bash
npx fallow dupes                     # Find code clones
npx fallow dupes --mode strict       # Exact matches only
npx fallow dupes --mode weak         # Structural matches
npx fallow dupes --trace FILE:LINE   # Deep-dive a specific clone group
```

### Health (complexity)

```bash
npx fallow health                    # Complexity hotspots + refactoring targets
npx fallow health --format json      # Structured output
```

### Audit Gate (for CI / pre-commit)

```bash
npx fallow audit                     # Check changed files (verdict: pass/warn/fail)
npx fallow audit --format json       # Structured verdict for agents
npx fallow audit --gate new-only     # Only flag new issues, not pre-existing
```

---

## Workflow Patterns

### Post-Edit Verification Loop

```bash
# 1. Make changes
# 2. Run audit
npx fallow audit --format json --quiet
# 3. If verdict is "fail", inspect findings
# 4. Fix or investigate with --trace
# 5. Re-run audit until pass
```

### Codebase Cleanup

```bash
npx fallow                           # Full picture
npx fallow dead-code --format json   # Find unused code
npx fallow fix --dry-run             # Preview auto-removals
npx fallow fix --yes                 # Apply auto-fixes
npx fallow dupes                     # Find duplication
npx fallow health                    # Find complexity hotspots
```

### Monorepo / Workspace

```bash
npx fallow --workspace               # Analyze all workspaces
npx fallow --workspace packages/pkg  # Analyze specific workspace
```

---

## Understanding Output

Every finding in `--format json` includes:

```json
{
  "path": "src/utils/example.ts:42",
  "issue_type": "unused-exports",
  "actions": [
    {
      "type": "delete-export",
      "auto_fixable": true,
      "description": "Remove unused export"
    }
  ]
}
```

The `actions[]` array is machine-actionable. Agents can inspect `auto_fixable` flags and apply safe fixes programmatically.

---

## Config

Fallow auto-detects your project. For custom config, run:

```bash
npx fallow init    # Generates .fallow/config.yaml with auto-detected settings
```

Common config patterns:
- `ignorePatterns` — exclude directories from analysis (e.g., `.zcode/`)
- `entry` — declare additional entry points
- `publicPackages` — packages with public API surface
- `rules` — custom issue severity rules
