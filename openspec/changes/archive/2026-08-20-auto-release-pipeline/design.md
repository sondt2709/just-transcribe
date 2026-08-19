# Design: Auto Release Pipeline

## Context

Current release flow is manual: edit `electron/package.json` version, push a `v*` tag which triggers `.github/workflows/release.yml` (macos-latest build → DMG → GitHub release), then hand-commit the new version + sha256 into `Casks/just-transcribe.rb`. The repo is public, so hosted macOS runners are free. Tags are the de-facto version source and have already drifted from package.json in the past.

## Goals / Non-Goals

**Goals:**
- Fully automated release on every merge to `main` that contains a `feat` or `fix` commit: version, tag, GitHub release with DMG, cask update.
- PR title = squash commit message = version-bump signal (Conventional Commits).
- No PAT / GitHub App: everything runs with the default `GITHUB_TOKEN`.

**Non-Goals:**
- Code signing / notarization of the DMG (unchanged from today).
- Windows/Linux builds, Flutter/KMP/Python subprojects.
- Batched or manually gated releases (explicitly rejected: every merge releases).
- Publishing to homebrew-core (cask stays in this repo's tap).

## Decisions

### 1. semantic-release over release-please
- release-please's core model is a human-merged release PR; auto-merging it is a workaround, and its tags created with `GITHUB_TOKEN` cannot trigger a separate build workflow.
- semantic-release computes the version from commit messages and publishes in-process — matches "every merge releases".

### 2. Single workflow on push to main, no tag trigger
GitHub does not fire workflows for tags/commits created with `GITHUB_TOKEN`. Chaining "release job creates tag → tag triggers build" would require a PAT. Instead one workflow on `push: branches: [main]` does everything in a single `macos-latest` job:

```
push to main
  ├─ semantic-release (dry run) → next version, or exit if none
  ├─ patch electron/package.json version (build-time only, not committed)
  ├─ npm ci + build + electron-builder → DMG
  ├─ semantic-release (publish) → tag + GitHub release + DMG asset
  └─ sha256 → update Casks/just-transcribe.rb → commit "[skip ci]" → push
```

- Dry-run first so the expensive DMG build is skipped entirely when no `feat`/`fix` commit landed.
- `@semantic-release/github` `assets` option attaches the DMG to the release.
- semantic-release invoked via `npx` with pinned versions; config in `.releaserc.json` at repo root. No new committed dependencies.

### 3. Version source of truth: git tags
`electron/package.json` version is patched in CI before the build (so the DMG filename and app metadata are right) but not committed back. Avoids an extra bot commit per release and the `@semantic-release/git` plugin. The checked-in package.json version becomes irrelevant.

### 4. Cask update committed directly to main with `[skip ci]`
- Same repo, so `GITHUB_TOKEN` with `contents: write` suffices.
- `[skip ci]` in the commit message prevents the push from re-triggering the release workflow (native GitHub behavior).
- Commit is made by the workflow bot user (`github-actions[bot]`).

### 5. PR title validation + squash-only merges
- New `pr-title-check.yml` using `amannn/action-semantic-pull-request` (pinned by SHA), allowed types: `feat, fix, chore, docs, refactor, test`.
- Repo settings changed to squash-merge only with "default to PR title" so the validated title becomes the commit that semantic-release analyzes. Settings change is manual (one-time, via GitHub UI or `gh api`) and documented in tasks.

### 6. Versioning rules
Standard semantic-release defaults: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:`/`!` → major. Current version continues from latest tag `v0.1.7`.

## Risks / Trade-offs

- [Direct pushes to main bypass PR title validation] → semantic-release just ignores non-conventional messages (no release). Optionally add a branch ruleset requiring PRs later; ruleset must allow the workflow bot to push the cask commit (or exempt `github-actions[bot]`).
- [Cask commit race: two releases merge back-to-back] → workflow `concurrency` group serializes runs on main.
- [semantic-release tag exists but DMG build fails] → build happens BEFORE publish (dry-run pattern), so a failed build produces no tag/release; safe to re-run.
- [`[skip ci]` typo/behavior change silently causes workflow loop] → also guard with a paths-ignore or an explicit actor check if it ever bites; loop is bounded anyway (cask commit contains no `feat`/`fix`, dry-run exits early).
- [Squash-only setting is manual] → documented as a task; if forgotten, merge commits may carry non-conventional messages and simply not release.

## Open Questions

None.
