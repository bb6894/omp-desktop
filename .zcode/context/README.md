# Project Context

Files in this directory hold project-specific context that is either injected by native ZCode instructions or read on demand.

## Purpose

Keep concise, durable information here:

- Architecture decisions
- Business domain knowledge
- API conventions
- Team agreements
- Repository facts that agents need repeatedly

## Native ZCode Loading

`/setup` materializes this directory into the project `.zcode/context/` overlay without overwriting existing files. The default project `.zcode/config.json` includes only essential always-on context:

```json
{
  "instructions": [
    ".zcode/memory/project/user.md",
    ".zcode/memory/project/tech-stack.md",
    ".zcode/memory/project/project.md",
    ".zcode/context/git-context.md"
  ]
}
```

Add another file to `instructions[]` only when every prompt needs it. Read larger or task-specific documents on demand with filesystem or memory tools.

## Maintenance

- Existing project files win during repeated `/setup` runs.
- Keep injected files concise because they consume context on every prompt.
- Use Markdown for portable agent-readable context.
