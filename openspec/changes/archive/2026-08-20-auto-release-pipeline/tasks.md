# Tasks: Auto Release Pipeline

## 1. PR conventions

- [x] 1.1 Create `.github/workflows/pr-title-check.yml` validating PR titles against Conventional Commits (types: feat, fix, chore, docs, refactor, test), action pinned by SHA
- [x] 1.2 Configure repo merge settings via `gh api`: squash-only, squash title defaults to PR title

## 2. Release workflow

- [x] 2.1 Create `.releaserc.json` with branches `[main]`, plugins commit-analyzer, release-notes-generator, and github (DMG assets)
- [x] 2.2 Replace `.github/workflows/release.yml` with push-to-main workflow: concurrency group, dry-run version detection, package.json patch, DMG build, semantic-release publish
- [x] 2.3 Add cask update step: sha256 of DMG, sed version+sha into `Casks/just-transcribe.rb`, commit `[skip ci]` as github-actions bot, push to main

## 3. Verify

- [x] 3.1 Validate workflow YAML (actionlint or yamllint) and dry-run semantic-release locally against current history
- [x] 3.2 Update README/docs release section: releases now automated, describe PR title convention
