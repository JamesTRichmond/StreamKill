# StreamKill

Project bootstrap setup.

## Release process (no npm publishing)

This repo uses Release Please to automate changelog + GitHub Releases.

Use Conventional Commits:
- `feat: ...` -> minor
- `fix: ...` -> patch
- `feat!: ...` or `BREAKING CHANGE:` -> major

Release Please opens/updates a release PR automatically.
Merging that PR creates the GitHub Release and tag.

