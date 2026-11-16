## ADDED Requirements

### Requirement: Release bundles the call microphone driver
The release workflow SHALL build `JustTranscribeMic.driver` from `driver/` with libASPL at a pinned tag, sign it ad-hoc, and bundle it in the app at `Contents/Resources/driver/JustTranscribeMic.driver`. A driver build failure SHALL fail the release.

#### Scenario: Driver in the DMG
- **WHEN** a release is built
- **THEN** `Just Transcribe.app/Contents/Resources/driver/JustTranscribeMic.driver/Contents/Info.plist` exists and `codesign -v` passes on the driver bundle
