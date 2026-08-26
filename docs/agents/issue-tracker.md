# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues at
`bb6894/omp-desktop`. Use the `gh` CLI for all operations and always pass
`--repo bb6894/omp-desktop` because the local `origin` may point at a different
repository.

## Conventions

- **Create an issue**: `gh issue create --repo bb6894/omp-desktop --title "..." --body "..."`. Use a body file for multi-line content.
- **Read an issue**: `gh issue view <number> --repo bb6894/omp-desktop --comments`.
- **List issues**: `gh issue list --repo bb6894/omp-desktop --state open --json number,title,body,labels,comments` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --repo bb6894/omp-desktop --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --repo bb6894/omp-desktop --add-label "..."` or `--remove-label "..."`.
- **Close an issue**: `gh issue close <number> --repo bb6894/omp-desktop --comment "..."`.

## Skill vocabulary

When a skill says "publish to the issue tracker", create a GitHub issue in
`bb6894/omp-desktop`.

When a skill says "fetch the relevant ticket", read that issue and its
comments from `bb6894/omp-desktop`.
