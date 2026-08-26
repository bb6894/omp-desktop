# Domain docs

This repository uses a single-context domain layout. The Rust/Tauri shell,
Desktop Host, and frontend are layers of the same OMP Desktop product context,
not separate domain contexts.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read ADRs under `docs/adr/` that affect the area being changed.
- Continue silently when either location does not exist. Domain documentation
  is created lazily when terminology or architectural decisions are resolved.

Do not look for per-layer `CONTEXT.md` files unless this document is explicitly
changed to declare a multi-context layout.

## Use the glossary vocabulary

Use terms as defined in `CONTEXT.md` in issue titles, requirements, hypotheses,
test names, and implementation notes. Do not substitute synonyms that the
glossary explicitly avoids.

If a required concept is absent, first check whether it is unnecessary new
language. If it represents a real domain gap, record that gap for the domain
documentation workflow.

## Flag ADR conflicts

If proposed work conflicts with an existing ADR, report the conflict explicitly
instead of silently overriding the decision. Name the ADR and explain why it
may need to be reopened.
