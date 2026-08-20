# electron-shell (delta)

## ADDED Requirements

### Requirement: Stall and error banner
The renderer SHALL display a visible, dismissible banner when the backend broadcasts an `error` or `stall` WebSocket event, showing the message. The banner SHALL clear automatically when a subsequent `segment` or `interim` event arrives (pipeline recovered) or when the user dismisses it. Errors SHALL NOT be reported only to the developer console.

#### Scenario: Stall banner shown
- **WHEN** the WebSocket receives `{ "type": "stall", "message": "..." }`
- **THEN** the UI shows a warning banner with the message while the transcript view remains usable

#### Scenario: Banner auto-clears on recovery
- **WHEN** a banner is visible and a new `segment` or `interim` event arrives
- **THEN** the banner is removed automatically

#### Scenario: Error banner shown
- **WHEN** the WebSocket receives `{ "type": "error", "message": "..." }`
- **THEN** the UI shows an error banner with the message
