# release-automation Specification

## ADDED Requirements

### Requirement: Automatic versioned release on merge to main
The system SHALL, on every push to `main` containing at least one release-worthy Conventional Commit (`fix:` → patch, `feat:` → minor, breaking change → major), compute the next semantic version from git history, build the macOS DMG, create a git tag `v<version>`, and publish a GitHub release with the DMG attached — with no manual steps.

#### Scenario: feat commit merged
- **WHEN** a squash commit titled `feat: add speaker labels` lands on `main` and the latest tag is `v0.1.7`
- **THEN** CI builds the DMG, creates tag `v0.2.0`, and publishes a GitHub release `v0.2.0` with the DMG asset

#### Scenario: non-release commit merged
- **WHEN** a commit titled `docs: fix typo` lands on `main`
- **THEN** CI exits early without building, tagging, or releasing

#### Scenario: build failure produces no release
- **WHEN** the DMG build fails
- **THEN** no tag and no GitHub release are created, and the workflow can be safely re-run

### Requirement: Build artifact carries the computed version
The system SHALL patch the Electron app version to the computed next version before building, so the DMG filename and app metadata match the release tag. The patched version SHALL NOT be committed back to the repository; git tags are the source of truth.

#### Scenario: DMG filename matches release
- **WHEN** the computed next version is `0.2.0`
- **THEN** the built artifact is `Just.Transcribe-0.2.0-arm64.dmg` and is attached to release `v0.2.0`

### Requirement: Homebrew cask updated automatically
The system SHALL, after publishing a release, update `Casks/just-transcribe.rb` with the new version and the sha256 of the built DMG, and push that commit to `main` without triggering another release run.

#### Scenario: cask reflects new release
- **WHEN** release `v0.2.0` is published
- **THEN** `Casks/just-transcribe.rb` on `main` contains `version "0.2.0"` and the matching sha256, committed by CI with `[skip ci]`

#### Scenario: no release loop
- **WHEN** CI pushes the cask update commit
- **THEN** no new release workflow run is triggered by that commit

### Requirement: Concurrent merges do not corrupt releases
The system SHALL serialize release workflow runs on `main` so overlapping merges cannot race on tagging or the cask commit.

#### Scenario: two merges in quick succession
- **WHEN** two PRs merge to `main` within seconds of each other
- **THEN** release runs execute one at a time, each computing its version from the state left by the previous run
