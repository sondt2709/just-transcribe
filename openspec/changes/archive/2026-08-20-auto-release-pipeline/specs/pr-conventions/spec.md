# pr-conventions Specification

## ADDED Requirements

### Requirement: PR titles validated against Conventional Commits
The system SHALL validate every pull request title against Conventional Commits with the allowed types `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, re-checking whenever the title is edited or the PR is updated.

#### Scenario: valid title
- **WHEN** a PR is opened with title `feat: add overlay lock`
- **THEN** the PR title check passes

#### Scenario: invalid title
- **WHEN** a PR is opened with title `Added overlay lock`
- **THEN** the PR title check fails and blocks merge until the title is fixed

#### Scenario: title edited
- **WHEN** an invalid PR title is edited to `fix: overlay lock state`
- **THEN** the check re-runs and passes

### Requirement: Squash merge uses PR title as commit message
The repository SHALL allow only squash merging, with the squash commit message defaulting to the PR title, so the validated title is the commit message that drives version bumps.

#### Scenario: squash merge produces conventional commit
- **WHEN** a PR titled `feat: add speaker labels` is merged
- **THEN** `main` receives a single commit whose message starts with `feat: add speaker labels`
