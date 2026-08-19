# Auto Release Pipeline

## Why

Releases are currently manual: bump `electron/package.json`, push a `v*` tag, then hand-edit the Homebrew cask with the new version and sha256. This is error-prone (tags and package.json already drifted) and slows down shipping.

## What Changes

- Every merge to `main` with a release-worthy commit (`feat`/`fix`) automatically computes the next semver, builds the DMG, tags, publishes a GitHub release, and updates the Homebrew cask — zero manual steps.
- PR titles are validated against Conventional Commits so squash-merge commit messages reliably drive version bumps.
- The existing tag-triggered `release.yml` is replaced by a single push-to-main workflow (avoids the `GITHUB_TOKEN` cannot-trigger-workflows chaining problem; no PAT required).
- Repository merge settings move to squash-only so PR title becomes the commit message.

## Capabilities

### New Capabilities
- `release-automation`: automated versioning, tagging, GitHub release with DMG asset, and Homebrew cask update on merge to main.
- `pr-conventions`: PR title validation against Conventional Commits types.

### Modified Capabilities

None (no existing specs).

## Impact

- `.github/workflows/release.yml`: replaced (tag trigger → push-to-main trigger with semantic-release).
- `.github/workflows/pr-title-check.yml`: new.
- `Casks/just-transcribe.rb`: now updated by CI, never by hand.
- `electron/package.json` version: patched at build time from computed version; git tags become the source of truth.
- GitHub repo settings: squash-only merges, PRs required for main.
- New dev dependencies: none committed; semantic-release run via `npx` in CI only.
