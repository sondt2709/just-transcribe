---
name: ship
description: Ship the current work in just-transcribe end-to-end - commit, push, open a PR with a Conventional Commit title, merge after the user confirms, watch the release CI, and have the user verify the Homebrew upgrade on their MacBook. Use whenever the user says "ship", "ship it", "release this", "commit and PR", "push and merge", or wants finished work delivered all the way to a published release.
---

# Ship

Deliver the working-tree changes all the way to a released version. Main is protected: no direct pushes, PRs only, squash merge with the PR title as the commit message. That title is what semantic-release reads, so choosing it correctly IS choosing whether a release happens.

## Version rules (decide before anything else)

- `fix:` → patch release, `feat:` → minor, `feat!:` or `BREAKING CHANGE:` footer → major
- `chore:` / `docs:` / `refactor:` / `test:` → merged but **no release**
- Allowed types are enforced by the PR title check: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`

Pick the type from what the change actually does for users, not from what files changed. A user-visible improvement is `feat` even if the diff is small; an internal cleanup is `chore`/`refactor` even if the diff is large. If a release-worthy merge is about to happen, say so — merging `feat:`/`fix:` publishes a DMG and updates the Homebrew cask with no further gate.

## Workflow

### 1. Commit and push

- If on `main`, create a branch first (`<type>/<short-kebab-desc>`). Direct pushes to main are rejected by the ruleset anyway.
- Stage only files belonging to this change — the repo often carries unrelated experiments (`flutter/`, `kmp/`, build artifacts). Never `git add -A` blindly.
- Never touch CI-owned files: `Casks/just-transcribe.rb` version/sha256, `electron/package.json` version, git tags.
- Commit with a Conventional Commit message and push the branch.

### 2. Create the PR

```sh
gh pr create --title "<type>: <description>" --body "<what and why>"
```

The title must pass the PR title check and is the future squash commit — write it as the changelog line it will become. State in the body whether this releases (and the expected next version, computed from the latest `v*` tag).

### 3. Confirm merge with the user

Always stop and ask before merging. Show:
- PR URL and title
- Whether merge triggers a release, and the expected version (e.g. `v0.1.7 → v0.2.0`)

Do not merge until the user explicitly confirms.

### 4. Merge and watch CI

```sh
gh pr merge <number> --squash --delete-branch
gh run list --workflow=release.yml --branch=main --limit 1   # grab the new run id
gh run watch <run-id> --exit-status
```

The release run builds the DMG on macos-latest — takes several minutes. On failure, read the logs (`gh run view <run-id> --log-failed`), report, and stop.

For a releasing merge, verify afterwards:
- `gh release view v<next>` — release exists with the DMG asset
- `git fetch origin main && git show origin/main:Casks/just-transcribe.rb | grep -E 'version|sha256'` — cask was auto-updated (CI merges its own `cask-update-v*` PR)

### 5. User verifies on MacBook (releases only)

Ask the user to run on their MacBook and report back:

```sh
brew update
brew upgrade --cask just-transcribe
```

Expected: cask upgrades to the new version. Not done until the user confirms the upgrade worked. If no release happened (`chore:` etc.), skip this step and finish after the merge.

## Failure notes

- PR title check fails → fix the title with `gh pr edit --title`, it re-runs automatically.
- Release run "skipped everything" on a `feat:`/`fix:` merge → check the squash commit message on main actually kept the conventional title.
- `brew upgrade` doesn't see the new version → cask PR may still be merging; check `gh pr list --state all --search "cask-update"` and re-run `brew update`.
