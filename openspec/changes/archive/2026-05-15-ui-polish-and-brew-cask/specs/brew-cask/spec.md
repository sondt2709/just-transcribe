## ADDED Requirements

### Requirement: Homebrew cask formula
The project SHALL provide a Homebrew cask formula in a custom tap repository (`homebrew-just-transcribe`) that installs the arm64 DMG from GitHub releases.

#### Scenario: Install via Homebrew
- **WHEN** a user runs `brew tap sondt/just-transcribe && brew install --cask just-transcribe`
- **THEN** the system downloads the latest arm64 DMG from GitHub releases and installs `Just Transcribe.app` to `/Applications/`

#### Scenario: Upgrade via Homebrew
- **WHEN** a new version is released and the cask formula is updated
- **THEN** `brew upgrade --cask just-transcribe` SHALL install the new version

### Requirement: Cask formula structure
The cask formula SHALL include: version, sha256 checksum, download URL pointing to `https://github.com/sondt/just-transcribe/releases/download/v#{version}/Just.Transcribe-#{version}-arm64.dmg`, app name, app description, homepage URL, and the `app` stanza mapping to `Just Transcribe.app`.

#### Scenario: Valid cask formula
- **WHEN** the cask formula is loaded by Homebrew
- **THEN** it SHALL pass `brew audit --cask just-transcribe` without errors

### Requirement: Uninstall via Homebrew
The cask formula SHALL support standard Homebrew uninstall. A `zap` stanza SHALL remove app data at `~/.just-transcribe` and `~/Library/Application Support/just-transcribe`.

#### Scenario: Clean uninstall
- **WHEN** a user runs `brew uninstall --cask just-transcribe --zap`
- **THEN** the app, `~/.just-transcribe/`, and `~/Library/Application Support/just-transcribe/` SHALL be removed
